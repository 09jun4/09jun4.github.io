// 완주 테스트: 메인 메뉴에서 시작해 실제 클릭·키보드·마우스 입력만으로 미션 1 → 2 → 3을 끝까지 플레이한다.
// 조종은 간단한 자동 조종(화면에 보이는 적기 쪽으로 선회하고, 커서를 올려 사격)이 맡는다. 디버그 훅은 상태를 읽는 데만 쓴다.
// 사용: node tests/playthrough.cjs [반복 횟수]
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
const DEG = Math.PI / 180;
// 실력 단계: 조준 오차(px), 반응 간격(ms), 사격 시작 거리(m). SKILL=low|mid|high (기본 high)
const SKILLS = { high: { jitter: 0, tick: 70, range: 1150 }, mid: { jitter: 14, tick: 150, range: 800 }, low: { jitter: 26, tick: 240, range: 600 } };
const SKILL = SKILLS[process.env.SKILL || 'high'];

async function fly(page, label, maxSeconds = 240) {
  const keys = { KeyA: false, KeyD: false, KeyW: false, KeyS: false };
  const set = async (code, on) => { if (keys[code] !== on) { keys[code] = on; if (on) await page.keyboard.down(code); else await page.keyboard.up(code); } };
  let mouseDown = false;
  const trigger = async (on) => { if (mouseDown !== on) { mouseDown = on; if (on) await page.mouse.down(); else await page.mouse.up(); } };
  const peak = { calls: 0, tris: 0, particles: 0 };
  let cooling = false;
  let shotTaken = false;
  const t0 = Date.now();
  let last = null;
  let nextLog = 15;
  while ((Date.now() - t0) / 1000 < maxSeconds) {
    const s = await page.evaluate(() => ({ st: window.__debug.state(), f: window.__debug.flight(), en: window.__debug.enemies() }));
    last = s;
    if (s.st.state !== 'playing') break;
    if (process.env.VERBOSE && s.st.stats.time > nextLog) { nextLog += 15; console.log(`  ${label} t=${s.st.stats.time.toFixed(0)} hp=${s.st.hp} kills=${s.st.stats.kills} shots=${s.st.stats.gunShots} hits=${s.st.stats.gunHits} taken=${s.st.stats.hitsTaken} ` + s.en.map((e) => `${e.state[0]}${Math.round(e.dist)}/${Math.round(e.bearing / DEG)}`).join(' ')); }
    peak.calls = Math.max(peak.calls, s.st.info.calls); peak.tris = Math.max(peak.tris, s.st.info.tris); peak.particles = Math.max(peak.particles, s.st.particles);
    const target = s.en.slice().sort((a, b) => a.dist - b.dist)[0];
    if (!target || s.st.phase !== 'active') { await set('KeyA', false); await set('KeyD', false); await set('KeyW', false); await set('KeyS', false); await trigger(false); await sleep(120); continue; }
    // 선회: 적기 방위 쪽으로
    await set('KeyD', target.bearing > 5 * DEG);
    await set('KeyA', target.bearing < -5 * DEG);
    // 피치: 적기의 고도각과 내 피치를 맞춘다(너무 낮으면 올라간다)
    const want = s.f.y < 1500 ? 0.2 : target.elevation;
    await set('KeyS', want - s.f.pitch > 4 * DEG);
    await set('KeyW', want - s.f.pitch < -4 * DEG);
    // 사격
    const w = s.st.weapon;
    const onScreen = target.front && target.sx > 10 && target.sx < 1270 && target.sy > 10 && target.sy < 710;
    if (w.id === 'gun') {
      if (w.overheated || w.heat > 0.92) cooling = true; else if (w.heat < 0.35) cooling = false;
      if (onScreen) await page.mouse.move(target.sx + (Math.random() - 0.5) * 2 * SKILL.jitter, target.sy + (Math.random() - 0.5) * 2 * SKILL.jitter);
      await trigger(onScreen && target.dist < SKILL.range && !cooling);
      // 기관포가 식는 동안 미사일로 전환
      if (cooling && w.overheated) { await trigger(false); await page.keyboard.press('KeyF'); }
      if (!shotTaken && mouseDown && target.dist < 500) { await shot(page, `play-${label}`); shotTaken = true; }
    } else {
      if (w.ready) { await trigger(true); await sleep(50); await trigger(false); }
      if (w.ammo === 0 || (w.lockState === 'search' && Math.abs(target.bearing) < 6 * DEG && target.dist < 500)) await page.keyboard.press('KeyF');
    }
    await sleep(SKILL.tick);
  }
  for (const k of Object.keys(keys)) await set(k, false);
  await trigger(false);
  return { peak, seconds: (Date.now() - t0) / 1000, last };
}

(async () => {
  const runs = Number(process.argv[2] || 1);
  const { server, origin } = await startServer();
  const browser = await launch();
  const summary = [];
  for (let run = 0; run < runs; run++) {
    const { page, errors, context } = await openGame(browser, origin);
    await sleep(800);
    await page.click('[data-act="start"]'); await sleep(800);
    const results = [];
    for (const id of ['m1', 'm2', 'm3']) {
      let attempt = 0;
      for (;;) {
        attempt++;
        if (attempt === 1 && id === 'm1') { await page.click(`.mission-row[data-id="${id}"]`); await sleep(200); await page.click('[data-act="brief"]'); await sleep(800); }
        await page.click('[data-act="launch"]'); await sleep(900);
        const r = await fly(page, `${id}-run${run}`);
        if (r.last.st.state === 'playing') { results.push({ id, attempt, title: '시간 초과(테스트 중단)', score: '-', grade: '-', stats: [`${r.last.st.stats.kills}`, `${r.last.st.stats.gunHits}/${r.last.st.stats.gunShots}`, `${r.last.st.stats.hitsTaken}`, `${r.last.st.stats.time.toFixed(0)}s`, ''], hpLeft: r.last.st.hp, peak: r.peak }); attempt = 99; break; }
        await page.waitForFunction(() => window.__debug.state().state === 'result', null, { timeout: 20000 });
        await sleep(1700);
        const text = await page.$eval('.result-panel', (e) => ({ title: e.querySelector('.result-title').textContent, score: e.querySelector('[data-score]').textContent, grade: e.querySelector('[data-grade]').textContent, stats: [...e.querySelectorAll('.stats dd')].map((d) => d.textContent.trim()) }));
        results.push({ id, attempt, ...text, hpLeft: r.last.st.hp, peak: r.peak });
        if (attempt === 1 && run === 0) await shot(page, `play-result-${id}`);
        if (text.title === '임무 완수') {
          if (id !== 'm3') { await page.click('[data-act="next"]'); await sleep(900); }
          break;
        }
        if (attempt >= 4) break;
        // 실패: 재시작은 브리핑 없이 바로 다시 출격하므로, 브리핑 화면으로 돌아가 다시 시작한다
        await page.click('.result [data-act="menu"]'); await sleep(900);
        await page.click('[data-act="start"]'); await sleep(800);
        await page.click(`.mission-row[data-id="${id}"]`); await sleep(200);
        await page.click('[data-act="brief"]'); await sleep(800);
      }
      if (results[results.length - 1].title !== '임무 완수') break;
    }
    summary.push({ run, results, errors });
    await context.close();
  }
  for (const s of summary) {
    for (const r of s.results) console.log(`run${s.run} ${r.id} #${r.attempt} ${r.title} ${r.grade} ${r.score}점 | 격추 ${r.stats[0]} 명중 ${r.stats[1]} 피격 ${r.stats[2]} 시간 ${r.stats[3]} 무장 ${r.stats[4]} | 남은 체력 ${r.hpLeft} | 최대 드로우콜 ${r.peak.calls} 삼각형 ${r.peak.tris} 파티클 ${r.peak.particles}`);
    console.log(`run${s.run} errors: ${JSON.stringify(s.errors)}`);
  }
  await browser.close(); server.close();
})();

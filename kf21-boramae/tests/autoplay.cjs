// 자동플레이 검증: node tests/autoplay.cjs <실력 목록> [미션]   예) node tests/autoplay.cjs 12,95 m1
// 주소 ?auto=1&skill=N 로 열기만 하고(키·마우스 조작 없음) 메뉴에서 시작해 미션을 끝낼 때까지 지켜본다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const skills = (process.argv[2] || '12,95').split(',').map(Number);
  const mission = process.argv[3] || 'm1';
  const { server, origin } = await startServer();
  const browser = await launch();
  const out = [];
  for (const skill of skills) {
    const { page, errors, context } = await openGame(browser, origin, { width: 640, height: 360, query: `?debug=1&auto=1&skill=${skill}&mission=${mission}&loop=0&takeoff=${process.env.TAKEOFF || 'skip'}` });
    const t0 = Date.now();
    let first = null, shotTaken = false;
    for (let i = 0; i < 600; i++) {
      await sleep(1000);
      const s = await page.evaluate(() => { const st = window.__debug.state(); return { state: st.state, phase: st.phase, hp: st.hp, kills: st.stats.kills, hits: st.stats.hitsTaken, shots: st.stats.gunShots, gunHits: st.stats.gunHits, msl: st.stats.missilesFired, t: +st.stats.time.toFixed(1), mode: window.__debug.autopilot().status.mode }; });
      if (!shotTaken && s.t > 6) { await shot(page, `autoplay-${skill}`); shotTaken = true; }
      first = s;
      if (s.state === 'result') break;
    }
    const result = await page.evaluate(() => { const t = document.querySelector('.result-panel'); return t ? { title: t.querySelector('.result-title').textContent, score: t.querySelector('[data-score]').textContent, grade: t.querySelector('[data-grade]').textContent } : null; });
    out.push({ skill, wall: Math.round((Date.now() - t0) / 1000), final: first, result, panel: await page.$eval('.autopanel', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => null), errors });
    await context.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); server.close();
})();

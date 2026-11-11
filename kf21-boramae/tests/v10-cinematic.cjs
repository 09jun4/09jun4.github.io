// 메인 메뉴 시네마틱 캡처: node tests/v10-cinematic.cjs <preset>
// 장면 4개를 각각 중간 시점에 찍고, 한 바퀴 돌고 되풀이되는지, 메뉴 버튼이 가려지지 않는지 확인한다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'high';
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { settings: { quality: preset } });
  const d = (fn, a) => page.evaluate(fn, a);
  const out = { shots: [] };
  await sleep(1000);
  await d(() => window.__debug.timeScale(0));
  const durations = await d(() => window.__debug.session().cine.on ? [7, 5, 6.5, 8] : null);
  if (!durations) { await shot(page, `cine-${preset}-orbit`); out.cinematic = false; } else {
    for (let i = 0; i < 4; i++) {
      for (const k of i === 0 ? [0.25, 0.9] : [0.6]) {
        await d(([idx, kk, dur]) => { const s = window.__debug.session(); s._cineStart(idx); for (let n = 0; n < Math.round(dur * kk * 60); n++) s.step(1 / 60); }, [i, k, durations[i]]);
        await sleep(1800);
        await shot(page, `cine-${preset}-${i + 1}${k === 0.25 ? 'a' : ''}`);
        out.shots.push(await d(() => { const s = window.__debug.session(); const v = s.player.visual; return { shot: s.cine.shot, canopy: +v.canopy.toFixed(2), ammo: v.ammo, gear: +v.gear.toFixed(2), boost: +v.boost.toFixed(2) }; }));
      }
    }
    // 되풀이: 마지막 장면 끝에서 첫 장면으로 돌아간다
    out.loops = await d(() => { const s = window.__debug.session(); s._cineStart(3); for (let n = 0; n < 9 * 60; n++) s.step(1 / 60); return s.cine.shot; });
  }
  out.startButton = await page.$eval('[data-act="start"]', (b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b; });
  out.errors = errors;
  console.log(JSON.stringify(out));
  await browser.close(); server.close();
})();

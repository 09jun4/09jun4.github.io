// 적기 모델 확인용 캡처(가까이 2장 + 실제 전투 거리 1장).
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 1000, height: 640 });
  const d = (fn, a) => page.evaluate(fn, a);
  await d(() => { const g = window.__debug; g.go('select'); g.go('briefing'); g.go('playing'); g.timeScale(0); });
  await sleep(300);
  for (const [name, v] of Object.entries({ quarter: { yaw: 140, pitch: 20, dist: 44 }, top: { yaw: 0, pitch: 89.9, dist: 52 }, side: { yaw: 90, pitch: 3, dist: 46 }, far: { yaw: 150, pitch: 12, dist: 420, fov: 58 } })) {
    await d((f) => window.__debug.inspectEnemy(f), v);
    await sleep(300);
    await shot(page, 'enemy-' + name);
  }
  console.log(JSON.stringify({ errors }));
  await browser.close(); server.close();
})();

// 적기 모델 캡처·삼각형 수: node tests/v9-enemy.cjs <preset>
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'high';
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 1000, height: 640, settings: { quality: preset } });
  const d = (fn, a) => page.evaluate(fn, a);
  await d(() => { window.__debug.startMission('m1'); window.__debug.timeScale(0); });
  await sleep(500);
  for (const [name, v] of Object.entries({ quarter: { yaw: 140, pitch: 20, dist: 40 }, rear: { yaw: 25, pitch: 14, dist: 34 }, far: { yaw: 150, pitch: 12, dist: 420, fov: 58 } })) {
    await d((f) => window.__debug.inspectEnemy(f), v);
    await sleep(1500);
    await shot(page, 'enemy-' + preset + '-' + name);
  }
  const tris = await d(() => window.__debug.session().enemies.list[0].visual.triangles);
  console.log(JSON.stringify({ preset, enemyTriangles: tris, errors }));
  await browser.close(); server.close();
})();

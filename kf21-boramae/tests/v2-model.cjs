// 기체 모델 캡처: node tests/v2-model.cjs <preset> [시점들] [도색]
// 여러 방향에서 찍어 실루엣·디테일을 눈으로 확인한다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
const VIEWS = {
  front: { yaw: 180, pitch: 4, dist: 46 }, side: { yaw: 90, pitch: 2, dist: 46 }, top: { yaw: 0, pitch: 89.9, dist: 50 },
  rear: { yaw: 0, pitch: 8, dist: 46 }, quarter: { yaw: 140, pitch: 22, dist: 40 }, rearquarter: { yaw: 35, pitch: 24, dist: 40 },
  bottom: { yaw: 0, pitch: -89.9, dist: 50 }, close: { yaw: 120, pitch: 14, dist: 16, fov: 40 }, nozzle: { yaw: 22, pitch: 12, dist: 7, fov: 40, at: [0, 0, 7.4] }, gear: { yaw: 150, pitch: -6, dist: 13, fov: 40, at: [0, -1, -1] }, cockpit: { yaw: 150, pitch: 20, dist: 6, fov: 40, at: [0, 0.9, -3.4] },
  low45: { yaw: 135, pitch: -18, dist: 34 },
};
(async () => {
  const preset = process.argv[2] || 'high';
  const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
  const paint = process.argv[4] || 'grey';
  const state = process.argv[5] ? JSON.parse(process.argv[5]) : null;
  const { server, origin } = await startServer();
  const browser = await launch();
  const t0 = Date.now();
  const { page, errors } = await openGame(browser, origin, { width: 1000, height: 640, settings: { quality: preset, paint } });
  const loadMs = Date.now() - t0;
  await page.evaluate(() => { window.__debug.timeScale(0); window.__debug.background(0x9fc6e8); });
  if (state) await page.evaluate((s) => { Object.assign(window.__debug.session().player.visual, s); window.__debug.session().showcaseHold = true; }, state);
  for (const [name, v] of Object.entries(VIEWS)) {
    if (only && !only.includes(name)) continue;
    await page.evaluate((f) => window.__debug.inspect(f), v);
    await sleep(900);
    await shot(page, `hi-${preset}-${name}`);
  }
  const info = await page.evaluate(() => ({ tris: window.__debug.visuals().triangles, buildMs: Math.round(window.__debug.visuals().buildMs), st: window.__debug.state().info }));
  console.log(JSON.stringify({ preset, loadMs, info, errors }));
  await browser.close(); server.close();
})();

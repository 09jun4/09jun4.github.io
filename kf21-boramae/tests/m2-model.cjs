// 마일스톤 2 검증(모델): KF-21을 4방향 + 3/4 시점에서 캡처한다. 눈으로 실루엣을 확인하기 위한 스크립트.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
const VIEWS = {
  front: { yaw: 180, pitch: 4, dist: 46 },
  side: { yaw: 90, pitch: 2, dist: 46 },
  top: { yaw: 0, pitch: 89.9, dist: 50 },
  rear: { yaw: 0, pitch: 8, dist: 46 },
  quarter: { yaw: 140, pitch: 22, dist: 42 },
  rearquarter: { yaw: 35, pitch: 24, dist: 42 },
  bottom: { yaw: 0, pitch: -89.9, dist: 50 },
};
(async () => {
  const only = process.argv[2];
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 1000, height: 640 });
  await page.evaluate(() => { window.__debug.timeScale(0); window.__debug.background(0x9fc6e8); });
  for (const [name, v] of Object.entries(VIEWS)) {
    if (only && !only.split(',').includes(name)) continue;
    await page.evaluate((f) => window.__debug.inspect(f), v);
    await sleep(350);
    await shot(page, 'kf21-' + name);
  }
  console.log(JSON.stringify({ state: await page.evaluate(() => window.__debug.state()), errors }, null, 1));
  await browser.close(); server.close();
})();

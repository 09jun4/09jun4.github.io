// 작품 썸네일(1200×900 jpg)을 실제 화면에서 캡처한다: node tests/thumb.cjs
const path = require('node:path');
const { startServer, launch, openGame, sleep, REPO_ROOT } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page } = await openGame(browser, origin, { width: 1200, height: 900 });
  await sleep(1500);
  await page.evaluate(() => { const s = window.__debug.session(); s.rig.orbitAngle = 2.42; });
  await sleep(500);
  const file = path.join(REPO_ROOT, 'assets/thumbs/kf21-boramae.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  console.log(file);
  await browser.close(); server.close();
})();

// 작품 썸네일(1200×900 jpg)을 실제 화면에서 캡처한다: node tests/thumb.cjs  (기본은 최고(ultra) 프리셋의 메뉴 시네마틱 장면, 인자로 low|high|ultra 선택)
const path = require('node:path');
const { startServer, launch, openGame, sleep, REPO_ROOT } = require('./lib/harness.cjs');
(async () => {
  const quality = process.argv[2] || 'ultra';
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page } = await openGame(browser, origin, { width: 1200, height: 900, settings: { quality } });
  await sleep(1500);
  await page.evaluate(() => { window.__debug.timeScale(0); const s = window.__debug.session(); s._cineStart(3); for (let n = 0; n < 4.2 * 60; n++) s.step(1 / 60); });
  await sleep(4000);
  const file = path.join(REPO_ROOT, 'assets/thumbs/kf21-boramae.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: 400000 }); // 최고 프리셋은 소프트웨어 렌더링에서 한 프레임이 오래 걸려요
  console.log(file);
  await browser.close(); server.close();
})();

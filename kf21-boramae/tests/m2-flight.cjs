// 마일스톤 2 검증(비행·카메라): 실제 키 입력으로 선회·시점 전환을 해 보고 캡처한다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin);
  const d = (fn, a) => page.evaluate(fn, a);
  await d(() => { const g = window.__debug; g.go('select'); g.go('briefing'); g.go('playing'); });
  await sleep(600);
  await shot(page, 'm2-chase-level');
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyS');
  await sleep(1800);
  const turning = await d(() => window.__debug.flight());
  await shot(page, 'm2-chase-turn');
  await page.keyboard.press('KeyV');
  await sleep(500);
  await shot(page, 'm2-cockpit-turn');
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyS');
  await sleep(3500);
  const released = await d(() => window.__debug.flight());
  await shot(page, 'm2-cockpit-level');
  await page.keyboard.press('KeyV');
  const st = await d(() => window.__debug.state());
  console.log(JSON.stringify({ turning, released, st, errors }, null, 1));
  await browser.close(); server.close();
})();

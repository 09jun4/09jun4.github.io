// 마일스톤 3 검증: 하늘·구름·지형이 보이고, 원점 재배치가 눈에 띄지 않으며, 속도감이 난다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin);
  const d = (fn, a) => page.evaluate(fn, a);
  await sleep(800);
  await shot(page, 'm3-menu');
  await d(() => { const g = window.__debug; g.go('select'); g.go('briefing'); g.go('playing'); });
  await sleep(700);
  await shot(page, 'm3-chase-a');
  await sleep(400);
  await shot(page, 'm3-chase-b');
  await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
  await shot(page, 'm3-dive');
  await page.keyboard.press('KeyV'); await page.keyboard.down('KeyA'); await sleep(1500);
  await shot(page, 'm3-cockpit');
  await page.keyboard.up('KeyA'); await page.keyboard.press('KeyV');
  // 원점 재배치: 경계 직전으로 옮긴 뒤 넘어가는 순간 앞뒤를 캡처한다(화면이 이어져야 한다)
  await d(() => { window.__debug.teleport(0, 3000, -2960, 0); window.__debug.timeScale(0.25); });
  await sleep(300);
  const before = await d(() => ({ f: window.__debug.flight(), o: window.__debug.origin() }));
  await shot(page, 'm3-rebase-before');
  await d(() => window.__debug.timeScale(1)); await sleep(900); await d(() => window.__debug.timeScale(0));
  const after = await d(() => ({ f: window.__debug.flight(), o: window.__debug.origin() }));
  await shot(page, 'm3-rebase-after');
  // 아주 먼 곳(원점에서 50만 km)에서도 구름·지형이 정상인지
  await d(() => window.__debug.setOrigin(5e8, -3e8)); await sleep(300);
  await shot(page, 'm3-far-origin');
  const st = await d(() => window.__debug.state());
  console.log(JSON.stringify({ before, after, st, errors }, null, 1));
  await browser.close(); server.close();
})();

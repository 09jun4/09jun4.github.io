// 시간대 4종·바다 렌더 확인: node tests/e3-env.cjs [preset=low]
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'low';
  const { server, origin } = await startServer(); const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 960, height: 540, settings: { quality: preset } });
  await page.evaluate(() => { window.__debug.startMission('c1m1'); window.__debug.invincible(true); window.__debug.session().input.setLockWanted(false); });
  await sleep(1200);
  for (const [tod, terrain] of [['day', 'inland'], ['dawn', 'inland'], ['dusk', 'coast'], ['night', 'coast']]) {
    await page.evaluate(([a, b]) => window.__debug.env(a, b), [tod, terrain]);
    await sleep(1500);
    await shot(page, `e3-${preset}-${tod}`);
  }
  console.log(errors.length ? errors : '콘솔 오류 0건');
  await browser.close(); server.close();
})();

// 조종석 캡처: node tests/v3-cockpit.cjs <preset>
// 1280×720과 1920×1080에서 정면·선회 중·둘러보기(C키)를 찍는다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'high';
  const sizes = process.argv[3] === 'both' ? [[1280, 720], [1920, 1080]] : [[1280, 720]];
  const { server, origin } = await startServer();
  const browser = await launch();
  const out = {};
  for (const [w, h] of sizes) {
    const { page, errors, context } = await openGame(browser, origin, { width: w, height: h, settings: { quality: preset, view: 'cockpit' } });
    const d = (fn, a) => page.evaluate(fn, a);
    await d(() => { window.__debug.startMission('m1'); window.__debug.invincible(true); window.__debug.passiveEnemies(true); });
    await sleep(1500);
    await d(() => { const s = window.__debug.session(); s.enemies.clear(); window.__debug.spawnEnemy(2, { distance: 420, spread: 90 }); });
    await page.mouse.move(w * 0.55, h * 0.45);
    await sleep(2500);
    await shot(page, `cockpit-${preset}-${h}-level`);
    await page.keyboard.down('KeyD'); await page.keyboard.down('KeyS');
    await sleep(2500);
    await shot(page, `cockpit-${preset}-${h}-turn`);
    await page.keyboard.up('KeyD'); await page.keyboard.up('KeyS');
    if (h === 720) {
      await page.keyboard.down('KeyC');
      await page.mouse.move(w * 0.08, h * 0.62); await sleep(2500);
      await shot(page, `cockpit-${preset}-${h}-look-left`);
      await page.mouse.move(w * 0.5, h * 0.98); await sleep(2500);
      await shot(page, `cockpit-${preset}-${h}-look-down`);
      await page.mouse.move(w * 0.99, h * 0.5); await sleep(2500);
      await shot(page, `cockpit-${preset}-${h}-look-right`);
      await page.keyboard.up('KeyC');
      await sleep(6000); // 소프트웨어 렌더링은 초당 몇 프레임뿐이라 넉넉히 기다린다
      out.lookReturned = await d(() => Math.abs(window.__debug.session().rig.look.curYaw) < 0.05);
    }
    out[h] = { errors, info: (await d(() => window.__debug.state())).info };
    await context.close();
  }
  console.log(JSON.stringify(out));
  await browser.close(); server.close();
})();

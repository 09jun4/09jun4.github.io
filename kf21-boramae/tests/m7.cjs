// 마일스톤 7 검증: HUD를 두 해상도(1280×720, 1920×1080)에서 캡처해 요소가 겹치지 않는지 눈으로 확인한다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const out = {};
  for (const [w, h] of [[1280, 720], [1920, 1080]]) {
    const { page, errors, context } = await openGame(browser, origin, { width: w, height: h });
    const d = (fn, a) => page.evaluate(fn, a);
    await d(() => { const g = window.__debug; g.go('select'); g.go('briefing'); g.go('playing', { mission: null }); g.invincible(true); });
    await d(() => { const s = window.__debug.session(); s.startMission(s.mission.id === 'm1' ? s.mission : s.mission); });
    await sleep(300);
    await d(() => { window.__debug.spawnEnemy(2, { distance: 380, spread: 120 }); });
    await page.mouse.move(w * 0.56, h * 0.42);
    await page.keyboard.down('KeyD'); await sleep(900);
    await page.mouse.down(); await sleep(1200);
    await shot(page, `m7-gun-${h}`);
    await page.mouse.up(); await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyF');
    await d(() => { window.__debug.passiveEnemies(true); const s = window.__debug.session(); s.enemies.clear(); window.__debug.spawnEnemy(1, { distance: 450, spread: 0 }); s.player.hp = 25; s.feedback.hit = 1; s.feedback.hitWarn = 1; });
    await sleep(1300);
    await shot(page, `m7-missile-track-${h}`);
    await sleep(1400);
    await shot(page, `m7-missile-lock-${h}`);
    await page.keyboard.press('KeyV'); await sleep(400);
    await shot(page, `m7-cockpit-${h}`);
    out[h] = errors;
    await context.close();
  }
  console.log(JSON.stringify(out));
  await browser.close(); server.close();
})();

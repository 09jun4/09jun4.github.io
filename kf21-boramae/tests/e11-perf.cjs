// 가장 무거운 미션(c5m1: 지상 목표 7 + SAM + 대공포)의 프리셋별 드로우콜·삼각형. node tests/e11-perf.cjs [low,high,ultra]
const { startServer, launch, openGame, sleep } = require('./lib/harness.cjs');
const BUDGET = { low: [100000, 80], high: [600000, 250], ultra: [1200000, 400] };
(async () => {
  const { server, origin } = await startServer(); const browser = await launch();
  let bad = 0;
  for (const preset of (process.argv[2] || 'low,high,ultra').split(',')) {
    const { page, context, errors } = await openGame(browser, origin, { width: 1280, height: 720, settings: { quality: preset } });
    page.setDefaultTimeout(180000);
    await page.evaluate(() => { window.__debug.startMission('c5m1'); window.__debug.invincible(true); window.__debug.session().input.setLockWanted(false); });
    await sleep(1500);
    await page.evaluate(() => { const s = window.__debug.session(), f = s.player.flight; f.pos.set(0, 700, -5200); s.player.prevPos.copy(f.pos); window.__debug.spawnEnemy(3, { distance: 400 }); window.__debug.setTrigger(true); });
    await sleep(1500);
    const m = await page.evaluate(() => window.__debug.measure(4));
    const ok = m.triangles <= BUDGET[preset][0] && m.drawCalls <= BUDGET[preset][1] && !errors.length;
    if (!ok) bad++;
    console.log(preset, JSON.stringify({ drawCalls: m.drawCalls, triangles: m.triangles, fpsAvg: m.fpsAvg, budget: BUDGET[preset], ok, errors: errors.length }));
    await context.close();
  }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// 락온 시간 밸런스 평가(수치는 바꾸지 않고 비교만): 같은 봇이 락온 0.5초와 2.0초로 미션을 돌린다.
//   node tests/p9-balance.cjs [mission=m3] [skills=40,70,95]
const { startServer, launch, openGame, sleep } = require('./lib/harness.cjs');
(async () => {
  const mission = process.argv[2] || 'm3';
  const skills = (process.argv[3] || '40,70,95').split(',').map(Number);
  const { server, origin } = await startServer();
  const browser = await launch();
  const rows = [];
  for (const lock of [0.5, 2.0]) {
    for (const skill of skills) {
      const { page, context, errors } = await openGame(browser, origin, { width: 960, height: 540, query: `?debug=1&auto=1&skill=${skill}&mission=${mission}&loop=0&takeoff=skip` });
      page.setDefaultTimeout(600000);
      await page.evaluate(async (t) => { const m = await import('/kf21-boramae/src/data/weapons.js'); m.WEAPONS.missile.lock.time = t; window.__debug.timeScale(3); }, lock);
      await page.waitForFunction(() => window.__debug.state().state === 'result', null, { timeout: 600000, polling: 500 });
      const r = await page.evaluate(() => { const s = window.__debug.session(); const x = s.result(); return { success: x.success, time: +x.time.toFixed(1), kills: x.kills, total: x.total, missiles: x.missilesFired, gunShots: x.gunShots, gunHits: x.gunHits, hitsTaken: x.hitsTaken, hp: Math.round(s.player.hp), grade: x.grade }; });
      rows.push({ lock, skill, ...r, errors: errors.length });
      console.log(JSON.stringify(rows[rows.length - 1]));
      await context.close();
    }
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });

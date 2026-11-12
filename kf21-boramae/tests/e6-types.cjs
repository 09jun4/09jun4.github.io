// 목표 유형별 렌더·동작 확인(유형마다 미션 하나): node tests/e6-types.cjs [미션ID,...]
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const ids = (process.argv[2] || 'c1m1,c2m1,c3m1,c3m4,c1m4,c5m3').split(',');
  const { server, origin } = await startServer(); const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 960, height: 540, settings: { quality: 'low' } });
  page.setDefaultTimeout(120000);
  const d = (fn, a) => page.evaluate(fn, a);
  const out = {};
  for (const id of ids) {
    await d((m) => { window.__debug.startMission(m); window.__debug.invincible(true); window.__debug.session().input.setLockWanted(false); }, id);
    await sleep(2500);
    const r = await d(async () => {
      const s = window.__debug.session(), f = s.player.flight; const wait = (ms) => new Promise((x) => setTimeout(x, ms));
      const o = { tod: s.world.timeOfDay, alive: s.enemies.aliveCount, roles: s.enemies.list.filter((e) => e.alive).map((e) => e.role + (e.pers && e.pers.evadeOnLock ? '*' : '')), ground: s.ground.count, obj: s.engine.summary().map((x) => `${x.type}:${x.progress}/${x.count}`), left: s.engine.timeLeft() };
      if (s.mission.checkpoints.length) { // 링을 차례로 통과
        for (const c of s.mission.checkpoints) { f.pos.set(c[0] - s.world.origin.x, c[1], c[2] - s.world.origin.z + 60); s.player.prevPos.copy(f.pos); await wait(250); }
        o.cp = s.engine.summary()[0].progress; o.outcome = s.engine.outcome;
      }
      if (s.boss) { o.bossHp = s.boss.hp; s.boss.hp = s.boss.maxHp * 0.5; await wait(400); o.phase = s.boss.phase; }
      const cruiser = s.enemies.list.find((e) => e.alive && e.roleDef && e.roleDef.cruise);
      if (cruiser) { cruiser.pos.copy(cruiser.goal); cruiser.pos.x += 100; await wait(500); o.afterEscape = [s.engine.outcome, s.engine.reason, s.phase]; }
      return o;
    });
    out[id] = r;
    await shot(page, `e6-${id}`);
    await d(() => { const s = window.__debug.session(); if (s.phase === 'active') window.__debug.skipMission(true); });
    await page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 60000 });
    out[id].result = await d(() => document.querySelector('.result-title').textContent);
  }
  console.log(JSON.stringify(out, null, 0));
  console.log(errors.length ? errors.slice(0, 5) : '콘솔 오류 0건');
  await browser.close(); server.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

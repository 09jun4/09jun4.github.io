// 폭격 플레이 테스트: 단순한 봇(가까운 목표로 선회, 고도 유지, 발사 버튼을 누른 채)으로 폭격 미션을 끝까지 돈다.
//   node tests/e13-bombing.cjs [미션들=c2m1,c2m2,c2m3,c3m2,c4m2,c4m3,c5m1]
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const ids = (process.argv[2] || 'c2m1,c2m2,c2m3,c3m2,c4m2,c4m3,c5m1').split(',');
  const { server, origin } = await startServer(); const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 960, height: 540, settings: { quality: 'low', bombTutorialDone: false } });
  page.setDefaultTimeout(400000);
  const d = (fn, a) => page.evaluate(fn, a);
  const rows = [];
  for (const id of ids) {
    await d((m) => { window.__debug.startMission(m); const s = window.__debug.session(); s.input.setLockWanted(false); window.__debug.timeScale(3); }, id);
    const r = await d(async (alt) => {
      const s = window.__debug.session(); const wait = (ms) => new Promise((x) => setTimeout(x, ms));
      const tut = [], log = []; let away = false, lastLog = 0;
      const t0 = performance.now();
      while (s.phase !== 'ending' && s.phase !== 'done' && performance.now() - t0 < 240000) {
        if (s.tutorial.active && tut[tut.length - 1] !== s.tutorial.step.id) tut.push(s.tutorial.step.id);
        const f = s.player.flight, g = s.ground;
        // 활성 목표의 종류에 맞는 가장 가까운 목표
        const want = new Set(s.engine.objectives.filter((o) => o.active && o.type === 'destroy').map((o) => o.def.targetType));
        let best = null, bd = 1e12;
        for (let i = 0; i < g.count; i++) { const t = g.targets[i]; if (!t.alive || (want.size && !want.has(t.type))) continue; const dd = Math.hypot(t.base.x - f.pos.x, t.base.z - f.pos.z); if (dd < bd) { bd = dd; best = t; } }
        let turn = 0;
        if (best) {
          const bearing = Math.atan2(-(best.base.x - f.pos.x), -(best.base.z - f.pos.z));
          let e = bearing - f.yaw; while (e > Math.PI) e -= Math.PI * 2; while (e < -Math.PI) e += Math.PI * 2;
          // 너무 가까워 못 도는 거리(선회반경 안)면 일단 지나쳤다가 돌아온다
          if (bd > 1400) away = false; else if (bd < 450 && Math.abs(e) > 0.6) away = true; // 지나쳤으면 1.4km까지 벌린 뒤 다시 들어온다
          turn = away ? 0 : Math.max(-1, Math.min(1, -e * 2.5));
          if (performance.now() - lastLog > 8000) { lastLog = performance.now(); log.push([Math.round(bd), +e.toFixed(2), Math.round(f.pos.y - 42), s.weapons.current.id, s.weapons.current.ccip ? s.weapons.current.ccip.onTarget : null, +s.stats.time.toFixed(0)].join('/')); }
        }
        const agl = f.pos.y - 42;
        const pitch = Math.max(-1, Math.min(1, (alt - agl) / 150 - f.pitch * 2.2));
        s.inputOverride = { pitch: -(-pitch), turn };
        s.triggerOverride = !!best;
        await wait(50);
      }
      s.inputOverride = null; s.triggerOverride = null;
      const x = s.result();
      return { success: x.success, reason: x.failReason, time: +x.time.toFixed(0), score: x.score, grade: x.grade, bombs: s.stats.bombsDropped, groundKills: s.stats.groundKills, gameTime: +s.stats.time.toFixed(0), hitsTaken: x.hitsTaken, hp: Math.round(s.player.hp), tut };
    }, 380);
    rows.push({ id, ...r });
    console.log(JSON.stringify(rows[rows.length - 1]));
    if (id === ids[0]) await shot(page, 'e13-bombing');
    await d(() => { const s = window.__debug.session(); if (s.phase === 'active') window.__debug.skipMission(false); });
    await page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 120000 });
  }
  console.log(errors.length ? errors.slice(0, 4) : '콘솔 오류 0건');
  await browser.close(); server.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });

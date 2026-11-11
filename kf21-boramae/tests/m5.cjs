// 마일스톤 5 검증: 미션을 시작하면 편대가 등장해 접근·공격하고, 가만히 있으면 피격돼 결국 패배한다. 충돌 피해도 확인.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin);
  const d = (fn, a) => page.evaluate(fn, a);
  await d(() => { const g = window.__debug; g.go('select'); g.go('briefing'); g.go('playing'); });
  await sleep(500);
  const start = await d(() => ({ s: window.__debug.state(), e: window.__debug.enemies() }));
  const log = [];
  let shotDone = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const s = await d(() => ({ s: window.__debug.state(), e: window.__debug.enemies() }));
    log.push(`${s.s.stats.time.toFixed(0)}s hp${s.s.hp} hits${s.s.stats.hitsTaken} ` + s.e.map((e) => `${e.state[0]}${Math.round(e.dist)}`).join(' '));
    if (!shotDone && s.e.some((e) => e.front && e.dist < 600 && e.sx > 100 && e.sx < 1180 && e.sy > 80 && e.sy < 640)) { await shot(page, 'm5-engaged'); shotDone = true; }
    if (s.s.state === 'result') break;
  }
  const end = await d(() => ({ s: window.__debug.state(), r: window.__debug.result() }));
  // 충돌 시험: 새 미션에서 바로 앞에 마주 오는 적기를 만든다
  await d(() => { const g = window.__debug; g.go('playing'); });
  await sleep(300);
  await d(() => { window.__debug.freezeEnemies(true); window.__debug.spawnEnemy(1, { distance: 120, spread: 0 }); });
  await d(() => { const s = window.__debug.session(); const e = s.enemies.list.find((x) => x.alive && x.index >= 3) || s.enemies.list.filter((x) => x.alive).pop(); e.pos.copy(s.player.flight.pos).addScaledVector(s.player.flight.forward, 110); e.prevPos.copy(e.pos); });
  const before = await d(() => window.__debug.state());
  await sleep(1500);
  const after = await d(() => window.__debug.state());
  console.log(JSON.stringify({ spawned: start.e.map((e) => Math.round(e.dist)), log, endState: end.s.state, result: end.r,
    collision: { hpBefore: before.hp, hpAfter: after.hp, killsBefore: before.stats.kills, killsAfter: after.stats.kills }, errors }, null, 1));
  await browser.close(); server.close();
})();

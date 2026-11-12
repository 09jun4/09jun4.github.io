// 지상전 확인: 폭탄으로 레이더 파괴, 기관포 규칙, 대공포·SAM 동작, 승리. node tests/e4-ground.cjs
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer(); const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 960, height: 540, settings: { quality: 'low' } });
  page.setDefaultTimeout(120000);
  const d = (fn, a) => page.evaluate(fn, a);
  await d(() => { window.__debug.startMission('c2m1'); window.__debug.invincible(true); window.__debug.session().input.setLockWanted(false); });
  await sleep(1000);
  const out = await d(async () => {
    const s = window.__debug.session(), g = s.ground, f = s.player.flight, r = {};
    const wait = (ms) => new Promise((x) => setTimeout(x, ms));
    r.targets = g.count; r.weapons = s.weapons.weapons.map((w) => `${w.id}:${w.ammo ?? '-'}`);
    s.switchWeapon(); s.switchWeapon(); r.current = s.weapons.current.id;
    // 기관포 규칙: hard는 0, soft는 ×0.25
    const radar = g.targets.find((t) => t.type === 'radar'), aa = g.targets.find((t) => t.type === 'aa_gun');
    g.damage(radar, 100, 'gun', s.ctx); g.damage(aa, 40, 'gun', s.ctx); g.damage(aa, 500, 'missile', s.ctx);
    r.afterGun = [radar.hp, aa.hp];
    // 레이더 위로 옮겨 수평 비행하며 CCIP가 목표에 닿을 때 투하
    for (const t of g.targets.filter((x) => x.type === 'radar')) {
      f.pos.set(t.base.x, 600, t.base.z + 2600); f.yaw = 0; f.pitch = 0; s.player.prevPos.copy(f.pos);
      for (let i = 0; i < 400 && t.alive; i++) {
        await wait(60);
        const c = s.weapons.current.ccip;
        if (c.valid && Math.hypot(c.pos.x - t.base.x, c.pos.z - t.base.z) < 22) { s.triggerOverride = true; await wait(120); s.triggerOverride = false; await wait(400); }
      }
    }
    await wait(1500);
    r.radarAlive = g.targets.filter((x) => x.type === 'radar' && x.alive).length;
    r.bombsLeft = s.weapons.byId('bomb').ammo; r.outcome = s.engine.outcome; r.phase = s.phase; r.score = s.engine.score();
    return r;
  });
  await shot(page, 'e4-ground');
  // SAM: 발사대를 하나 놓고 미사일이 날아오는지, 경고가 뜨는지
  const sam = await d(async () => {
    const s = window.__debug.session(); const wait = (ms) => new Promise((x) => setTimeout(x, ms));
    window.__debug.startMission('c2m1'); await wait(600);
    s.input.setLockWanted(false);
    const g = s.ground, f = s.player.flight;
    const t = g.targets.find((x) => x.type === 'aa_gun');
    t.type = 'sam'; t.def = (await import('/kf21-boramae/src/data/targets.js')).TARGETS.sam; t.fireTimer = 0.2; g._layout();
    f.pos.set(t.base.x, 900, t.base.z + 2500); s.player.prevPos.copy(f.pos);
    let seen = 0, threat = null, minD = 1e9;
    for (let i = 0; i < 80; i++) { await wait(100); const m = g.sams.find((x) => x.active); if (m) { seen++; minD = Math.min(minD, m.pos.distanceTo(f.pos)); if (s.threat.state.kind === 'missile') threat = 'missile'; } }
    return { seen, threat, minD: Math.round(minD), hits: s.stats.hitsTaken };
  });
  await shot(page, 'e4-sam');
  console.log(JSON.stringify({ out, sam, errors }));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });

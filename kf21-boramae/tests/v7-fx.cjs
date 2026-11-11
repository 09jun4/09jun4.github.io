// 효과 캡처: node tests/v7-fx.cjs <preset>
// 기관포 사격(탄피·연기), 미사일 발사(파일런 분리·연기 꼬리), 격추 폭발(불덩이·충격파 링·잔해), 손상 연기·화재, 급선회 애프터버너.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'high';
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { settings: { quality: preset } });
  const d = (fn, a) => page.evaluate(fn, a);
  const out = {};
  await d(() => { window.__debug.startMission('m1'); window.__debug.invincible(true); window.__debug.passiveEnemies(true); });
  await sleep(1500);
  await d(() => { const s = window.__debug.session(); s.enemies.clear(); s.spawner.index = 99; window.__debug.spawnEnemy(2, { distance: 260, spread: 70 }); });
  await sleep(600);
  // 기관포
  await page.mouse.move(900, 200);
  await d(() => window.__debug.setTrigger(true)); await sleep(1500);
  await shot(page, `fx-${preset}-gun`);
  await d(() => window.__debug.setTrigger(null));
  // 미사일: 락온 기다렸다가 발사
  await page.keyboard.press('KeyF');
  for (let i = 0; i < 40; i++) { const s = await d(() => window.__debug.state()); if (s.weapon.lockState === 'locked') break; await sleep(400); }
  await page.mouse.down(); await sleep(80); await page.mouse.up();
  await sleep(700);
  await shot(page, `fx-${preset}-missile`);
  out.ammo = (await d(() => window.__debug.state())).weapon.ammo;
  out.pylonMissilesVisible = await d(() => { const m = window.__debug.visuals().current.model; return m.hi ? m.exterior.children.filter((c) => c.isMesh && c.geometry === m.exterior.children.find((x) => x.position.y < -1.1 && x.isMesh)?.geometry).filter((c) => c.visible).length : null; });
  // 격추 폭발: 남은 적기를 바로 앞에서 터뜨린다
  await d(() => { const s = window.__debug.session(); s.enemies.clear(); window.__debug.spawnEnemy(1, { distance: 170, spread: 0 }); });
  await sleep(400);
  await d(() => { const s = window.__debug.session(); const e = s.enemies.list.find((x) => x.alive); s.ctx.onEnemyHit(e, 'gun'); e.hp = 1; });
  await page.keyboard.press('KeyF');
  await d(() => { const s = window.__debug.session(); const e = s.enemies.list.find((x) => x.alive); e.hp = 0; s.fx.explosion(e.pos, e.velocity, 1); e.despawn(); s.ctx.onEnemyKilled(e, 'gun'); });
  await sleep(350);
  await shot(page, `fx-${preset}-explosion`);
  await sleep(900);
  await shot(page, `fx-${preset}-wreck`);
  // 손상 + 급선회(애프터버너)
  await d(() => { const s = window.__debug.session(); s.player.hp = 18; });
  await page.keyboard.down('KeyA'); await sleep(2500);
  await shot(page, `fx-${preset}-damage-turn`);
  await page.keyboard.up('KeyA');
  out.boost = await d(() => +window.__debug.session().player.visual.boost.toFixed(2));
  out.info = (await d(() => window.__debug.state())).info;
  out.errors = errors;
  console.log(JSON.stringify(out));
  await browser.close(); server.close();
})();

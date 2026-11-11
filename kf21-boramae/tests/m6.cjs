// 마일스톤 6 검증: F키 전환 → 락온(탐색→추적→완료) → 좌클릭 발사 → 추적 명중, 탄약 5발, 기관포 모드에서는 락온 없음.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin);
  const d = (fn, a) => page.evaluate(fn, a);
  const st = () => d(() => window.__debug.state());
  await d(() => { const g = window.__debug; g.go('select'); g.go('briefing'); g.go('playing'); g.invincible(true); g.passiveEnemies(true); });
  await sleep(300);
  // 편대는 치우고, 앞쪽에 같은 방향으로 나는 표적을 만든다(AI는 켠 채로 두면 흩어지므로 잠시 정지 후 속도만 맞춘다)
  await d(() => { const s = window.__debug.session(); s.enemies.clear(); s.spawner.index = 99; window.__debug.spawnEnemy(2, { distance: 500, spread: 60 }); });
  await page.mouse.move(640, 360);
  await sleep(1500);
  const gunMode = await st(); // 기관포 모드: 락온이 없어야 한다
  await page.keyboard.press('KeyF');
  await sleep(120);
  const seq = [];
  let fired = false; let killsBefore = 0;
  for (let i = 0; i < 60; i++) {
    const s = await st();
    seq.push(s.weapon.lockState[0] + s.weapon.lockProgress.toFixed(1));
    if (s.weapon.lockState === 'tracking' && !seq.shotT) { await shot(page, 'm6-tracking'); seq.shotT = 1; }
    if (s.weapon.lockState === 'locked' && !fired) {
      await shot(page, 'm6-locked');
      killsBefore = s.stats.kills;
      await page.mouse.down(); await sleep(60); await page.mouse.up();
      fired = true;
      await sleep(250); await shot(page, 'm6-missile');
      break;
    }
    await sleep(100);
  }
  const afterFire = await st();
  await sleep(2500);
  const afterHit = await st();
  const hp = await d(() => window.__debug.enemies().map((e) => e.hp));
  // 남은 4발을 모두 쏜다(누르고 있어도 연달아 나가지 않는지 포함)
  await page.mouse.down(); await sleep(1200);
  const held = await st();
  await page.mouse.up();
  for (let i = 0; i < 40; i++) {
    const s = await st();
    if (s.weapon.ammo === 0) break;
    if (i % 8 === 0) await d(() => { const q = window.__debug.session(); q.enemies.clear(); window.__debug.spawnEnemy(1, { distance: 600, spread: 0 }); });
    if (s.weapon.lockState === 'locked') { await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(900); } else await sleep(400);
  }
  const empty = await st();
  await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(200);
  const stillEmpty = await st();
  // 재시작하면 5발로 초기화
  await d(() => window.__debug.skipMission(true)); await sleep(600);
  await d(() => window.__debug.go('playing')); await sleep(300);
  await page.keyboard.press('KeyF'); await sleep(100);
  const restarted = await st();
  console.log(JSON.stringify({
    gunModeLock: gunMode.weapon.id + ':' + (gunMode.weapon.lockState || 'none'), lockSequence: seq.join(' '),
    ammoAfterFire: afterFire.weapon.ammo, missilesFired: afterFire.stats.missilesFired, enemyHpAfterHit: hp, killsAfterHit: afterHit.stats.kills,
    heldMouseExtraShots: held.stats.missilesFired - afterFire.stats.missilesFired <= 1, ammoEnd: empty.weapon.ammo, firedTotal: stillEmpty.stats.missilesFired,
    ammoAfterRestart: restarted.weapon.ammo, weaponAfterRestartF: restarted.weapon.id, errors,
  }, null, 1));
  await browser.close(); server.close();
})();

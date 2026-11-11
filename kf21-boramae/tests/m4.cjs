// 마일스톤 4 검증: 실제 마우스 조준·클릭으로 기관포를 쏴서 적기를 격추하고, 과열 동작을 확인한다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin);
  const d = (fn, a) => page.evaluate(fn, a);
  await d(() => { const g = window.__debug; g.go('select'); g.go('briefing'); g.go('playing'); });
  await sleep(400);
  await d(() => window.__debug.spawnEnemy(2, { distance: 240, spread: 60 }));
  await sleep(400);
  await shot(page, 'm4-enemies');
  // 적기 확대 캡처(모델·외곽선 확인)
  // 1) 조준해서 사격 → 격추
  let en = await d(() => window.__debug.enemies());
  const target = en[0];
  await page.mouse.move(target.sx, target.sy);
  await page.mouse.down();
  await sleep(350);
  await shot(page, 'm4-firing');
  let killedAt = null;
  for (let i = 0; i < 40; i++) {
    await sleep(100);
    en = await d(() => window.__debug.enemies());
    const t = en.find((e) => e.id === target.id);
    if (t) await page.mouse.move(t.sx, t.sy); else { killedAt = i; break; }
    if (i === 3) await shot(page, 'm4-hit');
  }
  await shot(page, 'm4-explosion');
  await page.mouse.up();
  const afterKill = await d(() => window.__debug.state());
  // 2) 빈 하늘에 계속 쏴서 과열 → 2.5초 잠금 → 냉각
  await sleep(4200); // 완전히 식힌다
  await page.mouse.move(200, 150);
  const t0 = Date.now();
  await page.mouse.down();
  let overheatAt = null; let shotsAtOverheat = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(50);
    const s = await d(() => window.__debug.state());
    if (s.weapon.overheated) { overheatAt = (Date.now() - t0) / 1000; shotsAtOverheat = s.stats.gunShots; break; }
  }
  const sA = await d(() => window.__debug.state());
  await sleep(1500);
  const sB = await d(() => window.__debug.state()); // 잠금 중: 버튼을 누르고 있어도 발사 수가 늘지 않아야 한다
  await shot(page, 'm4-overheat');
  await page.mouse.up();
  await sleep(1300);
  const sC = await d(() => window.__debug.state()); // 잠금 해제 + 식는 중
  console.log(JSON.stringify({
    killedAfterTicks: killedAt, kills: afterKill.stats.kills, gunHits: afterKill.stats.gunHits, gunShots: afterKill.stats.gunShots,
    overheatAfterSeconds: overheatAt, shotsFiredBeforeOverheat: shotsAtOverheat - afterKill.stats.gunShots,
    lockedNoShots: sB.stats.gunShots === sA.stats.gunShots, stillLockedAt1_5s: sB.weapon.overheated, unlockedAfter: !sC.weapon.overheated, heatAfter: sC.weapon.heat,
    info: sC.info, errors,
  }, null, 1));
  await browser.close(); server.close();
})();

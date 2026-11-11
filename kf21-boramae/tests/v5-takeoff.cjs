// 이륙 연출 검증: node tests/v5-takeoff.cjs <preset>
// 활주 → (키 입력 또는 자동 보정) → 상승·기어 접힘 → 고도 200m에서 미션 시작. 건너뛰기, 타이머 기준, 재시작 확인.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'low';
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { settings: { quality: preset, skipTakeoff: false } });
  const d = (fn, a) => page.evaluate(fn, a);
  const snap = () => d(() => { const s = window.__debug.session(); const f = s.player.flight; return { phase: s.phase, st: s.takeoff.state, t: +s.takeoff.time.toFixed(1), speed: Math.round(f.speed), y: Math.round(f.pos.y), gear: +s.player.visual.gear.toFixed(2), time: +s.stats.time.toFixed(1), alive: s.enemies.aliveCount, hp: s.player.hp }; });
  const log = {};
  // 1) 키를 누르지 않는 경우: 자동 보정으로 이륙
  await d(() => window.__debug.startMission('m1'));
  await sleep(1200);
  log.start = await snap();
  await shot(page, `takeoff-${preset}-roll`);
  const trace = [];
  let took = null;
  for (let i = 0; i < 60; i++) {
    const s = await snap();
    if (i % 4 === 0) trace.push(`${s.t}s ${s.st} v${s.speed} y${s.y} g${s.gear}`);
    if (s.st === 'climb' && s.gear < 0.9 && s.gear > 0.2 && !log.shotClimb) { await shot(page, `takeoff-${preset}-climb`); log.shotClimb = true; }
    if (s.phase === 'active') { took = s; break; }
    await sleep(400);
  }
  log.trace = trace;
  log.finished = took;
  log.duration = await d(() => window.__debug.session().takeoff.time);
  log.assisted = await d(() => window.__debug.session().takeoff.assisted);
  await sleep(1500);
  log.afterStart = await snap();
  // 2) 재시작 후 W키를 누르고 있으면: 기수 들 속도가 되자마자 바로 뜬다(자동 보정이 개입하지 않음)
  await d(() => window.__debug.startMission('m2'));
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 80; i++) { const s = await snap(); if (s.st === 'climb' || s.phase === 'active') break; await sleep(150); }
  await page.keyboard.up('KeyW');
  log.manual = await d(() => ({ assisted: window.__debug.session().takeoff.assisted, wait: +window.__debug.session().takeoff.wait.toFixed(2) }));
  // 3) Enter로 건너뛰기: 공중·기어 접힘·타이머 0에서 시작
  await d(() => window.__debug.startMission('m3'));
  await sleep(600);
  const before = await snap();
  await page.keyboard.press('Enter');
  await sleep(300);
  log.skip = { before: before.phase, after: await snap() };
  // 4) Space로도 건너뛰기 + 곧바로 재시작해도 오류 없음
  await d(() => window.__debug.startMission('m1')); await sleep(300);
  await page.keyboard.press('Space'); await sleep(200);
  await d(() => window.__debug.startMission('m1')); await sleep(200);
  await page.keyboard.press('Space'); await sleep(300);
  log.skipSpace = (await snap()).phase;
  log.errors = errors;
  console.log(JSON.stringify(log, null, 1));
  await browser.close(); server.close();
})();

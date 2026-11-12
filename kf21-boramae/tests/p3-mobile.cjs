// 모바일 검증(Playwright 기기 에뮬레이션 + CDP 멀티터치): node tests/p3-mobile.cjs [가로 세로]
// 실제 기기 테스트는 불가하므로, 터치 이벤트 경로(pointer events)·레이아웃·자이로 매핑 논리를 확인한다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const W = Number(process.argv[2] || 844), H = Number(process.argv[3] || 390);
  const { server, origin } = await startServer();
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
  await context.addInitScript(() => { try { localStorage.setItem('kf21.settings', JSON.stringify({ v: 3, autoQuality: false, benchmarked: true, quality: 'low', skipTakeoff: true, tutorialDone: true })); } catch (e) { /* */ } });
  const { page, errors } = await openGame(browser, origin, { context, width: W, height: H });
  const cdp = await context.newCDPSession(page);
  const pts = new Map();
  // CDP 규칙: touchStart/touchMove는 지금 눌린 모든 점을 보내고, 빠진 점은 뗀 것으로 처리된다. touchEnd는 점이 없을 때(모두 뗄 때)만 쓴다.
  const touch = async (type, id, x, y) => {
    if (type === 'endAll') pts.clear();
    else if (type === 'start' || type === 'move') pts.set(id, { x, y, id });
    else pts.delete(id);
    const list = [...pts.values()].map((p) => ({ x: p.x, y: p.y, id: p.id }));
    if ((type === 'end' || type === 'endAll') && list.length === 0) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await cdp.send('Input.dispatchTouchEvent', { type: type === 'start' ? 'touchStart' : 'touchMove', touchPoints: list });
  };
  const d = (fn, a) => page.evaluate(fn, a);
  const out = { viewport: `${W}x${H}` };
  out.touchMode = await d(() => window.__debug.session().input.touchMode);
  await d(() => { window.__debug.startMission('m1'); window.__debug.invincible(true); window.__debug.passiveEnemies(true); });
  await sleep(1500);
  out.ui = await d(() => ({ touchUi: !document.querySelector('.touch-ui').hidden, buttons: [...document.querySelectorAll('.t-buttons button')].map((b) => { const r = b.getBoundingClientRect(); return `${b.textContent}:${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`; }), hudScale: window.__debug.session() && 0 }));
  const stick = await d(() => { const r = document.querySelector('.t-ring').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 }; });
  out.stick = stick;
  await shot(page, `p3-${W}x${H}-idle`);
  // 조이스틱: 오른쪽·위로 → 우선회·기수 올림
  await touch('start', 1, stick.cx, stick.cy);
  await touch('move', 1, stick.cx + stick.r, stick.cy - stick.r * 0.6);
  await sleep(300);
  out.stickFull = await d(() => ({ ...window.__debug.session().input.stick }));
  await touch('move', 1, stick.cx + stick.r * 0.05, stick.cy);
  await sleep(200);
  out.stickDead = await d(() => ({ ...window.__debug.session().input.stick }));
  await touch('move', 1, stick.cx + stick.r * 0.5, stick.cy);
  await sleep(200);
  out.stickHalf = await d(() => window.__debug.session().input.stick.x);
  // 멀티터치: 조이스틱을 잡은 채 오른쪽 영역을 눌러 조준·연사(기관포)
  const ax = W * 0.7, ay = H * 0.3;
  const shots0 = await d(() => window.__debug.state().stats.gunShots);
  await touch('start', 2, ax, ay);
  await sleep(700);
  out.multi = await d(([x, y]) => { const s = window.__debug.session(); return { stick: s.input.stick.x, aimActive: s.input.touchAim.active, cursor: [Math.round(s.cursor.x), Math.round(s.cursor.y)], want: [x, y], shots: window.__debug.state().stats.gunShots }; }, [ax, ay]);
  out.multi.fired = out.multi.shots - shots0;
  await touch('move', 2, ax - 100, ay + 60);
  await sleep(300);
  out.drag = await d(() => [Math.round(window.__debug.session().cursor.x), Math.round(window.__debug.session().cursor.y)]);
  await shot(page, `p3-${W}x${H}-firing`);
  await touch('endAll');
  await sleep(200);
  out.afterRelease = await d(() => ({ active: window.__debug.session().input.touchAim.active, cursor: [Math.round(window.__debug.session().cursor.x), Math.round(window.__debug.session().cursor.y)], stickStill: window.__debug.session().input.stick.x }));
  // 버튼: 무장 전환
  const tap = async (sel) => { const r = await d((q) => { const b = document.querySelector(q).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel); await touch('start', 9, r[0], r[1]); await touch('end', 9, 0, 0); await sleep(250); };
  await tap('[data-btn="weapon"]');
  out.weaponAfterTap = (await d(() => window.__debug.state())).weapon.id;
  // 미사일: 표적 위를 누르고 락온을 기다린 뒤 떼면 발사 / 락온 전에 떼면 발사 없음
  await d(() => { const s = window.__debug.session(); s.enemies.clear(); s.spawner.index = 99; window.__debug.spawnEnemy(1, { distance: 700, spread: 0 }); });
  await sleep(300);
  const e = (await d(() => window.__debug.enemies()))[0];
  await touch('start', 3, e.sx, e.sy);
  await sleep(120);
  await touch('end', 3, 0, 0); // 락온 전에 뗀다
  await sleep(400);
  out.earlyRelease = { ammo: (await d(() => window.__debug.state())).weapon.ammo };
  await touch('start', 3, e.sx, e.sy);
  await sleep(500);
  out.lockDebug = await d(([x, y]) => { const s = window.__debug.session(); const m = s.weapons.byId('missile'); const en = s.enemies.list.find((q) => q.alive); return { cursor: [Math.round(s.cursor.x), Math.round(s.cursor.y)], touch: [x, y], active: s.input.touchAim.active, state: m.lock.state, ang: en ? Math.round(m._angleOf(en, s.ctx) * 57.3) : null, cur: s.weapons.current.id, dist: en ? Math.round(en.pos.distanceTo(s.player.flight.pos)) : null }; }, [e.sx, e.sy]);
  let locked = false;
  for (let i = 0; i < 40; i++) {
    const w = (await d(() => window.__debug.state())).weapon;
    if (w.lockState === 'locked') { locked = true; break; }
    const en = (await d(() => window.__debug.enemies()))[0];
    if (en) await touch('move', 3, en.sx, en.sy); // 사람처럼 표적을 손가락으로 따라간다
    await sleep(100);
  }
  await touch('endAll');
  out.trace = [];
  for (let i = 0; i < 8; i++) { out.trace.push(await d(() => { const s = window.__debug.session(); const m = s.weapons.byId('missile'); return `${m.lock.state[0]}${m.lock.progress.toFixed(1)} rel=${s.input.touchAim.released ? 1 : 0} act=${s.input.touchAim.active ? 1 : 0} ammo=${m.ammo} tick=${window.__debug.state().tick}`; })); await sleep(60); }
  await sleep(300);
  out.lockedThenRelease = { locked, ammo: (await d(() => window.__debug.state())).weapon.ammo };
  // 시점·일시정지 버튼
  await tap('[data-btn="view"]');
  out.view = (await d(() => window.__debug.state())).view;
  await shot(page, `p3-${W}x${H}-cockpit`);
  await tap('[data-btn="view"]');
  await tap('[data-btn="pause"]');
  out.paused = (await d(() => window.__debug.state())).state;
  await shot(page, `p3-${W}x${H}-pause`);
  await d(() => window.__debug.go('playing'));
  await sleep(300);
  // 자이로: 켜면 기울기가 입력에 더해진다
  await d(() => { window.__debug.settings().set('gyro', true); });
  await d(() => { window.__kf21Touch._gyro(10, 0); });
  await d(() => { window.__kf21Touch._gyro(10 + 15, 0 + 15); });
  await sleep(600);
  out.gyro = await d(() => ({ ...window.__debug.session().input.gyro }));
  await d(() => window.__kf21Touch.recalibrate());
  await d(() => window.__kf21Touch._gyro(40, 40)); await sleep(300);
  out.gyroAfterRecal = await d(() => ({ ...window.__debug.session().input.gyro }));
  // 세로로 돌리면 안내 + 일시정지
  await page.setViewportSize({ width: H, height: W });
  await sleep(500);
  out.portrait = await d(() => ({ hint: !document.querySelector('.rotate-hint').hidden, state: window.__debug.state().state }));
  await shot(page, `p3-${W}x${H}-portrait`);
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); server.close();
})();

// 1·2단계 검증(PC): 실제 마우스 이벤트로 가상 조준점·우클릭 조향·WASD 우선·락온 0.5초·포인터락 폴백을 확인한다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 1280, height: 720 });
  const d = (fn, a) => page.evaluate(fn, a);
  const out = {};
  await d(() => { window.__debug.startMission('m1'); window.__debug.invincible(true); window.__debug.passiveEnemies(true); });
  await sleep(1200);
  out.lock = await d(() => ({ locked: window.__debug.session().input.locked, wanted: window.__debug.session().input.lockWanted }));
  // 가상 조준점이 마우스를 따라간다
  await page.mouse.move(900, 200); await sleep(300);
  out.cursor = await d(() => ({ ...window.__debug.session().cursor }));
  // 우클릭 조향: 포인터락에서 이동량(movementX/Y)은 브라우저가 주는 값이라, 같은 이벤트를 직접 만들어 보낸다(Playwright의 가짜 마우스는 잠금 중 이동량이 일정하지 않다)
  const move = (dx, dy) => d(([x, y]) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y, clientX: 0, clientY: 0 })), [dx, dy]);
  await page.mouse.down({ button: 'right' });
  out.rightDown = await d(() => window.__debug.session().input.mouse.right);
  const cx0 = (await d(() => window.__debug.session().cursor)).x;
  for (let i = 0; i < 12; i++) { await move(40, -8); await sleep(33); } // 약 1200px/s
  const during = await d(() => ({ ...window.__debug.session().player.input, dx: window.__debug.session().cursor.x - 0 }));
  const cx1 = during.dx;
  await page.mouse.up({ button: 'right' });
  await sleep(900);
  const after = await d(() => ({ ...window.__debug.session().player.input }));
  out.steer = { cursorMoved: Math.round(cx1 - cx0), during, after };
  // 느리게 움직이면 조향도 약하다(이동량 비례)
  await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 12; i++) { await move(10, 0); await sleep(33); }
  out.slow = (await d(() => ({ ...window.__debug.session().player.input }))).turn;
  await page.mouse.up({ button: 'right' }); await sleep(600);
  // WASD 우선: A를 누른 채 우클릭으로 오른쪽
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('KeyA');
  for (let i = 0; i < 10; i++) { await move(40, 0); await sleep(33); }
  out.wasd = await d(() => ({ ...window.__debug.session().player.input }));
  await page.keyboard.up('KeyA');
  for (let i = 0; i < 6; i++) { await move(40, 0); await sleep(33); }
  out.afterWasdReleased = (await d(() => ({ ...window.__debug.session().player.input }))).turn;
  await page.mouse.up({ button: 'right' });
  // 우클릭 컨텍스트 메뉴 차단
  out.contextMenuBlocked = await d(() => { const e = new MouseEvent('contextmenu', { cancelable: true, bubbles: true }); document.getElementById('stage').dispatchEvent(e); return e.defaultPrevented; });
  // 락온 0.5초: 앞에 적 1대
  await d(() => { const s = window.__debug.session(); s.enemies.clear(); s.spawner.index = 99; window.__debug.spawnEnemy(1, { distance: 700, spread: 0 }); });
  await page.keyboard.press('KeyF'); await sleep(200);
  const e = (await d(() => window.__debug.enemies()))[0];
  await d(([x, y]) => { const i = window.__debug.session().input; i.mouse.x = x; i.mouse.y = y; }, [e.sx, e.sy]); // 가상 조준점을 표적 위로(잠금 중에는 이동량으로 움직이므로 값을 직접 넣는다)
  const seq = [];
  const t0 = Date.now(); let lockedAt = null;
  for (let i = 0; i < 30; i++) { const s = await d(() => window.__debug.state().weapon); seq.push(s.lockState[0] + (s.lockProgress || 0).toFixed(2)); if (s.lockState === 'locked' && !lockedAt) lockedAt = Date.now() - t0; await sleep(100); }
  out.lockedAfterMs = lockedAt;
  out.lockSeq = seq.join(' ');
  await shot(page, 'p1-lock');
  // ESC(포인터락 해제 대신 keydown) → 일시정지
  await page.keyboard.press('Escape'); await sleep(400);
  out.paused = (await d(() => window.__debug.state())).state;
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); server.close();
})();

// 모바일 조작(가로 전용): 왼쪽 가상 조이스틱, 오른쪽 터치 조준·발사, 버튼 3개(무장·시점·일시정지), 자이로, 세로 안내.
// 모든 터치는 pointerId로 따로 추적한다(조이스틱과 조준이 동시에 움직여도 서로 간섭하지 않는다).
// 입력은 Input의 stick / gyro / touchAim 으로만 내보내고, 비행 모델은 건드리지 않는다.
import { el } from './dom.js';
import { INPUT } from '../data/input.js';
import { clamp, damp } from '../core/math.js';

export function createTouchControls({ parent, input, settings, actions }) {
  const root = el(`
    <div class="touch-ui" hidden>
      <div class="t-aim" data-zone="aim"></div>
      <div class="t-stick" data-zone="stick"><i class="t-ring"></i><i class="t-knob"></i></div>
      <div class="t-buttons">
        <button type="button" data-btn="weapon" aria-label="무장 전환">무장</button>
        <button type="button" data-btn="view" aria-label="시점 전환">시점</button>
        <button type="button" data-btn="pause" aria-label="일시정지">정지</button>
      </div>
      <button type="button" class="t-skip" data-btn="skip" hidden>건너뛰기</button>
    </div>`);
  const rotate = el('<div class="rotate-hint" hidden role="alert"><div><b>기기를 가로로 돌려주세요</b><span>이 게임은 가로 화면에서만 플레이할 수 있어요.</span></div></div>');
  parent.appendChild(root);
  parent.appendChild(rotate);
  const stickEl = root.querySelector('.t-stick');
  const knob = root.querySelector('.t-knob');
  const ring = root.querySelector('.t-ring');
  const zoneAim = root.querySelector('.t-aim');
  const skipBtn = root.querySelector('.t-skip');
  const C = INPUT.stick;

  // ── 조이스틱 ──────────────────────────────────────────────────────────
  const st = { id: -1, cx: 0, cy: 0, r: 60 };
  function layout() {
    const h = window.innerHeight, w = window.innerWidth;
    st.r = Math.max(C.minRadius, h * C.radiusRatio);
    st.cx = Math.max(C.left * w, 16 + st.r * 1.1);
    st.cy = h - Math.max(C.bottom * h, 16 + st.r * 1.1);
    const size = st.r * 3;
    stickEl.style.cssText = `left:${st.cx - size / 2}px;top:${st.cy - size / 2}px;width:${size}px;height:${size}px`;
    ring.style.cssText = `width:${st.r * 2}px;height:${st.r * 2}px`;
    knob.style.width = knob.style.height = `${st.r * 0.9}px`;
    moveKnob(0, 0);
  }
  function moveKnob(vx, vy) { knob.style.transform = `translate(${vx * st.r}px, ${vy * st.r}px)`; }
  function setStick(clientX, clientY) {
    let vx = (clientX - st.cx) / st.r, vy = (clientY - st.cy) / st.r;
    const mag = Math.hypot(vx, vy);
    if (mag > 1) { vx /= mag; vy /= mag; }
    moveKnob(vx, vy);
    const m = Math.min(1, mag);
    const k = settings.get('stickSens');
    if (m < C.deadzone) { input.stick.x = 0; input.stick.y = 0; return; }
    const shaped = Math.pow((m - C.deadzone) / (1 - C.deadzone), C.curve) * k; // 데드존 8%, 약한 비선형(지수 1.3)
    input.stick.x = clamp((vx / m) * shaped, -1, 1);
    input.stick.y = clamp((-vy / m) * shaped, -1, 1); // 위로 밀면 기수 올림
  }
  stickEl.addEventListener('pointerdown', (e) => {
    if (st.id !== -1) return;
    st.id = e.pointerId;
    stickEl.setPointerCapture(e.pointerId);
    setStick(e.clientX, e.clientY);
    e.preventDefault();
    firstTouch();
  });
  stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === st.id) setStick(e.clientX, e.clientY); });
  const stickEnd = (e) => {
    if (e.pointerId !== st.id) return;
    st.id = -1;
    input.stick.x = input.stick.y = 0;
    moveKnob(0, 0);
  };
  stickEl.addEventListener('lostpointercapture', stickEnd);
  stickEl.addEventListener('pointerup', stickEnd);
  stickEl.addEventListener('pointercancel', stickEnd);

  // ── 조준 영역(오른쪽 터치): 기관포는 누르는 동안 연사, 미사일은 락온 후 떼면 발사 ───────
  const aim = { id: -1 };
  zoneAim.addEventListener('pointerdown', (e) => {
    if (aim.id !== -1) return;
    aim.id = e.pointerId;
    zoneAim.setPointerCapture(e.pointerId);
    const t = input.touchAim;
    t.active = true; t.released = false; t.x = e.clientX; t.y = e.clientY;
    e.preventDefault();
    firstTouch();
    if (actions.takeoffTap) actions.takeoffTap(); // 이륙 연출 중 화면 탭 = 건너뛰기
  });
  zoneAim.addEventListener('pointermove', (e) => {
    if (e.pointerId !== aim.id) return;
    input.touchAim.x = e.clientX; input.touchAim.y = e.clientY;
  });
  const aimEnd = (e) => {
    if (e.pointerId !== aim.id) return;
    aim.id = -1;
    const t = input.touchAim;
    t.active = false;
    t.released = e.type === 'pointerup'; // 취소(시스템 제스처)는 발사로 치지 않는다
  };
  zoneAim.addEventListener('lostpointercapture', (e) => { if (e.pointerId === aim.id) { aim.id = -1; input.touchAim.active = false; } }); // 캡처를 잃으면(시스템 제스처 등) 끝난 것으로
  zoneAim.addEventListener('pointerup', aimEnd);
  zoneAim.addEventListener('pointercancel', aimEnd);

  // ── 버튼 3개(+ 이륙 건너뛰기) ───────────────────────────────────────────
  root.querySelector('.t-buttons').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-btn]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    firstTouch();
    actions[b.dataset.btn]();
  });
  skipBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); actions.skip(); });

  // ── 자이로 ────────────────────────────────────────────────────────────
  const gy = { on: false, base: null, raw: { x: 0, y: 0 }, sx: 0, sy: 0, listening: false };
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    // 가로 화면 기준: 화면 위·아래 가장자리를 기울이는 것(기수 올림·내림) = gamma, 좌·우 가장자리를 기울이는 것(선회) = beta
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 90;
    const flip = ang === 270 || ang === -90 ? -1 : 1;
    const tiltPitch = e.gamma * -flip, tiltTurn = e.beta * flip;
    if (!gy.base) gy.base = { x: tiltTurn, y: tiltPitch }; // 중립 자세(미션 시작·재보정 때)
    gy.raw.x = tiltTurn - gy.base.x;
    gy.raw.y = tiltPitch - gy.base.y;
  }
  function ensureGyro() {
    if (!settings.get('gyro') || gy.listening) return;
    const start = () => { window.addEventListener('deviceorientation', onOrientation); gy.listening = true; gy.base = null; };
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') { // iOS: 사용자 터치 안에서 권한을 물어야 한다
      D.requestPermission().then((r) => { if (r === 'granted') start(); }, () => {});
    } else if (D) start();
  }
  function stopGyro() {
    if (!gy.listening) return;
    window.removeEventListener('deviceorientation', onOrientation);
    gy.listening = false; input.gyro.x = input.gyro.y = 0;
  }
  let touched = false;
  function firstTouch() {
    if (!touched) { touched = true; try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 지원하지 않으면 안내 화면으로 대응 */ } }
    ensureGyro();
  }
  settings.onChange((k) => { if (k === 'gyro' || k === '*') { if (settings.get('gyro')) ensureGyro(); else stopGyro(); } });

  // ── 세로 안내 ─────────────────────────────────────────────────────────
  function isPortrait() { return window.innerHeight > window.innerWidth; }

  function refresh() {
    const on = input.touchMode;
    root.hidden = !on || !visibleNow;
    document.getElementById('app').classList.toggle('touch', on);
    if (on) layout();
    updateRotate();
  }
  function updateRotate() {
    const show = input.touchMode && isPortrait();
    rotate.hidden = !show;
    return show;
  }
  let visibleNow = false;

  window.addEventListener('resize', () => { layout(); if (updateRotate() && actions.portrait) actions.portrait(); });
  window.addEventListener('orientationchange', () => { setTimeout(() => { layout(); if (updateRotate() && actions.portrait) actions.portrait(); }, 120); });
  // 길게 누르기 메뉴·더블탭 확대·핀치·선택 막기
  for (const t of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(t, (e) => { if (input.touchMode) e.preventDefault(); });
  root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  layout();

  return {
    el: root,
    refresh,
    /** 미션 화면일 때만 보인다 */
    setVisible(v) { visibleNow = v; refresh(); },
    recalibrate() { gy.base = null; },
    /** 미션 시작 때 자이로 중립 자세를 다시 잡는다 */
    onMissionStart() { gy.base = null; input.stick.x = input.stick.y = 0; },
    /** 렌더 프레임마다: 자이로 값 평활, 건너뛰기 버튼 표시 */
    update(dt, { takeoff }) {
      skipBtn.hidden = !(input.touchMode && takeoff);
      input.gyroOn = !!(gy.listening && settings.get('gyro') && input.touchMode);
      if (gy.listening && settings.get('gyro')) {
        const max = INPUT.gyro.maxTiltDeg;
        const k = settings.get('gyroSens') * (settings.get('gyroInvert') ? -1 : 1);
        const tx = clamp(gy.raw.x / max, -1, 1) * settings.get('gyroSens');
        const ty = clamp(gy.raw.y / max, -1, 1) * k;
        gy.sx = damp(gy.sx, tx, INPUT.gyro.lowpassTau, dt);
        gy.sy = damp(gy.sy, ty, INPUT.gyro.lowpassTau, dt);
        input.gyro.x = clamp(Math.abs(gy.sx) < 0.04 ? 0 : gy.sx, -1, 1);
        input.gyro.y = clamp(Math.abs(gy.sy) < 0.04 ? 0 : gy.sy, -1, 1);
      } else { input.gyro.x = input.gyro.y = 0; }
    },
    get portrait() { return input.touchMode && isPortrait(); },
    /** 테스트용: 자이로 입력을 직접 넣는다 */
    _gyro(beta, gamma) { onOrientation({ beta, gamma }); gy.listening = true; },
  };
}

// 입력 계층: 키보드·마우스(포인터락·우클릭 조향)·터치(조이스틱·조준)·자이로를 같은 입력 축으로 모은다.
// 비행 모델은 flightAxes()가 돌려주는 (pitch, turn) 명령과 aim(가상 조준점)만 읽는다.
//   pitch: +1 = 기수 올림, turn: +1 = 우선회
// 키는 event.code로 읽어서 한글 입력 상태에서도 그대로 동작한다.
import { clamp, damp } from './math.js';
import { INPUT } from '../data/input.js';

export class Input {
  constructor() {
    this.keys = new Set();
    // mouse.x/y = 가상 조준점(px). 포인터락일 때는 이동량으로, 아닐 때는 커서 위치로 정한다.
    this.mouse = { x: 0, y: 0, down: false, right: false, moved: false };
    this.locked = false; // 포인터락 중
    this.lockWanted = false; // 미션 중이라 잠금을 쓰고 싶은 상태
    this.touchMode = false; // 모바일 입력 사용 중(포인터락·마우스 조향 끔)
    this.settings = null;
    this.steer = { x: 0, y: 0 }; // 우클릭 조향 입력(평활 후)
    this.stick = { x: 0, y: 0 }; // 가상 조이스틱(touch-controls가 채운다)
    this.gyro = { x: 0, y: 0 }; // 기울기(touch-controls가 채운다)
    this.touchAim = { active: false, x: 0, y: 0, fire: false };
    this._acc = { x: 0, y: 0 };
    this._last = { x: 0, y: 0, has: false };
    this.keyListeners = [];
    this.blurListeners = [];
    this.lockListeners = [];
    this.surface = null;
    this._attached = false;
  }

  /** @param {import('./settings.js').Settings} s */
  setSettings(s) {
    this.settings = s;
  }

  _get(key, fallback) {
    return this.settings ? this.settings.get(key) : fallback;
  }

  /** @param {HTMLElement} surface 사격 입력을 받는 영역(게임 화면) */
  attach(surface) {
    if (this._attached) return;
    this._attached = true;
    this.surface = surface;
    this.centerCursor();

    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target) && e.code !== 'Escape') return; // 입력칸에서도 ESC는 창 닫기로 동작
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const fn of this.keyListeners) fn(e.code, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    window.addEventListener('mousemove', (e) => {
      if (this.touchMode) return;
      let dx, dy;
      if (this.locked) {
        dx = e.movementX; dy = e.movementY;
        const k = this._get('mouseSensitivity', 1);
        this.mouse.x = clamp(this.mouse.x + dx * k, INPUT.margin, window.innerWidth - INPUT.margin);
        this.mouse.y = clamp(this.mouse.y + dy * k, INPUT.margin, window.innerHeight - INPUT.margin);
      } else {
        dx = this._last.has ? e.clientX - this._last.x : 0;
        dy = this._last.has ? e.clientY - this._last.y : 0;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      }
      this._last.x = e.clientX; this._last.y = e.clientY; this._last.has = true;
      this._acc.x += dx; this._acc.y += dy;
      this.mouse.moved = true;
    });
    surface.addEventListener('mousedown', (e) => {
      if (this.touchMode) return;
      // 잠금이 풀린 채 미션 중이면 클릭으로 다시 잠근다(ESC로 재개하면 사용자 제스처가 없어 잠글 수 없다)
      if (this.lockWanted && !this.locked) this.requestLock();
      if (e.button === 0) this.mouse.down = true;
      else if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      else if (e.button === 2) this.mouse.right = false;
    });
    surface.addEventListener('contextmenu', (e) => e.preventDefault()); // 우클릭 메뉴는 항상 막는다
    surface.addEventListener('dragstart', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      const now = document.pointerLockElement === surface;
      // 잠금 요청은 비동기라, 그 사이 메뉴·일시정지로 넘어갔으면 뒤늦게 걸린 잠금을 바로 푼다
      if (now && !this.lockWanted) { document.exitPointerLock(); return; }
      const was = this.locked;
      this.locked = now;
      if (now) { this._last.has = false; this._acc.x = this._acc.y = 0; }
      if (was !== now) for (const fn of this.lockListeners) fn(now);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });

    const lost = () => {
      this.reset();
      for (const fn of this.blurListeners) fn();
    };
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) lost();
    });
  }

  /** 가상 조준점을 화면 중앙으로 */
  centerCursor() {
    this.mouse.x = window.innerWidth / 2;
    this.mouse.y = window.innerHeight / 2;
  }

  /** 사용자 제스처 안에서 불러야 한다. 실패하면 일반 커서 조준으로 폴백한다. */
  requestLock() {
    if (this.touchMode || this.locked || !this.surface || !this.surface.requestPointerLock) return;
    try {
      const p = this.surface.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* 브라우저가 거부하면 일반 커서 조준 */ });
    } catch (e) { /* 같음 */ }
  }

  releaseLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  /** 미션 중에는 잠금을 쓴다(true), 메뉴·일시정지·결과에서는 쓰지 않는다(false). */
  setLockWanted(on) {
    this.lockWanted = on;
    if (on) this.requestLock(); else this.releaseLock();
  }

  /**
   * 렌더 프레임마다: 우클릭 조향 입력을 만든다(이동 속도 ÷ 1200, 시정수 0.08s로 평활, 멈추면 0.15s에 0으로).
   * @param {number} dt 실제 프레임 시간(초)
   */
  poll(dt) {
    if (!(dt > 0)) return;
    const on = this.mouse.right && !this.touchMode && this._get('steerEnabled', true);
    const sens = this._get('steerSens', 1);
    const inv = this._get('steerInvertY', false) ? -1 : 1;
    const tx = on ? clamp((this._acc.x / dt) / INPUT.steerSpeed, -1, 1) * sens : 0; // 오른쪽 = 우선회
    const ty = on ? clamp((-this._acc.y / dt) / INPUT.steerSpeed, -1, 1) * sens * inv : 0; // 위 = 상승
    this._acc.x = this._acc.y = 0;
    this.steer.x = damp(this.steer.x, tx, Math.abs(tx) > Math.abs(this.steer.x) ? INPUT.steerTau : INPUT.steerReleaseTau, dt);
    this.steer.y = damp(this.steer.y, ty, Math.abs(ty) > Math.abs(this.steer.y) ? INPUT.steerTau : INPUT.steerReleaseTau, dt);
    if (!on && Math.abs(this.steer.x) < 0.01 && Math.abs(this.steer.y) < 0.01) { this.steer.x = this.steer.y = 0; }
  }

  /**
   * 비행 명령. WASD가 하나라도 눌려 있으면 그것만(WASD 우선), 아니면 우클릭 조향 + 조이스틱 + 자이로를 더해 ±1로 자른다.
   * @param {{pitch:number, turn:number}} out
   */
  flightAxes(out) {
    const k = this.keys;
    if (k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD')) {
      out.pitch = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
      out.turn = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      return out;
    }
    out.pitch = clamp(this.steer.y + this.stick.y + this.gyro.y, -1, 1);
    out.turn = clamp(this.steer.x + this.stick.x + this.gyro.x, -1, 1);
    return out;
  }

  reset() {
    this.keys.clear();
    this.mouse.down = false;
    this.mouse.right = false;
    this.steer.x = this.steer.y = 0;
    this.stick.x = this.stick.y = 0;
    this.touchAim.fire = false;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** 두 키로 만드는 -1/0/+1 축 */
  axis(negCode, posCode) {
    return (this.keys.has(posCode) ? 1 : 0) - (this.keys.has(negCode) ? 1 : 0);
  }

  onKey(fn) { this.keyListeners.push(fn); }
  onBlur(fn) { this.blurListeners.push(fn); }
  onLockChange(fn) { this.lockListeners.push(fn); }
}

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyV', 'KeyC', 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTyping(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

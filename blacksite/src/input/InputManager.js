// 키보드·마우스 입력과 포인터 락. 게임 코드는 행동 이름(action)으로만 묻는다.
import { bus } from '../core/EventBus.js';

export class InputManager {
  constructor(target, bindings) {
    this.target = target;
    this.bindings = bindings;
    this.down = new Set();
    this.pressed = new Set(); // 이번 프레임에 눌린 코드
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.enabled = false; // 플레이 중에만 true
    this.locked = false;
    this.capture = null; // 키 재지정 대기: fn(code)

    addEventListener('keydown', (e) => this._key(e, true));
    addEventListener('keyup', (e) => this._key(e, false));
    addEventListener('mousedown', (e) => this._mouse(e, true));
    addEventListener('mouseup', (e) => this._mouse(e, false));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // 일부 브라우저는 락 직후 큰 값을 한 번 보내므로 무시
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('contextmenu', (e) => { if (this.enabled || this.locked) e.preventDefault(); });
    addEventListener('blur', () => this.clear());
    document.addEventListener('pointerlockerror', () => bus.emit('input:lockerror'));
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.target;
      if (was && !this.locked) { this.clear(); bus.emit('input:unlocked'); }
      if (!was && this.locked) bus.emit('input:locked');
    });
  }

  _key(e, isDown) {
    if (this.capture && isDown) {
      e.preventDefault();
      const fn = this.capture; this.capture = null;
      fn(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (e.code === 'Escape') {
      if (isDown) bus.emit('input:escape');
      return;
    }
    if (!this.enabled) return;
    // 브라우저 단축키(스페이스 스크롤, Ctrl+S 등) 막기 — Ctrl+W 등 일부는 브라우저가 막을 수 없음
    if (this.locked || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    this._set(e.code, isDown, e.repeat);
  }
  _mouse(e, isDown) {
    const code = 'Mouse' + e.button;
    if (this.capture && isDown) {
      e.preventDefault();
      const fn = this.capture; this.capture = null;
      fn(code);
      return;
    }
    if (!this.enabled || !this.locked) return;
    this._set(code, isDown, false);
  }
  _set(code, isDown, repeat) {
    if (isDown) {
      if (!this.down.has(code) && !repeat) this.pressed.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
      this.released.add(code);
    }
  }

  isDown(action) { return this.down.has(this.bindings.get(action)); }
  wasPressed(action) { return this.pressed.has(this.bindings.get(action)); }
  wasReleased(action) { return this.released.has(this.bindings.get(action)); }
  consumeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }
  endFrame() { this.pressed.clear(); this.released.clear(); }
  clear() { this.down.clear(); this.pressed.clear(); this.released.clear(); this.mouseDX = 0; this.mouseDY = 0; }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.target.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.target.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) {
      try { this.target.requestPointerLock(); } catch (e2) { /* ignore */ }
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  // 키 재지정: 다음 입력 코드 하나를 받아 fn(code)로 돌려줘요 (ESC는 취소 → null)
  captureNext(fn) { this.capture = fn; }
}

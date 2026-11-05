// Input — 키보드 상태. 게임 로직은 키 코드가 아니라 의미(throttle, brake...)로만 읽어요.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // 이번 프레임에 새로 눌린 키
    this.enabled = true;
    this.virtual = { up: 0, down: 0, left: 0, right: 0, brake: 0 }; // 자동 테스트·연출용
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  has(...codes) { return codes.some((c) => this.keys.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); }
  get axes() {
    const v = this.virtual;
    if (!this.enabled) return { up: v.up, down: v.down, left: v.left, right: v.right, brake: v.brake };
    return {
      up: Math.max(v.up, this.has('ArrowUp', 'KeyW') ? 1 : 0),
      down: Math.max(v.down, this.has('ArrowDown', 'KeyS') ? 1 : 0),
      left: Math.max(v.left, this.has('ArrowLeft', 'KeyA') ? 1 : 0),
      right: Math.max(v.right, this.has('ArrowRight', 'KeyD') ? 1 : 0),
      brake: Math.max(v.brake, this.has('Space') ? 1 : 0),
    };
  }
}

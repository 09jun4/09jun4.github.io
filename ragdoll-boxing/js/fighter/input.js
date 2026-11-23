// 키보드 → intent. W/S 좌우, A/D 후진/전진, Q 잽(빠르게 두 번 = 원투), Space 가드,
// ↑/↓ 위빙, ←/→ 왼팔/오른팔 (가만히 = 스트레이트, D 누른 채 = 훅, A 누른 채 = 어퍼컷)
const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export class PlayerController {
  constructor(comboWindow) {
    this.held = new Set();
    this.presses = [];
    this.lastJab = -1;
    this.comboWindow = comboWindow;
    addEventListener('keydown', (e) => {
      if (!GAME_KEYS.includes(e.code)) return;
      e.preventDefault(); // 화살표·스페이스로 페이지가 스크롤되지 않게
      if (!e.repeat) this.presses.push(e.code);
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
  }

  intent(time) {
    const h = (c) => this.held.has(c);
    const out = {
      fwd: (h('KeyD') ? 1 : 0) - (h('KeyA') ? 1 : 0),
      side: (h('KeyS') ? 1 : 0) - (h('KeyW') ? 1 : 0),
      guard: h('Space'),
      weave: (h('ArrowDown') ? 1 : 0) - (h('ArrowUp') ? 1 : 0),
      attack: null,
    };
    for (const code of this.presses) {
      if (code === 'KeyQ') {
        const two = time - this.lastJab < this.comboWindow;
        out.attack = two ? { type: 'straight', side: 'R' } : { type: 'jab', side: 'L' };
        this.lastJab = two ? -1 : time;
      } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
        const type = h('KeyD') ? 'hook' : h('KeyA') ? 'uppercut' : 'straight';
        out.attack = { type, side: code === 'ArrowLeft' ? 'L' : 'R' };
      }
    }
    this.presses.length = 0;
    return out;
  }
}

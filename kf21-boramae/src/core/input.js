// 키보드·마우스 입력. 키는 event.code로 읽어서 한글 입력 상태에서도 그대로 동작한다.
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, moved: false };
    this.keyListeners = [];
    this.blurListeners = [];
    this.surface = null;
    this._attached = false;
  }

  /** @param {HTMLElement} surface 사격 입력을 받는 영역(게임 화면) */
  attach(surface) {
    if (this._attached) return;
    this._attached = true;
    this.surface = surface;
    this.mouse.x = window.innerWidth / 2;
    this.mouse.y = window.innerHeight / 2;

    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target) && e.code !== 'Escape') return; // 입력칸에서도 ESC는 창 닫기로 동작
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const fn of this.keyListeners) fn(e.code, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved = true;
    });
    surface.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('dragstart', (e) => e.preventDefault());

    const lost = () => {
      this.reset();
      for (const fn of this.blurListeners) fn();
    };
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) lost();
    });
  }

  reset() {
    this.keys.clear();
    this.mouse.down = false;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** 두 키로 만드는 -1/0/+1 축 */
  axis(negCode, posCode) {
    return (this.keys.has(posCode) ? 1 : 0) - (this.keys.has(negCode) ? 1 : 0);
  }

  onKey(fn) {
    this.keyListeners.push(fn);
  }

  onBlur(fn) {
    this.blurListeners.push(fn);
  }
}

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyV', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTyping(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

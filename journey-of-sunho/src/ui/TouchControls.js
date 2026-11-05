// TouchControls — 모바일 화면 버튼 조작. 터치 기기에서만 나타나고, 주행 중에만 보여요.
// 왼쪽: ◀ ▶ (조향) · 오른쪽: 페달(가속) / 브레이크 · 위쪽: 일시정지. 여러 손가락을 동시에 쓸 수 있어요.
export function isTouchDevice() {
  return 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
}

export class TouchControls {
  constructor(root, game) {
    this.game = game;
    this.enabled = isTouchDevice() || new URLSearchParams(location.search).has('touch');
    this.el = document.createElement('div');
    this.el.className = 'touch hidden';
    this.el.innerHTML = `
      <div class="t-left"><button data-k="left">◀</button><button data-k="right">▶</button></div>
      <div class="t-right"><button data-k="brake" class="t-brake">브레이크</button><button data-k="up" class="t-gas">페달<small>가속</small></button></div>
      <button class="t-pause" data-k="pause">Ⅱ</button>`;
    root.appendChild(this.el);
    if (!this.enabled) return;
    document.body.classList.add('is-touch');
    this.down = new Map(); // pointerId -> key
    const input = game.input;
    const sync = () => {
      const t = input.touch;
      t.up = t.down = t.left = t.right = t.brake = 0;
      for (const k of this.down.values()) t[k] = 1;
    };
    const release = (e) => {
      const b = this.down.get(e.pointerId);
      if (!b) return;
      this.down.delete(e.pointerId);
      this.el.querySelector(`[data-k="${b}"]`)?.classList.remove('on');
      sync();
    };
    this.el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.k === 'pause') { game.state === 'playing' ? game.pause() : game.resume(); return; }
      b.setPointerCapture?.(e.pointerId);
      this.down.set(e.pointerId, b.dataset.k);
      b.classList.add('on');
      sync();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.el.addEventListener(ev, release);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.down.clear(); this.el.querySelectorAll('.on').forEach((b) => b.classList.remove('on')); sync(); });
  }

  // 주행(또는 일시정지) 중에만 표시
  setVisible(on) { if (this.enabled) this.el.classList.toggle('hidden', !on); }
}

// TouchControls — 모바일 조이스틱 조작 (터치 기기에서만, 주행 중에만 표시).
//  · 화면 왼쪽 절반 아무 곳이나 누르면 그 자리에 조이스틱이 생겨요 (떼면 사라짐)
//    좌우 = 조향(기울인 만큼 부드럽게) · 위 = 페달(가속) · 아래 = 감속
//  · 오른쪽 아래 큰 버튼 = 브레이크 · 위쪽 Ⅱ = 일시정지
export function isTouchDevice() {
  return 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
}

const RADIUS = 62; // 조이스틱 반지름(px)

export class TouchControls {
  constructor(root, game) {
    this.game = game;
    this.enabled = isTouchDevice() || new URLSearchParams(location.search).has('touch');
    this.el = document.createElement('div');
    this.el.className = 'touch hidden';
    this.el.innerHTML = `
      <div class="t-zone"></div>
      <div class="t-hint">이 영역을 누르고 밀어서<br>← → 조향 · ↑ 페달 · ↓ 감속</div>
      <div class="t-stick"><div class="t-knob"></div></div>
      <button class="t-brake" data-k="brake">브레이크</button>
      <button class="t-pause" data-k="pause">Ⅱ</button>`;
    root.appendChild(this.el);
    if (!this.enabled) return;
    document.body.classList.add('is-touch');
    const t = game.input.touch;
    const zone = this.el.querySelector('.t-zone'), stick = this.el.querySelector('.t-stick'), knob = this.el.querySelector('.t-knob');
    const hint = this.el.querySelector('.t-hint');
    let id = null, ox = 0, oy = 0;
    const reset = () => { t.up = t.down = t.left = t.right = 0; knob.style.transform = ''; stick.classList.remove('on'); id = null; };
    this.reset = reset;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      zone.setPointerCapture?.(id);
      stick.style.left = ox + 'px'; stick.style.top = oy + 'px';
      stick.classList.add('on');
      hint.classList.add('gone');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const x = dx / RADIUS, y = dy / RADIUS;
      const dz = 0.15;
      t.right = x > dz ? Math.min(1, (x - dz) / (1 - dz)) : 0;
      t.left = x < -dz ? Math.min(1, (-x - dz) / (1 - dz)) : 0;
      t.up = y < -0.3 ? 1 : 0;
      t.down = y > 0.45 ? 1 : 0;
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, (e) => { if (e.pointerId === id) reset(); });
    // 버튼 (브레이크·일시정지)
    const brake = this.el.querySelector('.t-brake');
    let bid = null;
    brake.addEventListener('pointerdown', (e) => { e.preventDefault(); bid = e.pointerId; brake.setPointerCapture?.(bid); t.brake = 1; brake.classList.add('on'); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) brake.addEventListener(ev, (e) => { if (e.pointerId === bid) { t.brake = 0; brake.classList.remove('on'); bid = null; } });
    this.el.querySelector('.t-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); game.state === 'playing' ? game.pause() : game.resume(); });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { reset(); t.brake = 0; brake.classList.remove('on'); });
  }

  setVisible(on) {
    if (!this.enabled) return;
    if (!on && !this.el.classList.contains('hidden')) { this.reset(); this.game.input.touch.brake = 0; }
    this.el.classList.toggle('hidden', !on);
  }
}

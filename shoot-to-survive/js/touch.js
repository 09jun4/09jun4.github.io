// 모바일 터치 조작: 왼쪽 화면 = 플로팅 조이스틱(이동), 오른쪽 화면 = 드래그 시점, 버튼 = 발사·재장전·근접·전환·기울이기
export function setupTouch(game, root) {
  const $ = (id) => root.querySelector('#' + id);
  const base = $('joyBase'), knob = $('joyKnob');
  const R = 56; // 조이스틱 반경(px)
  let joyId = null, joyO = null, lookId = null, lookLast = null;
  const rect = () => root.getBoundingClientRect();
  const setBase = (x, y, on) => { base.style.left = x + 'px'; base.style.top = y + 'px'; base.classList.toggle('on', on); };
  const homeBase = () => { const r = rect(); setBase(Math.min(110, r.width * 0.16), r.height - Math.min(110, r.height * 0.3), false); knob.style.transform = 'translate(-50%,-50%)'; };
  homeBase(); addEventListener('resize', homeBase);

  const active = () => game.touchActive();
  root.addEventListener('touchstart', (e) => {
    if (!active()) return;
    const r = rect();
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('.tbtn')) continue;
      const x = t.clientX - r.left, y = t.clientY - r.top;
      if (x < r.width * 0.45 && joyId === null) { joyId = t.identifier; joyO = [x, y]; setBase(x, y, true); }
      else if (x >= r.width * 0.45 && lookId === null) { lookId = t.identifier; lookLast = [t.clientX, t.clientY]; }
    }
    e.preventDefault();
  }, { passive: false });
  root.addEventListener('touchmove', (e) => {
    if (!active()) return;
    const r = rect();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - r.left - joyO[0], dy = t.clientY - r.top - joyO[1];
        const l = Math.hypot(dx, dy); if (l > R) { dx = dx / l * R; dy = dy / l * R; }
        game.joy.x = dx / R; game.joy.y = -dy / R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === lookId) {
        const dx = t.clientX - lookLast[0], dy = t.clientY - lookLast[1]; lookLast = [t.clientX, t.clientY];
        game.player.yaw -= dx * 0.0055;
        game.player.pitch = Math.max(-1.45, Math.min(1.45, game.player.pitch - dy * 0.0055));
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; game.joy.x = game.joy.y = 0; homeBase(); }
      if (t.identifier === lookId) lookId = null;
    }
  };
  root.addEventListener('touchend', end); root.addEventListener('touchcancel', end);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // 버튼
  const press = (id, down, up) => {
    const el = $(id); if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); if (!active()) return; el.classList.add('down'); down(); }, { passive: false });
    const rel = (e) => { e.preventDefault(); el.classList.remove('down'); up && up(); };
    el.addEventListener('touchend', rel, { passive: false }); el.addEventListener('touchcancel', rel, { passive: false });
  };
  const w = game.weapons;
  press('bFire', () => { game.fireHeld = true; w.tryFire(); }, () => { game.fireHeld = false; });
  press('bReload', () => w.tryReload());
  press('bMelee', () => w.tryMelee());
  press('bSwitch', () => w.cycle());
  press('bQ', () => game.keys.add('KeyQ'), () => game.keys.delete('KeyQ'));
  press('bE', () => game.keys.add('KeyE'), () => game.keys.delete('KeyE'));
}

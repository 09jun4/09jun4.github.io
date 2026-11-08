// Touch controls modelled on Minecraft Bedrock (mobile): D-pad or joystick, drag to look,
// hold to break, tap to place/use, hotbar tap/hold, ⋯ inventory button.
'use strict';
const Touch = {
  on: false, pref: 'auto', layout: 'dpad', sens: 100, size: 100, opa: 55,
  mv: { f: 0, s: 0, sprint: false }, jump: false, down: false, sneak: false,
  look: null, dpadT: null, stickT: null, holdKind: null, tapFrames: 0, atkT: 0, quick: false, lastTouch: 0, rotateOk: false,
  $(id) { return document.getElementById(id); },
  detect() { return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches); },
  init(hadOpts) {
    try { const o = JSON.parse(localStorage.getItem('bw-touch') || 'null'); if (o) Object.assign(this, { pref: o.pref || 'auto', layout: o.layout || 'dpad', sens: +o.sens || 100, size: +o.size || 100, opa: +o.opa || 55 }); } catch (e) { }
    this.patchGame(); this.bindControls(); this.bindHotbar(); this.bindScreen(); this.bindMenus();
    this.apply_pref();
    // lighter defaults for phones when the player hasn't saved settings yet
    if (this.on && !hadOpts) { const rd = this.$('opt-rd'); rd.value = 4; rd.dispatchEvent(new Event('input')); }
    const loop = () => { this.frame(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  },
  save() { try { localStorage.setItem('bw-touch', JSON.stringify({ pref: this.pref, layout: this.layout, sens: this.sens, size: this.size, opa: this.opa })); } catch (e) { } },
  apply_pref() {
    this.on = this.pref === 'touch' || (this.pref === 'auto' && this.detect());
    document.body.classList.toggle('touch', this.on);
    document.querySelectorAll('.ctl button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ctl === this.pref ? 'true' : 'false'));
    document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tl === this.layout ? 'true' : 'false'));
    const T = this.$('touch'); T.style.setProperty('--tsz', Math.round(60 * this.size / 100) + 'px'); T.style.setProperty('--top', this.opa / 100);
    this.$('t-dpad').hidden = this.layout !== 'dpad'; this.$('t-stick').hidden = this.layout !== 'stick'; this.$('t-sneak').hidden = this.layout !== 'stick';
    for (const [id, v] of [['tsens', this.sens], ['tsize', this.size], ['topa', this.opa]]) { this.$('opt-' + id).value = v; this.$('opt-' + id + '-v').textContent = v; }
    if (GAME.renderer) { GAME.renderer.setPixelRatio(1); GAME.resize(); }
  },
  // ---------- hooks into the game ----------
  patchGame() {
    const T = this, oLock = GAME.lock, oUnlock = GAME.unlock, oUP = GAME.updatePlayer;
    GAME.lock = function () { if (T.on) { this.locked = true; Sound.init(); return; } return oLock.call(this); };
    GAME.unlock = function () { if (T.on) { this.locked = false; T.reset(); return; } return oUnlock.call(this); };
    GAME.updatePlayer = function (dt) { if (T.on && this.locked && !UI.open) T.applyInput(dt); return oUP.call(this, dt); };
    const oStart = UI.startGame.bind(UI);
    UI.startGame = function () {
      if (T.on) T.goFullscreen();
      oStart();
      if (T.on) UI.toast(GAME.player.mode === 'creative' ? '크리에이티브 — ⋯ 버튼: 모든 블록 · 점프 두 번: 비행' : '서바이벌 — 나무를 길게 눌러 캐고, ⋯ 버튼으로 제작해 보세요', 5);
    };
    const oBuild = UI.buildScreen.bind(UI);
    UI.buildScreen = function () {
      oBuild();
      if (!T.on) return;
      const win = UI.screen.querySelector('.win'); if (!win) return;
      const cl = win.querySelector('.close'); if (cl) cl.textContent = '닫기';
      if (UI.open === 'recipes') return;
      const q = document.createElement('button'); q.className = 'close tquick'; q.setAttribute('aria-pressed', T.quick ? 'true' : 'false'); q.textContent = '빠른 이동';
      q.addEventListener('click', () => { T.quick = !T.quick; q.setAttribute('aria-pressed', T.quick ? 'true' : 'false'); });
      win.appendChild(q);
      if (UI.open === 'creative') setTimeout(() => { if (document.activeElement && document.activeElement.id === 'csearch') document.activeElement.blur(); }, 60);
      T.fitScreen(win);
    };
    window.addEventListener('resize', () => { if (T.on && UI.open) { const w = UI.screen.querySelector('.win'); if (w) T.fitScreen(w); } });
    // swallow the emulated mouse clicks that follow touches while playing
    window.addEventListener('mousedown', e => { if (T.on && GAME.locked && e.isTrusted && performance.now() - T.lastTouch < 1000) e.stopImmediatePropagation(); }, true);
  },
  reset() {
    this.mv = { f: 0, s: 0, sprint: false }; this.jump = this.down = false; this.look = this.dpadT = this.stickT = null;
    if (this.holdKind === 'use' && GAME.player) GAME.releaseUse();
    this.holdKind = null; this.tapFrames = 0;
    GAME.mouse.l = GAME.mouse.r = false;
    document.querySelectorAll('#touch .on').forEach(e => e.classList.remove('on'));
    this.$('t-dpad').classList.remove('fwd'); this.$('t-knob').style.transform = ''; this.$('t-stick').classList.remove('sprint');
  },
  applyInput(dt) {
    const K = GAME.keys, P = GAME.player;
    K.KeyW = this.mv.f > 0; K.KeyS = this.mv.f < 0; K.KeyD = this.mv.s > 0; K.KeyA = this.mv.s < 0;
    K.ControlLeft = this.mv.sprint;
    K.Space = this.jump;
    K.ShiftLeft = P.flying ? this.down : this.sneak;
    if (this.tapFrames > 0 && !GAME.useClick) { this.tapFrames = 0; if (this.holdKind !== 'use') GAME.mouse.r = false; }
    if (this.holdKind === 'break' && GAME.hit && GAME.hit.entity) { this.atkT -= dt; if (this.atkT <= 0) { GAME.attackClick = true; this.atkT = 0.55; } }
  },
  goFullscreen() {
    const d = document.documentElement;
    try { const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: 'hide' }); if (p && p.catch) p.then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { }); } catch (e) { }
  },
  // ---------- on-screen controls ----------
  bindControls() {
    const T = this, canvas = document.getElementById('game');
    const mark = () => { T.lastTouch = performance.now(); };
    const find = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };
    // look / break / place
    canvas.addEventListener('touchstart', e => {
      if (!T.on) return; e.preventDefault(); mark();
      if (!GAME.started || !GAME.locked || UI.open) return;
      if (T.look) return;
      const t = e.changedTouches[0];
      T.look = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now(), moved: false, held: false };
      T.look.timer = setTimeout(() => T.beginHold(), 300);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      if (!T.on || !T.look) return; e.preventDefault(); mark();
      const t = find(e.changedTouches, T.look.id); if (!t) return;
      const L = T.look, P = GAME.player, k = 0.0055 * T.sens / 100;
      P.yaw -= (t.clientX - L.x) * k; P.pitch -= (t.clientY - L.y) * k;
      P.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, P.pitch));
      L.x = t.clientX; L.y = t.clientY;
      if (!L.held && Math.hypot(t.clientX - L.sx, t.clientY - L.sy) > 14) { L.moved = true; clearTimeout(L.timer); }
    }, { passive: false });
    const lookEnd = e => {
      if (!T.on || !T.look) return; mark();
      const t = find(e.changedTouches, T.look.id); if (!t) return; e.preventDefault();
      const L = T.look; clearTimeout(L.timer); T.look = null;
      if (L.held) T.endHold();
      else if (!L.moved && e.type === 'touchend' && GAME.locked && !UI.open) T.tap();
    };
    canvas.addEventListener('touchend', lookEnd, { passive: false });
    canvas.addEventListener('touchcancel', lookEnd, { passive: false });

    // D-pad (slide between cells like Bedrock; diagonals appear while forward is held)
    const dpad = this.$('t-dpad');
    const cells = [['ul', 'u', 'ur'], ['l', 'c', 'r'], [null, 'd', null]];
    const cellAt = (x, y) => { const r = dpad.getBoundingClientRect(); const cx = Math.max(0, Math.min(2, Math.floor((x - r.left) / (r.width / 3)))), cy = Math.max(0, Math.min(2, Math.floor((y - r.top) / (r.height / 3)))); const far = x < r.left - r.width * 0.4 || x > r.right + r.width * 0.4 || y < r.top - r.height * 0.4 || y > r.bottom + r.height * 0.4; return far ? null : cells[cy][cx]; };
    const setDir = c => {
      const D = T.dpadT; if (!D) return;
      if ((c === 'ul' || c === 'ur') && !D.fwd) c = null;
      if (c === 'c') c = null;
      if (c === 'u' && D.cell !== 'u' && D.cell !== 'ul' && D.cell !== 'ur') GAME.onKeyPress('KeyW');
      if (c === 'u') D.fwd = true; else if (c !== 'ul' && c !== 'ur') D.fwd = false;
      D.cell = c;
      const m = { u: [1, 0], ul: [1, -1], ur: [1, 1], l: [0, -1], r: [0, 1], d: [-1, 0] }[c] || [0, 0];
      T.mv.f = m[0]; T.mv.s = m[1];
      dpad.classList.toggle('fwd', !!D.fwd);
      dpad.querySelectorAll('.t-cell').forEach(el => el.classList.toggle('on', el.dataset.c === c));
    };
    dpad.addEventListener('touchstart', e => {
      e.preventDefault(); mark(); if (T.dpadT) return;
      const t = e.changedTouches[0], c = cellAt(t.clientX, t.clientY);
      if (c === 'c') { T.sneak = !T.sneak; dpad.querySelector('.sneak').classList.toggle('toggled', T.sneak); T.dpadT = { id: t.identifier, cell: null, fwd: false, sneakOnly: true }; return; }
      T.dpadT = { id: t.identifier, cell: null, fwd: false };
      setDir(c);
    }, { passive: false });
    dpad.addEventListener('touchmove', e => {
      e.preventDefault(); mark(); const D = T.dpadT; if (!D || D.sneakOnly) return;
      const t = find(e.changedTouches, D.id); if (!t) return;
      const c = cellAt(t.clientX, t.clientY); if (c !== D.cell) setDir(c);
    }, { passive: false });
    const dpadEnd = e => { mark(); const D = T.dpadT; if (!D || !find(e.changedTouches, D.id)) return; e.preventDefault(); T.dpadT = null; T.mv.f = T.mv.s = 0; T.mv.sprint = false; dpad.classList.remove('fwd'); dpad.querySelectorAll('.t-cell').forEach(el => el.classList.remove('on')); };
    dpad.addEventListener('touchend', dpadEnd, { passive: false }); dpad.addEventListener('touchcancel', dpadEnd, { passive: false });

    // joystick (push to the rim while going forward = sprint)
    const stick = this.$('t-stick'), knob = this.$('t-knob');
    const stickMove = t => {
      const r = stick.getBoundingClientRect(), R = r.width / 2;
      let dx = (t.clientX - (r.left + R)) / R, dy = (t.clientY - (r.top + R)) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      knob.style.transform = `translate(${dx * R * 0.62}px,${dy * R * 0.62}px)`;
      const f = -dy > 0.35 ? 1 : dy > 0.35 ? -1 : 0, s = dx > 0.35 ? 1 : dx < -0.35 ? -1 : 0;
      if (f === 1 && T.mv.f !== 1) GAME.onKeyPress('KeyW');
      T.mv.f = m < 0.22 ? 0 : f; T.mv.s = m < 0.22 ? 0 : s;
      T.mv.sprint = m > 0.93 && f === 1 && Math.abs(dx) < 0.55;
      stick.classList.toggle('sprint', T.mv.sprint);
    };
    stick.addEventListener('touchstart', e => { e.preventDefault(); mark(); if (T.stickT !== null) return; const t = e.changedTouches[0]; T.stickT = t.identifier; stickMove(t); }, { passive: false });
    stick.addEventListener('touchmove', e => { e.preventDefault(); mark(); const t = find(e.changedTouches, T.stickT); if (t) stickMove(t); }, { passive: false });
    const stickEnd = e => { mark(); if (T.stickT === null || !find(e.changedTouches, T.stickT)) return; e.preventDefault(); T.stickT = null; T.mv.f = T.mv.s = 0; T.mv.sprint = false; knob.style.transform = ''; stick.classList.remove('sprint'); };
    stick.addEventListener('touchend', stickEnd, { passive: false }); stick.addEventListener('touchcancel', stickEnd, { passive: false });

    // hold buttons
    const holdBtn = (el, on, off) => {
      el.addEventListener('touchstart', e => { e.preventDefault(); mark(); el.classList.add('on'); on(); }, { passive: false });
      const end = e => { e.preventDefault(); mark(); el.classList.remove('on'); off(); };
      el.addEventListener('touchend', end, { passive: false }); el.addEventListener('touchcancel', end, { passive: false });
    };
    holdBtn(this.$('t-jump'), () => { T.jump = true; GAME.keys.Space = true; if (GAME.locked) GAME.onKeyPress('Space'); }, () => { T.jump = false; });
    holdBtn(this.$('t-down'), () => { T.down = true; }, () => { T.down = false; });
    const sn = this.$('t-sneak');
    sn.addEventListener('touchstart', e => { e.preventDefault(); mark(); T.sneak = !T.sneak; sn.classList.toggle('toggled', T.sneak); dpad.querySelector('.sneak').classList.toggle('toggled', T.sneak); }, { passive: false });
    const tapBtn = (el, fn) => { el.addEventListener('touchstart', e => { e.preventDefault(); mark(); el.classList.add('on'); }, { passive: false }); el.addEventListener('touchend', e => { e.preventDefault(); mark(); el.classList.remove('on'); fn(); }, { passive: false }); el.addEventListener('click', fn); };
    tapBtn(this.$('t-pause'), () => { if (!GAME.started || UI.open) return; GAME.unlock(); UI.pause(true); });
    tapBtn(this.$('t-view'), () => { GAME.thirdPerson = ((GAME.thirdPerson || 0) + 1) % 3; UI.toast(['1인칭', '3인칭 (뒤)', '3인칭 (앞)'][GAME.thirdPerson], 1.2); });
    this.$('t-rotate-ok').addEventListener('click', () => { T.rotateOk = true; });
  },
  // landscape phones: inventory goes in a right-hand column (like Bedrock), then the window is scaled to fit
  fitScreen(win) {
    const land = innerWidth > innerHeight;
    if (land && !win.querySelector('.tcols')) {
      const labs = [...win.querySelectorAll(':scope > .lab')].filter(l => l.textContent === '인벤토리' || l.textContent === '핫바');
      const lab = labs[labs.length - 1];
      if (lab) {
        const cols = document.createElement('div'); cols.className = 'tcols';
        const L = document.createElement('div'), R = document.createElement('div'); L.className = 'tcol'; R.className = 'tcol';
        const kids = [...win.children].filter(c => c.tagName !== 'H2' && !c.classList.contains('close'));
        let right = false;
        for (const c of kids) { if (c === lab) right = true; (right ? R : L).appendChild(c); }
        cols.append(L, R); win.insertBefore(cols, win.querySelector('h2').nextSibling);
      }
    }
    win.style.zoom = 1;
    const k = Math.min(1, (innerHeight - 16) / win.offsetHeight, (innerWidth - 16) / win.offsetWidth);
    win.style.zoom = k < 1 ? k.toFixed(3) : '';
  },
  holdUseItem() { const it = GAME.player.heldItem(); return !!(it && (it.food || it.bow)); },
  beginHold() {
    const L = this.look; if (!L || L.moved || !GAME.locked || UI.open) return;
    L.held = true;
    if (this.holdUseItem() && !(GAME.hit && GAME.hit.entity)) { this.holdKind = 'use'; GAME.mouse.r = true; GAME.useClick = true; GAME.useRepeat = 0; }
    else { this.holdKind = 'break'; GAME.mouse.l = true; this.atkT = 0; if (GAME.hit && GAME.hit.entity) { GAME.attackClick = true; this.atkT = 0.55; } }
    if (navigator.vibrate) try { navigator.vibrate(10); } catch (e) { }
  },
  endHold() {
    if (this.holdKind === 'use') { GAME.mouse.r = false; GAME.releaseUse(); }
    if (this.holdKind === 'break') GAME.mouse.l = false;
    this.holdKind = null;
  },
  tap() {
    const hit = GAME.hit;
    if (hit && hit.entity) {
      // shears on sheep, bucket on cow etc. are "use"; everything else is an attack
      const it = GAME.player.heldItem();
      if (it && (it.name === 'shears' || it.name === 'bucket') && (hit.entity.type === 'sheep' || hit.entity.type === 'cow')) { GAME.mouse.r = true; GAME.useClick = true; GAME.useRepeat = 0; this.tapFrames = 2; }
      else GAME.attackClick = true;
      return;
    }
    GAME.mouse.r = true; GAME.useClick = true; GAME.useRepeat = 0; this.tapFrames = 2;
    if (!hit) GAME.player.swing = 1;
  },
  // ---------- hotbar ----------
  bindHotbar() {
    const T = this, hb = document.getElementById('hotbar');
    const more = document.createElement('div'); more.className = 'slot t-more'; more.textContent = '⋯'; more.setAttribute('aria-label', '인벤토리');
    hb.appendChild(more);
    let hold = null;
    hb.addEventListener('touchstart', e => {
      if (!T.on) return; e.preventDefault(); T.lastTouch = performance.now();
      if (!GAME.started || !GAME.locked || UI.open) return;
      const el = e.target.closest('.slot'); if (!el) return;
      if (el === more) { const P = GAME.player; UI.openScreen(P.mode === 'creative' ? 'creative' : 'inventory'); return; }
      const i = UI.slots.findIndex(s => s.el === el); if (i < 0) return;
      GAME.player.sel = i; UI.dirty = true;
      clearInterval(hold && hold.iv); clearTimeout(hold && hold.to);
      hold = { el, to: setTimeout(() => { GAME.dropHeld(false); hold.iv = setInterval(() => { if (GAME.player.held()) GAME.dropHeld(false); }, 180); }, 550) };
    }, { passive: false });
    const end = e => { if (!T.on) return; e.preventDefault(); if (hold) { clearTimeout(hold.to); clearInterval(hold.iv); hold = null; } };
    hb.addEventListener('touchend', end, { passive: false }); hb.addEventListener('touchcancel', end, { passive: false });
  },
  // ---------- inventory screens: tap = left click, long-press = right click ----------
  bindScreen() {
    const T = this, scr = document.getElementById('screen');
    let st = null;
    const fire = (slot, button, x, y) => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
      slot.dispatchEvent(new MouseEvent('mousedown', { button, buttons: button === 2 ? 2 : 1, clientX: x, clientY: y, shiftKey: T.quick, bubbles: true, cancelable: true }));
      slot.dispatchEvent(new MouseEvent('mouseenter'));
      clearTimeout(T.tipT); T.tipT = setTimeout(() => { UI.tooltip.hidden = true; }, 1100);
    };
    scr.addEventListener('touchstart', e => {
      if (!T.on) return;
      const slot = e.target.closest('.slot'); if (!slot) return;
      const t = e.changedTouches[0];
      st = { slot, x: t.clientX, y: t.clientY, moved: false, long: false };
      const cur = st;
      cur.timer = setTimeout(() => { if (st === cur && !cur.moved) { cur.long = true; fire(slot, 2, cur.x, cur.y); if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { } } }, 380);
    }, { passive: true });
    scr.addEventListener('touchmove', e => { if (!st) return; const t = e.changedTouches[0]; if (Math.hypot(t.clientX - st.x, t.clientY - st.y) > 10) { st.moved = true; clearTimeout(st.timer); } }, { passive: true });
    scr.addEventListener('touchend', e => {
      if (!st) return; const s = st; st = null; clearTimeout(s.timer);
      if (s.moved) return;
      e.preventDefault();
      if (!s.long) fire(s.slot, 0, s.x, s.y);
    }, { passive: false });
    scr.addEventListener('touchcancel', () => { if (st) clearTimeout(st.timer); st = null; });
  },
  // ---------- title + pause menu settings ----------
  bindMenus() {
    const T = this;
    document.querySelectorAll('.ctl button').forEach(b => b.addEventListener('click', () => { T.pref = b.dataset.ctl; T.save(); T.apply_pref(); }));
    document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { T.layout = b.dataset.tl; T.save(); T.reset(); T.apply_pref(); }));
    for (const id of ['tsens', 'tsize', 'topa']) this.$('opt-' + id).addEventListener('input', e => { const v = +e.target.value; T[{ tsens: 'sens', tsize: 'size', topa: 'opa' }[id]] = v; T.save(); T.apply_pref(); });
    this.$('t-fs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); else T.goFullscreen(); });
    this.$('t-dbg').addEventListener('click', () => UI.toggleDebug());
    this.$('t-hudbtn').addEventListener('click', () => { UI.toggleHud(); this.$('t-hudbtn').textContent = UI.hudVisible ? 'HUD 숨기기' : 'HUD 보이기'; });
    this.$('t-time').addEventListener('click', () => { if (GAME.player && GAME.player.mode === 'creative') { GAME.time = (GAME.time + 6000) % 24000; UI.toast('시간 +6시간'); } else UI.toast('크리에이티브 모드에서만 쓸 수 있어요'); });
  },
  // ---------- per frame visibility ----------
  frame() {
    const P = GAME.player;
    const show = this.on && GAME.started && GAME.locked && !UI.open && !GAME.paused && P && !P.dead;
    const L = this.$('touch');
    if (L.hidden === show) { L.hidden = !show; if (!show) this.reset(); }
    if (show) {
      const fly = !!P.flying;
      if (this.$('t-down').hidden === fly) this.$('t-down').hidden = !fly;
      L.classList.toggle('nohud', !UI.hudVisible);
    }
    const rot = this.on && GAME.started && !this.rotateOk && innerHeight > innerWidth * 1.1;
    const R = this.$('t-rotate'); if (R.hidden === rot) R.hidden = !rot;
  },
};

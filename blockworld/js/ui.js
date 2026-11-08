// HUD, inventories, crafting, menus
'use strict';
const ICON = {
  cache: {},
  get(id) {
    if (this.cache[id]) return this.cache[id];
    const it = ITEMS[id]; if (!it) return null;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const src = TEX.canvas;
    const tileXY = t => [(t % ATLAS_COLS) * TS, ((t / ATLAS_COLS) | 0) * TS];
    if (it.block && BLOCKS[it.block].shape !== 'cross' && BLOCKS[it.block].shape !== 'pane') {
      const b = BLOCKS[it.block];
      const box = b.shape === 'box' ? b.box : [0, 0, 0, 1, 1, 1];
      const hgt = box[4] - box[1];
      const [tx, ty] = tileXY(b.faces.top), [sx, sy] = tileXY(b.facing ? b.faces.front : b.faces.side), [lx, ly] = tileXY(b.faces.side);
      const off = (1 - hgt) * 9;
      // top face
      x.save(); x.setTransform(0.95, 0.48, -0.95, 0.48, 16, 1.5 + off); x.drawImage(src, tx, ty, 16, 16, 0, 0, 16, 16); x.restore();
      // left face
      x.save(); x.setTransform(0.95, 0.48, 0, 0.98 * hgt, 0.8, 9.2 + off); x.drawImage(src, lx, ly + 16 * (1 - hgt), 16, 16 * hgt, 0, 0, 16, 16); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 16, 16); x.restore();
      // right face
      x.save(); x.setTransform(0.95, -0.48, 0, 0.98 * hgt, 16, 16.8 + off); x.drawImage(src, sx, sy + 16 * (1 - hgt), 16, 16 * hgt, 0, 0, 16, 16); x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(0, 0, 16, 16); x.restore();
    } else {
      const t = it.block ? BLOCKS[it.block].faces.side : it.tex;
      const [tx, ty] = tileXY(t);
      x.drawImage(src, tx, ty, 16, 16, 0, 0, 32, 32);
      if (it.block && BLOCKS[it.block].tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(40,90,10,0.12)'; x.fillRect(0, 0, 32, 32); x.globalCompositeOperation = 'source-over'; }
    }
    this.cache[id] = c;
    return c;
  },
};
const HUDPIX = {
  heart: ['..##.##..', '.#ww#rr#.', '#wrrrrrr#', '#rrrrrrr#', '#rrrrrrr#', '.#rrrrr#.', '..#rrr#..', '...#r#...', '....#....'],
  food: ['.....##..', '....#bb#.', '...#bbbb#', '..#bbbbb#', '..#bbbb#.', '.#w##b#..', '#ww#.#...', '.##......', '.........'],
  bubble: ['...###...', '..#www#..', '.#wwbbb#.', '.#wbbbb#.', '.#bbbbb#.', '..#bbb#..', '...###...', '.........', '.........'],
};
function drawPix(ctx, rows, ox, oy, pal, s, half) {
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x]; if (ch === '.') continue;
    let col = pal[ch];
    if (half && pal.empty && ch !== '#' && (half === 'L' ? x > 4 : x < 4)) col = pal.empty;
    if (!col) continue;
    ctx.fillStyle = col; ctx.fillRect(ox + x * s, oy + y * s, s, s);
  }
}

const UI = {
  open: null, dirty: true, hudDirty: true, hudVisible: true, debug: false, container: null, craft: null,
  init() {
    this.$ = id => document.getElementById(id);
    this.hotbar = this.$('hotbar'); this.slots = [];
    for (let i = 0; i < 9; i++) { const s = this.makeSlot(); this.hotbar.appendChild(s.el); this.slots.push(s); }
    this.bars = this.$('bars'); this.barsCtx = this.bars.getContext('2d');
    this.screen = this.$('screen'); this.cursorEl = this.$('cursor-item'); this.cursorSlot = this.makeSlot(); this.cursorEl.appendChild(this.cursorSlot.el);
    this.tooltip = this.$('tooltip');
    document.addEventListener('mousemove', e => { this.mx = e.clientX; this.my = e.clientY; if (this.open) { this.cursorEl.style.transform = `translate(${e.clientX - 18}px,${e.clientY - 18}px)`; this.tooltip.style.transform = `translate(${e.clientX + 14}px,${e.clientY - 26}px)`; } });
    // title
    this.$('btn-new').addEventListener('click', () => this.startGame());
    this.$('seed').addEventListener('keydown', e => { if (e.key === 'Enter') this.startGame(); });
    document.querySelectorAll('.mode-opt').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.mode-opt').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); }));
    this.$('btn-resume').addEventListener('click', () => this.pause(false));
    this.$('btn-respawn').addEventListener('click', () => { this.$('death').hidden = true; GAME.respawn(); GAME.lock(); });
    this.$('btn-win').addEventListener('click', () => { this.$('win').hidden = true; GAME.lock(); GAME.paused = false; });
    this.$('btn-title').addEventListener('click', () => location.reload());
    this.$('btn-recipes').addEventListener('click', () => { this.$('pause').hidden = true; this.openScreen('recipes'); });
    const rd = this.$('opt-rd'), fov = this.$('opt-fov'), sens = this.$('opt-sens'), mus = this.$('opt-music'), sfx = this.$('opt-sfx');
    const upd = () => {
      GAME.renderDist = +rd.value; GAME.fov = +fov.value; GAME.sens = +sens.value / 100000; Sound.setVolumes(+mus.value / 100, +sfx.value / 100);
      this.$('opt-rd-v').textContent = rd.value; this.$('opt-fov-v').textContent = fov.value; this.$('opt-sens-v').textContent = sens.value; this.$('opt-music-v').textContent = mus.value; this.$('opt-sfx-v').textContent = sfx.value;
      try { localStorage.setItem('bw-opts', JSON.stringify({ rd: rd.value, fov: fov.value, sens: sens.value, mus: mus.value, sfx: sfx.value })); } catch (e) { }
    };
    try { const o = JSON.parse(localStorage.getItem('bw-opts') || 'null'); if (o) { rd.value = o.rd; fov.value = o.fov; sens.value = o.sens; mus.value = o.mus; sfx.value = o.sfx; } } catch (e) { }
    [rd, fov, sens, mus, sfx].forEach(el => el.addEventListener('input', upd)); upd();
    // dirt background for menus
    const bg = document.createElement('canvas'); bg.width = bg.height = 16; bg.getContext('2d').drawImage(TEX.canvas, (TEX.names.dirt_all % ATLAS_COLS) * 16, ((TEX.names.dirt_all / ATLAS_COLS) | 0) * 16, 16, 16, 0, 0, 16, 16);
    document.documentElement.style.setProperty('--dirt', `url(${bg.toDataURL()})`);
    this.$('block-count').textContent = BLOCKS.filter(b => b && !b.noItem).length;
    this.$('item-count').textContent = Object.keys(ITEMS).length;
    // touch controls are handled in touch.js
  },
  startGame() {
    const seed = this.$('seed').value.trim();
    const mode = document.querySelector('.mode-opt[aria-pressed="true"]').dataset.mode;
    this.$('title').hidden = true;
    Sound.init();
    GAME.titleWorld = false;
    GAME.newGame(seed, mode);
    this.$('hud').hidden = false;
    GAME.lock();
    this.dirty = this.hudDirty = true;
    this.toast(mode === 'creative' ? '크리에이티브 모드 — E: 모든 블록, 스페이스 두 번: 비행' : '서바이벌 모드 — 나무를 캐서 판자와 작업대를 만들어 보세요', 5);
  },
  showLoading(v) { this.$('loading').hidden = !v; },
  loadingProgress(p) { this.$('load-bar').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; },
  pause(v) {
    GAME.paused = v;
    this.$('pause').hidden = !v;
    if (!v) GAME.lock();
  },
  showDeath(msg, stats) { this.$('death-msg').textContent = msg; this.$('death-score').textContent = `점수: ${GAME.player.xpTotal}  ·  처치: ${stats.kills}  ·  채굴: ${stats.mined}`; this.$('death').hidden = false; },
  showWin() { GAME.paused = true; GAME.unlock(); this.$('win').hidden = false; },
  toggleDebug() { this.debug = !this.debug; this.$('debug').hidden = !this.debug; },
  toggleHud() { this.hudVisible = !this.hudVisible; this.$('hud').style.visibility = this.hudVisible ? 'visible' : 'hidden'; },
  boss(v) { this.$('boss').hidden = !v; },
  bossHealth(f) { this.$('boss-fill').style.width = (f * 100).toFixed(1) + '%'; },
  toast(msg, sec = 3) { const t = this.$('toast'); t.textContent = msg; t.hidden = false; clearTimeout(this.toastT); this.toastT = setTimeout(() => t.hidden = true, sec * 1000); },
  // ---------- slots ----------
  makeSlot() {
    const el = document.createElement('div'); el.className = 'slot';
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; el.appendChild(cv);
    const cnt = document.createElement('span'); cnt.className = 'cnt'; el.appendChild(cnt);
    const dur = document.createElement('i'); dur.className = 'dur'; el.appendChild(dur);
    const s = { el, cv, cnt, dur, ctx: cv.getContext('2d'), last: null };
    return s;
  },
  drawSlot(s, stack) {
    const key = stack ? stack.id + ':' + stack.count + ':' + stack.dur : '';
    if (s.last === key) return; s.last = key;
    s.ctx.clearRect(0, 0, 32, 32);
    s.cnt.textContent = ''; s.dur.style.display = 'none';
    if (!stack) return;
    const ic = ICON.get(stack.id); if (ic) s.ctx.drawImage(ic, 0, 0);
    if (stack.count > 1) s.cnt.textContent = stack.count;
    const it = ITEMS[stack.id];
    if (it && it.dur && stack.dur !== undefined && stack.dur < it.dur) { const f = stack.dur / it.dur; s.dur.style.display = 'block'; s.dur.style.setProperty('--f', f); s.dur.style.setProperty('--c', `hsl(${f * 120},90%,45%)`); }
  },
  // ---------- per frame ----------
  update(dt) {
    const P = GAME.player; if (!P || !GAME.started) return;
    if (this.dirty) {
      for (let i = 0; i < 9; i++) { this.drawSlot(this.slots[i], P.inv[i]); this.slots[i].el.classList.toggle('sel', i === P.sel); }
      if (this.open) this.refreshScreen();
      this.drawSlot(this.cursorSlot, P.cursor);
      const it = P.heldItem();
      if (it && this.lastHeldName !== it.ko) { this.lastHeldName = it.ko; const hn = this.$('held-name'); hn.textContent = it.ko; hn.classList.remove('fade'); void hn.offsetWidth; hn.classList.add('fade'); }
      if (!it) this.lastHeldName = null;
      this.dirty = false;
    }
    if (P.health !== this.lh || P.food !== this.lf || Math.ceil(P.air) !== this.la || P.level !== this.ll || P.xp !== this.lxp || P.hurtTime > 0 || (P.health <= 4 && GAME.frameN % 4 === 0) || this.lastMode !== P.mode) {
      this.lh = P.health; this.lf = P.food; this.la = Math.ceil(P.air); this.ll = P.level; this.lxp = P.xp; this.lastMode = P.mode;
      this.drawBars(P);
    }
    // vignette / overlays
    if (P.hurtFlash > 0) P.hurtFlash = Math.max(0, P.hurtFlash - dt * 2.5);
    this.setOv('hurt', (P.hurtFlash * 0.6).toFixed(2));
    this.setOv('portal-ov', Math.min(0.85, P.portalT / 3.5).toFixed(2));
    this.setOv('water-ov', GAME.underwater ? 1 : 0);
    this.setOv('fire-ov', P.fire > 0 && P.mode === 'survival' ? 1 : 0);
    if (this.chHidden !== !!this.open) { this.chHidden = !!this.open; this.$('crosshair').hidden = this.chHidden; }
    if (this.debug && (GAME.frameN % 10 === 0)) {
      const w = GAME.world, x = Math.floor(P.pos.x), y = Math.floor(P.pos.y), z = Math.floor(P.pos.z);
      const c = w.chunkAt(x, z), L = w.getLight(x, y, z);
      const hit = GAME.hit;
      const dirs = ['남(+Z)', '서(-X)', '북(-Z)', '동(+X)'];
      const yawDeg = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
      this.$('debug').textContent = [`블록월드 ${GAME.fps} fps · 청크 ${GAME.chunkMeshes.size}개 · 엔티티 ${GAME.entities.length}`,
        `차원: ${w.dim}  시드: ${GAME.seedStr}`, `XYZ: ${P.pos.x.toFixed(2)} / ${P.pos.y.toFixed(2)} / ${P.pos.z.toFixed(2)}`, `청크: ${x >> 4}, ${z >> 4}  방향: ${dirs[Math.round(yawDeg / 90) % 4]}`,
        `바이옴: ${c ? biomeName(c.biome[(x & 15) + (z & 15) * 16]) : '-'}`, `빛: 하늘 ${L >> 4} · 블록 ${L & 15}`, `시간: ${GAME.time} (${Math.floor(((GAME.time / 1000) + 6) % 24)}시)`,
        hit && hit.block ? `대상 블록: ${BLOCKS[hit.id].ko} (${BLOCKS[hit.id].name}) @ ${hit.x},${hit.y},${hit.z}` : hit && hit.entity ? `대상: ${MOB_KO[hit.entity.type] || '엔티티'} HP ${Math.ceil(hit.entity.health)}` : ''].join('\n');
    }
  },
  setOv(id, v) { this.ov = this.ov || {}; if (this.ov[id] === v) return; this.ov[id] = v; this.$(id).style.opacity = v; },
  drawBars(P) {
    const c = this.barsCtx, S = 2;
    c.clearRect(0, 0, this.bars.width, this.bars.height);
    const surv = P.mode === 'survival';
    this.bars.style.visibility = P.mode === 'spectator' ? 'hidden' : 'visible';
    // XP bar
    const bw = 182 * S, by = 30 * S;
    c.fillStyle = '#1A1A1A'; c.fillRect(0, by, bw, 5 * S);
    c.fillStyle = '#3A5A10'; c.fillRect(S, by + S, bw - 2 * S, 3 * S);
    c.fillStyle = '#80FF20'; c.fillRect(S, by + S, (bw - 2 * S) * P.xp, 3 * S);
    if (P.level > 0) { c.font = `bold ${10 * S}px monospace`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(P.level, bw / 2, by - S); c.fillStyle = '#80FF20'; c.fillText(P.level, bw / 2, by - S); }
    if (!surv) return;
    const shake = P.health <= 4;
    const flash = P.hurtTime > 0.2;
    for (let i = 0; i < 10; i++) {
      const ox = i * 8 * S, oy = 16 * S + (shake ? Math.round((Math.random() - 0.5) * 2) * S : 0);
      const h = P.health - i * 2;
      drawPix(c, HUDPIX.heart, ox, oy, { '#': flash ? '#FFFFFF' : '#1A0000', w: '#3A1010', r: '#3A1010' }, S);
      if (h >= 2) drawPix(c, HUDPIX.heart, ox, oy, { '#': flash ? '#FFFFFF' : '#1A0000', w: '#FFB0B0', r: '#E01010' }, S);
      else if (h === 1) drawPix(c, HUDPIX.heart, ox, oy, { '#': flash ? '#FFFFFF' : '#1A0000', w: '#FFB0B0', r: '#E01010', empty: '#3A1010' }, S, 'L');
      const f = P.food - i * 2, fx = bw - (i + 1) * 8 * S;
      const fo = P.food <= 0 ? Math.round((Math.random() - 0.5) * 2) * S : 0;
      drawPix(c, HUDPIX.food, fx, 16 * S + fo, { '#': '#1A0E00', b: '#3A2410', w: '#3A3A30' }, S);
      if (f >= 2) drawPix(c, HUDPIX.food, fx, 16 * S + fo, { '#': '#1A0E00', b: '#C06A2A', w: '#F0E8D8' }, S);
      else if (f === 1) drawPix(c, HUDPIX.food, fx, 16 * S + fo, { '#': '#1A0E00', b: '#C06A2A', w: '#F0E8D8', empty: '#3A2410' }, S, 'R');
    }
    if (P.air < 15) {
      const n = Math.ceil(P.air / 1.5);
      for (let i = 0; i < n; i++) drawPix(c, HUDPIX.bubble, bw - (i + 1) * 8 * S, 6 * S, { '#': '#10307A', w: '#E0F0FF', b: '#5AA0F0' }, S);
    }
  },
  // ---------- screens ----------
  openScreen(kind, container, key) {
    const P = GAME.player;
    this.open = kind; this.container = container || null; this.containerKey = key;
    GAME.unlock(); GAME.mouse.l = GAME.mouse.r = false; GAME.keys = {};
    this.craft = kind === 'craft' ? new Array(9).fill(null) : kind === 'inventory' ? new Array(4).fill(null) : null;
    this.buildScreen();
    this.screen.hidden = false; this.cursorEl.hidden = false;
    this.dirty = true;
  },
  close() {
    const P = GAME.player;
    if (this.craft) for (const s of this.craft) if (s) { const left = P.addItem(s.id, s.count, s.dur); if (left) GAME.dropItem(P.pos.x, P.pos.y + 1.2, P.pos.z, s.id, left, s.dur); }
    if (P.cursor) { const left = P.addItem(P.cursor.id, P.cursor.count, P.cursor.dur); if (left) GAME.dropItem(P.pos.x, P.pos.y + 1.2, P.pos.z, P.cursor.id, left, P.cursor.dur); P.cursor = null; }
    if (this.container && this.container.type === 'furnace' && this.container.xp >= 1) { GAME.dropXP(P.pos.x, P.pos.y + 1, P.pos.z, Math.floor(this.container.xp)); this.container.xp %= 1; }
    this.open = null; this.craft = null; this.container = null;
    this.screen.hidden = true; this.cursorEl.hidden = true; this.tooltip.hidden = true;
    this.screen.innerHTML = '';
    this.dirty = true;
    GAME.lock();
  },
  slotHandlers(el, get, set, opts = {}) {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      const P = GAME.player;
      if (opts.output) { this.takeOutput(e.shiftKey, opts); return; }
      if (opts.creative) {
        if (P.cursor) { P.cursor = null; }
        else P.cursor = { id: opts.creative, count: e.shiftKey ? ITEMS[opts.creative].stack : (e.button === 2 ? 1 : ITEMS[opts.creative].stack) };
        if (ITEMS[opts.creative].dur && P.cursor) P.cursor.dur = ITEMS[opts.creative].dur;
        this.dirty = true; GAME.sound('click'); return;
      }
      let s = get();
      if (e.shiftKey && s && opts.quick) { opts.quick(); this.dirty = true; return; }
      const cur = P.cursor;
      if (opts.filter && cur && !opts.filter(cur.id)) return;
      if (e.button === 0) {
        if (cur && s && cur.id === s.id && cur.dur === undefined && s.dur === undefined) { const max = ITEMS[s.id].stack; const n = Math.min(cur.count, max - s.count); s.count += n; cur.count -= n; if (!cur.count) P.cursor = null; set(s); }
        else { set(cur); P.cursor = s; }
      } else if (e.button === 2) {
        if (cur) {
          if (!s) { set({ id: cur.id, count: 1, dur: cur.dur }); cur.count--; if (!cur.count) P.cursor = null; }
          else if (s.id === cur.id && s.count < ITEMS[s.id].stack && s.dur === undefined) { s.count++; cur.count--; if (!cur.count) P.cursor = null; set(s); }
          else { set(cur); P.cursor = s; }
        } else if (s) { const h = Math.ceil(s.count / 2); P.cursor = { id: s.id, count: h, dur: s.dur }; s.count -= h; set(s.count ? s : null); }
      }
      if (P.cursor && P.cursor.dur === undefined) delete P.cursor.dur;
      this.dirty = true; this.updateCraftResult();
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('mouseenter', () => { const s = opts.creative ? { id: opts.creative } : (opts.output ? this.result : get()); if (s && ITEMS[s.id]) { this.tooltip.textContent = ITEMS[s.id].ko; this.tooltip.hidden = false; } });
    el.addEventListener('mouseleave', () => { this.tooltip.hidden = true; });
  },
  invGrid(parent) {
    const P = GAME.player;
    const main = document.createElement('div'); main.className = 'grid g9';
    const hot = document.createElement('div'); hot.className = 'grid g9 hot';
    this.invSlots = [];
    for (let i = 9; i < 36; i++) this.addSlot(main, i);
    for (let i = 0; i < 9; i++) this.addSlot(hot, i);
    const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = '인벤토리';
    parent.append(lab, main, hot);
  },
  addSlot(parent, i) {
    const P = GAME.player, s = this.makeSlot();
    parent.appendChild(s.el);
    this.slotHandlers(s.el, () => P.inv[i], v => P.inv[i] = v, { quick: () => this.quickMove(i) });
    this.invSlots.push([s, i]);
  },
  quickMove(i) {
    const P = GAME.player, s = P.inv[i]; if (!s) return;
    if (this.container && this.container.type === 'chest') { const left = this.mergeInto(this.container.slots, s, 0, 27); P.inv[i] = left; return; }
    if (this.container && this.container.type === 'furnace') { const it = ITEMS[s.id]; const idx = SMELT[it.name] ? 0 : it.fuel ? 1 : -1; if (idx >= 0) { P.inv[i] = this.mergeInto(this.container.slots, s, idx, idx + 1); } return; }
    // move between hotbar and main
    const tmp = i < 9 ? this.mergeInto(P.inv, s, 9, 36) : this.mergeInto(P.inv, s, 0, 9);
    P.inv[i] = tmp;
  },
  mergeInto(arr, s, a, b) {
    const max = ITEMS[s.id].stack;
    for (let k = a; k < b && s.count; k++) { const t = arr[k]; if (t && t.id === s.id && t.count < max && t.dur === undefined && s.dur === undefined) { const n = Math.min(s.count, max - t.count); t.count += n; s.count -= n; } }
    for (let k = a; k < b && s.count; k++) if (!arr[k]) { arr[k] = { id: s.id, count: s.count, dur: s.dur }; if (s.dur === undefined) delete arr[k].dur; s.count = 0; }
    return s.count ? s : null;
  },
  buildScreen() {
    const P = GAME.player, sc = this.screen; sc.innerHTML = '';
    const win = document.createElement('div'); win.className = 'win ' + this.open; sc.appendChild(win);
    const title = document.createElement('h2'); win.appendChild(title);
    this.extraSlots = [];
    if (this.open === 'inventory' || this.open === 'craft') {
      title.textContent = this.open === 'craft' ? '제작' : '제작 (2×2)';
      const row = document.createElement('div'); row.className = 'craftrow';
      const n = this.open === 'craft' ? 3 : 2;
      const grid = document.createElement('div'); grid.className = 'grid g' + n;
      for (let i = 0; i < n * n; i++) { const s = this.makeSlot(); grid.appendChild(s.el); this.slotHandlers(s.el, () => this.craft[i], v => this.craft[i] = v); this.extraSlots.push([s, () => this.craft[i]]); }
      const arrow = document.createElement('div'); arrow.className = 'arrow'; arrow.textContent = '➜';
      const out = this.makeSlot(); out.el.classList.add('big'); this.slotHandlers(out.el, null, null, { output: true }); this.outSlot = out;
      row.append(grid, arrow, out.el);
      if (this.open === 'inventory') {
        const pv = document.createElement('div'); pv.className = 'portrait';
        pv.innerHTML = `<b>${P.mode === 'survival' ? '서바이벌' : P.mode}</b><span>레벨 ${P.level}</span><span>체력 ${Math.ceil(P.health)}/20</span><span>배고픔 ${P.food}/20</span>`;
        row.prepend(pv);
      }
      win.appendChild(row);
      const rb = document.createElement('button'); rb.className = 'mini'; rb.textContent = '레시피 북'; rb.addEventListener('click', () => { this.close(); this.openScreen('recipes'); });
      win.appendChild(rb);
      this.invGrid(win);
      this.updateCraftResult();
    } else if (this.open === 'chest') {
      title.textContent = '상자';
      const g = document.createElement('div'); g.className = 'grid g9';
      const C = this.container;
      for (let i = 0; i < 27; i++) {
        const s = this.makeSlot(); g.appendChild(s.el);
        this.slotHandlers(s.el, () => C.slots[i], v => C.slots[i] = v, { quick: () => { const it = C.slots[i]; if (it) C.slots[i] = this.mergeInto(P.inv, it, 0, 36); } });
        this.extraSlots.push([s, () => C.slots[i]]);
      }
      win.appendChild(g); this.invGrid(win);
    } else if (this.open === 'furnace') {
      title.textContent = '화로';
      const C = this.container;
      const row = document.createElement('div'); row.className = 'furnrow';
      const col = document.createElement('div'); col.className = 'fcol';
      const mk = (i, filter) => { const s = this.makeSlot(); this.slotHandlers(s.el, () => C.slots[i], v => C.slots[i] = v, { filter, quick: () => { const it = C.slots[i]; if (it) C.slots[i] = this.mergeInto(P.inv, it, 0, 36); } }); this.extraSlots.push([s, () => C.slots[i]]); return s; };
      const inp = mk(0), fuel = mk(1, id => !!ITEMS[id].fuel);
      this.flame = document.createElement('div'); this.flame.className = 'flame';
      col.append(inp.el, this.flame, fuel.el);
      this.prog = document.createElement('div'); this.prog.className = 'prog';
      const out = mk(2, () => false); out.el.classList.add('big');
      row.append(col, this.prog, out.el);
      const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '위: 구울 재료 · 아래: 연료(석탄, 나무, 용암 양동이…)';
      win.append(row, hint); this.invGrid(win);
    } else if (this.open === 'creative') {
      title.textContent = '크리에이티브 인벤토리';
      const bar = document.createElement('div'); bar.className = 'cbar';
      const search = document.createElement('input'); search.id = 'csearch'; search.placeholder = '블록·아이템 검색 (한글/영문)'; search.autocomplete = 'off';
      const tabs = document.createElement('div'); tabs.className = 'tabs';
      const cats = ['전체', ...Object.values(CAT)];
      this.cTab = this.cTab || '전체';
      cats.forEach(c => { const b = document.createElement('button'); b.textContent = c; b.setAttribute('aria-pressed', c === this.cTab ? 'true' : 'false'); b.addEventListener('click', () => { this.cTab = c; tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); fill(); }); tabs.appendChild(b); });
      bar.append(search, tabs); win.appendChild(bar);
      const grid = document.createElement('div'); grid.className = 'grid g9 cgrid'; win.appendChild(grid);
      const countEl = document.createElement('p'); countEl.className = 'hint';
      win.appendChild(countEl);
      const fill = () => {
        grid.innerHTML = '';
        const q = search.value.trim().toLowerCase();
        const list = Object.values(ITEMS).filter(it => (this.cTab === '전체' || it.cat === this.cTab) && (!q || it.ko.toLowerCase().includes(q) || it.name.includes(q)));
        for (const it of list) { const s = this.makeSlot(); grid.appendChild(s.el); this.drawSlot(s, { id: it.id, count: 1 }); this.slotHandlers(s.el, null, null, { creative: it.id }); }
        countEl.textContent = `${list.length}개 표시 · 클릭: 64개 집기 · 우클릭: 1개 · 커서의 아이템을 여기에 놓으면 삭제`;
      };
      grid.addEventListener('mousedown', e => { if (GAME.player.cursor && e.target === grid) { GAME.player.cursor = null; this.dirty = true; } });
      search.addEventListener('input', fill);
      fill();
      setTimeout(() => search.focus(), 30);
      const hot = document.createElement('div'); hot.className = 'grid g9 hot'; this.invSlots = [];
      for (let i = 0; i < 9; i++) this.addSlot(hot, i);
      const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = '핫바';
      win.append(lab, hot);
    } else if (this.open === 'recipes') {
      title.textContent = '레시피 북';
      const search = document.createElement('input'); search.id = 'rsearch'; search.placeholder = '결과 아이템 검색 (예: 곡괭이, 작업대, 횃불)'; search.autocomplete = 'off';
      const list = document.createElement('div'); list.className = 'rlist';
      win.append(search, list);
      const repr = key => { if (!key) return 0; if (key[0] === '#') { const m = { '#planks': 'oak_planks', '#log': 'oak_log', '#cobble': 'cobblestone', '#sand': 'sand', '#glass_any': 'glass' }; return IID[m[key]]; } return IID[key]; };
      const fill = () => {
        list.innerHTML = '';
        const q = search.value.trim().toLowerCase();
        let shown = 0;
        const all = RECIPES.map(r => ({ r, kind: 'craft' })).concat(Object.entries(SMELT).filter(([i, s]) => IID[i] && IID[s.out]).map(([i, s]) => ({ r: { list: [i], out: s.out, n: 1 }, kind: 'smelt' })));
        for (const { r, kind } of all) {
          const out = ITEMS[IID[r.out]]; if (!out) continue;
          if (q && !out.ko.toLowerCase().includes(q) && !out.name.includes(q)) continue;
          if (++shown > 150) break;
          const card = document.createElement('div'); card.className = 'rcard';
          const g = document.createElement('div'); g.className = 'grid g3 small';
          let cells;
          if (r.pattern) { cells = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { const ch = (r.pattern[y] || '')[x]; cells.push(ch && ch !== ' ' ? repr(r.key[ch]) : 0); } }
          else { cells = r.list.map(repr); while (cells.length < 9) cells.push(0); }
          for (const id of cells) { const s = this.makeSlot(); g.appendChild(s.el); if (id) this.drawSlot(s, { id, count: 1 }); }
          const o = this.makeSlot(); this.drawSlot(o, { id: out.id, count: r.n });
          const lab = document.createElement('span'); lab.className = 'rname'; lab.textContent = (kind === 'smelt' ? '🔥 화로: ' : r.list ? '모양 무관: ' : '') + out.ko;
          card.append(g, document.createTextNode('➜'), o.el, lab); list.appendChild(card);
        }
        if (!shown) list.textContent = '일치하는 레시피가 없습니다.';
      };
      search.addEventListener('input', fill); fill(); setTimeout(() => search.focus(), 30);
    }
    const close = document.createElement('button'); close.className = 'close'; close.textContent = '닫기 (E)'; close.addEventListener('click', () => this.close());
    win.appendChild(close);
    this.refreshScreen();
  },
  refreshScreen() {
    const P = GAME.player;
    if (this.invSlots) for (const [s, i] of this.invSlots) this.drawSlot(s, P.inv[i]);
    if (this.extraSlots) for (const [s, g] of this.extraSlots) this.drawSlot(s, g());
    if (this.outSlot) this.drawSlot(this.outSlot, this.result);
    if (this.open === 'furnace' && this.container) {
      const C = this.container;
      this.flame.style.setProperty('--f', C.burnMax ? C.burn / C.burnMax : 0);
      this.prog.style.setProperty('--f', C.cook / 200);
    }
  },
  updateCraftResult() {
    if (!this.craft) { this.result = null; return; }
    const n = this.craft.length === 9 ? 3 : 2;
    const grid = this.craft.map(s => s ? s.id : 0);
    const r = matchRecipe(grid, n);
    this.result = r && IID[r.out] !== undefined ? { id: IID[r.out], count: r.n } : null;
    if (this.result && ITEMS[this.result.id].dur) this.result.dur = ITEMS[this.result.id].dur;
    this.dirty = true;
  },
  takeOutput(shift) {
    const P = GAME.player;
    if (this.open === 'furnace') return;
    const res = this.result; if (!res) return;
    const consume = () => {
      for (let i = 0; i < this.craft.length; i++) { const s = this.craft[i]; if (!s) continue; s.count--; if (s.count <= 0) { this.craft[i] = null; } if (ITEMS[s.id].name === 'shears' && res.id === BID.carved_pumpkin) { this.craft[i] = s; s.count = 1; s.dur = (s.dur || 238) - 1; } if (ITEMS[s.id].name.endsWith('_bucket') && s.count <= 0) this.craft[i] = { id: IID.bucket, count: 1 }; }
    };
    if (shift) {
      let guard = 0;
      while (this.result && this.result.id === res.id && guard++ < 64) {
        const left = P.addItem(this.result.id, this.result.count, this.result.dur);
        if (left) { GAME.dropItem(P.pos.x, P.pos.y + 1, P.pos.z, this.result.id, left); }
        consume(); this.updateCraftResult();
      }
    } else {
      if (P.cursor && (P.cursor.id !== res.id || P.cursor.count + res.count > ITEMS[res.id].stack || res.dur !== undefined)) return;
      if (P.cursor) P.cursor.count += res.count; else P.cursor = { id: res.id, count: res.count, dur: res.dur };
      if (P.cursor.dur === undefined) delete P.cursor.dur;
      consume(); this.updateCraftResult();
    }
    GAME.sound('click');
    this.dirty = true;
  },
};

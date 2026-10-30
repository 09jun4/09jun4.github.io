// Player state: inventory, survival stats
'use strict';
class Player extends Entity {
  constructor() {
    super(0, 80, 0);
    this.w = 0.3; this.h = 1.8; this.eye = 1.62;
    this.inv = new Array(36).fill(null); this.sel = 0; this.cursor = null;
    this.mode = 'survival'; this.flying = false; this.sprinting = false; this.sneaking = false;
    this.food = 20; this.sat = 5; this.exh = 0; this.foodTimer = 0;
    this.level = 0; this.xp = 0; this.xpTotal = 0;
    this.air = 15; this.spawn = null; this.regen = 0; this.portalT = 0; this.portalCool = 0;
    this.hurtFlash = 0; this.lastHealth = 20; this.swing = 0; this.eating = 0; this.bowCharge = 0;
  }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.sneaking && !this.flying ? this.eye - 0.15 : this.eye), this.pos.z); }
  lookDir() { const cp = Math.cos(this.pitch); return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
  held() { return this.inv[this.sel]; }
  heldItem() { const s = this.inv[this.sel]; return s ? ITEMS[s.id] : null; }
  maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }
  addItem(id, count, dur) {
    if (!ITEMS[id]) return count;
    const max = this.maxStack(id);
    // merge into existing stacks (hotbar first)
    const order = [...Array(36).keys()];
    for (const i of order) { const s = this.inv[i]; if (s && s.id === id && s.count < max && s.dur === undefined && dur === undefined) { const n = Math.min(count, max - s.count); s.count += n; count -= n; if (!count) break; } }
    for (const i of order) { if (!count) break; if (!this.inv[i]) { const n = Math.min(count, max); this.inv[i] = { id, count: n }; if (dur !== undefined) this.inv[i].dur = dur; else if (ITEMS[id].dur) this.inv[i].dur = ITEMS[id].dur; count -= n; } }
    UI.dirty = true;
    return count;
  }
  countItem(id) { let n = 0; for (const s of this.inv) if (s && s.id === id) n += s.count; return n; }
  takeItem(id, n) { for (let i = 0; i < 36 && n > 0; i++) { const s = this.inv[i]; if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (!s.count) this.inv[i] = null; } } UI.dirty = true; }
  consumeHeld(n = 1) {
    if (this.mode === 'creative') return;
    const s = this.inv[this.sel]; if (!s) return;
    s.count -= n; if (s.count <= 0) this.inv[this.sel] = null; UI.dirty = true;
  }
  useDurability(n = 1) {
    if (this.mode === 'creative') return;
    const s = this.inv[this.sel]; if (!s || s.dur === undefined) return;
    s.dur -= n;
    if (s.dur <= 0) { this.inv[this.sel] = null; GAME.sound('break_tool'); }
    UI.dirty = true;
  }
  addXP(v) {
    this.xpTotal += v;
    let need = this.xpNeed();
    this.xp += v / need;
    while (this.xp >= 1) { this.xp -= 1; this.level++; need = this.xpNeed(); if (this.level % 5 === 0) GAME.sound('levelup'); }
    UI.hudDirty = true;
  }
  xpNeed() { const L = this.level; return L <= 15 ? 2 * L + 7 : L <= 30 ? 5 * L - 38 : 9 * L - 158; }
  exhaust(v) { if (this.mode !== 'survival') return; this.exh += v; }
  damage(amount, src) {
    if (this.dead || this.mode === 'creative' || this.mode === 'spectator') { if (src === 'void' && this.mode !== 'spectator') { this.health = 0; this.die(src); } return false; }
    if (this.invuln > 0) return false;
    if (amount <= 0) return false;
    this.health -= amount; this.hurtTime = 0.4; this.invuln = 0.5; this.hurtFlash = 1;
    this.exhaust(0.1);
    GAME.sound('hurt'); GAME.camShake = 0.25;
    if (this.health <= 0) { this.health = 0; this.die(src); }
    UI.hudDirty = true;
    return true;
  }
  knock(from, f) {
    const d = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z); if (d.lengthSq() < 1e-4) d.set(1, 0, 0); d.normalize();
    this.vel.x += d.x * f; this.vel.z += d.z * f; this.vel.y = Math.max(this.vel.y, 5);
  }
  die(src) {
    this.dead = true;
    GAME.onPlayerDeath(src);
  }
  tickSurvival() {
    // called at 20 tps
    if (this.mode !== 'survival' || this.dead) return;
    if (this.exh >= 4) { this.exh -= 4; if (this.sat > 0) this.sat = Math.max(0, this.sat - 1); else this.food = Math.max(0, this.food - 1); UI.hudDirty = true; }
    this.foodTimer++;
    if (this.food >= 20 && this.sat > 0 && this.health < 20) { if (this.foodTimer >= 10) { this.foodTimer = 0; this.health = Math.min(20, this.health + 1); this.exh += 6; UI.hudDirty = true; } }
    else if (this.food >= 18 && this.health < 20) { if (this.foodTimer >= 80) { this.foodTimer = 0; this.health = Math.min(20, this.health + 1); this.exh += 6; UI.hudDirty = true; } }
    else if (this.food <= 0) { if (this.foodTimer >= 80) { this.foodTimer = 0; if (this.health > 1) this.damage(1, 'starve'); } }
    else if (this.foodTimer > 80) this.foodTimer = 0;
    if (this.regen > 0) { this.regen--; if (this.regen % 25 === 0 && this.health < 20) { this.health = Math.min(20, this.health + 1); UI.hudDirty = true; } }
  }
}

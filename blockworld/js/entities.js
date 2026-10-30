// Entities: physics, mobs, items, projectiles, particles, dragon
'use strict';
const GRAV = 32;
function blockBox(id) {
  if (!id) return null;
  const b = BLOCKS[id];
  if (!b.solid || b.shape === 'cross' || b.shape === 'liquid' || b.shape === 'pane') return null;
  if (b.shape === 'box') return b.box;
  return [0, 0, 0, 1, 1, 1];
}
function collideBoxes(world, x0, y0, z0, x1, y1, z1) {
  const out = [];
  for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
    const bb = blockBox(world.getBlock(x, y, z));
    if (bb) out.push([x + bb[0], y + bb[1], z + bb[2], x + bb[3], y + bb[4], z + bb[5]]);
  }
  return out;
}
// move e (pos = feet centre) by d, resolving collisions; returns flags
function moveAABB(world, e, dx, dy, dz) {
  const w = e.w, h = e.h, p = e.pos;
  const boxes = collideBoxes(world, p.x - w + Math.min(0, dx) - 1, p.y + Math.min(0, dy) - 1, p.z - w + Math.min(0, dz) - 1, p.x + w + Math.max(0, dx) + 1, p.y + h + Math.max(0, dy) + 1, p.z + w + Math.max(0, dz) + 1);
  const ody = dy, odx = dx, odz = dz;
  let a = [p.x - w, p.y, p.z - w, p.x + w, p.y + h, p.z + w];
  for (const b of boxes) if (a[0] < b[3] && a[3] > b[0] && a[2] < b[5] && a[5] > b[2]) {
    if (dy > 0 && a[4] <= b[1]) dy = Math.min(dy, b[1] - a[4]); else if (dy < 0 && a[1] >= b[4]) dy = Math.max(dy, b[4] - a[1]);
  }
  a[1] += dy; a[4] += dy;
  for (const b of boxes) if (a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2]) {
    if (dx > 0 && a[3] <= b[0]) dx = Math.min(dx, b[0] - a[3]); else if (dx < 0 && a[0] >= b[3]) dx = Math.max(dx, b[3] - a[0]);
  }
  a[0] += dx; a[3] += dx;
  for (const b of boxes) if (a[1] < b[4] && a[4] > b[1] && a[0] < b[3] && a[3] > b[0]) {
    if (dz > 0 && a[5] <= b[2]) dz = Math.min(dz, b[2] - a[5]); else if (dz < 0 && a[2] >= b[5]) dz = Math.max(dz, b[5] - a[2]);
  }
  p.x += dx; p.y += dy; p.z += dz;
  return { hitX: dx !== odx, hitY: dy !== ody, hitZ: dz !== odz, ground: ody < 0 && dy !== ody };
}
function aabbFree(world, x, y, z, w, h) { return collideBoxes(world, x - w + 0.001, y + 0.001, z - w + 0.001, x + w - 0.001, y + h - 0.001, z + w - 0.001).length === 0; }

// ---------------- base entity ----------------
let ENT_ID = 1;
class Entity {
  constructor(x, y, z) {
    this.id = ENT_ID++;
    this.pos = new THREE.Vector3(x, y, z); this.vel = new THREE.Vector3();
    this.w = 0.3; this.h = 1.8; this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.inWater = false; this.inLava = false; this.fallDist = 0;
    this.health = 20; this.maxHealth = 20; this.dead = false; this.hurtTime = 0; this.fire = 0; this.age = 0;
    this.noGravity = false; this.mesh = null; this.removed = false; this.invuln = 0;
  }
  physics(dt, world) {
    const fx = Math.floor(this.pos.x), fz = Math.floor(this.pos.z);
    const feet = world.getBlock(fx, Math.floor(this.pos.y + 0.1), fz), mid = world.getBlock(fx, Math.floor(this.pos.y + this.h * 0.5), fz);
    this.inWater = LIQ[feet] === 1 || LIQ[mid] === 1;
    this.inLava = LIQ[feet] === 2 || LIQ[mid] === 2;
    const web = BLOCKS[feet] && BLOCKS[feet].web || BLOCKS[mid] && BLOCKS[mid].web;
    if (!this.noGravity) {
      if (this.inWater || this.inLava) { this.vel.y -= GRAV * 0.25 * dt; this.vel.y *= Math.pow(this.inLava ? 0.1 : 0.2, dt); }
      else this.vel.y -= GRAV * dt;
      if (this.vel.y < -60) this.vel.y = -60;
    }
    let mx = this.vel.x * dt, my = this.vel.y * dt, mz = this.vel.z * dt;
    if (web) { mx *= 0.25; my *= 0.05; mz *= 0.25; this.fallDist = 0; }
    const r = moveAABB(world, this, mx, my, mz);
    if (r.hitX) this.vel.x = 0;
    if (r.hitZ) this.vel.z = 0;
    const wasGround = this.onGround;
    this.onGround = r.ground;
    if (r.hitY) {
      if (r.ground) {
        const below = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z));
        if (below === BID.slime_block && this.vel.y < -4 && !this.sneaking) { this.vel.y = -this.vel.y * 0.8; this.fallDist = 0; }
        else this.vel.y = 0;
      } else this.vel.y = 0;
    }
    this.hitWall = r.hitX || r.hitZ;
    if (my < 0 && !this.onGround) this.fallDist -= my;
    if (this.onGround) {
      const below = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z));
      if (this.fallDist > 3 && !this.inWater && below !== BID.hay_block && below !== BID.slime_block) this.damage(Math.floor(this.fallDist - 3), 'fall');
      else if (this.fallDist > 3 && below === BID.hay_block) this.damage(Math.floor((this.fallDist - 3) * 0.2), 'fall');
      this.fallDist = 0;
    }
    if (this.inWater) this.fallDist = 0;
    if (this.inLava) { this.fire = Math.max(this.fire, 7); if (this.age % 10 === 0) this.damage(4, 'lava'); }
    if (this.inWater) this.fire = 0;
    return r;
  }
  damage(amount, src) { if (this.invuln > 0 || this.dead) return false; this.health -= amount; this.hurtTime = 0.4; this.invuln = 0.5; if (this.health <= 0) this.die(src); return true; }
  die() { this.dead = true; }
  remove() { this.removed = true; if (this.mesh) { GAME.scene.remove(this.mesh); disposeObj(this.mesh); } }
}
function disposeObj(o) { o.traverse(c => { if (c.geometry && !c.geometry.shared) c.geometry.dispose(); }); }

// ---------------- model helpers ----------------
const SkinCache = {};
function pixTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
function noiseFill(ctx, w, h, col, amt = 0.15, seed = 1) {
  const r = mulberry32(seed); const c = hex(col);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const f = 1 + (r() - 0.5) * 2 * amt; ctx.fillStyle = `rgb(${c[0] * f | 0},${c[1] * f | 0},${c[2] * f | 0})`; ctx.fillRect(x, y, 1, 1); }
}
function px(ctx, pts, col) { ctx.fillStyle = col; for (const [x, y, w = 1, h = 1] of pts) ctx.fillRect(x, y, w, h); }
// box with per-face materials; face order: +x,-x,+y,-y,+z(front),-z
// one draw call per box: faces share a 32x8 strip texture laid out as [side, front, top, back]
const BOX_TILE = [0, 0, 2, 0, 1, 3]; // three.js face order +x,-x,+y,-y,+z,-z
function stripTex(base, front, opts) {
  const key = [base, opts.amt || 0.12, opts.seed || 3, front ? front.uuid : '', opts.top ? opts.top.uuid : '', opts.back ? opts.back.uuid : ''].join();
  if (SkinCache[key]) return SkinCache[key];
  return SkinCache[key] = pixTex(32, 8, c => {
    noiseFill(c, 8, 8, base, opts.amt || 0.12, opts.seed || 3);
    [front, opts.top, opts.back].forEach((t, i) => { if (t) c.drawImage(t.image, 0, 0, t.image.width, t.image.height, (i + 1) * 8, 0, 8, 8); else c.drawImage(c.canvas, 0, 0, 8, 8, (i + 1) * 8, 0, 8, 8); });
  });
}
function mbox(w, h, d, base, front, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setX(i, (BOX_TILE[f] + uv.getX(i)) / 4); }
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: stripTex(base, front, opts), transparent: !!opts.transparent, opacity: opts.opacity || 1 }));
}
function pivot(mesh, px_, py, pz, ox, oy, oz) {
  const g = new THREE.Group(); g.position.set(px_, py, pz); mesh.position.set(ox, oy, oz); g.add(mesh); return g;
}
function faceTex(base, draw, seed = 5, w = 8, h = 8) { return pixTex(w, h, (c) => { noiseFill(c, w, h, base, 0.1, seed); draw(c); }); }

const MODELS = {
  humanoid(skin, shirt, pants, faceDraw, opts = {}) {
    const g = new THREE.Group();
    const s = opts.scale || 1, limbW = opts.thin ? 0.2 : 0.25;
    const headT = faceTex(skin, faceDraw);
    const head = pivot(mbox(0.5, 0.5, 0.5, opts.headBase || skin, headT, { top: opts.hairTop, back: opts.hairTop }), 0, 1.5 * s, 0, 0, 0.25, 0);
    const body = mbox(0.5, 0.75 * s, 0.25, shirt, null); body.position.y = 1.125 * s;
    const armL = pivot(mbox(limbW, 0.75 * s, limbW, opts.armColor || skin, null), 0.375, 1.45 * s, 0, 0, -0.3 * s, 0);
    const armR = pivot(mbox(limbW, 0.75 * s, limbW, opts.armColor || skin, null), -0.375, 1.45 * s, 0, 0, -0.3 * s, 0);
    const legL = pivot(mbox(limbW, 0.75 * s, limbW, pants, null), 0.125, 0.75 * s, 0, 0, -0.375 * s, 0);
    const legR = pivot(mbox(limbW, 0.75 * s, limbW, pants, null), -0.125, 0.75 * s, 0, 0, -0.375 * s, 0);
    g.add(head, body, armL, armR, legL, legR);
    return { g, head, arms: [armL, armR], legs: [legL, legR], body };
  },
  quad(bodyDims, bodyCol, headDims, headCol, faceDraw, legH, legCol, opts = {}) {
    const g = new THREE.Group();
    const [bw, bh, bd] = bodyDims, [hw, hh, hd] = headDims;
    const body = mbox(bw, bh, bd, bodyCol, null, opts.bodyOpts); body.position.y = legH + bh / 2;
    const head = pivot(mbox(hw, hh, hd, headCol, faceTex(headCol, faceDraw, 7)), 0, legH + bh * 0.8, bd / 2, 0, 0, hd / 2 - 0.05);
    g.add(body, head);
    const legs = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const l = pivot(mbox(opts.legW || 0.25, legH, opts.legW || 0.25, legCol || bodyCol, null), sx * (bw / 2 - 0.15), legH, sz * (bd / 2 - 0.15), 0, -legH / 2, 0);
      g.add(l); legs.push(l);
    }
    return { g, head, legs, body };
  },
};
function buildModel(type) {
  let m;
  switch (type) {
    case 'pig': m = MODELS.quad([0.6, 0.5, 0.9], '#F0A0A0', [0.5, 0.5, 0.5], '#F0A0A0', c => { px(c, [[1, 3], [6, 3]], '#111'); px(c, [[0, 3], [7, 3]], '#fff'); px(c, [[2, 5, 4, 2]], '#E07A7A'); px(c, [[3, 6], [4, 6]], '#8A3A3A'); }, 0.35, '#E89090'); break;
    case 'cow': m = MODELS.quad([0.7, 0.65, 1.1], '#4A3020', [0.5, 0.5, 0.4], '#4A3020', c => { px(c, [[1, 2, 2, 1], [5, 2, 2, 1]], '#fff'); px(c, [[2, 2], [5, 2]], '#111'); px(c, [[2, 5, 4, 3]], '#C8A890'); px(c, [[3, 6], [4, 6]], '#333'); }, 0.6, '#3A2418', { bodyOpts: { seed: 9, amt: 0.3 } });
      { const hornL = mbox(0.08, 0.15, 0.08, '#E0D8C8', null); hornL.position.set(0.28, 0.25, 0.15); const hornR = hornL.clone(); hornR.position.x = -0.28; m.head.children[0].add(hornL, hornR); }
      { const patch = mbox(0.72, 0.3, 0.4, '#E8E8E8', null); patch.position.set(0, 0.95, 0.15); m.g.add(patch); } break;
    case 'sheep': m = MODELS.quad([0.7, 0.6, 1.0], '#E8E8E8', [0.4, 0.4, 0.45], '#D8C8B8', c => { px(c, [[1, 3], [6, 3]], '#111'); px(c, [[0, 3], [7, 3]], '#fff'); px(c, [[3, 5, 2, 2]], '#E0A0A0'); }, 0.55, '#D8C8B8', { bodyOpts: { amt: 0.06 } }); break;
    case 'chicken': {
      m = MODELS.quad([0.4, 0.4, 0.5], '#F4F4F4', [0.25, 0.4, 0.2], '#F4F4F4', c => { px(c, [[1, 2], [6, 2]], '#111'); }, 0.3, '#E8A030', { legW: 0.08 });
      m.legs[2].visible = m.legs[3].visible = false; m.legs[0].position.z = m.legs[1].position.z = 0;
      const beak = mbox(0.25, 0.1, 0.12, '#F0A020', null); beak.position.set(0, 0.03, 0.15); m.head.children[0].add(beak);
      const wat = mbox(0.1, 0.12, 0.06, '#D82020', null); wat.position.set(0, -0.1, 0.13); m.head.children[0].add(wat);
      m.head.position.y += 0.15; break;
    }
    case 'zombie': m = MODELS.humanoid('#5A8A3A', '#2A8A9A', '#3A3A8A', c => { px(c, [[1, 3, 2, 1], [5, 3, 2, 1]], '#1A2A10'); px(c, [[2, 6, 4, 1]], '#2A4A1A'); }, { hairTop: faceTex('#3A6A2A', () => { }) }); break;
    case 'skeleton': m = MODELS.humanoid('#C8C8C8', '#B8B8B8', '#B0B0B0', c => { px(c, [[1, 3, 2, 2], [5, 3, 2, 2]], '#222'); px(c, [[3, 5, 2, 1]], '#555'); px(c, [[1, 6, 6, 1]], '#666'); }, { thin: true }); {
      const bow = mbox(0.06, 0.8, 0.06, '#6A4A2A', null); bow.position.set(0, -0.6, 0.15); m.arms[1].add(bow); } break;
    case 'creeper': {
      const g = new THREE.Group();
      const ft = faceTex('#4AA03A', c => { px(c, [[1, 2, 2, 2], [5, 2, 2, 2], [3, 4, 2, 2], [2, 5, 1, 2], [5, 5, 1, 2]], '#111'); }, 11);
      const head = pivot(mbox(0.5, 0.5, 0.5, '#4AA03A', ft, { amt: 0.3, seed: 12 }), 0, 1.25, 0, 0, 0.25, 0);
      const body = mbox(0.5, 0.75, 0.25, '#4AA03A', null, { amt: 0.3, seed: 13 }); body.position.y = 0.375 + 0.5;
      g.add(head, body); const legs = [];
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = pivot(mbox(0.25, 0.4, 0.25, '#3A8A2A', null, { amt: 0.3 }), sx * 0.125, 0.4, sz * 0.2, 0, -0.2, 0); g.add(l); legs.push(l); }
      m = { g, head, legs, body }; break;
    }
    case 'enderman': {
      m = MODELS.humanoid('#161616', '#121212', '#141414', c => { px(c, [[0, 4, 3, 1], [5, 4, 3, 1]], '#E070FF'); px(c, [[1, 4], [6, 4]], '#FFB8FF'); }, { thin: true, scale: 1.6, armColor: '#141414' });
      for (const l of m.legs) l.children[0].scale.set(0.5, 1, 0.5); for (const a of m.arms) { a.children[0].scale.set(0.5, 1.15, 0.5); }
      m.head.position.y = 2.4; m.body.position.y = 1.85; m.body.scale.set(1, 0.85, 1);
      for (const a of m.arms) a.position.y = 2.3; break;
    }
    case 'ghast': {
      const g = new THREE.Group();
      const shut = faceTex('#F0F0F0', c => { px(c, [[1, 3, 2, 1], [5, 3, 2, 1], [3, 5, 2, 1]], '#888'); }, 21);
      const body = mbox(4, 4, 4, '#F0F0F0', shut, { amt: 0.05 }); body.position.y = 3;
      g.add(body); const legs = [];
      for (let i = 0; i < 9; i++) { const l = pivot(mbox(0.25, 2, 0.25, '#E8E8E8', null), (i % 3 - 1) * 1.2, 1, ((i / 3 | 0) - 1) * 1.2, 0, -1, 0); g.add(l); legs.push(l); }
      const openF = faceTex('#F0F0F0', c => { px(c, [[1, 2, 2, 2], [5, 2, 2, 2], [2, 5, 4, 2]], '#600'); px(c, [[1, 3], [6, 3]], '#F00'); }, 21);
      m = { g, legs, body, open: stripTex('#F0F0F0', openF, { amt: 0.05 }), shut: body.material.map }; break;
    }
    case 'blaze': {
      const g = new THREE.Group();
      const ft = faceTex('#F8D040', c => { px(c, [[1, 3, 2, 1], [5, 3, 2, 1]], '#3A1A00'); px(c, [[2, 6, 4, 1]], '#8A4A00'); }, 31);
      const head = pivot(mbox(0.5, 0.5, 0.5, '#F8D040', ft), 0, 1.5, 0, 0, 0.25, 0);
      g.add(head); const rods = [];
      for (let i = 0; i < 8; i++) { const r = mbox(0.12, 0.6, 0.12, '#F8A020', null); g.add(r); rods.push(r); }
      m = { g, head, rods, legs: [] }; break;
    }
    case 'player': m = MODELS.humanoid('#C89A78', '#3AAAB8', '#3A4A9A', c => { px(c, [[0, 0, 8, 2]], '#4A2E1A'); px(c, [[1, 4], [6, 4]], '#FFFFFF'); px(c, [[2, 4], [5, 4]], '#3A3A9A'); px(c, [[3, 6, 2, 1]], '#7A4A3A'); }, { hairTop: faceTex('#4A2E1A', () => { }) }); break;
  }
  m.mats = [];
  m.g.traverse(o => { if (o.material) for (const mm of [].concat(o.material)) m.mats.push(mm); });
  return m;
}

// ---------------- mobs ----------------
const MOBDEF = {
  pig: { hp: 10, w: 0.45, h: 0.9, speed: 2.2, passive: true, drops: [['porkchop', 1, 3]], xp: [1, 3], sound: 'pig' },
  cow: { hp: 10, w: 0.45, h: 1.4, speed: 2.0, passive: true, drops: [['beef', 1, 3], ['leather', 0, 2]], xp: [1, 3], sound: 'cow' },
  sheep: { hp: 8, w: 0.45, h: 1.3, speed: 2.1, passive: true, drops: [['white_wool', 1, 1], ['mutton', 1, 2]], xp: [1, 3], sound: 'sheep' },
  chicken: { hp: 4, w: 0.2, h: 0.7, speed: 2.0, passive: true, drops: [['chicken', 1, 1], ['feather', 0, 2]], xp: [1, 3], sound: 'chicken' },
  zombie: { hp: 20, w: 0.3, h: 1.95, speed: 2.6, hostile: true, dmg: 3, drops: [['rotten_flesh', 0, 2], ['iron_ingot', 0, 0.03], ['carrot', 0, 0.03], ['potato', 0, 0.03]], xp: [5, 5], sound: 'zombie', burns: true },
  skeleton: { hp: 20, w: 0.3, h: 1.99, speed: 2.6, hostile: true, ranged: true, drops: [['bone', 0, 2], ['arrow', 0, 2]], xp: [5, 5], sound: 'skeleton', burns: true },
  creeper: { hp: 20, w: 0.3, h: 1.7, speed: 2.4, hostile: true, drops: [['gunpowder', 0, 2]], xp: [5, 5], sound: null },
  enderman: { hp: 40, w: 0.3, h: 2.9, speed: 3.0, neutral: true, dmg: 7, drops: [['ender_pearl', 0, 1]], xp: [5, 5], sound: 'enderman' },
  ghast: { hp: 10, w: 2, h: 4, speed: 2.5, hostile: true, flying: true, drops: [['ghast_tear', 0, 1], ['gunpowder', 0, 2]], xp: [5, 5], sound: 'ghast' },
  blaze: { hp: 20, w: 0.3, h: 1.8, speed: 2.3, hostile: true, flying: true, drops: [['blaze_rod', 0, 1]], xp: [10, 10], sound: 'blaze', fireproof: true },
};
const MOB_KO = { pig: '돼지', cow: '소', sheep: '양', chicken: '닭', zombie: '좀비', skeleton: '스켈레톤', creeper: '크리퍼', enderman: '엔더맨', ghast: '가스트', blaze: '블레이즈' };

class Mob extends Entity {
  constructor(type, x, y, z) {
    super(x, y, z);
    this.type = type; const d = this.def = MOBDEF[type];
    this.health = this.maxHealth = d.hp; this.w = d.w; this.h = d.h;
    this.model = buildModel(type); this.mesh = this.model.g;
    GAME.scene.add(this.mesh);
    this.walk = 0; this.wanderT = 0; this.wdir = 0; this.moving = false; this.cool = 0; this.fuse = 0; this.angry = false; this.soundT = 3 + Math.random() * 8;
    this.yaw = Math.random() * Math.PI * 2; this.panic = 0; this.deathT = 0; this.headYaw = 0;
    if (d.flying) this.noGravity = true;
    this.sheared = false;
  }
  canSee(t) {
    if (this.seeT > this.age) return this.seeV;
    this.seeT = this.age + 15; return this.seeV = this.rayClear(t);
  }
  rayClear(t) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + this.h * 0.85, this.pos.z), to = new THREE.Vector3(t.pos.x, t.pos.y + 1.5, t.pos.z);
    const dir = to.clone().sub(from); const len = dir.length(); dir.normalize();
    for (let s = 0.5; s < len; s += 0.5) { const p = from.clone().addScaledVector(dir, s); const id = GAME.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)); if (FULL[id]) return false; }
    return true;
  }
  update(dt) {
    this.age++;
    const world = GAME.world, P = GAME.player;
    if (this.age % 2 && !this.dead && this.pos.distanceToSquared(P.pos) > 48 * 48) { this.animate(dt); return; }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.dead) {
      this.deathT += dt; this.mesh.rotation.z = Math.min(Math.PI / 2, this.deathT * 4);
      if (this.deathT > 0.8) { GAME.particles.puff(this.pos.x, this.pos.y + this.h / 2, this.pos.z, 12); this.remove(); }
      this.applyLight(); return;
    }
    const d = this.def;
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dy = P.pos.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
    if (dist > 110 && !this.persistent) { this.remove(); return; }
    let mvx = 0, mvz = 0, speed = d.speed;
    const pAlive = !P.dead && P.mode !== 'creative' && P.mode !== 'spectator';
    this.soundT -= dt;
    if (this.soundT < 0) { this.soundT = 5 + Math.random() * 10; if (d.sound) GAME.sound(d.sound, this.pos); }
    // sunburn
    if (d.burns && world.dim === 'overworld' && GAME.daylight > 0.7 && !this.inWater) {
      const L = world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.6), Math.floor(this.pos.z));
      if ((L >> 4) >= 15) this.fire = Math.max(this.fire, 2);
    }
    if (this.fire > 0) { this.fire -= dt; if (!d.fireproof && this.age % 20 === 0) this.damage(1, 'fire'); if (Math.random() < 0.3) GAME.particles.flame(this.pos.x + (Math.random() - 0.5) * this.w * 2, this.pos.y + Math.random() * this.h, this.pos.z + (Math.random() - 0.5) * this.w * 2); }
    const hostileActive = (d.hostile || (d.neutral && this.angry)) && pAlive;
    if (d.passive) {
      if (this.panic > 0) { this.panic -= dt; speed *= 2; if (this.wanderT <= 0) { this.wdir = Math.random() * Math.PI * 2; this.wanderT = 1; } }
      this.wander(dt);
      mvx = this.moving ? Math.sin(this.wdir) : 0; mvz = this.moving ? Math.cos(this.wdir) : 0;
      // follow wheat
      const held = P.held();
      if (held && ITEMS[held.id] && ITEMS[held.id].name === 'wheat' && dist < 8 && (this.type === 'cow' || this.type === 'sheep')) { mvx = dx / dist; mvz = dz / dist; if (dist < 2) mvx = mvz = 0; }
    } else if (this.type === 'ghast' || this.type === 'blaze') {
      this.flyAI(dt, dist, dx, dy, dz, hostileActive);
      this.physicsFly(dt);
      this.animate(dt); this.applyLight(); return;
    } else if (hostileActive && dist < (this.type === 'enderman' ? 64 : 32)) {
      const dh = Math.sqrt(dx * dx + dz * dz) || 1;
      mvx = dx / dh; mvz = dz / dh;
      this.yaw = Math.atan2(dx, dz);
      this.cool -= dt;
      if (this.type === 'zombie' || this.type === 'enderman') {
        if (this.type === 'enderman') speed = 6.5;
        if (dist < 1.6 && Math.abs(dy) < 1.8 && this.cool <= 0) { P.damage(d.dmg, this); P.knock(this.pos, 6); this.cool = 1; }
        if (this.type === 'enderman' && dist > 12 && Math.random() < 0.01) this.teleportNear(P.pos, 4);
      } else if (this.type === 'skeleton') {
        const see = this.canSee(P);
        if (dist < 9 && see) { mvx = -mvx * 0.4; mvz = -mvz * 0.4; const s = Math.sin(this.age * 0.03); mvx += Math.cos(this.yaw) * s * 0.5; mvz -= Math.sin(this.yaw) * s * 0.5; }
        if (see && dist < 16 && this.cool <= 0) { this.shootArrow(P); this.cool = 2; }
      } else if (this.type === 'creeper') {
        if (dist < 3 && this.canSee(P)) { if (this.fuse === 0) GAME.sound('fuse', this.pos); this.fuse += dt; mvx = mvz = 0; }
        else if (this.fuse > 0) { this.fuse = Math.max(0, this.fuse - dt * 2); }
        if (this.fuse >= 1.5) { GAME.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 3, false, true); this.health = 0; this.dead = true; this.remove(); return; }
      }
      this.moving = true;
    } else {
      if (this.type === 'creeper') this.fuse = Math.max(0, this.fuse - dt);
      this.wander(dt);
      mvx = this.moving ? Math.sin(this.wdir) : 0; mvz = this.moving ? Math.cos(this.wdir) * 1 : 0;
      speed *= 0.5;
      if (this.type === 'enderman' && pAlive && dist < 48 && !this.angry && this.age % 4 === 0) this.checkStare(P);
      if (this.type === 'enderman' && this.inWater) this.teleportNear(this.pos, 16);
    }
    if (this.type === 'enderman' && this.angry && !pAlive) this.angry = false;
    // avoid lava/cliffs
    if (mvx || mvz) {
      const ax = Math.floor(this.pos.x + mvx * 0.8), az = Math.floor(this.pos.z + mvz * 0.8), ay = Math.floor(this.pos.y);
      const ahead = world.getBlock(ax, ay, az), aheadB = world.getBlock(ax, ay - 1, az), aheadBB = world.getBlock(ax, ay - 2, az);
      if (LIQ[ahead] === 2 || LIQ[aheadB] === 2 || (!hostileActive && !blockBox(aheadB) && !blockBox(aheadBB) && !LIQ[aheadB])) { mvx = mvz = 0; this.wanderT = 0; }
      this.yaw = Math.atan2(mvx, mvz);
    }
    const accel = this.onGround ? 12 : 3;
    this.vel.x += (mvx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (mvz * speed - this.vel.z) * Math.min(1, accel * dt);
    if (this.inWater) { this.vel.y += GRAV * 0.35 * dt; if (this.vel.y > 2) this.vel.y = 2; }
    const r = this.physics(dt, world);
    if (this.hitWall && this.onGround && (mvx || mvz)) this.vel.y = 9;
    this.walk += Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z) * dt * 2.5;
    // contact damage blocks
    const fb = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
    if (BLOCKS[fb] && BLOCKS[fb].damage === 'fire') { this.fire = Math.max(this.fire, 4); }
    if (this.pos.y < -30) { this.remove(); return; }
    this.animate(dt); this.applyLight();
  }
  wander(dt) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.moving = Math.random() < 0.55; this.wdir = Math.random() * Math.PI * 2; this.wanderT = 2 + Math.random() * 5; }
  }
  checkStare(P) {
    const eye = P.eyePos(), dir = P.lookDir();
    const head = new THREE.Vector3(this.pos.x, this.pos.y + 2.6, this.pos.z);
    const to = head.clone().sub(eye); const len = to.length(); to.normalize();
    if (dir.dot(to) > 1 - 0.025 / Math.max(1, len / 10) && this.canSee(P)) { this.angry = true; GAME.sound('enderman', this.pos); GAME.toastMob = 1; }
  }
  teleportNear(c, r) {
    const world = GAME.world;
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(c.x + (Math.random() - 0.5) * r * 2) + 0.5, z = Math.floor(c.z + (Math.random() - 0.5) * r * 2) + 0.5;
      for (let y = Math.floor(c.y) + 6; y > Math.floor(c.y) - 8; y--) {
        if (blockBox(world.getBlock(Math.floor(x), y - 1, Math.floor(z))) && aabbFree(world, x, y, z, this.w, this.h) && !LIQ[world.getBlock(Math.floor(x), y, Math.floor(z))]) {
          GAME.particles.portal(this.pos.x, this.pos.y + 1.5, this.pos.z, 20);
          this.pos.set(x, y, z); GAME.sound('teleport', this.pos); GAME.particles.portal(x, y + 1.5, z, 20); return true;
        }
      }
    }
    return false;
  }
  flyAI(dt, dist, dx, dy, dz, active) {
    this.wanderT -= dt;
    if (!this.target || this.wanderT <= 0) {
      const p = this.type === 'blaze' && active ? GAME.player.pos : this.pos;
      this.target = new THREE.Vector3(p.x + (Math.random() - 0.5) * 24, Math.max(35, Math.min(110, p.y + (this.type === 'blaze' ? 2 : (Math.random() - 0.3) * 12))), p.z + (Math.random() - 0.5) * 24);
      this.wanderT = 3 + Math.random() * 4;
    }
    const t = this.target.clone().sub(this.pos); const tl = t.length();
    if (tl > 1) t.multiplyScalar(this.def.speed / tl); else t.set(0, 0, 0);
    this.vel.lerp(t, Math.min(1, dt * 1.5));
    this.cool -= dt;
    if (active && dist < 48) {
      this.yaw = Math.atan2(dx, dz);
      if (this.cool <= 0 && this.canSee(GAME.player)) {
        if (this.type === 'ghast') {
          this.model.body.material.map = this.model.open; this.openT = 0.6;
          GAME.sound('ghast', this.pos);
          setTimeout(() => { if (!this.removed) this.shootFireball(GAME.player, true); }, 500);
          this.cool = 3 + Math.random() * 2;
        } else { for (let i = 0; i < 3; i++) setTimeout(() => { if (!this.removed && !this.dead) this.shootFireball(GAME.player, false); }, i * 300); this.cool = 4; }
      }
    } else if (this.vel.lengthSq() > 0.01) this.yaw = Math.atan2(this.vel.x, this.vel.z);
    if (this.openT > 0) { this.openT -= dt; if (this.openT <= 0) this.model.body.material.map = this.model.shut; }
  }
  physicsFly(dt) {
    const r = moveAABB(GAME.world, this, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (r.hitX || r.hitY || r.hitZ) this.wanderT = 0;
    if (this.fire > 0 && !this.def.fireproof) this.fire -= dt;
  }
  shootArrow(t) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
    const to = new THREE.Vector3(t.pos.x, t.pos.y + 1.1, t.pos.z);
    const d = to.clone().sub(from); const hd = Math.sqrt(d.x * d.x + d.z * d.z);
    const v = 22; d.y += hd * 0.12 * (hd / 16); d.normalize().multiplyScalar(v);
    d.x += (Math.random() - 0.5) * 1.5; d.z += (Math.random() - 0.5) * 1.5;
    GAME.addEntity(new Arrow(from.x + d.x * 0.03, from.y, from.z + d.z * 0.03, d, this));
    GAME.sound('bow', this.pos);
  }
  shootFireball(t, big) {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + (big ? 3 : 1.4), this.pos.z);
    const d = new THREE.Vector3(t.pos.x, t.pos.y + 1, t.pos.z).sub(from).normalize();
    from.addScaledVector(d, big ? 2.6 : 0.6);
    GAME.addEntity(new Fireball(from.x, from.y, from.z, d.multiplyScalar(big ? 14 : 16), this, big));
    GAME.sound(big ? 'shoot' : 'blaze', this.pos);
  }
  animate(dt) {
    const m = this.model;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    let dy = this.yaw - this.mesh.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.mesh.rotation.y += dy * Math.min(1, dt * 8);
    const s = Math.sin(this.walk * 2) * Math.min(1, Math.sqrt(this.vel.x ** 2 + this.vel.z ** 2) / 2) * 0.7;
    if (m.legs) m.legs.forEach((l, i) => { if (this.type === 'ghast') l.rotation.x = Math.sin(this.age * 0.05 + i) * 0.3; else l.rotation.x = (i === 0 || i === 3) ? s : -s; });
    if (m.arms) {
      const zomb = this.type === 'zombie' || this.type === 'skeleton' || (this.type === 'enderman' && this.angry);
      m.arms[0].rotation.x = zomb ? -Math.PI / 2 + s * 0.2 : -s; m.arms[1].rotation.x = zomb ? -Math.PI / 2 - s * 0.2 : s;
    }
    if (m.rods) m.rods.forEach((r, i) => { const a = this.age * 0.06 + i / 4 * Math.PI * 2 * (i < 4 ? 1 : -1); const rad = i < 4 ? 0.6 : 0.45; r.position.set(Math.cos(a) * rad, i < 4 ? 1.1 : 0.5, Math.sin(a) * rad); });
    if (this.type === 'enderman' && this.angry && m.head) m.head.position.y = 2.4 + 0.1;
    if (this.type === 'creeper' && m.body) {
      const sc = 1 + this.fuse * 0.12; this.mesh.scale.set(sc, 1 + this.fuse * 0.05, sc);
    }
    if (this.type === 'sheep' && this.sheared) m.body.scale.set(0.8, 0.85, 0.9);
  }
  applyLight() {
    const c = GAME.lightAt(this.pos.x, this.pos.y + Math.min(1, this.h * 0.6), this.pos.z);
    let r = c.r, g = c.g, b = c.b;
    if (this.hurtTime > 0 || this.dead) { r = Math.min(1, r * 1.0 + 0.5); g *= 0.4; b *= 0.4; }
    if (this.type === 'creeper' && this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0) { r = g = b = 1.6; }
    if (this.fire > 0) { r = Math.min(1.4, r + 0.3); }
    if (r !== this.lr || g !== this.lg || b !== this.lb) { this.lr = r; this.lg = g; this.lb = b; for (const mm of this.model.mats) mm.color.setRGB(r, g, b); }
  }
  damage(amount, src) {
    if (this.dead) return false;
    if (this.invuln > 0) return false;
    if (this.def.fireproof && (src === 'fire' || src === 'lava')) return false;
    this.health -= amount; this.hurtTime = 0.35; this.invuln = 0.4;
    if (this.def.sound) GAME.sound(this.def.sound, this.pos);
    if (this.def.passive) { this.panic = 4; this.wanderT = 0; }
    if (this.def.neutral && src instanceof Entity) { this.angry = true; if (Math.random() < 0.6) this.teleportNear(this.pos, 8); }
    if (this.health <= 0) this.die(src);
    return true;
  }
  die(src) {
    this.dead = true; this.deathT = 0;
    const killedByPlayer = src === GAME.player || (src && src.owner === GAME.player) || src === 'player';
    for (const [name, a, b] of this.def.drops) {
      let n;
      if (b < 1) n = Math.random() < b ? 1 : 0; else n = a + Math.floor(Math.random() * (b - a + 1));
      let nm = name;
      if (this.fire > 0 && SMELT[name] && ITEMS[IID[SMELT[name].out]] && ITEMS[IID[SMELT[name].out]].food) nm = SMELT[name].out;
      if (this.type === 'sheep' && this.sheared && name === 'white_wool') continue;
      if (n > 0 && IID[nm]) GAME.dropItem(this.pos.x, this.pos.y + 0.5, this.pos.z, IID[nm], n);
    }
    if (killedByPlayer) GAME.dropXP(this.pos.x, this.pos.y + 0.5, this.pos.z, this.def.xp[0] + Math.floor(Math.random() * (this.def.xp[1] - this.def.xp[0] + 1)));
    GAME.stats.kills++;
  }
  knock(from, f) {
    const d = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    this.vel.x += d.x * f; this.vel.z += d.z * f; if (!this.def.flying) this.vel.y = Math.max(this.vel.y, 5);
  }
}

// ---------------- item entity ----------------
const ItemGeo = {};
function itemMesh(id) {
  const it = ITEMS[id];
  if (it.block) {
    const b = BLOCKS[it.block];
    if (b.shape !== 'cross') {
      if (!ItemGeo[id]) {
        const g = new THREE.BoxGeometry(1, 1, 1);
        const uv = g.attributes.uv;
        // three box face order: +x,-x,+y,-y,+z,-z ; 4 verts each
        const tiles = [b.faces.side, b.faces.side, b.faces.top, b.faces.bottom, b.facing ? b.faces.front : b.faces.side, b.faces.side];
        for (let f = 0; f < 6; f++) {
          const u = TEX.uv(tiles[f]);
          for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) ? u[2] : u[0], uv.getY(i) ? u[3] : u[1]); }
        }
        if (b.shape === 'box') { const bx = b.box; g.scale(bx[3] - bx[0], bx[4] - bx[1], bx[5] - bx[2]); }
        g.shared = true; ItemGeo[id] = g;
      }
      return new THREE.Mesh(ItemGeo[id], new THREE.MeshBasicMaterial({ map: TEX.texture, alphaTest: 0.5, transparent: b.render === 'trans' }));
    }
  }
  if (!ItemGeo[id]) {
    const tile = it.block ? BLOCKS[it.block].faces.side : it.tex;
    const g = new THREE.PlaneGeometry(1, 1); const u = TEX.uv(tile); const uv = g.attributes.uv;
    for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) ? u[2] : u[0], uv.getY(i) ? u[3] : u[1]);
    g.shared = true; ItemGeo[id] = g;
  }
  return new THREE.Mesh(ItemGeo[id], new THREE.MeshBasicMaterial({ map: TEX.texture, alphaTest: 0.5, side: THREE.DoubleSide }));
}
class ItemEntity extends Entity {
  constructor(x, y, z, id, count, dur) {
    super(x, y, z);
    this.itemId = id; this.count = count; this.dur = dur; this.w = 0.125; this.h = 0.25; this.pickDelay = 0.6; this.life = 300;
    const flat = !(ITEMS[id].block && BLOCKS[ITEMS[id].block].shape !== 'cross');
    this.mesh = new THREE.Group(); this.inner = itemMesh(id);
    this.inner.scale.setScalar(flat ? 0.45 : 0.25);
    this.mesh.add(this.inner);
    if (count > 1) { const m2 = this.inner.clone(); m2.position.set(0.08, 0.06, 0.05); this.mesh.add(m2); }
    GAME.scene.add(this.mesh);
    this.vel.set((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3);
    this.spin = Math.random() * 6;
  }
  update(dt) {
    this.age++; this.life -= dt; this.pickDelay -= dt;
    if (this.life <= 0) { this.remove(); return; }
    this.vel.x *= Math.pow(this.onGround ? 0.02 : 0.6, dt); this.vel.z *= Math.pow(this.onGround ? 0.02 : 0.6, dt);
    if (this.inWater) this.vel.y += GRAV * 0.3 * dt;
    if (this.inLava) { this.remove(); return; }
    this.physics(dt, GAME.world);
    const P = GAME.player;
    const dx = P.pos.x - this.pos.x, dy = (P.pos.y + 0.8) - this.pos.y, dz = P.pos.z - this.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (this.pickDelay <= 0 && !P.dead && d < 1.6 && P.mode !== 'spectator') {
      const left = P.addItem(this.itemId, this.count, this.dur);
      if (left < this.count) { GAME.sound('pop'); this.count = left; if (left === 0) { this.remove(); return; } }
    }
    this.spin += dt * 1.8;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.15 + Math.sin(this.age * 0.05) * 0.06, this.pos.z);
    this.mesh.rotation.y = this.spin;
    const c = GAME.lightAt(this.pos.x, this.pos.y + 0.2, this.pos.z);
    this.mesh.traverse(o => o.material && o.material.color.setRGB(c.r, c.g, c.b));
  }
  damage() { return false; }
}
class XPOrb extends Entity {
  constructor(x, y, z, val) {
    super(x, y, z); this.val = val; this.w = 0.12; this.h = 0.25; this.life = 300;
    this.mesh = new THREE.Mesh(XPOrb.geo || (XPOrb.geo = new THREE.BoxGeometry(0.18, 0.18, 0.18)), new THREE.MeshBasicMaterial({ color: 0xB8FF40 }));
    this.mesh.geometry.shared = true;
    GAME.scene.add(this.mesh);
    this.vel.set((Math.random() - 0.5) * 4, 4 + Math.random() * 2, (Math.random() - 0.5) * 4);
  }
  update(dt) {
    this.age++; this.life -= dt; if (this.life <= 0) { this.remove(); return; }
    const P = GAME.player;
    const t = new THREE.Vector3(P.pos.x, P.pos.y + 0.8, P.pos.z).sub(this.pos); const d = t.length();
    if (d < 7 && !P.dead) { t.normalize().multiplyScalar((1 - d / 7) * 40 * dt); this.vel.add(t); }
    this.vel.x *= Math.pow(0.3, dt); this.vel.z *= Math.pow(0.3, dt);
    this.physics(dt, GAME.world);
    if (d < 1.0 && !P.dead) { P.addXP(this.val); GAME.sound('xp'); this.remove(); return; }
    this.mesh.position.copy(this.pos); this.mesh.position.y += 0.15;
    const s = 0.8 + Math.sin(this.age * 0.2) * 0.25; this.mesh.scale.setScalar(s);
    this.mesh.material.color.setRGB(0.6 + Math.sin(this.age * 0.15) * 0.3, 1, 0.25);
  }
  damage() { return false; }
}

// ---------------- projectiles ----------------
class Projectile extends Entity {
  constructor(x, y, z, vel, owner) { super(x, y, z); this.vel.copy(vel); this.owner = owner; this.w = 0.1; this.h = 0.1; this.grav = 20; this.stuck = false; this.life = 60; }
  step(dt) {
    if (this.stuck) return null;
    this.vel.y -= this.grav * dt;
    const steps = Math.ceil(this.vel.length() * dt / 0.2) || 1;
    const sd = this.vel.clone().multiplyScalar(dt / steps);
    for (let i = 0; i < steps; i++) {
      this.pos.add(sd);
      const id = GAME.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
      const bb = blockBox(id);
      if (bb) { const fx = this.pos.x - Math.floor(this.pos.x), fy = this.pos.y - Math.floor(this.pos.y), fz = this.pos.z - Math.floor(this.pos.z); if (fx >= bb[0] && fx <= bb[3] && fy >= bb[1] && fy <= bb[4] && fz >= bb[2] && fz <= bb[5]) { this.pos.sub(sd); return { block: id }; } }
      if (LIQ[id] === 1) this.vel.multiplyScalar(0.8);
      for (const e of GAME.targets) {
        if (e === this.owner || e.dead || e.removed || (this.age < 3 && e === this.owner)) continue;
        if (e.hitTest ? e.hitTest(this.pos, 0.15) : (this.pos.x > e.pos.x - e.w - 0.1 && this.pos.x < e.pos.x + e.w + 0.1 && this.pos.z > e.pos.z - e.w - 0.1 && this.pos.z < e.pos.z + e.w + 0.1 && this.pos.y > e.pos.y && this.pos.y < e.pos.y + e.h)) return { ent: e };
      }
    }
    return null;
  }
}
class Arrow extends Projectile {
  constructor(x, y, z, vel, owner, power = 1) {
    super(x, y, z, vel, owner); this.power = power;
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), new THREE.MeshBasicMaterial({ color: 0x8A6A3A }));
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.1), new THREE.MeshBasicMaterial({ color: 0x9A9A9A })); tip.position.z = 0.32;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.15), new THREE.MeshBasicMaterial({ color: 0xEEEEEE })); fl.position.z = -0.26;
    g.add(shaft, tip, fl); this.mesh = g; GAME.scene.add(g);
  }
  update(dt) {
    this.age++; this.life -= dt; if (this.life <= 0) { this.remove(); return; }
    const hit = this.step(dt);
    if (hit && hit.ent) {
      const dmg = Math.ceil(this.vel.length() * 0.35 * this.power);
      if (hit.ent.damage(dmg, this.owner || this)) { if (hit.ent.knock) hit.ent.knock(this.pos.clone().sub(this.vel.clone().normalize()), 4); }
      GAME.sound('arrowhit', this.pos); this.remove(); return;
    }
    if (hit && hit.block) { this.stuck = true; this.life = Math.min(this.life, 30); GAME.sound('arrowhit', this.pos); if (hit.block === BID.tnt) GAME.primeTNT(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z)); }
    if (this.stuck && this.owner === GAME.player && GAME.player.pos.distanceTo(this.pos) < 1.6 && GAME.player.mode === 'survival') { GAME.player.addItem(IID.arrow, 1); GAME.sound('pop'); this.remove(); return; }
    this.mesh.position.copy(this.pos);
    if (!this.stuck) this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
  }
  damage() { return false; }
}
class Fireball extends Projectile {
  constructor(x, y, z, vel, owner, big) {
    super(x, y, z, vel, owner); this.big = big; this.grav = 0; this.life = 10;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(big ? 1 : 0.35, big ? 1 : 0.35, big ? 1 : 0.35), new THREE.MeshBasicMaterial({ color: 0xFF8A20 }));
    GAME.scene.add(this.mesh); this.w = big ? 0.5 : 0.2; this.h = this.w * 2; this.health = 1;
  }
  update(dt) {
    this.age++; this.life -= dt; if (this.life <= 0) { this.remove(); return; }
    const hit = this.step(dt);
    if (Math.random() < 0.6) GAME.particles.smoke(this.pos.x, this.pos.y, this.pos.z, 1);
    if (hit) {
      if (this.big) GAME.explode(this.pos.x, this.pos.y, this.pos.z, 1.5, true, true);
      else if (hit.ent) { hit.ent.damage(5, this.owner); hit.ent.fire = Math.max(hit.ent.fire || 0, 5); }
      else if (hit.block) { const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y), z = Math.floor(this.pos.z); if (GAME.world.getBlock(x, y + 1, z) === 0) GAME.world.setBlock(x, y + 1, z, BID.fire); }
      this.remove(); return;
    }
    this.mesh.position.copy(this.pos); this.mesh.rotation.x += dt * 4; this.mesh.rotation.y += dt * 3;
  }
  damage(a, src) { // deflect
    if (src === GAME.player) { this.vel.copy(GAME.player.lookDir().multiplyScalar(this.vel.length() * 1.2)); this.owner = GAME.player; return true; }
    return false;
  }
}
class Thrown extends Projectile {
  constructor(x, y, z, vel, owner, kind) {
    super(x, y, z, vel, owner); this.kind = kind; this.grav = kind === 'eye' ? 0 : 20;
    this.mesh = itemMesh(IID[kind === 'pearl' ? 'ender_pearl' : kind === 'eye' ? 'eye_of_ender' : 'snowball']); this.mesh.scale.setScalar(0.4); GAME.scene.add(this.mesh);
    if (kind === 'eye') { this.life = 2.2; }
  }
  update(dt) {
    this.age++; this.life -= dt;
    if (this.kind === 'eye') {
      this.pos.addScaledVector(this.vel, dt); this.vel.y = Math.max(-1, this.vel.y - dt * 4);
      GAME.particles.portal(this.pos.x, this.pos.y, this.pos.z, 1);
      if (this.life <= 0) { if (Math.random() < 0.8) GAME.dropItem(this.pos.x, this.pos.y, this.pos.z, IID.eye_of_ender, 1); else GAME.sound('crystal', this.pos); this.remove(); return; }
    } else {
      const hit = this.step(dt);
      if (hit || this.life <= 0) {
        if (this.kind === 'pearl' && this.owner === GAME.player && !GAME.player.dead) { GAME.particles.portal(this.pos.x, this.pos.y, this.pos.z, 30); GAME.player.pos.set(this.pos.x, Math.floor(this.pos.y + 0.5), this.pos.z); GAME.player.vel.set(0, 0, 0); GAME.player.fallDist = 0; GAME.player.damage(5, 'pearl'); GAME.sound('teleport'); }
        if (this.kind === 'snowball') { if (hit && hit.ent) { hit.ent.damage(hit.ent.type === 'blaze' ? 3 : 0, this.owner); if (hit.ent.knock) hit.ent.knock(this.pos, 3); } GAME.particles.burst(this.pos.x, this.pos.y, this.pos.z, BLOCKS[BID.snow_block].faces.side, 6); }
        this.remove(); return;
      }
    }
    this.mesh.position.copy(this.pos); this.mesh.lookAt(GAME.camera.position);
  }
  damage() { return false; }
}
class FallingBlock extends Entity {
  constructor(x, y, z, id) {
    super(x + 0.5, y, z + 0.5); this.block = id; this.w = 0.49; this.h = 0.98;
    this.mesh = itemMesh(id); GAME.scene.add(this.mesh);
  }
  update(dt) {
    this.age++;
    this.physics(dt, GAME.world);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
    const c = GAME.lightAt(this.pos.x, this.pos.y + 0.5, this.pos.z); this.mesh.material.color.setRGB(c.r, c.g, c.b);
    const P = GAME.player;
    if (Math.abs(P.pos.x - this.pos.x) < 0.8 && Math.abs(P.pos.z - this.pos.z) < 0.8 && this.pos.y > P.pos.y && this.pos.y < P.pos.y + 1.8 && this.block === BID.anvil) P.damage(6, 'anvil');
    if (this.onGround || this.age > 600) {
      const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y + 0.5), z = Math.floor(this.pos.z);
      const cur = GAME.world.getBlock(x, y, z);
      if (GAME.world.isReplaceable(cur) || LIQ[cur]) { GAME.world.setBlock(x, y, z, this.block); GAME.sound('block_place', { x, y, z }, this.block); }
      else GAME.dropItem(this.pos.x, this.pos.y + 0.5, this.pos.z, this.block, 1);
      this.remove();
    }
  }
  damage() { return false; }
}
class PrimedTNT extends Entity {
  constructor(x, y, z, fuse = 4) {
    super(x + 0.5, y, z + 0.5); this.w = 0.49; this.h = 0.98; this.fuse = fuse;
    this.mesh = itemMesh(BID.tnt); GAME.scene.add(this.mesh); this.vel.set((Math.random() - 0.5) * 1, 4, (Math.random() - 0.5) * 1);
    GAME.sound('fuse', this.pos);
  }
  update(dt) {
    this.age++; this.fuse -= dt;
    this.vel.x *= 0.95; this.vel.z *= 0.95;
    this.physics(dt, GAME.world);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
    const flash = Math.floor(this.fuse * 4) % 2 === 0;
    const c = GAME.lightAt(this.pos.x, this.pos.y + 0.5, this.pos.z);
    this.mesh.material.color.setRGB(flash ? 2 : c.r, flash ? 2 : c.g, flash ? 2 : c.b);
    const s = this.fuse < 0.5 ? 1 + (0.5 - this.fuse) * 0.4 : 1; this.mesh.scale.setScalar(s);
    if (Math.random() < 0.5) GAME.particles.smoke(this.pos.x, this.pos.y + 1.1, this.pos.z, 1);
    if (this.fuse <= 0) { this.remove(); GAME.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 4, false, true); }
  }
  damage() { return false; }
}

// ---------------- end crystal & dragon ----------------
class EndCrystal extends Entity {
  constructor(x, y, z) {
    super(x, y, z); this.w = 1; this.h = 2; this.noGravity = true; this.persistent = true; this.health = 1;
    const g = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0xD8B8FF, transparent: true, opacity: 0.35, wireframe: false }));
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshBasicMaterial({ color: 0xFF5ADC }));
    g.add(outer, inner); this.outer = outer; this.inner = inner;
    this.mesh = g; GAME.scene.add(g);
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1), new THREE.MeshBasicMaterial({ color: 0xFFB0F0, transparent: true, opacity: 0.7 }));
    this.beam.visible = false; GAME.scene.add(this.beam);
  }
  update(dt) {
    this.age++;
    this.mesh.position.set(this.pos.x, this.pos.y + 1 + Math.sin(this.age * 0.05) * 0.3, this.pos.z);
    this.outer.rotation.x += dt; this.outer.rotation.y += dt * 1.3; this.inner.rotation.y -= dt * 2; this.inner.rotation.z += dt;
    const dr = GAME.dragon;
    if (dr && !dr.dead && dr.pos.distanceTo(this.pos) < 40) {
      this.beam.visible = true;
      const a = this.mesh.position, b = dr.pos;
      this.beam.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      this.beam.scale.z = a.distanceTo(b); this.beam.lookAt(b);
      if (this.age % 10 === 0 && dr.health < dr.maxHealth) dr.health = Math.min(dr.maxHealth, dr.health + 1);
      dr.healer = this;
    } else this.beam.visible = false;
  }
  hitTest(p, r) { return Math.abs(p.x - this.pos.x) < 0.8 + r && Math.abs(p.z - this.pos.z) < 0.8 + r && p.y > this.pos.y && p.y < this.pos.y + 2.2; }
  damage(a, src) {
    if (this.dead) return false;
    this.dead = true; GAME.scene.remove(this.beam);
    if (GAME.dragon && GAME.dragon.healer === this) GAME.dragon.damage(10, 'crystal', true);
    this.remove();
    GAME.explode(this.pos.x, this.pos.y + 1, this.pos.z, 4, true, true);
    return true;
  }
  remove() { super.remove(); GAME.scene.remove(this.beam); }
}
class Dragon extends Entity {
  constructor(x, y, z) {
    super(x, y, z); this.noGravity = true; this.persistent = true;
    this.health = this.maxHealth = 200; this.w = 3; this.h = 3;
    this.phase = 'circle'; this.phaseT = 0; this.angle = 0; this.target = new THREE.Vector3(40, 75, 0);
    this.speed = 16; this.heading = new THREE.Vector3(1, 0, 0);
    this.trail = [];
    const dark = '#161616', mid = '#2A2A2E';
    const g = new THREE.Group();
    this.bodyM = mbox(3, 2.4, 7, dark, null, { amt: 0.2 }); g.add(this.bodyM);
    for (let i = 0; i < 4; i++) { const sp = mbox(0.3, 0.6, 0.6, '#5A5A5A', null); sp.position.set(0, 1.4, -2.5 + i * 1.6); g.add(sp); }
    const eye = pixTex(8, 8, c => { noiseFill(c, 8, 8, dark, 0.2, 51); px(c, [[0, 3, 3, 1], [5, 3, 3, 1]], '#E070FF'); px(c, [[2, 6, 4, 1]], '#3A3A3A'); });
    this.headM = mbox(2, 1.6, 3, dark, eye, { amt: 0.2 }); this.headG = new THREE.Group(); this.headG.add(this.headM); this.headM.position.z = 1.5;
    const jaw = mbox(1.8, 0.5, 2.6, mid, null); jaw.position.set(0, -0.95, 1.4); this.headG.add(jaw); this.jaw = jaw;
    for (const sx of [-0.6, 0.6]) { const horn = mbox(0.25, 0.25, 1.2, '#D8D0C0', null); horn.position.set(sx, 1, -0.3); this.headG.add(horn); }
    this.neck = []; this.tail = [];
    for (let i = 0; i < 5; i++) { const n = mbox(1.3, 1.3, 1.3, dark, null); this.neck.push(n); }
    for (let i = 0; i < 12; i++) { const s = 1.2 - i * 0.06; const t = mbox(s, s, s, dark, null); this.tail.push(t); }
    this.wings = [];
    for (const side of [1, -1]) {
      const wg = new THREE.Group(); wg.position.set(side * 1.4, 0.8, 0.5);
      const w1 = mbox(5, 0.2, 4, mid, null, { amt: 0.3 }); w1.position.x = side * 2.5; wg.add(w1);
      const w2g = new THREE.Group(); w2g.position.x = side * 5; const w2 = mbox(5, 0.15, 3.5, '#202024', null, { amt: 0.3 }); w2.position.x = side * 2.5; w2g.add(w2); wg.add(w2g);
      wg.userData.tip = w2g; g.add(wg); this.wings.push(wg);
    }
    this.mesh = new THREE.Group(); this.mesh.add(g); this.bodyG = g;
    GAME.scene.add(this.mesh); GAME.scene.add(this.headG);
    for (const n of this.neck) GAME.scene.add(n); for (const t of this.tail) GAME.scene.add(t);
    this.mats = []; [this.mesh, this.headG, ...this.neck, ...this.tail].forEach(o => o.traverse(c => { if (c.material) for (const m of [].concat(c.material)) this.mats.push(m); }));
    this.deathT = 0; this.flap = 0; this.contactCool = 0;
  }
  hitTest(p, r) {
    if (this.headPos && p.distanceTo(this.headPos) < 1.8 + r) { this.lastHitHead = true; return true; }
    const local = p.clone().sub(this.pos);
    if (Math.abs(local.y) < 1.5 + r && Math.sqrt(local.x * local.x + local.z * local.z) < 3.8 + r) { this.lastHitHead = false; return true; }
    return false;
  }
  update(dt) {
    this.age++; this.phaseT += dt;
    if (this.invuln > 0) this.invuln -= dt; if (this.hurtTime > 0) this.hurtTime -= dt;
    const P = GAME.player;
    if (this.dead) {
      this.deathT += dt; this.pos.y += dt * 2; this.mesh.rotation.y += dt * 0.5;
      if (this.age % 4 === 0) GAME.particles.puff(this.pos.x + (Math.random() - 0.5) * 6, this.pos.y + (Math.random() - 0.5) * 4, this.pos.z + (Math.random() - 0.5) * 6, 4, 0xFFE0FF);
      if (this.age % 6 === 0) GAME.dropXP(this.pos.x, this.pos.y, this.pos.z, 60);
      if (this.deathT > 6) { GAME.onDragonDeath(); this.remove(); }
      this.place(dt); return;
    }
    const center = new THREE.Vector3(0, 70, 0);
    if (this.phase === 'circle') {
      if (this.pos.distanceTo(this.target) < 8) {
        this.angle += 0.6 + Math.random() * 0.4;
        const r = 35 + Math.random() * 25;
        this.target.set(Math.cos(this.angle) * r, 68 + Math.random() * 20, Math.sin(this.angle) * r);
      }
      if (this.phaseT > 12 + Math.random() * 10 && !P.dead && P.mode !== 'creative') { this.phase = 'charge'; this.phaseT = 0; GAME.sound('dragon', this.pos); }
    } else if (this.phase === 'charge') {
      this.target.set(P.pos.x, P.pos.y + 1, P.pos.z);
      if (this.phaseT > 7 || this.pos.distanceTo(this.target) < 3) { this.phase = 'circle'; this.phaseT = 0; this.target.set(Math.cos(this.angle) * 45, 80, Math.sin(this.angle) * 45); }
    }
    const want = this.target.clone().sub(this.pos).normalize();
    this.heading.lerp(want, Math.min(1, dt * (this.phase === 'charge' ? 1.8 : 1.1))).normalize();
    const sp = this.phase === 'charge' ? 22 : this.speed;
    this.pos.addScaledVector(this.heading, sp * dt);
    if (this.pos.y < 40) this.pos.y = 40;
    // flapping sound
    this.flap += dt * 4;
    if (Math.floor(this.flap / Math.PI) !== Math.floor((this.flap - dt * 4) / Math.PI) && this.pos.distanceTo(P.pos) < 60) GAME.sound('wing', this.pos);
    // contact
    this.contactCool -= dt;
    if (this.contactCool <= 0 && !P.dead && P.mode !== 'creative') {
      const hp = this.headPos || this.pos;
      if (P.pos.distanceTo(hp) < 3 || (Math.abs(P.pos.y + 1 - this.pos.y) < 2.5 && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 4)) {
        P.damage(P.pos.distanceTo(hp) < 3 ? 10 : 5, this); P.knock(this.pos, 14); P.vel.y = 10; this.contactCool = 1;
        this.phase = 'circle'; this.phaseT = 0;
      }
    }
    // break blocks
    if (this.age % 5 === 0) {
      const w = GAME.world;
      for (let x = -2; x <= 2; x++) for (let y = -1; y <= 1; y++) for (let z = -2; z <= 2; z++) {
        const bx = Math.floor(this.pos.x + x), by = Math.floor(this.pos.y + y), bz = Math.floor(this.pos.z + z);
        const id = w.getBlock(bx, by, bz);
        if (id && id !== BID.end_stone && id !== BID.obsidian && id !== BID.bedrock && id !== BID.end_portal && BLOCKS[id].hard >= 0 && !LIQ[id]) w.setBlock(bx, by, bz, 0);
      }
    }
    this.place(dt);
  }
  place(dt) {
    this.mesh.position.copy(this.pos);
    const yaw = Math.atan2(this.heading.x, this.heading.z), pitch = Math.asin(-Math.max(-1, Math.min(1, this.heading.y)));
    this.bodyG.rotation.set(pitch * 0.5, yaw, 0, 'YXZ');
    const fwd = new THREE.Vector3(Math.sin(yaw), -Math.sin(pitch * 0.5), Math.cos(yaw)).normalize();
    // trail of positions for neck/tail
    this.trail.unshift(this.pos.clone()); if (this.trail.length > 80) this.trail.pop();
    let prev = this.pos.clone().addScaledVector(fwd, 3.5);
    for (let i = 0; i < this.neck.length; i++) {
      const p = prev.clone().addScaledVector(fwd, 1.1); p.y += Math.sin(this.age * 0.05 + i * 0.5) * 0.15;
      this.neck[i].position.copy(p); this.neck[i].rotation.set(0, yaw, 0); prev = p;
    }
    this.headPos = prev.clone().addScaledVector(fwd, 1.3);
    this.headG.position.copy(prev.clone().addScaledVector(fwd, 0.2)); this.headG.rotation.set(pitch * 0.5, yaw, 0, 'YXZ');
    this.jaw.rotation.x = this.phase === 'charge' ? 0.4 : Math.max(0, Math.sin(this.age * 0.03)) * 0.15;
    let back = this.pos.clone().addScaledVector(fwd, -3.5);
    for (let i = 0; i < this.tail.length; i++) {
      const ti = Math.min(this.trail.length - 1, 3 + i * 2);
      const tp = this.trail[ti] ? this.trail[ti].clone().addScaledVector(fwd, -3.5 - i * 0.2) : back;
      const p = back.clone().lerp(tp, 0.5); p.y += Math.sin(this.age * 0.07 - i * 0.4) * 0.2;
      this.tail[i].position.copy(p); this.tail[i].rotation.y = yaw;
      back = p.clone().addScaledVector(fwd, -1.0);
    }
    const f = Math.sin(this.flap) * 0.6;
    this.wings[0].rotation.z = f; this.wings[1].rotation.z = -f;
    this.wings[0].userData.tip.rotation.z = f * 0.8; this.wings[1].userData.tip.rotation.z = -f * 0.8;
    const c = GAME.lightAt(this.pos.x, this.pos.y, this.pos.z);
    const hurt = this.hurtTime > 0;
    for (const m of this.mats) m.color.setRGB(hurt ? 1 : Math.max(0.55, c.r), hurt ? 0.35 : Math.max(0.55, c.g), hurt ? 0.35 : Math.max(0.55, c.b));
  }
  damage(a, src, direct) {
    if (this.dead || (this.invuln > 0 && !direct)) return false;
    if (!direct) { a = this.lastHitHead ? a : a / 4 + 1; }
    this.health -= a; this.hurtTime = 0.4; this.invuln = 0.5;
    if (this.phase === 'charge') { this.phase = 'circle'; this.phaseT = 0; }
    if (this.health <= 0) { this.health = 0; this.dead = true; this.deathT = 0; GAME.sound('dragon', this.pos); }
    return true;
  }
  knock() { }
  remove() { super.remove(); GAME.scene.remove(this.headG); for (const n of this.neck) GAME.scene.remove(n); for (const t of this.tail) GAME.scene.remove(t); }
}

// ---------------- particles ----------------
class Particles {
  constructor(scene) {
    this.max = 3000; this.list = [];
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 12); this.uv = new Float32Array(this.max * 8); this.col = new Float32Array(this.max * 12);
    const idx = new Uint32Array(this.max * 6);
    for (let i = 0; i < this.max; i++) { idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.MeshBasicMaterial({ map: TEX.texture, vertexColors: true, alphaTest: 0.3, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.white = TEX.names.particle_white;
  }
  add(p) { if (this.list.length < this.max) this.list.push(p); }
  burst(x, y, z, tile, n = 30, spread = 0.5) {
    const uv = TEX.uv(tile), du = (uv[2] - uv[0]) / 4, dv = (uv[3] - uv[1]) / 4;
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * 2 * spread, oy = (Math.random() - 0.5) * 2 * spread, oz = (Math.random() - 0.5) * 2 * spread;
      const su = uv[0] + ((Math.random() * 3) | 0) * du, sv = uv[1] + ((Math.random() * 3) | 0) * dv;
      this.add({ x: x + ox, y: y + oy, z: z + oz, vx: ox * 4, vy: Math.random() * 4 + 1, vz: oz * 4, life: 0.5 + Math.random() * 0.6, size: 0.08 + Math.random() * 0.06, g: 18, uv: [su, sv, su + du, sv + dv], c: [1, 1, 1], light: true });
    }
  }
  colored(x, y, z, n, col, opts = {}) {
    const uv = TEX.uv(this.white);
    const r = ((col >> 16) & 255) / 255, g = ((col >> 8) & 255) / 255, b = (col & 255) / 255;
    for (let i = 0; i < n; i++) {
      const s = opts.spread ?? 0.3;
      this.add({ x: x + (Math.random() - 0.5) * s, y: y + (Math.random() - 0.5) * s, z: z + (Math.random() - 0.5) * s, vx: (Math.random() - 0.5) * (opts.v ?? 1), vy: (opts.vy ?? 0) + (Math.random() - 0.5) * (opts.v ?? 1), vz: (Math.random() - 0.5) * (opts.v ?? 1), life: (opts.life ?? 1) * (0.6 + Math.random() * 0.6), size: opts.size ?? 0.1, g: opts.g ?? 0, uv, c: [r, g, b], grow: opts.grow, fade: true });
    }
  }
  smoke(x, y, z, n) { this.colored(x, y, z, n, 0x6A6A6A, { vy: 1.2, v: 0.4, life: 1.2, size: 0.15, grow: 0.15 }); }
  puff(x, y, z, n, col = 0xDDDDDD) { this.colored(x, y, z, n, col, { spread: 1, v: 2, vy: 0.5, life: 0.8, size: 0.18 }); }
  flame(x, y, z) { this.colored(x, y, z, 1, Math.random() < 0.5 ? 0xFFB020 : 0xFF6A10, { spread: 0.1, v: 0.2, vy: 0.8, life: 0.5, size: 0.08 }); }
  portal(x, y, z, n) { this.colored(x, y, z, n, Math.random() < 0.5 ? 0xB054F0 : 0x7A2AD0, { spread: 1.2, v: 1.5, vy: 0.2, life: 1, size: 0.08 }); }
  crit(x, y, z) { this.colored(x, y, z, 8, 0xFFFFC0, { spread: 0.6, v: 3, vy: 1, life: 0.4, size: 0.07, g: 6 }); }
  explosion(x, y, z, r) { for (let i = 0; i < 25 * r; i++) this.colored(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2, z + (Math.random() - 0.5) * r * 2, 1, Math.random() < 0.3 ? 0xFFE0A0 : 0xBBBBBB, { spread: 0.5, v: 2, vy: 0.5, life: 0.9, size: 0.3 + Math.random() * 0.3, grow: 0.4 }); }
  update(dt, cam) {
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    cam.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    let n = 0;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.g > 0) { const id = GAME.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)); if (FULL[id]) { p.y -= p.vy * dt; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; } }
      if (p.grow) p.size += p.grow * dt;
    }
    for (const p of L) {
      if (n >= this.max) break;
      const s = p.size;
      const rx = right.x * s, ry = right.y * s, rz = right.z * s, ux = up.x * s, uy = up.y * s, uz = up.z * s;
      const o = n * 12;
      this.pos[o] = p.x - rx - ux; this.pos[o + 1] = p.y - ry - uy; this.pos[o + 2] = p.z - rz - uz;
      this.pos[o + 3] = p.x + rx - ux; this.pos[o + 4] = p.y + ry - uy; this.pos[o + 5] = p.z + rz - uz;
      this.pos[o + 6] = p.x + rx + ux; this.pos[o + 7] = p.y + ry + uy; this.pos[o + 8] = p.z + rz + uz;
      this.pos[o + 9] = p.x - rx + ux; this.pos[o + 10] = p.y - ry + uy; this.pos[o + 11] = p.z - rz + uz;
      const u = p.uv, q = n * 8;
      this.uv[q] = u[0]; this.uv[q + 1] = u[1]; this.uv[q + 2] = u[2]; this.uv[q + 3] = u[1]; this.uv[q + 4] = u[2]; this.uv[q + 5] = u[3]; this.uv[q + 6] = u[0]; this.uv[q + 7] = u[3];
      let r = p.c[0], g = p.c[1], b = p.c[2];
      if (p.light) { const c = GAME.lightAt(p.x, p.y, p.z); r *= c.r; g *= c.g; b *= c.b; }
      if (p.fade && p.life < 0.3) { const f = p.life / 0.3; r *= f + (1 - f) * 0.5; g *= f + (1 - f) * 0.5; b *= f + (1 - f) * 0.5; }
      for (let k = 0; k < 4; k++) { this.col[o + k * 3] = r; this.col[o + k * 3 + 1] = g; this.col[o + k * 3 + 2] = b; }
      n++;
    }
    this.geo.setDrawRange(0, n * 6);
    this.mesh.visible = n > 0;
    if (!n && !this.lastN) return;
    this.lastN = n;
    const a = this.geo.attributes;
    a.position.updateRange.count = n * 12; a.color.updateRange.count = n * 12; a.uv.updateRange.count = n * 8;
    a.position.needsUpdate = a.uv.needsUpdate = a.color.needsUpdate = true;
  }
}

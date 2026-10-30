// Procedural 16x16 pixel texture atlas
'use strict';
const TS = 16, ATLAS_COLS = 32, ATLAS_PX = TS * ATLAS_COLS;

function hex(c) {
  if (Array.isArray(c)) return c;
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c, f) { c = hex(c); return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]; }
function mix(a, b, t) { a = hex(a); b = hex(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

class Painter {
  constructor(seed) {
    this.d = new Uint8ClampedArray(TS * TS * 4);
    this.r = mulberry32(seed);
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    c = hex(c);
    const i = (y * TS + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) { const i = (y * TS + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  alpha(x, y) { return this.d[(y * TS + x) * 4 + 3]; }
  fill(c, amt = 0, a = 255) {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) this.set(x, y, shade(c, 1 + (this.r() - 0.5) * 2 * amt), a);
  }
  rect(x0, y0, w, h, c, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a); }
  mul(x, y, f) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (y * TS + x) * 4;
    this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f;
  }
  clear() { this.d.fill(0); }
}

const TEX = {
  canvas: null, ctx: null, count: 0, names: {}, anims: [], texture: null,
  init() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS_PX;
    this.ctx = this.canvas.getContext('2d');
  },
  add(name, fn) {
    if (this.names[name] !== undefined) return this.names[name];
    const idx = this.count++;
    const p = new Painter(strSeed(name) ^ 0x5bd1e995);
    fn(p);
    const img = new ImageData(p.d, TS, TS);
    this.ctx.putImageData(img, (idx % ATLAS_COLS) * TS, ((idx / ATLAS_COLS) | 0) * TS);
    this.names[name] = idx;
    return idx;
  },
  addAnim(name, frames, fn, speed) {
    const idx = this.add(name, p => fn(p, 0));
    const imgs = [];
    for (let f = 0; f < frames; f++) {
      const p = new Painter(strSeed(name) ^ 0x5bd1e995);
      fn(p, f);
      imgs.push(new ImageData(p.d, TS, TS));
    }
    this.anims.push({ idx, imgs, speed, cur: 0 });
    return idx;
  },
  uv(idx) {
    const x = idx % ATLAS_COLS, y = (idx / ATLAS_COLS) | 0;
    const e = 0.02 / ATLAS_PX;
    return [x / ATLAS_COLS + e, 1 - (y + 1) / ATLAS_COLS + e, (x + 1) / ATLAS_COLS - e, 1 - y / ATLAS_COLS - e];
  },
  tick(time) {
    let changed = false;
    for (const a of this.anims) {
      const f = Math.floor(time * a.speed) % a.imgs.length;
      if (f !== a.cur) {
        a.cur = f;
        this.ctx.putImageData(a.imgs[f], (a.idx % ATLAS_COLS) * TS, ((a.idx / ATLAS_COLS) | 0) * TS);
        changed = true;
      }
    }
    if (changed && this.texture) this.texture.needsUpdate = true;
  },
};

// ---------- generators (each returns a fn(p)) ----------
const G = {
  noise(c, amt = 0.1) { return p => p.fill(c, amt); },
  speck(c, amt, sc, prob) {
    return p => { p.fill(c, amt); for (let i = 0; i < 256; i++) if (p.r() < prob) p.set(i & 15, i >> 4, shade(sc, 0.9 + p.r() * 0.2)); };
  },
  stone(c, amt = 0.08) {
    return p => {
      p.fill(c, amt);
      for (let i = 0; i < 18; i++) {
        const x = (p.r() * 16) | 0, y = (p.r() * 16) | 0, l = 1 + ((p.r() * 3) | 0), f = p.r() < 0.5 ? 0.82 : 1.12;
        for (let k = 0; k < l; k++) p.mul(x + k, y, f);
      }
    };
  },
  cobble(c, mortar) {
    return p => {
      p.fill(mortar || shade(c, 0.6), 0.05);
      const r = p.r;
      for (let by = 0; by < 16; by += 4) {
        let x = ((by / 4) % 2) * 2 - 2;
        while (x < 16) {
          const w = 3 + ((r() * 3) | 0), h = 3 + (r() < 0.3 ? 1 : 0);
          const f = 0.85 + r() * 0.35;
          for (let yy = 0; yy < h - 1; yy++) for (let xx = 0; xx < w - 1; xx++) {
            const px = x + xx, py = by + yy;
            const edge = yy === 0 || xx === 0 ? 1.1 : (yy === h - 2 || xx === w - 2 ? 0.85 : 1);
            p.set(px, py, shade(c, f * edge * (0.95 + r() * 0.1)));
          }
          x += w;
        }
      }
    };
  },
  ore(host, a, b) {
    return p => {
      host(p);
      const r = p.r;
      for (let i = 0; i < 5; i++) {
        const cx = 2 + ((r() * 12) | 0), cy = 2 + ((r() * 12) | 0);
        const n = 2 + ((r() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const x = cx + ((r() * 3) | 0) - 1, y = cy + ((r() * 3) | 0) - 1;
          p.set(x, y, a); p.set(x + 1, y + 1, b || shade(a, 0.65));
        }
      }
    };
  },
  planks(c) {
    return p => {
      const r = p.r;
      for (let y = 0; y < 16; y++) {
        const board = y >> 2, seam = (y & 3) === 3;
        for (let x = 0; x < 16; x++) {
          let f = 1 + (r() - 0.5) * 0.08 + Math.sin(x * 0.9 + board * 3) * 0.03;
          if (seam) f = 0.7;
          const split = (board % 2 === 0 ? 7 : 15);
          if (x === split && !seam) f = 0.78;
          p.set(x, y, shade(c, f));
        }
      }
      for (let i = 0; i < 6; i++) { const x = (r() * 16) | 0, y = (r() * 16) | 0; if ((y & 3) !== 3) { p.mul(x, y, 0.85); p.mul(x + 1, y, 0.88); } }
    };
  },
  logSide(c, streak) {
    return p => {
      const r = p.r;
      for (let x = 0; x < 16; x++) {
        const col = 1 + (r() - 0.5) * 0.25;
        for (let y = 0; y < 16; y++) p.set(x, y, shade(c, col * (1 + (r() - 0.5) * 0.12)));
      }
      for (let i = 0; i < 10; i++) { const x = (r() * 16) | 0, y = (r() * 16) | 0, l = 2 + ((r() * 4) | 0); for (let k = 0; k < l; k++) p.set(x, y + k, streak ? hex(streak) : shade(c, 0.7)); }
    };
  },
  birchSide() {
    return p => {
      p.fill('#D8D7D2', 0.04);
      const r = p.r;
      for (let i = 0; i < 9; i++) { const x = (r() * 14) | 0, y = (r() * 16) | 0, l = 1 + ((r() * 4) | 0); for (let k = 0; k < l; k++) p.set(x + k, y, k === 0 ? '#2A2A26' : '#4A4A44'); }
    };
  },
  logTop(inner, bark) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 6.5) p.set(x, y, shade(bark, 0.9 + p.r() * 0.2));
        else { const ring = Math.floor(d) % 2 === 0; p.set(x, y, shade(inner, (ring ? 1 : 0.86) * (0.96 + p.r() * 0.08))); }
      }
    };
  },
  leaves(c, holes = 0.18) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = p.r();
        if (v < holes) p.set(x, y, [0, 0, 0], 0);
        else p.set(x, y, shade(c, 0.65 + p.r() * 0.55));
      }
    };
  },
  bricks(c, mortar = '#A79E92') {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 2, off = (row % 2) * 4;
        const isM = (y & 3) === 3 || ((x + off) & 7) === 7;
        p.set(x, y, isM ? shade(mortar, 0.95 + p.r() * 0.1) : shade(c, 0.88 + p.r() * 0.22));
      }
    };
  },
  stoneBricks(c, opts = {}) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 3, off = (row % 2) * 8;
        const yy = y & 7, xx = (x + off) & 15;
        let f = 0.94 + p.r() * 0.1;
        if (yy === 7 || xx === 15) f = 0.62;
        else if (yy === 0 || xx === 0) f *= 1.12;
        else if (yy === 6 || xx === 14) f *= 0.85;
        p.set(x, y, shade(c, f));
      }
      if (opts.mossy) for (let i = 0; i < 70; i++) { const x = (p.r() * 16) | 0, y = (p.r() * 16) | 0; p.set(x, y, shade('#5C7A33', 0.8 + p.r() * 0.4)); }
      if (opts.cracked) { let x = 3 + ((p.r() * 8) | 0), y = 0; while (y < 16) { p.set(x, y, shade(c, 0.4)); y++; x += ((p.r() * 3) | 0) - 1; } }
    };
  },
  tiles(c, n = 2) {
    return p => {
      const s = 16 / n;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const xx = x % s, yy = y % s;
        let f = 0.94 + p.r() * 0.1;
        if (xx === s - 1 || yy === s - 1) f = 0.6; else if (xx === 0 || yy === 0) f *= 1.12;
        p.set(x, y, shade(c, f));
      }
    };
  },
  polished(c) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let f = 0.97 + p.r() * 0.06;
        if (x === 0 || y === 0) f = 1.15; else if (x === 15 || y === 15) f = 0.75;
        p.set(x, y, shade(c, f));
      }
    };
  },
  chiseled(c) {
    return p => {
      G.polished(c)(p);
      for (let i = 3; i < 13; i++) { p.set(i, 3, shade(c, 0.7)); p.set(i, 12, shade(c, 1.15)); p.set(3, i, shade(c, 0.7)); p.set(12, i, shade(c, 1.15)); }
      for (let i = 6; i < 10; i++) for (let j = 6; j < 10; j++) p.set(i, j, shade(c, (i + j) % 2 ? 0.8 : 1.1));
    };
  },
  pillarSide(c) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let f = 0.95 + p.r() * 0.08;
        if (x === 0 || x === 15) f = 0.75; else if (x === 1 || x === 14) f = 1.1; else if (x % 4 === 0) f *= 0.92;
        p.set(x, y, shade(c, f));
      }
    };
  },
  wool(c) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const f = 0.9 + p.r() * 0.15 + (((x + y) % 4 === 0) ? -0.06 : 0) + (((x - y + 16) % 4 === 0) ? 0.04 : 0);
        p.set(x, y, shade(c, f));
      }
    };
  },
  concrete(c) { return p => p.fill(c, 0.025); },
  powder(c) { return p => { p.fill(c, 0.1); for (let i = 0; i < 40; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, shade(c, p.r() < 0.5 ? 0.8 : 1.2)); }; },
  terracotta(c) { return p => { p.fill(c, 0.04); for (let i = 0; i < 12; i++) p.mul((p.r() * 16) | 0, (p.r() * 16) | 0, 0.92); }; },
  glazed(c, seed) {
    return p => {
      const r = mulberry32(seed);
      const c2 = shade(c, 0.55), c3 = mix(c, '#FFFFFF', 0.55);
      const q = [];
      for (let i = 0; i < 64; i++) { const v = r(); q.push(v < 0.4 ? c : v < 0.7 ? c2 : c3); }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const col = q[y * 8 + x];
        p.set(x, y, col); p.set(15 - y, x, col); p.set(15 - x, 15 - y, col); p.set(y, 15 - x, col);
      }
    };
  },
  glass(tint, a = 60) {
    return p => {
      const t = tint ? hex(tint) : [215, 235, 240];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        if (edge) p.set(x, y, shade(t, 0.85), tint ? 200 : 255);
        else if ((x - y === 3 || x - y === 4 || x - y === -6) && x > 2 && x < 13) p.set(x, y, mix(t, '#FFFFFF', 0.6), tint ? 170 : 255);
        else p.set(x, y, t, tint ? a + 50 : 0);
      }
    };
  },
  mineral(c) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let f = 0.96 + p.r() * 0.08;
        if (x === 0 || y === 0) f = 1.25; else if (x === 15 || y === 15) f = 0.7;
        else if (x === 1 || y === 1) f = 1.1; else if (x === 14 || y === 14) f = 0.85;
        p.set(x, y, shade(c, f));
      }
      for (let i = 0; i < 6; i++) { const x = 2 + ((p.r() * 11) | 0), y = 2 + ((p.r() * 11) | 0); p.set(x, y, mix(c, '#FFFFFF', 0.5)); }
    };
  },
  rawBlock(c) {
    return p => { p.fill(c, 0.12); for (let i = 0; i < 30; i++) { const x = (p.r() * 15) | 0, y = (p.r() * 15) | 0; p.set(x, y, shade(c, 1.25)); p.set(x + 1, y + 1, shade(c, 0.65)); } };
  },
  sandstoneSide(c) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let f = 0.95 + p.r() * 0.08;
        if (y < 3) f *= 1.06; else if (y === 3 || y === 12) f = 0.82; else if (y > 12) f *= 0.94;
        p.set(x, y, shade(c, f));
      }
    };
  },
  grassTop(c) { return p => { p.fill(c, 0.18); for (let i = 0; i < 30; i++) p.mul((p.r() * 16) | 0, (p.r() * 16) | 0, 0.8); }; },
  overlaySide(base, top, depthMin = 2, depthMax = 5) {
    return p => {
      base(p);
      for (let x = 0; x < 16; x++) {
        const d = depthMin + ((p.r() * (depthMax - depthMin + 1)) | 0);
        for (let y = 0; y < d; y++) p.set(x, y, shade(top, 0.8 + p.r() * 0.35));
      }
    };
  },
  gravel() {
    return p => {
      p.fill('#7F7C7B', 0.05);
      for (let i = 0; i < 40; i++) {
        const x = (p.r() * 16) | 0, y = (p.r() * 16) | 0, c = ['#5F5A58', '#9C9897', '#8A7E77', '#6F6866'][(p.r() * 4) | 0];
        p.set(x, y, c); p.set(x + 1, y, shade(c, 0.9)); p.set(x, y + 1, shade(c, 0.8));
      }
    };
  },
  ice(c, a) {
    return p => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(c, 0.95 + p.r() * 0.08), a);
      for (let i = 0; i < 4; i++) { let x = (p.r() * 16) | 0; for (let y = 0; y < 6; y++) p.set((x + y) & 15, ((i * 4) + y) & 15, mix(c, '#FFFFFF', 0.6), Math.min(255, a + 40)); }
    };
  },
  // cross plants
  flower(petal, center, stem = '#3E7A26', h = 9) {
    return p => {
      p.clear();
      const cx = 7;
      for (let y = 16 - h; y < 16; y++) p.set(cx, y, shade(stem, 0.9 + p.r() * 0.2));
      p.set(cx - 1, 13, stem); p.set(cx - 2, 12, stem); p.set(cx + 1, 11, stem); p.set(cx + 2, 10, stem);
      const top = 16 - h;
      const pc = hex(petal);
      [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2], [0, -1], [-1, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => p.set(cx + dx, top + dy, shade(pc, 0.85 + p.r() * 0.3)));
      p.set(cx, top, center);
    };
  },
  tulip(petal, stem = '#3E7A26') {
    return p => {
      p.clear();
      for (let y = 8; y < 16; y++) p.set(7, y, stem);
      p.set(6, 12, stem); p.set(5, 11, stem); p.set(8, 13, stem); p.set(9, 12, stem);
      for (let y = 4; y < 8; y++) for (let x = 6; x < 9; x++) p.set(x, y, shade(petal, 0.85 + p.r() * 0.3));
      p.set(5, 4, petal); p.set(9, 4, petal); p.set(6, 3, petal); p.set(8, 3, petal);
    };
  },
  grassPlant(c, density = 14) {
    return p => {
      p.clear();
      for (let i = 0; i < density; i++) {
        let x = 1 + ((p.r() * 14) | 0); const h = 5 + ((p.r() * 9) | 0);
        for (let y = 15; y > 15 - h; y--) { p.set(x, y, shade(c, 0.7 + (15 - y) / h * 0.5)); if (p.r() < 0.15) x += p.r() < 0.5 ? -1 : 1; }
      }
    };
  },
  fern(c) {
    return p => {
      p.clear();
      for (let s = 0; s < 3; s++) {
        const bx = 3 + s * 5;
        for (let y = 15; y > 3 + s; y--) { p.set(bx, y, shade(c, 0.8)); if (y % 2 === 0) { p.set(bx - 1, y, c); p.set(bx + 1, y - 1, c); } }
      }
    };
  },
  deadBush() {
    return p => {
      p.clear();
      const c = '#946428';
      const br = (x, y, dx, n) => { for (let i = 0; i < n; i++) { p.set(x, y, shade(c, 0.8 + p.r() * 0.4)); y--; if (i % 2) x += dx; } };
      br(7, 15, 0, 6); br(7, 11, -1, 6); br(7, 11, 1, 7); br(6, 8, -1, 4); br(9, 7, 1, 4);
    };
  },
  sapling(leaf, trunk = '#6B5332') {
    return p => {
      p.clear();
      for (let y = 9; y < 16; y++) p.set(7, y, trunk);
      for (let y = 2; y < 11; y++) for (let x = 3; x < 12; x++) {
        const d = Math.abs(x - 7) + Math.abs(y - 6);
        if (d < 5 && p.r() < 0.8) p.set(x, y, shade(leaf, 0.7 + p.r() * 0.5));
      }
    };
  },
  mushroom(cap, dots) {
    return p => {
      p.clear();
      for (let y = 10; y < 16; y++) { p.set(7, y, '#E0D6C0'); p.set(8, y, '#CFC4AC'); }
      for (let y = 6; y < 11; y++) for (let x = 4; x < 12; x++) {
        if (y === 6 && (x < 6 || x > 9)) continue;
        if (y === 7 && (x < 5 || x > 10)) continue;
        p.set(x, y, shade(cap, 0.85 + p.r() * 0.25));
      }
      if (dots) { p.set(6, 8, dots); p.set(9, 7, dots); p.set(8, 9, dots); }
    };
  },
  fungus(cap, stem) {
    return p => {
      p.clear();
      for (let y = 8; y < 16; y++) p.set(7, y, stem);
      for (let y = 4; y < 9; y++) for (let x = 3; x < 13; x++) if (Math.abs(x - 7.5) + (8 - y) * 0.8 < 5.5) p.set(x, y, shade(cap, 0.8 + p.r() * 0.35));
      p.set(5, 9, '#F4A05A'); p.set(10, 9, '#F4A05A');
    };
  },
  roots(c) {
    return p => {
      p.clear();
      for (let i = 0; i < 7; i++) { let x = 2 + ((p.r() * 12) | 0); for (let y = 15; y > 6 + ((p.r() * 5) | 0); y--) { p.set(x, y, shade(c, 0.8 + p.r() * 0.4)); if (p.r() < 0.3) x += p.r() < 0.5 ? 1 : -1; } }
    };
  },
  cane() {
    return p => {
      p.clear();
      [3, 8, 12].forEach((x, i) => { for (let y = 0; y < 16; y++) { const n = (y + i * 3) % 6 === 0; p.set(x, y, n ? '#A9D86B' : '#7FB84A'); p.set(x + 1, y, n ? '#7FB84A' : '#5E8F35'); } p.set(x - 1, 5 + i, '#6FAA40'); p.set(x + 2, 9 - i, '#6FAA40'); });
    };
  },
  cobweb() {
    return p => {
      p.clear();
      for (let i = 0; i < 16; i++) { p.set(i, i, '#DDDDDD', 200); p.set(15 - i, i, '#DDDDDD', 200); p.set(7, i, '#E8E8E8', 160); p.set(i, 7, '#E8E8E8', 160); }
      for (let r = 3; r < 8; r += 2) for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; p.set(Math.round(7.5 + Math.cos(t) * r), Math.round(7.5 + Math.sin(t) * r), '#CCCCCC', 170); }
    };
  },
  dripstone(down) {
    return p => {
      p.clear();
      for (let y = 0; y < 16; y++) {
        const w = down ? Math.max(0, 4 - y / 4) : Math.max(0, (y - 1) / 4);
        for (let x = Math.round(7.5 - w); x <= Math.round(7.5 + w); x++) p.set(x, y, shade('#866B5C', 0.8 + p.r() * 0.35));
      }
    };
  },
  berryBush() {
    return p => { G.sapling('#2F6A2A', '#3C5A22')(p); [[5, 5], [9, 4], [7, 8], [10, 8], [4, 9]].forEach(([x, y]) => { p.set(x, y, '#B8202A'); p.set(x + 1, y, '#8A1820'); }); };
  },
  wheat(stage) {
    return p => {
      p.clear();
      const col = stage >= 7 ? '#C8A84A' : '#6FA34A';
      for (let s = 0; s < 4; s++) { const x = 2 + s * 4; for (let y = 15; y > 15 - (4 + stage * 1.5); y--) p.set(x, y, shade(col, 0.8 + p.r() * 0.4)); }
    };
  },
  torch(flame = '#FFD84A', flame2 = '#FF9A1A') {
    return p => {
      p.clear();
      for (let y = 6; y < 16; y++) { p.set(7, y, '#6B4A26'); p.set(8, y, '#4F361B'); }
      p.set(7, 5, flame); p.set(8, 5, flame); p.set(7, 4, flame2); p.set(8, 4, '#FFF4B0'); p.set(7, 6, flame2); p.set(8, 6, flame2);
    };
  },
  fire(soul) {
    return (p, f = 0) => {
      p.clear();
      const r = mulberry32(f * 977 + (soul ? 7 : 0));
      for (let x = 0; x < 16; x++) {
        const h = 6 + ((r() * 9) | 0);
        for (let y = 15; y > 15 - h; y--) {
          const t = (15 - y) / h;
          const c = soul ? mix('#3EE9F0', '#1A6E8A', t) : mix('#FFE15A', '#E8461A', t);
          if (r() < 0.9 - t * 0.3) p.set(x, y, c, 230);
        }
      }
    };
  },
  crack(stage) {
    return p => {
      p.clear();
      const r = mulberry32(1234);
      const n = 2 + stage * 3;
      for (let i = 0; i < n; i++) {
        let x = 4 + ((r() * 8) | 0), y = 4 + ((r() * 8) | 0);
        const len = 2 + stage;
        for (let k = 0; k < len; k++) { p.set(x, y, '#000000', 200); x += ((r() * 3) | 0) - 1; y += ((r() * 3) | 0) - 1; x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y)); }
      }
    };
  },
  water() {
    return (p, f = 0) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = Math.sin((x + f) * 0.8) * Math.cos((y * 0.7 + f * 0.5)) * 0.5 + 0.5;
        p.set(x, y, mix('#2F5FD8', '#4A7EF0', v * 0.8 + hash3(x, y, f, 3) * 0.2), 175);
      }
    };
  },
  lava() {
    return (p, f = 0) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = Math.sin(x * 0.6 + f * 0.4) * Math.cos(y * 0.5 - f * 0.3) * 0.5 + 0.5;
        const h = hash3(x, (y + (f >> 1)) & 15, 0, 9);
        p.set(x, y, h < 0.08 ? '#B83A08' : mix('#D9580B', '#FFC23A', v * 0.85 + h * 0.15));
      }
    };
  },
  portal() {
    return (p, f = 0) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 7.5, a = Math.atan2(dy, dx), d = Math.sqrt(dx * dx + dy * dy);
        const v = Math.sin(a * 3 + d * 0.9 - f * 0.8) * 0.5 + 0.5;
        p.set(x, y, mix('#3A0A7A', '#B054F0', v), 190);
      }
    };
  },
  endPortal() {
    return (p, f = 0) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const h = hash3((x + f) & 15, y, (f >> 2), 77);
        p.set(x, y, h > 0.94 ? ['#5FE0C8', '#B05AE8', '#3D8AE8', '#FFFFFF'][(h * 400) & 3] : mix('#030A12', '#0A1F2A', hash3(x, y, 1, 5)));
      }
    };
  },
};

// Pixel-template helper: rows of chars mapped through a palette
function tpl(rows, pal) {
  return p => {
    p.clear();
    for (let y = 0; y < 16 && y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < 16 && x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ' || !pal[ch]) continue;
        p.set(x, y, pal[ch]);
      }
    }
  };
}
function tplOver(base, rows, pal) { return p => { base(p); const t = tpl(rows, pal); const q = new Painter(1); t(q); for (let i = 0; i < 256; i++) if (q.d[i * 4 + 3]) p.set(i & 15, i >> 4, [q.d[i * 4], q.d[i * 4 + 1], q.d[i * 4 + 2]]); }; }

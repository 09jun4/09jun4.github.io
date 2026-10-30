// World: chunks, generation, lighting, meshing, block updates
'use strict';
const CS = 16, CH = 128, SEA = 52;
const BIOMES = [
  ['ocean', '바다', [0.95, 1, 0.95]], ['beach', '해변', [1.1, 1.0, 0.8]], ['plains', '평원', [1, 1, 1]], ['forest', '숲', [0.88, 1.0, 0.82]],
  ['birch_forest', '자작나무 숲', [0.95, 1.02, 0.85]], ['dark_forest', '어두운 숲', [0.72, 0.9, 0.68]], ['desert', '사막', [1.25, 1.05, 0.55]],
  ['savanna', '사바나', [1.2, 1.05, 0.55]], ['jungle', '정글', [0.8, 1.15, 0.6]], ['snowy_plains', '설원', [0.85, 1.0, 1.05]],
  ['taiga', '타이가', [0.8, 0.95, 0.85]], ['mountains', '설산', [0.85, 0.95, 0.9]], ['swamp', '늪', [0.72, 0.82, 0.55]],
  ['cherry_grove', '벚나무 숲', [1, 1.05, 0.95]], ['frozen_ocean', '얼어붙은 바다', [0.85, 1, 1.05]],
];
const NBIOMES = { 20: ['nether_wastes', '네더 황무지'], 21: ['crimson_forest', '진홍빛 숲'], 22: ['warped_forest', '뒤틀린 숲'], 23: ['soul_sand_valley', '영혼 모래 골짜기'], 24: ['basalt_deltas', '현무암 삼각주'], 30: ['the_end', '디 엔드'] };
function biomeName(b) { return b < 20 ? BIOMES[b][1] : NBIOMES[b][1]; }

let OPA, FULL, EMIT, LIQ, RENDER; // lookup tables built after registry
function buildTables() {
  const n = BLOCKS.length;
  OPA = new Uint8Array(n); FULL = new Uint8Array(n); EMIT = new Uint8Array(n); LIQ = new Uint8Array(n); RENDER = new Uint8Array(n);
  for (let i = 1; i < n; i++) {
    const b = BLOCKS[i];
    OPA[i] = b.opacity; EMIT[i] = b.light;
    FULL[i] = (b.shape === 'cube' && b.render === 'solid') ? 1 : 0;
    LIQ[i] = b.liquid === 'water' ? 1 : b.liquid === 'lava' ? 2 : 0;
    RENDER[i] = b.render === 'solid' ? 0 : b.render === 'cutout' ? 1 : 2;
  }
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint16Array(CS * CS * CH);
    this.meta = new Uint8Array(CS * CS * CH);
    this.light = new Uint8Array(CS * CS * CH); // hi nibble sky, lo nibble block
    this.biome = new Uint8Array(CS * CS);
    this.meshes = null; this.dirty = true; this.modified = false; this.lit = false;
  }
}
const IDX = (x, y, z) => x | (z << 4) | (y << 8);

// ---------------- tree / structure builders (setter based) ----------------
const Trees = {
  blob(set, get, x, y, z, r, leaf, rnd, flat = false) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const d = dx * dx + dz * dz + (flat ? dy * dy * 3 : dy * dy);
      if (d <= r * r + 1 && (d < r * r - 1 || rnd() < 0.6)) if (!get(x + dx, y + dy, z + dz)) set(x + dx, y + dy, z + dz, leaf);
    }
  },
  oak(set, get, x, y, z, rnd, log = BID.oak_log, leaf = BID.oak_leaves, minH = 4) {
    const h = minH + ((rnd() * 3) | 0);
    for (let dy = h - 3; dy <= h; dy++) {
      const r = dy >= h - 1 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === h || rnd() < 0.5)) continue;
        if (!get(x + dx, y + dy, z + dz)) set(x + dx, y + dy, z + dz, leaf);
      }
    }
    for (let dy = 0; dy < h; dy++) set(x, y + dy, z, log);
  },
  spruce(set, get, x, y, z, rnd) {
    const h = 6 + ((rnd() * 4) | 0);
    let r = 0;
    for (let dy = h; dy >= 2; dy--) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
        if (!get(x + dx, y + dy, z + dz)) set(x + dx, y + dy, z + dz, BID.spruce_leaves);
      }
      r = r >= 2 ? 1 : r + 1;
      if (dy === h) r = 1;
    }
    set(x, y + h + 1, z, BID.spruce_leaves);
    for (let dy = 0; dy < h; dy++) set(x, y + dy, z, BID.spruce_log);
  },
  jungle(set, get, x, y, z, rnd) {
    const h = 8 + ((rnd() * 5) | 0);
    Trees.blob(set, get, x, y + h, z, 3, BID.jungle_leaves, rnd, true);
    for (let dy = 0; dy < h; dy++) set(x, y + dy, z, BID.jungle_log);
  },
  acacia(set, get, x, y, z, rnd) {
    const h = 4 + ((rnd() * 2) | 0), dir = (rnd() * 4) | 0, ddx = [1, -1, 0, 0][dir], ddz = [0, 0, 1, -1][dir];
    let cx = x, cz = z;
    for (let dy = 0; dy < h; dy++) { if (dy >= h - 2) { cx += ddx; cz += ddz; } set(cx, y + dy, cz, BID.acacia_log); }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) + Math.abs(dz) <= 4) if (!get(cx + dx, y + h, cz + dz)) set(cx + dx, y + h, cz + dz, BID.acacia_leaves);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!get(cx + dx, y + h + 1, cz + dz)) set(cx + dx, y + h + 1, cz + dz, BID.acacia_leaves);
  },
  darkOak(set, get, x, y, z, rnd) {
    const h = 6 + ((rnd() * 3) | 0);
    for (let dy = h - 2; dy <= h + 1; dy++) {
      const r = dy === h + 1 ? 2 : 3;
      for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
        if ((dx === -r || dx === r + 1) && (dz === -r || dz === r + 1)) continue;
        if (!get(x + dx, y + dy, z + dz)) set(x + dx, y + dy, z + dz, BID.dark_oak_leaves);
      }
    }
    for (let dy = 0; dy < h; dy++) for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + a, y + dy, z + b, BID.dark_oak_log);
  },
  cherry(set, get, x, y, z, rnd) {
    const h = 5 + ((rnd() * 2) | 0);
    Trees.blob(set, get, x, y + h, z, 3, BID.cherry_leaves, rnd, true);
    for (let dy = 0; dy < h; dy++) set(x, y + dy, z, BID.cherry_log);
  },
  fungus(set, get, x, y, z, rnd, stem, wart) {
    const h = 4 + ((rnd() * 5) | 0);
    for (let dy = h - 2; dy <= h; dy++) {
      const r = dy === h ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (!get(x + dx, y + dy, z + dz)) set(x + dx, y + dy, z + dz, rnd() < 0.08 ? BID.shroomlight : wart);
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && rnd() < 0.4) if (!get(x + dx, y + h - 3, z + dz)) set(x + dx, y + h - 3, z + dz, wart);
    for (let dy = 0; dy < h; dy++) set(x, y + dy, z, stem);
  },
  grow(type, set, get, x, y, z, rnd) {
    switch (type) {
      case 'oak': return Trees.oak(set, get, x, y, z, rnd);
      case 'birch': return Trees.oak(set, get, x, y, z, rnd, BID.birch_log, BID.birch_leaves, 5);
      case 'spruce': return Trees.spruce(set, get, x, y, z, rnd);
      case 'jungle': return Trees.jungle(set, get, x, y, z, rnd);
      case 'acacia': return Trees.acacia(set, get, x, y, z, rnd);
      case 'dark_oak': return Trees.darkOak(set, get, x, y, z, rnd);
      case 'cherry': return Trees.cherry(set, get, x, y, z, rnd);
      case 'mangrove': return Trees.oak(set, get, x, y, z, rnd, BID.mangrove_log, BID.mangrove_leaves, 5);
      case 'crimson': return Trees.fungus(set, get, x, y, z, rnd, BID.crimson_stem, BID.nether_wart_block);
      case 'warped': return Trees.fungus(set, get, x, y, z, rnd, BID.warped_stem, BID.warped_wart_block);
    }
  },
};

// ---------------- generators ----------------
class Generator {
  constructor(dim, seed) {
    this.dim = dim; this.seed = seed;
    this.n = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new Simplex(seed + i * 1013));
    const r = mulberry32(seed ^ 0xabc);
    const ang = r() * Math.PI * 2, dist = 90 + r() * 50;
    this.stronghold = { x: Math.floor(Math.cos(ang) * dist), y: 22, z: Math.floor(Math.sin(ang) * dist) };
    this.pillars = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this.pillars.push({ x: Math.round(Math.cos(a) * 42), z: Math.round(Math.sin(a) * 42), r: 2 + (i % 3), h: 76 + ((i * 7) % 10) * 3 }); }
  }
  column(x, z) {
    const n = this.n;
    const cont = n[0].fbm2(x / 700, z / 700, 3);
    const hills = n[1].fbm2(x / 160, z / 160, 4);
    const mnt = Math.max(0, Math.min(1, (n[2].fbm2(x / 450, z / 450, 2) - 0.2) / 0.35));
    const ridge = 1 - Math.abs(n[3].fbm2(x / 120, z / 120, 3));
    let h = SEA + 5 + cont * 16 + hills * 7 + mnt * mnt * ridge * 48;
    h = Math.max(8, Math.min(CH - 12, Math.round(h)));
    const temp = n[4].fbm2(x / 600, z / 600, 2), hum = n[5].fbm2(x / 500, z / 500, 2), weird = n[6].fbm2(x / 300, z / 300, 2);
    let b;
    if (h < SEA - 1) b = temp < -0.35 ? 14 : 0;
    else if (h <= SEA + 1 && mnt < 0.2) b = temp > 0.4 && hum < 0 ? 6 : 1;
    else if (mnt > 0.45 && h > 82) b = 11;
    else if (temp < -0.35) b = hum > 0.05 ? 10 : 9;
    else if (temp > 0.4) b = hum < -0.05 ? 6 : hum > 0.3 ? 8 : 7;
    else if (hum > 0.42 && h < SEA + 6) b = 12;
    else if (weird > 0.5) b = 13;
    else if (weird < -0.5) b = 5;
    else if (hum < -0.2) b = 2;
    else if (hum < 0.15) b = 3;
    else if (hum < 0.32) b = 4;
    else b = 3;
    return [h, b];
  }
  generate(ch) {
    if (this.dim === 'nether') return this.genNether(ch);
    if (this.dim === 'end') return this.genEnd(ch);
    return this.genOver(ch);
  }
  genOver(ch) {
    const bx = ch.cx * CS, bz = ch.cz * CS, B = ch.blocks, n = this.n, seed = this.seed;
    const heights = new Int16Array(256);
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = bx + lx, z = bz + lz;
      const [h, b] = this.column(x, z);
      heights[lx + lz * 16] = h; ch.biome[lx + lz * 16] = b;
      const sandy = b === 6 || b === 1, snowy = b === 9 || b === 10 || b === 14 || (b === 11 && h > 95);
      const under = h < SEA;
      const floorN = n[7].noise2D(x / 30, z / 30);
      for (let y = 0; y <= h; y++) {
        let id;
        const d = h - y;
        if (y === 0 || (y < 5 && hash3(x, y, z, seed) < (5 - y) / 5)) id = BID.bedrock;
        else if (d === 0) {
          if (under) id = floorN > 0.4 ? BID.gravel : floorN < -0.5 ? BID.clay : BID.sand;
          else if (sandy) id = BID.sand;
          else if (b === 11) id = h > 95 ? BID.snow_block : (h > 88 || floorN > 0.3) ? BID.stone : BID.grass_block;
          else if (b === 10 && floorN > 0.3) id = BID.podzol;
          else if (b === 8 && floorN > 0.55) id = BID.podzol;
          else id = BID.grass_block;
        } else if (d < 4) {
          if (under) id = floorN > 0.4 ? BID.gravel : BID.sand;
          else if (sandy) id = d === 3 ? BID.sandstone : BID.sand;
          else if (b === 11 && h > 88) id = BID.stone;
          else id = BID.dirt;
        } else id = (y < 8 || (y < 16 && hash3(x, y, z, seed + 5) < (16 - y) / 8)) ? BID.deepslate : BID.stone;
        B[IDX(lx, y, lz)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) B[IDX(lx, y, lz)] = (y === SEA && snowy) ? BID.ice : BID.water;
      // caves
      const top = h < SEA + 2 ? h - 6 : h;
      for (let y = 5; y <= top; y++) {
        const a = n[0].noise3D(x / 42, y / 22, z / 42), c = n[1].noise3D(x / 42 + 50, y / 22, z / 42);
        let carve = a * a + c * c < 0.011;
        if (!carve && y < 48) carve = n[2].noise3D(x / 70, y / 38, z / 70) > 0.62;
        if (carve) {
          const i = IDX(lx, y, lz);
          if (B[i] === BID.bedrock || B[i] === BID.water) continue;
          B[i] = y < 11 ? BID.lava : 0;
          if (y === h) heights[lx + lz * 16] = h - 1; // mark exposed
        }
      }
    }
    const r = mulberry32((ch.cx * 73856093) ^ (ch.cz * 19349663) ^ seed);
    const set = (x, y, z, id) => { if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) B[IDX(x, y, z)] = id; };
    const get = (x, y, z) => (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) ? B[IDX(x, y, z)] : 1;
    // ores & blobs
    const stoneLike = id => id === BID.stone || id === BID.deepslate || id === BID.granite || id === BID.diorite || id === BID.andesite || id === BID.tuff;
    const vein = (name, count, y0, y1, size) => {
      for (let i = 0; i < count; i++) {
        let x = (r() * 16) | 0, y = y0 + ((r() * (y1 - y0)) | 0), z = (r() * 16) | 0;
        for (let k = 0; k < size; k++) {
          const cur = get(x, y, z);
          if (stoneLike(cur)) {
            let id = BID[name];
            if (cur === BID.deepslate && BID['deepslate_' + name]) id = BID['deepslate_' + name];
            set(x, y, z, id);
          }
          x += ((r() * 3) | 0) - 1; y += ((r() * 3) | 0) - 1; z += ((r() * 3) | 0) - 1;
        }
      }
    };
    vein('granite', 2, 5, 90, 30); vein('diorite', 2, 5, 90, 30); vein('andesite', 2, 5, 90, 30); vein('tuff', 1, 5, 20, 25);
    vein('dirt', 2, 10, 80, 20); vein('gravel', 2, 5, 80, 20);
    vein('coal_ore', 18, 5, 110, 10); vein('iron_ore', 12, 5, 70, 7); vein('copper_ore', 7, 20, 70, 8); vein('gold_ore', 3, 5, 32, 6);
    vein('redstone_ore', 5, 5, 16, 6); vein('lapis_ore', 2, 5, 32, 5); vein('diamond_ore', 2, 5, 15, 4);
    if (ch.biome[136] === 11) vein('emerald_ore', 3, 40, 110, 2);
    // geode
    if (r() < 0.03) {
      const gx = 6 + ((r() * 4) | 0), gy = 12 + ((r() * 20) | 0), gz = 6 + ((r() * 4) | 0);
      for (let dx = -5; dx <= 5; dx++) for (let dy = -5; dy <= 5; dy++) for (let dz = -5; dz <= 5; dz++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 5) continue;
        set(gx + dx, gy + dy, gz + dz, d > 4.2 ? BID.smooth_basalt : d > 3.4 ? BID.calcite : d > 2.6 ? (r() < 0.12 ? BID.budding_amethyst : BID.amethyst_block) : (d > 1.8 && r() < 0.2 ? BID.amethyst_cluster : 0));
      }
    }
    // dripstone + cave decoration
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) for (let y = 6; y < 50; y++) {
      const i = IDX(lx, y, lz);
      if (B[i] !== 0) continue;
      const below = B[IDX(lx, y - 1, lz)], above = B[IDX(lx, y + 1, lz)];
      const h3 = hash3(bx + lx, y, bz + lz, seed + 99);
      if (stoneLike(below) && h3 < 0.025) B[i] = BID.pointed_dripstone;
      else if (stoneLike(above) && h3 > 0.975) B[i] = BID.pointed_dripstone_down;
      else if (below === BID.stone && h3 > 0.5 && h3 < 0.503) B[i] = BID.brown_mushroom;
    }
    // surface decoration
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const b = ch.biome[lx + lz * 16];
      let y = heights[lx + lz * 16];
      const topId = B[IDX(lx, y, lz)];
      if (y < SEA || y + 1 >= CH) continue;
      const x = bx + lx, z = bz + lz;
      const hv = hash3(x, 7, z, seed), hv2 = hash3(x, 11, z, seed);
      const ground = topId === BID.grass_block || topId === BID.podzol || topId === BID.dirt;
      const inner = lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13, inner3 = lx >= 3 && lx <= 12 && lz >= 3 && lz <= 12;
      if (B[IDX(lx, y + 1, lz)] !== 0) continue;
      const tree = { 2: 0.004, 3: 0.06, 4: 0.06, 5: 0.12, 7: 0.008, 8: 0.1, 9: 0.002, 10: 0.05, 11: 0.006, 12: 0.03, 13: 0.03 }[b] || 0;
      if (ground && hv < tree && inner) {
        const tr = mulberry32((x * 31 + z * 17) ^ seed);
        let t = 'oak';
        if (b === 4) t = 'birch'; else if (b === 3) t = hv2 < 0.25 ? 'birch' : 'oak'; else if (b === 5) t = inner3 && hv2 < 0.7 ? 'dark_oak' : 'oak';
        else if (b === 7) t = 'acacia'; else if (b === 8) t = inner3 && hv2 < 0.7 ? 'jungle' : 'oak'; else if (b === 9 || b === 10 || b === 11) t = 'spruce';
        else if (b === 12) t = 'mangrove'; else if (b === 13) t = inner3 ? 'cherry' : 'oak';
        set(lx, y, lz, BID.dirt);
        Trees.grow(t, set, get, lx, y + 1, lz, tr);
        continue;
      }
      let p = 0;
      if (ground) {
        if (b === 2) p = hv2 < 0.3 ? BID.short_grass : hv2 < 0.36 ? [BID.dandelion, BID.poppy, BID.oxeye_daisy, BID.azure_bluet, BID.cornflower, BID.red_tulip, BID.orange_tulip, BID.white_tulip, BID.pink_tulip][(hv2 * 1000) % 9 | 0] : (hv2 > 0.9995 ? BID.pumpkin : 0);
        else if (b === 3 || b === 4) p = hv2 < 0.18 ? BID.short_grass : hv2 < 0.21 ? [BID.dandelion, BID.poppy, BID.lily_of_the_valley, BID.allium][(hv2 * 1000) % 4 | 0] : 0;
        else if (b === 5) p = hv2 < 0.08 ? BID.short_grass : hv2 < 0.1 ? BID.red_mushroom : hv2 < 0.12 ? BID.brown_mushroom : 0;
        else if (b === 8) p = hv2 < 0.3 ? BID.fern : hv2 < 0.33 ? BID.bamboo : hv2 > 0.995 ? BID.melon : 0;
        else if (b === 7) p = hv2 < 0.4 ? BID.short_grass : 0;
        else if (b === 10) p = hv2 < 0.25 ? BID.fern : hv2 < 0.27 ? BID.sweet_berry_bush : 0;
        else if (b === 12) p = hv2 < 0.2 ? BID.short_grass : hv2 < 0.22 ? BID.blue_orchid : 0;
        else if (b === 13) p = hv2 < 0.25 ? BID.short_grass : hv2 < 0.3 ? BID.pink_tulip : 0;
        else if (b === 9) p = 0;
        else if (b === 11) p = hv2 < 0.1 ? BID.short_grass : 0;
      } else if (topId === BID.sand && b === 6) {
        if (hv2 < 0.006 && inner) { const ch2 = 1 + ((hv * 1000) % 3 | 0); for (let k = 1; k <= ch2; k++) set(lx, y + k, lz, BID.cactus); continue; }
        if (hv2 > 0.99) p = BID.dead_bush;
      }
      // sugar cane near water
      if ((topId === BID.sand || topId === BID.grass_block) && y === SEA && hv2 > 0.85) {
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => get(lx + dx, y, lz + dz) === BID.water);
        if (nearWater) { const hh = 1 + ((hv * 100) % 3 | 0); for (let k = 1; k <= hh; k++) set(lx, y + k, lz, BID.sugar_cane); continue; }
      }
      if (p === BID.bamboo) { const hh = 4 + ((hv * 100) % 8 | 0); for (let k = 1; k <= hh; k++) set(lx, y + k, lz, BID.bamboo); continue; }
      if (p) set(lx, y + 1, lz, p);
    }
    // snow layers
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const b = ch.biome[lx + lz * 16];
      if (b !== 9 && b !== 10 && !(b === 11 && heights[lx + lz * 16] > 90)) continue;
      for (let y = CH - 2; y > SEA; y--) {
        const id = B[IDX(lx, y, lz)];
        if (id === 0) continue;
        if (FULL[id] || BLOCKS[id].leaves) { if (B[IDX(lx, y + 1, lz)] === 0) B[IDX(lx, y + 1, lz)] = BID.snow; }
        else if (BLOCKS[id].shape === 'cross' && BLOCKS[id].replaceable) B[IDX(lx, y, lz)] = BID.snow;
        break;
      }
    }
    this.stampStronghold(ch);
  }
  stampStronghold(ch) {
    const s = this.stronghold, bx = ch.cx * CS, bz = ch.cz * CS;
    if (s.x + 8 < bx || s.x - 8 >= bx + CS || s.z + 8 < bz || s.z - 8 >= bz + CS) return;
    const r = mulberry32(12345);
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const dx = bx + lx - s.x, dz = bz + lz - s.z;
      if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;
      for (let dy = 0; dy <= 7; dy++) {
        const y = s.y + dy, wall = Math.abs(dx) === 7 || Math.abs(dz) === 7 || dy === 0 || dy === 7;
        let id = 0;
        const hv = hash3(dx, dy, dz, 3);
        if (wall) id = hv < 0.2 ? BID.mossy_stone_bricks : hv < 0.35 ? BID.cracked_stone_bricks : BID.stone_bricks;
        const adx = Math.abs(dx), adz = Math.abs(dz);
        if (dy === 1 && adx <= 2 && adz <= 2) id = (adx === 2 || adz === 2) ? BID.stone_bricks : BID.lava;
        if (dy === 2 && adx <= 2 && adz <= 2 && (adx === 2) !== (adz === 2)) id = hash3(dx, 0, dz, 77) < 0.12 ? BID.end_portal_frame_eye : BID.end_portal_frame;
        if (dy === 1 && dx === 0 && dz === -5) id = BID.spawner;
        if (dy === 4 && (adx === 6 && adz === 6)) id = BID.torch;
        ch.blocks[IDX(lx, y, lz)] = id;
      }
    }
  }
  genNether(ch) {
    const bx = ch.cx * CS, bz = ch.cz * CS, B = ch.blocks, n = this.n, seed = this.seed;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = bx + lx, z = bz + lz;
      const bn = n[4].fbm2(x / 200, z / 200, 2), bn2 = n[5].fbm2(x / 200, z / 200, 2);
      const b = bn > 0.3 ? 21 : bn < -0.3 ? 22 : bn2 > 0.3 ? 23 : bn2 < -0.35 ? 24 : 20;
      ch.biome[lx + lz * 16] = b;
      for (let y = 0; y < CH; y++) {
        let id = 0;
        if (y < 1 || y > CH - 2 || (y < 5 && hash3(x, y, z, seed) < (5 - y) / 5) || (y > CH - 6 && hash3(x, y, z, seed) < (y - (CH - 6)) / 5)) id = BID.bedrock;
        else {
          let d = n[0].fbm3(x / 70, y / 45, z / 70, 3) + n[1].noise3D(x / 25, y / 18, z / 25) * 0.25;
          d += Math.max(0, (24 - y) / 24) * 0.9 + Math.max(0, (y - 100) / 24) * 0.9;
          if (d > 0.02) id = BID.netherrack;
          else if (y <= 31) id = BID.lava;
        }
        B[IDX(lx, y, lz)] = id;
      }
      // surfaces
      for (let y = 2; y < CH - 2; y++) {
        const i = IDX(lx, y, lz);
        if (B[i] !== BID.netherrack) continue;
        const above = B[IDX(lx, y + 1, lz)];
        if (above === 0) {
          const hv = hash3(x, y, z, seed + 4);
          if (b === 21) B[i] = BID.crimson_nylium; else if (b === 22) B[i] = BID.warped_nylium;
          else if (b === 23) { B[i] = hv < 0.6 ? BID.soul_sand : BID.soul_soil; }
          else if (b === 24) { B[i] = hv < 0.5 ? BID.basalt : BID.blackstone; if (hv > 0.95) B[i] = BID.magma_block; }
          if (b === 20 && hv > 0.985) B[IDX(lx, y + 1, lz)] = BID.fire;
          if (b === 23 && hv > 0.98) B[IDX(lx, y + 1, lz)] = BID.soul_fire;
        }
        if (y > 26 && y < 34 && B[IDX(lx, y + 1, lz)] === BID.lava && hash3(x, y, z, 6) < 0.15) B[i] = BID.magma_block;
      }
    }
    const r = mulberry32((ch.cx * 73856093) ^ (ch.cz * 19349663) ^ seed ^ 0x55);
    const set = (x, y, z, id) => { if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH - 1) B[IDX(x, y, z)] = id; };
    const get = (x, y, z) => (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) ? B[IDX(x, y, z)] : 1;
    const vein = (id, count, y0, y1, size) => {
      for (let i = 0; i < count; i++) {
        let x = (r() * 16) | 0, y = y0 + ((r() * (y1 - y0)) | 0), z = (r() * 16) | 0;
        for (let k = 0; k < size; k++) { if (get(x, y, z) === BID.netherrack) set(x, y, z, id); x += ((r() * 3) | 0) - 1; y += ((r() * 3) | 0) - 1; z += ((r() * 3) | 0) - 1; }
      }
    };
    vein(BID.nether_quartz_ore, 14, 10, 118, 8); vein(BID.nether_gold_ore, 10, 10, 118, 6); vein(BID.ancient_debris, 1, 8, 22, 2); vein(BID.gravel, 2, 60, 70, 20); vein(BID.blackstone, 2, 5, 40, 20);
    // glowstone clusters from ceilings
    for (let i = 0; i < 3; i++) {
      const lx = 2 + ((r() * 12) | 0), lz = 2 + ((r() * 12) | 0);
      for (let y = CH - 6; y > 40; y--) {
        if (get(lx, y, lz) === 0 && get(lx, y + 1, lz) === BID.netherrack) {
          let x = lx, yy = y, z = lz;
          for (let k = 0; k < 40; k++) { if (get(x, yy, z) === 0) set(x, yy, z, BID.glowstone); x = Math.max(0, Math.min(15, x + ((r() * 3) | 0) - 1)); z = Math.max(0, Math.min(15, z + ((r() * 3) | 0) - 1)); if (r() < 0.4) yy--; }
          break;
        }
      }
    }
    // vegetation
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) for (let y = 32; y < CH - 8; y++) {
      const id = B[IDX(lx, y, lz)];
      if ((id !== BID.crimson_nylium && id !== BID.warped_nylium) || B[IDX(lx, y + 1, lz)] !== 0) continue;
      const hv = hash3(bx + lx, y, bz + lz, seed + 8);
      const crim = id === BID.crimson_nylium;
      if (hv < 0.025 && lx > 1 && lx < 14 && lz > 1 && lz < 14) Trees.grow(crim ? 'crimson' : 'warped', set, get, lx, y + 1, lz, mulberry32(hv * 1e9));
      else if (hv < 0.25) set(lx, y + 1, lz, crim ? BID.crimson_roots : (hv < 0.15 ? BID.warped_roots : BID.nether_sprouts));
      else if (hv < 0.28) set(lx, y + 1, lz, crim ? BID.crimson_fungus : BID.warped_fungus);
    }
  }
  genEnd(ch) {
    const bx = ch.cx * CS, bz = ch.cz * CS, B = ch.blocks, n = this.n;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = bx + lx, z = bz + lz;
      ch.biome[lx + lz * 16] = 30;
      const d = Math.sqrt(x * x + z * z);
      const R = 75 + n[0].noise2D(Math.atan2(z, x) * 3, 0) * 10;
      let top = -1, bot = 0;
      if (d < R) { top = 60 + Math.round(n[1].fbm2(x / 40, z / 40, 2) * 3); bot = Math.round(60 - Math.sqrt(Math.max(0, R - d)) * 4.5); }
      else if (d > 220) {
        const v = n[2].fbm2(x / 90, z / 90, 3);
        if (v > 0.35) { top = 56 + Math.round(n[1].noise2D(x / 30, z / 30) * 4); bot = Math.round(top - (v - 0.35) * 60); }
      }
      for (let y = Math.max(1, bot); y <= top; y++) B[IDX(lx, y, lz)] = BID.end_stone;
      if (top > 0 && d > 220 && hash3(x, 0, z, this.seed) < 0.01) {
        const h = 2 + ((hash3(x, 1, z, 1) * 4) | 0);
        for (let k = 1; k <= h; k++) B[IDX(lx, top + k, lz)] = BID.chorus_plant;
        B[IDX(lx, top + h + 1, lz)] = BID.chorus_flower;
      }
      for (const p of this.pillars) {
        const dd = (x - p.x) ** 2 + (z - p.z) ** 2;
        if (dd <= p.r * p.r + 1) { for (let y = 40; y <= p.h; y++) B[IDX(lx, y, lz)] = BID.obsidian; if (x === p.x && z === p.z) B[IDX(lx, p.h + 1, lz)] = BID.bedrock; }
      }
      if (x >= 98 && x <= 102 && z >= -2 && z <= 2) { B[IDX(lx, 48, lz)] = BID.obsidian; for (let y = 49; y < 52; y++) B[IDX(lx, y, lz)] = 0; }
    }
  }
}

// ---------------- the world ----------------
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.6 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.6 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.5 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.8 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.8 },
];
// facing meta 0:+z(south) 1:-x 2:-z 3:+x  -> face index
const FACING_FACE = [4, 1, 5, 0];

class World {
  constructor(dim, seed) {
    this.dim = dim; this.seed = seed;
    this.gen = new Generator(dim, seed);
    this.chunks = new Map();
    this.saved = new Map(); // modified chunk data kept when unloaded
    this.ticks = new Map();
    this.tick = 0;
    this.qx = new Int32Array(1 << 20); this.qy = new Int32Array(1 << 20); this.qz = new Int32Array(1 << 20); this.qv = new Uint8Array(1 << 20);
    this.containers = new Map(); // "x,y,z" -> data (chests/furnaces)
    this.hasSky = dim === 'overworld';
  }
  key(cx, cz) { return cx + ',' + cz; }
  getChunk(cx, cz) { return this.chunks.get(cx + ',' + cz); }
  chunkAt(x, z) { return this.chunks.get((x >> 4) + ',' + (z >> 4)); }
  getBlock(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    return c ? c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0;
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0;
  }
  setMeta(x, y, z, m) { const c = this.chunkAt(x, z); if (c) { c.meta[IDX(x & 15, y, z & 15)] = m; c.dirty = true; c.modified = true; } }
  getLight(x, y, z) {
    if (y >= CH) return 0xF0;
    if (y < 0) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] : 0xF0;
  }
  ensureChunk(cx, cz) {
    let c = this.getChunk(cx, cz);
    if (c) return c;
    c = new Chunk(cx, cz);
    const k = this.key(cx, cz);
    const sv = this.saved.get(k);
    if (sv) { c.blocks.set(sv.blocks); c.meta.set(sv.meta); c.biome.set(sv.biome); c.modified = true; this.saved.delete(k); }
    else this.gen.generate(c);
    this.chunks.set(k, c);
    this.initLight(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nb = this.getChunk(cx + dx, cz + dz); if (nb) nb.dirty = true; }
    return c;
  }
  unloadChunk(c) {
    const k = this.key(c.cx, c.cz);
    if (c.modified) this.saved.set(k, { blocks: c.blocks.slice(), meta: c.meta.slice(), biome: c.biome.slice() });
    this.chunks.delete(k);
  }
  // ---------- lighting ----------
  initLight(c) {
    const L = c.light, B = c.blocks, bx = c.cx * CS, bz = c.cz * CS;
    let qn = 0;
    const qx = this.qx, qy = this.qy, qz = this.qz;
    const tops = new Int16Array(256);
    if (this.hasSky) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        let y = CH - 1;
        for (; y >= 0; y--) { const id = B[IDX(x, y, z)]; if (OPA[id] > 0) break; L[IDX(x, y, z)] = 0xF0; }
        tops[x + z * 16] = y;
      }
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const t = tops[x + z * 16];
        let m = t + 1;
        const edge = x === 0 || z === 0 || x === 15 || z === 15;
        if (x > 0) m = Math.max(m, tops[x - 1 + z * 16]); if (x < 15) m = Math.max(m, tops[x + 1 + z * 16]);
        if (z > 0) m = Math.max(m, tops[x + (z - 1) * 16]); if (z < 15) m = Math.max(m, tops[x + (z + 1) * 16]);
        if (edge) m = Math.min(CH - 1, m + 2);
        for (let y = t + 1; y <= m && y < CH; y++) { qx[qn] = bx + x; qy[qn] = y; qz[qn] = bz + z; qn++; }
      }
    }
    // neighbour borders
    const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of nbs) {
      const nb = this.getChunk(c.cx + dx, c.cz + dz);
      if (!nb) continue;
      for (let y = 0; y < CH; y++) for (let k = 0; k < 16; k++) {
        const lx = dx === 1 ? 0 : dx === -1 ? 15 : k, lz = dz === 1 ? 0 : dz === -1 ? 15 : k;
        if (nb.light[IDX(lx, y, lz)]) { qx[qn] = nb.cx * CS + lx; qy[qn] = y; qz[qn] = nb.cz * CS + lz; qn++; }
      }
    }
    if (this.hasSky) this.propagate(qn, 1);
    qn = 0;
    for (let i = 0; i < B.length; i++) {
      const e = EMIT[B[i]];
      if (e) { L[i] = (L[i] & 0xF0) | e; qx[qn] = bx + (i & 15); qy[qn] = i >> 8; qz[qn] = bz + ((i >> 4) & 15); qn++; }
    }
    for (const [dx, dz] of nbs) {
      const nb = this.getChunk(c.cx + dx, c.cz + dz);
      if (!nb) continue;
      for (let y = 0; y < CH; y++) for (let k = 0; k < 16; k++) {
        const lx = dx === 1 ? 0 : dx === -1 ? 15 : k, lz = dz === 1 ? 0 : dz === -1 ? 15 : k;
        if (nb.light[IDX(lx, y, lz)] & 15) { qx[qn] = nb.cx * CS + lx; qy[qn] = y; qz[qn] = nb.cz * CS + lz; qn++; }
      }
    }
    this.propagate(qn, 0);
    c.lit = true;
  }
  // sky=1 uses high nibble
  propagate(qn, sky) {
    const qx = this.qx, qy = this.qy, qz = this.qz, M = qx.length - 1;
    let head = 0, tail = qn;
    let cc = null, ccx = 1e9, ccz = 1e9;
    const chunkOf = (x, z) => { const cx = x >> 4, cz = z >> 4; if (cx !== ccx || cz !== ccz) { ccx = cx; ccz = cz; cc = this.chunks.get(cx + ',' + cz); } return cc; };
    while (head !== tail) {
      const x = qx[head], y = qy[head], z = qz[head]; head = (head + 1) & M;
      const c = chunkOf(x, z); if (!c) continue;
      const lv = sky ? c.light[IDX(x & 15, y, z & 15)] >> 4 : c.light[IDX(x & 15, y, z & 15)] & 15;
      if (lv <= 1) continue;
      for (let f = 0; f < 6; f++) {
        let nx = x, ny = y, nz = z;
        if (f === 0) nx++; else if (f === 1) nx--; else if (f === 2) ny++; else if (f === 3) ny--; else if (f === 4) nz++; else nz--;
        if (ny < 0 || ny >= CH) continue;
        const nc = chunkOf(nx, nz); if (!nc) continue;
        const i = IDX(nx & 15, ny, nz & 15);
        const op = OPA[nc.blocks[i]];
        if (op >= 15) continue;
        let nl = lv - Math.max(1, op);
        if (sky && f === 3 && lv === 15 && op === 0) nl = 15;
        const cur = sky ? nc.light[i] >> 4 : nc.light[i] & 15;
        if (nl > cur) {
          nc.light[i] = sky ? (nc.light[i] & 15) | (nl << 4) : (nc.light[i] & 0xF0) | nl;
          nc.dirty = true;
          qx[tail] = nx; qy[tail] = ny; qz[tail] = nz; tail = (tail + 1) & M;
        }
      }
    }
  }
  unpropagate(x0, y0, z0, val, sky) {
    // removal BFS; returns count of re-propagation seeds placed into main queue
    const rx = [x0], ry = [y0], rz = [z0], rv = [val];
    let seeds = 0;
    const qx = this.qx, qy = this.qy, qz = this.qz;
    let h = 0;
    while (h < rx.length) {
      const x = rx[h], y = ry[h], z = rz[h], v = rv[h]; h++;
      for (let f = 0; f < 6; f++) {
        let nx = x, ny = y, nz = z;
        if (f === 0) nx++; else if (f === 1) nx--; else if (f === 2) ny++; else if (f === 3) ny--; else if (f === 4) nz++; else nz--;
        if (ny < 0 || ny >= CH) continue;
        const nc = this.chunkAt(nx, nz); if (!nc) continue;
        const i = IDX(nx & 15, ny, nz & 15);
        const nl = sky ? nc.light[i] >> 4 : nc.light[i] & 15;
        if (nl === 0) continue;
        if (nl < v || (sky && f === 3 && v === 15 && nl === 15)) {
          nc.light[i] = sky ? nc.light[i] & 15 : nc.light[i] & 0xF0;
          nc.dirty = true;
          rx.push(nx); ry.push(ny); rz.push(nz); rv.push(nl);
        } else if (nl >= v) { qx[seeds] = nx; qy[seeds] = ny; qz[seeds] = nz; seeds++; }
      }
    }
    // emitters inside removed area must re-seed
    if (!sky) for (let k = 0; k < rx.length; k++) {
      const id = this.getBlock(rx[k], ry[k], rz[k]);
      if (EMIT[id]) { const c = this.chunkAt(rx[k], rz[k]); const i = IDX(rx[k] & 15, ry[k], rz[k] & 15); c.light[i] = (c.light[i] & 0xF0) | EMIT[id]; qx[seeds] = rx[k]; qy[seeds] = ry[k]; qz[seeds] = rz[k]; seeds++; }
    }
    return seeds;
  }
  relight(x, y, z, oldId, newId) {
    const c = this.chunkAt(x, z); if (!c) return;
    const i = IDX(x & 15, y, z & 15);
    const oOp = OPA[oldId], nOp = OPA[newId], oEm = EMIT[oldId], nEm = EMIT[newId];
    // block light
    {
      let seeds = 0;
      const cur = c.light[i] & 15;
      if ((oEm > 0 || nOp > oOp) && cur > 0) { c.light[i] &= 0xF0; seeds = this.unpropagate(x, y, z, cur, 0); }
      if (nEm > 0) { c.light[i] = (c.light[i] & 0xF0) | nEm; this.qx[seeds] = x; this.qy[seeds] = y; this.qz[seeds] = z; seeds++; }
      if (nOp < oOp) seeds = this.pushNeighbours(x, y, z, seeds);
      if (seeds) this.propagate(seeds, 0);
    }
    if (this.hasSky) {
      let seeds = 0;
      const cur = c.light[i] >> 4;
      if (nOp > oOp && cur > 0) { c.light[i] &= 15; seeds = this.unpropagate(x, y, z, cur, 1); }
      if (nOp < oOp) seeds = this.pushNeighbours(x, y, z, seeds);
      if (seeds) this.propagate(seeds, 1);
    }
    c.dirty = true;
  }
  pushNeighbours(x, y, z, seeds) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (y + dy < 0 || y + dy >= CH) continue;
      this.qx[seeds] = x + dx; this.qy[seeds] = y + dy; this.qz[seeds] = z + dz; seeds++;
    }
    return seeds;
  }
  // ---------- block set & updates ----------
  setBlock(x, y, z, id, meta = 0, notify = true) {
    if (y < 0 || y >= CH) return false;
    const c = this.chunkAt(x, z); if (!c) return false;
    const i = IDX(x & 15, y, z & 15);
    const old = c.blocks[i];
    if (old === id && c.meta[i] === meta) return false;
    c.blocks[i] = id; c.meta[i] = meta;
    c.modified = true; c.dirty = true;
    if (old !== id) this.relight(x, y, z, old, id);
    // mark neighbour chunks dirty on borders
    const lx = x & 15, lz = z & 15;
    if (lx === 0) { const n = this.chunkAt(x - 1, z); if (n) n.dirty = true; }
    if (lx === 15) { const n = this.chunkAt(x + 1, z); if (n) n.dirty = true; }
    if (lz === 0) { const n = this.chunkAt(x, z - 1); if (n) n.dirty = true; }
    if (lz === 15) { const n = this.chunkAt(x, z + 1); if (n) n.dirty = true; }
    if (notify) {
      this.schedule(x, y, z, 1);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) this.schedule(x + dx, y + dy, z + dz, 1);
    }
    if (old && BLOCKS[old].use && (BLOCKS[old].use === 'chest' || BLOCKS[old].use === 'furnace') && !(id && BLOCKS[id].use === BLOCKS[old].use)) {
      const k = x + ',' + y + ',' + z, data = this.containers.get(k);
      if (data && this.onContainerBreak) this.onContainerBreak(x, y, z, data);
      this.containers.delete(k);
    }
    return true;
  }
  schedule(x, y, z, delay) {
    const k = x + ',' + y + ',' + z;
    const t = this.tick + delay;
    const cur = this.ticks.get(k);
    if (cur === undefined || cur > t) this.ticks.set(k, t);
  }
  processTicks(game) {
    this.tick++;
    let n = 0;
    const due = [];
    for (const [k, t] of this.ticks) { if (t <= this.tick) { due.push(k); if (++n > 400) break; } }
    for (const k of due) {
      this.ticks.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      this.updateBlock(x, y, z, game);
    }
  }
  isReplaceable(id) { return id === 0 || (BLOCKS[id] && BLOCKS[id].replaceable); }
  updateBlock(x, y, z, game) {
    const id = this.getBlock(x, y, z);
    if (!this.chunkAt(x, z)) return;
    if (!id) return;
    const b = BLOCKS[id];
    if (b.liquid) return this.updateFluid(x, y, z, id, game);
    const below = this.getBlock(x, y - 1, z);
    if (b.gravity) {
      if (this.isReplaceable(below) || LIQ[below]) { this.setBlock(x, y, z, 0); game.spawnFalling(x, y, z, id); return; }
    }
    if (b.powder) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) if (LIQ[this.getBlock(x + dx, y + dy, z + dz)] === 1) { this.setBlock(x, y, z, BID[b.powder]); return; }
    }
    if (b.shape === 'cross' || b.attach || id === BID.snow || b.name.endsWith('_carpet') || id === BID.cactus) {
      if (b.hanging) { const a = this.getBlock(x, y + 1, z); if (!a || !(FULL[a] || a === id)) { this.breakNatural(x, y, z, game); } return; }
      let ok = below !== 0 && (FULL[below] || below === id || BLOCKS[below].shape === 'box' && BLOCKS[below].solid);
      if (id === BID.sugar_cane) ok = below === id || ((below === BID.grass_block || below === BID.dirt || below === BID.sand || below === BID.red_sand || below === BID.podzol) && this.nearWater(x, y - 1, z));
      if (id === BID.cactus) ok = (below === BID.cactus || below === BID.sand || below === BID.red_sand) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { const n = this.getBlock(x + dx, y, z + dz); return n && BLOCKS[n].solid; });
      if (id === BID.bamboo) ok = below === id || FULL[below];
      if (id === BID.wheat_crop) ok = below === BID.farmland;
      if (id === BID.fire || id === BID.soul_fire) ok = FULL[below] || below === BID.obsidian;
      if (!ok) this.breakNatural(x, y, z, game);
    }
    if (id === BID.farmland) { const a = this.getBlock(x, y + 1, z); if (a && FULL[a]) this.setBlock(x, y, z, BID.dirt); }
    if (id === BID.grass_block) { const a = this.getBlock(x, y + 1, z); if (a && FULL[a]) this.setBlock(x, y, z, BID.dirt); }
    if (id === BID.nether_portal) {
      const ax = this.getMeta(x, y, z);
      const dirs = ax === 0 ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]] : [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
      for (const [dx, dy, dz] of dirs) { const n = this.getBlock(x + dx, y + dy, z + dz); if (n !== BID.obsidian && n !== BID.nether_portal) { this.setBlock(x, y, z, 0); break; } }
    }
  }
  nearWater(x, y, z) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => LIQ[this.getBlock(x + dx, y, z + dz)] === 1); }
  breakNatural(x, y, z, game) {
    const id = this.getBlock(x, y, z);
    this.setBlock(x, y, z, 0);
    if (game) game.dropBlockLoot(x, y, z, id, null, true);
  }
  updateFluid(x, y, z, id, game) {
    const L = LIQ[id];
    const meta = this.getMeta(x, y, z);
    const lvl = meta & 7, falling = meta & 8;
    const step = L === 2 && this.dim !== 'nether' ? 2 : 1;
    const delay = L === 1 ? 5 : (this.dim === 'nether' ? 10 : 30);
    // lava/water interaction
    if (L === 2) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) {
        if (LIQ[this.getBlock(x + dx, y + dy, z + dz)] === 1) { this.setBlock(x, y, z, lvl === 0 && !falling ? BID.obsidian : BID.cobblestone); game && game.sound('fizz', { x, y, z }); return; }
      }
    }
    // recompute flowing level
    if (lvl !== 0 || falling) {
      const above = this.getBlock(x, y + 1, z);
      let newMeta;
      if (LIQ[above] === L) newMeta = 8 | 1;
      else {
        let best = 99, sources = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.getBlock(x + dx, y, z + dz);
          if (LIQ[n] !== L) continue;
          const m = this.getMeta(x + dx, y, z + dz);
          const nl = (m & 8) ? 0 : (m & 7);
          if ((m & 7) === 0 && !(m & 8)) sources++;
          best = Math.min(best, nl);
        }
        const bel = this.getBlock(x, y - 1, z);
        if (L === 1 && sources >= 2 && (FULL[bel] || (LIQ[bel] === 1 && (this.getMeta(x, y - 1, z) & 15) === 0))) newMeta = 0;
        else if (best === 99 || best + step > 7) newMeta = -1;
        else newMeta = best + step;
      }
      if (newMeta === -1) { this.setBlock(x, y, z, 0); return; }
      if (newMeta !== meta) { this.setBlock(x, y, z, id, newMeta); return; }
    }
    // spread
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && (this.isReplaceable(below) && !LIQ[below] || (LIQ[below] === L && (this.getMeta(x, y - 1, z) & 15) !== 0 && !(this.getMeta(x, y - 1, z) & 8)))) {
      if (below && !LIQ[below] && BLOCKS[below].drop && game) game.dropBlockLoot(x, y - 1, z, below, null, true);
      this.setBlock(x, y - 1, z, id, 8 | 1);
      if (LIQ[below] === 0 || true) this.schedule(x, y - 1, z, delay);
      return;
    }
    if (LIQ[below] && LIQ[below] !== L) {
      if (L === 1 && LIQ[below] === 2) { this.setBlock(x, y - 1, z, (this.getMeta(x, y - 1, z) & 7) === 0 ? BID.obsidian : BID.stone); return; }
    }
    if (LIQ[below] === L) return;
    const cur = falling ? 0 : lvl;
    const next = cur + step;
    if (next > 7) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const n = this.getBlock(nx, y, nz);
      if (LIQ[n] === L) {
        const m = this.getMeta(nx, y, nz);
        if ((m & 8) === 0 && (m & 7) > next) { this.setBlock(nx, y, nz, id, next); this.schedule(nx, y, nz, delay); }
      } else if (LIQ[n] && LIQ[n] !== L) {
        if (L === 1) this.setBlock(nx, y, nz, (this.getMeta(nx, y, nz) & 7) === 0 ? BID.obsidian : BID.cobblestone);
        else this.setBlock(nx, y, nz, BID.stone);
      } else if (this.isReplaceable(n) && this.chunkAt(nx, nz)) {
        if (n && game) game.dropBlockLoot(nx, y, nz, n, null, true);
        this.setBlock(nx, y, nz, id, next);
        this.schedule(nx, y, nz, delay);
      }
    }
  }
  scheduleFluidAround(x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const id = this.getBlock(x + dx, y + dy, z + dz);
      if (LIQ[id]) this.schedule(x + dx, y + dy, z + dz, LIQ[id] === 1 ? 5 : 30);
    }
  }
  randomTick(game, px, pz) {
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx * 16 - px) > 96 || Math.abs(c.cz * 16 - pz) > 96) continue;
      for (let k = 0; k < 4; k++) {
        const lx = (Math.random() * 16) | 0, lz = (Math.random() * 16) | 0, y = 1 + ((Math.random() * (CH - 2)) | 0);
        const id = c.blocks[IDX(lx, y, lz)];
        if (!id) continue;
        const x = c.cx * 16 + lx, z = c.cz * 16 + lz;
        const b = BLOCKS[id];
        if (b.name.endsWith('_sapling') && Math.random() < 0.15) game.growTree(x, y, z, id);
        else if (id === BID.wheat_crop) { const m = c.meta[IDX(lx, y, lz)]; if (m < 7 && Math.random() < 0.3) this.setBlock(x, y, z, id, m + 1, false); }
        else if (id === BID.grass_block) {
          const nx = x + ((Math.random() * 3) | 0) - 1, ny = y + ((Math.random() * 3) | 0) - 1, nz = z + ((Math.random() * 3) | 0) - 1;
          if (this.getBlock(nx, ny, nz) === BID.dirt && !OPA[this.getBlock(nx, ny + 1, nz)] && (this.getLight(nx, ny + 1, nz) >> 4) >= 9) this.setBlock(nx, ny, nz, BID.grass_block, 0, false);
        } else if ((id === BID.sugar_cane || id === BID.cactus || id === BID.bamboo) && Math.random() < 0.2) {
          let h = 1; while (this.getBlock(x, y - h, z) === id) h++;
          if (h < (id === BID.bamboo ? 12 : 3) && this.getBlock(x, y + 1, z) === 0) this.setBlock(x, y + 1, z, id);
        } else if ((id === BID.fire) && Math.random() < 0.3) {
          const below = this.getBlock(x, y - 1, z);
          if (below !== BID.netherrack && below !== BID.magma_block) this.setBlock(x, y, z, 0);
        } else if (id === BID.ice && (c.light[IDX(lx, y, lz)] & 15) > 11) this.setBlock(x, y, z, BID.water);
      }
    }
  }
  highestSolid(x, z) {
    for (let y = CH - 1; y > 0; y--) { const id = this.getBlock(x, y, z); if (id && BLOCKS[id].solid && !LIQ[id]) return y; }
    return -1;
  }
}

// ---------------- mesher ----------------
const Mesher = {
  pb: new Uint16Array(18 * 18 * (CH + 2)),
  pl: new Uint8Array(18 * 18 * (CH + 2)),
  pm: new Uint8Array(18 * 18 * (CH + 2)),
  pt: new Uint8Array(18 * 18),
  build(world, c) {
    const pb = this.pb, pl = this.pl, pm = this.pm, pt = this.pt;
    const P = (x, y, z) => (x + 1) + (z + 1) * 18 + (y + 1) * 324;
    let maxY = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nc = world.getChunk(c.cx + dx, c.cz + dz);
      const x0 = dx === -1 ? 15 : 0, x1 = dx === 1 ? 0 : 15, z0 = dz === -1 ? 15 : 0, z1 = dz === 1 ? 0 : 15;
      for (let lz = z0; lz <= z1; lz++) for (let lx = x0; lx <= x1; lx++) {
        const px = lx + dx * 16, pz = lz + dz * 16;
        if (dx === 0 && dz === 0) pt[(px + 1) + (pz + 1) * 18] = c.biome[lx + lz * 16];
        else pt[(px + 1) + (pz + 1) * 18] = nc ? nc.biome[lx + lz * 16] : c.biome[Math.max(0, Math.min(15, lx)) + Math.max(0, Math.min(15, lz)) * 16];
        for (let y = 0; y < CH; y++) {
          const pi = P(px, y, pz);
          if (nc) { const i = IDX(lx, y, lz); pb[pi] = nc.blocks[i]; pl[pi] = nc.light[i]; pm[pi] = nc.meta[i]; if (dx === 0 && dz === 0 && nc.blocks[i] && y > maxY) maxY = y; }
          else { pb[pi] = BID.stone; pl[pi] = 0; pm[pi] = 0; }
        }
        pb[P(px, -1, pz)] = BID.bedrock; pl[P(px, -1, pz)] = 0;
        pb[P(px, CH, pz)] = 0; pl[P(px, CH, pz)] = world.hasSky ? 0xF0 : 0;
      }
    }
    // fill padded corners for out of range diag (already handled)
    const out = [this.newBuf(), this.newBuf(), this.newBuf()];
    const LUT = LIGHT_LUT;
    const tintFor = (bio, mode) => (mode ? (bio < 20 ? BIOMES[bio][2] : [1, 1, 1]) : null);
    for (let y = 0; y <= maxY; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const pi = P(x, y, z);
      const id = pb[pi];
      if (!id) continue;
      const b = BLOCKS[id];
      const buf = out[RENDER[id]];
      const bio = pt[(x + 1) + (z + 1) * 18];
      if (b.shape === 'cube') {
        const meta = pm[pi];
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const ni = P(x + F.n[0], y + F.n[1], z + F.n[2]);
          const nid = pb[ni];
          if (nid) {
            if (FULL[nid]) continue;
            if (nid === id && (b.render !== 'cutout' || b.glass)) continue;
            if (b.leaves && BLOCKS[nid].leaves) continue;
            if (b.render === 'trans' && RENDER[nid] === 2 && BLOCKS[nid].glass && b.glass) continue;
          }
          let tile = f === 2 ? b.faces.top : f === 3 ? b.faces.bottom : b.faces.side;
          if (b.facing && FACING_FACE[meta & 3] === f) tile = b.faces.front;
          const tint = (b.tint === 'all' || (b.tint === 'top' && f === 2)) ? tintFor(bio, true) : null;
          this.quadAO(buf, x, y, z, f, tile, pb, pl, P, LUT, tint);
        }
      } else if (b.shape === 'cross') {
        const lv = pl[pi];
        const sky = LUT[lv >> 4], bl = LUT[lv & 15];
        let tile = b.faces.side;
        if (id === BID.wheat_crop) tile = Mesher.wheatTiles[Math.min(7, pm[pi])];
        const tint = b.tint ? tintFor(bio, true) : null;
        const off = (hash3(c.cx * 16 + x, y, c.cz * 16 + z, 1) - 0.5) * 0.3, off2 = (hash3(c.cx * 16 + x, y, c.cz * 16 + z, 2) - 0.5) * 0.3;
        const a = 0.15, e = 0.85;
        this.quad(buf, [[x + a + off, y, z + a + off2], [x + e + off, y, z + e + off2], [x + e + off, y + 1, z + e + off2], [x + a + off, y + 1, z + a + off2]], tile, sky, bl, 1, tint);
        this.quad(buf, [[x + a + off, y, z + e + off2], [x + e + off, y, z + a + off2], [x + e + off, y + 1, z + a + off2], [x + a + off, y + 1, z + e + off2]], tile, sky, bl, 1, tint);
      } else if (b.shape === 'liquid') {
        this.liquid(buf, x, y, z, id, pb, pl, pm, P, LUT);
      } else if (b.shape === 'box') {
        const [x0, y0, z0, x1, y1, z1] = b.box;
        const meta = pm[pi];
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const atEdge = (f === 0 && x1 === 1) || (f === 1 && x0 === 0) || (f === 2 && y1 === 1) || (f === 3 && y0 === 0) || (f === 4 && z1 === 1) || (f === 5 && z0 === 0);
          const ni = P(x + F.n[0], y + F.n[1], z + F.n[2]);
          if (atEdge && FULL[pb[ni]]) continue;
          if (atEdge && pb[ni] === id && f !== 2 && f !== 3) continue;
          const lv = atEdge ? pl[ni] : pl[pi];
          const sky = LUT[lv >> 4], bl = LUT[lv & 15];
          let tile = f === 2 ? b.faces.top : f === 3 ? b.faces.bottom : b.faces.side;
          if (b.facing && FACING_FACE[meta & 3] === f) tile = b.faces.front;
          const v = F.c.map(cc => [x + (cc[0] ? x1 : x0), y + (cc[1] ? y1 : y0), z + (cc[2] ? z1 : z0)]);
          // crop uv
          let uvr;
          if (f < 2) uvr = f === 0 ? [1 - z1, y0, 1 - z0, y1] : [z0, y0, z1, y1];
          else if (f < 4) uvr = [x0, f === 2 ? 1 - z1 : z0, x1, f === 2 ? 1 - z0 : z1];
          else uvr = f === 4 ? [x0, y0, x1, y1] : [1 - x1, y0, 1 - x0, y1];
          this.quad(buf, v, tile, sky, bl, F.s, null, uvr);
        }
      } else if (b.shape === 'pane') {
        const lv = pl[pi];
        const sky = LUT[lv >> 4], bl = LUT[lv & 15];
        const ax = pm[pi] & 1;
        const t = b.faces.side;
        if (ax === 0) {
          this.quad(buf, [[x, y, z + 0.5], [x + 1, y, z + 0.5], [x + 1, y + 1, z + 0.5], [x, y + 1, z + 0.5]], t, sky, bl, 1);
          this.quad(buf, [[x + 1, y, z + 0.5], [x, y, z + 0.5], [x, y + 1, z + 0.5], [x + 1, y + 1, z + 0.5]], t, sky, bl, 1);
        } else {
          this.quad(buf, [[x + 0.5, y, z], [x + 0.5, y, z + 1], [x + 0.5, y + 1, z + 1], [x + 0.5, y + 1, z]], t, sky, bl, 1);
          this.quad(buf, [[x + 0.5, y, z + 1], [x + 0.5, y, z], [x + 0.5, y + 1, z], [x + 0.5, y + 1, z + 1]], t, sky, bl, 1);
        }
      }
    }
    return out;
  },
  newBuf() { return { pos: [], uv: [], light: [], col: [], idx: [], n: 0 }; },
  quad(buf, v, tile, sky, bl, shade, tint, uvr) {
    const uv = TEX.uv(tile);
    let u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3];
    if (uvr) { const du = u1 - u0, dv = v1 - v0; const a = u0 + du * uvr[0], b = v0 + dv * uvr[1], c = u0 + du * uvr[2], d = v0 + dv * uvr[3]; u0 = a; v0 = b; u1 = c; v1 = d; }
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    for (let k = 0; k < 4; k++) {
      buf.pos.push(v[k][0], v[k][1], v[k][2]); buf.uv.push(uvs[k * 2], uvs[k * 2 + 1]);
      buf.light.push(sky, bl); buf.col.push(tr * shade, tg * shade, tb * shade);
    }
    const n = buf.n;
    buf.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    buf.n += 4;
  },
  quadAO(buf, x, y, z, f, tile, pb, pl, P, LUT, tint) {
    const F = FACES[f];
    const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
    const uv = TEX.uv(tile);
    const uvs = [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]];
    const ao = [0, 0, 0, 0];
    const n0 = buf.n;
    // tangent axes
    const ax = F.n[0] !== 0 ? 0 : F.n[1] !== 0 ? 1 : 2;
    const t1 = ax === 0 ? 1 : 0, t2 = ax === 2 ? 1 : 2;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    const base = [nx, ny, nz];
    for (let k = 0; k < 4; k++) {
      const cc = F.c[k];
      const d1 = cc[t1] ? 1 : -1, d2 = cc[t2] ? 1 : -1;
      const p1 = base.slice(); p1[t1] += d1;
      const p2 = base.slice(); p2[t2] += d2;
      const p3 = base.slice(); p3[t1] += d1; p3[t2] += d2;
      const i0 = P(nx, ny, nz), i1 = P(p1[0], p1[1], p1[2]), i2 = P(p2[0], p2[1], p2[2]), i3 = P(p3[0], p3[1], p3[2]);
      const s1 = FULL[pb[i1]], s2 = FULL[pb[i2]], s3 = FULL[pb[i3]];
      const a = (s1 && s2) ? 0 : 3 - (s1 + s2 + s3);
      ao[k] = a;
      let ss = pl[i0] >> 4, sb = pl[i0] & 15, cnt = 1;
      if (!s1) { ss += pl[i1] >> 4; sb += pl[i1] & 15; cnt++; }
      if (!s2) { ss += pl[i2] >> 4; sb += pl[i2] & 15; cnt++; }
      if (!s3 && !(s1 && s2)) { ss += pl[i3] >> 4; sb += pl[i3] & 15; cnt++; }
      const sky = LUT[Math.round(ss / cnt)], bl = LUT[Math.round(sb / cnt)];
      const sh = F.s * (0.55 + a * 0.15);
      buf.pos.push(x + cc[0], y + cc[1], z + cc[2]); buf.uv.push(uvs[k * 2], uvs[k * 2 + 1]);
      buf.light.push(sky, bl); buf.col.push(tr * sh, tg * sh, tb * sh);
    }
    if (ao[0] + ao[2] < ao[1] + ao[3]) buf.idx.push(n0 + 1, n0 + 2, n0 + 3, n0 + 1, n0 + 3, n0);
    else buf.idx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
    buf.n += 4;
  },
  liquid(buf, x, y, z, id, pb, pl, pm, P, LUT) {
    const L = LIQ[id];
    const hAt = (xx, zz) => {
      const i = P(xx, y, zz);
      if (LIQ[pb[i]] !== L) return -1;
      if (LIQ[pb[P(xx, y + 1, zz)]] === L) return 1;
      const m = pm[i];
      return (m & 8) ? 0.9 : m === 0 ? 0.88 : 0.88 - (m & 7) / 8 * 0.75;
    };
    const top = LIQ[pb[P(x, y + 1, z)]] === L;
    // smooth corner heights
    const ch = (dx, dz) => {
      if (top) return 1;
      let s = 0, n = 0;
      for (const [ox, oz] of [[0, 0], [dx, 0], [0, dz], [dx, dz]]) {
        if (LIQ[pb[P(x + ox, y + 1, z + oz)]] === L) return 1;
        const h = hAt(x + ox, z + oz);
        if (h >= 0) { s += h; n++; }
      }
      return n ? s / n : 0.88;
    };
    const h00 = ch(-1, -1), h10 = ch(1, -1), h01 = ch(-1, 1), h11 = ch(1, 1);
    const tile = BLOCKS[id].faces.top;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const ni = P(x + F.n[0], y + F.n[1], z + F.n[2]);
      const nid = pb[ni];
      if (LIQ[nid] === L) continue;
      if (FULL[nid] && f !== 2) continue;
      if (f === 2 && top) continue;
      const lv = Math.max(pl[ni], pl[P(x, y, z)]);
      const sky = LUT[lv >> 4], bl = L === 2 ? 1 : LUT[lv & 15];
      const v = F.c.map(cc => {
        let hy = 0;
        if (cc[1]) hy = cc[0] ? (cc[2] ? h11 : h10) : (cc[2] ? h01 : h00);
        return [x + cc[0], y + hy, z + cc[2]];
      });
      this.quad(buf, v, tile, sky, bl, F.s, null);
      if (f === 2 && L === 1) this.quad(buf, [v[1], v[0], v[3], v[2]], tile, sky, bl, 0.7, null);
    }
  },
};

// 미로 생성(재귀 백트래킹) + 격자 유틸. grid[z][x] : 1=벽, 0=통로
export const N = 15;          // 15x15 타일 (통로 칸 7x7)
export const TILE = 3;        // 타일 한 변 3m
export const WALL_H = 3.2;    // 벽 높이

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMaze(rng) {
  const g = Array.from({ length: N }, () => new Array(N).fill(1));
  const stack = [[1, 1]];
  g[1][1] = 0;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const opts = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dz]) => {
      const x = cx + dx, z = cz + dz;
      return x > 0 && z > 0 && x < N - 1 && z < N - 1 && g[z][x] === 1;
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dz] = opts[Math.floor(rng() * opts.length)];
    g[cz + dz / 2][cx + dx / 2] = 0;
    g[cz + dz][cx + dx] = 0;
    stack.push([cx + dx, cz + dz]);
  }
  return g;
}

export const tileOf = (v) => Math.floor(v / TILE);
export const centerOf = (i) => (i + 0.5) * TILE;
export const isWall = (g, x, z) => x < 0 || z < 0 || x >= N || z >= N || g[z][x] === 1;
export const wallAt = (g, wx, wz) => isWall(g, tileOf(wx), tileOf(wz));

export function openTiles(g) {
  const out = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (!g[z][x]) out.push([x, z]);
  return out;
}

export function openNeighbors(g, x, z) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dz]) => [x + dx, z + dz, dx, dz])
    .filter(([nx, nz]) => !isWall(g, nx, nz));
}

// 원(반지름 r)이 벽 타일과 겹치면 밀어낸다 (슬라이딩 충돌)
export function pushOut(g, p, r) {
  for (let it = 0; it < 2; it++) {
    const tx = tileOf(p.x), tz = tileOf(p.z);
    for (let z = tz - 1; z <= tz + 1; z++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        if (!isWall(g, x, z)) continue;
        const minX = x * TILE, maxX = minX + TILE, minZ = z * TILE, maxZ = minZ + TILE;
        const cx = Math.max(minX, Math.min(p.x, maxX));
        const cz = Math.max(minZ, Math.min(p.z, maxZ));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-9) { // 타일 내부 (드문 경우): 가장 가까운 면으로
          const l = p.x - minX, rr = maxX - p.x, t = p.z - minZ, b = maxZ - p.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) p.x = minX - r; else if (m === rr) p.x = maxX + r;
          else if (m === t) p.z = minZ - r; else p.z = maxZ + r;
          continue;
        }
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      }
    }
  }
}

// 두 점 사이에 벽이 없는가
export function hasLOS(g, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const d = Math.hypot(dx, dz);
  const steps = Math.ceil(d / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (wallAt(g, ax + dx * t, az + dz * t)) return false;
  }
  return true;
}

// 3D 광선이 벽/바닥/천장에 닿는 거리 (히트스캔용)
export function rayWorldDist(g, o, d, maxD) {
  const step = 0.05;
  for (let t = step; t < maxD; t += step) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < 0 || y > WALL_H || wallAt(g, x, z)) return t;
  }
  return maxD;
}

export function bfsDist(g, sx, sz) {
  const dist = Array.from({ length: N }, () => new Array(N).fill(-1));
  const q = [[sx, sz]]; dist[sz][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    for (const [nx, nz] of openNeighbors(g, x, z)) {
      if (dist[nz][nx] < 0) { dist[nz][nx] = dist[z][x] + 1; q.push([nx, nz]); }
    }
  }
  return dist;
}

// 타일 경로 (시작 포함) — 없으면 []
export function findPath(g, a, b) {
  const prev = Array.from({ length: N }, () => new Array(N).fill(null));
  const seen = Array.from({ length: N }, () => new Array(N).fill(false));
  const q = [a]; seen[a[1]][a[0]] = true;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    if (x === b[0] && z === b[1]) break;
    for (const [nx, nz] of openNeighbors(g, x, z)) {
      if (!seen[nz][nx]) { seen[nz][nx] = true; prev[nz][nx] = [x, z]; q.push([nx, nz]); }
    }
  }
  if (!seen[b[1]][b[0]]) return [];
  const path = []; let c = b;
  while (c) { path.push(c); c = prev[c[1]][c[0]]; }
  return path.reverse();
}

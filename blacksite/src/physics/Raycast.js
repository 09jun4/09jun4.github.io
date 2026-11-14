// 레이 교차 판정 유틸 (슬랩 방식 AABB, 구, 수직 캡슐).

// 레이 vs AABB. 맞으면 { t, nx, ny, nz } (t는 0 ≤ t ≤ maxT)
export function rayAABB(ox, oy, oz, dx, dy, dz, b, maxT = Infinity) {
  let tmin = 0, tmax = maxT, nx = 0, ny = 0, nz = 0;
  // X
  if (Math.abs(dx) < 1e-12) { if (ox < b.minX || ox > b.maxX) return null; } else {
    const inv = 1 / dx;
    let t1 = (b.minX - ox) * inv, t2 = (b.maxX - ox) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = s; ny = 0; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Y
  if (Math.abs(dy) < 1e-12) { if (oy < b.minY || oy > b.maxY) return null; } else {
    const inv = 1 / dy;
    let t1 = (b.minY - oy) * inv, t2 = (b.maxY - oy) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = s; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Z
  if (Math.abs(dz) < 1e-12) { if (oz < b.minZ || oz > b.maxZ) return null; } else {
    const inv = 1 / dz;
    let t1 = (b.minZ - oz) * inv, t2 = (b.maxZ - oz) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { t: tmin, nx, ny, nz };
}

// 레이 vs 구. 맞으면 t
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const h = b * b - c;
  if (h < 0) return -1;
  const s = Math.sqrt(h);
  const t = -b - s;
  if (t >= 0) return t;
  const t2 = -b + s;
  return t2 >= 0 ? 0 : -1;
}

// 레이 vs 수직 캡슐 (바닥 중심 x,z, 구간 y0~y1, 반지름 r). 맞으면 t
export function rayVerticalCapsule(ox, oy, oz, dx, dy, dz, x, z, y0, y1, r) {
  let best = -1;
  // 원기둥 몸통
  const a = dx * dx + dz * dz;
  if (a > 1e-12) {
    const lx = ox - x, lz = oz - z;
    const b = lx * dx + lz * dz;
    const c = lx * lx + lz * lz - r * r;
    const h = b * b - a * c;
    if (h >= 0) {
      const t = (-b - Math.sqrt(h)) / a;
      const y = oy + dy * t;
      if (t >= 0 && y >= y0 + r && y <= y1 - r) best = t;
    }
  }
  const t0 = raySphere(ox, oy, oz, dx, dy, dz, x, y0 + r, z, r);
  if (t0 >= 0 && (best < 0 || t0 < best)) best = t0;
  const t1 = raySphere(ox, oy, oz, dx, dy, dz, x, y1 - r, z, r);
  if (t1 >= 0 && (best < 0 || t1 < best)) best = t1;
  return best;
}

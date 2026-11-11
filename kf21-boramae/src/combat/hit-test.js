// 명중 판정(순수 함수). 벡터는 {x,y,z} 형태면 된다.

/**
 * 레이(origin, 단위벡터 dir)와 구의 교차. 가장 가까운 교차 거리 t(>=0)를 돌려주고, 없으면 -1.
 */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const t = lx * dx + ly * dy + lz * dz; // 레이 위에서 구 중심에 가장 가까운 점
  const d2 = lx * lx + ly * ly + lz * lz - t * t;
  const r2 = radius * radius;
  if (d2 > r2) return -1;
  const h = Math.sqrt(r2 - d2);
  if (t + h < 0) return -1; // 구가 완전히 뒤에 있다
  return Math.max(0, t - h);
}

/**
 * 조준 레이에 걸리는 표적 판정. 판정 반경은 max(기본 반경, 거리 × tan(보정각))이라
 * 멀리 있는 작은 표적도 화면에서 일정한 크기로 맞힐 수 있다.
 * @returns {number} 레이를 따라 표적까지의 거리, 빗나가면 -1
 */
export function aimHit(ox, oy, oz, dx, dy, dz, cx, cy, cz, baseRadius, assistTan, maxRange) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const t = lx * dx + ly * dy + lz * dz;
  if (t <= 0 || t > maxRange) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - t * t;
  const r = Math.max(baseRadius, t * assistTan);
  return d2 <= r * r ? t : -1;
}

/**
 * 선분 p0→p1 이 구에 닿는지(빠른 발사체의 터널링 방지).
 */
export function segmentSphere(p0x, p0y, p0z, p1x, p1y, p1z, cx, cy, cz, radius) {
  const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((cx - p0x) * dx + (cy - p0y) * dy + (cz - p0z) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = p0x + dx * t - cx, ey = p0y + dy * t - cy, ez = p0z + dz * t - cz;
  return ex * ex + ey * ey + ez * ez <= radius * radius;
}

/** 두 단위벡터 사이의 각(rad) */
export function angleBetween(ax, ay, az, bx, by, bz) {
  const d = ax * bx + ay * by + az * bz;
  return Math.acos(d > 1 ? 1 : d < -1 ? -1 : d);
}

// CollisionSystem — 렌더링과 분리된 2D(XZ 평면) 충돌 판정.
// 정적 물체: 건물(회전된 사각형 OBB), 나무·가로등·표지판(원)
// 동적 물체: 이벤트가 등록하는 행인·자동차·동물·공사 장애물 등 (매 프레임 위치 갱신)
const CELL = 16;
const key = (gx, gz) => gx * 73856093 ^ gz * 19349663;

export class CollisionSystem {
  constructor() {
    this.grid = new Map();
    this.boxes = [];   // {x, z, hx, hz, rot, cos, sin, h, y, tag}
    this.dynamic = new Set();
  }

  _insert(obj, minX, maxX, minZ, maxZ) {
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++)
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const k = key(gx, gz);
        let c = this.grid.get(k);
        if (!c) this.grid.set(k, (c = []));
        c.push(obj);
      }
  }

  // 회전된 사각형 (hx: 좌우 절반, hz: 앞뒤 절반, rot: Y축 회전)
  addBox(x, z, hx, hz, rot, { tag = 'building', y = 0, h = 10 } = {}) {
    const b = { kind: 'box', x, z, hx, hz, rot, cos: Math.cos(rot), sin: Math.sin(rot), tag, y, h };
    const r = Math.hypot(hx, hz);
    this._insert(b, x - r, x + r, z - r, z + r);
    this.boxes.push(b);
    return b;
  }
  addCircle(x, z, r, { tag = 'pole', y = 0, h = 4 } = {}) {
    const c = { kind: 'circle', x, z, r, tag, y, h };
    this._insert(c, x - r, x + r, z - r, z + r);
    return c;
  }

  // 동적 물체: {x, z, r, tag, onHit(player, info), active}
  addDynamic(obj) { this.dynamic.add(obj); return obj; }
  removeDynamic(obj) { this.dynamic.delete(obj); }

  // 원(플레이어)과 겹치는 정적 물체 → 밀어내기 벡터 반환 (없으면 null)
  resolveStatic(x, z, r, out = {}) {
    const cell = this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!cell) return null;
    let hit = null;
    for (const o of cell) {
      if (o.kind === 'circle') {
        const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = r + o.r;
        if (d < m && d > 1e-6) {
          hit = out; out.nx = dx / d; out.nz = dz / d; out.depth = m - d; out.obj = o;
          x += out.nx * out.depth; z += out.nz * out.depth;
        }
      } else {
        // 사각형 로컬 좌표로 변환
        const dx = x - o.x, dz = z - o.z;
        const lx = dx * o.cos - dz * o.sin, lz = dx * o.sin + dz * o.cos;
        const cx = Math.max(-o.hx, Math.min(o.hx, lx)), cz = Math.max(-o.hz, Math.min(o.hz, lz));
        let ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
        if (d < r) {
          let nlx, nlz, depth;
          if (d > 1e-6) { nlx = ex / d; nlz = ez / d; depth = r - d; }
          else { // 중심이 안에 들어간 경우: 가장 가까운 면으로
            const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
            if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; depth = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; depth = pz + r; }
          }
          // 월드 방향으로 되돌리기
          const nx = nlx * o.cos + nlz * o.sin, nz = -nlx * o.sin + nlz * o.cos;
          hit = out; out.nx = nx; out.nz = nz; out.depth = depth; out.obj = o;
          x += nx * depth; z += nz * depth;
        }
      }
    }
    if (hit) { out.x = x; out.z = z; }
    return hit;
  }

  // 동적 물체와의 겹침 목록
  overlapDynamic(x, z, r, list = []) {
    list.length = 0;
    for (const o of this.dynamic) {
      if (!o.active) continue;
      const dx = x - o.x, dz = z - o.z, m = r + o.r;
      if (dx * dx + dz * dz < m * m) list.push(o);
    }
    return list;
  }

  // 카메라 관통 방지: 선분 a→b가 건물에 처음 닿는 비율(0~1), 없으면 1
  raycastBoxes(ax, ay, az, bx, by, bz, pad = 0.4) {
    let tMin = 1;
    const minX = Math.min(ax, bx) - 2, maxX = Math.max(ax, bx) + 2, minZ = Math.min(az, bz) - 2, maxZ = Math.max(az, bz) + 2;
    const seen = new Set();
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++)
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const cell = this.grid.get(key(gx, gz));
        if (!cell) continue;
        for (const o of cell) {
          if (o.kind !== 'box' || seen.has(o)) continue;
          seen.add(o);
          // 로컬 좌표에서 슬랩 교차
          const tx = (px, pz) => { const dx = px - o.x, dz = pz - o.z; return [dx * o.cos - dz * o.sin, dx * o.sin + dz * o.cos]; };
          const [lax, laz] = tx(ax, az), [lbx, lbz] = tx(bx, bz);
          const d = [lbx - lax, by - ay, lbz - laz], s = [lax, ay, laz];
          const lo = [-o.hx - pad, o.y - 1, -o.hz - pad], hi = [o.hx + pad, o.y + o.h + pad, o.hz + pad];
          let t0 = 0, t1 = 1, ok = true;
          for (let k = 0; k < 3 && ok; k++) {
            if (Math.abs(d[k]) < 1e-9) { if (s[k] < lo[k] || s[k] > hi[k]) ok = false; continue; }
            let ta = (lo[k] - s[k]) / d[k], tb = (hi[k] - s[k]) / d[k];
            if (ta > tb) [ta, tb] = [tb, ta];
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) ok = false;
          }
          if (ok && t0 < tMin) tMin = t0;
        }
      }
    return tMin;
  }

  // 점 주변에 물체가 있는지 (장식 배치·이벤트 생성 시 겹침 방지)
  isFree(x, z, r) {
    const tmp = {};
    return !this.resolveStatic(x, z, r, tmp);
  }
}

// 자체 간단 충돌: 축 정렬 박스(AABB) 월드 + 원기둥(캡슐 근사) 캐릭터.
// 외부 물리 엔진 없이 벽·문·소품과의 밀어내기와 레이캐스트를 처리해요.
import { rayAABB } from './Raycast.js';

export function makeBox(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    type: opts.type || 'wall',
    solid: opts.solid !== false, // 이동 차단
    blocksVision: opts.blocksVision !== false,
    blocksBullets: opts.blocksBullets !== false,
    material: opts.material || 'concrete', // 탄착음 등
    ref: opts.ref || null,
    enabled: true,
  };
}

export function boxFromObject(box3, opts) {
  return makeBox(box3.min.x, box3.min.y, box3.min.z, box3.max.x, box3.max.y, box3.max.z, opts);
}

export class CollisionWorld {
  constructor() { this.boxes = []; }
  add(b) { this.boxes.push(b); return b; }
  remove(b) { const i = this.boxes.indexOf(b); if (i >= 0) this.boxes.splice(i, 1); }
  clear() { this.boxes.length = 0; }

  // 원(반지름 r, 높이 구간 y0~y1)을 박스 밖으로 밀어낸다. pos = {x, z}를 직접 수정.
  resolveCircle(pos, r, y0, y1, iterations = 3) {
    let hit = false;
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.enabled || !b.solid) continue;
        if (y1 <= b.minY || y0 >= b.maxY) continue;
        const cx = pos.x < b.minX ? b.minX : pos.x > b.maxX ? b.maxX : pos.x;
        const cz = pos.z < b.minZ ? b.minZ : pos.z > b.maxZ ? b.maxZ : pos.z;
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // 중심이 박스 안: 가장 가까운 면으로 밀어냄
          const l = pos.x - b.minX, rr = b.maxX - pos.x, f = pos.z - b.minZ, k = b.maxZ - pos.z;
          const m = Math.min(l, rr, f, k);
          if (m === l) pos.x = b.minX - r; else if (m === rr) pos.x = b.maxX + r;
          else if (m === f) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
        }
        moved = true; hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // 이동 + 충돌. 큰 이동은 나눠서 처리해 벽을 뚫지 않게 한다.
  moveCircle(pos, dx, dz, r, y0, y1) {
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
    for (let i = 0; i < steps; i++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      this.resolveCircle(pos, r, y0, y1);
    }
    return pos;
  }

  // 원이 박스와 겹치는지 (문 닫힘 가능 여부 등)
  overlapsCircle(box, x, z, r) {
    const cx = Math.max(box.minX, Math.min(x, box.maxX));
    const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
  }

  // 레이캐스트: 방향(dx,dy,dz)은 정규화되어 있어야 한다. filter: 'vision' | 'bullet' | 'solid' | fn
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter = 'solid') {
    let best = null;
    let bestT = maxDist;
    for (const b of this.boxes) {
      if (!b.enabled) continue;
      if (filter === 'vision' ? !b.blocksVision : filter === 'bullet' ? !b.blocksBullets : filter === 'solid' ? !b.solid : !filter(b)) continue;
      const hit = rayAABB(ox, oy, oz, dx, dy, dz, b, bestT);
      if (hit) { bestT = hit.t; best = { dist: hit.t, box: b, nx: hit.nx, ny: hit.ny, nz: hit.nz }; }
    }
    // 바닥(y=0)
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t >= 0 && t < bestT) { bestT = t; best = { dist: t, box: null, nx: 0, ny: 1, nz: 0, floor: true }; }
    }
    if (best) {
      best.x = ox + dx * best.dist; best.y = oy + dy * best.dist; best.z = oz + dz * best.dist;
    }
    return best;
  }

  // a에서 b까지 시야가 트였는지
  lineOfSight(ax, ay, az, bx, by, bz, filter = 'vision') {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return true;
    return !this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, filter);
  }
}

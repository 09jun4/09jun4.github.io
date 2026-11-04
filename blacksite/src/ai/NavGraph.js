// 길찾기 그래프: 맵 JSON의 nav 지점 + 문 양쪽 지점. 서로 막힘없이 보이는 지점끼리 연결하고 A*로 경로를 찾는다.
const CLEAR_R = 0.26;

export class NavGraph {
  constructor(facility, collision) {
    this.collision = collision;
    this.nodes = [];
    for (const [x, z] of facility.map.nav || []) this.nodes.push({ x, z, edges: [] });
    // 문 양쪽 지점은 문을 통해서만 연결
    for (const d of facility.doors) {
      const a = { x: d.sides[0][0], z: d.sides[0][1], edges: [], door: d };
      const b = { x: d.sides[1][0], z: d.sides[1][1], edges: [], door: d };
      this.nodes.push(a, b);
      a.edges.push({ to: b, door: d, cost: dist(a, b) });
      b.edges.push({ to: a, door: d, cost: dist(a, b) });
    }
    const n = this.nodes;
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        const a = n[i], b = n[j];
        if (a.door && a.door === b.door) continue;
        if (dist(a, b) > 18) continue;
        if (this.clear(a.x, a.z, b.x, b.z)) {
          const c = dist(a, b);
          a.edges.push({ to: b, cost: c });
          b.edges.push({ to: a, cost: c });
        }
      }
    }
  }

  // 원(반지름 CLEAR_R)이 a→b로 막힘없이 지나갈 수 있는지 (닫힌 문은 막힘으로 본다)
  clear(ax, az, bx, bz, ignoreDoors = false) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-4) return true;
    const ux = dx / L, uz = dz / L, px = -uz * CLEAR_R, pz = ux * CLEAR_R;
    const filter = ignoreDoors ? (b) => b.solid && b.type !== 'door' : 'solid';
    for (const off of [-1, 0, 1]) {
      const ox = ax + px * off, oz = az + pz * off;
      for (const y of [0.4, 1.2]) {
        if (this.collision.raycast(ox, y, oz, ux, 0, uz, L, filter)) return false;
      }
    }
    return true;
  }

  nearestVisible(x, z, ignoreDoors) {
    let best = null, bd = Infinity;
    for (const nd of this.nodes) {
      const d = (nd.x - x) ** 2 + (nd.z - z) ** 2;
      if (d < bd && this.clear(x, z, nd.x, nd.z, ignoreDoors)) { bd = d; best = nd; }
    }
    return best;
  }

  // → [{x, z, door?}, ...] (마지막은 목표 지점). 경로가 없으면 null
  findPath(fx, fz, tx, tz) {
    if (this.clear(fx, fz, tx, tz)) return [{ x: tx, z: tz }];
    const start = this.nearestVisible(fx, fz, true);
    const goal = this.nearestVisible(tx, tz, true);
    if (!start || !goal) return null;
    const open = new Set([start]);
    const g = new Map([[start, 0]]), f = new Map([[start, dist(start, goal)]]), came = new Map();
    while (open.size) {
      let cur = null, cf = Infinity;
      for (const nd of open) { const v = f.get(nd); if (v < cf) { cf = v; cur = nd; } }
      if (cur === goal) break;
      open.delete(cur);
      for (const e of cur.edges) {
        const ng = g.get(cur) + e.cost;
        if (ng < (g.get(e.to) ?? Infinity)) {
          came.set(e.to, { from: cur, door: e.door });
          g.set(e.to, ng);
          f.set(e.to, ng + dist(e.to, goal));
          open.add(e.to);
        }
      }
    }
    if (!came.has(goal) && goal !== start) return null;
    const path = [];
    let nd = goal;
    while (nd && nd !== start) {
      const c = came.get(nd);
      path.unshift({ x: nd.x, z: nd.z, door: c.door || null });
      nd = c.from;
    }
    path.unshift({ x: start.x, z: start.z });
    path.push({ x: tx, z: tz });
    return path;
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

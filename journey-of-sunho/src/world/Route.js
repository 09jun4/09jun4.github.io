// Route — 챕터 코스(학원 → 집). 맵의 routes 정의([{road, from, to}])를 이어 붙인 하나의 경로예요.
// 진행 거리(s), 남은 거리, 경로 위 점, 다음 교차로 등을 계산해요.
import { clamp, lerp } from '../core/utils.js';

export class Route {
  constructor(roads, def) {
    this.roads = roads;
    this.points = []; // {x, z, y, s, road}
    this.legs = [];
    for (const leg of def) {
      const road = roads.byId[leg.road];
      if (!road) throw new Error(`코스에 없는 도로: ${leg.road}`);
      const s0 = roads.projectOnRoad(road, leg.from[0], leg.from[1]).s;
      const s1 = roads.projectOnRoad(road, leg.to[0], leg.to[1]).s;
      const dir = s1 >= s0 ? 1 : -1;
      const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 2));
      this.legs.push({ road, s0, s1, startIndex: this.points.length });
      for (let k = 0; k <= n; k++) {
        if (k === 0 && this.points.length) continue;
        const p = roads.pointOnRoad(road, lerp(s0, s1, k / n));
        this.points.push({ x: p.x, z: p.z, y: p.y, road, dir });
      }
    }
    let acc = 0;
    this.points.forEach((p, i) => {
      if (i) acc += Math.hypot(p.x - this.points[i - 1].x, p.z - this.points[i - 1].z);
      p.s = acc;
    });
    this.length = acc;
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[Math.max(0, i - 1)], b = this.points[Math.min(this.points.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      this.points[i].tx = (b.x - a.x) / l; this.points[i].tz = (b.z - a.z) / l;
    }
    // 코스가 지나는 교차로 (미니맵·안내용)
    this.turns = [];
    for (const f of roads.intersections) {
      const pr = this.project(f.x, f.z, 0, true);
      if (pr.dist < 6) this.turns.push({ s: pr.s, isect: f });
    }
    this.turns.sort((a, b) => a.s - b.s);
    this._last = 0;
  }

  pointAt(s) {
    s = clamp(s, 0, this.length);
    const P = this.points;
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
    const a = P[lo], b = P[hi];
    const t = clamp((s - a.s) / ((b.s - a.s) || 1), 0, 1);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), tx: lerp(a.tx, b.tx, t), tz: lerp(a.tz, b.tz, t), road: a.road, dir: a.dir };
  }
  headingAt(s) { const p = this.pointAt(s); return Math.atan2(p.tx, p.tz); }

  // 경로에 투영. 플레이어 진행도는 직전 위치 근처만 찾아서(되돌아가는 길·교차 구간에서 튀지 않게) 계산해요.
  project(x, z, hint = this._last, global = false) {
    const P = this.points;
    let i0 = 0, i1 = P.length - 2;
    if (!global) {
      let hi = 0; { let lo = 0, h = P.length - 1; while (h - lo > 1) { const m = (lo + h) >> 1; if (P[m].s <= hint) lo = m; else h = m; } hi = lo; }
      i0 = Math.max(0, hi - 40); i1 = Math.min(P.length - 2, hi + 60);
    }
    let best = { d: Infinity };
    for (let i = i0; i <= i1; i++) {
      const a = P[i], b = P[i + 1];
      const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1);
      const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
      if (d < best.d) best = { d, s: lerp(a.s, b.s, t), i };
    }
    if (!global && best.d > 60) { const r = this.project(x, z, 0, true); this._last = r.s; return r; }
    if (!global) this._last = best.s;
    return { s: best.s, dist: best.d };
  }

  nextTurn(s) { return this.turns.find((t) => t.s > s + 2) || null; }
}

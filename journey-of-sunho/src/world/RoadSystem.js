// RoadSystem — 맵 데이터(도로 중심선 + 폭 + 높이)로 3D 도로 메시와 노면 질의 기능을 만들어요.
// 차도/인도/연석/횡단보도/교차로를 각각 별도 메시와 판정 영역으로 구분해요.
// 게임 로직은 query(x, z)로만 도로 정보를 얻으므로, 맵이 바뀌어도 다른 시스템은 그대로 둬도 돼요.
import * as THREE from '../lib/three.js';
import { clamp, lerp } from '../core/utils.js';
import { asphaltTexture, sidewalkTexture, crosswalkTexture } from '../core/Textures.js';

export const ROAD_LIFT = 0.02;   // 차도 표면 높이 (지면 기준)
export const CURB_HEIGHT = 0.16; // 인도 연석 높이
const SAMPLE_STEP = 2;           // 도로 중심선 샘플 간격 (m)
const CELL = 20;                 // 공간 격자 크기 (m)

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// 제어점 → 2m 간격으로 고르게 나눈 샘플 [{x, z, y, s, tx, tz}]
function sampleCenterline(points) {
  const dense = [];
  const P = (i) => points[clamp(i, 0, points.length - 1)];
  for (let i = 0; i < points.length - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    const len = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const n = Math.max(2, Math.ceil(len / 0.5));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      // 높이는 직선 보간 + 부드러운 곡선(위아래로 튀지 않게)
      const ty = t * t * (3 - 2 * t);
      dense.push([catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t), lerp(b[2] || 0, c[2] || 0, ty)]);
    }
  }
  const last = points[points.length - 1];
  dense.push([last[0], last[1], last[2] || 0]);
  // 호 길이로 재샘플
  const out = [{ x: dense[0][0], z: dense[0][1], y: dense[0][2], s: 0 }];
  let acc = 0, nextS = SAMPLE_STEP;
  for (let i = 1; i < dense.length; i++) {
    const [x0, z0, y0] = dense[i - 1], [x1, z1, y1] = dense[i];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    while (acc + seg >= nextS) {
      const t = (nextS - acc) / seg;
      out.push({ x: lerp(x0, x1, t), z: lerp(z0, z1, t), y: lerp(y0, y1, t), s: nextS });
      nextS += SAMPLE_STEP;
    }
    acc += seg;
  }
  const end = dense[dense.length - 1];
  if (acc - out[out.length - 1].s > 0.3) out.push({ x: end[0], z: end[1], y: end[2], s: acc });
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / l; out[i].tz = (b.z - a.z) / l;
  }
  return out;
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sZ - (cz - az) * sX) / den;
  const u = ((cx - ax) * rZ - (cz - az) * rX) / den;
  if (t < -0.02 || t > 1.02 || u < -0.02 || u > 1.02) return null;
  return [ax + rX * t, az + rZ * t];
}

export class RoadSystem {
  constructor(map) {
    this.map = map;
    this.roads = map.roads.map((r) => {
      const samples = sampleCenterline(r.points);
      return {
        id: r.id, name: r.name || r.id, halfW: r.width / 2, sidewalk: r.sidewalk ?? 2.5, lanes: r.lanes ?? 2,
        samples, length: samples[samples.length - 1].s, isects: [], crosswalks: [],
      };
    });
    this.byId = Object.fromEntries(this.roads.map((r) => [r.id, r]));
    this.grid = new Map();
    this._buildGrid();
    this.intersections = this._findIntersections();
    this.elevated = [];
    for (const r of this.roads) for (const p of r.samples) if (p.y > 0.05) this.elevated.push({ p, edge: r.halfW + r.sidewalk });
    this._q = {};
  }

  _buildGrid() {
    for (const r of this.roads) {
      const reach = r.halfW + r.sidewalk + 3;
      for (let i = 0; i < r.samples.length - 1; i++) {
        const a = r.samples[i], b = r.samples[i + 1];
        const x0 = Math.floor((Math.min(a.x, b.x) - reach) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + reach) / CELL);
        const z0 = Math.floor((Math.min(a.z, b.z) - reach) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + reach) / CELL);
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
          const k = gx * 73856093 ^ gz * 19349663;
          let cell = this.grid.get(k);
          if (!cell) this.grid.set(k, (cell = []));
          cell.push(r, i);
        }
      }
    }
  }

  _findIntersections() {
    const found = [];
    for (let i = 0; i < this.roads.length; i++) for (let j = i + 1; j < this.roads.length; j++) {
      const A = this.roads[i], B = this.roads[j];
      for (let a = 0; a < A.samples.length - 1; a++) {
        const p = A.samples[a], q = A.samples[a + 1];
        for (let b = 0; b < B.samples.length - 1; b++) {
          const r = B.samples[b], s = B.samples[b + 1];
          if (Math.max(r.x, s.x) < Math.min(p.x, q.x) - 1 || Math.min(r.x, s.x) > Math.max(p.x, q.x) + 1) continue;
          if (Math.max(r.z, s.z) < Math.min(p.z, q.z) - 1 || Math.min(r.z, s.z) > Math.max(p.z, q.z) + 1) continue;
          const hit = segIntersect(p.x, p.z, q.x, q.z, r.x, r.z, s.x, s.z);
          if (!hit) continue;
          const near = found.find((f) => Math.hypot(f.x - hit[0], f.z - hit[1]) < 8);
          if (near) { if (!near.roads.includes(A)) near.roads.push(A); if (!near.roads.includes(B)) near.roads.push(B); continue; }
          found.push({ x: hit[0], z: hit[1], roads: [A, B] });
        }
      }
    }
    found.forEach((f, idx) => {
      f.id = idx;
      f.radius = Math.max(...f.roads.map((r) => r.halfW + r.sidewalk)) + 0.6;
      f.y = 0;
      for (const r of f.roads) {
        const pr = this.projectOnRoad(r, f.x, f.z);
        f.y = Math.max(f.y, pr.y);
        r.isects.push({ s: pr.s, radius: f.radius, isect: f });
      }
      f.name = f.roads.map((r) => r.name).join(' × ');
    });
    return found;
  }

  // 특정 도로 위로 투영 → {s, lateral, y, i}
  projectOnRoad(road, x, z) {
    let best = null, bestD = Infinity;
    const S = road.samples;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
      const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1);
      const px = a.x + ex * t, pz = a.z + ez * t;
      const d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < bestD) { bestD = d; best = { i, t, px, pz }; }
    }
    const a = S[best.i], b = S[best.i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
    return { s: lerp(a.s, b.s, best.t), y: lerp(a.y, b.y, best.t), lateral: (x - best.px) * -tz + (z - best.pz) * tx, i: best.i, tx, tz };
  }

  // 도로 위 s 위치의 점
  pointOnRoad(road, s) {
    const S = road.samples;
    s = clamp(s, 0, road.length);
    let i = clamp(Math.floor(s / SAMPLE_STEP), 0, S.length - 2);
    while (i < S.length - 2 && S[i + 1].s < s) i++;
    while (i > 0 && S[i].s > s) i--;
    const a = S[i], b = S[i + 1];
    const t = clamp((s - a.s) / ((b.s - a.s) || 1), 0, 1);
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), tx: (b.x - a.x) / l, tz: (b.z - a.z) / l };
  }

  inIntersection(x, z) {
    for (const f of this.intersections) if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.radius * f.radius) return f;
    return null;
  }

  /**
   * 노면 질의. 반환값(재사용 객체):
   *  road, s, lateral(오른쪽 +), dist, y(도로 중심 높이), tx/tz(진행 방향), grade(경사),
   *  surface: 'road' | 'sidewalk' | 'grass', height(표면 높이), crosswalk, isect
   */
  query(x, z, out = this._q) {
    const k = Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663;
    const cell = this.grid.get(k);
    let bestScore = Infinity;
    out.road = null;
    if (cell) {
      for (let n = 0; n < cell.length; n += 2) {
        const r = cell[n], i = cell[n + 1];
        const a = r.samples[i], b = r.samples[i + 1];
        const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
        const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1);
        const px = a.x + ex * t, pz = a.z + ez * t;
        const d = Math.hypot(x - px, z - pz);
        const score = d - r.halfW;
        if (score < bestScore) {
          bestScore = score;
          const l = Math.sqrt(l2);
          out.road = r; out.i = i; out.dist = d;
          out.tx = ex / l; out.tz = ez / l;
          out.s = lerp(a.s, b.s, t); out.y = lerp(a.y, b.y, t);
          out.grade = (b.y - a.y) / l;
          out.lateral = (x - px) * -out.tz + (z - pz) * out.tx;
        }
      }
    }
    out.isect = this.inIntersection(x, z);
    out.crosswalk = false;
    if (!out.road) {
      out.surface = 'grass'; out.y = 0; out.grade = 0; out.dist = 99; out.lateral = 0; out.s = 0; out.tx = 1; out.tz = 0;
      out.height = this.terrainHeight(x, z);
      return out;
    }
    const r = out.road, al = Math.abs(out.lateral);
    if (al <= r.halfW || (out.isect && out.dist < out.isect.radius + 0.01)) {
      out.surface = 'road';
      out.height = (out.isect ? Math.max(out.y, out.isect.y) : out.y) + ROAD_LIFT;
      for (const c of r.crosswalks) if (out.s > c.s0 && out.s < c.s1 && al <= r.halfW) { out.crosswalk = true; break; }
    } else if (al <= r.halfW + r.sidewalk) {
      out.surface = 'sidewalk';
      out.height = out.y + CURB_HEIGHT;
    } else {
      out.surface = 'grass';
      out.height = this.terrainHeight(x, z);
    }
    return out;
  }

  // 지형 높이: 높은 도로(언덕길) 주변은 자연스럽게 솟고, 평지 도로 옆은 도로보다 살짝 낮게
  terrainHeight(x, z) {
    let h = 0;
    for (const e of this.elevated) {
      const d = Math.hypot(x - e.p.x, z - e.p.z) - e.edge - 1;
      const w = d <= 0 ? 1 : Math.exp(-(d * d) / (26 * 26));
      if (e.p.y * w > h) h = e.p.y * w;
    }
    // 가까운 도로보다 높아지지 않게 (도로가 흙에 묻히지 않도록)
    const q = this._tq || (this._tq = {});
    const k = Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663;
    const cell = this.grid.get(k);
    if (cell) {
      for (let n = 0; n < cell.length; n += 2) {
        const r = cell[n], i = cell[n + 1];
        const a = r.samples[i], b = r.samples[i + 1];
        const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
        const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1);
        const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
        const edge = r.halfW + r.sidewalk;
        const ry = lerp(a.y, b.y, t) - 0.06;
        if (d < edge + 1.5) h = Math.min(h, ry);
        else if (d < edge + 3) h = Math.min(h, lerp(ry, h, (d - edge - 1.5) / 1.5));
      }
    }
    q.h = h;
    return h;
  }

  // ---------------------------------------------------------------- 메시 생성
  buildMeshes() {
    const group = new THREE.Group();
    group.name = 'roads';
    const asphalt = asphaltTexture();
    this.materials = {
      asphalt: new THREE.MeshStandardMaterial({ map: asphalt, color: 0xffffff, roughness: 0.92, metalness: 0.0 }),
      sidewalk: new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.95 }),
      curb: new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.9, side: THREE.DoubleSide }),
      lineYellow: new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      lineWhite: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      crosswalk: new THREE.MeshStandardMaterial({ map: crosswalkTexture(), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      isect: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    };
    // 날씨(젖은 노면·눈)가 바꿀 수 있도록 기본값 저장
    for (const m of Object.values(this.materials)) m.userData.base = { color: m.color.clone(), roughness: m.roughness, metalness: m.metalness };

    const inZone = (r, s, pad = 0) => r.isects.some((it) => Math.abs(s - it.s) < it.radius + pad);

    for (const r of this.roads) {
      const S = r.samples;
      // 차도
      const road = new Builder();
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        road.ribbon(a, b, -r.halfW, r.halfW, a.y + ROAD_LIFT, b.y + ROAD_LIFT, a.s / 6, b.s / 6, r.halfW * 2 / 6);
      }
      group.add(road.mesh(this.materials.asphalt, { receiveShadow: true }));
      // 인도 + 연석 (교차로 안에서는 끊김)
      const walk = new Builder(), curb = new Builder();
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        if (inZone(r, a.s) || inZone(r, b.s)) continue;
        for (const side of [-1, 1]) {
          const i0 = side * r.halfW, i1 = side * (r.halfW + r.sidewalk);
          walk.ribbon(a, b, Math.min(i0, i1), Math.max(i0, i1), a.y + CURB_HEIGHT, b.y + CURB_HEIGHT, a.s / 3, b.s / 3, r.sidewalk / 3);
          curb.wall(a, b, i0, a.y + ROAD_LIFT, a.y + CURB_HEIGHT, b.y + ROAD_LIFT, b.y + CURB_HEIGHT, side < 0);
          curb.wall(a, b, i1, a.y - 0.6, a.y + CURB_HEIGHT, b.y - 0.6, b.y + CURB_HEIGHT, side > 0);
        }
      }
      group.add(walk.mesh(this.materials.sidewalk, { receiveShadow: true }));
      group.add(curb.mesh(this.materials.curb, { receiveShadow: true }));
      // 차선: 넓은 도로는 황색 복선, 좁은 도로는 황색 점선, 가장자리 흰 실선(자전거가 다니는 길)
      const yellow = new Builder(), white = new Builder();
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        if (inZone(r, a.s, 3) || inZone(r, b.s, 3)) continue;
        const y0 = a.y + ROAD_LIFT + 0.004, y1 = b.y + ROAD_LIFT + 0.004;
        if (r.lanes >= 2) {
          if (r.halfW >= 5) { yellow.ribbon(a, b, -0.28, -0.12, y0, y1); yellow.ribbon(a, b, 0.12, 0.28, y0, y1); }
          else if (Math.floor(a.s / 3) % 2 === 0) yellow.ribbon(a, b, -0.08, 0.08, y0, y1);
        }
        if (r.halfW >= 3.5) for (const side of [-1, 1]) {
          const o = side * (r.halfW - 1.3);
          white.ribbon(a, b, o - 0.07, o + 0.07, y0, y1);
        }
      }
      if (yellow.count) group.add(yellow.mesh(this.materials.lineYellow, { receiveShadow: true }));
      if (white.count) group.add(white.mesh(this.materials.lineWhite, { receiveShadow: true }));
    }

    // 교차로 포장 + 횡단보도
    const cw = new Builder();
    for (const f of this.intersections) {
      const geo = new THREE.CircleGeometry(f.radius, 40);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, this.materials.isect);
      m.position.set(f.x, f.y + ROAD_LIFT + 0.003, f.z);
      m.receiveShadow = true;
      group.add(m);
      for (const r of f.roads) {
        const it = r.isects.find((k) => k.isect === f);
        for (const dir of [-1, 1]) {
          const sc = it.s + dir * (f.radius + 1.8);
          if (sc < 2 || sc > r.length - 2) continue;
          const s0 = sc - 1.5, s1 = sc + 1.5;
          r.crosswalks.push({ s0, s1, isect: f });
          const a = this.pointOnRoad(r, s0), b = this.pointOnRoad(r, s1);
          cw.ribbon(a, b, -r.halfW + 0.3, r.halfW - 0.3, a.y + ROAD_LIFT + 0.006, b.y + ROAD_LIFT + 0.006, 0, 1, (r.halfW * 2 - 0.6) / 4, true);
        }
      }
    }
    if (cw.count) group.add(cw.mesh(this.materials.crosswalk, { receiveShadow: true }));
    this.group = group;
    return group;
  }

  // 지면(지형) 메시
  buildTerrain(bounds, material) {
    const step = 4;
    const nx = Math.ceil((bounds.maxX - bounds.minX) / step), nz = Math.ceil((bounds.maxZ - bounds.minZ) / step);
    const geo = new THREE.PlaneGeometry(nx * step, nz * step, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate(bounds.minX + nx * step / 2, 0, bounds.minZ + nz * step / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.terrainHeight(pos.getX(i), pos.getZ(i)) - 0.02);
    geo.computeVertexNormals();
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}

// 리본(띠) 지오메트리를 모으는 작은 도우미
class Builder {
  constructor() { this.pos = []; this.uv = []; this.nrm = []; this.count = 0; }
  _pt(p, off, y) { return [p.x + -p.tz * off, y, p.z + p.tx * off]; }
  // 진행 방향 기준 좌우 오프셋 l..r 사이의 수평 띠
  ribbon(a, b, l, r, ya, yb, va = 0, vb = 1, uw = 1, rotateUv = false) {
    const p = [this._pt(a, l, ya), this._pt(a, r, ya), this._pt(b, l, yb), this._pt(b, r, yb)];
    const u = rotateUv
      ? [[0, 0], [uw, 0], [0, 1], [uw, 1]]
      : [[0, va], [uw, va], [0, vb], [uw, vb]];
    this._quad(p, u);
  }
  wall(a, b, off, ya0, ya1, yb0, yb1, flip) {
    const p = [this._pt(a, off, ya0), this._pt(b, off, yb0), this._pt(a, off, ya1), this._pt(b, off, yb1)];
    const u = [[0, 0], [1, 0], [0, 1], [1, 1]];
    if (flip) this._quad([p[1], p[0], p[3], p[2]], u); else this._quad(p, u);
  }
  _quad(p, u) {
    const tri = [0, 1, 2, 1, 3, 2];
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n) || 1; n = n.map((v) => v / l);
    for (const t of tri) { this.pos.push(...p[t]); this.uv.push(...u[t]); this.nrm.push(...n); }
    this.count++;
  }
  mesh(material, { receiveShadow = false, castShadow = false } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = receiveShadow; m.castShadow = castShadow;
    return m;
  }
}

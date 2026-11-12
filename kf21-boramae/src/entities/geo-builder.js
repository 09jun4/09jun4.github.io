// 로우폴리 지오메트리 생성기.
// 단면(ring)을 이어 붙이는 로프트, 얇은 판(프리즘), 날개 단면을 삼각형으로 쌓아서
// 정점 색이 들어간 비인덱스 BufferGeometry 하나로 만든다(플랫 셰이딩, 드로우콜 1개).
// 삼각형 방향(winding)은 기준점에서 바깥을 보도록 자동으로 맞춘다.
import * as THREE from 'three';
import { capOpenLoops } from './close-loops.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.rgb = [1, 1, 1];
    this.matrix = null; // 현재 변환(없으면 그대로)
    this.mirrorX = false;
    this.invert = false; // true면 면을 안쪽으로 향하게 만든다(노즐 안쪽 등)
  }

  /** 이후에 추가되는 면의 색(sRGB 16진수) */
  color(hex) {
    _c.setHex(hex);
    this.rgb = [_c.r, _c.g, _c.b];
    return this;
  }

  /** 변환 행렬을 건 상태로 fn 실행 */
  withMatrix(matrix, fn) {
    const prev = this.matrix;
    this.matrix = prev ? prev.clone().multiply(matrix) : matrix;
    fn();
    this.matrix = prev;
    return this;
  }

  /** fn을 두 번 실행한다: 그대로 한 번, x를 뒤집어서 한 번(좌우 대칭 부품) */
  symmetric(fn) {
    fn(1);
    const prev = this.mirrorX;
    this.mirrorX = !prev;
    fn(-1);
    this.mirrorX = prev;
    return this;
  }

  _push(p) {
    _v.set(p[0], p[1], p[2]);
    if (this.matrix) _v.applyMatrix4(this.matrix);
    if (this.mirrorX) _v.x = -_v.x;
    this.pos.push(_v.x, _v.y, _v.z);
    this.col.push(this.rgb[0], this.rgb[1], this.rgb[2]);
  }

  /**
   * 삼각형 하나. ref(기준점)를 주면 법선이 ref에서 멀어지는 쪽을 향하게 뒤집는다.
   * 넓이가 0에 가까운 삼각형은 버린다.
   */
  tri(a, b, c, ref) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-12) return this;
    let flip = false;
    if (ref) {
      const cx = (a[0] + b[0] + c[0]) / 3 - ref[0];
      const cy = (a[1] + b[1] + c[1]) / 3 - ref[1];
      const cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
      flip = _n.x * cx + _n.y * cy + _n.z * cz < 0;
    }
    if (this.mirrorX) flip = !flip;
    if (this.invert) flip = !flip;
    this._push(a);
    if (flip) { this._push(c); this._push(b); } else { this._push(b); this._push(c); }
    return this;
  }

  quad(a, b, c, d, ref) {
    this.tri(a, b, c, ref);
    this.tri(a, c, d, ref);
    return this;
  }

  /**
   * 단면들을 차례로 이어 붙인다. 모든 단면은 점 개수가 같아야 한다.
   * @param {number[][][]} rings 단면 목록(각 단면은 [x,y,z] 점 배열, 닫힌 고리)
   * @param {object} [o]
   * @param {boolean} [o.capStart] 첫 단면을 막는다
   * @param {boolean} [o.capEnd] 마지막 단면을 막는다
   * @param {(i:number)=>number} [o.colorAt] i번째 구간의 색
   * @param {number} [o.capStartColor] 앞 뚜껑 색
   * @param {number} [o.capEndColor] 뒤 뚜껑 색
   */
  loft(rings, o = {}) {
    const centers = rings.map(centroid);
    for (let i = 0; i < rings.length - 1; i++) {
      const r0 = rings[i];
      const r1 = rings[i + 1];
      const n = r0.length;
      const ref = [
        (centers[i][0] + centers[i + 1][0]) / 2,
        (centers[i][1] + centers[i + 1][1]) / 2,
        (centers[i][2] + centers[i + 1][2]) / 2,
      ];
      if (o.colorAt) this.color(o.colorAt(i));
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        this.quad(r0[j], r0[k], r1[k], r1[j], ref);
      }
    }
    const last = rings.length - 1;
    if (o.capStart) {
      if (o.capStartColor !== undefined) this.color(o.capStartColor);
      this.cap(rings[0], centers[1]);
    }
    if (o.capEnd) {
      if (o.capEndColor !== undefined) this.color(o.capEndColor);
      this.cap(rings[last], centers[last - 1]);
    }
    return this;
  }

  /** 고리를 부채꼴로 막는다. inside는 막는 면의 안쪽에 있는 기준점. */
  cap(ring, inside) {
    const c = centroid(ring);
    for (let j = 0; j < ring.length; j++) this.tri(c, ring[j], ring[(j + 1) % ring.length], inside);
    return this;
  }

  /**
   * 위에서 본 윤곽(x,z)을 y 방향으로 얇게 세운 판.
   * @param {number[][]} outline [x, z] 점 목록(볼록 다각형)
   */
  prism(outline, y0, y1) {
    const top = outline.map((p) => [p[0], y1, p[1]]);
    const bot = outline.map((p) => [p[0], y0, p[1]]);
    return this.loft([bot, top], { capStart: true, capEnd: true });
  }

  /** 이미 만든 지오메트리를 현재 색으로 합친다(LatheGeometry 등). */
  addGeometry(geometry, matrix, ref) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.attributes.position;
    const pts = [];
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      if (matrix) _v.applyMatrix4(matrix);
      pts.push([_v.x, _v.y, _v.z]);
    }
    for (let i = 0; i < pts.length; i += 3) this.tri(pts[i], pts[i + 1], pts[i + 2], ref);
    if (g !== geometry) g.dispose();
    return this;
  }

  get triangleCount() {
    return this.pos.length / 9;
  }

  /** @param {THREE.Matrix4} [bake] 최종 지오메트리에 한 번 적용할 변환(힌지 좌표계로 옮길 때) */
  build(bake) {
    // 열린 관 끝·얇은 판 뒷면을 막는다(막는 면은 뒤에 덧붙고, 비인덱스로 다시 편다)
    const n0 = this.pos.length / 3;
    const idx = Array.from({ length: n0 }, (_, i) => i);
    capOpenLoops(this.pos, idx, [{ array: this.col, size: 3 }]);
    if (idx.length > n0) {
      const pos = this.pos.slice(0, n0 * 3), col = this.col.slice(0, n0 * 3);
      for (let i = n0; i < idx.length; i++) { const v = idx[i]; pos.push(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]); col.push(this.col[v * 3], this.col[v * 3 + 1], this.col[v * 3 + 2]); }
      this.pos = pos; this.col = col;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (bake) g.applyMatrix4(bake);
    g.computeVertexNormals(); // 비인덱스라서 면 법선(플랫)
    g.computeBoundingSphere();
    return g;
  }
}

export function centroid(ring) {
  let x = 0, y = 0, z = 0;
  for (const p of ring) { x += p[0]; y += p[1]; z += p[2]; }
  const n = ring.length;
  return [x / n, y / n, z / n];
}

const mix = (a, b, t) => a + (b - a) * t;

/**
 * 날개 판(주익·미익 공용). 안쪽(a)에서 바깥쪽(b)으로 가는 사다리꼴을 얇은 에어포일 단면으로 로프트한다.
 * 좌표: span = 날개 뻗는 축 위치, le/te = 앞전·뒷전의 z, t = 두께, y = 높이.
 * from/to(0~1)로 코드 방향 일부만 만들 수 있다(조종면을 따로 떼어낼 때).
 * @returns {number[][][]} 로프트용 단면 2개
 */
export function wingRings(a, b, { from = 0, to = 1, steps = 1 } = {}) {
  const rings = [];
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const span = mix(a.span, b.span, u);
    const le = mix(a.le, b.le, u);
    const te = mix(a.te, b.te, u);
    const t = mix(a.t, b.t, u);
    const y = mix(a.y ?? 0, b.y ?? 0, u);
    rings.push(airfoilRing(span, y, le, te, t, from, to));
  }
  return rings;
}

// 다이아몬드에 가까운 얇은 단면: 30% 지점이 가장 두껍다.
const AIRFOIL = [[0, 0], [0.3, 1], [0.7, 0.62], [1, 0]];

export function thicknessAt(c) {
  for (let i = 0; i < AIRFOIL.length - 1; i++) {
    const [c0, t0] = AIRFOIL[i];
    const [c1, t1] = AIRFOIL[i + 1];
    if (c <= c1) return mix(t0, t1, (c - c0) / (c1 - c0));
  }
  return 0;
}

function airfoilRing(span, y, le, te, t, from, to) {
  const stations = [from];
  for (const [c] of AIRFOIL) if (c > from + 1e-4 && c < to - 1e-4) stations.push(c);
  stations.push(to);
  const upper = [];
  const lower = [];
  for (const c of stations) {
    const z = mix(le, te, c);
    const h = (thicknessAt(c) * t) / 2;
    upper.push([span, y + h, z]);
    if (h > 1e-5) lower.push([span, y - h, z]);
  }
  return upper.concat(lower.reverse());
}

// 하이폴리용 곡면 생성기. 격자(grid)·로프트·튜브를 인덱스 지오메트리로 쌓고, 부드러운 법선과 UV를 만든다.
// - 면 방향은 격자마다 중심 기준으로 자동 정렬(바깥을 향하게)한다.
// - 닫힌 고리의 이음매는 UV 때문에 정점을 따로 두되, 법선은 평균해서 이음매가 보이지 않게 한다.
// - 좌우 대칭 부품은 mirror()로 한 번만 정의한다.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Surf {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.idx = [];
    this.weld = []; // 법선을 평균할 정점 쌍
    this.matrix = null;
    this.mx = 1; // -1이면 x 대칭
    this.uvFn = (x, y, z) => [0.94, 0.5 + z / 18]; // 기본: 아틀라스의 민무늬 영역
  }

  /** 이후 추가되는 면의 UV 계산식 (x,y,z,u,v) → [U,V]. u,v는 격자 매개변수(0~1) */
  setUV(fn) {
    this.uvFn = fn;
    return this;
  }

  withMatrix(m, fn) {
    const prev = this.matrix;
    this.matrix = prev ? prev.clone().multiply(m) : m;
    fn();
    this.matrix = prev;
    return this;
  }

  /** fn(side)를 오른쪽(1)·왼쪽(-1) 두 번 실행한다. 왼쪽은 x를 뒤집는다. */
  mirror(fn) {
    fn(1);
    const prev = this.mx;
    this.mx = -prev;
    fn(-1);
    this.mx = prev;
    return this;
  }

  _vert(p, u, v) {
    // UV는 변환·대칭 전 좌표로 계산한다(좌우가 같은 텍스처 영역을 쓴다)
    const t = this.uvFn(p[0], p[1], p[2], u, v);
    _v.set(p[0], p[1], p[2]);
    if (this.matrix) _v.applyMatrix4(this.matrix);
    _v.x *= this.mx;
    this.pos.push(_v.x, _v.y, _v.z);
    this.uv.push(t[0], t[1]);
    return this.pos.length / 3 - 1;
  }

  /**
   * 매개변수 곡면 fn(u, v) → [x,y,z] 를 nu×nv 칸으로 나눈다.
   * @param {object} [o]
   * @param {boolean} [o.closedU] u 방향이 닫힌 고리(이음매 법선 평균)
   * @param {number[]|'auto'|null} [o.ref] 면이 이 점에서 멀어지는 쪽을 향한다. 기본은 격자 중심
   * @param {boolean} [o.inward] 안쪽을 향하게(덕트 안쪽 등)
   */
  grid(nu, nv, fn, o = {}) {
    const base = this.pos.length / 3;
    const cols = nu + 1;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv;
        const k = this._vert(fn(u, v), u, v);
        if (o.closedU && i === nu) this.weld.push(k - nu, k);
      }
    }
    // 방향 판정: 가운데 칸의 법선이 중심에서 바깥을 향하는지
    let cx = 0, cy = 0, cz = 0;
    const n = (nu + 1) * (nv + 1);
    for (let k = base; k < base + n; k++) { cx += this.pos[k * 3]; cy += this.pos[k * 3 + 1]; cz += this.pos[k * 3 + 2]; }
    let ref = [cx / n, cy / n, cz / n];
    if (Array.isArray(o.ref)) {
      _v.set(o.ref[0], o.ref[1], o.ref[2]);
      if (this.matrix) _v.applyMatrix4(this.matrix);
      ref = [_v.x * this.mx, _v.y, _v.z];
    }
    let score = 0;
    const P = (k) => [this.pos[k * 3], this.pos[k * 3 + 1], this.pos[k * 3 + 2]];
    const stepU = Math.max(1, Math.floor(nu / 7)), stepV = Math.max(1, Math.floor(nv / 5));
    for (let j = 0; j < nv; j += stepV) {
      for (let i = 0; i < nu; i += stepU) {
        const a = P(base + j * cols + i), b = P(base + j * cols + i + 1), c = P(base + (j + 1) * cols + i);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        score += nx * (a[0] - ref[0]) + ny * (a[1] - ref[1]) + nz * (a[2] - ref[2]);
      }
    }
    let flip = score < 0;
    if (o.inward) flip = !flip;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        if (flip) this.idx.push(a, c, b, b, c, d); else this.idx.push(a, b, c, b, d, c);
      }
    }
    return this;
  }

  /** 단면 함수 ring(v) → (u → [x,y,z]) 를 따라가는 닫힌 관 */
  loft(nu, nv, fn, o = {}) {
    return this.grid(nu, nv, fn, { closedU: true, ...o });
  }

  /** 고리(점 배열)를 부채꼴로 막는다. outward: 막는 면이 향할 방향의 기준점 반대쪽 */
  cap(ring, inside) {
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const c = [cx / ring.length, cy / ring.length, cz / ring.length];
    const n = ring.length;
    return this.grid(n, 1, (u, v) => {
      const p = ring[Math.round(u * n) % n];
      return v === 0 ? c : p;
    }, { ref: inside });
  }

  /** 점 목록을 따라가는 원형 단면 관(안테나, 피토관, 배선, 기어 지주) */
  tube(points, radius, sides = 8, o = {}) {
    const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const frames = pts.map((p, i) => {
      const dir = new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const a = new THREE.Vector3().crossVectors(dir, up).normalize();
      const b = new THREE.Vector3().crossVectors(dir, a).normalize();
      return { p, a, b };
    });
    const rad = typeof radius === 'function' ? radius : () => radius;
    const nv = pts.length - 1;
    this.loft(sides, nv, (u, v) => {
      const f = frames[Math.round(v * nv)];
      const ang = u * Math.PI * 2;
      const r = rad(v);
      return [f.p.x + (f.a.x * Math.cos(ang) + f.b.x * Math.sin(ang)) * r, f.p.y + (f.a.y * Math.cos(ang) + f.b.y * Math.sin(ang)) * r, f.p.z + (f.a.z * Math.cos(ang) + f.b.z * Math.sin(ang)) * r];
    }, o);
    if (o.caps !== false) {
      for (const [k, other] of [[0, 1], [nv, nv - 1]]) {
        const f = frames[k];
        const ring = [];
        const r = rad(k / nv);
        for (let i = 0; i < sides; i++) { const ang = (i / sides) * Math.PI * 2; ring.push([f.p.x + (f.a.x * Math.cos(ang) + f.b.x * Math.sin(ang)) * r, f.p.y + (f.a.y * Math.cos(ang) + f.b.y * Math.sin(ang)) * r, f.p.z + (f.a.z * Math.cos(ang) + f.b.z * Math.sin(ang)) * r]); }
        this.cap(ring, frames[other].p.toArray());
      }
    }
    return this;
  }

  /** 구(헬멧, 등, 센서) */
  sphere(center, radius, nu = 16, nv = 10, scale = [1, 1, 1], o = {}) {
    const a0 = o.phi0 ?? 0, a1 = o.phi1 ?? Math.PI;
    return this.grid(nu, nv, (u, v) => {
      const th = u * Math.PI * 2, ph = a0 + (a1 - a0) * v;
      return [center[0] + Math.sin(ph) * Math.cos(th) * radius * scale[0], center[1] + Math.cos(ph) * radius * scale[1], center[2] + Math.sin(ph) * Math.sin(th) * radius * scale[2]];
    }, { closedU: true, ref: center, ...o });
  }

  /** 상자(모서리가 각진 부품). 면마다 따로 만들어 모서리가 뭉개지지 않는다. */
  box(center, size, o = {}) {
    const [cx, cy, cz] = center;
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const faces = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
    ];
    for (const [n, a, b] of faces) {
      this.grid(1, 1, (u, v) => {
        const s = u * 2 - 1, t = v * 2 - 1;
        return [cx + (n[0] + a[0] * s + b[0] * t) * hx, cy + (n[1] + a[1] * s + b[1] * t) * hy, cz + (n[2] + a[2] * s + b[2] * t) * hz];
      }, { ref: center, ...o });
    }
    return this;
  }

  get triangles() {
    return this.idx.length / 3;
  }

  /** @param {THREE.Matrix4} [bake] 힌지 좌표계 등으로 옮길 변환 */
  build(bake) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (bake) g.applyMatrix4(bake);
    g.computeVertexNormals();
    const nor = g.attributes.normal;
    for (let i = 0; i < this.weld.length; i += 2) {
      const a = this.weld[i], b = this.weld[i + 1];
      _v.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
      nor.setXYZ(a, _v.x, _v.y, _v.z);
      nor.setXYZ(b, _v.x, _v.y, _v.z);
    }
    g.computeBoundingSphere();
    return g;
  }
}

/** 값 표를 부드럽게 잇는 보간(Catmull-Rom). xs는 오름차순. */
export function spline(xs, ys) {
  return (x) => {
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    const p0 = ys[Math.max(0, i - 1)], p1 = ys[i], p2 = ys[i + 1], p3 = ys[Math.min(n - 1, i + 2)];
    // 구간 길이가 달라도 튀지 않게 기울기를 양옆 구간 평균으로 잡는다
    const h = xs[i + 1] - xs[i];
    const m1 = i > 0 ? ((p2 - p0) / (xs[i + 1] - xs[i - 1])) * h : p2 - p1;
    const m2 = i < n - 2 ? ((p3 - p1) / (xs[i + 2] - xs[i])) * h : p2 - p1;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
  };
}

/** NACA 대칭 익형의 반두께 분포(최대값 1로 정규화). c: 코드 위치 0~1. 실제 반두께 = (두께 / 2) × 이 값 */
export function airfoilThickness(c) {
  const p = 0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c * c * c - 0.1036 * c * c * c * c;
  return Math.max(0, p / 0.1);
}

// 종이 면 메시: 구멍(mask)까지 반영한 얇은 판. 앞면/뒷면/옆면(두께) 세 그룹.
// rest 월드 좌표로 만들고, 면 그룹의 행렬(논리 변환)로 움직여요. 시각적 두께는 논리 판정과 무관해요.
import * as THREE from '../../vendor/three.module.min.js';

export const THICK = 0.045;

export function buildFaceGeometry(f, thick = THICK) {
  const pos = [], nor = [], uv = [], groups = [[], [], []];
  const u = new THREE.Vector3(...f.u), v = new THREE.Vector3(...f.v), n = new THREE.Vector3(...f.n), o = new THREE.Vector3(...f.o);
  const P = (i, j, s) => o.clone().addScaledVector(u, i).addScaledVector(v, j).addScaledVector(n, s * thick / 2);
  const quad = (g, a, b, c, d, nn, uvs) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); }
    uv.push(...uvs);
    groups[g].push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const has = (i, j) => i >= 0 && j >= 0 && i < f.w && j < f.h && f.has(i, j);
  const nn = n.clone().negate(), uN = u.clone().negate(), vN = v.clone().negate();
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    if (!has(i, j)) continue;
    quad(0, P(i, j, 1), P(i + 1, j, 1), P(i + 1, j + 1, 1), P(i, j + 1, 1), n, [0, 0, 1, 0, 1, 1, 0, 1]);
    quad(1, P(i, j, -1), P(i, j + 1, -1), P(i + 1, j + 1, -1), P(i + 1, j, -1), nn, [0, 0, 0, 1, 1, 1, 1, 0]);
    const e = [0, 0, 1, 0, 1, 0.04, 0, 0.04];
    if (!has(i - 1, j)) quad(2, P(i, j, -1), P(i, j, 1), P(i, j + 1, 1), P(i, j + 1, -1), uN, e);
    if (!has(i + 1, j)) quad(2, P(i + 1, j, -1), P(i + 1, j + 1, -1), P(i + 1, j + 1, 1), P(i + 1, j, 1), u, e);
    if (!has(i, j - 1)) quad(2, P(i, j, -1), P(i + 1, j, -1), P(i + 1, j, 1), P(i, j, 1), vN, e);
    if (!has(i, j + 1)) quad(2, P(i, j + 1, -1), P(i, j + 1, 1), P(i + 1, j + 1, 1), P(i + 1, j + 1, -1), v, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const idx = [];
  groups.forEach((g, k) => { geo.addGroup(idx.length, g.length, k); idx.push(...g); });
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// 논리 변환 {R,t} → Matrix4
export function toMatrix(T, out = new THREE.Matrix4()) {
  const R = T.R, t = T.t;
  return out.set(R[0], R[1], R[2], t[0], R[3], R[4], R[5], t[1], R[6], R[7], R[8], t[2], 0, 0, 0, 1);
}

// 점 p 를 지나는 축 둘레 회전 행렬 (화면용, 실수 각도)
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _t1 = new THREE.Matrix4(), _t2 = new THREE.Matrix4();
export function rotAboutMatrix(point, dir, rad, out = new THREE.Matrix4()) {
  _q.setFromAxisAngle(dir, rad);
  _m.makeRotationFromQuaternion(_q);
  _t1.makeTranslation(point.x, point.y, point.z);
  _t2.makeTranslation(-point.x, -point.y, -point.z);
  return out.copy(_t1).multiply(_m).multiply(_t2);
}

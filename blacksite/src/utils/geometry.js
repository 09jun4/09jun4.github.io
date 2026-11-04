// 코드로 만드는 지오메트리 도우미 (외부 모델 파일 없이 사용).
import * as THREE from 'three';

// 월드 크기에 맞춰 UV를 늘린 박스 (텍스처가 늘어나 보이지 않게)
export function boxGeo(w, h, d, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) {
    const uv = g.attributes.uv;
    // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z (면당 정점 4개)
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * dims[f][0] * uvScale, uv.getY(k) * dims[f][1] * uvScale);
      }
    }
  }
  return g;
}

// 모서리가 둥근 박스 (각진 큐브 느낌을 줄이기 위해)
export function roundedBox(w, h, d, r = 0.02, seg = 2) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const s = seg * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) * w, pos.getY(i) * h, pos.getZ(i) * d);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    n.subVectors(v, c);
    if (n.lengthSq() < 1e-12) n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    n.normalize();
    pos.setXYZ(i, c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  return g;
}

// 회전체(LatheGeometry) — [반지름, 높이] 점 목록
export function lathe(points, segments = 12, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments, phiStart, phiLength);
}

// 위치·회전·크기를 한 번에 지정한 메시
export function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; // 기본값: 그림자 생성/수신 (필요 없으면 호출 측에서 끈다)
  m.receiveShadow = true;
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  return m;
}

// 같은 재질의 정적 메시들을 합쳐 드로우콜을 줄인다. 합친 메시 목록을 돌려준다.
export function mergeStatic(root, { castShadow = true, receiveShadow = true } = {}) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const toRemove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noMerge || o.material.transparent || Array.isArray(o.material)) return;
    let p = o.parent, skip = false;
    while (p) { if (p.userData.noMerge) { skip = true; break; } p = p.parent; }
    if (skip) return;
    const key = o.material.uuid + (o.castShadow === false ? ':ns' : '');
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow !== false, items: [] });
    groups.get(key).items.push(o);
    toRemove.push(o);
  });
  const out = [];
  for (const { mat, cast, items } of groups.values()) {
    if (items.length < 2) { toRemove.splice(toRemove.indexOf(items[0]), 1); continue; }
    const geos = items.map((m) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    const merged = mergeNonIndexed(geos);
    geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = castShadow && cast;
    m.receiveShadow = receiveShadow;
    m.matrixAutoUpdate = false;
    out.push(m);
  }
  for (const o of toRemove) o.parent.remove(o);
  return out;
}

function mergeNonIndexed(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

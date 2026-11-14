// 캐릭터 파츠용 형태 도우미: 두 점을 잇는 가늘어지는 원기둥(사지), 캡슐, 타원체.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// p0 → p1 사이를 잇는 테이퍼 원기둥 (+ 선택적 구 캡)
export function segment(p0, p1, r0, r1, mat, { caps = true, radial = 10 } = {}) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, radial, 1, !caps), mat);
  cyl.position.copy(a).addScaledVector(dir, 0.5);
  cyl.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  g.add(cyl);
  if (caps) {
    const s0 = new THREE.Mesh(new THREE.SphereGeometry(r0, radial, 8), mat); s0.position.copy(a); g.add(s0);
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(r1, radial, 8), mat); s1.position.copy(b); g.add(s1);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// 아래(-y)로 뻗는 사지 한 마디: 관절 피벗(원점)에서 길이 len
export function limbDown(len, r0, r1, mat, radial = 10) {
  return segment([0, 0, 0], [0, -len, 0], r0, r1, mat, { radial });
}

export function ellipsoid(rx, ry, rz, mat, w = 14, h = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, w, h), mat);
  m.scale.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function capsule(r, len, mat, cap = 6, radial = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, cap, radial), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

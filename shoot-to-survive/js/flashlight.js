import * as THREE from 'three';

// 원통 몸체 + 확장된 헤드 + 렌즈 — 앞쪽 = -z
export function createFlashlight() {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.6, roughness: 0.45 });
  const head = new THREE.MeshStandardMaterial({ color: 0x252830, metalness: 0.7, roughness: 0.35 });
  const lens = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
  const cyl = (rt, rb, len, mat, z, y = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, 12), mat);
    m.rotation.x = Math.PI / 2; m.position.set(0, y, z); root.add(m); return m;
  };
  cyl(0.021, 0.021, 0.2, body, 0.02);          // 몸체
  cyl(0.036, 0.027, 0.055, head, -0.105);      // 확장된 헤드
  cyl(0.029, 0.029, 0.004, lens, -0.134);      // 렌즈
  cyl(0.023, 0.023, 0.02, head, 0.13);         // 뒷캡
  for (let i = 0; i < 3; i++) cyl(0.0225, 0.0225, 0.008, head, 0.0 + i * 0.03); // 그립 링
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.02), head);
  btn.position.set(0, 0.023, 0.07); root.add(btn);
  return { root };
}

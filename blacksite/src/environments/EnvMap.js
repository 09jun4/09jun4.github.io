// 절차적 환경맵: 금속 재질이 검게 보이지 않도록 천장 조명 띠가 있는 가상의 방을 PMREM으로 굽는다(1회).
import * as THREE from 'three';

let cached = null;
export function getEnvironment(renderer) {
  if (cached) return cached;
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const col = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const c = new THREE.Color().setRGB(0.05, 0.055, 0.06).lerp(new THREE.Color(0.32, 0.34, 0.36), (y + 1) / 2);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.1, 3.3) });
  for (let i = -2; i <= 2; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 6), strip);
    m.position.set(i * 2.5, 6, 0);
    scene.add(m);
  }
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.0, 1.15) }));
  side.position.set(-7, 2, 0);
  scene.add(side);
  const pm = new THREE.PMREMGenerator(renderer);
  cached = pm.fromScene(scene, 0.04).texture;
  pm.dispose();
  scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return cached;
}

// 1인칭 팔·손 (전술 장갑 + 블랙 전술복 소매). 권총 그룹 좌표계(그립 윗부분 원점, -z 앞)에 붙인다.
// 반환: { right, left (재장전 때 움직이는 보조손), dispose }
import * as THREE from 'three';
import { roundedBox } from '../utils/geometry.js';
import { segment } from './parts/shapes.js';

export function createArms() {
  const glove = new THREE.MeshStandardMaterial({ color: 0x34383c, roughness: 0.82, metalness: 0.02 });
  const knuckle = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.6, metalness: 0.05 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.95 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x22272b, roughness: 0.9 });
  const mats = [glove, knuckle, sleeve, cuff];
  const box = (w, h, d, r, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(roundedBox(w, h, d, r), mat);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
  };
  const GA = -0.3; // 그립 기울기
  const along = (t) => [0, -Math.cos(-GA) * t, Math.sin(-GA) * t]; // 그립 축을 따라 t만큼 아래

  // --- 오른손 (사격 손) ---
  const right = new THREE.Group();
  // 손등·손바닥: 그립 오른쪽 뒤를 감싼다
  right.add(box(0.024, 0.09, 0.066, 0.011, glove, 0.024, -0.05, 0.016, GA, 0, 0));
  right.add(box(0.03, 0.03, 0.03, 0.01, glove, 0.012, -0.015, 0.04, GA, 0, 0)); // 물갈퀴
  right.add(box(0.012, 0.05, 0.03, 0.005, knuckle, 0.035, -0.045, -0.006, GA, 0, 0)); // 손등 보호대
  // 중지·약지·새끼: 그립 앞을 감싸 쥔다
  [0.032, 0.054, 0.076].forEach((t, i) => {
    const [, y, z] = along(t);
    right.add(segment([0.03, y, z - 0.012], [0.006, y - 0.004, z - 0.034], 0.0095, 0.0085, glove));
    right.add(segment([0.006, y - 0.004, z - 0.034], [-0.016, y - 0.002, z - 0.03], 0.0085, 0.0075 - i * 0.0005, glove));
  });
  // 검지: 프레임 옆을 따라 방아쇠로
  right.add(segment([0.024, -0.012, 0.0], [0.019, -0.012, -0.03], 0.009, 0.008, glove));
  right.add(segment([0.019, -0.012, -0.03], [0.006, -0.018, -0.04], 0.008, 0.0072, glove));
  // 엄지: 프레임 왼쪽을 따라 앞으로
  right.add(segment([0.0, -0.01, 0.03], [-0.018, -0.002, -0.0], 0.011, 0.0095, glove));
  right.add(segment([-0.018, -0.002, -0.0], [-0.02, 0.0, -0.03], 0.0095, 0.0085, glove));
  // 손목·팔뚝·소매
  right.add(segment([0.028, -0.07, 0.04], [0.06, -0.15, 0.2], 0.026, 0.031, glove));
  right.add(segment([0.05, -0.13, 0.16], [0.12, -0.27, 0.48], 0.038, 0.048, sleeve));
  right.add(segment([0.046, -0.121, 0.145], [0.056, -0.142, 0.19], 0.034, 0.036, cuff, { caps: false }));

  // --- 왼손 (보조 손) ---
  const left = new THREE.Group();
  left.add(box(0.022, 0.08, 0.07, 0.011, glove, -0.024, -0.058, 0.002, GA, 0, -0.08));
  [0.036, 0.058, 0.08].forEach((t, i) => {
    const [, y, z] = along(t);
    // 오른손 손가락 위를 덮어 감싼다
    left.add(segment([-0.034, y - 0.006, z - 0.006], [-0.012, y - 0.008, z - 0.046], 0.0095, 0.0088, glove));
    left.add(segment([-0.012, y - 0.008, z - 0.046], [0.016, y - 0.006, z - 0.048], 0.0088, 0.0078 - i * 0.0004, glove));
  });
  // 엄지: 오른손 엄지 아래, 앞쪽으로
  left.add(segment([-0.026, -0.03, 0.01], [-0.02, -0.014, -0.03], 0.0105, 0.009, glove));
  left.add(segment([-0.02, -0.014, -0.03], [-0.017, -0.01, -0.058], 0.009, 0.008, glove));
  left.add(segment([-0.03, -0.085, 0.03], [-0.07, -0.16, 0.19], 0.026, 0.031, glove));
  left.add(segment([-0.062, -0.145, 0.16], [-0.15, -0.28, 0.47], 0.038, 0.048, sleeve));
  left.add(segment([-0.058, -0.137, 0.145], [-0.068, -0.155, 0.19], 0.034, 0.036, cuff, { caps: false }));

  for (const g of [right, left]) g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return {
    right, left,
    dispose() { for (const g of [right, left]) g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); mats.forEach((x) => x.dispose()); },
  };
}

// 현대적인 군용 폴리머 권총 모델 (코드 제작). 원점 = 그립 윗부분(손 물갈퀴 위치), 총구는 -z.
// 반환: { group, slide, magazine, magHome, muzzle, ejectPort, rearSightY, trigger }
import * as THREE from 'three';
import { roundedBox } from '../utils/geometry.js';

export function createPistolModel() {
  const polymer = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.72, metalness: 0.05 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.38, metalness: 0.85 });
  const steelLight = new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.3, metalness: 0.9 });
  const dot = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc9ffd6, emissiveIntensity: 1.4 });
  const mats = [polymer, steel, steelLight, dot];
  const m = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    return o;
  };
  const group = new THREE.Group();

  // 슬라이드 (사격 시 후퇴)
  const slide = new THREE.Group();
  slide.add(m(roundedBox(0.026, 0.03, 0.19, 0.005), steel, 0, 0.027, -0.075));
  // 후방 세레이션
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) slide.add(m(new THREE.BoxGeometry(0.002, 0.02, 0.003), steelLight, s * 0.0132, 0.027, 0.0 - i * 0.0065));
  // 배출구
  slide.add(m(new THREE.BoxGeometry(0.004, 0.012, 0.04), polymer, 0.012, 0.034, -0.05));
  // 가늠자·가늠쇠
  slide.add(m(new THREE.BoxGeometry(0.007, 0.008, 0.008), steel, -0.0065, 0.046, 0.012));
  slide.add(m(new THREE.BoxGeometry(0.007, 0.008, 0.008), steel, 0.0065, 0.046, 0.012));
  slide.add(m(new THREE.BoxGeometry(0.004, 0.008, 0.006), steel, 0, 0.046, -0.16));
  slide.add(m(new THREE.SphereGeometry(0.0014, 6, 4), dot, 0, 0.049, -0.163));
  for (const s of [-1, 1]) slide.add(m(new THREE.SphereGeometry(0.0013, 6, 4), dot, s * 0.0065, 0.048, 0.0075));
  group.add(slide);

  // 총열 끝
  const barrel = m(new THREE.CylinderGeometry(0.0068, 0.0068, 0.012, 12), steelLight, 0, 0.029, -0.168, Math.PI / 2, 0, 0);
  group.add(barrel);
  group.add(m(new THREE.CylinderGeometry(0.0045, 0.0045, 0.013, 10), new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, 0.029, -0.168, Math.PI / 2, 0, 0));

  // 프레임 (먼지 덮개 + 레일)
  group.add(m(roundedBox(0.024, 0.02, 0.15, 0.004), polymer, 0, 0.004, -0.085));
  for (let i = 0; i < 3; i++) group.add(m(new THREE.BoxGeometry(0.02, 0.004, 0.006), polymer, 0, -0.008, -0.11 - i * 0.012));
  // 방아쇠울
  group.add(m(new THREE.BoxGeometry(0.012, 0.006, 0.05), polymer, 0, -0.031, -0.045));
  group.add(m(new THREE.BoxGeometry(0.012, 0.03, 0.007), polymer, 0, -0.015, -0.07, 0.25, 0, 0));
  const trigger = m(new THREE.BoxGeometry(0.005, 0.02, 0.006), steel, 0, -0.013, -0.036, -0.25, 0, 0);
  group.add(trigger);

  // 그립 (뒤로 기울어짐)
  const grip = new THREE.Group();
  grip.rotation.x = -0.3;
  grip.add(m(roundedBox(0.03, 0.115, 0.05, 0.008), polymer, 0, -0.055, 0.004));
  // 그립 질감 패널
  for (const s of [-1, 1]) grip.add(m(new THREE.BoxGeometry(0.002, 0.07, 0.034), steel, s * 0.0152, -0.058, 0.006));
  grip.add(m(roundedBox(0.026, 0.01, 0.03, 0.004), polymer, 0, -0.002, 0.03)); // 비버테일
  group.add(grip);

  // 탄창 (재장전 시 분리) — 그립 축을 따라 움직인다
  const magazine = new THREE.Group();
  magazine.add(m(new THREE.BoxGeometry(0.022, 0.11, 0.036), steel, 0, -0.06, 0.004));
  magazine.add(m(roundedBox(0.03, 0.012, 0.052, 0.004), polymer, 0, -0.118, 0.004));
  magazine.add(m(new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.9, roughness: 0.3 }), 0, -0.004, -0.004, Math.PI / 2, 0, 0));
  magazine.rotation.x = -0.3;
  group.add(magazine);
  const magHome = magazine.position.clone();

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.029, -0.18); group.add(muzzle);
  const ejectPort = new THREE.Object3D(); ejectPort.position.set(0.014, 0.036, -0.05); group.add(ejectPort);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return {
    group, slide, magazine, magHome, muzzle, ejectPort, trigger,
    rearSightY: 0.05,
    dispose() { group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); mats.forEach((x) => x.dispose()); },
  };
}

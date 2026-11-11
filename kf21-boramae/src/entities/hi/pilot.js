// 조종사(3인칭에서 캐노피 안에 보이는 상반신): 헬멧·바이저·산소마스크·호스·어깨 + 사출좌석 머리받이.
// 머리는 선회 방향을 살짝 따라간다.
import * as THREE from 'three';
import { Surf } from './surface.js';
import { KF21_POINTS } from '../kf21-shape.js';
import { damp } from '../../core/math.js';

export function createPilot(detail) {
  const n = detail >= 2 ? 22 : 14;
  const eye = KF21_POINTS.eye;
  const group = new THREE.Group();
  group.name = 'pilot';
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, roughness: 0.35, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x10151b, roughness: 0.06, metalness: 0.95, envMapIntensity: 2 });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x4a5340, roughness: 0.9, metalness: 0 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.8, metalness: 0.1 });

  // 몸통·어깨·좌석(고정)
  const body = new Surf();
  body.sphere([0, eye.y - 0.42, eye.z + 0.12], 0.25, n, Math.round(n * 0.6), [1.05, 0.95, 0.7]);
  body.sphere([0.2, eye.y - 0.3, eye.z + 0.1], 0.1, n, Math.round(n * 0.5));
  body.sphere([-0.2, eye.y - 0.3, eye.z + 0.1], 0.1, n, Math.round(n * 0.5));
  const seat = new Surf();
  seat.box([0, eye.y - 0.28, eye.z + 0.36], [0.36, 0.56, 0.1]);
  seat.box([0, eye.y + 0.04, eye.z + 0.33], [0.22, 0.2, 0.1]); // 머리받이
  for (const side of [-1, 1]) seat.box([side * 0.2, eye.y - 0.2, eye.z + 0.36], [0.03, 0.44, 0.08]);
  const bodyMesh = new THREE.Mesh(body.build(), suitMat);
  const seatMesh = new THREE.Mesh(seat.build(), seatMat);

  // 머리(선회 방향으로 살짝 돈다)
  const head = new THREE.Group();
  head.position.set(0, eye.y - 0.12, eye.z + 0.08);
  const helmet = new Surf();
  helmet.sphere([0, 0.14, 0], 0.155, n, Math.round(n * 0.7), [1, 1.05, 1.12]);
  const visor = new Surf();
  visor.sphere([0, 0.15, -0.035], 0.13, n, Math.round(n * 0.5), [1, 0.62, 1.05], { phi0: 0.5, phi1: 2.0 });
  const mask = new Surf();
  mask.sphere([0, 0.07, -0.13], 0.06, Math.round(n * 0.7), Math.round(n * 0.4), [1, 1, 0.9]);
  mask.tube([[0, 0.04, -0.15], [0.03, -0.06, -0.12], [0.08, -0.16, -0.04]], 0.018, 6);
  const helmetMesh = new THREE.Mesh(helmet.build(), helmetMat);
  const visorMesh = new THREE.Mesh(visor.build(), visorMat);
  const maskMesh = new THREE.Mesh(mask.build(), seatMat);
  head.add(helmetMesh, visorMesh, maskMesh);
  group.add(bodyMesh, seatMesh, head);
  for (const m of [bodyMesh, seatMesh, helmetMesh]) m.castShadow = true;

  let yaw = 0;
  return {
    group,
    /** @param {number} turn -1(좌)~+1(우) */
    setHead(turn, dt) {
      yaw = damp(yaw, -turn * 0.45, 0.25, dt);
      head.rotation.y = yaw;
      head.rotation.z = yaw * 0.25;
    },
    dispose() {
      group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of [helmetMat, visorMat, suitMat, seatMat]) m.dispose();
    },
  };
}

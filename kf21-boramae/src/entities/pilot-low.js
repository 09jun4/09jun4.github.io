// 낮음 프리셋의 조종사: 기존 로우폴리 스타일(플랫 셰이딩, 정점 색)로 상체만. 삼각형 약 250개, 메시 2개(머리는 고개를 돌린다).
// 멀리서도 조종사로 읽히게 헬멧·고글(짙은 바이저)·산소마스크와 호스의 색과 실루엣을 뚜렷하게 했다.
import * as THREE from 'three';
import { GeoBuilder } from './geo-builder.js';
import { KF21_POINTS } from './kf21-shape.js';
import { damp } from '../core/math.js';

const M = (sx, sy, sz, x, y, z, rx = 0) => new THREE.Matrix4().makeRotationX(rx).scale(new THREE.Vector3(sx, sy, sz)).setPosition(x, y, z);

export function createPilotLow() {
  const eye = KF21_POINTS.eye;
  const group = new THREE.Group();
  group.position.set(0, eye.y, eye.z);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // 몸: 어깨가 넓은 상체 + 멜빵 두 줄 + 구명조끼 목깃
  const body = new GeoBuilder();
  body.color(0x56603f);
  body.addGeometry(new THREE.BoxGeometry(0.5, 0.36, 0.26), M(1, 1, 1, 0, -0.5, 0.06), [0, -0.5, 0.06]); // 가슴·어깨
  body.addGeometry(new THREE.BoxGeometry(0.36, 0.3, 0.24), M(1, 1, 1, 0, -0.8, 0.07), [0, -0.8, 0.07]); // 배
  body.color(0x6b7550);
  for (const sx of [-1, 1]) body.addGeometry(new THREE.BoxGeometry(0.15, 0.16, 0.2), M(1, 1, 1, sx * 0.3, -0.42, 0.05), [sx * 0.3, -0.42, 0.05]); // 어깨 덩이
  body.color(0x2c3226);
  for (const sx of [-1, 1]) body.addGeometry(new THREE.BoxGeometry(0.06, 0.4, 0.03), M(1, 1, 1, sx * 0.11, -0.5, -0.085), [sx * 0.11, -0.5, 0.2]); // 멜빵
  body.color(0x3d4433);
  body.addGeometry(new THREE.BoxGeometry(0.3, 0.07, 0.3), M(1, 1, 1, 0, -0.31, 0.06), [0, -0.31, 0.06]); // 목깃
  body.color(0xc08a6e);
  body.addGeometry(new THREE.BoxGeometry(0.1, 0.1, 0.1), M(1, 1, 1, 0, -0.24, 0.06), [0, -0.24, 0.06]); // 목
  // 머리: 헬멧(밝은 회색) + 고글(짙은 파랑, 앞으로 도드라짐) + 산소마스크(검은 고무 + 회색 겉껍데기) + 호스
  const head = new GeoBuilder();
  head.color(0xc4c9cd);
  head.addGeometry(new THREE.IcosahedronGeometry(0.155, 1), M(1, 1.04, 1.12, 0, 0.0, 0.07), [0, 0, 0.07]); // 헬멧
  head.color(0x8f969b);
  for (const sx of [-1, 1]) head.addGeometry(new THREE.BoxGeometry(0.03, 0.1, 0.1), M(1, 1, 1, sx * 0.155, -0.02, 0.07), [sx * 0.1, -0.02, 0.07]); // 귀덮개
  head.color(0x14305c);
  head.addGeometry(new THREE.BoxGeometry(0.25, 0.085, 0.07), M(1, 1, 1, 0, 0.012, -0.085, 0.12), [0, 0.012, 0.2]); // 고글(바이저)
  head.color(0x23272b);
  head.addGeometry(new THREE.BoxGeometry(0.27, 0.02, 0.08), M(1, 1, 1, 0, 0.062, -0.08, 0.12), [0, 0.062, 0.2]); // 고글 위 테
  head.color(0x1b1e21);
  head.addGeometry(new THREE.BoxGeometry(0.12, 0.1, 0.09), M(1, 1, 1, 0, -0.075, -0.09, -0.15), [0, -0.075, 0.2]); // 마스크(고무)
  head.color(0x5a6166);
  head.addGeometry(new THREE.BoxGeometry(0.075, 0.07, 0.05), M(1, 1, 1, 0, -0.08, -0.14, -0.15), [0, -0.08, 0.2]); // 마스크 겉껍데기
  head.color(0x111315);
  head.addGeometry(new THREE.BoxGeometry(0.035, 0.03, 0.12), M(1, 1, 1, 0.09, -0.07, -0.03), [0, -0.07, -0.03]); // 마스크 끈(오른쪽)
  head.addGeometry(new THREE.BoxGeometry(0.035, 0.03, 0.12), M(1, 1, 1, -0.09, -0.07, -0.03), [0, -0.07, -0.03]); // 마스크 끈(왼쪽)
  // 호스는 몸에 붙인다(고개를 돌려도 가슴 쪽은 그대로)
  body.color(0x111315);
  body.addGeometry(new THREE.BoxGeometry(0.045, 0.3, 0.045), M(1, 1, 1, -0.03, -0.3, -0.13, 0.28), [0, -0.3, 0.2]);
  body.color(0xaeb4b8);
  body.addGeometry(new THREE.BoxGeometry(0.07, 0.06, 0.05), M(1, 1, 1, -0.07, -0.46, -0.1), [0, -0.46, 0.2]); // 가슴 커넥터
  const bodyGeo = body.build(), headGeo = head.build();
  const bodyMesh = new THREE.Mesh(bodyGeo, mat);
  const headMesh = new THREE.Mesh(headGeo, mat);
  group.add(bodyMesh, headMesh);
  let yaw = 0;
  return {
    group,
    triangles: (bodyGeo.attributes.position.count + headGeo.attributes.position.count) / 3,
    update(o) { yaw = damp(yaw, -o.turn * 0.45, 0.25, Math.max(o.dt || 0.016, 0.001)); headMesh.rotation.y = yaw; },
    setFirstPerson(on) { group.visible = !on; },
    dispose() { bodyGeo.dispose(); headGeo.dispose(); mat.dispose(); },
  };
}

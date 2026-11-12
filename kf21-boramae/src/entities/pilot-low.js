// 낮음 프리셋의 단순한 조종사(헬멧 + 몸통): 기존 로우폴리 스타일(플랫 셰이딩, 삼각형 수십 개).
import * as THREE from 'three';
import { GeoBuilder } from './geo-builder.js';
import { KF21_POINTS } from './kf21-shape.js';
import { damp } from '../core/math.js';

export function createPilotLow() {
  const eye = KF21_POINTS.eye;
  const group = new THREE.Group();
  group.position.set(0, eye.y, eye.z);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new GeoBuilder();
  body.color(0x4d5742);
  body.addGeometry(new THREE.IcosahedronGeometry(0.24, 0), new THREE.Matrix4().makeScale(1, 1.3, 0.7).setPosition(0, -0.55, 0.0), [0, -0.55, 0]);
  body.color(0x2c3238);
  body.addGeometry(new THREE.BoxGeometry(0.34, 0.5, 0.1), new THREE.Matrix4().setPosition(0, -0.5, 0.32), [0, -0.5, 0]);
  const head = new GeoBuilder();
  head.color(0xc9cdd1);
  head.addGeometry(new THREE.IcosahedronGeometry(0.15, 1), new THREE.Matrix4().makeScale(1, 1.06, 1.12).setPosition(0, 0, 0.03), [0, 0, 0.03]);
  head.color(0x1a2230);
  head.addGeometry(new THREE.IcosahedronGeometry(0.14, 0), new THREE.Matrix4().makeScale(1, 0.55, 0.9).setPosition(0, 0.0, -0.03), [0, 0, -0.03]);
  const bodyGeo = body.build(), headGeo = head.build();
  const bodyMesh = new THREE.Mesh(bodyGeo, mat);
  const headMesh = new THREE.Mesh(headGeo, mat);
  group.add(bodyMesh, headMesh);
  let yaw = 0;
  return {
    group,
    update(o) { yaw = damp(yaw, -o.turn * 0.45, 0.25, Math.max(o.dt || 0.016, 0.001)); headMesh.rotation.y = yaw; },
    setFirstPerson(on) { group.visible = !on; },
    dispose() { bodyGeo.dispose(); headGeo.dispose(); mat.dispose(); },
  };
}

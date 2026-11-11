// 1인칭 조종석: 캐노피 프레임, 글레어실드, 계기판(대형 화면), HUD 유리, 조종간, 스로틀.
// 원점 = 조종사 눈. 앞 = -z. 시야(상하 ±39°) 안에 들어오는 부분만 만든다.
import * as THREE from 'three';
import { GeoBuilder } from './geo-builder.js';
import { PALETTE } from '../data/palette.js';
import { DEG, damp } from '../core/math.js';

const C = PALETTE.cockpit;

const DIM = {
  sillY: -0.37, sillX: 0.53,
  shieldY: -0.345, shieldNearZ: -0.74, shieldFarZ: -1.18,
  panelZ: -0.76, panelTopY: -0.36, panelBotY: -0.86, panelHalfW: 0.47,
  hud: { z: -0.86, halfW: 0.14, y0: -0.24, y1: 0.03, bar: 0.009 },
  stick: { baseY: -0.73, z: -0.53, length: 0.37, throw: 11 },
  arch: { halfW: 0.56, rise: 0.98, z0: -0.46, rake: 0.36, bar: 0.017, segments: 12 },
};

function squareRing(c, right, up, half) {
  return [
    [c[0] - right[0] * half - up[0] * half, c[1] - right[1] * half - up[1] * half, c[2] - right[2] * half - up[2] * half],
    [c[0] + right[0] * half - up[0] * half, c[1] + right[1] * half - up[1] * half, c[2] + right[2] * half - up[2] * half],
    [c[0] + right[0] * half + up[0] * half, c[1] + right[1] * half + up[1] * half, c[2] + right[2] * half + up[2] * half],
    [c[0] - right[0] * half + up[0] * half, c[1] - right[1] * half + up[1] * half, c[2] - right[2] * half + up[2] * half],
  ];
}

/** 점 목록을 따라가는 사각 단면 막대 */
function bar(b, pts, half) {
  const rings = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const dir = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize();
    const ref = Math.abs(dir.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    return squareRing(p, right.toArray(), up.toArray(), half);
  });
  b.loft(rings, { capStart: true, capEnd: true });
}

function buildStatic() {
  const b = new GeoBuilder();
  const d = DIM;

  // 캐노피 앞 프레임(뒤로 누운 아치)
  b.color(C.frame);
  const arch = [];
  for (let i = 0; i <= d.arch.segments; i++) {
    const a = (Math.PI * i) / d.arch.segments;
    arch.push([-Math.cos(a) * d.arch.halfW, d.sillY + Math.sin(a) * d.arch.rise, d.arch.z0 - Math.sin(a) * d.arch.rake]);
  }
  bar(b, arch, d.arch.bar);

  b.symmetric(() => {
    // 캐노피 옆 레일
    b.color(C.frame);
    bar(b, [[d.sillX, d.sillY, 0.4], [d.sillX, d.sillY, d.shieldFarZ]], 0.026);
    // 옆 벽(레일 아래에서 안쪽으로 내려가는 면)
    b.color(C.panel);
    b.quad([d.sillX, d.sillY, 0.4], [d.sillX, d.sillY, d.panelZ], [0.36, -0.9, d.panelZ], [0.36, -0.9, 0.4], [d.sillX + 1, 0, 0]);
    // 옆 콘솔 윗면
    b.color(C.panelTrim);
    b.quad([d.sillX - 0.03, -0.5, 0.3], [d.sillX - 0.03, -0.5, d.panelZ], [0.33, -0.56, d.panelZ], [0.33, -0.56, 0.3], [0, -2, 0]);
  });

  // 글레어실드(계기판 위 덮개)
  b.color(C.frame);
  b.prism([[-0.5, d.shieldNearZ], [0.5, d.shieldNearZ], [0.4, d.shieldFarZ], [-0.4, d.shieldFarZ]], d.shieldY - 0.04, d.shieldY);

  // 계기판
  b.color(C.panel);
  b.quad([-d.panelHalfW, d.panelTopY, d.panelZ], [d.panelHalfW, d.panelTopY, d.panelZ], [d.panelHalfW, d.panelBotY, d.panelZ + 0.05], [-d.panelHalfW, d.panelBotY, d.panelZ + 0.05], [0, -0.6, -3]);
  // 화면 테두리
  b.color(C.panelTrim);
  const z1 = d.panelZ + 0.006;
  b.quad([-0.33, -0.385, z1], [0.33, -0.385, z1], [0.33, -0.66, z1 + 0.026], [-0.33, -0.66, z1 + 0.026], [0, -0.5, -3]);
  // 계기판 양옆 작은 스위치 줄
  b.symmetric(() => {
    for (let i = 0; i < 4; i++) {
      b.color(i === 1 ? C.warn : C.panelTrim);
      const y = -0.4 - i * 0.055;
      const zz = z1 + (0.4 + y) * -0.1;
      b.quad([0.37, y, zz], [0.43, y, zz], [0.43, y - 0.035, zz + 0.004], [0.37, y - 0.035, zz + 0.004], [0.4, y, -3]);
    }
  });

  // HUD 받침과 유리 테두리
  const h = d.hud;
  b.color(C.frame);
  b.symmetric(() => {
    bar(b, [[h.halfW, d.shieldY, h.z + 0.03], [h.halfW, h.y0, h.z]], h.bar);
    bar(b, [[h.halfW, h.y0, h.z], [h.halfW, h.y1, h.z - 0.03]], h.bar * 0.7);
  });
  bar(b, [[-h.halfW, h.y0, h.z], [h.halfW, h.y0, h.z]], h.bar * 0.7);

  // 스로틀(왼쪽 콘솔)
  b.color(C.stickGrip);
  bar(b, [[-0.4, -0.5, -0.5], [-0.4, -0.43, -0.53]], 0.022);
  bar(b, [[-0.435, -0.425, -0.53], [-0.365, -0.425, -0.53]], 0.024);
  return b.build();
}

function buildScreens() {
  // 빛나는 화면(조명 영향 없음): 대형 화면 바탕 + 지평선·눈금 같은 단순 무늬
  const b = new GeoBuilder();
  const z = DIM.panelZ + 0.012;
  const slope = 0.026 / 0.275;
  const q = (x0, y0, x1, y1, lift = 0) => {
    const za = z + (-0.385 - y0) * slope + lift;
    const zb = z + (-0.385 - y1) * slope + lift;
    b.quad([x0, y0, za], [x1, y0, za], [x1, y1, zb], [x0, y1, zb], [0, -0.5, -3]);
  };
  b.color(C.screen);
  q(-0.315, -0.398, 0.315, -0.648);
  b.color(C.screenGlow);
  q(-0.29, -0.468, -0.03, -0.472, 0.002); // 지평선
  q(0.03, -0.468, 0.29, -0.472, 0.002);
  q(-0.005, -0.44, 0.005, -0.5, 0.002);
  for (let i = 0; i < 5; i++) q(-0.29 + i * 0.03, -0.62, -0.275 + i * 0.03, -0.62 + 0.012 * (1 + (i * 7) % 4), 0.002); // 막대 눈금
  for (let i = 0; i < 3; i++) q(0.17, -0.54 - i * 0.03, 0.29, -0.546 - i * 0.03, 0.002);
  return b.build();
}

function buildStick() {
  const b = new GeoBuilder();
  const L = DIM.stick.length;
  b.color(C.stick);
  bar(b, [[0, 0, 0], [0, L * 0.62, 0]], 0.014);
  b.color(C.stickGrip);
  bar(b, [[0, L * 0.58, 0.004], [0, L * 0.86, -0.012], [0, L, -0.03]], 0.026);
  b.color(C.warn);
  bar(b, [[0.012, L * 0.99, -0.03], [0.012, L * 1.03, -0.036]], 0.009);
  return b.build();
}

/** @param {THREE.Vector3} eye 기체 좌표계의 눈 위치 */
export function createCockpit(eye) {
  const group = new THREE.Group();
  group.name = 'cockpit';
  group.position.copy(eye);

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new THREE.Mesh(buildStatic(), mat);
  const screens = new THREE.Mesh(buildScreens(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const stick = new THREE.Mesh(buildStick(), mat);
  stick.position.set(0, DIM.stick.baseY, DIM.stick.z);

  const h = DIM.hud;
  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -h.halfW, h.y0, h.z, h.halfW, h.y0, h.z, h.halfW, h.y1, h.z - 0.03,
    -h.halfW, h.y0, h.z, h.halfW, h.y1, h.z - 0.03, -h.halfW, h.y1, h.z - 0.03,
  ], 3));
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial({ color: C.hudGlass, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
  glass.renderOrder = 8;

  group.add(body, screens, stick, glass);
  for (const m of [body, screens, stick, glass]) m.frustumCulled = false;

  const state = { pitch: 0, turn: 0 };
  /** 조종간을 입력에 맞춰 기울인다. pitch +1 = 당김(기수 올림), turn +1 = 오른쪽 */
  function setStick(pitch, turn, dt) {
    state.pitch = damp(state.pitch, pitch, 0.07, dt);
    state.turn = damp(state.turn, turn, 0.07, dt);
    stick.rotation.x = state.pitch * DIM.stick.throw * DEG;
    stick.rotation.z = -state.turn * DIM.stick.throw * DEG;
  }
  return { group, setStick };
}

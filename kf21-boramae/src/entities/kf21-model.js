// KF-21 보라매 모델. 전부 코드로 만든다(외부 3D 파일 없음).
// 좌표: 앞 = -z, 위 = +y, 오른쪽 = +x. 단위는 m. 기수에서 잰 거리 s를 z = s - ORIGIN_S 로 옮긴다.
// 실기 제원(길이 16.9, 폭 11.2, 높이 4.7)에 맞춘 형상: 각진 기수와 차인, 물방울 캐노피,
// 측면 공기흡입구, 동체-주익 블렌딩(LERX), 잘린 다이아몬드 주익, 바깥으로 기운 쌍수직미익,
// 전가동 수평미익, 쌍발 노즐.
import * as THREE from 'three';
import { GeoBuilder, wingRings, thicknessAt } from './geo-builder.js';
import { PALETTE } from '../data/palette.js';
import { DEG, damp, lerp } from '../core/math.js';

const P = PALETTE.kf21;
const ORIGIN_S = 8.7; // 모델 원점(무게중심 부근)까지 기수에서의 거리
const Z = (s) => s - ORIGIN_S;

// ── 형상 표 ────────────────────────────────────────────────────────────────
// 동체 단면: [s, 반폭 w, 윗높이 top, 아랫깊이 bot, 차인 높이 chine, 중심선 높이 cy]
const FUSELAGE = [
  [0.0, 0.03, 0.03, 0.03, 0.0, -0.18],
  [0.8, 0.25, 0.22, 0.2, 0.0, -0.15],
  [2.0, 0.5, 0.42, 0.4, 0.0, -0.09],
  [3.3, 0.74, 0.56, 0.56, 0.02, -0.03],
  [4.6, 0.92, 0.66, 0.72, 0.05, 0.0],
  [5.8, 1.04, 0.78, 0.82, 0.1, 0.0],
  [6.7, 1.14, 0.94, 0.86, 0.14, 0.0],
  [7.7, 1.58, 0.92, 0.88, 0.12, 0.0],
  [9.5, 1.74, 0.82, 0.88, 0.1, 0.0],
  [11.5, 1.72, 0.7, 0.82, 0.08, 0.0],
  [13.2, 1.62, 0.58, 0.7, 0.05, 0.0],
  [14.6, 1.48, 0.5, 0.56, 0.0, 0.0],
  [15.35, 1.36, 0.46, 0.5, 0.0, 0.0],
];
const FUSELAGE_COLORS = [P.radome, P.radome, P.radome, P.base, P.base, P.light, P.base, P.base, P.light, P.base, P.base, P.dark];

// 캐노피 단면: [s, 반폭, 높이, 바닥 y]
const CANOPY = [
  [3.7, 0.05, 0.03, 0.44],
  [4.1, 0.36, 0.32, 0.46],
  [4.7, 0.5, 0.64, 0.5],
  [5.4, 0.52, 0.72, 0.56],
  [6.2, 0.46, 0.56, 0.68],
  [6.9, 0.3, 0.28, 0.82],
  [7.5, 0.1, 0.05, 0.9],
];

const WING = {
  y: 0.1,
  root: { span: 1.5, le: 7.45, te: 12.9, t: 0.38 },
  tip: { span: 5.6, le: 10.9, te: 12.05, t: 0.09 },
  flap: { from: 2.0, to: 4.85, chord: 0.74 }, // 스팬 구간, 힌지의 코드 위치(0~1)
};
const STAB = {
  y: 0.0,
  root: { span: 1.38, le: 12.95, te: 16.05, t: 0.2 },
  tip: { span: 3.95, le: 15.0, te: 15.85, t: 0.06 },
  pivotS: 14.85,
};
const FIN = {
  base: { x: 1.12, y: 0.34 },
  cant: 25, // 바깥으로 기운 각도(도)
  root: { span: 0, le: 11.25, te: 14.65, t: 0.24 },
  tip: { span: 2.75, le: 13.35, te: 14.5, t: 0.08 },
  rudder: { from: 0.3, to: 2.3, chord: 0.7 },
};
const NOZZLE = { x: 0.66, y: -0.03, s0: 15.1, s1: 16.55, r: 0.5 };

/** 모델 좌표계의 주요 지점(총구, 조종사 눈, 노즐 끝) */
export const KF21_POINTS = {
  muzzle: new THREE.Vector3(-0.88, 0.36, Z(5.0)),
  eye: new THREE.Vector3(0, 1.06, Z(5.1)),
  nozzleEnd: Z(NOZZLE.s1),
  length: 16.9,
};

// ── 단면 생성 ──────────────────────────────────────────────────────────────
function fuselageRing([s, w, top, bot, chine, cy]) {
  const z = Z(s);
  const half = [
    [0, top],
    [w * 0.42, top * 0.93],
    [w * 0.8, chine + (top - chine) * 0.36],
    [w, chine],
    [w * 0.82, chine - (chine + bot) * 0.46],
    [w * 0.45, -bot * 0.94],
    [0, -bot],
  ];
  const ring = [];
  for (let i = 0; i < half.length; i++) ring.push([half[i][0], half[i][1] + cy, z]);
  for (let i = half.length - 2; i > 0; i--) ring.push([-half[i][0], half[i][1] + cy, z]);
  return ring;
}

function canopyRing([s, w, h, base]) {
  const z = Z(s);
  const ring = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (i / N);
    // 위쪽이 살짝 평평한 물방울 단면
    ring.push([-Math.cos(a) * w, base + Math.pow(Math.sin(a), 0.8) * h, z]);
  }
  return ring;
}

const along = (a, b, span) => {
  const u = (span - a.span) / (b.span - a.span);
  return { span, le: lerp(a.le, b.le, u), te: lerp(a.te, b.te, u), t: lerp(a.t, b.t, u) };
};
const toZ = (st, y) => ({ span: st.span, le: Z(st.le), te: Z(st.te), t: st.t, y });

// ── 본체(움직이지 않는 부분 전부를 지오메트리 하나로) ────────────────────
function buildBody() {
  const b = new GeoBuilder();

  // 동체
  b.loft(FUSELAGE.map(fuselageRing), { colorAt: (i) => FUSELAGE_COLORS[i], capEnd: true, capEndColor: P.dark });

  // 캐노피 앞 IRST 센서
  b.color(P.sensor);
  b.addGeometry(new THREE.IcosahedronGeometry(0.13, 0), new THREE.Matrix4().makeTranslation(0, 0.52, Z(3.45)), [0, 0.52, Z(3.45)]);

  b.symmetric(() => {
    // 공기흡입구: 앞면이 비스듬히 깎인 캐럿형. 앞 뚜껑을 어둡게 칠해 입구로 보이게 한다.
    const lip = [[0.86, 0.3, Z(5.5)], [1.5, 0.2, Z(5.85)], [1.42, -0.62, Z(6.4)], [0.82, -0.76, Z(6.05)]];
    const mid = [[0.9, 0.3, Z(6.8)], [1.54, 0.16, Z(6.8)], [1.46, -0.66, Z(6.8)], [0.86, -0.8, Z(6.8)]];
    const aft = [[0.9, 0.3, Z(7.75)], [1.56, 0.12, Z(7.75)], [1.44, -0.6, Z(7.75)], [0.86, -0.78, Z(7.75)]];
    b.color(P.base);
    b.loft([lip, mid, aft], { capStart: true, capStartColor: P.intake });

    // LERX: 기수 차인에서 주익 앞전으로 이어지는 얇은 판(흡입구 지붕)
    b.color(P.dark);
    b.prism([[0.8, Z(4.2)], [1.6, Z(5.75)], [2.05, Z(7.8)], [0.9, Z(7.8)]], 0.14, 0.26);

    // 주익: 안쪽 / 플래퍼론 앞쪽 / 바깥쪽
    const wy = WING.y;
    const f0 = along(WING.root, WING.tip, WING.flap.from);
    const f1 = along(WING.root, WING.tip, WING.flap.to);
    b.color(P.base);
    b.loft(wingRings(toZ(WING.root, wy), toZ(f0, wy)), { capStart: true, capEnd: true });
    b.loft(wingRings(toZ(f0, wy), toZ(f1, wy), { to: WING.flap.chord }), { capStart: true, capEnd: true });
    b.color(P.light);
    b.loft(wingRings(toZ(f1, wy), toZ(WING.tip, wy)), { capStart: true, capEnd: true, capEndColor: P.edge });
    // 앞전 띠(명도 차이로 패널 구분)
    b.color(P.edge);
    b.loft(wingRings(
      { ...toZ(WING.root, wy + 0.004), t: WING.root.t * 1.04 },
      { ...toZ(WING.tip, wy + 0.004), t: WING.tip.t * 1.1 }, { to: 0.07 }), { capEnd: true });

    // 수직미익(러더 앞쪽 고정부) — 날개와 같은 방식으로 만든 뒤 세워서 바깥으로 기울인다
    b.withMatrix(finMatrix(), () => {
      const r0 = along(FIN.root, FIN.tip, FIN.rudder.from);
      const r1 = along(FIN.root, FIN.tip, FIN.rudder.to);
      b.color(P.base);
      b.loft(wingRings(toZ(FIN.root, 0), toZ(r0, 0)), { capStart: true, capEnd: true });
      b.loft(wingRings(toZ(r0, 0), toZ(r1, 0), { to: FIN.rudder.chord }), { capStart: true, capEnd: true });
      b.color(P.dark);
      b.loft(wingRings(toZ(r1, 0), toZ(FIN.tip, 0)), { capStart: true, capEnd: true, capEndColor: P.edge });
    });

    // 엔진 노즐(LatheGeometry): 바깥은 살짝 조여지고 안쪽은 어둡다
    const nz = Z(NOZZLE.s0);
    const len = NOZZLE.s1 - NOZZLE.s0;
    const place = new THREE.Matrix4().makeTranslation(NOZZLE.x, NOZZLE.y, nz).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    const outer = [[NOZZLE.r, 0], [NOZZLE.r * 1.06, len * 0.3], [NOZZLE.r * 0.96, len * 0.72], [NOZZLE.r * 0.8, len]];
    const inner = [[NOZZLE.r * 0.8, len], [NOZZLE.r * 0.7, len * 0.55], [NOZZLE.r * 0.66, len * 0.3], [0.001, len * 0.3]];
    b.color(P.nozzle);
    b.addGeometry(new THREE.LatheGeometry(outer.map(([r, y]) => new THREE.Vector2(r, y)), 10), place, [NOZZLE.x, NOZZLE.y, nz + len * 0.5]);
    b.color(P.nozzleInner);
    b.invert = true;
    b.addGeometry(new THREE.LatheGeometry(inner.map(([r, y]) => new THREE.Vector2(r, y)), 10), place, [NOZZLE.x, NOZZLE.y, nz + len * 0.6]);
    b.invert = false;

    // 주익 윗면의 태극 원형 표식(빨강/파랑 반원)
    const rx = 3.55;
    const st = along(WING.root, WING.tip, rx);
    const c = 0.46;
    const ry = wy + (thicknessAt(c) * st.t) / 2 + 0.008;
    const rz = Z(lerp(st.le, st.te, c));
    const R = 0.4;
    const SEG = 6;
    for (let half = 0; half < 2; half++) {
      b.color(half === 0 ? P.roundelBlue : P.roundelRed);
      for (let i = 0; i < SEG; i++) {
        const a0 = Math.PI * half + (Math.PI * i) / SEG;
        const a1 = Math.PI * half + (Math.PI * (i + 1)) / SEG;
        b.tri([rx, ry, rz], [rx + Math.cos(a0) * R, ry, rz + Math.sin(a0) * R], [rx + Math.cos(a1) * R, ry, rz + Math.sin(a1) * R], [rx, ry - 1, rz]);
      }
    }
  });

  return b.build();
}

function buildCanopy() {
  const b = new GeoBuilder();
  b.color(P.canopy);
  b.loft(CANOPY.map(canopyRing));
  return b.build();
}

/** 수직미익 로컬(span=높이) → 기체 좌표(오른쪽 기준, 왼쪽은 빌더가 x 대칭으로 만든다). */
function finMatrix() {
  const tilt = (90 - FIN.cant) * DEG;
  return new THREE.Matrix4().makeTranslation(FIN.base.x, FIN.base.y, 0).multiply(new THREE.Matrix4().makeRotationZ(tilt));
}

// ── 조종면(따로 움직이는 부분) ────────────────────────────────────────────
// 각 조종면은 힌지 좌표계(원점 = 힌지 안쪽 끝, x = 힌지 방향)로 구워서, 메시를 x축으로 돌리면 꺾인다.
function hingeFrame(p0, p1, upHint) {
  const x = new THREE.Vector3().subVectors(p1, p0).normalize();
  const zAxis = new THREE.Vector3().crossVectors(x, upHint).normalize();
  const y = new THREE.Vector3().crossVectors(zAxis, x).normalize();
  return new THREE.Matrix4().makeBasis(x, y, zAxis).setPosition(p0);
}

function makeSurface(material, side, hingeLocal, build, upHint = new THREE.Vector3(0, 1, 0), pre = null) {
  const b = new GeoBuilder();
  b.mirrorX = side < 0;
  if (pre) b.withMatrix(pre, () => build(b)); else build(b);
  const toWorld = (p) => {
    const v = new THREE.Vector3(p[0], p[1], p[2]);
    if (pre) v.applyMatrix4(pre);
    if (side < 0) v.x = -v.x;
    return v;
  };
  const up = upHint.clone();
  if (pre) up.transformDirection(pre);
  if (side < 0) up.x = -up.x;
  const frame = hingeFrame(toWorld(hingeLocal[0]), toWorld(hingeLocal[1]), up);
  const mesh = new THREE.Mesh(b.build(frame.clone().invert()), material);
  frame.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.userData.rest = mesh.quaternion.clone();
  mesh.userData.sign = side; // 좌우 힌지 방향이 반대라서 같은 물리 방향을 내려면 부호를 곱한다
  return mesh;
}

const _qx = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
function deflect(mesh, angle) {
  _qx.setFromAxisAngle(_xAxis, angle * mesh.userData.sign);
  mesh.quaternion.copy(mesh.userData.rest).multiply(_qx);
}

// ── 배기 ───────────────────────────────────────────────────────────────────
function buildExhaustGeometry() {
  // 길이 1짜리 원뿔 2겹 × 엔진 2개. 메시의 z 스케일로 길이를 바꾼다.
  const pos = [];
  const tt = [];
  const SEG = 8;
  const layers = [{ r: NOZZLE.r * 0.72, len: 1, k: 0.55 }, { r: NOZZLE.r * 0.42, len: 0.6, k: 1 }];
  for (const side of [-1, 1]) {
    for (const L of layers) {
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2;
        const a1 = ((i + 1) / SEG) * Math.PI * 2;
        pos.push(side * NOZZLE.x + Math.cos(a0) * L.r, NOZZLE.y + Math.sin(a0) * L.r, 0);
        pos.push(side * NOZZLE.x + Math.cos(a1) * L.r, NOZZLE.y + Math.sin(a1) * L.r, 0);
        pos.push(side * NOZZLE.x, NOZZLE.y, L.len);
        tt.push(0, L.k, 0, L.k, 1, L.k);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(tt, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 4), 12);
  return g;
}

function buildExhaustMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCore: { value: new THREE.Color(P.exhaustCore) },
      uEdge: { value: new THREE.Color(P.exhaustEdge) },
      uPower: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aFade;
      varying vec2 vFade;
      void main() {
        vFade = aFade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore;
      uniform vec3 uEdge;
      uniform float uPower;
      varying vec2 vFade;
      void main() {
        float a = pow(1.0 - vFade.x, 1.5) * mix(0.55, 1.0, vFade.y) * uPower;
        vec3 col = mix(uEdge, uCore, pow(1.0 - vFade.x, 2.0) * vFade.y);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ── 조립 ───────────────────────────────────────────────────────────────────
/**
 * @returns {{group:THREE.Group, exterior:THREE.Group, setControls:Function, setExhaust:Function, triangles:number}}
 */
export function createKF21(tuning) {
  const group = new THREE.Group();
  group.name = 'kf21';
  const exterior = new THREE.Group();
  group.add(exterior);

  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.18 });
  const canopyMat = new THREE.MeshPhongMaterial({ color: P.canopy, specular: P.canopySpecular, shininess: 90, flatShading: true });

  const body = new THREE.Mesh(buildBody(), bodyMat);
  const canopy = new THREE.Mesh(buildCanopy(), canopyMat);
  exterior.add(body, canopy);

  const surfaces = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'R' : 'L';
    // 플래퍼론
    const f0 = along(WING.root, WING.tip, WING.flap.from);
    const f1 = along(WING.root, WING.tip, WING.flap.to);
    const hz = (st) => Z(lerp(st.le, st.te, WING.flap.chord));
    surfaces['flap' + key] = makeSurface(bodyMat, side, [[f0.span, WING.y, hz(f0)], [f1.span, WING.y, hz(f1)]], (b) => {
      b.color(P.light);
      b.loft(wingRings(toZ(f0, WING.y), toZ(f1, WING.y), { from: WING.flap.chord }), { capStart: true, capEnd: true });
    });
    // 전가동 수평미익
    surfaces['stab' + key] = makeSurface(bodyMat, side, [[STAB.root.span, STAB.y, Z(STAB.pivotS)], [STAB.tip.span, STAB.y, Z(STAB.pivotS)]], (b) => {
      b.color(P.base);
      b.loft(wingRings(toZ(STAB.root, STAB.y), toZ(STAB.tip, STAB.y)), { capStart: true, capEnd: true, capEndColor: P.edge });
      b.color(P.edge);
      b.loft(wingRings({ ...toZ(STAB.root, STAB.y + 0.003), t: STAB.root.t * 1.05 }, { ...toZ(STAB.tip, STAB.y + 0.003), t: STAB.tip.t * 1.1 }, { to: 0.08 }), { capEnd: true });
    });
    // 러더: 수직미익 좌표계에서 만든 뒤 세운다(오른쪽 기준으로 만들고 왼쪽은 x 대칭)
    const r0 = along(FIN.root, FIN.tip, FIN.rudder.from);
    const r1 = along(FIN.root, FIN.tip, FIN.rudder.to);
    const rz = (st) => Z(lerp(st.le, st.te, FIN.rudder.chord));
    surfaces['rudder' + key] = makeSurface(bodyMat, side, [[r0.span, 0, rz(r0)], [r1.span, 0, rz(r1)]], (b) => {
      b.color(P.light);
      b.loft(wingRings(toZ(r0, 0), toZ(r1, 0), { from: FIN.rudder.chord }), { capStart: true, capEnd: true });
    }, new THREE.Vector3(0, 1, 0), finMatrix());
  }
  for (const m of Object.values(surfaces)) exterior.add(m);

  // 노즐 안쪽 불빛 + 배기 원뿔
  const glowMat = new THREE.MeshBasicMaterial({ color: P.engineGlow });
  const glowGeo = new THREE.CircleGeometry(NOZZLE.r * 0.64, 10);
  const glows = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Mesh(glowGeo, glowMat);
    g.position.set(side * NOZZLE.x, NOZZLE.y, Z(NOZZLE.s0 + (NOZZLE.s1 - NOZZLE.s0) * 0.32));
    exterior.add(g);
    glows.push(g);
  }
  const exhaustMat = buildExhaustMaterial();
  const exhaust = new THREE.Mesh(buildExhaustGeometry(), exhaustMat);
  exhaust.position.z = Z(NOZZLE.s1) - 0.25;
  exhaust.renderOrder = 5;
  exterior.add(exhaust);

  const state = { elevator: 0, aileron: 0, rudder: 0, exhaust: 1 };
  const lim = tuning.surfaces;

  /**
   * 조종면을 입력에 맞춰 움직인다.
   * @param {number} pitch -1(기수 내림)~+1(기수 올림)
   * @param {number} turn -1(좌)~+1(우)
   * @param {number} dt 초
   */
  function setControls(pitch, turn, dt) {
    state.elevator = damp(state.elevator, pitch, lim.tau, dt);
    state.aileron = damp(state.aileron, turn, lim.tau, dt);
    state.rudder = damp(state.rudder, turn, lim.tau, dt);
    const elev = state.elevator * lim.elevator * DEG;
    const ail = state.aileron * lim.aileron * DEG;
    // 기수 올림 = 수평미익 뒷전이 위로. 우선회 = 오른쪽 플래퍼론 위, 왼쪽 아래.
    deflect(surfaces.stabR, -elev - ail * lim.stabRollMix);
    deflect(surfaces.stabL, -elev + ail * lim.stabRollMix);
    deflect(surfaces.flapR, -ail);
    deflect(surfaces.flapL, ail);
    const rud = state.rudder * lim.rudder * DEG;
    deflect(surfaces.rudderR, rud);
    deflect(surfaces.rudderL, -rud);
  }

  /** @param {number} level 0~1 추력 정도 @param {number} time 초(깜빡임용) */
  function setExhaust(level, time, dt) {
    state.exhaust = damp(state.exhaust, level, tuning.exhaust.tau, dt);
    const ex = tuning.exhaust;
    const flicker = 1 + Math.sin(time * ex.flickerHz) * ex.flicker + Math.sin(time * ex.flickerHz * 2.7) * ex.flicker * 0.5;
    exhaust.scale.z = lerp(ex.lengthMin, ex.lengthMax, state.exhaust) * flicker;
    exhaustMat.uniforms.uPower.value = lerp(ex.powerMin, ex.powerMax, state.exhaust);
  }

  setControls(0, 0, 1);
  setExhaust(0.5, 0, 1);

  let triangles = 0;
  exterior.traverse((o) => {
    if (o.isMesh) triangles += o.geometry.attributes.position.count / (o.geometry.index ? 1 : 3);
  });

  return { group, exterior, surfaces, setControls, setExhaust, triangles, materials: { bodyMat, canopyMat, exhaustMat } };
}

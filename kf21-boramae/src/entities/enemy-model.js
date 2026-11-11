// 적기 모델(가상의 로우폴리 델타익 전투기). KF-21과 실루엣이 확실히 다르게: 단발 엔진, 수직미익 1장, 삼각 주익.
// 어두운 기체 + 붉은 포인트 + 붉은 외곽선으로 푸른 하늘에서 바로 구분된다.
// 지오메트리·머티리얼은 모든 적기가 공유한다.
import * as THREE from 'three';
import { GeoBuilder, wingRings } from './geo-builder.js';
import { PALETTE } from '../data/palette.js';

const P = PALETTE.enemy;
const ORIGIN_S = 7.4;
const Z = (s) => s - ORIGIN_S;

// [s, 반폭, 윗높이, 아랫깊이]
const BODY = [
  [0.0, 0.03, 0.03, 0.03],
  [1.4, 0.34, 0.3, 0.3],
  [3.6, 0.62, 0.56, 0.5],
  [6.8, 0.82, 0.66, 0.62],
  [10.6, 0.74, 0.62, 0.58],
  [13.0, 0.56, 0.52, 0.5],
  [13.9, 0.46, 0.44, 0.44],
];
const BODY_COLORS = [P.accent, P.base, P.base, P.dark, P.base, P.dark];

function ring([s, w, top, bot]) {
  const z = Z(s);
  return [
    [0, top, z], [w * 0.7, top * 0.62, z], [w, 0, z], [w * 0.7, -bot * 0.7, z],
    [0, -bot, z], [-w * 0.7, -bot * 0.7, z], [-w, 0, z], [-w * 0.7, top * 0.62, z],
  ];
}

const st = (span, le, te, t, y = 0) => ({ span, le: Z(le), te: Z(te), t, y });

function buildBody() {
  const b = new GeoBuilder();
  b.loft(BODY.map(ring), { colorAt: (i) => BODY_COLORS[i], capEnd: true, capEndColor: P.exhaust });

  // 캐노피
  b.color(P.canopy);
  const canopy = [[2.5, 0.04, 0.02, 0.44], [3.3, 0.3, 0.3, 0.46], [4.3, 0.36, 0.42, 0.5], [5.6, 0.26, 0.24, 0.56], [6.4, 0.06, 0.03, 0.6]];
  b.loft(canopy.map(([s, w, h, base]) => {
    const r = [];
    for (let i = 0; i <= 4; i++) { const a = (Math.PI * i) / 4; r.push([-Math.cos(a) * w, base + Math.sin(a) * h, Z(s)]); }
    return r;
  }));

  b.symmetric(() => {
    // 삼각 주익: 안쪽은 어둡게, 바깥쪽은 붉게
    const y = -0.12;
    const root = st(0.5, 4.6, 11.7, 0.34, y);
    const mid = st(3.2, 8.9, 11.75, 0.16, y);
    const tip = st(4.5, 10.95, 11.8, 0.07, y);
    b.color(P.base);
    b.loft(wingRings(root, mid), { capStart: true });
    b.color(P.accent);
    b.loft(wingRings(mid, tip), { capEnd: true });
    // 수평미익
    b.color(P.dark);
    b.loft(wingRings(st(0.4, 11.4, 13.5, 0.16, 0.05), st(2.3, 12.9, 13.7, 0.05, 0.05)), { capStart: true, capEnd: true });
    // 측면 흡입구
    b.color(P.dark);
    b.loft([
      [[0.5, 0.25, Z(4.2)], [0.98, 0.2, Z(4.5)], [0.98, -0.3, Z(4.5)], [0.5, -0.35, Z(4.2)]],
      [[0.6, 0.25, Z(7.2)], [0.98, 0.2, Z(7.2)], [0.98, -0.3, Z(7.2)], [0.6, -0.35, Z(7.2)]],
    ], { capStart: true, capStartColor: 0x08090a });
  });

  // 수직미익 1장(위쪽은 붉게)
  const up = new THREE.Matrix4().makeTranslation(0, 0.4, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  b.withMatrix(up, () => {
    const root = st(0, 8.9, 13.1, 0.22);
    const mid = st(1.7, 11.0, 13.45, 0.13);
    const tip = st(2.9, 12.45, 13.7, 0.07);
    b.color(P.base);
    b.loft(wingRings(root, mid), { capStart: true });
    b.color(P.accent);
    b.loft(wingRings(mid, tip), { capEnd: true });
  });
  return b.build();
}

/** 외곽선용: 같은 위치의 정점 법선을 평균해서 바깥으로 밀어낼 방향을 만든다. */
function addSmoothNormals(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const sum = new Map();
  const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = sum.get(k) || new THREE.Vector3();
    v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i);
    sum.set(k, v);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sum.get(key(i)).clone().normalize();
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  geo.setAttribute('aSmooth', new THREE.BufferAttribute(out, 3));
}

let shared = null;
function getShared() {
  if (shared) return shared;
  const geo = buildBody();
  addSmoothNormals(geo);
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // 외곽선: 뒷면만, 법선 방향으로 밀어낸 껍데기. 두께는 화면에서 약 uPixels 픽셀이 되게 거리 비례.
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(P.outline) },
      uMin: { value: 0.16 },
      uPerDepth: { value: 0.002 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aSmooth;
      uniform float uMin, uPerDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float w = max(uMin, -mv.z * uPerDepth);
        vec3 n = normalize(normalMatrix * aSmooth);
        mv.xyz += n * w;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    fog: false,
  });
  shared = { geo, bodyMat, outlineMat, triangles: geo.attributes.position.count / 3 };
  return shared;
}

/** 외곽선 두께를 화면 픽셀 기준으로 맞춘다(해상도·FOV가 바뀔 때 호출). */
export function setEnemyOutlinePixels(pixels, fovDeg, viewportHeight) {
  const s = getShared();
  s.outlineMat.uniforms.uPerDepth.value = (pixels * 2 * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeight;
}

/**
 * 적기 메시를 group에 채운다(프리셋 전환 때 다시 부른다).
 * 붉은 외곽선은 항상 로우폴리 껍데기를 쓴다(식별용 테두리라 촘촘할 필요가 없고 삼각형을 아낀다).
 * @param {number} detail 0(낮음: 로우폴리) | 1(높음) | 2(최고)
 * @param {(group:THREE.Group, detail:number)=>number} [addHi] 하이폴리 메시를 넣는 함수
 * @returns {number} 삼각형 수
 */
export function fillEnemyVisual(group, detail, addHi) {
  const s = getShared();
  group.clear();
  group.add(new THREE.Mesh(s.geo, s.outlineMat));
  if (detail > 0 && addHi) return s.triangles + addHi(group, detail);
  group.add(new THREE.Mesh(s.geo, s.bodyMat));
  return s.triangles * 2;
}

export function createEnemyVisual(scale) {
  const group = new THREE.Group();
  group.name = 'enemy';
  const triangles = fillEnemyVisual(group, 0);
  group.scale.setScalar(scale);
  group.visible = false;
  return { group, triangles };
}

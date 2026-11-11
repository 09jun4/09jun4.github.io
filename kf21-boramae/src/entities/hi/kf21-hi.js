// KF-21 보라매 하이폴리 모델(높음·최고 프리셋). 전부 코드로 만든다.
// 낮음 모델과 같은 형상 표(kf21-shape.js)를 쓰되, 단면을 매끄러운 곡선으로 잇고 익형·덕트·노즐 꽃잎·
// 파일런·미사일·센서·등화·조종사·랜딩기어를 더한다. detail(1 = 높음, 2 = 최고)로 분할 수만 달라진다.
import * as THREE from 'three';
import { Surf, spline, airfoilThickness } from './surface.js';
import { uvWing, uvBody, uvSide, uvSideY, uvPlain } from './textures.js';
import { Z, FUSELAGE, CANOPY, WING, STAB, FIN, NOZZLE, KF21_POINTS } from '../kf21-shape.js';
import { hingeFrame, deflect } from '../kf21-model.js';
import { createGear } from '../gear.js';
import { PALETTE } from '../../data/palette.js';
import { DEG, damp, lerp, clamp01 } from '../../core/math.js';
import { COCKPIT_DIM } from './cockpit-hi.js';

const P = PALETTE.kf21;
const TAU = Math.PI * 2;

// 단면이 얼마나 각지는지(1 = 타원, 클수록 옆이 날카로운 차인)
const CHINE_POWER = [1.0, 1.0, 1.12, 1.4, 1.55, 1.55, 1.5, 1.32, 1.2, 1.15, 1.1, 1.05, 1.0];
const col = (i) => FUSELAGE.map((r) => r[i]);
const fus = {
  w: spline(col(0), col(1)), top: spline(col(0), col(2)), bot: spline(col(0), col(3)),
  chine: spline(col(0), col(4)), cy: spline(col(0), col(5)), pow: spline(col(0), CHINE_POWER),
};
const FUS_END = FUSELAGE[FUSELAGE.length - 1][0];
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

/** 동체 단면 위의 점. u: 둘레(0 = 아래 중심 → 오른쪽 → 위 → 왼쪽), s: 기수에서의 거리 */
function fuselagePoint(u, s) {
  const a = Math.PI - u * TAU;
  const w = fus.w(s), top = fus.top(s), bot = fus.bot(s), ch = fus.chine(s);
  const sx = Math.sin(a), cy = Math.cos(a);
  const h = cy >= 0 ? top - ch : bot + ch;
  return [w * spow(sx, 0.94), fus.cy(s) + ch + h * spow(cy, fus.pow(s)), Z(s)];
}

const can = { w: spline(CANOPY.map((r) => r[0]), CANOPY.map((r) => r[1])), h: spline(CANOPY.map((r) => r[0]), CANOPY.map((r) => r[2])), base: spline(CANOPY.map((r) => r[0]), CANOPY.map((r) => r[3])) };
const CAN_S0 = CANOPY[0][0], CAN_S1 = CANOPY[CANOPY.length - 1][0];
function canopyPoint(u, s, grow = 0) {
  const a = Math.PI * u;
  return [-Math.cos(a) * (can.w(s) + grow), can.base(s) - 0.03 + Math.pow(Math.sin(a), 0.82) * (can.h(s) + grow) + grow * 0.4, Z(s)];
}

const alongSpan = (a, b, span) => {
  const u = (span - a.span) / (b.span - a.span);
  return { span, le: lerp(a.le, b.le, u), te: lerp(a.te, b.te, u), t: lerp(a.t, b.t, u) };
};

/**
 * 날개 판 한 구간(익형 단면 로프트). from~to: 코드 방향 범위(조종면을 떼어낼 때).
 * 좌표: [span, y, z]. matrix를 걸면 수직미익처럼 세울 수 있다.
 */
export function wingPanel(S, a, b, y, { from = 0, to = 1, nC, nS, capA = true, capB = true, thick = 1 }) {
  const cols = 2 * nC + 1;
  const pt = (k, v) => {
    const upper = k <= nC;
    const i = upper ? k : cols - k;
    const c = from + (to - from) * (0.5 - 0.5 * Math.cos((Math.PI * i) / nC));
    const span = lerp(a.span, b.span, v);
    const le = lerp(a.le, b.le, v), te = lerp(a.te, b.te, v), t = lerp(a.t, b.t, v) * thick;
    const h = (airfoilThickness(c) * t) / 2;
    return [span, y + (upper ? h : -h), Z(lerp(le, te, c))];
  };
  S.loft(cols, nS, (u, v) => pt(Math.round(u * cols) % (cols + 1) === cols ? 0 : Math.round(u * cols), v));
  const ring = (v) => { const r = []; for (let k = 0; k < cols; k++) r.push(pt(k, v)); return r; };
  const mid = [lerp(a.span, b.span, 0.5), y, Z(lerp(lerp(a.le, a.te, 0.5), lerp(b.le, b.te, 0.5), 0.5))];
  if (capA) S.cap(ring(0), mid);
  if (capB) S.cap(ring(1), mid);
}

function finMatrix() {
  return new THREE.Matrix4().makeTranslation(FIN.base.x, FIN.base.y, 0).multiply(new THREE.Matrix4().makeRotationZ((90 - FIN.cant) * DEG));
}

/** 힌지 좌표계로 구운 조종면 메시 */
function hinged(material, side, p0, p1, build, { up = new THREE.Vector3(0, 1, 0), pre = null, uv = uvWing } = {}) {
  const S = new Surf().setUV(uv);
  S.mx = side;
  if (pre) S.withMatrix(pre, () => build(S)); else build(S);
  const toWorld = (p) => { const v = new THREE.Vector3(p[0], p[1], p[2]); if (pre) v.applyMatrix4(pre); v.x *= side; return v; };
  const upW = up.clone();
  if (pre) upW.transformDirection(pre);
  upW.x *= side;
  const frame = hingeFrame(toWorld(p0), toWorld(p1), upW);
  const mesh = new THREE.Mesh(S.build(frame.clone().invert()), material);
  frame.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.userData.rest = mesh.quaternion.clone();
  mesh.userData.sign = side;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ── 노즐: 겹친 금속 꽃잎. 열리고 닫히는 것과 열 변색은 셰이더에서 처리한다 ─────────────
function buildNozzle(k) {
  const pos = [], idx = [], tip = [], axis = [], uv = [];
  const petals = 16, nL = 6 * k, nA = 3;
  const z0 = Z(NOZZLE.s0 + 0.42), z1 = Z(NOZZLE.s1);
  for (const side of [-1, 1]) {
    const cx = side * NOZZLE.x, cy = NOZZLE.y;
    for (const layer of [0, 1]) { // 0: 바깥 꽃잎, 1: 안쪽 꽃잎(반 칸 어긋남)
      for (let p = 0; p < petals; p++) {
        const a0 = ((p + layer * 0.5) / petals) * TAU, span = (TAU / petals) * 0.62;
        const base = pos.length / 3;
        for (let j = 0; j <= nL; j++) {
          const t = j / nL;
          const r = (layer ? 0.455 : 0.5) * NOZZLE.r / 0.5 * lerp(1.02, layer ? 0.8 : 0.83, t);
          for (let i = 0; i <= nA; i++) {
            const a = a0 + (i / nA - 0.5) * span * lerp(1, 0.8, t);
            const bulge = layer ? 0 : Math.cos((i / nA - 0.5) * Math.PI) * 0.012; // 꽃잎 가운데가 살짝 솟는다
            pos.push(cx + Math.cos(a) * (r + bulge), cy + Math.sin(a) * (r + bulge), lerp(z0, z1 - layer * 0.05, t));
            tip.push(t); axis.push(cx, cy); uv.push(0.94, 0.5);
          }
        }
        for (let j = 0; j < nL; j++) for (let i = 0; i < nA; i++) { const q = base + j * (nA + 1) + i; idx.push(q, q + 1, q + nA + 1, q + 1, q + nA + 2, q + nA + 1); }
      }
    }
    // 고정 링(꽃잎 뿌리를 덮는 띠)과 안쪽 벽
    for (const [ra, rb, za, zb] of [[0.53, 0.515, Z(NOZZLE.s0 - 0.15), z0 + 0.06], [0.44, 0.4, z0, Z(NOZZLE.s0 - 0.5)]]) {
      const base = pos.length / 3, seg = 28 * k;
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, r = (j ? rb : ra) * NOZZLE.r / 0.5;
        pos.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, j ? zb : za); tip.push(0); axis.push(cx, cy); uv.push(0.94, 0.5);
      }
      for (let i = 0; i < seg; i++) { const q = base + i; idx.push(q, q + 1, q + seg + 1, q + 1, q + seg + 2, q + seg + 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setAttribute('aAxis', new THREE.Float32BufferAttribute(axis, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function nozzleMaterial(env) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b8f94, metalness: 0.95, roughness: 0.38, side: THREE.DoubleSide, envMapIntensity: env });
  const uniforms = { uClose: { value: 0.2 }, uHeat: { value: 0.2 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uClose = uniforms.uClose;
    shader.uniforms.uHeat = uniforms.uHeat;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTip;\nattribute vec2 aAxis;\nuniform float uClose;\nvarying float vTip;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTip = aTip;\ntransformed.xy = aAxis + (transformed.xy - aAxis) * (1.0 - aTip * aTip * uClose);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHeat;\nvarying float vTip;')
      // 티타늄 변색: 뿌리는 금빛 갈색, 끝으로 갈수록 푸른빛
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.86, 0.66, 0.42), vec3(0.42, 0.5, 0.8), smoothstep(0.15, 0.95, vTip)), 0.62 * smoothstep(0.0, 0.2, vTip));')
      // 열로 달아오름: 끝쪽부터 붉게
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uHeat * uHeat * pow(vTip, 2.2) * vec3(2.4, 0.5, 0.1);');
  };
  mat.userData.uniforms = uniforms;
  return mat;
}

/** 공대공 미사일 한 발(파일런에 다는 것과 발사체가 같은 모양) */
export function buildMissileGeometry(k, length = 3.6, radius = 0.09) {
  const S = new Surf().setUV(() => [0.94, 0.5]);
  const n = 12 * k;
  S.loft(n, 10, (u, v) => {
    const z = -length / 2 + v * length;
    const nose = Math.min(1, v / 0.14);
    const r = radius * Math.sqrt(1 - Math.pow(1 - nose, 2)) * (v > 0.97 ? 0.8 : 1);
    return [Math.cos(u * TAU) * r, Math.sin(u * TAU) * r, z];
  }, { ref: [0, 0, 0] });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Matrix4().makeRotationZ((i * Math.PI) / 2 + Math.PI / 4);
    S.withMatrix(m, () => {
      S.box([radius * 2.1, 0, length * 0.4], [radius * 2.4, 0.014, length * 0.16]); // 꼬리 날개
      S.box([radius * 1.7, 0, -length * 0.02], [radius * 1.5, 0.012, length * 0.34]); // 중간 날개(스트레이크)
    });
  }
  return S.build();
}

/**
 * @param {object} o
 * @param {number} o.detail 1(높음) | 2(최고)
 * @param {object} o.tuning data/aircraft.js 의 model
 * @param {object} o.textures createAircraftTextures() 결과
 * @param {object} o.pilot createPilot() 결과(선택)
 */
export function createKF21Hi({ detail, tuning, textures, pilot }) {
  const k = detail >= 2 ? 1.95 : 1.3; // 한 방향 분할 배율(삼각형 수는 약 k²배): 높음 약 10만, 최고 20만 이상
  const N = (n) => Math.max(3, Math.round(n * k));
  const group = new THREE.Group();
  group.name = 'kf21-hi';
  const exterior = new THREE.Group();
  group.add(exterior);
  const geometries = [];
  const materials = [];
  const keep = (g) => { geometries.push(g); return g; };
  const mat = (m) => { materials.push(m); return m; };

  // ── 재질 ──
  const ENV = 1.0;
  const bodyMat = mat(new THREE.MeshStandardMaterial({ map: textures.map, normalMap: textures.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: textures.ormMap, metalnessMap: textures.ormMap, roughness: 1, metalness: 1, envMapIntensity: ENV }));
  const darkMat = mat(new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.85, metalness: 0.2, envMapIntensity: 0.2 }));
  const metalMat = mat(new THREE.MeshStandardMaterial({ color: 0xa9aeb3, roughness: 0.42, metalness: 0.85, envMapIntensity: ENV }));
  const tireMat = mat(new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.92, metalness: 0 }));
  const missileMat = mat(new THREE.MeshStandardMaterial({ color: 0xd9dde1, roughness: 0.5, metalness: 0.25, envMapIntensity: ENV }));
  const sensorMat = mat(new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.08, metalness: 0.95, envMapIntensity: 1.6 }));
  // 캐노피 유리: 푸른 반사. 비스듬히 볼수록 반사가 강해진다(프레넬)
  const glassMat = mat(new THREE.MeshStandardMaterial({ color: 0x5f9cc4, roughness: 0.04, metalness: 0.92, transparent: true, opacity: 0.4, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide }));
  glassMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);\ndiffuseColor.a = mix(0.2, 0.92, fres);\noutgoingLight += vec3(0.05, 0.1, 0.18) * fres;\n#include <opaque_fragment>');
  };
  const nozMat = mat(nozzleMaterial(ENV));

  const add = (S, material, parent = exterior, shadow = true) => {
    const mesh = new THREE.Mesh(keep(S.build()), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  };

  // ── 본체(움직이지 않는 부분) ──
  const B = new Surf();
  const D = new Surf(); // 어두운 안쪽(덕트, 뒤 뚜껑)
  // 동체
  B.setUV(uvBody);
  B.loft(N(88), N(150), (u, v) => fuselagePoint(u, Math.pow(v, 1.06) * FUS_END));
  const endRing = [];
  for (let i = 0; i < 40; i++) endRing.push(fuselagePoint(i / 40, FUS_END));
  D.cap(endRing, [0, 0, Z(FUS_END) - 1]);

  B.mirror(() => {
    // 공기흡입구: 둥근 모서리의 기울어진 사각 단면, 앞면은 위쪽이 앞으로 나온 캐럿형
    const IN = { cx: 1.19, cy: -0.24, hw: 0.335, hh: 0.52, s0: 5.62, s1: 7.85, shear: 0.09 };
    const intake = (u, v, scale = 1, depth = 0) => {
      const a = u * TAU;
      const px = spow(Math.cos(a), 0.42) * IN.hw * scale, py = spow(Math.sin(a), 0.42) * IN.hh * scale;
      const blend = 1 - v;
      const rake = blend * blend * (-0.34 * (py / IN.hh) + 0.22 * (px / IN.hw));
      return [IN.cx + px - IN.shear * py + v * 0.06, IN.cy + py, Z(lerp(IN.s0, IN.s1, v) + depth) + rake];
    };
    B.setUV(uvSideY);
    B.loft(N(44), N(26), (u, v) => intake(u, v));
    B.grid(N(44), 2, (u, v) => intake(u, 0, lerp(1, 0.9, v), v * 0.03), { closedU: true }); // 입술
    // 안쪽 덕트: 뒤로 가며 엔진 쪽(안쪽)으로 휘어 좁아진다
    D.mx = B.mx;
    D.loft(N(32), N(14), (u, v) => {
      const p = intake(u, 0, lerp(0.9, 0.62, v), 0.03);
      return [lerp(p[0], 0.78 + (p[0] - IN.cx) * 0.6, v), lerp(p[1], -0.1 + (p[1] - IN.cy) * 0.6, v), p[2] + v * 3.1];
    }, { inward: true });
    D.mx = 1;

    // LERX: 기수 차인에서 주익 앞전으로 이어지는 얇은 판
    B.setUV(uvWing);
    wingPanel(B, { span: 0.82, le: 4.15, te: 7.9, t: 0.2 }, { span: 2.02, le: 7.72, te: 7.92, t: 0.05 }, 0.2, { nC: N(8), nS: N(10) });

    // 주익 고정부
    const y = WING.y;
    const f0 = alongSpan(WING.root, WING.tip, WING.flap.from);
    const f1 = alongSpan(WING.root, WING.tip, WING.flap.to);
    wingPanel(B, WING.root, f0, y, { nC: N(18), nS: N(4), capB: false });
    wingPanel(B, f0, f1, y, { to: WING.flap.chord, nC: N(16), nS: N(24), capA: false, capB: false });
    wingPanel(B, f1, WING.tip, y, { nC: N(18), nS: N(8), capA: false });

    // 수직미익 고정부
    B.withMatrix(finMatrix(), () => {
      B.setUV(uvSide);
      const r0 = alongSpan(FIN.root, FIN.tip, FIN.rudder.from);
      const r1 = alongSpan(FIN.root, FIN.tip, FIN.rudder.to);
      wingPanel(B, FIN.root, r0, 0, { nC: N(14), nS: N(3), capB: false });
      wingPanel(B, r0, r1, 0, { to: FIN.rudder.chord, nC: N(12), nS: N(16), capA: false, capB: false });
      wingPanel(B, r1, FIN.tip, 0, { nC: N(14), nS: N(4), capA: false });
    });

    // 파일런(주익 아래 2개씩)
    B.setUV(uvPlain);
    for (const px of PYLON_SPANS) {
      const st = alongSpan(WING.root, WING.tip, px);
      const zc = Z(lerp(st.le, st.te, 0.45));
      B.loft(N(10), 4, (u, v) => {
        const a = u * TAU;
        return [px + Math.cos(a) * 0.045, y - 0.03 - v * 0.2, zc + Math.sin(a) * lerp(0.95, 0.7, v)];
      });
    }
    // 센서 포드(오른쪽 흡입구 아래에만)와 그 지지대
    if (B.mx > 0) {
      B.sphere([1.12, -1.02, Z(7.4)], 0.15, N(14), N(10), [1, 1, 4.4]);
      B.box([1.12, -0.82, Z(7.5)], [0.07, 0.2, 0.7]);
    }
  });

  // 중앙 파일런, 등 안테나, 배 안테나, 기수 피토관, 공중급유 표시등 덮개
  B.setUV(uvPlain);
  B.box([0, -0.95, Z(10.2)], [0.08, 0.18, 1.5]);
  B.box([0, fus.top(8.6) + 0.1, Z(8.6)], [0.02, 0.2, 0.34]);
  B.box([0, fus.top(10.6) + 0.07, Z(10.6)], [0.02, 0.14, 0.24]);
  B.box([0, -fus.bot(6.4) - 0.09, Z(6.4)], [0.02, 0.18, 0.3]);
  B.tube([[0, fus.cy(0), Z(0.04)], [0, fus.cy(0) - 0.01, Z(-0.62)]], (v) => 0.02 - v * 0.012, 8);
  for (const side of [-1, 1]) B.tube([[side * 0.5, -0.2, Z(2.3)], [side * 0.62, -0.22, Z(2.15)], [side * 0.63, -0.22, Z(1.8)]], 0.012, 6); // AOA 프로브
  // 노즐 안쪽: 어두운 통과 화염 유지기(뒤에서 들여다보면 보인다)
  for (const side of [-1, 1]) {
    const cx = side * NOZZLE.x, zc = Z(NOZZLE.s0 + 0.5);
    D.loft(N(24), 2, (u, v) => [cx + Math.cos(u * TAU) * lerp(0.43, 0.36, v), NOZZLE.y + Math.sin(u * TAU) * lerp(0.43, 0.36, v), zc - v * 0.9], { inward: true });
    const ring = [];
    for (let i = 0; i < 24; i++) ring.push([cx + Math.cos((i / 24) * TAU) * 0.36, NOZZLE.y + Math.sin((i / 24) * TAU) * 0.36, zc - 0.9]);
    D.cap(ring, [cx, NOZZLE.y, zc - 3]);
  }
  const body = add(B, bodyMat);
  add(D, darkMat, exterior, false);

  // IRST(캐노피 앞 구형 센서)와 센서 포드 창
  const SE = new Surf();
  SE.sphere([0, fus.top(3.45) + fus.cy(3.45) + 0.02, Z(3.45)], 0.125, N(16), N(10));
  SE.sphere([1.12, -1.02, Z(6.78)], 0.105, N(12), N(8));
  add(SE, sensorMat);

  // ── 캐노피(뒤쪽 힌지로 열린다) ──
  const canopy = new THREE.Group();
  const pivot = [0, can.base(CAN_S1) + 0.02, Z(CAN_S1)];
  canopy.position.fromArray(pivot);
  const toPivot = new THREE.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
  const G = new Surf();
  G.grid(N(40), N(48), (u, v) => canopyPoint(u, lerp(CAN_S0 + 0.02, CAN_S1 - 0.02, v)), { ref: [0, 0.5, Z(5.5)] });
  const glass = new THREE.Mesh(keep(G.build(toPivot)), glassMat);
  glass.renderOrder = 4;
  const CF = new Surf().setUV(uvPlain);
  for (const side of [0, 1]) { // 양옆 레일
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push(canopyPoint(side, lerp(CAN_S0 + 0.1, CAN_S1 - 0.1, i / 24), 0.012));
    CF.tube(pts, 0.022, 6);
  }
  for (const s of [4.42, 6.72]) { // 앞·뒤 아치
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push(canopyPoint(i / 20, s, 0.014));
    CF.tube(pts, s < 5 ? 0.026 : 0.02, 6);
  }
  const frame = new THREE.Mesh(keep(CF.build(toPivot)), bodyMat);
  frame.castShadow = true;
  canopy.add(glass, frame);
  exterior.add(canopy);

  // ── 조종면 ──
  const surfaces = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'R' : 'L';
    const f0 = alongSpan(WING.root, WING.tip, WING.flap.from);
    const fm = alongSpan(WING.root, WING.tip, FLAP_SPLIT);
    const f1 = alongSpan(WING.root, WING.tip, WING.flap.to);
    const hz = (st) => Z(lerp(st.le, st.te, WING.flap.chord));
    surfaces['flap' + key] = hinged(bodyMat, side, [f0.span, WING.y, hz(f0)], [fm.span, WING.y, hz(fm)], (S) => wingPanel(S, f0, fm, WING.y, { from: WING.flap.chord, nC: N(7), nS: N(10) }));
    surfaces['ail' + key] = hinged(bodyMat, side, [fm.span, WING.y, hz(fm)], [f1.span, WING.y, hz(f1)], (S) => wingPanel(S, fm, f1, WING.y, { from: WING.flap.chord, nC: N(7), nS: N(10) }));
    surfaces['stab' + key] = hinged(bodyMat, side, [STAB.root.span, STAB.y, Z(STAB.pivotS)], [STAB.tip.span, STAB.y, Z(STAB.pivotS)], (S) => wingPanel(S, STAB.root, STAB.tip, STAB.y, { nC: N(16), nS: N(22) }));
    const r0 = alongSpan(FIN.root, FIN.tip, FIN.rudder.from);
    const r1 = alongSpan(FIN.root, FIN.tip, FIN.rudder.to);
    const rz = (st) => Z(lerp(st.le, st.te, FIN.rudder.chord));
    surfaces['rudder' + key] = hinged(bodyMat, side, [r0.span, 0, rz(r0)], [r1.span, 0, rz(r1)], (S) => wingPanel(S, r0, r1, 0, { from: FIN.rudder.chord, nC: N(7), nS: N(14) }), { pre: finMatrix(), uv: uvSide });
  }
  for (const m of Object.values(surfaces)) { exterior.add(m); geometries.push(m.geometry); }

  // 에어브레이크: 수직미익 사이 등판이 앞쪽 힌지로 들린다
  const AB = { s0: 11.5, s1: 13.1, w: 0.42 };
  const brake = hinged(bodyMat, 1, [-AB.w, fus.top(AB.s0) + 0.012, Z(AB.s0)], [AB.w, fus.top(AB.s0) + 0.012, Z(AB.s0)], (S) => {
    S.grid(6, 8, (u, v) => { const s = lerp(AB.s0, AB.s1, v); return [lerp(-AB.w, AB.w, u), fus.top(s) * Math.pow(1 - Math.pow(lerp(-AB.w, AB.w, u) / fus.w(s), 2), 0.6) + 0.014, Z(s)]; }, { ref: [0, -1, Z(12.3)] });
    S.grid(6, 8, (u, v) => { const s = lerp(AB.s0, AB.s1, v); return [lerp(-AB.w, AB.w, u), fus.top(s) * Math.pow(1 - Math.pow(lerp(-AB.w, AB.w, u) / fus.w(s), 2), 0.6) - 0.004, Z(s)]; }, { ref: [0, 3, Z(12.3)] });
  }, { uv: uvBody });
  exterior.add(brake);
  geometries.push(brake.geometry);

  // ── 엔진 노즐 ──
  const nozzle = new THREE.Mesh(keep(buildNozzle(k)), nozMat);
  nozzle.castShadow = true;
  exterior.add(nozzle);

  // ── 등화: 항법등(왼쪽 빨강, 오른쪽 초록), 충돌방지등(점멸) ──
  const lightGeo = keep(new THREE.SphereGeometry(0.045, 10, 8));
  const mkLight = (color, x, y, z) => {
    const m = new THREE.Mesh(lightGeo, mat(new THREE.MeshBasicMaterial({ color })));
    m.material.color.multiplyScalar(4); // 블룸에 걸리도록 밝게(HDR)
    m.position.set(x, y, z);
    exterior.add(m);
    return m;
  };
  const tipSt = WING.tip;
  mkLight(0xff2a1e, -tipSt.span, WING.y, Z(lerp(tipSt.le, tipSt.te, 0.3)));
  mkLight(0x26ff5a, tipSt.span, WING.y, Z(lerp(tipSt.le, tipSt.te, 0.3)));
  const finTop = new THREE.Vector3(FIN.tip.span, 0, Z(FIN.tip.te - 0.1)).applyMatrix4(finMatrix());
  const strobes = [mkLight(0xffffff, finTop.x, finTop.y, finTop.z), mkLight(0xffffff, -finTop.x, finTop.y, finTop.z), mkLight(0xff3020, 0, -fus.bot(9) - 0.03, Z(9))];

  // ── 미사일 5발(파일런에 장착, 쏘면 하나씩 사라진다) ──
  const missileGeo = keep(buildMissileGeometry(k));
  const missiles = [];
  for (const [mx, my, s] of MISSILE_MOUNTS) {
    const m = new THREE.Mesh(missileGeo, missileMat);
    m.position.set(mx, my, Z(s));
    m.castShadow = true;
    exterior.add(m);
    missiles.push(m);
  }

  // ── 랜딩기어 ──
  const gear = createGear({ sides: N(10), metal: metalMat, tire: tireMat, door: bodyMat });
  exterior.add(gear.group);

  // ── 조종사 ──
  if (pilot) exterior.add(pilot.group);

  // ── 배기(6단계에서 불꽃 셰이더로 교체) ──
  const flame = { mesh: null, set() {} };

  // ── 1인칭용 잘라내기: 동체 외피가 조종석 안을 가리지 않게, 조종석 상자 안쪽만 그리지 않는다 ──
  const eye = KF21_POINTS.eye;
  const cut = COCKPIT_DIM.cut;
  const localPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(eye.x + cut.max[0])), new THREE.Plane(new THREE.Vector3(-1, 0, 0), eye.x + cut.min[0]),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -(eye.y + cut.max[1])), new THREE.Plane(new THREE.Vector3(0, -1, 0), eye.y + cut.min[1]),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(eye.z + cut.max[2])), new THREE.Plane(new THREE.Vector3(0, 0, -1), eye.z + cut.min[2]),
  ];
  const worldPlanes = localPlanes.map((p) => p.clone());
  let cockpitView = false;

  // ── 상태 ──
  const st = { elevator: 0, aileron: 0, rudder: 0, flap: 0, brake: 0, canopy: 0, gear: 0, power: 0.3, heat: 0.2 };
  const lim = tuning.surfaces;

  function setControls(pitch, turn, dt) {
    st.elevator = damp(st.elevator, pitch, lim.tau, dt);
    st.aileron = damp(st.aileron, turn, lim.tau, dt);
    st.rudder = damp(st.rudder, turn, lim.tau, dt);
    const elev = st.elevator * lim.elevator * DEG;
    const ail = st.aileron * lim.aileron * DEG;
    const flap = st.flap * tuning.hi.flapAngle * DEG;
    deflect(surfaces.stabR, -elev - ail * lim.stabRollMix);
    deflect(surfaces.stabL, -elev + ail * lim.stabRollMix);
    deflect(surfaces.ailR, -ail);
    deflect(surfaces.ailL, ail);
    deflect(surfaces.flapR, flap - ail * 0.35);
    deflect(surfaces.flapL, flap + ail * 0.35);
    const rud = st.rudder * lim.rudder * DEG;
    deflect(surfaces.rudderR, rud);
    deflect(surfaces.rudderL, -rud);
  }

  /** 예전 인터페이스 유지용(불꽃은 setState가 맡는다) */
  function setExhaust() {}

  /**
   * 작동 부품·등화·노즐을 상태에 맞춘다(렌더 프레임마다).
   * @param {object} o gear(0~1 내림), canopy(0~1 열림), airbrake(0~1), flap(0~1), ammo, power(0~1), boost(0~1 애프터버너), time, dt, headYaw
   */
  function setState(o) {
    const h = tuning.hi;
    st.gear = o.gear;
    gear.setDown(o.gear);
    st.flap = damp(st.flap, o.flap, h.flapTau, o.dt);
    st.brake = damp(st.brake, o.airbrake, h.brakeTau, o.dt);
    deflect(brake, -st.brake * h.brakeAngle * DEG);
    st.canopy = o.canopy;
    canopy.rotation.x = o.canopy * h.canopyAngle * DEG;
    for (let i = 0; i < missiles.length; i++) missiles[i].visible = i >= missiles.length - o.ammo;
    // 노즐: 출력이 오르면 조였다가 애프터버너에서 활짝 열린다. 열은 천천히 오르내린다.
    st.power = damp(st.power, Math.max(o.power, o.boost), 0.35, o.dt);
    st.heat = damp(st.heat, clamp01(0.12 + o.power * 0.35 + o.boost * 0.9), o.boost > st.heat ? 0.8 : 2.4, o.dt);
    nozMat.userData.uniforms.uClose.value = lerp(h.nozzleClosed, h.nozzleOpen, clamp01(o.boost * 1.2)) + (1 - clamp01(o.power * 2)) * -0.06;
    nozMat.userData.uniforms.uHeat.value = st.heat;
    // 충돌방지등: 1초에 한 번 짧게 번쩍
    const blink = (o.time % h.strobePeriod) < h.strobeOn;
    for (const s of strobes) s.visible = blink;
    if (cockpitView) {
      group.updateWorldMatrix(true, false);
      for (let i = 0; i < 6; i++) worldPlanes[i].copy(localPlanes[i]).applyMatrix4(group.matrixWorld);
    }
    if (pilot) pilot.setHead(o.headYaw || 0, o.dt);
    flame.set(st.power, o.boost, o.time, o.dt);
  }

  /** 미사일 장착 위치(기체 좌표). index: 몇 번째로 쏘는 발인지(0부터) */
  function missileMount(index, out) {
    const m = missiles[Math.min(missiles.length - 1, Math.max(0, index))];
    return out.copy(m.position);
  }

  let triangles = 0;
  group.traverse((o) => { if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });

  setControls(0, 0, 1);
  setState({ gear: 0, canopy: 0, airbrake: 0, flap: 0, ammo: 5, power: 0.4, boost: 0, time: 0, dt: 1 });

  return {
    group, exterior, canopy, body, surfaces, gear, flame, triangles, hi: true,
    setControls, setExhaust, setState, missileMount,
    materials: { bodyMat, glassMat, nozMat },
    /** 1인칭: 유리 바깥면·조종사 머리를 숨긴다(날개·기수는 보이게 둔다) */
    setCockpitView(on) {
      cockpitView = on;
      glass.visible = !on;
      frame.visible = !on;
      if (pilot) pilot.group.visible = !on;
      bodyMat.clippingPlanes = on ? worldPlanes : null;
      bodyMat.clipIntersection = true;
      bodyMat.needsUpdate = true;
    },
    attachFlame(f) { flame.mesh = f.mesh; flame.set = f.set; exterior.add(f.mesh); },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      gear.dispose();
    },
  };
}

// 주익 뒷전 조종면 분할 위치(안쪽 플랩 / 바깥쪽 에일러론)
const FLAP_SPLIT = 3.45;
// 파일런 위치(스팬)와 미사일 장착 위치 [x, y, s]. 발사 순서: 바깥쪽 → 안쪽 → 중앙
const PYLON_SPANS = [2.7, 4.0];
export const MISSILE_MOUNTS = [
  [4.0, WING.y - 0.33, 11.2], [-4.0, WING.y - 0.33, 11.2],
  [2.7, WING.y - 0.33, 10.3], [-2.7, WING.y - 0.33, 10.3],
  [0, -1.14, 10.2],
];
export { KF21_POINTS };

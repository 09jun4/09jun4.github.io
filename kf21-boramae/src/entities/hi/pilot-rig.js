// 사실적인 조종사(높음·최고): THREE.SkinnedMesh + Skeleton으로 관절이 있는 인체를 코드로 만든다.
//   뼈대: 골반 → 척추 2개 → 목 → 머리 / 쇄골 → 위팔 → 아래팔 → 손 → 손가락(손가락마다 뼈 2개) / 허벅지 → 정강이 → 발
//   팔·다리는 투본 IK로 조종간·스로틀·페달 위치에 닿는다. 손가락은 입력과 발사에 따라 쥐고 누른다.
//   머리·몸은 G에 눌렸다가 돌아오고(감쇠가 부족한 스프링), 3인칭에서는 선회 방향으로 고개를 돌리고 발사 때 고개를 숙인다.
//   좌표: 눈 위치가 원점(조종석과 같은 좌표). 기본 자세(바인드 포즈)에서 모든 뼈의 회전은 단위 행렬이라
//   "뼈의 세계 회전 = 기본 방향에서 새 방향으로 가는 최단 회전"으로 IK를 단순하게 푼다.
// 메시는 두 개로 나눈다: armsMesh(팔·손: 1인칭에서도 보임) / bodyMesh(몸·머리·다리: 3인칭에서만). 뼈대는 공유한다.
import * as THREE from 'three';
import { Surf } from './surface.js';
import { COCKPIT_DIM } from './cockpit-hi.js';
import { DEG, clamp, clamp01, damp, lerp, makeRng } from '../../core/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ── 뼈대 정의(눈 기준 좌표) ──────────────────────────────────────────────
const L1 = 0.31, L2 = 0.27; // 위팔·아래팔 길이
const T1 = 0.43, T2 = 0.42; // 허벅지·정강이 길이
const REST = {
  pelvis: V(0, -0.9, 0.065), spine1: V(0, -0.74, 0.058), spine2: V(0, -0.5, 0.048), neck: V(0, -0.175, 0.062), head: V(0, -0.095, 0.072),
  shoulder: V(0.212, -0.238, 0.05), // 오른쪽(왼쪽은 x 반전)
  upperDir: V(0.25, -0.85, -0.2).normalize(), foreDir: V(0.0, -0.3, -0.95).normalize(),
  hip: V(0.1, -0.91, 0.06), thighDir: V(0.0, -0.1, -1).normalize(), shinDir: V(0.0, -1.0, -0.12).normalize(),
};
const FINGERS = [ // 손가락 뼈: 손바닥 기준 위치(x: 엄지 쪽이 안쪽), 마디 길이
  { name: 'index', x: 0.036, z: 0.0, len: [0.036, 0.031], r: 0.0125 },
  { name: 'middle', x: 0.012, z: 0.004, len: [0.039, 0.033], r: 0.0132 },
  { name: 'ring', x: -0.012, z: 0.0, len: [0.036, 0.03], r: 0.0125 },
  { name: 'little', x: -0.036, z: -0.008, len: [0.03, 0.025], r: 0.011 },
  { name: 'thumb', x: 0.05, z: 0, len: [0.038, 0.032], r: 0.0145, thumb: true },
];

function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

/** 질감: 비행복 주름 노멀맵, 가죽 노멀맵 */
function makeTextures(size) {
  const rng = makeRng(81);
  const toNormal = (src, strength) => {
    const g = src.getContext('2d'); const d = g.getImageData(0, 0, src.width, src.height).data; const n = src.width;
    const out = document.createElement('canvas'); out.width = out.height = n; const og = out.getContext('2d'); const img = og.createImageData(n, n);
    const H = (x, y) => d[(((y + n) % n) * n + ((x + n) % n)) * 4];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, inv = 1 / Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255; img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255; img.data[i + 2] = (inv * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  };
  // 비행복: 접힌 주름(가로로 길고 구불구불한 선) + 직물 결
  const fabricH = document.createElement('canvas'); fabricH.width = fabricH.height = size;
  { const g = fabricH.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const y = rng() * size, x = rng() * size, len = size * (0.15 + rng() * 0.35), a = (rng() - 0.5) * 0.7, w = 2 + rng() * 5;
      g.strokeStyle = rng() < 0.5 ? '#3a3a3a' : '#c8c8c8'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + Math.sin(a) * 30 + (rng() - 0.5) * 20, x + len, y + Math.sin(a) * 60); g.stroke(); }
    for (let y = 0; y < size; y += 3) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, y, size, 1); } }
  const leatherH = document.createElement('canvas'); leatherH.width = leatherH.height = size;
  { const g = leatherH.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rng() * 0.18})`; const r = 1 + rng() * 3; g.beginPath(); g.arc(rng() * size, rng() * size, r, 0, TAU); g.fill(); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; g.beginPath(); const x = rng() * size, y = rng() * size; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 80, y + (rng() - 0.5) * 80); g.stroke(); } }
  return { suitNormal: toNormal(fabricH, 0.045), leatherNormal: toNormal(leatherH, 0.04), dispose() { this.suitNormal.dispose(); this.leatherNormal.dispose(); } };
}

/** 피부: 가짜 SSS(wrap lighting) — 빛이 닿는 가장자리가 붉게 번져 부드럽게 보인다 */
function skinMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xc88f76, roughness: 0.62, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      float sssWrap = clamp((dot(normal, directionalLights[0].direction) + 0.55) / 1.55, 0.0, 1.0);
      reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.42, 0.3) * sssWrap * sssWrap * directionalLights[0].color * 0.55;
      #endif`);
  };
  return m;
}

// ── 스키닝 도우미 ─────────────────────────────────────────────────────────
/** 한 부품의 정점마다 뼈 가중치를 붙인다. fn(x,y,z) → [bone, w, bone, w, ...] (최대 4쌍) */
function skinPart(geo, fn) {
  const p = geo.attributes.position, n = p.count;
  const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i));
    let sum = 0;
    for (let k = 0; k < 4; k++) { const w = r[k * 2 + 1] || 0; idx[i * 4 + k] = r[k * 2] || 0; wt[i * 4 + k] = w; sum += w; }
    for (let k = 0; k < 4; k++) wt[i * 4 + k] /= sum || 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  return geo;
}

/** 여러 부품을 재질별로 모아 하나의 지오메트리(그룹)로 합친다 */
function mergeParts(parts, materialCount) {
  const byMat = Array.from({ length: materialCount }, () => []);
  for (const pt of parts) byMat[pt.mat].push(pt.geo);
  const pos = [], nor = [], uv = [], si = [], sw = [], index = [];
  const groups = [];
  let base = 0;
  for (let m = 0; m < materialCount; m++) {
    const start = index.length;
    for (const g of byMat[m]) {
      const gi = g.index.array, n = g.attributes.position.count;
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
      si.push(...g.attributes.skinIndex.array); sw.push(...g.attributes.skinWeight.array);
      for (let i = 0; i < gi.length; i++) index.push(gi[i] + base);
      base += n;
      g.dispose();
    }
    if (index.length > start) groups.push({ start, count: index.length - start, materialIndex: m });
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  out.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  for (const g of groups) out.addGroup(g.start, g.count, g.materialIndex);
  out.computeBoundingSphere();
  return out;
}

/**
 * @param {object} o
 * @param {number} o.detail 1(높음 약 1.5만 삼각형) | 2(최고 약 4만)
 * @param {THREE.Vector3} o.eye 기체 좌표계의 눈 위치
 */
export function createPilotRig({ detail, eye }) {
  const hi2 = detail >= 2;
  const K = hi2 ? 1.17 : 0.68; // 분할 배율: 삼각형 수가 높음 약 1.5만, 최고 약 4만이 되도록
  const N = (n) => Math.max(4, Math.round(n * K));
  const group = new THREE.Group();
  group.name = 'pilot-rig';
  group.position.copy(eye);
  const disposables = [];

  // ── 재질 ──
  const tex = makeTextures(hi2 ? 512 : 256);
  const mats = {
    suit: new THREE.MeshStandardMaterial({ color: 0x59634a, roughness: 0.92, metalness: 0, normalMap: tex.suitNormal, normalScale: new THREE.Vector2(0.32, 0.32) }), // 직물
    skin: skinMaterial(),
    glove: new THREE.MeshStandardMaterial({ color: 0x5c6150, roughness: 0.86, metalness: 0 }), // 노멕스 장갑(직물)
    metal: new THREE.MeshStandardMaterial({ color: 0xb7bcc2, roughness: 0.32, metalness: 0.95, envMapIntensity: 1.3 }), // 지퍼·버클·커넥터
    shell: new THREE.MeshStandardMaterial({ color: 0x8d9296, roughness: 0.42, metalness: 0.05, envMapIntensity: 0.9 }), // 헬멧 껍데기(무광 회색 도장)
    visor: new THREE.MeshStandardMaterial({ color: 0x2c4f78, roughness: 0.04, metalness: 1, envMapIntensity: 2.2, side: THREE.DoubleSide }), // 반사 코팅(푸른 색조)
    rubber: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85, metalness: 0.05 }), // 마스크·호스
    boot: new THREE.MeshStandardMaterial({ color: 0x2a231d, roughness: 0.6, metalness: 0.03, normalMap: tex.leatherNormal }),
  };
  mats.web = new THREE.MeshStandardMaterial({ color: 0x3a4033, roughness: 0.96, metalness: 0, normalMap: tex.suitNormal, normalScale: new THREE.Vector2(0.2, 0.2) }); // 멜빵·구명조끼(거친 나일론)
  mats.maskShell = new THREE.MeshStandardMaterial({ color: 0x4d5356, roughness: 0.5, metalness: 0.1 }); // 마스크 겉껍데기(단단한 수지)
  mats.gloveBack = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.62, metalness: 0.02, normalMap: tex.leatherNormal, normalScale: new THREE.Vector2(0.3, 0.3) }); // 가죽 덧댐
  mats.gsuit = new THREE.MeshStandardMaterial({ color: 0x4b5340, roughness: 0.9, metalness: 0, normalMap: tex.suitNormal, normalScale: new THREE.Vector2(0.5, 0.5) }); // G슈트
  mats.patch = new THREE.MeshStandardMaterial({ color: 0x23293a, roughness: 0.8, metalness: 0 }); // 이름표·패치
  const matList = [mats.suit, mats.skin, mats.glove, mats.metal, mats.shell, mats.visor, mats.rubber, mats.boot, mats.web, mats.maskShell, mats.gloveBack, mats.gsuit, mats.patch];
  const M = { suit: 0, skin: 1, glove: 2, metal: 3, shell: 4, visor: 5, rubber: 6, boot: 7, web: 8, maskShell: 9, gloveBack: 10, gsuit: 11, patch: 12 };
  disposables.push(...matList, tex);

  // ── 뼈 ──
  const bones = [];
  const B = {};
  const addBone = (name, parent, worldPos) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(worldPos).sub(parent ? parent.userData.world : V(0, 0, 0));
    b.userData.world = worldPos.clone();
    b.userData.index = bones.length;
    if (parent) parent.add(b);
    bones.push(b);
    B[name] = b;
    return b;
  };
  const mir = (v, side) => V(v.x * side, v.y, v.z);
  addBone('pelvis', null, REST.pelvis);
  addBone('spine1', B.pelvis, REST.spine1);
  addBone('spine2', B.spine1, REST.spine2);
  addBone('neck', B.spine2, REST.neck);
  addBone('head', B.neck, REST.head);
  const side = [1, -1];
  const names = ['R', 'L'];
  const handInfo = {};
  side.forEach((s, i) => {
    const n = names[i];
    const sh = mir(REST.shoulder, s);
    const clav = addBone('clav' + n, B.spine2, V(s * 0.07, -0.225, 0.05));
    const ua = addBone('upper' + n, clav, sh);
    const elbow = sh.clone().addScaledVector(V(REST.upperDir.x * s, REST.upperDir.y, REST.upperDir.z), L1);
    const fa = addBone('fore' + n, ua, elbow);
    const wrist = elbow.clone().addScaledVector(V(REST.foreDir.x * s, REST.foreDir.y, REST.foreDir.z), L2);
    const hand = addBone('hand' + n, fa, wrist);
    const fingers = [];
    for (const f of FINGERS) {
      const base = wrist.clone().add(V(-f.x * s, f.thumb ? -0.01 : -0.002, -0.07 + (f.thumb ? 0.05 : 0))); // 손바닥 끝
      const b0 = addBone(`${f.name}0${n}`, hand, V(base.x, base.y, base.z + (f.thumb ? 0 : 0) - f.z));
      const p1 = b0.userData.world.clone().add(V(0, 0, -f.len[0]));
      const b1 = addBone(`${f.name}1${n}`, b0, p1);
      fingers.push({ def: f, b0, b1, tip: p1.clone().add(V(0, 0, -f.len[1])) });
    }
    handInfo[n] = { s, wrist, fingers };
    const hip = mir(REST.hip, s);
    const th = addBone('thigh' + n, B.pelvis, hip);
    const knee = hip.clone().addScaledVector(V(REST.thighDir.x * s, REST.thighDir.y, REST.thighDir.z), T1);
    const sn = addBone('shin' + n, th, knee);
    const ankle = knee.clone().addScaledVector(V(REST.shinDir.x * s, REST.shinDir.y, REST.shinDir.z), T2);
    addBone('foot' + n, sn, ankle);
  });
  group.add(B.pelvis);
  const skeletonHolder = new THREE.Group(); // 바인드 포즈 행렬 계산용
  skeletonHolder.add(B.pelvis);
  group.add(skeletonHolder);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  // ── 부품 ──
  const bi = (name) => B[name].userData.index;
  const body = []; // 3인칭에서만
  const arms = []; // 1인칭에서도
  const add = (list, S, mat, weightFn) => { list.push({ geo: skinPart(S.build(), weightFn), mat }); };
  const uvTile = (a, b) => (x, y, z, u, v) => [u * a, v * b];
  const rigid = (name) => () => [bi(name), 1];

  // 척추를 따라 y 위치로 가중치를 나눈다(골반 → 척추1 → 가슴 → 목)
  const chainY = [{ b: 'pelvis', y: REST.pelvis.y }, { b: 'spine1', y: REST.spine1.y }, { b: 'spine2', y: REST.spine2.y }, { b: 'neck', y: REST.neck.y }];
  const spineWeights = (y) => {
    if (y <= chainY[0].y) return [bi('pelvis'), 1];
    for (let k = 0; k < chainY.length - 1; k++) {
      if (y <= chainY[k + 1].y) { const t = smooth(chainY[k].y, chainY[k + 1].y, y); return [bi(chainY[k].b), 1 - t, bi(chainY[k + 1].b), t]; }
    }
    return [bi('neck'), 1];
  };

  // ══ 모델링(2차: 처음부터 다시) ═══════════════════════════════════════════
  // 인체 치수(앉은 자세, 눈 기준)를 먼저 정하고 그 위에 장비를 입힌다.
  //   몸통은 단면(둥근 사각형)을 척추를 따라 이어 붙인 한 장의 곡면이라 어깨·가슴·허리가 끊기지 않는다.
  //   헬멧은 얼굴 쪽이 뚫린 껍데기 + 그 위에 덮이는 바이저 + 코와 입을 덮는 마스크로 나눈다.
  const tab = (rows, y) => { // 표를 부드럽게 보간: rows = [[y, ...값]] (y 오름차순)
    if (y <= rows[0][0]) return rows[0];
    for (let k = 0; k < rows.length - 1; k++) {
      if (y <= rows[k + 1][0]) { const t = smooth(rows[k][0], rows[k + 1][0], y); return rows[k].map((a, i) => lerp(a, rows[k + 1][i], t)); }
    }
    return rows[rows.length - 1];
  };
  const curve = (pts, n) => new THREE.CatmullRomCurve3(pts.map((p) => V(p[0], p[1], p[2]))).getPoints(n).map((p) => p.toArray());
  const sgnPow = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);

  // 몸통 단면표: [y, 반폭, 반두께, 중심 z, 모서리 둥글기 지수]
  const TORSO = [
    [-0.97, 0.150, 0.110, 0.070, 2.6], [-0.89, 0.182, 0.128, 0.065, 2.7], [-0.75, 0.158, 0.108, 0.058, 2.5], [-0.60, 0.172, 0.116, 0.052, 2.5],
    [-0.45, 0.192, 0.128, 0.046, 2.6], [-0.32, 0.200, 0.122, 0.048, 2.7], [-0.25, 0.190, 0.104, 0.052, 2.6], [-0.208, 0.128, 0.088, 0.058, 2.3], [-0.17, 0.076, 0.074, 0.062, 2.0],
  ];
  /** 몸통 표면의 점: y 높이, th 둘레 각(3π/2가 정면), off 바깥으로 띄우는 거리 */
  const torsoPt = (y, th, off = 0) => {
    const [, a, b, zc, e] = tab(TORSO, y);
    const c = Math.cos(th), s = Math.sin(th), k = 2 / e;
    const chest = Math.max(0, -s) * smooth(-0.62, -0.42, y) * (1 - smooth(-0.36, -0.26, y)) * 0.012; // 가슴이 앞으로 살짝 나온다
    return [sgnPow(c, k) * (a + off), y, zc + sgnPow(s, k) * (b + off + chest)];
  };
  const FRONT = Math.PI * 1.5;
  const torso = new Surf().setUV(uvTile(3, 4));
  torso.loft(N(44), N(40), (u, v) => torsoPt(lerp(-0.97, -0.17, v), u * TAU));
  add(body, torso, M.suit, (x, y) => spineWeights(y));
  /** 몸통을 따라 붙는 띠(멜빵·조끼): 둘레 각 th0~th1, 높이 y0~y1 */
  const strip = (S, th0, th1, y0, y1, off, nu = 4, nv = 10) => {
    S.grid(N(nu), N(nv), (u, v) => torsoPt(lerp(y0, y1, v), lerp(th0, th1, u), off * (0.35 + 0.65 * Math.sin(u * Math.PI) ** 0.5)), { ref: [0, lerp(y0, y1, 0.5), 0.05] });
  };

  // 목(피부) · 옷깃 · 구명조끼 목깃(말굽 모양)
  const neckS = new Surf().setUV(uvTile(1, 1));
  neckS.tube([[0, -0.19, 0.062], [0, -0.14, 0.066], [0, -0.085, 0.072]], (v) => 0.054 - v * 0.004, N(18), { caps: false });
  add(body, neckS, M.skin, (x, y) => (y < -0.17 ? [bi('spine2'), 0.5, bi('neck'), 0.5] : y < -0.12 ? [bi('neck'), 1] : [bi('neck'), 0.4, bi('head'), 0.6]));
  const collar = new Surf().setUV(uvTile(2, 1));
  collar.loft(N(24), 3, (u, v) => { const th = u * TAU, r = lerp(0.082, 0.066, v), open = 1 + 0.12 * Math.max(0, -Math.sin(th)); return [Math.cos(th) * r, lerp(-0.19, -0.118 + 0.022 * Math.sin(th), v), 0.062 + Math.sin(th) * r * open]; });
  add(body, collar, M.suit, () => [bi('spine2'), 0.7, bi('neck'), 0.3]);
  const lpu = new Surf().setUV(uvTile(1, 3));
  { const pts = [];
    for (let k = 0; k <= 16; k++) { const t = lerp(-2.35, 2.35, k / 16), back = Math.cos(t); // t=0이 목 뒤
      pts.push([Math.sin(t) * 0.118, -0.205 - (1 - back) * 0.014, 0.07 + back * 0.085]); }
    const full = [[-0.075, -0.40, -0.088], [-0.082, -0.31, -0.066], ...pts.reverse(), [0.082, -0.31, -0.066], [0.075, -0.40, -0.088]];
    const c = curve(full, N(34));
    lpu.tube(c, (v) => 0.03 + 0.008 * Math.sin(v * Math.PI), N(12)); }
  add(body, lpu, M.web, (x, y) => (y > -0.24 ? [bi('spine2'), 0.85, bi('neck'), 0.15] : [bi('spine2'), 1]));

  // 멜빵(낙하산 하네스): 어깨 끈 2줄 + 가슴 끈 + 버클
  const harness = new Surf().setUV(uvTile(1, 6));
  for (const sd of [-1, 1]) {
    strip(harness, FRONT + sd * 0.62 - 0.14, FRONT + sd * 0.62 + 0.14, -0.86, -0.265, 0.007, 3, 16); // 앞
    strip(harness, Math.PI / 2 - sd * 0.62 - 0.14, Math.PI / 2 - sd * 0.62 + 0.14, -0.86, -0.265, 0.007, 3, 12); // 등
  }
  strip(harness, FRONT - 0.75, FRONT + 0.75, -0.475, -0.43, 0.011, 10, 2); // 가슴 끈
  strip(harness, 0, TAU, -0.80, -0.755, 0.008, 28, 2); // 허리 끈
  add(body, harness, M.web, (x, y) => spineWeights(y));
  const buckles = new Surf().setUV(uvTile(1, 1));
  { const p = torsoPt(-0.452, FRONT, 0.016); buckles.box(p, [0.05, 0.042, 0.012]);
    for (const sd of [-1, 1]) { const q = torsoPt(-0.33, FRONT + sd * 0.62, 0.012); buckles.box(q, [0.044, 0.03, 0.012]); const r = torsoPt(-0.775, FRONT + sd * 0.5, 0.014); buckles.box(r, [0.04, 0.034, 0.012]); } }
  // 지퍼(목에서 배까지) · 당김쇠 · 이름표 · 계급장
  for (let k = 0; k < 14; k++) { const p = torsoPt(-0.25 - k * 0.012, FRONT, 0.003); buckles.box(p, [0.012, 0.007, 0.004]); }
  { const p = torsoPt(-0.265, FRONT, 0.006); buckles.box([p[0], p[1] - 0.012, p[2]], [0.014, 0.026, 0.006]); }
  add(body, buckles, M.metal, (x, y) => spineWeights(y));
  const patches = new Surf().setUV(uvTile(1, 1));
  strip(patches, FRONT - 0.52, FRONT - 0.2, -0.40, -0.365, 0.0045, 3, 1); // 이름표(왼가슴은 화면에서 오른쪽)
  strip(patches, FRONT + 0.2, FRONT + 0.48, -0.41, -0.355, 0.0045, 3, 1); // 비행단 표지
  add(body, patches, M.patch, (x, y) => spineWeights(y));

  // 팔다리: 여러 마디로 나눈 관. 관절 근처에는 접힌 주름(지오메트리)이 들어간다
  const limb = (pa, pb, rFn, segs, wrinkle) => {
    const S = new Surf().setUV(uvTile(2, 3));
    const pts = []; for (let k = 0; k <= segs; k++) pts.push(pa.clone().lerp(pb, k / segs).toArray());
    S.tube(pts, (v) => rFn(v) * (1 + wrinkle(v)), N(18));
    return S;
  };
  const fold = (center, width, amp, freq) => (v) => amp * Math.exp(-(((v - center) / width) ** 2)) * Math.sin(v * freq);
  const jointW = (self, next, parent, pa, pb, band = 0.28) => (x, y, z) => {
    const ab = pb.clone().sub(pa), t = clamp01(V(x, y, z).sub(pa).dot(ab) / ab.lengthSq());
    const wn = t > 1 - band ? 0.5 * ((t - (1 - band)) / band) : 0, wp = t < band ? 0.5 * ((band - t) / band) : 0;
    const r = [bi(self), 1 - wn - wp]; if (wn) r.push(bi(next), wn); if (wp) r.push(bi(parent), wp); return r;
  };
  side.forEach((s, i) => {
    const n = names[i];
    const fd = V(REST.foreDir.x * s, REST.foreDir.y, REST.foreDir.z);
    const sh = mir(REST.shoulder, s), el = sh.clone().addScaledVector(V(REST.upperDir.x * s, REST.upperDir.y, REST.upperDir.z), L1), wr = el.clone().addScaledVector(fd, L2);
    // 어깨(삼각근): 몸통과 위팔을 잇는 둥근 덩어리
    const delt = new Surf().setUV(uvTile(1, 1));
    delt.sphere([sh.x - s * 0.006, sh.y - 0.012, sh.z], 0.074, N(20), N(14), [1.0, 1.12, 1.08]);
    add(arms, delt, M.suit, () => [bi('upper' + n), 0.55, bi('clav' + n), 0.45]);
    const up = limb(sh, el, (v) => lerp(0.062, 0.05, v) + 0.005 * Math.sin(v * Math.PI), 10, fold(0.92, 0.16, 0.05, 46));
    add(arms, up, M.suit, jointW('upper' + n, 'fore' + n, 'upper' + n, sh, el));
    const foEnd = wr.clone().addScaledVector(fd, -0.045);
    const fo = limb(el, foEnd, (v) => lerp(0.05, 0.036, v) + 0.004 * Math.sin(v * Math.PI), 10, (v) => fold(0.08, 0.16, 0.05, 46)(v) + fold(0.95, 0.1, 0.035, 60)(v));
    add(arms, fo, M.suit, jointW('fore' + n, 'fore' + n, 'upper' + n, el, wr));
    const eb = new Surf().setUV(uvTile(1, 1));
    eb.sphere(el.toArray(), 0.051, N(14), N(10));
    add(arms, eb, M.suit, () => [bi('upper' + n), 0.5, bi('fore' + n), 0.5]);
    // 소매 주머니(왼팔 펜 주머니) · 어깨 패치
    const pk = new Surf().setUV(uvTile(1, 1));
    const pc = sh.clone().lerp(el, 0.42);
    if (s < 0) { pk.box([pc.x + s * 0.056, pc.y, pc.z], [0.006, 0.05, 0.04]); add(arms, pk, M.patch, rigid('upper' + n)); }
    // 장갑: 손목 덮개(가죽 건틀릿) → 손등·손바닥 → 손가락
    const cuff = new Surf().setUV(uvTile(2, 1));
    cuff.tube([wr.clone().addScaledVector(fd, -0.085).toArray(), wr.clone().addScaledVector(fd, -0.04).toArray(), wr.toArray()], (v) => lerp(0.044, 0.035, v), N(16));
    add(arms, cuff, M.glove, (x, y, z) => (V(x, y, z).sub(wr).dot(fd) < -0.03 ? [bi('fore' + n), 1] : [bi('fore' + n), 0.4, bi('hand' + n), 0.6]));
    const hand = new Surf().setUV(uvTile(1, 1));
    hand.sphere([wr.x, wr.y - 0.003, wr.z - 0.04], 0.052, N(18), N(12), [0.94, 0.34, 0.92]); // 손등·손바닥
    hand.sphere([wr.x - s * 0.036, wr.y - 0.008, wr.z - 0.022], 0.026, N(12), N(8), [1, 0.8, 1.3]); // 엄지 밑 살
    add(arms, hand, M.glove, rigid('hand' + n));
    const kn = new Surf().setUV(uvTile(1, 1)); // 손등 보강 가죽(색이 다른 덧댐)
    kn.sphere([wr.x, wr.y + 0.009, wr.z - 0.04], 0.04, N(12), N(6), [0.9, 0.25, 0.8], { phi0: 0, phi1: 1.3 });
    add(arms, kn, M.gloveBack, rigid('hand' + n));
    for (const f of handInfo[n].fingers) {
      for (const [bone, a, b, r0, r1] of [[f.b0, f.b0.userData.world, f.b1.userData.world, f.def.r * 1.06, f.def.r * 0.96], [f.b1, f.b1.userData.world, f.tip, f.def.r * 0.96, f.def.r * 0.8]]) {
        const S = new Surf().setUV(uvTile(1, 1));
        S.tube([a.toArray(), a.clone().lerp(b, 0.5).toArray(), b.toArray()], (v) => lerp(r0, r1, v), N(10), { caps: false });
        S.sphere(a.toArray(), r0, N(10), N(6)); // 마디
        S.sphere(b.toArray(), r1, N(10), N(6)); // 끝
        add(arms, S, M.glove, rigid(bone.name));
      }
    }
  });

  // 다리: 비행복 위에 G슈트(허벅지·종아리를 감싸는 덮개, 옆줄 끈)·부츠
  side.forEach((s, i) => {
    const n = names[i];
    const hip = mir(REST.hip, s), kn = hip.clone().addScaledVector(V(REST.thighDir.x * s, REST.thighDir.y, REST.thighDir.z), T1), an = kn.clone().addScaledVector(V(REST.shinDir.x * s, REST.shinDir.y, REST.shinDir.z), T2);
    const th = limb(hip, kn, (v) => lerp(0.094, 0.064, v), 10, fold(0.05, 0.14, 0.04, 40));
    add(body, th, M.suit, jointW('thigh' + n, 'shin' + n, 'pelvis', hip, kn, 0.22));
    const sn = limb(kn, an, (v) => lerp(0.062, 0.046, v) + 0.008 * Math.sin(Math.min(1, v * 1.6) * Math.PI), 10, fold(0.04, 0.12, 0.04, 44));
    add(body, sn, M.suit, jointW('shin' + n, 'shin' + n, 'thigh' + n, kn, an, 0.22));
    const kc = new Surf().setUV(uvTile(1, 1));
    kc.sphere(kn.toArray(), 0.066, N(14), N(10));
    add(body, kc, M.suit, () => [bi('thigh' + n), 0.5, bi('shin' + n), 0.5]);
    const gs = new Surf().setUV(uvTile(2, 2));
    gs.tube([hip.clone().lerp(kn, 0.16).toArray(), hip.clone().lerp(kn, 0.5).toArray(), hip.clone().lerp(kn, 0.84).toArray()], (v) => lerp(0.096, 0.072, v) + 0.004, N(18), { caps: false });
    add(body, gs, M.gsuit, rigid('thigh' + n));
    const gc = new Surf().setUV(uvTile(2, 2));
    gc.tube([kn.clone().lerp(an, 0.14).toArray(), kn.clone().lerp(an, 0.42).toArray(), kn.clone().lerp(an, 0.7).toArray()], (v) => lerp(0.07, 0.058, v) + 0.004, N(18), { caps: false });
    add(body, gc, M.gsuit, rigid('shin' + n));
    const bt = new Surf().setUV(uvTile(1, 1));
    bt.tube([an.clone().add(V(0, 0.13, 0)).toArray(), an.clone().add(V(0, 0.05, 0)).toArray(), an.toArray()], (v) => lerp(0.052, 0.046, v), N(16));
    bt.sphere([an.x, an.y - 0.025, an.z - 0.085], 0.05, N(14), N(8), [0.95, 0.7, 2.3]); // 발등
    bt.box([an.x, an.y - 0.058, an.z - 0.07], [0.094, 0.018, 0.25]); // 밑창
    add(body, bt, M.boot, rigid('foot' + n));
  });
  // G슈트 배 덮개와 호스(왼쪽 허리에서 좌석 옆 커넥터로)
  const gab = new Surf().setUV(uvTile(2, 1));
  strip(gab, FRONT - 1.05, FRONT + 1.05, -0.93, -0.81, 0.012, 14, 3);
  add(body, gab, M.gsuit, (x, y) => spineWeights(y));
  const ghose = new Surf().setUV(uvTile(1, 1));
  ghose.tube(curve([torsoPt(-0.86, FRONT - 1.0, 0.02), [-0.24, -0.9, -0.04], [-0.3, -0.96, 0.02], [-0.33, -1.02, 0.1]], N(12)), (v) => 0.014 + 0.002 * Math.sin(v * 90), N(8));
  add(body, ghose, M.rubber, () => [bi('pelvis'), 1]);

  // ── 머리와 헬멧(HGU-55 계열) ──
  const HC = [0, 0.005, 0.088]; // 머리 중심(눈은 머리 앞쪽이라 중심은 눈 뒤에 있다)
  const HR = [0.119, 0.129, 0.139]; // 껍데기 반지름(좌우·상하·앞뒤)
  const ell = (th, ph, k = 1, c = HC) => [c[0] + Math.sin(ph) * Math.cos(th) * HR[0] * k, c[1] + Math.cos(ph) * HR[1] * k, c[2] + Math.sin(ph) * Math.sin(th) * HR[2] * k];
  // 얼굴: 헬멧과 마스크 사이로 뺨·턱이 조금 보인다
  const face = new Surf().setUV(uvTile(1, 1));
  face.sphere([0, -0.005, 0.085], 0.096, N(22), N(14), [0.84, 1.12, 1.02]);
  face.sphere([0, -0.085, 0.045], 0.062, N(16), N(10), [0.95, 0.9, 1.15]); // 턱
  add(body, face, M.skin, rigid('head'));
  // 껍데기: 앞은 눈썹 위까지만, 옆과 뒤는 귀 아래·목덜미까지 내려온다(얼굴 쪽이 뚫림)
  const rimPh = (th) => { const c = -Math.sin(th); return lerp(2.42, 1.08, smooth(0.42, 0.8, c)) - 0.1 * smooth(-0.2, -0.9, c); };
  const shell = new Surf().setUV(uvTile(2, 2));
  shell.grid(N(52), N(26), (u, v) => { const th = u * TAU; return ell(th, rimPh(th) * v); }, { closedU: true, ref: HC });
  add(body, shell, M.shell, rigid('head'));
  const liner = new Surf().setUV(uvTile(1, 1)); // 안감(안쪽 면)
  liner.grid(N(36), N(10), (u, v) => { const th = u * TAU; return ell(th, lerp(0.5, rimPh(th), v), 0.955); }, { closedU: true, ref: HC, inward: true });
  add(body, liner, M.rubber, rigid('head'));
  const roll = new Surf().setUV(uvTile(8, 1)); // 가장자리 고무 테두리
  { const pts = []; const n = N(56); for (let k = 0; k <= n; k++) { const th = (k / n) * TAU; pts.push(ell(th, rimPh(th), 0.985)); }
    roll.tube(pts, 0.0085, N(8), { caps: false }); }
  add(body, roll, M.rubber, rigid('head'));
  // 귀 부분 볼록한 덮개(이어컵 자리) · 바이저 회전축 · 마스크 걸쇠 받이
  const cups = new Surf().setUV(uvTile(1, 1));
  const fit = new Surf().setUV(uvTile(1, 1));
  for (const sd of [-1, 1]) {
    cups.sphere([sd * 0.108, -0.03, 0.095], 0.052, N(16), N(10), [0.42, 1.05, 0.95]);
    fit.sphere([sd * 0.122, 0.035, 0.05], 0.014, N(10), N(6), [0.5, 1, 1]); // 바이저 축
    fit.box([sd * 0.112, -0.055, 0.012], [0.012, 0.03, 0.022]); // 마스크 걸쇠 받이
  }
  add(body, cups, M.shell, rigid('head'));
  add(body, fit, M.metal, rigid('head'));
  // 바이저: 껍데기 밖에서 얼굴 구멍을 덮는 넓은 반사 방패(가운데는 코까지, 옆은 눈꼬리까지)
  const visor = new Surf().setUV(uvTile(1, 1));
  const VW = 1.32;
  visor.grid(N(40), N(18), (u, v) => {
    const a = lerp(-VW, VW, u), th = FRONT + a, edge = 1 - (a / VW) ** 2;
    const ph0 = 0.9 + 0.1 * (1 - edge), ph1 = lerp(1.5, 2.02, Math.sqrt(Math.max(0, edge)));
    return ell(th, lerp(ph0, ph1, v), 1.035);
  }, { ref: HC });
  add(body, visor, M.visor, rigid('head'));
  const vband = new Surf().setUV(uvTile(1, 1)); // 바이저 위쪽 테(검은 띠)
  vband.grid(N(40), 2, (u, v) => { const a = lerp(-VW, VW, u), edge = 1 - (a / VW) ** 2; return ell(FRONT + a, lerp(0.82, 0.93, v) + 0.1 * (1 - edge), 1.045); }, { ref: HC });
  add(body, vband, M.rubber, rigid('head'));
  // 산소마스크(MBU-20 계열): 고무 얼굴받이 + 단단한 겉껍데기 + 배기 밸브 + 양쪽 끈
  const mask = new Surf().setUV(uvTile(1, 1));
  mask.sphere([0, -0.07, -0.02], 0.064, N(24), N(16), [0.92, 1.0, 1.0]);
  add(body, mask, M.rubber, rigid('head'));
  const mshell = new Surf().setUV(uvTile(1, 1));
  mshell.sphere([0, -0.074, -0.052], 0.046, N(22), N(14), [0.86, 1.02, 0.92]);
  mshell.tube([[0, -0.092, -0.07], [0, -0.118, -0.088], [0, -0.14, -0.094]], (v) => lerp(0.027, 0.021, v), N(14)); // 호스 연결구
  for (const sd of [-1, 1]) mshell.tube([[sd * 0.03, -0.062, -0.07], [sd * 0.045, -0.058, -0.068]], 0.012, N(10)); // 흡기 밸브
  add(body, mshell, M.maskShell, rigid('head'));
  const straps = new Surf().setUV(uvTile(1, 1));
  for (const sd of [-1, 1]) straps.tube(curve([[sd * 0.04, -0.066, -0.048], [sd * 0.085, -0.06, -0.03], [sd * 0.112, -0.055, 0.012]], 6), 0.0065, N(6));
  add(body, straps, M.web, rigid('head'));
  // 주름진 산소 호스: 마스크에서 가슴 왼쪽 커넥터로
  const hoseEnd = torsoPt(-0.5, FRONT - 0.95, 0.03);
  const hose = new Surf().setUV(uvTile(1, 1));
  hose.tube(curve([[0, -0.138, -0.094], [0.005, -0.2, -0.12], [-0.04, -0.3, -0.135], [-0.1, -0.41, -0.12], hoseEnd], N(40)), (v) => 0.0165 + 0.0024 * Math.sin(v * 150), N(10));
  add(body, hose, M.rubber, (x, y) => (y > -0.17 ? [bi('head'), 1] : y > -0.3 ? [bi('head'), 0.45, bi('spine2'), 0.55] : [bi('spine2'), 1]));
  const conn = new Surf().setUV(uvTile(1, 1));
  conn.tube([hoseEnd, [hoseEnd[0] - 0.012, hoseEnd[1] - 0.04, hoseEnd[2] + 0.005]], 0.024, N(12)); // CRU 커넥터
  conn.sphere([-0.02, -0.105, 0.2], 0.012, N(8), N(6)); // 통신선 꼭지
  add(body, conn, M.metal, (x, y) => (y > -0.2 ? [bi('head'), 1] : [bi('spine2'), 1]));
  const cord = new Surf().setUV(uvTile(1, 1)); // 통신선(헬멧 뒤 왼쪽에서 어깨 뒤로)
  cord.tube(curve([[-0.02, -0.105, 0.2], [-0.07, -0.19, 0.19], [-0.12, -0.3, 0.14], [-0.15, -0.42, 0.12]], N(10)), 0.006, N(6));
  add(body, cord, M.rubber, (x, y) => (y > -0.14 ? [bi('head'), 1] : y > -0.26 ? [bi('head'), 0.4, bi('spine2'), 0.6] : [bi('spine2'), 1]));

  const bodyGeo = mergeParts(body, matList.length);
  const armsGeo = mergeParts(arms, matList.length);
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, matList);
  const armsMesh = new THREE.SkinnedMesh(armsGeo, matList);
  for (const m of [bodyMesh, armsMesh]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; group.add(m); }
  // 같은 뼈대를 두 메시가 공유한다
  group.updateMatrixWorld(true);
  bodyMesh.bind(skeleton, bodyMesh.matrixWorld);
  armsMesh.bind(skeleton, armsMesh.matrixWorld);
  let triangles = 0;
  for (const g of [bodyGeo, armsGeo]) triangles += g.index.count / 3;

  // ── 동작 ──────────────────────────────────────────────────────────────
  const D = COCKPIT_DIM;
  const st = {
    pitch: 0, turn: 0, power: 0.5, head: 0, headPitch: 0, kick: 0, kickT: 0,
    gx: 0, gy: 0, gvx: 0, gvy: 0, compress: 0, // G 쏠림 스프링
    curlR: 0.75, curlL: 0.75, thumbR: 0, firstPerson: false,
  };
  const _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _d = V(0, 0, 0), _e = V(0, 0, 0);
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _wq = new THREE.Quaternion();
  const _eu = new THREE.Euler();
  const poleLegR = V(0.3, 1, 0), poleLegL = V(-0.3, 1, 0);

  /** 뼈의 그룹 기준 위치(바인드 위치가 아니라 현재 포즈) */
  function localPos(bone, out) {
    out.set(0, 0, 0);
    for (let b = bone; b && b !== group; b = b.parent) { b.updateMatrix(); out.applyMatrix4(b.matrix); }
    return out;
  }
  /** 뼈의 그룹 기준 회전 */
  function localQuat(bone, out) {
    out.identity();
    for (let b = bone.parent; b && b !== group; b = b.parent) out.premultiply(b.quaternion);
    return out;
  }
  /** 뼈를 기본 방향 rest에서 dir 방향으로 돌린다(세계 회전 = 최단 회전). 부모의 현재 회전을 빼서 로컬로 넣는다. */
  function aim(bone, rest, dir, twist = 0) {
    localQuat(bone, _q2);
    _wq.setFromUnitVectors(rest, dir);
    if (twist) _wq.multiply(_q.setFromAxisAngle(rest, twist));
    bone.quaternion.copy(_q2.invert().multiply(_wq));
  }
  /** 투본 IK: 어깨에서 목표까지 팔을 뻗는다(팔꿈치는 pole 쪽으로 꺾인다) */
  function ik2(root, mid, end, l1, l2, restA, restB, target, pole, sgn) {
    root.parent.updateMatrix();
    localPos(root, _a); // 어깨
    _b.copy(target).sub(_a);
    let d = _b.length();
    const reach = l1 + l2 - 0.004;
    if (d > reach) { _b.multiplyScalar(reach / d); d = reach; }
    d = Math.max(d, Math.abs(l1 - l2) + 0.01);
    _b.normalize();
    const aa = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
    _c.copy(pole).addScaledVector(_b, -pole.dot(_b)).normalize(); // 팔이 꺾이는 방향(몸 바깥·아래)
    _d.copy(_a).addScaledVector(_b, aa).addScaledVector(_c, h); // 팔꿈치 위치
    _e.copy(_d).sub(_a).normalize();
    aim(root, restA, _e);
    root.updateMatrix();
    mid.updateMatrix();
    _e.copy(_a).addScaledVector(_b, d).sub(_d).normalize(); // 아래팔 방향
    aim(mid, restB, _e);
    return d;
  }

  const HAND_ROLL = 1.15; // 오른손을 세워 잡는 각(라디안)
  const wristR = V(0, 0, 0), wristL = V(0, 0, 0);
  const gripR = V(0, 0, 0), gripL = V(0, 0, 0), poleR = V(0.7, -0.6, 0.3), poleL = V(-0.7, -0.6, 0.3), footR = V(0, 0, 0), footL = V(0, 0, 0);
  const restUp = (s) => V(REST.upperDir.x * s, REST.upperDir.y, REST.upperDir.z);
  const restFo = (s) => V(REST.foreDir.x * s, REST.foreDir.y, REST.foreDir.z);
  const restTh = (s) => V(REST.thighDir.x * s, REST.thighDir.y, REST.thighDir.z);
  const restSh = (s) => V(REST.shinDir.x * s, REST.shinDir.y, REST.shinDir.z);
  const cache = { up: [restUp(1), restUp(-1)], fo: [restFo(1), restFo(-1)], th: [restTh(1), restTh(-1)], sh: [restSh(1), restSh(-1)] };

  function setFinger(f, curl, thumbExtra = 0) {
    // 기본 방향이 -z(앞)이므로 x축 회전의 부호가 음수일 때 아래로 말린다
    const c1 = curl * 1.15 + thumbExtra, c2 = curl * 1.0;
    f.b0.quaternion.setFromAxisAngle(_a.set(1, 0, 0), -c1 * (f.def.thumb ? 0.6 : 1));
    f.b1.quaternion.setFromAxisAngle(_a.set(1, 0, 0), -c2 * (f.def.thumb ? 0.8 : 1));
  }

  /**
   * @param {object} o pitch, turn(입력 -1~1), power(0~1), turnLoad, pitchLoad(G), fire(0~1 발사 순간 펄스), dt, stick(조종석이 보이면 그 값)
   */
  function update(o) {
    const dt = Math.max(0.0001, Math.min(o.dt || 0.016, 0.05));
    st.pitch = damp(st.pitch, o.pitch, 0.07, dt);
    st.turn = damp(st.turn, o.turn, 0.07, dt);
    st.power = damp(st.power, o.power, 0.3, dt);
    if (o.firePulse > 0) { st.kick = 1; st.kickT = 0; o.firePulse = 0; }
    st.kickT += dt;
    st.kick = Math.max(0, st.kick - dt / 0.45);

    // G 쏠림: 하중만큼 머리가 아래·바깥으로 눌렸다가(관성 지연) 돌아온다. 큰 G에서는 목이 눌린다
    st.surge = damp(st.surge || 0, o.surge || 0, 0.12, dt); // 가속에 몸이 뒤로 쏠린다(이륙)
    const load = Math.min(1.4, Math.abs(o.turnLoad || 0) * 0.8 + Math.max(0, o.pitchLoad || 0) * 0.7);
    const ty = -0.035 * load, tx = -0.03 * (o.turnLoad || 0);
    const h = Math.min(dt, 0.04);
    st.gvy += ((ty - st.gy) * 52 - st.gvy * 6) * h; st.gy += st.gvy * h;
    st.gvx += ((tx - st.gx) * 52 - st.gvx * 6) * h; st.gx += st.gvx * h;
    st.compress = damp(st.compress, clamp01(load - 0.5), 0.25, dt);

    // 몸통: 척추가 G 방향으로 기울고, 머리가 숙여진다(3인칭에서 조종사가 입력에 반응)
    const lean = clamp(st.gx / 0.03, -1.5, 1.5);
    B.spine1.quaternion.setFromEuler(_eu.set(-0.03 + -st.gy * 1.2 + st.surge * 0.1, 0, lean * 0.05));
    B.spine2.quaternion.setFromEuler(_eu.set(-0.02 + -st.gy * 1.6, st.turn * -0.05, lean * 0.08));
    B.neck.position.y = B.neck.userData.world.y - B.spine2.userData.world.y - st.compress * 0.025;
    const yaw = -st.turn * 0.55; // 선회 방향으로 고개를 돌린다
    const nod = -0.2 * Math.sin(Math.min(1, st.kickT / 0.45) * Math.PI) * st.kick - st.gy * 2.4 - st.compress * 0.1; // 발사 때 고개를 숙임
    st.head = damp(st.head, yaw, 0.18, dt);
    B.head.quaternion.setFromEuler(_eu.set(nod, st.head, st.head * 0.12 + lean * 0.04));
    B.pelvis.position.y = B.pelvis.userData.world.y - 0.0 + st.gy * 0.4;
    B.pelvis.updateMatrix(); B.spine1.updateMatrix(); B.spine2.updateMatrix(); B.neck.updateMatrix(); B.head.updateMatrix();

    // 조종간·스로틀 잡는 위치(조종석과 같은 식)
    const sx = D.stick.base, ang = D.stick.throw * DEG;
    const sp = o.stick ? o.stick.pitch : st.pitch, stn = o.stick ? o.stick.turn : st.turn;
    _a.set(0, D.stick.length * 0.8, -0.012).applyEuler(_eu.set(sp * ang, 0, -stn * ang));
    gripR.set(sx[0] + _a.x, sx[1] + _a.y, sx[2] + _a.z);
    const tb = D.throttle.base;
    gripL.set(tb[0] + 0.01, tb[1] + 0.1, tb[2] - (st.power - 0.5) * D.throttle.travel);
    footR.set(D.pedals.x, D.pedals.y + 0.04, D.pedals.z - st.turn * D.pedals.travel + 0.05);
    footL.set(-D.pedals.x, D.pedals.y + 0.04, D.pedals.z + st.turn * D.pedals.travel + 0.05);

    // 팔 IK(오른손 = 조종간, 왼손 = 스로틀)
    // 손목 목표는 손잡이에서 손바닥만큼 물러난 곳(손바닥이 손잡이를 감싼다)
    wristR.copy(gripR).add(_c.set(0.034, 0.012, 0.05));
    wristL.copy(gripL).add(_c.set(0, 0.03, 0.05));
    ik2(B.upperR, B.foreR, B.handR, L1, L2, cache.up[0], cache.fo[0], wristR, poleR, 1);
    ik2(B.upperL, B.foreL, B.handL, L1, L2, cache.up[1], cache.fo[1], wristL, poleL, -1);
    // 손 방향: 손가락이 앞을 향하고 조종간·스로틀에 감긴다
    for (const [hand, fore, grip, s, k] of [[B.handR, B.foreR, gripR, 1, 0], [B.handL, B.foreL, gripL, -1, 1]]) {
      fore.updateMatrix(); hand.parent.updateMatrix();
      localPos(hand, _a);
      _b.copy(grip).sub(_a);
      _b.y -= 0.06; _b.normalize();
      aim(hand, cache.fo[k], _b.lerp(_c.set(0, -0.15, -1).normalize(), 0.55).normalize(), k ? 0 : HAND_ROLL);
    }
    // 손가락: 조종간·스로틀을 쥔다. 발사하면 엄지(오른손)가 눌린다
    const press = st.kick * 0.5 * (st.kickT < 0.2 ? 1 : 0.4);
    for (const n of names) {
      const curl = n === 'R' ? 0.95 : 0.85;
      for (const f of handInfo[n].fingers) {
        if (f.def.thumb) setFinger(f, curl * 0.55 + (n === 'R' ? press : 0), 0.0);
        else setFinger(f, curl + (n === 'R' && f.def.name === 'index' ? press * 0.8 : 0));
      }
    }
    // 다리 IK(페달)
    for (const [thigh, shin, foot, target, k] of [[B.thighR, B.shinR, B.footR, footR, 0], [B.thighL, B.shinL, B.footL, footL, 1]]) {
      ik2(thigh, shin, foot, T1, T2, cache.th[k], cache.sh[k], target, k ? poleLegL : poleLegR, k ? -1 : 1);
      foot.quaternion.identity();
    }
    for (const b of bones) b.updateMatrix();
  }

  update({ pitch: 0, turn: 0, power: 0.5, dt: 1 });

  const api = {
    group, triangles, bodyMesh, armsMesh, bones: B, update,
    /** 1인칭: 팔과 손만 보인다. 3인칭: 헬멧과 상체가 캐노피 안에 보인다. */
    setFirstPerson(on) { st.firstPerson = on; bodyMesh.visible = !on; },
    dispose() {
      bodyGeo.dispose(); armsGeo.dispose(); skeleton.dispose();
      for (const d of disposables) if (d.dispose) d.dispose();
    },
  };
  return api;
}

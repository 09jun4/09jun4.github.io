// 하이폴리 조종석(높음·최고). 원점 = 조종사 눈, 앞 = -z.
// 계기판(대형 화면 3분할 MFD), 글레어실드, 사이드 콘솔(스위치·라벨·배선), 사출좌석·벨트, 스로틀, 조종간,
// 방향 페달, HUD 유리판(콤바이너), 캐노피 프레임·거울·유리(흠집), 조종사 팔·다리·장갑.
import * as THREE from 'three';
import { Surf } from './surface.js';
import { createMfd } from './mfd.js';
import { PALETTE } from '../../data/palette.js';
import { DEG, damp, lerp, makeRng } from '../../core/math.js';

const C = PALETTE.cockpit;
const TAU = Math.PI * 2;

export const COCKPIT_DIM = {
  sillY: -0.37, sillX: 0.53, floorY: -1.24,
  shield: { y: -0.345, nearZ: -0.72, farZ: -1.2, halfW: 0.5 },
  panel: { z: -0.76, topY: -0.37, botY: -0.9, halfW: 0.48, tilt: 0.1 },
  mfd: { halfW: 0.36, topY: -0.4, botY: -0.66 },
  hud: { z: -0.88, halfW: 0.19, y0: -0.27, y1: 0.1 },
  hudPlane: { distance: 6, halfAngle: 12 }, // HUD 기호가 맺히는 가상 면(무한 원점 흉내): 눈앞 6m, ±12°
  stick: { base: [0, -0.74, -0.52], length: 0.36, throw: 11 },
  throttle: { base: [-0.41, -0.5, -0.36], travel: 0.13 },
  pedals: { y: -1.0, z: -0.8, x: 0.17, travel: 0.07 }, // z: 조종사 다리가 닿을 수 있는 거리
  seat: { backZ: 0.2, panY: -0.98 },
  arch: { halfW: 0.56, rise: 0.98, z0: -0.46, rake: 0.36 },
  // 1인칭에서 동체 외피가 조종석 안을 가리지 않도록 잘라내는 상자(눈 기준)
  cut: { min: [-0.62, -1.4, -1.32], max: [0.62, -0.2, 1.0] },
};

/** 콘솔 윗면에 입히는 라벨·스위치 자리 그림(작은 글씨, 구획선, 경고 줄무늬) */
function legendTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const rng = makeRng(77);
  g.fillStyle = '#1a1e23';
  g.fillRect(0, 0, 512, 512);
  const words = ['FUEL', 'ENG', 'COMM', 'NAV', 'IFF', 'ECS', 'OXY', 'LIGHT', 'APU', 'HYD', 'ELEC', 'TACAN', 'FCS', 'EW', 'MASTER', 'TEST', 'TRIM', 'BRK', 'CANOPY', 'SEAT'];
  g.strokeStyle = '#59636d';
  g.lineWidth = 1.5;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const px = x * 128 + 6, py = y * 64 + 5;
      g.strokeRect(px, py, 116, 54);
      g.fillStyle = '#c9d2da';
      g.font = '600 9px Arial, sans-serif';
      g.fillText(words[Math.floor(rng() * words.length)], px + 5, py + 12);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = '#0d0f12';
        g.beginPath(); g.arc(px + 16 + k * 28, py + 34, 7, 0, TAU); g.fill();
        g.fillStyle = '#8d98a3';
        g.font = '500 6px Arial, sans-serif';
        g.fillText(['ON', 'OFF', 'AUTO', 'ARM', 'NORM'][Math.floor(rng() * 5)], px + 9 + k * 28, py + 50);
      }
      if (rng() < 0.18) { // 경고 줄무늬 가드
        for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#141414' : '#d1a52a'; g.fillRect(px + 84 + k * 5, py + 4, 5, 9); }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 캐노피 유리 안쪽의 미세한 흠집·먼지(투명도 맵) */
function scratchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const rng = makeRng(5);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = rng() * 512, y = rng() * 512, a = rng() * TAU, len = 6 + rng() * 60;
    g.strokeStyle = `rgba(255,255,255,${0.05 + rng() * 0.2})`;
    g.lineWidth = 0.4 + rng() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 8, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.16})`; g.fillRect(rng() * 512, rng() * 512, 1.2, 1.2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const uvBox = (sx, sy) => (x, y, z, u, v) => [u * sx, v * sy];

/**
 * @param {THREE.Vector3} eye 기체 좌표계의 눈 위치
 * @param {number} detail 1(높음) | 2(최고)
 */
export function createCockpitHi(eye, detail) {
  const D = COCKPIT_DIM;
  const hi = detail >= 2;
  const n = hi ? 18 : 10;
  const group = new THREE.Group();
  group.name = 'cockpit-hi';
  group.position.copy(eye);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const mesh = (S, material, parent = group) => {
    const m = new THREE.Mesh(keep(S.build()), material);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    parent.add(m);
    return m;
  };

  const panelMat = keep(new THREE.MeshStandardMaterial({ color: C.panel, roughness: 0.78, metalness: 0.25 }));
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: C.frame, roughness: 0.6, metalness: 0.45 }));
  const trimMat = keep(new THREE.MeshStandardMaterial({ color: C.panelTrim, roughness: 0.5, metalness: 0.6 }));
  const seatMat = keep(new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.85, metalness: 0.05 }));
  const beltMat = keep(new THREE.MeshStandardMaterial({ color: 0x5b6048, roughness: 0.95, metalness: 0 }));
  const suitMat = keep(new THREE.MeshStandardMaterial({ color: 0x48513f, roughness: 0.92, metalness: 0 }));
  const gloveMat = keep(new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.8, metalness: 0.05 }));
  const warnMat = keep(new THREE.MeshStandardMaterial({ color: 0xd9a43a, roughness: 0.6, metalness: 0.1 }));
  const legend = keep(legendTexture());
  const legendMat = keep(new THREE.MeshStandardMaterial({ map: legend, emissiveMap: legend, emissive: 0x9fe8dc, emissiveIntensity: 0.22, roughness: 0.7, metalness: 0.2 }));

  // ── 구조: 벽·바닥·레일·글레어실드·계기판 ──
  const S = new Surf();
  const P = new Surf(); // 계기판류(어두운 패널)
  const T = new Surf(); // 금속 테두리·손잡이
  for (const side of [-1, 1]) {
    S.box([side * (D.sillX + 0.02), D.sillY, -0.4], [0.07, 0.05, 1.7]); // 캐노피 레일
    S.box([side * 0.6, -0.82, -0.3], [0.04, 0.9, 2.0]); // 옆 벽
    S.box([side * 0.45, D.floorY + 0.55, -0.25], [0.24, 0.06, 1.25]); // 콘솔 받침
    // 벽을 따라가는 배선 다발과 고정 클립
    for (let i = 0; i < (hi ? 4 : 2); i++) {
      const y = -0.44 - i * 0.035;
      T.tube([[side * 0.575, y, 0.5], [side * 0.578, y - 0.01, -0.1], [side * 0.575, y, -0.7], [side * 0.56, y - 0.03, -1.05]], 0.007, 5);
    }
    for (const z of [0.3, -0.1, -0.5, -0.9]) T.box([side * 0.573, -0.49, z], [0.012, 0.16, 0.022]);
  }
  S.box([0, D.floorY, -0.3], [1.24, 0.04, 2.1]); // 바닥
  S.box([0, -0.82, 0.42], [1.24, 0.9, 0.05]); // 뒤 격벽(눈높이 아래까지만: 뒤를 돌아볼 수 있게)
  // 글레어실드: 가운데가 살짝 솟은 덮개
  const sh = D.shield;
  S.grid(n, 4, (u, v) => {
    const x = lerp(-sh.halfW, sh.halfW, u);
    const z = lerp(sh.nearZ, sh.farZ, v);
    const w = lerp(1, 0.8, v);
    return [x * w, sh.y + 0.03 * Math.cos((u - 0.5) * Math.PI) - v * 0.02, z];
  }, { ref: [0, -2, -1] });
  S.grid(n, 1, (u, v) => { const x = lerp(-sh.halfW, sh.halfW, u); return [x, sh.y + 0.03 * Math.cos((u - 0.5) * Math.PI) - v * 0.05, sh.nearZ + v * 0.012]; }, { ref: [0, -0.4, -2] });
  // 계기판(뒤로 살짝 누움)
  const pn = D.panel;
  const pz = (y) => pn.z + (pn.topY - y) * pn.tilt;
  P.grid(2, 2, (u, v) => { const y = lerp(pn.topY, pn.botY, v); return [lerp(-pn.halfW, pn.halfW, u), y, pz(y)]; }, { ref: [0, -0.6, -3] });
  // 무릎 사이 중앙 받침대
  P.box([0, -0.98, -0.72], [0.26, 0.3, 0.3]);
  // 대형 화면 테두리
  const mf = D.mfd;
  for (const [x0, x1, y0, y1] of [[-mf.halfW - 0.02, mf.halfW + 0.02, mf.topY + 0.02, mf.topY], [-mf.halfW - 0.02, mf.halfW + 0.02, mf.botY, mf.botY - 0.02], [-mf.halfW - 0.02, -mf.halfW, mf.topY, mf.botY], [mf.halfW, mf.halfW + 0.02, mf.topY, mf.botY]]) {
    T.box([(x0 + x1) / 2, (y0 + y1) / 2, pz((y0 + y1) / 2) + 0.008], [Math.abs(x1 - x0), Math.abs(y1 - y0), 0.014]);
  }
  // 보조 계기(원형 3개)와 그 테두리
  for (const gx of [-0.42, 0.42]) {
    for (const gy of [-0.45, -0.56]) {
      const ring = [];
      for (let i = 0; i < n; i++) ring.push([gx + Math.cos((i / n) * TAU) * 0.036, gy + Math.sin((i / n) * TAU) * 0.036, pz(gy) + 0.01]);
      T.cap(ring, [gx, gy, pz(gy) - 1]);
    }
  }
  // HUD 받침·투사기와 유리 테두리
  const h = D.hud;
  T.box([0, sh.y + 0.03, h.z + 0.1], [0.22, 0.05, 0.18]);
  for (const side of [-1, 1]) {
    T.tube([[side * h.halfW, sh.y + 0.02, h.z + 0.05], [side * h.halfW, h.y0, h.z], [side * h.halfW, h.y1, h.z - 0.035]], 0.008, 6);
  }
  T.tube([[-h.halfW, h.y0, h.z], [h.halfW, h.y0, h.z]], 0.006, 6);
  T.tube([[-h.halfW, h.y1, h.z - 0.035], [h.halfW, h.y1, h.z - 0.035]], 0.005, 6);
  // 캐노피 앞 아치 + 거울 3개
  const a = D.arch;
  const archPts = [];
  for (let i = 0; i <= 28; i++) { const t = (Math.PI * i) / 28; archPts.push([-Math.cos(t) * a.halfW, D.sillY + Math.sin(t) * a.rise, a.z0 - Math.sin(t) * a.rake]); }
  S.tube(archPts, 0.019, 8);
  for (const t of [Math.PI * 0.5, Math.PI * 0.3, Math.PI * 0.7]) {
    T.box([-Math.cos(t) * (a.halfW - 0.05), D.sillY + Math.sin(t) * (a.rise - 0.05), a.z0 - Math.sin(t) * a.rake + 0.03], [0.1, 0.035, 0.012]);
  }
  mesh(S, frameMat);
  mesh(P, panelMat);
  mesh(T, trimMat);

  // ── 사이드 콘솔 윗면(라벨 그림) ──
  const L = new Surf();
  for (const side of [-1, 1]) {
    L.setUV((x, y, z, u, v) => [side > 0 ? u : 1 - u, v * 2]);
    L.grid(1, 1, (u, v) => [side * lerp(0.33, 0.57, u), lerp(-0.56, -0.5, u), lerp(0.3, -0.78, v)], { ref: [0, -3, 0] });
  }
  mesh(L, legendMat);

  // ── 스위치·노브·버튼(InstancedMesh) ──
  const rng = makeRng(31);
  const mtx = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const put = (x, y, z, sx, sy, sz, rx = 0) => { e.set(rx, 0, 0); q.setFromEuler(e); m4.compose(ps.set(x, y, z), q, sc.set(sx, sy, sz)); mtx.push(m4.clone()); };
  for (const side of [-1, 1]) {
    for (let r = 0; r < (hi ? 16 : 10); r++) {
      for (let c = 0; c < 4; c++) {
        const u = (c + 0.5) / 4, x = side * lerp(0.35, 0.55, u), y = lerp(-0.555, -0.505, u) + 0.012;
        const z = lerp(0.24, -0.72, (r + 0.5) / (hi ? 16 : 10));
        if (rng() < 0.25) continue;
        if (rng() < 0.6) put(x, y + 0.012, z, 0.008, 0.03, 0.008, (rng() - 0.5) * 0.9); // 토글
        else put(x, y + 0.004, z, 0.022, 0.016, 0.022); // 노브
      }
    }
  }
  // 화면 둘레 버튼
  for (let i = 0; i < 12; i++) {
    const x = lerp(-mf.halfW + 0.03, mf.halfW - 0.03, i / 11);
    put(x, mf.topY + 0.012, pz(mf.topY) + 0.016, 0.03, 0.012, 0.01);
    put(x, mf.botY - 0.012, pz(mf.botY) + 0.016, 0.03, 0.012, 0.01);
  }
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) put(side * (mf.halfW + 0.045), lerp(mf.topY - 0.03, mf.botY + 0.03, i / 5), pz(-0.53) + 0.014, 0.012, 0.022, 0.01);
  const switchGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const switches = new THREE.InstancedMesh(switchGeo, trimMat, mtx.length);
  mtx.forEach((m, i) => switches.setMatrixAt(i, m));
  switches.frustumCulled = false;
  group.add(switches);

  // ── MFD(대형 화면 3분할, 캔버스 텍스처) ──
  const mfd = createMfd(hi ? 1536 : 1024);
  const screenMat = keep(new THREE.MeshBasicMaterial({ map: mfd.texture, toneMapped: false }));
  screenMat.color.setScalar(1.7); // 블룸에 걸리도록 살짝 밝게
  const SC = new Surf().setUV((x, y, z, u, v) => [u, 1 - v]);
  SC.grid(1, 1, (u, v) => { const y = lerp(mf.topY, mf.botY, v); return [lerp(-mf.halfW, mf.halfW, u), y, pz(y) + 0.006]; }, { ref: [0, -0.5, -3] });
  const screen = mesh(SC, screenMat);
  screen.castShadow = false;
  // 계기판 발광이 주변에 은은하게 번진다
  const glow = new THREE.PointLight(C.screenGlow, 0.5, 1.4, 2);
  glow.position.set(0, -0.5, pn.z + 0.25);
  group.add(glow);

  // ── HUD 유리(콤바이너)와 기호가 맺히는 가상 면 ──
  const glassGeo = keep(new THREE.BufferGeometry());
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute([-h.halfW, h.y0, h.z, h.halfW, h.y0, h.z, h.halfW, h.y1, h.z - 0.035, -h.halfW, h.y0, h.z, h.halfW, h.y1, h.z - 0.035, -h.halfW, h.y1, h.z - 0.035], 3));
  glassGeo.computeVertexNormals();
  const hudGlass = new THREE.Mesh(glassGeo, keep(new THREE.MeshStandardMaterial({ color: 0x9fe8dc, transparent: true, opacity: 0.09, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide })));
  hudGlass.renderOrder = 8;
  group.add(hudGlass);
  const hp = D.hudPlane;
  const half = hp.distance * Math.tan(hp.halfAngle * DEG);
  const hudCanvas = document.createElement('canvas');
  hudCanvas.width = hudCanvas.height = hi ? 1024 : 768;
  const hudTexture = keep(new THREE.CanvasTexture(hudCanvas));
  hudTexture.colorSpace = THREE.SRGBColorSpace;
  const hudPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(half * 2, half * 2)), keep(new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
  hudPlane.material.color.setScalar(1.5);
  hudPlane.position.set(0, 0, -hp.distance);
  hudPlane.renderOrder = 9;
  hudPlane.frustumCulled = false;
  group.add(hudPlane);

  // ── 캐노피 유리 안쪽(흠집·먼지) ──
  const scratch = keep(scratchTexture());
  scratch.repeat.set(3, 2);
  const CG = new Surf().setUV((x, y, z, u, v) => [u, v]);
  CG.grid(n * 2, n, (u, v) => {
    const t = Math.PI * u;
    const zz = lerp(-1.25, 1.1, v);
    const k = Math.sin(Math.PI * Math.min(1, Math.max(0, (zz + 1.5) / 3.2))) * 0.25 + 0.75;
    return [-Math.cos(t) * 0.57, D.sillY + Math.pow(Math.sin(t), 0.82) * 0.93 * k, zz];
  }, { ref: [0, 0, 0], inward: true });
  const canopyGlass = new THREE.Mesh(keep(CG.build()), keep(new THREE.MeshStandardMaterial({ color: 0xbfe2ff, alphaMap: scratch, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.6, envMapIntensity: 0.8, depthWrite: false })));
  canopyGlass.renderOrder = 7;
  canopyGlass.frustumCulled = false;
  group.add(canopyGlass);

  // ── 사출좌석·벨트 ──
  const ST = new Surf();
  const st = D.seat;
  ST.box([0, st.panY, -0.08], [0.46, 0.1, 0.52]);
  ST.box([0, -0.52, st.backZ + 0.03], [0.44, 0.92, 0.1]);
  ST.box([0, 0.06, st.backZ + 0.01], [0.26, 0.22, 0.12]); // 머리받이
  for (const side of [-1, 1]) { ST.box([side * 0.26, -0.72, st.backZ + 0.06], [0.05, 0.86, 0.12]); ST.box([side * 0.25, st.panY + 0.08, -0.06], [0.04, 0.14, 0.5]); }
  mesh(ST, seatMat);
  const BT = new Surf();
  for (const side of [-1, 1]) {
    BT.tube([[side * 0.13, -0.1, st.backZ - 0.03], [side * 0.14, -0.36, 0.06], [side * 0.1, -0.62, -0.04], [side * 0.04, -0.8, -0.1]], 0.02, 5); // 어깨끈
    BT.tube([[side * 0.22, st.panY + 0.1, 0.05], [side * 0.12, -0.84, -0.1], [side * 0.03, -0.81, -0.12]], 0.02, 5); // 허리끈
  }
  mesh(BT, beltMat);
  const WN = new Surf(); // 사출 손잡이(노랑·검정)
  WN.tube([[-0.06, st.panY + 0.06, -0.3], [-0.06, st.panY + 0.16, -0.33], [0.06, st.panY + 0.16, -0.33], [0.06, st.panY + 0.06, -0.3]], 0.014, 6);
  mesh(WN, warnMat);

  // ── 조종간 ──
  const stick = new THREE.Group();
  stick.position.fromArray(D.stick.base);
  const SK = new Surf();
  const Ls = D.stick.length;
  SK.loft(n, 3, (u, v) => { const r = lerp(0.055, 0.02, v); return [Math.cos(u * TAU) * r, v * 0.09, Math.sin(u * TAU) * r]; }); // 고무 덮개
  SK.tube([[0, 0.08, 0], [0, Ls * 0.6, 0]], 0.012, 8);
  SK.tube([[0, Ls * 0.56, 0.004], [0, Ls * 0.8, -0.01], [0.004, Ls, -0.03]], (v) => 0.024 - v * 0.004, n);
  SK.box([0.018, Ls * 0.97, -0.045], [0.02, 0.016, 0.02]);
  mesh(SK, gloveMat, stick);
  const SB = new Surf();
  SB.box([-0.012, Ls * 1.0, -0.02], [0.014, 0.012, 0.014]);
  mesh(SB, warnMat, stick);
  group.add(stick);

  // ── 스로틀(왼쪽 콘솔, 앞뒤로 움직인다) ──
  const throttle = new THREE.Group();
  throttle.position.fromArray(D.throttle.base);
  const TH = new Surf();
  TH.box([0, 0.03, 0], [0.035, 0.06, 0.05]);
  TH.tube([[-0.04, 0.085, 0], [0.04, 0.085, 0]], 0.022, n);
  TH.tube([[-0.04, 0.085, -0.045], [0.04, 0.085, -0.045]], 0.02, n);
  mesh(TH, gloveMat, throttle);
  group.add(throttle);

  // ── 방향 페달 ──
  const pedals = [];
  for (const side of [-1, 1]) {
    const pd = new THREE.Group();
    pd.position.set(side * D.pedals.x, D.pedals.y, D.pedals.z);
    const PD = new Surf();
    PD.box([0, 0, 0], [0.1, 0.16, 0.02]);
    PD.tube([[0, 0.06, 0.01], [0, 0.16, 0.12]], 0.012, 6);
    mesh(PD, trimMat, pd);
    pd.rotation.x = -0.5;
    group.add(pd);
    pedals.push(pd);
  }

  // 조종사의 팔·다리·손은 pilot-rig.js(스켈레톤 + IK)가 맡는다. 여기서는 조종간·스로틀·페달 같은 기계 부분만 움직인다.
  const state = { pitch: 0, turn: 0, power: 0.5 };
  /**
   * @param {object} o pitch(-1~1, +당김), turn(-1~1), power(0~1), dt, time, data(MFD에 보일 값)
   */
  function update(o) {
    state.pitch = damp(state.pitch, o.pitch, 0.07, o.dt);
    state.turn = damp(state.turn, o.turn, 0.07, o.dt);
    state.power = damp(state.power, o.power, 0.3, o.dt);
    stick.rotation.x = state.pitch * D.stick.throw * DEG;
    stick.rotation.z = -state.turn * D.stick.throw * DEG;
    throttle.position.z = D.throttle.base[2] - (state.power - 0.5) * D.throttle.travel;
    pedals[0].position.z = D.pedals.z + state.turn * D.pedals.travel; // 왼발
    pedals[1].position.z = D.pedals.z - state.turn * D.pedals.travel;
    // 오른손은 조종간, 왼손은 스로틀을 잡는다
    mfd.update(o.time, o.dt, o.data);
    glow.intensity = 0.45 + mfd.flicker * 0.1;
  }
  update({ pitch: 0, turn: 0, power: 0.5, dt: 1, time: 0, data: null });

  let triangles = 0;
  group.traverse((o) => { if (o.isMesh) triangles += ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); });

  return {
    group, update, triangles, hi: true, state,
    hudCanvas, hudTexture, hudPlane,
    setStick(pitch, turn, dt) { void pitch; void turn; void dt; }, // update()가 맡는다(낮음 조종석과 인터페이스 맞춤)
    dispose() {
      for (const d of disposables) d.dispose();
      mfd.dispose();
      switches.dispose();
    },
  };
}

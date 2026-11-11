// 기체 텍스처를 캔버스에 그려 만든다(외부 이미지 없음): 색(도색·마킹), 노멀(패널 라인·리벳), 거칠기·금속성.
// 아틀라스 구역(U 방향):  날개류(위에서 본 반쪽, 좌우 공유) | 동체(둘레로 펼침) | 수직면(수직미익·흡입구 옆면) | 민무늬
// 절차 생성을 고른 이유: 저장소에 이미지 파일을 두지 않아도 되고, 해상도·도색을 실행 중에 바꿀 수 있다(DESIGN.md 9장).
import * as THREE from 'three';
import { makeRng } from '../../core/math.js';
import { ORIGIN_S, WING, STAB, FIN } from '../kf21-shape.js';

// 아틀라스 좌표계 -------------------------------------------------------------
export const ATLAS = {
  vScale: 1 / 18, // z(m) → V
  wing: { u0: 0.005, scale: 1 / 22.5 }, // x(0~6m) → U
  body: { u0: 0.29, width: 0.4 }, // 둘레 매개변수 t(0~1) → U
  side: { u0: 0.71, scale: 1 / 20 }, // 수직면의 높이(0~3m) → U
  plain: { u: 0.94 },
};
export const uvWing = (x, y, z) => [ATLAS.wing.u0 + Math.abs(x) * ATLAS.wing.scale, 0.5 + z * ATLAS.vScale];
export const uvBody = (x, y, z, u) => [ATLAS.body.u0 + u * ATLAS.body.width, 0.5 + z * ATLAS.vScale];
export const uvSide = (h, y, z) => [ATLAS.side.u0 + Math.max(0, h) * ATLAS.side.scale, 0.5 + z * ATLAS.vScale];
export const uvSideY = (x, y, z) => [ATLAS.side.u0 + (y + 1.2) * ATLAS.side.scale, 0.5 + z * ATLAS.vScale];
export const uvPlain = (x, y, z) => [ATLAS.plain.u, 0.5 + z * ATLAS.vScale];

// 도색 3종 --------------------------------------------------------------------
export const PAINT_SCHEMES = {
  grey: { base: '#8d959c', panel: ['#8a9299', '#929aa1', '#868e95', '#969ea5'], radome: '#666d74', edge: '#646b72', mark: '#3c434a', lowvis: false, camo: null, tint: 0xffffff },
  dark: { base: '#565d64', panel: ['#535a61', '#5a6168', '#50575e', '#5e656c'], radome: '#3d4349', edge: '#3a4046', mark: '#aab2b9', lowvis: true, camo: null, tint: 0x9aa0a6 },
  urban: { base: '#868d93', panel: ['#868d93', '#8b9298'], radome: '#5d646a', edge: '#5a6167', mark: '#2f353b', lowvis: false, camo: ['#5c646c', '#a3aab0', '#3f464d'], tint: 0xb9c4cc },
};

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/** 미터 좌표 → 캔버스 픽셀 */
function mapper(size) {
  const py = (z) => (1 - (0.5 + z * ATLAS.vScale)) * size;
  return {
    size,
    py,
    ps: (s) => py(s - ORIGIN_S), // 기수에서 잰 거리
    wingX: (x) => (ATLAS.wing.u0 + x * ATLAS.wing.scale) * size,
    bodyX: (t) => (ATLAS.body.u0 + t * ATLAS.body.width) * size,
    sideX: (h) => (ATLAS.side.u0 + h * ATLAS.side.scale) * size,
    mPerPx: 1 / (ATLAS.vScale * size),
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const along = (a, b, span) => { const u = (span - a.span) / (b.span - a.span); return { le: lerp(a.le, b.le, u), te: lerp(a.te, b.te, u) }; };

/** 패널 라인 목록(색·노멀·거칠기 캔버스가 같은 선을 쓴다): [x0,y0,x1,y1] 픽셀 */
function panelLines(M) {
  const L = [];
  const add = (x0, y0, x1, y1) => L.push([x0, y0, x1, y1]);
  // 동체: 프레임(둘레 방향)과 세로 이음(길이 방향)
  const frames = [0.9, 1.7, 2.6, 3.4, 4.3, 5.2, 6.1, 7.0, 7.8, 8.7, 9.6, 10.5, 11.4, 12.3, 13.2, 14.0, 14.8];
  for (const s of frames) add(M.bodyX(0), M.ps(s), M.bodyX(1), M.ps(s));
  for (const t of [0.06, 0.14, 0.25, 0.36, 0.44, 0.56, 0.64, 0.75, 0.86, 0.94]) add(M.bodyX(t), M.ps(2.6), M.bodyX(t), M.ps(15.3));
  // 하부 무장창 윤곽(동체 아랫면: t = 0 부근과 1 부근이 아래쪽 중심선)
  for (const [t0, t1] of [[0.015, 0.1], [0.9, 0.985]]) {
    add(M.bodyX(t0), M.ps(8.2), M.bodyX(t1), M.ps(8.2)); add(M.bodyX(t0), M.ps(12.0), M.bodyX(t1), M.ps(12.0));
    add(M.bodyX(t0), M.ps(8.2), M.bodyX(t0), M.ps(12.0)); add(M.bodyX(t1), M.ps(8.2), M.bodyX(t1), M.ps(12.0));
  }
  // 주익·수평미익: 스팬 방향 스파 선과 코드 방향 리브 선
  for (const W of [WING, STAB]) {
    for (const c of [0.12, 0.3, 0.5, 0.74]) {
      const z0 = lerp(W.root.le, W.root.te, c), z1 = lerp(W.tip.le, W.tip.te, c);
      add(M.wingX(W.root.span), M.ps(z0), M.wingX(W.tip.span), M.ps(z1));
    }
    const n = W === WING ? 7 : 4;
    for (let i = 1; i < n; i++) {
      const span = lerp(W.root.span, W.tip.span, i / n);
      const st = along(W.root, W.tip, span);
      add(M.wingX(span), M.ps(st.le), M.wingX(span), M.ps(st.te));
    }
  }
  // 수직미익
  for (const c of [0.15, 0.4, 0.7]) add(M.sideX(0), M.ps(lerp(FIN.root.le, FIN.root.te, c)), M.sideX(FIN.tip.span), M.ps(lerp(FIN.tip.le, FIN.tip.te, c)));
  for (const h of [0.7, 1.4, 2.1]) { const st = along(FIN.root, FIN.tip, h); add(M.sideX(h), M.ps(st.le), M.sideX(h), M.ps(st.te)); }
  // 흡입구 옆면(수직면 영역을 같이 쓴다)
  for (const s of [5.9, 6.6, 7.3]) add(M.sideX(0.3), M.ps(s), M.sideX(1.6), M.ps(s));
  return L;
}

function strokeLines(g, lines, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  for (const [x0, y0, x1, y1] of lines) { g.moveTo(x0, y0); g.lineTo(x1, y1); }
  g.stroke();
}

function rivets(g, lines, spacing, r, color) {
  g.fillStyle = color;
  for (const [x0, y0, x1, y1] of lines) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let d = spacing / 2; d < len; d += spacing) {
      for (const side of [-1, 1]) {
        const x = x0 + ((x1 - x0) * d) / len + nx * side * r * 3.2, y = y0 + ((y1 - y0) * d) / len + ny * side * r * 3.2;
        g.fillRect(x - r / 2, y - r / 2, r, r);
      }
    }
  }
}

/** 태극 원형 표식 */
function roundel(g, x, y, r, lowvis, mark) {
  g.save();
  g.translate(x, y);
  if (lowvis) {
    g.strokeStyle = mark; g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(-r / 2, 0, r / 2, 0, Math.PI, true); g.arc(r / 2, 0, r / 2, Math.PI, 0, false); g.stroke();
  } else {
    g.fillStyle = '#f2f3f4'; g.beginPath(); g.arc(0, 0, r * 1.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8323a'; g.beginPath(); g.arc(0, 0, r, Math.PI, 0, false); g.arc(r / 2, 0, r / 2, 0, Math.PI, false); g.arc(-r / 2, 0, r / 2, 0, Math.PI, true); g.fill();
    g.fillStyle = '#2c4a9a'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI, false); g.arc(-r / 2, 0, r / 2, Math.PI, 0, false); g.arc(r / 2, 0, r / 2, Math.PI, 0, true); g.fill();
  }
  g.restore();
}

/** 동체 옆면에 글자를 쓴다. 좌우 어느 쪽에서 봐도 바로 읽히도록 방향을 맞춘다. side: 1 오른쪽, -1 왼쪽 */
function bodyText(g, M, side, s, t, text, px, color, weight = 700) {
  g.save();
  g.translate(M.bodyX(t), M.ps(s));
  // 캔버스의 +y는 기체 뒤쪽. 글자는 기수 방향이 글의 진행 방향이 되게 세로로 눕힌다.
  g.rotate(side > 0 ? -Math.PI / 2 : Math.PI / 2);
  if (side > 0) g.scale(-1, 1); // 오른쪽 면은 펼친 방향이 반대라 글자를 뒤집어야 바로 읽힌다
  g.fillStyle = color;
  g.font = `${weight} ${px}px "Arial Narrow", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

function drawColor(c, scheme, seed) {
  const size = c.width;
  const g = c.getContext('2d');
  const M = mapper(size);
  const rng = makeRng(seed);
  const px = (m) => m / M.mPerPx;
  g.fillStyle = scheme.base;
  g.fillRect(0, 0, size, size);

  // 위장 무늬(도심 위장): 각진 얼룩
  if (scheme.camo) {
    for (let i = 0; i < 150; i++) {
      g.fillStyle = scheme.camo[i % scheme.camo.length];
      const x = rng() * size * 0.9, y = rng() * size, r = px(0.35 + rng() * 0.9);
      g.beginPath();
      const n = 4 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rng() * 0.6; const rr = r * (0.6 + rng() * 0.6); g.lineTo(x + Math.cos(a) * rr * 1.5, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
  } else {
    // 패널마다 미세한 명도 차이
    for (let i = 0; i < 260; i++) {
      g.fillStyle = scheme.panel[Math.floor(rng() * scheme.panel.length)];
      g.globalAlpha = 0.55;
      g.fillRect(rng() * size * 0.9, rng() * size, px(0.3 + rng() * 1.1), px(0.4 + rng() * 1.4));
    }
    g.globalAlpha = 1;
  }

  // 레이돔(동체 앞쪽)과 앞전 띠
  g.fillStyle = scheme.radome;
  g.fillRect(M.bodyX(0), M.ps(2.55), M.bodyX(1) - M.bodyX(0), M.ps(0) - M.ps(2.55) + px(0.5));
  g.fillStyle = scheme.edge;
  for (const W of [WING, STAB]) {
    g.beginPath();
    g.moveTo(M.wingX(W.root.span), M.ps(W.root.le)); g.lineTo(M.wingX(W.tip.span), M.ps(W.tip.le));
    g.lineTo(M.wingX(W.tip.span), M.ps(W.tip.le + 0.16)); g.lineTo(M.wingX(W.root.span), M.ps(W.root.le + 0.3));
    g.closePath(); g.fill();
  }
  g.beginPath();
  g.moveTo(M.sideX(0), M.ps(FIN.root.le)); g.lineTo(M.sideX(FIN.tip.span), M.ps(FIN.tip.le)); g.lineTo(M.sideX(FIN.tip.span), M.ps(FIN.tip.le + 0.14)); g.lineTo(M.sideX(0), M.ps(FIN.root.le + 0.28));
  g.closePath(); g.fill();
  // 수직미익 끝 띠
  g.fillRect(M.sideX(FIN.tip.span - 0.28), M.ps(FIN.tip.te + 0.3), M.sideX(FIN.tip.span) - M.sideX(FIN.tip.span - 0.28) + 4, M.ps(FIN.tip.le - 0.6) - M.ps(FIN.tip.te + 0.3));

  // 조종석 바닥(캐노피 아래로 들여다보이는 부분): 동체 윗면 중심 t = 0.5
  g.fillStyle = '#16191d';
  g.beginPath();
  g.ellipse(M.bodyX(0.5), M.ps(5.45), (M.bodyX(0.585) - M.bodyX(0.5)), (M.ps(3.95) - M.ps(6.95)) / 2, 0, 0, Math.PI * 2);
  g.fill();

  // 얼룩·물 자국(비행 방향으로 길게)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.03)';
    g.fillRect(rng() * size * 0.9, rng() * size, 1 + rng() * 3, px(0.2 + rng() * 1.2));
  }

  // 패널 라인(색에도 살짝 어둡게)
  const lines = panelLines(M);
  strokeLines(g, lines, Math.max(1, size / 2048), 'rgba(20,24,28,0.5)');

  // ── 마킹 ──
  const mark = scheme.mark;
  // 주익 태극
  const ws = along(WING.root, WING.tip, 3.55);
  roundel(g, M.wingX(3.55), M.ps(lerp(ws.le, ws.te, 0.5)), px(0.42), scheme.lowvis, mark);
  // 동체 옆 태극(흡입구 뒤) + 기체 번호 + 공군 표기
  for (const side of [1, -1]) {
    const t = side > 0 ? 0.3 : 0.7; // 옆면 위쪽
    roundel(g, M.bodyX(t), M.ps(8.6), px(0.34), scheme.lowvis, mark);
    bodyText(g, M, side, 3.1, side > 0 ? 0.32 : 0.68, '001', px(0.36), mark);
    bodyText(g, M, side, 10.4, t, 'ROKAF', px(0.3), mark, 700);
    bodyText(g, M, side, 12.1, t, 'KF-21', px(0.2), mark, 600);
    bodyText(g, M, side, 13.3, t, '21-001', px(0.16), mark, 600);
    // 경고 문구·스텐실
    bodyText(g, M, side, 5.55, side > 0 ? 0.27 : 0.73, 'DANGER  INTAKE', px(0.085), '#b3262c', 700);
    bodyText(g, M, side, 4.6, side > 0 ? 0.36 : 0.64, 'RESCUE', px(0.09), '#c9a227', 700);
    bodyText(g, M, side, 14.3, t, 'NO PUSH', px(0.075), mark, 600);
    // 구조 화살표
    g.fillStyle = '#c9a227';
    const ax = M.bodyX(side > 0 ? 0.385 : 0.615), ay = M.ps(4.95);
    g.beginPath(); g.moveTo(ax, ay - px(0.14)); g.lineTo(ax + px(0.07), ay + px(0.1)); g.lineTo(ax - px(0.07), ay + px(0.1)); g.closePath(); g.fill();
  }
  // 주익 윗면 보행 금지선·문구
  g.strokeStyle = mark; g.lineWidth = Math.max(1, px(0.025)); g.setLineDash([px(0.12), px(0.08)]);
  const f0 = along(WING.root, WING.tip, 2.0), f1 = along(WING.root, WING.tip, 4.85);
  g.beginPath(); g.moveTo(M.wingX(2.0), M.ps(lerp(f0.le, f0.te, 0.7))); g.lineTo(M.wingX(4.85), M.ps(lerp(f1.le, f1.te, 0.7))); g.stroke();
  g.setLineDash([]);
  g.save(); g.translate(M.wingX(2.9), M.ps(11.6)); g.rotate(-0.2); g.fillStyle = mark; g.font = `600 ${px(0.11)}px Arial, sans-serif`; g.textAlign = 'center'; g.fillText('NO STEP', 0, 0); g.restore();
  // 수직미익: 부대 띠와 번호
  g.fillStyle = scheme.lowvis ? mark : '#2c4a9a';
  g.fillRect(M.sideX(1.75), M.ps(13.95), M.sideX(1.9) - M.sideX(1.75), M.ps(12.75) - M.ps(13.95));
  // (수직미익은 안팎 면이 같은 그림을 쓰므로 글자 대신 좌우 대칭인 표식만 넣는다)
  g.strokeStyle = mark; g.lineWidth = Math.max(1, px(0.03));
  g.beginPath(); g.moveTo(M.sideX(1.05), M.ps(13.25)); g.lineTo(M.sideX(1.3), M.ps(13.55)); g.lineTo(M.sideX(1.05), M.ps(13.85)); g.lineTo(M.sideX(0.8), M.ps(13.55)); g.closePath(); g.stroke();
  // 민무늬 영역: 금속 부품용 중간 회색
  g.fillStyle = '#7b8288';
  g.fillRect(size * 0.9, 0, size * 0.1, size);
}

function drawHeight(c) {
  const size = c.width;
  const g = c.getContext('2d');
  const M = mapper(size);
  const k = size / 2048;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const lines = panelLines(M);
  strokeLines(g, lines, 2.2 * k, '#404040'); // 홈
  rivets(g, lines, 9 * k, 1.6 * k, '#989898'); // 살짝 솟은 리벳
  return g;
}

function drawRoughness(c, seed) {
  const size = c.width;
  const g = c.getContext('2d');
  const M = mapper(size);
  const rng = makeRng(seed);
  // G = 거칠기, B = 금속성
  g.fillStyle = 'rgb(0,150,62)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i++) {
    const r = 128 + Math.floor(rng() * 44);
    g.fillStyle = `rgba(0,${r},70,0.5)`;
    g.fillRect(rng() * size, rng() * size, (0.4 + rng()) / M.mPerPx, (0.5 + rng() * 1.5) / M.mPerPx);
  }
  strokeLines(g, panelLines(M), 2 * (size / 2048), 'rgb(0,190,40)');
  g.fillStyle = 'rgb(0,96,200)'; // 민무늬(금속 부품)
  g.fillRect(size * 0.9, 0, size * 0.1, size);
}

/** 높이 캔버스 → 노멀맵 캔버스(소벨) */
function heightToNormal(src, strength) {
  const size = src.width;
  const sg = src.getContext('2d');
  const data = sg.getImageData(0, 0, size, size).data;
  const out = makeCanvas(size);
  const og = out.getContext('2d');
  const img = og.createImageData(size, size);
  const o = img.data;
  const H = (x, y) => data[(((y + size) % size) * size + ((x + size) % size)) * 4];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      o[i] = (-dx * inv * 0.5 + 0.5) * 255;
      o[i + 1] = (dy * inv * 0.5 + 0.5) * 255; // 캔버스 y는 아래쪽 → V는 위쪽
      o[i + 2] = (inv * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

/**
 * @param {number} size 한 변 픽셀(2048 또는 4096)
 * @param {string} paint 'grey' | 'dark' | 'urban'
 * @param {number} anisotropy
 */
export function createAircraftTextures(size, paint, anisotropy = 8) {
  const colorCanvas = makeCanvas(size);
  drawColor(colorCanvas, PAINT_SCHEMES[paint] || PAINT_SCHEMES.grey, 11);
  const normalSize = Math.min(size, 2048); // 노멀은 2048이면 충분(생성 시간 절약)
  const heightCanvas = makeCanvas(normalSize);
  drawHeight(heightCanvas);
  const normalCanvas = heightToNormal(heightCanvas, 0.035);
  const roughCanvas = makeCanvas(Math.min(size, 1024));
  drawRoughness(roughCanvas, 23);

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const set = { map: tex(colorCanvas, true), normalMap: tex(normalCanvas, false), ormMap: tex(roughCanvas, false), colorCanvas, paint };
  /** 도색만 바꾼다(색 캔버스를 다시 그린다). */
  set.setPaint = (id) => {
    set.paint = id;
    drawColor(colorCanvas, PAINT_SCHEMES[id] || PAINT_SCHEMES.grey, 11);
    set.map.needsUpdate = true;
  };
  set.dispose = () => { set.map.dispose(); set.normalMap.dispose(); set.ormMap.dispose(); };
  return set;
}

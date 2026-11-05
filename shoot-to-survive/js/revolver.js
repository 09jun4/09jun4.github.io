import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────
// Smith & Wesson Model 500 (8-3/8") — 하이폴리 외관 모델 (이 무기만 고해상도)
// 좌표(m): 총구 = -z, 위 = +y, 오른쪽 = +x. 전체 길이 약 0.42m.
// 윤곽은 둥근 다각형/스플라인을 베벨 압출, 원통부는 Lathe·Cylinder, 질감은 캔버스로 생성.
// ─────────────────────────────────────────────────────────────
const R_CYL = 0.039, CYL_LEN = 0.1, CHAMBER_R = 0.0255, BARREL_R = 0.0165, BORE_Y = CHAMBER_R;
const TAU = Math.PI * 2;

// ── 지오메트리 도구 ──
function uvScale(g, su, sv, swap = false) {
  const uv = g.attributes.uv; if (!uv) return g;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    swap ? uv.setXY(i, v * su, u * sv) : uv.setXY(i, u * su, v * sv);
  }
  return g;
}
// 모서리가 둥근 다각형 (z,y)
function rounded(pts, r) {
  const sh = new THREE.Shape(), n = pts.length;
  const rad = (i) => (Array.isArray(r) ? r[i] : r);
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const d1 = Math.hypot(p[0] - a[0], p[1] - a[1]), d2 = Math.hypot(p[0] - b[0], p[1] - b[1]);
    const t1 = Math.min(rad(i) / d1, 0.5), t2 = Math.min(rad(i) / d2, 0.5);
    const s = [p[0] + (a[0] - p[0]) * t1, p[1] + (a[1] - p[1]) * t1], e = [p[0] + (b[0] - p[0]) * t2, p[1] + (b[1] - p[1]) * t2];
    i === 0 ? sh.moveTo(s[0], s[1]) : sh.lineTo(s[0], s[1]);
    sh.quadraticCurveTo(p[0], p[1], e[0], e[1]);
  }
  sh.closePath();
  return sh;
}
const spline = (pts, n = 40, closed = false) => new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(n);
const polyShape = (pts) => new THREE.Shape(pts.map((p) => (p.isVector2 ? p : new THREE.Vector2(p[0], p[1]))));
function ellipsePts(cz, cy, rz, ry, n = 64) { return Array.from({ length: n }, (_, i) => [cz + Math.cos(i / n * TAU) * rz, cy + Math.sin(i / n * TAU) * ry]); }

// (z,y) 윤곽을 x 방향으로 압출 (x 중심, 베벨 + 부드러운 법선)
function ext(shape, width, { bevel = 0.003, seg = 3, curve = 32, crease = 0.75, uv = 45, inset = false } = {}) {
  let g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: inset ? -bevel : 0, bevelSegments: seg, curveSegments: curve });
  g.translate(0, 0, -width / 2);
  uvScale(g, uv, uv);
  g.rotateY(-Math.PI / 2);
  return toCreasedNormals(g, crease);
}
// z축 원기둥 (z0 → z1)
function cylZ(r, z0, z1, { seg = 48, open = false, r1 = r, start = 0, len = TAU, uv = [10, 4] } = {}) {
  const g = new THREE.CylinderGeometry(r1, r, Math.abs(z1 - z0), seg, 1, open, start, len);
  g.rotateX(Math.PI / 2); g.translate(0, 0, (z0 + z1) / 2);
  return uvScale(g, uv[0], uv[1], true);
}

// ── 캔버스 텍스처 ──
function tex(w, h, draw, { repeat = true, srgb = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const brushedTex = () => tex(512, 512, (x, w, h) => { // 브러시드 메탈: 가로 결
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 3600; i++) {
    const g = 110 + rnd() * 120 | 0, y = rnd() * h, x0 = rnd() * w, l = 30 + rnd() * 220;
    x.strokeStyle = `rgba(${g},${g},${g},${0.12 + rnd() * 0.25})`; x.lineWidth = 0.6 + rnd();
    x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + l, y + (rnd() - 0.5) * 0.8); x.stroke();
  }
});
const stippleTex = () => tex(256, 256, (x, w, h) => { // 고무 스티플
  x.fillStyle = '#707070'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 5200; i++) { const g = rnd() < 0.5 ? 40 + rnd() * 50 : 150 + rnd() * 90; x.fillStyle = `rgb(${g | 0},${g | 0},${g | 0})`; x.beginPath(); x.arc(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 0, TAU); x.fill(); }
});
const checkerTex = () => tex(64, 64, (x, w, h) => { // 다이아몬드 체커링 (범프용)
  x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, w, h); x.strokeStyle = '#202020'; x.lineWidth = 3;
  for (let i = -h; i < w + h; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); }
});
const textTex = (text, w, h, size, color = '#4d5158', weight = 'bold') => tex(w, h, (x) => {
  x.clearRect(0, 0, w, h); x.fillStyle = color; x.font = `${weight} ${size}px "Arial Narrow", Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 1);
}, { repeat: false, srgb: true });
const medallionTex = () => tex(128, 128, (x) => {
  x.clearRect(0, 0, 128, 128); x.strokeStyle = '#5b6068'; x.fillStyle = '#5b6068';
  x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 56, 0, TAU); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 44, 0, TAU); x.stroke();
  x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('S&W', 64, 66);
}, { repeat: false, srgb: true });

// 탄(.500 S&W) — 재장전 연출·탄피 배출에 사용
export function createCasingGeometry() {
  const pts = [[0, 0.016], [0.0072, 0.016], [0.0072, 0.0146], [0.0062, 0.0146], [0.0062, 0.0132], [0.0068, 0.0124], [0.0069, -0.012], [0.0064, -0.0128], [0, -0.0128]]
    .map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts.reverse(), 8); g.rotateX(Math.PI / 2); return g;
}
function createBulletTip() {
  const pts = [[0, -0.0124], [0.0064, -0.0124], [0.0064, -0.027], [0.0048, -0.0305], [0, -0.0305]].map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts.reverse(), 8); g.rotateX(Math.PI / 2); return g;
}

export function createRevolver() {
  const root = new THREE.Group();
  const brushed = brushedTex(), stipple = stippleTex(), checker = checkerTex();
  brushed.repeat.set(1, 1);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.5, roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.35, envMapIntensity: 1.25 });
  const steelSoft = steel.clone(); steelSoft.roughness = 0.62; steelSoft.color.set(0xb9bdc3);
  const checkerSteel = new THREE.MeshStandardMaterial({ color: 0xc4c8cd, metalness: 1, roughness: 0.55, bumpMap: checker, bumpScale: 1.3, envMapIntensity: 1.1 });
  const blackOx = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, metalness: 0.6, roughness: 0.55, envMapIntensity: 0.7 });
  const abyss = new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.BackSide });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x08090a, metalness: 0, roughness: 0.95, bumpMap: stipple, bumpScale: 1.6, envMapIntensity: 0.25 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd3a93f, metalness: 1, roughness: 0.28, envMapIntensity: 1.3 });
  const lead = new THREE.MeshStandardMaterial({ color: 0x8c8f94, metalness: 0.7, roughness: 0.4 });
  const fiber = new THREE.MeshStandardMaterial({ color: 0xff3b1c, emissive: 0xff2a10, emissiveIntensity: 1.2, roughness: 0.3 });
  const M = (geo, mat, parent = root, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const decal = (map, w, h, x, y, z, side) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = side * Math.PI / 2; root.add(m); return m;
  };
  const screw = (x, y, z, side, r = 0.0042, parent = root) => { // 슬롯 나사
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const head = new THREE.CylinderGeometry(r, r * 1.05, 0.0022, 24); head.rotateZ(Math.PI / 2);
    M(head, steelSoft, g); const slot = new THREE.BoxGeometry(0.0026, r * 1.7, 0.0008);
    const s = M(slot, blackOx, g, side * 0.0012); s.rotation.x = rnd() * 3;
    return g;
  };

  // ── 프레임 ──
  const frameMat = steel;
  M(ext(rounded([[0.012, 0.045], [0.058, 0.045], [0.069, 0.040], [0.085, 0.034], [0.091, 0.021], [0.087, -0.008], [0.079, -0.030], [0.058, -0.047], [0.016, -0.047], [0.012, -0.02]], 0.007), 0.028, { bevel: 0.0028 }), frameMat);   // 뒤쪽 브리치(리코일 실드·탱)
  M(ext(rounded([[-0.095, 0.0405], [-0.095, 0.0475], [0.018, 0.0475], [0.018, 0.0405]], 0.003), 0.019, { bevel: 0.0022 }), frameMat);               // 실린더 위 상단 스트랩
  M(ext(rounded([[-0.094, -0.040], [-0.094, 0.0475], [-0.079, 0.0475], [-0.079, -0.040]], 0.005), 0.022, { bevel: 0.0022 }), frameMat);            // 요크(실린더 앞 프레임)
  M(ext(rounded([[-0.082, -0.054], [-0.082, -0.0405], [0.034, -0.0405], [0.034, -0.054]], 0.0045), 0.019, { bevel: 0.0022 }), frameMat);          // 실린더 아래 프레임
  // 나사 (좌·우 사이드 플레이트)
  for (const [z, y] of [[0.026, 0.034], [0.082, 0.012], [0.052, -0.036]]) { screw(-0.0165, y, z, -1); screw(0.0165, y, z, 1); }
  // 실린더 래치(좌측 체커 엄지 조각) — 재장전 시 앞으로 눌림
  const latch = new THREE.Group(); latch.position.set(-0.0182, 0.014, 0.034); root.add(latch);
  M(ext(rounded([[-0.008, -0.006], [-0.008, 0.0065], [0.008, 0.0065], [0.0095, -0.006]], 0.003), 0.0042, { bevel: 0.0015, uv: 260 }), checkerSteel, latch);
  const latchRest = 0.034;
  decal(medallionTex(), 0.017, 0.017, -0.0162, -0.014, 0.052, -1);
  decal(textTex('500', 192, 80, 66), 0.034, 0.0142, 0.0162, -0.006, 0.038, 1);
  decal(textTex('MODEL 500', 256, 40, 28, '#4d5158', 'normal'), 0.03, 0.0046, 0.0162, 0.0215, 0.04, 1);

  // ── 배럴 ──
  M(cylZ(BARREL_R, -0.296, -0.075, { seg: 80, uv: [12, 6] }), steel, root, 0, BORE_Y, 0);
  M(cylZ(BARREL_R, -0.122, -0.076, { seg: 80, r1: 0.0215 }), steel, root, 0, BORE_Y, 0);                    // 프레임→총열 테이퍼 칼라
    { // 가는 상단 리브(평면 플랫)
    const r = new THREE.BoxGeometry(0.0055, 0.0014, 0.25); uvScale(r, 6, 6); M(r, steelSoft, root, 0, BORE_Y + BARREL_R - 0.0003, -0.2);
  }
  // 풀 언더러그 (끝이 비스듬히 마무리)
  M(ext(rounded([[-0.078, 0.008], [-0.078, -0.020], [-0.128, -0.0175], [-0.168, 0.0], [-0.168, 0.011], [-0.078, 0.011]], [0.003, 0.005, 0.008, 0.006, 0.003, 0.003]), 0.010, { bevel: 0.0022, seg: 4 }), steel);
  // 제동구: 앞뒤 솔리드 링 + 사이 3개 측면 포트(위·아래 아치만 남김)
  const brakeZ = [-0.3485, -0.296], portC = [-0.3125, -0.3265, -0.3405], pw = 0.0078;
  const bz = brakeZ[1];
  M(cylZ(0.0155, brakeZ[0], brakeZ[1], { seg: 40 }), abyss, root, 0, BORE_Y, 0);                       // 포트 안쪽 어둠
  M(cylZ(0.0155, brakeZ[0], brakeZ[1], { seg: 40 }), blackOx, root, 0, BORE_Y, 0);
  const edges = [brakeZ[1], ...portC.flatMap((c) => [c + pw / 2, c - pw / 2]), brakeZ[0]]; // 뒤→앞
  for (let i = 0; i < edges.length - 1; i += 2) { // 솔리드 구간(i: 닫힘)
    M(cylZ(0.0188, edges[i + 1], edges[i], { seg: 64 }), steel, root, 0, BORE_Y, 0);
  }
  for (const c of portC) for (const st of [Math.PI - 1.05, -1.05]) { // 포트 구간: 위/아래 아치
    const g = cylZ(0.0188, c - pw / 2, c + pw / 2, { seg: 20, open: true, start: st, len: 2.1 });
    M(g, new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.5, side: THREE.DoubleSide, roughnessMap: brushed, envMapIntensity: 1.2 }), root, 0, BORE_Y, 0);
  }
  { // 총구 크라운
    const pts = [[0.0085, -0.35], [0.0150, -0.35], [0.0178, -0.3492], [0.0188, -0.3475]].map(([r, z]) => new THREE.Vector2(r, z));
    const g = new THREE.LatheGeometry(pts.reverse(), 64); g.rotateX(Math.PI / 2); M(g, steel, root, 0, BORE_Y, 0);
    const bore = new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 32, 1, true); bore.rotateX(Math.PI / 2); M(bore, abyss, root, 0, BORE_Y, -0.344);
  }
  // 앞 가늠자(램프 + 붉은 파이버)
  M(ext(rounded([[-0.348, 0.0], [-0.348, 0.0095], [-0.343, 0.0132], [-0.332, 0.0132], [-0.318, 0.0], ], 0.0015), 0.0065, { bevel: 0.001, seg: 2 }), blackOx, root, 0, BORE_Y + 0.0172, 0);
  { const f = cylZ(0.0023, -0.3465, -0.3365, { seg: 16 }); M(f, fiber, root, 0, BORE_Y + 0.0172 + 0.0128, 0.0); }
  // 배럴 각인
  decal(textTex('SMITH & WESSON', 512, 40, 30), 0.07, 0.005, BARREL_R + 0.0004, BORE_Y, -0.19, 1);
  decal(textTex('.500 S&W MAGNUM', 512, 40, 30), 0.07, 0.005, -BARREL_R - 0.0004, BORE_Y, -0.19, -1);

  // ── 뒤 가늠자 (검정 조절식) ──
  { const s = new THREE.Shape(); // x-y 윤곽 (노치 포함)
    s.moveTo(-0.0115, 0); s.lineTo(0.0115, 0); s.lineTo(0.0115, 0.0155); s.lineTo(0.0052, 0.0155); s.lineTo(0.0052, 0.0075); s.lineTo(-0.0052, 0.0075); s.lineTo(-0.0052, 0.0155); s.lineTo(-0.0115, 0.0155); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2 });
    M(toCreasedNormals(g, 0.8), blackOx, root, 0, 0.0465, 0.052);
    const white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    for (const sx of [-1, 1]) M(new THREE.BoxGeometry(0.0016, 0.0085, 0.0004), white, root, sx * 0.0072, 0.0465 + 0.0105, 0.0589);
    M(ext(rounded([[0.0, 0.0], [0.0, 0.0065], [0.03, 0.0065], [0.034, 0.0], ], 0.002), 0.024, { bevel: 0.0012, seg: 2 }), blackOx, root, 0, 0.0435, 0.032);
    const sc = new THREE.CylinderGeometry(0.0034, 0.0034, 0.0035, 20); sc.rotateZ(Math.PI / 2); M(sc, steelSoft, root, 0.0125, 0.0515, 0.055);
  }

  // ── 스윙아웃 실린더 ──
  const swing = new THREE.Group(); swing.position.set(-0.034, -0.034, -0.0375); root.add(swing);
  M(cylZ(0.0042, -0.05, 0.0, { seg: 20 }), steel, swing);                                              // 크레인 로드
  M(cylZ(0.0075, -0.058, -0.044, { seg: 20 }), steel, swing);                                               // 크레인 요크 부시
  const cylPivot = new THREE.Group(); cylPivot.position.set(0.034, 0.034, 0); swing.add(cylPivot);
  const half = CYL_LEN / 2, band = 0.0125, midLen = CYL_LEN - band * 2, HR = 0.0085;
  const chamberPos = Array.from({ length: 5 }, (_, i) => { const a = Math.PI / 2 + i * TAU / 5; return [Math.cos(a) * CHAMBER_R, Math.sin(a) * CHAMBER_R]; });
  const withHoles = (sh, r = HR, center = 0.0056) => {
    for (const [x, y] of chamberPos) { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, true); sh.holes.push(p); }
    const c = new THREE.Path(); c.absarc(0, 0, center, 0, TAU, true); sh.holes.push(c); return sh;
  };
  for (const zc of [half - band / 2, -half + band / 2]) { // 앞·뒤 밴드(구멍 뚫림, 베벨)
    const sh = new THREE.Shape(); sh.absarc(0, 0, R_CYL - 0.0012, 0, TAU, false);
    let g = new THREE.ExtrudeGeometry(withHoles(sh), { depth: band - 0.0024, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 3, curveSegments: 64 });
    g.translate(0, 0, zc - (band - 0.0024) / 2); uvScale(g, 40, 40); M(toCreasedNormals(g, 0.8), steel, cylPivot);
  }
  { // 플루트(홈)가 파인 중간부
    const pts = [], N = 360, depth = 0.0045, wid = 15 * Math.PI / 180;
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU; let r = R_CYL, dmin = 9;
      for (let k = 0; k < 5; k++) { const c = Math.PI / 2 + Math.PI / 5 + k * TAU / 5; dmin = Math.min(dmin, Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)))); }
      if (dmin < wid) r -= depth * (0.5 + 0.5 * Math.cos(Math.PI * dmin / wid));
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    let g = new THREE.ExtrudeGeometry(withHoles(new THREE.Shape(pts)), { depth: midLen, bevelEnabled: false, curveSegments: 48 });
    g.translate(0, 0, -midLen / 2); uvScale(g, 45, 45); M(toCreasedNormals(g, 0.7), steel, cylPivot);
  }
  for (const [x, y] of chamberPos) { // 챔버 내부 어둠
    const t = new THREE.CylinderGeometry(HR - 0.0002, HR - 0.0002, CYL_LEN - 0.001, 24, 1, true); t.rotateX(Math.PI / 2); M(t, abyss, cylPivot, x, y, 0);
  }
  { // 이젝터 스타 + 센터 핀
    const s = []; const n = 20; for (let i = 0; i < n; i++) { const r = i % 2 ? 0.0078 : 0.0138, a = i / n * TAU + Math.PI / 2; s.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    let g = new THREE.ExtrudeGeometry(polyShape(s), { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1 });
    g.translate(0, 0, half + 0.0004); M(toCreasedNormals(g, 0.6), steelSoft, cylPivot);
    M(cylZ(0.0045, -half - 0.003, half + 0.008, { seg: 20 }), steelSoft, cylPivot);
    M(cylZ(0.0058, -half - 0.003, -half - 0.0005, { seg: 20 }), steelSoft, cylPivot);
  }
  // 챔버 속 총알 5개 (8각 원통 로우폴리) — 상태: 'live'(실탄) | 'spent'(빈 탄피) | null(비어 있음)
  const roundGeo = createCasingGeometry(), tipGeo = createBulletTip();
  const primerGeo = new THREE.CylinderGeometry(0.0034, 0.0034, 0.0012, 8); primerGeo.rotateX(Math.PI / 2);
  const primerLive = new THREE.MeshStandardMaterial({ color: 0xc2c6cb, metalness: 1, roughness: 0.35 });
  const primerSpent = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, metalness: 0.6, roughness: 0.6 });
  const makeRound = (state) => {
    const g = new THREE.Group();
    M(roundGeo, brass, g);
    if (state === 'live') M(tipGeo, lead, g);
    M(primerGeo, state === 'live' ? primerLive : primerSpent, g, 0, 0, 0.0165);
    return g;
  };
  const rounds = chamberPos.map(([x, y]) => { const holder = new THREE.Group(); holder.position.set(x, y, half - 0.0166); cylPivot.add(holder); holder.visible = false; return holder; });
  const setRound = (i, state) => {
    const h = rounds[i]; while (h.children.length) h.remove(h.children[0]);
    h.visible = !!state; if (state) { const r = makeRound(state); while (r.children.length) h.add(r.children[0]); }
  };
  // 재장전용 탄
  const bullet = new THREE.Group(); M(createCasingGeometry(), brass, bullet); M(createBulletTip(), lead, bullet);
  bullet.visible = false; swing.add(bullet);
  const loadPoint = new THREE.Vector3(0.034, 0.034 + CHAMBER_R, half);

  // ── 해머 (스테인리스 + 체커링 스퍼) ──
  const hammer = new THREE.Group(); hammer.position.set(0, 0.03, 0.062); root.add(hammer);
  M(ext(polyShape(spline([[-0.006, -0.005], [0.006, -0.005], [0.011, 0.004], [0.019, 0.011], [0.029, 0.0145], [0.035, 0.0165], [0.0295, 0.0192], [0.016, 0.0178], [0.003, 0.0115], [-0.005, 0.004], [-0.006, -0.005]], 90)), 0.0055, { bevel: 0.001, seg: 3, curve: 40 }), steel, hammer);
  { const chk = new THREE.Mesh(new THREE.PlaneGeometry(0.0048, 0.012), new THREE.MeshStandardMaterial({ color: 0xaaaeb4, metalness: 1, roughness: 0.55, bumpMap: checker, bumpScale: 2 }));
    chk.material.bumpMap.repeat.set(2, 3); chk.position.set(0, 0.0182, 0.0285); chk.rotation.set(-Math.PI / 2 + 0.12, 0, 0); hammer.add(chk); }
  M(cylZ(0.0035, -0.004, 0.004, { seg: 16 }), steelSoft, hammer, 0.0034, 0, 0).rotation.y = Math.PI / 2;

  // ── 방아쇠 (매끈한 곡선형) + 대형 방아쇠울 ──
  const trigger = new THREE.Group(); trigger.position.set(0, -0.042, 0.024); root.add(trigger);
  M(ext(polyShape(spline([[0.005, 0], [0.013, -0.002], [0.0145, -0.014], [0.009, -0.027], [-0.004, -0.036], [-0.019, -0.0385], [-0.0225, -0.033], [-0.0125, -0.0295], [-0.003, -0.021], [-0.0015, -0.008], [0.005, 0]], 80)), 0.007, { bevel: 0.0012, seg: 3, curve: 40 }), steel, trigger);
  { const outer = polyShape(ellipsePts(0.0, -0.066, 0.045, 0.0275, 96)); outer.holes.push(new THREE.Path(ellipsePts(0.0, -0.066, 0.0315, 0.0143, 96).map(([x, y]) => new THREE.Vector2(x, y))));
    M(ext(outer, 0.0085, { bevel: 0.0018, seg: 3, curve: 96 }), steel); }

  // ── 호그 고무 그립 ──
  { const back = spline([[0.09, -0.018], [0.108, -0.058], [0.126, -0.108], [0.1365, -0.15], [0.133, -0.178], [0.113, -0.193]], 40);
    const bottom = spline([[0.113, -0.193], [0.09, -0.192], [0.064, -0.183]], 14);
    const front = []; for (let i = 0; i <= 80; i++) { const t = 1 - i / 80; front.push(new THREE.Vector2(0.026 + 0.038 * t - 0.0045 * (0.5 - 0.5 * Math.cos(TAU * 4 * t)), -0.045 - 0.135 * t)); }
    const top = [new THREE.Vector2(0.03, -0.045), new THREE.Vector2(0.034, -0.03), new THREE.Vector2(0.05, -0.022), new THREE.Vector2(0.074, -0.018)];
    const outline = [...back, ...bottom.slice(1), ...front, ...top];
    M(ext(polyShape(outline), 0.0245, { bevel: 0.0105, seg: 9, curve: 8, crease: 1.2, uv: 130, inset: true }), rubber);
    decal(medallionTex(), 0.014, 0.014, -0.0292, -0.046, 0.062, -1); decal(medallionTex(), 0.014, 0.014, 0.0292, -0.046, 0.062, 1); }

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, BORE_Y, -0.358); root.add(muzzle);
  return { root, swing, cylPivot, hammer, trigger, latch, latchRest, bullet, loadPoint, muzzle, rounds, setRound, makeRound };
}

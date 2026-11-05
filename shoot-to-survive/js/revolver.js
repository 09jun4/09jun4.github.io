import * as THREE from 'three';

// S&W 500 (8-3/8") — 첨부 사진 기준으로 프리미티브 + 옆모양 압출로 조립.
// 좌표(m): 총구 방향 = -z, 위 = +y, 오른쪽 = +x. 실린더 중심 z = -0.0375, 약영 0.42m 길이.
const R_CYL = 0.0345, CYL_LEN = 0.095, CHAMBER_R = 0.0225, BARREL_R = 0.0185, BORE_Y = CHAMBER_R;

// (z,y) 윤곽을 x 방향으로 width 만큼 압출 (x 중심)
function profile(pts, width, { bevel = 0, holes = null } = {}) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}
const ellipse = (cz, cy, rz, ry, n = 20) => Array.from({ length: n }, (_, i) => [cz + Math.cos(i / n * 6.2832) * rz, cy + Math.sin(i / n * 6.2832) * ry]);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
const checkerTex = () => canvasTex(64, 64, (x, w, h) => { // 다이아몬드 체커링
  x.fillStyle = '#9aa0a8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#3c4046'; x.lineWidth = 3;
  for (let i = -h; i < w + h; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); }
}, 2);
const textTex = (text, w, h, size, weight = 'bold') => canvasTex(w, h, (x) => {
  x.clearRect(0, 0, w, h); x.fillStyle = '#4a4e55'; x.font = `${weight} ${size}px sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2);
});
const medallionTex = () => canvasTex(64, 64, (x) => {
  x.clearRect(0, 0, 64, 64); x.strokeStyle = '#5b6068'; x.lineWidth = 4; x.beginPath(); x.arc(32, 32, 27, 0, 7); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.arc(32, 32, 20, 0, 7); x.stroke();
  x.fillStyle = '#5b6068'; x.font = 'bold 18px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('S&W', 32, 33);
});

export function createRevolver() {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2d6db, metalness: 0.85, roughness: 0.27 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x9a9fa6, metalness: 0.85, roughness: 0.34 });
  const black = new THREE.MeshStandardMaterial({ color: 0x08090a, metalness: 0.3, roughness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0, roughness: 0.92 });
  const redFiber = new THREE.MeshBasicMaterial({ color: 0xff3a1c });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 });
  const mesh = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent = root) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const cyl = (r1, r2, len, seg, mat, x, y, z, parent = root) => { // z축 방향 원기둥
    const m = mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat, x, y, z, parent); m.rotation.x = Math.PI / 2; return m;
  };
  const decal = (tex, w, h, x, y, z, side) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.4, polygonOffsetFactor: -2, polygonOffset: true }));
    m.position.set(x, y, z); m.rotation.y = side * Math.PI / 2; root.add(m); return m;
  };

  // ── 프레임 (뒤쪽 브리치 블록 + 상단 스트랩 + 요크) ──
  mesh(profile([[0.012, 0.048], [0.062, 0.048], [0.072, 0.040], [0.088, 0.034], [0.090, 0.018], [0.085, -0.010], [0.076, -0.032], [0.05, -0.048], [0.012, -0.048], [-0.02, -0.044], [0.0, -0.02]], 0.056, { bevel: 0.002 }), steel, 0, 0, 0);
  box(0.046, 0.015, 0.108, steel, 0, 0.0395, -0.043);          // 실린더 위 상단 스트랩
  box(0.05, 0.078, 0.014, steel, 0, 0.002, -0.088);           // 요크(실린더 앞 프레임)
  box(0.05, 0.026, 0.06, steel, 0, -0.038, -0.03);             // 프레임 하단 앞(방아쇠울 연결)

  // ── 배럴 · 풀 언더러그 · 제동구 ──
  cyl(BARREL_R, BARREL_R, 0.225, 14, steel, 0, BORE_Y, -0.1875);
  box(0.006, 0.0016, 0.22, steelDark, 0, BORE_Y + BARREL_R + 0.0003, -0.19);  // 얇은 리브
  mesh(profile([[-0.075, 0.012], [-0.075, -0.027], [-0.168, -0.0225], [-0.213, 0.004], [-0.213, 0.014]], 0.028), steel, 0, 0, 0); // 언더러그 (끝이 비스듬히 끝남)
  cyl(0.0205, 0.0205, 0.056, 14, steel, 0, BORE_Y, -0.272);   // 제동구 몸체
  for (let i = 0; i < 3; i++) box(0.017, 0.05, 0.0078, black, 0, BORE_Y, -0.262 - i * 0.0145); // 슬롯 3개
  cyl(0.0095, 0.0095, 0.004, 10, black, 0, BORE_Y, -0.3);     // 총구
  box(0.007, 0.012, 0.026, black, 0, BORE_Y + 0.0205 + 0.004, -0.285); // 앞 가늠자 받침
  box(0.0045, 0.0045, 0.012, redFiber, 0, BORE_Y + 0.0205 + 0.011, -0.289); // 붉은 파이버 포인트
  // 각인
  decal(textTex('SMITH & WESSON', 256, 24, 17), 0.062, 0.0058, BARREL_R + 0.0004, BORE_Y, -0.15, 1);
  decal(textTex('.500 S&W MAGNUM', 256, 24, 17), 0.062, 0.0058, -BARREL_R - 0.0004, BORE_Y, -0.15, -1);

  // ── 뒤 가늠자 (검정 조절식) ──
  box(0.02, 0.008, 0.026, black, 0, 0.0515, 0.046);
  box(0.0075, 0.014, 0.008, black, -0.0072, 0.0625, 0.054);
  box(0.0075, 0.014, 0.008, black, 0.0072, 0.0625, 0.054);

  // ── 스윙아웃 실린더 (크레인 축 기준) ──
  const swing = new THREE.Group(); swing.position.set(-0.03, -0.03, -0.0375); root.add(swing);
  cyl(0.005, 0.005, 0.1, 8, steelDark, 0, 0, -0.005, swing);  // 크레인 로드
  const cylPivot = new THREE.Group(); cylPivot.position.set(0.03, 0.03, 0); swing.add(cylPivot);
  const half = CYL_LEN / 2, band = 0.012, midLen = CYL_LEN - band * 2;
  cyl(R_CYL, R_CYL, band, 16, steel, 0, 0, half - band / 2, cylPivot);   // 뒤 밴드
  cyl(R_CYL, R_CYL, band, 16, steel, 0, 0, -half + band / 2, cylPivot);  // 앞 밴드
  { // 플루트가 파인 중간부 (챔버 사이 5개)
    const pts = [], N = 120, depth = 0.0042, wid = 15 * Math.PI / 180;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2; let r = R_CYL, dmin = 9;
      for (let k = 0; k < 5; k++) { const c = Math.PI / 2 + Math.PI / 5 + k * Math.PI * 2 / 5; dmin = Math.min(dmin, Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)))); }
      if (dmin < wid) r -= depth * (0.5 + 0.5 * Math.cos(Math.PI * dmin / wid));
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: midLen, bevelEnabled: false }); g.translate(0, 0, -midLen / 2);
    cylPivot.add(new THREE.Mesh(g, steel));
  }
  for (let i = 0; i < 5; i++) { // 챔버 구멍 5개 (앞·뒤)
    const a = Math.PI / 2 + i * Math.PI * 2 / 5;
    for (const z of [half + 0.0004, -half - 0.0004]) cyl(0.0078, 0.0078, 0.002, 12, black, Math.cos(a) * CHAMBER_R, Math.sin(a) * CHAMBER_R, z, cylPivot);
  }
  { // 이젝터 스타(별) + 가운데 핀
    const s = [], n = 10; for (let i = 0; i < n; i++) { const r = i % 2 ? 0.0075 : 0.0135, a = i / n * Math.PI * 2; s.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(s), { depth: 0.003, bevelEnabled: false });
    const star = new THREE.Mesh(g, steelDark); star.position.z = half; cylPivot.add(star);
    cyl(0.0045, 0.0045, 0.012, 8, steelDark, 0, 0, half + 0.004, cylPivot);
    cyl(0.005, 0.005, 0.005, 8, steelDark, 0, 0, -half - 0.002, cylPivot);
  }
  // 재장전용 탄
  const bullet = new THREE.Group();
  const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.032, 10), brass); bc.rotation.x = Math.PI / 2;
  const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0066, 0.018, 10), steelDark); bt.rotation.x = Math.PI / 2; bt.position.z = -0.025;
  bullet.add(bc, bt); bullet.visible = false; swing.add(bullet);
  const loadPoint = new THREE.Vector3(0.03, 0.03 + CHAMBER_R, half); // swing 좌표: 맨 위 챔버 입구(뒷면)

  // ── 해머 (스테인리스 + 체커링 스퍼) ──
  const hammer = new THREE.Group(); hammer.position.set(0, 0.03, 0.062); root.add(hammer);
  const arm = box(0.014, 0.04, 0.014, steel, 0, 0.022, 0.008, hammer); arm.rotation.x = 0.35;
  const spur = box(0.015, 0.008, 0.028, [steel, steel, new THREE.MeshStandardMaterial({ map: checkerTex(), metalness: 0.7, roughness: 0.4 }), steel, steel, steel], 0, 0.042, 0.022, hammer);
  spur.rotation.x = 0.35;
  // ── 방아쇠 (매끈한 곡선형) + 대형 방아쇠울 ──
  const trigger = new THREE.Group(); trigger.position.set(0, -0.042, 0.024); root.add(trigger);
  mesh(profile([[0.004, 0], [0.012, 0], [0.012, -0.012], [0.006, -0.026], [-0.006, -0.033], [-0.018, -0.032], [-0.016, -0.027], [-0.007, -0.022], [-0.003, -0.012]], 0.011), steel, 0, 0, 0, trigger);
  mesh(profile(ellipse(0.0, -0.066, 0.044, 0.025), 0.012, { holes: [ellipse(0.0, -0.066, 0.0335, 0.0155)] }), steel, 0, 0, 0.0);

  // ── 호그 고무 그립 (핑거 홈 4개) ──
  const gp = [[0.088, -0.02], [0.104, -0.06], [0.118, -0.11], [0.128, -0.15], [0.124, -0.176], [0.1, -0.186], [0.068, -0.18]];
  for (let i = 0; i <= 24; i++) { // 앞면 핑거 홈
    const t = 1 - i / 24, y = -0.045 - 0.13 * t, z = 0.03 + 0.036 * t - 0.0042 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 4 * t));
    gp.push([z, y]);
  }
  mesh(profile(gp, 0.042, { bevel: 0.004 }), rubber, 0, 0, 0);

  // ── 실린더 래치(좌측 체커 엄지 조각) + 나사 + 메달리온 + 500 로고 ──
  const latch = box(0.006, 0.014, 0.02, [steel, new THREE.MeshStandardMaterial({ map: checkerTex(), metalness: 0.7, roughness: 0.4 }), steel, steel, steel, steel], -0.0307, 0.013, 0.032);
  const latchRest = 0.032;
  const pin = cyl(0.0038, 0.0038, 0.004, 8, steelDark, -0.0285, 0.032, 0.036); pin.rotation.set(0, 0, Math.PI / 2);
  decal(medallionTex(), 0.017, 0.017, -0.0283, -0.014, 0.048, -1);
  decal(textTex('500', 96, 40, 34), 0.034, 0.0142, 0.0283, -0.004, 0.036, 1);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, BORE_Y, -0.306); root.add(muzzle);
  return { root, swing, cylPivot, hammer, trigger, latch, latchRest, bullet, loadPoint, muzzle };
}

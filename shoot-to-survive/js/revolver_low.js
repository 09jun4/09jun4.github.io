import * as THREE from 'three';

// 그래픽 '낮음'용 리볼버: 박스·저분할 원기둥만 사용, Lambert 재질(텍스처·범프·환경맵 없음).
// 좌표·치수·API는 하이 모델(revolver.js)과 같아서 조준선·재장전 연출이 그대로 맞는다.
const R_CYL = 0.039, CYL_LEN = 0.1, CHAMBER_R = 0.0255, BARREL_R = 0.0165, BORE_Y = CHAMBER_R;
const TAU = Math.PI * 2;

export function createRevolverLow() {
  const root = new THREE.Group();
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const steel = L(0xb4b8be), steelDark = L(0x8a8e95), black = L(0x0b0b0c), rubber = L(0x151516);
  const brass = L(0xd0a23c), lead = L(0x8c8f94), primerLive = L(0xc2c6cb), primerSpent = L(0x2c2c2e);
  const red = new THREE.MeshBasicMaterial({ color: 0xff3b1c }), white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  const box = (w, h, d, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const cyl = (r, len, seg, mat, x, y, z, parent = root, r2 = r) => { // z축 원기둥
    const g = new THREE.CylinderGeometry(r2, r, len, seg); g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); parent.add(m); return m;
  };

  // 프레임
  box(0.028, 0.092, 0.079, steel, 0, -0.001, 0.0515);            // 뒤 프레임
  box(0.019, 0.0075, 0.113, steel, 0, 0.044, -0.0385);           // 상단 스트랩
  box(0.022, 0.0875, 0.015, steel, 0, 0.0038, -0.0865);          // 요크
  box(0.019, 0.0135, 0.116, steel, 0, -0.047, -0.024);           // 하단
  // 방아쇠울
  box(0.008, 0.006, 0.09, steel, 0, -0.092, 0.0);
  box(0.008, 0.05, 0.006, steel, 0, -0.067, -0.043);
  box(0.008, 0.05, 0.006, steel, 0, -0.067, 0.043);
  // 총열 · 언더러그 · 제동구
  cyl(BARREL_R, 0.221, 10, steel, 0, BORE_Y, -0.1855);
  cyl(BARREL_R, 0.046, 10, steel, 0, BORE_Y, -0.099, root, 0.021);  // 프레임 연결 칼라
  box(0.010, 0.0295, 0.09, steel, 0, -0.0035, -0.123);
  cyl(0.0188, 0.0525, 10, steel, 0, BORE_Y, -0.3223);
  for (const z of [-0.3125, -0.3265, -0.3405]) box(0.04, 0.012, 0.0078, black, 0, BORE_Y, z); // 제동구 포트 3개
  // 앞 가늠쇠(붉은 포인트) / 뒤 가늠자
  box(0.0065, 0.0132, 0.03, black, 0, BORE_Y + 0.0172 + 0.0066, -0.333);
  box(0.0045, 0.0045, 0.008, red, 0, BORE_Y + 0.0172 + 0.0128, -0.3445);
  box(0.0245, 0.0065, 0.034, black, 0, 0.0435, 0.049);
  for (const sx of [-1, 1]) { box(0.0064, 0.0155, 0.006, black, sx * 0.0083, 0.0545, 0.055); box(0.0014, 0.008, 0.0004, white, sx * 0.0083, 0.0545, 0.0584); }

  // 스윙아웃 실린더
  const swing = new THREE.Group(); swing.position.set(-0.034, -0.034, -0.0375); root.add(swing);
  cyl(0.004, 0.05, 6, steelDark, 0, 0, -0.025, swing);
  const cylPivot = new THREE.Group(); cylPivot.position.set(0.034, 0.034, 0); swing.add(cylPivot);
  const half = CYL_LEN / 2;
  cyl(R_CYL, CYL_LEN, 10, steel, 0, 0, 0, cylPivot);
  const chamberPos = Array.from({ length: 5 }, (_, i) => { const a = Math.PI / 2 + i * TAU / 5; return [Math.cos(a) * CHAMBER_R, Math.sin(a) * CHAMBER_R]; });
  for (const [x, y] of chamberPos) cyl(0.0085, 0.002, 8, black, x, y, half + 0.0004, cylPivot);   // 챔버 구멍(뒷면)
  cyl(0.0045, 0.004, 6, steelDark, 0, 0, half + 0.001, cylPivot);

  // 챔버 속 총알 (6각 원통)
  const makeRound = (state) => {
    const g = new THREE.Group();
    cyl(0.0072, 0.029, 6, brass, 0, 0, 0.0016, g);
    if (state === 'live') cyl(0.0064, 0.018, 6, lead, 0, 0, -0.0215, g, 0.0042);
    cyl(0.0034, 0.0012, 6, state === 'live' ? primerLive : primerSpent, 0, 0, 0.0166, g);
    return g;
  };
  const rounds = chamberPos.map(([x, y]) => { const h = new THREE.Group(); h.position.set(x, y, half - 0.0166); cylPivot.add(h); h.visible = false; return h; });
  const setRound = (i, state) => {
    const h = rounds[i]; while (h.children.length) h.remove(h.children[0]);
    h.visible = !!state; if (state) for (const c of makeRound(state).children.slice()) h.add(c);
  };
  const bullet = new THREE.Group(); for (const c of makeRound('live').children.slice()) bullet.add(c);
  bullet.visible = false; swing.add(bullet);
  const loadPoint = new THREE.Vector3(0.034, 0.034 + CHAMBER_R, half);

  // 해머 · 방아쇠 · 래치
  const hammer = new THREE.Group(); hammer.position.set(0, 0.03, 0.062); root.add(hammer);
  box(0.0055, 0.02, 0.012, steel, 0, 0.008, 0.012, hammer).rotation.x = 0.35;
  box(0.0055, 0.006, 0.02, steel, 0, 0.0165, 0.026, hammer);
  const trigger = new THREE.Group(); trigger.position.set(0, -0.042, 0.024); root.add(trigger);
  box(0.007, 0.032, 0.01, steel, 0, -0.016, -0.004, trigger);
  const latch = new THREE.Group(); latch.position.set(-0.0182, 0.014, 0.034); root.add(latch);
  box(0.005, 0.013, 0.018, steelDark, 0, 0, 0, latch);
  const latchRest = 0.034;

  // 그립 (기울어진 박스)
  box(0.044, 0.16, 0.065, rubber, 0, -0.107, 0.079).rotation.x = -0.24;

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, BORE_Y, -0.358); root.add(muzzle);
  return { root, swing, cylPivot, hammer, trigger, latch, latchRest, bullet, loadPoint, muzzle, rounds, setRound, makeRound };
}

import * as THREE from 'three';

// S&W 500 기반 리볼버 — 프리미티브 조합. 총구 방향 = -z, 위 = +y, 오른쪽 = +x
function engravingMap() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#b8bcc2'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 128; i += 3) { x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  x.fillStyle = '#4b4f55'; x.font = 'bold 46px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) x.fillText('500', 51 + i * 102, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createRevolver() {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.75, roughness: 0.32 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x6d7076, metalness: 0.7, roughness: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 });
  const box = (w, h, d, mat, x, y, z, parent = root) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
  };
  const cyl = (rt, rb, len, seg, mat, x, y, z, parent = root) => { // z축 방향 원기둥
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat);
    m.rotation.x = Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m;
  };

  // 프레임
  box(0.044, 0.07, 0.1, steel, 0, 0, 0.02);
  box(0.034, 0.011, 0.1, steel, 0, 0.0505, -0.06); // 상단 스트랩
  // 배럴 (풀 언더러그 8-3/8")
  cyl(0.0175, 0.0175, 0.22, 12, steel, 0, 0.022, -0.22);
  box(0.034, 0.026, 0.17, steel, 0, -0.003, -0.19);
  box(0.007, 0.006, 0.25, darkSteel, 0, 0.0425, -0.205); // 리브
  // 제동구 + 슬롯 3개
  cyl(0.0178, 0.0178, 0.056, 12, steel, 0, 0.022, -0.358);
  for (let i = 0; i < 3; i++) box(0.012, 0.042, 0.007, black, 0, 0.022, -0.343 - i * 0.014);
  cyl(0.0075, 0.0075, 0.004, 8, black, 0, 0.022, -0.386); // 총구
  // 앞 가늠자 + 붉은 포인트
  box(0.006, 0.012, 0.012, darkSteel, 0, 0.0455, -0.372);
  box(0.0045, 0.0045, 0.003, red, 0, 0.0485, -0.3655);
  // 뒤 가늠자
  box(0.009, 0.014, 0.012, black, -0.0085, 0.042, 0.05);
  box(0.009, 0.014, 0.012, black, 0.0085, 0.042, 0.05);

  // 스윙아웃 실린더 (좌측 크레인 축 기준 회전)
  const swing = new THREE.Group(); swing.position.set(-0.03, -0.03, -0.07); root.add(swing);
  const cylPivot = new THREE.Group(); cylPivot.position.set(0.03, 0.038, 0); swing.add(cylPivot);
  const side = new THREE.MeshStandardMaterial({ map: engravingMap(), metalness: 0.6, roughness: 0.4 });
  const cm = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.1, 15), [side, steel, steel]);
  cm.rotation.x = Math.PI / 2; cylPivot.add(cm);
  for (let i = 0; i < 5; i++) { // 챔버 구멍 5개 (앞·뒤)
    const a = Math.PI / 2 + i * Math.PI * 2 / 5;
    for (const z of [0.0505, -0.0505]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.004, 8), black);
      h.rotation.x = Math.PI / 2; h.position.set(Math.cos(a) * 0.025, Math.sin(a) * 0.025, z); cylPivot.add(h);
    }
  }
  // 재장전용 탄 (스윙 그룹의 자식)
  const bullet = new THREE.Group();
  const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.03, 8), brass); bc.rotation.x = Math.PI / 2;
  const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0062, 0.016, 8), darkSteel); bt.rotation.x = Math.PI / 2; bt.position.z = -0.023;
  bullet.add(bc, bt); bullet.visible = false; swing.add(bullet);

  // 해머 (독립 파츠)
  const hammer = new THREE.Group(); hammer.position.set(0, 0.035, 0.068); root.add(hammer);
  box(0.012, 0.03, 0.014, darkSteel, 0, 0.012, 0, hammer);
  box(0.012, 0.008, 0.02, darkSteel, 0, 0.027, 0.01, hammer);
  // 방아쇠 + 방아쇠울
  const trigger = new THREE.Group(); trigger.position.set(0, -0.035, 0.008); root.add(trigger);
  box(0.007, 0.026, 0.01, darkSteel, 0, -0.013, 0, trigger);
  box(0.008, 0.026, 0.007, steel, 0, -0.05, -0.03);
  box(0.008, 0.007, 0.065, steel, 0, -0.0625, 0.0);
  box(0.008, 0.026, 0.007, steel, 0, -0.05, 0.03);
  // 그립 (검정 고무 + 핑거 홈)
  const grip = box(0.042, 0.12, 0.058, rubber, 0, -0.088, 0.075); grip.rotation.x = -0.3;
  for (let i = -1; i <= 1; i++) box(0.044, 0.007, 0.006, new THREE.MeshStandardMaterial({ color: 0x050505 }), 0, i * 0.03, -0.031, grip);
  // 실린더 래치 (좌측)
  const latch = box(0.008, 0.013, 0.024, darkSteel, -0.0275, 0.018, -0.012);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.022, -0.395); root.add(muzzle);
  return { root, swing, cylPivot, hammer, trigger, latch, bullet, muzzle };
}

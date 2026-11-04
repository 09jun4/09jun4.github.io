// 공용 재질 라이브러리. MeshStandardMaterial의 색·거칠기·금속성으로 표현하고 텍스처는 최소(작은 절차 텍스처)만 쓴다.
import * as THREE from 'three';

function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function noise(ctx, s, base, amp, count, rnd) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(255 - rnd() * amp);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.08})`;
    const r = 1 + rnd() * 3;
    ctx.fillRect(rnd() * s, rnd() * s, r, r);
  }
}

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function createMaterials() {
  const r = rng(7);
  // 콘크리트 얼룩 (밝은 회색 → 색과 곱해짐), 1m당 0.5회 반복
  const concreteTex = canvasTex(128, (ctx, s) => {
    noise(ctx, s, '#ffffff', 60, 900, r);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, s - 0.5); ctx.lineTo(s, s - 0.5); ctx.stroke(); // 패널 줄눈
  });
  concreteTex.repeat.set(0.5, 0.5);
  const tileTex = canvasTex(128, (ctx, s) => {
    noise(ctx, s, '#ffffff', 40, 500, r);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  });
  tileTex.repeat.set(1 / 0.6, 1 / 0.6);
  const floorTex = canvasTex(128, (ctx, s) => {
    noise(ctx, s, '#ffffff', 70, 1200, r);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  });
  floorTex.repeat.set(0.5, 0.5);
  const grateTex = canvasTex(64, (ctx, s) => {
    ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#5a5a5a';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ctx.fillRect(i * 16 + 3, j * 16 + 3, 10, 10);
  });
  grateTex.repeat.set(1 / 0.6, 1 / 0.6);
  const hazardTex = canvasTex(64, (ctx, s) => {
    ctx.fillStyle = '#d9a514'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#151515';
    for (let i = -s; i < s * 2; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 8, 0); ctx.lineTo(i + 8 - s, s); ctx.lineTo(i - s, s); ctx.fill(); }
  });
  hazardTex.repeat.set(2, 1);

  const S = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    textures: { concreteTex, tileTex, floorTex, grateTex, hazardTex },
    // 건축
    wall: S({ color: 0xbfb398, roughness: 0.92, metalness: 0, map: concreteTex }),
    wallLower: S({ color: 0x8d8473, roughness: 0.85, metalness: 0, map: concreteTex }),
    floorConcrete: S({ color: 0x7a7c7d, roughness: 0.82, metalness: 0, map: floorTex }),
    floorTile: S({ color: 0x9aa2a6, roughness: 0.55, metalness: 0, map: tileTex }),
    floorMetal: S({ color: 0x6c737a, roughness: 0.5, metalness: 0.6, map: grateTex }),
    ceiling: S({ color: 0x8a8e91, roughness: 0.9, metalness: 0, map: concreteTex }),
    trim: S({ color: 0x3f454b, roughness: 0.45, metalness: 0.7 }),
    // 금속·플라스틱
    metal: S({ color: 0x7d858c, roughness: 0.38, metalness: 0.8 }),
    metalDark: S({ color: 0x33383d, roughness: 0.45, metalness: 0.7 }),
    metalPainted: S({ color: 0x55626b, roughness: 0.6, metalness: 0.35 }),
    metalLight: S({ color: 0xa9b0b5, roughness: 0.32, metalness: 0.75 }),
    plasticDark: S({ color: 0x1e2226, roughness: 0.6, metalness: 0 }),
    plasticGrey: S({ color: 0x6c7176, roughness: 0.55, metalness: 0 }),
    plasticWhite: S({ color: 0xd9dcdc, roughness: 0.5, metalness: 0 }),
    rubber: S({ color: 0x141618, roughness: 0.9, metalness: 0 }),
    wood: S({ color: 0x6d5a45, roughness: 0.7, metalness: 0 }),
    fabric: S({ color: 0x2e3a44, roughness: 0.95, metalness: 0 }),
    crate: S({ color: 0x55603f, roughness: 0.8, metalness: 0.1 }),
    hazard: S({ color: 0xffffff, roughness: 0.6, metalness: 0.1, map: hazardTex }),
    door: S({ color: 0x6e7881, roughness: 0.42, metalness: 0.6 }),
    doorDark: S({ color: 0x2d3338, roughness: 0.5, metalness: 0.6 }),
    // 유리·발광
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd6e0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x1b2a30, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }),
    lightPanel: S({ color: 0x111111, emissive: 0xf4f7ff, emissiveIntensity: 1.6, roughness: 1 }),
    screenBlue: S({ color: 0x050a10, emissive: 0x2a8cff, emissiveIntensity: 1.1, roughness: 0.3 }),
    screenGreen: S({ color: 0x050a08, emissive: 0x29d27a, emissiveIntensity: 1.0, roughness: 0.3 }),
    screenAmber: S({ color: 0x0a0702, emissive: 0xff9a2a, emissiveIntensity: 1.0, roughness: 0.3 }),
    screenTeal: S({ color: 0x041010, emissive: 0x2fe0d2, emissiveIntensity: 1.0, roughness: 0.3 }),
    ledBlue: S({ color: 0x000000, emissive: 0x3aa0ff, emissiveIntensity: 2.2 }),
    ledGreen: S({ color: 0x000000, emissive: 0x3dff8a, emissiveIntensity: 2.0 }),
    ledRed: S({ color: 0x000000, emissive: 0xff2a2a, emissiveIntensity: 2.2 }),
    ledAmber: S({ color: 0x000000, emissive: 0xffa020, emissiveIntensity: 2.0 }),
    liquid: new THREE.MeshStandardMaterial({ color: 0x0c4a4a, emissive: 0x1fb5a8, emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.75, depthWrite: false }),
    beacon: S({ color: 0x220000, emissive: 0xff3a10, emissiveIntensity: 2.0 }),
  };
  for (const k of ['ledBlue', 'ledGreen', 'ledRed', 'ledAmber', 'lightPanel', 'beacon', 'screenBlue', 'screenGreen', 'screenAmber', 'screenTeal']) {
    M[k].userData.baseEmissive = M[k].emissiveIntensity;
  }
  // 바닥 재질 이름(JSON) → 재질
  M.floorFor = (name) => ({ concrete: M.floorConcrete, tile: M.floorTile, metal: M.floorMetal }[name] || M.floorConcrete);

  // 절차적 미세 애니메이션 (LED 깜빡임, 경고등 펄스)
  M.update = (t) => {
    M.ledBlue.emissiveIntensity = 1.8 + Math.sin(t * 13.1) * 0.5 * (Math.sin(t * 2.3) > 0 ? 1 : 0.2);
    M.ledGreen.emissiveIntensity = 1.6 + (Math.sin(t * 7.7) > 0.6 ? 0.9 : 0);
    M.ledAmber.emissiveIntensity = 1.5 + (Math.sin(t * 3.1) > 0 ? 0.8 : 0);
    M.beacon.emissiveIntensity = 1.0 + Math.max(0, Math.sin(t * 4.5)) * 3.0;
    M.screenBlue.emissiveIntensity = 1.05 + Math.sin(t * 30) * 0.03;
  };
  M.dispose = () => {
    for (const v of Object.values(M)) if (v && v.isMaterial) v.dispose();
    for (const t of Object.values(M.textures)) t.dispose();
  };
  return M;
}

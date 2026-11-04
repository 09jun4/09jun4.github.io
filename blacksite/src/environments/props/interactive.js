// 상호작용 소품: 데이터 터미널(목표), 로그 단말, 탈출 해치.
// interact: { box: [minX,minY,minZ,maxX,maxY,maxZ] (로컬), kind }
import * as THREE from 'three';
import { boxGeo, roundedBox, mesh } from '../../utils/geometry.js';

function screenCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, ctx: c.getContext('2d'), tex };
}

export function dataTerminal(def, M) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.95, 1.0, 0.6, 0.02), M.metalDark, 0, 0.5, -0.05));
  g.add(mesh(boxGeo(0.95, 0.05, 0.45, 0), M.plasticDark, 0, 1.05, 0.05, 0.35, 0, 0));
  for (let i = 0; i < 4; i++) {
    const k = mesh(boxGeo(0.8, 0.01, 0.06, 0), M.metal, 0, 1.08, -0.08 + i * 0.075, 0.35, 0, 0);
    g.add(k);
  }
  g.add(mesh(roundedBox(0.95, 0.65, 0.08, 0.02), M.plasticDark, 0, 1.6, -0.28, -0.12, 0, 0));
  const scr = screenCanvas(256, 160);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: scr.tex, emissiveIntensity: 1.2, roughness: 0.3 });
  const screen = mesh(new THREE.PlaneGeometry(0.84, 0.54), screenMat, 0, 1.6, -0.235, -0.12, 0, 0);
  screen.castShadow = false;
  screen.userData.noMerge = true;
  g.add(screen);
  // 데이터 드라이브 슬롯 + 상태등
  g.add(mesh(boxGeo(0.25, 0.05, 0.02, 0), M.metal, -0.25, 0.85, 0.255));
  const led = mesh(boxGeo(0.05, 0.05, 0.02, 0), M.ledBlue, 0.3, 0.85, 0.255);
  led.castShadow = false; led.userData.noMerge = true;
  g.add(led);
  g.userData.dispose = () => { scr.tex.dispose(); screenMat.dispose(); };
  return {
    object: g,
    interact: { kind: 'terminal', box: [-0.6, 0, -0.4, 0.6, 2.0, 0.6] },
    screen: { ...scr, mesh: screen, led },
  };
}

export function logTerminal(def, M) {
  const g = new THREE.Group();
  let base = def.onTop || 0;
  if (def.stand) {
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.04, 14), M.metalDark, 0, 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8), M.metal, 0, 0.5, 0));
    g.add(mesh(roundedBox(0.36, 0.03, 0.26, 0.01), M.metalDark, 0, 0.98, 0, 0.3, 0, 0));
    base = 1.0;
  }
  // 견고형(러기드) 태블릿 / 노트북
  const t = new THREE.Group();
  t.add(mesh(roundedBox(0.36, 0.025, 0.25, 0.008), M.plasticDark, 0, 0.0125, 0));
  const lid = new THREE.Group();
  lid.add(mesh(roundedBox(0.36, 0.24, 0.018, 0.008), M.plasticDark, 0, 0.12, 0));
  const screenMat = M.screenGreen.clone();
  screenMat.userData.baseEmissive = screenMat.emissiveIntensity;
  const scr = mesh(new THREE.PlaneGeometry(0.32, 0.2), screenMat, 0, 0.12, 0.0095);
  scr.castShadow = false; scr.userData.noMerge = true;
  lid.add(scr);
  lid.position.set(0, 0.025, -0.12);
  lid.rotation.x = -0.3;
  t.add(lid);
  // 모서리 범퍼(주황) — 눈에 띄게
  const bump = new THREE.MeshStandardMaterial({ color: 0xc8701a, roughness: 0.7 });
  for (const sx of [-1, 1]) t.add(mesh(boxGeo(0.03, 0.035, 0.26, 0), bump, sx * 0.18, 0.015, 0));
  t.position.y = base;
  if (def.stand) t.rotation.x = 0.3;
  g.add(t);
  g.userData.dispose = () => { screenMat.dispose(); bump.dispose(); };
  return {
    object: g,
    collide: !!def.stand,
    interact: { kind: 'log', box: [-0.3, base - 0.05, -0.3, 0.3, base + 0.4, 0.3] },
    screenMat,
  };
}

export function extractionHatch(def, M) {
  const g = new THREE.Group();
  // 벽에 붙은 두꺼운 방폭문
  g.add(mesh(boxGeo(1.9, 2.6, 0.18, 0), M.trim, 0, 1.3, 0.0));
  g.add(mesh(roundedBox(1.5, 2.25, 0.12, 0.03), M.doorDark, 0, 1.15, 0.12));
  g.add(mesh(boxGeo(1.5, 0.18, 0.02, 0), M.hazard, 0, 0.2, 0.19));
  g.add(mesh(boxGeo(1.5, 0.18, 0.02, 0), M.hazard, 0, 2.1, 0.19));
  const wheel = mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 20), M.metal, 0, 1.2, 0.22);
  g.add(wheel);
  for (let i = 0; i < 2; i++) g.add(mesh(boxGeo(0.44, 0.03, 0.03, 0), M.metal, 0, 1.2, 0.22, 0, 0, (i * Math.PI) / 2));
  const lamp = mesh(boxGeo(0.16, 0.08, 0.04, 0), M.ledRed, 0, 2.45, 0.14);
  lamp.castShadow = false; lamp.userData.noMerge = true;
  g.add(lamp);
  // EXIT 표기
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b120d'; ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#3dff8a'; ctx.font = '700 64px Rajdhani, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 128, 52);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 });
  const sign = mesh(new THREE.PlaneGeometry(0.5, 0.19), signMat, 0, 2.85, 0.1);
  sign.castShadow = false; sign.userData.noMerge = true;
  g.add(sign);
  g.userData.dispose = () => { tex.dispose(); signMat.dispose(); };
  return {
    object: g,
    interact: { kind: 'extract', box: [-0.9, 0, -0.1, 0.9, 2.4, 0.6] },
    lamp,
    collide: false,
  };
}

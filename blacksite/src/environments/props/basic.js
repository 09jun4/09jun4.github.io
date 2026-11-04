// 기본 소품: 상자, 사물함, 벤치, 카트, 캐비닛, 의자, 소화기, 표지판, 배관, 경고등.
// 모든 소품은 로컬 +z가 앞면. create(def, M) → { object, collide?, colliders? }
import * as THREE from 'three';
import { boxGeo, roundedBox, mesh } from '../../utils/geometry.js';

export function crate(def, M) {
  const g = new THREE.Group();
  const s = def.size || 0.9;
  g.add(mesh(roundedBox(s, s * 0.8, s, 0.025), M.crate, 0, s * 0.4, 0));
  // 모서리 보강 프레임
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(mesh(boxGeo(0.06, s * 0.82, 0.06, 0), M.metalDark, sx * (s / 2 - 0.02), s * 0.41, sz * (s / 2 - 0.02)));
  }
  g.add(mesh(boxGeo(s * 0.5, 0.12, 0.01, 0), M.hazard, 0, s * 0.55, s / 2 + 0.006));
  return { object: g };
}

export function crateStack(def, M) {
  const g = new THREE.Group();
  const a = crate({ size: 1.0 }, M).object;
  const b = crate({ size: 0.8 }, M).object; b.position.set(0.05, 0.8, 0.02); b.rotation.y = 0.25;
  const c = crate({ size: 0.9 }, M).object; c.position.set(0, 0, 1.0); c.rotation.y = -0.1;
  g.add(a, b, c);
  return { object: g };
}

export function lockers(def, M) {
  const g = new THREE.Group();
  const n = def.count || 3, w = 0.5, h = 1.9, d = 0.5;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * w;
    g.add(mesh(boxGeo(w - 0.01, h, d, 0), M.metalPainted, x, h / 2, 0));
    g.add(mesh(boxGeo(w - 0.06, h - 0.1, 0.02, 0), M.metal, x, h / 2, d / 2 + 0.005));
    for (let k = 0; k < 3; k++) g.add(mesh(boxGeo(0.26, 0.015, 0.01, 0), M.metalDark, x, h - 0.2 - k * 0.04, d / 2 + 0.02));
    g.add(mesh(boxGeo(0.03, 0.14, 0.03, 0), M.metalDark, x + w / 2 - 0.08, h * 0.55, d / 2 + 0.03));
  }
  return { object: g };
}

export function bench(def, M) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.6, 0.06, 0.4, 0.02), M.metalPainted, 0, 0.46, 0));
  for (const x of [-0.65, 0.65]) g.add(mesh(boxGeo(0.06, 0.44, 0.34, 0), M.metalDark, x, 0.22, 0));
  return { object: g };
}

export function cart(def, M) {
  const g = new THREE.Group();
  for (const y of [0.25, 0.88]) g.add(mesh(roundedBox(0.9, 0.04, 0.55, 0.015), M.metalLight, 0, y, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6), M.metal, sx * 0.42, 0.5, sz * 0.25));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), M.rubber, sx * 0.42, 0.06, sz * 0.25, 0, 0, Math.PI / 2));
  }
  g.add(mesh(roundedBox(0.4, 0.18, 0.3, 0.02), M.plasticGrey, -0.18, 0.36, 0));
  return { object: g };
}

export function cabinet(def, M) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.0, 2.0, 0.5, 0.02), M.metalPainted, 0, 1.0, 0));
  for (const x of [-0.245, 0.245]) {
    g.add(mesh(boxGeo(0.47, 1.9, 0.02, 0), M.metal, x, 1.0, 0.255));
    g.add(mesh(boxGeo(0.02, 0.22, 0.03, 0), M.metalDark, x > 0 ? x - 0.2 : x + 0.2, 1.05, 0.27));
  }
  return { object: g };
}

export function chair(def, M) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.48, 0.08, 0.46, 0.03), M.fabric, 0, 0.48, 0));
  g.add(mesh(roundedBox(0.46, 0.5, 0.07, 0.03), M.fabric, 0, 0.8, -0.22, -0.12));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), M.metalDark, 0, 0.26, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = mesh(boxGeo(0.3, 0.03, 0.04, 0), M.metalDark, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, 0, -a, 0);
    g.add(leg);
  }
  return { object: g };
}

export function fireExt(def, M) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xa3150f, roughness: 0.4, metalness: 0.2 });
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12), red, 0, 0.75, 0));
  g.add(mesh(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 1.0, 0));
  g.add(mesh(boxGeo(0.06, 0.08, 0.1, 0), M.metalDark, 0, 1.08, 0.02));
  g.add(mesh(boxGeo(0.22, 0.3, 0.02, 0), M.metalDark, 0, 0.8, -0.1));
  return { object: g, collide: false };
}

function textTexture(text, sub, w = 512, h = 160, color = '#e9eef2', bg = '#1d2328', accent = '#2a8cff') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 14, h);
  ctx.fillStyle = color;
  ctx.font = '700 64px Rajdhani, "Share Tech Mono", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 40, sub ? h * 0.4 : h / 2);
  if (sub) {
    ctx.fillStyle = '#93a0aa';
    ctx.font = '500 30px "Share Tech Mono", monospace';
    ctx.fillText(sub, 42, h * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function sign(def, M) {
  const g = new THREE.Group();
  const tex = textTexture(def.text || 'SIGN', def.sub || '');
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05 });
  g.add(mesh(new THREE.PlaneGeometry(1.3, 0.4), mat, 0, 0, 0.012));
  g.add(mesh(boxGeo(1.36, 0.46, 0.02, 0), M.trim, 0, 0, 0));
  g.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return { object: g, collide: false };
}

// 배관: from → to (축 정렬) 높이 y, 개수 count
export function pipes(def, M) {
  const g = new THREE.Group();
  const [x1, z1] = def.from, [x2, z2] = def.to;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
  const n = def.count || 2;
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0.07 : 0.045;
    const off = i * 0.17;
    const p = mesh(new THREE.CylinderGeometry(r, r, len, 10), i === 0 ? M.metalPainted : M.metal,
      (x1 + x2) / 2 + (alongX ? 0 : off), def.y - i * 0.05, (z1 + z2) / 2 + (alongX ? off : 0));
    p.rotation.set(alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
    p.castShadow = false;
    g.add(p);
  }
  // 고정 브래킷
  for (let s = 0; s <= len; s += 3) {
    const x = alongX ? x1 + Math.sign(x2 - x1) * s : x1, z = alongX ? z1 : z1 + Math.sign(z2 - z1) * s;
    const b = mesh(boxGeo(alongX ? 0.05 : 0.4, 0.25, alongX ? 0.4 : 0.05, 0), M.metalDark, x, def.y + 0.1, z);
    b.castShadow = false;
    g.add(b);
  }
  return { object: g, collide: false };
}

export function beacon(def, M) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.06, 12), M.metalDark, 0, -0.03, 0));
  const dome = mesh(new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.beacon, 0, -0.14, 0, Math.PI, 0, 0);
  dome.castShadow = false;
  g.add(dome);
  return { object: g, collide: false };
}

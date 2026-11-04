// 구역별 소품: 보안실 책상, 실험대, 표본 탱크, 흄후드, 서버랙, 통제 콘솔, 대형 화면.
import * as THREE from 'three';
import { boxGeo, roundedBox, mesh, lathe } from '../../utils/geometry.js';

function monitor(M, screenMat, w = 0.55, h = 0.34) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(w, h, 0.04, 0.012), M.plasticDark, 0, h / 2 + 0.12, 0));
  const s = mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), screenMat, 0, h / 2 + 0.12, 0.021);
  s.castShadow = false;
  g.add(s);
  g.add(mesh(boxGeo(0.04, 0.12, 0.04, 0), M.plasticDark, 0, 0.06, -0.01));
  g.add(mesh(boxGeo(0.22, 0.015, 0.16, 0), M.plasticDark, 0, 0.008, 0));
  return g;
}

export function securityDesk(def, M) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(2.6, 0.05, 0.85, 0.015), M.plasticGrey, 0, 0.76, 0));
  g.add(mesh(boxGeo(2.5, 0.7, 0.04, 0), M.metalPainted, 0, 0.38, -0.38));
  for (const x of [-1.22, 1.22]) g.add(mesh(boxGeo(0.05, 0.74, 0.8, 0), M.metalPainted, x, 0.37, 0));
  g.add(mesh(boxGeo(0.45, 0.6, 0.7, 0), M.metalPainted, 0.95, 0.4, 0));
  const mats = [M.screenBlue, M.screenGreen, M.screenBlue, M.screenTeal];
  [-0.9, -0.3, 0.3, 0.9].forEach((x, i) => {
    const m = monitor(M, mats[i]);
    m.position.set(x, 0.785, -0.2);
    m.rotation.y = -x * 0.25;
    g.add(m);
  });
  g.add(mesh(roundedBox(0.45, 0.02, 0.15, 0.008), M.plasticDark, 0, 0.79, 0.15));
  g.add(mesh(roundedBox(0.07, 0.02, 0.11, 0.01), M.plasticDark, 0.35, 0.79, 0.18));
  return { object: g };
}

export function labTable(def, M) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(3.0, 0.05, 1.0, 0.02), M.plasticWhite, 0, 0.9, 0));
  g.add(mesh(boxGeo(2.9, 0.75, 0.9, 0), M.metalLight, 0, 0.45, 0));
  g.add(mesh(boxGeo(2.92, 0.08, 0.92, 0), M.plasticDark, 0, 0.04, 0));
  for (const x of [-1, 0, 1]) g.add(mesh(boxGeo(0.9, 0.02, 0.01, 0), M.metalDark, x, 0.6, 0.455));
  // 위 장비: 현미경, 비커, 장비 상자
  const scope = new THREE.Group();
  scope.add(mesh(roundedBox(0.2, 0.04, 0.25, 0.01), M.plasticWhite, 0, 0.02, 0));
  scope.add(mesh(boxGeo(0.05, 0.3, 0.05, 0), M.plasticWhite, 0, 0.16, -0.08));
  scope.add(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.2, 10), M.plasticDark, 0, 0.27, -0.02, 0.5, 0, 0));
  scope.position.set(-1.0, 0.925, 0.05);
  g.add(scope);
  const beaker = lathe([[0, 0], [0.05, 0], [0.05, 0.14], [0.058, 0.15]], 12);
  [[-0.5, 0.1], [-0.38, -0.12], [0.2, 0.2]].forEach(([x, z]) => {
    const b = mesh(beaker, M.glass, x, 0.925, z); b.userData.noMerge = true; g.add(b);
    const l = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), M.liquid, x, 0.96, z); l.userData.noMerge = true; g.add(l);
  });
  g.add(mesh(roundedBox(0.5, 0.25, 0.4, 0.02), M.plasticGrey, 0.8, 1.05, -0.1));
  const sc = mesh(new THREE.PlaneGeometry(0.2, 0.1), M.screenOff, 0.8, 1.08, 0.105); sc.castShadow = false; g.add(sc);
  return { object: g };
}

export function specimenTank(def, M) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.35, 18), M.metalDark, 0, 0.175, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.3, 18), M.metalDark, 0, 2.25, 0));
  const glass = mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.75, 20, 1, true), M.glass, 0, 1.225, 0);
  glass.userData.noMerge = true;
  const liquid = mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.6, 18), M.liquid, 0, 1.17, 0);
  liquid.userData.noMerge = true;
  g.add(glass, liquid);
  // 표본 실루엣 (추상적인 형체)
  const blob = mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0b2a2a, roughness: 0.6 }), 0, 1.25, 0);
  blob.scale.set(1, 1.8, 0.9);
  g.add(blob);
  for (const a of [0, 2.1, 4.2]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 6), M.metal, Math.cos(a) * 0.47, 1.22, Math.sin(a) * 0.47));
  const ring = mesh(new THREE.TorusGeometry(0.47, 0.025, 6, 20), M.metalDark, 0, 0.36, 0, Math.PI / 2, 0, 0); // 조명 링 꺼짐
  ring.castShadow = false;
  g.add(ring);
  return { object: g };
}

export function fumeHood(def, M) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(1.8, 0.9, 0.85, 0), M.metalLight, 0, 0.45, 0));
  g.add(mesh(boxGeo(1.8, 0.05, 0.85, 0), M.plasticDark, 0, 0.92, 0));
  g.add(mesh(boxGeo(1.8, 1.2, 0.08, 0), M.metalLight, 0, 1.55, -0.39));
  for (const x of [-0.88, 0.88]) g.add(mesh(boxGeo(0.06, 1.2, 0.85, 0), M.metalLight, x, 1.55, 0));
  g.add(mesh(boxGeo(1.8, 0.35, 0.85, 0), M.metalLight, 0, 2.32, 0));
  const sash = mesh(boxGeo(1.7, 0.7, 0.02, 0), M.glass, 0, 1.75, 0.4); sash.userData.noMerge = true; g.add(sash);
  g.add(mesh(boxGeo(1.7, 0.04, 0.05, 0), M.metal, 0, 1.4, 0.42));
  const lamp = mesh(boxGeo(1.5, 0.03, 0.12, 0), M.lightPanelOff, 0, 2.13, -0.1); lamp.castShadow = false; g.add(lamp);
  return { object: g };
}

// 서버랙 한 줄: from [x, z]에서 +x 방향으로 count개. faceDeg로 각 랙의 앞면 방향.
export function rackRow(def, M) {
  const g = new THREE.Group();
  const n = def.count || 8, w = 0.64, h = 2.1, d = 1.0;
  const face = ((def.faceDeg || 0) * Math.PI) / 180;
  const ledMats = [M.ledBlue, M.ledGreen, M.ledBlue, M.ledAmber];
  for (let i = 0; i < n; i++) {
    const r = new THREE.Group();
    r.add(mesh(boxGeo(w - 0.02, h, d, 0), M.metalDark, 0, h / 2, 0));
    r.add(mesh(boxGeo(w - 0.06, h - 0.12, 0.02, 0), M.plasticDark, 0, h / 2, d / 2 + 0.005));
    for (let k = 0; k < 9; k++) {
      const y = 0.2 + k * 0.2;
      r.add(mesh(boxGeo(w - 0.12, 0.012, 0.012, 0), M.metal, 0, y, d / 2 + 0.02));
      const led = mesh(boxGeo(0.04, 0.012, 0.01, 0), ledMats[(i + k) % 4], -0.18 + ((i * 7 + k * 3) % 5) * 0.07, y + 0.05, d / 2 + 0.02);
      led.castShadow = false;
      r.add(led);
    }
    r.position.set(def.from[0] + i * w, 0, def.from[1]);
    r.rotation.y = face;
    g.add(r);
  }
  // 위 케이블 트레이
  g.add(mesh(boxGeo(n * w, 0.08, 0.4, 0), M.metal, def.from[0] + ((n - 1) * w) / 2, h + 0.35, def.from[1]));
  return { object: g, absolute: true };
}

export function controlConsole(def, M) {
  const g = new THREE.Group();
  // 살짝 휜 콘솔: 3개의 블록을 각도를 줘서 배치
  [-1.15, 0, 1.15].forEach((x, i) => {
    const b = new THREE.Group();
    b.add(mesh(boxGeo(1.15, 0.8, 0.7, 0), M.metalDark, 0, 0.4, 0));
    const top = mesh(boxGeo(1.15, 0.05, 0.75, 0), M.plasticDark, 0, 0.84, 0.05, -0.25, 0, 0);
    b.add(top);
    const panel = mesh(new THREE.PlaneGeometry(0.9, 0.4), i === 1 ? M.screenAmber : M.screenBlue, 0, 0.875, 0.06, -Math.PI / 2 - 0.25, 0, 0);
    panel.castShadow = false;
    b.add(panel);
    const mon = monitor(M, i === 1 ? M.screenAmber : M.screenBlue, 0.6, 0.36);
    mon.position.set(0, 0.86, -0.25);
    b.add(mon);
    b.position.set(x, 0, Math.abs(x) * 0.2);
    b.rotation.y = -x * 0.25;
    g.add(b);
  });
  return { object: g };
}

export function wallScreens(def, M) {
  const g = new THREE.Group();
  const mats = [M.screenBlue, M.screenAmber, M.screenBlue];
  [-2.2, 0, 2.2].forEach((x, i) => {
    g.add(mesh(boxGeo(2.0, 1.2, 0.08, 0), M.plasticDark, x, 1.9, 0.04));
    const s = mesh(new THREE.PlaneGeometry(1.9, 1.1), mats[i], x, 1.9, 0.085);
    s.castShadow = false;
    g.add(s);
  });
  return { object: g, collide: false };
}

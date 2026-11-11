// 공군기지: 활주로(표지 텍스처), 활주로 등, 주기장, 격납고·관제탑 실루엣. 전부 코드로 만든다.
// 이륙 구간에서만 가까이 보이므로 가볍게 만든다(드로우콜 4개, 모든 프리셋 공용).
import * as THREE from 'three';
import { Surf } from '../entities/hi/surface.js';

function runwayTexture(cfg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4096;
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.fillStyle = cfg.colors.asphalt;
  g.fillRect(0, 0, W, H);
  // 타이어 자국·얼룩
  let seed = 3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rnd() * 0.05})`; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 10, 20 + rnd() * 160); }
  for (const end of [0, 1]) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(W * 0.3, end ? H - 900 : 300, W * 0.4, 600); }
  g.fillStyle = cfg.colors.mark;
  g.fillRect(8, 0, 5, H); g.fillRect(W - 13, 0, 5, H); // 가장자리 선
  for (let y = 240; y < H - 240; y += 110) g.fillRect(W / 2 - 3, y, 6, 60); // 중심선
  for (const y0 of [40, H - 150]) for (let i = 0; i < 8; i++) g.fillRect(24 + i * 27, y0, 16, 110); // 활주로 끝 줄무늬
  g.font = '700 110px Arial, sans-serif'; g.textAlign = 'center';
  g.save(); g.translate(W / 2, H - 190); g.fillText('36', 0, 0); g.restore();
  g.save(); g.translate(W / 2, 190); g.rotate(Math.PI); g.fillText('18', 0, 0); g.restore();
  for (const y of [520, 900, H - 520, H - 900]) { g.fillRect(50, y, 40, 90); g.fillRect(W - 90, y, 40, 90); } // 접지 표지
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** @param {object} cfg data/takeoff.js 의 AIRBASE */
export function createAirbase(cfg) {
  const group = new THREE.Group();
  group.name = 'airbase';
  const R = cfg.runway;
  const tex = runwayTexture(cfg);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(R.width, R.length), new THREE.MeshLambertMaterial({ map: tex }));
  runway.rotation.x = -Math.PI / 2;
  runway.position.y = 0.5;
  group.add(runway);

  // 주기장·유도로(콘크리트)와 건물
  const flat = new Surf();
  const quad = (x0, x1, z0, z1, y) => flat.grid(1, 1, (u, v) => [x0 + (x1 - x0) * u, y, z0 + (z1 - z0) * v], { ref: [0, -100, 0] });
  quad(60, 420, -700, 500, 0.3); // 주기장
  quad(23, 60, -520, -470, 0.3); quad(23, 60, 300, 350, 0.3); // 연결 유도로
  quad(-150, -23, 1150, 1210, 0.3);
  const apron = new THREE.Mesh(flat.build(), new THREE.MeshLambertMaterial({ color: cfg.colors.apron }));
  group.add(apron);

  const B = new Surf();
  const roof = new Surf();
  // 격납고(아치 지붕) 5동
  for (let i = 0; i < 5; i++) {
    const cx = 330, cz = -600 + i * 250, w = 46, len = 60, h = 15;
    B.box([cx, 5, cz], [len, 10, w * 2]);
    roof.grid(10, 1, (u, v) => { const a = Math.PI * u; return [cx - len / 2 + v * len, 10 + Math.sin(a) * (h - 10), cz - Math.cos(a) * w]; }, { ref: [cx, 0, cz] });
  }
  // 관제탑, 부속 건물, 연료 탱크
  B.box([470, 16, 420], [12, 32, 12]);
  roof.box([470, 35, 420], [20, 6, 20]);
  B.box([480, 6, 300], [70, 12, 40]); B.box([500, 4, 150], [40, 8, 90]); B.box([430, 5, -760], [50, 10, 30]);
  for (let i = 0; i < 4; i++) roof.tube([[560, 0, -300 + i * 46], [560, 14, -300 + i * 46]], 15, 12);
  // 활주로 건너편의 낮은 구조물과 방호벽
  B.box([-260, 3, -300], [60, 6, 24]); B.box([-300, 3, 500], [30, 6, 60]);
  for (let i = 0; i < 6; i++) B.box([-180, 2.5, -900 + i * 320], [8, 5, 90]);
  const buildings = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ color: cfg.colors.hangar }));
  const roofs = new THREE.Mesh(roof.build(), new THREE.MeshLambertMaterial({ color: cfg.colors.roof }));
  group.add(buildings, roofs);

  // 활주로 등: 가장자리 흰색, 양 끝은 초록·빨강
  const lights = [];
  for (let z = -R.length / 2; z <= R.length / 2; z += cfg.lightSpacing) for (const side of [-1, 1]) lights.push([side * (R.width / 2 + 2), z, 0xfff4d6]);
  for (let x = -R.width / 2; x <= R.width / 2; x += 5) { lights.push([x, R.length / 2 + 4, 0x35ff6a]); lights.push([x, -R.length / 2 - 4, 0xff3a2a]); }
  const lightMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 6, 4), new THREE.MeshBasicMaterial({ fog: false }), lights.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  lights.forEach(([x, z, hex], i) => { lightMesh.setMatrixAt(i, m.makeTranslation(x, 1.1, z)); lightMesh.setColorAt(i, col.setHex(hex).multiplyScalar(2.5)); });
  group.add(lightMesh);
  for (const o of [runway, apron, buildings, roofs]) o.receiveShadow = true;

  let triangles = 0;
  group.traverse((o) => { if (o.isMesh) triangles += ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); });
  return { group, triangles };
}

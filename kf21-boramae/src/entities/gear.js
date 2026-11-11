// 랜딩기어(앞바퀴 1조 + 주바퀴 2조)와 하부 도어. 낮음·높음·최고가 같은 코드를 쓰고 분할 수만 다르다.
// setDown(k): 1 = 완전히 내림, 0 = 완전히 접음(동체 안으로 앞으로 접힌다).
import * as THREE from 'three';
import { Surf } from './hi/surface.js';
import { Z } from './kf21-shape.js';

export const GEAR = {
  nose: { x: 0, y: -0.74, s: 4.0, length: 1.16, wheelR: 0.22, wheelW: 0.11, twin: 0.15, lean: -0.1 },
  main: { x: 1.22, y: -0.8, s: 9.7, length: 1.02, wheelR: 0.31, wheelW: 0.2, splay: 0.3 },
  retractAngle: 1.66, // 접힐 때 회전(rad)
  doorAngle: 1.45,
};
/** 모델 원점에서 바퀴 바닥까지의 높이(m): 지상에 서 있을 때 기체 원점의 높이 */
export const GEAR_HEIGHT = 2.13;

function wheel(S, c, r, w, sides) {
  const prof = [[-w / 2, r * 0.5], [-w / 2, r * 0.9], [-w * 0.3, r], [w * 0.3, r], [w / 2, r * 0.9], [w / 2, r * 0.5]];
  S.loft(sides, prof.length - 1, (u, v) => {
    const p = prof[Math.round(v * (prof.length - 1))];
    const a = u * Math.PI * 2;
    return [c[0] + p[0], c[1] + Math.cos(a) * p[1], c[2] + Math.sin(a) * p[1]];
  }, { ref: c });
}
function hub(S, c, r, w, sides) {
  for (const side of [-1, 1]) {
    const ring = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; ring.push([c[0] + side * w * 0.5, c[1] + Math.cos(a) * r * 0.5, c[2] + Math.sin(a) * r * 0.5]); }
    S.cap(ring, c);
  }
}

/**
 * @param {object} o
 * @param {number} o.sides 원형 분할 수
 * @param {THREE.Material} o.metal 지주 재질
 * @param {THREE.Material} o.tire 타이어 재질
 * @param {THREE.Material} o.door 도어 재질(동체와 같은 색)
 */
export function createGear({ sides, metal, tire, door }) {
  const group = new THREE.Group();
  group.name = 'gear';
  const legs = [];
  const doors = [];
  const geometries = [];

  const addLeg = (hinge, build) => {
    const pivot = new THREE.Group();
    pivot.position.set(hinge[0], hinge[1], hinge[2]);
    const sm = new Surf();
    const st = new Surf();
    build(sm, st);
    const gm = sm.build(), gt = st.build();
    geometries.push(gm, gt);
    const a = new THREE.Mesh(gm, metal), b = new THREE.Mesh(gt, tire);
    a.castShadow = b.castShadow = true;
    pivot.add(a, b);
    group.add(pivot);
    legs.push(pivot);
  };

  // 앞바퀴(쌍륜)
  const n = GEAR.nose;
  addLeg([n.x, n.y, Z(n.s)], (sm, st) => {
    const foot = [0, -n.length, n.lean];
    sm.tube([[0, 0.1, 0], [0, -n.length * 0.55, n.lean * 0.5], foot], (v) => 0.05 - v * 0.012, sides);
    sm.tube([[-n.twin - 0.02, foot[1], foot[2]], [n.twin + 0.02, foot[1], foot[2]]], 0.028, sides);
    sm.tube([[0, -0.2, 0], [0, -n.length * 0.6, 0.26]], 0.02, Math.max(5, sides - 4)); // 버팀대
    sm.box([0, -n.length * 0.42, n.lean * 0.4 - 0.06], [0.07, 0.09, 0.05]); // 착륙등
    for (const side of [-1, 1]) {
      const c = [side * n.twin, foot[1], foot[2]];
      wheel(st, c, n.wheelR, n.wheelW, sides * 2);
      hub(sm, c, n.wheelR, n.wheelW, sides);
    }
  });
  // 주바퀴
  const m = GEAR.main;
  for (const side of [1, -1]) {
    addLeg([side * m.x, m.y, Z(m.s)], (sm, st) => {
      const foot = [side * m.splay, -m.length, 0];
      sm.tube([[0, 0.1, 0], [side * m.splay * 0.5, -m.length * 0.55, 0.02], foot], (v) => 0.062 - v * 0.014, sides);
      sm.tube([[0, -0.15, 0], [side * m.splay * 0.6, -m.length * 0.62, -0.3]], 0.024, Math.max(5, sides - 4));
      sm.tube([foot, [side * (m.splay + 0.13), foot[1], 0]], 0.034, sides);
      const c = [side * (m.splay + 0.12), foot[1], 0];
      wheel(st, c, m.wheelR, m.wheelW, sides * 2);
      hub(sm, c, m.wheelR, m.wheelW, sides);
    });
  }

  // 도어: 기어 구멍 옆에서 아래로 열리는 판(닫히면 숨긴다 — 동체 표면과 겹치므로)
  const doorDefs = [
    { hx: 0.2, y: n.y - 0.04, s0: n.s - 1.05, s1: n.s + 0.25, w: 0.2, dir: 1 },
    { hx: -0.2, y: n.y - 0.04, s0: n.s - 1.05, s1: n.s + 0.25, w: 0.2, dir: -1 },
    { hx: m.x + 0.36, y: m.y - 0.02, s0: m.s - 1.25, s1: m.s + 0.42, w: 0.36, dir: 1 },
    { hx: -m.x - 0.36, y: m.y - 0.02, s0: m.s - 1.25, s1: m.s + 0.42, w: 0.36, dir: -1 },
  ];
  for (const d of doorDefs) {
    const pivot = new THREE.Group();
    pivot.position.set(d.hx, d.y, 0);
    const S = new Surf();
    S.box([-d.dir * d.w / 2, 0, Z((d.s0 + d.s1) / 2)], [d.w, 0.02, d.s1 - d.s0]);
    const g = S.build();
    geometries.push(g);
    const mesh = new THREE.Mesh(g, door);
    mesh.castShadow = true;
    pivot.add(mesh);
    pivot.userData.dir = d.dir;
    group.add(pivot);
    doors.push(pivot);
  }

  let current = -1;
  /** @param {number} k 0(접힘) ~ 1(내림) */
  function setDown(k) {
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    if (Math.abs(k - current) < 0.0005) return;
    current = k;
    group.visible = k > 0.001;
    if (!group.visible) return;
    // 도어가 먼저 열리고(0~0.3) 다리가 내려온다(0.15~1)
    const leg = Math.min(1, Math.max(0, (k - 0.15) / 0.85));
    const dk = Math.min(1, k / 0.3);
    const e = leg * leg * (3 - 2 * leg);
    for (const p of legs) p.rotation.x = (1 - e) * GEAR.retractAngle;
    for (const p of doors) p.rotation.z = -p.userData.dir * dk * GEAR.doorAngle;
  }
  setDown(0);
  return { group, setDown, dispose() { for (const g of geometries) g.dispose(); } };
}

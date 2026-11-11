// 적기 하이폴리(높음 약 4만, 최고 약 8만 삼각형). 플레이어 기체보다 덜 촘촘하게 만든다.
// 낮음 모델과 같은 형상(델타익 단발기)을 매끄러운 곡면·익형 단면으로 다시 만든 것. 지오메트리·재질은 모든 적기가 공유한다.
import * as THREE from 'three';
import { Surf, spline } from './surface.js';
import { wingPanel } from './kf21-hi.js';
import { PALETTE } from '../../data/palette.js';

const P = PALETTE.enemy;
const TAU = Math.PI * 2;
// 낮음 모델(enemy-model.js)의 표와 같은 값. s는 기수에서의 거리, 모델 원점은 s = 7.4
const BODY = [[0, 0.03, 0.03, 0.03], [1.4, 0.34, 0.3, 0.3], [3.6, 0.62, 0.56, 0.5], [6.8, 0.82, 0.66, 0.62], [10.6, 0.74, 0.62, 0.58], [13.0, 0.56, 0.52, 0.5], [13.9, 0.46, 0.44, 0.44]];
const SHIFT = 8.7 - 7.4; // wingPanel은 KF-21 기준(z = s − 8.7)이라 그만큼 옮겨서 넘긴다
const ZE = (s) => s - 7.4;
const st = (span, le, te, t) => ({ span, le: le + SHIFT, te: te + SHIFT, t });
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

const cache = new Map();

function build(detail) {
  const k = detail >= 2 ? 1.95 : 1.37;
  const N = (n) => Math.max(3, Math.round(n * k));
  const col = (i) => BODY.map((r) => r[i]);
  const w = spline(col(0), col(1)), top = spline(col(0), col(2)), bot = spline(col(0), col(3));
  const END = 13.9;
  const body = new Surf(), accent = new Surf(), dark = new Surf(), glass = new Surf();
  const fus = (u, s) => { const a = Math.PI - u * TAU; const cy = Math.cos(a); return [w(s) * spow(Math.sin(a), 0.9), (cy >= 0 ? top(s) : bot(s)) * spow(cy, 1.18), ZE(s)]; };
  // 동체: 기수 끝은 붉게(식별 띠)
  accent.loft(N(56), N(12), (u, v) => fus(u, v * 1.4));
  body.loft(N(56), N(96), (u, v) => fus(u, 1.4 + v * (END - 1.4)));
  const ring = []; for (let i = 0; i < 28; i++) ring.push(fus(i / 28, END));
  dark.cap(ring, [0, 0, ZE(END) - 1]);
  // 노즐
  body.loft(N(28), 3, (u, v) => [Math.cos(u * TAU) * (0.47 - v * 0.07), Math.sin(u * TAU) * (0.45 - v * 0.07), ZE(END - 0.1 + v * 0.75)], { ref: [0, 0, ZE(END)] });
  dark.loft(N(24), 2, (u, v) => [Math.cos(u * TAU) * 0.38, Math.sin(u * TAU) * 0.36, ZE(END + 0.65 - v * 1.1)], { inward: true });
  // 캐노피
  const cw = spline([2.5, 3.3, 4.3, 5.6, 6.4], [0.04, 0.3, 0.36, 0.26, 0.06]), ch = spline([2.5, 3.3, 4.3, 5.6, 6.4], [0.02, 0.3, 0.42, 0.24, 0.03]), cb = spline([2.5, 3.3, 4.3, 5.6, 6.4], [0.44, 0.46, 0.5, 0.56, 0.6]);
  glass.grid(N(20), N(22), (u, v) => { const s = 2.52 + v * 3.86; const a = Math.PI * u; return [-Math.cos(a) * cw(s), cb(s) - 0.04 + Math.pow(Math.sin(a), 0.85) * ch(s), ZE(s)]; }, { ref: [0, 0.2, ZE(4.5)] });

  for (const [S, part] of [[body, 'in'], [accent, 'out']]) {
    S.mirror(() => {
      const y = -0.12;
      const root = st(0.5, 4.6, 11.7, 0.34), mid = st(3.2, 8.9, 11.75, 0.16), tip = st(4.5, 10.95, 11.8, 0.07);
      if (part === 'in') {
        wingPanel(S, root, mid, y, { nC: N(16), nS: N(24), capB: false }); // 삼각 주익 안쪽
        wingPanel(S, st(0.4, 11.4, 13.5, 0.16), st(2.3, 12.9, 13.7, 0.05), 0.05, { nC: N(10), nS: N(12) }); // 수평미익
        // 측면 흡입구
        S.loft(N(20), N(8), (u, v) => { const a = u * TAU; return [0.74 + spow(Math.cos(a), 0.5) * 0.24, -0.05 + spow(Math.sin(a), 0.5) * 0.3, ZE(4.2 + v * 3.0) + (1 - v) * (1 - v) * 0.2 * Math.cos(a)]; });
      } else {
        wingPanel(S, mid, tip, y, { nC: N(16), nS: N(10), capA: false }); // 바깥쪽은 붉게
      }
    });
    // 수직미익 1장(위쪽은 붉게)
    const up = new THREE.Matrix4().makeTranslation(0, 0.4, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    S.withMatrix(up, () => {
      const r = st(0, 8.9, 13.1, 0.22), m = st(1.7, 11.0, 13.45, 0.13), t = st(2.9, 12.45, 13.7, 0.07);
      if (part === 'in') wingPanel(S, r, m, 0, { nC: N(14), nS: N(14), capB: false }); else wingPanel(S, m, t, 0, { nC: N(14), nS: N(10), capA: false });
    });
  }
  // 흡입구 안쪽
  dark.mirror(() => {
    const r = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; r.push([0.74 + spow(Math.cos(a), 0.5) * 0.21, -0.05 + spow(Math.sin(a), 0.5) * 0.27, ZE(4.26) + 0.2 * Math.cos(a)]); }
    dark.cap(r, [0.74, -0.05, ZE(8)]);
  });

  const geos = { body: body.build(), accent: accent.build(), dark: dark.build(), glass: glass.build() };
  const mats = {
    body: new THREE.MeshStandardMaterial({ color: P.base, roughness: 0.5, metalness: 0.55 }),
    accent: new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.45, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.9, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.08, metalness: 0.95, envMapIntensity: 1.6 }),
    glow: new THREE.MeshBasicMaterial({ color: P.exhaust }),
  };
  mats.glow.color.multiplyScalar(3); // 블룸에 걸리는 엔진 불빛
  geos.glow = new THREE.CircleGeometry(0.34, 16);
  let triangles = 0;
  for (const g of Object.values(geos)) triangles += g.index.count / 3;
  return { geos, mats, triangles };
}

/** detail(1|2)에 맞는 공유 지오메트리·재질로 메시들을 만들어 group에 넣는다. */
export function addEnemyHiMeshes(group, detail) {
  if (!cache.has(detail)) cache.set(detail, build(detail));
  const s = cache.get(detail);
  for (const key of ['body', 'accent', 'dark', 'glass']) group.add(new THREE.Mesh(s.geos[key], s.mats[key]));
  const glow = new THREE.Mesh(s.geos.glow, s.mats.glow);
  glow.position.set(0, 0, ZE(13.9) + 0.1);
  group.add(glow);
  return s.triangles;
}

/** 프리셋이 바뀌면 안 쓰는 detail의 리소스를 버린다. */
export function disposeEnemyHi(keepDetail = 0) {
  for (const [detail, s] of cache) {
    if (detail === keepDetail) continue;
    for (const g of Object.values(s.geos)) g.dispose();
    for (const m of Object.values(s.mats)) m.dispose();
    cache.delete(detail);
  }
}

export const ENEMY_NOZZLE_Z = ZE(14.55);

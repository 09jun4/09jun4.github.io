// 화면 판정: 시점 v 에서 화면의 한 점에 실제로 그려지는 것(가장 앞)을 계산해요.
// 화면 점은 '지면 좌표' (a, b) 로 나타내요: 3D 점 (X,Y,Z) 는 (X - sx·Y, Z - sz·Y) 에 그려져요.
// 그 점을 지나는 시선 P(t) = (a + sx·t, t, b + sz·t) 에서 t 가 클수록 카메라에 가까워요.
// 그리는 것: 걸을 수 있는 윗면, 세워진 종이(벽), 장식 탑·기둥. → { top:[x,y,z] } | { occ:true } | null
import { VIEWS, ckey, parseKey } from './math.js';

export const ghost = (X, Y, Z, v) => [X - VIEWS[v][0] * Y, Z - VIEWS[v][1] * Y];

function prepare(sim) {
  if (sim._scrPrep) return sim._scrPrep;
  let minY = Infinity, maxY = -Infinity;
  for (const k of sim.res.top.keys()) { const y = parseKey(k)[1]; minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const walls = [];
  for (const w of sim.geo.walls) {
    if (w.lip || !sim.active.has(w.face)) continue; // 낮은 턱은 가리지 않아요
    // 키 형식: x벽 'x{평면x},{높이},{z칸}', z벽 'z{x칸},{높이},{평면z}'
    const ax = w.ek[0], n = w.ek.slice(1).split(',').map(Number);
    walls.push(ax === 'x' ? { ax, c: n[0], y: n[1], s: n[2] } : { ax, c: n[2], y: n[1], s: n[0] });
  }
  const boxes = [];
  for (const d of sim.stage.decor || []) {
    if (d.type === 'arch') continue;
    let [w, h, dd] = d.size; const [x, y, z] = d.at;
    if (d.type === 'cone' || d.type === 'dome') { w *= 0.55; dd *= 0.55; h *= 0.7; } // 뾰족한 지붕은 가운데 몸통만
    boxes.push({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - dd / 2, z1: z + dd / 2 });
  }
  return (sim._scrPrep = { minY, maxY, walls, boxes, cache: new Map() });
}

export function ownerAt(sim, a, b, v) {
  const P = prepare(sim), ck = v + ':' + a + ':' + b;
  if (P.cache.has(ck)) return P.cache.get(ck);
  const [sx, sz] = VIEWS[v];
  let best = null, bt = -Infinity;
  // 윗면: 위에서부터 첫 번째로 맞는 칸
  for (let y = P.maxY; y >= P.minY; y--) {
    const x = Math.floor(a + sx * y), z = Math.floor(b + sz * y), k = ckey(x, y, z);
    if (sim.res.top.has(k)) { best = { top: [x, y, z] }; bt = y; break; }
  }
  // 세워진 종이: 같은 높이면 윗면이 이겨요(모서리)
  for (const w of P.walls) {
    const t = w.ax === 'x' ? (w.c - a) / sx : (w.c - b) / sz;
    if (t <= bt || t < w.y || t > w.y + 1) continue;
    const s = w.ax === 'x' ? b + sz * t : a + sx * t;
    if (s > w.s && s < w.s + 1) { best = { occ: true }; bt = t; }
  }
  // 장식 탑·기둥 (상자): 시선과 상자가 겹치는 구간의 카메라 쪽 끝
  for (const bx of P.boxes) {
    let lo = bx.y0, hi = bx.y1;
    const tx0 = (bx.x0 - a) / sx, tx1 = (bx.x1 - a) / sx, tz0 = (bx.z0 - b) / sz, tz1 = (bx.z1 - b) / sz;
    lo = Math.max(lo, Math.min(tx0, tx1), Math.min(tz0, tz1));
    hi = Math.min(hi, Math.max(tx0, tx1), Math.max(tz0, tz1));
    if (lo < hi && hi > bt + 1e-6) { best = { occ: true }; bt = hi; }
  }
  P.cache.set(ck, best);
  return best;
}

// 칸 c(바닥 높이 h) 에서 d 방향 경계를 넘을 때 화면에 보이는 것: 경계 안쪽과 바깥쪽 한 점씩
const IN = 0.3, OUT = 0.7;
export function edgeView(sim, c, h, dx, dz, v) {
  const p1 = ghost(c[0] + 0.5 + dx * IN, h, c[2] + 0.5 + dz * IN, v);
  const p2 = ghost(c[0] + 0.5 + dx * OUT, h, c[2] + 0.5 + dz * OUT, v);
  return { inside: ownerAt(sim, p1[0], p1[1], v), outside: ownerAt(sim, p2[0], p2[1], v) };
}

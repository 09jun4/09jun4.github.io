// 공간 연결: 서로 다른 면의 걸을 수 있는 칸이 같은 높이로 맞닿고, 그 경계에 벽·턱이 없으면 '이어진' 거예요.
// 정수 격자에서 정확히 계산하므로 오차 허용이 필요 없고, 떨어져 있거나 높이가 다르면 절대 연결되지 않아요.
// 결과: [{ a, b, key, edges: [{ x, y, z, axis }], length }]  (edges = 경계선 중점, axis = 경계선 방향)
import { ckey, edgeKey, parseKey, DIR4 } from './math.js';
import { neighbor } from './Collision.js';

export function computeConnections(sim) {
  const { res } = sim, map = new Map();
  for (const [k, fa] of res.top) {
    const [x, y, z] = parseKey(k);
    for (const d of [0, 2]) {
      const nk = d === 0 ? ckey(x + 1, y, z) : ckey(x, y, z + 1);
      const fb = res.top.get(nk);
      if (fb === undefined || fb === fa || res.walls.has(edgeKey(x, y, z, d))) continue;
      const pair = fa < fb ? fa + '|' + fb : fb + '|' + fa;
      let c = map.get(pair);
      if (!c) map.set(pair, (c = { a: fa < fb ? fa : fb, b: fa < fb ? fb : fa, key: pair, edges: [], kind: 'seam' }));
      c.edges.push(d === 0 ? { x: x + 1, y, z: z + 0.5, axis: 'z' } : { x: x + 0.5, y, z: z + 1, axis: 'x' });
    }
  }
  // 계단으로 이어진 층
  for (const i of sim.objs) {
    if (i.o.type !== 'stairs' || !i.functional) continue;
    const [x, y, z] = i.cube, d = i.dir4;
    const tk = ckey(x + [1, -1, 0, 0][d], y + 1, z + [0, 0, 1, -1][d]);
    const fb = res.top.get(tk), fa = i.att.face;
    if (fb === undefined || fb === fa) continue;
    const pair = 'stairs|' + i.o.id;
    map.set(pair, { a: fa, b: fb, key: pair, kind: 'stairs', edges: [] });
  }
  for (const c of map.values()) c.length = c.edges.length;
  return [...map.values()];
}

// 지금 시점에서만 성립하는 착시 연결 · 숨은 통로 → 경계선 중점 목록 (화면에서 은은하게 표시)
export function computeIllusions(sim) {
  const out = [];
  if (sim.view === null || sim.view === undefined) return out;
  for (const k of sim.res.top.keys()) {
    const node = parseKey(k);
    const st = sim.occ.get(k), stairs = st && st.o.type === 'stairs' && st.functional;
    for (let d = 0; d < 4; d++) {
      const r = neighbor(sim, node, d);
      if (!r || !r.to || !(r.shift || r.hidden)) continue;
      const e1 = stairs && st.dir4 === d ? 1 : 0, [dx, dz] = DIR4[d];
      out.push({ x: node[0] + 0.5 + dx / 2, y: node[1] + e1, z: node[2] + 0.5 + dz / 2, axis: dx ? 'z' : 'x', hidden: !!r.hidden, from: node, to: r.to });
    }
  }
  return out;
}

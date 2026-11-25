// 퍼즐 상태 계산: 스위치, 광선(거울 반사), 수신기, 문, 출구. 저장하지 않고 논리 상태에서 매번 계산해요.
// 문 ↔ 광선은 서로 영향을 주므로(문이 열리면 빛이 더 멀리 감) 고정점이 될 때까지 반복해요 (단조 증가라 금방 끝나요).
import { DIR4, ckey, edgeKey, dot, sub, scale, dir4Vec, dir4Of } from './math.js';

export function evaluate(sim, opts = {}) {
  const { stage, state, occ, objs, res } = sim;
  const prev = sim.puz;
  const pk = opts.ignorePlayer ? null : ckey(...state.player);
  const occupied = cube => cube === pk || objs.some(b => b.o.type === 'block' && b.upright && b.cubeKey === cube);

  const pressed = {};
  for (const i of objs) if (i.o.type === 'switch') pressed[i.o.id] = i.functional && occupied(i.cubeKey);

  const doors = {};
  for (const i of objs) if (i.o.type === 'door') doors[i.o.id] = state.doorsOpened.includes(i.o.id);
  let lit = {}, beams = [];
  for (let it = 0; it < 6; it++) {
    ({ lit, beams } = traceBeams(sim, doors));
    const on = id => !!(pressed[id] || lit[id]);
    let changed = false;
    for (const i of objs) {
      if (i.o.type !== 'door' || !i.o.when) continue;
      let open = i.o.when.every(on) || state.doorsOpened.includes(i.o.id);
      // 문 안에 무언가 있으면 닫히지 않아요
      if (!open && prev && prev.doors[i.o.id] && occupied(i.cubeKey)) open = true;
      if (open !== doors[i.o.id]) { doors[i.o.id] = open; changed = true; }
    }
    if (!changed) break;
  }
  const active = {};
  for (const i of objs) if (i.o.type === 'switch' || i.o.type === 'receptor') active[i.o.id] = !!(pressed[i.o.id] || lit[i.o.id]);
  const exitActive = stage.goal.requires.every(id => active[id]);
  const ghost = {};
  for (const f of stage.faces) if (f.when) ghost[f.id] = f.when.every(id => active[id]);
  return { pressed, lit, active, doors, beams, exitActive, ghost };
}

// 광선: 각 칸 높이 +0.45 에서 수평으로 진행. 벽·블록·닫힌 문에 막히고, 거울에 90° 반사.
function traceBeams(sim, doors) {
  const { objs, occ, res } = sim, lit = {}, beams = [];
  const b = sim.bounds.rest; // 무대 바깥 3칸까지만 (허공으로 끝없이 뻗지 않게)
  for (const src of objs) {
    if (src.o.type !== 'source' || !src.functional) continue;
    let [x, y, z] = src.cube, d = dir4Of(src.dirW);
    if (d < 0) continue;
    const H = y + 0.45, seen = new Set();
    let start = [x + 0.5, H, z + 0.5];
    const seg = (to) => { beams.push([start, to]); start = to; };
    for (let step = 0; step < 120; step++) {
      const sk = x + ',' + y + ',' + z + ',' + d;
      if (seen.has(sk)) break;
      seen.add(sk);
      const [dx, dz] = DIR4[d];
      const edgeP = [x + 0.5 + dx * 0.5, H, z + 0.5 + dz * 0.5];
      if (res.walls.has(edgeKey(x, y, z, d))) { seg(edgeP); break; }
      x += dx; z += dz;
      if (x < b.min[0] - 3 || x > b.max[0] + 2 || z < b.min[2] - 3 || z > b.max[2] + 2) { seg([x + 0.5, H, z + 0.5]); break; }
      const o = occ.get(ckey(x, y, z));
      if (!o) continue;
      const t = o.o.type, c = [x + 0.5, H, z + 0.5];
      if (t === 'mirror' && o.functional) {
        seg(c);
        const n = o.mirrorN, v = dir4Vec(d), k = dot(v, n);
        d = dir4Of(sub(v, scale(n, k)));
        if (d < 0) break;
        continue;
      }
      if (t === 'receptor' && o.functional) { seg(c); lit[o.o.id] = true; break; }
      if (t === 'door' && doors[o.o.id]) continue;
      if (t === 'key' && !o.functional) continue;
      seg([x + 0.5 - dx * 0.4, H, z + 0.5 - dz * 0.4]); // 막는 물체 앞면에서 멈춤
      break;
    }
  }
  return { lit, beams };
}

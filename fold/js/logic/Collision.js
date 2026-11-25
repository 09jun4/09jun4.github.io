// 이동 판정 (Collision Layer): 걸을 수 있는 칸, 이웃 칸으로 넘어갈 수 있는지, 밀기·회전 같은 접촉 결과.
// 노드 = [ix, level, iz]. 플레이어는 위를 향한 수평 면(맨 위 면) 위에서만 걷고, 높이 차이는 계단으로만 넘어요.
import { DIR4, OPP4, ckey, edgeKey } from './math.js';

export function neighbor(sim, node, d) {
  const [ix, y, iz] = node, [dx, dz] = DIR4[d];
  const { res, occ } = sim;
  const here = occ.get(ckey(ix, y, iz));
  if (here && here.o.type === 'stairs' && here.functional) {
    if (d === here.dir4) { // 계단 위쪽 끝 → 한 층 위 칸
      if (res.walls.has(edgeKey(ix, y + 1, iz, d))) return null;
      return enter(sim, [ix + dx, y + 1, iz + dz], d, y + 1, ix, iz);
    }
    if (d !== OPP4[here.dir4]) return null; // 계단 옆으로는 못 내려가요
  }
  if (!res.walls.has(edgeKey(ix, y, iz, d))) {
    const t = [ix + dx, y, iz + dz];
    if (res.top.has(ckey(t[0], y, t[2]))) return enter(sim, t, d, y, ix, iz);
  }
  // 한 층 아래 계단의 꼭대기로 내려가기
  const down = [ix + dx, y - 1, iz + dz], o = occ.get(ckey(down[0], y - 1, down[2]));
  if (o && o.o.type === 'stairs' && o.functional && o.dir4 === OPP4[d] && res.top.has(ckey(down[0], y - 1, down[2]))
    && !res.walls.has(edgeKey(ix, y, iz, d))) return { kind: 'move', to: down };
  return null;
}

function enter(sim, t, d, y) {
  const k = ckey(t[0], t[1], t[2]);
  if (!sim.res.top.has(k)) return null;
  const o = sim.occ.get(k);
  if (!o) return { kind: 'move', to: t };
  const type = o.o.type;
  if (type === 'stairs') return o.functional && o.dir4 === d ? { kind: 'move', to: t } : { kind: 'blocked', obj: o };
  if (type === 'key') return o.functional ? { kind: 'move', to: t } : { kind: 'blocked', obj: o };
  if (type === 'door') {
    if (sim.puz.doors[o.o.id]) return { kind: 'move', to: t };
    if (o.o.key && sim.state.keysHeld.includes(o.o.key) && o.functional) return { kind: 'unlock', obj: o, to: t };
    return { kind: 'blocked', obj: o, locked: !!o.o.key };
  }
  if (type === 'mirror') return { kind: 'mirror', obj: o };
  if (type === 'block' && o.upright) {
    const [dx, dz] = DIR4[d], u = [t[0] + dx, y, t[2] + dz], uk = ckey(u[0], y, u[2]);
    const ok = sim.res.top.has(uk) && !sim.res.walls.has(edgeKey(t[0], y, t[2], d)) && !sim.occ.has(uk)
      && !(sim.flat.get(uk) && sim.flat.get(uk).o.type === 'exit');
    return { kind: 'push', obj: o, to: u, ok };
  }
  return { kind: 'blocked', obj: o };
}

// 플레이어가 걸어서 갈 수 있는 칸 (BFS). prev 로 경로 복원 가능.
// unlock: 열쇠를 가진 잠긴 문도 지나갈 수 있는 칸으로 봄 (플레이어 길찾기용 — 걸어 들어가면 열려요)
export function reachable(sim, start, limit = 4000, unlock = false) {
  const sk = ckey(...start), prev = new Map([[sk, null]]), q = [start];
  for (let h = 0; h < q.length && q.length < limit; h++) {
    const n = q[h], nk = ckey(...n);
    for (let d = 0; d < 4; d++) {
      const r = neighbor(sim, n, d);
      if (!r || !(r.kind === 'move' || (unlock && r.kind === 'unlock'))) continue;
      const k = ckey(...r.to);
      if (prev.has(k)) continue;
      prev.set(k, nk); q.push(r.to);
    }
  }
  return { nodes: q, prev };
}

export function pathTo(sim, start, goalKey, unlock = false) {
  const { prev } = reachable(sim, start, 4000, unlock);
  if (!prev.has(goalKey)) return null;
  const path = [];
  for (let k = goalKey; k; k = prev.get(k)) path.push(k.split(',').map(Number));
  return path.reverse();
}

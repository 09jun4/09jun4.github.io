// 이동 판정 (Collision Layer): 걸을 수 있는 칸, 이웃 칸으로 넘어갈 수 있는지, 밀기·회전 같은 접촉 결과.
// 노드 = [ix, level, iz]. 플레이어는 위를 향한 수평 면(맨 위 면) 위에서만 걷고, 높이 차이는 계단으로만 넘어요.
import { DIR4, OPP4, ckey, edgeKey } from './math.js';
import { edgeView, ghost } from './Screen.js';

// d 방향으로 한 칸 나아갈 때의 결과 — "화면에 보이는 것이 곧 길".
// 시점이 정해져 있으면, 지금 칸의 경계가 화면에 보일 때 그 바로 너머에 그려진 것이 무엇인지로 정해요:
//   윗면이 보이면 그 칸으로 (실제로는 높이·거리가 달라도), 벽·탑이 보이면 막힘.
//   지금 칸 경계가 다른 것에 가려져 있으면 실제로 붙은 칸으로만 걸어요.
// 착시 칸으로 넘어가면 shift(= k·V, 화면에서는 보이지 않는 이동)를 함께 돌려줘요. 마지막으로 기둥 뒤 숨은 통로.
export function neighbor(sim, node, d) {
  const [x, y, z] = node, [dx, dz] = DIR4[d], od = OPP4[d];
  const { res, occ } = sim;
  const here = occ.get(ckey(x, y, z));
  let e1 = 0; // 내 쪽 경계 높이 (계단 꼭대기로 나가면 1)
  const onStairs = here && here.o.type === 'stairs' && here.functional;
  if (onStairs) {
    if (d === here.dir4) e1 = 1;
    else if (d !== OPP4[here.dir4]) return null; // 계단 옆으로는 못 내려가요
  }
  if (res.walls.has(edgeKey(x, y + e1, z, d))) return null;
  const v = sim.view;
  // 실제로 아래 계단 꼭대기로 내려가는 길은 계단 구조 그대로
  const down = [x + dx, y + e1 - 1, z + dz];
  const downOk = () => res.top.has(ckey(...down)) ? accept(sim, down, d, od, 1) : null;
  if (v !== null && v !== undefined) {
    const ev = edgeView(sim, node, y + e1, dx, dz, v);
    const mine = onStairs || (ev.inside && ev.inside.top && ev.inside.top[0] === x && ev.inside.top[1] === y && ev.inside.top[2] === z);
    if (mine) {
      const dr = downOk();
      if (dr) return dr;
      const o = ev.outside;
      if (o && o.top) {
        const t = o.top, r = accept(sim, t, d, od, 0);
        if (r) {
          const sh = [t[0] - x - dx, t[1] - y - e1, t[2] - z - dz];
          if (sh[0] || sh[1] || sh[2]) { r.shift = sh; r.illusion = true; }
          return r;
        }
      }
      // 화면에서 계단의 높은 끝이 이 경계에 닿아 보이면, 계단 위쪽으로 들어가요 (계단 끝 착시의 반대 방향)
      if (!o || (o.top && occ.get(ckey(...o.top)) && occ.get(ckey(...o.top)).o.type === 'stairs')) {
        const p2 = ghost(x + 0.5 + dx * 0.7, y + e1, z + 0.5 + dz * 0.7, v), ga = Math.floor(p2[0]), gb = Math.floor(p2[1]);
        for (const i of sim.objs) {
          if (i.o.type !== 'stairs' || !i.functional || i.dir4 !== od) continue;
          const [sx2, sy2, sz2] = i.cube, g = ghost(sx2, sy2 + 1, sz2, v);
          if (g[0] !== ga || g[1] !== gb) continue;
          const r = accept(sim, i.cube, d, od, 1);
          if (r) { const sh = [sx2 - x - dx, sy2 + 1 - y - e1, sz2 - z - dz]; if (sh[0] || sh[1] || sh[2]) { r.shift = sh; r.illusion = true; } return r; }
        }
      }
      return hiddenLink(sim, node, d, od, v);
    }
  }
  // 경계가 가려져 있거나(또는 시점 회전 중) → 실제로 붙어 있는 칸
  for (const e2 of [0, 1]) {
    const t = [x + dx, y + e1 - e2, z + dz];
    if (!res.top.has(ckey(...t))) continue;
    const r = accept(sim, t, d, od, e2);
    if (r) return r;
  }
  return v === null || v === undefined ? null : hiddenLink(sim, node, d, od, v);
}

// 블록이 d 로 밀릴 때 도착 칸: 사람과 같은 규칙(보이는 대로). 계단·숨은 통로는 못 지나가요.
function blockNext(sim, t, d) {
  const [x, y, z] = t, [dx, dz] = DIR4[d];
  if (sim.res.walls.has(edgeKey(x, y, z, d))) return null;
  const u = [x + dx, y, z + dz];
  const v = sim.view;
  let c = null;
  if (v !== null && v !== undefined) {
    const ev = edgeView(sim, t, y, dx, dz, v);
    if (ev.inside && ev.inside.top && ev.inside.top.join() === t.join()) c = ev.outside && ev.outside.top;
    else c = sim.res.top.has(ckey(...u)) ? u : null;
  } else c = sim.res.top.has(ckey(...u)) ? u : null;
  if (!c || sim.res.walls.has(edgeKey(c[0], c[1], c[2], OPP4[d]))) return null;
  const o = sim.occ.get(ckey(...c));
  return o && o.o.type === 'stairs' ? null : c;
}

// 기둥 뒤 숨은 통로 (스테이지에 정의된 연결)
function hiddenLink(sim, [x, y, z], d, od, v) {
  for (const h of sim.stage.hidden) {
    if (h.view !== v || h.dir !== d || h.from[0] !== x || h.from[1] !== y || h.from[2] !== z) continue;
    const r = accept(sim, h.to, d, od, 0);
    if (r && r.kind === 'move') { r.hidden = true; return r; }
  }
  return null;
}

// 칸 t 에 d 방향으로 들어가기. e2=1 이면 계단의 꼭대기 쪽으로 들어감.
function accept(sim, t, d, od, e2) {
  const k = ckey(t[0], t[1], t[2]);
  if (!sim.res.top.has(k)) return null;
  if (sim.res.walls.has(edgeKey(t[0], t[1] + e2, t[2], od))) return null;
  const o = sim.occ.get(k);
  const isStairs = o && o.o.type === 'stairs' && o.functional;
  if (e2 === 1) return isStairs && o.dir4 === od ? { kind: 'move', to: t } : null;
  if (!o) return { kind: 'move', to: t };
  const type = o.o.type;
  if (type === 'stairs') return isStairs && o.dir4 === d ? { kind: 'move', to: t } : { kind: 'blocked', obj: o };
  if (type === 'key') return o.functional ? { kind: 'move', to: t } : { kind: 'blocked', obj: o };
  if (type === 'door') {
    if (sim.puz.doors[o.o.id]) return { kind: 'move', to: t };
    if (o.o.key && sim.state.keysHeld.includes(o.o.key) && o.functional) return { kind: 'unlock', obj: o, to: t };
    return { kind: 'blocked', obj: o, locked: !!o.o.key };
  }
  if (type === 'mirror') return { kind: 'mirror', obj: o };
  if (type === 'block' && o.upright) {
    const u = blockNext(sim, t, d);
    const uk = u && ckey(...u);
    const ok = !!u && !sim.occ.has(uk) && !(sim.flat.get(uk) && sim.flat.get(uk).o.type === 'exit');
    return { kind: 'push', obj: o, to: u || t, ok };
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

// 이동 판정 (Collision Layer): 걸을 수 있는 칸, 이웃 칸으로 넘어갈 수 있는지, 밀기·회전 같은 접촉 결과.
// 노드 = [ix, level, iz]. 플레이어는 위를 향한 수평 면(맨 위 면) 위에서만 걷고, 높이 차이는 계단으로만 넘어요.
import { DIR4, OPP4, ckey, edgeKey, screenKey } from './math.js';

// d 방향으로 한 칸 나아갈 때의 결과. 순서: ① 실제로 붙어 있는 칸 → ② 화면에서 맞닿아 보이는 칸(착시)
// → ③ 기둥 뒤로 이어지는 숨은 통로. 착시 칸으로 넘어가면 shift(= k·V, 화면에서는 안 보이는 이동)를 함께 돌려줘요.
export function neighbor(sim, node, d) {
  const [x, y, z] = node, [dx, dz] = DIR4[d], od = OPP4[d];
  const { res, occ } = sim;
  const here = occ.get(ckey(x, y, z));
  let e1 = 0; // 내 쪽 경계 높이 (계단 꼭대기로 나가면 1)
  if (here && here.o.type === 'stairs' && here.functional) {
    if (d === here.dir4) e1 = 1;
    else if (d !== OPP4[here.dir4]) return null; // 계단 옆으로는 못 내려가요
  }
  if (res.walls.has(edgeKey(x, y + e1, z, d))) return null;
  // ① 실제 이웃: 같은 높이로 들어가기(e2=0) 또는 아래 계단 꼭대기로 들어가기(e2=1)
  for (const e2 of [0, 1]) {
    const t = [x + dx, y + e1 - e2, z + dz];
    if (!res.top.has(ckey(...t))) continue;
    const r = accept(sim, t, d, od, e2);
    if (r) return r;
  }
  const v = sim.view;
  if (v === null || v === undefined) return null;
  // ② 착시: 경계선이 화면에서 정확히 겹치는 다른 깊이의 칸. 출발 칸과 도착 칸이 둘 다 화면에서 보여야(가장 앞) 해요.
  if (!isFront(sim, node, v)) return hiddenLink(sim, node, d, od, v);
  for (const e2 of [0, 1]) {
    const list = sim.screenCells(screenKey(x + dx, y + e1 - e2, z + dz, v), v);
    for (const t of list) {
      if (t[0] === x + dx && t[2] === z + dz && t[1] === y + e1 - e2) continue;
      if (t !== list[0]) break; // 가려진 칸으로는 못 감
      const r = accept(sim, t, d, od, e2);
      if (!r) continue;
      r.shift = [t[0] - x - dx, t[1] + e2 - y - e1, t[2] - z - dz];
      r.illusion = true;
      return r;
    }
  }
  return hiddenLink(sim, node, d, od, v);
}

// 블록이 d 로 밀릴 때 도착 칸: 같은 높이 실제 이웃, 없으면 화면에서 맞닿은 칸 (블록도 보이는 대로 움직여요). 계단·숨은 통로는 못 지나가요.
function blockNext(sim, t, d) {
  const [x, y, z] = t, [dx, dz] = DIR4[d];
  if (sim.res.walls.has(edgeKey(x, y, z, d))) return null;
  const u = [x + dx, y, z + dz];
  if (sim.res.top.has(ckey(...u))) return u;
  const v = sim.view;
  if (v === null || v === undefined || !isFront(sim, t, v)) return null;
  const c = sim.screenCells(screenKey(...u, v), v)[0];
  if (!c || sim.res.walls.has(edgeKey(c[0], c[1], c[2], OPP4[d]))) return null;
  const o = sim.occ.get(ckey(...c));
  return o && o.o.type === 'stairs' ? null : c;
}

// ③ 숨은 통로 (스테이지에 정의된 기둥 뒤 연결)
function hiddenLink(sim, [x, y, z], d, od, v) {
  for (const h of sim.stage.hidden) {
    if (h.view !== v || h.dir !== d || h.from[0] !== x || h.from[1] !== y || h.from[2] !== z) continue;
    const r = accept(sim, h.to, d, od, 0);
    if (r && r.kind === 'move') { r.hidden = true; return r; }
  }
  return null;
}
const isFront = (sim, c, v) => { const l = sim.screenCells(screenKey(c[0], c[1], c[2], v), v); return l[0] && l[0][0] === c[0] && l[0][1] === c[1] && l[0][2] === c[2]; };

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

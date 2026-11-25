// 접기 (Logical Layer): 접힘선 하나를 90°/180° 돌려 새 논리 상태를 만들어요. 화면(Mesh)과는 무관해요.
// 1) 각도 제한  2) 플레이어가 도는 면 위에 있으면 거부  3) 새 배치 계산
// 4) 쌓임 순서(위로 넘어왔는지 아래로 돌아왔는지)  5) 물체가 종이에 끼면 거부  6) 블록은 중력으로 떨어짐
import { mulMV, apply, sub, add, scale, dot, rotMat, ckey } from './math.js';
import { faceTransforms, restCenter } from './Layout.js';

export const FOLD_REASONS = {
  limit: '이 방향으로는 더 접을 수 없어요',
  player: '인형이 접히는 면 위에 있어요. 먼저 내려오세요',
  crush: '종이가 물체에 걸려서 접을 수 없어요',
  overlap: '물체끼리 부딪혀서 접을 수 없어요',
  playerHit: '인형과 부딪혀서 접을 수 없어요',
  stack: '블록 위에 블록을 올릴 수는 없어요',
  lost: '블록이 떨어질 곳이 없어요',
  reach: '접힘선이 붙은 종이 위에 서야 접을 수 있어요',
};

export function tryFold(sim, cid, dq, opts = {}) {
  const { stage, state } = sim;
  const c = stage.creaseById.get(cid);
  if (!c || !dq) return { ok: false, reason: 'limit' };
  const cur = state.angles[cid] || 0, na = cur + 90 * dq;
  if (na < c.min || na > c.max) return { ok: false, reason: 'limit' };
  const moving = new Set(c.faces);
  if (!opts.ignorePlayer && moving.has(sim.res.top.get(ckey(...state.player)))) return { ok: false, reason: 'player' };
  if (!opts.ignorePlayer && stage.reach && sim.res.top.get(ckey(...state.player)) !== c.parent) return { ok: false, reason: 'reach' };

  // 쌓임 순서: 도는 면이 회전 도중 최종 위치보다 위를 지나왔으면 위에, 아래를 지나왔으면 아래에 놓여요
  const T0 = sim.geo.T, P = T0[c.parent];
  const A = apply(P, c.a), D = mulMV(P.R, c.axis);
  const child = stage.faceById.get(c.child);
  const cen = apply(T0[c.child], restCenter(child, (child.w - 1) / 2, (child.h - 1) / 2));
  let r0 = sub(cen, A); r0 = sub(r0, scale(D, dot(r0, D)));
  const r1 = mulMV(rotMat(D, dq), r0);
  let midY;
  if (Math.abs(dq) === 1) {
    const m = add(r0, r1), len = Math.hypot(...m) || 1;
    midY = m[1] / len * Math.hypot(...r0);
  } else midY = mulMV(rotMat(D, Math.sign(dq)), r0)[1];
  const over = midY >= r1[1] - 1e-9;

  const ns = cloneState(state);
  ns.angles[cid] = na;
  // 함께 도는 면들끼리의 순서: 뒤집히면(180°) 맨 아래 장이 맨 위로 와요
  const flip = mulMV(rotMat(D, dq), [0, 1, 0])[1] === -1 ? -1 : 1;
  const mv = [...moving].sort((a, b) => (state.order[a] - state.order[b]) * flip);
  if (over) mv.forEach(f => { ns.order[f] = ++ns.hi; });
  else { ns.lo -= mv.length; mv.forEach((f, k) => { ns.order[f] = ns.lo + k; }); }
  ns.folds++;

  const tmp = sim.probe(ns, opts);
  const occ = new Map();
  const falling = [];
  for (const i of tmp.objs) {
    if (!i.o.tall) continue;
    if (i.upright && !i.covered) { // 위를 향해 서 있음
      if (occ.has(i.cubeKey)) return { ok: false, reason: 'overlap' };
      occ.set(i.cubeKey, i);
    } else if (i.upright && i.covered) return { ok: false, reason: 'crush' };
    else if (i.o.type === 'block') falling.push(i);
    else { // 벽/아래쪽에 붙은 장치: 옆으로 튀어나와 공간을 차지해요
      if (occ.has(i.cubeKey)) return { ok: false, reason: 'overlap' };
      occ.set(i.cubeKey, i);
    }
  }
  const pk = ckey(...state.player);
  if (!opts.ignorePlayer && occ.has(pk)) return { ok: false, reason: 'playerHit' };

  // 블록 중력: 같은 기둥에서 아래로 가장 가까운 바닥에 떨어짐. 바닥이 없으면 처음 자리로 돌아가요.
  const fx = { falls: [], respawns: [], over };
  falling.sort((a, b) => b.cube[1] - a.cube[1]);
  for (const i of falling) {
    const [x, y, z] = i.cube;
    let land = null;
    for (let L = y; L >= sim.bounds.min[1] - 1; L--) if (tmp.res.top.has(ckey(x, L, z))) { land = [x, L, z]; break; }
    let att;
    if (land) {
      const k = ckey(...land);
      if (occ.has(k)) return { ok: false, reason: 'stack' };
      if (!opts.ignorePlayer && k === pk) return { ok: false, reason: 'playerHit' };
      att = attachAt(tmp, k);
      fx.falls.push({ id: i.o.id, from: add(i.c, scale(i.up, 0.5)), to: land });
    } else {
      const a0 = i.o.att, home = tmp.infoFor(i.o, a0);
      if (!home.upright || home.covered || occ.has(home.cubeKey) || (!opts.ignorePlayer && home.cubeKey === pk)) return { ok: false, reason: 'lost' };
      att = { ...a0 }; land = home.cube;
      fx.respawns.push({ id: i.o.id, from: add(i.c, scale(i.up, 0.5)), to: land });
    }
    ns.blocks[i.o.id] = att;
    occ.set(ckey(...land), i);
  }
  return { ok: true, state: ns, fx };
}

// 칸 키의 맨 위 면에 위를 향하게 붙이는 부착 정보
export function attachAt(sim, k) {
  const fid = sim.res.top.get(k);
  const cell = sim.geo.cells[fid].find(c => c.key === k);
  return { face: fid, i: cell.i, j: cell.j, side: sim.geo.faceN[fid][1] };
}

export function cloneState(s) {
  return {
    angles: { ...s.angles }, order: { ...s.order }, hi: s.hi, lo: s.lo,
    blocks: Object.fromEntries(Object.entries(s.blocks).map(([k, v]) => [k, { ...v }])),
    mirrors: { ...s.mirrors }, keysHeld: s.keysHeld.slice(), keysTaken: s.keysTaken.slice(),
    doorsOpened: s.doorsOpened.slice(), player: s.player.slice(), facing: s.facing,
    folds: s.folds, moves: s.moves, view: s.view,
  };
}

// 화면용: 접기 회전축 (현재 월드 좌표)
export function creaseAxisWorld(sim, cid) {
  const c = sim.stage.creaseById.get(cid), P = sim.geo.T[c.parent];
  return { point: apply(P, c.a), end: apply(P, c.b), dir: mulMV(P.R, c.axis) };
}
export { faceTransforms };

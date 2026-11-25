// 퍼즐 자동 풀이 (너비 우선 탐색). 스테이지 검증 테스트와 '다음 행동' 힌트에 같이 써요.
// 행동 = 접기 / 블록 밀기 / 거울 돌리기. 걷기·열쇠 줍기·열쇠 문 열기는 자동(비용 0)으로 묶어요.
// 플레이어 위치는 '걸어서 닿는 영역'의 대표 칸으로 줄여서 상태 수를 작게 유지해요.
import { ckey, DIR4 } from './math.js';
import { reachable, neighbor } from './Collision.js';
import { tryFold, cloneState, attachAt } from './Fold.js';

const P_OPT = { ignorePlayer: true }; // 탐색 중에는 '플레이어가 밟은 스위치'를 믿지 않아요 (한 곳에만 서 있으니까)

function settle(sim, s0) {
  let s = cloneState(s0);
  for (let guard = 0; guard < 12; guard++) {
    const p = sim.probe(s, P_OPT);
    const { nodes } = reachable(p, s.player);
    let changed = false;
    for (const n of nodes) {
      const o = p.occ.get(ckey(...n));
      if (o && o.o.type === 'key' && o.functional) { s.keysTaken.push(o.o.id); s.keysHeld.push(o.o.id); changed = true; }
    }
    if (!changed) {
      outer: for (const n of nodes) for (let d = 0; d < 4; d++) {
        const r = neighbor(p, n, d);
        if (r && r.kind === 'unlock') {
          s.doorsOpened.push(r.obj.o.id); s.keysHeld.splice(s.keysHeld.indexOf(r.obj.o.key), 1);
          changed = true; break outer;
        }
      }
    }
    if (!changed) return { p, nodes, s, set: new Set(nodes.map(n => ckey(...n))) };
  }
  return null;
}

function stateKey(stage, set) {
  const { p, s } = set;
  const stacks = [];
  for (const [k, list] of p.geo.hmap) if (list.length > 1) stacks.push(k + ':' + list.slice().sort((a, b) => s.order[a] - s.order[b]).join('>'));
  stacks.sort();
  let rep = null;
  for (const k of set.set) if (rep === null || k < rep) rep = k;
  return [
    stage.creases.map(c => s.angles[c.id]).join(','), stacks.join(';'),
    Object.keys(s.blocks).sort().map(b => b + '@' + p.byId.get(b).cubeKey).join(';'),
    Object.keys(s.mirrors).sort().map(m => s.mirrors[m]).join(''),
    s.keysTaken.join(','), s.keysHeld.join(','), s.doorsOpened.join(','), s.view, rep,
  ].join('|');
}

function isGoal(set) {
  const e = set.p.exitInfo();
  return !!(e && e.functional && set.p.puz.exitActive && set.set.has(e.cubeKey));
}

function* successors(sim, set) {
  const { p, nodes, s } = set;
  // 1) 접기
  for (const c of sim.stage.creases) {
    for (const dq of [1, -1, 2, -2]) {
      const stand = nodes.filter(n => { const f = p.res.top.get(ckey(...n)); return sim.stage.reach ? f === c.parent : !c.faces.includes(f); });
      if (!stand.length) continue;
      const r = tryFold(p, c.id, dq, P_OPT);
      if (!r.ok) continue;
      const pp = sim.probe(r.state, P_OPT), landed = new Set(r.fx.falls.concat(r.fx.respawns).map(f => ckey(...f.to)));
      const labeled = new Set();
      for (const n of stand) {
        const k = ckey(...n);
        if (labeled.has(k) || landed.has(k) || !pp.res.top.has(k)) continue;
        const o = pp.occ.get(k);
        if (o && !(o.o.type === 'key' && o.functional) && !(o.o.type === 'door' && pp.puz.doors[o.o.id]) && !(o.o.type === 'stairs' && o.functional)) continue;
        const ns = cloneState(r.state); ns.player = n.slice();
        const st = settle(sim, ns);
        if (!st) continue;
        st.set.forEach(x => labeled.add(x));
        yield [{ type: 'fold', crease: c.id, dq, stand: n.slice() }, st];
      }
    }
  }
  // 0) 시점 돌리기 (착시 연결이 바뀌어요)
  // 어디에 서서 돌리느냐에 따라 닿는 곳이 달라지므로, 서 있을 수 있는 영역마다 나눠서 시도
  if (sim.stage.views !== false) for (let v = 0; v < 4; v++) {
    if (v === s.view) continue;
    const labeled = new Set();
    for (const n of nodes) {
      const k = ckey(...n);
      if (labeled.has(k)) continue;
      const ns = cloneState(s); ns.view = v; ns.player = n.slice();
      const st = settle(sim, ns);
      if (!st) continue;
      st.set.forEach(x => labeled.add(x));
      yield [{ type: 'view', view: v, stand: n.slice() }, st];
    }
  }
  // 2) 블록 밀기: 걸어서 닿는 칸에서 미는 모든 경우 (착시로 맞닿은 블록도)
  for (const n of nodes) for (let d = 0; d < 4; d++) {
    const r = neighbor(p, n, d);
    if (!r || r.kind !== 'push' || !r.ok) continue;
    const i = r.obj;
    const ns = cloneState(s);
    ns.blocks[i.o.id] = attachAt(p, ckey(...r.to));
    ns.player = i.cube.slice();
    const st = settle(sim, ns);
    if (st) yield [{ type: 'push', block: i.o.id, dir: d, from: n.slice() }, st];
  }
  // 3) 거울 돌리기
  for (const i of p.objs) {
    if (i.o.type !== 'mirror' || !i.functional) continue;
    let from = null;
    for (const n of nodes) {
      for (let d = 0; d < 4 && !from; d++) { const r = neighbor(p, n, d); if (r && r.kind === 'mirror' && r.obj === i) from = n; }
      if (from) break;
    }
    if (!from) continue;
    const ns = cloneState(s);
    ns.mirrors[i.o.id] ^= 1;
    const st = settle(sim, ns);
    if (st) yield [{ type: 'mirror', id: i.o.id, from }, st];
  }
}

// 단계별 실행 (브라우저 힌트는 프레임을 끊어서 돌려요). 끝나면 { found, actions, explored } 를 return.
export function* solveSteps(sim, startState, maxStates = 20000, chunk = 150) {
  const root = settle(sim, startState);
  if (!root) return { found: false, explored: 0 };
  const nodes = [{ set: root, parent: -1, act: null }];
  const seen = new Set([stateKey(sim.stage, root)]);
  for (let h = 0; h < nodes.length; h++) {
    if (isGoal(nodes[h].set)) {
      const acts = [];
      for (let k = h; nodes[k].parent >= 0; k = nodes[k].parent) acts.push(nodes[k].act);
      return { found: true, actions: acts.reverse(), explored: nodes.length };
    }
    for (const [act, st] of successors(sim, nodes[h].set)) {
      const key = stateKey(sim.stage, st);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ set: st, parent: h, act });
    }
    if (nodes.length > maxStates) return { found: false, explored: nodes.length };
    if (h % chunk === chunk - 1) yield h;
  }
  return { found: false, explored: nodes.length };
}

export function solve(sim, startState, maxStates) {
  const g = solveSteps(sim, startState, maxStates);
  let r;
  do r = g.next(); while (!r.done);
  return r.value;
}

// ---- 미리 계산한 풀이로 힌트 주기 (어려운 스테이지에서 실시간 탐색이 늦을 때) ----
// 저장된 행동 하나를 정착 상태에 적용 (풀이 탐색과 같은 규칙)
function applyAction(sim, set, a) {
  const { p, s } = set;
  if (a.type === 'view') { const ns = cloneState(s); ns.view = a.view; if (a.stand) ns.player = a.stand.slice(); return settle(sim, ns); }
  if (a.type === 'fold') {
    const pp = sim.probe({ ...cloneState(s), player: a.stand.slice() }, P_OPT);
    const r = tryFold(pp, a.crease, a.dq, P_OPT);
    if (!r.ok) return null;
    const ns = cloneState(r.state); ns.player = a.stand.slice();
    return settle(sim, ns);
  }
  if (a.type === 'push') {
    const r = neighbor(p, a.from, a.dir);
    if (!r || r.kind !== 'push' || !r.ok) return null;
    const ns = cloneState(s); ns.blocks[r.obj.o.id] = attachAt(p, ckey(...r.to)); ns.player = r.obj.cube.slice();
    return settle(sim, ns);
  }
  if (a.type === 'mirror') { const ns = cloneState(s); ns.mirrors[a.id] ^= 1; return settle(sim, ns); }
  return null;
}
// 지금 상태가 저장된 풀이의 몇 번째 단계와 같은지 찾아 다음 행동을 돌려줘요 (없으면 null)
export function nextFromSolution(sim, state, start, actions) {
  const cur = settle(sim, state);
  if (!cur) return null;
  const ck = stateKey(sim.stage, cur);
  let set = settle(sim, start);
  for (let i = 0; set && i <= actions.length; i++) {
    if (stateKey(sim.stage, set) === ck) return i < actions.length ? { action: actions[i], left: actions.length - i } : { goal: true };
    if (i < actions.length) set = applyAction(sim, set, actions[i]);
  }
  return null;
}

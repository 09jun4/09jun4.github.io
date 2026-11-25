// 스테이지 검증: 모든 스테이지 JSON 을 읽어 검증하고, 자동 풀이로 해결 가능 여부를 확인해요.
// 실행: node tests/run.js [스테이지id] [--show]
import { readFileSync } from 'node:fs';
import { parseStage } from '../js/logic/StageLoader.js';
import { Sim } from '../js/logic/Sim.js';
import { solve } from '../js/logic/Solver.js';
import { tryFold } from '../js/logic/Fold.js';
import { parseKey } from '../js/logic/math.js';
import { unitTests } from './unit.js';

const root = new URL('../stages/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', root)));
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const show = process.argv.includes('--show');

// 위에서 내려다본 층별 지도: # 바닥  P 플레이어  B 블록  S 스위치  D 문  K 열쇠  M 거울  L 광원  R 수신기  E 출구  ^ 계단
export function ascii(sim) {
  const levels = new Map();
  for (const k of sim.res.top.keys()) { const [x, y, z] = parseKey(k); if (!levels.has(y)) levels.set(y, []); levels.get(y).push([x, z]); }
  const sym = { block: 'B', switch: 'S', door: 'D', key: 'K', mirror: 'M', source: 'L', receptor: 'R', exit: 'E', stairs: '^' };
  const out = [];
  for (const y of [...levels.keys()].sort((a, b) => b - a)) {
    const pts = levels.get(y), xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    out.push(`level ${y}  (x ${x0}..${x1}, z ${z0}..${z1})`);
    for (let z = z0; z <= z1; z++) {
      let row = '';
      for (let x = x0; x <= x1; x++) {
        const k = x + ',' + y + ',' + z;
        let c = sim.res.top.has(k) ? '#' : ' ';
        const o = sim.objs.find(i => i.upright && i.cubeKey === k);
        if (o) c = sym[o.o.type].toLowerCase() === sym[o.o.type] ? sym[o.o.type] : (o.functional ? sym[o.o.type] : sym[o.o.type].toLowerCase());
        if (sim.state.player.join(',') === k) c = 'P';
        row += c;
      }
      out.push('  ' + row);
    }
  }
  return out.join('\n');
}

let failed = 0;
const t0 = Date.now();
failed += unitTests();
for (const ch of index.chapters) {
  for (const file of ch.stages) {
    const json = JSON.parse(readFileSync(new URL(file, root)));
    if (only && json.id !== only) continue;
    let stage;
    try { stage = parseStage(json); } catch (e) { console.log('✗', file, e.message); failed++; continue; }
    const sim = new Sim(stage);
    if (show) console.log(ascii(sim));
    const ts = Date.now();
    const r = solve(sim, sim.state, 300000);
    const ms = Date.now() - ts;
    if (!r.found) { console.log(`✗ ${stage.id} ${stage.name}: 풀 수 없음 (탐색 ${r.explored})`); failed++; continue; }
    const folds = r.actions.filter(a => a.type === 'fold').length;
    console.log(`✓ ${stage.id} ${stage.name}: 행동 ${r.actions.length} (접기 ${folds}) · 탐색 ${r.explored} · ${ms}ms`);
    if (show || only) for (const a of r.actions) console.log('   ', JSON.stringify(a));
    // 풀이를 실제 동작으로 재생해서 출구 도착까지 확인
    if (!replay(stage, r.actions)) { console.log(`✗ ${stage.id}: 풀이 재생 실패`); failed++; }
  }
}
console.log(failed ? `\n실패 ${failed}` : `\n모두 통과 (${Date.now() - t0}ms)`);
process.exit(failed ? 1 : 0);

// 실제 게임과 같은 경로: 걸어서 이동 → 접기/밀기/거울 → 마지막에 출구까지 걷기
import { pathTo, reachable } from '../js/logic/Collision.js';
import { ckey } from '../js/logic/math.js';
function walk(sim, goal) {
  const path = pathTo(sim, sim.state.player, ckey(...goal));
  if (!path) return false;
  for (const n of path.slice(1)) {
    // 문이 열쇠로 잠겨 있으면 열기
    sim.enterNode(n);
  }
  return true;
}
function walkCollect(sim) {
  // 열쇠 줍기 / 열쇠 문 열기 (풀이에서 자동으로 묶인 부분)
  for (let g = 0; g < 10; g++) {
    const { nodes } = reachable(sim, sim.state.player);
    const key = sim.objs.find(i => i.o.type === 'key' && i.functional && nodes.some(n => ckey(...n) === i.cubeKey));
    if (key) { walk(sim, key.cube); continue; }
    let done = false;
    for (const n of nodes) for (let d = 0; d < 4 && !done; d++) {
      const r = sim.neighbor(n, d);
      if (r && r.kind === 'unlock') { walk(sim, n); sim.unlock(r); sim.enterNode(r.to); done = true; }
    }
    if (!done) return;
  }
}
function replay(stage, actions) {
  const sim = new Sim(stage);
  for (const a of actions) {
    walkCollect(sim);
    if (a.type === 'fold') {
      if (!walk(sim, a.stand)) { console.log('    재생: 설 자리로 못 감', a); return false; }
      const r = sim.fold(a.crease, a.dq);
      if (!r.ok) { console.log('    재생: 접기 실패', a, r.reason); return false; }
    } else if (a.type === 'push') {
      if (!walk(sim, a.from)) { console.log('    재생: 밀 자리로 못 감', a); return false; }
      const r = sim.neighbor(sim.state.player, a.dir);
      if (!r || r.kind !== 'push' || !r.ok) { console.log('    재생: 밀기 불가', a); return false; }
      const to = sim.byId.get(a.block).cube;
      sim.push(r); sim.enterNode(to);
    } else if (a.type === 'mirror') {
      if (!walk(sim, a.from)) return false;
      sim.rotateMirror(a.id);
    }
  }
  walkCollect(sim);
  const e = sim.exitInfo();
  if (!walk(sim, e.cube)) { console.log('    재생: 출구로 못 감\n' + ascii(sim)); return false; }
  return sim.atExit();
}

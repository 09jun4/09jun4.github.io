// 스테이지 설계 도구: 층별 지도 + 시점별 착시 연결 + 자동 풀이. 실행: node tools/explore.mjs stages/ch2/2-1.json [최대탐색]
import { readFileSync } from 'node:fs';
import { parseStage } from '../js/logic/StageLoader.js';
import { Sim } from '../js/logic/Sim.js';
import { solve } from '../js/logic/Solver.js';
import { computeIllusions } from '../js/logic/Connection.js';
import { ascii } from './ascii.mjs';
const st = parseStage(JSON.parse(readFileSync(process.argv[2])));
const sim = new Sim(st);
console.log(ascii(sim));
for (let v = 0; v < 4; v++) {
  sim.state.view = v; sim.refresh();
  const ill = computeIllusions(sim).map(e => `${e.from}→${e.to}${e.hidden ? '(숨은)' : ''}`);
  console.log(`view ${v}: ${ill.join('  ') || '-'}`);
}
sim.state.view = st.view; sim.refresh();
const t0 = Date.now();
const r = solve(sim, sim.state, +process.argv[3] || 400000);
console.log(r.found ? `풀이 ${r.actions.length}행동 (접기 ${r.actions.filter(a => a.type === 'fold').length}, 시점 ${r.actions.filter(a => a.type === 'view').length}) 탐색 ${r.explored} ${Date.now() - t0}ms` : `풀 수 없음 (탐색 ${r.explored})`);
if (r.found) for (const a of r.actions) console.log('  ', JSON.stringify(a));

// 풀이를 따라가며 각 단계에서 닿는 칸(시점 포함)을 보여 줘요. node tools/trace.mjs <stage.json>
import { readFileSync } from 'node:fs';
import { parseStage } from '../js/logic/StageLoader.js';
import { Sim } from '../js/logic/Sim.js';
import { solve } from '../js/logic/Solver.js';
import { reachable } from '../js/logic/Collision.js';
import { ckey } from '../js/logic/math.js';
const st = parseStage(JSON.parse(readFileSync(process.argv[2])));
const sim = new Sim(st);
const r = solve(sim, sim.state, 400000);
const show = (label) => {
  const p = sim.probe(sim.state, { ignorePlayer: true });
  const { nodes, prev } = reachable(p, sim.state.player, 4000, true);
  console.log(label, 'view', sim.state.view, 'keys', sim.state.keysHeld.join(','), 'reach:', nodes.map(n => n.join(',')).join(' '));
};
show('start');
for (const a of r.actions || []) {
  if (a.stand) sim.state.player = a.stand.slice();
  if (a.type === 'fold') { sim.refresh(); const f = sim.fold(a.crease, a.dq); if (!f.ok) console.log('fold fail', f.reason); }
  if (a.type === 'view') { sim.state.view = a.view; sim.refresh(); }
  if (a.type === 'mirror') sim.rotateMirror(a.id);
  if (a.type === 'push') { sim.state.player = a.from.slice(); sim.refresh(); const n = sim.neighbor(a.from, a.dir); sim.push(n); }
  show(JSON.stringify(a));
}

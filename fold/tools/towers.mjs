// 실험: 탑 격자의 높이 배치를 바꿔 가며, 시점 전환이 많이 필요한 배치를 찾기
import { parseStage } from '../js/logic/StageLoader.js';
import { Sim } from '../js/logic/Sim.js';
import { solve } from '../js/logic/Solver.js';
import { P, O } from './lib.mjs';
export function towerStage(H, opts = {}) {
  const n = H.length, m = H[0].length, sp = opts.sp || 3, tw = opts.tw || 2;
  const faces = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if (H[i][j] !== null) faces.push(P(`T${i}${j}`, j * sp, H[i][j], i * sp, tw, tw));
  const last = [n - 1, m - 1];
  return {
    id: 'x', faces, creases: [],
    objects: [O('exit', 'exit', [last[1] * sp + tw - 1, H[last[0]][last[1]], last[0] * sp + tw - 1])],
    player: { at: [0, H[0][0], 0] },
  };
}
if (process.argv[2] === 'search') {
  let best = null;
  const N = +process.argv[3] || 300;
  let seed = +process.argv[4] || 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < N; t++) {
    const H = [0, 1, 2].map(() => [0, 1, 2].map(() => Math.floor(rnd() * 5)));
    const sim = new Sim(parseStage(towerStage(H)));
    const r = solve(sim, sim.state, 20000);
    if (r.found && (!best || r.actions.length > best.n)) { best = { n: r.actions.length, H }; console.log(best.n, JSON.stringify(H)); }
  }
}

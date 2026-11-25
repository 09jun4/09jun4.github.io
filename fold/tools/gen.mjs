// 설계 탐색: 손으로 정한 큰 구조(템플릿) 안에서 높이·날개·물체 같은 작은 선택을 바꿔 가며
// 자동 풀이의 최소 행동 수가 큰(=어려운) 배치를 찾아요. node tools/gen.mjs <템플릿> <시도> <시드> [예산]
import { parseStage } from '../js/logic/StageLoader.js';
import { Sim } from '../js/logic/Sim.js';
import { solve } from '../js/logic/Solver.js';
import { writeFileSync } from 'node:fs';
import * as T from './templates.mjs';

export function evaluate(json, budget = 40000) {
  let st;
  try { st = parseStage(json); } catch (e) { return { ok: false, err: e.message }; }
  const sim = new Sim(st);
  const r = solve(sim, sim.state, budget);
  if (!r.found) return { ok: false, explored: r.explored };
  const c = t => r.actions.filter(a => a.type === t).length;
  return { ok: true, n: r.actions.length, folds: c('fold'), views: c('view'), pushes: c('push'), mirrors: c('mirror'), explored: r.explored, actions: r.actions };
}

if (process.argv[1].endsWith('gen.mjs')) {
  const [name, tries = 100, seed0 = 1, budget = 40000] = process.argv.slice(2);
  const tpl = T[name];
  let seed = +seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let best = null;
  const t0 = Date.now();
  for (let t = 0; t < +tries; t++) {
    const p = tpl.random(rnd);
    const json = tpl.build(p);
    const e = evaluate(json, +budget);
    if (!e.ok) continue;
    const score = tpl.score ? tpl.score(e) : e.n;
    if (!best || score > best.score) {
      best = { score, e, p };
      console.log(`[${t}] 점수 ${score} 행동 ${e.n} (접기 ${e.folds} 시점 ${e.views} 밀기 ${e.pushes}) 탐색 ${e.explored}`);
      writeFileSync(`/tmp/claude-0/gen-${name}-${seed0}.json`, JSON.stringify({ p, e, json }, null, 1));
    }
  }
  console.log('끝', ((Date.now() - t0) / 1000).toFixed(0) + 's', best && best.score);
}

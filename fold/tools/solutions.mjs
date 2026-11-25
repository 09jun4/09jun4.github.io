// 모든 스테이지의 최소 풀이를 계산해 JSON 의 "solution" 에 저장 (힌트가 느릴 때 쓰는 정답 경로)
import { readFileSync, writeFileSync } from 'node:fs';
import { parseStage } from '../js/logic/StageLoader.js';
import { Sim, initialState } from '../js/logic/Sim.js';
import { solve, nextFromSolution } from '../js/logic/Solver.js';
const root = new URL('../stages/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', root)));
for (const ch of index.chapters) for (const f of ch.stages) {
  const url = new URL(f, root), json = JSON.parse(readFileSync(url));
  delete json.solution;
  const st = parseStage(json), sim = new Sim(st);
  const r = solve(sim, sim.state, 400000);
  if (!r.found) { console.log('✗', f); continue; }
  json.solution = r.actions;
  // 저장된 풀이로 첫 힌트가 나오는지 확인
  const h = nextFromSolution(new Sim(parseStage(json)), initialState(st), initialState(st), r.actions);
  console.log(h && (h.action || h.goal) ? '✓' : '?', f, r.actions.length);
  writeFileSync(url, JSON.stringify(json, null, 1));
}

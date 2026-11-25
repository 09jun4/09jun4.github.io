// 힌트: 지금 상태에서 자동 풀이를 돌려 '다음 한 걸음'만 알려 줘요 (정답 전체는 보여 주지 않아요).
// 프레임을 끊어 돌려서 화면이 멈추지 않고, 오래 걸리면 스테이지에 적힌 글 힌트로 대신해요.
import { solveSteps } from '../logic/Solver.js';
import { cloneState } from '../logic/Fold.js';
import { Sim } from '../logic/Sim.js';

export class Hint {
  constructor() { this.job = null; this.cache = new Map(); }
  cancel() { this.job = null; }
  // → Promise<{ action } | { text } | { goal }>
  request(sim, textIndex) {
    this.cancel();
    const key = JSON.stringify(sim.state);
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    const s = new Sim(sim.stage);
    const gen = solveSteps(s, cloneState(sim.state), 12000, 60);
    const job = this.job = {};
    const t0 = performance.now();
    return new Promise(resolve => {
      const tick = () => {
        if (this.job !== job) return resolve(null);
        const until = performance.now() + 12;
        let r;
        do r = gen.next(); while (!r.done && performance.now() < until);
        if (!r.done && performance.now() - t0 < 4000) return requestAnimationFrame(tick);
        this.job = null;
        let out;
        if (r.done && r.value.found) out = r.value.actions.length ? { action: r.value.actions[0], left: r.value.actions.length } : { goal: true };
        else out = { text: sim.stage.hints[textIndex % Math.max(1, sim.stage.hints.length)] || '천천히 공간을 살펴보세요. 되돌리기는 언제든 할 수 있어요.' };
        if (this.cache.size > 50) this.cache.clear();
        this.cache.set(key, out);
        resolve(out);
      };
      tick();
    });
  }
}

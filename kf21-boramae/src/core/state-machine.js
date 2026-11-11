// 화면 흐름 상태 머신. 허용된 전환만 통과시킨다.
export class StateMachine {
  /** @param {Record<string,string[]>} transitions 상태별로 갈 수 있는 다음 상태 목록 */
  constructor(transitions) {
    this.transitions = transitions;
    this.states = new Map();
    this.name = '';
    this.current = null;
    this.listeners = [];
  }

  /** @param {{enter?:Function, exit?:Function, step?:Function, render?:Function}} handlers */
  add(name, handlers) {
    this.states.set(name, handlers);
    return this;
  }

  can(next) {
    if (!this.states.has(next)) return false;
    if (!this.name) return true;
    const allowed = this.transitions[this.name];
    return !!allowed && allowed.includes(next);
  }

  go(next, payload) {
    if (!this.states.has(next)) throw new Error(`unknown state: ${next}`);
    if (!this.can(next)) throw new Error(`transition not allowed: ${this.name} -> ${next}`);
    const prev = this.name;
    if (this.current && this.current.exit) this.current.exit(next);
    this.name = next;
    this.current = this.states.get(next);
    if (this.current.enter) this.current.enter(payload, prev);
    for (const fn of this.listeners) fn(next, prev);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  step(dt) {
    if (this.current && this.current.step) this.current.step(dt);
  }

  render(alpha, frameDt) {
    if (this.current && this.current.render) this.current.render(alpha, frameDt);
  }
}

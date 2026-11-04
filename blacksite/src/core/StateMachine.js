// 화면 상태 머신 (menu, briefing, playing, results, failure ...).
// 상태 객체: { enter(params), exit(), update(dt) } — 모두 선택.
export class StateMachine {
  constructor(bus) {
    this.bus = bus;
    this.states = {};
    this.current = null;
    this.name = '';
  }
  add(name, state) { this.states[name] = state; return this; }
  async change(name, params = {}) {
    const next = this.states[name];
    if (!next) throw new Error(`unknown state ${name}`);
    const prev = this.name;
    if (this.current?.exit) await this.current.exit(name);
    this.current = next;
    this.name = name;
    if (next.enter) await next.enter(params, prev);
    this.bus?.emit('state:changed', { name, prev });
  }
  update(dt, t) { this.current?.update?.(dt, t); }
}

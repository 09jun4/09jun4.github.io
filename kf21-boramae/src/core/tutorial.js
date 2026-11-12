// 튜토리얼(미션 1): 단계별 안내와 통과 판정만 맡는다. 화면 표시는 ui/tutorial-banner.js.
// 진행 중에는 미션 시간이 흐르지 않고, 마지막 단계(락온) 전까지 적이 나오지 않는다.
import { PHASE_NAMES } from './phase.js';

export class Tutorial {
  constructor(cfg) {
    this.cfg = cfg;
    this.active = false;
    this.index = 0;
    this.doneTimer = 0;
    this.mobile = false;
    this.version = 0; // 바뀔 때마다 증가(배너가 다시 그린다)
    this.onFinish = null;
    this._acc = { pitch: 0, turn: 0 };
    this._base = { gun: 0, missiles: 0, view: '', kills: 0 };
  }

  get step() { return this.cfg.steps[this.index]; }
  /** 적 등장 보류 중인가(마지막 단계 전) */
  get holding() { return this.active && this.step.id !== 'lock'; }
  get stepDone() { return this.doneTimer > 0; }
  get total() { return this.cfg.steps.length; }
  get text() { return this.mobile ? this.step.mobile : this.step.pc; }
  get skipText() { return this.mobile ? this.cfg.skip.mobile : this.cfg.skip.pc; }

  start(session, mobile) {
    this.active = true;
    this.mobile = mobile;
    this.index = session.phase === PHASE_NAMES.TAKEOFF ? 0 : 1;
    this._enter(session);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.version++;
  }

  _enter(s) {
    this.doneTimer = 0;
    this._acc.pitch = 0; this._acc.turn = 0;
    this._base.gun = s.stats.gunShots;
    this._base.missiles = s.stats.missilesFired;
    this._base.kills = s.stats.kills;
    this._base.view = s.view;
    this.version++;
  }

  _passed(dt, s) {
    const c = this.cfg, b = this._base;
    switch (this.step.id) {
      case 'takeoff': return s.phase !== PHASE_NAMES.TAKEOFF;
      case 'flight': {
        const i = s.player.input;
        if (Math.abs(i.pitch) > 0.3) this._acc.pitch += dt;
        if (Math.abs(i.turn) > 0.3) this._acc.turn += dt;
        return this._acc.pitch >= c.flightHold && this._acc.turn >= c.flightHold;
      }
      case 'gun': return s.stats.gunShots - b.gun >= c.gunShots;
      case 'weapon': return s.weapons.current.id === 'missile';
      case 'view': return s.view !== b.view;
      case 'lock': return s.stats.missilesFired > b.missiles || s.stats.kills > b.kills;
      default: return true;
    }
  }

  update(dt, s) {
    if (!this.active) return;
    if (this.doneTimer > 0) {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) this._next(s);
      return;
    }
    if (this._passed(dt, s)) {
      this.doneTimer = this.step.id === 'takeoff' ? 0.01 : this.cfg.doneHold;
      this.version++;
    }
  }

  _next(s) {
    if (this.index >= this.total - 1) { this.finish(s); return; }
    this.index++;
    this._enter(s);
  }

  /** 끝(통과·건너뛰기 공통): 미션 시간은 여기서부터 잰다 */
  finish(s) {
    if (!this.active) return false;
    this.active = false;
    this.version++;
    if (s.phase === PHASE_NAMES.ACTIVE) s.stats.time = 0;
    if (this.onFinish) this.onFinish();
    return true;
  }
}

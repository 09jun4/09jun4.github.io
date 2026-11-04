// 자동 플레이 진행자: 메뉴 → 미션 시작, 결과·실패 → 잠시 뒤 재도전, 로그 창 자동 닫기, 배속.
import { bus } from '../core/EventBus.js';
import { AutoPilot } from './AutoPilot.js';
import { Spectator } from './Spectator.js';

export class Director {
  constructor(game, { difficulty = 'normal' } = {}) {
    this.game = game;
    this.difficulty = difficulty;
    this.t = 0;
    this.runs = 0; this.wins = 0; this.fails = 0;
    this.best = 0;
    this.tour = true;
    this.history = []; // { ok, time, kills, takedowns, detections }
    game.timeScale = 1;
    this.spectator = new Spectator(game, this);
    bus.on('state:changed', ({ name }) => {
      this.t = 0;
      if (name === 'playing') {
        this.runs++;
        game.session.autopilot = new AutoPilot(game.session);
        game.session.autopilot.tour = this.tour;
        game.session.controlsEnabled = false;
      }
    });
    bus.on('mission:complete', (r) => {
      this.wins++; this.best = this.best ? Math.min(this.best, r.timeSec) : r.timeSec;
      this.history.push({ ok: true, time: r.timeSec, kills: r.kills, takedowns: r.takedowns, detections: r.detections });
    });
    bus.on('mission:failed', () => {
      const s = game.session;
      this.fails++;
      this.history.push({ ok: false, time: s.time, kills: s.stats.kills, takedowns: s.stats.takedowns, detections: s.stats.detections });
    });
  }

  setDifficulty(d) { this.difficulty = d; }
  setTour(v) { this.tour = v; if (this.game.session?.autopilot) this.game.session.autopilot.tour = v; }
  restart() {
    if (this.restarting) return;
    this.restarting = true;
    Promise.resolve(this.game.fsm.change('playing', { difficulty: this.difficulty })).finally(() => { this.restarting = false; });
  }

  update(dt) {
    const g = this.game, name = g.fsm.name;
    this.t += dt;
    if ((name === 'menu' || name === 'briefing') && this.t > 1.5) this.restart();
    if ((name === 'results' || name === 'failure') && this.t > 6) this.restart();
    // 로그 창: 2초 뒤 전체 표시, 4.5초 뒤 닫기
    const lv = g.ui.logViewer;
    if (lv.isOpen) {
      this.logT = (this.logT || 0) + dt;
      if (this.logT > 2 && !lv.done) lv.advance();
      if (this.logT > 4.5) { lv.close('auto'); this.logT = 0; }
    } else this.logT = 0;
    this.spectator.update(dt);
  }
}

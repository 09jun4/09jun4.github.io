// 미션 관리: mission JSON의 목표를 순서대로 진행하고 목표 마커·HUD·결과를 처리한다.
import { bus } from '../core/EventBus.js';
import { OBJECTIVES } from './objectives/index.js';
import { ObjectiveMarker } from './ObjectiveMarker.js';
import { DataLogs } from './DataLogs.js';

export class MissionManager {
  constructor(session, missionCfg, logsCfg) {
    this.session = session;
    this.cfg = missionCfg;
    this.objectives = missionCfg.objectives.map((def) => {
      const C = OBJECTIVES[def.type];
      if (!C) throw new Error('unknown objective type ' + def.type);
      return new C(def, this);
    });
    this.index = -1;
    this.marker = new ObjectiveMarker(session.scene);
    this.logs = new DataLogs(session, logsCfg);
  }
  get current() { return this.objectives[this.index]; }

  start() {
    this.next();
    this.session.hud.toast(this.cfg.titleEn, this.cfg.code + '  ·  ' + this.cfg.title, 3.5);
  }

  next() {
    this.index++;
    const o = this.current;
    if (!o) return;
    o.start();
    this.marker.set(o.markerPos);
    this.session.hud.setObjective(o.text);
    if (this.index > 0) {
      this.session.hud.toast('OBJECTIVE UPDATED', o.text, 3.2);
      bus.emit('objective:updated', { objective: o });
    }
  }

  complete(obj) {
    if (obj !== this.current) return;
    if (this.index >= this.objectives.length - 1) return this.finish();
    this.next();
  }

  finish() {
    const s = this.session;
    if (s.ended) return;
    s.ended = true;
    s.controlsEnabled = false;
    this.marker.set(null);
    const rec = s.game.save.recordClear(s.difficulty, s.time);
    const result = {
      success: true, difficulty: s.difficulty, timeSec: s.time, ...s.stats,
      logsTotal: this.logs.terminals.length, logsKnown: s.game.save.readLogs.length,
      newRecord: rec.newRecord, prevBest: rec.prevBest, missionCode: this.cfg.code, missionTitle: this.cfg.title,
    };
    bus.emit('mission:complete', result);
  }

  update(dt) {
    for (const o of this.objectives) o.update(dt);
    const s = this.session;
    this.marker.update(dt, s.camera, s.hud, s.player.eye);
  }

  dispose() { this.marker.dispose(); }
}

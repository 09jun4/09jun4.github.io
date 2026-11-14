// 목표: 터미널에서 데이터 다운로드 (F → 진행 바 duration초, cancelDistance 이상 벗어나면 취소·초기화).
import * as THREE from 'three';
import { bus } from '../../core/EventBus.js';
import { TerminalScreen } from '../Terminal.js';

export class DownloadObjective {
  constructor(def, mm) {
    this.def = def;
    this.mm = mm;
    this.s = mm.session;
    this.term = this.s.facility.interactableById[def.terminal];
    if (!this.term) throw new Error('terminal not found: ' + def.terminal);
    this.screen = new TerminalScreen(this.term.prop.screen);
    this.progress = 0;
    this.active = false;
    this.downloading = false;
    this.done = false;
    this.markerPos = this.term.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    mm.session.interaction.add({
      find: (it) => {
        if (!this.active || this.downloading || this.done) return null;
        const d = it.aimDistance(this.term.box, this.s.cfg.game.interact.distance);
        if (d === null) return null;
        return { priority: 80, label: 'DOWNLOAD DATA', action: () => this.begin() };
      },
    });
  }
  get text() { return this.def.text; }
  start() { this.active = true; }
  begin() {
    this.downloading = true;
    this.progress = 0;
    bus.emit('terminal:start', {});
  }
  cancel() {
    this.downloading = false;
    this.progress = 0;
    this.s.hud.setProgress(null);
    this.s.hud.toast('TRANSFER INTERRUPTED', '터미널에서 너무 멀어져 다운로드가 취소됐어요.', 2.4, 'alert');
    bus.emit('terminal:cancel', {});
  }
  update(dt) {
    let mode = this.done ? 'done' : this.downloading ? 'download' : 'idle';
    if (this.downloading) {
      const pl = this.s.player;
      const dist = Math.hypot(pl.x - this.term.pos.x, pl.z - this.term.pos.z);
      if (dist > this.def.cancelDistance || pl.health.dead) { this.cancel(); mode = 'idle'; } else {
        this.progress += dt / this.def.duration;
        this.s.hud.setProgress(Math.min(1, this.progress), 'DOWNLOADING');
        if (this.progress >= 1) {
          this.downloading = false;
          this.done = true;
          this.s.hud.setProgress(null);
          bus.emit('terminal:complete', {});
          this.term.prop.screen.led.material = this.s.game.M.ledGreen;
          this.mm.complete(this);
        }
      }
    }
    this.screen.update(dt, mode, Math.min(1, this.progress));
  }
}

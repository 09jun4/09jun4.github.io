// 플레이 상태: 세션 실행 + 일시정지·페이드 인.
import { bus } from '../EventBus.js';
import { Session } from '../Session.js';

export class PlayState {
  constructor(game) { this.game = game; this.offs = []; }

  enter({ difficulty = 'normal' } = {}) {
    const g = this.game;
    this.difficulty = difficulty;
    g.session?.dispose();
    g.session = new Session(g, { difficulty });
    g.input.enabled = true;
    g.input.clear();
    this.fade = g.cfg.game.fadeInTime;
    g.ui.show('hud');
    g.ui.fadeFromBlack(this.fade);
    g.input.requestLock();
    this.offs.push(bus.on('input:escape', () => this.togglePause()));
    this.offs.push(bus.on('input:unlocked', () => { if (!g.session.paused && !g.ui.modalOpen) this.pause(); }));
    this.offs.push(bus.on('mission:failed', (info) => {
      g.ui.fadeToBlack?.(0.9);
      setTimeout(() => { if (g.fsm.current === this) g.fsm.change('failure', { ...info, difficulty: this.difficulty }); }, 1100);
    }));
    this.offs.push(bus.on('mission:complete', (result) => {
      g.ui.fadeToBlack?.(0.8);
      setTimeout(() => { if (g.fsm.current === this) g.fsm.change('results', result); }, 900);
    }));
    this.game.canvas.onclick = () => { if (!g.session.paused && !g.ui.modalOpen) g.input.requestLock(); };
  }

  exit() {
    for (const off of this.offs) off();
    this.offs = [];
    const g = this.game;
    g.input.enabled = false;
    g.input.exitLock();
    g.canvas.onclick = null;
    g.session?.dispose();
    g.session = null;
  }

  pause() {
    const s = this.game.session;
    if (!s || s.paused || s.ended) return;
    s.paused = true;
    this.game.input.exitLock();
    this.game.input.clear();
    this.game.audio?.suspendGame(true);
    this.game.ui.showPause();
  }
  resume() {
    const s = this.game.session;
    if (!s) return;
    s.paused = false;
    this.game.ui.hidePause();
    this.game.audio?.suspendGame(false);
    this.game.input.requestLock();
  }
  togglePause() {
    const s = this.game.session;
    if (!s || s.ended) return;
    if (this.game.ui.modalOpen) { this.game.ui.closeModal(); return; }
    if (s.paused) this.resume(); else this.pause();
  }

  update(dt) {
    const s = this.game.session;
    if (!s) return;
    if (this.fade > 0) {
      this.fade -= dt;
      if (this.fade <= 0) s.controlsEnabled = true;
    }
    s.update(dt);
    s.render(this.game.renderer);
  }
}

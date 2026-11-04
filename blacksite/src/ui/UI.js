// UI 관리자 (M1 임시판 — M6에서 메뉴·설정 화면으로 확장)
import { bus } from '../core/EventBus.js';
import { el } from '../utils/dom.js';
import { HUD } from './HUD.js';
import { DataLogViewer } from './DataLogViewer.js';
import { renderResults } from './Results.js';
import { renderFailure } from './Failure.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.root = game.uiRoot;
    this.modalOpen = false;
    this.fade = el('div', 'fade');
    this.root.appendChild(this.fade);
    this.screen = el('div', 'screen');
    this.root.appendChild(this.screen);
    this.hud = new HUD(this.root);
    this.dbg = el('div', 'hud-debug'); this.root.appendChild(this.dbg);
    this.pauseEl = el('div', 'overlay hidden', '<div class="panel"><h2>PAUSED</h2><button data-a="resume">RESUME</button><button data-a="menu">MAIN MENU</button></div>');
    this.root.appendChild(this.pauseEl);
    this.pauseEl.addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === 'resume') this.game.fsm.current.resume();
      if (a === 'menu') this.game.fsm.change('menu');
    });
    this.logViewer = new DataLogViewer(this.root);
    this._t = 0;
  }
  openLog(log, meta) {
    const s = this.game.session;
    s.paused = true;
    this.modalOpen = true;
    this.game.input.exitLock();
    this.game.input.clear();
    this.logViewer.open(log, { ...meta, onClose: (via) => {
      this.modalOpen = false;
      this.game.input.clear();
      s.paused = false;
      if (via === 'esc') { this.game.fsm.current.pause?.(); return; }
      this.game.input.requestLock();
    } });
  }
  show(name, data) {
    this.hud.show(name === 'hud');
    this.hidePause();
    if (name === 'menu') {
      this.screen.innerHTML = '<div class="menu"><h1>BLACKSITE</h1><button data-a="start">GAME START</button></div>';
      this.screen.querySelector('[data-a=start]').onclick = () => this.game.fsm.change('playing', { difficulty: 'normal' });
    } else if (name === 'results') {
      renderResults(this.screen, data, this.game.cfg.game.difficulties, {
        onRetry: () => this.game.fsm.change('playing', { difficulty: data.difficulty }),
        onMenu: () => this.game.fsm.change('menu'),
      });
    } else if (name === 'failure') {
      renderFailure(this.screen, data, {
        onRetry: () => this.game.fsm.change('playing', { difficulty: data.difficulty }),
        onMenu: () => this.game.fsm.change('menu'),
      });
    } else this.screen.innerHTML = '';
    if (name !== 'hud') this.setFade(0);
  }
  showPause() { this.pauseEl.classList.remove('hidden'); }
  hidePause() { this.pauseEl.classList.add('hidden'); }
  closeModal() { if (this.logViewer.isOpen) this.logViewer.close('esc'); }
  setFade(v) { this.fade.style.transition = 'none'; this.fade.style.opacity = v; }
  fadeToBlack(t) { this.fade.style.transition = `opacity ${t}s ease`; this.fade.style.opacity = 1; }
  fadeFromBlack(t) {
    this.fade.style.transition = 'none';
    this.fade.style.opacity = 1;
    requestAnimationFrame(() => { this.fade.style.transition = `opacity ${t}s ease`; this.fade.style.opacity = 0; });
  }
  update(dt) {
    this.hud.update(dt);
    this.logViewer.update(dt);
    this._t += dt;
    const s = this.game.session;
    if (s && this._t > 0.25) {
      this._t = 0;
      const p = s.player;
      this.dbg.textContent =
        `FPS ${this.game.loop.fps.toFixed(0)} · ${s.zone ? s.zone.nameEn : '-'} · ${p.x.toFixed(1)}, ${p.z.toFixed(1)} · ${p.stance.name}`;
    }
  }
}

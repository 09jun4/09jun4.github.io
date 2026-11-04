// UI 관리자 (M1 임시판 — M6에서 메뉴·설정 화면으로 확장)
import { bus } from '../core/EventBus.js';
import { el } from '../utils/dom.js';
import { HUD } from './HUD.js';

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
    this._t = 0;
  }
  show(name) {
    this.hud.show(name === 'hud');
    this.hidePause();
    if (name === 'menu') {
      this.screen.innerHTML = '<div class="menu"><h1>BLACKSITE</h1><button data-a="start">GAME START</button></div>';
      this.screen.querySelector('[data-a=start]').onclick = () => this.game.fsm.change('playing', { difficulty: 'normal' });
    } else this.screen.innerHTML = '';
  }
  showPause() { this.pauseEl.classList.remove('hidden'); }
  hidePause() { this.pauseEl.classList.add('hidden'); }
  closeModal() {}
  setFade(v) { this.fade.style.transition = 'none'; this.fade.style.opacity = v; }
  fadeToBlack(t) { this.fade.style.transition = `opacity ${t}s ease`; this.fade.style.opacity = 1; }
  fadeFromBlack(t) {
    this.fade.style.transition = 'none';
    this.fade.style.opacity = 1;
    requestAnimationFrame(() => { this.fade.style.transition = `opacity ${t}s ease`; this.fade.style.opacity = 0; });
  }
  update(dt) {
    this.hud.update(dt);
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

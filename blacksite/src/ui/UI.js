// UI 관리자: 화면(메인 메뉴·브리핑·결과·실패), HUD, 일시정지, 모달(설정·조작법·로그·크레딧·확인), 페이드.
import { bus } from '../core/EventBus.js';
import { el, esc } from '../utils/dom.js';
import { HUD } from './HUD.js';
import { DataLogViewer } from './DataLogViewer.js';
import { renderResults } from './Results.js';
import { renderFailure } from './Failure.js';
import { renderMainMenu, renderCredits, renderControls, renderLogList } from './Menus.js';
import { renderBriefing } from './Briefing.js';
import { renderPause } from './Pause.js';
import { SettingsView } from './Settings.js';
import { renderAccount } from './Account.js';
import { ACTIONS, keyName } from '../input/KeyBindings.js';
import { MenuBackdrop } from '../environments/MenuBackdrop.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.root = game.uiRoot;
    this.screen = el('div', 'screen'); this.root.appendChild(this.screen);
    this.hud = new HUD(this.root);
    this.pauseEl = el('div', 'pause hidden'); this.root.appendChild(this.pauseEl);
    this.modalEl = el('div', 'modal hidden', `<div class="modal-win"><div class="modal-bar"><span class="modal-title"></span><button class="modal-x" aria-label="닫기">✕</button></div><div class="modal-body"></div></div>`);
    this.root.appendChild(this.modalEl);
    this.modalEl.querySelector('.modal-x').onclick = () => this.closeModal();
    this.modalEl.addEventListener('mousedown', (e) => { if (e.target === this.modalEl) this.closeModal(); });
    this.logViewer = new DataLogViewer(this.root);
    this.fade = el('div', 'fade'); this.root.appendChild(this.fade);
    this.notice = el('div', 'notice hidden'); this.root.appendChild(this.notice);
    this.settingsView = new SettingsView(game);
    this.modalStack = [];
    this.difficulty = game.cfg.game.defaultDifficulty;
    this.current = '';

    // 메뉴 3D 배경 (게임 월드와 분리)
    game.menuBackdrop = new MenuBackdrop(game.renderer, game.M);

    // UI 소리
    this.root.addEventListener('mouseover', (e) => { if (e.target.closest?.('.mm-item, .btn, .diff, .set-tab')) bus.emit('ui:hover'); });
    this.root.addEventListener('click', (e) => { if (e.target.closest?.('button')) bus.emit('ui:click'); });
    // 메뉴 화면에서 ESC → 모달 닫기
    bus.on('input:escape', () => {
      if (game.fsm?.name === 'playing') return;
      if (this.logViewer.isOpen) this.logViewer.close('esc');
      else if (this.modalOpen) this.closeModal();
    });
    bus.on('auth:changed', () => this.refreshAccount());
    bus.on('save:status', () => this.refreshAccount());
    bus.on('save:changed', () => { if (this.current === 'menu' && !this.modalOpen) this.show('menu'); });
  }

  get modalOpen() { return !this.modalEl.classList.contains('hidden') || this.logViewer.isOpen; }

  // --- 화면 ------------------------------------------------------------------
  show(name, data) {
    const g = this.game;
    this.current = name;
    this.hud.show(name === 'hud');
    this.hidePause();
    this.closeModal(true);
    this.screen.className = 'screen ' + name;
    if (name !== 'hud') this.setFade(0);
    if (name === 'menu') {
      renderMainMenu(this.screen, g, {
        start: () => g.fsm.change('briefing'),
        settings: () => this.openSettings(),
        controls: () => this.openControls(),
        logs: () => this.openLogArchive(),
        credits: () => this.openModal('CREDITS', (b) => renderCredits(b)),
        account: (box) => { this.accountBox = box; this.refreshAccount(); },
      });
    } else if (name === 'briefing') {
      renderBriefing(this.screen, g, {
        difficulty: this.difficulty,
        onDifficulty: (d) => { this.difficulty = d; },
        back: () => g.fsm.change('menu'),
        deploy: (d) => this.deploy(d),
      });
    } else if (name === 'results') {
      renderResults(this.screen, data, g.cfg.game.difficulties, {
        onRetry: () => this.deploy(data.difficulty),
        onMenu: () => g.fsm.change('menu'),
      });
    } else if (name === 'failure') {
      renderFailure(this.screen, data, {
        onRetry: () => this.deploy(data.difficulty),
        onMenu: () => g.fsm.change('menu'),
      });
    } else this.screen.innerHTML = '';
  }

  // DEPLOY: 화면이 어두워졌다가 미션 시작 (PlayState가 서서히 밝힘)
  deploy(difficulty) {
    this.difficulty = difficulty;
    this.fadeToBlack(0.5);
    // 포인터 락은 사용자 입력 안에서 요청해야 해서 클릭 시점에 미리 요청
    if (!this.game.autoplay) this.game.input.requestLock();
    setTimeout(() => this.game.fsm.change('playing', { difficulty }), 520);
  }

  refreshAccount() { if (this.accountBox?.isConnected) renderAccount(this.accountBox, this.game); }

  // --- 일시정지 ---------------------------------------------------------------
  showPause() {
    const g = this.game, ps = g.fsm.current;
    renderPause(this.pauseEl, {
      resume: () => ps.resume(),
      settings: () => this.openSettings(),
      restart: () => this.confirm('RESTART MISSION', '미션을 처음부터 다시 시작할까요? 현재 진행은 사라져요.').then((ok) => {
        if (ok) { g.input.requestLock(); g.fsm.change('playing', { difficulty: ps.difficulty }); }
      }),
      menu: () => this.confirm('MAIN MENU', '메인 메뉴로 나갈까요? 진행 중인 미션은 초기화돼요.').then((ok) => { if (ok) g.fsm.change('menu'); }),
    });
    const s = g.session;
    const o = s?.mission?.current;
    this.pauseEl.querySelector('.pp-obj').innerHTML = o ? `<span class="tag">CURRENT OBJECTIVE</span><div>${esc(o.text)}</div><div class="dim small">${esc(s.zone ? s.zone.name + ' · ' + s.zone.nameEn : '')}</div>` : '';
    this.pauseEl.classList.remove('hidden');
  }
  hidePause() { this.pauseEl.classList.add('hidden'); }

  // --- 모달 -------------------------------------------------------------------
  openModal(title, render, { wide = false, onClose } = {}) {
    this.modalEl.querySelector('.modal-title').textContent = title;
    const body = this.modalEl.querySelector('.modal-body');
    body.innerHTML = '';
    this.modalEl.querySelector('.modal-win').classList.toggle('wide', wide);
    render(body);
    this.modalEl.classList.remove('hidden');
    this._onModalClose = onClose;
  }
  closeModal(silent) {
    if (this.logViewer.isOpen) { this.logViewer.close(silent ? 'silent' : 'esc'); return; }
    if (this.modalEl.classList.contains('hidden')) return;
    this.game.input.capture = null;
    this.modalEl.classList.add('hidden');
    const cb = this._onModalClose; this._onModalClose = null;
    cb?.();
    if (!silent && this.current === 'menu') this.show('menu');
  }
  openSettings() { this.openModal('SETTINGS · 설정', (b) => this.settingsView.render(b), { wide: true }); }
  openControls() { this.openModal('CONTROLS · 조작법', (b) => renderControls(b, this.game.bindings, keyName, ACTIONS)); }
  openLogArchive() {
    const logs = this.game.cfg.logs.logs || [];
    this.openModal('DATA LOGS · 데이터 로그', (b) => renderLogList(b, logs, this.game.save.readLogs, (log) => {
      this.modalEl.classList.add('hidden');
      this.logViewer.open(log, { index: logs.indexOf(log) + 1, total: logs.length, onClose: (via) => { if (via !== 'silent') this.openLogArchive(); } });
      this.logViewer.pos = 0;
    }));
  }
  confirm(title, text) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; this._onModalClose = null; this.modalEl.classList.add('hidden'); resolve(v); };
      this.openModal(title, (b) => {
        b.innerHTML = `<p class="confirm-text">${esc(text)}</p><div class="report-actions"><button class="btn primary" data-a="ok">CONFIRM</button><button class="btn" data-a="no">CANCEL</button></div>`;
        b.querySelector('[data-a=ok]').onclick = () => finish(true);
        b.querySelector('[data-a=no]').onclick = () => finish(false);
      }, { onClose: () => finish(false) });
    });
  }

  // 플레이 중 데이터 로그 열람 (게임 일시정지)
  openLog(log, meta) {
    const g = this.game, s = g.session;
    s.paused = true;
    g.input.exitLock();
    g.input.clear();
    g.audio?.suspendGame(true);
    this.logViewer.open(log, { ...meta, onClose: (via) => {
      g.input.clear();
      s.paused = false;
      g.audio?.suspendGame(false);
      if (via === 'esc' || via === 'silent') { if (via === 'esc') g.fsm.current.pause?.(); return; }
      if (!g.autoplay) g.input.requestLock();
    } });
  }

  // 앱 안 브라우저 안내 등
  showNotice(html, ms = 0) {
    this.notice.innerHTML = html + '<button class="notice-x" aria-label="닫기">✕</button>';
    this.notice.classList.remove('hidden');
    this.notice.querySelector('.notice-x').onclick = () => this.notice.classList.add('hidden');
    if (ms) setTimeout(() => this.notice.classList.add('hidden'), ms);
  }

  // --- 페이드 -----------------------------------------------------------------
  setFade(v) { this.fade.style.transition = 'none'; this.fade.style.opacity = v; }
  fadeToBlack(t) { this.fade.style.transition = `opacity ${t}s ease`; this.fade.style.opacity = 1; }
  fadeFromBlack(t) {
    this.fade.style.transition = 'none';
    this.fade.style.opacity = 1;
    void this.fade.offsetWidth;
    this.fade.style.transition = `opacity ${t}s ease-in`;
    this.fade.style.opacity = 0;
  }

  update(dt) {
    this.hud.update(dt);
    this.logViewer.update(dt);
  }
}

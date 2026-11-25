// UI: 메뉴·스테이지 선택·HUD·일시정지·설정·완료 화면. 게임 공간을 가리지 않게 최소한으로.
import { Save } from '../core/Save.js';
import { inAppBrowser } from '../core/Cloud.js';

const $ = id => document.getElementById(id);
const ARROW = '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

export class UI {
  constructor({ settings, save, audio }) {
    this.settings = settings; this.save = save; this.audio = audio;
    this.stack = []; // 열린 오버레이 (뒤로 가기)
    this.chapter = 1;
    this.bind();
  }
  get g() { return this.game; }

  bind() {
    const click = (id, f) => $(id).addEventListener('click', () => { this.audio.unlock(); this.audio.play('ui'); f(); });
    // 메인 메뉴
    click('m-play', () => this.showSelect());
    click('m-continue', () => { const r = this.save.data.resume; if (r && this.g.stageDefs.has(r.stage)) { this.hideAll(); this.g.startStage(r.stage, r.state); } });
    click('m-settings', () => this.open('settings'));
    click('m-credits', () => this.open('credits'));
    click('m-exit', () => this.open('exitinfo'));
    click('acc-btn', () => { if (this.cloud.state === 'in') this.cloud.signOut(); else this.cloud.signIn(); });
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { this.audio.play('ui'); this.back(); }));
    // HUD
    click('b-hint', () => this.g.requestHint());
    click('b-undo', () => this.g.undo());
    click('b-reset', () => this.confirmRestart());
    click('b-pause', () => this.g.pause());
    click('intro-ok', () => this.close('intro'));
    $('h-hint').addEventListener('click', () => { $('h-hint').hidden = true; });
    // 일시정지
    click('p-resume', () => this.g.resume());
    click('p-settings', () => this.open('settings'));
    click('p-save', () => this.toast(this.g.saveProgress() ? '저장했어요. 메인 메뉴의 "이어하기"로 돌아올 수 있어요' : '저장하지 못했어요 (브라우저 저장 공간 확인)'));
    click('p-restart', () => this.g.restartStage());
    click('p-select', () => { this.g.saveProgress(); this.hideAll(); this.g.toMenu(); this.showSelect(); });
    click('p-menu', () => { this.g.saveProgress(); this.hideAll(); this.g.toMenu(); });
    click('p-debug', () => { this.g.debug.toggle(); this.g.debug.rebuild(this.g.sim); this.g.resume(); });
    // 확인
    click('confirm-no', () => this.close('confirm'));
    click('confirm-yes', () => { this.close('confirm'); this.g.restartStage(); });
    // 완료
    click('c-next', () => { const n = this.g.nextStageId(); this.close('complete'); if (n) this.g.startStage(n); else { this.g.toMenu(); this.showSelect(); } });
    click('c-select', () => { this.close('complete'); this.g.toMenu(); this.showSelect(); });
    // 설정
    for (const k of ['master', 'music', 'sfx']) {
      const el = $('s-' + k);
      el.value = this.settings[k];
      el.addEventListener('input', () => { this.settings[k] = +el.value; this.audio.setVolumes(this.settings); Save.saveSettings(this.settings); });
    }
    document.querySelectorAll('.seg [data-q]').forEach(b => b.addEventListener('click', () => {
      this.settings.quality = b.dataset.q; Save.saveSettings(this.settings);
      this.syncQuality(); this.g.setQuality(b.dataset.q); this.audio.play('ui');
    }));
    this.syncQuality();
    click('s-full', () => this.toggleFullscreen());
    click('s-close', () => this.back());
    $('error-back').addEventListener('click', () => { this.close('error'); (this.errBack || (() => this.g.toMenu()))(); });
    $('error-retry').addEventListener('click', () => { this.close('error'); (this.errRetry || (() => location.reload()))(); });
  }
  syncQuality() { document.querySelectorAll('.seg [data-q]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === this.settings.quality))); }
  toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen || (() => {})).call(d.documentElement);
    else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  }

  // ---- 오버레이 관리 ----
  open(id) { $(id).hidden = false; this.stack.push(id); const f = $(id).querySelector('button.primary, button'); f && f.focus({ preventScroll: true }); }
  close(id) { $(id).hidden = true; this.stack = this.stack.filter(x => x !== id); }
  back() {
    const top = this.stack.pop();
    if (top) { $(top).hidden = true; if (top === 'pause') this.g.resume(); return; }
  }
  hideAll() { for (const id of ['menu', 'select', 'hud', 'intro', 'pause', 'settings', 'credits', 'exitinfo', 'complete', 'confirm']) $(id).hidden = true; this.stack = []; }

  showMenu() {
    this.hideAll();
    $('menu').hidden = false;
    const r = this.save.data.resume;
    $('m-continue').hidden = !(r && this.g.stageDefs.has(r.stage));
    this.updateAccount();
    $('loading').classList.add('out');
  }
  showSelect() {
    $('select').hidden = false; this.stack.push('select');
    const last = this.g.order.find(id => !this.save.data.cleared[id]);
    if (last) this.chapter = this.g.stageDefs.get(last).chapter || 1;
    this.refreshSelect();
  }
  refreshSelect() {
    if ($('select').hidden || !this.g.index) return;
    const tabs = $('chapters'); tabs.innerHTML = '';
    const total = this.g.order.length, done = this.g.order.filter(id => this.save.data.cleared[id]).length;
    $('sel-progress').textContent = `${done} / ${total}`;
    for (const ch of this.g.index.chapters) {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(ch.id === this.chapter));
      b.textContent = `${ch.id}장 · ${ch.name}`;
      const ids = this.g.order.filter(id => this.g.stageDefs.get(id).chapter === ch.id);
      b.disabled = !ids.length;
      b.onclick = () => { this.chapter = ch.id; this.audio.play('ui'); this.refreshSelect(); };
      tabs.append(b);
    }
    const grid = $('stages'); grid.innerHTML = '';
    for (const id of this.g.order) {
      const st = this.g.stageDefs.get(id);
      if (st.chapter !== this.chapter) continue;
      const rec = this.save.data.cleared[id], open = this.g.isUnlocked(id);
      const b = document.createElement('button');
      b.className = 'stage-card' + (rec ? ' done' : '') + (open ? '' : ' locked');
      b.innerHTML = `<span class="num">${st.id}</span><span class="nm"></span><span class="en"></span>
        <span class="diff">${[1, 2, 3, 4, 5, 6].map(i => `<i class="${i <= st.difficulty ? 'on' : ''}"></i>`).join('')}</span>
        <span class="st">${rec ? `완료 · 최소 접기 ${rec.best}` : open ? '도전 가능' : '잠김'}</span>`;
      b.querySelector('.nm').textContent = st.name;
      b.querySelector('.en').textContent = st.title;
      b.setAttribute('aria-label', `${st.id} ${st.name} ${rec ? '완료' : open ? '' : '잠김'}`);
      b.onclick = () => {
        if (!open) { this.toast('앞 스테이지를 먼저 완료해 주세요'); return; }
        this.audio.play('ui'); this.hideAll(); this.g.startStage(id);
      };
      grid.append(b);
    }
  }

  // ---- 계정 ----
  updateAccount() {
    const c = this.cloud;
    if (!c) return;
    const inn = c.state === 'in';
    $('acc-name').textContent = inn ? (c.user.name || '로그인됨') + (c.isAdmin ? ' · 관리자' : '') : c.state === 'pending' ? '불러오는 중…' : '게스트';
    $('acc-btn').textContent = inn ? '로그아웃' : '구글 로그인';
    $('acc-btn').disabled = c.state === 'pending';
    const ph = $('acc-photo');
    ph.hidden = !(inn && c.user.photo); if (inn && c.user.photo) ph.src = c.user.photo;
    const app = inAppBrowser();
    const msg = c.error || (app && !inn ? `${app} 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위 메뉴의 "다른 브라우저로 열기"로 크롬·사파리에서 열어 주세요.` : '');
    $('acc-msg').hidden = !msg; $('acc-msg').textContent = msg;
    $('p-debug').hidden = !c.isAdmin;
    this.refreshSelect();
  }

  // ---- HUD ----
  showHud(st) {
    this.hideAll();
    $('hud').hidden = false; $('h-hint').hidden = true;
    $('h-stage').innerHTML = `<b>${st.id}</b>`;
    $('h-stage').append(document.createTextNode(st.name));
  }
  updateHud(h) {
    $('h-goal').textContent = h.goal;
    $('h-folds').textContent = `접기 ${h.folds}`;
    $('b-undo').disabled = !h.canUndo;
    $('h-key').hidden = !h.keys;
    $('h-key').textContent = h.keys > 1 ? `열쇠 ${h.keys}` : '열쇠';
    const ex = $('h-exit');
    ex.hidden = !h.requires;
    ex.textContent = h.exitActive ? '출구 열림' : '출구 잠김';
    ex.classList.toggle('on', !!h.exitActive);
  }
  showIntro(st) {
    $('intro-title').textContent = `${st.id}  ${st.name}`;
    $('intro-text').textContent = st.intro;
    this.open('intro');
  }
  hintBusy(v) { $('b-hint').classList.toggle('busy', v); $('b-hint').disabled = v; }
  hintText(t) {
    const el = $('h-hint');
    el.textContent = t; el.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { el.hidden = true; }, 9000);
  }
  placeFoldArrows(list) {
    const box = $('fold-arrows'), key = list ? list.map(a => a.dq + ':' + (a.x | 0) + ',' + (a.y | 0)).join('|') : '';
    if (key === this.arrowKey) return;
    this.arrowKey = key;
    if (!list || !list.length) { box.innerHTML = ''; return; }
    if (box.children.length !== list.length) {
      box.innerHTML = '';
      for (const a of list) {
        const b = document.createElement('button');
        b.className = 'farrow'; b.innerHTML = ARROW;
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', () => this.g.foldBy(this.g.selected, +b.dataset.dq));
        box.append(b);
      }
    }
    list.forEach((a, i) => {
      const b = box.children[i];
      b.dataset.dq = a.dq;
      b.style.left = a.x + 'px'; b.style.top = a.y + 'px';
      b.firstChild.style.transform = `rotate(${a.ang}rad)`;
      b.setAttribute('aria-label', `이쪽으로 접기 (${a.dq < 0 ? 'Q' : 'E'})`);
    });
  }
  showPause() { this.open('pause'); }
  hidePause() { this.close('pause'); this.close('settings'); }
  confirmRestart() { if (this.g.state === 'Playing') this.open('confirm'); }
  showComplete(st, folds, prevBest, next) {
    const last = !next;
    $('c-tag').textContent = last ? '모든 스테이지 완료' : `${st.id} 완료`;
    $('c-title').textContent = st.name;
    $('c-story').textContent = st.story || '';
    $('c-stats').textContent = `접기 ${folds}번` + (prevBest !== null && prevBest !== undefined ? (folds < prevBest ? ` · 최소 기록 경신 (이전 ${prevBest})` : ` · 최소 ${Math.min(prevBest, folds)}`) : '');
    $('c-next').textContent = last ? '스테이지 선택으로' : '다음 스테이지';
    $('c-select').hidden = last;
    $('hud').hidden = true;
    this.open('complete');
  }

  toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    const box = $('toast');
    while (box.children.length > 2) box.firstChild.remove();
    box.append(el);
    setTimeout(() => el.remove(), 2700);
  }
  error(msg, retry, back) {
    $('error-text').textContent = msg;
    this.errRetry = retry; this.errBack = back;
    $('error').hidden = false;
    $('loading').classList.add('out');
  }
}

// 미니멀 HUD: 체력, 탄약(15 / ∞), 십자 조준점, 히트 마커, 피격 비네트, 상호작용 안내, 목표, 진행 바, 토스트.
import { el, esc } from '../utils/dom.js';

export class HUD {
  constructor(root) {
    this.root = el('div', 'hud hidden');
    this.root.innerHTML = `
      <div class="hud-vignette"></div>
      <div class="hud-fps hidden"></div>
      <div class="hud-objective hidden"><div class="obj-tag">OBJECTIVE</div><div class="obj-text"></div><div class="obj-dist"></div></div>
      <div class="hud-marker hidden"><div class="mk-diamond"></div><div class="mk-dist"></div></div>
      <div class="crosshair"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><i class="c-dot"></i></div>
      <div class="hitmarker"><i></i><i></i><i></i><i></i></div>
      <div class="hud-prompt hidden"><span class="key">F</span><span class="txt"></span></div>
      <div class="hud-progress hidden"><div class="pg-label">DOWNLOADING</div><div class="pg-bar"><i></i></div><div class="pg-pct">0%</div></div>
      <div class="hud-toast hidden"><div class="t-title"></div><div class="t-sub"></div></div>
      <div class="hud-health">
        <div class="lbl">HEALTH</div>
        <div class="row"><div class="num">100</div><div class="bar"><i></i></div></div>
      </div>
      <div class="hud-ammo">
        <div class="lbl">AMMO</div>
        <div class="row"><span class="mag">15</span><span class="res">/ ∞</span></div>
        <div class="reload hidden">RELOAD</div>
      </div>
      <div class="hud-cine hidden"><i class="top"></i><i class="bot"></i></div>`;
    root.appendChild(this.root);
    const q = (s) => this.root.querySelector(s);
    this.e = {
      vignette: q('.hud-vignette'), fps: q('.hud-fps'), obj: q('.hud-objective'), objText: q('.obj-text'), objDist: q('.obj-dist'),
      marker: q('.hud-marker'), markerDist: q('.mk-dist'), cross: q('.crosshair'), hit: q('.hitmarker'), prompt: q('.hud-prompt'),
      promptKey: q('.hud-prompt .key'), promptTxt: q('.hud-prompt .txt'), progress: q('.hud-progress'), pgBar: q('.pg-bar i'),
      pgPct: q('.pg-pct'), pgLabel: q('.pg-label'), toast: q('.hud-toast'), toastTitle: q('.t-title'), toastSub: q('.t-sub'),
      hpNum: q('.hud-health .num'), hpBar: q('.hud-health .bar i'), health: q('.hud-health'), mag: q('.hud-ammo .mag'),
      res: q('.hud-ammo .res'), reload: q('.hud-ammo .reload'), ammo: q('.hud-ammo'), cine: q('.hud-cine'),
    };
    this.hitT = 0; this.dmgT = 0; this.toastT = 0;
    this._last = {};
  }

  show(v) { this.root.classList.toggle('hidden', !v); }
  _set(key, val, fn) { if (this._last[key] !== val) { this._last[key] = val; fn(val); } }

  setHealth(hp, max) {
    const v = Math.ceil(hp);
    this._set('hp', v, () => {
      this.e.hpNum.textContent = v;
      this.e.hpBar.style.width = (hp / max) * 100 + '%';
      this.e.health.classList.toggle('low', hp / max < 0.3);
    });
  }
  setAmmo(mag, reserve, magSize, reloading) {
    this._set('ammo', `${mag}|${reloading}`, () => {
      this.e.mag.textContent = mag;
      this.e.res.textContent = '/ ' + (reserve === Infinity ? '∞' : reserve);
      this.e.ammo.classList.toggle('empty', mag === 0);
      this.e.ammo.classList.toggle('low', mag > 0 && mag <= Math.ceil(magSize * 0.2));
      const showReload = !reloading && mag <= Math.ceil(magSize * 0.2);
      this.e.reload.classList.toggle('hidden', !showReload);
    });
  }
  setCrosshair(spreadPx, aiming, hidden) {
    const v = `${Math.round(spreadPx)}|${aiming}|${hidden}`;
    this._set('cross', v, () => {
      this.e.cross.style.setProperty('--gap', Math.round(spreadPx) + 'px');
      this.e.cross.classList.toggle('aim', aiming);
      this.e.cross.classList.toggle('hidden', hidden);
    });
  }
  hitMarker(kill) {
    this.e.hit.classList.remove('on', 'kill');
    void this.e.hit.offsetWidth;
    this.e.hit.classList.add('on');
    if (kill) this.e.hit.classList.add('kill');
  }
  damage() {
    this.e.vignette.classList.remove('on');
    void this.e.vignette.offsetWidth;
    this.e.vignette.classList.add('on');
  }
  setPrompt(text, key = 'F') {
    this._set('prompt', text ? key + text : '', () => {
      this.e.prompt.classList.toggle('hidden', !text);
      if (text) { this.e.promptKey.textContent = key; this.e.promptTxt.textContent = text; }
    });
  }
  setObjective(text) {
    this._set('obj', text || '', () => {
      this.e.obj.classList.toggle('hidden', !text);
      if (text) {
        this.e.objText.textContent = text;
        this.e.obj.classList.remove('flash'); void this.e.obj.offsetWidth; this.e.obj.classList.add('flash');
      }
    });
  }
  setObjectiveDistance(d) { this._set('objd', d == null ? '' : Math.round(d), (v) => { this.e.objDist.textContent = v === '' ? '' : v + ' m'; }); }
  // 화면 위 목표 마커 (x, y 픽셀) — 화면 밖이면 가장자리에 고정
  setMarker(x, y, dist, visible) {
    if (!visible) { this._set('mk', 'off', () => this.e.marker.classList.add('hidden')); return; }
    this._last.mk = 'on';
    this.e.marker.classList.remove('hidden');
    this.e.marker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this._set('mkd', Math.round(dist), (v) => { this.e.markerDist.textContent = v + 'm'; });
  }
  setProgress(p, label) {
    const v = p == null ? 'off' : Math.floor(p * 100);
    this._set('pg', v + (label || ''), () => {
      this.e.progress.classList.toggle('hidden', p == null);
      if (p != null) {
        this.e.pgBar.style.width = v + '%';
        this.e.pgPct.textContent = v + '%';
        if (label) this.e.pgLabel.textContent = label;
      }
    });
  }
  toast(title, sub = '', dur = 3.2, kind = '') {
    this.e.toastTitle.textContent = title;
    this.e.toastSub.innerHTML = esc(sub);
    this.e.toast.className = 'hud-toast ' + kind;
    void this.e.toast.offsetWidth;
    this.e.toast.classList.add('on');
    this.toastT = dur;
  }
  setFps(fps, show) {
    this._set('fpsShow', show, (v) => this.e.fps.classList.toggle('hidden', !v));
    if (show) this._set('fps', Math.round(fps), (v) => { this.e.fps.textContent = v + ' FPS'; });
  }
  cinematic(on) { this.root.classList.toggle('cine', on); this.e.cine.classList.toggle('hidden', !on); }
  update(dt) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.e.toast.classList.remove('on');
    }
  }
  reset() {
    this._last = {};
    this.setPrompt(null); this.setObjective(null); this.setProgress(null); this.setMarker(0, 0, 0, false);
    this.e.toast.classList.remove('on'); this.toastT = 0;
    this.cinematic(false);
  }
}

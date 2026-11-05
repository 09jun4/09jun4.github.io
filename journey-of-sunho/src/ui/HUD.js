// HUD — 주행 중 정보 표시 (DOM). 게이지는 수치 + 색 변화, 위험하면 깜빡임과 화면 가장자리 경고.
import { clamp, invLerp, KMH } from '../core/utils.js';

export const WEATHER_ICON = {
  clear: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="8" fill="#ffd43b"/><g stroke="#ffd43b" stroke-width="3" stroke-linecap="round"><path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5L32 32M8 32l3.5-3.5M28.5 11.5L32 8"/></g></svg>',
  rain: '<svg viewBox="0 0 40 40"><path d="M10 22a7 7 0 0 1 2-13.7A9 9 0 0 1 29 10a6 6 0 0 1 1 12z" fill="#adb5bd"/><g stroke="#4dabf7" stroke-width="2.5" stroke-linecap="round"><path d="M13 27l-2 6M20 27l-2 6M27 27l-2 6"/></g></svg>',
  snow: '<svg viewBox="0 0 40 40"><path d="M10 22a7 7 0 0 1 2-13.7A9 9 0 0 1 29 10a6 6 0 0 1 1 12z" fill="#ced4da"/><g fill="#fff"><circle cx="13" cy="29" r="2.2"/><circle cx="20" cy="33" r="2.2"/><circle cx="27" cy="29" r="2.2"/></g></svg>',
  wind: '<svg viewBox="0 0 40 40"><g fill="none" stroke="#e9ecef" stroke-width="3" stroke-linecap="round"><path d="M4 15h22a5 5 0 1 0-5-5"/><path d="M4 22h28a5 5 0 1 1-5 5"/><path d="M4 29h12"/></g></svg>',
  fog: '<svg viewBox="0 0 40 40"><g stroke="#ced4da" stroke-width="3.5" stroke-linecap="round"><path d="M6 12h28M10 19h24M6 26h28M12 33h18"/></g></svg>',
};

const GAUGES = [
  { key: 'bodyTemp', label: '체온', invert: false },
  { key: 'fatigue', label: '피로도', invert: true },
  { key: 'balance', label: '균형', invert: false },
  { key: 'cleanliness', label: '청결도', invert: false },
];

export class HUD {
  constructor(root) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="hud-vignette"></div><div class="hud-speedfx"></div>
      <div class="hud-stats panel">
        ${GAUGES.map((g) => `<div class="g" data-k="${g.key}"><span class="gl">${g.label}</span><div class="gb"><i></i></div><span class="gv">-</span></div>`).join('')}
        <div class="badges"><span class="badge cold">감기</span><span class="badge wet">옷 젖음</span><span class="badge risk">감기 기운</span></div>
      </div>
      <div class="hud-top">
        <div class="hud-chapter"></div>
        <div class="hud-progress"><div class="bar"><i></i><b class="home"></b></div><span class="remain">-</span></div>
        <div class="hud-turn"></div>
      </div>
      <div class="hud-right">
        <div class="hud-map-slot"></div>
        <div class="hud-weather panel"><div class="wi"></div><div class="wt"><b class="wn">-</b><span class="wtemp">-</span><span class="wwind"></span></div><div class="warrow"><svg viewBox="0 0 24 24"><path d="M12 2l6 14h-5v6h-2v-6H6z" fill="#e9ecef"/></svg></div></div>
      </div>
      <div class="hud-speed"><div class="sv">0</div><div class="su">km/h</div><svg class="sarc" viewBox="0 0 120 70"><path d="M10 64 A50 50 0 0 1 110 64" class="track"/><path d="M10 64 A50 50 0 0 1 110 64" class="fill"/></svg><div class="time">0:00</div></div>
      <div class="hud-keys">↑ 페달 · ↓ 감속 · ← → 조향 · Space 브레이크 · Esc 일시정지</div>
      <div class="hud-toast"></div>
      <div class="hud-bubble"></div>
    `;
    root.appendChild(this.root);
    this.$ = (s) => this.root.querySelector(s);
    this.g = {};
    for (const g of GAUGES) {
      const el = this.root.querySelector(`[data-k="${g.key}"]`);
      this.g[g.key] = { el, bar: el.querySelector('i'), val: el.querySelector('.gv') };
    }
    this.toastQ = [];
    this.toastT = 0;
    this.bubbleT = 0;
    this.arcLen = 157;
  }

  show(on = true) { this.root.classList.toggle('hidden', !on); }
  mapSlot() { return this.$('.hud-map-slot'); }

  setChapter(title) { this.$('.hud-chapter').textContent = title; }

  toast(text, kind = '') {
    if (this.toastQ.length >= 2) this.toastQ.shift(); // 밀린 알림은 버려서 늦게 뜨지 않게
    this.toastQ.push({ text, kind });
  }
  // 선호의 속마음 말풍선
  say(text, dur = 3.5) {
    const b = this.$('.hud-bubble');
    b.textContent = text;
    b.classList.add('on');
    this.bubbleT = dur;
  }

  _gauge(key, pct, text, level) {
    const g = this.g[key];
    g.bar.style.width = clamp(pct, 0, 100).toFixed(1) + '%';
    g.val.textContent = text;
    g.el.dataset.level = level;
  }

  update(dt, { state, physics, weather, progress, chapterTime, nextTurn, windRel }) {
    const st = state;
    if (st) {
      this._gauge('bodyTemp', invLerp(34, 37.5, st.bodyTemp) * 100, st.bodyTemp.toFixed(1) + '°C', st.level('bodyTemp'));
      this._gauge('fatigue', st.fatigue, Math.round(st.fatigue), st.level('fatigue'));
      this._gauge('balance', st.balance, Math.round(st.balance), st.level('balance'));
      this._gauge('cleanliness', st.cleanliness, Math.round(st.cleanliness), st.level('cleanliness'));
      this.$('.badge.cold').classList.toggle('on', st.sick);
      this.$('.badge.wet').classList.toggle('on', st.clothesWet > 0.3);
      this.$('.badge.risk').classList.toggle('on', !st.sick && st.coldRisk > 50);
      const danger = Math.max(st.level('bodyTemp'), st.level('balance'), st.level('fatigue')) === 2;
      this.$('.hud-vignette').classList.toggle('on', danger);
      this.$('.hud-vignette').classList.toggle('cold', st.level('bodyTemp') === 2);
    }
    if (physics) {
      const kmh = physics.v * KMH;
      this.$('.sv').textContent = Math.round(kmh);
      this.$('.hud-speedfx').style.opacity = clamp((kmh - 32) / 22, 0, 0.75).toFixed(2);
      const f = this.$('.sarc .fill');
      f.style.strokeDasharray = `${this.arcLen}`;
      f.style.strokeDashoffset = `${this.arcLen * (1 - clamp(kmh / 60, 0, 1))}`;
    }
    if (chapterTime !== undefined) {
      const m = Math.floor(chapterTime / 60), s = Math.floor(chapterTime % 60);
      this.$('.time').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
    if (progress) {
      this.$('.hud-progress .bar i').style.width = (clamp(progress.s / progress.length, 0, 1) * 100).toFixed(1) + '%';
      const remain = Math.max(0, progress.length - progress.s);
      this.$('.remain').textContent = remain >= 1000 ? `집까지 ${(remain / 1000).toFixed(2)} km` : `집까지 ${Math.round(remain)} m`;
    }
    const turn = this.$('.hud-turn');
    if (nextTurn && nextTurn.dist < 70) {
      turn.textContent = `${Math.round(nextTurn.dist)} m 앞 ${nextTurn.text}`;
      turn.classList.add('on');
    } else turn.classList.remove('on');
    if (weather) {
      const w = this.$('.hud-weather');
      if (w.dataset.type !== weather.type) {
        w.dataset.type = weather.type;
        this.$('.wi').innerHTML = WEATHER_ICON[weather.type] || '';
        this.$('.wn').textContent = weather.name;
      }
      this.$('.wtemp').textContent = `기온 ${weather.temp.toFixed(1)}°C`;
      this.$('.wwind').textContent = weather.windSpeed > 1.5 ? `바람 ${weather.windSpeed.toFixed(1)} m/s` : '';
      const a = this.$('.warrow');
      a.style.opacity = weather.windSpeed > 1.5 ? 1 : 0;
      if (windRel !== undefined) a.style.transform = `rotate(${(windRel * 180) / Math.PI}deg)`;
    }
    // 알림
    const t = this.$('.hud-toast');
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) t.classList.remove('on');
    } else if (this.toastQ.length) {
      const n = this.toastQ.shift();
      t.textContent = n.text;
      t.className = 'hud-toast on ' + n.kind;
      this.toastT = 2.6;
    }
    if (this.bubbleT > 0) { this.bubbleT -= dt; if (this.bubbleT <= 0) this.$('.hud-bubble').classList.remove('on'); }
  }
}

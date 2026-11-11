// 품질 관리: 프리셋(낮음/높음/최고)을 적용하고, FPS가 낮으면 프리셋을 한 칸씩 내린다.
// 모델·재질을 실제로 바꾸는 일은 onApply 콜백(core/visuals.js)이 맡는다.
import { PRESETS, PRESET_ORDER, AUTO_QUALITY } from '../data/quality.js';

export class QualityManager {
  /**
   * @param {object} o
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {import('./settings.js').Settings} o.settings
   * @param {(name:string, cfg:object, prev:string|null)=>void} o.onApply 프리셋이 바뀌었을 때(같은 tier 안의 변화 포함)
   * @param {(name:string)=>void} [o.onLowered] 자동으로 낮췄을 때
   */
  constructor({ renderer, settings, onApply, onLowered }) {
    this.renderer = renderer;
    this.settings = settings;
    this.onApply = onApply;
    this.onLowered = onLowered;
    this.name = PRESETS[settings.get('quality')] ? settings.get('quality') : 'low';
    this.fps = 60;
    this.busy = false; // 재생성 중에는 측정하지 않는다
    this._time = 0;
    this._frames = 0;
    this._wait = AUTO_QUALITY.warmup;
  }

  get cfg() {
    return PRESETS[this.name];
  }

  get tier() {
    return this.cfg.tier;
  }

  pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const p = this.cfg.pixelRatio;
    return p >= 1 ? Math.min(dpr, p) : p;
  }

  /** 현재 프리셋을 적용한다(시작할 때 한 번 직접 부른다). */
  apply(prev = null) {
    this.renderer.setPixelRatio(this.pixelRatio());
    this._resetWindow(AUTO_QUALITY.warmup);
    return this.onApply(this.name, this.cfg, prev);
  }

  /**
   * 프리셋을 바꾼다.
   * @param {string} name 'low' | 'high' | 'ultra'
   * @param {boolean} manual 사용자가 직접 골랐으면 true → 자동 선택(벤치마크)을 끈다
   */
  setQuality(name, manual = true) {
    if (!PRESETS[name] || name === this.name) {
      if (manual) this.settings.set('benchmarked', true);
      return Promise.resolve();
    }
    const prev = this.name;
    this.name = name;
    this.settings.set('quality', name);
    if (manual) this.settings.set('benchmarked', true);
    return Promise.resolve(this.apply(prev));
  }

  _resetWindow(wait) {
    this._time = 0;
    this._frames = 0;
    this._wait = wait;
  }

  /** 설정 화면에 보여 줄 현재 상태 한 줄 */
  describe() {
    const auto = this.settings.get('autoQuality');
    return `${this.name === 'min' ? '낮음(자동 조절로 해상도 낮춤)' : this.cfg.label}${auto ? '' : ' · 고정'}`;
  }

  /** 렌더 프레임마다 호출. measuring=false(일시정지·탭 숨김·로딩)일 때는 재지 않는다. */
  frame(frameDt, measuring) {
    if (!measuring || this.busy || frameDt <= 0) { this._resetWindow(Math.max(this._wait, 0.5)); return; }
    if (this._wait > 0) { this._wait -= frameDt; return; }
    this._time += frameDt;
    this._frames++;
    if (this._time < AUTO_QUALITY.window) return;
    this.fps = this._frames / this._time;
    const low = this.fps < AUTO_QUALITY.minFps;
    this._resetWindow(0);
    const i = PRESET_ORDER.indexOf(this.name);
    if (low && this.settings.get('autoQuality') && i < PRESET_ORDER.length - 1) {
      const next = PRESET_ORDER[i + 1];
      this.setQuality(next, false);
      this._wait = AUTO_QUALITY.cooldown;
      if (this.onLowered) this.onLowered(next);
    }
  }
}

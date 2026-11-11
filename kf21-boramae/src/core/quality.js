// 품질 관리: 설정의 높음/낮음을 실제 값(해상도 배율·구름 수·파티클 수)으로 적용하고,
// FPS가 낮으면 자동으로 한 단계씩 낮춘다. 낮춘 결과는 설정에 반영된다. 자동 조절은 끌 수 있다(고정).
import { QUALITY_STEPS, QUALITY_PRESETS, AUTO_QUALITY } from '../data/quality.js';
import { clamp } from './math.js';

export class QualityManager {
  /**
   * @param {object} o
   * @param {THREE.WebGLRenderer} o.renderer
   * @param {import('../world/world.js').World} o.world
   * @param {import('../entities/effects.js').Effects} o.fx
   * @param {import('./settings.js').Settings} o.settings
   * @param {(step:number)=>void} [o.onLowered] 자동으로 낮췄을 때
   * @param {()=>void} [o.onResize] 해상도 배율이 바뀌었을 때
   */
  constructor({ renderer, world, fx, settings, onLowered, onResize }) {
    this.renderer = renderer;
    this.world = world;
    this.fx = fx;
    this.settings = settings;
    this.onLowered = onLowered;
    this.onResize = onResize;
    this.step = clamp(settings.get('qualityStep'), 0, QUALITY_STEPS.length - 1);
    this.fps = 60;
    this._time = 0;
    this._frames = 0;
    this._wait = AUTO_QUALITY.warmup;
    this.apply();
  }

  apply() {
    const s = QUALITY_STEPS[this.step];
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(s.pixelRatio >= 1 ? Math.min(dpr, s.pixelRatio) : s.pixelRatio);
    this.world.setCloudFraction(s.clouds);
    this.fx.setParticleFraction(s.particles);
    if (this.onResize) this.onResize();
  }

  _store() {
    this.settings.set('qualityStep', this.step);
    this.settings.set('quality', this.step >= QUALITY_PRESETS.low ? 'low' : 'high');
  }

  /** 설정에서 높음/낮음을 고른다. */
  setQuality(q) {
    this.step = QUALITY_PRESETS[q] ?? 0;
    this._store();
    this.apply();
    this._resetWindow(AUTO_QUALITY.cooldown);
  }

  _resetWindow(wait) {
    this._time = 0;
    this._frames = 0;
    this._wait = wait;
  }

  /** 설정 화면에 보여 줄 현재 상태 한 줄 */
  describe() {
    const auto = this.settings.get('autoQuality');
    const preset = this.step === QUALITY_PRESETS.high || this.step === QUALITY_PRESETS.low;
    return `현재 단계 ${this.step + 1}/${QUALITY_STEPS.length}${preset ? '' : ' (자동 조절됨)'}${auto ? '' : ' · 고정'}`;
  }

  /**
   * 렌더 프레임마다 호출. measuring=false(일시정지·탭 숨김)일 때는 재지 않는다.
   * @param {number} frameDt 실제 프레임 시간(초, 상한 적용 전 값이어도 된다)
   */
  frame(frameDt, measuring) {
    if (!measuring || frameDt <= 0) { this._resetWindow(Math.max(this._wait, 0.5)); return; }
    if (this._wait > 0) { this._wait -= frameDt; return; }
    this._time += frameDt;
    this._frames++;
    if (this._time < AUTO_QUALITY.window) return;
    this.fps = this._frames / this._time;
    const low = this.fps < AUTO_QUALITY.minFps;
    this._resetWindow(0);
    if (low && this.settings.get('autoQuality') && this.step < QUALITY_STEPS.length - 1) {
      this.step++;
      this._store();
      this.apply();
      this._wait = AUTO_QUALITY.cooldown;
      if (this.onLowered) this.onLowered(this.step);
    }
  }
}

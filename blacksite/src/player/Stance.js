// 자세(서기/앉기) 토글과 부드러운 높이 전환.
import { lerp, smooth } from '../utils/math.js';

export class Stance {
  constructor(cfg) {
    this.cfg = cfg;
    this.crouched = false;
    this.t = 0; // 0 서기 ~ 1 앉기
  }
  toggle() { this.crouched = !this.crouched; }
  set(c) { this.crouched = c; }
  update(dt) {
    const rate = dt / Math.max(0.01, this.cfg.crouchTransition);
    this.t = this.crouched ? Math.min(1, this.t + rate) : Math.max(0, this.t - rate);
  }
  get k() { return smooth(this.t); }
  get eyeHeight() { return lerp(this.cfg.standEye, this.cfg.crouchEye, this.k); }
  get height() { return lerp(this.cfg.standHeight, this.cfg.crouchHeight, this.k); }
  get name() { return this.crouched ? 'crouch' : 'stand'; }
}

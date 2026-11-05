// PlayerController — 키 입력을 '의도'(페달 세기, 브레이크, 조향)로 바꿔요.
// 키를 누르는 즉시 속도가 바뀌지 않도록 페달 세기는 서서히 올라가고 내려가요.
import { clamp } from '../core/utils.js';

export class PlayerController {
  constructor(input, cfg) {
    this.input = input;
    this.cfg = cfg;
    this.throttle = 0; // 0~1 페달 세기
    this.brake = 0;    // 0~1
    this.steer = 0;    // -1(왼쪽) ~ 1(오른쪽)
    this.enabled = true;
  }
  update(dt) {
    const a = this.enabled ? this.input.axes : { up: 0, down: 0, left: 0, right: 0, brake: 0 };
    const tUp = a.up ? 1 : 0;
    const rate = tUp > this.throttle ? this.cfg.throttleRise : this.cfg.throttleFall;
    this.throttle = clamp(this.throttle + Math.sign(tUp - this.throttle) * rate * dt, 0, 1);
    if (Math.abs(tUp - this.throttle) < rate * dt) this.throttle = tUp;
    const b = a.brake ? 1 : a.down ? this.cfg.softBrake : 0;
    this.brake += (b - this.brake) * Math.min(1, dt * 12);
    this.steer = (a.right ? 1 : 0) - (a.left ? 1 : 0);
  }
  reset() { this.throttle = 0; this.brake = 0; this.steer = 0; }
}

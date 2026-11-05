// GameLoop — requestAnimationFrame 기반. 물리·충돌·상태는 고정 간격(1/120초)으로 계산해서
// 모니터 주사율(30/60/144Hz)과 상관없이 같은 결과가 나오고, 렌더링은 프레임마다 한 번 해요.
export class GameLoop {
  constructor({ fixedStep = 1 / 120, maxSteps = 30, onFixed, onFrame }) {
    this.fixedStep = fixedStep;
    this.maxSteps = maxSteps;
    this.onFixed = onFixed;
    this.onFrame = onFrame;
    this.acc = 0;
    this.time = 0;
    this.running = false;
    this.timeScale = 1;
    this.fps = 60;
    this._tick = this._tick.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }
  stop() { this.running = false; }
  _tick(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25; // 탭 전환 후 큰 점프 방지
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
    dt *= this.timeScale;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.fixedStep && steps < this.maxSteps) {
      this.onFixed(this.fixedStep, this.time);
      this.time += this.fixedStep;
      this.acc -= this.fixedStep;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = 0;
    this.onFrame(dt, this.time, this.acc / this.fixedStep);
    requestAnimationFrame(this._tick);
  }
  // 테스트용: 실제 시간과 상관없이 n초 진행
  advance(seconds) {
    const n = Math.round(seconds / this.fixedStep);
    for (let i = 0; i < n; i++) { this.onFixed(this.fixedStep, this.time); this.time += this.fixedStep; }
    this.onFrame(this.fixedStep, this.time, 0);
  }
}

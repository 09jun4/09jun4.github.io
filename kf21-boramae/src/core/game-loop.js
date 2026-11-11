// 고정 타임스텝 게임 루프: 물리·AI는 항상 같은 간격(dt)으로 돌고, 렌더는 alpha로 보간한다.
// - 프레임 델타 상한: 탭을 벗어났다 돌아와도 시간이 한꺼번에 흐르지 않는다.
// - 한 프레임에 돌릴 스텝 수 상한: 느린 기기에서 "죽음의 나선"에 빠지지 않는다.
export class GameLoop {
  /**
   * @param {object} o
   * @param {number} o.hz 물리 주파수
   * @param {number} o.maxFrameDelta 프레임 델타 상한(초)
   * @param {number} o.maxStepsPerFrame 한 프레임 최대 스텝 수
   * @param {(dt:number)=>void} o.step
   * @param {(alpha:number, frameDt:number)=>void} o.render
   */
  constructor({ hz, maxFrameDelta, maxStepsPerFrame, step, render }) {
    this.dt = 1 / hz;
    this.maxFrameDelta = maxFrameDelta;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.stepFn = step;
    this.renderFn = render;
    this.acc = 0;
    this.alpha = 0;
    this.tick = 0;
    this.frame = 0;
    this.timeScale = 1;
    this.running = false;
    this.last = 0;
    this.frameDelta = 0;
    this._raf = 0;
    this._onFrame = (t) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(this._onFrame);
      this.advance((t - this.last) / 1000);
      this.last = t;
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this._onFrame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  /** 실제 시간 delta(초)만큼 진행한다. 테스트에서 직접 부를 수 있다. */
  advance(delta) {
    if (!(delta > 0)) delta = 0;
    if (delta > this.maxFrameDelta) delta = this.maxFrameDelta;
    this.frameDelta = delta;
    this.acc += delta * this.timeScale;
    let n = 0;
    while (this.acc >= this.dt && n < this.maxStepsPerFrame) {
      this.stepFn(this.dt);
      this.acc -= this.dt;
      this.tick++;
      n++;
    }
    if (this.acc >= this.dt) this.acc = 0; // 따라잡지 못한 시간은 버린다
    this.alpha = this.acc / this.dt;
    this.frame++;
    this.renderFn(this.alpha, delta);
    return n;
  }
}

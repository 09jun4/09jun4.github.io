// requestAnimationFrame 루프. 프레임 dt는 최대 50ms로 제한(탭 전환 후 튐 방지).
export class Loop {
  constructor(fn) {
    this.fn = fn;
    this.running = false;
    this.last = 0;
    this.time = 0;
    this.fps = 60;
    this._acc = 0;
    this._frames = 0;
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
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    this.time += dt;
    this._acc += raw;
    this._frames++;
    if (this._acc >= 0.5) { this.fps = this._frames / this._acc; this._acc = 0; this._frames = 0; }
    this.fn(dt, this.time);
    requestAnimationFrame(this._tick);
  }
}

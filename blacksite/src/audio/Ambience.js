// 구역별 고유 환경음: 구역 이동 시 1~2초 크로스페이드.
export class Ambience {
  constructor(audio) { this.audio = audio; this.cur = null; this.name = null; this.pending = null; }
  onReady() { if (this.pending) { const p = this.pending; this.pending = null; this.set(p); } }
  set(name) {
    const a = this.audio;
    if (!a.ctx) { this.pending = name; return; }
    if (name === this.name) return;
    this.name = name;
    const c = a.ctx, t = c.currentTime, fade = a.cfg.crossfade || 1.5;
    if (this.cur) {
      const old = this.cur;
      old.g.gain.cancelScheduledValues(t);
      old.g.gain.setValueAtTime(old.g.gain.value, t);
      old.g.gain.linearRampToValueAtTime(0, t + fade);
      old.src.stop(t + fade + 0.05);
      this.cur = null;
    }
    if (!name) return;
    const buf = a.buffer('amb', name);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a.vol0('amb', name), t + fade);
    src.connect(g); g.connect(a.ambBus);
    src.start(t, Math.random() * buf.duration);
    this.cur = { src, g };
  }
}

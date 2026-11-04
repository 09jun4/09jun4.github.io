// 앰비언트 음악 + 긴장 레이어: 적이 발견하면 긴장 레이어를 더하고, 교전이 끝나면 서서히 페이드아웃.
export class Music {
  constructor(audio) {
    this.audio = audio;
    this.want = null;
    this.cur = null;
    this.tension = null;
    this.tensionOn = false;
  }
  onReady() { if (this.want) { const w = this.want; this.want = null; this.play(w); } }
  _start(name, loopVol) {
    const a = this.audio, c = a.ctx;
    const buf = a.buffer('music', name);
    if (!buf) return null;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(a.musicBus);
    src.start();
    return { src, g, name, vol: loopVol ?? a.vol0('music', name) };
  }
  _fade(node, to, dur) {
    const c = this.audio.ctx, t = c.currentTime;
    node.g.gain.cancelScheduledValues(t);
    node.g.gain.setValueAtTime(node.g.gain.value, t);
    node.g.gain.linearRampToValueAtTime(to, t + dur);
  }
  play(name) {
    const a = this.audio;
    if (!a.ctx) { this.want = name; return; }
    if (this.cur && this.cur.name === name) return;
    if (this.cur) { const old = this.cur; this._fade(old, 0, 1.5); old.src.stop(a.ctx.currentTime + 1.6); this.cur = null; }
    if (!name) return;
    this.cur = this._start(name);
    if (this.cur) this._fade(this.cur, this.cur.vol, 2.5);
  }
  setTension(on, instant = false) {
    const a = this.audio;
    if (!a.ctx) return;
    if (on === this.tensionOn && !instant) return;
    this.tensionOn = on;
    if (on) {
      if (!this.tension) this.tension = this._start('tension');
      if (this.tension) this._fade(this.tension, this.tension.vol, 0.6);
      if (this.cur) this._fade(this.cur, this.cur.vol * 0.4, 0.6);
    } else if (this.tension) {
      const t = this.tension, dur = instant ? 0.3 : a.cfg.tensionFadeOut || 4;
      this._fade(t, 0, dur);
      if (this.cur) this._fade(this.cur, this.cur.vol, dur);
      t.src.stop(a.ctx.currentTime + dur + 0.1);
      this.tension = null;
    }
  }
  setPaused(on) {
    const a = this.audio;
    if (!a.ctx) return;
    a.musicBus.gain.setTargetAtTime(on ? a.vol.music * 0.35 : a.vol.music, a.ctx.currentTime, 0.1);
  }
}

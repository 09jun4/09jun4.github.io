// 사운드: 외부 파일 없이 Web Audio 로 종이 소리와 거의 무음에 가까운 배경음을 합성해요.
// 전체/음악/효과음 볼륨은 설정과 연결돼요. 첫 터치 전에는 브라우저 정책상 소리가 나지 않아요.
export class Audio {
  constructor() { this.ctx = null; this.vol = { master: 0.8, music: 0.5, sfx: 0.8 }; this.lastStep = 0; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    // 종이 소리용 잡음 버퍼
    const len = c.sampleRate * 1.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last * (Math.random() < 0.02 ? 2.5 : 1); }
    this.noise = buf;
    this.apply();
    this.startMusic();
  }
  setVolumes(v) { Object.assign(this.vol, v); this.apply(); }
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.35, t, 0.3);
  }
  // 잡음 한 줄기: 대역 통과 필터 + 엔벌로프
  rustle(dur, f0, f1, gain, q = 1.2, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 0.8, dur + 0.05);
  }
  tone(freq, dur, gain, type = 'sine', delay = 0, bus) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'step': {
        const now = this.ctx.currentTime;
        if (now - this.lastStep < 0.22) return;
        this.lastStep = now;
        this.rustle(0.07, 2400 + Math.random() * 800, 1800, 0.05, 2); break;
      }
      case 'grab': this.rustle(0.12, 3000, 4200, 0.12, 1.5); break;
      case 'fold': this.rustle(0.5, 900, 3800, 0.22, 0.9); this.rustle(0.35, 5000, 2500, 0.06, 2, 0.1); break;
      case 'foldEnd': this.rustle(0.09, 1800, 900, 0.3, 1.4); this.tone(120, 0.15, 0.12, 'sine'); this.rustle(0.05, 6000, 7000, 0.08, 4, 0.03); break;
      case 'cancel': this.rustle(0.18, 2600, 1200, 0.1, 1.2); break;
      case 'deny': this.tone(196, 0.12, 0.06, 'triangle'); this.tone(174, 0.16, 0.05, 'triangle', 0.08); break;
      case 'push': this.rustle(0.18, 700, 500, 0.2, 1); this.tone(90, 0.12, 0.08); break;
      case 'switchOn': this.tone(880, 0.08, 0.07, 'triangle'); this.tone(660, 0.25, 0.06, 'sine', 0.05); break;
      case 'switchOff': this.tone(520, 0.12, 0.05, 'triangle'); break;
      case 'door': this.rustle(0.6, 400, 1600, 0.14, 0.8); this.tone(330, 0.4, 0.04, 'sine', 0.1); break;
      case 'connect': [784, 1175].forEach((f, i) => this.tone(f, 0.9, 0.05, 'sine', i * 0.07)); break;
      case 'key': [988, 1319, 1568].forEach((f, i) => this.tone(f, 0.5, 0.06, 'sine', i * 0.06)); break;
      case 'mirror': this.tone(1400, 0.12, 0.04, 'sine'); this.rustle(0.12, 3000, 3500, 0.06, 3); break;
      case 'lit': [1047, 1568, 2093].forEach((f, i) => this.tone(f, 1.2, 0.04, 'sine', i * 0.05)); break;
      case 'land': this.rustle(0.1, 600, 300, 0.25, 1); this.tone(70, 0.15, 0.12); break;
      case 'exitOn': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.4, 0.045, 'sine', i * 0.12)); break;
      case 'win': [523, 659, 784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 1.8, 0.05, 'sine', i * 0.11)); this.rustle(1.2, 1500, 5000, 0.08, 0.7, 0.2); break;
      case 'ui': this.tone(1200, 0.05, 0.03, 'sine'); break;
      case 'undo': this.rustle(0.25, 3500, 1200, 0.1, 1.2); break;
    }
  }
  // 거의 무음에 가까운 음악: 느린 사인 화음이 천천히 바뀌어요
  startMusic() {
    const c = this.ctx;
    const chords = [[220, 277.2, 329.6], [196, 246.9, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    let k = 0;
    const play = () => {
      if (!this.ctx) return;
      const t = c.currentTime, ch = chords[k++ % chords.length];
      ch.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
        o.type = 'sine'; o.frequency.value = f / 2; o.detune.value = (Math.random() - 0.5) * 8;
        lp.type = 'lowpass'; lp.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 / (i + 1), t + 4); g.gain.linearRampToValueAtTime(0.0001, t + 11);
        o.connect(lp); lp.connect(g); g.connect(this.music); o.start(t); o.stop(t + 11.2);
      });
      if (Math.random() < 0.6) this.tone([1319, 1175, 988, 1568][k % 4], 3, 0.012, 'sine', 2 + Math.random() * 4, this.music);
    };
    play();
    this.musicTimer = setInterval(play, 9000);
  }
}

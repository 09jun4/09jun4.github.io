// Synthesized sound effects and generative piano music (WebAudio)
'use strict';
const Sound = {
  ctx: null, master: null, sfx: null, music: null, reverb: null, noiseBuf: null, enabled: true,
  musicVol: 0.5, sfxVol: 0.8, nextMusic: 0, playing: false, listener: { x: 0, y: 0, z: 0 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicVol; this.music.connect(this.master);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb impulse
    const ir = c.createBuffer(2, c.sampleRate * 3.5, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / a.length, 2.6); }
    this.reverb = c.createConvolver(); this.reverb.buffer = ir;
    const rv = c.createGain(); rv.gain.value = 0.55; this.reverb.connect(rv); rv.connect(this.music);
    this.nextMusic = c.currentTime + 25;
  },
  setVolumes(m, s) { this.musicVol = m; this.sfxVol = s; if (this.music) { this.music.gain.value = m; this.sfx.gain.value = s; } },
  dest(pos) {
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) return this.sfx;
    const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 32) return null;
    const g = this.ctx.createGain(); g.gain.value = Math.max(0, 1 - d / 32);
    let node = g;
    if (this.ctx.createStereoPanner && this.listener.yaw !== undefined) {
      const p = this.ctx.createStereoPanner();
      const ang = Math.atan2(dx, dz) - this.listener.yaw;
      p.pan.value = Math.max(-1, Math.min(1, -Math.sin(ang) * 0.8));
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return node;
  },
  noise(dur, freq, q, gain, type = 'bandpass', pos, t0 = 0, sweep) {
    if (!this.ctx) return;
    const c = this.ctx, out = this.dest(pos); if (!out) return;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime + t0;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, type, gain, pos, t0 = 0, slide, attack = 0.005) {
    if (!this.ctx) return;
    const c = this.ctx, out = this.dest(pos); if (!out) return;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); const t = c.currentTime + t0;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
    return o;
  },
  material(kind, vol, pos, isStep) {
    const v = vol * (isStep ? 0.35 : 1);
    switch (kind) {
      case 'grass': this.noise(0.12, 1400, 0.8, v * 0.5, 'lowpass', pos); break;
      case 'stone': case 'nether': this.noise(0.08, 2600, 1.5, v * 0.5, 'bandpass', pos); this.noise(0.05, 900, 2, v * 0.3, 'bandpass', pos); break;
      case 'gravel': for (let i = 0; i < 3; i++) this.noise(0.05, 1800 + i * 500, 1.2, v * 0.35, 'bandpass', pos, i * 0.025); break;
      case 'sand': this.noise(0.14, 3000, 0.5, v * 0.3, 'highpass', pos); break;
      case 'snow': this.noise(0.12, 2200, 0.6, v * 0.25, 'lowpass', pos); break;
      case 'wood': this.noise(0.08, 700, 3, v * 0.6, 'bandpass', pos); this.tone(180 + Math.random() * 40, 0.06, 'triangle', v * 0.15, pos); break;
      case 'wool': this.noise(0.1, 600, 0.7, v * 0.25, 'lowpass', pos); break;
      case 'metal': this.noise(0.08, 3500, 4, v * 0.4, 'bandpass', pos); this.tone(1200, 0.15, 'square', v * 0.03, pos); break;
      case 'glass': this.noise(0.1, 4000, 2, v * 0.4, 'bandpass', pos); break;
      default: this.noise(0.08, 2000, 1, v * 0.4, 'bandpass', pos);
    }
  },
  play(name, pos) {
    if (!this.ctx || !this.enabled) return;
    const r = Math.random;
    switch (name) {
      case 'pop': this.tone(500 + r() * 300, 0.09, 'sine', 0.25, pos, 0, 1400); break;
      case 'xp': this.tone(1300 + r() * 600, 0.15, 'sine', 0.12, pos); this.tone(2600 + r() * 600, 0.1, 'sine', 0.05, pos, 0.03); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.15, null, i * 0.08)); break;
      case 'hurt': this.tone(220, 0.15, 'sawtooth', 0.15, pos, 0, 140); this.noise(0.1, 700, 1, 0.2, 'lowpass', pos); break;
      case 'click': this.tone(900, 0.04, 'square', 0.05); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.06, 1200, 1, 0.3, 'bandpass', pos, i * 0.07); break;
      case 'burp': this.tone(160, 0.25, 'sawtooth', 0.12, pos, 0, 110); break;
      case 'bow': this.tone(300, 0.15, 'triangle', 0.2, pos, 0, 120); this.noise(0.2, 2500, 1, 0.15, 'highpass', pos); break;
      case 'arrowhit': this.noise(0.05, 1500, 2, 0.3, 'bandpass', pos); break;
      case 'explode': this.noise(1.6, 400, 0.5, 0.9, 'lowpass', pos, 0, 60); this.tone(70, 0.9, 'sine', 0.6, pos, 0, 30); break;
      case 'fuse': this.noise(1.5, 4000, 0.4, 0.35, 'highpass', pos, 0, 7000); break;
      case 'fizz': this.noise(0.5, 5000, 0.4, 0.25, 'highpass', pos); break;
      case 'ignite': this.noise(0.15, 3500, 1, 0.3, 'bandpass', pos); break;
      case 'zombie': { const o = this.tone(95 + r() * 30, 1.1, 'sawtooth', 0.12, pos, 0, 70, 0.2); this.noise(1.0, 400, 2, 0.08, 'bandpass', pos); break; }
      case 'skeleton': for (let i = 0; i < 5; i++) this.noise(0.03, 3000 + r() * 1500, 6, 0.25, 'bandpass', pos, i * 0.06 + r() * 0.02); break;
      case 'pig': this.tone(260 + r() * 60, 0.18, 'square', 0.06, pos, 0, 180); this.noise(0.15, 500, 3, 0.15, 'bandpass', pos); break;
      case 'cow': this.tone(120, 0.9, 'sawtooth', 0.09, pos, 0, 100, 0.1); break;
      case 'chicken': for (let i = 0; i < 2; i++) this.tone(900 + r() * 300, 0.06, 'square', 0.04, pos, i * 0.1, 1300); break;
      case 'sheep': { this.tone(320, 0.6, 'sawtooth', 0.06, pos, 0, 290, 0.05); this.tone(326, 0.6, 'sawtooth', 0.05, pos, 0, 296, 0.05); break; }
      case 'enderman': this.tone(140, 0.8, 'sawtooth', 0.12, pos, 0, 600, 0.05); this.tone(600, 0.5, 'sine', 0.06, pos, 0.4, 90); break;
      case 'teleport': this.tone(200, 0.4, 'sine', 0.15, pos, 0, 1200); this.tone(1200, 0.4, 'sine', 0.08, pos, 0.1, 200); break;
      case 'ghast': this.tone(900 + r() * 300, 0.9, 'sawtooth', 0.08, pos, 0, 500, 0.1); this.noise(0.9, 2000, 3, 0.08, 'bandpass', pos); break;
      case 'shoot': this.noise(0.4, 900, 0.8, 0.4, 'lowpass', pos, 0, 200); break;
      case 'blaze': this.noise(0.6, 600, 1, 0.25, 'lowpass', pos); this.tone(80, 0.5, 'sawtooth', 0.08, pos); break;
      case 'dragon': this.tone(70, 2.2, 'sawtooth', 0.3, pos, 0, 45, 0.3); this.noise(2, 300, 0.6, 0.4, 'lowpass', pos, 0, 120); break;
      case 'wing': this.noise(0.5, 300, 0.8, 0.3, 'lowpass', pos); break;
      case 'portal': this.tone(110, 3, 'sine', 0.1, pos, 0, 220, 1); this.noise(3, 600, 6, 0.06, 'bandpass', pos, 0, 1800); break;
      case 'splash': this.noise(0.4, 1200, 0.5, 0.35, 'lowpass', pos); break;
      case 'swim': this.noise(0.25, 900, 0.5, 0.12, 'lowpass', pos); break;
      case 'lavapop': this.tone(120 + r() * 50, 0.1, 'sine', 0.15, pos, 0, 400); break;
      case 'door': this.noise(0.15, 800, 2, 0.3, 'bandpass', pos); break;
      case 'chest': this.noise(0.3, 500, 2, 0.3, 'bandpass', pos, 0, 300); break;
      case 'crystal': this.noise(0.8, 3000, 2, 0.5, 'bandpass', pos, 0, 600); this.tone(1500, 0.4, 'sine', 0.2, pos, 0, 300); break;
      case 'note': { const f = 185 * Math.pow(2, ((r() * 24) | 0) / 12); this.tone(f, 0.7, 'triangle', 0.25, pos); this.tone(f * 2, 0.5, 'sine', 0.08, pos); break; }
      case 'break_tool': this.noise(0.25, 2500, 3, 0.4, 'bandpass', pos); break;
      case 'win': [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 1.2, 'triangle', 0.15, null, i * 0.18)); break;
    }
  },
  // gentle generative piano
  piano(freq, t, vel, dur = 3.5) {
    const c = this.ctx;
    const g = c.createGain(); g.connect(this.music); g.connect(this.reverb);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(freq * 6, t); lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    lp.connect(g);
    [[1, 1], [2, 0.35], [3, 0.12], [4.01, 0.05]].forEach(([m, a]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m * (1 + (Math.random() - 0.5) * 0.002);
      const og = c.createGain(); og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    });
  },
  composePiece(dim) {
    const c = this.ctx; let t = c.currentTime + 0.5;
    const m = n => 440 * Math.pow(2, (n - 69) / 12);
    if (dim === 'nether') {
      // dark drones
      for (let i = 0; i < 6; i++) { const root = [38, 41, 36, 39][(Math.random() * 4) | 0]; this.piano(m(root), t, 0.12, 9); this.piano(m(root + 7), t + 0.3, 0.06, 9); t += 7 + Math.random() * 3; }
      return t;
    }
    const keys = [[62, [0, 2, 4, 7, 9, 11]], [60, [0, 2, 4, 6, 7, 9, 11]], [57, [0, 2, 3, 5, 7, 10]], [65, [0, 2, 4, 7, 9]]];
    const [root, scale] = keys[(Math.random() * keys.length) | 0];
    const prog = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]].map(ch => ch.map(x => x));
    const bars = 8 + ((Math.random() * 6) | 0);
    const beat = 0.9 + Math.random() * 0.4;
    for (let b = 0; b < bars; b++) {
      const ch = prog[b % prog.length];
      const bass = root - 12 + ch[0];
      this.piano(m(bass), t, 0.16, 5);
      if (Math.random() < 0.7) this.piano(m(bass + 7), t + beat * 2, 0.09, 4);
      const notes = 2 + ((Math.random() * 4) | 0);
      for (let k = 0; k < notes; k++) {
        if (Math.random() < 0.25) continue;
        const deg = scale[(Math.random() * scale.length) | 0];
        const oct = Math.random() < 0.3 ? 12 : 0;
        this.piano(m(root + deg + oct), t + k * beat * (4 / notes) + (Math.random() - 0.5) * 0.05, 0.08 + Math.random() * 0.06, 3.5);
      }
      t += beat * 4;
    }
    return t;
  },
  update(dim, inGame) {
    if (!this.ctx || !inGame || this.musicVol <= 0) return;
    const now = this.ctx.currentTime;
    if (now > this.nextMusic) {
      const end = this.composePiece(dim);
      this.nextMusic = end + 60 + Math.random() * 120;
    }
  },
};

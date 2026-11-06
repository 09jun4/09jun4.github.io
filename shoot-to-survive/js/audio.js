// 효과음 재생 (Web Audio). 파일은 audio/*.wav, 아티팩트 번들에서는 window.__SND(base64)에서 읽는다.
const FILES = ['cock', 'shot', 'dry', 'reload_open', 'reload_insert', 'reload_close'];
const EXT = { ghost_whisper: 'mp3' };
FILES.push('ghost_whisper');
const BASE_GAIN = { cock: 1.5, shot: 0.8, dry: 0.9, reload_open: 1.7, reload_insert: 0.95, reload_close: 0.9 }; // 파일마다 원래 음량이 달라 맞춤

export class Sound {
  constructor() { this.ctx = null; this.master = null; this.bufs = {}; this.vol = 0.8; this.active = new Set(); this.onPlay = null; this.ready = null; }

  // 사용자 입력(클릭·터치·키) 안에서 호출해야 브라우저가 소리를 허용한다
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
      this.ready = this.load();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  get on() { return !!this.ctx && this.ctx.state === 'running'; }

  async load() {
    await Promise.all(FILES.map(async (n) => {
      try {
        let data;
        if (window.__SND && window.__SND[n]) { const bin = atob(window.__SND[n]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); data = u.buffer; }
        else data = await (await fetch('audio/' + n + '.' + (EXT[n] || 'wav'))).arrayBuffer();
        this.bufs[n] = await new Promise((ok, no) => { const p = this.ctx.decodeAudioData(data, ok, no); if (p && p.catch) p.catch(no); });
      } catch (e) { /* 소리 파일을 못 읽어도 게임은 계속 */ }
    }));
  }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  suspend() { this.ctx && this.ctx.state === 'running' && this.ctx.suspend().catch(() => {}); }
  resume() { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume().catch(() => {}); }

  // group: 같은 그룹(예: 'reload')을 한꺼번에 끊을 때 사용
  play(name, { gain = 1, rate = 1, group = '' } = {}) {
    if (this.onPlay) this.onPlay(name);
    if (!this.on || !this.bufs[name] || this.vol <= 0) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.bufs[name]; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = (BASE_GAIN[name] || 1) * gain;
    src.connect(g); g.connect(this.master);
    const rec = { src, g, group }; this.active.add(rec);
    src.onended = () => this.active.delete(rec);
    src.start();
  }

  stop(group) { // 해당 그룹의 소리를 0.03초 안에 줄이며 끊는다 (재장전 취소)
    const t = this.ctx ? this.ctx.currentTime : 0;
    for (const r of [...this.active]) if (r.group === group) { try { r.g.gain.setTargetAtTime(0, t, 0.01); r.src.stop(t + 0.05); } catch (e) {} this.active.delete(r); }
  }
}

// ── 유령 속삭임 ──────────────────────────────────────────
// 유령마다 자기 위치에서 가끔 속삭인다. 가까울수록 크지만 전체적으로 희미하고, 멀거나 벽 뒤면 먹먹하다.
const RANGE = 22;        // 이 거리 밖에서는 안 들린다 (m)
const BASE = 0.5;        // 최대 음량 (아주 가까울 때도 이 정도로 희미)
const MAX_VOICES = 4;    // 동시에 소리 내는 유령 수 (성능)

export class GhostVoices {
  constructor(sound) { this.s = sound; this.voices = new Map(); this.rev = null; this.info = { dist: null, gain: 0, voices: 0 }; this.hrtf = true; }

  setQuality(q) { this.hrtf = q === 'high'; } // 높음: HRTF 3D / 낮음: 가벼운 스테레오 패닝

  _reverb() { // 약한 잔향 (한 번만 만들어 공유): 지수로 줄어드는 잡음
    const ctx = this.s.ctx; if (this.rev) return this.rev;
    const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / ctx.sampleRate * 3.0); }
    const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.55;
    conv.connect(wet); wet.connect(this.s.master);
    return (this.rev = conv);
  }

  _listener(cam, fwd) {
    const L = this.s.ctx.listener, p = cam;
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  _start(g) {
    const ctx = this.s.ctx, buf = this.s.bufs.ghost_whisper; if (!buf) return null;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.8 + Math.random() * 0.25; // 낮은 음높이일수록 음산하다
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createPanner(); pan.panningModel = this.hrtf ? 'HRTF' : 'equalpower'; pan.distanceModel = 'linear'; pan.rolloffFactor = 0; // 거리 감쇠는 직접 계산
    src.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(this.s.master);
    const send = ctx.createGain(); send.gain.value = 0.5; gain.connect(send); send.connect(this._reverb());
    const v = { src, lp, gain, pan, send, ghost: g, dying: false };
    src.onended = () => { this._drop(g, v); };
    src.start();
    this.voices.set(g, v);
    return v;
  }
  _drop(g, v) { if (this.voices.get(g) === v) this.voices.delete(g); try { v.pan.disconnect(); v.send.disconnect(); } catch (e) {} }

  // ghosts: Ghost[], cam: Vector3, fwd: Vector3, los(g): boolean(벽에 안 가려졌는가)
  update(dt, ghosts, cam, fwd, los) {
    const s = this.s; if (!s.on || !s.bufs.ghost_whisper) return;
    this._listener(cam, fwd);
    const ctx = s.ctx, now = ctx.currentTime; let nearest = null;
    for (const g of ghosts) {
      const px = g.x, py = 1.5, pz = g.z, d = Math.hypot(px - cam.x, pz - cam.z);
      if (nearest === null || d < nearest) nearest = d;
      let v = this.voices.get(g);
      if (!v) {
        if (g.whisperT === undefined) g.whisperT = 0.4 + Math.random() * 5;
        if (d > RANGE) continue;
        g.whisperT -= dt;
        if (g.whisperT <= 0 && this.voices.size < MAX_VOICES) {
          v = this._start(g);
          // 다음 속삭임까지: 가까울수록·쫓고 있을수록 더 자주
          g.whisperT = (4 + Math.random() * 6) * (0.55 + 0.45 * Math.min(1, d / RANGE)) * (g.state === 'chase' ? 0.5 : 1);
        } else continue;
        if (!v) continue;
      }
      // 위치 · 거리별 음량 · 먹먹함
      const open = los(g), k = Math.max(0, 1 - d / RANGE);
      const gainT = BASE * Math.pow(k, 2.2) * (open ? 1 : 0.55) * (g.state === 'chase' ? 1.25 : 1);
      const cutT = (500 + 3300 * Math.pow(k, 1.5)) * (open ? 1 : 0.5);
      v.gain.gain.setTargetAtTime(v.dying ? 0 : gainT, now, 0.08);
      v.lp.frequency.setTargetAtTime(cutT, now, 0.08);
      const P = v.pan; if (P.positionX) { P.positionX.value = px; P.positionY.value = py; P.positionZ.value = pz; } else P.setPosition(px, py, pz);
      if (d === nearest) { this.info.dist = d; this.info.gain = gainT / BASE; }
    }
    this.info.voices = this.voices.size; if (nearest === null) this.info.dist = null;
  }

  // 유령이 죽으면 소리를 0.25초 안에 줄여 끊는다
  stopFor(g) { const v = this.voices.get(g); if (!v) return; v.dying = true; const t = this.s.ctx.currentTime; v.gain.gain.setTargetAtTime(0, t, 0.06); try { v.src.stop(t + 0.3); } catch (e) {} }
  stopAll() { for (const g of [...this.voices.keys()]) this.stopFor(g); }
}

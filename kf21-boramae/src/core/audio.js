// 소리(Web Audio). 호출하는 쪽은 예전 스텁과 같은 audio.play(name, opts)만 쓴다.
//  - 브라우저 정책상 첫 클릭·키 입력 뒤에야 소리가 난다(그때 파일을 받아 디코드한다).
//  - 엔진·기관포는 디코드한 버퍼에서 구간을 잘라 끝과 처음을 겹쳐 붙인 루프 버퍼를 만든다(이음매에서 끊기지 않는다).
//  - 일시정지하면 오디오 컨텍스트를 멈춰 모든 소리가 그 자리에서 멎고, 재개하면 이어진다.
import { AUDIO } from '../data/audio.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 구간 [from, to]를 잘라 끝 xfade초를 처음과 겹친 루프 버퍼(등전력 크로스페이드) */
function makeLoop(ctx, buf, from, to, xfade) {
  const sr = buf.sampleRate, a = Math.floor(from * sr), n = Math.floor((to - from - xfade) * sr), x = Math.floor(xfade * sr);
  const out = ctx.createBuffer(buf.numberOfChannels, n, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c), dst = out.getChannelData(c);
    for (let i = 0; i < n; i++) dst[i] = src[a + i];
    for (let i = 0; i < x; i++) { const u = i / x; dst[i] = src[a + i] * Math.sin(u * Math.PI / 2) + src[a + n + i] * Math.cos(u * Math.PI / 2); } // 꼬리를 머리에 겹친다
  }
  return out;
}

class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = {};
    this.loading = null;
    this.enabled = true;
    this.volume = 0.7;
    this.paused = false;
    this.engine = null; // { src, gain }
    this.gun = null; // { src, gain, until }
    this.voices = new Set();
    this.named = {}; // 이름으로 멈출 수 있는 소리(시동음·이륙음·폭탄 낙하음)
    this.eng = { gain: 0, rate: 1 };
    this.unlocked = false;
  }

  /** 설정 연결 + 첫 입력 때 소리 켜기 */
  init(settings) {
    this.settings = settings;
    const apply = () => { this.enabled = settings.get('sound') !== false; this.volume = settings.get('volume') ?? 0.7; this._applyMaster(); };
    apply();
    settings.onChange((k) => { if (k === 'sound' || k === 'volume' || k === '*') apply(); });
    const unlock = () => { this.unlock(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  unlock() {
    if (this.unlocked) { if (this.ctx && this.ctx.state === 'suspended' && !this.paused) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.unlocked = true;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this._applyMaster();
    this.loading = this._load();
  }

  async _load() {
    const A = AUDIO, ctx = this.ctx;
    await Promise.all(Object.entries(A.files).map(async ([key, file]) => {
      try {
        const res = await fetch(A.base + file);
        if (!res.ok) throw new Error(String(res.status));
        this.buffers[key] = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('[KF21] 소리를 불러오지 못했어요:', file, e); }
    }));
    if (this.buffers.engine) this.buffers.engineLoop = makeLoop(ctx, this.buffers.engine, A.engine.from, A.engine.to, A.engine.xfade);
    if (this.buffers.gun) this.buffers.gunLoop = makeLoop(ctx, this.buffers.gun, A.gun.from, A.gun.to, A.gun.xfade);
    this.ready = true;
  }

  _applyMaster() {
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.03);
  }

  setMasterVolume(v) { this.volume = clamp01(v); this._applyMaster(); }

  /** 한 번 재생. opts: volume, rate, delay(초), offset(초), name(이름을 주면 stop(name)으로 멈출 수 있다) */
  _shot(key, o = {}) {
    const buf = this.buffers[key];
    if (!buf || !this.ctx) return null;
    const ctx = this.ctx, src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = o.rate || 1;
    gain.gain.value = o.volume ?? 1;
    src.connect(gain); gain.connect(this.master);
    const v = { src, gain };
    this.voices.add(v);
    src.onended = () => { this.voices.delete(v); if (o.name && this.named[o.name] === v) delete this.named[o.name]; gain.disconnect(); };
    src.start(ctx.currentTime + (o.delay || 0), Math.max(0, o.offset || 0));
    if (o.name) { this.stop(o.name, 0.05); this.named[o.name] = v; }
    return v;
  }

  /** 게임 코드가 부르는 이름 → 소리 */
  play(name, opts = {}) {
    if (!this.ctx || !this.ready) return;
    const A = AUDIO;
    switch (name) {
      case 'gun': this._gun(); break;
      case 'missile_launch': this._shot('missile', { volume: A.missile.gain }); break;
      case 'bomb_drop': { // 휘파람이 착탄에 맞춰 끝나게: 낙하가 길면 늦게 시작하고, 짧으면 중간부터 튼다
        const fall = opts.fall ?? A.bombFall.length, L = A.bombFall.length;
        this._shot('bombFall', { volume: A.bombFall.gain, delay: Math.max(0, fall - L), offset: Math.max(0, L - fall) });
        break;
      }
      case 'bomb_explosion': this._shot('explosion', { volume: A.explosion.gain * this._near(opts.distance) }); break;
      case 'explosion': this._shot('explosion', { volume: A.explosion.gain * 0.8 * this._near(opts.distance ?? 600), rate: A.explosion.enemyRate }); break;
      case 'engine_start': this._shot('engineStart', { volume: A.takeoff.startGain, rate: A.takeoff.startRate, name: 'engine_start' }); break;
      case 'takeoff': this._shot('takeoff', { volume: A.takeoff.roarGain, name: 'takeoff', offset: opts.offset || 0 }); break;
      default: break; // 그 밖의 이름(락온음 등)은 아직 소리가 없다
    }
  }

  _near(d) {
    if (d == null) return 1;
    const e = AUDIO.explosion;
    return clamp01(1 - (d - e.near) / (e.far - e.near)) ** 2 * 0.92 + 0.08;
  }

  stop(name, fade = 0.25) {
    const v = this.named[name];
    if (!v || !this.ctx) return;
    delete this.named[name];
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, fade / 3);
    try { v.src.stop(t + fade + 0.05); } catch (e) { /* 이미 끝남 */ }
  }

  /** 예약한 시각에 서서히 줄인다(시동음을 이륙음으로 넘길 때) */
  fadeOut(name, after, duration) {
    const v = this.named[name];
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime + after;
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + duration);
    try { v.src.stop(t + duration + 0.05); } catch (e) { /* 무시 */ }
  }

  _gun() {
    const ctx = this.ctx, G = AUDIO.gun;
    if (!this.buffers.gunLoop) return;
    if (!this.gun) {
      const src = ctx.createBufferSource(), gain = ctx.createGain();
      src.buffer = this.buffers.gunLoop; src.loop = true;
      gain.gain.value = 0;
      src.connect(gain); gain.connect(this.master);
      src.start(ctx.currentTime, Math.random() * 0.3);
      this.gun = { src, gain, until: 0, on: false };
    }
    this.gun.until = ctx.currentTime + G.hold;
    if (!this.gun.on) { this.gun.on = true; this.gun.gain.gain.cancelScheduledValues(ctx.currentTime); this.gun.gain.gain.setTargetAtTime(G.gain, ctx.currentTime, 0.008); }
  }

  /**
   * 프레임마다: 엔진 루프(출력에 따라 음량·음높이)와 기관포 루프의 끝을 관리한다.
   * @param {{on:boolean, power:number, boost:number, cockpit:boolean}} e @param {number} dt
   */
  update(e, dt) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    const A = AUDIO.engine, now = ctx.currentTime;
    if (this.gun && this.gun.on && now > this.gun.until) { this.gun.on = false; this.gun.gain.gain.setTargetAtTime(0, now, AUDIO.gun.fade / 3); }
    if (!this.buffers.engineLoop) return;
    if (e.on && !this.engine) {
      const src = ctx.createBufferSource(), gain = ctx.createGain();
      src.buffer = this.buffers.engineLoop; src.loop = true;
      gain.gain.value = 0;
      src.connect(gain); gain.connect(this.master);
      src.start();
      this.engine = { src, gain };
      this.eng.gain = 0; this.eng.rate = A.rate[0];
    }
    if (!this.engine) return;
    const p = clamp01(e.power), k = Math.min(1, dt / A.tau);
    const g = e.on ? (A.gain[0] + (A.gain[1] - A.gain[0]) * p + A.boostGain * clamp01(e.boost)) * (e.cockpit ? A.cockpit : 1) * (e.level ?? 1) : 0;
    this.eng.gain += (g - this.eng.gain) * k;
    this.eng.rate += (A.rate[0] + (A.rate[1] - A.rate[0]) * p - this.eng.rate) * k;
    this.engine.gain.gain.setTargetAtTime(this.eng.gain, now, 0.05);
    this.engine.src.playbackRate.setTargetAtTime(this.eng.rate, now, 0.05);
    if (!e.on && this.eng.gain < 0.004) { try { this.engine.src.stop(); } catch (err) { /* 무시 */ } this.engine.gain.disconnect(); this.engine = null; }
  }

  /** 일시정지: 모든 소리가 그 자리에서 멎는다 */
  setPaused(on) {
    this.paused = on;
    if (!this.ctx) return;
    if (on) this.ctx.suspend(); else this.ctx.resume();
  }

  /** 미션을 떠날 때: 울리던 효과음을 빠르게 줄인다 */
  stopAll(fade = AUDIO.duck) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, t, fade / 3); try { v.src.stop(t + fade + 0.05); } catch (e) { /* 무시 */ } }
    this.named = {};
    if (this.gun) { this.gun.on = false; this.gun.gain.gain.setTargetAtTime(0, t, 0.03); }
  }
}

export const audio = new GameAudio();

// 오디오 관리: 외부 파일(audio.json) + Web Audio API 합성음 혼합. 버스: 전체 · 효과음 · 배경음악 · 환경음.
// 일시정지 때는 게임 버스만 멈추고(UI 소리는 유지), 3D 위치는 거리 감쇠 + 좌우 패닝으로 처리한다.
import { bus } from '../core/EventBus.js';
import { assetUrl } from '../core/ConfigLoader.js';
import { SOUNDS, AMBIENCE, MUSIC } from './Synth.js';
import { voiceBuffer, PAIN, DEATH, TAKEDOWN_GRUNT } from './Voice.js';

// 음성 효과음 등록: pain0~5, death0~2, grunt0~1
PAIN.forEach((o, i) => { SOUNDS['pain' + i] = (ctx) => voiceBuffer(ctx, o); });
DEATH.forEach((o, i) => { SOUNDS['death' + i] = (ctx) => voiceBuffer(ctx, o); });
TAKEDOWN_GRUNT.forEach((o, i) => { SOUNDS['grunt' + i] = (ctx) => voiceBuffer(ctx, o); });
const VARIANTS = { pain: PAIN.length, death: DEATH.length, grunt: TAKEDOWN_GRUNT.length };
import { Footsteps } from './Footsteps.js';
import { Ambience } from './Ambience.js';
import { Music } from './Music.js';

export class AudioManager {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.buffers = new Map();
    this.vol = { master: 0.8, sfx: 1, music: 0.6, ambience: 0.7 };
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.unlocked = false;
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
    this.footsteps = new Footsteps(this);
    this.ambience = new Ambience(this);
    this.music = new Music(this);
    this.bindEvents();
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.game = c.createGain(); this.game.connect(this.master); // 일시정지 대상
      this.sfx = c.createGain(); this.sfx.connect(this.game);
      this.ui = c.createGain(); this.ui.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.connect(this.master);
      this.ambBus = c.createGain(); this.ambBus.connect(this.game);
      this.applyVolumes();
      this.music.onReady();
      this.ambience.onReady();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = this.vol;
    this.master.gain.setTargetAtTime(v.master, t, 0.03);
    this.sfx.gain.setTargetAtTime(v.sfx, t, 0.03);
    this.ui.gain.setTargetAtTime(v.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(v.music, t, 0.03);
    this.ambBus.gain.setTargetAtTime(v.ambience, t, 0.03);
  }

  suspendGame(on) {
    if (!this.ctx) return;
    this.game.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.05);
    this.music.setPaused(on);
  }

  // 버퍼: 파일이 지정돼 있으면 불러오고, 없거나 실패하면 합성
  buffer(kind, name) {
    const key = kind + ':' + name;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const table = kind === 'sfx' ? SOUNDS : kind === 'amb' ? AMBIENCE : MUSIC;
    const section = kind === 'sfx' ? this.cfg.sounds : kind === 'amb' ? this.cfg.ambience : this.cfg.music;
    const def = section?.[name] || {};
    let buf = null;
    try { buf = table[name] ? table[name](this.ctx) : null; } catch (e) { console.warn('[Audio] synth', name, e); }
    this.buffers.set(key, buf);
    if (def.file) {
      fetch(assetUrl(def.file)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => this.ctx.decodeAudioData(ab)).then((b) => this.buffers.set(key, b))
        .catch((e) => console.warn('[Audio] file fallback to synth:', def.file, e));
    }
    return buf;
  }
  vol0(kind, name) {
    const section = kind === 'sfx' ? this.cfg.sounds : kind === 'amb' ? this.cfg.ambience : this.cfg.music;
    return section?.[name]?.volume ?? 1;
  }

  // 효과음 재생. opts: { volume, rate, at:{x,z} (3D), ui:true, delay }
  play(name, opts = {}) {
    if (!this.ctx || !this.unlocked) return null;
    const buf = this.buffer('sfx', name);
    if (!buf) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate || 1) * (opts.vary ? 1 + (Math.random() - 0.5) * opts.vary : 1);
    const g = c.createGain();
    let vol = this.vol0('sfx', opts.volumeKey || name) * (opts.volume ?? 1);
    let node = g;
    if (opts.at) {
      const dx = opts.at.x - this.listener.x, dz = opts.at.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      const range = opts.range || this.cfg.hearingRange || 26;
      if (d > range) return null;
      vol *= Math.pow(1 - d / range, 1.6);
      if (c.createStereoPanner) {
        const p = c.createStereoPanner();
        // 리스너 오른쪽 벡터 = (cos yaw, -sin yaw)
        const yaw = this.listener.yaw;
        const right = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, d);
        p.pan.value = Math.max(-0.9, Math.min(0.9, right));
        g.connect(p);
        node = p;
      }
    }
    g.gain.value = vol;
    src.connect(g);
    node.connect(opts.ui ? this.ui : this.sfx);
    src.start(c.currentTime + (opts.delay || 0));
    return src;
  }

  // 여러 변형 중 하나를 무작위로 (같은 소리가 연달아 나오지 않게)
  playVariant(base, opts = {}) {
    const n = VARIANTS[base] || 1;
    this._last = this._last || {};
    let k = Math.floor(Math.random() * n);
    if (n > 1 && k === this._last[base]) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this._last[base] = k;
    return this.play(base + k, { vary: 0.08, ...opts, volumeKey: base });
  }

  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }

  playMenuMusic() { this.music.play('menu'); this.ambience.set(null); }

  // 게임 이벤트 → 소리
  bindEvents() {
    const L = () => this.listener;
    bus.on('weapon:fired', () => this.play('shot', { vary: 0.06 }));
    bus.on('weapon:dry', () => this.play('dry'));
    bus.on('weapon:reload', ({ empty, duration }) => {
      this.play('magOut', { delay: duration * 0.18 });
      this.play('magIn', { delay: duration * 0.66 });
      if (empty) this.play('slide', { delay: duration * 0.8 });
    });
    bus.on('door:toggled', ({ door }) => this.play('door', { at: { x: door.cx, z: door.cz }, range: 18 }));
    bus.on('terminal:start', () => this.play('terminal'));
    bus.on('terminal:complete', () => this.play('complete'));
    bus.on('terminal:cancel', () => this.play('dry', { rate: 0.6 }));
    bus.on('objective:updated', () => this.play('complete', { rate: 0.8 }));
    bus.on('shot:hit', ({ killed, part }) => {
      this.play(killed ? 'kill' : 'hit');
      if (part === 'head') this.play('hit', { rate: 1.45, delay: 0.035, volume: 0.8 }); // 헤드샷: 높은 틱 한 번 더
    });
    bus.on('shot:impact', ({ point }) => this.play('impact', { at: point, vary: 0.3, range: 30 }));
    bus.on('player:damaged', () => this.play('hurt', { vary: 0.1 }));
    bus.on('guard:fire', ({ x, z }) => this.play('guardShot', { at: { x, z }, vary: 0.08, range: 40 }));
    bus.on('guard:miss', ({ x, z }) => { const l = L(); if (Math.hypot(x - l.x, z - l.z) < 3) this.play('whiz', { vary: 0.2 }); });
    bus.on('guard:alert', ({ x, z }) => this.play('alert', { at: { x, z }, range: 30 }));
    bus.on('guard:suspicious', ({ x, z }) => this.play('suspicious', { at: { x, z }, range: 22 }));
    // 암살: 연출 시간표의 신호(cue)에 맞춰 잡기 → 찌르기 → '윽'
    bus.on('takedown:cue', ({ sound }) => {
      if (sound === 'grunt') this.playVariant('grunt', { vary: 0.04 });
      else this.play(sound, { vary: 0.05 });
    });
    // 총에 맞은 적의 신음 (적마다 짧은 간격 제한), 치명상이면 길게 사그라드는 신음
    bus.on('guard:hit', ({ guard, x, z }) => {
      const now = performance.now();
      if (!guard.alive) return;
      if (now - (guard._painAt || 0) < 280) return;
      guard._painAt = now;
      this.playVariant('pain', { at: { x, z }, range: 30, delay: 0.03 });
    });
    bus.on('guard:down', ({ guard, kind }) => {
      if (kind !== 'kill') return;
      this.playVariant('death', { at: { x: guard.x, z: guard.z }, range: 30, delay: 0.05 });
    });
    bus.on('log:open', () => this.play('log', { ui: true }));
    bus.on('ui:click', () => this.play('uiClick', { ui: true }));
    bus.on('ui:hover', () => this.play('uiHover', { ui: true }));
    bus.on('zone:changed', (z) => this.ambience.set(z.ambience || z.id));
    bus.on('combat:count', (n) => this.music.setTension(n > 0));
    bus.on('state:changed', ({ name }) => {
      if (name === 'playing') { this.music.play('stealth'); this.music.setTension(false, true); }
      else if (name === 'menu' || name === 'briefing') { this.music.play('menu'); this.ambience.set(null); this.music.setTension(false, true); }
      else { this.ambience.set(null); this.music.setTension(false, true); this.music.play(name === 'results' ? 'menu' : null); }
      this.suspendGame(false);
    });
  }
}

// 효과음 재생 (Web Audio). 파일은 audio/*.wav, 아티팩트 번들에서는 window.__SND(base64)에서 읽는다.
const FILES = ['cock', 'shot', 'dry', 'reload_open', 'reload_insert', 'reload_close'];
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
        else data = await (await fetch('audio/' + n + '.wav')).arrayBuffer();
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

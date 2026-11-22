// audio.js — WebAudio로 만드는 8비트 효과음과 칩튠 배경음악 (파일 없이 코드로 생성)
'use strict';
(function () {
  let ctx = null, master = null, sfxGain = null, bgmGain = null;
  const st = { sfx: true, bgm: true };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = st.sfx ? 0.6 : 0; sfxGain.connect(master);
    bgmGain = ctx.createGain(); bgmGain.gain.value = st.bgm ? 0.22 : 0; bgmGain.connect(master);
    startBgm();
  }

  function tone(type, f0, f1, dur, vol, when, out) {
    const t = (when || ctx.currentTime);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, vol, hp) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp || 800;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain);
    s.start(); s.stop(ctx.currentTime + dur);
  }

  let lastHit = 0;
  const SFX = {
    hit() { const n = performance.now(); if (n - lastHit < 60) return; lastHit = n; tone('square', 220, 110, 0.06, 0.15); noise(0.04, 0.12, 2000); },
    crit() { tone('square', 660, 220, 0.1, 0.2); noise(0.08, 0.2, 1200); },
    hurt() { tone('sawtooth', 160, 70, 0.12, 0.15); },
    coin() { const t = ctx.currentTime; tone('square', 988, 988, 0.05, 0.12, t); tone('square', 1319, 1319, 0.12, 0.12, t + 0.05); },
    craft() { noise(0.06, 0.25, 3000); tone('square', 880, 440, 0.08, 0.15); },
    good() { const t = ctx.currentTime;[523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.13, t + i * 0.07)); },
    divine() { const t = ctx.currentTime;[523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone('square', f, f, 0.2, 0.12, t + i * 0.08); tone('triangle', f / 2, f / 2, 0.3, 0.12, t + i * 0.08); }); },
    level() { const t = ctx.currentTime;[392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f * 1.01, 0.15, 0.2, t + i * 0.09)); },
    skill() { tone('square', 300, 1200, 0.15, 0.12); },
    boom() { noise(0.35, 0.35, 200); tone('triangle', 120, 40, 0.3, 0.3); },
    heal() { const t = ctx.currentTime;[660, 880, 1100].forEach((f, i) => tone('sine', f, f, 0.15, 0.15, t + i * 0.06)); },
    summon() { tone('triangle', 200, 900, 0.3, 0.2); noise(0.2, 0.1, 4000); },
    hatch() { noise(0.1, 0.3, 1500); const t = ctx.currentTime; tone('square', 784, 784, 0.1, 0.15, t + 0.1); tone('square', 1047, 1047, 0.2, 0.15, t + 0.2); },
    click() { tone('square', 600, 600, 0.03, 0.08); },
    fail() { const t = ctx.currentTime; tone('square', 330, 330, 0.15, 0.15, t); tone('square', 247, 247, 0.3, 0.15, t + 0.15); },
    die() { tone('sawtooth', 440, 55, 0.6, 0.2); },
  };

  // ---- 칩튠 BGM: 멜로디(square) + 베이스(triangle) + 하이햇(noise) 16스텝 반복 ----
  const N = s => s ? 440 * Math.pow(2, (s - 69) / 12) : 0; // MIDI → Hz
  const SONGS = {
    field: { bpm: 132,
      mel: [76, 0, 79, 0, 81, 79, 76, 0, 74, 0, 76, 79, 72, 0, 0, 0, 76, 0, 79, 0, 84, 83, 81, 79, 77, 0, 76, 74, 76, 0, 0, 0],
      bass: [48, 48, 55, 55, 45, 45, 52, 52, 41, 41, 48, 48, 43, 43, 50, 50] },
    dungeon: { bpm: 150,
      mel: [69, 0, 72, 69, 76, 0, 75, 0, 74, 0, 72, 0, 71, 72, 74, 0, 69, 0, 72, 69, 77, 0, 76, 74, 72, 71, 69, 0, 68, 0, 0, 0],
      bass: [45, 45, 45, 45, 41, 41, 41, 41, 43, 43, 43, 43, 40, 40, 44, 44] },
  };
  let song = 'field', step = 0, nextT = 0, timer = null;
  function startBgm() {
    if (timer) return;
    nextT = ctx.currentTime + 0.1;
    timer = setInterval(() => {
      const S = SONGS[song], dt = 60 / S.bpm / 2;
      while (nextT < ctx.currentTime + 0.2) {
        const m = S.mel[step % S.mel.length], b = S.bass[Math.floor(step / 2) % S.bass.length];
        if (m) tone('square', N(m), N(m), dt * 0.9, 0.09, nextT, bgmGain);
        if (step % 2 === 0) tone('triangle', N(b), N(b), dt * 1.8, 0.22, nextT, bgmGain);
        if (step % 4 === 2) { // 하이햇
          const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          if (!noiseBuf) noise(0.001, 0);
          s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 6000;
          g.gain.setValueAtTime(0.05, nextT); g.gain.exponentialRampToValueAtTime(0.0001, nextT + 0.04);
          s.connect(f); f.connect(g); g.connect(bgmGain); s.start(nextT); s.stop(nextT + 0.05);
        }
        step++; nextT += dt;
      }
    }, 50);
  }

  window.Audio8 = {
    init,
    play(n) { if (ctx && st.sfx && SFX[n]) try { SFX[n](); } catch (e) { /* 소리 실패는 무시 */ } },
    song(n) { if (song !== n) { song = n; step = 0; } },
    set(kind, on) {
      st[kind] = on;
      if (!ctx) return;
      (kind === 'sfx' ? sfxGain : bgmGain).gain.value = on ? (kind === 'sfx' ? 0.6 : 0.22) : 0;
    },
    state: st,
  };
})();

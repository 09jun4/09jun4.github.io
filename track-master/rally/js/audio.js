// audio.js — rally sounds: the shared Track Master engine voice
// (../drift/js/engine.js, tuned as a 1.6 turbo with anti-lag bangs),
// gravel / mud rumble under the tyres, stone patter, sliding hiss, wind,
// impacts, landings, countdown beeps.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var A = { muted: false, ac: null };
  var ac, master, eng, noiseBuf, layers = {};

  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function src() { var s = ac.createBufferSource(); s.buffer = noise(); s.loop = true; s.start(0, Math.random() * 1.5); return s; }
  function filt(type, f, q) { var b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function gain(v) { var g = ac.createGain(); g.gain.value = v; return g; }
  function layer(type, f, q) { var s = src(), b = filt(type, f, q), g = gain(0); s.connect(b); b.connect(g); g.connect(master); return { f: b, g: g }; }

  A.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var Ctx = G.AudioContext || G.webkitAudioContext; if (!Ctx) return;
    ac = A.ac = new Ctx();
    master = ac.createGain();
    var comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    A.setMuted(A.muted);
    layers.rumble = layer('lowpass', 220, 0.7);    // tyres on loose ground
    layers.stones = layer('bandpass', 2600, 0.9);  // stones hitting the floor
    layers.slide = layer('bandpass', 900, 0.8);    // sliding hiss
    layers.wind = layer('lowpass', 600, 0.5);
    if (G.TMEngine) eng = G.TMEngine.create(ac, master, 'ae86', {
      label: 'R2 1.6T', idle: 1050, red: 7600, turbo: 1.0, turboPitch: 0.9, spool: 2.2, spoolAt: 0.3, bov: 'pssh',
      popStyle: 'bang', pops: 1.3, popTime: 1.2, level: 1.0, fxGain: 1.6,
    });
  };
  A.setMuted = function (m) { A.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.05); };

  A.update = function (car, thr, dt, paused) {
    if (!ac) return;
    var t = ac.currentTime;
    if (paused) { A.silence(); return; }
    if (eng) eng.update(car.rpm, thr, t, dt, car.gear);
    var v = car.speed, ground = car.wheels.filter(function (w) { return w.contact; }).length / 4;
    var mud = car.surface === 'mud', grass = car.surface === 'grass', slide = 0;
    car.wheels.forEach(function (w) { slide = Math.max(slide, w.slide); });
    var sp = Math.min(1, v / 30);
    layers.rumble.g.gain.setTargetAtTime(ground * sp * (mud ? 0.5 : 0.32), t, 0.08);
    layers.rumble.f.frequency.setTargetAtTime(mud ? 140 : 180 + v * 3, t, 0.1);
    layers.stones.g.gain.setTargetAtTime(ground * (mud || grass ? 0.01 : 0.06) * sp * (0.6 + Math.random() * 0.8), t, 0.03);
    layers.slide.g.gain.setTargetAtTime(ground * slide * sp * (mud ? 0.18 : 0.26), t, 0.06);
    layers.slide.f.frequency.setTargetAtTime(mud ? 500 : 800 + slide * 600, t, 0.1);
    layers.wind.g.gain.setTargetAtTime(Math.min(0.14, v * v / 9000), t, 0.2);
    layers.wind.f.frequency.setTargetAtTime(300 + v * 20, t, 0.2);
  };
  A.silence = function () {
    if (!ac) return; var t = ac.currentTime;
    for (var k in layers) layers[k].g.gain.setTargetAtTime(0, t, 0.05);
    if (eng) eng.update(1050, 0, t, 0.016, 0);
  };
  function burst(f, q, lvl, len) {
    var t = ac.currentTime, s = ac.createBufferSource(), b = filt('bandpass', f, q), g = gain(0);
    s.buffer = noise(); g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(b); b.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + len + 0.05);
  }
  A.event = function (e) {
    if (!ac) return;
    if (e.type === 'impact') burst(e.kind === 'tree' ? 420 : 700, 1.1, Math.min(0.8, 0.15 + e.v / 25), 0.4);
    else if (e.type === 'land' || e.type === 'bottom') burst(160, 0.8, Math.min(0.7, 0.2 + Math.abs(e.vy || 4) / 15), 0.3);
    else if (e.type === 'beep' || e.type === 'go') {
      var t = ac.currentTime, o = ac.createOscillator(), g = gain(0.15);
      o.type = 'square'; o.frequency.value = e.type === 'go' ? 1320 : 660;
      g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + (e.type === 'go' ? 0.7 : 0.25));
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.75);
    } else if (e.type === 'split') burst(3000, 4, 0.12, 0.15);
  };

  RL.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);

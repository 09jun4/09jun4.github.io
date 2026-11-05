// audio.js — engine voices (engine.js), tyre squeal (layered noise), wind, hits, beeps.
// engine.js builds each car's voice: a pulse-train note with wander and warm
// saturation, exhaust rasp, combustion noise, intake howl, an air-noise turbo
// whistle, blow-off hiss / compressor flutter, overrun pops, and shift
// thuds (upshifts cut the throttle for a moment, downshifts blip it).
// The rival's voice gets quieter and duller with distance and pans.
// Master volume / mute follow F1 Champion's setting ('f1-champion.volume').
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};
  var A = { muted: false };
  var ac = null, master = null, voices = [], squeal = null, wind = null, noiseBuf = null, shaper = null;

  function vol() {
    try { var v = JSON.parse(localStorage.getItem('f1-champion.volume')); if (v && typeof v.master === 'number') return v.muted ? 0 : v.master; } catch (e) { /* none */ }
    return 0.8;
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function noiseSrc() { var s = ac.createBufferSource(); s.buffer = noise(); s.loop = true; s.start(0, Math.random() * 1.5); return s; }
  function softClip(amount) {
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    return c;
  }
  function filt(type, f, q) { var b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function gain(v) { var g = ac.createGain(); g.gain.value = v; return g; }

  // Tyre squeal. Real squeal is stick-slip: the tread grips and slips again
  // hundreds of times a second, which makes a bright, rasping, saw-like tone
  // (about 1-2 kHz with strong harmonics up to 8 kHz) wandering in pitch,
  // on top of broadband rubber hiss. So: (1) two saw-like stick-slip voices
  // with random pitch wander, high-passed so the harmonics dominate and it
  // never sounds like a pure whistle or a scream, (2) noise bands from
  // mid to very high, (3) a little low/mid noise for body.
  var sawWave = null;
  function getSaw() {
    if (sawWave) return sawWave;
    var n = 48, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (var k = 1; k <= n; k++) im[k] = Math.pow(1 / k, 0.8) * (1 + 0.25 * Math.sin(k * 1.7)); // saw-ish, slightly uneven harmonics
    sawWave = ac.createPeriodicWave(re, im);
    return sawWave;
  }
  function makeSqueal() {
    var out = gain(1), bands = [], voices = [];
    var soft = filt('lowpass', 4800, 0.5); // keep it from getting piercing
    out.connect(soft); soft.connect(master);
    // noise bands: f [slide 0, slide 1], q, level, fade-in curve, wobble Hz / depth
    var specs = [
      { f: [200, 280], q: 1.0, lvl: 0.1, curve: 1.2, wf: 6.5, wd: 0.25 },
      { f: [520, 680], q: 2.2, lvl: 0.12, curve: 1.0, wf: 9.3, wd: 0.45 },
      { f: [1300, 1800], q: 1.8, lvl: 0.5, curve: 0.9, wf: 14.1, wd: 0.4 },
      { f: [2400, 3200], q: 1.6, lvl: 0.8, curve: 0.8, wf: 18, wd: 0.4 },
      { f: [3600, 4600], q: 1.4, lvl: 0.4, curve: 0.9, wf: 23, wd: 0.5 },
      { f: [5200, 6500], q: 1.2, lvl: 0.12, curve: 1.0, wf: 29, wd: 0.5 },
    ];
    specs.forEach(function (L) {
      var src = noiseSrc(), bp = filt('bandpass', L.f[0], L.q), wob = gain(1), lg = gain(0), lfo = ac.createOscillator(), ld = gain(L.wd), lfo2 = ac.createOscillator(), ld2 = gain(L.wd * 0.6);
      lfo.frequency.value = L.wf; lfo2.frequency.value = L.wf * 0.37 + Math.random();
      lfo.connect(ld); ld.connect(wob.gain); lfo2.connect(ld2); ld2.connect(wob.gain);
      lfo.start(); lfo2.start();
      src.connect(bp); bp.connect(wob); wob.connect(lg); lg.connect(out);
      L.bp = bp; L.g = lg; bands.push(L);
    });
    // stick-slip voices: saw -> high-pass (harmonics only) -> peak -> chop -> out
    [{ f: [1500, 2200], hp: 2200, lvl: 1.0, chop: 37, ratio: 1 }, { f: [1500, 2200], hp: 2800, lvl: 0.7, chop: 53, ratio: 1.41 }].forEach(function (V) {
      var o = ac.createOscillator(); o.setPeriodicWave(getSaw()); o.frequency.value = V.f[0] * V.ratio;
      // random pitch wander: noise -> low-pass -> depth in Hz
      var wn = noiseSrc(), wl = filt('lowpass', 22), wd = gain(V.f[0] * V.ratio * 0.9); // lowpassed noise is tiny, so the gain is large
      wn.connect(wl); wl.connect(wd); wd.connect(o.frequency);
      var hp = filt('highpass', V.hp, 0.7), pk = filt('peaking', 2800, 0.8), chop = gain(1), cl = ac.createOscillator(), cd = gain(0.5), vg = gain(0);
      pk.gain.value = 4; cl.frequency.value = V.chop; cl.connect(cd); cd.connect(chop.gain); cl.start();
      var rough = ac.createWaveShaper(); rough.curve = softClip(3); o.connect(hp); hp.connect(pk); pk.connect(rough); rough.connect(chop); chop.connect(vg); vg.connect(out); o.start();
      voices.push({ o: o, g: vg, f: V.f, ratio: V.ratio, lvl: V.lvl });
    });
    return { out: out, layers: bands, voices: voices };
  }
  function setSqueal(s, slide, speed, t) {
    s.layers.forEach(function (L) {
      var lv = Math.pow(slide, L.curve) * L.lvl * 0.1;
      L.g.gain.setTargetAtTime(lv, t, 0.06);
      L.bp.frequency.setTargetAtTime(L.f[0] + (L.f[1] - L.f[0]) * slide + speed * 1.5, t, 0.1);
    });
    s.voices.forEach(function (V) {
      var on = Math.max(0, (slide - 0.08) / 0.92);
      V.g.gain.setTargetAtTime(Math.pow(on, 0.8) * V.lvl * 0.075, t, 0.05);
      V.o.frequency.setTargetAtTime((V.f[0] + (V.f[1] - V.f[0]) * slide + speed * 4) * V.ratio, t, 0.12);
    });
  }

  A.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain();
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    A.setMuted(A.muted);
    squeal = makeSqueal();
    var wn = noiseSrc(), lp = filt('lowpass', 500), wg = gain(0);
    wn.connect(lp); lp.connect(wg); wg.connect(master);
    wind = { gain: wg, lp: lp };
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.6 * vol(), ac.currentTime, 0.05);
  };

  // Each car gets an engine voice (engine.js, TMEngine) routed through a
  // distance gain, a low-pass and a pan so the rival sounds far and to a side.
  function makeVoice(spec) {
    var vg = gain(1), dull = filt('lowpass', 18000), pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    vg.connect(dull);
    if (pan) { dull.connect(pan); pan.connect(master); } else dull.connect(master);
    var eng = TMEngine.create(ac, vg, spec.id, { fxGain: 1.9 });
    return { spec: spec, eng: eng, vg: vg, dull: dull, pan: pan, rpmS: 0, stopped: false };
  }

  // list: [{car, throttle}], player first. cam: {x, y, heading}.
  A.update = function (list, cam, dt) {
    if (!ac) return;
    var t = ac.currentTime;
    dt = dt || 1 / 60;
    while (voices.length < list.length) {
      var sp = list[voices.length].car.spec, v0 = makeVoice(sp);
      var p0 = list[voices.length].car.p;
      // use the physics' own idle / redline for the voice
      v0.eng.spec.idle = p0.IDLE_RPM; v0.eng.spec.red = p0.REDLINE_RPM;
      voices.push(v0);
    }
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i], e = list[i];
      if (!e) { v.vg.gain.setTargetAtTime(0, t, 0.05); continue; }
      var c = e.car, thr = e.throttle || 0;
      // rpm eases a little (the engine has inertia), faster up than down
      if (!v.rpmS) v.rpmS = c.rpm;
      v.rpmS += (c.rpm - v.rpmS) * Math.min(1, dt * (c.rpm > v.rpmS ? 18 : 9));
      v.eng.update(v.rpmS, thr, t, dt, c.gear);
      var g = 1;
      if (i > 0) {
        var d = Math.hypot(c.x - cam.x, c.y - cam.y);
        g = 1 / (1 + Math.pow(d / 18, 1.4));
        v.dull.frequency.setTargetAtTime(16000 / (1 + d / 30), t, 0.1);
        if (v.pan) {
          var ang = Math.atan2(c.y - cam.y, c.x - cam.x) - cam.heading;
          v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(ang))), t, 0.05);
        }
      }
      v.vg.gain.setTargetAtTime(g, t, 0.05);
    }
    var pl = list[0].car;
    var slide = Math.min(1, Math.max(0, Math.abs(pl.slip) - 0.08) * 2.5) * Math.min(1, pl.speed / 15);
    if (pl.drifting) slide = Math.max(slide, 0.45 * Math.min(1, pl.speed / 15));
    setSqueal(squeal, slide, pl.speed, t);
    wind.gain.gain.setTargetAtTime(Math.min(0.12, pl.speed * pl.speed / 30000), t, 0.2);
    wind.lp.frequency.setTargetAtTime(300 + pl.speed * 18, t, 0.2);
  };

  A.silence = function () {
    if (!ac) return;
    var t = ac.currentTime;
    voices.forEach(function (v) { v.vg.gain.setTargetAtTime(0, t, 0.05); });
    setSqueal(squeal, 0, 0, t);
    wind.gain.gain.setTargetAtTime(0, t, 0.05);
  };
  A.reset = function () {
    voices.forEach(function (v) { v.eng.stop(); try { v.vg.disconnect(); } catch (e) { /* gone */ } });
    voices = [];
  };

  A.hit = function (impact) {
    if (!ac) return;
    var t = ac.currentTime, s = ac.createBufferSource(), f = filt('bandpass', 900, 1.2), g = ac.createGain();
    s.buffer = noise();
    var lvl = Math.min(0.6, 0.12 + impact / 30);
    g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + 0.4);
  };
  A.beep = function (high) {
    if (!ac) return;
    var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = high ? 1320 : 660; o.type = 'square';
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.6 : 0.25));
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.65);
  };

  DR.Audio = A;
})();

// audio.js — engine voices (engine.js), drift squeal (sound/drift.mp3, looped
// while the player slides; the old synthesized squeal is the fallback), wind, hits, beeps.
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

  // Drift sound: a recorded tyre skid (sound/drift.mp3 = attack + a seamless
  // loop from loopStart to the end). It starts when the slide starts, loops
  // for exactly as long as the slide lasts and fades out when it ends.
  var DRIFT_LOOP_START = 1.88, driftBuf = null, driftVoice = null;
  function loadDrift() {
    try {
      fetch('sound/drift.mp3').then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (ok, no) { var p = ac.decodeAudioData(b, ok, no); if (p && p.catch) p.catch(no); }); })
        .then(function (buf) { driftBuf = buf; })
        .catch(function () { /* keep the synthesized squeal */ });
    } catch (e) { /* no fetch */ }
  }
  function driftStart(t) {
    var s = ac.createBufferSource(), g = gain(0);
    s.buffer = driftBuf; s.loop = true; s.loopStart = DRIFT_LOOP_START; s.loopEnd = driftBuf.duration;
    s.connect(g); g.connect(master); s.start(t);
    driftVoice = { src: s, g: g };
  }
  function driftStop(t) {
    if (!driftVoice) return;
    var v = driftVoice; driftVoice = null;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.07);
    try { v.src.stop(t + 0.5); } catch (e) { /* stopped */ }
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
    var sq = noiseSrc(), bp = filt('bandpass', 1500, 7), tone = ac.createOscillator(), tg = gain(0.25), sg = gain(0);
    tone.type = 'triangle'; tone.frequency.value = 1150; tone.start();
    sq.connect(bp); bp.connect(sg); tone.connect(tg); tg.connect(sg); sg.connect(master);
    squeal = { gain: sg, tone: tone };
    var wn = noiseSrc(), lp = filt('lowpass', 500), wg = gain(0);
    wn.connect(lp); lp.connect(wg); wg.connect(master);
    wind = { gain: wg, lp: lp };
    loadDrift();
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
    if (driftBuf) {
      // on while sliding (a little hysteresis), off the moment it ends
      var want = driftVoice ? (slide > 0.05 || pl.drifting) : (slide > 0.14 || (pl.drifting && slide > 0.05));
      if (pl.finished || pl.speed < 3) want = false;
      if (want && !driftVoice) driftStart(t);
      else if (!want && driftVoice) driftStop(t);
      if (driftVoice) {
        driftVoice.g.gain.setTargetAtTime(Math.min(1.1, 0.5 + 0.75 * slide) * 0.9, t, 0.05);
        driftVoice.src.playbackRate.setTargetAtTime(0.9 + 0.22 * Math.min(1, pl.speed / 35), t, 0.15);
      }
      squeal.gain.gain.setTargetAtTime(0, t, 0.05);
    } else {
      squeal.gain.gain.setTargetAtTime(slide * 0.15, t, 0.05);
    }
    squeal.tone.frequency.setTargetAtTime(1050 + 250 * slide + pl.speed * 2, t, 0.1);
    wind.gain.gain.setTargetAtTime(Math.min(0.12, pl.speed * pl.speed / 30000), t, 0.2);
    wind.lp.frequency.setTargetAtTime(300 + pl.speed * 18, t, 0.2);
  };

  A.silence = function () {
    if (!ac) return;
    var t = ac.currentTime;
    voices.forEach(function (v) { v.vg.gain.setTargetAtTime(0, t, 0.05); });
    squeal.gain.gain.setTargetAtTime(0, t, 0.05);
    driftStop(t);
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

// audio.js — engine, tyre squeal, wind and guardrail hits (Web Audio).
// Engine: two detuned oscillators at the firing frequency through a
// low-pass, with a sub octave; the rotary RX-7 is buzzier (square waves).
// The rival's engine is quieter with distance. Master volume and mute are
// shared with F1 Champion's setting (localStorage 'f1-champion.volume').
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};
  var A = { muted: false };
  var ac = null, master = null, voices = [], squeal = null, wind = null, noiseBuf = null;

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
  function noiseSrc() { var s = ac.createBufferSource(); s.buffer = noise(); s.loop = true; s.start(); return s; }

  A.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain();
    var comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
    A.setMuted(A.muted);
    // Tyre squeal: band-passed noise with a whistle on top.
    var sq = noiseSrc(), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 7;
    var tone = ac.createOscillator(); tone.type = 'triangle'; tone.frequency.value = 1150; tone.start();
    var tg = ac.createGain(); tg.gain.value = 0.25;
    var sg = ac.createGain(); sg.gain.value = 0;
    sq.connect(bp); bp.connect(sg); tone.connect(tg); tg.connect(sg); sg.connect(master);
    squeal = { gain: sg, bp: bp, tone: tone };
    var wn = noiseSrc(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    var wg = ac.createGain(); wg.gain.value = 0;
    wn.connect(lp); lp.connect(wg); wg.connect(master);
    wind = { gain: wg, lp: lp };
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.55 * vol(), ac.currentTime, 0.05);
  };

  function makeVoice(spec) {
    var snd = spec.sound, o1 = ac.createOscillator(), o2 = ac.createOscillator(), sub = ac.createOscillator();
    var wave = snd.cyl === 2 ? 'square' : 'sawtooth';
    o1.type = wave; o2.type = 'sawtooth'; sub.type = 'triangle';
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    var g = ac.createGain(); g.gain.value = 0;
    var m1 = ac.createGain(); m1.gain.value = 0.5;
    var m2 = ac.createGain(); m2.gain.value = snd.buzz;
    var ms = ac.createGain(); ms.gain.value = 0.6;
    o1.connect(m1); o2.connect(m2); sub.connect(ms);
    m1.connect(lp); m2.connect(lp); ms.connect(lp);
    var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    lp.connect(g);
    if (pan) { g.connect(pan); pan.connect(master); } else g.connect(master);
    [o1, o2, sub].forEach(function (o) { o.start(); });
    return { spec: spec, o1: o1, o2: o2, sub: sub, lp: lp, g: g, pan: pan };
  }

  // cars: [{car, listener: bool}] — call every frame with the player first.
  A.update = function (list, cam) {
    if (!ac) return;
    var t = ac.currentTime;
    while (voices.length < list.length) voices.push(makeVoice(list[voices.length].car.spec));
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i], e = list[i];
      if (!e) { v.g.gain.setTargetAtTime(0, t, 0.05); continue; }
      var c = e.car, snd = c.spec.sound;
      var f = (c.rpm / 60) * (snd.cyl / 2) * snd.base * 2;
      v.o1.frequency.setTargetAtTime(f, t, 0.02);
      v.o2.frequency.setTargetAtTime(f * 1.007, t, 0.02);
      v.sub.frequency.setTargetAtTime(f / 2, t, 0.02);
      var load = e.throttle;
      v.lp.frequency.setTargetAtTime(snd.cutoff * (0.35 + 0.65 * load) * (0.6 + c.rpm / 9000), t, 0.03);
      var level = 0.07 + 0.11 * load;
      if (i > 0) {
        var d = Math.hypot(c.x - cam.x, c.y - cam.y);
        level *= 1 / (1 + Math.pow(d / 18, 1.4));
        if (v.pan) {
          var ang = Math.atan2(c.y - cam.y, c.x - cam.x) - cam.heading;
          v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(ang))), t, 0.05);
        }
      }
      v.g.gain.setTargetAtTime(level, t, 0.04);
    }
    var p = list[0].car;
    var slide = Math.min(1, Math.max(0, Math.abs(p.slip) - 0.08) * 2.5) * Math.min(1, p.speed / 15);
    if (p.drifting) slide = Math.max(slide, 0.45 * Math.min(1, p.speed / 15));
    squeal.gain.gain.setTargetAtTime(slide * 0.16, t, 0.05);
    squeal.tone.frequency.setTargetAtTime(1050 + 250 * slide + p.speed * 2, t, 0.1);
    wind.gain.gain.setTargetAtTime(Math.min(0.12, p.speed * p.speed / 30000), t, 0.2);
    wind.lp.frequency.setTargetAtTime(300 + p.speed * 18, t, 0.2);
  };

  A.silence = function () {
    if (!ac) return;
    var t = ac.currentTime;
    voices.forEach(function (v) { v.g.gain.setTargetAtTime(0, t, 0.05); });
    squeal.gain.gain.setTargetAtTime(0, t, 0.05);
    wind.gain.gain.setTargetAtTime(0, t, 0.05);
  };
  A.reset = function () {
    voices.forEach(function (v) { v.g.disconnect(); [v.o1, v.o2, v.sub].forEach(function (o) { o.stop(); }); });
    voices = [];
  };

  A.hit = function (impact) {
    if (!ac) return;
    var t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
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

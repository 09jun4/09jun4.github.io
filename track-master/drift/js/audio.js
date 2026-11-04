// audio.js — JDM-tuned engine voices, turbos, tyre squeal, wind, hits.
// Each car's voice (cars.js `sound`) is built from:
//  - the engine note: a custom waveform at the firing frequency
//    (rpm/60 x pulses per rev) through a soft-clip and a resonant low-pass;
//  - exhaust rasp: band-passed noise chopped at the firing frequency
//    (each pulse = a burst), the sound of a free-flowing straight-pipe /
//    big-bore muffler;
//  - intake: individual throttle bodies (AE86) howl as rpm climbs;
//  - turbo: whine that rises with boost (boost spools with lag on throttle
//    and rpm), hiss, a blow-off valve "pssh" on lift-off, or compressor
//    flutter ("stu-tu-tu") for the RX-7's big single turbo;
//  - pops and crackles on the overrun, a throttle blip on downshifts.
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
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.6 * vol(), ac.currentTime, 0.05);
  };

  function makeVoice(spec) {
    var S = spec.sound, out = gain(0), pan = ac.createStereoPanner ? ac.createStereoPanner() : null, dull = filt('lowpass', 18000);
    out.connect(dull);
    if (pan) { dull.connect(pan); pan.connect(master); } else dull.connect(master);

    // Engine note: harmonic series of the firing frequency.
    var real = new Float32Array(S.harm.length + 1), imag = new Float32Array(S.harm.length + 1);
    S.harm.forEach(function (a, i) { imag[i + 1] = a; });
    var osc = ac.createOscillator();
    osc.setPeriodicWave(ac.createPeriodicWave(real, imag));
    var sub = ac.createOscillator(); sub.type = 'sine';
    var subG = gain(S.sub), clip = ac.createWaveShaper(), lp = filt('lowpass', 1200, S.res), noteG = gain(0.5);
    clip.curve = softClip(S.drive); clip.oversample = '2x';
    osc.connect(clip); sub.connect(subG); subG.connect(clip); clip.connect(lp); lp.connect(noteG); noteG.connect(out);
    // Exhaust rasp: noise chopped at the firing frequency.
    var rn = noiseSrc(), rbp = filt('bandpass', 900, S.raspQ), chop = gain(0.5), chopOsc = ac.createOscillator(), chopDepth = gain(0.5);
    chopOsc.type = 'square';
    chopOsc.connect(chopDepth); chopDepth.connect(chop.gain);
    var raspG = gain(0);
    rn.connect(rbp); rbp.connect(chop); chop.connect(raspG); raspG.connect(out);
    // Intake howl (ITBs) / induction roar.
    var inN = noiseSrc(), inBp = filt('bandpass', 2000, 5), inG = gain(0);
    inN.connect(inBp); inBp.connect(inG); inG.connect(out);
    // Turbo whine + hiss.
    var tw = ac.createOscillator(); tw.type = 'sine';
    var tw2 = ac.createOscillator(); tw2.type = 'triangle';
    var twG = gain(0), tw2G = gain(0.3), th = noiseSrc(), thBp = filt('bandpass', 5000, 3), thG = gain(0);
    tw.connect(twG); tw2.connect(tw2G); tw2G.connect(twG); twG.connect(out);
    th.connect(thBp); thBp.connect(thG); thG.connect(out);
    [osc, sub, chopOsc, tw, tw2].forEach(function (o) { o.start(); });
    return {
      spec: spec, out: out, pan: pan, dull: dull, osc: osc, sub: sub, lp: lp, noteG: noteG,
      rbp: rbp, chopOsc: chopOsc, raspG: raspG, inBp: inBp, inG: inG, tw: tw, tw2: tw2, twG: twG, thBp: thBp, thG: thG,
      boost: 0, lastThrottle: 0, lastGear: 1, popUntil: 0, nextPop: 0, blipUntil: 0, lumpT: 0, stopped: false,
      srcs: [osc, sub, chopOsc, tw, tw2],
    };
  }

  function burst(v, t, freq, q, level, dur, type) {
    var s = ac.createBufferSource(), f = filt(type || 'bandpass', freq, q), g = ac.createGain();
    s.buffer = noise();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(v.out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function bov(v, t, strength) {
    var S = v.spec.sound;
    if (S.bov === 'flutter') {
      // Compressor surge: a rapid train of air chirps.
      for (var i = 0; i < 9; i++) burst(v, t + i * 0.045, 1400 + Math.random() * 500, 2.5, 0.16 * strength * (1 - i / 11), 0.05);
    } else {
      var s = ac.createBufferSource(), f = filt('bandpass', 3200, 1.4), g = ac.createGain();
      s.buffer = noise();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * strength, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
      s.connect(f); f.connect(g); g.connect(v.out); s.start(t, Math.random()); s.stop(t + 0.6);
    }
  }
  function pop(v, t, level) {
    // Unburnt fuel lighting in the exhaust: a thump plus a crackle.
    burst(v, t, 180 + Math.random() * 120, 0.8, level, 0.09, 'lowpass');
    burst(v, t + 0.005, 2200 + Math.random() * 1500, 1.5, level * 0.5, 0.04);
  }

  // list: [{car, throttle}], player first. cam: {x, y, heading}.
  A.update = function (list, cam, dt) {
    if (!ac) return;
    var t = ac.currentTime;
    dt = dt || 1 / 60;
    while (voices.length < list.length) voices.push(makeVoice(list[voices.length].car.spec));
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i], e = list[i];
      if (!e) { v.out.gain.setTargetAtTime(0, t, 0.05); continue; }
      var c = e.car, S = c.spec.sound, thr = e.throttle || 0, p = c.p;
      var rpm = c.rpm;
      if (t < v.blipUntil) rpm = Math.min(p.REDLINE_RPM, rpm * 1.18);
      var rf = Math.max(0, Math.min(1, (rpm - p.IDLE_RPM) / (p.REDLINE_RPM - p.IDLE_RPM)));
      // Rotary lope at idle; slight unsteadiness everywhere.
      v.lumpT += dt;
      var lump = S.lope ? S.lope * Math.max(0, 1 - rf * 3) * Math.sin(v.lumpT * 9.5) * Math.sin(v.lumpT * 3.1) : 0;
      var f = (rpm / 60) * S.pulses * (1 + lump * 0.06);
      v.osc.frequency.setTargetAtTime(f, t, 0.015);
      v.sub.frequency.setTargetAtTime(f / 2, t, 0.015);
      v.chopOsc.frequency.setTargetAtTime(f, t, 0.015);
      var load = Math.max(thr, t < v.blipUntil ? 1 : 0);
      v.lp.frequency.setTargetAtTime(S.cut * (0.4 + 0.6 * load) * (0.55 + rf * 0.9), t, 0.03);
      v.rbp.frequency.setTargetAtTime(S.raspF * (0.7 + rf * 0.9), t, 0.03);
      var level = (0.06 + 0.1 * load + 0.04 * rf) * S.level;
      v.noteG.gain.setTargetAtTime(0.55 + lump * 0.4, t, 0.03);
      v.raspG.gain.setTargetAtTime(S.rasp * (0.25 + 0.75 * load) * (0.4 + rf), t, 0.03);
      v.inBp.frequency.setTargetAtTime(1200 + rf * 3200, t, 0.05);
      v.inG.gain.setTargetAtTime(S.intake * load * rf * rf * 0.5, t, 0.05);
      // Turbo boost: spools up with throttle above the boost threshold.
      if (S.turbo) {
        var want = thr > 0.5 ? Math.max(0, Math.min(1, (rf - S.spoolAt) / (1 - S.spoolAt) * 1.6)) : 0;
        v.boost += (want - v.boost) * Math.min(1, dt * (want > v.boost ? S.spool : 6));
        v.tw.frequency.setTargetAtTime(1800 + 6800 * v.boost * S.turboPitch, t, 0.05);
        v.tw2.frequency.setTargetAtTime(2400 + 8600 * v.boost * S.turboPitch, t, 0.05);
        v.twG.gain.setTargetAtTime(S.turbo * 0.045 * v.boost * v.boost, t, 0.05);
        v.thBp.frequency.setTargetAtTime(3500 + 4000 * v.boost, t, 0.05);
        v.thG.gain.setTargetAtTime(S.turbo * 0.08 * v.boost, t, 0.05);
        if (v.lastThrottle > 0.5 && thr < 0.5 && v.boost > 0.35) bov(v, t, v.boost);
        if (thr < 0.5) v.boost *= 0.4;
      }
      // Overrun pops after lifting at high revs; blip on downshift.
      if (S.pops > 0 && v.lastThrottle > 0.5 && thr < 0.5 && rf > 0.5) v.popUntil = t + 0.6 + S.pops * 0.8;
      if (c.gear < v.lastGear) { v.blipUntil = t + 0.14; if (S.pops > 0) v.popUntil = Math.max(v.popUntil, t + 0.35); }
      if (S.pops > 0 && thr < 0.5 && t < v.popUntil && t > v.nextPop && rf > 0.25) {
        pop(v, t, 0.12 * S.pops * (0.6 + Math.random() * 0.6));
        v.nextPop = t + 0.04 + Math.random() * 0.16;
      }
      v.lastThrottle = thr; v.lastGear = c.gear;
      if (i > 0) {
        var d = Math.hypot(c.x - cam.x, c.y - cam.y);
        level *= 1 / (1 + Math.pow(d / 18, 1.4));
        v.dull.frequency.setTargetAtTime(16000 / (1 + d / 30), t, 0.1);
        if (v.pan) {
          var ang = Math.atan2(c.y - cam.y, c.x - cam.x) - cam.heading;
          v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(ang))), t, 0.05);
        }
      }
      v.out.gain.setTargetAtTime(level, t, 0.03);
    }
    var pl = list[0].car;
    var slide = Math.min(1, Math.max(0, Math.abs(pl.slip) - 0.08) * 2.5) * Math.min(1, pl.speed / 15);
    if (pl.drifting) slide = Math.max(slide, 0.45 * Math.min(1, pl.speed / 15));
    squeal.gain.gain.setTargetAtTime(slide * 0.15, t, 0.05);
    squeal.tone.frequency.setTargetAtTime(1050 + 250 * slide + pl.speed * 2, t, 0.1);
    wind.gain.gain.setTargetAtTime(Math.min(0.12, pl.speed * pl.speed / 30000), t, 0.2);
    wind.lp.frequency.setTargetAtTime(300 + pl.speed * 18, t, 0.2);
  };

  A.silence = function () {
    if (!ac) return;
    var t = ac.currentTime;
    voices.forEach(function (v) { v.out.gain.setTargetAtTime(0, t, 0.05); });
    squeal.gain.gain.setTargetAtTime(0, t, 0.05);
    wind.gain.gain.setTargetAtTime(0, t, 0.05);
  };
  A.reset = function () {
    voices.forEach(function (v) { v.out.disconnect(); v.srcs.forEach(function (o) { try { o.stop(); } catch (e) { /* stopped */ } }); });
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

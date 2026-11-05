// engine.js — Track Master drift: JDM engine voices v3.
// create(ac, dest, key) -> { update(rpm, thr, t, dt, gear), stop(), state, spec }
// Explicit time `t` everywhere so it also renders in an OfflineAudioContext.
// v3: less synthetic — noise-driven pitch/amplitude wander, asymmetric (warm) saturation,
// low-Q exhaust resonances, combustion noise, a short room tail, air-noise turbo whistle,
// turbulent compressor flutter, rotary idle throb.
(function (G) {
  'use strict';
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  var CARS = {
    // 4A-GE NA, ITB, 4-2-1 header, straight muffler.
    ae86: {
      label: 'AE86', idle: 950, red: 7800, pulses: 2, level: 1.0, idleLevel: 0.05,
      wave: { n: 22, decay: 1.0, cos: 0.8, sin: 0.5 },
      forms: [[230, 1.6, 0.6], [700, 1.8, 0.5], [1700, 2.2, 0.4], [3200, 2.0, 0.2]],
      sub: 0.4, drive: 1.9, bias: 0.22, cut: 3800, res: 1.2,
      rasp: 0.7, raspF: 1500, raspQ: 0.9, comb: 0.5, intake: 1.0, rumble: 0.55, wander: 1.0, irreg: 1.0, lope: 0, hum: 0,
      turbo: 0, bov: 'none', popStyle: 'bang', pops: 1.0, popTime: 1.3, clunk: 1.0, limHz: 13
    },
    // 13B single turbo: idle throb, droning buzz, whistle, rough flutter.
    rx7: {
      label: 'RX-7', idle: 850, red: 8000, pulses: 2, level: 1.05, idleLevel: 0.085,
      wave: { n: 30, decay: 0.75, cos: 0.7, sin: 0.6 },
      forms: [[190, 1.5, 0.6], [900, 1.8, 0.8], [2100, 2.0, 0.5], [4000, 1.8, 0.25]],
      sub: 0.55, drive: 2.4, bias: 0.3, cut: 4600, res: 1.5,
      rasp: 1.0, raspF: 1000, raspQ: 0.8, comb: 0.8, intake: 0.2, rumble: 0.7, wander: 1.4, irreg: 1.3, lope: 1.0, hum: 0.5,
      turbo: 1.0, turboPitch: 0.8, spool: 1.5, spoolAt: 0.35, bov: 'flutter',
      popStyle: 'stutter', pops: 0.9, popTime: 1.4, clunk: 0.8, limHz: 15
    },
    // B6 + bolt-on turbo: smooth, clean whistle, long "pssh" only (no pops).
    miata: {
      label: '미아타', idle: 900, red: 7200, pulses: 2, level: 1.0, idleLevel: 0.05,
      wave: { n: 14, decay: 1.25, cos: 0.6, sin: 0.7 },
      forms: [[220, 1.6, 0.7], [620, 1.8, 0.5], [1400, 2.0, 0.3]],
      sub: 0.5, drive: 1.5, bias: 0.18, cut: 3100, res: 1.2,
      rasp: 0.45, raspF: 1300, raspQ: 1.1, comb: 0.4, intake: 0.3, rumble: 0.45, wander: 0.8, irreg: 0.8, lope: 0, hum: 0,
      turbo: 0.85, turboPitch: 1.1, spool: 2.4, spoolAt: 0.28, bov: 'pssh',
      popStyle: 'none', pops: 0, popTime: 0, clunk: 0, limHz: 12
    }
  };

  var nbCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function noiseBuf(ac) {
    var b = nbCache && nbCache.get(ac);
    if (b) return b;
    b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (nbCache) nbCache.set(ac, b);
    return b;
  }
  function satCurve(a, bias) {
    var n = 2048, c = new Float32Array(n), off = Math.tanh(a * bias);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; c[i] = (Math.tanh(a * (x + bias)) - off) / Math.tanh(a); }
    return c;
  }
  function roomIR(ac) {
    var len = Math.floor(ac.sampleRate * 0.38), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0), lp = 0;
    for (var i = 0; i < len; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.35;
      d[i] = lp * Math.exp(-i / (ac.sampleRate * 0.075));
    }
    return b;
  }

  function makeMaster(ac) {
    var master = ac.createGain(); master.gain.value = 0.8;
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.15;
    var an = ac.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.6;
    master.connect(comp); comp.connect(an); an.connect(ac.destination);
    return { input: master, analyser: an };
  }

  // over: optional overrides (the game passes its own idle/redline rpm).
  function create(ac, dest, key, over) {
    var S = {}, k0;
    for (k0 in CARS[key]) S[k0] = CARS[key][k0];
    for (k0 in (over || {})) S[k0] = over[k0];
    function gain(v) { var g = ac.createGain(); g.gain.value = v; return g; }
    function filt(type, f, q) { var b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
    function noiseSrc() { var s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true; s.start(0, Math.random() * 1.5); return s; }
    var srcs = [];
    function osc(type) { var o = ac.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.start(); srcs.push(o); return o; }
    function wanderNoise(lpHz, amount, target) { // slow random signal -> AudioParam
      var n = noiseSrc(), lp = filt('lowpass', lpHz, 0.5), g = gain(amount);
      srcs.push(n); n.connect(lp); lp.connect(g); g.connect(target); return g;
    }

    var out = gain(0), limG = gain(1), engBus = gain(1), fx = gain(S.fxGain || 1.8), bus = gain(1);
    engBus.connect(limG); limG.connect(out); out.connect(bus); fx.connect(bus); bus.connect(dest);
    // short room tail
    var verb = ac.createConvolver(); verb.buffer = roomIR(ac); var verbG = gain(0.22);
    bus.connect(verbG); verbG.connect(verb); verb.connect(dest);

    // Pulse-train note.
    var N = S.wave.n, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (var k = 1; k <= N; k++) { var a = Math.pow(k, -S.wave.decay); re[k] = a * S.wave.cos; im[k] = a * S.wave.sin; }
    var pw = ac.createPeriodicWave(re, im);
    var oA = osc(pw), oB = osc(pw), oC = osc(pw), sub = osc('sine');
    var wA = wanderNoise(22, 0, oA.detune), wB = wanderNoise(30, 0, oB.detune), wC = wanderNoise(18, 0, oC.detune);
    var gA = gain(0.45), gB = gain(0.35), gC = gain(0.25), subG = gain(S.sub), mix = gain(1);
    oA.connect(gA); gA.connect(mix); oB.connect(gB); gB.connect(mix); oC.connect(gC); gC.connect(mix); sub.connect(subG); subG.connect(mix);
    var shaper = ac.createWaveShaper(); shaper.curve = satCurve(S.drive, S.bias); shaper.oversample = '2x';
    mix.connect(shaper);
    var dryLp = filt('lowpass', 2000, S.res), dryG = gain(0.7), body = gain(1), noteG = gain(0.5);
    shaper.connect(dryLp); dryLp.connect(dryG); dryG.connect(body);
    var forms = S.forms.map(function (f) {
      var bp = filt('bandpass', f[0], f[1]), g = gain(f[2]);
      shaper.connect(bp); bp.connect(g); g.connect(body);
      return { bp: bp, g: g, f: f[0], base: f[2] };
    });
    body.connect(noteG); noteG.connect(engBus);
    wanderNoise(45, 2.5 * S.irreg, noteG.gain); // cycle-to-cycle strength wobble

    // Exhaust rasp + combustion noise (noise pulsed at the firing rate).
    var cre = new Float32Array(13), cim = new Float32Array(13);
    for (var c = 1; c <= 12; c++) cre[c] = Math.pow(c, -0.6);
    var chopOsc = osc(ac.createPeriodicWave(cre, cim));
    var rn = noiseSrc(), rbp = filt('bandpass', S.raspF, S.raspQ), chop = gain(0.3), chopDepth = gain(0.7), raspG = gain(0);
    chopOsc.connect(chopDepth); chopDepth.connect(chop.gain);
    rn.connect(rbp); rbp.connect(chop); chop.connect(raspG); raspG.connect(engBus);
    var cn = noiseSrc(), cbp = filt('bandpass', 450, 0.9), cchop = gain(0.25), cdepth = gain(0.75), combG = gain(0);
    chopOsc.connect(cdepth); cdepth.connect(cchop.gain);
    cn.connect(cbp); cbp.connect(cchop); cchop.connect(combG); combG.connect(engBus);
    var inN = noiseSrc(), inBp = filt('bandpass', 1500, 3), inG = gain(0);
    inN.connect(inBp); inBp.connect(inG); inG.connect(engBus);
    var rmN = noiseSrc(), rmLp = filt('lowpass', 150, 0.7), rmG = gain(0);
    rmN.connect(rmLp); rmLp.connect(rmG); rmG.connect(engBus);
    // Rotary idle hum (throbbed by update()).
    var hmN = noiseSrc(), hmBp = filt('bandpass', 140, 1.3), hmG = gain(0);
    hmN.connect(hmBp); hmBp.connect(hmG); hmG.connect(engBus);
    // Turbo: faint tone + airy whistle + hiss.
    var tw = osc('sine'), twG = gain(0);
    tw.connect(twG); twG.connect(engBus);
    var wsN = noiseSrc(), wsBp = filt('bandpass', 4000, 14), wsG = gain(0);
    wsN.connect(wsBp); wsBp.connect(wsG); wsG.connect(engBus);
    var thN = noiseSrc(), thBp = filt('bandpass', 5000, 1.5), thG = gain(0);
    thN.connect(thBp); thBp.connect(thG); thG.connect(engBus);

    // --- transient effects ---
    function burst(t, type, f0, f1, q, level, dur) {
      var s = ac.createBufferSource(), f = filt(type, f0, q), g = ac.createGain();
      s.buffer = noiseBuf(ac);
      if (f1) { f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(fx);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    }
    function thump(t, f0, f1, level, dur) { // low "whump": filtered noise sweep with a little body
      burst(t, 'lowpass', f0 * 2.4, f1 * 2.4, 0.7, level * 1.3, dur);
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * 0.3), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(fx); o.start(t); o.stop(t + dur + 0.05);
    }
    // Compressor surge: rough, turbulent air — irregular chuffs of broadband noise, no tones.
    function flutter(t, strength) {
      var dur = 0.55 + 0.25 * strength;
      var s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true;
      var bpA = filt('bandpass', 1700, 0.7), lpB = filt('lowpass', 420, 0.7), hpC = filt('highpass', 3000, 0.5);
      var g = ac.createGain(), gB = gain(0.9), gC = gain(0.16);
      s.connect(bpA); s.connect(lpB); s.connect(hpC);
      bpA.connect(g); lpB.connect(gB); gB.connect(g); hpC.connect(gC); gC.connect(g);
      bpA.frequency.setValueAtTime(1700, t); bpA.frequency.exponentialRampToValueAtTime(650, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      var tp = t + 0.01, peak = 0.55 * strength;
      while (tp < t + dur) {
        var prog = (tp - t) / dur, amp = peak * Math.pow(1 - prog, 1.2) * (0.5 + Math.random() * 0.5);
        var gap = 0.046 + prog * 0.05 + Math.random() * 0.016;
        g.gain.setValueAtTime(0.0001, tp);
        g.gain.linearRampToValueAtTime(amp, tp + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001 + amp * 0.05, tp + gap * 0.92);
        tp += gap;
      }
      g.connect(fx); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
      burst(t + 0.02, 'bandpass', 2600, 700, 0.9, 0.2 * strength, 0.42);
    }
    function bov(t, strength) {
      if (S.bov === 'flutter') flutter(t, strength);
      else if (S.bov === 'pssh') {
        burst(t, 'bandpass', 5200, 1500, 1.0, 0.5 * strength, 0.55);
        burst(t, 'highpass', 2600, 0, 0.7, 0.22 * strength, 0.42);
        burst(t + 0.01, 'bandpass', 2400, 900, 0.8, 0.18 * strength, 0.5);
      }
    }
    function pop(t, rf, scale) {
      if (S.popStyle === 'none') return;
      var l = (0.55 + rf * 0.6) * S.pops * (scale || 1) * (0.7 + Math.random() * 0.6);
      if (S.popStyle === 'bang') {
        thump(t, 150, 45, 0.5 * l, 0.13);
        burst(t, 'lowpass', 450, 0, 0.7, 0.4 * l, 0.12);
        burst(t, 'highpass', 1800 + Math.random() * 900, 0, 0.7, 0.45 * l, 0.04);
      } else {
        thump(t, 190, 80, 0.36 * l, 0.08);
        burst(t, 'bandpass', 1500 + Math.random() * 1200, 0, 1.0, 0.36 * l, 0.035);
        if (Math.random() < 0.16) { thump(t + 0.01, 140, 45, 0.5 * l, 0.14); burst(t, 'lowpass', 500, 0, 0.7, 0.45 * l, 0.14); }
      }
    }
    function popGap() { return S.popStyle === 'bang' ? 0.07 + Math.random() * 0.22 : 0.035 + Math.random() * 0.06; }

    // Gear change: a short thud and click; an upshift also cuts the throttle for a
    // moment (so the lift-off sounds play), a downshift blips it.
    function clunk(t, k) {
      thump(t, 95, 45, 0.2 * k, 0.1);
      burst(t, 'bandpass', 700, 0, 1.2, 0.14 * k, 0.04);
    }
    var st = { cutUntil: 0, blipUntil: 0, ld: 0, lift: 0, boost: 0, lastThr: 0, lastGear: 1, popUntil: 0, nextPop: 0, ph: 0, limPrev: 1 };

    function update(rpm, thr, t, dt, gear) {
      dt = dt || 1 / 60; gear = gear || 1;
      var up = gear > st.lastGear, down = gear < st.lastGear;
      if (up) { if (thr > 0.3) { st.cutUntil = t + 0.17; clunk(t + 0.17, 1); } else clunk(t + 0.03, 0.6); }
      if (down) { st.blipUntil = t + 0.16; clunk(t + 0.02, 0.8); }
      if (t < st.cutUntil) thr = 0; else if (t < st.blipUntil) thr = Math.max(thr, 0.95);
      var rf = clamp((rpm - S.idle) / (S.red - S.idle), 0, 1);
      st.ld += (thr - st.ld) * Math.min(1, dt * (thr > st.ld ? 16 : 26));
      var ld = st.ld;
      if (st.lastThr > 0.55 && thr < 0.35) {
        st.lift = 1;
        if (S.clunk && rf > 0.25) thump(t, 75, 38, (0.1 + 0.16 * rf) * S.clunk, 0.13);
        if (rf > 0.3) burst(t, 'bandpass', 1400, 400, 0.9, 0.2 * rf, 0.25); // intake gulp
        if (S.pops > 0 && rf > 0.35) { st.popUntil = t + S.popTime * (0.4 + rf * 0.8); st.nextPop = t + 0.05 + Math.random() * 0.05; }
        if (S.turbo && st.boost > 0.3) bov(t, st.boost);
      }
      if (S.pops > 0 && down) { st.popUntil = Math.max(st.popUntil, t + 0.4); st.nextPop = Math.min(st.nextPop || t, t + 0.03); }
      st.lift = Math.max(0, st.lift - dt * 2.5);
      // Rotary throb: regular "woong woong" at idle that blurs into a buzz as revs rise.
      var idleF = Math.max(0, 1 - rf * 2.5), env = 1, amp = 1, dip = 0;
      if (S.lope) {
        st.ph += dt * (3.4 + rf * 30) * 6.2832;
        env = Math.pow(0.5 + 0.5 * Math.cos(st.ph), 1.3);
        var depth = S.lope * idleF * 0.62;
        amp = 1 - depth * (1 - env); dip = 0.04 * depth * (1 - env);
      }
      var f = (rpm / 60) * S.pulses * (1 - dip);
      var wd = S.wander * (1.3 - rf) * 20 * 9; // noise (~0.05 rms) -> cents
      wA.gain.setTargetAtTime(wd, t, 0.1); wB.gain.setTargetAtTime(wd * 1.3, t, 0.1); wC.gain.setTargetAtTime(wd * 0.8, t, 0.1);
      oA.frequency.setTargetAtTime(f, t, 0.012);
      oB.frequency.setTargetAtTime(f * 1.0021, t, 0.012);
      oC.frequency.setTargetAtTime(f * 0.9983, t, 0.012);
      sub.frequency.setTargetAtTime(f / 2, t, 0.012);
      chopOsc.frequency.setTargetAtTime(f, t, 0.012);
      var lpf = S.cut * (0.26 + 0.74 * ld) * (0.5 + 0.9 * rf) * (S.lope ? (0.75 + 0.5 * env * idleF + (1 - idleF) * 0.25) : 1);
      dryLp.frequency.setTargetAtTime(Math.max(300, lpf), t, 0.03);
      for (var i = 0; i < forms.length; i++) {
        forms[i].bp.frequency.setTargetAtTime(forms[i].f * (1 + 0.12 * rf), t, 0.05);
        forms[i].g.gain.setTargetAtTime(forms[i].base * (0.45 + 0.65 * ld), t, 0.04);
      }
      subG.gain.setTargetAtTime(S.sub * (0.7 + 0.6 * (1 - ld)), t, 0.04);
      noteG.gain.setTargetAtTime(0.5 * amp, t, 0.02);
      raspG.gain.setTargetAtTime(S.rasp * (0.1 + 0.9 * ld) * (0.4 + rf) * (0.6 + 0.4 * amp), t, 0.03);
      combG.gain.setTargetAtTime(S.comb * (0.25 + 0.75 * ld) * (0.35 + 0.65 * rf + 0.3 * (1 - rf)), t, 0.03);
      rbp.frequency.setTargetAtTime(S.raspF * (0.7 + rf * 0.9), t, 0.03);
      cbp.frequency.setTargetAtTime(300 + rf * 500, t, 0.05);
      inBp.frequency.setTargetAtTime(1200 + rf * 3400, t, 0.05);
      inG.gain.setTargetAtTime(S.intake * ld * rf * rf * 0.5, t, 0.05);
      rmLp.frequency.setTargetAtTime(110 + rf * 160, t, 0.05);
      rmG.gain.setTargetAtTime(S.rumble * (0.1 + 0.5 * rf) * (0.5 + 0.5 * ld), t, 0.05);
      hmG.gain.setTargetAtTime(S.hum ? S.hum * 1.6 * env * idleF : 0, t, 0.012);
      var level = S.level * (S.idleLevel + 0.17 * ld + 0.045 * rf + 0.03 * st.lift) * (S.lope ? (0.55 + 0.45 * amp) : 1);
      if (S.turbo) {
        var want = thr > 0.45 ? clamp((rf - S.spoolAt) / (1 - S.spoolAt) * 1.5, 0, 1) : 0;
        var rate = want > st.boost ? S.spool : 2.6;
        st.boost += (want - st.boost) * Math.min(1, dt * rate);
        var b = st.boost, wf = 1500 + 6800 * b * S.turboPitch;
        tw.frequency.setTargetAtTime(wf, t, 0.05);
        twG.gain.setTargetAtTime(S.turbo * 0.022 * b * b, t, 0.05);
        wsBp.frequency.setTargetAtTime(wf * 1.02, t, 0.05);
        wsG.gain.setTargetAtTime(S.turbo * 0.16 * Math.pow(b, 1.6), t, 0.05);
        thBp.frequency.setTargetAtTime(3500 + 4000 * b, t, 0.05);
        thG.gain.setTargetAtTime(S.turbo * 0.07 * b, t, 0.05);
      }
      if (S.pops > 0 && thr < 0.35 && t < st.popUntil && t >= st.nextPop && rf > 0.18) { pop(t, rf, 1); st.nextPop = t + popGap(); }
      var lim = 1;
      if (rf > 0.985 && thr > 0.6) lim = (Math.floor(t * S.limHz * 2) & 1) ? 0.12 : 1;
      if (lim !== st.limPrev) {
        limG.gain.setTargetAtTime(lim, t, 0.004);
        if (lim < 1 && S.pops > 0 && Math.random() < 0.55) pop(t, 1, 0.8);
        st.limPrev = lim;
      }
      st.lastThr = thr; st.lastGear = gear;
      out.gain.setTargetAtTime(level, t, 0.03);
    }
    function stop() {
      try { out.gain.setTargetAtTime(0, ac.currentTime, 0.04); } catch (e) { /* ignore */ }
      setTimeout(function () {
        srcs.forEach(function (o) { try { o.stop(); } catch (e) { /* stopped */ } });
        try { out.disconnect(); fx.disconnect(); bus.disconnect(); verbG.disconnect(); } catch (e) { /* gone */ }
      }, 600);
    }
    return { update: update, stop: stop, state: st, spec: S };
  }

  G.TMEngine = { create: create, makeMaster: makeMaster, CARS: CARS };
})(typeof window !== 'undefined' ? window : globalThis);

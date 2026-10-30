// engine-sound.js — engine voices for F1 Champion (player car and AI cars).
//
// How it sounds real (instead of a buzzing oscillator):
//  1. Firing pulses: one engine cycle (2 crank turns) is built sample by
//     sample as a train of exhaust-pressure pulses, one per cylinder, with a
//     small fixed imbalance per cylinder and random cycle-to-cycle variation.
//     32 cycles are looped and pitched with playbackRate, so the harmonics
//     follow rpm the way a real engine's do.
//  2. Two loops play in sync: "on load" (strong, sharp pulses + combustion
//     noise) and "overrun" (weak, irregular pulses). The throttle crossfades.
//  3. Fixed resonances that do NOT move with rpm: exhaust formants (peaking
//     filters) and a short pipe echo (comb filter). Harmonics sweeping past
//     fixed resonances is what gives an engine its changing colour.
//  4. Load-driven saturation, intake roar, turbo spool whine, wastegate /
//     blow-off, straight-cut gear whine, overrun pops and crackles, ignition
//     cut on gear changes, rev-limiter bounce, wind. F1 also gets the hybrid
//     (MGU-K) whine under braking. Formula E is a separate electric voice.
//
// API: EngineSound.create(ac, carId, dest) -> engine
//   engine.update({ rpmFrac, throttle, brake, speed, limiter, pitch }, t)
//   (pitch: Doppler factor for other cars, 1 = none)
//   engine.shift(t, up)      engine.stop(t)
// rpmFrac is the game's 0..1 rpm (idle..redline); each voice maps it to the
// real car's rpm range. speed is m/s. t is the AudioContext time to act at.
(function (root) {
  'use strict';

  var VOICES = {
    f4: {
      name: 'F4', engine: '1.4L 직렬 4기통 터보', idle: 1700, redline: 7200, base: 4300, cylinders: 4,
      pulse: 0.17, noise: 0.14, imbalance: 0.07, overrunChaos: 0.45,
      drive: 2.2, formants: [[190, 1.1, 6], [640, 1.3, 4], [1750, 1.8, 3]], lp: [1500, 6000], hp: 55,
      pipe: { ms: 4.6, fb: 0.42 }, intake: 0.06, intakeBand: [900, 3600],
      turbo: { whine: 0.035, freq: [2400, 6800], lift: 'bov' }, pops: 0.7, gearWhine: 0.012, level: 0.17,
    },
    f3: {
      name: 'F3', engine: '3.4L V6 자연흡기', idle: 2400, redline: 8300, base: 5200, cylinders: 6,
      pulse: 0.15, noise: 0.12, imbalance: 0.05, overrunChaos: 0.55,
      drive: 2.6, formants: [[330, 1.0, 4], [1050, 1.5, 6], [2600, 2.0, 4]], lp: [2200, 9000], hp: 70,
      pipe: { ms: 3.1, fb: 0.45 }, intake: 0.08, intakeBand: [1400, 5200],
      turbo: null, pops: 1.0, gearWhine: 0.012, level: 0.18,
    },
    f2: {
      name: 'F2', engine: '3.4L V6 터보', idle: 2400, redline: 8800, base: 5400, cylinders: 6,
      pulse: 0.16, noise: 0.14, imbalance: 0.06, overrunChaos: 0.5,
      drive: 2.9, formants: [[250, 1.0, 6], [880, 1.4, 5], [2150, 1.9, 3]], lp: [1900, 7800], hp: 55,
      pipe: { ms: 3.8, fb: 0.46 }, intake: 0.06, intakeBand: [1100, 4200],
      turbo: { whine: 0.045, freq: [2800, 7600], lift: 'flutter' }, pops: 0.9, gearWhine: 0.012, level: 0.30,
    },
    f1: {
      name: 'F1', engine: '1.6L V6 터보 하이브리드', idle: 4200, redline: 12500, base: 8000, cylinders: 6,
      pulse: 0.14, noise: 0.10, imbalance: 0.04, overrunChaos: 0.5,
      drive: 2.4, formants: [[420, 1.0, 3], [1300, 1.4, 6], [3100, 2.0, 5]], lp: [2600, 10500], hp: 90,
      pipe: { ms: 2.5, fb: 0.4 }, intake: 0.07, intakeBand: [2000, 6500],
      turbo: { whine: 0.06, freq: [3800, 9500], lift: null }, pops: 0.6, gearWhine: 0.010, level: 0.31,
      ers: 0.05,
    },
    fe: {
      name: '포뮬러 E', engine: '전기 모터 350kW', electric: true,
      motorHzPerMs: 13.5, carrier: [2600, 3800], level: 0.47,
    },
  };

  var SMOOTH = 0.03;

  // Small seeded random generator so every car always sounds the same.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(id) {
    var h = 2166136261;
    for (var i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function set(param, value, t, tc) { param.setTargetAtTime(value, t, tc || SMOOTH); }

  function satCurve(k) {
    var n = 2048, c = new Float32Array(n), norm = Math.tanh(k);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      // Slightly asymmetric: exhaust pressure pulses clip harder on the push.
      c[i] = Math.tanh(k * x * (x > 0 ? 1.08 : 0.94)) / norm;
    }
    return c;
  }

  function noiseBuffer(ac, seconds, seed) {
    var r = rng(seed), b = ac.createBuffer(1, Math.round(ac.sampleRate * seconds), ac.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return b;
  }

  // --- Firing-pulse loops -------------------------------------------------------

  var CYCLES = 32;

  function buildLoops(ac, id, v) {
    var sr = ac.sampleRate;
    var cycle = Math.round((120 / v.base) * sr); // samples per engine cycle at base rpm
    var n = cycle * CYCLES;
    var load = new Float32Array(n), over = new Float32Array(n);
    var r = rng(seedOf(id));
    var N = v.cylinders, interval = cycle / N;
    var tau = v.pulse * interval;
    var cyl = [];
    for (var k = 0; k < N; k++) cyl.push(1 + (r() * 2 - 1) * v.imbalance);

    function addPulse(buf, start, amp, sharp, noiseAmt) {
      var tt = tau * sharp, len = Math.ceil(tt * 9), nt = tt * 0.7;
      for (var i = 0; i < len; i++) {
        var x = i / tt;
        // Pressure pulse (alpha shape) followed by a softer suction dip.
        var p = x * Math.exp(1 - x);
        var y = (x - 1.6) / 2.4;
        if (y > 0) p -= 0.42 * y * Math.exp(1 - y);
        var s = amp * p + noiseAmt * amp * (r() * 2 - 1) * Math.exp(-i / nt);
        var j = (start + i) % n;
        buf[j < 0 ? j + n : j] += s;
      }
    }

    for (var c = 0; c < CYCLES; c++) {
      for (var k2 = 0; k2 < N; k2++) {
        var t0 = Math.round(c * cycle + k2 * interval + (r() - 0.5) * interval * 0.035);
        var a = cyl[k2] * (1 + (r() - 0.5) * 0.12);
        addPulse(load, t0, a, 1, v.noise);
        // Overrun: little fuel, irregular, softer edges, some near-misfires.
        var chaos = 1 + (r() - 0.5) * 2 * v.overrunChaos;
        if (r() < 0.08) chaos *= 0.15;
        addPulse(over, t0, 0.32 * cyl[k2] * chaos, 1.35, v.noise * 0.5);
      }
    }
    // Remove DC and normalise both by the load loop's peak.
    [load, over].forEach(function (b) {
      var m = 0, i;
      for (i = 0; i < n; i++) m += b[i];
      m /= n;
      for (i = 0; i < n; i++) b[i] -= m;
    });
    var peak = 0;
    for (var i2 = 0; i2 < n; i2++) peak = Math.max(peak, Math.abs(load[i2]));
    var g = 0.9 / peak;
    var bl = ac.createBuffer(1, n, sr), bo = ac.createBuffer(1, n, sr);
    var dl = bl.getChannelData(0), dov = bo.getChannelData(0);
    for (var i3 = 0; i3 < n; i3++) { dl[i3] = load[i3] * g; dov[i3] = over[i3] * g; }
    return { load: bl, over: bo, baseRpm: (120 * sr) / cycle };
  }

  // --- One-shot effects ----------------------------------------------------------

  function burst(ac, buf, dest, t, o) {
    var src = ac.createBufferSource();
    src.buffer = buf;
    var f = ac.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.len);
    f.Q.value = o.q || 1;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.amp, t + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.len);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * (buf.duration - o.len - 0.05), o.len + 0.02);
  }

  function popAt(e, t, strength) {
    var ac = e.ac;
    burst(ac, e.noise, e.popBus, t, { f0: 700 + Math.random() * 1800, q: 0.9, amp: 4.0 * strength, len: 0.035 + Math.random() * 0.03, attack: 0.001 });
    var o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 + Math.random() * 50, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.06);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(2.2 * strength, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(e.popBus);
    o.start(t);
    o.stop(t + 0.08);
  }

  // --- Combustion engines -------------------------------------------------------

  // Loops and noise are built once per AudioContext and car, then shared
  // (the five AI F1s all use the same buffers).
  function cached(ac, key, make) {
    var c = ac.__engineSoundCache || (ac.__engineSoundCache = {});
    return c[key] || (c[key] = make());
  }

  function createCombustion(ac, id, v, dest, opts) {
    var e = { ac: ac, id: id, v: v, remote: !!opts.remote, nodes: [], boost: 0, overrun: 0, lastThrottle: 0, lastT: null, liftAt: -1, popRate: 0 };
    var loops = cached(ac, 'loops-' + id, function () { return buildLoops(ac, id, v); });
    e.baseRpm = loops.baseRpm;
    e.noise = cached(ac, 'noise-' + id, function () { return noiseBuffer(ac, 2, seedOf(id) ^ 99); });

    e.out = ac.createGain();
    e.out.gain.value = 0;
    e.out.connect(dest);

    // Gates: shift ignition cut, and rev-limiter bounce.
    e.cut = ac.createGain();
    e.lim = ac.createGain();
    e.cut.connect(e.lim).connect(e.out);
    e.limOsc = ac.createOscillator();
    e.limOsc.type = 'square';
    e.limOsc.frequency.value = 21;
    e.limDepth = ac.createGain();
    e.limDepth.gain.value = 0;
    e.limOsc.connect(e.limDepth).connect(e.lim.gain);

    // Pulse loops -> load crossfade.
    e.srcL = ac.createBufferSource();
    e.srcL.buffer = loops.load;
    e.srcO = ac.createBufferSource();
    e.srcO.buffer = loops.over;
    e.srcL.loop = e.srcO.loop = true;
    e.gL = ac.createGain();
    e.gO = ac.createGain();
    e.gO.gain.value = 0;
    e.pre = ac.createGain();
    e.srcL.connect(e.gL).connect(e.pre);
    e.srcO.connect(e.gO).connect(e.pre);

    var shaper = ac.createWaveShaper();
    shaper.curve = satCurve(v.drive);
    shaper.oversample = e.remote ? 'none' : '2x';
    e.post = ac.createGain();
    var hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = v.hp;
    hp.Q.value = 0.7;
    e.pre.connect(shaper).connect(e.post).connect(hp);
    var node = hp;
    v.formants.forEach(function (fm) {
      var p = ac.createBiquadFilter();
      p.type = 'peaking';
      p.frequency.value = fm[0];
      p.Q.value = fm[1];
      p.gain.value = fm[2];
      node.connect(p);
      node = p;
    });
    // Pipe echo: short feedback delay, damped inside the loop.
    var pipeIn = ac.createGain();
    node.connect(pipeIn);
    var delay = ac.createDelay(0.05);
    delay.delayTime.value = v.pipe.ms / 1000;
    var damp = ac.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3500;
    var fb = ac.createGain();
    fb.gain.value = v.pipe.fb;
    pipeIn.connect(delay).connect(damp).connect(fb).connect(delay);
    e.lp = ac.createBiquadFilter();
    e.lp.type = 'lowpass';
    e.lp.Q.value = 0.8;
    pipeIn.connect(e.lp);
    fb.connect(e.lp);
    e.lp.connect(e.cut);

    // Intake / valvetrain roar (cockpit only).
    if (!e.remote) {
    e.intakeSrc = ac.createBufferSource();
    e.intakeSrc.buffer = e.noise;
    e.intakeSrc.loop = true;
    e.intakeF = ac.createBiquadFilter();
    e.intakeF.type = 'bandpass';
    e.intakeF.Q.value = 1.3;
    e.intakeG = ac.createGain();
    e.intakeG.gain.value = 0;
    e.intakeSrc.connect(e.intakeF).connect(e.intakeG).connect(e.cut);
    }

    // Overrun pops (after the gates, so they also crackle through a cut).
    e.popBus = ac.createGain();
    var popLp = ac.createBiquadFilter();
    popLp.type = 'lowpass';
    popLp.frequency.value = 4200;
    e.popBus.connect(popLp).connect(e.out);

    // Turbo spool whine.
    if (v.turbo) {
      e.turbo = ac.createOscillator();
      e.turbo.type = 'sine';
      e.turbo2 = ac.createOscillator();
      e.turbo2.type = 'sine';
      e.turboG = ac.createGain();
      e.turboG.gain.value = 0;
      var t2g = ac.createGain();
      t2g.gain.value = 0.35;
      e.turbo.connect(e.turboG);
      e.turbo2.connect(t2g).connect(e.turboG);
      e.turboG.connect(e.out);
    }

    // Straight-cut gearbox whine (follows road speed, cockpit only).
    if (!e.remote) {
    e.gear = ac.createOscillator();
    e.gear.type = 'sine';
    e.gearG = ac.createGain();
    e.gearG.gain.value = 0;
    e.gear.connect(e.gearG).connect(e.out);
    }

    // F1 hybrid: MGU-K whine when harvesting under braking.
    if (v.ers && !e.remote) {
      e.ers = ac.createOscillator();
      e.ers.type = 'sine';
      e.ers2 = ac.createOscillator();
      e.ers2.type = 'sine';
      e.ersG = ac.createGain();
      e.ersG.gain.value = 0;
      var e2g = ac.createGain();
      e2g.gain.value = 0.4;
      e.ers.connect(e.ersG);
      e.ers2.connect(e2g).connect(e.ersG);
      e.ersG.connect(e.out);
    }

    var t0 = ac.currentTime + 0.02;
    e.oscs = [e.srcL, e.srcO, e.limOsc];
    if (e.intakeSrc) e.oscs.push(e.intakeSrc, e.gear);
    if (e.turbo) e.oscs.push(e.turbo, e.turbo2);
    if (e.ers) e.oscs.push(e.ers, e.ers2);
    e.oscs.forEach(function (o) { o.start(t0); });

    e.update = function (p, t) { updateCombustion(e, p, t); };
    e.shift = function (t, up) { shiftCombustion(e, t, up !== false); };
    e.stop = function (t) { stopAll(e, t); };
    return e;
  }

  function updateCombustion(e, p, t) {
    var v = e.v, ac = e.ac, remote = e.remote;
    var pitch = p.pitch || 1; // Doppler shift for other cars
    var dt = e.lastT == null ? 1 / 60 : Math.max(0, Math.min(0.1, t - e.lastT));
    e.lastT = t;
    var rf = Math.max(0, Math.min(1, p.rpmFrac));
    var thr = Math.max(0, Math.min(1, p.throttle));
    var speed = p.speed || 0;
    var rpm = v.idle + (v.redline - v.idle) * rf;

    // Natural unsteadiness, strongest at idle.
    var wobble = 1 + (1 - rf) * 0.006 * Math.sin(t * 2 * Math.PI * 1.9) + 0.002 * (Math.random() - 0.5);
    var rate = (rpm / e.baseRpm) * wobble * pitch;
    set(e.srcL.playbackRate, rate, t, 0.02);
    set(e.srcO.playbackRate, rate, t, 0.02);

    // Load: throttle mostly, but a spinning engine always has some.
    var load = Math.min(1, thr * (0.75 + 0.25 * rf));
    set(e.gL.gain, Math.sqrt(0.05 + 0.95 * load), t);
    set(e.gO.gain, Math.sqrt(1 - load) * 0.8, t);
    set(e.pre.gain, 0.55 + 1.0 * load * (0.4 + 0.6 * rf), t);
    set(e.post.gain, 1 / (0.8 + 0.6 * load), t);
    set(e.lp.frequency, v.lp[0] + (v.lp[1] - v.lp[0]) * (0.3 * rf + 0.7 * rf * load), t);

    if (e.intakeSrc) {
      set(e.intakeF.frequency, v.intakeBand[0] + (v.intakeBand[1] - v.intakeBand[0]) * rf, t);
      set(e.intakeG.gain, v.intake * load * (0.2 + 0.8 * rf), t);
    }

    // Rev limiter: ignition cut bouncing ~20 times a second.
    var limiting = p.limiter && thr > 0.1;
    set(e.lim.gain, limiting ? 0.5 : 1, t, 0.005);
    set(e.limDepth.gain, limiting ? 0.48 : 0, t, 0.005);

    var level = v.level * (0.20 + 0.50 * load * (0.55 + 0.45 * rf) + 0.18 * rf);
    set(e.out.gain, level, t);

    // Turbo: boost builds with lag, drops fast on lift.
    if (v.turbo) {
      var target = thr * Math.pow(rf, 0.7);
      var tc = target > e.boost ? 0.45 : 0.12;
      e.boost += (target - e.boost) * Math.min(1, dt / tc);
      var f = v.turbo.freq[0] + (v.turbo.freq[1] - v.turbo.freq[0]) * e.boost;
      set(e.turbo.frequency, f * pitch, t);
      set(e.turbo2.frequency, f * 1.51 * pitch, t);
      set(e.turboG.gain, v.turbo.whine * e.boost * e.boost, t);
    }

    // Gear whine: clearest when coasting.
    if (e.gear) {
      set(e.gear.frequency, (40 + speed * 33) * pitch, t);
      set(e.gearG.gain, v.gearWhine * Math.min(1, speed / 25), t);
    }

    if (e.ers) {
      var harvest = (p.brake || 0) * Math.min(1, Math.max(0, speed - 8) / 30);
      set(e.ers.frequency, 300 + speed * 52, t);
      set(e.ers2.frequency, (300 + speed * 52) * 2.02, t);
      set(e.ersG.gain, v.ers * (harvest + 0.15 * thr * Math.min(1, speed / 40)), t);
    }

    // Lift-off: wastegate / blow-off, then a burst of overrun pops.
    var lifted = e.lastThrottle > 0.55 && thr < 0.15;
    if (lifted && rf > 0.45) {
      e.popRate = 14 * v.pops * rf;
      if (v.turbo && v.turbo.lift && e.boost > 0.35) liftValve(e, t, e.boost);
    }
    if (thr > 0.3) e.popRate = 0;
    e.popRate *= Math.exp(-dt / 0.55);
    if (e.popRate > 0.3 && Math.random() < e.popRate * dt) popAt(e, t + Math.random() * dt, 0.35 + 0.65 * Math.random());
    // A few crackles while bouncing off the limiter.
    if (limiting && Math.random() < 6 * v.pops * dt) popAt(e, t, 0.3 + 0.4 * Math.random());
    e.lastThrottle = thr;
  }

  function liftValve(e, t, boost) {
    var ac = e.ac, v = e.v;
    if (v.turbo.lift === 'bov') {
      burst(ac, e.noise, e.out, t, { f0: 4200, f1: 1600, q: 0.8, amp: 0.22 * boost, len: 0.32, attack: 0.008 });
    } else {
      // Wastegate flutter: quick chirps.
      for (var i = 0; i < 6; i++) {
        burst(ac, e.noise, e.out, t + i * 0.045, { f0: 3000 - i * 220, q: 2.2, amp: 0.16 * boost * (1 - i * 0.12), len: 0.035, attack: 0.002 });
      }
    }
  }

  function shiftCombustion(e, t, up) {
    // F1 shifts in milliseconds; F4's gearbox takes longer.
    var cut = e.id === 'f1' ? 0.022 : e.id === 'f4' ? 0.06 : 0.04;
    e.cut.gain.cancelScheduledValues(t);
    e.cut.gain.setTargetAtTime(up ? 0.12 : 0.4, t, 0.004);
    e.cut.gain.setTargetAtTime(1, t + cut, 0.012);
    if (up) popAt(e, t + cut * 0.6, 0.35 * e.v.pops + 0.1);
    else popAt(e, t + 0.01, 0.5 * e.v.pops + 0.15);
  }

  function stopAll(e, t) {
    e.out.gain.cancelScheduledValues(t);
    e.out.gain.setTargetAtTime(0, t, 0.05);
    e.oscs.forEach(function (o) { try { o.stop(t + 0.4); } catch (x) { /* already stopped */ } });
  }

  // --- Formula E (electric) -----------------------------------------------------

  function createElectric(ac, id, v, dest, opts) {
    var e = { ac: ac, id: id, v: v, lastT: null };
    e.out = ac.createGain();
    e.out.gain.value = 0;
    e.out.connect(dest);
    e.noise = cached(ac, 'noise-' + id, function () { return noiseBuffer(ac, 2, seedOf(id) ^ 7); });

    // Motor: fundamental + a few orders, through a gentle body resonance.
    var body = ac.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 1800;
    body.Q.value = 1.2;
    body.gain.value = 5;
    e.motor = [];
    [[1, 'sine', 0.5], [2, 'sine', 0.22], [3, 'triangle', 0.08], [6.2, 'sine', 0.06]].forEach(function (h) {
      var o = ac.createOscillator();
      o.type = h[1];
      var g = ac.createGain();
      g.gain.value = h[2];
      o.connect(g).connect(body);
      e.motor.push({ o: o, mult: h[0] });
    });
    e.torque = ac.createGain();
    e.torque.gain.value = 0;
    body.connect(e.torque).connect(e.out);

    // Inverter switching: a carrier ring-modulated by the motor's 2nd order,
    // which makes the sci-fi sidebands that move against each other.
    e.carrier = ac.createOscillator();
    e.carrier.type = 'sine';
    e.ring = ac.createGain();
    e.ring.gain.value = 0;
    e.mod = ac.createOscillator();
    e.mod.type = 'sine';
    e.mod.connect(e.ring.gain);
    e.carrier.connect(e.ring);
    e.invG = ac.createGain();
    e.invG.gain.value = 0;
    var invHp = ac.createBiquadFilter();
    invHp.type = 'highpass';
    invHp.frequency.value = 1200;
    e.ring.connect(invHp).connect(e.invG).connect(e.out);

    // Transmission whoosh.
    e.whoosh = ac.createBufferSource();
    e.whoosh.buffer = e.noise;
    e.whoosh.loop = true;
    e.whooshF = ac.createBiquadFilter();
    e.whooshF.type = 'bandpass';
    e.whooshF.Q.value = 2.5;
    e.whooshG = ac.createGain();
    e.whooshG.gain.value = 0;
    e.whoosh.connect(e.whooshF).connect(e.whooshG).connect(e.out);

    var t0 = ac.currentTime + 0.02;
    e.oscs = e.motor.map(function (m) { return m.o; }).concat([e.carrier, e.mod, e.whoosh]);
    e.oscs.forEach(function (o) { o.start(t0); });

    e.update = function (p, t) {
      var speed = Math.max(0, p.speed || 0), thr = Math.max(0, Math.min(1, p.throttle)), br = p.brake || 0;
      var f = (25 + speed * v.motorHzPerMs) * (p.pitch || 1);
      e.motor.forEach(function (m) { set(m.o.frequency, f * m.mult, t); });
      var moving = Math.min(1, speed / 6);
      // Torque: driving or regenerating both load the motor.
      var tq = Math.max(thr, br * 0.7 * Math.min(1, speed / 20));
      set(e.torque.gain, moving * (0.25 + 0.75 * tq), t);
      set(e.carrier.frequency, v.carrier[0] + (v.carrier[1] - v.carrier[0]) * Math.min(1, speed / 80), t);
      set(e.mod.frequency, f * 2, t);
      set(e.invG.gain, 0.09 * tq * (0.3 + 0.7 * moving), t);
      set(e.whooshF.frequency, 500 + speed * 30, t);
      set(e.whooshG.gain, 0.045 * moving * (0.25 + 0.75 * tq), t);
      set(e.out.gain, v.level, t);
    };
    e.shift = function () {};
    e.stop = function (t) { stopAll(e, t); };
    return e;
  }

  // --- Wind / road (shared, optional) ------------------------------------------

  function createWind(ac, dest) {
    var w = {};
    var src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 2, 4242);
    src.loop = true;
    w.f = ac.createBiquadFilter();
    w.f.type = 'lowpass';
    w.f.Q.value = 0.5;
    w.g = ac.createGain();
    w.g.gain.value = 0;
    src.connect(w.f).connect(w.g).connect(dest);
    src.start();
    w.update = function (speed, t) {
      var s = Math.max(0, speed) / 95;
      set(w.f.frequency, 300 + 2600 * s, t, 0.1);
      set(w.g.gain, 0.2 * s * s, t, 0.1);
    };
    w.stop = function (t) { w.g.gain.setTargetAtTime(0, t, 0.05); src.stop(t + 0.4); };
    return w;
  }

  root.EngineSound = {
    VOICES: VOICES,
    // opts.remote: another car heard from outside (no intake roar, gear
    // whine or hybrid whine; those are only audible from the cockpit).
    create: function (ac, id, dest, opts) {
      var v = VOICES[id] || VOICES.f1;
      opts = opts || {};
      return v.electric ? createElectric(ac, id, v, dest, opts) : createCombustion(ac, id, v, dest, opts);
    },
    createWind: createWind,
  };
  // The game reaches it as CR.EngineSound.
  root.CR = root.CR || {};
  root.CR.EngineSound = root.EngineSound;
})(typeof window !== 'undefined' ? window : this);

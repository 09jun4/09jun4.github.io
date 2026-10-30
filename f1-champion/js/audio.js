// audio.js — synthesized sound (Web Audio, no sound files).
// Load order: after hud.js and engine-sound.js, before menu.js.
// Depends on: Config, Car, EngineSound, Race (at call time).
//
//  - Engine: the player's car voice from engine-sound.js (firing pulses,
//    exhaust resonances, turbo, pops, ignition cut on shifts, limiter).
//  - AI cars (AI 대전): one engine voice per AI F1, placed by distance and
//    direction from the player, with Doppler pitch shift.
//  - Wind: road / air noise rising with speed (effects bus).
//  - Tyres: band-passed noise when sliding past the grip limit or braking
//    hard at speed.
//  - Shift: short metallic "clunk" (the engine voice adds its own cut).
//  - Crash: noise burst + thump scaled by wall impact speed.
//  - Explosion: long roar + deep boom when the car blows up.
// The AudioContext is created on the first Play (browsers only allow audio
// after a user gesture). M toggles mute (remembered per browser).
//
// Volume: three sliders (전체 / 엔진 / 효과음, 0-100 %) kept per browser.
// Engine voices (player and AI) go through the engine bus, wind / tyres /
// shifts / crashes through the effects bus; both feed the master gain and
// a limiter that stops loud moments from clipping.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Audio = { muted: false, volume: { master: 0.8, engine: 1, sfx: 1 } };
  var MUTE_KEY = 'circuit-racer.muted';
  var VOLUME_KEY = 'f1-champion.volume';
  // Master gain at 100 %. The default 80 % gives the old fixed level (0.5).
  var MAX_GAIN = 0.78;
  var SMOOTH = 0.03; // s, time constant for per-frame parameter changes

  var ac = null, master = null, noiseBuffer = null;
  var engineBus = null, sfxBus = null;
  var listeners = [];
  var engine = null; // nodes for the current car's engine
  var tyre = null;

  try { Audio.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage unavailable */ }
  try {
    var saved = JSON.parse(localStorage.getItem(VOLUME_KEY));
    if (saved) ['master', 'engine', 'sfx'].forEach(function (k) {
      if (typeof saved[k] === 'number' && isFinite(saved[k])) Audio.volume[k] = Math.max(0, Math.min(1, saved[k]));
    });
  } catch (e) { /* storage unavailable or bad data */ }

  // Slider position -> gain. Squared so the slider feels even to the ear.
  function curve(v) { return v * v; }
  function masterLevel() { return Audio.muted ? 0 : MAX_GAIN * curve(Audio.volume.master); }

  function applyVolume() {
    if (!ac) return;
    set(master.gain, masterLevel());
    set(engineBus.gain, curve(Audio.volume.engine));
    set(sfxBus.gain, curve(Audio.volume.sfx));
  }
  function changed() {
    applyVolume();
    listeners.forEach(function (fn) { try { fn(Audio.volume, Audio.muted); } catch (e) { /* ignore */ } });
  }

  function ensureContext() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return true;
    }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = masterLevel();
    var limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter).connect(ac.destination);
    engineBus = ac.createGain();
    engineBus.gain.value = curve(Audio.volume.engine);
    engineBus.connect(master);
    sfxBus = ac.createGain();
    sfxBus.gain.value = curve(Audio.volume.sfx);
    sfxBus.connect(master);

    // 2 s of white noise, shared by tyres and shift clunks.
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    buildTyre();
    return true;
  }

  function set(param, value) {
    param.setTargetAtTime(value, ac.currentTime, SMOOTH);
  }

  // --- Engine (engine-sound.js voices) ---------------------------------------

  function stopEngine() {
    if (!engine) return;
    engine.stop(ac.currentTime);
    engine = null;
  }

  // --- Wind / road noise --------------------------------------------------------

  var wind = null;

  // --- AI cars (AI 대전) ----------------------------------------------------------
  // Each AI F1 gets its own engine voice, heard from the player's car:
  //  - distance: quieter and duller further away (air absorbs the highs),
  //    a little duller again when it is behind you;
  //  - direction: panned left/right relative to the player's heading;
  //  - Doppler: pitch rises while a car closes in and drops as it pulls
  //    away, f' = f (c + v_listener) / (c - v_source), c = 343 m/s.
  // AI cars have no gearbox of their own, so a virtual 8-speed box turns
  // their speed into rpm, and their speed change into throttle / brake.

  var SPEED_OF_SOUND = 343;
  var AI_GEARS = 8, AI_VMAX = 97;
  var aiVoices = []; // {car, eng, lp, pan, gain, gear, prevV, thr, brk, rf}

  function aiGearTop(g) { return AI_VMAX * Math.pow(g / AI_GEARS, 0.78); }

  function buildAiVoice(car) {
    var gain = ac.createGain();
    gain.gain.value = 0;
    var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;
    lp.Q.value = 0.5;
    lp.connect(gain);
    if (pan) gain.connect(pan).connect(engineBus); else gain.connect(engineBus);
    return {
      car: car, lp: lp, pan: pan, gain: gain,
      eng: CR.EngineSound.create(ac, 'f1', lp, { remote: true }),
      gear: 1, prevV: car.v, thr: 0, brk: 0, rf: 0, accel: 0,
      wobble: Math.random() * 10,
    };
  }

  function stopAi() {
    if (!aiVoices.length) return;
    var t = ac.currentTime;
    aiVoices.forEach(function (a) {
      a.gain.gain.setTargetAtTime(0, t, 0.05);
      a.eng.stop(t);
    });
    aiVoices = [];
  }

  function updateAi(dt) {
    var R = CR.Race;
    var cars = R && R.active ? R.ai : [];
    if (aiVoices.length && (aiVoices.length !== cars.length || aiVoices[0].car !== cars[0])) stopAi();
    if (!cars.length) return;
    if (!aiVoices.length) aiVoices = cars.map(buildAiVoice);

    var c = CR.Car.state, t = ac.currentTime;
    var fx = Math.cos(c.heading), fy = Math.sin(c.heading); // player forward
    var lx = -fy, ly = fx; // player left
    var lights = R.phase === 'lights';

    for (var i = 0; i < aiVoices.length; i++) {
      var a = aiVoices[i], o = a.car;

      // Engine state from the AI's motion.
      var acc = dt > 0 ? (o.v - a.prevV) / dt : 0;
      a.prevV = o.v;
      a.accel += (acc - a.accel) * Math.min(1, dt * 6);
      var thrT, brkT;
      if (lights) {
        // Waiting on the grid: holding revs, blipping now and then.
        a.wobble += dt;
        thrT = 0.25 + 0.2 * Math.max(0, Math.sin(a.wobble * 2.3));
        brkT = 0;
        a.rf += (0.42 + 0.12 * Math.sin(a.wobble * 2.3) - a.rf) * Math.min(1, dt * 5);
      } else {
        thrT = a.accel > 0.4 ? 1 : a.accel > -1.5 ? 0.35 : 0;
        brkT = a.accel < -5 ? 1 : 0;
        var prevGear = a.gear;
        while (a.gear < AI_GEARS && o.v > aiGearTop(a.gear) * 0.965) a.gear++;
        while (a.gear > 1 && o.v < aiGearTop(a.gear - 1) * 0.82) a.gear--;
        if (a.gear !== prevGear) a.eng.shift(t, a.gear > prevGear);
        var target = Math.min(1, o.v / aiGearTop(a.gear));
        if (a.gear === 1 && o.v < aiGearTop(1) * 0.6) target = Math.max(target, 0.55 * thrT); // launch slip
        a.rf += (target - a.rf) * Math.min(1, dt * 8);
      }
      a.thr += (thrT - a.thr) * Math.min(1, dt * 12);
      a.brk += (brkT - a.brk) * Math.min(1, dt * 12);

      // Where it is relative to the player.
      var rx = o.x - c.x, ry = o.y - c.y;
      var d = Math.max(1, Math.hypot(rx, ry));
      var ux = rx / d, uy = ry / d;
      var svx = (o.tx || 0) * o.v + (o.nx || 0) * (o.laneVel || 0);
      var svy = (o.ty || 0) * o.v + (o.ny || 0) * (o.laneVel || 0);
      var vSource = -(svx * ux + svy * uy); // source speed towards the player
      var vListener = c.vx * ux + c.vy * uy; // player speed towards the source
      var dop = (SPEED_OF_SOUND + vListener) / (SPEED_OF_SOUND - vSource);
      dop = Math.max(0.7, Math.min(1.45, dop));

      a.eng.update({ rpmFrac: a.rf, throttle: a.thr, brake: a.brk, speed: o.v, limiter: false, pitch: dop }, t);

      var ahead = ux * fx + uy * fy; // +1 in front, -1 behind
      var side = -(ux * lx + uy * ly); // +1 right, -1 left
      var level = 0.75 / (1 + Math.pow(d / 14, 1.35));
      if (d > 450) level = 0;
      set(a.gain.gain, level);
      set(a.lp.frequency, Math.max(900, 15000 / (1 + d / 35)) * (ahead < 0 ? 0.6 + 0.4 * (1 + ahead) : 1));
      if (a.pan) set(a.pan.pan, Math.max(-0.85, Math.min(0.85, side * Math.min(1, d / 6))));
    }
  }

  // --- Tyres ------------------------------------------------------------------

  function buildTyre() {
    var src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500;
    band.Q.value = 7;
    var band2 = ac.createBiquadFilter();
    band2.type = 'bandpass';
    band2.frequency.value = 3000;
    band2.Q.value = 5;
    var gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(band).connect(gain);
    src.connect(band2).connect(gain);
    gain.connect(sfxBus);
    src.start();
    tyre = { band: band, band2: band2, gain: gain };
  }

  // --- Public API -------------------------------------------------------------

  // Called on Play: (re)creates the engine for the chosen car.
  Audio.startEngine = function (car) {
    if (!ensureContext()) return;
    stopEngine();
    engine = CR.EngineSound.create(ac, car.id, engineBus);
    if (!wind) wind = CR.EngineSound.createWind(ac, sfxBus);
  };

  // Called when leaving the race (menu): fade everything out.
  Audio.silence = function () {
    if (!ac) return;
    stopEngine();
    stopAi();
    if (wind) { wind.stop(ac.currentTime); wind = null; }
    set(tyre.gain.gain, 0);
  };

  // Per-frame update from main.js while playing.
  var lastUpdate = 0;
  Audio.update = function () {
    if (!ac) return;
    // Results / menu can begin inside this same frame, after silence().
    if (CR.Main && CR.Main.state !== 'playing') return;
    var now = ac.currentTime, dt = lastUpdate ? Math.min(0.1, Math.max(0, now - lastUpdate)) : 1 / 60;
    lastUpdate = now;
    updateAi(dt);
    if (!engine) return;
    var c = CR.Car.state, cfg = CR.Config, input = CR.Input.state;
    var rpmFrac = Math.max(0, Math.min(1, (c.rpm - cfg.IDLE_RPM) / (cfg.REDLINE_RPM - cfg.IDLE_RPM)));
    var throttle = c.coasting ? 0 : input.throttle;

    engine.update({
      rpmFrac: rpmFrac,
      throttle: throttle,
      brake: input.brake || 0,
      speed: c.speed,
      limiter: c.rpm >= cfg.REDLINE_RPM - 60 && throttle > 0,
    }, now);
    if (wind) wind.update(c.speed, now);

    // Tyre squeal: sideways slide past the grip limit, or hard braking at speed.
    var slide = Math.min(1, Math.max(0, Math.abs(c.lateralVelocity) - 1.2) / 4);
    var lockup = input.brake > 0 && c.speed > 25 ? 0.45 * Math.min(1, (c.speed - 25) / 30) : 0;
    var screech = Math.max(slide, lockup);
    set(tyre.gain.gain, 0.32 * screech);
    set(tyre.band.frequency, 1200 + 500 * screech + Math.random() * 250);
    set(tyre.band2.frequency, 2600 + 800 * screech + Math.random() * 400);
  };

  // Gear change: metallic clunk + brief engine dip.
  Audio.shift = function (up) {
    if (!ac || !engine) return;
    var t = ac.currentTime;
    engine.shift(t, up !== false);

    var click = ac.createBufferSource();
    click.buffer = noiseBuffer;
    var clickBand = ac.createBiquadFilter();
    clickBand.type = 'bandpass';
    clickBand.frequency.value = 2200;
    clickBand.Q.value = 3;
    var clickGain = ac.createGain();
    clickGain.gain.setValueAtTime(0.35, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    click.connect(clickBand).connect(clickGain).connect(sfxBus);
    click.start(t, Math.random() * 1.5, 0.06);

    var thunk = ac.createOscillator();
    thunk.type = 'square';
    thunk.frequency.setValueAtTime(140, t);
    thunk.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    var thunkFilter = ac.createBiquadFilter();
    thunkFilter.type = 'lowpass';
    thunkFilter.frequency.value = 600;
    var thunkGain = ac.createGain();
    thunkGain.gain.setValueAtTime(0.18, t);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    thunk.connect(thunkFilter).connect(thunkGain).connect(sfxBus);
    thunk.start(t);
    thunk.stop(t + 0.12);

  };

  // Wall impact: low noise burst + thump, louder for harder hits.
  Audio.crash = function (impact) {
    if (!ac) return;
    var t = ac.currentTime;
    var level = Math.min(1, impact / 30);

    var src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + 1500 * level;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.25 + 0.6 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + 0.35 * level);
    src.connect(lp).connect(g).connect(sfxBus);
    src.start(t, Math.random() * 1.2, 0.7);

    var thump = ac.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90, t);
    thump.frequency.exponentialRampToValueAtTime(35, t + 0.2);
    var tg = ac.createGain();
    tg.gain.setValueAtTime(0.5 * level + 0.15, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    thump.connect(tg).connect(sfxBus);
    thump.start(t);
    thump.stop(t + 0.3);
  };

  // Explosion: long low noise roar + deep boom.
  Audio.explode = function () {
    if (!ac) return;
    var t = ac.currentTime;
    var src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2500, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.6);
    var g = ac.createGain();
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    src.connect(lp).connect(g).connect(sfxBus);
    src.start(t, 0, 1.9);

    var boom = ac.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(70, t);
    boom.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    var bg = ac.createGain();
    bg.gain.setValueAtTime(1.0, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    boom.connect(bg).connect(sfxBus);
    boom.start(t);
    boom.stop(t + 1);
  };

  Audio.setMuted = function (on) {
    Audio.muted = !!on;
    try { localStorage.setItem(MUTE_KEY, Audio.muted ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    changed();
    return Audio.muted;
  };
  Audio.toggleMute = function () {
    var m = Audio.setMuted(!Audio.muted);
    if (CR.Hud && CR.Hud.flash && document.body && !document.body.classList.contains('in-menu')) {
      CR.Hud.flash(m ? '소리 꺼짐' : '소리 켜짐', 'is-lap');
    }
    return m;
  };

  // kind: 'master' | 'engine' | 'sfx', value 0..1. Moving a slider up while
  // muted turns the sound back on.
  Audio.setVolume = function (kind, value) {
    if (!(kind in Audio.volume)) return;
    Audio.volume[kind] = Math.max(0, Math.min(1, +value || 0));
    if (Audio.muted && value > 0) {
      Audio.muted = false;
      try { localStorage.setItem(MUTE_KEY, '0'); } catch (e) { /* storage unavailable */ }
    }
    try { localStorage.setItem(VOLUME_KEY, JSON.stringify(Audio.volume)); } catch (e) { /* storage unavailable */ }
    changed();
  };

  // Called with (volume, muted) whenever a slider or mute changes.
  Audio.onChange = function (fn) { listeners.push(fn); };

  // Short sample sound for a slider, so the level can be judged in the menu.
  // Runs from the slider's own touch/click, so the AudioContext may start here.
  Audio.preview = function (kind) {
    if (!ensureContext()) return;
    var t = ac.currentTime + 0.01;
    if (kind === 'engine') {
      var o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(210, t + 0.22);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.45);
      var lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(lp).connect(g).connect(engineBus);
      o.start(t);
      o.stop(t + 0.55);
    } else {
      var click = ac.createBufferSource();
      click.buffer = noiseBuffer;
      var band = ac.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2200;
      band.Q.value = 3;
      var cg = ac.createGain();
      cg.gain.setValueAtTime(0.7, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      click.connect(band).connect(cg).connect(kind === 'sfx' ? sfxBus : master);
      click.start(t, Math.random() * 1.5, 0.07);
    }
  };

  // Current gains (for tests / debugging).
  Audio.levels = function () {
    if (!ac) return null;
    return {
      master: master.gain.value, engine: engineBus.gain.value, sfx: sfxBus.gain.value, player: !!engine,
      ai: aiVoices.map(function (a) { return { gain: a.gain.gain.value, cutoff: a.lp.frequency.value, rf: a.rf, gear: a.gear }; }),
    };
  };

  CR.Audio = Audio;
})();

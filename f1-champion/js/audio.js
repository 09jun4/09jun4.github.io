// audio.js — synthesized sound (Web Audio, no sound files).
// Load order: after hud.js, before menu.js. Depends on: Config, Car (at call time).
//
//  - Engine: per-car voice (cars.js `sound`). Pitch follows the firing
//    frequency rpm/60 * cylinders/2; a low-pass filter opens with throttle
//    and rpm. In the red rpm zone (same threshold the HUD bar turns red) a
//    distorted copy is mixed in, and at the rev limiter the sound stutters.
//  - Tyres: band-passed noise when sliding past the grip limit or braking
//    hard at speed.
//  - Shift: short metallic "clunk" plus a brief engine dip.
//  - Crash: noise burst + thump scaled by wall impact speed.
//  - Explosion: long roar + deep boom when the car blows up.
// The AudioContext is created on the first Play (browsers only allow audio
// after a user gesture). M toggles mute (remembered per browser).
//
// Volume: three sliders (전체 / 엔진 / 효과음, 0-100 %) kept per browser.
// Engine voices go through the engine bus, tyres / shifts / crashes through
// the effects bus; both feed the master gain and a limiter that stops loud
// moments from clipping when the master is turned up.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Audio = { muted: false, volume: { master: 0.8, engine: 1, sfx: 1 } };
  var MUTE_KEY = 'circuit-racer.muted';
  var VOLUME_KEY = 'f1-champion.volume';
  // Master gain at 100 %. The default 80 % gives the old fixed level (0.5).
  var MAX_GAIN = 0.78;
  var RED_ZONE_START = 0.85; // rpm fraction where the HUD bar turns red (hud.js)
  var SMOOTH = 0.03; // s, time constant for per-frame parameter changes

  var ac = null, master = null, noiseBuffer = null;
  var engineBus = null, sfxBus = null;
  var listeners = [];
  var engine = null; // nodes for the current car's engine
  var tyre = null;
  var duckUntil = 0;

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

  // Soft-clip curve for the red-zone rasp.
  function distortionCurve(amount) {
    var n = 1024, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
  }

  // --- Engine ---------------------------------------------------------------

  function buildEngine(voice) {
    var e = { voice: voice, oscs: [], oscGains: [] };

    var mix = ac.createGain();
    for (var i = 0; i < voice.waves.length; i++) {
      var o = ac.createOscillator();
      o.type = voice.waves[i];
      var g = ac.createGain();
      g.gain.value = voice.mix[i];
      o.connect(g).connect(mix);
      e.oscs.push(o);
      e.oscGains.push(g);
    }
    e.sub = ac.createOscillator();
    e.sub.type = 'sine';
    var subGain = ac.createGain();
    subGain.gain.value = voice.sub;
    e.sub.connect(subGain).connect(mix);

    // Clean and distorted paths, crossfaded by the red-zone amount.
    e.clean = ac.createGain();
    e.dist = ac.createGain();
    e.dist.gain.value = 0;
    var shaper = ac.createWaveShaper();
    shaper.curve = distortionCurve(12);
    mix.connect(e.clean);
    mix.connect(shaper).connect(e.dist);

    e.filter = ac.createBiquadFilter();
    e.filter.type = 'lowpass';
    e.filter.Q.value = voice.q;
    e.clean.connect(e.filter);
    e.dist.connect(e.filter);

    // Amplitude modulation: V8 lope (follows rpm) + rev-limiter stutter.
    e.am = ac.createGain();
    e.am.gain.value = 1;
    e.rumble = ac.createOscillator();
    e.rumble.type = 'sine';
    e.rumbleDepth = ac.createGain();
    e.rumbleDepth.gain.value = 0;
    e.rumble.connect(e.rumbleDepth).connect(e.am.gain);
    e.stutter = ac.createOscillator();
    e.stutter.type = 'square';
    e.stutter.frequency.value = 18;
    e.stutterDepth = ac.createGain();
    e.stutterDepth.gain.value = 0;
    e.stutter.connect(e.stutterDepth).connect(e.am.gain);
    e.filter.connect(e.am);

    e.out = ac.createGain();
    e.out.gain.value = 0;
    e.am.connect(e.out).connect(engineBus);

    // Turbo whistle (only voices with turbo > 0 make it audible).
    e.turbo = ac.createOscillator();
    e.turbo.type = 'sine';
    e.turboGain = ac.createGain();
    e.turboGain.gain.value = 0;
    e.turbo.connect(e.turboGain).connect(engineBus);

    e.oscs.concat([e.sub, e.rumble, e.stutter, e.turbo]).forEach(function (o) { o.start(); });
    e.all = e.oscs.concat([e.sub, e.rumble, e.stutter, e.turbo]);
    return e;
  }

  function stopEngine() {
    if (!engine) return;
    var old = engine;
    engine = null;
    old.out.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    old.turboGain.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    var t = ac.currentTime + 0.4;
    old.all.forEach(function (o) { o.stop(t); });
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
    engine = buildEngine(car.sound);
  };

  // Called when leaving the race (menu): fade everything out.
  Audio.silence = function () {
    if (!ac) return;
    stopEngine();
    set(tyre.gain.gain, 0);
  };

  // Per-frame update from main.js while playing.
  Audio.update = function () {
    if (!ac || !engine) return;
    var c = CR.Car.state, cfg = CR.Config, input = CR.Input.state, v = engine.voice;
    var rpmFrac = Math.max(0, Math.min(1, (c.rpm - cfg.IDLE_RPM) / (cfg.REDLINE_RPM - cfg.IDLE_RPM)));
    var throttle = input.throttle;

    var fire = (c.rpm / 60) * (v.cylinders / 2) * v.pitch;
    for (var i = 0; i < engine.oscs.length; i++) set(engine.oscs[i].frequency, fire * v.ratios[i]);
    set(engine.sub.frequency, fire * 0.5);
    set(engine.rumble.frequency, c.rpm / 120);
    set(engine.rumbleDepth.gain, v.rumble * (1 - rpmFrac * 0.7));

    var cutoff = v.cutoff[0] + (v.cutoff[1] - v.cutoff[0]) * (0.35 * rpmFrac + 0.65 * rpmFrac * throttle);
    set(engine.filter.frequency, cutoff);

    // Red zone: crossfade to the distorted path; stutter at the limiter.
    var red = Math.max(0, (rpmFrac - RED_ZONE_START) / (1 - RED_ZONE_START));
    set(engine.clean.gain, 1 - 0.7 * red);
    set(engine.dist.gain, 0.55 * red);
    set(engine.stutterDepth.gain, c.rpm >= cfg.REDLINE_RPM - 60 && throttle > 0 ? 0.55 : 0);

    var vol = 0.16 + 0.22 * throttle + 0.14 * rpmFrac;
    if (ac.currentTime < duckUntil) vol *= 0.45;
    set(engine.out.gain, vol);

    set(engine.turbo.frequency, 1800 + 4200 * rpmFrac);
    set(engine.turboGain.gain, v.turbo * throttle * rpmFrac);

    // Tyre squeal: sideways slide past the grip limit, or hard braking at speed.
    var slide = Math.min(1, Math.max(0, Math.abs(c.lateralVelocity) - 1.2) / 4);
    var lockup = input.brake > 0 && c.speed > 25 ? 0.45 * Math.min(1, (c.speed - 25) / 30) : 0;
    var screech = Math.max(slide, lockup);
    set(tyre.gain.gain, 0.32 * screech);
    set(tyre.band.frequency, 1200 + 500 * screech + Math.random() * 250);
    set(tyre.band2.frequency, 2600 + 800 * screech + Math.random() * 400);
  };

  // Gear change: metallic clunk + brief engine dip.
  Audio.shift = function () {
    if (!ac || !engine) return;
    var t = ac.currentTime;

    var click = ac.createBufferSource();
    click.buffer = noiseBuffer;
    var clickBand = ac.createBiquadFilter();
    clickBand.type = 'bandpass';
    clickBand.frequency.value = 2200;
    clickBand.Q.value = 3;
    var clickGain = ac.createGain();
    clickGain.gain.setValueAtTime(0.7, t);
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
    thunkGain.gain.setValueAtTime(0.35, t);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    thunk.connect(thunkFilter).connect(thunkGain).connect(sfxBus);
    thunk.start(t);
    thunk.stop(t + 0.12);

    duckUntil = t + 0.12;
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
    return { master: master.gain.value, engine: engineBus.gain.value, sfx: sfxBus.gain.value };
  };

  CR.Audio = Audio;
})();

// main.js — game state, car + track setup, rAF loop.
// Load order: last. Depends on: all other CR.* modules.
//
// States: 'menu' (start screen / shop), 'playing', 'paused' (Esc overlay).
// raceActive stays true while a race is paused or the shop is open over it,
// so it can be resumed; endRace() clears it and all lap records.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Main = {
    state: 'menu', // 'menu' | 'playing' | 'paused' | 'results' (AI 대전 over, results screens)
    mode: 'practice', // 'practice' | 'race' (AI 대전)
    raceActive: false,
    trackIndex: -1,
  };

  var canvas, ctx;
  var lastTime = 0;

  // Config as authored, before the car's physics and upgrades.
  var baseConfig = Object.assign({}, CR.Config);

  // Adaptive resolution: the canvas backing store is scaled by renderScale
  // (0.5..1). If drawing a frame takes too long, the scale steps down; with
  // plenty of headroom it steps back up. The canvas still fills the window
  // (CSS size), so a lower scale only softens the image.
  var renderScale = 1;
  var renderMsAvg = 0, scaleCheckAt = 0;
  var SLOW_FRAME_MS = 11, FAST_FRAME_MS = 5;

  function adaptResolution(renderMs, now) {
    renderMsAvg = renderMsAvg ? renderMsAvg * 0.9 + renderMs * 0.1 : renderMs;
    if (now < scaleCheckAt) return;
    scaleCheckAt = now + 1000; // at most once a second
    var next = renderScale;
    if (renderMsAvg > SLOW_FRAME_MS && renderScale > 0.5) next = Math.max(0.5, renderScale - 0.15);
    else if (renderMsAvg < FAST_FRAME_MS && renderScale < 1) next = Math.min(1, renderScale + 0.1);
    if (next !== renderScale) {
      renderScale = next;
      resizeCanvas();
    }
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, CR.Config.MAX_DEVICE_PIXEL_RATIO) * renderScale;
    var cssWidth = window.innerWidth;
    var cssHeight = window.innerHeight;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // Pre-scale the context once so all drawing code (renderer.js, camera.js)
    // can work purely in CSS pixels regardless of backing-store resolution.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Resets CR.Config to the authored values, then applies a car's physics
  // (default: the selected car) and the global handling boosts.
  // `levels` (optional) overrides the saved tuning, e.g. for stat previews.
  Main.applyCar = function (car, levels) {
    car = car || CR.Garage.car();
    for (var k in baseConfig) CR.Config[k] = baseConfig[k];
    Object.assign(CR.Config, CR.Tuning.physics(car, levels));
    CR.Config.STEER_RESPONSE_RATE *= CR.Config.STEER_RESPONSE_BOOST;
    CR.Config.TIRE_GRIP_TARMAC *= CR.Config.GRIP_BOOST;
    CR.Car.def = car;
  };

  // Stats of any car for the shop. Leaves CR.Config set for the selected car.
  Main.measureCar = function (car, levels) {
    Main.applyCar(car, levels);
    var stats = CR.Car.measureStats();
    Main.applyCar();
    return stats;
  };

  function hideOverlays() {
    CR.Hud.hideRetired();
    CR.Hud.hidePause();
    retireOverlayIn = -1;
  }

  function enterPlaying() {
    Main.state = 'playing';
    CR.Menu.hide();
    hideOverlays();
    document.body.classList.remove('in-menu');
    CR.Input.clear();
  }

  // Play: the circuit chosen in the menu, or a random one (never the same one twice in a
  // row), fresh lap records, car on the start line.
  function pickTrack() {
    var tracks = CR.Tracks.list;
    var pick = CR.Garage.trackIndex(CR.Garage.track);
    if (pick < 0) {
      pick = Math.floor(Math.random() * tracks.length);
      if (pick === Main.trackIndex && tracks.length > 1) pick = (pick + 1) % tracks.length;
    }
    Main.trackIndex = pick;
    return pick;
  }

  // AI 대전: 3 laps against five AI F1s, from P3, in the player's own
  // (tuned) F1. Needs UNLOCK_F1_LAPS laps in the F1 first.
  Main.startRace = function () {
    if (!CR.Race.canEnter()) return;
    // Always random, never a circuit already raced this season.
    var tracks = CR.Tracks.list, pool = CR.Garage.seasonTrackPool();
    var pick = pool[Math.floor(Math.random() * pool.length)];
    Main.trackIndex = pick;
    if (CR.Race.active) CR.Race.end();
    CR.Race.start(pick, CR.Garage.raceDifficulty);
    CR.Renderer.resetEffects();
    CR.Car.events.length = 0;
    Main.mode = 'race';
    Main.raceActive = true;
    resultsIn = -1;
    enterPlaying();
    CR.RaceUI.setRaceHud(true);
    CR.Audio.startEngine(CR.Car.def);
    CR.Minimap.setTrack();
    CR.Hud.showTrack(pick + 1, tracks.length, tracks[pick].name, 'AI 대전 · ' + CR.Race.difficulty.name + ' · ' + CR.Race.LAPS + '랩 · P' + CR.Race.PLAYER_GRID + ' 출발');
  };

  // Leaves a finished AI 대전 for the menu (results screens closed).
  Main.leaveRace = function () {
    CR.Race.end();
    CR.RaceUI.setRaceHud(false);
    Main.mode = 'practice';
    Main.raceActive = false;
    CR.Laps.reset(false);
    CR.Car.state.coasting = false;
    CR.Car.state.autopilot = false;
    Main.toGarage();
    CR.Menu.showTab('race');
  };

  Main.start = function () {
    var tracks = CR.Tracks.list;
    if (CR.Race.active) CR.Race.end();
    Main.mode = 'practice';
    CR.RaceUI.setRaceHud(false);
    Main.applyCar();

    var pick = pickTrack();

    // Build after applying the car: corner colours depend on its grip.
    CR.Track.buildTrack(tracks[pick].segments);
    CR.Car.spawnAtTrackStart();
    CR.Renderer.resetEffects();
    CR.Laps.reset(false); // new race: no lap records, no best lap
    CR.Car.events.length = 0;
    Main.raceActive = true;
    enterPlaying();
    if (!CR.Car.state.retired) CR.Audio.startEngine(CR.Car.def);
    CR.Minimap.setTrack(); // after un-hiding, so the canvas has its size
    CR.Hud.showTrack(pick + 1, tracks.length, tracks[pick].name, '연습 · ' + CR.Car.def.name);
    CR.RaceUI.showRecord(tracks[pick].realName);
  };

  // Back from the shop into the paused race, in the selected car (it may
  // have changed; the track is rebuilt so corner colours match its grip).
  Main.resume = function () {
    if (!Main.raceActive) return;
    if (Main.state === 'menu') {
      Main.applyCar();
      CR.Track.buildTrack(CR.Tracks.list[Main.trackIndex].segments);
    }
    enterPlaying();
    CR.Minimap.setTrack();
    if (CR.Car.state.retired) CR.Hud.showRetired();
    else CR.Audio.startEngine(CR.Car.def);
  };

  // Esc during a race: freeze everything and show the pause overlay.
  Main.pause = function () {
    if (Main.state !== 'playing') return;
    Main.state = 'paused';
    CR.Audio.silence();
    CR.Hud.showPause();
  };

  // Pause overlay -> 메뉴로 돌아가기: the shop, race kept for resuming.
  Main.toGarage = function () {
    Main.state = 'menu';
    document.body.classList.add('in-menu');
    hideOverlays();
    CR.Audio.silence();
    CR.Menu.show();
  };

  // Pause overlay / shop -> 레이스 종료하기: drop the race and all its lap
  // records and go back to the start screen.
  Main.endRace = function () {
    if (CR.Race.active) {
      // AI 대전: forfeit = classified last; the results follow.
      CR.Race.forfeit();
      CR.Hud.hidePause();
      CR.Car.state.coasting = true;
      Main.state = 'playing';
      return;
    }
    Main.raceActive = false;
    CR.Laps.reset(false);
    Main.toGarage();
  };

  // Same track, from the start line: fresh car and lap times.
  // Offered (R key / button) once the car has retired.
  Main.restart = function () {
    if (CR.Race.active) return; // a retirement ends an AI 대전
    CR.Car.spawnAtTrackStart();
    CR.Renderer.resetEffects();
    CR.Input.clear();
    CR.Laps.reset(true); // same race: keep its best lap
    CR.Audio.startEngine(CR.Car.def);
    hideOverlays();
    CR.Car.events.length = 0;
    Main.state = 'playing';
  };

  // Crash / explosion events from car.js -> audio, effects, HUD. The
  // RETIRED screen appears RETIRE_OVERLAY_DELAY s after an explosion.
  var retireOverlayIn = -1;
  function handleCarEvents(dt) {
    var ev = CR.Car.events;
    for (var i = 0; i < ev.length; i++) {
      if (ev[i].type === 'bump') {
        CR.Audio.crash(ev[i].impact);
      } else if (ev[i].type === 'explode') {
        CR.Audio.silence();
        CR.Audio.explode();
        CR.Renderer.explode(CR.Car.state);
        retireOverlayIn = CR.Config.RETIRE_OVERLAY_DELAY;
      }
    }
    ev.length = 0;
    if (retireOverlayIn >= 0) {
      retireOverlayIn -= dt;
      if (retireOverlayIn < 0 && !CR.Race.active) CR.Hud.showRetired();
    }
  }

  // AI 대전 over (flag or retirement): results a moment later.
  var resultsIn = -1;
  function handleRaceEvents(dt) {
    var ev = CR.Race.events;
    for (var i = 0; i < ev.length; i++) {
      // finish: swing to the front shot (0.8 s), then ~2 s of it
      resultsIn = ev[i].type === 'retire' ? CR.Config.RETIRE_OVERLAY_DELAY + 0.4 : 2.8;
      if (ev[i].type === 'finish') CR.Hud.flash('체커기! P' + CR.Race.results.playerPos, 'is-best');
    }
    ev.length = 0;
    if (resultsIn >= 0) {
      resultsIn -= dt;
      if (resultsIn < 0) {
        Main.state = 'results';
        CR.Audio.silence();
        var record = CR.Garage.recordRace(CR.Race.results);
        CR.RaceUI.showResults(CR.Race.results, record);
      }
    }
  }

  // A notice after the lap notice (hud.js) has had its moment.
  function flashLater(text) {
    setTimeout(function () { CR.Hud.flash(text, 'is-best'); }, 2300);
  }

  // Pay for every completed lap (the HUD notice reads ev.money).
  function handleLapEvents() {
    var ev = CR.Laps.events;
    for (var i = 0; i < ev.length; i++) {
      if (ev[i].type === 'lap') {
        ev[i].money = CR.Garage.payLap(ev[i].value, CR.Track.length, ev[i].best);
        CR.Hud.moneyPop();
        var trackId = CR.Tracks.list[Main.trackIndex].realName;
        var practice = !CR.Race.active;
        var rec = CR.Garage.recordLap(CR.Car.def.id, trackId, ev[i].value, practice);
        if (practice) CR.RaceUI.showRecord(trackId);
        if (rec.unlocked) flashLater('AI 대전 입장권 획득! 메뉴의 AI 대전 탭에서 도전하세요');
        else if (rec.record) flashLater('연습 트랙 신기록! ' + CR.Laps.format(ev[i].value));
        if (CR.Race.active) CR.Race.onPlayerLap(CR.Laps.history.length);
      }
    }
  }

  function frame(now) {
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.min(Math.max(dt, 0), 0.05); // clamp: avoid huge steps, avoid dt<=0

    if (Main.state === 'playing' || Main.state === 'results') {
      var onGrid = CR.Race.active && CR.Race.phase === 'lights';
      if (!onGrid) {
        if (CR.Input.autoShift || CR.Car.state.autopilot) CR.Car.autoShift();
        CR.Car.update(dt);
        if (!(CR.Race.active && CR.Race.phase === 'done')) CR.Laps.update(dt);
      }
      CR.Race.update(dt);
      handleLapEvents();
      handleCarEvents(dt);
      handleRaceEvents(dt);
      CR.Camera.update(dt);
      // Finish shot: hide controls and help that would cover the car.
      document.body.classList.toggle('finish-shot', !!CR.Car.state.autopilot);
      var t0 = performance.now();
      CR.Renderer.render(ctx, canvas, dt);
      adaptResolution(performance.now() - t0, now);
      CR.Hud.update();
      CR.Hud.updateLaps();
      CR.RaceUI.update(dt);
      CR.Minimap.update();
      CR.Audio.update();
    } else if (Main.state === 'paused') {
      CR.Renderer.render(ctx, canvas, 0); // frozen frame behind the overlay
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('DOMContentLoaded', function () {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    CR.Input.init();
    CR.Input.initTouch();
    CR.TouchGuard.init();
    CR.Hud.cacheElements();
    CR.Minimap.init();
    CR.RaceUI.init();
    CR.Menu.init();
    Main.toGarage();

    requestAnimationFrame(function (t) {
      lastTime = t;
      requestAnimationFrame(frame);
    });
  });

  CR.Main = Main;
})();

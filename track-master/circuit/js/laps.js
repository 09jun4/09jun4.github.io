// laps.js — lap timing and track-limit penalties.
// Load order: after car.js. Depends on: Config, Track, Car.
//
// Progress is counted in track samples: every frame adds the (wrapped)
// change of the car's nearest sample index, so driving backwards subtracts
// and an R reset (which moves to the nearest sample) doesn't skip ahead. A
// lap completes each time progress reaches one full lap past the start line.
// The clock starts when the car first moves. A car completely beyond a white
// line gets TRACK_LIMIT_PENALTY seconds added to the current lap, once per
// excursion (re-armed when its centre is back inside the line).
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Laps = {
    lap: 1,
    time: 0, // s on the clock this lap, penalties excluded
    penalty: 0, // s of penalties this lap
    last: null, // s, previous lap incl. penalties
    best: null, // s, best lap of this game (cleared on every Play)
    started: false,
    history: [], // completed laps in order: {time, penalty} (time includes penalty)
    events: [], // {type: 'penalty'|'lap'|'best', value, ...} for main.js / HUD, drained each frame
  };

  var progress = 0, prevIndex = 0, penaltyArmed = true;

  // Clears the lap clock and history. The best lap is cleared too unless
  // keepBest (restarting after an explosion keeps this game's best).
  // startProgress (samples, <= 0): where the car starts relative to the
  // start line, e.g. a grid slot behind it, so lap 1 ends on the line.
  Laps.reset = function (keepBest, startProgress) {
    Laps.lap = 1;
    Laps.time = 0;
    Laps.penalty = 0;
    Laps.last = null;
    Laps.started = false;
    Laps.history = [];
    Laps.events.length = 0;
    progress = startProgress || 0;
    prevIndex = CR.Car.state.nearestSampleIndex;
    penaltyArmed = true;
    if (!keepBest) Laps.best = null;
  };

  // Samples driven this lap (negative on the grid, before the line).
  Laps.progress = function () { return progress; };

  Laps.current = function () {
    return Laps.time + Laps.penalty;
  };

  Laps.update = function (dt) {
    var c = CR.Car.state, n = CR.Track.samples.length;
    if (!Laps.started && c.speed > 0.5) Laps.started = true;
    if (!Laps.started || c.retired) return; // clock stops on retirement
    Laps.time += dt;

    // Track limits.
    if (c.beyondTrackLimit && penaltyArmed) {
      Laps.penalty += CR.Config.TRACK_LIMIT_PENALTY;
      penaltyArmed = false;
      Laps.events.push({ type: 'penalty', value: CR.Config.TRACK_LIMIT_PENALTY });
    } else if (!penaltyArmed && c.insideTrackLimit) {
      penaltyArmed = true;
    }

    // Progress around the lap.
    var d = c.nearestSampleIndex - prevIndex;
    if (d > n / 2) d -= n;
    else if (d < -n / 2) d += n;
    progress += d;
    prevIndex = c.nearestSampleIndex;

    if (progress >= n) {
      progress -= n;
      var lapTime = Laps.current();
      var isBest = Laps.best === null || lapTime < Laps.best;
      Laps.last = lapTime;
      Laps.history.push({ time: lapTime, penalty: Laps.penalty });
      // value = lap time incl. penalties (garage.js pays more for quicker laps)
      Laps.events.push({ type: 'lap', value: lapTime, clock: Laps.time, best: isBest });
      if (isBest) {
        Laps.best = lapTime;
        Laps.events.push({ type: 'best', value: lapTime });
      }
      Laps.lap++;
      Laps.time = 0;
      Laps.penalty = 0;
    }
  };

  // m:ss.mmm
  Laps.format = function (s) {
    if (s === null || s === undefined) return '—:——.———';
    var ms = Math.round(s * 1000);
    var m = Math.floor(ms / 60000);
    var rest = (ms % 60000) / 1000;
    return m + ':' + (rest < 10 ? '0' : '') + rest.toFixed(3);
  };

  CR.Laps = Laps;
})();

// race.js — AI 대전: a 3-lap race against five AI F1 cars.
// Load order: after laps.js, before camera.js. Depends on: Config, Cars,
// Garage, Tuning, Track, Car, Laps (and Main/Hud/Audio at call time).
//
// The AI cars are kinematic: each follows the track at a distance `dist`
// (metres from the start line, unwrapped) and a lateral `offset` (+ = left
// of the centreline), at a speed taken from a pace profile — the fastest a
// stock F1 can go at every point (corner speeds from track.js, forward
// pass with the engine, backward pass with the brakes) — divided by the
// difficulty's pace factor. Difficulty factors are relative to that ideal
// lap, calibrated on Monza: Easy ~1:50, Extreme ~1:30 there; other circuits
// scale with their own ideal lap.
// Traffic: an AI that closes on a slower car moves over to pass on the
// side with more room, or follows it. All cars (player included) collide
// as two circles each, with an impulse along the contact normal.
// Start: five red lights come on one by one on the gantry, then go out.
// The player starts P3. The race ends when the player finishes lap 3 (cars
// still running are classified by their projected finish time) or retires
// (classified last). Points per race: 30, 20, 12, 5 for P1-P4.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Race = {
    LAPS: 3,
    PLAYER_GRID: 3, // P3
    POINTS: [30, 20, 12, 5, 0, 0],
    RACES_PER_SEASON: 5,
    UNLOCK_F1_LAPS: 5,
    GRID_SPACING: 8, // m between grid slots
    GRID_LATERAL: 2.6, // m left/right of the centreline
    DIFFICULTIES: [
      { id: 'easy', name: '쉬움', factor: 1.28, desc: '여유 있게 달리는 AI' },
      { id: 'normal', name: '보통', factor: 1.19, desc: '실수 없이 꾸준한 페이스' },
      { id: 'hard', name: '어려움', factor: 1.11, desc: '튜닝과 좋은 라인이 필요' },
      { id: 'extreme', name: '최고난이도', factor: 1.03, desc: '물리 한계에 가까운 랩' },
    ],
    // Fictional drivers and teams (same five every season).
    DRIVERS: [
      { id: 'vas', code: 'VAS', name: '레온 바스케스', team: '벨로시타', main: '#c8102e', dark: '#5e0816', accent: '#f4f7ff' },
      { id: 'hol', code: 'HOL', name: '마커스 홀트', team: '오로라', main: '#0fa3a3', dark: '#06403f', accent: '#ff8a1f' },
      { id: 'nak', code: 'NAK', name: '카이 나카무라', team: '노르트리히트', main: '#c5cad3', dark: '#2a2e35', accent: '#18c0e8' },
      { id: 'mor', code: 'MOR', name: '엘리 모로', team: '블뢰', main: '#1f4fd1', dark: '#0d214f', accent: '#ffd23f' },
      { id: 'san', code: 'SAN', name: '디에고 산토스', team: '베르데', main: '#1e9a52', dark: '#0b3b20', accent: '#f4f7ff' },
    ],
    PLAYER: { id: 'you', code: 'YOU', name: '나', team: '내 팀' },

    active: false,
    phase: 'idle', // 'lights' | 'green' | 'done'
    lightsOn: 0, // red lights lit on the gantry (0..5)
    clock: 0, // s since lights out
    ai: [],
    player: null, // {dist, offset, ...} tracking for the player car
    difficulty: null,
    trackIndex: 0,
    results: null,
    events: [], // {type: 'finish'|'retire'} for main.js
  };

  var n = 0, L = 0; // samples per lap, lap length (m)
  var cum = null; // cumulative distance at each sample
  var profile = null; // ideal stock-F1 speed at each sample (m/s)
  var idealLap = 0; // s
  var lightsTimer = 0, goAt = 0;

  // AI liveries, built once per driver.
  Race.DRIVERS.forEach(function (d) {
    d.color = d.main;
    d.model = CR.Cars.formulaModel({ main: d.main, dark: d.dark, accent: d.accent, helmet: d.accent,
      pod: 0.62, wing: 1.0, rearWing: 1.0, halo: true, fin: true });
  });

  Race.difficultyById = function (id) {
    for (var i = 0; i < Race.DIFFICULTIES.length; i++) if (Race.DIFFICULTIES[i].id === id) return Race.DIFFICULTIES[i];
    return Race.DIFFICULTIES[1];
  };

  Race.unlocked = function () {
    return CR.Garage.f1Laps >= Race.UNLOCK_F1_LAPS;
  };

  // --- Track geometry helpers ------------------------------------------------

  function buildCumulative() {
    var S = CR.Track.samples;
    n = S.length;
    cum = new Float64Array(n + 1);
    for (var i = 1; i <= n; i++) {
      var a = S[i - 1], b = S[i % n];
      cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
    }
    L = cum[n];
  }

  function wrapDist(d) {
    d %= L;
    return d < 0 ? d + L : d;
  }

  // Sample index for a lap distance (hint = last index, searched forward).
  function indexAt(d, hint) {
    var i = hint || 0;
    if (i < 0 || i >= n || cum[i] > d) i = 0;
    var guard = 0;
    while (cum[i + 1] <= d && guard++ < n) i = (i + 1) % n;
    return i;
  }

  // Ideal speed profile for a stock F1 on the current track. Must run with
  // the stock F1 physics in CR.Config and the track built with it.
  function buildProfile() {
    var S = CR.Track.samples, cfg = CR.Config, v = new Float64Array(n), i, k;
    for (i = 0; i < n; i++) v[i] = Math.min(S[i].maxSafeSpeed, 120);
    for (var pass = 0; pass < 2; pass++) {
      for (k = 0; k < 2 * n; k++) {
        i = k % n;
        var j = (i + 1) % n, ds = cum[i + 1] - cum[i];
        var a = Math.max(0, CR.Car.maxAccelAt(v[i]));
        v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * a * ds));
      }
      for (k = 2 * n; k > 0; k--) {
        var jj = k % n, ii = (jj - 1 + n) % n, d2 = cum[ii + 1] - cum[ii];
        v[ii] = Math.min(v[ii], Math.sqrt(v[jj] * v[jj] + 2 * cfg.MAX_BRAKE_DECEL * d2));
      }
    }
    var t = 0;
    for (i = 0; i < n; i++) t += (cum[i + 1] - cum[i]) / v[i];
    profile = v;
    idealLap = t;
  }

  // Ideal stock-F1 lap (s) of a track, for showing the expected AI lap
  // times in the menu. Leaves CR.Config/Track as they were afterwards only
  // if the caller rebuilds them (menu.js measures before any race).
  var idealCache = {};
  Race.idealLapFor = function (trackIndex) {
    if (idealCache[trackIndex]) return idealCache[trackIndex];
    var savedSamples = CR.Track.samples, savedSegments = CR.Track.segments, savedLength = CR.Track.length;
    CR.Main.applyCar(CR.Cars.byId('f1'), 0);
    var log = console.log;
    console.log = function () {};
    try {
      CR.Track.buildTrack(CR.Tracks.list[trackIndex].segments);
      buildCumulative();
      buildProfile();
    } finally {
      console.log = log;
    }
    idealCache[trackIndex] = idealLap;
    CR.Track.samples = savedSamples;
    CR.Track.segments = savedSegments;
    CR.Track.length = savedLength;
    CR.Main.applyCar();
    return idealLap;
  };

  // Expected AI lap time (s) for a difficulty on a track.
  Race.expectedLap = function (trackIndex, difficultyId) {
    return Race.idealLapFor(trackIndex) * Race.difficultyById(difficultyId).factor;
  };

  // --- Start a race ------------------------------------------------------------

  // Grid slot k (0 = pole): distance behind the line and side.
  function gridSlot(k) {
    return { dist: -(Race.GRID_SPACING + k * Race.GRID_SPACING), offset: k % 2 === 0 ? Race.GRID_LATERAL : -Race.GRID_LATERAL };
  }

  Race.start = function (trackIndex, difficultyId) {
    var f1 = CR.Cars.byId('f1');
    Race.trackIndex = trackIndex;
    Race.difficulty = Race.difficultyById(difficultyId);

    // Pace profile with the STOCK F1, then the track again with the
    // player's tuned F1 (corner colours follow its grip).
    var log = console.log;
    console.log = function () {};
    CR.Main.applyCar(f1, 0);
    CR.Track.buildTrack(CR.Tracks.list[trackIndex].segments);
    buildCumulative();
    buildProfile();
    idealCache[trackIndex] = idealLap;
    CR.Main.applyCar(f1);
    CR.Track.buildTrack(CR.Tracks.list[trackIndex].segments);
    console.log = log;
    buildCumulative();

    // Grid: AI in pace order around the player's P3 slot (quicker in front).
    var spreads = [-0.016, -0.008, 0.006, 0.012, 0.02];
    var order = Race.DRIVERS.slice().sort(function () { return Math.random() - 0.5; });
    Race.ai = [];
    var slot = 0;
    for (var g = 0; g < 6; g++) {
      if (g === Race.PLAYER_GRID - 1) continue;
      var d = order[slot], gs = gridSlot(g);
      var car = {
        driver: d, model: d.model, isAI: true, grid: g + 1,
        dist: gs.dist, offset: gs.offset, laneTarget: gs.offset, laneVel: 0,
        prefLane: (Math.random() * 2 - 1) * 1.2,
        v: 0, pace: Race.difficulty.factor * (1 + spreads[slot]), lapPace: 1,
        idx: 0, x: 0, y: 0, heading: 0,
        wheelDist: 0, wheelSteer: 0, forwardSpeed: 0,
        reaction: 0.15 + Math.random() * 0.35,
        lap: 0, lapStart: 0, laps: [], best: null, finished: false, finishTime: null,
      };
      newLapPace(car);
      Race.ai.push(car);
      slot++;
    }

    // Player on the P3 slot.
    var ps = gridSlot(Race.PLAYER_GRID - 1);
    var pIndex = indexAt(wrapDist(ps.dist), 0);
    CR.Car.spawnAt(pIndex, ps.offset);
    // Lap 1 ends on the start line: lap progress starts this many samples before it.
    CR.Laps.reset(false, pIndex === 0 ? 0 : pIndex - n);
    Race.player = { driver: Race.PLAYER, isPlayer: true, grid: Race.PLAYER_GRID, idx: pIndex, offset: ps.offset,
      dist: cum[pIndex] - L, // just behind the line, unwrapped
      v: 0, x: 0, y: 0, finished: false, retired: false };

    Race.ai.forEach(placeAI);
    Race.active = true;
    Race.phase = 'lights';
    Race.lightsOn = 0;
    Race.clock = 0;
    Race.results = null;
    Race.events.length = 0;
    lightsTimer = 0;
    goAt = 4.0 + 0.4 + Math.random() * 1.0; // lights out 0.4-1.4 s after the 5th
    CR.Car.events.length = 0;
  };

  // Small lap-to-lap variation of an AI's pace (±0.4 %).
  function newLapPace(car) {
    car.lapPace = 1 + (Math.random() * 2 - 1) * 0.004;
  }

  function placeAI(car) {
    var S = CR.Track.samples;
    var d = wrapDist(car.dist);
    car.idx = indexAt(d, car.idx);
    var a = S[car.idx], b = S[(car.idx + 1) % n];
    var seg = cum[car.idx + 1] - cum[car.idx] || 1;
    var t = (d - cum[car.idx]) / seg;
    var hx = b.x - a.x, hy = b.y - a.y, hl = Math.hypot(hx, hy) || 1;
    var tx = hx / hl, ty = hy / hl, nx = -ty, ny = tx;
    car.x = a.x + hx * t + nx * car.offset;
    car.y = a.y + hy * t + ny * car.offset;
    car.tx = tx; car.ty = ty; car.nx = nx; car.ny = ny;
    car.heading = Math.atan2(ty, tx) + Math.atan2(car.laneVel, Math.max(car.v, 3));
  }

  function profileSpeed(car, ahead) {
    var d = wrapDist(car.dist + ahead);
    var i = indexAt(d, car.idx);
    return profile[i] / (car.pace * car.lapPace);
  }

  // Player position along the track (dist unwrapped, offset).
  function trackPlayer() {
    var c = CR.Car.state, S = CR.Track.samples, p = Race.player;
    var i = c.nearestSampleIndex, s = S[i];
    var along = (c.x - s.x) * Math.cos(s.heading) + (c.y - s.y) * Math.sin(s.heading);
    var d = cum[i] + along;
    var prev = wrapDist(p.dist);
    var delta = d - prev;
    if (delta > L / 2) delta -= L;
    else if (delta < -L / 2) delta += L;
    p.dist += delta;
    p.offset = (c.x - s.x) * s.nx + (c.y - s.y) * s.ny;
    p.idx = i;
    p.v = c.speed;
    p.x = c.x; p.y = c.y;
  }

  // --- Per-frame update -----------------------------------------------------------

  Race.update = function (dt) {
    if (!Race.active) return;
    if (Race.phase === 'lights') {
      lightsTimer += dt;
      Race.lightsOn = Math.min(5, Math.floor(lightsTimer / 0.8));
      if (lightsTimer >= goAt) {
        Race.phase = 'green';
        Race.lightsOn = 0;
        CR.Laps.started = true;
        if (CR.Hud.raceNotice) CR.Hud.raceNotice('GO!');
      }
      return;
    }
    Race.clock += dt;
    trackPlayer();
    for (var i = 0; i < Race.ai.length; i++) driveAI(Race.ai[i], dt);
    collide();
    for (var j = 0; j < Race.ai.length; j++) placeAI(Race.ai[j]);

    if (Race.phase === 'green') {
      var c = CR.Car.state;
      if (c.retired && !Race.player.retired) {
        Race.player.retired = true;
        finishRace(true);
      }
    }
  };

  // Called by main.js for every lap the player completes (lap events).
  Race.onPlayerLap = function (lapNumber) {
    if (!Race.active || Race.phase !== 'green') return;
    if (lapNumber >= Race.LAPS) {
      Race.player.finished = true;
      Race.player.finishTime = CR.Laps.history.reduce(function (s, l) { return s + l.time; }, 0);
      CR.Car.state.coasting = true;
      finishRace(false);
    }
  };

  // Forfeit from the pause overlay: same as retiring.
  Race.forfeit = function () {
    if (!Race.active) return;
    Race.player.retired = true;
    if (Race.phase === 'lights') Race.phase = 'green';
    finishRace(true);
  };

  function others(car) {
    var list = [Race.player];
    for (var i = 0; i < Race.ai.length; i++) if (Race.ai[i] !== car) list.push(Race.ai[i]);
    return list;
  }

  var MAX_OFFSET = 0; // set from TRACK_WIDTH
  function driveAI(car, dt) {
    var cfg = CR.Config;
    MAX_OFFSET = cfg.TRACK_WIDTH / 2 - 1.3;
    if (Race.clock < car.reaction) return;

    // Target speed: the profile a little ahead (anticipates braking).
    var vt = Math.min(profileSpeed(car, 0), profileSpeed(car, car.v * 0.25));
    if (car.finished) vt = Math.min(vt, 45); // cool-down lap

    // Traffic ahead within the car's width.
    var block = null, blockGap = Infinity, beside = null;
    var list = others(car);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.isPlayer && (o.retired && CR.Car.state.exploded)) { /* wreck still blocks */ }
      var gap = o.dist - car.dist;
      gap = ((gap % L) + L * 1.5) % L - L / 2;
      var lat = o.offset - car.offset;
      if (gap > 0 && gap < 32 && Math.abs(lat) < 2.6 && gap < blockGap) { block = o; blockGap = gap; }
      if (Math.abs(gap) < 5.5 && Math.abs(lat) < 3.2) beside = o;
    }
    if (block) {
      var ov = block.isPlayer ? CR.Car.state.speed : block.v;
      if (vt > ov * 1.005 || ov < 5) {
        // Pass on the side with more room.
        var leftRoom = MAX_OFFSET - block.offset, rightRoom = block.offset + MAX_OFFSET;
        car.laneTarget = leftRoom >= rightRoom ? Math.min(MAX_OFFSET, block.offset + 3.4) : Math.max(-MAX_OFFSET, block.offset - 3.4);
      }
      if (blockGap < 14 && Math.abs(block.offset - car.offset) < 2.3) {
        vt = Math.min(vt, ov + (blockGap - 7) * 0.6);
      }
    } else if (!beside) {
      car.laneTarget += (car.prefLane - car.laneTarget) * Math.min(1, 0.4 * dt);
    }
    if (beside) {
      // Keep a car's width from the car alongside.
      var away = car.offset >= beside.offset ? 1 : -1;
      if (Math.abs(car.offset - beside.offset) < 2.8) car.laneTarget = car.offset + away * 1.5;
    }
    car.laneTarget = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, car.laneTarget));

    // Speed and lane dynamics.
    var dv = vt - car.v;
    car.v += Math.max(-42 * dt, Math.min(22 * dt, dv));
    if (car.v < 0) car.v = 0;
    var wantLat = Math.max(-4, Math.min(4, (car.laneTarget - car.offset) * 1.8));
    car.laneVel += (wantLat - car.laneVel) * Math.min(1, 5 * dt);
    car.offset += car.laneVel * dt;
    if (car.offset > MAX_OFFSET) { car.offset = MAX_OFFSET; car.laneVel = Math.min(0, car.laneVel); }
    if (car.offset < -MAX_OFFSET) { car.offset = -MAX_OFFSET; car.laneVel = Math.max(0, car.laneVel); }

    var prevDist = car.dist;
    car.dist += car.v * dt;
    car.forwardSpeed = car.v;
    car.wheelDist += car.v * dt;
    var S = CR.Track.samples;
    var curv = S[car.idx] ? S[car.idx].curvature : 0;
    car.wheelSteer = Math.max(-0.5, Math.min(0.5, Math.atan(cfg.WHEELBASE * curv) * 1.6 + car.laneVel * 0.02));

    // Laps: crossing k * L.
    // (Leaving the grid across the line is not a lap: laps count from lights out.)
    if (Math.floor(car.dist / L) > Math.floor(prevDist / L) && Math.floor(car.dist / L) >= 1) {
      var t = Race.clock - car.lapStart;
      car.lap++;
      car.laps.push(t);
      if (car.best === null || t < car.best) car.best = t;
      car.lapStart = Race.clock;
      newLapPace(car);
      if (car.lap >= Race.LAPS && !car.finished) {
        car.finished = true;
        // Exact crossing time: back off the part of this frame past the line.
        car.finishTime = Race.clock - (car.dist - Race.LAPS * L) / Math.max(car.v, 1);
      }
    }
  }

  // --- Collisions -----------------------------------------------------------

  var R_CIRCLE = 0.95, HALF_SPAN = 1.25, RESTITUTION = 0.25;

  function body(o) {
    if (o.isPlayer) {
      var c = CR.Car.state;
      return { x: c.x, y: c.y, h: c.heading, vx: c.vx, vy: c.vy };
    }
    return { x: o.x, y: o.y, h: o.heading, vx: o.tx * o.v + o.nx * o.laneVel, vy: o.ty * o.v + o.ny * o.laneVel };
  }

  function applyToCar(o, px, py, dvx, dvy) {
    if (o.isPlayer) {
      var c = CR.Car.state;
      c.x += px; c.y += py;
      c.vx += dvx; c.vy += dvy;
      return;
    }
    o.dist += px * o.tx + py * o.ty;
    o.offset += px * o.nx + py * o.ny;
    o.v = Math.max(0, o.v + dvx * o.tx + dvy * o.ty);
    o.laneVel += dvx * o.nx + dvy * o.ny;
    o.x += px; o.y += py;
  }

  function collide() {
    var all = [Race.player].concat(Race.ai);
    for (var a = 0; a < all.length; a++) {
      for (var b = a + 1; b < all.length; b++) {
        var A = body(all[a]), B = body(all[b]);
        if (Math.abs(A.x - B.x) > 6 || Math.abs(A.y - B.y) > 6) continue;
        var best = null;
        for (var i = -1; i <= 1; i += 2) {
          for (var j = -1; j <= 1; j += 2) {
            var ax = A.x + Math.cos(A.h) * HALF_SPAN * i, ay = A.y + Math.sin(A.h) * HALF_SPAN * i;
            var bx = B.x + Math.cos(B.h) * HALF_SPAN * j, by = B.y + Math.sin(B.h) * HALF_SPAN * j;
            var dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
            var pen = 2 * R_CIRCLE - d;
            if (pen > 0 && (!best || pen > best.pen)) best = { pen: pen, nx: d > 1e-6 ? dx / d : 1, ny: d > 1e-6 ? dy / d : 0 };
          }
        }
        if (!best) continue;
        var push = best.pen / 2 + 0.01;
        var rv = (B.vx - A.vx) * best.nx + (B.vy - A.vy) * best.ny;
        var jimp = rv < 0 ? (-(1 + RESTITUTION) * rv) / 2 : 0;
        applyToCar(all[a], -best.nx * push, -best.ny * push, -best.nx * jimp, -best.ny * jimp);
        applyToCar(all[b], best.nx * push, best.ny * push, best.nx * jimp, best.ny * jimp);
        if ((all[a].isPlayer || all[b].isPlayer) && -rv > 2.5) CR.Car.events.push({ type: 'bump', impact: -rv });
      }
    }
  }

  // --- Classification -----------------------------------------------------

  // Live order: finished cars by finish time, then by distance.
  Race.order = function () {
    var all = [Race.player].concat(Race.ai);
    return all.slice().sort(function (a, b) {
      if (a.isPlayer && a.retired) return 1;
      if (b.isPlayer && b.retired) return -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.dist - a.dist;
    });
  };

  Race.position = function () {
    return Race.order().indexOf(Race.player) + 1;
  };

  function finishRace(retired) {
    if (Race.phase === 'done') return;
    Race.phase = 'done';
    var full = Race.LAPS * L;
    var entries = Race.ai.map(function (car) {
      // Still running: projected from its own pace (lap = ideal x pace factor).
      var time = car.finished ? car.finishTime
        : Race.clock + Math.max(0, full - car.dist) / (L / (idealLap * car.pace));
      return { id: car.driver.id, code: car.driver.code, name: car.driver.name, team: car.driver.team, color: car.driver.main,
        model: car.model, time: time, best: car.best, isPlayer: false };
    });
    var pBest = null;
    CR.Laps.history.forEach(function (l) { if (pBest === null || l.time < pBest) pBest = l.time; });
    var player = { id: 'you', code: 'YOU', name: Race.PLAYER.name, team: Race.PLAYER.team, color: CR.Cars.byId('f1').color,
      model: CR.Cars.byId('f1').model, time: retired ? null : Race.player.finishTime, best: pBest, isPlayer: true, retired: retired };
    entries.sort(function (a, b) { return a.time - b.time; });
    if (retired) entries.push(player);
    else {
      var k = 0;
      while (k < entries.length && entries[k].time < player.time) k++;
      entries.splice(k, 0, player);
    }
    entries.forEach(function (e, i) { e.pos = i + 1; e.points = Race.POINTS[i] || 0; });
    Race.results = {
      track: CR.Tracks.list[Race.trackIndex].realName,
      trackName: CR.Tracks.list[Race.trackIndex].name,
      difficulty: Race.difficulty.id,
      entries: entries,
      playerPos: entries.indexOf(player) + 1,
      retired: retired,
    };
    Race.events.push({ type: retired ? 'retire' : 'finish' });
  }

  Race.end = function () {
    Race.active = false;
    Race.phase = 'idle';
    Race.ai = [];
    Race.lightsOn = 0;
  };

  CR.Race = Race;
})();

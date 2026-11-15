// real-pit.js — 리얼리스틱 pit lane: geometry along the main straight and the
// kinematic drive through it (AI cars, the safety car and the player's car
// while it is in the pit lane — the player hands over control at the entry
// line and gets it back at the exit, like a real pit-lane limiter + stop).
//
// Positions are measured as `rel`: metres from the start/finish line along
// the track (negative = before it). The lane runs from -ENTRY to +EXIT on the
// side of the straight with more run-off: a ramp off the racing line, the
// 80 km/h limiter zone with the ten team boxes, a ramp back on.
// Load order: after real-physics.js. Depends on: Config, Track, Race (_ctx),
// RealData, RealPhys.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Pit = {
    ENTRY: 380, EXIT: 260, RAMP_IN: 150, RAMP_OUT: 150,
    BOX0: -200, BOX_STEP: 30, // rel of the first team box, spacing
    side: 1, lane: 0, edge: 0, work: 0,
    built: false,
    player: null, // {phase, rel, v, t, stopTime, tyre, base, ...} while the player is in the pit lane
  };

  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  // Called after the track (and Race._ctx) is built for the realistic race.
  Pit.build = function () {
    var cfg = CR.Config, S = CR.Track.samples, ctx = CR.Race._ctx(), n = S.length;
    var sumL = 0, sumR = 0;
    for (var rel = -Pit.ENTRY; rel <= Pit.EXIT; rel += 10) {
      var s = S[ctx.indexAt(ctx.wrapDist(rel), 0)];
      sumL += s.wallLeft; sumR += s.wallRight;
    }
    Pit.side = sumL >= sumR ? 1 : -1;
    var hw = cfg.TRACK_WIDTH / 2;
    Pit.edge = Pit.side * (hw - 1.3);
    Pit.lane = Pit.side * (hw + 9); // fast lane, behind the pit wall
    Pit.work = Pit.side * (hw + 12); // working lane in front of the garages
    // Per-sample marks for the renderers and the walls: on the pit side the
    // wall becomes the pit wall (hw + 5) where the lane runs separately,
    // and the outer edge of the lane on the ramps (open to the track).
    // s.pit = {rel, off, side, lim, inner (pit wall offset or 0), lane0, lane1, back}
    var GAR = hw + 15.5, BACK = hw + 27;
    Pit.inner = hw + 5; Pit.garage = GAR; Pit.back = BACK;
    for (var i = 0; i < n; i++) {
      delete S[i].pit;
      var rel2 = ctx.cum[i] > ctx.L / 2 ? ctx.cum[i] - ctx.L : ctx.cum[i];
      if (rel2 < -Pit.ENTRY || rel2 > Pit.EXIT) continue;
      var off = Pit.offsetAt(rel2), a = Math.abs(off), lim = Pit.inLimiter(rel2);
      var sep = a - 4 > hw + 4.4; // lane fully off the track: pit wall between
      var orig = Pit.side > 0 ? S[i].wallLeft : S[i].wallRight;
      var info = { rel: rel2, off: off, side: Pit.side, lim: lim, inner: sep ? hw + 5 : 0,
        lane0: sep ? hw + 5.6 : Math.max(hw, a - 4), lane1: lim ? GAR : a + 4, back: lim ? BACK : Math.max(orig, a + 4.5) };
      S[i].pit = info;
      var wall = sep ? hw + 5 : Math.max(orig, a + 4.5);
      if (Pit.side > 0) S[i].wallLeft = wall; else S[i].wallRight = wall;
    }
    // Team garages (sample ranges) for the renderers.
    Pit.garages = CR.RealData.TEAMS.map(function (t) {
      var r0 = Pit.boxRel(t.id) - 6.5, r1 = Pit.boxRel(t.id) + 6.5;
      return { team: t.id, color: t.player ? CR.Cars.byId('f1').color : t.main, accent: t.player ? '#d4a82a' : t.accent,
        i0: ctx.indexAt(ctx.wrapDist(r0), 0), i1: ctx.indexAt(ctx.wrapDist(r1), 0), rel: Pit.boxRel(t.id) };
    });
    Pit.built = true;
    Pit.player = null;
  };

  // Lane centre offset (m, + = left) at rel.
  Pit.offsetAt = function (rel) {
    if (rel < -Pit.ENTRY + Pit.RAMP_IN) return Pit.edge + (Pit.lane - Pit.edge) * smooth((rel + Pit.ENTRY) / Pit.RAMP_IN);
    if (rel > Pit.EXIT - Pit.RAMP_OUT) return Pit.edge + (Pit.lane - Pit.edge) * smooth((Pit.EXIT - rel) / Pit.RAMP_OUT);
    return Pit.lane;
  };
  Pit.inLimiter = function (rel) { return rel > -Pit.ENTRY + Pit.RAMP_IN && rel < Pit.EXIT - Pit.RAMP_OUT; };
  Pit.boxRel = function (teamId) {
    var T = CR.RealData.TEAMS, k = 0;
    for (var i = 0; i < T.length; i++) if (T[i].id === teamId) k = i;
    return Pit.BOX0 + k * Pit.BOX_STEP;
  };
  // rel of an unwrapped distance (nearest line crossing).
  Pit.relOf = function (dist) {
    var L = CR.Race._ctx().L, d = ((dist % L) + L) % L;
    return d > L / 2 ? d - L : d;
  };

  // A stop's stationary time: ~2.4 s, now and then a slow one.
  Pit.stopTime = function () {
    var t = 2.15 + Math.abs(gauss()) * 0.35;
    if (Math.random() < 0.07) t += 1.5 + Math.random() * 3.5;
    return t;
  };
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.41; }

  // --- Shared drive along the lane ---------------------------------------------
  // p: {phase 'in'|'stop'|'out', rel, v, box, off0, rel0, t, stopTime}
  // Returns true when the car has left the lane at the exit.
  var LIM = function () { return CR.RealData.CAR.PIT_LIMIT; };
  function step(p, dt) {
    var lim = LIM(), zoneIn = -Pit.ENTRY + Pit.RAMP_IN, zoneOut = Pit.EXIT - Pit.RAMP_OUT;
    if (p.phase === 'in') {
      var cap = p.rel < zoneIn ? Math.min(p.vIn, Math.sqrt(lim * lim + 2 * 36 * Math.max(0, zoneIn - p.rel))) : lim;
      if (p.box !== null) cap = Math.min(cap, Math.sqrt(2 * 18 * Math.max(0, p.box - p.rel)) + 0.4);
      p.v = Math.min(p.v + 10 * dt, cap);
      p.rel += p.v * dt;
      if (p.box !== null && p.rel >= p.box - 0.15) { p.rel = p.box; p.v = 0; p.phase = 'stop'; p.t = 0; }
    } else if (p.phase === 'stop') {
      p.v = 0;
      p.t += dt;
      if (p.t >= p.stopTime) { p.phase = 'out'; p.t = 0; if (p.onService) p.onService(); }
    } else {
      p.t += dt;
      var acc = p.rel < zoneOut ? 9 : 15;
      var top = p.rel < zoneOut ? lim : Infinity;
      p.v = Math.min(p.v + acc * dt, top, p.vMax || Infinity);
      p.rel += p.v * dt;
      if (p.rel >= Pit.EXIT) return true;
    }
    return false;
  }
  // Lateral offset on the lane (blends in from where the car entered and
  // moves to the working lane at its box).
  function laneOff(p) {
    var off = Pit.offsetAt(p.rel);
    if (p.box !== null) {
      var w = smooth(1 - Math.abs(p.rel - p.box) / 28);
      off += (Pit.work - Pit.lane) * w * (Pit.inLimiter(p.rel) ? 1 : 0);
    }
    var blend = smooth((p.rel - p.rel0) / 70);
    return p.off0 + (off - p.off0) * blend;
  }
  Pit.newRun = function (rel, v, off, boxRel, stopTime) {
    return { phase: 'in', rel: rel, v: v, vIn: Math.max(v, CR.RealData.CAR.PIT_LIMIT), box: boxRel, off0: off, rel0: rel, t: 0, stopTime: stopTime, offset: off };
  };

  // AI / safety car: car.dist / offset / v from the run. Returns true at the exit.
  Pit.driveCar = function (car, p, dt) {
    var prevRel = p.rel;
    var done = step(p, dt);
    car.v = p.v;
    car.dist += p.rel - prevRel;
    var off = laneOff(p);
    car.laneVel = dt > 0 ? (off - car.offset) / dt : 0;
    car.laneVel = Math.max(-6, Math.min(6, car.laneVel));
    car.offset = off;
    car.laneTarget = off;
    return done;
  };

  // --- Player ----------------------------------------------------------------
  // Takes over the player's car at the entry line.
  Pit.enterPlayer = function (opts) {
    var c = CR.Car.state, ctx = CR.Race._ctx(), S = CR.Track.samples, s = S[c.nearestSampleIndex];
    var along = (c.x - s.x) * Math.cos(s.heading) + (c.y - s.y) * Math.sin(s.heading);
    var rel = Pit.relOf(ctx.cum[c.nearestSampleIndex] + along);
    var off = (c.x - s.x) * s.nx + (c.y - s.y) * s.ny;
    var p = Pit.newRun(rel, Math.max(5, c.speed), off, opts.box, opts.stopTime);
    p.tyre = opts.tyre;
    p.onService = opts.onService;
    p.base = CR.Race.player.dist - rel; // unwrapped distance of the line
    p.serve = opts.serve || 0; // penalty seconds served before the crew works
    Pit.player = p;
    c.inPit = true;
    c.steerSmoothed = 0;
  };

  // Kinematic drive of the player's car (car.js calls this while c.inPit).
  Pit.drivePlayer = function (dt) {
    var c = CR.Car.state, p = Pit.player, ctx = CR.Race._ctx(), S = CR.Track.samples, cfg = CR.Config;
    if (!p) { c.inPit = false; return; }
    var done = step(p, dt);
    var off = laneOff(p);
    var L = ctx.L, d = ((p.rel % L) + L) % L;
    var i = ctx.indexAt(d, c.nearestSampleIndex), n = S.length;
    var a = S[i], b = S[(i + 1) % n];
    var seg = ctx.cum[i + 1] - ctx.cum[i] || 1, t = (d - ctx.cum[i]) / seg;
    var hx = b.x - a.x, hy = b.y - a.y, hl = Math.hypot(hx, hy) || 1;
    var tx = hx / hl, ty = hy / hl, nx = -ty, ny = tx;
    var dOff = dt > 0 && p.v > 0.5 ? (off - p.offset) / (p.v * dt) : 0;
    p.offset = off;
    c.x = a.x + hx * t + nx * off;
    c.y = a.y + hy * t + ny * off;
    var h = Math.atan2(ty, tx) + Math.atan(Math.max(-0.3, Math.min(0.3, dOff)));
    c.heading += Math.atan2(Math.sin(h - c.heading), Math.cos(h - c.heading)) * Math.min(1, dt * 10);
    c.vx = Math.cos(c.heading) * p.v; c.vy = Math.sin(c.heading) * p.v;
    c.speed = p.v; c.forwardSpeed = p.v; c.lateralVelocity = 0;
    c.wheelDist += p.v * dt;
    c.wheelSteer = Math.max(-0.4, Math.min(0.4, Math.atan(cfg.WHEELBASE * (a.curvature || 0)) * 1.6 + dOff * 2));
    c.nearestSampleIndex = i;
    c.touchingWall = false; c.beyondTrackLimit = false; c.insideTrackLimit = true;
    // gear for the speed (sound / wheel display)
    var ratios = cfg.GEAR_RATIOS, g = 1;
    while (g < ratios.length && p.v / cfg.WHEEL_RADIUS * ratios[g - 1] * cfg.FINAL_DRIVE * 9.549 > cfg.REDLINE_RPM * 0.8) g++;
    c.gear = g;
    c.rpm = Math.max(cfg.IDLE_RPM, p.v / cfg.WHEEL_RADIUS * ratios[g - 1] * cfg.FINAL_DRIVE * 9.549);
    if (done) {
      c.inPit = false;
      Pit.player = null;
      if (Pit.onPlayerExit) Pit.onPlayerExit();
    }
  };

  CR.RealPit = Pit;
})();

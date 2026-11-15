// real-physics.js — the 리얼리스틱 car: a 2026-style Formula 1 car.
// Only active while CR.Config.REAL is set (configure() sets it for the
// realistic race / qualifying; Main.applyCar clears it again), so 연습 and
// AI 대전 run exactly as before. car.js / track.js / race.js call in here
// behind `if (cfg.REAL)` checks.
//
// Model (SI units):
//  - grip: tyre friction (compound x wear x warm-up x wetness) times
//    (1 + downforce / weight), downforce = 0.5 rho ClA v^2 -> ~4 g in fast
//    corners, ~2 g in slow ones;
//  - braking: min(5.6 g, grip) -> ~5 g from 300 km/h;
//  - power: ICE ~400 kW (torque curve, 8 gears) + MGU-K: 190 kW sustained,
//    350 kW with Boost (held, drains the 4 MJ battery), electrical power
//    fades from 290 to 345 km/h; Overtake Mode (granted within 1 s of the car
//    ahead at the detection point) adds 0.5 MJ and keeps 350 kW to 337 km/h;
//    harvest under braking (350 kW) and lift-off;
//  - Straight Mode (active aero): in the straight zones the wings flatten
//    (less drag and downforce) unless braking or the track is wet;
//  - traction limit at low speed (wheelspin), fuel mass (burns per lap).
// Load order: after real-data.js. Depends on: Config, RealData, Track.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var D = function () { return CR.RealData.CAR; };
  var RHO = 1.2, G = 9.81;

  var P = {
    on: false,
    // player car state
    st: { soc: 4, otBudget: 0, otAvail: false, otActive: false, boost: false, straight: false, wing: 0,
      fuel: 0, tyre: 'M', wear: 0, warm: 1, laps: 0,
      temp: 90, corners: [90, 90, 90, 90], // tyre temperature °C (average; FL FR RL RR for the display)
      tow: 0 }, // slipstream 0..1 (car close ahead)
    wet: 0, // track wetness 0..1
    lifeScale: 1, // tyre life multiplier (shorter races wear faster)
    zone: null, // Uint8Array per sample: 1 = Straight Mode zone
    profile: false, // true while race.js builds the AI pace profile (sustained deployment, zone per sample)
    profileZone: 0,
  };

  // Configures CR.Config for the realistic car (on top of the player's F1).
  P.configure = function (opts) {
    opts = opts || {};
    var cfg = CR.Config, d = D();
    CR.Main.applyCar(CR.Cars.byId('f1'), opts.levels);
    cfg.REAL = true;
    cfg.WHEEL_RADIUS = 0.33;
    cfg.FINAL_DRIVE = 3.0;
    cfg.GEAR_RATIOS = [4.6, 3.55, 2.85, 2.35, 2.0, 1.75, 1.57, 1.425];
    cfg.IDLE_RPM = 4000;
    cfg.REDLINE_RPM = 12000;
    cfg.TORQUE_BOOST = 1;
    cfg.TORQUE_SCALE = 1;
    cfg.DRIVETRAIN_EFFICIENCY = 0.93;
    cfg.TORQUE_CURVE = [
      { rpm: 4000, torque: 240 }, { rpm: 7000, torque: 330 }, { rpm: 9500, torque: 380 },
      { rpm: 10800, torque: 372 }, { rpm: 12000, torque: 318 }, { rpm: 12500, torque: 150 },
    ];
    cfg.ROLLING_RESISTANCE_COEF = 0.012;
    cfg.STEER_GRIP_TARGET = 1.0;
    cfg.LATERAL_GRIP = 1.0;
    cfg.LOW_SPEED_TURN_BOOST = 0.35;
    cfg.MAX_STEER_ANGLE = 0.42;
    cfg.STEER_RESPONSE_RATE = 7.5 * cfg.STEER_RESPONSE_BOOST;
    cfg.CAR_HALF_WIDTH = 0.95;
    cfg.CAR_HALF_LENGTH = 2.35;
    cfg.EXPLODE_IMPACT_SPEED = 17;
    cfg.TRACK_LIMIT_PENALTY = 0; // realistic: warnings, then a race-time penalty (real-race.js)
    cfg.MAX_BRAKE_DECEL = d.BRAKE_MAX_G * G; // only for code that reads it directly
    // reference grip (fresh mediums, dry, warm) until update() takes over
    cfg.TIRE_GRIP_TARMAC = d.TYRE_MU * CR.RealData.TYRES.M.grip;
    cfg.CAR_MASS = d.MASS + (opts.fuel !== undefined ? opts.fuel : d.FUEL_FULL * 0.5);
    P.on = true;
  };

  P.off = function () { P.on = false; };

  // --- Grip --------------------------------------------------------------------
  // Dirty air behind another car: less downforce; slipstream: less drag.
  P.cla = function () {
    if (P.profile) return P.profileZone ? D().CLA_STRAIGHT : D().CLA;
    var c = P.st.straight ? D().CLA + (D().CLA_STRAIGHT - D().CLA) * P.st.wing : D().CLA;
    return c * (1 - 0.16 * P.st.tow);
  };
  P.cda = function () {
    if (P.profile) return P.profileZone ? D().CDA_STRAIGHT : D().CDA;
    return (D().CDA + (D().CDA_STRAIGHT - D().CDA) * (P.st.straight ? P.st.wing : 0)) * (1 - 0.3 * P.st.tow);
  };

  // --- Tyre temperature -----------------------------------------------------------
  // Working window per compound (°C): grip falls off either side of it.
  var OPT = { S: 100, M: 106, H: 113, I: 72, W: 58 };
  P.OPT = OPT;
  P.tempGrip = function (id, T) {
    var d = (T - (OPT[id] || 100)) / 45;
    return 1 - 0.2 * Math.min(1, d * d);
  };
  // Effective friction coefficient at speed v (downforce adds normal load).
  P.mu = function (v) {
    var cfg = CR.Config;
    return cfg.TIRE_GRIP_TARMAC * (1 + 0.5 * RHO * P.cla() * v * v / (cfg.CAR_MASS * G));
  };
  // Same, with a given downforce area (track.js corner speeds use corner mode).
  P.muWith = function (v, cla, tyreMu) {
    var cfg = CR.Config;
    return (tyreMu || cfg.TIRE_GRIP_TARMAC) * (1 + 0.5 * RHO * cla * v * v / (cfg.CAR_MASS * G));
  };
  P.brakeDecel = function (v) {
    return Math.min(D().BRAKE_MAX_G * G, P.mu(Math.abs(v)) * G);
  };
  P.tractionLimit = function (v) {
    return P.mu(Math.abs(v)) * CR.Config.CAR_MASS * G * 0.64;
  };

  // Compound grip over track wetness.
  P.compoundGrip = function (id, w) {
    var t = CR.RealData.tyre(id);
    if (t.wet === 'inter') return t.grip * (1 - 0.2 * Math.abs(w - 0.45) / 0.55);
    if (t.wet === 'wet') return t.grip * (1 - 0.13 * (1 - w));
    return t.grip * (1 - 0.62 * w);
  };
  // Best compound for a wetness (AI and engineer advice).
  P.bestFor = function (w) { return w > 0.72 ? 'W' : w > 0.25 ? 'I' : null; };
  // Grip factor from wear (0 = new, 1 = worn out; past 1 the cliff).
  P.wearGrip = function (wear) {
    var g = 1 - 0.04 * Math.pow(Math.min(1, wear), 1.5);
    if (wear > 1) g -= Math.min(0.2, (wear - 1) * 0.6);
    return g;
  };
  // Full tyre friction for a state (compound, wear, warm-up, wetness).
  P.tyreMu = function (id, wear, warm, w) {
    return D().TYRE_MU * P.compoundGrip(id, w) * P.wearGrip(wear) * (0.9 + 0.1 * warm);
  };

  // --- Power -------------------------------------------------------------------
  function taper(v, from, to) { return v <= from ? 1 : v >= to ? 0 : 1 - (v - from) / (to - from); }
  // Electrical deployment (kW) at speed v for the current mode.
  P.elecKW = function (v) {
    var d = D(), s = P.st;
    if (P.profile) return d.MGUK_STD_KW * taper(v, d.TAPER_FROM, d.TAPER_TO);
    if (s.otActive && s.otBudget > 0) return d.MGUK_KW * taper(v, d.OT_TO, d.OT_ZERO);
    if (s.soc <= 0) return 0;
    if (s.boost) return d.MGUK_KW * taper(v, d.TAPER_FROM, d.TAPER_TO);
    return d.MGUK_STD_KW * taper(v, d.TAPER_FROM, d.TAPER_TO);
  };
  P.elecForce = function (v, throttle) {
    if (!(throttle > 0)) return 0;
    return throttle * P.elecKW(Math.abs(v)) * 1000 / Math.max(Math.abs(v), 8);
  };

  // --- Straight Mode zones -----------------------------------------------------
  // Long straights: samples with no corner speed limit, from 60 m after a
  // corner to 160 m before the next one, at least 300 m long.
  P.buildZones = function () {
    var S = CR.Track.samples, n = S.length, sp = CR.Config.TRACK_SAMPLE_SPACING;
    var straight = new Uint8Array(n);
    for (var i = 0; i < n; i++) straight[i] = S[i].maxSafeSpeed > 110 ? 1 : 0; // flat out (> ~400 km/h corner limit)
    var zone = new Uint8Array(n), start = -1, first = 0;
    while (first < n && straight[first]) first++;
    if (first === n) { P.zone = zone; return zone; }
    var runs = [];
    for (var k = 1; k <= n; k++) {
      var j = (first + k) % n;
      if (straight[j] && start < 0) start = k;
      if ((!straight[j] || k === n) && start >= 0) { runs.push([first + start, first + k - 1]); start = -1; }
    }
    var lead = Math.round(60 / sp), tail = Math.round(160 / sp), minLen = Math.round(300 / sp);
    P.zones = [];
    runs.forEach(function (r) {
      var a = r[0] + lead, b = r[1] - tail;
      if (b - a < minLen) return;
      for (var q = a; q <= b; q++) zone[q % n] = 1;
      P.zones.push([a % n, b % n]);
    });
    P.zone = zone;
    return zone;
  };

  // --- Per frame (player) ------------------------------------------------------
  // dt: s; c: CR.Car.state; input: {throttle, brake}; lapLen: m.
  P.update = function (dt, c, input, lapLen) {
    if (!P.on || !(dt > 0)) return;
    var d = D(), s = P.st, cfg = CR.Config, v = c.speed;
    // Straight Mode: in a zone, not braking, dry enough; wings move in ~0.3 s
    var inZone = P.zone && P.zone[c.nearestSampleIndex] && !c.retired && !c.inPit;
    s.straight = inZone && input.brake < 0.05 && P.wet < 0.35 && !P.noStraight;
    s.wing += ((s.straight ? 1 : 0) - s.wing) * Math.min(1, dt * (s.straight ? 4 : 12));
    if (!s.straight && s.wing < 0.02) s.wing = 0;
    // energy
    var thr = c.retired ? 0 : input.throttle, brk = c.retired ? 0 : input.brake;
    if (thr > 0) {
      var kw = P.elecKW(v) * thr, mj = kw * dt / 1000;
      if (s.otActive && s.otBudget > 0) { s.otBudget = Math.max(0, s.otBudget - mj); if (s.otBudget <= 0) s.otActive = false; }
      else s.soc = Math.max(0, s.soc - mj);
    }
    if (brk > 0) s.soc += d.HARVEST_KW * brk * Math.min(1, v / 15) * dt / 1000;
    else if (thr <= 0 && v > 10) s.soc += d.COAST_KW * dt / 1000;
    s.soc = Math.min(d.BATTERY_MJ, s.soc);
    // tyres: wear with distance and sliding; temperature from rolling,
    // cornering, braking and sliding, cooled by the air and (a lot) by rain
    var t = CR.RealData.tyre(s.tyre);
    var slide = Math.min(1, Math.abs(c.lateralVelocity || 0) / 6);
    var steer = Math.abs(c.steerSmoothed || 0);
    var amb = 32 - 12 * P.wet;
    var heat = 0.04 * v + 0.05 * steer * v + 0.08 * brk * v + 0.18 * slide * v + (v < 30 ? 0.06 * thr * v : 0);
    var cool = (s.temp - amb) * (0.01 + 0.0006 * v + 0.085 * P.wet * (t.wet ? 0.45 : 1));
    s.temp += (heat - cool) * dt;
    var opt = OPT[s.tyre] || 100, hot = Math.max(0, s.temp - opt - 15) / 20;
    var overheat = (t.wet && P.wet < 0.2 ? (t.wet === 'wet' ? 3 : 1.8) : 1) * (1 + hot);
    s.wear += (v * dt / Math.max(1, lapLen)) / (t.life * P.lifeScale) * (1 + slide * 2.5) * overheat;
    s.warm = Math.min(1, s.warm + dt * (0.012 + 0.05 * Math.min(1, v / 60) + slide * 0.2));
    // corner temperatures for the display: outside tyres hotter in a turn,
    // fronts under braking, rears under traction
    var side = (c.steerSmoothed || 0) > 0 ? 1 : -1; // turning left: right-hand tyres outside
    for (var k = 0; k < 4; k++) {
      var right = k % 2 === 1, front = k < 2;
      var target = s.temp + steer * 14 * ((right ? 1 : -1) * side) + (front ? brk * 8 : thr * 4 - brk * 3);
      s.corners[k] += (target - s.corners[k]) * Math.min(1, dt * 1.5);
    }
    // wet track / cold tyres: steering can ask for more than the tyres hold,
    // so the car slides in corners and steps out on the throttle
    var slick = !t.wet, wetSlip = P.wet * (slick ? 1 : 0.35);
    var cold = Math.max(0, (opt - 25 - s.temp) / 40);
    cfg.STEER_GRIP_TARGET = 1 + 0.6 * wetSlip + 0.3 * Math.min(1, cold);
    cfg.LATERAL_GRIP = 1 - 0.3 * wetSlip;
    // fuel
    if (thr > 0) s.fuel = Math.max(0, s.fuel - P.burnPerM * v * dt * (0.55 + 0.45 * thr));
    cfg.CAR_MASS = d.MASS + s.fuel;
    cfg.TIRE_GRIP_TARMAC = P.tyreMu(s.tyre, s.wear, 1, P.wet) * P.tempGrip(s.tyre, s.temp);
    // kerbs: less grip on the ridged paint (much less when wet) and a twitch of the chassis
    var kc = CR.Kerb && !c.inPit ? CR.Kerb.player() : 0;
    if (kc > 0) {
      cfg.TIRE_GRIP_TARMAC *= 1 - kc * (0.05 + 0.15 * P.wet);
      c.heading += (Math.random() - 0.5) * 0.008 * kc * Math.min(1, v / 40);
    }
  };

  // New tyres (pit stop / race start). warm: 0..1 (blankets ~0.55).
  // New tyres from the blankets (slicks ~80 °C, wets ~55 °C).
  P.fitTyres = function (id, warm) {
    var s = P.st;
    s.tyre = id; s.wear = 0; s.warm = warm === undefined ? 0.55 : warm;
    s.temp = CR.RealData.tyre(id).wet ? 52 : 70 + 15 * s.warm;
    s.corners = [s.temp, s.temp, s.temp, s.temp];
    CR.Config.TIRE_GRIP_TARMAC = P.tyreMu(id, 0, 1, P.wet) * P.tempGrip(id, s.temp);
  };

  P.reset = function (opts) {
    var d = D(), s = P.st;
    s.soc = d.BATTERY_MJ; s.otBudget = 0; s.otAvail = false; s.otActive = false; s.boost = false; s.straight = false; s.wing = 0;
    s.fuel = opts.fuel; s.laps = 0; s.tow = 0;
    P.burnPerM = opts.fuel / Math.max(1, opts.distance) * 0.98;
    P.lifeScale = opts.lifeScale || 1;
    P.wet = opts.wet || 0;
    P.fitTyres(opts.tyre || 'M', 0.7);
    CR.Config.CAR_MASS = d.MASS + s.fuel;
  };

  CR.RealPhys = P;
})();

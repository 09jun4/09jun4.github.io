// physics.js — drift-race car physics, ported from the Circuit Racer
// artifact (its car.js and config.js values), plus the mountain road's
// slope. Used only by the drift race; F1 Champion's own physics is not
// touched.
//
// Velocity model (Circuit Racer): the car carries a world velocity
// independent of its body heading. In grip mode a kinematic bicycle with a
// speed-sensitive lock steers it and lateral friction removes sideways
// speed. With the handbrake (Space) held while steering, the path turns at
// DRIFT_TURN_ACCEL x mu*g, each unit of that turning costs speed, and the
// body swings out to steer x DRIFT_MAX_SLIP_ANGLE.
// New here: gravity along the road (downhill grade speeds the car up) and
// guardrails instead of walls (bump and scrape, no explosion).
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};

  // Circuit Racer base values (config.js).
  var BASE = {
    GRAVITY: 9.81, CAR_MASS: 900, WHEEL_RADIUS: 0.3, WHEELBASE: 2.6, FINAL_DRIVE: 4.4,
    GEAR_RATIOS: [3.8, 2.5, 1.8, 1.3, 1.0, 0.8], DRIVETRAIN_EFFICIENCY: 0.9, IDLE_RPM: 900, REDLINE_RPM: 7500,
    TORQUE_BOOST: 1.6, TORQUE_SCALE: 1,
    TORQUE_CURVE: [{ rpm: 900, torque: 145 }, { rpm: 2000, torque: 265 }, { rpm: 4500, torque: 385 }, { rpm: 6000, torque: 360 }, { rpm: 7000, torque: 275 }, { rpm: 7500, torque: 145 }, { rpm: 8200, torque: 120 }],
    CAR_HALF_WIDTH: 0.95, CAR_HALF_LENGTH: 2.1,
    MAX_STEER_ANGLE: 0.5, STEER_GRIP_TARGET: 1.0, STEER_RESPONSE_RATE: 5.0, STEER_RETURN_RATE: 14.0,
    DRIFT_STEER_START: 0.3, DRIFT_STEER_RATE: 1.4, DRIFT_STEER_RETURN: 2.2,
    STEER_RESPONSE_BOOST: 1.6, GRIP_BOOST: 1.3,
    TIRE_GRIP_TARMAC: 1.15, LATERAL_GRIP: 1.0,
    DRIFT_MIN_SPEED: 8, DRIFT_TURN_ACCEL: 1.8, DRIFT_MAX_TURN_RATE: 2.0, DRIFT_SPEED_COST: 0.45,
    DRIFT_MAX_SLIP_ANGLE: 0.6, DRIFT_YAW_GAIN: 5.0, SLIDE_ALIGN_RATE: 4.0, SLIDE_ALIGN_DEADBAND: 0.05,
    BUMP_IMPACT_SPEED: 3.5, WALL_BOUNCE: 0.25, WALL_SCRAPE_DECEL: 6,
    MAX_BRAKE_DECEL: 8, ROLLING_RESISTANCE_COEF: 0.015, DRAG_COEF: 0.35, FRONTAL_AREA: 2.0, AIR_DENSITY: 1.2,
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Per-car parameters: base + the car's overrides + Circuit Racer's global
  // handling boosts (its main.js applyCar).
  function params(spec) {
    var p = {};
    for (var k in BASE) p[k] = BASE[k];
    for (var o in spec.physics) p[o] = spec.physics[o];
    p.WHEELBASE = spec.wb;
    p.STEER_RESPONSE_RATE *= p.STEER_RESPONSE_BOOST;
    p.TIRE_GRIP_TARMAC *= p.GRIP_BOOST;
    return p;
  }

  function torqueAt(p, rpm) {
    var t = p.TORQUE_CURVE;
    if (rpm <= t[0].rpm) return t[0].torque;
    for (var i = 0; i < t.length - 1; i++) {
      if (rpm <= t[i + 1].rpm) return t[i].torque + ((rpm - t[i].rpm) / (t[i + 1].rpm - t[i].rpm)) * (t[i + 1].torque - t[i].torque);
    }
    return t[t.length - 1].torque;
  }

  // Forward acceleration along the body axis (Circuit Racer
  // longitudinalAccel); also returns the rpm in out.rpm.
  function longAccel(p, vf, gear, throttle, brake, out) {
    var ratio = p.GEAR_RATIOS[gear - 1];
    var rpm = clamp((Math.abs(vf) / p.WHEEL_RADIUS) * ratio * p.FINAL_DRIVE * (60 / (2 * Math.PI)), p.IDLE_RPM, p.REDLINE_RPM);
    out.rpm = rpm;
    var tq = torqueAt(p, rpm) * p.TORQUE_BOOST * p.TORQUE_SCALE;
    if (rpm >= p.REDLINE_RPM - 50) tq *= 0.2; // limiter
    var drive = ((tq * ratio * p.FINAL_DRIVE * p.DRIVETRAIN_EFFICIENCY) / p.WHEEL_RADIUS) * throttle;
    var drag = 0.5 * p.AIR_DENSITY * p.DRAG_COEF * p.FRONTAL_AREA * vf * Math.abs(vf);
    var roll = vf > 0 ? p.ROLLING_RESISTANCE_COEF * p.CAR_MASS * p.GRAVITY : 0;
    var brk = vf > 0 ? brake * p.MAX_BRAKE_DECEL * p.CAR_MASS : 0;
    return (drive - drag - roll - brk) / p.CAR_MASS;
  }

  var Physics = { BASE: BASE, params: params };

  Physics.create = function (spec) {
    return {
      spec: spec, p: params(spec),
      x: 0, y: 0, h: 0, heading: 0, vx: 0, vy: 0, speed: 0, vf: 0, vl: 0,
      gear: 1, rpm: 900, steer: 0, drifting: false, slip: 0, idx: 0,
      wallHit: 0, onWall: false, autoGear: true, prog: 0, finished: false,
      pitch: 0, roll: 0, accel: 0, latAcc: 0, wheelSpin: 0,
    };
  };

  Physics.place = function (c, index, lateral) {
    var C = DR.Course, s = C.samples[index];
    c.x = s.x + s.nx * (lateral || 0);
    c.y = s.y + s.ny * (lateral || 0);
    c.heading = s.heading;
    c.vx = c.vy = c.speed = c.vf = c.vl = 0;
    c.gear = 1; c.rpm = c.p.IDLE_RPM; c.steer = 0; c.drifting = false; c.slip = 0;
    c.idx = index; c.h = s.h; c.onWall = false;
  };

  var tmp = { rpm: 0 };

  // input: {throttle 0..1, brake 0..1, drift 0|1, steer -1..1 (+ = left)}
  Physics.update = function (c, input, dt) {
    var p = c.p, C = DR.Course, S = C.samples, mu = p.TIRE_GRIP_TARMAC, g = p.GRAVITY;
    var fx = Math.cos(c.heading), fy = Math.sin(c.heading), lx = -fy, ly = fx;
    var vf = c.vx * fx + c.vy * fy, vl = c.vx * lx + c.vy * ly;
    var s = S[c.idx];

    var wasDrifting = c.drifting;
    // Releasing the steer key does not end the drift at once: the lock eases
    // back at DRIFT_STEER_RETURN, so tapping the key trims the angle.
    c.drifting = input.drift > 0 && (input.steer !== 0 || (wasDrifting && Math.abs(c.steer) > 0.05)) && c.speed > p.DRIFT_MIN_SPEED;
    // Entering a drift: the lock starts small and then grows with how long
    // the drift is held (below), instead of snapping to full lock.
    if (c.drifting && !wasDrifting) c.steer = clamp(c.steer, -p.DRIFT_STEER_START, p.DRIFT_STEER_START);
    c.driftTime = c.drifting ? (c.driftTime || 0) + dt : 0;

    var a = longAccel(p, vf, c.gear, input.throttle, input.brake, tmp);
    // Gravity along the body: the road's grade in the direction the nose points.
    a -= g * s.grade * Math.cos(c.heading - s.heading);
    // Handbrake (no steering): locks the rears and scrubs speed.
    if (input.drift > 0 && !c.drifting && vf > 0) a -= 4.5;
    var vf0 = vf;
    vf += a * dt;
    if (vf < 0) vf = 0; // no reverse gear
    c.rpm = tmp.rpm;
    c.accel = (vf - vf0) / dt;

    var target = input.steer, d = target - c.steer;
    var rate = Math.abs(target) < Math.abs(c.steer) ? p.STEER_RETURN_RATE : p.STEER_RESPONSE_RATE;
    if (c.drifting) {
      // While drifting the lock changes at a fixed, gentle rate: holding the
      // key for twice as long gives twice the angle.
      rate = Math.abs(target) > Math.abs(c.steer) && target * c.steer >= 0 ? p.DRIFT_STEER_RATE : p.DRIFT_STEER_RETURN;
      c.steer += (Math.abs(d) <= rate * dt ? d : (d > 0 ? 1 : -1) * rate * dt);
    } else c.steer += clamp(d, -1, 1) * rate * dt;
    c.steer = clamp(c.steer, -1, 1);

    var slip = c.speed > 0.5 ? Math.atan2(-vl, Math.max(vf, 0.01)) : 0;
    var yaw;
    if (c.drifting) {
      var sp = Math.sqrt(vf * vf + vl * vl), turn = 0;
      if (sp > 0.1) {
        turn = Math.min((Math.abs(c.steer) * p.DRIFT_TURN_ACCEL * mu * g) / sp, p.DRIFT_MAX_TURN_RATE) * (c.steer < 0 ? -1 : 1);
      }
      var ns = Math.max(0, sp - p.DRIFT_SPEED_COST * Math.abs(turn) * sp * dt);
      var k = sp > 0 ? ns / sp : 0;
      var wx = (fx * vf + lx * vl) * k, wy = (fy * vf + ly * vl) * k;
      var ca = Math.cos(turn * dt), sa = Math.sin(turn * dt);
      c.vx = wx * ca - wy * sa;
      c.vy = wx * sa + wy * ca;
      yaw = turn + (c.steer * p.DRIFT_MAX_SLIP_ANGLE - slip) * p.DRIFT_YAW_GAIN;
      c.latAcc = turn * sp;
    } else {
      var lim = p.MAX_STEER_ANGLE;
      if (vf > 0.1) lim = Math.min(lim, Math.atan((p.WHEELBASE * p.STEER_GRIP_TARGET * mu * g) / (vf * vf)));
      yaw = (vf / p.WHEELBASE) * Math.tan(c.steer * lim);
      var ex = Math.abs(slip) - p.SLIDE_ALIGN_DEADBAND;
      if (ex > 0) yaw -= (slip > 0 ? ex : -ex) * p.SLIDE_ALIGN_RATE;
      var step = p.LATERAL_GRIP * mu * g * dt;
      vl = Math.abs(vl) <= step ? 0 : vl - (vl > 0 ? step : -step);
      c.vx = fx * vf + lx * vl;
      c.vy = fy * vf + ly * vl;
      c.latAcc = yaw * vf;
    }
    c.heading += yaw * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    c.idx = C.nearest(c.x, c.y, c.idx, 12);
    rails(c, p, dt);

    fx = Math.cos(c.heading); fy = Math.sin(c.heading);
    c.vf = c.vx * fx + c.vy * fy;
    c.vl = -c.vx * fy + c.vy * fx;
    c.speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    c.slip = c.speed > 3 ? Math.atan2(-c.vl, Math.max(c.vf, 0.01)) : 0;
    c.h = C.roadHeight(c.x, c.y, c.idx);
    var s2 = S[c.idx];
    c.prog = s2.dist + (c.x - s2.x) * Math.cos(s2.heading) + (c.y - s2.y) * Math.sin(s2.heading);
    c.wheelSpin += (c.vf / c.spec.tyre) * dt;
    // Drift score time: seconds of a real slide (slip angle above ~9 degrees,
    // full value from ~20 degrees), so holding the handbrake on a straight
    // earns nothing.
    var dw = c.drifting && c.speed > 12 ? clamp((Math.abs(c.slip) - 0.15) / 0.2, 0, 1) : 0;
    c.driftSec = (c.driftSec || 0) + dw * dt;
  };

  // Guardrails along both edges, plus the closed ends of the road.
  function rails(c, p, dt) {
    var C = DR.Course, S = C.samples, s = S[c.idx];
    var off = (c.x - s.x) * s.nx + (c.y - s.y) * s.ny;
    var rel = c.heading - s.heading;
    var ext = Math.abs(p.CAR_HALF_WIDTH * Math.cos(rel)) + Math.abs(p.CAR_HALF_LENGTH * Math.sin(rel));
    var side = off > 0 ? 1 : -1, lim = Math.max(0, C.HALF - ext);
    c.onWall = false;
    if (Math.abs(off) > lim) {
      var push = off - side * lim;
      c.x -= s.nx * push; c.y -= s.ny * push;
      c.onWall = true;
      var vn = c.vx * s.nx + c.vy * s.ny;
      if (vn * side > 0) {
        if (Math.abs(vn) > p.BUMP_IMPACT_SPEED) c.wallHit = Math.max(c.wallHit, Math.abs(vn));
        var rm = vn * (1 + p.WALL_BOUNCE);
        c.vx -= s.nx * rm; c.vy -= s.ny * rm;
      }
      var sp = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      if (sp > 0) { var k = Math.max(0, sp - p.WALL_SCRAPE_DECEL * dt) / sp; c.vx *= k; c.vy *= k; }
    }
    // Barriers across both ends of the road.
    var tx = Math.cos(s.heading), ty = Math.sin(s.heading);
    var along = (c.x - s.x) * tx + (c.y - s.y) * ty;
    var endIdx = S.length - 1;
    if ((c.idx === endIdx && along > -p.CAR_HALF_LENGTH) || (c.idx === 0 && along < p.CAR_HALF_LENGTH)) {
      var dir = c.idx === 0 ? -1 : 1, lim2 = dir * -p.CAR_HALF_LENGTH;
      if (dir * (along - lim2) > 0) {
        c.x -= tx * (along - lim2); c.y -= ty * (along - lim2);
        var vt = c.vx * tx + c.vy * ty;
        if (vt * dir > 0) {
          if (Math.abs(vt) > p.BUMP_IMPACT_SPEED) c.wallHit = Math.max(c.wallHit, Math.abs(vt));
          c.vx -= tx * vt * 1.2; c.vy -= ty * vt * 1.2;
        }
      }
    }
  }

  // Circuit Racer's automatic gearbox.
  Physics.autoShift = function (c) {
    var p = c.p, r = p.GEAR_RATIOS;
    if (c.rpm > p.REDLINE_RPM - 250 && c.gear < r.length) { c.gear++; return 1; }
    if (c.gear > 1 && c.rpm < 3400) {
      var lower = (c.rpm * r[c.gear - 2]) / r[c.gear - 1];
      if (lower < p.REDLINE_RPM - 900) { c.gear--; return -1; }
    }
    return 0;
  };
  Physics.shift = function (c, up) {
    if (up && c.gear < c.p.GEAR_RATIOS.length) { c.gear++; return true; }
    if (!up && c.gear > 1) { c.gear--; return true; }
    return false;
  };

  // Simple car-to-car contact: circles pushed apart, momentum shared.
  Physics.collideCars = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = 2.2;
    if (d >= min || d < 1e-3) return 0;
    var nx = dx / d, ny = dy / d, pen = (min - d) / 2;
    a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
    var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      var j = -rv * 0.6;
      a.vx -= nx * j; a.vy -= ny * j; b.vx += nx * j; b.vy += ny * j;
    }
    return -rv;
  };

  // Max speed the car can hold through each sample in grip mode (for the
  // AI): curvature limit from the speed-sensitive lock, then a backward
  // braking pass that includes the downhill pull.
  Physics.speedPlan = function (c, skill) {
    var p = c.p, S = DR.Course.samples, n = S.length, g = p.GRAVITY, mu = p.TIRE_GRIP_TARMAC;
    var v = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var k = 0;
      for (var j = -3; j <= 3; j++) k = Math.max(k, Math.abs(S[Math.max(0, Math.min(n - 1, i + j))].curvature));
      v[i] = k > 1e-5 ? Math.sqrt((p.STEER_GRIP_TARGET * mu * g * skill) / k) : 90;
      v[i] = Math.min(v[i], 90);
    }
    v[n - 1] = 0;
    for (var b = n - 2; b >= 0; b--) {
      var dec = p.MAX_BRAKE_DECEL * 0.8 * skill + g * S[b].grade; // grade < 0 downhill
      dec = Math.max(2, dec);
      v[b] = Math.min(v[b], Math.sqrt(v[b + 1] * v[b + 1] + 2 * dec * DR.Course.SPACING));
    }
    return v;
  };

  // Corner-limited speed for the drift AI at full aggression (frac 1): in a
  // sustained drift the path curves at steer x DRIFT_TURN_ACCEL x mu x g / v^2,
  // so a corner of curvature k can be held at v = sqrt(A / k). A backward
  // braking pass keeps it reachable. The AI scales this by sqrt(pace).
  Physics.driftPlan = function (c) {
    var p = c.p, S = DR.Course.samples, n = S.length, g = p.GRAVITY, A = p.DRIFT_TURN_ACCEL * p.TIRE_GRIP_TARMAC * g;
    var v = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var k = 0;
      for (var j = -4; j <= 4; j++) k = Math.max(k, Math.abs(S[Math.max(0, Math.min(n - 1, i + j))].curvature));
      v[i] = k > 1e-5 ? Math.min(75, Math.sqrt(A / k)) : 75;
    }
    v[n - 1] = 0;
    for (var b = n - 2; b >= 0; b--) {
      var dec = Math.max(3, p.MAX_BRAKE_DECEL * 0.7 + g * S[b].grade);
      v[b] = Math.min(v[b], Math.sqrt(v[b + 1] * v[b + 1] + 2 * dec * DR.Course.SPACING));
    }
    return v;
  };

  DR.Physics = Physics;
})();

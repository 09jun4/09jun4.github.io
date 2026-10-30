// car.js — car physics state + Car.update(dt). Section 5 of PLAN.md.
// Load order: 4th. Depends on: Config, Track, Input.
//
// Velocity model (2026-09-28 rework): the car carries a world-space velocity
// (vx, vy) that is independent of its body heading. Each frame the velocity
// is split into a forward and a lateral component in the body frame; the
// engine/brakes act on the forward part and tyre friction eats the lateral
// part. With full grip the lateral part is removed as fast as steering
// creates it (the car goes where it points). Past the grip limit, lateral friction
// is weak, so the body rotates away from the direction of travel and the car
// slides along its old path.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Car = {
    state: {
      x: 0,
      y: 0,
      heading: Math.PI / 2,
      vx: 0,
      vy: 0,
      speed: 0, // |velocity|, m/s — read by HUD, renderer colours
      forwardSpeed: 0, // velocity along the body heading, m/s
      lateralVelocity: 0, // velocity across the body heading, m/s (+ = left)
      gear: 1,
      rpm: 0, // set to IDLE_RPM in init() once Config exists
      steerSmoothed: 0,
      wheelSteer: 0, // rad, front-wheel angle drawn by renderer.js (+ = left)
      wheelDist: 0, // m rolled by the tyres (renderer.js spins them with it)
      touchingWall: false,
      retired: false, // no control: exploded
      exploded: false,
      beyondTrackLimit: false,
      insideTrackLimit: true,
      nearestSampleIndex: 0,
    },
  };

  // Crash / explosion events for HUD, audio and effects, drained by main.js.
  Car.events = [];

  var clamp = CR.clamp;

  // --- Section 5.1: torque curve lookup ---------------------------------

  function lookupTorqueCurve(rpm) {
    var t = CR.Config.TORQUE_CURVE;
    if (rpm <= t[0].rpm) return t[0].torque;
    for (var i = 0; i < t.length - 1; i++) {
      if (rpm >= t[i].rpm && rpm <= t[i + 1].rpm) {
        var f = (rpm - t[i].rpm) / (t[i + 1].rpm - t[i].rpm);
        return t[i].torque + f * (t[i + 1].torque - t[i].torque);
      }
    }
    return t[t.length - 1].torque;
  }

  var RETIRED_INPUT = { throttle: 0, brake: 0, steerTarget: 0 };

  // Forward acceleration (m/s^2) along the body axis for forward speed vf.
  // Shared by Car.update and Car.measureStats so the menu's numbers come
  // from the same physics. Also leaves the engine RPM in lastRpm.
  var lastRpm = 0;
  function longitudinalAccel(vf, gear, throttle, brake) {
    var cfg = CR.Config;
    // RPM from forward speed & gear (no engine-inertia sim needed).
    var gearRatio = cfg.GEAR_RATIOS[Math.min(gear, cfg.GEAR_RATIOS.length) - 1];
    var rpm = clamp(
      (Math.abs(vf) / cfg.WHEEL_RADIUS) * gearRatio * cfg.FINAL_DRIVE * (60 / (2 * Math.PI)),
      cfg.IDLE_RPM,
      cfg.REDLINE_RPM
    );
    lastRpm = rpm;

    // Engine torque -> tractive force.
    var engineTorque = lookupTorqueCurve(rpm) * cfg.TORQUE_BOOST * (cfg.TORQUE_SCALE || 1);
    if (rpm >= cfg.REDLINE_RPM - 50) engineTorque *= 0.2; // rev limiter bounce/cut
    var driveTorque = engineTorque * gearRatio * cfg.FINAL_DRIVE * cfg.DRIVETRAIN_EFFICIENCY;
    var tractiveForce = (driveTorque / cfg.WHEEL_RADIUS) * throttle;

    // Resistive forces (oppose forward motion).
    var dragForce = 0.5 * cfg.AIR_DENSITY * cfg.DRAG_COEF * cfg.FRONTAL_AREA * vf * Math.abs(vf);
    var rollResist = vf > 0 ? cfg.ROLLING_RESISTANCE_COEF * cfg.CAR_MASS * cfg.GRAVITY : 0;
    var brakeForce = vf > 0 ? brake * cfg.MAX_BRAKE_DECEL * cfg.CAR_MASS : 0;
    return (tractiveForce - dragForce - rollResist - brakeForce) / cfg.CAR_MASS;
  }

  // Pushes the car back if its footprint crosses a wall (at the outer edge
  // of the run-off) and removes the part of the velocity that points into
  // the wall. Also flags track-limit violations for laps.js.
  function collideWithWalls(c, cfg, dt) {
    var s = CR.Track.samples[c.nearestSampleIndex];
    var nx = -Math.sin(s.heading), ny = Math.cos(s.heading); // track-left normal
    var offset = (c.x - s.x) * nx + (c.y - s.y) * ny;

    // Half-extent of the car's rectangle along the track normal.
    var rel = c.heading - s.heading;
    var extent = Math.abs(cfg.CAR_HALF_WIDTH * Math.cos(rel)) + Math.abs(cfg.CAR_HALF_LENGTH * Math.sin(rel));
    // Track limits: the whole car is beyond a white line.
    c.beyondTrackLimit = Math.abs(offset) - extent > cfg.TRACK_WIDTH / 2;
    c.insideTrackLimit = Math.abs(offset) <= cfg.TRACK_WIDTH / 2; // centre back inside

    // Walls sit at the outer edge of the run-off (width varies per sample).
    var side = offset > 0 ? 1 : -1;
    var limit = (side > 0 ? s.wallLeft : s.wallRight) - extent;
    if (limit < 0) limit = 0;

    c.touchingWall = false;
    if (Math.abs(offset) <= limit) return;

    var push = offset - side * limit;
    c.x -= nx * push;
    c.y -= ny * push;
    c.touchingWall = true;

    var vn = c.vx * nx + c.vy * ny; // velocity along the normal
    if (vn * side > 0) {
      // Speed INTO the wall: explode, or just a bump.
      var impact = Math.abs(vn);
      if (!c.retired && impact >= cfg.EXPLODE_IMPACT_SPEED) {
        c.retired = true;
        c.exploded = true;
        Car.events.push({ type: 'explode', impact: impact });
      } else if (impact > cfg.BUMP_IMPACT_SPEED) {
        Car.events.push({ type: 'bump', impact: impact });
      }
      var remove = vn * (1 + cfg.WALL_BOUNCE);
      c.vx -= nx * remove;
      c.vy -= ny * remove;
    }
    // Scraping along the wall bleeds speed.
    var sp = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    if (sp > 0) {
      var k = Math.max(0, sp - cfg.WALL_SCRAPE_DECEL * dt) / sp;
      c.vx *= k;
      c.vy *= k;
    }
  }

  // --- Section 5.5: full per-frame update ---------------------------------

  Car.update = function (dt) {
    var c = Car.state, cfg = CR.Config, input = CR.Input.state;
    var mu = cfg.TIRE_GRIP_TARMAC;
    // A car with fewer gears (switched to mid-race, e.g. single-speed
    // Formula E) can't be in a gear it doesn't have.
    if (c.gear > cfg.GEAR_RATIOS.length) c.gear = cfg.GEAR_RATIOS.length;
    if (c.retired || c.coasting) input = RETIRED_INPUT; // no control; rolls to a stop (coasting: after the chequered flag)

    // Body-frame split of the world velocity.
    var fx = Math.cos(c.heading), fy = Math.sin(c.heading);
    var lx = -fy, ly = fx;
    var vf = c.vx * fx + c.vy * fy;
    var vl = c.vx * lx + c.vy * ly;

    vf += longitudinalAccel(vf, c.gear, input.throttle, input.brake) * dt;
    if (c.retired) vf = Math.max(0, vf - cfg.RETIRED_DECEL * dt);
    if (vf < 0) vf = 0; // no reverse gear
    c.rpm = lastRpm;

    // Steering input smoothing: turn in at STEER_RESPONSE_RATE, return to
    // centre at STEER_RETURN_RATE.
    var steerDelta = input.steerTarget - c.steerSmoothed;
    var towardCentre = Math.abs(input.steerTarget) < Math.abs(c.steerSmoothed);
    var steerRate = towardCentre ? cfg.STEER_RETURN_RATE : cfg.STEER_RESPONSE_RATE;
    var boost = CR.turnBoost(c.speed); // more turning at low speed
    c.steerSmoothed += clamp(steerDelta, -1, 1) * steerRate * (towardCentre ? 1 : boost) * dt;

    // Slip angle: body heading relative to the direction of travel
    // (+ = nose rotated left of where the car is going).
    var slip = c.speed > 0.5 ? Math.atan2(-vl, Math.max(vf, 0.01)) : 0;

    // Grip: kinematic bicycle with a speed-sensitive lock so full lock never
    // asks for more than STEER_GRIP_TARGET x the tyre grip.
    var steerLimit = cfg.MAX_STEER_ANGLE;
    if (vf > 0.1) {
      steerLimit = Math.min(steerLimit, Math.atan((cfg.WHEELBASE * cfg.STEER_GRIP_TARGET * boost * mu * cfg.GRAVITY) / (vf * vf)));
    }
    var yawRate = (vf / cfg.WHEELBASE) * Math.tan(c.steerSmoothed * steerLimit);
    // Front-wheel angle on screen: the real (speed-limited) angle, but at
    // least WHEEL_STEER_MIN_VISUAL at full lock so it stays visible at speed.
    c.wheelSteer = c.steerSmoothed * Math.min(cfg.MAX_STEER_ANGLE, Math.max(steerLimit, cfg.WHEEL_STEER_MIN_VISUAL));
    // After a slide (over the grip limit, or a wall knock) the body
    // straightens toward the direction of travel. The deadband ignores the
    // tiny slip normal cornering produces, so turning is not weakened.
    var excessSlip = Math.abs(slip) - cfg.SLIDE_ALIGN_DEADBAND;
    if (excessSlip > 0) yawRate -= (slip > 0 ? excessSlip : -excessSlip) * cfg.SLIDE_ALIGN_RATE;

    // Lateral tyre friction: removes up to LATERAL_GRIP*mu*g of sideways
    // speed per second — as fast as full-lock steering creates it.
    var latStep = cfg.LATERAL_GRIP * boost * mu * cfg.GRAVITY * dt;
    vl = Math.abs(vl) <= latStep ? 0 : vl - (vl > 0 ? latStep : -latStep);

    // Recombine into world velocity. The velocity is not rotated with the
    // body — the next frame's lateral friction does that.
    c.vx = fx * vf + lx * vl;
    c.vy = fy * vf + ly * vl;
    c.heading += yawRate * dt;

    // Integrate position.
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    c.nearestSampleIndex = CR.Track.findNearestSampleIndexNear(
      c.x, c.y, c.nearestSampleIndex, cfg.NEAREST_SAMPLE_WINDOW
    );
    collideWithWalls(c, cfg, dt);

    // Derived readouts.
    fx = Math.cos(c.heading); fy = Math.sin(c.heading);
    c.forwardSpeed = c.vx * fx + c.vy * fy;
    c.lateralVelocity = -c.vx * fy + c.vy * fx;
    c.speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    c.wheelDist += c.forwardSpeed * dt; // tyres roll with the forward motion
  };

  // Shifting is edge-triggered, called directly from input.js's mouse handler.
  Car.shiftUp = function () {
    var c = Car.state;
    if (c.gear < CR.Config.GEAR_RATIOS.length) {
      c.gear++;
      if (CR.Audio) CR.Audio.shift();
    }
  };
  Car.shiftDown = function () {
    var c = Car.state;
    if (c.gear > 1) {
      c.gear--;
      if (CR.Audio) CR.Audio.shift();
    }
  };

  // Automatic gearbox (touch play): up near the redline, down when the
  // lower gear won't over-rev.
  Car.autoShift = function () {
    var c = Car.state, cfg = CR.Config, ratios = cfg.GEAR_RATIOS;
    if (c.retired) return;
    if (c.rpm > cfg.REDLINE_RPM - 250 && c.gear < ratios.length) {
      Car.shiftUp();
    } else if (c.gear > 1 && c.rpm < 3200) {
      var lowerRpm = (c.rpm * ratios[c.gear - 2]) / ratios[c.gear - 1];
      if (lowerRpm < cfg.REDLINE_RPM - 900) Car.shiftDown();
    }
  };

  // Stops the car and places it on the track centreline at sample `index`,
  // facing along the track.
  function placeAtSample(index, lateral) {
    var c = Car.state;
    var samples = CR.Track.samples;
    if (samples && samples.length > 0) {
      var s = samples[index];
      c.x = s.x + s.nx * (lateral || 0);
      c.y = s.y + s.ny * (lateral || 0);
      c.heading = s.heading;
    }
    c.coasting = false;
    c.vx = 0;
    c.vy = 0;
    c.speed = 0;
    c.forwardSpeed = 0;
    c.lateralVelocity = 0;
    c.gear = 1;
    c.rpm = CR.Config.IDLE_RPM;
    c.steerSmoothed = 0;
    c.wheelSteer = 0;
    c.touchingWall = false;
    c.retired = false;
    c.exploded = false;
    c.beyondTrackLimit = false;
    c.insideTrackLimit = true;
    c.nearestSampleIndex = index;
    if (CR.Camera && CR.Camera.snapToCar) CR.Camera.snapToCar();
  }

  // Place the car at the start of the track (first sample) once the track is
  // built, so it begins on-track rather than at the world origin by coincidence.
  Car.spawnAtTrackStart = function () {
    placeAtSample(0);
  };

  // Grid slot: sample `index`, `lateral` metres left (+) / right (-) of the centreline.
  Car.spawnAt = function (index, lateral) {
    placeAtSample(index, lateral);
  };

  // Straight-line numbers for the car-select screen, measured with the
  // current CR.Config (apply the car's physics first). Full throttle from
  // rest, shifting up near the redline.
  Car.measureStats = function () {
    var cfg = CR.Config, dt = 1 / 120;
    var v = 0, gear = 1, t = 0, t100 = null;
    var shiftRpm = cfg.REDLINE_RPM - 300;
    for (; t < 120; t += dt) {
      var a = longitudinalAccel(v, gear, 1, 0);
      if (lastRpm >= shiftRpm && gear < cfg.GEAR_RATIOS.length) gear++;
      v += a * dt;
      if (t100 === null && v >= 100 / 3.6) t100 = t;
      if (t > 20 && a < 0.005) break;
    }
    return {
      zeroTo100: t100,
      topSpeedKmh: v * 3.6,
      corneringG: Math.min(cfg.STEER_GRIP_TARGET, cfg.LATERAL_GRIP) * cfg.TIRE_GRIP_TARMAC,
      steerTime: 1 / cfg.STEER_RESPONSE_RATE, // s from centre to full lock
      brakeDecel: cfg.MAX_BRAKE_DECEL,
    };
  };

  // Exposed for isolated/unit testing.
  Car._lookupTorqueCurve = lookupTorqueCurve;
  // Best full-throttle forward acceleration (m/s^2) at speed v over all
  // gears, with the current CR.Config (race.js uses it for AI pace profiles).
  Car.maxAccelAt = function (v) {
    var best = -Infinity, n = CR.Config.GEAR_RATIOS.length;
    for (var g = 1; g <= n; g++) {
      var a = longitudinalAccel(v, g, 1, 0);
      if (lastRpm < CR.Config.REDLINE_RPM - 60 || g === n) best = Math.max(best, a);
    }
    return best;
  };

  CR.Car = Car;
})();

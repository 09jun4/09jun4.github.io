// physics.js — RallyPhysics: a stand-alone 4WD rally car model.
// Not the drift/circuit physics. Runs at a fixed 600 Hz, whatever the
// graphics settings, so LOW and HIGH drive exactly the same.
//
//  * 4 wheels, each with its own suspension (spring, bump/rebound damper,
//    bump stop, travel limit), contact patch, load, spin speed, slip ratio
//    and slip angle.
//  * Tyre force: a magic-formula curve over combined slip (longitudinal +
//    lateral, normalised by their peaks) => the force never exceeds the
//    friction ellipse mu * Fz. mu comes from surface x tyre x wear/damage,
//    with load sensitivity.
//  * Body: planar motion (x, z, yaw) + heave, pitch and roll driven by the
//    four springs and by the tyre forces acting below the centre of mass
//    (so braking dives, acceleration squats, cornering rolls and moves load
//    to the outside wheels). Crests and jumps unload the springs and the car
//    flies ballistically.
//  * AWD: engine -> gearbox -> centre coupling (static split + viscous lock)
//    -> axle diffs (limited slip) -> wheels. The engine inertia is reflected
//    onto the wheels when the clutch is closed; launches slip the clutch.
//  * Brakes with front/rear bias, a separate hydraulic handbrake on the rear
//    wheels (it also opens the centre coupling, like a real rally car), and
//    ABS / TCS / ESC that act on wheel torques.
//  * Gearbox: AUTOMATIC, MANUAL (slow shift, any gear) or SEQUENTIAL (fast).
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var D = RL.Data, T = RL.Track;
  var DT = 1 / 600, GRAV = 9.81, ATTACH = 0.1, DRIVE = 1.32;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sign(x) { return x < 0 ? -1 : 1; }

  // Magic-formula shape (peak 1 at s = 1, tail = falloff) for a surface.
  var shapes = {};
  function shape(surfKey) {
    if (shapes[surfKey]) return shapes[surfKey];
    var S = D.SURFACES[surfKey], C = 2 - (2 / Math.PI) * Math.asin(S.falloff), B = Math.tan(Math.PI / (2 * C));
    return (shapes[surfKey] = { B: B, C: C });
  }

  function torqueAt(spec, rpm) {
    var t = spec.torque;
    if (rpm <= t[0][0]) return t[0][1] * Math.max(0, rpm / t[0][0]);
    for (var i = 1; i < t.length; i++) if (rpm <= t[i][0]) {
      var a = t[i - 1], b = t[i], f = (rpm - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * f;
    }
    return t[t.length - 1][1];
  }

  // ---------------------------------------------------------------------
  function create(setup) {
    var spec = D.CAR, a = spec.wheelbase * (1 - spec.frontWeight), b = spec.wheelbase * spec.frontWeight;
    var tw = spec.track / 2;
    var wheels = [
      { name: 'FL', lx: a, ly: -tw, front: true },
      { name: 'FR', lx: a, ly: tw, front: true },
      { name: 'RL', lx: -b, ly: -tw, front: false },
      { name: 'RR', lx: -b, ly: tw, front: false },
    ];
    wheels.forEach(function (w) {
      w.omega = 0; w.angle = 0; w.steer = 0; w.comp = 0; w.compVel = 0; w.Fz = 0; w.kappa = 0; w.alpha = 0;
      w.surf = 'gravel'; w.gy = 0; w.contact = false; w.idx = 0; w.Fx = 0; w.Fy = 0; w.slide = 0; w.wheelY = 0;
      w.tyre = 1; w.susp = 1; w.bump = 0;
    });
    var car = {
      spec: spec, wheels: wheels, setup: setup || defaultSetup(),
      x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, vy: 0, r: 0,
      pitch: 0, roll: 0, pitchRate: 0, rollRate: 0,
      gear: 1, rpm: spec.idleRpm, shiftT: 0, nextGear: 1, clutch: 1, throttleOut: 0,
      steer: 0, idx: 0, s: 0, lat: 0, speed: 0, vLong: 0, vLat: 0, airborne: false, airTime: 0, maxAir: 0,
      engineHealth: 1, absActive: false, tcsActive: false, escActive: false, limiter: false,
      events: [], flip: null, onRoad: true, surface: 'gravel', time: 0,
      revT: 0, lastImpact: 0,
    };
    return car;
  }

  function defaultSetup() {
    return {
      tyre: 'gravel', compound: 'soft', brakeBias: 0.62, stiffness: 1.0, rideHeight: 0.0,
      transmission: 'AUTOMATIC', abs: true, tcs: false, esc: false, damage: true, driftAssist: true,
    };
  }

  // Put the car at rest on the road at distance s (centre of the road).
  function place(car, route, s, lateral) {
    var i = clamp(Math.round(s / route.SP), 0, route.n - 1);
    var h = route.h[i], fx = Math.cos(h), fz = Math.sin(h), lat = lateral || 0;
    car.x = route.x[i] - fz * lat; car.z = route.z[i] + fx * lat; car.yaw = h;
    car.vx = car.vz = car.vy = car.r = 0; car.pitch = car.roll = car.pitchRate = car.rollRate = 0;
    car.idx = i; car.flip = null; car.airborne = false; car.airTime = 0; car.shiftT = 0;
    car.gear = car.setup.transmission === 'AUTOMATIC' ? 1 : (car.gear > 0 ? 1 : 1);
    car.rpm = car.spec.idleRpm;
    var spec = car.spec, k = spec.spring * car.setup.stiffness;
    var gy = T.ground(route, car.x, car.z, i).y;
    car.wheels.forEach(function (w) {
      w.omega = 0; w.idx = i;
      var share = (w.front ? spec.frontWeight : 1 - spec.frontWeight) / 2;
      w.comp = spec.mass * GRAV * share / k; w.compVel = 0;
    });
    var comp0 = spec.mass * GRAV * 0.25 / k;
    car.y = gy + spec.wheelRadius + restLen(car) - comp0 + ATTACH;
    car.events.length = 0;
  }
  function restLen(car) { return car.spec.restLength + car.setup.rideHeight; }

  // ---------------------------------------------------------------------
  // input: { throttle 0..1, brake 0..1, handbrake 0..1, steer -1..1 (already
  //          smoothed, + = right), shiftUp, shiftDown (edge), gear (direct) }
  function update(car, input, frameDt, route) {
    var n = Math.min(40, Math.max(1, Math.round(frameDt / DT)));
    car.events.length = 0;
    applyShifts(car, input);
    for (var i = 0; i < n; i++) step(car, input, DT, route);
    // progress along the road (local search: never jumps legs)
    var L = T.locate(route, car.x, car.z, car.idx, 30);
    car.idx = L.idx; car.s = L.s; car.lat = L.lat; car.roadW = L.w; car.roadY = L.y;
  }

  function applyShifts(car, inp) {
    var mode = car.setup.transmission, spec = car.spec;
    if (mode === 'AUTOMATIC' || car.shiftT > 0 || car.flip) return;
    var target = car.gear;
    if (inp.shiftUp) target = car.gear + 1;
    if (inp.shiftDown) target = car.gear - 1;
    if (mode === 'MANUAL' && inp.gear != null) target = inp.gear;
    target = clamp(target, -1, spec.gears.length);
    if (target === -1 && car.vLong > 2) target = 0;          // no reverse while rolling forward
    if (target === car.gear) return;
    // money-shift protection: refuse a downshift that would over-rev badly
    if (target > 0 && target < car.gear) {
      var w = avgOmega(car), rpm = Math.abs(w) * spec.gears[target - 1] * spec.finalDrive * 60 / (2 * Math.PI);
      if (rpm > spec.limiter + 600) { car.events.push({ type: 'overrev' }); return; }
    }
    startShift(car, target);
  }
  function startShift(car, target) {
    car.nextGear = target; car.shiftT = car.spec.shiftTime[car.setup.transmission] || 0.2;
    car.events.push({ type: 'shift', from: car.gear, to: target });
  }
  function avgOmega(car) { var s = 0; car.wheels.forEach(function (w) { s += w.omega; }); return s / 4; }
  function ratio(car, gear) {
    var spec = car.spec;
    if (gear === 0) return 0;
    if (gear < 0) return -spec.reverse * spec.finalDrive;
    return spec.gears[gear - 1] * spec.finalDrive;
  }

  function autoShift(car, inp) {
    if (car.setup.transmission !== 'AUTOMATIC' || car.shiftT > 0 || inp.hold) return;
    var spec = car.spec, v = car.vLong;
    // reverse: hold the brake at a standstill
    if (car.gear >= 0 && inp.brake > 0.5 && v < 0.6 && inp.throttle < 0.1) { car.revT += DT; if (car.revT > 0.35) { car.gear = -1; car.revT = 0; } return; }
    if (car.gear === -1) { if (inp.throttle > 0.5 && v > -0.6) { car.revT += DT; if (car.revT > 0.2) { car.gear = 1; car.revT = 0; } } else car.revT = 0; return; }
    car.revT = 0;
    if (car.gear === 0) { car.gear = 1; return; }
    var wr = Math.abs(avgOmega(car)) * 60 / (2 * Math.PI);
    var rpm = wr * ratio(car, car.gear);
    var spinning = car.wheels.some(function (w) { return w.kappa > 0.35; });
    var up = inp.throttle > 0.6 ? 7150 : 5600;
    if (rpm > up && car.gear < spec.gears.length && !spinning && !car.airborne) startShift(car, car.gear + 1);
    else if (car.gear > 1) {
      var lower = wr * ratio(car, car.gear - 1), down = inp.brake > 0.2 ? 4300 : (inp.throttle > 0.6 ? 3600 : 2600);
      if (rpm < down && lower < 6900) startShift(car, car.gear - 1);
    }
  }

  // ---------------------------------------------------------------------
  function step(car, inpRaw, dt, route) {
    var spec = car.spec, set = car.setup, ws = car.wheels, i, w;
    car.time += dt;
    var fx = Math.cos(car.yaw), fz = Math.sin(car.yaw), rx = -fz, rz = fx;
    var vLong = car.vx * fx + car.vz * fz, vLat = car.vx * rx + car.vz * rz;
    car.vLong = vLong; car.vLat = vLat; car.speed = Math.hypot(car.vx, car.vz);

    // controls (reverse in automatic swaps the pedals)
    var thr = inpRaw.throttle || 0, brk = inpRaw.brake || 0, hb = inpRaw.handbrake || 0;
    if (car.flip) { thr = 0; brk = 0.3; hb = 0; }
    if (set.transmission === 'AUTOMATIC') {
      autoShift(car, inpRaw);
      if (car.gear === -1) { var t0 = thr; thr = brk; brk = t0; }
    }

    // steering: speed-sensitive lock + Ackermann
    var vAbs = Math.abs(vLong), lock = spec.maxSteer * (1 - 0.45 * clamp((vAbs - 6) / 36, 0, 1));
    var steerIn = clamp(inpRaw.steer || 0, -1, 1), delta = steerIn * lock;
    // Drift assist (RALLY SETTINGS, on by default): while the car slides,
    // the front wheels are pulled toward the direction of travel (automatic
    // counter-steer, like a driver's hands catching the slide), so the
    // player's steering sets the drift angle instead of fighting a spin.
    // The front wheels are turned all the way to the direction of travel, so
    // in a drift the fronts keep their grip and pull the car along while the
    // rear tyres slide: the tail is out, not the whole car crabbing sideways.
    var beta = vAbs > 4 ? Math.atan2(vLat, Math.abs(vLong)) : 0, slideF = 0;
    car.beta = beta;
    var slideAll = vLong > 4 ? clamp((Math.abs(beta) - 0.06) / 0.2, 0, 1) : 0;
    var powerSlide = vLong > 4 ? clamp((Math.abs(beta) - 0.1) / 0.2, 0, 1) : 0; // clearly sideways
    if (set.driftAssist && vLong > 4) {
      slideF = slideAll;
      // aim the fronts along the front axle's own path (body slip + yaw
      // rate * distance to the front axle): the front tyres keep grip and
      // the player's steering adds a little slip on top to pull the nose in
      // or let it run wide; the rear axle does the sliding.
      var phiF = Math.atan2(vLat + car.r * ws[0].lx, Math.abs(vLong));
      var csLock = spec.maxSteer * 1.25;
      delta = clamp(slideF * clamp(phiF, -0.78, 0.78) + delta * (1 - 0.6 * powerSlide), -csLock, csLock);
    }
    car.steer = delta;
    ws[0].steer = delta * (delta < 0 ? 1.08 : 0.93); // FL is the inside wheel turning left
    ws[1].steer = delta * (delta > 0 ? 1.08 : 0.93);
    ws[2].steer = ws[3].steer = 0;

    // ---- suspension + ground contact
    var k = spec.spring * set.stiffness, cB = spec.damperBump * Math.sqrt(set.stiffness), cR = spec.damperRebound * Math.sqrt(set.stiffness);
    var R = spec.wheelRadius, rest = restLen(car), Fsum = 0, pitchT = 0, rollT = 0, contacts = 0;
    var cosP = Math.cos(car.pitch), sinP = Math.sin(car.pitch), sinRo = Math.sin(car.roll);
    for (i = 0; i < 4; i++) {
      w = ws[i];
      var wx = car.x + fx * w.lx + rx * w.ly, wz = car.z + fz * w.lx + rz * w.ly;
      var gr = T.ground(route, wx, wz, w.idx);
      w.idx = gr.loc.idx; w.gy = gr.y; w.surf = gr.surf; w.wx = wx; w.wz = wz;
      var yA = car.y - ATTACH + w.lx * sinP - w.ly * sinRo;
      var len = yA - (gr.y + R);
      var comp = rest - len;
      var hs = 0.7 + 0.3 * w.susp; // damaged suspension: softer, sags
      if (comp > 0) {
        var cv = (comp - w.comp) / dt;
        w.compVel = cv; w.comp = comp;
        // digressive damper: firm on slow body motion (roll, pitch, float
        // after a crest), softer on fast hits so small stones don't kick
        var cc = (cv > 0 ? cB : cR) * hs, av = Math.abs(cv), knee = 0.16;
        var F = k * hs * comp + (av < knee ? cc * cv : sign(cv) * cc * (knee + 0.2 * (av - knee)));
        // hydraulic bump stop (rally dampers): the last 6 cm of travel add a
        // strong velocity-dependent force that soaks up a landing instead of
        // hitting the stop, then the rubber stop past full travel
        var hz = comp - (spec.travel - 0.06);
        if (hz > 0 && cv > 0) F += 14000 * cv * Math.min(1, hz / 0.04) + 20000 * hz;
        if (comp > spec.travel) { var ov = comp - spec.travel; F += spec.bumpStop * ov * (1 + ov / 0.04); w.bump = Math.max(w.bump, cv); }
        else if (w.bump > 0) w.bumpDone = true;
        w.Fz = Math.max(0, F); w.contact = w.Fz > 0;
        w.wheelY = gr.y + R;
      } else {
        w.compVel = 0; w.comp = 0; w.Fz = 0; w.contact = false; if (w.bump > 0) w.bumpDone = true;
        w.wheelY = yA - rest;
      }
      if (w.contact) contacts++;
      Fsum += w.Fz;
      pitchT += w.Fz * w.lx * cosP;
      rollT -= w.Fz * w.ly;
    }
    var wasAir = car.airborne;
    car.airborne = contacts === 0;
    if (car.airborne) { car.airTime += dt; car.maxAir = Math.max(car.maxAir, car.airTime); }
    else {
      if (wasAir && car.airTime > 0.25) {
        car.events.push({ type: 'land', air: car.airTime, vy: car.vy });
        // landing sideways at speed digs in and rolls the car
        if (Math.abs(vLat) > 11 && !car.flip) startFlip(car, sign(vLat));
      }
      car.airTime = 0;
    }

    // ---- drivetrain
    var G0 = ratio(car, car.gear), shifting = car.shiftT > 0;
    if (shifting) {
      car.shiftT -= dt;
      if (car.shiftT <= 0) { car.gear = car.nextGear; car.shiftT = 0; }
    }
    var gearR = shifting ? 0 : G0;
    var wAvg = avgOmega(car), wheelRpm = wAvg * gearR * 60 / (2 * Math.PI);
    var tqMax = torqueAt(spec, car.rpm) * (0.45 + 0.55 * car.engineHealth);
    var limiterCut = car.rpm >= spec.limiter;
    car.limiter = limiterCut && thr > 0.5;
    var thrEff = limiterCut ? 0 : thr;
    if (shifting && set.transmission === 'SEQUENTIAL') thrEff = 0; // ignition cut
    // traction control: cut torque when the driven wheels spin
    car.tcsActive = false;
    if (set.tcs && thrEff > 0.05) {
      var kmax = 0, kp = D.SURFACES[car.surface].slipPeak;
      for (i = 0; i < 4; i++) if (ws[i].contact) kmax = Math.max(kmax, ws[i].kappa * sign(gearR || 1));
      var cut = clamp((kmax - kp * 1.15) / (kp * 1.6), 0, 0.85);
      if (cut > 0.02) { thrEff *= 1 - cut; car.tcsActive = true; }
    }
    // ESC (computed below with the yaw error) may cut too
    var engaged = gearR !== 0 && !shifting, clutchSlip = false, Tout = 0;
    if (engaged) {
      if (Math.abs(wheelRpm) < 1400 * (1 - 0.4 * (car.gear < 0)) && (wheelRpm >= -50 || car.gear < 0)) {
        // launch: the clutch slips, the engine holds revs, full torque passes
        clutchSlip = true;
        if (thrEff > 0.03) {
          var target = 2200 + thrEff * 2900; // rally launch: held near peak torque
          car.rpm += (target - car.rpm) * Math.min(1, dt * 6);
          Tout = torqueAt(spec, car.rpm) * thrEff * (0.45 + 0.55 * car.engineHealth) * gearR;
        } else {
          car.rpm += (spec.idleRpm - car.rpm) * Math.min(1, dt * 4);
          Tout = 0;
        }
      } else {
        car.rpm = Math.max(spec.idleRpm * 0.85, Math.abs(wheelRpm));
        var eb = spec.engineBrake * (car.rpm / spec.redline);
        Tout = (thrEff * tqMax - (1 - thrEff) * eb) * gearR;
      }
    } else {
      // free engine: revs to the throttle (neutral) or to the next gear's rpm
      var tgt = shifting && car.nextGear !== 0 ? Math.abs(wAvg * ratio(car, car.nextGear) * 60 / (2 * Math.PI)) : spec.idleRpm + thr * (spec.redline - spec.idleRpm) * (limiterCut ? 0 : 1);
      car.rpm += (Math.max(spec.idleRpm, tgt) - car.rpm) * Math.min(1, dt * (shifting ? 14 : 5));
    }
    car.rpm = clamp(car.rpm, spec.idleRpm * 0.85, spec.limiter + 100);
    car.clutchSlip = clutchSlip; car.throttleOut = thrEff;

    // torque split: centre coupling (handbrake opens it) + axle diffs
    var wF = (ws[0].omega + ws[1].omega) / 2, wR = (ws[2].omega + ws[3].omega) / 2;
    var hbOpen = hb > 0.2;
    // rear-biased split; more to the rear while sliding on the throttle, so
    // the throttle holds the tail out (power oversteer)
    var fShare = spec.awdFront + ((spec.driftFront || spec.awdFront) - spec.awdFront) * powerSlide * clamp((thrEff - 0.2) / 0.5, 0, 1);
    var TF = Tout * fShare, TRr = Tout * (1 - fShare);
    if (hbOpen) { TF = Tout; TRr = 0; }
    else if (engaged && !clutchSlip) { var vis = spec.centerLock * (wR - wF); TF += vis; TRr -= vis; }
    var dt0 = [TF / 2, TF / 2, TRr / 2, TRr / 2];
    var lsdF = spec.diffLock * (ws[1].omega - ws[0].omega), lsdR = hbOpen ? 0 : spec.diffLock * (ws[3].omega - ws[2].omega);
    dt0[0] += lsdF; dt0[1] -= lsdF; dt0[2] += lsdR; dt0[3] -= lsdR;
    // engine inertia reflected onto the wheels when the clutch is closed
    var Ieng = engaged && !clutchSlip ? spec.engineInertia * gearR * gearR / 4 : 0;

    // ---- yaw control (ESC)
    car.escActive = false;
    var escBrake = [0, 0, 0, 0];
    if (set.esc && vAbs > 7 && !hbOpen && vLong > 0) {
      var Lw = spec.wheelbase, rRef = vLong * Math.tan(delta) / (Lw + 0.0022 * vLong * vLong);
      var muRoad = D.SURFACES[car.surface].mu, rMax = 0.85 * muRoad * GRAV / Math.max(vAbs, 1);
      rRef = clamp(rRef, -rMax, rMax);
      var err = car.r - rRef;
      if (Math.abs(err) > 0.1) {
        car.escActive = true;
        var amt = clamp((Math.abs(err) - 0.1) * 2600, 0, 1400);
        if (Math.abs(car.r) > Math.abs(rRef) && sign(car.r) === sign(rRef || car.r)) {
          // oversteer: brake the outside front
          escBrake[car.r > 0 ? 0 : 1] = amt;
        } else {
          // understeer: brake the inside rear
          escBrake[rRef > 0 ? 3 : 2] = amt * 0.8;
        }
        thrEff *= 0.6;
        for (i = 0; i < 4; i++) dt0[i] *= 0.7;
      }
    }

    // ---- tyres
    var Fwx = 0, Fwz = 0, yawT = 0, Flong = 0, Flat = 0, sinkX = 0, sinkZ = 0;
    var TY = D.TYRES[set.tyre][set.compound];
    car.absActive = false;
    var bias = clamp(set.brakeBias, 0.3, 0.85), surfCount = { gravel: 0, mud: 0, grass: 0 };
    for (i = 0; i < 4; i++) {
      w = ws[i];
      var S = D.SURFACES[w.surf], sh = shape(w.surf);
      surfCount[w.surf]++;
      var dx = fx * w.lx + rx * w.ly, dz = fz * w.lx + rz * w.ly;
      var pvx = car.vx - car.r * dz, pvz = car.vz + car.r * dx;
      var hw = car.yaw + w.steer, wfx = Math.cos(hw), wfz = Math.sin(hw), wrx = -wfz, wrz = wfx;
      var vl = pvx * wfx + pvz * wfz, vt = pvx * wrx + pvz * wrz;
      var Iw = spec.wheelInertia + Ieng;
      // brake torque on this wheel
      var Tb = brk * spec.brakeTorque * (w.front ? bias : 1 - bias) / 2 + escBrake[i];
      if (!w.front && hb > 0) Tb += hb * spec.handbrakeTorque * (set.driftAssist ? 0.7 : 1);
      var Td = dt0[i];
      if (!w.contact) {
        // wheel in the air: only drive / brake
        w.omega += Td / Iw * dt;
        if (Tb > 0) { var dw0 = Tb / Iw * dt; w.omega = Math.abs(w.omega) <= dw0 ? 0 : w.omega - sign(w.omega) * dw0; }
        w.kappa = 0; w.alpha = 0; w.Fx = w.Fy = 0; w.slide = 0;
        w.angle += w.omega * dt;
        continue;
      }
      var mu = S.mu * TY.grip[w.surf] * (0.55 + 0.45 * w.tyre);
      // a rear tyre spun up on loose ground while sliding loses side grip
      // first: the tail swings wide and the throttle holds it there
      if (!w.front && powerSlide > 0) mu *= 1 - (set.driftAssist ? 0.28 : 0.1) * powerSlide * (0.35 + 0.65 * clamp(thrEff, 0, 1));
      var Fz0 = spec.mass * GRAV / 4;
      mu *= clamp(1 - 0.09 * (w.Fz / Fz0 - 1), 0.75, 1.12);
      var Dmax = mu * w.Fz;
      var kp = S.slipPeak, ap = Math.tan(S.anglePeak / (TY.stiff * (0.6 + 0.4 * w.tyre)));
      var den = Math.max(Math.abs(vl), 3);
      var kappa = (w.omega * R - vl) / den;
      // ABS: release a wheel that starts to lock
      if (set.abs && Tb > 0 && !(hb > 0 && !w.front) && kappa < -kp * 1.25 && Math.abs(vl) > 2.5) { Tb *= 0.25; car.absActive = true; }
      var tanA = vt / Math.max(Math.abs(vl), 1.5);
      var sx = kappa / kp, sy = tanA / ap, s = Math.hypot(sx, sy);
      var F = 0, Ck = 0;
      if (s > 1e-6) {
        var at = Math.atan(sh.B * s);
        F = Dmax * Math.sin(sh.C * at);
        Ck = Dmax * sh.C * Math.cos(sh.C * at) * sh.B / (1 + sh.B * sh.B * s * s) / kp;
      } else Ck = Dmax * sh.C * sh.B / kp;
      Ck = Math.max(0, Ck);
      // tyres grip harder pulling than sideways (friction ellipse wider
      // along the tread): driven wheels get DRIVE x the longitudinal force
      var kx = Td > 0 && kappa > 0 ? (w.front ? DRIVE : 1 + (DRIVE - 1) * (1 - powerSlide)) : 1;
      Ck *= kx;
      var Fx = s > 1e-6 ? kx * F * sx / s : 0, Fy = s > 1e-6 ? -F * sy / s : 0;
      // rolling resistance
      Fx -= S.roll * w.Fz * Math.tanh(vl / 0.8);
      // implicit wheel spin update (stable at any load)
      var Tnet = Td - R * Fx;
      var dOm = Tnet / (Iw / dt + Ck * R * R / den);
      var om1 = w.omega + dOm;
      if (Tb > 0) { // Coulomb brake: can stop the wheel, never reverse it
        var dB = Tb / (Iw / dt + Ck * R * R / den);
        om1 = Math.abs(om1) <= dB ? 0 : om1 - sign(om1) * dB;
      }
      // recompute the longitudinal force with the new spin (consistent)
      var kap1 = (om1 * R - vl) / den, sx1 = kap1 / kp, s1 = Math.hypot(sx1, sy);
      if (s1 > 1e-6) { var F1 = Dmax * Math.sin(sh.C * Math.atan(sh.B * s1)); Fx = kx * F1 * sx1 / s1 - S.roll * w.Fz * Math.tanh(vl / 0.8); Fy = -F1 * sy / s1; }
      w.omega = om1; w.kappa = kap1; w.alpha = Math.atan(tanA);
      w.angle += w.omega * dt;
      // low-speed lateral damping (no jitter when parked)
      if (Math.abs(vl) < 1.5 && Math.abs(vt) < 1.5) Fy = clamp(-vt * w.Fz * 0.9, -Dmax, Dmax);
      w.Fx = Fx; w.Fy = Fy;
      w.slide = Math.min(1, Math.hypot(kap1 * 3, tanA * 2.2)) * Math.min(1, car.speed / 6);
      // tyre wear: sliding energy
      if (set.damage) w.tyre = Math.max(0, w.tyre - TY.wear * Math.abs(Fy * vt + Fx * (om1 * R - vl)) * dt * 1.6e-8);
      var gx = Fx * wfx + Fy * wrx, gz = Fx * wfz + Fy * wrz;
      Fwx += gx; Fwz += gz;
      yawT += dx * gz - dz * gx;
      Flong += gx * fx + gz * fz; Flat += gx * rx + gz * rz;
      // sinking drag (mud grabs the car)
      sinkX -= S.visc * w.Fz / 1000 * pvx; sinkZ -= S.visc * w.Fz / 1000 * pvz;
    }
    var best = 'gravel'; for (var key in surfCount) if (surfCount[key] > surfCount[best]) best = key;
    car.surface = best;

    // ---- aero + slope gravity
    var vmag = car.speed;
    Fwx += -spec.dragArea * vmag * car.vx + sinkX;
    Fwz += -spec.dragArea * vmag * car.vz + sinkZ;
    if (contacts > 0) {
      var gF = (ws[0].gy + ws[1].gy - ws[2].gy - ws[3].gy) / 2 / spec.wheelbase;
      var gRt = (ws[1].gy + ws[3].gy - ws[0].gy - ws[2].gy) / 2 / spec.track;
      var share = contacts / 4, m = spec.mass;
      Fwx -= m * GRAV * share * (gF * fx + gRt * rx);
      Fwz -= m * GRAV * share * (gF * fz + gRt * rz);
    }

    // ---- integrate body
    var mass = spec.mass, h = spec.cgHeight;
    car.vx += Fwx / mass * dt; car.vz += Fwz / mass * dt;
    // Drift assist part 2: yaw stabiliser. When sliding, pull the yaw rate
    // toward what the steering asks for (limited by grip), and stop the
    // slide angle growing past ~50 degrees (no sudden spins).
    if (set.driftAssist && vLong > 4 && slideF > 0) {
      var muA = D.SURFACES[car.surface].mu, rAsk = vLong * Math.tan(steerIn * lock) / spec.wheelbase;
      var rLim = 1.25 * muA * GRAV / Math.max(vAbs, 3);
      rAsk = clamp(rAsk, -rLim, rLim);
      yawT += -(car.r - rAsk) * 2600 * slideF;
      if (Math.abs(beta) > 0.72) yawT += sign(beta) * (Math.abs(beta) - 0.72) * 26000; // beta>0 = nose left of travel: turn right
    }
    car.r += yawT / spec.yawInertia * dt;
    if (car.airborne) car.r *= 1 - 0.3 * dt;
    car.x += car.vx * dt; car.z += car.vz * dt; car.yaw += car.r * dt;
    // vertical / pitch / roll
    car.vy += (Fsum / mass - GRAV) * dt;
    car.y += car.vy * dt;
    pitchT += h * Flong; rollT -= h * Flat;
    pitchT -= 2400 * car.pitchRate; rollT -= 1100 * car.rollRate; // chassis damping (calm body)
    car.pitchRate += pitchT / spec.pitchInertia * dt;
    car.rollRate += rollT / spec.rollInertia * dt;
    if (car.airborne) { car.pitchRate *= 1 - 0.8 * dt; car.rollRate *= 1 - 0.8 * dt; }
    car.pitch += car.pitchRate * dt; car.roll += car.rollRate * dt;
    car.pitch = clamp(car.pitch, -0.5, 0.5); car.roll = clamp(car.roll, -0.45, 0.45);
    // never sink through the ground (body floor)
    var gmin = Math.max(ws[0].gy, ws[1].gy, ws[2].gy, ws[3].gy) + 0.12 + ATTACH;
    if (car.y < gmin) { car.y = gmin; if (car.vy < 0) { if (car.vy < -6) car.events.push({ type: 'bottom', vy: car.vy }); car.vy = 0; } }

    // ---- suspension damage from big hits (bump stop at speed)
    // (one hit = one bump-stop contact; the damage uses its peak speed)
    for (i = 0; i < 4; i++) {
      w = ws[i];
      if (!w.bumpDone) continue;
      if (w.bump > 4.2) {
        if (set.damage && w.bump > 5.6) w.susp = Math.max(0, w.susp - (w.bump - 5.6) * 0.03); // normal jump landings are free
        car.events.push({ type: 'suspHit', wheel: i, v: w.bump });
      }
      w.bump = 0; w.bumpDone = false;
    }
    // engine: running on the limiter for long wears it
    if (set.damage && car.limiter) car.engineHealth = Math.max(0, car.engineHealth - dt * 0.0012);

    collide(car, route, dt);
    if (car.flip) flipStep(car, dt);
  }

  // ---------------------------------------------------------------------
  // Obstacles (trees, rocks): the car is three circles along its length.
  var CIRC = [1.35, 0, -1.35], CR = 0.92;
  function collide(car, route, dt) {
    var fx = Math.cos(car.yaw), fz = Math.sin(car.yaw), spec = car.spec;
    for (var c = 0; c < 3; c++) {
      var px = car.x + fx * CIRC[c], pz = car.z + fz * CIRC[c];
      route.obHash.near(px, pz, 3, function (o) {
        var dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz), min = CR + o.r;
        if (d >= min || d < 1e-4) return;
        var nx = dx / d, nz = dz / d, pen = min - d;
        car.x += nx * pen; car.z += nz * pen;
        var ox = fx * CIRC[c], oz = fz * CIRC[c];
        var vpx = car.vx - car.r * oz, vpz = car.vz + car.r * ox;
        var vn = vpx * nx + vpz * nz;
        if (vn >= 0) return;
        var rn = ox * nz - oz * nx;
        var j = -(1 + 0.25) * vn / (1 / spec.mass + rn * rn / spec.yawInertia);
        car.vx += j * nx / spec.mass; car.vz += j * nz / spec.mass; car.r += j * rn / spec.yawInertia;
        // friction along the contact
        var tx = -nz, tz = nx, vt = vpx * tx + vpz * tz, jt = clamp(-vt * spec.mass * 0.35, -0.5 * j, 0.5 * j);
        car.vx += jt * tx / spec.mass; car.vz += jt * tz / spec.mass;
        var impact = -vn;
        if (impact > 2.5) hit(car, impact, c, nx, nz, o);
      });
    }
  }
  function hit(car, impact, circle, nx, nz, o) {
    if (car.time - car.lastImpact < 0.25) return;
    car.lastImpact = car.time;
    car.events.push({ type: 'impact', v: impact, kind: o.kind });
    var rx = -Math.sin(car.yaw), rz = Math.cos(car.yaw), side = nx * rx + nz * rz; // + = hit on the left (pushed right)
    var soft = o.kind === 'bale' ? 0.3 : 1; // hay bales absorb most of a hit
    if (car.setup.damage && impact > 4) {
      var dmg = (impact - 4) / 22 * soft;
      var wi = circle === 0 ? (side > 0 ? 0 : 1) : circle === 2 ? (side > 0 ? 2 : 3) : (side > 0 ? 0 : 1) + (Math.abs(side) > 0.5 ? 2 : 0);
      var w = car.wheels[Math.min(3, wi)];
      w.susp = Math.max(0, w.susp - dmg * 0.9);
      w.tyre = Math.max(0, w.tyre - dmg * 0.6);
      if (circle === 0) car.engineHealth = Math.max(0, car.engineHealth - dmg * 0.7);
    }
    // a heavy side hit trips the car over
    if (impact > 10 && soft === 1 && Math.abs(side) > 0.6 && !car.flip) startFlip(car, side > 0 ? 1 : -1);
  }

  // Rollover: the model above keeps roll small (no tipping physics), so a
  // trip (heavy side impact, sideways landing) starts a scripted roll.
  function startFlip(car, dir) {
    car.flip = { t: 0, dir: dir, roll0: car.roll };
    car.events.push({ type: 'rollover' });
  }
  function flipStep(car, dt) {
    var f = car.flip; f.t += dt;
    car.vx *= 1 - 1.6 * dt; car.vz *= 1 - 1.6 * dt; car.r *= 1 - 2 * dt;
    f.visualRoll = f.dir * Math.min(1, f.t / 1.5) * Math.PI * 3;
  }

  RL.Physics = {
    DT: DT, create: create, place: place, update: update, defaultSetup: defaultSetup,
    torqueAt: torqueAt, ratio: ratio, avgOmega: avgOmega,
  };
})(typeof window !== 'undefined' ? window : globalThis);

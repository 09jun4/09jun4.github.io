// camera.js — perspective chase camera (behind and above the car).
// Load order: after car.js. Depends on: Config, Car.
//
// The camera sits CAM_DISTANCE metres behind the car (along its own lagging
// heading) and CAM_HEIGHT metres up, pitched down CAM_PITCH_DEG, so the road
// ahead recedes toward a horizon near the top of the screen. Canvas 2D has
// no perspective transform, so every vertex is projected here:
//   Camera.beginPoly(); Camera.vertex(x, y, height) ...; Camera.endPoly(ctx)
// adds one polygon (clipped against the near plane) to ctx's current path.
// The camera's heading follows the car's direction of travel with a lag,
// so the car visibly turns on screen when steering and sits at an angle
// while sliding.
// Finish shot (AI 대전, after the chequered flag while the autopilot
// drives): the camera swings round the car over FRONT_SWING seconds and
// tracks it from in front of the nose, low and close.
// Cockpit view (C key / 시점 button): the camera sits at the driver's eyes,
// fixed to the chassis, with a little engine/road vibration; cockpit.js
// draws the halo, mirrors and steering wheel over it. The outside camera
// takes over for the finish shot and when the car is wrecked.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Camera = {
    heading: Math.PI / 2,
    distance: 0, // current distance behind the car (eases out with speed)
    // Frame values set by begin(), read by renderer.js:
    focal: 1, // px
    horizonY: 0, // screen y of the horizon
    width: 0,
    height: 0,
    pos: { x: 0, y: 0, h: 0 }, // camera position (world metres)
    frontT: 0, // 0 = chase view, 1 = finish shot from the front
    mode: 'chase', // 'chase' | 'cockpit' (player's choice, kept per browser)
    viewHeading: Math.PI / 2, // heading of the view drawn this frame
  };

  var VIEW_KEY = 'f1-champion.view';
  try { if (localStorage.getItem(VIEW_KEY) === 'cockpit') Camera.mode = 'cockpit'; } catch (e) { /* storage unavailable */ }

  // Driver's eye in car-local metres (forward, height) and the lens.
  // A game-style cockpit camera: the whole cockpit (eye, halo, mirrors and
  // wheel, see cockpit.js COCKPIT_Y) sits 0.6 m further forward than the
  // driver's real seat, with a wide lens, so the wheel is big and the front
  // tyres fill the lower corners of the screen.
  // Raised a little (0.9 -> 0.95 m) and angled further down so more of the
  // road ahead clears the cockpit rim while the halo stays above it.
  var EYE = { forward: 0.4, height: 0.95, pitch: 10, focal: 0.72, centerY: 0.45 };
  Camera.EYE = EYE;
  var shakeT = 0;

  // True while the cockpit view is what's on screen.
  Camera.inCockpit = function () {
    var c = CR.Car.state;
    return Camera.mode === 'cockpit' && !c.retired && !c.autopilot && !Camera.cine;
  };

  // 리얼리스틱 pit stop: a TV shot that orbits the car at its box, from the
  // last metres of the approach until it pulls away (real/real-pit.js).
  Camera.cine = null;
  function pitShot(c) {
    var P = CR.RealPit && CR.Config.REAL && c.inPit ? CR.RealPit.player : null;
    if (!P) return null;
    var near = P.phase === 'stop' || (P.phase === 'in' && P.box !== null && P.box - P.rel < 45) || (P.phase === 'out' && P.rel - P.box < 25);
    if (!near) return null;
    var t = P.phase === 'stop' ? P.t : P.phase === 'in' ? -(P.box - P.rel) / 12 : P.stopTime + (P.rel - P.box) / 10;
    return { t: t, side: CR.RealPit.side };
  }
  Camera.setMode = function (m) {
    Camera.mode = m === 'cockpit' ? 'cockpit' : 'chase';
    try { localStorage.setItem(VIEW_KEY, Camera.mode); } catch (e) { /* storage unavailable */ }
    return Camera.mode;
  };
  Camera.toggleMode = function () { return Camera.setMode(Camera.mode === 'cockpit' ? 'chase' : 'cockpit'); };

  var FRONT_SWING = 0.8; // s to swing round
  var FRONT = { distance: 8.5, height: 1.9, pitch: 5, centerY: 0.52 };

  function ease(t) { return t * t * (3 - 2 * t); }

  var NEAR = 0.5; // m, near clipping plane depth
  // The cockpit parts sit within half a metre of the driver's eyes, so the
  // cockpit overlay draws with a closer near plane, then restores it.
  Camera.setNear = function (d) { NEAR = d; };

  var camX = 0, camY = 0, fx = 0, fy = 1, rx = 1, ry = 0;
  var cosP = 1, sinP = 0, camH = 10, cx = 0, cy = 0;

  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  // Direction the camera wants to face: where the car is going, or where
  // it points when nearly stopped.
  function targetHeading(c) {
    if (c.speed > CR.Config.CAMERA_TRAVEL_MIN_SPEED) return Math.atan2(c.vy, c.vx);
    return c.heading;
  }

  // 리얼리스틱 start: TV shots while the first three lights come on, then the
  // player's own view from the fourth light. 1: along the whole grid, 2: own
  // car from the nose round to the side, 3: the same from the other end.
  function startShot() {
    var R = CR.Race;
    if (!CR.Config.REAL || !R || !R.active || !R.real || R.phase !== 'lights') return null;
    var t = R.lightsT || 0;
    if (t < 2) return { kind: 'grid', t: t / 2 };
    if (t < 3) return { kind: 'front', t: t - 2 };
    if (t < 4) return { kind: 'rear', t: t - 3 };
    return null;
  }

  Camera.update = function (dt) {
    var c = CR.Car.state, cfg = CR.Config;
    Camera.cine = startShot() || pitShot(c);
    var diff = wrapAngle(targetHeading(c) - Camera.heading);
    Camera.heading += diff * Math.min(1, cfg.CAMERA_ROTATE_RATE * dt);

    // Pull back a little with speed.
    var target = cfg.CAM_DISTANCE + Math.min(cfg.CAM_SPEED_PULLBACK, c.speed * 0.1);
    Camera.distance += (target - Camera.distance) * Math.min(1, 2 * dt);

    if (c.autopilot) Camera.frontT = Math.min(1, Camera.frontT + dt / FRONT_SWING);
    else Camera.frontT = 0;
    shakeT += dt;
  };

  Camera.snapToCar = function () {
    Camera.heading = CR.Car.state.heading;
    Camera.distance = CR.Config.CAM_DISTANCE;
    Camera.frontT = 0;
  };

  // Sets up the projection for this frame (canvas CSS-pixel size).
  Camera.begin = function (canvas) {
    var c = CR.Car.state, cfg = CR.Config;
    if (Camera.inCockpit()) {
      // Fixed to the chassis at the driver's eyes; a fine vibration that
      // grows with speed, plus a slow bob over the road surface.
      var sp = Math.min(1, c.speed / 90);
      var shake = 0.0035 * sp * Math.sin(shakeT * 61) + 0.006 * sp * Math.sin(shakeT * 7.3) + 0.002 * Math.sin(shakeT * 23);
      var fx0 = Math.cos(c.heading), fy0 = Math.sin(c.heading);
      var ex = c.x + fx0 * EYE.forward, ey = c.y + fy0 * EYE.forward;
      Camera.setView(canvas.clientWidth, canvas.clientHeight, ex + fx0, ey + fy0, c.heading, 1,
        EYE.height + shake, EYE.pitch + shake * 40, EYE.focal, EYE.centerY);
      return;
    }
    if (Camera.cine && Camera.cine.kind) {
      var sh2 = Camera.cine, e2 = ease(sh2.t), W = canvas.clientWidth, Hh = canvas.clientHeight;
      if (sh2.kind === 'grid') {
        // camera flies beside the grid from the back row to the front row
        var x = CR.Race._ctx(), S = CR.Track.samples, rows = (CR.Race.ai.length + 1) * CR.Race.GRID_SPACING + 12;
        var rel = -rows + (rows - 6) * e2, i = x.indexAt(x.wrapDist(rel), 0), s = S[i];
        Camera.setView(W, Hh, s.x, s.y, s.heading - Math.PI / 2 + 0.55, 12, 3.4, 11, cfg.CAM_FOCAL, 0.55);
      } else {
        var b0 = sh2.kind === 'front' ? 0 : Math.PI, b1 = sh2.kind === 'front' ? Math.PI / 2 : Math.PI * 1.5;
        var bearing = c.heading + b0 + (b1 - b0) * e2;
        Camera.setView(W, Hh, c.x, c.y, bearing + Math.PI, 5.6, 1.3, 4, cfg.CAM_FOCAL, 0.55);
      }
      Camera.heading = c.heading;
      return;
    }
    if (Camera.cine) {
      // Bearing from the car to the camera sweeps from the front quarter to the
      // pit-wall side, inside the lane and above the fence: the crew with the
      // garage behind them, like the TV pit cameras.
      var sh = Camera.cine, a = 0.55 + Math.max(-0.4, Math.min(3.5, sh.t)) * 0.36;
      var dir = c.heading + Math.PI - sh.side * a;
      Camera.setView(canvas.clientWidth, canvas.clientHeight, c.x, c.y, dir, 6.0, 4.5, 29, cfg.CAM_FOCAL * 0.9, 0.52);
      Camera.heading = c.heading;
      return;
    }
    var dist = Camera.distance || cfg.CAM_DISTANCE, k = ease(Camera.frontT);
    if (k > 0) {
      // Orbit from behind (0) to in front (pi), easing height/pitch/distance.
      Camera.setView(canvas.clientWidth, canvas.clientHeight, c.x, c.y, Camera.heading + Math.PI * k,
        dist + (FRONT.distance - dist) * k, cfg.CAM_HEIGHT + (FRONT.height - cfg.CAM_HEIGHT) * k,
        cfg.CAM_PITCH_DEG + (FRONT.pitch - cfg.CAM_PITCH_DEG) * k, cfg.CAM_FOCAL,
        cfg.CAM_CENTER_Y + (FRONT.centerY - cfg.CAM_CENTER_Y) * k);
      return;
    }
    Camera.setView(canvas.clientWidth, canvas.clientHeight, c.x, c.y, Camera.heading,
      dist, cfg.CAM_HEIGHT, cfg.CAM_PITCH_DEG, cfg.CAM_FOCAL, cfg.CAM_CENTER_Y);
  };

  // General view: looking along `heading` at target (tx, ty) from `dist`
  // behind and `height` up. Also used for the car-select previews.
  Camera.setView = function (w, h, tx, ty, heading, dist, height, pitchDeg, focal, centerY) {
    Camera.viewHeading = heading;
    fx = Math.cos(heading);
    fy = Math.sin(heading);
    rx = fy; // right of the heading
    ry = -fx;
    camX = tx - fx * dist;
    camY = ty - fy * dist;
    camH = height;
    var p = (pitchDeg * Math.PI) / 180;
    cosP = Math.cos(p);
    sinP = Math.sin(p);
    Camera.focal = focal * h;
    cx = w / 2;
    cy = h * centerY;
    Camera.horizonY = cy - Camera.focal * Math.tan(p);
    Camera.width = w;
    Camera.height = h;
    Camera.pitch = p; // read by the 높음 renderer (gfx/hi-renderer.js)
    Camera.centerPx = cy;
    Camera.pos.x = camX;
    Camera.pos.y = camY;
    Camera.pos.h = camH;
  };

  // Projects one world point; returns false if it is behind the near plane.
  // Result in Camera.out {x, y, depth}.
  Camera.out = { x: 0, y: 0, depth: 0 };
  Camera.project = function (x, y, h) {
    var dx = x - camX, dy = y - camY;
    var z = dx * fx + dy * fy;
    var side = dx * rx + dy * ry;
    var up = (h || 0) - camH;
    var depth = z * cosP - up * sinP;
    Camera.out.depth = depth;
    if (depth < NEAR) return false;
    var v = up * cosP + z * sinP;
    Camera.out.x = cx + (Camera.focal * side) / depth;
    Camera.out.y = cy - (Camera.focal * v) / depth;
    return true;
  };

  // Forward distance of a world point from the camera (for culling).
  Camera.forward = function (x, y) {
    return (x - camX) * fx + (y - camY) * fy;
  };

  // Sideways distance (right of the view axis) of a world point.
  Camera.side = function (x, y) {
    return (x - camX) * rx + (y - camY) * ry;
  };

  // Half-width of the view per metre of forward distance (screen edge).
  Camera.halfFov = function () {
    return cx / Camera.focal;
  };

  // --- Polygon projection with near-plane clipping ------------------------

  var MAXV = 64;
  var inS = new Float64Array(MAXV), inV = new Float64Array(MAXV), inD = new Float64Array(MAXV);
  var outS = new Float64Array(MAXV), outV = new Float64Array(MAXV), outD = new Float64Array(MAXV);
  var count = 0;

  Camera.beginPoly = function () {
    count = 0;
  };

  Camera.vertex = function (x, y, h) {
    if (count >= MAXV) return;
    var dx = x - camX, dy = y - camY;
    var z = dx * fx + dy * fy;
    var up = (h || 0) - camH;
    inS[count] = dx * rx + dy * ry;
    inV[count] = up * cosP + z * sinP;
    inD[count] = z * cosP - up * sinP;
    count++;
  };

  // Clips the polygon to depth >= NEAR and appends it to ctx's path.
  Camera.endPoly = function (ctx) {
    var n = 0;
    for (var i = 0; i < count; i++) {
      var j = i + 1 < count ? i + 1 : 0;
      var di = inD[i], dj = inD[j];
      var iIn = di >= NEAR, jIn = dj >= NEAR;
      if (iIn) {
        outS[n] = inS[i]; outV[n] = inV[i]; outD[n] = di; n++;
      }
      if (iIn !== jIn) {
        var t = (NEAR - di) / (dj - di);
        outS[n] = inS[i] + (inS[j] - inS[i]) * t;
        outV[n] = inV[i] + (inV[j] - inV[i]) * t;
        outD[n] = NEAR;
        n++;
      }
    }
    if (n < 3) return false;
    var f = Camera.focal;
    ctx.moveTo(cx + (f * outS[0]) / outD[0], cy - (f * outV[0]) / outD[0]);
    for (var k = 1; k < n; k++) ctx.lineTo(cx + (f * outS[k]) / outD[k], cy - (f * outV[k]) / outD[k]);
    ctx.closePath();
    return true;
  };

  CR.Camera = Camera;
})();

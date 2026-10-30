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
  };

  var FRONT_SWING = 0.8; // s to swing round
  var FRONT = { distance: 8.5, height: 1.9, pitch: 5, centerY: 0.52 };

  function ease(t) { return t * t * (3 - 2 * t); }

  var NEAR = 0.5; // m, near clipping plane depth

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

  Camera.update = function (dt) {
    var c = CR.Car.state, cfg = CR.Config;
    var diff = wrapAngle(targetHeading(c) - Camera.heading);
    Camera.heading += diff * Math.min(1, cfg.CAMERA_ROTATE_RATE * dt);

    // Pull back a little with speed.
    var target = cfg.CAM_DISTANCE + Math.min(cfg.CAM_SPEED_PULLBACK, c.speed * 0.1);
    Camera.distance += (target - Camera.distance) * Math.min(1, 2 * dt);

    if (c.autopilot) Camera.frontT = Math.min(1, Camera.frontT + dt / FRONT_SWING);
    else Camera.frontT = 0;
  };

  Camera.snapToCar = function () {
    Camera.heading = CR.Car.state.heading;
    Camera.distance = CR.Config.CAM_DISTANCE;
    Camera.frontT = 0;
  };

  // Sets up the projection for this frame (canvas CSS-pixel size).
  Camera.begin = function (canvas) {
    var c = CR.Car.state, cfg = CR.Config;
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

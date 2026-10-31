// cockpit.js — first-person (driver's eye) view in 3D: halo, cockpit rim
// and sides, working rear-view mirrors and the F1 steering wheel.
// Everything is modelled in car-local metres (x right, y forward, z up)
// and projected through the same camera as the track, so it holds its
// place in perspective and moves with the head shake. The wheel is the
// SVG from wheel.js laid on a tilted plane in front of the driver: its
// four projected corners give a CSS perspective transform (homography),
// and steering turns it within that plane.
// Load order: after renderer.js, hud.js, wheel.js. Depends on: Camera,
// Renderer, Car, Laps, Race, Wheel, EngineSound (at call time).
//
// C (or the 시점 button on touch screens) switches between the chase
// camera and the cockpit; the choice is kept per browser (camera.js).
//  - Mirrors: housings on stalks beside the cockpit. The scene is rendered
//    a second time from the driver's head looking backwards (every other
//    frame, low resolution), flipped like a mirror, and each glass shows
//    its half.
//  - Wheel screen: gear, speed, lap, position, lap time, a live delta to
//    your best lap (time at every point of the lap, as real cars do), tyre
//    temperatures, ERS charge, brake balance and engine braking.
//  - Shift lights: 15 LEDs (5 green, 5 red, 5 blue) fill with rpm and all
//    flash blue at the shift point.
//  - Warning LEDs: yellow on the left when off the track limits or against
//    a wall, blue on the right when an AI car is right behind you.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Cockpit = {};
  var wheelBox = null, wheelSvg = null;
  var mirror = null, mirrorCtx = null, mirrorFrame = 0;
  var ers = 0.7, tyres = [85, 85, 85, 85];
  var trace = [], bestTrace = null, traceLap = 0, traceTrack = null;
  var MIRROR_W = 560, MIRROR_H = 96; // rear image (both mirrors), CSS px

  function shiftLights(rf) {
    // Lights come on from 55 % of the rev range, full at the shift point.
    return Math.max(0, Math.min(1, (rf - 0.55) / (0.94 - 0.55)));
  }

  Cockpit.init = function () {
    wheelBox = document.createElement('div');
    wheelBox.id = 'cockpit-wheel';
    wheelBox.hidden = true;
    document.body.appendChild(wheelBox);
    wheelSvg = CR.Wheel.build(wheelBox);
    mirror = document.createElement('canvas');
    mirrorCtx = mirror.getContext('2d');
    var b = document.getElementById('tc-view');
    if (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); Cockpit.toggle(); });
      updateButton();
    }
  };

  function updateButton() {
    var b = document.getElementById('tc-view');
    if (b) b.textContent = CR.Camera.mode === 'cockpit' ? '◎ 3인칭' : '◎ 1인칭';
  }

  Cockpit.toggle = function () {
    var m = CR.Camera.toggleMode();
    updateButton();
    if (CR.Hud && CR.Hud.flash) CR.Hud.flash(m === 'cockpit' ? '1인칭 시점' : '3인칭 시점', 'is-lap');
    return m;
  };

  // --- Live delta to the best lap -----------------------------------------

  function updateDelta() {
    var L = CR.Laps, n = CR.Track.samples.length;
    if (traceTrack !== CR.Track.samples || L.best === null && bestTrace) {
      traceTrack = CR.Track.samples; trace = []; bestTrace = null; traceLap = L.lap;
    }
    if (L.lap !== traceLap) {
      // A lap just finished: if it was the new best, its trace is the reference.
      if (L.lap > traceLap && L.best !== null && L.last === L.best) bestTrace = trace;
      trace = [];
      traceLap = L.lap;
    }
    var p = Math.floor(L.progress());
    if (p >= 0 && p < n && trace[p] === undefined) trace[p] = L.current();
    if (!bestTrace || p < 0 || p >= n) return null;
    // nearest recorded point of the best lap at or before here
    for (var k = p; k >= 0 && k > p - 20; k--) {
      if (bestTrace[k] !== undefined && trace[k] !== undefined) return trace[k] - bestTrace[k];
    }
    return null;
  }

  // --- Cosmetic systems: ERS charge and tyre temperatures ------------------

  function updateSystems(dt, c, input) {
    var thr = c.autopilot ? 0 : input.throttle, brk = input.brake || 0;
    // Deploy on full throttle at speed, harvest under braking and on lift.
    if (thr > 0.8 && c.speed > 30) ers -= 0.022 * dt;
    else if (brk > 0) ers += 0.06 * brk * dt * Math.min(1, c.speed / 30);
    else ers += 0.008 * dt;
    ers = Math.max(0, Math.min(1, ers));
    var slide = Math.min(1, Math.abs(c.lateralVelocity || 0) / 4);
    for (var i = 0; i < 4; i++) {
      var front = i < 2;
      var target = 78 + c.speed * 0.28 + slide * 30 + (front ? brk * 14 : thr * 8);
      tyres[i] += (target - tyres[i]) * Math.min(1, dt * 0.25);
    }
  }

  Cockpit.reset = function () { ers = 0.7; tyres = [85, 85, 85, 85]; };

  // --- 3D geometry (car-local metres: x right, y forward, z up) -------------

  // The cockpit geometry below is given relative to the cockpit (eye at
  // forward -0.2); COCKPIT_Y moves it all along the car (camera.js EYE).
  var COCKPIT_Y = 0.6;
  var C3 = { cos: 0, sin: 0, x: 0, y: 0 };
  function setCar(c) { C3.cos = Math.cos(c.heading); C3.sin = Math.sin(c.heading); C3.x = c.x; C3.y = c.y; }
  function V(lx, ly, z) {
    ly += COCKPIT_Y;
    CR.Camera.vertex(C3.x + ly * C3.cos + lx * C3.sin, C3.y + ly * C3.sin - lx * C3.cos, z);
  }
  function P(lx, ly, z) {
    ly += COCKPIT_Y;
    return CR.Camera.project(C3.x + ly * C3.cos + lx * C3.sin, C3.y + ly * C3.sin - lx * C3.cos, z)
      ? { x: CR.Camera.out.x, y: CR.Camera.out.y } : null;
  }
  // Filled polygon from [lx, ly, z] points (clipped at the near plane).
  function poly(ctx, pts, fill) {
    CR.Camera.beginPoly();
    for (var i = 0; i < pts.length; i++) V(pts[i][0], pts[i][1], pts[i][2]);
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (CR.Camera.endPoly(ctx)) ctx.fill();
  }
  function mirrorX(pts) { return pts.map(function (p) { return [-p[0], p[1], p[2]]; }); }

  // Halo: a titanium hoop over the driver's head on two rear mounts, joined
  // to the chassis ahead by the centre pillar. Control points of the right
  // half's centreline, smoothed into a curve.
  var HALO_CTRL = [[0, 0.12, 1.04], [0.1, 0.1, 1.04], [0.19, 0.04, 1.035], [0.26, -0.06, 1.03], [0.31, -0.2, 1.02],
    [0.34, -0.4, 1.0], [0.36, -0.6, 0.95], [0.37, -0.8, 0.82]];
  var HALO_W = 0.07, HALO_T = 0.045; // tube width (in plan) and depth
  var PILLAR = [[0, 0.12, 1.0], [0, 0.85, 0.62]];
  var HALO = (function () {
    // Catmull-Rom through the control points, mirrored into one curve
    // running right rear -> apex -> left rear.
    var half = HALO_CTRL, pts = [];
    var full = half.slice().reverse().concat(half.slice(1).map(function (p) { return [-p[0], p[1], p[2]]; }));
    for (var i = 0; i < full.length - 1; i++) {
      var p0 = full[Math.max(0, i - 1)], p1 = full[i], p2 = full[i + 1], p3 = full[Math.min(full.length - 1, i + 2)];
      for (var k = 0; k < 4; k++) {
        var t = k / 4, t2 = t * t, t3 = t2 * t;
        pts.push([0, 1, 2].map(function (d) {
          return 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
        }));
      }
    }
    pts.push(full[full.length - 1]);
    // plan-view normal at each point (towards the outside of the hoop)
    return pts.map(function (p, i) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return { p: p, nx: -dy / l, ny: dx / l };
    });
  })();

  // Several quads into one path, filled once (no seams between them).
  function quads(ctx, list, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (var i = 0; i < list.length; i++) {
      CR.Camera.beginPoly();
      for (var k = 0; k < list[i].length; k++) V(list[i][k][0], list[i][k][1], list[i][k][2]);
      CR.Camera.endPoly(ctx);
    }
    ctx.fill();
  }

  function drawHalo(ctx) {
    var under = [], inner = [], w = HALO_W / 2, t = HALO_T;
    for (var i = 0; i < HALO.length - 1; i++) {
      var A = HALO[i], B = HALO[i + 1], a = A.p, b = B.p;
      // the curve runs right -> left, so -n points inwards (towards the driver)
      var aOut = [a[0] + A.nx * w, a[1] + A.ny * w], aIn = [a[0] - A.nx * w, a[1] - A.ny * w];
      var bOut = [b[0] + B.nx * w, b[1] + B.ny * w], bIn = [b[0] - B.nx * w, b[1] - B.ny * w];
      under.push([[aIn[0], aIn[1], a[2] - t], [aOut[0], aOut[1], a[2] - t], [bOut[0], bOut[1], b[2] - t], [bIn[0], bIn[1], b[2] - t]]);
      inner.push([[aIn[0], aIn[1], a[2] - t], [bIn[0], bIn[1], b[2] - t], [bIn[0], bIn[1], b[2]], [aIn[0], aIn[1], a[2]]]);
    }
    quads(ctx, inner, '#20242b');
    quads(ctx, under, '#111317');
    // Centre pillar: back face (towards the driver) and the two sides.
    var top = PILLAR[0], bot = PILLAR[1], wt = 0.026, wb = 0.04;
    quads(ctx, [[[-wt, top[1], top[2]], [-wb, bot[1], bot[2]], [-wb * 0.5, bot[1] + 0.05, bot[2]], [-wt * 0.5, top[1] + 0.05, top[2]]]], '#262a31');
    quads(ctx, [[[wt, top[1], top[2]], [wb, bot[1], bot[2]], [wb * 0.5, bot[1] + 0.05, bot[2]], [wt * 0.5, top[1] + 0.05, top[2]]]], '#0c0d10');
    quads(ctx, [[[-wt, top[1], top[2]], [wt, top[1], top[2]], [wb, bot[1], bot[2]], [-wb, bot[1], bot[2]]]], '#17191e');
  }

  // Thin 3D bar (suspension arm) from a to b, as a ribbon facing up.
  function bar(ctx, a, b, w, fill) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    var nx = -dy / l * w / 2, ny = dx / l * w / 2;
    poly(ctx, [[a[0] + nx, a[1] + ny, a[2]], [b[0] + nx, b[1] + ny, b[2]], [b[0] - nx, b[1] - ny, b[2]], [a[0] - nx, a[1] - ny, a[2]]], fill);
    poly(ctx, [[a[0], a[1], a[2] + w / 3], [b[0], b[1], b[2] + w / 3], [b[0], b[1], b[2] - w / 3], [a[0], a[1], a[2] - w / 3]], fill);
  }

  // Cockpit, drawn far to near: front suspension, sidepods, the tub with
  // the driver's legs, the sides, the deck sloping to the nose, and the
  // padded rim around the opening. Coordinates are cockpit-relative (the
  // front wheels' axle is at forward 0.75).
  function drawBody(ctx, main) {
    var col = hexToRgb(main);
    var lit = rgb(col, 0.95), mid = rgb(col, 0.72), low = rgb(col, 0.48), dim = rgb(col, 0.32);
    var carbon = '#15171b', carbonHi = '#22252b';
    [1, -1].forEach(function (sg) {
      function M(p) { return [p[0] * sg, p[1], p[2]]; }
      // front suspension: upper and lower wishbones, push rod
      bar(ctx, M([0.27, 0.6, 0.47]), M([0.6, 0.76, 0.42]), 0.035, carbonHi);
      bar(ctx, M([0.26, 0.92, 0.46]), M([0.6, 0.76, 0.42]), 0.035, carbonHi);
      bar(ctx, M([0.25, 0.58, 0.24]), M([0.6, 0.76, 0.2]), 0.035, carbon);
      bar(ctx, M([0.23, 0.96, 0.22]), M([0.6, 0.76, 0.2]), 0.035, carbon);
      bar(ctx, M([0.3, 0.68, 0.52]), M([0.58, 0.78, 0.22]), 0.03, '#2b2f36');
      // sidepod: outer face, inlet, top
      poly(ctx, [M([0.94, -0.75, 0.42]), M([0.94, 0.28, 0.42]), M([0.94, 0.28, 0.08]), M([0.94, -0.75, 0.08])], dim);
      poly(ctx, [M([0.62, 0.32, 0.48]), M([0.94, 0.28, 0.42]), M([0.94, 0.28, 0.1]), M([0.62, 0.32, 0.1])], '#050607');
      poly(ctx, [M([0.62, 0.32, 0.48]), M([0.62, 0.32, 0.43]), M([0.94, 0.28, 0.38]), M([0.94, 0.28, 0.42])], low);
      poly(ctx, [M([0.64, -0.75, 0.5]), M([0.62, 0.32, 0.48]), M([0.94, 0.28, 0.42]), M([0.94, -0.75, 0.42])], mid);
    });
    // The tub: floor, inner walls, front bulkhead and the driver's legs.
    poly(ctx, [[-0.2, -0.75, 0.22], [0.2, -0.75, 0.22], [0.2, 0.37, 0.22], [-0.2, 0.37, 0.22]], '#07080a');
    [1, -1].forEach(function (sg) {
      poly(ctx, [[0.2 * sg, -0.75, 0.67], [0.2 * sg, 0.37, 0.67], [0.2 * sg, 0.37, 0.22], [0.2 * sg, -0.75, 0.22]], '#0e1013');
      // leg: thigh to shin, race suit
      poly(ctx, [[0.035 * sg, -0.25, 0.36], [0.15 * sg, -0.25, 0.36], [0.14 * sg, 0.34, 0.33], [0.045 * sg, 0.34, 0.33]], '#252b3a');
      poly(ctx, [[0.035 * sg, -0.25, 0.36], [0.045 * sg, 0.34, 0.33], [0.045 * sg, 0.34, 0.26], [0.035 * sg, -0.25, 0.28]], '#1a1f2b');
    });
    poly(ctx, [[-0.2, 0.37, 0.67], [0.2, 0.37, 0.67], [0.2, 0.37, 0.22], [-0.2, 0.37, 0.22]], '#0b0c0f');
    // sides from the rim down to the sidepods
    var sideR = [[0.33, -0.75, 0.66], [0.33, 0.42, 0.66], [0.28, 0.75, 0.6], [0.62, 0.32, 0.48], [0.64, -0.75, 0.5]];
    poly(ctx, sideR, mid);
    poly(ctx, mirrorX(sideR), mid);
    // front deck (towards the nose), with its sides falling to the floor
    poly(ctx, [[-0.33, 0.42, 0.66], [0.33, 0.42, 0.66], [0.22, 1.15, 0.5], [-0.22, 1.15, 0.5]], lit);
    [1, -1].forEach(function (sg) {
      poly(ctx, [[0.33 * sg, 0.42, 0.66], [0.22 * sg, 1.15, 0.5], [0.2 * sg, 1.15, 0.12], [0.3 * sg, 0.42, 0.12]], low);
    });
    // padded rim (black) around the opening
    var rimR = [[0.2, -0.75, 0.67], [0.2, 0.28, 0.67], [0.12, 0.36, 0.67], [0.14, 0.44, 0.67], [0.34, 0.42, 0.67], [0.34, -0.75, 0.67]];
    poly(ctx, rimR, '#0c0d10');
    poly(ctx, mirrorX(rimR), '#0c0d10');
    poly(ctx, [[-0.14, 0.36, 0.67], [0.14, 0.36, 0.67], [0.14, 0.45, 0.67], [-0.14, 0.45, 0.67]], '#0c0d10');
  }

  // Mirrors: glass 0.2 m x 0.07 m facing back towards the driver.
  var MIRRORS = [
    { side: 'L', c: [-0.5, 0.52, 0.8] },
    { side: 'R', c: [0.5, 0.52, 0.8] },
  ];
  var GLASS_W = 0.2, GLASS_H = 0.07;

  function drawMirrors(ctx, w, h) {
    MIRRORS.forEach(function (m) {
      var sg = m.side === 'L' ? -1 : 1, cx = m.c[0], cy = m.c[1], cz = m.c[2];
      // the glass is angled ~20° to face the driver's eyes
      var yaw = 0.35 * sg, ux = Math.cos(yaw), uy = Math.sin(yaw); // across the glass
      var hw = GLASS_W / 2, hh = GLASS_H / 2;
      // short stalk down to the bodywork
      poly(ctx, [[cx - 0.01, cy + 0.02, cz - hh], [cx + 0.01, cy + 0.02, cz - hh], [cx * 1.08 + 0.01, cy + 0.04, cz - 0.17], [cx * 1.08 - 0.01, cy + 0.04, cz - 0.17]], '#0d0f12');
      // carbon shell: a rim around the glass, a few mm behind it
      var hx = hw + 0.012, hz = hh + 0.012;
      poly(ctx, [[cx - ux * hx, cy - uy * hx + 0.012, cz - hz], [cx + ux * hx, cy + uy * hx + 0.012, cz - hz],
        [cx + ux * hx, cy + uy * hx + 0.012, cz + hz], [cx - ux * hx, cy - uy * hx + 0.012, cz + hz]], '#121418');
      // glass corners on screen
      var tl = P(cx - ux * hw, cy - uy * hw, cz + hh), tr = P(cx + ux * hw, cy + uy * hw, cz + hh);
      var bl = P(cx - ux * hw, cy - uy * hw, cz - hh), br = P(cx + ux * hw, cy + uy * hw, cz - hh);
      if (!tl || !tr || !bl || !br) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.clip();
      // Map the image half onto the glass (affine through tl, tr, bl),
      // flipped left-right like a mirror.
      var half = MIRROR_W / 2, src = m.side === 'L' ? half : 0;
      var ax = (tl.x - tr.x) / half, ay = (tl.y - tr.y) / half; // image x -> screen (flipped)
      var bx2 = (bl.x - tl.x) / MIRROR_H, by2 = (bl.y - tl.y) / MIRROR_H; // image y -> screen
      ctx.setTransform(ax * DPR, ay * DPR, bx2 * DPR, by2 * DPR, tr.x * DPR, tr.y * DPR);
      ctx.drawImage(mirror, src, 0, half, MIRROR_H, 0, 0, half, MIRROR_H);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var g = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.07)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    });
  }

  function renderMirrorImage(c) {
    var eye = CR.Camera.EYE;
    if (mirror.width !== MIRROR_W) { mirror.width = MIRROR_W; mirror.height = MIRROR_H; }
    mirrorCtx.setTransform(1, 0, 0, 1, 0, 0);
    var back = c.heading + Math.PI, bx = Math.cos(back), by = Math.sin(back);
    CR.Renderer.render(mirrorCtx, mirror, 0, {
      w: MIRROR_W, h: MIRROR_H, player: 'mirror', particles: false, lite: true,
      view: function (w, h) {
        // From the driver's head, looking backwards.
        var ex = c.x - bx * eye.forward, ey = c.y - by * eye.forward;
        CR.Camera.setView(w, h, ex + bx, ey + by, back, 1, eye.height, 1.5, 2.1, 0.5);
      },
    });
  }

  function hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgb(c, k) { return 'rgb(' + ((c[0] * k) | 0) + ',' + ((c[1] * k) | 0) + ',' + ((c[2] * k) | 0) + ')'; }

  // --- Steering wheel on its tilted plane ----------------------------------

  var WHEEL = { forward: 0.3, below: 0.145, width: 0.33, tilt: 0.42 }; // m from the eyes; tilt rad from vertical
  var SVG_W = 1000, SVG_H = 640, SVG_CX = 500, SVG_CY = 330;

  // Solves the 3x3 homography taking the SVG rectangle to four screen points.
  function homography(dst) {
    var src = [[0, 0], [SVG_W, 0], [SVG_W, SVG_H], [0, SVG_H]];
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // Gaussian elimination
    for (var c = 0; c < 8; c++) {
      var piv = c;
      for (var r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      var tA = A[c]; A[c] = A[piv]; A[piv] = tA;
      var tb = b[c]; b[c] = b[piv]; b[piv] = tb;
      for (var r2 = c + 1; r2 < 8; r2++) {
        var f = A[r2][c] / A[c][c];
        for (var k = c; k < 8; k++) A[r2][k] -= f * A[c][k];
        b[r2] -= f * b[c];
      }
    }
    var hh = new Array(8);
    for (var r3 = 7; r3 >= 0; r3--) {
      var sum = b[r3];
      for (var k2 = r3 + 1; k2 < 8; k2++) sum -= A[r3][k2] * hh[k2];
      hh[r3] = sum / A[r3][r3];
    }
    return hh;
  }

  function placeWheel(steerDeg) {
    var eye = CR.Camera.EYE;
    var cy0 = eye.forward - COCKPIT_Y + WHEEL.forward, cz0 = eye.height - WHEEL.below;
    var s = WHEEL.width / SVG_W; // metres per SVG unit
    var upY = -Math.sin(WHEEL.tilt), upZ = Math.cos(WHEEL.tilt); // wheel "up": up and back towards the driver
    var a = steerDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    var corners = [[0, 0], [SVG_W, 0], [SVG_W, SVG_H], [0, SVG_H]], dst = [];
    for (var i = 0; i < 4; i++) {
      var px = (corners[i][0] - SVG_CX) * s, py = (SVG_CY - corners[i][1]) * s; // right, up in the wheel plane
      var rx = px * ca - py * sa, ry = px * sa + py * ca; // turned by the steering
      var q = P(rx, cy0 + ry * upY, cz0 + ry * upZ);
      if (!q) return false;
      dst.push([q.x, q.y]);
    }
    var hh = homography(dst);
    var m = [hh[0], hh[3], 0, hh[6], hh[1], hh[4], 0, hh[7], 0, 0, 1, 0, hh[2], hh[5], 0, 1];
    wheelBox.style.transform = 'matrix3d(' + m.map(function (v) { return v.toFixed(6); }).join(',') + ')';
    return true;
  }

  // --- Frame --------------------------------------------------------------------

  var DPR = 1;
  var steerDeg = 0;

  // Called by main.js after the 3D scene, while the cockpit view is on.
  Cockpit.draw = function (ctx, canvas, dt) {
    var c = CR.Car.state, w = canvas.clientWidth, h = canvas.clientHeight;
    DPR = canvas.width / Math.max(1, w);
    var def = CR.Car.def;
    var main = '#d4a82a';
    if (def && def.model) {
      for (var i = 0; i < def.model.length; i++) if (def.model[i].prism && def.model[i].prism.length > 6) { main = def.model[i].color; break; }
    }
    // Mirrors refresh every 2nd frame (every 3rd on touch screens).
    var every = document.body.classList.contains('touch') ? 3 : 2;
    if (mirrorFrame++ % every === 0) renderMirrorImage(c);
    CR.Camera.begin(canvas); // the mirror render changed the view
    CR.Camera.setNear(0.03);
    setCar(c);
    drawBody(ctx, main);
    drawMirrors(ctx, w, h);
    drawHalo(ctx);
    // ~±90° of wheel at parking speed, ~±25° at racing speed.
    steerDeg = (c.steerSmoothed || 0) * (0.28 + 0.72 * Math.max(0, 1 - c.speed / 45)) * 90;
    placeWheel(-steerDeg);
    CR.Camera.setNear(0.5);
  };

  // Per-frame wheel update (also hides / shows it).
  Cockpit.update = function (dt) {
    var on = CR.Camera.inCockpit() && (CR.Main.state === 'playing' || CR.Main.state === 'paused');
    document.body.classList.toggle('cockpit', on);
    if (wheelBox.hidden === on) wheelBox.hidden = !on;
    if (!on || !dt) return;
    var c = CR.Car.state, cfg = CR.Config, input = CR.Input.state, def = CR.Car.def;
    updateSystems(dt, c, input);
    var delta = updateDelta();
    var rf = Math.max(0, Math.min(1, (c.rpm - cfg.IDLE_RPM) / (cfg.REDLINE_RPM - cfg.IDLE_RPM)));
    var voice = CR.EngineSound && CR.EngineSound.VOICES[def.id];
    var rpm = voice && !voice.electric ? voice.idle + (voice.redline - voice.idle) * rf : 20000 * rf;
    var race = CR.Race && CR.Race.active;
    var flagL = c.beyondTrackLimit || c.touchingWall ? 'yellow' : null;
    var flagR = null;
    if (race && CR.Race.phase === 'green') {
      var fx = Math.cos(c.heading), fy = Math.sin(c.heading);
      CR.Race.ai.forEach(function (o) {
        var dx = o.x - c.x, dy = o.y - c.y, along = dx * fx + dy * fy;
        if (along < -1 && along > -22 && Math.abs(dx * -fy + dy * fx) < 6) flagR = 'blue';
      });
    }
    CR.Wheel.update(wheelSvg, {
      gear: def.electric ? 'D' : c.speed < 0.3 && !input.throttle ? 'N' : String(c.gear),
      kph: c.speed * 3.6,
      rpm: rpm,
      shift: shiftLights(rf),
      flash: rf >= 0.955,
      lap: Math.min(CR.Laps.lap, race ? CR.Race.LAPS : 99),
      laps: race ? CR.Race.LAPS : 0,
      pos: race ? CR.Race.position() : 0,
      lapTime: CR.Laps.current(),
      delta: delta,
      ers: ers,
      bb: 56.5,
      eb: 6,
      mode: thrMode(input),
      tyres: tyres,
      flagL: flagL,
      flagR: flagR,
      steer: 0, // turned in 3D by placeWheel()
      accent: def.color,
    }, performance.now());
  };

  function thrMode(input) {
    return ers > 0.05 && input.throttle > 0.8 ? 'DEPLOY' : input.brake > 0 ? 'HARVEST' : 'RACE';
  }

  CR.Cockpit = Cockpit;
})();

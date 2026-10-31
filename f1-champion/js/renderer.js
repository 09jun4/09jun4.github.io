// renderer.js — draws the track, the car and explosions
// through the perspective chase camera (camera.js).
// Load order: after camera.js. Depends on: Config, Track, Car, Camera.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Renderer = {};

  // Circuit look: grass outside, a low concrete wall at the outer edge of a
  // paved run-off, dark asphalt racing surface bounded by white lines (the
  // track limits), red/white kerbs just outside the lines through corners.
  // The speed-vs-limit colour (SPEED_COLOR_STOPS) is a translucent layer on
  // top of the asphalt.
  var SKY_TOP = '#6f9fcf';
  var SKY_HORIZON = '#c9dbe8';
  var HAZE = '201, 219, 232'; // rgb of the distance haze (matches the horizon)
  var GRASS_COLOR = '#2d4a2b';
  var WALL_COLOR = '#c9ccd1';
  var WALL_TOP_COLOR = '#e6e8eb';
  var WALL_HEIGHT = 0.9; // m
  var WALL_THICKNESS = 0.6; // m
  var WALL_CHUNK = 12; // samples per wall fill (far-to-near ordering between chunks)
  var RUNOFF_COLOR = '#4a4d52';
  var ASPHALT_COLOR = '#2a2b2f';
  var EDGE_LINE_COLOR = 'rgba(255, 255, 255, 0.85)';
  var EDGE_LINE_WIDTH = 0.4;
  var EDGE_LINE_INSET = 0.2; // line sits just inside the track limit
  var KERB_WIDTH = 1.0;
  var KERB_MIN_CURVATURE = 1 / 300; // kerbs only on real corners (radius < 300 m)
  var KERB_RED = '#d6322f';
  var KERB_WHITE = '#f2f2f2';
  var OVERLAY_BUCKETS = 40; // speed ratio quantized so equal-coloured runs share one fill
  var HAZE_START = 90; // m ahead where the haze starts

  var START_LINE_LIGHT = '#f4f4f4';
  var START_LINE_DARK = '#1a1a1a';
  var START_LINE_SQUARES = 8;


  var Cam = null; // CR.Camera, bound on first render

  // --- Section 7.2: live speed-vs-limit color gradient -------------------

  // Reused scratch object (no per-frame allocation).
  var scratchColor = { r: 0, g: 0, b: 0, a: 1 };

  function colorForSpeedRatio(ratio) {
    var stops = CR.Config.SPEED_COLOR_STOPS;
    if (ratio <= stops[0].t) {
      scratchColor.r = stops[0].r; scratchColor.g = stops[0].g; scratchColor.b = stops[0].b; scratchColor.a = stops[0].a;
      return scratchColor;
    }
    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i], b = stops[i + 1];
      if (ratio >= a.t && ratio <= b.t) {
        var f = (ratio - a.t) / (b.t - a.t);
        scratchColor.r = a.r + f * (b.r - a.r);
        scratchColor.g = a.g + f * (b.g - a.g);
        scratchColor.b = a.b + f * (b.b - a.b);
        scratchColor.a = a.a + f * (b.a - a.a);
        return scratchColor;
      }
    }
    var last = stops[stops.length - 1];
    scratchColor.r = last.r; scratchColor.g = last.g; scratchColor.b = last.b; scratchColor.a = last.a;
    return scratchColor;
  }

  // Asphalt colour per speed bucket: the translucent speed colour already
  // blended over ASPHALT_COLOR, built once (no per-frame strings, and the
  // road is filled in one opaque layer instead of two).
  var overlayStyles = [];
  var ASPHALT_RGB = [0x2a, 0x2b, 0x2f]; // = ASPHALT_COLOR
  function overlayStyle(bucket) {
    var st = overlayStyles[bucket];
    if (!st) {
      var col = colorForSpeedRatio(bucket / OVERLAY_BUCKETS), al = col.a;
      st = overlayStyles[bucket] = 'rgb(' +
        Math.round(ASPHALT_RGB[0] * (1 - al) + col.r * al) + ',' +
        Math.round(ASPHALT_RGB[1] * (1 - al) + col.g * al) + ',' +
        Math.round(ASPHALT_RGB[2] * (1 - al) + col.b * al) + ')';
    }
    return st;
  }

  // Gradients are rebuilt only when the horizon / haze line moves.
  var skyCache = { y: -1, g: null }, hazeCache = { top: -1, start: -1, g: null };

  // --- Track geometry helpers (each adds one projected polygon) -----------

  var visible = new Int32Array(0); // reused list of visible sample indices
  // nextIdx[i] = the next sample drawn after i this frame (i + 1 near the
  // camera, further apart in the distance — see LOD in render()).
  var nextIdx = new Int32Array(0);
  var LOD_NEAR = 120, LOD_FAR = 250; // m: every sample / every 2nd / every 4th

  // Strip between signed offsets o1 and o2 from the centreline (+ = left),
  // sample i to the next, at height h.
  function strip(ctx, samples, i, n, o1a, o2a, o1b, o2b, h) {
    var a = samples[i], b = samples[nextIdx[i]];
    var anx = a.nx, any = a.ny, bnx = b.nx, bny = b.ny;
    Cam.beginPoly();
    Cam.vertex(a.x + anx * o1a, a.y + any * o1a, h);
    Cam.vertex(b.x + bnx * o1b, b.y + bny * o1b, h);
    Cam.vertex(b.x + bnx * o2b, b.y + bny * o2b, h);
    Cam.vertex(a.x + anx * o2a, a.y + any * o2a, h);
    Cam.endPoly(ctx);
  }

  // Vertical wall face at signed offsets oa / ob, from the ground up.
  function wallFace(ctx, samples, i, n, oa, ob) {
    var a = samples[i], b = samples[nextIdx[i]];
    var ax = a.x + a.nx * oa, ay = a.y + a.ny * oa;
    var bx = b.x + b.nx * ob, by = b.y + b.ny * ob;
    Cam.beginPoly();
    Cam.vertex(ax, ay, 0);
    Cam.vertex(bx, by, 0);
    Cam.vertex(bx, by, WALL_HEIGHT);
    Cam.vertex(ax, ay, WALL_HEIGHT);
    Cam.endPoly(ctx);
  }

  // --- Scenery: catch fencing and grandstands --------------------------------
  //
  // Catch fencing stands on every wall: posts leaning in towards the track
  // at the top, cables, and a see-through mesh from the wall top up to
  // FENCE_TOP. Grandstands are placed once per circuit along the straights
  // (both sides of the start/finish straight), set back behind the wall:
  // a front parapet, a raked seating bowl full of spectators, a back wall
  // and a roof with a coloured fascia. The crowd is a texture mapped onto
  // each section of the seating (affine per section), so the people get
  // smaller with distance instead of staying fixed on the screen.
  var FENCE_TOP = 4.1, FENCE_LEAN = 0.55, FENCE_NEAR = 220; // m
  var FENCE_MESH = 'rgba(48, 54, 62, 0.26)', FENCE_POST = '#4f555e', FENCE_CABLE = '#80868f';

  function fenceFace(ctx, samples, i, o, oTop, z0, z1) {
    var a = samples[i], b = samples[nextIdx[i]];
    Cam.beginPoly();
    Cam.vertex(a.x + a.nx * o, a.y + a.ny * o, z0);
    Cam.vertex(b.x + b.nx * o, b.y + b.ny * o, z0);
    Cam.vertex(b.x + b.nx * oTop, b.y + b.ny * oTop, z1);
    Cam.vertex(a.x + a.nx * oTop, a.y + a.ny * oTop, z1);
    Cam.endPoly(ctx);
  }

  function fencePost(ctx, s, o, oTop) {
    var tx = Math.cos(s.heading) * 0.07, ty = Math.sin(s.heading) * 0.07;
    var bx = s.x + s.nx * o, by = s.y + s.ny * o, ux = s.x + s.nx * oTop, uy = s.y + s.ny * oTop;
    Cam.beginPoly();
    Cam.vertex(bx - tx, by - ty, WALL_HEIGHT);
    Cam.vertex(bx + tx, by + ty, WALL_HEIGHT);
    Cam.vertex(ux + tx, uy + ty, FENCE_TOP + 0.05);
    Cam.vertex(ux - tx, uy - ty, FENCE_TOP + 0.05);
    Cam.endPoly(ctx);
  }

  // Grandstand layout for the current circuit (built once per track).
  var stands = null, standsFor = null;
  var STAND = { depth: 11, rise: 8, parapet: 1.6, back: 11.6, roof: 12.4, roofFront: 2.2, gap: 3.5 };
  var FASCIA = ['#c8102e', '#f4f4f4', '#1f4fd1', '#ffd23f', '#0fa3a3', '#1e9a52'];

  function buildStands(samples) {
    var cfg = CR.Config, n = samples.length, sp = cfg.TRACK_SAMPLE_SPACING;
    var straight = function (i) { var s = samples[(i + n) % n]; return Math.abs(s.curvature) < 1 / 700 && !s.bridge; };
    // Runs of straight samples, walking the loop once from a corner.
    var start = 0;
    while (start < n && straight(start)) start++;
    var runs = [], cur = null;
    for (var k = 1; k <= n; k++) {
      var i = (start + k) % n;
      if (straight(i)) { if (!cur) cur = { i0: i, len: 0 }; cur.len++; }
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    var list = [], minLen = Math.ceil(90 / sp), maxLen = Math.ceil(150 / sp);
    var clear = cfg.TRACK_WIDTH / 2 + cfg.RUNOFF_MAX + 6;
    function free(i0, len, side, off) {
      // No other part of the lap may run through the stand's footprint.
      for (var j = 0; j <= len; j += 3) {
        var s = samples[(i0 + j) % n];
        for (var d = 0; d <= STAND.back; d += STAND.back / 2) {
          var px = s.x + s.nx * side * (off + d), py = s.y + s.ny * side * (off + d);
          for (var m = 0; m < n; m += 2) {
            var gap = Math.abs(m - (i0 + j) % n); gap = Math.min(gap, n - gap);
            if (gap < 40) continue;
            var q = samples[m];
            if (Math.abs(q.x - px) < clear && Math.abs(q.y - py) < clear && Math.hypot(q.x - px, q.y - py) < clear) return false;
          }
        }
      }
      return true;
    }
    runs.sort(function (a, b) { return b.len - a.len; });
    runs.forEach(function (r, ri) {
      if (r.len < minLen || list.length >= 10) return;
      var len = Math.min(maxLen, r.len - 6), i0 = (r.i0 + Math.floor((r.len - len) / 2)) % n;
      var into = (0 - r.i0 + n) % n; // how far sample 0 (the line) is into this run
      var main = into < r.len; // the start/finish straight
      if (main) {
        // Stands both sides along the grid and the line: from ~60 % of
        // their length before the line, clamped inside the straight.
        var before = Math.min(into - 2, Math.floor(len * 0.6));
        var after = Math.min(r.len - into - 2, len - before);
        if (before < 0) before = 0;
        len = before + Math.max(0, after);
        i0 = (n - before) % n;
      }
      var sides = main ? [1, -1] : [ri % 2 ? -1 : 1];
      sides.forEach(function (side) {
        var off = 0;
        for (var j = 0; j <= len; j++) {
          var s = samples[(i0 + j) % n];
          off = Math.max(off, (side > 0 ? s.wallLeft : s.wallRight) + WALL_THICKNESS + STAND.gap);
        }
        if (free(i0, len, side, off)) list.push({ i0: i0, len: len, side: side, off: off, fascia: FASCIA[(list.length * 7 + ri) % FASCIA.length] });
      });
    });
    return list;
  }

  var crowdPattern = null, CROWD_PX_M = 16, CROWD_TILE_M = 10, CROWD_ROW_M = 0.95, CROWD_ROWS = 2;
  function makeCrowd(ctx) {
    var W = CROWD_PX_M * CROWD_TILE_M, rowPx = Math.round(CROWD_PX_M * CROWD_ROW_M), H = rowPx * CROWD_ROWS;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var shirts = ['#d63a3a', '#f2f2f2', '#2b5fd9', '#ffd23f', '#1e9a52', '#ff8a1f', '#14171c', '#c8102e', '#7a4bd1', '#0fa3a3', '#e8e8e8', '#e86aa6'];
    var skin = ['#f1c9a5', '#d9a77f', '#a8714f', '#6e452b', '#f5d7bd'];
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var r = 0; r < CROWD_ROWS; r++) {
      var y0 = r * rowPx;
      g.fillStyle = '#3d4654'; // seat row / step
      g.fillRect(0, y0, W, rowPx);
      g.fillStyle = '#2b323d';
      g.fillRect(0, y0 + rowPx - 3, W, 3);
      for (var x = 1; x < W - 4; x += 7 + Math.floor(rnd() * 3)) {
        if (rnd() < 0.08) continue; // an empty seat
        var stand = rnd() < 0.12, top = y0 + (stand ? 1 : 4);
        g.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
        g.fillRect(x, top + 5, 6, rowPx - (top - y0) - 7);
        g.fillStyle = skin[Math.floor(rnd() * skin.length)];
        g.beginPath();
        g.arc(x + 3, top + 3, 2.6, 0, Math.PI * 2);
        g.fill();
        if (rnd() < 0.05) { // a waved flag
          g.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
          g.fillRect(x + 4, top - 1, 6, 4);
        }
      }
    }
    crowdPattern = ctx.createPattern(cv, 'repeat');
  }

  function standPoint(s, side, off, d) {
    return [s.x + s.nx * side * (off + d), s.y + s.ny * side * (off + d)];
  }

  function drawStand(ctx, samples, st, near) {
    var n = samples.length, step = near ? 3 : 6;
    var D = STAND, slopeLen = Math.hypot(D.depth, D.rise - D.parapet);
    var layers = { back: [], seat: [], parapet: [], roof: [], fascia: [] };
    var u = 0;
    for (var j = 0; j < st.len; j += step) {
      var a = samples[(st.i0 + j) % n], b = samples[(st.i0 + Math.min(st.len, j + step)) % n];
      layers.back.push([a, b]);
      var segLen = Math.hypot(b.x - a.x, b.y - a.y);
      // seating: affine crowd texture from three projected corners
      var aLow = standPoint(a, st.side, st.off, 0.5), aHigh = standPoint(a, st.side, st.off, D.depth), bHigh = standPoint(b, st.side, st.off, D.depth);
      var ok = Cam.project(aHigh[0], aHigh[1], D.rise);
      var tl = ok && { x: Cam.out.x, y: Cam.out.y };
      ok = ok && Cam.project(bHigh[0], bHigh[1], D.rise);
      var tr = ok && { x: Cam.out.x, y: Cam.out.y };
      ok = ok && Cam.project(aLow[0], aLow[1], D.parapet);
      var bl = ok && { x: Cam.out.x, y: Cam.out.y };
      layers.seat.push([a, b, ok ? [tl, tr, bl] : null, u, segLen]);
      u += segLen;
    }
    function quad(a, b, d0, z0, d1, z1) {
      var p0 = standPoint(a, st.side, st.off, d0), p1 = standPoint(b, st.side, st.off, d0);
      var p2 = standPoint(b, st.side, st.off, d1), p3 = standPoint(a, st.side, st.off, d1);
      Cam.beginPoly();
      Cam.vertex(p0[0], p0[1], z0); Cam.vertex(p1[0], p1[1], z0);
      Cam.vertex(p2[0], p2[1], z1); Cam.vertex(p3[0], p3[1], z1);
      return Cam.endPoly(ctx);
    }
    // back wall
    ctx.fillStyle = '#566070';
    ctx.beginPath();
    layers.back.forEach(function (q) { quad(q[0], q[1], D.back, 0, D.back, D.roof); });
    ctx.fill();
    // seating with the crowd
    var tile = CROWD_PX_M * CROWD_TILE_M, rows = CROWD_PX_M * CROWD_ROW_M * CROWD_ROWS / (CROWD_ROW_M * CROWD_ROWS);
    layers.seat.forEach(function (q) {
      ctx.beginPath();
      if (!quad(q[0], q[1], 0.5, D.parapet, D.depth, D.rise)) return;
      var c = q[2];
      if (c && crowdPattern && crowdPattern.setTransform) {
        var sx = CROWD_PX_M * q[4], sy = rows * slopeLen;
        var A = (c[1].x - c[0].x) / sx, B = (c[1].y - c[0].y) / sx;
        var Cc = (c[2].x - c[0].x) / sy, Dd = (c[2].y - c[0].y) / sy;
        var u0 = (q[3] * CROWD_PX_M) % tile;
        crowdPattern.setTransform(new DOMMatrix([A, B, Cc, Dd, c[0].x - A * u0, c[0].y - B * u0]));
        ctx.fillStyle = crowdPattern;
      } else ctx.fillStyle = '#5a6272';
      ctx.fill();
    });
    // front parapet and its sponsor stripe
    ctx.fillStyle = '#2b313b';
    ctx.beginPath();
    layers.back.forEach(function (q) { quad(q[0], q[1], 0, 0, 0, D.parapet); });
    ctx.fill();
    ctx.fillStyle = st.fascia;
    ctx.beginPath();
    layers.back.forEach(function (q) { quad(q[0], q[1], -0.02, D.parapet - 0.55, -0.02, D.parapet - 0.15); });
    ctx.fill();
    // ends (cross-section profile)
    ctx.fillStyle = '#48505d';
    [0, st.len].forEach(function (j) {
      var s = samples[(st.i0 + j) % n];
      var prof = [[0, 0], [0, D.parapet], [D.depth, D.rise], [D.back, D.roof], [D.back, 0]];
      Cam.beginPoly();
      prof.forEach(function (p) { var w = standPoint(s, st.side, st.off, p[0]); Cam.vertex(w[0], w[1], p[1]); });
      ctx.beginPath();
      if (Cam.endPoly(ctx)) ctx.fill();
    });
    // roof underside and the fascia along its front edge
    ctx.fillStyle = '#1f242c';
    ctx.beginPath();
    layers.back.forEach(function (q) { quad(q[0], q[1], D.roofFront, D.roof, D.back + 0.3, D.roof); });
    ctx.fill();
    ctx.fillStyle = st.fascia;
    ctx.beginPath();
    layers.back.forEach(function (q) { quad(q[0], q[1], D.roofFront, D.roof - 0.9, D.roofFront, D.roof + 0.1); });
    ctx.fill();
  }

  Renderer.standsFor = function (samples) { return buildStands(samples); }; // for tests

  function drawStands(ctx, samples, lite) {
    if (lite) return;
    if (standsFor !== samples) { stands = buildStands(samples); standsFor = samples; }
    if (!crowdPattern) makeCrowd(ctx);
    var n = samples.length, fov = Cam.halfFov(), cfg = CR.Config, vis = [];
    for (var k = 0; k < stands.length; k++) {
      var st = stands[k], mid = samples[(st.i0 + (st.len >> 1)) % n];
      var p = standPoint(mid, st.side, st.off, 6);
      var f = Cam.forward(p[0], p[1]), half = st.len * cfg.TRACK_SAMPLE_SPACING / 2 + 15;
      if (f < -half || f > cfg.VIEW_FAR + half) continue;
      if (Math.abs(Cam.side(p[0], p[1])) > Math.max(f, 0) * fov + half) continue;
      vis.push({ st: st, f: f });
    }
    vis.sort(function (a, b) { return b.f - a.f; });
    for (var v = 0; v < vis.length; v++) drawStand(ctx, samples, vis[v].st, vis[v].f < LOD_FAR);
  }

  // --- Car ---------------------------------------------------------------------

  // Car-local (right, forward) -> world, then a projected vertex at height h.
  var carCos = 0, carSin = 0, carX = 0, carY = 0;
  var shadowRect = [0, -0.05, 0, 0];
  function carVertex(lx, ly, h) {
    // local +y = heading, local +x = right of the heading
    Cam.vertex(carX + ly * carCos + lx * carSin, carY + ly * carSin - lx * carCos, h);
  }

  function carPoly(ctx, pts, h, grow) {
    Cam.beginPoly();
    for (var p = 0; p < pts.length; p++) carVertex(pts[p][0] * grow, pts[p][1] * grow, h);
    Cam.endPoly(ctx);
  }

  function carRect(ctx, r, h) {
    var x0 = r[0] - r[2] / 2, x1 = r[0] + r[2] / 2, y0 = r[1] - r[3] / 2, y1 = r[1] + r[3] / 2;
    Cam.beginPoly();
    carVertex(x0, y0, h);
    carVertex(x1, y0, h);
    carVertex(x1, y1, h);
    carVertex(x0, y1, h);
    Cam.endPoly(ctx);
  }

  // Tint applied to the whole car model (0.22 = burnt wreck after exploding).
  var carTint = 1;

  // --- 3D car model ----------------------------------------------------------

  // Light direction (world, horizontal part) for shading the sides.
  var LIGHT_X = -0.6, LIGHT_Y = 0.8;
  var rgbCache = {};
  var shadeCache = {};
  function shade(hex, f) {
    // Cached per colour and 1/64 brightness step: no new strings per frame.
    var step = Math.round(f * 64);
    var key = hex + step;
    var cached = shadeCache[key];
    if (cached) return cached;
    var c = rgbCache[hex];
    if (!c) {
      var v = parseInt(hex.slice(1), 16);
      c = rgbCache[hex] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var k = step / 64;
    return (shadeCache[key] = 'rgb(' + ((c[0] * k) | 0) + ',' + ((c[1] * k) | 0) + ',' + ((c[2] * k) | 0) + ')');
  }

  // Builds (once per part) the outline in anticlockwise order, the tapered
  // top outline, and the outward normal of every side face.
  function preparePart(part) {
    if (part._pts) return;
    var pts;
    if (part.box) {
      var b = part.box, x0 = b[0] - b[2] / 2, x1 = b[0] + b[2] / 2, y0 = b[1] - b[3] / 2, y1 = b[1] + b[3] / 2;
      pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    } else {
      pts = part.prism.slice();
    }
    var area = 0, cxs = 0, cys = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      area += p[0] * q[1] - q[0] * p[1];
      cxs += p[0]; cys += p[1];
    }
    if (area < 0) pts.reverse();
    cxs /= pts.length; cys /= pts.length;
    var taper = part.taper || 1;
    part._pts = pts;
    part._top = pts.map(function (p) { return [cxs + (p[0] - cxs) * taper, cys + (p[1] - cys) * taper]; });
    part._normals = [];
    for (var j = 0; j < pts.length; j++) {
      var a = pts[j], c = pts[(j + 1) % pts.length];
      var ex = c[0] - a[0], ey = c[1] - a[1], len = Math.hypot(ex, ey) || 1;
      var nx = ey / len, ny = -ex / len; // outward for an anticlockwise outline
      part._normals.push([nx, ny]);
    }
  }

  var MAXP = 64;
  var bx = new Float64Array(MAXP), by = new Float64Array(MAXP), tx = new Float64Array(MAXP), ty = new Float64Array(MAXP);

  // Local (right, forward) -> world
  function localX(lx, ly) { return carX + ly * carCos + lx * carSin; }
  function localY(lx, ly) { return carY + ly * carSin - lx * carCos; }

  function drawPrism(ctx, car, part) {
    preparePart(part);
    var pts = part._pts, top = part._top, n = pts.length;
    var z0 = part.z[0], z1 = part.z[1];
    for (var i = 0; i < n; i++) {
      if (!Cam.project(localX(pts[i][0], pts[i][1]), localY(pts[i][0], pts[i][1]), z0)) return false;
      bx[i] = Cam.out.x; by[i] = Cam.out.y;
      if (!Cam.project(localX(top[i][0], top[i][1]), localY(top[i][0], top[i][1]), z1)) return false;
      tx[i] = Cam.out.x; ty[i] = Cam.out.y;
    }
    var camP = Cam.pos;
    // Sides facing the camera (the parts are convex, so no sorting needed).
    for (var f = 0; f < n; f++) {
      var nl = part._normals[f];
      var nwx = nl[1] * carCos + nl[0] * carSin, nwy = nl[1] * carSin - nl[0] * carCos;
      var g = (f + 1) % n;
      var mx = localX((pts[f][0] + pts[g][0]) / 2, (pts[f][1] + pts[g][1]) / 2);
      var my = localY((pts[f][0] + pts[g][0]) / 2, (pts[f][1] + pts[g][1]) / 2);
      if (nwx * (camP.x - mx) + nwy * (camP.y - my) <= 0) continue;
      var light = 0.5 + 0.38 * Math.max(0, nwx * LIGHT_X + nwy * LIGHT_Y);
      ctx.fillStyle = shade(part.color, light * carTint);
      ctx.beginPath();
      ctx.moveTo(bx[f], by[f]);
      ctx.lineTo(bx[g], by[g]);
      ctx.lineTo(tx[g], ty[g]);
      ctx.lineTo(tx[f], ty[f]);
      ctx.closePath();
      ctx.fill();
    }
    // Top face.
    ctx.fillStyle = shade(part.top || part.color, carTint);
    ctx.beginPath();
    ctx.moveTo(tx[0], ty[0]);
    for (var k = 1; k < n; k++) ctx.lineTo(tx[k], ty[k]);
    ctx.closePath();
    ctx.fill();
    return true;
  }

  function drawDecal(ctx, d, h) {
    ctx.fillStyle = d.fill.charAt(0) === '#' ? shade(d.fill, carTint) : d.fill;
    ctx.beginPath();
    if (d.poly) carPoly(ctx, d.poly, h, 1);
    else carRect(ctx, d.rect, h);
    ctx.fill();
  }

  // --- Wheels ---------------------------------------------------------------
  //
  // A tyre is a 16-sided cylinder on its axle (car-local x). It rolls with
  // car.wheelDist (angle = distance / radius) and the front pair turn by
  // car.wheelSteer about the vertical axis. Tread blocks alternate shade so
  // the roll is visible; above WHEEL_BLUR_START rad/s they blur into an even
  // band and the rim spokes fade, as the eye sees a fast-spinning wheel.
  var WN = 16;
  var WHEEL_BLUR_START = 10, WHEEL_BLUR_FULL = 34; // rad/s
  var wsx = [new Float64Array(WN), new Float64Array(WN)], wsy = [new Float64Array(WN), new Float64Array(WN)];
  var wpx = new Float64Array(WN), wpy = new Float64Array(WN);
  var wAx = 0, wAy = 0, wFx = 0, wFy = 0, wCx = 0, wCy = 0;

  // Wheel-local (s along the axle, u forward, h height) -> screen, in Cam.out.
  function wheelProject(s, u, h) {
    var lx = wCx + wAx * s + wFx * u, ly = wCy + wAy * s + wFy * u;
    return Cam.project(localX(lx, ly), localY(lx, ly), h);
  }

  // Ring of WN points at radius rho on axle side s (spin = roll angle).
  function wheelRing(s, rho, r, spin) {
    for (var k = 0; k < WN; k++) {
      var t = (2 * Math.PI * k) / WN - spin;
      if (!wheelProject(s, rho * Math.cos(t), r + rho * Math.sin(t))) return false;
      wpx[k] = Cam.out.x; wpy[k] = Cam.out.y;
    }
    return true;
  }

  function fillRing(ctx, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(wpx[0], wpy[0]);
    for (var k = 1; k < WN; k++) ctx.lineTo(wpx[k], wpy[k]);
    ctx.closePath();
    ctx.fill();
  }

  function drawWheel(ctx, car, part) {
    var w = part.wheel, hw = w[2] / 2, r = w[3];
    var steer = part.front ? car.wheelSteer || 0 : 0;
    wCx = w[0]; wCy = w[1];
    wAx = Math.cos(steer); wAy = Math.sin(steer); // axle (right)
    wFx = -wAy; wFy = wAx; // rolling direction (forward)
    var spin = (car.wheelDist || 0) / r;
    var omega = Math.abs(car.forwardSpeed || 0) / r;
    var blur = Math.max(0, Math.min(1, (omega - WHEEL_BLUR_START) / (WHEEL_BLUR_FULL - WHEEL_BLUR_START)));

    // Rim edges on both sides of the tread.
    for (var side = 0; side < 2; side++) {
      if (!wheelRing(side ? hw : -hw, r, r, spin)) return;
      for (var k = 0; k < WN; k++) { wsx[side][k] = wpx[k]; wsy[side][k] = wpy[k]; }
    }

    // World directions of the axle and the rolling direction, and the
    // camera relative to the wheel centre.
    var axW = wAy * carCos + wAx * carSin, ayW = wAy * carSin - wAx * carCos;
    var fxW = wFy * carCos + wFx * carSin, fyW = wFy * carSin - wFx * carCos;
    var camP = Cam.pos;
    var dx = camP.x - localX(wCx, wCy), dy = camP.y - localY(wCx, wCy), dh = camP.h - r;

    // Tread: the blocks facing the camera.
    for (var q = 0; q < WN; q++) {
      var q2 = (q + 1) % WN;
      var t = (2 * Math.PI * (q + 0.5)) / WN - spin;
      var ct = Math.cos(t), st = Math.sin(t);
      if ((fxW * dx + fyW * dy) * ct + dh * st <= 0) continue;
      var lit = 0.55 + 0.45 * Math.max(0, st);
      var block = q % 2 ? 1 : 1 - 0.45 * (1 - blur); // alternating tread blocks
      ctx.fillStyle = shade('#2e2e2e', lit * block * carTint);
      ctx.beginPath();
      ctx.moveTo(wsx[0][q], wsy[0][q]);
      ctx.lineTo(wsx[0][q2], wsy[0][q2]);
      ctx.lineTo(wsx[1][q2], wsy[1][q2]);
      ctx.lineTo(wsx[1][q], wsy[1][q]);
      ctx.closePath();
      ctx.fill();
    }

    // Sidewall facing the camera, with compound stripe, rim, spokes, hub.
    var outer = axW * dx + ayW * dy > 0 ? 1 : 0;
    var sOff = outer ? hw : -hw;
    for (var m = 0; m < WN; m++) { wpx[m] = wsx[outer][m]; wpy[m] = wsy[outer][m]; }
    fillRing(ctx, shade('#1c1c1c', 0.9 * carTint));
    var pxPerM = Math.hypot(wpx[0] - wpx[WN / 2], wpy[0] - wpy[WN / 2]) / (2 * r);

    if (wheelRing(sOff, 0.8 * r, r, spin)) {
      ctx.strokeStyle = shade(part.stripe, (0.75 + 0.25 * (1 - blur)) * carTint);
      ctx.lineWidth = Math.max(0.6, 0.045 * pxPerM);
      ctx.beginPath();
      ctx.moveTo(wpx[0], wpy[0]);
      for (var n = 1; n < WN; n++) ctx.lineTo(wpx[n], wpy[n]);
      ctx.closePath();
      ctx.stroke();
    }
    if (wheelRing(sOff, 0.6 * r, r, spin)) fillRing(ctx, shade(part.rim, (1 + 0.25 * blur) * carTint));

    if (blur < 1 && pxPerM > 8) {
      // Five spokes, turning with the wheel.
      ctx.strokeStyle = shade('#0c0d10', carTint);
      ctx.globalAlpha = 1 - blur;
      ctx.lineWidth = Math.max(0.6, 0.07 * pxPerM);
      ctx.beginPath();
      for (var j = 0; j < 5; j++) {
        var a = (2 * Math.PI * j) / 5 - spin;
        if (!wheelProject(sOff, 0.12 * r * Math.cos(a), r + 0.12 * r * Math.sin(a))) continue;
        ctx.moveTo(Cam.out.x, Cam.out.y);
        if (!wheelProject(sOff, 0.56 * r * Math.cos(a), r + 0.56 * r * Math.sin(a))) continue;
        ctx.lineTo(Cam.out.x, Cam.out.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (wheelRing(sOff, 0.14 * r, r, spin)) fillRing(ctx, shade(part.stripe, 0.85 * carTint)); // wheel nut
  }

  function drawCarModel(ctx, car, model) {
    var lastTop = 0;
    for (var i = 0; i < model.length; i++) {
      var part = model[i];
      if (part.wheel) {
        drawWheel(ctx, car, part);
        continue;
      }
      if (part.decal) {
        drawDecal(ctx, part.decal, lastTop + 0.005);
        continue;
      }
      drawPrism(ctx, car, part);
      lastTop = part.z[1];
    }
  }

  // The player's own car seen from the driver's seat: the top of the
  // chassis ahead (clipped at the near plane), nose, front wing and the
  // front tyres, which steer and roll. Everything at or behind the driver
  // is left out (the cockpit overlay covers it).
  function drawCockpitCar(ctx, car, model) {
    for (var i = 0; i < model.length; i++) {
      var part = model[i];
      if (part.prism && part.prism.length > 6) {
        // chassis: its top face only, as a clipped polygon
        ctx.fillStyle = shade(part.color, 0.92 * carTint);
        ctx.beginPath();
        carPoly(ctx, part.prism, part.z[1], 1);
        ctx.fill();
        continue;
      }
      if (part.wheel) { if (part.front) drawWheel(ctx, car, part); continue; }
      if (part.decal) {
        var r = part.decal.rect;
        if (r && r[1] - r[3] / 2 > 0.5) drawDecal(ctx, part.decal, 0.465);
        continue;
      }
      var minY = part.box ? part.box[1] - part.box[3] / 2 : Math.min.apply(null, part.prism.map(function (p) { return p[1]; }));
      if (minY > 0.9) drawPrism(ctx, car, part);
    }
  }

  // Seen in the mirrors: only the rear tyres of the player's own car.
  function drawMirrorCar(ctx, car, model) {
    for (var i = 0; i < model.length; i++) {
      var part = model[i];
      if (part.wheel && !part.front) drawWheel(ctx, car, part);
    }
  }

  // 3D preview for the car-select cards: the car at the origin, seen
  // three-quarters from behind and above.
  var PREVIEW_CAR = { wheelSteer: 0.3, wheelDist: 0, forwardSpeed: 0 }; // fronts turned to show steering
  Renderer.drawCarPreview = function (ctx, carDef, w, h) {
    Cam = CR.Camera;
    Cam.setView(w, h, 0, 0.2, Math.PI / 2, 6.5, 3.4, 26, 2.1, 0.42);
    carX = 0; carY = 0;
    var heading = Math.PI / 2 + 0.75;
    carCos = Math.cos(heading); carSin = Math.sin(heading);
    carTint = 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    carRect(ctx, [0, 0, 2.0, 4.3], 0);
    ctx.fill();
    drawCarModel(ctx, PREVIEW_CAR, carDef.model);
  };

  // --- Explosion ------------------------------------------------------------

  // Particles: fire (bright, short), smoke (dark, rising, long) and debris
  // (small dark chunks thrown outward, falling back). A burning wreck keeps
  // emitting fire and smoke while the car stays exploded.
  var MAX_PARTICLES = 220;
  var parts = [];
  for (var pi = 0; pi < MAX_PARTICLES; pi++) {
    parts.push({ life: 0, max: 1, kind: 0, x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, size: 0, grow: 0 });
  }
  var FIRE = 0, SMOKE = 1, DEBRIS = 2;
  var MAX_PARTICLE_SIZE = 2.4; // m
  var PARTICLE_FADE_HEIGHT = 5; // m, smoke/fire fade out above this
  var PARTICLE_MIN_DEPTH = 5; // m, don't draw particles right in front of the camera
  var flash = 0; // s of screen flash left
  var wreckAccum = 0;

  function spawn(kind, x, y, h, vx, vy, vh, size, grow, life) {
    for (var i = 0; i < MAX_PARTICLES; i++) {
      var p = parts[i];
      if (p.life > 0) continue;
      p.kind = kind; p.x = x; p.y = y; p.h = h;
      p.vx = vx; p.vy = vy; p.vh = vh;
      p.size = size; p.grow = grow;
      p.life = p.max = life;
      return;
    }
  }

  function rnd(a) { return (Math.random() * 2 - 1) * a; }

  // Called by main.js when the car explodes.
  Renderer.explode = function (car) {
    flash = 0.35;
    var vx = car.vx * 0.3, vy = car.vy * 0.3;
    for (var i = 0; i < 70; i++) {
      spawn(FIRE, car.x + rnd(1.2), car.y + rnd(1.2), 0.3 + Math.random(), vx + rnd(7), vy + rnd(7), 1.5 + Math.random() * 3.5,
        0.6 + Math.random() * 0.6, 2.4, 0.45 + Math.random() * 0.45);
    }
    for (var s = 0; s < 45; s++) {
      spawn(SMOKE, car.x + rnd(1.5), car.y + rnd(1.5), 0.8 + Math.random(), vx + rnd(3), vy + rnd(3), 1.2 + Math.random() * 1.2,
        1.0, 0.9, 1.6 + Math.random() * 1.2);
    }
    for (var d = 0; d < 36; d++) {
      spawn(DEBRIS, car.x, car.y, 0.6, vx + rnd(12), vy + rnd(12), 4 + Math.random() * 7, 0.12 + Math.random() * 0.18, 0, 1.2 + Math.random() * 0.6);
    }
  };

  function updateParticles(car, dt) {
    // A burning wreck keeps smoking.
    if (car.exploded) {
      wreckAccum += dt * 7;
      while (wreckAccum >= 1) {
        wreckAccum -= 1;
        if (Math.random() < 0.45) spawn(FIRE, car.x + rnd(0.9), car.y + rnd(1.4), 0.7, rnd(0.8), rnd(0.8), 1.5 + Math.random(), 0.5, 1.2, 0.5);
        else spawn(SMOKE, car.x + rnd(0.8), car.y + rnd(1.2), 1.0, rnd(0.8), rnd(0.8), 0.9 + Math.random() * 0.6, 0.6, 0.6, 2.2);
      }
    }
    if (flash > 0) flash -= dt;
    for (var i = 0; i < MAX_PARTICLES; i++) {
      var p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.h += p.vh * dt;
      p.size = Math.min(MAX_PARTICLE_SIZE, p.size + p.grow * dt);
      if (p.kind === DEBRIS) {
        p.vh -= 18 * dt; // gravity
        if (p.h < 0.05) { p.h = 0.05; p.vh = -p.vh * 0.3; p.vx *= 0.6; p.vy *= 0.6; }
      } else {
        p.vx *= 1 - 1.5 * dt;
        p.vy *= 1 - 1.5 * dt;
        if (p.kind === FIRE) p.vh *= 1 - 2 * dt;
      }
    }
  }

  function drawParticles(ctx, w, h) {
    for (var i = 0; i < MAX_PARTICLES; i++) {
      var p = parts[i];
      if (p.life <= 0 || !Cam.project(p.x, p.y, p.h) || Cam.out.depth < PARTICLE_MIN_DEPTH) continue;
      var r = (Cam.focal * p.size) / Cam.out.depth;
      var t = p.life / p.max; // 1 -> 0
      if (p.kind !== DEBRIS) t *= Math.max(0, Math.min(1, (PARTICLE_FADE_HEIGHT + 2 - p.h) / 2));
      if (p.kind === FIRE) {
        // yellow -> orange -> dark red as it burns out
        var g = (90 + 150 * t) | 0, b = (20 + 60 * t * t) | 0;
        ctx.fillStyle = 'rgba(255,' + g + ',' + b + ',' + (0.85 * t).toFixed(3) + ')';
      } else if (p.kind === SMOKE) {
        ctx.fillStyle = 'rgba(45, 45, 48, ' + (0.4 * t).toFixed(3) + ')';
      } else {
        ctx.fillStyle = 'rgba(25, 25, 25, ' + Math.min(1, 2 * t).toFixed(3) + ')';
      }
      ctx.beginPath();
      ctx.arc(Cam.out.x, Cam.out.y, Math.max(0.8, r), 0, Math.PI * 2);
      ctx.fill();
    }
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255, 220, 150, ' + (flash * 1.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
    }
  }

  Renderer.resetEffects = function () {
    for (var i = 0; i < MAX_PARTICLES; i++) parts[i].life = 0;
    flash = 0;
    wreckAccum = 0;
  };

  // --- Section 7.1: draw order --------------------------------------------

  // --- Start / finish gantry -----------------------------------------------
  //
  // Two pillars outside the walls at the start line, a beam across the
  // track with a chequered banner on the side facing the approaching cars,
  // and the five start lights below it (CR.Race.lightsOn are lit red).
  var drawList = [];
  var gantry = null;
  function buildGantry(s0) {
    var cfg = CR.Config;
    var wl = (s0.wallLeft || cfg.TRACK_WIDTH / 2 + 2) + 1.4, wr = (s0.wallRight || cfg.TRACK_WIDTH / 2 + 2) + 1.4;
    var parts = [];
    var steel = '#3b414c', dark = '#1d2127';
    // local x = right of the track direction: right wall at +x, left at -x
    parts.push({ box: [wr, 0, 1.1, 1.1], z: [0, 10.6], color: steel });
    parts.push({ box: [-wl, 0, 1.1, 1.1], z: [0, 10.6], color: steel });
    parts.push({ box: [wr, 0, 1.8, 1.8], z: [0, 0.5], color: dark }); // footings
    parts.push({ box: [-wl, 0, 1.8, 1.8], z: [0, 0.5], color: dark });
    var x0 = -wl - 0.55, x1 = wr + 0.55, mid = (x0 + x1) / 2;
    parts.push({ box: [mid, 0, x1 - x0, 0.9], z: [8.8, 10.6], color: dark, top: '#2b3039' });
    // Chequered banner (two rows) on the approach face (-y side).
    var sq = 0.9, count = Math.floor((x1 - x0) / sq);
    var startX = mid - (count * sq) / 2 + sq / 2;
    for (var r = 0; r < 2; r++) {
      for (var k = 0; k < count; k++) {
        parts.push({ box: [startX + k * sq, -0.47, sq, 0.04], z: [8.85 + r * 0.88, 9.73 + r * 0.88],
          color: (k + r) % 2 ? '#f2f2f2' : '#111111' });
      }
    }
    // Start lights: five housings hanging under the beam, two lamps each.
    var lamps = [];
    for (var i = 0; i < 5; i++) {
      var lx = mid + (i - 2) * 1.0;
      parts.push({ box: [lx, -0.1, 0.78, 0.5], z: [7.7, 8.8], color: '#0d0f12' });
      var top = { box: [lx, -0.37, 0.46, 0.04], z: [8.24, 8.66], color: '#2a0b0b', lamp: i };
      var bottom = { box: [lx, -0.37, 0.46, 0.04], z: [7.8, 8.2], color: '#2a0b0b', lamp: i };
      parts.push(top, bottom);
      lamps.push(top, bottom);
    }
    gantry = { sample: s0, parts: parts, lamps: lamps };
  }

  function drawGantry(ctx, s0) {
    if (!gantry || gantry.sample !== s0) buildGantry(s0);
    var lit = CR.Race && CR.Race.active ? CR.Race.lightsOn : 0;
    for (var i = 0; i < gantry.lamps.length; i++) {
      var lamp = gantry.lamps[i];
      lamp.color = lamp.lamp < lit ? '#ff2020' : '#2a0b0b';
      lamp.top = lamp.lamp < lit ? '#ff6a5a' : undefined;
    }
    carX = s0.x; carY = s0.y;
    carCos = Math.cos(s0.heading); carSin = Math.sin(s0.heading);
    carTint = 1;
    var ps = gantry.parts;
    // Far pillar first so the near one covers the beam end.
    for (var k = 0; k < ps.length; k++) drawPrism(ctx, null, ps[k]);
  }

  // opts (optional): { w, h, view(w, h) to set the camera instead of
  // Camera.begin, player: 'full' | 'cockpit' | 'mirror', particles: bool,
  // lite: true to skip the grandstands and fencing (small mirror image) }.
  // The rear-view mirrors render through this with their own camera.
  Renderer.render = function (ctx, canvas, dt, opts) {
    Cam = CR.Camera;
    var cfg = CR.Config;
    var car = CR.Car.state;
    var samples = CR.Track.samples;
    opts = opts || {};
    var w = opts.w || canvas.clientWidth, h = opts.h || canvas.clientHeight;
    var half = cfg.TRACK_WIDTH / 2;
    var playerMode = opts.player || (Cam.inCockpit && Cam.inCockpit() ? 'cockpit' : 'full');

    if (opts.view) opts.view(w, h); else Cam.begin(canvas);
    var horizon = Cam.horizonY;

    // 1. Sky above the horizon, grass below.
    ctx.fillStyle = GRASS_COLOR;
    var grassTop = Math.max(0, Math.floor(horizon));
    ctx.fillRect(0, grassTop, w, h - grassTop);
    if (horizon > 0) {
      var hy = Math.round(horizon);
      if (skyCache.y !== hy) {
        skyCache.g = ctx.createLinearGradient(0, 0, 0, hy);
        skyCache.g.addColorStop(0, SKY_TOP);
        skyCache.g.addColorStop(1, SKY_HORIZON);
        skyCache.y = hy;
      }
      ctx.fillStyle = skyCache.g;
      ctx.fillRect(0, 0, w, Math.ceil(horizon));
    }

    var n = samples.length;
    if (n > 1) {
      // Visible quads: from a little behind the camera to VIEW_FAR ahead.
      if (visible.length < n) { visible = new Int32Array(n); nextIdx = new Int32Array(n); }
      // Inside the horizontal field of view too (with a margin for the
      // track's own width and walls), so other parts of the lap far off to
      // the side aren't drawn.
      var nv = 0, fov = Cam.halfFov(), margin = half + cfg.RUNOFF_MAX + 15;
      for (var i = 0; i < n; i++) {
        var si = samples[i];
        var fwd = Cam.forward(si.x, si.y);
        if (fwd > -25 && fwd < cfg.VIEW_FAR && Math.abs(Cam.side(si.x, si.y)) < Math.max(fwd, 0) * fov + margin) {
          // Level of detail: far road is tiny on screen, so skip samples.
          var stride = fwd > LOD_FAR ? 4 : fwd > LOD_NEAR ? 2 : 1;
          if (i % stride === 0) visible[nv++] = i;
        }
      }
      // Each drawn sample connects to the next drawn one (if close along the
      // lap), otherwise to its immediate neighbour.
      for (var vk = 0; vk < nv; vk++) {
        var vi = visible[vk], nxt = vk + 1 < nv ? visible[vk + 1] : -1;
        nextIdx[vi] = nxt > vi && nxt - vi <= 4 ? nxt : (vi + 1 < n ? vi + 1 : 0);
      }
      var k, idx, a, b;

      // 2a. Run-off: only the strips between the white lines and the walls
      // (not under the asphalt, to save fill rate).
      ctx.fillStyle = RUNOFF_COLOR;
      ctx.beginPath();
      for (k = 0; k < nv; k++) {
        idx = visible[k]; a = samples[idx]; b = samples[nextIdx[idx]];
        if (a.bridge) continue;
        strip(ctx, samples, idx, n, half, a.wallLeft, half, b.wallLeft, 0);
        strip(ctx, samples, idx, n, -half, -a.wallRight, -half, -b.wallRight, 0);
      }
      ctx.fill();

      // 2b. Asphalt with the speed colour already blended in (opaque, one
      // layer); consecutive quads in the same colour bucket share one fill.
      var runBucket = -1;
      for (k = 0; k < nv; k++) {
        idx = visible[k];
        var ratio = car.speed / samples[idx].maxSafeSpeed;
        var bucket = Math.min(OVERLAY_BUCKETS + 1, Math.floor(ratio * OVERLAY_BUCKETS)); // floor: red only at >= 1.0
        var contiguous = k > 0 && nextIdx[visible[k - 1]] === idx;
        if (bucket !== runBucket || !contiguous) {
          if (runBucket >= 0) ctx.fill();
          ctx.fillStyle = overlayStyle(bucket);
          ctx.beginPath();
          runBucket = bucket;
        }
        strip(ctx, samples, idx, n, half, -half, half, -half, 0);
      }
      if (runBucket >= 0) ctx.fill();

      // 2c. Kerbs just outside both white lines on corner samples.
      for (var colour = 0; colour < 2; colour++) {
        ctx.fillStyle = colour === 0 ? KERB_RED : KERB_WHITE;
        ctx.beginPath();
        for (k = 0; k < nv; k++) {
          idx = visible[k];
          var kStride = Math.max(1, nextIdx[idx] - idx);
          if (Math.abs(samples[idx].curvature) < KERB_MIN_CURVATURE || samples[idx].bridge || Math.floor(idx / kStride) % 2 !== colour) continue;
          strip(ctx, samples, idx, n, half, half + KERB_WIDTH, half, half + KERB_WIDTH, 0);
          strip(ctx, samples, idx, n, -half, -half - KERB_WIDTH, -half, -half - KERB_WIDTH, 0);
        }
        ctx.fill();
      }

      // 2d. White lines = track limits.
      var lo = half - EDGE_LINE_INSET - EDGE_LINE_WIDTH / 2, hi = lo + EDGE_LINE_WIDTH;
      ctx.fillStyle = EDGE_LINE_COLOR;
      ctx.beginPath();
      for (k = 0; k < nv; k++) {
        strip(ctx, samples, visible[k], n, lo, hi, lo, hi, 0);
        strip(ctx, samples, visible[k], n, -lo, -hi, -lo, -hi, 0);
      }
      ctx.fill();

      // 2e. Checkered start/finish line across sample 0.
      var s0 = samples[0];
      var nx0 = -Math.sin(s0.heading), ny0 = Math.cos(s0.heading);
      var fx0 = Math.cos(s0.heading) * 0.9, fy0 = Math.sin(s0.heading) * 0.9;
      var step = (2 * half) / START_LINE_SQUARES;
      if (Cam.forward(s0.x, s0.y) > -25 && Cam.forward(s0.x, s0.y) < cfg.VIEW_FAR) {
        for (var shade01 = 0; shade01 < 2; shade01++) {
          ctx.fillStyle = shade01 === 0 ? START_LINE_LIGHT : START_LINE_DARK;
          ctx.beginPath();
          for (var q = 0; q < START_LINE_SQUARES; q++) {
            for (var row = 0; row < 2; row++) {
              if ((q + row) % 2 !== shade01) continue;
              var o = -half + step * q;
              var bx = s0.x + nx0 * o + fx0 * row, by = s0.y + ny0 * o + fy0 * row;
              Cam.beginPoly();
              Cam.vertex(bx, by, 0);
              Cam.vertex(bx + nx0 * step, by + ny0 * step, 0);
              Cam.vertex(bx + nx0 * step + fx0, by + ny0 * step + fy0, 0);
              Cam.vertex(bx + fx0, by + fy0, 0);
              Cam.endPoly(ctx);
            }
          }
          ctx.fill();
        }
      }

      // 2e2. Grandstands (behind the walls, so drawn before them).
      drawStands(ctx, samples, opts.lite);

      // 2f. Walls: vertical faces plus a lighter top, drawn far to near in
      // chunks of WALL_CHUNK samples (2 fills per chunk) so nearer walls
      // still overlap farther ones without a fill call per sample.
      for (var end = nv; end > 0; end -= WALL_CHUNK) {
        var start = Math.max(0, end - WALL_CHUNK);
        ctx.fillStyle = WALL_COLOR;
        ctx.beginPath();
        for (k = end - 1; k >= start; k--) {
          idx = visible[k]; a = samples[idx]; b = samples[nextIdx[idx]];
          if (a.bridge) continue;
          wallFace(ctx, samples, idx, n, a.wallLeft, b.wallLeft);
          wallFace(ctx, samples, idx, n, -a.wallRight, -b.wallRight);
        }
        ctx.fill();
        ctx.fillStyle = WALL_TOP_COLOR;
        ctx.beginPath();
        for (k = end - 1; k >= start; k--) {
          idx = visible[k]; a = samples[idx]; b = samples[nextIdx[idx]];
          if (a.bridge) continue;
          strip(ctx, samples, idx, n, a.wallLeft, a.wallLeft + WALL_THICKNESS, b.wallLeft, b.wallLeft + WALL_THICKNESS, WALL_HEIGHT);
          strip(ctx, samples, idx, n, -a.wallRight, -a.wallRight - WALL_THICKNESS, -b.wallRight, -b.wallRight - WALL_THICKNESS, WALL_HEIGHT);
        }
        ctx.fill();
        // Catch fencing on top of this chunk of wall (near the camera only).
        if (opts.lite) continue;
        var fenceAny = false;
        for (k = end - 1; k >= start; k--) {
          a = samples[visible[k]];
          if (!a.bridge && Cam.forward(a.x, a.y) < FENCE_NEAR) { fenceAny = true; break; }
        }
        if (!fenceAny) continue;
        var fo = WALL_THICKNESS / 2;
        ctx.fillStyle = FENCE_MESH;
        ctx.beginPath();
        for (k = end - 1; k >= start; k--) {
          idx = visible[k]; a = samples[idx]; b = samples[nextIdx[idx]];
          if (a.bridge || Cam.forward(a.x, a.y) > FENCE_NEAR) continue;
          fenceFace(ctx, samples, idx, a.wallLeft + fo, a.wallLeft + fo - FENCE_LEAN, WALL_HEIGHT, FENCE_TOP);
          fenceFace(ctx, samples, idx, -a.wallRight - fo, -a.wallRight - fo + FENCE_LEAN, WALL_HEIGHT, FENCE_TOP);
        }
        ctx.fill();
        ctx.fillStyle = FENCE_CABLE;
        ctx.beginPath();
        for (k = end - 1; k >= start; k--) {
          idx = visible[k]; a = samples[idx]; b = samples[nextIdx[idx]];
          if (a.bridge || Cam.forward(a.x, a.y) > FENCE_NEAR) continue;
          var lf = FENCE_LEAN * 0.45;
          fenceFace(ctx, samples, idx, a.wallLeft + fo - lf, a.wallLeft + fo - lf, 2.45, 2.5);
          fenceFace(ctx, samples, idx, -a.wallRight - fo + lf, -a.wallRight - fo + lf, 2.45, 2.5);
          fenceFace(ctx, samples, idx, a.wallLeft + fo - FENCE_LEAN, a.wallLeft + fo - FENCE_LEAN, FENCE_TOP - 0.06, FENCE_TOP);
          fenceFace(ctx, samples, idx, -a.wallRight - fo + FENCE_LEAN, -a.wallRight - fo + FENCE_LEAN, FENCE_TOP - 0.06, FENCE_TOP);
        }
        ctx.fill();
        ctx.fillStyle = FENCE_POST;
        ctx.beginPath();
        for (k = end - 1; k >= start; k--) {
          idx = visible[k]; a = samples[idx];
          if (a.bridge || idx % 2 || Cam.forward(a.x, a.y) > FENCE_NEAR * 0.7) continue;
          fencePost(ctx, a, a.wallLeft + fo, a.wallLeft + fo - FENCE_LEAN);
          fencePost(ctx, a, -a.wallRight - fo, -a.wallRight - fo + FENCE_LEAN);
        }
        ctx.fill();
      }
    }

    // 3. Distance haze from HAZE_START metres ahead up to the horizon.
    if (Cam.project(car.x + Math.cos(Cam.viewHeading) * HAZE_START, car.y + Math.sin(Cam.viewHeading) * HAZE_START, 0)) {
      var hazeStart = Cam.out.y;
      var top = Math.max(0, horizon);
      if (hazeStart > top) {
        var ht = Math.round(top), hs = Math.round(hazeStart);
        if (hazeCache.top !== ht || hazeCache.start !== hs) {
          hazeCache.g = ctx.createLinearGradient(0, ht, 0, hs);
          hazeCache.g.addColorStop(0, 'rgba(' + HAZE + ', 0.9)');
          hazeCache.g.addColorStop(1, 'rgba(' + HAZE + ', 0)');
          hazeCache.top = ht; hazeCache.start = hs;
        }
        ctx.fillStyle = hazeCache.g;
        ctx.fillRect(0, top, w, hazeStart - top);
      }
    }

    // 4. Cars (player + AI in a race) and the start/finish gantry, drawn
    // far to near so nearer objects cover farther ones.
    if (CR.Car.def) {
      drawList.length = 0;
      drawList.push({ kind: 'car', obj: car, model: CR.Car.def.model, tint: car.exploded ? 0.22 : 1,
        hw: cfg.CAR_HALF_WIDTH, hl: cfg.CAR_HALF_LENGTH });
      if (CR.Race && CR.Race.active) {
        var ais = CR.Race.ai;
        for (var ai = 0; ai < ais.length; ai++) {
          drawList.push({ kind: 'car', obj: ais[ai], model: ais[ai].model, tint: 1, hw: 0.95, hl: 2.3 });
        }
      }
      var g0 = CR.Track.samples[0];
      if (g0) drawList.push({ kind: 'gantry', obj: g0 });
      var maxSide = Cam.halfFov() * 1.15;
      for (var di = drawList.length - 1; di >= 0; di--) {
        var e = drawList[di], o = e.obj;
        e.depth = Cam.forward(o.x, o.y);
        var reach = e.kind === 'gantry' ? 30 : 4;
        if ((e.kind === 'car' && e.obj !== car && e.depth < 3.5) || e.depth < -reach || e.depth > cfg.VIEW_FAR || Math.abs(Cam.side(o.x, o.y)) > Math.max(e.depth, 1) * maxSide + reach) {
          if (e.obj !== car) drawList.splice(di, 1);
        }
      }
      drawList.sort(function (a, b) { return b.depth - a.depth; });
      for (var dk = 0; dk < drawList.length; dk++) {
        var item = drawList[dk];
        if (item.kind === 'gantry') { drawGantry(ctx, item.obj); continue; }
        var oc = item.obj;
        carX = oc.x; carY = oc.y;
        carCos = Math.cos(oc.heading); carSin = Math.sin(oc.heading);
        if (oc === car && playerMode !== 'full') {
          carTint = item.tint;
          if (playerMode === 'cockpit') drawCockpitCar(ctx, oc, item.model);
          else if (playerMode === 'mirror') drawMirrorCar(ctx, oc, item.model);
          continue;
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        shadowRect[2] = item.hw * 2.05;
        shadowRect[3] = item.hl * 2.02;
        carRect(ctx, shadowRect, 0);
        ctx.fill();
        carTint = item.tint;
        drawCarModel(ctx, oc, item.model);
      }
      carTint = 1;

      if (opts.particles !== false) {
        updateParticles(car, dt || 0);
        drawParticles(ctx, w, h);
      }
    }
  };

  CR.Renderer = Renderer;
})();

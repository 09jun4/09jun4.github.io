// course.js — the downhill mountain pass: centreline, elevation, terrain.
// Pure geometry (no three.js) so it can also run under node for checks.
// Physics plane: x east, y north (metres); h = height. three.js uses
// (x, h, -y). The road starts high on the mountain and winds down to the
// lake at its foot, ending in a run-out after the finish line.
(function (root) {
  'use strict';
  var DR = root.DR = root.DR || {};

  var Course = {
    NAME: '하루나 고개 다운힐',
    SLUG: 'haruna',
    SPACING: 2, // m between samples
    HALF: 9.3, // m, centreline -> guardrail face (road 18.6 m wide)
    LINE: 8.2, // m, centreline -> white edge line
    RUNOUT: 140, // m of road after the finish line
    START_AT: 24, // m from the start of the road to the start line
  };

  // The mountain: one big peak at the origin with ridges and gullies.
  var PEAK = 560, SIGMA = 720;
  Course.mountain = function (x, y) {
    var r2 = x * x + y * y;
    var h = PEAK * Math.exp(-r2 / (2 * SIGMA * SIGMA));
    h += 26 * Math.sin(x / 140 + 1.3) * Math.cos(y / 175 - 0.4) + 14 * Math.sin((x + y) / 63) * Math.cos((x - y) / 91);
    h += 6 * Math.sin(x / 23 + y / 37);
    return h;
  };

  // Turtle program for the centreline: S = straight (m), L/R = arc
  // (radius m, degrees). Modelled on Japanese touge passes like Mt Haruna:
  // fast sweepers at the top, a run of five consecutive hairpins, then a
  // flowing lower section down to the lake.
  var PROGRAM = [
    ['S', 130], ['R', 140, 35], ['L', 95, 70], ['S', 110], ['R', 60, 90], ['S', 70], ['L', 150, 45],
    ['S', 190], ['R', 42, 120], ['L', 75, 55], ['S', 90],
    ['L', 24, 176], ['S', 105], ['R', 24, 178], ['S', 105], ['L', 24, 178], ['S', 105], ['R', 24, 178], ['S', 105], ['L', 24, 176],
    ['S', 140], ['R', 100, 60], ['L', 60, 85], ['S', 230], ['R', 80, 70], ['L', 40, 100], ['R', 52, 80], ['S', 190],
    ['L', 160, 40], ['S', 200],
  ];
  Course.PROGRAM = PROGRAM;

  function build() {
    var sp = Course.SPACING, pts = [];
    var x = 60, y = -200, hd = -Math.PI / 2 - 0.25;
    pts.push([x, y, hd, 0]);
    PROGRAM.forEach(function (c) {
      if (c[0] === 'S') {
        var n = Math.round(c[1] / sp);
        for (var i = 0; i < n; i++) { x += Math.cos(hd) * sp; y += Math.sin(hd) * sp; pts.push([x, y, hd, 0]); }
      } else {
        var r = c[1], ang = (c[2] * Math.PI) / 180, dir = c[0] === 'L' ? 1 : -1;
        var m = Math.round((r * ang) / sp), da = (ang / m) * dir;
        for (var j = 0; j < m; j++) {
          hd += da / 2; x += Math.cos(hd) * sp; y += Math.sin(hd) * sp; hd += da / 2;
          pts.push([x, y, hd, dir / r]);
        }
      }
    });
    var n = pts.length, S = new Array(n);
    // Elevation: always downhill, 7–14 % on the open road and gentler in
    // the hairpins, like a real mountain pass.
    var hs = new Array(n);
    hs[0] = 540;
    for (var i = 1; i < n; i++) {
      var g0 = 0.1 + 0.028 * Math.sin(i * sp / 170) + 0.012 * Math.sin(i * sp / 57);
      if (Math.abs(pts[i][3]) > 1 / 32) g0 *= 0.55;
      if (i < 12 || i > n - Course.RUNOUT / sp) g0 = 0.02;
      hs[i] = hs[i - 1] - g0 * sp;
    }
    for (var pass = 0; pass < 3; pass++) for (var i2 = 1; i2 < n - 1; i2++) hs[i2] = (hs[i2 - 1] + 2 * hs[i2] + hs[i2 + 1]) / 4;
    // The run-out and the first metres are nearly flat.
    for (var t = 0; t < n; t++) {
      var p = pts[t];
      var kk = 0, ww = 0;
      for (var k2 = -6; k2 <= 6; k2++) { var q2 = pts[Math.max(0, Math.min(n - 1, t + k2))]; kk += q2[3]; ww++; }
      S[t] = { i: t, x: p[0], y: p[1], h: hs[t], heading: p[2], curvature: kk / ww, dist: t * sp,
        nx: -Math.sin(p[2]), ny: Math.cos(p[2]) };
    }
    for (var g = 0; g < n; g++) {
      var a = S[Math.max(0, g - 1)], b = S[Math.min(n - 1, g + 1)];
      S[g].grade = (b.h - a.h) / (b.dist - a.dist);
    }
    Course.samples = S;
    Course.length = (n - 1) * sp;
    Course.startIndex = Math.round(Course.START_AT / sp);
    Course.finishIndex = n - 1 - Math.round(Course.RUNOUT / sp);
    Course.raceLength = (Course.finishIndex - Course.startIndex) * sp;
    Course.drop = S[Course.startIndex].h - S[Course.finishIndex].h;
  }
  build();

  // --- Terrain ----------------------------------------------------------
  // Far from the road the ground is the mountain above; near it the ground
  // follows the road's own height (inverse-distance field on a coarse
  // grid), so the road sits on the slope instead of on a giant embankment.
  // Right next to the road the ground meets the road edge.
  var T = { size: 4400, coarse: 40, fine: 8 };
  Course.TERRAIN = T;
  function buildTerrain() {
    var S = Course.samples, n = S.length, half = T.size / 2;
    var cn = Math.round(T.size / T.coarse) + 1, idw = new Float32Array(cn * cn), wsum = new Float32Array(cn * cn), cd = new Float32Array(cn * cn);
    for (var gy = 0; gy < cn; gy++) for (var gx = 0; gx < cn; gx++) {
      var px = -half + gx * T.coarse, py = -half + gy * T.coarse, sw = 0, sh = 0, md = 1e12;
      for (var i = 0; i < n; i += 4) {
        var dx = S[i].x - px, dy = S[i].y - py, d2 = dx * dx + dy * dy;
        if (d2 < md) md = d2;
        if (d2 > 520 * 520) continue;
        var w = 1 / (d2 + 400);
        w *= w;
        sw += w; sh += w * S[i].h;
      }
      idw[gy * cn + gx] = sw > 0 ? sh / sw : 0;
      wsum[gy * cn + gx] = sw;
      cd[gy * cn + gx] = Math.sqrt(md);
    }
    var fn = Math.round(T.size / T.fine) + 1, nd = new Float32Array(fn * fn).fill(1e9), nh = new Float32Array(fn * fn);
    var R = 120, rc = Math.ceil(R / T.fine);
    for (var j = 0; j < n; j++) {
      var s = S[j], cx = Math.round((s.x + half) / T.fine), cy = Math.round((s.y + half) / T.fine);
      for (var oy = -rc; oy <= rc; oy++) for (var ox = -rc; ox <= rc; ox++) {
        var ix = cx + ox, iy = cy + oy;
        if (ix < 0 || iy < 0 || ix >= fn || iy >= fn) continue;
        var qx = -half + ix * T.fine - s.x, qy = -half + iy * T.fine - s.y, d = Math.sqrt(qx * qx + qy * qy), k = iy * fn + ix;
        if (d < nd[k]) { nd[k] = d; nh[k] = s.h; }
      }
    }
    T.cn = cn; T.cd = cd; T.idw = idw; T.wsum = wsum; T.fn = fn; T.nd = nd; T.nh = nh;
  }
  function bilinear(arr, nn, cell, x, y) {
    var half = T.size / 2, fx = (x + half) / cell, fy = (y + half) / cell;
    var ix = Math.max(0, Math.min(nn - 2, Math.floor(fx))), iy = Math.max(0, Math.min(nn - 2, Math.floor(fy)));
    var tx = Math.min(1, Math.max(0, fx - ix)), ty = Math.min(1, Math.max(0, fy - iy));
    var a = arr[iy * nn + ix], b = arr[iy * nn + ix + 1], c = arr[(iy + 1) * nn + ix], d = arr[(iy + 1) * nn + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  function smooth(e0, e1, v) { var t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  // Distance to the road (m) and the road height there, for the ground.
  Course.roadNear = function (x, y) {
    var d = bilinear(T.nd, T.fn, T.fine, x, y);
    if (d > 100) return { d: bilinear(T.cd, T.cn, T.coarse, x, y), h: 0 };
    return { d: d, h: bilinear(T.nh, T.fn, T.fine, x, y) };
  };
  Course.ground = function (x, y) {
    var m = Course.mountain(x, y);
    var near = Course.roadNear(x, y), d = near.d;
    var field = bilinear(T.idw, T.cn, T.coarse, x, y);
    var far = smooth(150, 520, d);
    var hill = field + (m - field) * far;
    // Rolling forest floor away from the road, flat shoulders next to it.
    hill += (6 * Math.sin(x / 31 + y / 47) + 4 * Math.sin(x / 17 - y / 23)) * smooth(18, 70, d);
    // Under and beside the road the ground sits well below the asphalt (a
    // ditch behind the verge), so coarse terrain triangles never poke up
    // through the road surface.
    var edge = Course.HALF + 3.5;
    if (d < 80) {
      var t = smooth(edge, 80, d);
      return (near.h - 2.4) * (1 - t) + hill * t;
    }
    return hill;
  };
  buildTerrain();

  // Nearest sample to (x, y), searching a window around `hint`.
  Course.nearest = function (x, y, hint, win) {
    var S = Course.samples, n = S.length, best = hint, bd = Infinity;
    win = win || 30;
    var lo = Math.max(0, hint - win), hi = Math.min(n - 1, hint + win);
    for (var i = lo; i <= hi; i++) {
      var dx = S[i].x - x, dy = S[i].y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  // Full search (reset / spawn).
  Course.nearestAll = function (x, y) { return Course.nearest(x, y, 0, Course.samples.length); };

  // Road height under (x, y) near sample i (flat cross-section).
  Course.roadHeight = function (x, y, i) {
    var S = Course.samples, a = S[i];
    var along = (x - a.x) * Math.cos(a.heading) + (y - a.y) * Math.sin(a.heading);
    return a.h + along * a.grade;
  };

  if (typeof module !== 'undefined') module.exports = Course;
  DR.Course = Course;
})(typeof window !== 'undefined' ? window : globalThis);

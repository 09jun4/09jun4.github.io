// course.js — the downhill mountain pass: centreline, elevation, terrain.
// Pure geometry (no three.js) so it can also run under node for checks.
// Physics plane: x east, y north (metres); h = height. three.js uses
// (x, h, -y). The road starts high on the mountain and winds down to the
// lake at its foot, ending in a run-out after the finish line.
(function (root) {
  'use strict';
  var DR = root.DR = root.DR || {};

  var Course = {
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

  // Initial-D-style touge generator: right-angle corners, U-turns and
  // hairpins strung together with only short straights. Seeded, so each
  // course is the same on every load. Every block is checked against the
  // road already laid so the road never crosses or brushes itself.
  //   style.w: block weights {hair, uturn, square, crank, sweep, chain}
  //   style.gap: [min, max] straight between corners (m)
  function touge(seed, style) {
    var s = seed >>> 0;
    function rnd() { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function rr(a, b) { return a + (b - a) * rnd(); }
    var SP = 2, CLEAR = 34, SKIP = 80; // clearance (m) to road laid more than SKIP m earlier
    var pts = [[0, 0]], x = 0, y = 0, hd = 0, prog = [];
    function lay(cmds, commit) {
      var X = x, Y = y, H = hd, out = [];
      cmds.forEach(function (c) {
        if (c[0] === 'S') { var n = Math.round(c[1] / SP); for (var i = 0; i < n; i++) { X += Math.cos(H) * SP; Y += Math.sin(H) * SP; out.push([X, Y]); } }
        else {
          var ang = c[2] * Math.PI / 180, dir = c[0] === 'L' ? 1 : -1, m = Math.round(c[1] * ang / SP), da = ang / m * dir;
          for (var j = 0; j < m; j++) { H += da / 2; X += Math.cos(H) * SP; Y += Math.sin(H) * SP; H += da / 2; out.push([X, Y]); }
        }
      });
      // clearance against everything laid earlier than SKIP metres back
      var lim = pts.length - Math.round(SKIP / SP), c2 = CLEAR * CLEAR;
      for (var k = 0; k < out.length; k += 2) {
        var q = out[k], back = Math.max(0, lim + k);
        for (var i2 = 0; i2 < Math.min(back, pts.length); i2 += 2) {
          var dx = pts[i2][0] - q[0], dy = pts[i2][1] - q[1];
          if (dx * dx + dy * dy < c2) return false;
        }
        for (var i3 = 0; i3 < k - Math.round(SKIP / SP); i3 += 2) { // the block against itself
          var ex = out[i3][0] - q[0], ey = out[i3][1] - q[1];
          if (ex * ex + ey * ey < c2) return false;
        }
      }
      // keep winding generally downhill: never run more than 160 deg off the fall line for long
      var rel = Math.atan2(Math.sin(H), Math.cos(H));
      if (Math.abs(rel) > 2.8 && cmds.length && cmds[cmds.length - 1][0] === 'S' && cmds[cmds.length - 1][1] > 45) return false;
      if (commit) { pts = pts.concat(out); x = X; y = Y; hd = H; cmds.forEach(function (c) { prog.push(c); }); }
      return true;
    }
    var lastDir = 'R';
    function side() { // alternate mostly, so switchbacks stack instead of spiralling
      var d = rnd() < 0.78 ? (lastDir === 'L' ? 'R' : 'L') : lastDir;
      return d;
    }
    function gap() { return ['S', Math.round(rr(style.gap[0], style.gap[1]))]; }
    function block(kind, d) {
      var o = d === 'L' ? 'R' : 'L';
      switch (kind) {
        case 'hair': return [[d, Math.round(rr(25, 32)), Math.round(rr(168, 185))], gap()];
        case 'uturn': return [[d, Math.round(rr(38, 48)), 180], gap()];
        case 'square': return [[d, Math.round(rr(17, 23)), 90], gap()];
        case 'crank': return [[d, Math.round(rr(17, 22)), 90], ['S', Math.round(rr(18, 30))], [o, Math.round(rr(17, 22)), 90], gap()];
        case 'sweep': return [[d, Math.round(rr(55, 85)), Math.round(rr(50, 85))], gap()];
        case 'chain': // a run of linked hairpins
          var c = [], n = 3 + Math.floor(rnd() * 3), dd = d;
          for (var i = 0; i < n; i++) { c.push([dd, Math.round(rr(26, 31)), 178], ['S', Math.round(rr(38, 52))]); dd = dd === 'L' ? 'R' : 'L'; }
          return c;
      }
    }
    var kinds = Object.keys(style.w), tot = kinds.reduce(function (a, k) { return a + style.w[k]; }, 0);
    function pickKind() { var r = rnd() * tot; for (var i = 0; i < kinds.length; i++) { r -= style.w[kinds[i]]; if (r <= 0) return kinds[i]; } return kinds[0]; }
    lay([['S', 70]], true);
    var len = 70;
    while (len < style.length) {
      var ok = false;
      for (var t = 0; t < 40 && !ok; t++) {
        var d = t < 20 ? side() : (rnd() < 0.5 ? 'L' : 'R'), b = block(pickKind(), d);
        if (lay(b, true)) { ok = true; lastDir = b[b.length - 2][0] === 'S' ? b[b.length - 3][0] : b[b.length - 2][0]; }
      }
      if (!ok && !lay([['S', 30]], true)) break;
      len = prog.reduce(function (a, c) { return a + (c[0] === 'S' ? c[1] : c[1] * c[2] * Math.PI / 180); }, 0);
    }
    prog.push(['S', 160]); // finish straight + run-out
    return prog;
  }
  Course.touge = touge;

  // The downhill courses, modelled on real Japanese touge passes. Each is a
  // turtle program for the centreline (S = straight m, L/R = arc radius m
  // and degrees), a start point and heading, the average grade, and a
  // look (theme) for world.js.
  Course.LIST = [
    {
      slug: 'haruna', name: '하루나 고개 다운힐', tag: '연속 헤어핀',
      desc: '직각 코너와 U자 턴 사이로 연속 헤어핀이 몰아치는 기본 코스, 급경사 (군마현 하루나산 모티브)',
      start: [60, -200, -Math.PI / 2 - 0.25], grade: 0.14,
      program: touge(11, { length: 3000, gap: [18, 40], w: { hair: 3, uturn: 2, square: 3, crank: 2, sweep: 1, chain: 1.2 } }),
      theme: 'summer',
    },
    {
      slug: 'akagi', name: '아카기 고개 다운힐', tag: '고속 U자 턴',
      desc: '빠른 스위퍼에서 넓은 U자 턴으로 꽂히는 고속 코스, 가파른 내리막과 저녁 노을 (군마현 아카기산 모티브)',
      start: [-80, -160, -Math.PI / 2 + 0.35], grade: 0.15,
      program: touge(27, { length: 3200, gap: [22, 48], w: { hair: 1.5, uturn: 4, square: 2, crank: 1, sweep: 3, chain: 0.5 } }),
      theme: 'sunset',
    },
    {
      slug: 'irohazaka', name: '이로하자카 다운힐', tag: '헤어핀 지옥',
      desc: '헤어핀이 끝없이 이어지는 기술 코스, 단풍 숲 (도치기현 닛코 이로하자카 모티브)',
      start: [0, -180, -Math.PI / 2], grade: 0.13,
      program: touge(5, { length: 2700, gap: [16, 34], w: { hair: 5, uturn: 1.5, square: 1.5, crank: 0.5, sweep: 0.3, chain: 3 } }),
      theme: 'autumn',
    },
    {
      slug: 'usui', name: '우스이 고개 다운힐', tag: '직각 크랭크',
      desc: '직각 코너와 크랭크가 쉴 틈 없이 이어지는 리듬 코스, 안개 낀 삼나무 숲 (군마·나가노 경계 우스이 고개 모티브)',
      start: [100, -120, -Math.PI / 2 - 0.6], grade: 0.14,
      program: touge(42, { length: 2800, gap: [16, 34], w: { hair: 2, uturn: 1.5, square: 5, crank: 4, sweep: 0.8, chain: 0.6 } }),
      theme: 'fog',
    },
  ];
  var pick = 'haruna';
  try {
    var q = (location.search.match(/[?&]course=([a-z]+)/) || [])[1];
    var ui = JSON.parse(localStorage.getItem('f1-champion.drift-ui') || '{}');
    pick = q || ui.course || pick;
  } catch (e) { /* defaults */ }
  var DEF = Course.LIST.filter(function (c) { return c.slug === pick; })[0] || Course.LIST[0];
  Course.def = DEF;
  Course.NAME = DEF.name;
  Course.SLUG = DEF.slug;
  var PROGRAM = DEF.program;
  Course.PROGRAM = PROGRAM;

  function build() {
    var sp = Course.SPACING, pts = [];
    var x = DEF.start[0], y = DEF.start[1], hd = DEF.start[2];
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
    // Elevation: always downhill and steep, like a real mountain pass.
    var hs = new Array(n);
    hs[0] = 540;
    for (var i = 1; i < n; i++) {
      // steep, changing grade (roughly 7-22 %), only a little gentler in the tightest hairpins
      var g0 = DEF.grade + 0.045 * Math.sin(i * sp / 160) + 0.02 * Math.sin(i * sp / 53);
      if (Math.abs(pts[i][3]) > 1 / 30) g0 *= 0.8;
      g0 = Math.max(0.05, g0);
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
    var S = Course.samples, n = S.length;
    // Grid centred on this course's road, big enough to reach the horizon.
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    S.forEach(function (q) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); });
    T.cx = (minX + maxX) / 2; T.cy = (minY + maxY) / 2;
    T.size = Math.ceil((Math.max(maxX - minX, maxY - minY) + 2600) / 40) * 40;
    var half = T.size / 2;
    var cn = Math.round(T.size / T.coarse) + 1, idw = new Float32Array(cn * cn), wsum = new Float32Array(cn * cn), cd = new Float32Array(cn * cn);
    for (var gy = 0; gy < cn; gy++) for (var gx = 0; gx < cn; gx++) {
      var px = T.cx - half + gx * T.coarse, py = T.cy - half + gy * T.coarse, sw = 0, sh = 0, md = 1e12;
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
      var s = S[j], cx = Math.round((s.x - T.cx + half) / T.fine), cy = Math.round((s.y - T.cy + half) / T.fine);
      for (var oy = -rc; oy <= rc; oy++) for (var ox = -rc; ox <= rc; ox++) {
        var ix = cx + ox, iy = cy + oy;
        if (ix < 0 || iy < 0 || ix >= fn || iy >= fn) continue;
        var qx = T.cx - half + ix * T.fine - s.x, qy = T.cy - half + iy * T.fine - s.y, d = Math.sqrt(qx * qx + qy * qy), k = iy * fn + ix;
        if (d < nd[k]) { nd[k] = d; nh[k] = s.h; }
      }
    }
    T.cn = cn; T.cd = cd; T.idw = idw; T.wsum = wsum; T.fn = fn; T.nd = nd; T.nh = nh;
  }
  function bilinear(arr, nn, cell, x, y) {
    var half = T.size / 2, fx = (x - T.cx + half) / cell, fy = (y - T.cy + half) / cell;
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
  Course.select = function (slug) { // (node checks) rebuild for another course
    DEF = Course.LIST.filter(function (c) { return c.slug === slug; })[0]; Course.def = DEF; Course.NAME = DEF.name; Course.SLUG = DEF.slug; PROGRAM = DEF.program; build(); buildTerrain();
  };
  DR.Course = Course;
})(typeof window !== 'undefined' ? window : globalThis);

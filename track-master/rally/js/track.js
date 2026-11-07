// track.js — RallyTrackGenerator + RallyRouteData.
// A stage is built from road modules (straights, corners of grade 1-6,
// hairpins, linked corners, chicanes) turned into a curvature program with
// clothoid transitions, so heading and curvature are continuous (G2) — no
// kinks where modules join. Elevation (uphill, downhill, steep, crests,
// jumps), surfaces (gravel / mud), hazards (rockfall), checkpoints, the
// terrain heightfield and the props all come from the same seed.
// The pace notes (pacenotes.js) are read straight from `route.corners` and
// `route.features` — the very data the road was built from.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var D = RL.Data, Rng = RL.Rng;

  var SP = 2;                 // metres between road samples
  var LEAD_IN = 40;           // start line distance from the road start
  var RUN_OUT = 170;          // road after the finish line
  var CELL = 4;               // terrain grid spacing (m)
  var CHUNK = 32;             // cells per terrain chunk side (128 m)
  var BAND = 190;             // terrain is built this far from the road

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // ---------------------------------------------------------------------
  // Module catalogue. A module is a list of curvature segments
  // {len, k0, k1} (k > 0 turns right) plus the corners it contains.
  function cornerSegs(dir, R, angle, out, corners, s) {
    var k = dir / R;
    var Lt = clamp(R * 0.45, 8, 30);
    if (angle < (Lt / R) * 1.25) Lt = angle * R / 1.25;
    var arc = Math.max(0, R * angle - Lt);
    out.push({ len: Lt, k0: 0, k1: k }, { len: arc, k0: k, k1: k }, { len: Lt, k0: k, k1: 0 });
    corners.push({ dir: dir, R: R, angle: angle, s0: s, apex: s + Lt + arc / 2, s1: s + 2 * Lt + arc });
    return s + 2 * Lt + arc;
  }
  function radiusFor(rng, grade) { var r = D.GRADE_RADIUS[grade]; return rng.range(r[0], r[1]); }

  function makeModule(rng, kind, dir) {
    var segs = [], corners = [], s = 0, R, a, g, g2;
    switch (kind) {
      case 'straight': {
        var L = rng.weighted([[rng.range(30, 70), 4], [rng.range(70, 160), 4], [rng.range(160, 320), 2]]);
        segs.push({ len: L, k0: 0, k1: 0 });
        break;
      }
      case 'gentle':   // grade 5-6
        g = rng.weighted([[5, 1], [6, 1]]); R = radiusFor(rng, g); a = rng.range(0.35, 0.95);
        cornerSegs(dir, R, a, segs, corners, 0);
        break;
      case 'medium':   // grade 3-4
        g = rng.weighted([[3, 1], [4, 1.2]]); R = radiusFor(rng, g); a = rng.range(0.6, 1.5);
        cornerSegs(dir, R, a, segs, corners, 0);
        break;
      case 'sharp':    // grade 1-2
        g = rng.weighted([[1, 0.8], [2, 1]]); R = radiusFor(rng, g); a = rng.range(1.0, 1.9);
        cornerSegs(dir, R, a, segs, corners, 0);
        break;
      case 'hairpin':
        R = rng.range(10, 13.5); a = rng.range(2.75, 3.25);
        cornerSegs(dir, R, a, segs, corners, 0);
        corners[0].hairpin = true;
        break;
      case 'linked': { // same direction: opens or tightens ("조여짐/풀림")
        g = rng.int(2, 5); g2 = clamp(g + rng.pick([-2, -1, 1, 2]), 1, 6);
        var R1 = radiusFor(rng, g), R2 = radiusFor(rng, g2), a1 = rng.range(0.45, 0.9), a2 = rng.range(0.45, 0.9);
        var k1 = dir / R1, k2 = dir / R2, Lt1 = clamp(R1 * 0.45, 8, 26), Lt2 = clamp(R2 * 0.45, 8, 26), Lm = 14;
        var arc1 = Math.max(4, R1 * a1 - Lt1 / 2 - Lm / 2), arc2 = Math.max(4, R2 * a2 - Lt2 / 2 - Lm / 2);
        segs.push({ len: Lt1, k0: 0, k1: k1 }, { len: arc1, k0: k1, k1: k1 }, { len: Lm, k0: k1, k1: k2 }, { len: arc2, k0: k2, k1: k2 }, { len: Lt2, k0: k2, k1: 0 });
        // each corner covers its own arc; the 14 m between them is the
        // curvature change from one radius to the other ("조여짐" / "풀림")
        var e1 = Lt1 + arc1, b2 = e1 + Lm;
        corners.push({ dir: dir, R: R1, angle: a1, s0: 0, apex: Lt1 + arc1 / 2, s1: e1 });
        corners.push({ dir: dir, R: R2, angle: a2, s0: b2, apex: b2 + arc2 / 2, s1: b2 + arc2 + Lt2 });
        break;
      }
      case 'chicane': { // S: left-right or right-left, short gap
        var gA = rng.int(2, 5), gB = clamp(gA + rng.int(-1, 1), 2, 6);
        s = cornerSegs(dir, radiusFor(rng, gA), rng.range(0.5, 1.1), segs, corners, s);
        var gap = rng.weighted([[0, 1], [rng.range(6, 24), 1.5]]);
        if (gap > 0) { segs.push({ len: gap, k0: 0, k1: 0 }); s += gap; }
        cornerSegs(-dir, radiusFor(rng, gB), rng.range(0.5, 1.1), segs, corners, s);
        break;
      }
    }
    var total = 0, turn = 0;
    segs.forEach(function (q) { total += q.len; turn += (q.k0 + q.k1) / 2 * q.len; });
    return { kind: kind, dir: dir, segs: segs, corners: corners, len: total, turn: turn };
  }

  // Integrate a segment list from a state at a fixed step -> points.
  function integrate(state, segs, step, out) {
    var x = state.x, z = state.z, h = state.h, s = state.s;
    for (var i = 0; i < segs.length; i++) {
      var q = segs[i], n = Math.max(1, Math.round(q.len / step)), ds = q.len / n;
      for (var j = 0; j < n; j++) {
        var kA = q.k0 + (q.k1 - q.k0) * (j / n), kB = q.k0 + (q.k1 - q.k0) * ((j + 1) / n);
        var hm = h + kA * ds / 2 + (kB - kA) * ds / 6; // midpoint heading (exact enough)
        x += Math.cos(hm) * ds; z += Math.sin(hm) * ds;
        h += (kA + kB) / 2 * ds; s += ds;
        if (out) out.push(x, z, s);
      }
    }
    return { x: x, z: z, h: h, s: s };
  }

  // Simple spatial hash of points (x, z, s) for spacing checks.
  function Hash(cell) { this.cell = cell; this.map = new Map(); }
  Hash.prototype.key = function (x, z) { return (Math.floor(x / this.cell) + 32768) * 65536 + (Math.floor(z / this.cell) + 32768); };
  Hash.prototype.add = function (x, z, v) { var k = this.key(x, z), a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(v); };
  Hash.prototype.pop = function (x, z) { var a = this.map.get(this.key(x, z)); if (a) a.pop(); };
  Hash.prototype.near = function (x, z, r, fn) {
    var c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (var i = x0; i <= x1; i++) for (var j = z0; j <= z1; j++) {
      var a = this.map.get((i + 32768) * 65536 + (j + 32768));
      if (a) for (var q = 0; q < a.length; q++) fn(a[q]);
    }
  };

  // ---------------------------------------------------------------------
  // Plan the horizontal road: choose modules until the target length is
  // reached, never letting the road come back near itself.
  function planRoad(seed, target) {
    var rng = Rng.stream(seed, 'road');
    var mainH = rng.range(-Math.PI, Math.PI);
    var state = { x: 0, z: 0, h: mainH, s: 0 };
    var pts = [], hash = new Hash(40), stack = [];
    var first = makeModule(rng, 'straight', 1);
    first.segs = [{ len: LEAD_IN + 60, k0: 0, k1: 0 }]; first.len = LEAD_IN + 60; first.corners = [];
    commit(first);
    function commit(m) {
      var p = []; var st = integrate(state, m.segs, 4, p);
      m.from = { x: state.x, z: state.z, h: state.h, s: state.s }; m.n = p.length / 3;
      for (var i = 0; i < p.length; i += 3) { var idx = pts.length; pts.push(p[i], p[i + 1], p[i + 2]); hash.add(p[i], p[i + 1], idx); }
      state = st; stack.push(m);
    }
    function rollback() {
      var m = stack.pop();
      for (var i = 0; i < m.n; i++) { var idx = pts.length - 3; hash.pop(pts[idx], pts[idx + 1]); pts.length -= 3; }
      state = m.from;
    }
    function fits(m) {
      var p = []; integrate(state, m.segs, 4, p);
      for (var i = 0; i < p.length; i += 3) {
        var x = p[i], z = p[i + 1], s = p[i + 2], bad = false;
        hash.near(x, z, 60, function (idx) {
          if (bad) return;
          var gap = s - pts[idx + 2]; if (gap < 130) return;
          var need = gap > 520 ? 58 : 27, dx = pts[idx] - x, dz = pts[idx + 1] - z;
          if (dx * dx + dz * dz < need * need) bad = true;
        });
        if (bad) return false;
      }
      // keep the stage heading roughly one way (it is a point-to-point stage)
      var dev = wrap(state.h + m.turn - mainH);
      return Math.abs(dev) < 2.5;
    }
    var lastKind = 'straight', tries = 0, fails = 0;
    while (state.s < target && tries < 6000) {
      tries++;
      var dev = wrap(state.h - mainH);
      var ok = false;
      for (var attempt = 0; attempt < 7 && !ok; attempt++) {
        var kind = rng.weighted([
          ['straight', lastKind === 'straight' ? 0.4 : 2.2], ['gentle', 2.2], ['medium', 2.6], ['sharp', 1.5],
          ['hairpin', Math.abs(dev) > 0.6 && lastKind !== 'hairpin' ? 0.9 : 0.12], ['linked', 1.0], ['chicane', 1.0],
        ]);
        // turn back toward the main direction when drifting away
        var dir = Math.abs(dev) > 0.9 ? (rng.chance(0.82) ? -Math.sign(dev) : Math.sign(dev)) : rng.sign();
        if (kind === 'hairpin') dir = -Math.sign(dev) || 1;
        var m = makeModule(rng, kind, dir);
        // after a corner put a short straight in often (real roads breathe)
        if (kind !== 'straight' && rng.chance(0.55)) {
          var gap = rng.range(12, 60); m.segs.push({ len: gap, k0: 0, k1: 0 }); m.len += gap;
        }
        if (fits(m)) { commit(m); lastKind = kind; ok = true; fails = 0; }
      }
      if (!ok) {
        fails++;
        if (stack.length > 2 && fails < 40) rollback();
        else { // give up spacing for one short straight (never loops forever)
          var st = makeModule(rng, 'straight', 1); st.segs = [{ len: 30, k0: 0, k1: 0 }]; st.len = 30; st.corners = [];
          commit(st); fails = 0;
        }
      }
    }
    // run-out after the finish
    var ro = { kind: 'straight', dir: 1, segs: [{ len: RUN_OUT, k0: 0, k1: 0 }], corners: [], len: RUN_OUT, turn: 0 };
    commit(ro);
    return { modules: stack, mainH: mainH, start: stack[0].from };
  }

  // ---------------------------------------------------------------------
  function generate(seed, lengthKey) {
    seed = Rng.cleanSeed(seed) || 'RALLY';
    var L = D.LENGTHS[lengthKey] || D.LENGTHS.short;
    var target = L.km * 1000 + LEAD_IN;
    var plan = planRoad(seed, target);

    // --- sample the road every SP metres
    var segs = [], modules = [], corners = [], s = 0;
    plan.modules.forEach(function (m) {
      modules.push({ kind: m.kind, dir: m.dir, s0: s, s1: s + m.len });
      m.corners.forEach(function (c) {
        corners.push({ dir: c.dir, R: c.R, angle: c.angle, s0: s + c.s0, apex: s + c.apex, s1: s + c.s1, hairpin: !!c.hairpin, module: m.kind });
      });
      m.segs.forEach(function (q) { segs.push(q); });
      s += m.len;
    });
    var total = s, n = Math.floor(total / SP) + 1;
    var X = new Float32Array(n), Z = new Float32Array(n), H = new Float32Array(n), K = new Float32Array(n), Y = new Float32Array(n);
    var W = new Float32Array(n), SURF = new Uint8Array(n), SIDE = new Float32Array(n), GR = new Float32Array(n);
    // Re-integrate finely (0.5 m) and pick a sample every SP metres.
    (function () {
      var x = plan.start.x, z = plan.start.z, h = plan.start.h, si = 0, acc = 0, idx = 0;
      X[0] = x; Z[0] = z; H[0] = h; K[0] = 0; idx = 1;
      for (var i = 0; i < segs.length && idx < n; i++) {
        var q = segs[i], m = Math.max(1, Math.round(q.len / 0.5)), ds = q.len / m;
        for (var j = 0; j < m && idx < n; j++) {
          var kA = q.k0 + (q.k1 - q.k0) * (j / m), kB = q.k0 + (q.k1 - q.k0) * ((j + 1) / m);
          var hm = h + kA * ds / 2, px = x, pz = z, ph = h, pa = acc;
          x += Math.cos(hm) * ds; z += Math.sin(hm) * ds; h += (kA + kB) / 2 * ds; acc += ds;
          // samples exactly every SP metres (interpolated inside the step)
          while (idx < n && acc >= idx * SP - 1e-9) {
            var f = (idx * SP - pa) / ds;
            X[idx] = px + (x - px) * f; Z[idx] = pz + (z - pz) * f; H[idx] = ph + (h - ph) * f; K[idx] = kA + (kB - kA) * f; idx++;
          }
        }
      }
      for (; idx < n; idx++) { X[idx] = X[idx - 1] + Math.cos(H[idx - 1]) * SP; Z[idx] = Z[idx - 1] + Math.sin(H[idx - 1]) * SP; H[idx] = H[idx - 1]; K[idx] = 0; }
    })();

    var startS = LEAD_IN, finishS = total - RUN_OUT;
    var features = [];

    // --- elevation: a grade per module (up / down / steep / flat), smoothed
    var vr = Rng.stream(seed, 'elev'), grade = new Float32Array(n), yEst = 0;
    modules.forEach(function (m, mi) {
      var kind = mi === 0 ? 'flat' : vr.weighted([['flat', 2.0], ['up', 1.6], ['down', 1.8], ['steepUp', 0.45], ['steepDown', 0.55]]);
      // stay inside a mountain's height range
      if (yEst > 110 && (kind === 'up' || kind === 'steepUp')) kind = 'down';
      if (yEst < -110 && (kind === 'down' || kind === 'steepDown')) kind = 'up';
      var gr = kind === 'flat' ? vr.range(-0.02, 0.02) : kind === 'up' ? vr.range(0.04, 0.085) : kind === 'down' ? -vr.range(0.04, 0.09)
        : kind === 'steepUp' ? vr.range(0.105, 0.14) : -vr.range(0.105, 0.145);
      m.vert = kind;
      var i0 = Math.floor(m.s0 / SP), i1 = Math.min(n - 1, Math.floor(m.s1 / SP));
      for (var i = i0; i <= i1; i++) grade[i] = gr;
      yEst += gr * (m.s1 - m.s0);
    });
    // finish area flat-ish
    for (var fi = Math.floor((finishS - 60) / SP); fi < n; fi++) grade[fi] *= 0.3;
    for (var si2 = 0; si2 < Math.floor((startS + 40) / SP); si2++) grade[si2] = 0;
    // moving-average smoothing (twice) for continuous grade
    function smoothArr(a, win) {
      var out = new Float32Array(a.length), acc = 0, cnt = 0, r = Math.floor(win / 2);
      for (var i = -r; i < a.length + r; i++) {
        if (i + r < a.length) { acc += a[Math.min(a.length - 1, i + r)]; cnt++; }
        if (i - r - 1 >= 0) { acc -= a[i - r - 1]; cnt--; }
        if (i >= 0 && i < a.length) out[i] = acc / Math.max(1, cnt);
      }
      return out;
    }
    grade = smoothArr(smoothArr(grade, 18), 12);
    Y[0] = 0; for (var yi = 1; yi < n; yi++) Y[yi] = Y[yi - 1] + grade[yi] * SP;
    for (yi = 0; yi < n; yi++) GR[yi] = grade[yi];

    // steep / up / down features from the module plan
    modules.forEach(function (m) {
      if (m.s1 < startS || m.s0 > finishS) return;
      if (m.vert === 'steepUp' || m.vert === 'steepDown') features.push({ type: m.vert, s0: m.s0, s1: m.s1 });
      else if ((m.vert === 'up' || m.vert === 'down') && m.s1 - m.s0 > 120) features.push({ type: m.vert, s0: m.s0, s1: m.s1 });
    });

    // crests and jumps on straights (vertical bumps added on top)
    var bump = new Float32Array(n);
    modules.forEach(function (m, mi) {
      if (m.kind !== 'straight' || mi === 0 || m.s1 > finishS - 40) return;
      var len = m.s1 - m.s0;
      if (len >= 95 && vr.chance(0.42)) {
        var sj = m.s0 + len * vr.range(0.45, 0.65), lip = vr.range(0.8, 1.25), drop = vr.range(1.4, 2.2);
        for (var i = Math.floor((sj - 16) / SP); i <= Math.floor((sj + 26) / SP) && i < n; i++) {
          var d = i * SP - sj;
          bump[i] += d < 0 ? lip * smooth((d + 16) / 16) : lip - (lip + drop) * smooth(d / 22) + drop * smooth((d - 22) / 4) * 0;
        }
        // ease the drop back into the grade after the landing
        var tail = Math.floor((sj + 26) / SP), base = bump[tail] || 0;
        for (var t = 1; t <= 20 && tail + t < n; t++) bump[tail + t] += base * (1 - smooth(t / 20));
        features.push({ type: 'jump', s0: sj - 16, s1: sj + 26, at: sj });
      } else if (len >= 70 && vr.chance(0.4)) {
        var sc = m.s0 + len * vr.range(0.35, 0.65), A = vr.range(1.5, 2.8), half = vr.range(26, 40);
        for (var c = Math.floor((sc - half) / SP); c <= Math.ceil((sc + half) / SP) && c < n; c++) {
          var u = (c * SP - sc) / half; if (Math.abs(u) <= 1) bump[c] += A * 0.5 * (1 + Math.cos(Math.PI * u));
        }
        features.push({ type: 'crest', s0: sc - half, s1: sc + half, at: sc });
      }
    });
    for (yi = 0; yi < n; yi++) Y[yi] += bump[yi];

    // --- width (smooth noise) and cross slope (mountain side)
    var wr = Rng.noise2(seed + ':width');
    for (var wi = 0; wi < n; wi++) {
      W[wi] = D.ROAD_WIDTH + 0.7 * wr.fbm(wi * SP / 160, 3.1, 2);
      SIDE[wi] = 0.28 * wr.fbm(wi * SP / 400, 11.7, 2) + 0.18 * (wr.fbm(wi * SP / 900, 5.3, 1) > 0 ? 1 : -1);
    }
    // narrower at hairpins? no — hairpins are wider in reality (cars swing out)
    corners.forEach(function (c) {
      if (!c.hairpin) return;
      for (var i = Math.floor(c.s0 / SP); i <= Math.ceil(c.s1 / SP) && i < n; i++) W[i] += 1.4 * Math.sin(Math.PI * clamp((i * SP - c.s0) / (c.s1 - c.s0), 0, 1));
    });

    // --- surfaces: gravel with mud sections
    var sr = Rng.stream(seed, 'surface');
    var mudCount = Math.max(1, Math.round((finishS - startS) / 1000 * sr.range(0.55, 1.05)));
    var mudSecs = [];
    for (var mc = 0; mc < mudCount * 3 && mudSecs.length < mudCount; mc++) {
      var len2 = sr.range(110, 380), s0m = sr.range(startS + 180, finishS - len2 - 60);
      if (mudSecs.some(function (q) { return s0m < q.s1 + 120 && s0m + len2 > q.s0 - 120; })) continue;
      mudSecs.push({ s0: s0m, s1: s0m + len2 });
    }
    mudSecs.sort(function (a, b) { return a.s0 - b.s0; });
    mudSecs.forEach(function (q) {
      for (var i = Math.floor(q.s0 / SP); i <= Math.ceil(q.s1 / SP) && i < n; i++) SURF[i] = 1;
      features.push({ type: 'mud', s0: q.s0, s1: q.s1 });
    });

    // --- rockfall hazards (rocks partly on the road on the uphill side)
    var hr = Rng.stream(seed, 'hazard'), hazards = [];
    var hzCount = Math.round((finishS - startS) / 1700 * hr.range(0.8, 1.3)) || (hr.chance(0.7) ? 1 : 0);
    for (var hz = 0; hz < hzCount * 4 && features.filter(function (f) { return f.type === 'rockfall'; }).length < hzCount; hz++) {
      var sh = hr.range(startS + 300, finishS - 150);
      if (features.some(function (f) { return (f.type === 'jump' || f.type === 'crest' || f.type === 'rockfall') && sh > f.s0 - 80 && sh < f.s1 + 80; })) continue;
      var ih = Math.floor(sh / SP), side = SIDE[ih] >= 0 ? 1 : -1, cnt = hr.int(2, 4), sp = sh;
      for (var r = 0; r < cnt; r++) {
        var ii = Math.min(n - 1, Math.floor(sp / SP)), rr = hr.range(0.45, 0.85);
        var lat = side * (W[ii] / 2 - hr.range(0.6, 1.6));
        var nx = -Math.sin(H[ii]), nz = Math.cos(H[ii]);
        hazards.push({ x: X[ii] + nx * lat, z: Z[ii] + nz * lat, r: rr, s: sp });
        sp += hr.range(5, 14);
      }
      features.push({ type: 'rockfall', s0: sh, s1: sp, side: side });
    }

    // --- checkpoints (split times): equal shares of the timed section
    var checkpoints = [];
    for (var cp = 1; cp < L.splits; cp++) checkpoints.push(startS + (finishS - startS) * cp / L.splits);

    features.sort(function (a, b) { return a.s0 - b.s0; });
    corners.forEach(function (c) { c.grade = c.hairpin ? 1 : D.gradeOf(c.R); });

    var route = {
      seed: seed, lengthKey: lengthKey, SP: SP, n: n, total: total, startS: startS, finishS: finishS,
      x: X, z: Z, y: Y, h: H, k: K, w: W, surf: SURF, side: SIDE, grade: GR,
      modules: modules, corners: corners.filter(function (c) { return c.s1 > startS && c.s0 < finishS; }),
      features: features, hazards: hazards, checkpoints: checkpoints, mainH: plan.mainH,
    };
    buildIndex(route);
    buildTerrain(route);
    scatter(route);
    return route;
  }

  // ---------------------------------------------------------------------
  // Queries used by physics, the stage controller and the renderer.
  function buildIndex(route) {
    var hash = new Hash(24);
    for (var i = 0; i < route.n; i++) hash.add(route.x[i], route.z[i], i);
    route.hash = hash;
    var ob = new Hash(16);
    route.obstacles = [];
    route.obHash = ob;
  }

  // Nearest road sample: a local search around `hint` (cheap, and it never
  // jumps to another leg of the road) or a global one through the hash.
  function locate(route, x, z, hint, win) {
    var best = -1, bd = 1e18, i;
    if (hint != null && hint >= 0) {
      var a = Math.max(0, hint - (win || 30)), b = Math.min(route.n - 1, hint + (win || 30));
      for (i = a; i <= b; i++) { var dx = route.x[i] - x, dz = route.z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    } else {
      route.hash.near(x, z, 48, function (j) { var dx = route.x[j] - x, dz = route.z[j] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = j; } });
      if (best < 0) for (i = 0; i < route.n; i += 4) { var ex = route.x[i] - x, ez = route.z[i] - z, e = ex * ex + ez * ez; if (e < bd) { bd = e; best = i; } }
    }
    // project onto the closer of the two segments around `best`
    var j0 = best, j1 = best, t = 0, lat = 0, bdd = 1e18, cy0 = 0, cd0 = -1, cy1 = 0, cd1 = -1;
    for (var q = -1; q <= 0; q++) {
      var a0 = best + q, a1 = a0 + 1;
      if (a0 < 0 || a1 >= route.n) continue;
      var sx = route.x[a1] - route.x[a0], sz = route.z[a1] - route.z[a0], sl2 = sx * sx + sz * sz;
      var tt = clamp(((x - route.x[a0]) * sx + (z - route.z[a0]) * sz) / sl2, 0, 1);
      var px = route.x[a0] + sx * tt, pz = route.z[a0] + sz * tt, ddx = x - px, ddz = z - pz, dd = ddx * ddx + ddz * ddz;
      var yq = route.y[a0] + (route.y[a1] - route.y[a0]) * tt;
      if (q < 0) { cy0 = yq; cd0 = dd; } else { cy1 = yq; cd1 = dd; }
      if (dd < bdd - 1e-9) {
        bdd = dd; j0 = a0; j1 = a1; t = tt;
        var sl = Math.sqrt(sl2), cr = (sx * ddz - sz * ddx) / sl; // + = right of the road
        lat = cr;
      }
    }
    // On the inside of a tight bend a point can sit between two segments;
    // blend their heights by how close each is, so the surface stays
    // continuous (a segment that is clearly further away weighs nothing).
    var yRoad;
    if (cd0 < 0) yRoad = cy1; else if (cd1 < 0) yRoad = cy0;
    else {
      var w0 = Math.exp(-(cd0 - bdd) / 0.06), w1 = Math.exp(-(cd1 - bdd) / 0.06);
      yRoad = (w0 * cy0 + w1 * cy1) / (w0 + w1);
    }
    return { idx: best, i0: j0, t: t, s: (j0 + t) * route.SP, lat: lat, y: yRoad, w: route.w[best], surf: route.surf[best], h: route.h[best] };
  }

  // Lateral terrain profile next to the road: a ditch, then the mountain
  // side going up on one side and down on the other, plus noise.
  function sideProfile(e, side, nz) {
    if (e <= 0) return 0;
    var ditch = -0.42 * Math.exp(-Math.pow((e - 1.5) / 0.9, 2));
    var slope = side * Math.max(0, e - 2.5) * smooth((e - 2.5) / 8);
    var amp = Math.min(9, 0.12 * Math.max(0, e - 3));
    return ditch + slope + amp * nz;
  }

  // Terrain heightfield: chunks of (CHUNK+1)^2 heights every CELL metres,
  // only near the road. Heights blend every nearby road section (inverse
  // distance), so between two legs of a hairpin the ground ramps smoothly.
  function buildTerrain(route) {
    var noise = Rng.noise2(route.seed + ':terrain');
    var dec = 4, idxs = [];
    for (var i = 0; i < route.n; i += dec) idxs.push(i);
    var th = new Hash(40);
    idxs.forEach(function (i) { th.add(route.x[i], route.z[i], i); });
    var size = CHUNK * CELL, chunks = new Map();
    function ckey(cx, cz) { return (cx + 4096) * 8192 + (cz + 4096); }
    idxs.forEach(function (i) {
      if (i % 8) return;
      var x0 = Math.floor((route.x[i] - BAND) / size), x1 = Math.floor((route.x[i] + BAND) / size);
      var z0 = Math.floor((route.z[i] - BAND) / size), z1 = Math.floor((route.z[i] + BAND) / size);
      for (var cx = x0; cx <= x1; cx++) for (var cz = z0; cz <= z1; cz++) {
        var k = ckey(cx, cz); if (!chunks.has(k)) chunks.set(k, { cx: cx, cz: cz, h: null });
      }
    });
    function heightAt(x, z) {
      var sec = new Map();
      th.near(x, z, 170, function (j) {
        var dx = x - route.x[j], dz = z - route.z[j], d2 = dx * dx + dz * dz, key = Math.floor(j / 24);
        var cur = sec.get(key); if (!cur || d2 < cur.d2) sec.set(key, { j: j, d2: d2 });
      });
      if (!sec.size) return null;
      var sw = 0, sh = 0, nz = noise.fbm(x / 70, z / 70, 4);
      sec.forEach(function (q) {
        var j = q.j, fx = Math.cos(route.h[j]), fz = Math.sin(route.h[j]);
        var lat = (x - route.x[j]) * -fz + (z - route.z[j]) * fx;
        var e = Math.abs(lat) - route.w[j] / 2, side = route.side[j] * (lat >= 0 ? 1 : -0.8);
        var hh = route.y[j] + sideProfile(e, side, nz);
        var wgt = 1 / Math.pow(q.d2 + 16, 1.6);
        sw += wgt; sh += wgt * hh;
      });
      return sh / sw;
    }
    var N = CHUNK + 1;
    chunks.forEach(function (c) {
      var h = new Float32Array(N * N), ok = false;
      for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) {
        var x = c.cx * size + a * CELL, z = c.cz * size + b * CELL, v = heightAt(x, z);
        if (v == null) v = NaN; else ok = true;
        h[b * N + a] = v;
      }
      if (!ok) { chunks.delete(ckey(c.cx, c.cz)); return; }
      // fill gaps (far corners) with the chunk's mean minus a little
      var sum = 0, cnt = 0, q;
      for (q = 0; q < h.length; q++) if (h[q] === h[q]) { sum += h[q]; cnt++; }
      for (q = 0; q < h.length; q++) if (h[q] !== h[q]) h[q] = sum / cnt - 4;
      c.h = h;
    });
    route.terrain = { chunks: chunks, CELL: CELL, CHUNK: CHUNK, size: size, key: ckey, noise: noise };
  }

  function terrainHeight(route, x, z) {
    var T = route.terrain, cx = Math.floor(x / T.size), cz = Math.floor(z / T.size), c = T.chunks.get(T.key(cx, cz));
    if (!c) return -60;
    var lx = (x - cx * T.size) / T.CELL, lz = (z - cz * T.size) / T.CELL, a = Math.min(T.CHUNK - 1, Math.floor(lx)), b = Math.min(T.CHUNK - 1, Math.floor(lz));
    var fx = lx - a, fz = lz - b, N = T.CHUNK + 1, h = c.h;
    var h00 = h[b * N + a], h10 = h[b * N + a + 1], h01 = h[(b + 1) * N + a], h11 = h[(b + 1) * N + a + 1];
    // triangle interpolation matching the rendered mesh (split along 00-11)
    if (fx > fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }

  // Ground height + surface under a point. On the road it is the road
  // itself (flat across, slight crown); off it, the terrain.
  function ground(route, x, z, hint) {
    var L = locate(route, x, z, hint, 24), e = Math.abs(L.lat) - L.w / 2;
    var crown = 0.06 * (1 - Math.min(1, Math.abs(L.lat) / (L.w / 2)));
    if (e <= 0) return { y: L.y + crown, surf: L.surf ? 'mud' : 'gravel', loc: L, onRoad: true };
    var t = smooth(e / 3), th = terrainHeight(route, x, z);
    return { y: L.y + (th - L.y) * t, surf: e < 1.2 ? (L.surf ? 'mud' : 'gravel') : 'grass', loc: L, onRoad: false };
  }

  // ---------------------------------------------------------------------
  // Props: trees, rocks (seeded). `u` decides which are drawn at a given
  // vegetation density; trees with u < 0.4 always exist and are the
  // collidable ones, so physics never changes with the graphics settings.
  function scatter(route) {
    var r = Rng.stream(route.seed, 'props'), trees = [], rocks = [];
    var SPT = 6; // one try per 6 m of road per side
    for (var s = 0; s < route.total; s += SPT) {
      var i = Math.min(route.n - 1, Math.floor(s / route.SP));
      for (var side = -1; side <= 1; side += 2) {
        var tries = 3;
        for (var t = 0; t < tries; t++) {
          var off = route.w[i] / 2 + (r.chance(0.6) ? r.range(4.5, 30) : r.range(30, 150));
          var along = r.range(-SPT / 2, SPT / 2);
          var fx = Math.cos(route.h[i]), fz = Math.sin(route.h[i]);
          var x = route.x[i] + fx * along - fz * off * side, z = route.z[i] + fz * along + fx * off * side;
          var u = r.next(), sc = r.range(0.75, 1.35), kind = r.chance(0.18) ? 1 : 0, rot = r.range(0, 6.28);
          var near = locate(route, x, z, null);
          if (Math.abs(near.lat) < near.w / 2 + 3.6) continue; // another leg of the road
          if (r.chance(0.07)) rocks.push({ x: x, z: z, y: 0, r: r.range(0.5, 1.6), rot: rot, u: u });
          else trees.push({ x: x, z: z, y: 0, s: sc, kind: kind, rot: rot, u: u });
        }
      }
    }
    trees.forEach(function (o) { o.y = terrainHeight(route, o.x, o.z); });
    rocks.forEach(function (o) { o.y = terrainHeight(route, o.x, o.z); });
    route.trees = trees; route.rocks = rocks;
    // collidable obstacles (independent of graphics)
    var ob = route.obHash;
    trees.forEach(function (o) {
      if (o.u >= 0.4) return;
      var L = locate(route, o.x, o.z, null);
      if (Math.abs(L.lat) - L.w / 2 > 45) return;
      var c = { x: o.x, z: o.z, r: 0.35 * o.s + 0.15, kind: 'tree' }; route.obstacles.push(c); ob.add(o.x, o.z, c);
    });
    rocks.forEach(function (o) { var c = { x: o.x, z: o.z, r: o.r * 0.8, kind: 'rock' }; route.obstacles.push(c); ob.add(o.x, o.z, c); });
    route.hazards.forEach(function (o) {
      o.y = ground(route, o.x, o.z, null).y;
      var c = { x: o.x, z: o.z, r: o.r, kind: 'rock' }; route.obstacles.push(c); ob.add(o.x, o.z, c);
    });
  }

  RL.Track = {
    SP: SP, generate: generate, locate: locate, ground: ground, terrainHeight: terrainHeight,
    _makeModule: makeModule,
  };
})(typeof window !== 'undefined' ? window : globalThis);

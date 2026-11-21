// hi-crew.js — 리얼리스틱 pit crew for the 높음 renderer (hi-pit.js) and the
// pit stop viewer: rigged people and the choreography of a real stop.
//
// People: one skinned mesh each on a 19-bone skeleton (hips, spine, chest,
// neck, head, clavicles, arms, legs), skin weights blended across the joints,
// two-bone IK for arms and legs (hands hold the gun / tyre / jack lever, feet
// stay planted) and procedural stepping (a foot steps when the body has moved
// away from it, so walking and running never slide). Fire-proof race suit in
// ripstop fabric (normal map), side and shoulder panels in the team's second
// colour, belt with radio pack, gloves, boots, full-face helmet with a smoked
// visor (gloss per vertex: fabric matt, helmet clear coat, visor mirror).
//
// A stop (Crew.Stop): 21 people — four wheel teams (gun / tyre off / tyre on),
// front and rear jack, two stabilisers, the release man and a repair crew of
// four — with their tools (wheel guns on hoses from the gantry, quick-lift
// jacks, tyres in the compound colour, spare nose / rear wing).
//  - tyres only: the car is stationary ~2.4 s (jacks up, guns off, old wheels
//    out, new wheels in, guns on, hands up, jacks down, release);
//  - each repair is its own job for the repair crew, one after another:
//    new nose (8.5 s), rear wing (10 s), suspension corner (25 s), floor (6 s);
//    the wheel of a broken corner goes on when its suspension is fixed;
//  - a penalty is served first: everyone ready, hands off the car;
//  - a slow stop (real-pit.js stopTime) is one stuck wheel nut.
// Frame: the stop group sits like a car at its box (x = car forward,
// z = car right, y up; garage on the side `garage` = +-1 in z).
// Load order: before hi-pit.js. Depends on: THREE.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var Crew = Hi.Crew = {};

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sm(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function seg(t, a, b) { return b > a ? sm((t - a) / (b - a)) : (t >= a ? 1 : 0); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sp(v, e) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e); }

  // --- Skeleton -----------------------------------------------------------------------------------
  // [name, parent, position relative to the parent] (bind pose: standing, arms down)
  var BONES = [
    ['hips', -1, [0, 0.95, 0]], ['spine', 0, [0, 0.11, 0]], ['chest', 1, [0, 0.18, 0]], ['neck', 2, [0, 0.25, 0]], ['head', 3, [0, 0.09, 0.01]],
    ['clavL', 2, [0.03, 0.2, 0]], ['armL', 5, [0.17, -0.02, 0]], ['foreL', 6, [0, -0.29, 0]], ['handL', 7, [0, -0.26, 0]],
    ['clavR', 2, [-0.03, 0.2, 0]], ['armR', 9, [-0.17, -0.02, 0]], ['foreR', 10, [0, -0.29, 0]], ['handR', 11, [0, -0.26, 0]],
    ['thighL', 0, [0.1, -0.05, 0]], ['shinL', 13, [0, -0.43, 0]], ['footL', 14, [0, -0.4, 0]],
    ['thighR', 0, [-0.1, -0.05, 0]], ['shinR', 16, [0, -0.43, 0]], ['footR', 17, [0, -0.4, 0]],
  ];
  var B = {};
  BONES.forEach(function (b, i) { B[b[0]] = i; });

  // Colour slots (palette per team) and their gloss.
  var SLOT = { main: 0, accent: 1, dark: 2, helmet: 3, visor: 4, glove: 5, sole: 6 };
  var ROUGH = [0.86, 0.82, 0.72, 0.14, 0.04, 0.6, 0.92];

  // --- Mesh builder -------------------------------------------------------------------------------
  function GeoB() { this.p = []; this.n = []; this.uv = []; this.slot = []; this.si = []; this.sw = []; this.ix = []; this.ts = []; }
  GeoB.prototype.tri = function (a, b, c, sl) { this.ix.push(a, b, c); this.ts.push(sl); };
  GeoB.prototype.v = function (p, n, u, v, slot, w) {
    var k = this.p.length / 3, tot = 0, i;
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u, v); this.slot.push(slot);
    for (i = 0; i < 4; i++) tot += w[i] ? w[i][1] : 0;
    for (i = 0; i < 4; i++) { this.si.push(w[i] ? w[i][0] : 0); this.sw.push(w[i] ? w[i][1] / (tot || 1) : 0); }
    return k;
  };
  // Rings of a superellipse cross-section lofted along their centres.
  // ring: {c:[x,y,z], ra, rb, w:[[bone, weight]...], a, b (in-plane axes; a x b = -axis)}
  // slot(cosT, sinT, ring, point) -> colour slot.
  GeoB.prototype.loft = function (rings, segs, e, slot, opts) {
    opts = opts || {};
    var self = this, K = 7, rows = [], ex = 2 / e;
    rings.forEach(function (r, ri) {
      var a = r.a || [1, 0, 0], b = r.b || [0, 0, 1], row = [];
      var along = ri ? rows.along + Math.hypot(r.c[0] - rings[ri - 1].c[0], r.c[1] - rings[ri - 1].c[1], r.c[2] - rings[ri - 1].c[2]) : 0;
      rows.along = along;
      for (var j = 0; j <= segs; j++) {
        var t = (j / segs) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        var cx = sp(ct, ex), cy = sp(st, ex);
        var p = [r.c[0] + a[0] * r.ra * cx + b[0] * r.rb * cy, r.c[1] + a[1] * r.ra * cx + b[1] * r.rb * cy, r.c[2] + a[2] * r.ra * cx + b[2] * r.rb * cy];
        var nx = Math.sign(cx) * Math.pow(Math.abs(cx), e - 1) / r.ra, ny = Math.sign(cy) * Math.pow(Math.abs(cy), e - 1) / r.rb;
        var n = [a[0] * nx + b[0] * ny, a[1] * nx + b[1] * ny, a[2] * nx + b[2] * ny], nl = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0] / nl, n[1] / nl, n[2] / nl];
        var per = Math.PI * (r.ra + r.rb);
        row.push(self.v(p, n, (j / segs) * per * K, along * K, slot(ct, st, r, p), r.w));
      }
      rows.push(row);
    });
    for (var i = 0; i + 1 < rows.length; i++) {
      var r0 = rings[i], r1 = rings[i + 1];
      for (var j = 0; j < segs; j++) {
        var p0 = rows[i][j], p1 = rows[i][j + 1], q0 = rows[i + 1][j], q1 = rows[i + 1][j + 1];
        var tm = ((j + 0.5) / segs) * Math.PI * 2, P = this.p;
        var mid = [0, 1, 2].map(function (k) { return (P[p0 * 3 + k] + P[p1 * 3 + k] + P[q0 * 3 + k] + P[q1 * 3 + k]) / 4; });
        var sl = slot(Math.cos(tm), Math.sin(tm), { c: [(r0.c[0] + r1.c[0]) / 2, (r0.c[1] + r1.c[1]) / 2, (r0.c[2] + r1.c[2]) / 2] }, mid);
        this.tri(p0, q0, p1, sl); this.tri(p1, q0, q1, sl);
      }
    }
    if (opts.cap0) this.cap(rows[0], rings[0], -1, slot);
    if (opts.cap1) this.cap(rows[rows.length - 1], rings[rings.length - 1], 1, slot);
  };
  GeoB.prototype.cap = function (row, r, dir, slot) {
    var a = r.a || [1, 0, 0], b = r.b || [0, 0, 1];
    var ax = [-(a[1] * b[2] - a[2] * b[1]), -(a[2] * b[0] - a[0] * b[2]), -(a[0] * b[1] - a[1] * b[0])];
    var n = [ax[0] * dir, ax[1] * dir, ax[2] * dir];
    var sl = slot(0, 0, r, r.c), c = this.v(r.c, n, 0, 0, sl, r.w);
    for (var j = 0; j + 1 < row.length; j++) {
      if (dir > 0) this.tri(c, row[j + 1], row[j], sl); else this.tri(c, row[j], row[j + 1], sl);
    }
  };
  // Ellipsoid (helmet): lon 0 = +z (front).
  GeoB.prototype.ellipsoid = function (c, rx, ry, rz, lat, lon, phiMax, w, slot, bump) {
    var rows = [];
    for (var i = 0; i <= lat; i++) {
      var phi = (i / lat) * phiMax, row = [];
      for (var j = 0; j <= lon; j++) {
        var lam = (j / lon) * Math.PI * 2 - Math.PI;
        var ux = Math.sin(phi) * Math.sin(lam), uy = Math.cos(phi), uz = Math.sin(phi) * Math.cos(lam);
        var s = slot(phi, lam, ux, uy, uz), k = bump ? bump(s, phi, lam) : 0;
        var p = [c[0] + ux * (rx + k), c[1] + uy * (ry + k), c[2] + uz * (rz + k)];
        var n = [ux / rx, uy / ry, uz / rz], nl = Math.hypot(n[0], n[1], n[2]) || 1;
        row.push(this.v(p, [n[0] / nl, n[1] / nl, n[2] / nl], j / lon * 4, i / lat * 2, s, w));
      }
      rows.push(row);
    }
    for (var a = 0; a < lat; a++) {
      for (var b = 0; b < lon; b++) {
        var p0 = rows[a][b], p1 = rows[a][b + 1], q0 = rows[a + 1][b], q1 = rows[a + 1][b + 1];
        var phi = ((a + 0.5) / lat) * phiMax, lam = ((b + 0.5) / lon) * Math.PI * 2 - Math.PI;
        var sl = slot(phi, lam, Math.sin(phi) * Math.sin(lam), Math.cos(phi), Math.sin(phi) * Math.cos(lam));
        this.tri(p0, q0, p1, sl); this.tri(p1, q0, q1, sl);
      }
    }
  };
  GeoB.prototype.box = function (c, sx, sy, sz, slot, w) {
    var self = this, F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    F.forEach(function (n) {
      var u = n[0] ? [0, 1, 0] : [1, 0, 0], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      var k = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        var p = [0, 1, 2].map(function (i) { return c[i] + (n[i] * 0.5 + u[i] * q[0] * 0.5 + v[i] * q[1] * 0.5) * [sx, sy, sz][i]; });
        k.push(self.v(p, n, q[0] * 0.05, q[1] * 0.05, slot, w));
      });
      self.tri(k[0], k[1], k[2], slot); self.tri(k[0], k[2], k[3], slot);
    });
  };
  // Flat colour per face (from the face centre): suit panels get crisp edges
  // while the normals stay smooth.
  GeoB.prototype.build = function () {
    var P = [], N = [], U = [], SI = [], SW = [], SL = [], self = this;
    for (var t = 0; t < this.ix.length; t += 3) {
      var a = this.ix[t], b = this.ix[t + 1], c = this.ix[t + 2];
      var sl = this.ts[t / 3];
      [a, b, c].forEach(function (k) {
        P.push(self.p[k * 3], self.p[k * 3 + 1], self.p[k * 3 + 2]); N.push(self.n[k * 3], self.n[k * 3 + 1], self.n[k * 3 + 2]); U.push(self.uv[k * 2], self.uv[k * 2 + 1]);
        for (var i = 0; i < 4; i++) { SI.push(self.si[k * 4 + i]); SW.push(self.sw[k * 4 + i]); }
        SL.push(sl);
      });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(SL.length * 3), 3));
    g.setAttribute('aRough', new THREE.Float32BufferAttribute(SL.map(function (s) { return ROUGH[s]; }), 1));
    g.userData.slot = SL;
    g.computeBoundingSphere();
    return g;
  };

  // --- The person ----------------------------------------------------------------------------------
  function W1(n) { return [[B[n], 1]]; }
  function W2(a, b, t) { return [[B[a], 1 - t], [B[b], t]]; }

  function personGeometry() {
    var g = new GeoB();
    // torso (pelvis to shoulders): squarish sections, chest forward
    var T = [[0.80, 0.14, 0.11, 0, W1('hips')], [0.86, 0.175, 0.125, 0, W1('hips')], [0.93, 0.18, 0.13, 0, W1('hips')],
      [0.99, 0.175, 0.128, 0, W2('hips', 'spine', 0.4)], [1.06, 0.17, 0.125, 0, W1('spine')], [1.14, 0.176, 0.13, 0.004, W2('spine', 'chest', 0.4)],
      [1.22, 0.188, 0.138, 0.008, W2('spine', 'chest', 0.75)], [1.30, 0.198, 0.142, 0.012, W1('chest')], [1.37, 0.2, 0.138, 0.008, W1('chest')],
      [1.42, 0.19, 0.122, 0.002, W1('chest')], [1.46, 0.15, 0.1, 0, W1('chest')], [1.49, 0.09, 0.08, 0, W2('chest', 'neck', 0.3)]];
    g.loft(T.map(function (r) { return { c: [0, r[0], r[3]], ra: r[1], rb: r[2], w: r[4] }; }), 28, 2.4, function (ct, st, r, p) {
      var y = p[1];
      if (y > 0.925 && y < 0.985) return SLOT.dark; // belt
      if (y > 1.365) return SLOT.accent; // shoulder yoke
      if (Math.abs(ct) > 0.96 && y < 1.36) return SLOT.accent; // side panels
      if (st > 0.97 && y > 1.0 && y < 1.44) return SLOT.dark; // front zip
      if (st > 0.5 && y > 1.29 && y < 1.33 && p[0] > 0.05 && p[0] < 0.11) return SLOT.accent; // chest badge
      return SLOT.main;
    }, { cap0: true });
    // radio pack on the back of the belt + antenna
    g.box([-0.085, 0.955, -0.135], 0.07, 0.11, 0.035, SLOT.dark, W1('hips'));
    g.box([-0.105, 1.04, -0.135], 0.008, 0.08, 0.008, SLOT.dark, W1('hips'));
    // neck (balaclava) and collar
    g.loft([[1.46, 0.074], [1.52, 0.07], [1.58, 0.066]].map(function (r, i) { return { c: [0, r[0], 0.01], ra: r[1], rb: r[1], w: i === 0 ? W2('chest', 'neck', 0.5) : i === 1 ? W1('neck') : W2('neck', 'head', 0.6) }; }), 14, 2, function () { return SLOT.dark; });
    g.loft([[1.44, 0.1], [1.49, 0.094], [1.535, 0.085]].map(function (r, i) { return { c: [0, r[0], 0.008], ra: r[1], rb: r[1] * 0.9, w: i < 2 ? W2('chest', 'neck', 0.4) : W2('neck', 'head', 0.3) }; }), 18, 2, function () { return SLOT.accent; });
    // helmet: shell, smoked visor, centre stripe and visor trim
    var hc = [0, 1.672, 0.02];
    g.ellipsoid(hc, 0.128, 0.146, 0.156, 18, 32, 2.42, W1('head'), function (phi, lam, ux) {
      var front = Math.abs(lam) < 1.22;
      if (front && phi > 1.3 && phi < 1.86) return SLOT.visor;
      if (front && ((phi > 1.86 && phi < 1.94) || (phi > 1.24 && phi < 1.3))) return SLOT.accent;
      if (phi < 1.25 && Math.abs(ux) < 0.12) return SLOT.accent;
      return SLOT.helmet;
    }, function (s) { return s === SLOT.visor ? 0.006 : 0; });
    // arms (L: +x, R: -x), outer stripe and shoulder in the second colour, gauntlet gloves
    [1, -1].forEach(function (sd) {
      var k = sd > 0 ? 'L' : 'R', x = 0.2 * sd;
      var A = [[0.875, 0.044, 0.046, W2('fore' + k, 'hand' + k, 0.5)], [0.905, 0.046, 0.048, W1('fore' + k)], [0.93, 0.045, 0.047, W1('fore' + k)],
        [0.98, 0.052, 0.054, W1('fore' + k)], [1.08, 0.058, 0.06, W1('fore' + k)], [1.12, 0.06, 0.062, W2('arm' + k, 'fore' + k, 0.62)],
        [1.15, 0.062, 0.064, W2('arm' + k, 'fore' + k, 0.38)], [1.2, 0.065, 0.067, W1('arm' + k)], [1.3, 0.071, 0.073, W1('arm' + k)],
        [1.4, 0.075, 0.076, W2('arm' + k, 'chest', 0.15)], [1.46, 0.068, 0.07, W2('arm' + k, 'chest', 0.5)]];
      g.loft(A.map(function (r) { return { c: [x - sd * (1.46 - r[0]) * 0.012, r[0], 0], ra: r[1], rb: r[2], w: r[3] }; }), 18, 2.1, function (ct, st, r, p) {
        if (p[1] < 0.935) return SLOT.glove;
        if (p[1] > 1.37) return SLOT.accent;
        return ct * sd > 0.93 ? SLOT.accent : SLOT.main;
      });
      // glove: palm faces the body, fingers slightly curled in, thumb in front
      var H = [[0.695, 0.01, 0.02, -0.024], [0.71, 0.016, 0.038, -0.018], [0.74, 0.018, 0.042, -0.01], [0.77, 0.02, 0.045, 0], [0.80, 0.021, 0.047, 0], [0.84, 0.022, 0.048, 0], [0.875, 0.02, 0.042, 0]];
      g.loft(H.map(function (r) { return { c: [x - sd * 0.006 + sd * r[3], r[0], 0.004], ra: r[1], rb: r[2], w: W1('hand' + k) }; }), 12, 2.6, function () { return SLOT.glove; });
      var TH = [[0.755, 0.006, 0.062], [0.77, 0.011, 0.06], [0.80, 0.013, 0.052], [0.84, 0.014, 0.036]];
      g.loft(TH.map(function (r) { return { c: [x - sd * 0.012, r[0], r[2]], ra: r[1], rb: r[1], w: W1('hand' + k) }; }), 8, 2, function () { return SLOT.glove; });
      g.box([x + sd * 0.018, 0.8, 0.004], 0.012, 0.05, 0.075, SLOT.dark, W1('hand' + k)); // knuckle guard
      // legs
      var lx = 0.1 * sd;
      var L = [[0.09, 0.056, 0.06, W2('shin' + k, 'foot' + k, 0.7)], [0.13, 0.056, 0.058, W2('shin' + k, 'foot' + k, 0.4)], [0.17, 0.058, 0.06, W1('shin' + k)],
        [0.26, 0.063, 0.066, W1('shin' + k)], [0.36, 0.069, 0.072, W1('shin' + k)], [0.44, 0.071, 0.074, W2('thigh' + k, 'shin' + k, 0.8)],
        [0.49, 0.073, 0.076, W2('thigh' + k, 'shin' + k, 0.5)], [0.55, 0.077, 0.08, W2('thigh' + k, 'shin' + k, 0.15)], [0.68, 0.088, 0.092, W1('thigh' + k)],
        [0.8, 0.097, 0.1, W1('thigh' + k)], [0.9, 0.104, 0.108, W2('hips', 'thigh' + k, 0.75)], [0.96, 0.104, 0.108, W2('hips', 'thigh' + k, 0.4)]];
      g.loft(L.map(function (r) { return { c: [r[0] > 0.85 ? lx * 0.9 : lx, r[0], r[0] < 0.6 && r[0] > 0.3 ? 0.006 : 0], ra: r[1], rb: r[2], w: r[3] }; }), 18, 2.1, function (ct, st, r, p) {
        if (p[1] < 0.15) return SLOT.dark;
        return ct * sd > 0.93 ? SLOT.accent : SLOT.main;
      });
      // boot (heel -> toe), sole, side stripe
      var F = [[-0.085, 0.055, 0.03, 0.035], [-0.07, 0.06, 0.045, 0.055], [-0.03, 0.065, 0.05, 0.065], [0.03, 0.055, 0.052, 0.055], [0.09, 0.042, 0.05, 0.042], [0.15, 0.036, 0.045, 0.036], [0.185, 0.034, 0.035, 0.03], [0.2, 0.033, 0.015, 0.015]];
      g.loft(F.map(function (r) { return { c: [lx, r[1], r[0]], ra: r[2], rb: r[3], a: [1, 0, 0], b: [0, -1, 0], w: W1('foot' + k) }; }), 16, 2.6, function (ct, st, r, p) {
        if (st > 0.72) return SLOT.sole;
        if (Math.abs(st) < 0.28 && p[2] > -0.05 && p[2] < 0.13) return SLOT.accent;
        return SLOT.dark;
      });
    });
    return g.build();
  }

  // Ripstop fabric normal map (height -> normals).
  function fabricNormal() {
    var N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    var x = c.getContext('2d'), h = new Float32Array(N * N), i, j;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var weave = ((i + j) % 4 < 2 ? 0.35 : 0) + (Math.sin(i * 1.6) * Math.sin(j * 1.6)) * 0.15;
      var grid = (i % 16 < 1 || j % 16 < 1) ? 0.45 : 0;
      h[j * N + i] = weave + grid + Math.random() * 0.12;
    }
    var img = x.createImageData(N, N);
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var dx = h[j * N + (i + 1) % N] - h[j * N + (i - 1 + N) % N], dy = h[((j + 1) % N) * N + i] - h[((j - 1 + N) % N) * N + i];
      var nx = -dx * 0.6, ny = -dy * 0.6, nz = 1, l = Math.hypot(nx, ny, nz), k = (j * N + i) * 4;
      img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // Per-vertex gloss (aRough) and the fabric weave only on the matt parts.
  function roughHook(s) {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRough;\nvarying float vRough;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = aRough;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRough;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * smoothstep(0.5, 0.75, vRough);'));
  }

  // Materials. R: the 높음 renderer (registers / shadows them) or null (viewer).
  function std(R, params, name, hook) {
    if (R) return R.std(params, name, hook);
    var m = new THREE.MeshStandardMaterial(params);
    if (hook) { m.onBeforeCompile = hook; m.customProgramCacheKey = function () { return name; }; }
    return m;
  }
  function L(h) { return new THREE.Color(h).convertSRGBToLinear(); }
  Crew.materials = function (R) {
    var tex = fabricNormal();
    if (R) R.textures.push(tex);
    tex.repeat.set(1, 1);
    return {
      fabric: tex,
      tex: [tex],
      tyre: std(R, { color: L('#141518'), roughness: 0.9, metalness: 0, envMapIntensity: 0.35 }, 'crewTyre'),
      rim: std(R, { color: L('#17191d'), roughness: 0.45, metalness: 0.5, envMapIntensity: 0.45 }, 'crewRim'),
      metal: std(R, { color: L('#8a9099'), roughness: 0.3, metalness: 0.9, envMapIntensity: 0.8 }, 'crewMetal'),
      black: std(R, { color: L('#141518'), roughness: 0.5, metalness: 0.3 }, 'crewBlack'),
      hose: std(R, { color: L('#18191c'), roughness: 0.6, metalness: 0 }, 'crewHose'),
      R: R,
    };
  };
  function suitMaterial(R, M) {
    return std(R, { vertexColors: true, skinning: true, roughness: 1, metalness: 0.02, normalMap: M.fabric, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.65 }, 'crewSuit', roughHook);
  }

  function makeBones() {
    var list = BONES.map(function (b) { var o = new THREE.Bone(); o.name = b[0]; o.position.fromArray(b[2]); return o; });
    BONES.forEach(function (b, i) { if (b[1] >= 0) list[b[1]].add(list[i]); });
    return list;
  }

  // One person: skinned mesh + IK / stepping state.
  function Person(geo, mat) {
    var mesh = new THREE.SkinnedMesh(geo, mat), bones = makeBones();
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.b = {};
    var self = this;
    bones.forEach(function (o) { self.b[o.name] = o; });
    this.x = 0; this.z = 0; this.yaw = 0; this.init = false;
    this.feet = [{ p: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, dur: 0.3, y: 0, pitch: 0 },
      { p: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, dur: 0.3, y: 0, pitch: 0 }];
    this.vx = 0; this.vz = 0; this.speed = 0; this.phase = 0;
  }

  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
  var _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

  // Turn `bone` so its local -Y points along world dir, local +Z towards hint.
  function aim(bone, dir, hint) {
    _y.copy(dir).negate().normalize();
    _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
    if (_z.lengthSq() < 1e-8) { _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0); }
    _z.normalize();
    _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    _q.setFromRotationMatrix(_m);
    bone.parent.getWorldQuaternion(_q2);
    bone.quaternion.copy(_q2.invert().multiply(_q));
    bone.updateMatrixWorld(true);
  }
  // Two-bone IK: b1 (upper), b2 (lower) towards world target T; pole: where the middle joint goes.
  function ik(b1, b2, end, T, pole, hint) {
    var S = b1.getWorldPosition(_v1), L1 = b2.position.length(), L2 = end.position.length();
    var d = _v2.copy(T).sub(S), c = d.length() || 1e-4;
    d.divideScalar(c);
    c = clamp(c, Math.abs(L1 - L2) + 0.01, (L1 + L2) * 0.999);
    var cosA = clamp((L1 * L1 + c * c - L2 * L2) / (2 * L1 * c), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    var p = _v3.copy(pole).addScaledVector(d, -pole.dot(d));
    if (p.lengthSq() < 1e-8) p.set(0, 1, 0).addScaledVector(d, -d.y);
    p.normalize();
    var E = _v4.copy(S).addScaledVector(d, L1 * cosA).addScaledVector(p, L1 * sinA);
    var Tc = _v5.copy(S).addScaledVector(d, c);
    aim(b1, _x.copy(E).sub(S), hint);
    aim(b2, _x.copy(Tc).sub(E), hint);
  }

  // Stop-frame point of a person-local offset.
  Person.prototype.toStop = function (lx, ly, lz, out) {
    var c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return (out || new THREE.Vector3()).set(this.x + lx * c + lz * s, ly, this.z - lx * s + lz * c);
  };

  // Postures: hips, lean and the feet (person-local) the stepping aims for.
  var POSE = {
    stand: { hipY: 0.95, hipZ: 0, lean: 0.04, feet: [[0.11, 0, 0.02, 0], [-0.11, 0, 0.02, 0]] },
    ready: { hipY: 0.8, hipZ: -0.05, lean: 0.38, feet: [[0.17, 0, 0.1, 0], [-0.17, 0, -0.08, 0]] },
    kneel: { hipY: 0.58, hipZ: -0.04, lean: 0.32, feet: [[0.13, 0, 0.32, 0], [-0.13, 0.12, -0.36, 1.15]], knee: [0, -1, 0.3] },
    squat: { hipY: 0.5, hipZ: -0.1, lean: 0.55, feet: [[0.17, 0, 0.12, 0.25], [-0.17, 0, 0.06, 0.25]] },
    lean: { hipY: 0.9, hipZ: -0.08, lean: 0.5, feet: [[0.14, 0, 0.12, 0], [-0.14, 0, -0.12, 0]] },
    brace: { hipY: 0.82, hipZ: -0.12, lean: 0.25, feet: [[0.16, 0, 0.22, 0], [-0.16, 0, -0.3, 0]] },
  };
  Crew.POSE = POSE;

  // Per frame. A: {x, z, yaw (stop frame), pose (name), lean+, look (Vector3),
  // hands: [left, right] stop-frame grip points or null, elbow: [l, r] poles (person-local)}
  Person.prototype.update = function (A, dt, group) {
    var self = this, P = POSE[A.pose || 'stand'];
    dt = Math.min(dt, 0.1);
    if (!this.init) { this.x = A.x; this.z = A.z; this.yaw = A.yaw; }
    // velocity from the scripted root
    var vx = dt > 0 ? (A.x - this.x) / dt : 0, vz = dt > 0 ? (A.z - this.z) / dt : 0;
    var kk = Math.min(1, dt * 12);
    this.vx += (vx - this.vx) * kk; this.vz += (vz - this.vz) * kk;
    this.speed = Math.hypot(this.vx, this.vz);
    this.x = A.x; this.z = A.z;
    var dy = Math.atan2(Math.sin(A.yaw - this.yaw), Math.cos(A.yaw - this.yaw));
    this.yaw += this.init ? dy * Math.min(1, dt * 14) : dy;
    var m = this.mesh;
    m.position.set(this.x, 0, this.z);
    m.rotation.set(0, this.yaw, 0);
    // stepping: each foot aims for the posture's foot (+ a lead with the speed)
    var run = this.speed;
    this.feet.forEach(function (f, i) {
      var spec = P.feet[i], lead = Math.min(run, 6) * 0.11;
      var ideal = self.toStop(spec[0], 0, spec[2], _v1);
      ideal.x += self.vx / (run || 1) * lead; ideal.z += self.vz / (run || 1) * lead;
      if (!self.init) { f.p.copy(ideal); f.t = 1; f.y = spec[1]; f.pitch = spec[3]; f.yaw = self.yaw; return; }
      var other = self.feet[1 - i];
      if (f.t >= 1) {
        var far = Math.hypot(f.p.x - ideal.x, f.p.z - ideal.z), need = run > 0.4 ? 0.08 + run * 0.07 : 0.05;
        var turned = Math.abs(Math.atan2(Math.sin(self.yaw - (f.yaw === undefined ? self.yaw : f.yaw)), Math.cos(self.yaw - (f.yaw === undefined ? self.yaw : f.yaw)))) > 0.55;
        if ((far > need || turned || Math.abs(f.y - spec[1]) > 0.04) && (other.t >= 1 || (run > 2.5 && other.t > 0.55))) {
          f.from.copy(f.p); f.to.copy(ideal);
          f.to.x += self.vx * 0.12; f.to.z += self.vz * 0.12;
          f.dur = A.quick ? 0.13 : clamp(0.32 - run * 0.035, 0.15, 0.32);
          f.t = 0; f.y0 = f.y; f.p0 = f.pitch; f.yaw = self.yaw;
        }
      }
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / f.dur);
        var e = sm(f.t);
        f.p.lerpVectors(f.from, f.to, e);
        f.y = lerp(f.y0, spec[1], e);
        f.pitch = lerp(f.p0, spec[3], e);
        f.lift = Math.sin(Math.PI * f.t) * (0.05 + Math.min(run, 5) * 0.022);
      } else { f.lift = 0; f.y = spec[1]; f.pitch = spec[3]; }
    });
    this.init = true;
    // trunk
    var b = this.b, bob = run > 0.5 ? Math.min(run, 5) * 0.012 * Math.abs(Math.sin(this.phase)) : 0;
    this.phase += run * dt * 3.2;
    var lean = P.lean + (A.lean || 0) + Math.min(run, 5) * 0.045;
    b.hips.position.set(0, P.hipY - bob + (A.hipY || 0), P.hipZ);
    b.hips.rotation.set(lean * 0.35, 0, 0);
    b.spine.rotation.set(lean * 0.35, (A.twist || 0) * 0.5, 0);
    b.chest.rotation.set(lean * 0.3, (A.twist || 0) * 0.5, 0);
    // head looks at A.look
    var hy = 0, hp = 0;
    if (A.look) {
      var lx = A.look.x - this.x, lz = A.look.z - this.z;
      hy = clamp(Math.atan2(Math.sin(Math.atan2(lx, lz) - this.yaw - (A.twist || 0)), Math.cos(Math.atan2(lx, lz) - this.yaw - (A.twist || 0))), -1.1, 1.1);
      hp = clamp(-Math.atan2(A.look.y - 1.5 * P.hipY / 0.95, Math.hypot(lx, lz) + 0.01) - lean, -0.7, 0.8);
    }
    b.neck.rotation.set(hp * 0.4, hy * 0.45, 0);
    b.head.rotation.set(hp * 0.6, hy * 0.55, 0);
    b.clavL.rotation.set(0, 0, 0); b.clavR.rotation.set(0, 0, 0);
    m.updateMatrixWorld(true);
    // legs
    var fwd = _v4.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    var gq = group ? group.getWorldQuaternion(_q2).clone() : new THREE.Quaternion();
    ['L', 'R'].forEach(function (k, i) {
      var f = self.feet[i], T = new THREE.Vector3(f.p.x, 0.07 + f.y + (f.lift || 0), f.p.z);
      if (group) group.localToWorld(T);
      var pole = (P.knee && i === 1) ? new THREE.Vector3(P.knee[0], P.knee[1], P.knee[2]) : new THREE.Vector3(0, 0, 1);
      pole.applyAxisAngle(_y.set(0, 1, 0), self.yaw);
      if (!(P.knee && i === 1)) pole.add(new THREE.Vector3(0, 0.15, 0));
      if (group) pole.applyQuaternion(gq);
      var hint = (P.knee && i === 1) ? new THREE.Vector3(0, 0, 1).applyAxisAngle(_y.set(0, 1, 0), self.yaw) : pole.clone();
      if (group) hint.applyQuaternion(gq);
      ik(b['thigh' + k], b['shin' + k], b['foot' + k], T, pole, hint);
      // foot: flat (yaw of the body) or pitched (toes down)
      _e.set(f.pitch + (f.lift ? -0.25 * Math.sin(Math.PI * f.t) : 0), self.yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      if (group) _q.premultiply(gq);
      b['shin' + k].getWorldQuaternion(_q2);
      b['foot' + k].quaternion.copy(_q2.invert().multiply(_q));
    });
    // arms: grip points (the left hand takes the one more to the left), or hanging / swinging
    if (A.hands && A.hands[0] && A.hands[1] && !A.keepHands) {
      var rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      if ((A.hands[0].x - this.x) * rx + (A.hands[0].z - this.z) * rz < (A.hands[1].x - this.x) * rx + (A.hands[1].z - this.z) * rz) A.hands = [A.hands[1], A.hands[0]];
    }
    ['L', 'R'].forEach(function (k, i) {
      var sd = i ? -1 : 1, H = A.hands && A.hands[i], T;
      if (H) {
        T = _v5.copy(H);
        if (group) group.localToWorld(T);
        var sh = b['arm' + k].getWorldPosition(new THREE.Vector3());
        var d = T.clone().sub(sh), len = d.length();
        if (len > 0.05) T = T.clone().addScaledVector(d, -0.07 / len); // grip -> wrist
        else T = T.clone();
      } else {
        var swing = run > 0.4 ? Math.sin(self.phase + (i ? 0 : Math.PI)) * Math.min(run, 5) * 0.06 : 0;
        T = b.chest.localToWorld(new THREE.Vector3(sd * 0.22, -0.34 + 0.05 * Math.abs(swing), 0.06 + swing));
      }
      var el = (A.elbow && A.elbow[i]) || [sd * 0.6, -0.4, -1];
      var pole = new THREE.Vector3(el[0], el[1], el[2]);
      b.chest.getWorldQuaternion(_q); pole.applyQuaternion(_q);
      ik(b['arm' + k], b['fore' + k], b['hand' + k], T, pole, pole.clone().negate());
      b['hand' + k].rotation.set(A.wrist ? A.wrist[0] : 0.15, 0, 0);
    });
  };

  // --- Props --------------------------------------------------------------------------------------
  function lathe(points, segs) { return new THREE.LatheGeometry(points.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), segs); }
  // A tyre on its wheel, axis along z (outer face +z when facing right).
  function tyreProp(M, R, r, w) {
    var g = new THREE.Group(), sh = 0.055;
    var pts = [[r * 0.64, -w / 2 + 0.01], [r - sh * 1.2, -w / 2]];
    for (var i = 0; i <= 6; i++) { var a = -Math.PI / 2 + (i / 6) * Math.PI / 2; pts.push([r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh]); }
    for (var j = 0; j <= 6; j++) { var b2 = (j / 6) * Math.PI / 2; pts.push([r - sh + Math.cos(b2) * sh, w / 2 - sh + Math.sin(b2) * sh]); }
    pts.push([r - sh * 1.2, w / 2], [r * 0.64, w / 2 - 0.01]);
    var tg = lathe(pts, 32); tg.rotateX(Math.PI / 2);
    var tyre = new THREE.Mesh(tg, M.tyre); tyre.castShadow = true; g.add(tyre);
    // rim with a wheel cover, centre nut
    var cover = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, w - 0.05, 28, 1, true), M.rim); cover.rotation.x = Math.PI / 2; g.add(cover);
    [1, -1].forEach(function (sd) {
      var disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.64, 28), M.rim);
      disc.position.z = sd * (w / 2 - 0.03); if (sd < 0) disc.rotation.y = Math.PI; g.add(disc);
    });
    var nut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6), M.metal); nut.rotation.x = Math.PI / 2; nut.position.z = w / 2 - 0.0; g.add(nut);
    // compound stripe on both sidewalls
    var band = std(R, { color: 0xffffff, roughness: 0.55, metalness: 0 }, 'crewBand');
    [1, -1].forEach(function (sd) {
      var ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r * 0.85, 40), band);
      ring.position.z = sd * (w / 2 + 0.002); if (sd < 0) ring.rotation.y = Math.PI; g.add(ring);
    });
    g.userData.band = band;
    return g;
  }
  // Wheel gun: socket +z, body, side handle, pistol grip; hose to the gantry.
  function gunProp(M) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.24, 14), M.metal); body.rotation.x = Math.PI / 2; body.position.z = -0.17; g.add(body);
    var nose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.11, 10), M.black); nose.rotation.x = Math.PI / 2; nose.position.z = -0.0; g.add(nose);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 14), M.black); cap.rotation.x = Math.PI / 2; cap.position.z = -0.3; g.add(cap);
    var grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.045), M.black); grip.position.set(0, -0.08, -0.26); grip.rotation.x = -0.2; g.add(grip);
    var side = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 8), M.black); side.position.set(0, 0.07, -0.12); g.add(side);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  // Quick-lift jack: cradle at the origin, lever pivots at x = 0.25, handle at +x.
  function jackProp(M, R, color) {
    var g = new THREE.Group();
    var paint = std(R, { color: new THREE.Color(color || '#c8102e').convertSRGBToLinear(), roughness: 0.35, metalness: 0.3 }, 'crewJack');
    var rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), M.metal); rail.position.set(0.12, 0.05, 0); g.add(rail);
    [-0.14, 0.14].forEach(function (z) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), M.black); wh.rotation.x = Math.PI / 2; wh.position.set(0.32, 0.04, z); g.add(wh);
      var wh2 = wh.clone(); wh2.position.x = -0.08; g.add(wh2);
    });
    var axle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.3), M.metal); axle.position.set(0.32, 0.04, 0); g.add(axle);
    var cradle = new THREE.Group(); cradle.position.set(0, 0.1, 0); g.add(cradle);
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.34), paint); cradle.add(base);
    [-0.16, 0.16].forEach(function (z) { var e = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.02), paint); e.position.set(0, 0.035, z); cradle.add(e); });
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), M.metal); post.position.set(0, -0.04, 0); cradle.add(post);
    var lever = new THREE.Group(); lever.position.set(0.25, 0.1, 0); g.add(lever);
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.25, 10), paint); bar.rotation.z = -Math.PI / 2; bar.position.x = 0.625; lever.add(bar);
    var tbar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 10), M.black); tbar.rotation.x = Math.PI / 2; tbar.position.x = 1.25; lever.add(tbar);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    g.userData = { cradle: cradle, lever: lever, paint: paint };
    return g;
  }
  function rodProp(M) {
    var g = new THREE.Group();
    var r = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 8), M.black); r.rotation.z = Math.PI / 2; g.add(r);
    [-0.28, 0.28].forEach(function (x) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M.metal); e.position.x = x; g.add(e); });
    return g;
  }

  // Object3D.clone deep-copies userData through JSON; hi-car's damage state
  // keeps the parent object there (circular), so clone with it set aside.
  function safeClone(o) {
    var saved = [];
    o.traverse(function (n) { saved.push([n, n.userData]); n.userData = {}; });
    var c = o.clone();
    saved.forEach(function (x) { x[0].userData = x[1]; });
    return c;
  }

  // Box of an object in the car frame (car.group's local space).
  function localBox(obj, root) {
    var box = new THREE.Box3(), inv = new THREE.Matrix4();
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    obj.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      var b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      box.union(b);
    });
    return box;
  }

  // --- A stop ---------------------------------------------------------------------------------------
  var DEF_WHEELS = [{ x: 1.72, z: -0.82, r: 0.36, front: true }, { x: 1.72, z: 0.82, r: 0.36, front: true }, { x: -1.62, z: -0.8, r: 0.36 }, { x: -1.62, z: 0.8, r: 0.36 }];

  Crew.Stop = function (M, opts) {
    opts = opts || {};
    var R = M.R;
    this.M = M;
    this.group = new THREE.Group();
    this.geo = personGeometry();
    this.mat = suitMaterial(R, M);
    this.people = [];
    for (var i = 0; i < 21; i++) { var p = new Person(this.geo, this.mat); this.people.push(p); this.group.add(p.mesh); }
    this.oldT = []; this.newT = []; this.guns = []; this.hoses = [];
    for (var c = 0; c < 4; c++) {
      var o = tyreProp(M, R, 0.36, 0.38), n = tyreProp(M, R, 0.36, 0.38);
      this.oldT.push(o); this.newT.push(n); this.group.add(o, n);
      var gn = gunProp(M); this.guns.push(gn); this.group.add(gn);
      var h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 6), M.hose); this.hoses.push(h); this.group.add(h);
    }
    this.jackF = jackProp(M, R); this.jackR = jackProp(M, R);
    this.group.add(this.jackF, this.jackR);
    this.rod = rodProp(M); this.group.add(this.rod);
    this.tools = [0, 1].map(function () { var t = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8), M.metal); return t; });
    this.tools.forEach(function (t) { this.group.add(t); }, this);
    this.parts = {}; // nose / rear wing props per car
    this.team = null;
    this.setCar(null);
  };
  var SP = Crew.Stop.prototype;

  // A new car comes in: people start fresh (no stepping from old places).
  SP.reset = function () { this.people.forEach(function (p) { p.init = false; }); };

  // Team colours: {main, accent, helmet, dark?}
  SP.setTeam = function (key, col) {
    if (this.team === key) return;
    this.team = key;
    var pal = [col.main, col.accent, col.dark || '#15161a', col.helmet || col.main, '#07080b', col.glove || '#16171b', '#0c0d10'].map(function (h) { return new THREE.Color(h).convertSRGBToLinear(); });
    var slot = this.geo.userData.slot, a = this.geo.attributes.color;
    for (var i = 0; i < slot.length; i++) { var c = pal[slot[i]]; a.setXYZ(i, c.r, c.g, c.b); }
    a.needsUpdate = true;
    var jc = new THREE.Color(col.accent).convertSRGBToLinear();
    this.jackF.userData.paint.color.copy(jc); this.jackR.userData.paint.color.copy(jc);
  };

  // The car this crew services (hi-car.js object): wheel corners, nose and wing props.
  SP.setCar = function (car) {
    if (car && this.car === car) return;
    this.car = car;
    var W = DEF_WHEELS.map(function (w) { return Object.assign({}, w); }), nose = 2.8, tail = -2.5, fw = null, rw = null;
    if (car && car.wheels && car.wheels.length === 4) {
      W = car.wheels.map(function (wh) {
        var b = wh.pivot.userData.dmgBase ? wh.pivot.userData.dmgBase.p : wh.pivot.position;
        return { x: b.x, z: b.z, r: wh.r, front: wh.front, wh: wh };
      });
      W.sort(function (a, b) { return (b.x - a.x) || (a.z - b.z); }); // FL, FR, RL, RR
      if (car.frontWing && !car.frontWing.userData.dmgGone) { fw = localBox(car.frontWing, car.group); nose = Math.max(nose, fw.max.x); }
      if (car.rearWing && !car.rearWing.userData.dmgGone) { rw = localBox(car.rearWing, car.group); tail = Math.min(tail, rw.min.x); }
    }
    this.W = W;
    this.nose = nose; this.tail = tail;
    this.fwBox = fw || new THREE.Box3(new THREE.Vector3(nose - 0.6, 0.05, -0.95), new THREE.Vector3(nose, 0.3, 0.95));
    this.rwBox = rw || new THREE.Box3(new THREE.Vector3(tail, 0.7, -0.5), new THREE.Vector3(tail + 0.4, 1.0, 0.5));
    var self = this;
    ['fwOld', 'fwNew', 'rwOld', 'rwNew'].forEach(function (k) { if (self.parts[k]) { self.group.remove(self.parts[k]); self.parts[k] = null; } });
    function prop(src, box) {
      var g = new THREE.Group(), inner;
      if (src) {
        inner = safeClone(src);
        var b = src.userData.dmgBase;
        if (b) { inner.position.copy(b.p); inner.rotation.copy(b.r); }
      } else {
        inner = new THREE.Mesh(new THREE.BoxGeometry(box.max.x - box.min.x, 0.06, box.max.z - box.min.z), self.M.black);
        inner.position.copy(box.getCenter(new THREE.Vector3()));
      }
      g.add(inner);
      g.visible = false;
      self.group.add(g);
      return g;
    }
    this.parts.fwOld = prop(car && car.frontWing, this.fwBox); this.parts.fwNew = prop(car && car.frontWing, this.fwBox);
    this.parts.rwOld = prop(car && car.rearWing, this.rwBox); this.parts.rwNew = prop(car && car.rearWing, this.rwBox);
  };

  // Schedule of the jobs for a work time W (s): tyre times, repair windows, jacks.
  function plan(S) {
    var items = S.items || [], fix = 0;
    items.forEach(function (it) { fix += it.d; });
    var W = Math.max(S.work || 2.4, 1.6), base = Math.max(1.6, W - fix);
    var k = clamp(Math.min(base, 2.6) / 2.4, 0.82, 1.08), slowD = Math.max(0, base - 2.6);
    var drop = W - 0.62 * k;
    var jobs = [], t0 = 0.45;
    items.forEach(function (it) { jobs.push({ k: it.k, c: it.c, a: t0, b: t0 + it.d }); t0 += it.d; });
    var corners = [0, 1, 2, 3].map(function (c) {
      var slow = S.slow === c ? slowD : 0;
      var loose = 0.4 * k + slow;
      var onA = loose + 0.07 * k, onB = loose + 0.32 * k;
      jobs.forEach(function (j) { if (j.k === 'susp' && CORNER[j.c] === c) { onB = j.b - 0.08; onA = onB - 0.3; } });
      var tightB = onB + 0.36 * k;
      return { engage: 0.08 * k, loose: loose, struggle: slow, offA: loose - 0.02, offB: loose + 0.18 * k, backB: loose + 0.46 * k, onA: onA, onB: onB, tightB: tightB, done: tightB + 0.06 };
    });
    return { W: W, k: k, drop: drop, jobs: jobs, c: corners };
  }
  var CORNER = { fl: 0, fr: 1, rl: 2, rr: 3 };
  Crew.plan = plan;

  // Per frame. S: {phase 'in'|'stop'|'out'|'idle', approach 0..1, t (s into the stop),
  // outT (s since the release), serve (s), work (s), items [{k:'nose'|'rw'|'susp'|'floor', c, d}],
  // oldTyre, newTyre (colours), slow (corner 0-3 or -1), garage (+-1), dt}
  // Returns the car control {lift, wheel: [shown...], fw, rw ('car'|'hidden'|'fitted'), green}.
  SP.update = function (S, dt) {
    var self = this, G = S.garage || -1, W = this.W, Pn = plan(S), k = Pn.k, grp = this.group;
    grp.updateWorldMatrix(true, true);
    var phase = S.phase, a = phase === 'in' ? clamp(S.approach || 0, 0, 1) : 1;
    var tau = phase === 'stop' ? (S.t || 0) - (S.serve || 0) : phase === 'out' ? Pn.W + (S.outT || 0) : -1;
    var serving = phase === 'stop' && tau < 0;
    var out = phase === 'out' ? (S.outT || 0) : 0;
    var lift = phase === 'stop' && tau >= 0 ? seg(tau, 0.02, 0.2 * k) * (1 - seg(tau, Pn.drop, Pn.drop + 0.14)) : 0;
    var L = 0.085 * lift;
    var ctl = { lift: L, wheel: [true, true, true, true], fw: 'car', rw: 'car', green: phase === 'out' || (phase === 'stop' && tau > Pn.W - 0.12) };
    var home = function (i) { return { x: -2.2 + (i % 7) * 0.75, z: G * (4.4 + Math.floor(i / 7) * 0.7) }; };
    // run out of the garage while the car comes down the lane, back in after it left
    function place(i, x, z, yaw) {
      var h = home(i), u = seg(a, 0.04 + (i % 7) * 0.015, 0.5 + (i % 5) * 0.02), v = seg(out, 1.2 + (i % 6) * 0.12, 3.6 + (i % 4) * 0.2);
      var px = lerp(h.x, x, u), pz = lerp(h.z, z, u);
      px = lerp(px, h.x, v); pz = lerp(pz, h.z, v);
      var moving = (u > 0 && u < 1) || (v > 0 && v < 1);
      var ty = moving ? Math.atan2((v > 0 ? h.x - x : x - h.x), (v > 0 ? h.z - z : z - h.z)) : yaw;
      return { x: px, z: pz, yaw: ty, away: v, moving: moving };
    }
    var people = this.people, car = { x: 0, z: 0 };
    function look(x, y, z) { return new THREE.Vector3(x, y, z); }
    function yawTo(fx, fz, tx, tz) { return Math.atan2(tx - fx, tz - fz); }

    // --- wheel teams ---
    W.forEach(function (w, c) {
      var s = w.z < 0 ? -1 : 1, T = Pn.c[c], hub = new THREE.Vector3(w.x, w.r + L, w.z);
      var nut = hub.clone(); nut.z += s * 0.215;
      var gun = people[c * 3], off = people[c * 3 + 1], on = people[c * 3 + 2];
      // long repairs: a wheel team that is done stands back until the jacks come down
      var idle = phase === 'stop' && ((tau > T.done + 0.8 && tau < Pn.drop - 0.9) || (tau > T.offB + 0.6 && tau < T.onA - 1.2)); // (or waiting for a suspension fix)
      // GUN
      var gx = w.x, gz = w.z + s * (idle ? 1.3 : 0.86);
      var Pg = place(c * 3, gx, gz, yawTo(gx, gz, w.x, w.z));
      var engaged = tau >= T.engage && (tau < T.offA + 0.06 || (tau > T.onB - 0.02 && tau < T.done));
      var kneel = !Pg.moving && !idle && (phase === 'stop' || (phase === 'in' && a > 0.92));
      var gunPos = new THREE.Vector3(), back = engaged ? 0 : (tau > T.offA && tau < T.onB ? 0.16 : 0.3);
      gunPos.copy(nut); gunPos.z += s * back;
      var shake = (tau > T.engage && tau < T.loose) || (tau > T.onB && tau < T.tightB) ? 1 : 0;
      if (T.struggle && tau > T.engage && tau < T.loose) shake = 1.8;
      var gq = new THREE.Vector3(0, 0, -s); // socket towards the car
      var gunG = self.guns[c];
      gunG.position.copy(gunPos);
      gunG.rotation.set(shake ? Math.sin(tau * 260) * 0.012 * shake : 0, s > 0 ? Math.PI : 0, shake ? Math.cos(tau * 310) * 0.01 * shake : 0);
      var held = !Pg.moving && Pg.away === 0;
      var signal = phase === 'stop' && ((tau > T.done && tau < T.done + 0.8) || (tau > Pn.drop - 0.9 && tau > T.done && tau < Pn.drop + 0.1));
      if (!kneel || Pg.moving) {
        // carrying the gun at the chest
        var cp = gun.toStop(0.05, 1.05, 0.38, new THREE.Vector3());
        gunG.position.copy(cp);
        gunG.rotation.set(0.3, gun.yaw, 0);
      }
      var rear = new THREE.Vector3(0, -0.06, -0.27).applyEuler(gunG.rotation).add(gunG.position);
      var side = new THREE.Vector3(0, 0.13, -0.12).applyEuler(gunG.rotation).add(gunG.position);
      var hands = [side, rear];
      if (signal) hands = [gun.toStop(0.18, 1.55, 0.25), rear];
      gun.update({ x: Pg.x, z: Pg.z, yaw: Pg.yaw, pose: kneel ? 'kneel' : (phase === 'stop' || a > 0.6) && !Pg.moving && !idle ? 'ready' : 'stand', look: look(w.x, w.r, w.z), hands: hands, keepHands: signal, quick: phase === 'stop' }, dt, grp);
      // hose from the gun tail up to the gantry
      var hose = self.hoses[c], top = new THREE.Vector3(w.x + (w.front ? 0.4 : -0.4), 4.15, w.z + s * 1.4);
      var tail = new THREE.Vector3(0, 0, -0.33).applyEuler(gunG.rotation).add(gunG.position);
      hose.position.copy(tail).add(top).multiplyScalar(0.5);
      hose.scale.set(1, tail.distanceTo(top), 1);
      hose.quaternion.setFromUnitVectors(_y.set(0, 1, 0), _x.copy(top).sub(tail).normalize());
      // OLD TYRE: on the car until it is pulled off, then carried away
      var oldT = self.oldT[c], newT = self.newT[c];
      var pull = seg(tau, T.offA, T.offB), backU = seg(tau, T.offB, T.backB);
      var stash = new THREE.Vector3(w.x - 1.05, 0.36, w.z + s * 1.05);
      var op = hub.clone(); op.z += s * 0.5 * pull;
      op.lerp(stash, backU);
      var offWho = place(c * 3 + 1, w.x - 0.55, w.z + s * 0.78, yawTo(w.x - 0.55, w.z + s * 0.78, w.x, w.z));
      var offed = phase !== 'in' && tau >= T.offA;
      if (offed && phase === 'out' && out > 1.0) { // carried back to the garage
        var c0 = off.toStop(0, 0.62, 0.42, new THREE.Vector3());
        op.copy(c0);
      }
      oldT.visible = offed;
      oldT.position.copy(op);
      oldT.rotation.set(0, offed && phase === 'out' && out > 1.0 ? off.yaw + Math.PI / 2 : (s > 0 ? 0 : Math.PI), 0);
      // NEW TYRE: held by the on man, pushed onto the hub, part of the car until the release
      var holdP = on.toStop(0, 0.58, 0.36, new THREE.Vector3());
      var onU = seg(tau, T.onA, T.onB);
      var np = holdP.clone().lerp(hub, onU);
      var fitted = tau >= T.onB;
      if (fitted) np.copy(hub);
      newT.visible = phase !== 'out' && !(phase === 'in' && a < 0.3);
      newT.position.copy(np);
      newT.rotation.set(0, (s > 0 ? 0 : Math.PI) + (fitted ? 0 : 0), 0);
      if (!fitted && onU <= 0) newT.rotation.y = on.yaw + Math.PI / 2;
      ctl.wheel[c] = !(phase === 'stop' && tau >= T.offA);
      // OFF man
      var ox = w.x - 0.55, oz = w.z + s * 0.78;
      if (tau > T.offB) { ox = lerp(ox, w.x - 1.45, backU); oz = lerp(oz, w.z + s * 1.25, backU); }
      var Po = place(c * 3 + 1, ox, oz, yawTo(ox, oz, op.x, op.z));
      var oh = null;
      if (phase === 'stop' && tau > T.offA - 0.12 || (offed && !(phase === 'out' && out > 3.4))) {
        var tc = oldT.visible ? op : hub;
        oh = [new THREE.Vector3(tc.x - 0.16, tc.y + 0.24, tc.z + s * 0.2), new THREE.Vector3(tc.x + 0.16, tc.y + 0.24, tc.z + s * 0.2)];
        if (phase === 'out' && out > 1.0) oh = [new THREE.Vector3(op.x, op.y + 0.1, op.z).add(new THREE.Vector3(Math.cos(off.yaw) * 0.2, 0, -Math.sin(off.yaw) * 0.2)), new THREE.Vector3(op.x, op.y + 0.1, op.z).add(new THREE.Vector3(-Math.cos(off.yaw) * 0.2, 0, Math.sin(off.yaw) * 0.2))];
      }
      off.update({ x: Po.x, z: Po.z, yaw: Po.yaw, pose: Po.moving ? 'stand' : (tau > T.backB ? 'lean' : (a > 0.6 ? 'ready' : 'stand')), look: look(op.x, op.y, op.z), hands: oh, quick: phase === 'stop' }, dt, grp);
      // ON man
      var nx = w.x + 0.78, nz = w.z + s * 1.12;
      if (onU > 0) { nx = lerp(nx, w.x + 0.5, onU); nz = lerp(nz, w.z + s * 0.72, onU); }
      if (tau > T.onB + 0.18) { var bk = seg(tau, T.onB + 0.18, T.onB + 0.5); nx = lerp(w.x + 0.5, w.x + 0.95, bk); nz = lerp(w.z + s * 0.72, w.z + s * 1.2, bk); }
      var Pn2 = place(c * 3 + 2, nx, nz, yawTo(nx, nz, w.x, w.z));
      var onHands = null;
      if (newT.visible && tau < T.onB + 0.18) {
        var cc = np;
        onHands = [new THREE.Vector3(cc.x + 0.17, cc.y + 0.2, cc.z + s * 0.17), new THREE.Vector3(cc.x - 0.17, cc.y + 0.2, cc.z + s * 0.17)];
        if (onU <= 0 && !fitted) { // carried in front of the body
          onHands = [on.toStop(0.22, 0.72, 0.34), on.toStop(-0.22, 0.72, 0.34)];
        }
      }
      on.update({ x: Pn2.x, z: Pn2.z, yaw: Pn2.yaw, pose: Pn2.moving || idle ? 'stand' : (onU > 0 && tau < T.onB + 0.3 ? 'lean' : 'ready'), look: look(w.x, w.r, w.z), hands: onHands, quick: phase === 'stop' }, dt, grp);
    });

    // --- jacks ---
    function jack(J, man, idx, front) {
      var sgn = front ? 1 : -1, end = front ? self.nose : self.tail;
      var under = front ? end - 0.38 : end + 0.3, wait = front ? end + 0.45 : end - 0.45;
      var inU = phase === 'stop' ? seg(tau, -0.15, 0.08 * k) : (phase === 'in' && a > 0.97 ? 0.0 : 0);
      if (phase === 'stop' && serving) inU = 0;
      var outU = phase === 'stop' ? seg(tau, Pn.drop + 0.12, Pn.drop + 0.4) : phase === 'out' ? 1 : 0;
      var cx = lerp(wait, under, inU), cz = 0;
      if (outU > 0) { cx = lerp(under, front ? end + 0.9 : end - 0.9, outU); cz = front ? G * 1.3 * outU : 0; }
      J.position.set(cx, 0, cz);
      J.rotation.y = front ? (outU > 0 ? -G * 0.9 * outU : 0) : Math.PI;
      var ang = lerp(0.62, 0.32, lift);
      J.userData.lever.rotation.z = ang;
      J.userData.cradle.position.y = 0.1 + L * 1.05;
      J.visible = a > 0.35 || phase !== 'in';
      J.updateMatrixWorld(true);
      var hdl = new THREE.Vector3(1.25, 0, 0); J.userData.lever.localToWorld(hdl);
      self.group.worldToLocal(hdl);
      var mx = hdl.x + sgn * 0.45, mz = hdl.z;
      var Pj = place(idx, mx, mz, yawTo(mx, mz, hdl.x - sgn, hdl.z));
      var hh = J.visible && !Pj.moving ? [hdl.clone().add(new THREE.Vector3(0, 0, 0.14)), hdl.clone().add(new THREE.Vector3(0, 0, -0.14))] : null;
      if (hh && !front) hh = [hh[1], hh[0]];
      man.update({ x: Pj.x, z: Pj.z, yaw: Pj.yaw, pose: Pj.moving ? 'stand' : 'brace', lean: lift * 0.35, look: look(front ? end : end, 0.5, 0), hands: hh, quick: phase === 'stop' }, dt, grp);
    }
    jack(this.jackF, people[12], 12, true);
    jack(this.jackR, people[13], 13, false);

    // --- stabilisers on the sidepods ---
    [-1, 1].forEach(function (s, i) {
      var man = people[14 + i], hold = phase === 'stop' && tau > -0.1 && tau < Pn.drop + 0.12;
      var x = 0.1, z = s * (hold ? 0.98 : 1.25);
      var P = place(14 + i, x, z, yawTo(x, z, 0, 0));
      man.update({ x: P.x, z: P.z, yaw: P.yaw, pose: P.moving ? 'stand' : hold ? 'lean' : 'ready', look: look(0.6, 0.6, 0),
        hands: hold && !P.moving ? [new THREE.Vector3(0.38, 0.63 + L, s * 0.52), new THREE.Vector3(-0.22, 0.62 + L, s * 0.55)] : null, quick: true }, dt, grp);
    });

    // --- release man: watches the lane behind, arm up until it is clear ---
    var rm = people[16], rx = this.nose + 0.4, rz = G * 1.7;
    var Pr = place(16, rx, rz, yawTo(rx, rz, 0, 0));
    var clear = ctl.green;
    rm.update({ x: Pr.x, z: Pr.z, yaw: Pr.yaw, pose: 'stand', twist: phase === 'stop' ? -G * 0.5 : 0, look: phase === 'stop' ? look(-30, 1, -G * 3) : look(0, 0.5, 0),
      hands: !Pr.moving && phase === 'stop' ? [rm.toStop(0.25, clear ? 1.95 : 1.45, clear ? 0.35 : 0.3), null] : null }, dt, grp);

    // --- repair crew: one job after another ---
    var R4 = people.slice(17, 21), job = null;
    Pn.jobs.forEach(function (j) { if (tau >= j.a - 0.6 && tau < j.b + 0.3) job = j; });
    var parts = this.parts;
    ['fwOld', 'fwNew', 'rwOld', 'rwNew'].forEach(function (key) { parts[key].visible = false; });
    this.rod.visible = false; this.tools[0].visible = this.tools[1].visible = false;
    var acts = R4.map(function (m, i) { var h = home(14 + i); return { x: 0.55 * i - 1.6, z: G * 3.55, yaw: yawTo(0, G * 3.55, 0, 0), pose: 'stand', hands: null, look: look(0, 0.5, 0) }; });
    // repair status of the nose / rear wing for the whole stop
    Pn.jobs.forEach(function (j) {
      var u = clamp((tau - j.a) / (j.b - j.a), 0, 1);
      if (j.k === 'nose' && tau >= j.a + (j.b - j.a) * 0.18 && phase === 'stop') ctl.fw = u >= 0.64 ? 'fitted' : 'hidden';
      if (j.k === 'rw' && tau >= j.a + (j.b - j.a) * 0.22 && phase === 'stop') ctl.rw = u >= 0.68 ? 'fitted' : 'hidden';
    });
    if (job && phase === 'stop') {
      var u = (tau - job.a) / (job.b - job.a), uc = clamp(u, 0, 1);
      var work = function (t, f) { return Math.sin(t * Math.PI * 2 * (f || 3)); };
      if (job.k === 'nose' || job.k === 'rw') {
        var front = job.k === 'nose', box = front ? this.fwBox : this.rwBox, ctr = box.getCenter(new THREE.Vector3());
        var oldP = parts[front ? 'fwOld' : 'rwOld'], newP = parts[front ? 'fwNew' : 'rwNew'];
        var rem0 = front ? 0.18 : 0.22, fit = front ? 0.64 : 0.68;
        var off2 = seg(uc, rem0, rem0 + 0.12), away = seg(uc, rem0 + 0.12, rem0 + 0.28);
        var drop = new THREE.Vector3(ctr.x + (front ? 1.2 : -1.2), 0, G * 2.3);
        var oP = new THREE.Vector3(front ? 0.7 * off2 : -0.35 * off2, front ? 0.18 * off2 : 0.4 * off2, 0);
        oP.lerp(new THREE.Vector3(drop.x - ctr.x, 0.35 - ctr.y + 0.1, drop.z), away);
        if (uc > rem0 + 0.3) oP.y = -ctr.y + 0.05;
        oldP.visible = uc >= rem0;
        oldP.position.copy(oP);
        var bring = seg(uc, 0.3, front ? 0.52 : 0.56), push = seg(uc, front ? 0.52 : 0.56, fit);
        var start = new THREE.Vector3(drop.x - ctr.x - (front ? 0.6 : -0.6), 0.25, G * 2.5);
        var mid = new THREE.Vector3(front ? 0.75 : -0.35, front ? 0.12 : 0.42, 0);
        var nP = start.clone().lerp(mid, bring).lerp(new THREE.Vector3(0, 0, 0), push);
        newP.visible = uc < fit;
        newP.position.copy(nP);
        var tips = function (p, y) { return [new THREE.Vector3(ctr.x + p.x, ctr.y + p.y + (y || 0.05), box.min.z + p.z + 0.05), new THREE.Vector3(ctr.x + p.x, ctr.y + p.y + (y || 0.05), box.max.z + p.z - 0.05)]; };
        // removers (0, 1) on the two tips, carriers (2, 3)
        var oT = tips(oP, front ? 0.06 : 0.12), nT = tips(nP, front ? 0.06 : 0.12);
        [0, 1].forEach(function (i) {
          var sd = i ? 1 : -1, tip = oT[i];
          var stand = uc < rem0 + 0.3 ? new THREE.Vector3(tip.x + (front ? 0.1 : -0.1), 0, tip.z + sd * 0.45) : new THREE.Vector3(drop.x + sd * 0.2, 0, G * 2.9);
          acts[i] = { x: stand.x, z: stand.z, yaw: yawTo(stand.x, stand.z, tip.x, tip.z), pose: front ? (uc < rem0 ? 'kneel' : 'lean') : 'stand', hands: uc < rem0 + 0.3 ? [tip.clone().add(new THREE.Vector3(0.12, 0, 0)), tip.clone().add(new THREE.Vector3(-0.12, 0, 0))] : null, look: tip };
          if (uc < rem0 && uc > 0.04) acts[i].hands[0].y += work(tau, 2) * 0.03;
        });
        [2, 3].forEach(function (i) {
          var sd = i === 3 ? 1 : -1, tip = nT[i - 2];
          var tight = uc >= fit && uc < 0.88;
          var st = new THREE.Vector3(tip.x + (front ? 0.15 : -0.15), 0, tip.z + sd * 0.45);
          if (uc >= 0.88) st = new THREE.Vector3(ctr.x + (front ? 0.8 : -0.8), 0, sd * 1.5);
          var hh = uc < fit ? [tip.clone().add(new THREE.Vector3(0.12, 0, 0)), tip.clone().add(new THREE.Vector3(-0.12, 0, 0))] : tight ? [new THREE.Vector3(ctr.x + (front ? 0.3 : 0), ctr.y + 0.08 + work(tau, 3) * 0.02, sd * 0.25), new THREE.Vector3(ctr.x + (front ? 0.15 : 0.1), ctr.y + 0.06, sd * 0.32)] : null;
          if (tight) st = new THREE.Vector3(ctr.x + (front ? 0.45 : -0.45), 0, sd * 0.62);
          acts[i] = { x: st.x, z: st.z, yaw: yawTo(st.x, st.z, tip.x, tip.z * 0.4), pose: tight ? (front ? 'kneel' : 'lean') : 'stand', hands: uc > 0.04 ? hh : null, look: tip };
        });
      } else if (job.k === 'susp') {
        var w = W[CORNER[job.c]], s = w.z < 0 ? -1 : 1, hubP = new THREE.Vector3(w.x, w.r + L, w.z);
        var wr = work(tau, 2.5);
        acts[0] = { x: w.x - 0.1, z: w.z + s * 0.62, yaw: yawTo(w.x - 0.1, w.z + s * 0.62, w.x, w.z), pose: uc > 0.05 && uc < 0.92 ? 'kneel' : 'stand', look: hubP,
          hands: uc > 0.05 && uc < 0.92 ? [hubP.clone().add(new THREE.Vector3(0.12, 0.06 + wr * 0.03, s * 0.12)), hubP.clone().add(new THREE.Vector3(-0.1, -0.05, s * 0.18 + wr * 0.02))] : null };
        var hold = uc < 0.3;
        acts[1] = { x: w.x + (w.front ? -0.7 : 0.7), z: w.z + s * 0.7, yaw: yawTo(w.x + (w.front ? -0.7 : 0.7), w.z + s * 0.7, w.x, w.z), pose: hold ? 'stand' : uc < 0.92 ? 'kneel' : 'stand', look: hubP,
          hands: uc < 0.92 ? (hold ? null : [hubP.clone().add(new THREE.Vector3(w.front ? -0.28 : 0.28, 0.02, s * 0.25)), hubP.clone().add(new THREE.Vector3(w.front ? -0.3 : 0.3, -0.12 + work(tau, 2) * 0.03, s * 0.3))]) : null };
        if (hold) { // carries the new wishbone
          var mm = R4[1];
          acts[1].hands = [mm.toStop(0.2, 1.0, 0.3), mm.toStop(-0.2, 1.0, 0.3)];
          this.rod.visible = true; this.rod.position.copy(mm.toStop(0, 1.02, 0.32)); this.rod.rotation.set(0, mm.yaw + Math.PI / 2, 0);
        }
        if (uc > 0.05 && uc < 0.92) { var tl = this.tools[0]; tl.visible = true; tl.position.copy(acts[0].hands[0]); tl.rotation.set(0, 0, Math.PI / 2 + wr * 0.4); }
      } else if (job.k === 'floor') {
        var s2 = -G, fx = -0.35;
        var wf = work(tau, 3);
        acts[0] = { x: fx, z: s2 * 1.0, yaw: yawTo(fx, s2, fx, 0), pose: uc > 0.06 && uc < 0.94 ? 'squat' : 'stand', look: new THREE.Vector3(fx, 0.1, s2 * 0.4),
          hands: uc > 0.06 && uc < 0.94 ? [new THREE.Vector3(fx + 0.15, 0.1 + wf * 0.02, s2 * 0.55), new THREE.Vector3(fx - 0.12, 0.09, s2 * 0.6)] : null };
        acts[1] = { x: fx - 0.8, z: s2 * 1.05, yaw: yawTo(fx - 0.8, s2 * 1.05, fx, s2 * 0.5), pose: 'ready', look: new THREE.Vector3(fx, 0.1, s2 * 0.5), hands: null };
        if (acts[0].hands) { var t0 = this.tools[0]; t0.visible = true; t0.position.copy(acts[0].hands[0]); t0.rotation.set(Math.PI / 2, 0, wf * 0.4); }
      }
    }
    // a wing that was torn off (gone from the car model) shows as the fitted new part until the release
    var car0 = this.car;
    if (ctl.fw === 'fitted' && car0 && car0.frontWing && car0.frontWing.userData.dmgGone) { parts.fwNew.visible = true; parts.fwNew.position.set(0, L, 0); }
    if (ctl.rw === 'fitted' && car0 && car0.rearWing && car0.rearWing.userData.dmgGone) { parts.rwNew.visible = true; parts.rwNew.position.set(0, L, 0); }
    R4.forEach(function (m, i) {
      var A = acts[i], P = place(17 + i, A.x, A.z, A.yaw);
      m.update({ x: P.x, z: P.z, yaw: P.yaw, pose: P.moving ? 'stand' : A.pose, look: A.look, hands: P.moving ? null : A.hands, quick: phase === 'stop' }, dt, grp);
    });
    return ctl;
  };

  // Applies the stop to a hi-car.js car: lift, wheels swapped by the crew, nose / rear wing.
  Crew.applyCar = function (car, ctl, done) {
    if (!car || !car.group) return;
    car.group.position.y += ctl.lift;
    car.wheels.forEach(function (wh, i) {
      // car.wheels order is the model's; match by corner
      var c = wh.userData && wh.userData.crewCorner;
      if (c === undefined) return;
      wh.pivot.visible = done ? true : ctl.wheel[c];
    });
    [['frontWing', 'fw'], ['rearWing', 'rw']].forEach(function (kv) {
      var o = car[kv[0]], st = ctl[kv[1]];
      if (!o || o.userData.dmgGone) return;
      o.visible = done || st !== 'hidden';
      if (st === 'fitted' && o.userData.dmgBase) { o.position.copy(o.userData.dmgBase.p); o.rotation.copy(o.userData.dmgBase.r); }
    });
  };
  // Tags the car's wheels with their corner (FL, FR, RL, RR) once.
  Crew.tagWheels = function (car) {
    if (!car || !car.wheels || car.crewTagged) return;
    car.crewTagged = true;
    var list = car.wheels.map(function (wh) { var p = wh.pivot.position; return { wh: wh, x: p.x, z: p.z }; });
    list.sort(function (a, b) { return (b.x - a.x) || (a.z - b.z); });
    list.forEach(function (o, i) { o.wh.userData = o.wh.userData || {}; o.wh.userData.crewCorner = i; });
  };
  Crew.restoreCar = function (car) {
    if (!car || !car.group) return;
    car.wheels.forEach(function (wh) { wh.pivot.visible = true; });
    if (car.frontWing && !car.frontWing.userData.dmgGone) car.frontWing.visible = true;
    if (car.rearWing && !car.rearWing.userData.dmgGone) car.rearWing.visible = true;
  };
})();

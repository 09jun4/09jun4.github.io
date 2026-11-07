// vehicle.js — RallyVehicle: a modern Rally2-style hatchback built from
// three.js primitives (no external model). Model axes: +X forward, +Y up,
// +Z right (root.rotation.y = -heading). Original design and livery —
// inspired by the class, not a copy of any real car:
//   * hatchback body from an extruded side profile with real wheel-arch
//     cut-outs and rounded (bevelled) edges, narrower glasshouse on top
//   * blistered wheel arches, side skirts, front splitter + air curtains,
//     light pod, roof scoop, big rear wing on swan-neck stands, diffuser,
//     exhaust, tow hooks, mud flaps, wipers, mirrors, number plates
//   * livery drawn on canvases (clipped to the body outline) as decals
//   * 15" white gravel wheels with spokes, chunky tread blocks, discs and
//     calipers; fronts steer, all spin, struts follow the travel
//   * interior: dashboard, gauges, steering wheel, seats, roll cage
// HIGH graphics: clear-coated PBR paint with environment reflections.
// LOW: the same shapes with cheap Lambert materials.
// The model only reads the physics state (swap for a GLB without touching
// physics).
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};

  var allMats = [];
  function reg(m) { allMats.push(m); return m; }
  function paint(color, o) { return reg(new THREE.MeshPhysicalMaterial(Object.assign({ color: color, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }, o || {}))); }
  function std(color, o) { return reg(new THREE.MeshStandardMaterial(Object.assign({ color: color, metalness: 0.1, roughness: 0.6 }, o || {}))); }
  function glow(color) { return reg(new THREE.MeshBasicMaterial({ color: color })); }
  function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
  function cyl(rt, rb, h, seg, m, open) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open), m); }
  function at(o, x, y, z) { o.position.set(x, y, z); return o; }

  // ---- smooth body: a lofted hull. Cross-sections (rounded, flared at the
  // wheels, tucked in at the top) are swept along the car's length, so the
  // surfaces curve like pressed steel instead of flat slabs.
  // Ground-relative metres: x forward, y up (0 = road), z right.
  function cr(pts, x) { // Catmull-Rom through [x, y] keys (x ascending)
    var n = pts.length, i = 0;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    while (i < n - 2 && x > pts[i + 1][0]) i++;
    var p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(n - 1, i + 2)][1];
    var t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]), t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function cl(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sm(t) { t = cl(t, 0, 1); return t * t * (3 - 2 * t); }

  var XF = 2.06, XR = -2.03, AR = 0.44, AY = 0.33;     // nose, tail, wheel arch radius / centre
  var TOP = [[-2.03, 0.86], [-1.93, 0.94], [-1.7, 0.955], [-0.6, 0.95], [0.6, 0.925], [0.95, 0.885], [1.4, 0.81], [1.75, 0.765], [1.95, 0.72], [2.06, 0.6]];
  var BOT = [[-2.03, 0.34], [-1.95, 0.25], [-1.75, 0.2], [-0.5, 0.19], [1.55, 0.17], [1.9, 0.17], [2.06, 0.22]];
  var ROOF = [[-1.88, 0.96], [-1.72, 1.13], [-1.5, 1.35], [-1.25, 1.43], [-0.4, 1.455], [0.0, 1.42], [0.3, 1.29], [0.62, 1.1], [0.93, 0.91]];
  function bodyFns(xw) {
    var F = {};
    F.halfW = function (x) {
      var w = 0.86, q = Math.max(0, (x - 1.7) / 0.36), r = Math.max(0, (-1.72 - x) / 0.31);
      return w - 0.27 * q * q - 0.13 * r * r;
    };
    F.flare = function (x, y) { // blistered arches: fenders bulge out around the wheels
      var f = 0;
      xw.forEach(function (c) { var d = Math.abs(x - c) / 0.72; if (d < 1) f += 0.065 * Math.pow(Math.cos(d * Math.PI / 2), 2); });
      return f * sm((y - 0.2) / 0.14) * sm((0.88 - y) / 0.12);
    };
    F.sideZ = function (x, y) {
      var a = cl((y - 0.62) / 0.33, 0, 1), b = cl((0.3 - y) / 0.13, 0, 1);
      return F.halfW(x) + F.flare(x, y) - 0.075 * a * a - 0.04 * b * b;
    };
    F.round = function (x) { var e = 0.1, d = Math.min(XF - x, x - XR); return d >= e ? 0 : e - Math.sqrt(Math.max(0, e * e - (e - d) * (e - d))); };
    F.top = function (x) { return cr(TOP, x) - F.round(x) * 0.7; };
    F.bot = function (x) {
      var y = cr(BOT, x);
      xw.forEach(function (c) { var d = x - c; if (Math.abs(d) < AR) y = Math.max(y, AY + Math.sqrt(AR * AR - d * d)); });
      return y + F.round(x) * 0.7;
    };
    return F;
  }
  // Right-half cross-section (bottom centre -> top centre), 17 points.
  function hullSection(F, x) {
    var yb = F.bot(x), yt = F.top(x), h = Math.max(0.02, yt - yb), k = F.round(x);
    var rb = Math.min(0.05, h * 0.25), rt = Math.min(0.15, h * 0.42);
    function sz(y) { return Math.max(0.02, F.sideZ(x, y) - k * 1.4); }
    var zB = sz(yb + rb), zT = sz(yt - rt), out = [], i;
    [0, 0.5, 1].forEach(function (f) { out.push([(zB - rb) * f, yb]); });
    [-60, -30].forEach(function (a) { a *= Math.PI / 180; out.push([zB - rb + rb * Math.cos(a), yb + rb + rb * Math.sin(a)]); });
    for (i = 0; i < 7; i++) { var y = yb + rb + (yt - rt - yb - rb) * i / 6; out.push([sz(y), y]); }
    [30, 60, 90].forEach(function (a) { a *= Math.PI / 180; out.push([zT - rt + rt * Math.cos(a), yt - rt + rt * Math.sin(a)]); });
    var zc = zT - rt;
    [0.5, 0].forEach(function (f) { out.push([zc * f, yt + 0.018 * (1 - f * f)]); });
    return out;
  }
  // glasshouse section: side glass leaning in (tumblehome), rounded roof
  function houseSection(F, x) {
    var yB = F.top(x) - 0.04, yR = Math.max(yB + 0.005, cr(ROOF, x)), h = yR - yB;
    var Wb = F.sideZ(x, F.top(x) - 0.15) - 0.15, Wr = Wb - 0.2, rr = Math.min(0.13, h * 0.5), out = [];
    for (var i = 0; i < 5; i++) { var f = i / 4, y = yB + (h - rr) * f; out.push([Wb + (Wr - Wb) * f, y]); }
    [30, 60, 90].forEach(function (a) { a *= Math.PI / 180; out.push([Wr - rr + rr * Math.cos(a), yR - rr + rr * Math.sin(a)]); });
    [0.5, 0].forEach(function (f) { out.push([(Wr - rr) * f, yR + 0.02 * (1 - f * f)]); });
    return out;
  }
  // Sweep sections along xs -> geometry (both halves, UVs for the livery,
  // closed ends). groupOf(xMid, j) -> material index per quad (optional).
  function loft(xs, sectionFn, uvFn, groupOf, caps) {
    var pos = [], uv = [], groups = {}, M = 0;
    function add(g, a, b, c) { (groups[g] = groups[g] || []).push(a, b, c); }
    [1, -1].forEach(function (side) {
      var base = pos.length / 3;
      xs.forEach(function (x) {
        var sec = sectionFn(x); M = sec.length;
        sec.forEach(function (p) { pos.push(x, p[1], side * p[0]); var t = uvFn(x, p[1], side); uv.push(t[0], t[1]); });
      });
      for (var i = 0; i < xs.length - 1; i++) for (var j = 0; j < M - 1; j++) {
        var a = base + i * M + j, b = a + M, c = a + 1, d = b + 1, g = groupOf ? groupOf((xs[i] + xs[i + 1]) / 2, j) : 0;
        if (side > 0) { add(g, a, b, c); add(g, c, b, d); } else { add(g, a, c, b); add(g, c, d, b); }
      }
      if (caps) [0, xs.length - 1].forEach(function (ei) { // fan to the section's centre
        var ctr = pos.length / 3, sec = sectionFn(xs[ei]), cy = 0;
        sec.forEach(function (p) { cy += p[1]; }); cy /= sec.length;
        pos.push(xs[ei], cy, 0); var t = uvFn(xs[ei], cy, side); uv.push(t[0], t[1]);
        for (var j = 0; j < M - 1; j++) {
          var a = base + ei * M + j, b = a + 1, front = ei > 0;
          if ((side > 0) === front) add(caps, ctr, b, a); else add(caps, ctr, a, b);
        }
      });
    });
    var g = new THREE.BufferGeometry(), idx = [];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    Object.keys(groups).sort().forEach(function (k) { var st = idx.length; idx.push.apply(idx, groups[k]); g.addGroup(st, groups[k].length, +k); });
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function stations(x0, x1, step, extra) {
    var xs = [], x;
    for (x = x0; x < x1 - 1e-6; x += step) xs.push(x);
    xs.push(x1);
    (extra || []).forEach(function (e) { if (e > x0 && e < x1) xs.push(e); });
    xs.sort(function (p, q) { return p - q; });
    return xs.filter(function (v, i) { return i === 0 || v - xs[i - 1] > 0.004; });
  }
  // merge plain geometries (same attributes) into one -> one draw call
  function merge(list) {
    var pos = [], nor = [], uv = [];
    list.forEach(function (g) {
      g = g.index ? g.toNonIndexed() : g;
      pos.push.apply(pos, g.attributes.position.array); nor.push.apply(nor, g.attributes.normal.array);
      if (g.attributes.uv) uv.push.apply(uv, g.attributes.uv.array);
    });
    var m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (uv.length) m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return m;
  }

  // ---- livery: one canvas, right side in the top half, left side (mirrored
  // so text reads correctly) in the bottom half. Mapped by (x, y).
  var X0 = -2.1, X1 = 2.12, Y0 = 0.12, Y1 = 1.0;
  function liveryUV(x, y, side) {
    var u = (x - X0) / (X1 - X0), v = cl((y - Y0) / (Y1 - Y0), 0.004, 0.996) * 0.5;
    return side > 0 ? [u, 0.5 + v] : [1 - u, v];
  }
  function liveryCanvas(xw) {
    var c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
    var g = c.getContext('2d');
    g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, c.width, c.height);
    [false, true].forEach(function (mirror) {
      var oy = mirror ? 512 : 0;
      function px(x) { var u = (x - X0) / (X1 - X0); return (mirror ? 1 - u : u) * c.width; }
      function py(y) { return oy + (1 - (y - Y0) / (Y1 - Y0)) * 512; }
      g.save(); g.beginPath(); g.rect(0, oy, c.width, 512); g.clip();
      // lower body cladding (satin black) with a thin orange pinstripe
      g.fillStyle = '#17191d'; g.fillRect(0, py(0.335), c.width, 600);
      g.fillStyle = '#ff7a1a'; g.fillRect(0, py(0.35), c.width, 5);
      function sweep(col, lift, thick) {
        g.fillStyle = col; g.beginPath();
        g.moveTo(px(2.2), py(0.4 + lift));
        g.bezierCurveTo(px(1.0), py(0.44 + lift), px(0.2), py(0.84 + lift * 0.3), px(-1.0), py(0.83));
        g.lineTo(px(-2.2), py(0.9)); g.lineTo(px(-2.2), py(0.9 - thick));
        g.bezierCurveTo(px(-1.0), py(0.79 - thick), px(0.2), py(0.76 - thick + lift * 0.3), px(2.2), py(0.4 + lift - thick));
        g.closePath(); g.fill();
      }
      sweep('#ff7a1a', 0.1, 0.17); sweep('#e2202f', 0.02, 0.07);
      // door number board + crew names
      var nx0 = px(mirror ? -0.2 : 0.5), nx1 = px(mirror ? 0.5 : -0.2);
      g.fillStyle = '#ffffff'; g.fillRect(Math.min(nx0, nx1), py(0.7), Math.abs(nx1 - nx0), py(0.45) - py(0.7));
      g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(Math.min(nx0, nx1), py(0.7), Math.abs(nx1 - nx0), py(0.45) - py(0.7));
      g.fillStyle = '#111'; g.font = '900 104px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('09', (nx0 + nx1) / 2, (py(0.7) + py(0.45)) / 2 + 6);
      g.fillStyle = '#fff'; g.font = 'italic 900 54px "Segoe UI", system-ui, sans-serif';
      g.fillText('TRACK MASTER RALLY', (px(-0.95) + px(-0.05)) / 2, py(0.27));
      g.fillStyle = '#16181c'; g.font = '800 26px "Segoe UI", system-ui, sans-serif';
      g.fillText('J. YANG  ·  K. PARK', (px(0.62) + px(-0.32)) / 2, py(0.885));
      // sponsor patches on the front wing and rear quarter
      g.fillStyle = '#16181c'; g.font = 'italic 900 34px "Segoe UI", system-ui, sans-serif';
      g.fillText('GRAVEL·TEC', (px(1.75) + px(1.35)) / 2, py(0.62));
      g.fillText('09 MOTORSPORT', (px(-1.35) + px(-1.95)) / 2, py(0.58));
      // panel gaps (door shut lines, fuel filler) as thin dark lines
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3;
      [0.62, -0.42, -1.48].forEach(function (x) { g.beginPath(); g.moveTo(px(x), py(0.93)); g.lineTo(px(x + 0.03), py(0.36)); g.stroke(); });
      g.beginPath(); g.arc(px(-1.62), py(0.8), 18, 0, Math.PI * 2); g.stroke();
      // road grime: a dusty haze low on the body and gravel spray thrown
      // back from each wheel (seeded, so every car looks the same)
      var gr = g.createLinearGradient(0, py(0.62), 0, py(0.12));
      gr.addColorStop(0, 'rgba(150,122,88,0)'); gr.addColorStop(0.55, 'rgba(142,114,80,0.28)'); gr.addColorStop(1, 'rgba(118,92,62,0.62)');
      g.fillStyle = gr; g.fillRect(0, py(0.62), c.width, py(0.12) - py(0.62));
      var seed = 7;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      for (var d = 0; d < 1800; d++) {
        var wc = xw[d % 2], dx = -Math.pow(rnd(), 1.6) * 1.1 - 0.35, dy = 0.14 + Math.pow(rnd(), 1.8) * 0.5;
        var xx = wc + dx, al = 0.15 + 0.4 * rnd() * (1 - (dy - 0.14) / 0.5);
        g.fillStyle = 'rgba(' + (105 + rnd() * 50 | 0) + ',' + (82 + rnd() * 40 | 0) + ',' + (55 + rnd() * 30 | 0) + ',' + al.toFixed(2) + ')';
        g.beginPath(); g.arc(px(xx), py(dy), 1 + rnd() * 3.2, 0, Math.PI * 2); g.fill();
      }
      // door handle recess
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(Math.min(px(0.32), px(0.14)), py(0.86), Math.abs(px(0.14) - px(0.32)), 9);
      g.restore();
    });
    var t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function carbonTex() { // 2x2 twill weave
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d');
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var on = ((x + y) >> 1) % 2 === 0; g.fillStyle = on ? '#3a3c40' : '#202225'; g.fillRect(x * 8, y * 8, 8, 8);
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t;
  }
  function hexTex() { // honeycomb grille mesh
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var g = c.getContext('2d'); g.fillStyle = '#040405'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#3a3d42'; g.lineWidth = 3;
    for (var r = 0; r < 6; r++) for (var q = 0; q < 6; q++) {
      var cx = q * 24 + (r % 2) * 12, cy = r * 21, R = 12; g.beginPath();
      for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); }
      g.closePath(); g.stroke();
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function textTex(lines, w, h, bg, fg, font) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
    lines.forEach(function (l, i) { g.fillText(l, w / 2, h * (i + 0.5) / lines.length + 2); });
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  // Tyre texture for the lathe tyre: u runs around the tyre, v across the
  // profile (sidewall - tread - sidewall). Chunky gravel blocks in the
  // middle band, a moulded sidewall with lettering on the outside.
  function treadTex() {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    var g = c.getContext('2d'); g.fillStyle = '#26221e'; g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 34, 1024, 60); // tread base (grooves)
    g.fillStyle = '#262628';
    for (var i = 0; i < 48; i++) {
      var x = i * 1024 / 48;
      g.fillRect(x + 2, 36, 15, 17); g.fillRect(x + 10, 57, 13, 15); g.fillRect(x + 2, 75, 15, 17);
    }
    g.fillStyle = '#2c2c2f'; g.font = '700 15px system-ui, sans-serif';
    for (var k = 0; k < 4; k++) g.fillText('GRAVEL  G5  15"', k * 256 + 40, 118);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  function create(spec) {
    allMats = [];
    var root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    var cg = spec.cgHeight, a = spec.wheelbase * (1 - spec.frontWeight), b = spec.wheelbase * spec.frontWeight;
    var tw = spec.track / 2, R = spec.wheelRadius, yG = -cg; // ground level in body space
    var floorY = yG + 0.24;
    var shell = new THREE.Group(); shell.position.y = yG; body.add(shell);  // ground-relative parts
    var parts = {};
    var F = bodyFns([a, -b]);

    var liv = liveryCanvas([a, -b]);
    var white = paint(0xffffff, { map: liv }), plain = paint(0xf4f4f1);
    var black = std(0x15171a, { roughness: 0.5 }), satin = std(0x22252a, { roughness: 0.45, metalness: 0.3 });
    var carbon = std(0x101113, { roughness: 0.5, metalness: 0.12, map: carbonTex() }), chrome = std(0xdadde2, { metalness: 1, roughness: 0.18 });
    var orange = paint(0xff7a1a), red = paint(0xd6202f);
    var glass = reg(new THREE.MeshPhysicalMaterial({ color: 0x0c1218, metalness: 0.1, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.58, envMapIntensity: 1.6 }));
    var pillarPaint = paint(0xf4f4f1, { side: THREE.DoubleSide }), trimBlack = std(0x0e0f11, { roughness: 0.4, side: THREE.DoubleSide });

    // --- body hull (one smooth mesh, livery mapped on)
    var xs = stations(XR, XF, 0.035, [a - AR - 0.004, a - AR + 0.004, a + AR - 0.004, a + AR + 0.004, -b - AR - 0.004, -b - AR + 0.004, -b + AR - 0.004, -b + AR + 0.004, XF - 0.02, XF - 0.05, XR + 0.02, XR + 0.05]);
    var hull = new THREE.Mesh(loft(xs, function (x) { return hullSection(F, x); }, liveryUV, null, 0), white);
    shell.add(hull); parts.shell = hull;
    // glasshouse: tinted glass with painted roof, A/C pillars and black B pillar
    var hx = stations(-1.88, 0.93, 0.03, [0.1, -0.38, -0.5, -1.3, -1.42, 0.62]);
    var hg = loft(hx, function (x) { return houseSection(F, x); }, function () { return [0, 0]; }, function (x, j) {
      var top = j >= 6, corner = j >= 4 && j < 6;
      if (top) return x < 0.12 && x > -1.42 ? 1 : 0;           // roof painted, windscreen / rear glass
      if (j === 0) return 2;                                    // black window seal along the belt
      if (corner && x > 0.06) return 1;                         // A pillar
      if (x > -0.5 && x < -0.38) return 2;                      // B pillar (black)
      if (x < -1.3) return 1;                                   // C pillar / rear quarter
      if (x > 0.62) return 2;                                   // quarter-light trim by the mirror
      return 0;
    }, 0);
    var house = new THREE.Mesh(hg, [glass, pillarPaint, trimBlack]); shell.add(house); parts.cabin = house;
    // wheel wells: dark tunnels so the arches read as openings
    var wellM = reg(new THREE.MeshStandardMaterial({ color: 0x080809, roughness: 0.95, side: THREE.DoubleSide }));
    [a, -b].forEach(function (x) {
      var wl = new THREE.Mesh(new THREE.CylinderGeometry(AR - 0.01, AR - 0.01, 2 * 0.86 + 0.1, 24, 1, true, Math.PI / 2, Math.PI), wellM);
      wl.rotation.x = Math.PI / 2; wl.position.set(x, AY, 0); shell.add(wl);
      var blk = box(0.9, 0.36, 1.2, wellM); at(blk, x, AY + 0.2, 0); shell.add(blk);
    });

    // surface helpers: where the body skin is, so parts sit on it
    function skinY(x) { return F.top(x) + 0.018; }
    function onTop(o, x, z, lift) { var y0 = F.top(x - 0.05), y1 = F.top(x + 0.05); o.position.set(x, skinY(x) + (lift || 0), z); o.rotation.z = Math.atan2(y1 - y0, 0.1); return o; }

    // --- bonnet: vents, stripes and pins; roof: scoop, number, antenna
    [-1, 1].forEach(function (sd) {
      var vent = onTop(box(0.34, 0.02, 0.24, reg(new THREE.MeshStandardMaterial({ map: hexTex(), roughness: 0.6 }))), 1.3, sd * 0.3, -0.004); shell.add(vent);
      var pin = onTop(cyl(0.02, 0.02, 0.012, 10, chrome), 1.82, sd * 0.42, 0); shell.add(pin);
      var strip = onTop(box(1.05, 0.004, 0.06, red), 1.33, sd * 0.13, 0.002); shell.add(strip);
    });
    var bstripe = onTop(box(1.05, 0.004, 0.17, orange), 1.33, 0, 0.002); shell.add(bstripe);
    var roofY = cr(ROOF, -0.5) + 0.02;
    var scoop = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), plain);
    scoop.scale.set(1.4, 0.45, 1); at(scoop, -0.05, cr(ROOF, -0.05) + 0.01, 0); shell.add(scoop);
    var mouth = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16, 0, Math.PI), black); mouth.rotation.y = Math.PI / 2; mouth.scale.set(1, 0.8, 1.6); at(mouth, 0.225, cr(ROOF, 0.2) + 0.012, 0); shell.add(mouth);
    var roofNum = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), reg(new THREE.MeshStandardMaterial({ map: textTex(['09'], 256, 256, '#ffffff', '#111', '900 170px system-ui, sans-serif'), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 })));
    roofNum.rotation.x = -Math.PI / 2; roofNum.rotation.z = -Math.PI / 2; roofNum.position.set(-0.75, roofY + 0.005, 0); shell.add(roofNum);
    var ant = cyl(0.005, 0.005, 0.45, 6, black); at(ant, -1.15, roofY + 0.2, 0.3); ant.rotation.z = 0.45; shell.add(ant);

    // --- front: bumper intakes (honeycomb), splitter, headlights, fog lamps, light pod
    var hex = reg(new THREE.MeshStandardMaterial({ map: hexTex(), roughness: 0.7 }));
    hex.map.repeat.set(6, 2);
    var intake = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.22), hex); intake.rotation.y = Math.PI / 2; at(intake, XF + 0.003, 0.33, 0); shell.add(intake);
    var intakeFrame = box(0.03, 0.26, 1.06, carbon); at(intakeFrame, XF - 0.012, 0.33, 0); shell.add(intakeFrame);
    var upper = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.07), hex); upper.rotation.y = Math.PI / 2; at(upper, XF - 0.02, 0.53, 0); shell.add(upper);
    var split = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 1.62), carbon); at(split, XF - 0.03, 0.155, 0); shell.add(split);
    [-1, 1].forEach(function (sd) {
      // side air intakes / brake ducts at the bumper corners
      var duct = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), hex); duct.rotation.y = Math.PI / 2 - sd * 0.75; at(duct, XF - 0.13, 0.32, sd * 0.69); shell.add(duct);
      // headlight: swept lens, black housing, projector + LED daytime strip
      var hz = sd * 0.6, hxp = 1.94, hy = F.top(hxp) - 0.05;
      var hl = new THREE.Group(); at(hl, hxp, hy, hz); hl.rotation.set(0, sd * 0.38, -0.55, 'YXZ'); shell.add(hl);
      var hous = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.3, 18, 1, false), black); hous.rotation.x = Math.PI / 2; hous.scale.set(1, 1, 0.75); hl.add(hous);
      var lens = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.29, 18, 1, true, -Math.PI / 2, Math.PI), reg(new THREE.MeshPhysicalMaterial({ color: 0xc9d4de, metalness: 0.1, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.35 })));
      lens.rotation.x = Math.PI / 2; lens.scale.set(1, 1, 0.75); hl.add(lens);
      [-0.07, 0.06].forEach(function (pz) { var pj = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), glow(0xfff6dc)); pj.position.set(0.03, 0, pz * sd); hl.add(pj); });
      var drl = box(0.012, 0.012, 0.26, glow(0xdff3ff)); drl.position.set(0.06, -0.045, 0); hl.add(drl);
      var fog = cyl(0.045, 0.045, 0.02, 18, glow(0xfff2c8)); fog.rotation.z = Math.PI / 2; at(fog, XF - 0.04, 0.27, sd * 0.56); shell.add(fog);
      var fogR = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 18), chrome); fogR.rotation.y = Math.PI / 2; at(fogR, XF - 0.03, 0.27, sd * 0.56); shell.add(fogR);
      var hook = box(0.08, 0.05, 0.05, red); at(hook, XF + 0.02, 0.22, sd * 0.38); if (sd > 0) shell.add(hook);
      var strap = box(0.012, 0.15, 0.04, std(0xffd23c)); at(strap, XF + 0.012, 0.38, sd * 0.3); if (sd < 0) shell.add(strap);
    });
    var plateF = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), reg(new THREE.MeshStandardMaterial({ map: textTex(['TM · 09'], 256, 64, '#f4f4f4', '#111', '800 40px system-ui, sans-serif'), polygonOffset: true, polygonOffsetFactor: -2 })));
    plateF.rotation.y = Math.PI / 2; at(plateF, XF + 0.006, 0.47, 0); shell.add(plateF);
    // light pod (4 lamps under a carbon cover) on the bonnet front
    var podX = 1.86, pod = onTop(new THREE.Group(), podX, 0, 0.03); shell.add(pod);
    var podBase = box(0.12, 0.17, 1.1, carbon); podBase.position.set(0, 0.07, 0); pod.add(podBase);
    var lampM = glow(0xfffbe8);
    for (var p = 0; p < 4; p++) {
      var zz = -0.405 + p * 0.27;
      var rim = cyl(0.1, 0.1, 0.06, 22, chrome); rim.rotation.z = Math.PI / 2; rim.position.set(0.05, 0.08, zz); pod.add(rim);
      var lens2 = cyl(0.085, 0.085, 0.02, 22, lampM); lens2.rotation.z = Math.PI / 2; lens2.position.set(0.085, 0.08, zz); pod.add(lens2);
    }
    parts.lights = pod;

    // --- doors' details: mirrors (body-coloured shells on black arms), wipers
    [-1, 1].forEach(function (sd) {
      var mx = 0.66, my = F.top(mx) + 0.09, mz = sd * (F.sideZ(mx, F.top(mx) - 0.1) - 0.02);
      var arm = box(0.1, 0.03, 0.14, black); at(arm, mx, my - 0.05, mz - sd * 0.02); shell.add(arm);
      var mh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), plain); mh.scale.set(0.8, 0.7, 1.15); at(mh, mx, my + 0.02, mz + sd * 0.1); shell.add(mh);
      var mg = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), chrome); mg.rotation.y = -Math.PI / 2; mg.scale.set(1.4, 0.85, 1); at(mg, mx - 0.075, my + 0.02, mz + sd * 0.1); shell.add(mg);
      var wiper = box(0.6, 0.012, 0.02, black); at(wiper, 0.86, F.top(0.86) + 0.035, sd * 0.25); wiper.rotation.y = 0.15 * sd; wiper.rotation.z = 0.08; shell.add(wiper);
      // side skirt winglet
      var sk = box(1.45, 0.06, 0.07, carbon); at(sk, (a - b) / 2 - 0.08, 0.2, sd * (F.sideZ(-0.1, 0.25) + 0.01)); shell.add(sk);
    });

    // --- rear: wing on swan necks, tail lights, diffuser, exhaust, plate, flaps
    var wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.12, 0.07, 0.4, 0.06, 0.55, 0.0); wingShape.bezierCurveTo(0.38, 0.018, 0.12, 0.014, 0, 0);
    var wg = new THREE.ExtrudeGeometry(wingShape, { depth: 1.66, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 14 }); wg.translate(-0.55, 0, -0.83);
    var wing = new THREE.Mesh(wg, carbon); wing.position.set(-1.55, 1.5, 0); wing.rotation.z = -0.1; shell.add(wing); parts.spoiler = wing;
    var gurney = box(0.012, 0.035, 1.66, orange); at(gurney, -2.09, 1.555, 0); shell.add(gurney);
    var roofLip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 1.1), carbon); at(roofLip, -1.38, cr(ROOF, -1.38) + 0.02, 0); roofLip.rotation.z = -0.25; shell.add(roofLip);
    [-1, 1].forEach(function (sd) {
      var ep = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.15, 0.01), carbon); at(ep, -1.83, 1.51, sd * 0.835); shell.add(ep);
      var neck = box(0.08, 0.32, 0.025, carbon); at(neck, -1.62, 1.33, sd * 0.4); neck.rotation.z = 0.45; shell.add(neck);
      // tail light: dark smoked housing, red light bar, white reverse lamp
      var ty = F.top(-1.98) - 0.12, tz = sd * 0.58;
      tz = sd * 0.5; var tlb = box(0.06, 0.14, 0.3, black); at(tlb, -1.99, ty, tz); tlb.rotation.y = -sd * 0.25; shell.add(tlb);
      var tl = box(0.04, 0.03, 0.27, glow(0xd0141c)); at(tl, -2.015, ty + 0.03, tz); tl.rotation.y = -sd * 0.25; shell.add(tl);
      var tl2 = box(0.04, 0.045, 0.1, glow(0x8a0a10)); at(tl2, -2.012, ty - 0.03, tz + sd * 0.08); tl2.rotation.y = -sd * 0.25; shell.add(tl2);
      var rv = box(0.04, 0.035, 0.08, glow(0xf2f2f2)); at(rv, -2.012, ty - 0.032, tz - sd * 0.06); rv.rotation.y = -sd * 0.25; shell.add(rv);
    });
    var hbar = box(0.02, 0.012, 0.6, glow(0xff2a2a)); at(hbar, -2.0, F.top(-2.0) + 0.0, 0); shell.add(hbar); // high-level brake light
    var diff = box(0.24, 0.035, 1.2, carbon); at(diff, XR + 0.1, 0.19, 0); diff.rotation.z = -0.18; shell.add(diff);
    for (var f = 0; f < 5; f++) { var fin = box(0.2, 0.06, 0.01, carbon); at(fin, XR + 0.08, 0.215, -0.44 + f * 0.22); fin.rotation.z = -0.18; shell.add(fin); }
    var ex = cyl(0.06, 0.06, 0.24, 18, chrome); ex.rotation.z = Math.PI / 2; at(ex, XR - 0.02, 0.27, 0.52); shell.add(ex);
    var exIn = cyl(0.045, 0.045, 0.245, 14, black); exIn.rotation.z = Math.PI / 2; at(exIn, XR - 0.025, 0.27, 0.52); shell.add(exIn);
    var plateR = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), plateF.material); plateR.rotation.y = -Math.PI / 2; at(plateR, XR - 0.004, 0.5, 0); shell.add(plateR);
    var flapTex = textTex(['RALLY'], 128, 128, '#16181c', '#ff7a1a', 'italic 900 34px system-ui, sans-serif');
    var flapM = reg(new THREE.MeshStandardMaterial({ map: flapTex, roughness: 0.8, side: THREE.DoubleSide }));
    [[a, -1], [a, 1], [-b, -1], [-b, 1]].forEach(function (pp) {
      var mf = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.28), flapM); mf.rotation.y = Math.PI / 2;
      at(mf, pp[0] - AR - 0.05, 0.17, pp[1] * (tw - 0.02)); shell.add(mf);
    });
    parts.mudflaps = true;

    // --- interior (cockpit camera), ground-relative like the shell
    var interior = new THREE.Group(); shell.add(interior); parts.interior = interior;
    var trimM = std(0x1d2024, { roughness: 0.85 }), softM = std(0x141619, { roughness: 1 }), cageM = std(0xb9bec4, { metalness: 0.6, roughness: 0.35 });
    var accent = std(0xff7a1a, { roughness: 0.6 }), suede = std(0x111214, { roughness: 1 });
    function I(o, x, y, z) { at(o, x, y, z); interior.add(o); return o; }
    I(box(2.05, 0.02, 1.6, softM), -0.4, 0.41, 0);                       // floor
    // the body skin is one-sided: line the cabin (door cards, headliner,
    // rear bulkhead) so the cockpit view sees trim, not the outside world
    [-1, 1].forEach(function (sd) {
      var card = I(box(2.0, 0.55, 0.03, softM), -0.45, 0.66, sd * 0.79);
      var pocket = I(box(0.5, 0.08, 0.04, trimM), 0.0, 0.52, sd * 0.765); void card; void pocket;
      var pull2 = I(box(0.16, 0.025, 0.03, accent), 0.12, 0.8, sd * 0.765); void pull2;
    });
    I(box(1.75, 0.02, 1.25, std(0x2a2c30, { roughness: 1 })), -0.6, 1.415, 0);   // headliner
    I(box(0.03, 0.6, 1.5, softM), -1.5, 0.7, 0);                                  // rear bulkhead
    // dashboard: main body under the windscreen, padded top, knee panel
    I(box(0.45, 0.22, 1.62, trimM), 0.74, 0.84, 0);
    var pad = I(box(0.34, 0.05, 1.62, softM), 0.7, 0.965, 0); pad.rotation.z = 0.08;
    I(box(0.12, 0.3, 1.5, trimM), 0.5, 0.66, 0);
    // driver's binnacle with a digital display
    I(box(0.2, 0.12, 0.44, trimM), 0.54, 1.02, -0.38);
    var visor = I(box(0.26, 0.022, 0.48, softM), 0.52, 1.09, -0.38); visor.rotation.z = -0.12;
    var dc = document.createElement('canvas'); dc.width = 512; dc.height = 160;
    var dTex = new THREE.CanvasTexture(dc); dTex.encoding = THREE.sRGBEncoding;
    var disp = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.112), new THREE.MeshBasicMaterial({ map: dTex, toneMapped: false }));
    disp.rotation.set(0, -Math.PI / 2, 0); I(disp, 0.437, 1.025, -0.38);
    parts.display = { canvas: dc, ctx: dc.getContext('2d'), tex: dTex, frame: 0 };
    // co-driver trip meter on the passenger side
    I(box(0.14, 0.09, 0.24, trimM), 0.62, 1.01, 0.36);
    var trip = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), new THREE.MeshBasicMaterial({ map: textTex(['TRIP 0.00'], 256, 80, '#05170c', '#57ff8a', '700 40px ui-monospace, monospace'), toneMapped: false }));
    trip.rotation.y = -Math.PI / 2; I(trip, 0.548, 1.012, 0.36);
    // centre switch panel (coloured buttons) on the dash face
    I(box(0.02, 0.16, 0.34, softM), 0.448, 0.82, 0.02);
    [0xff3b2f, 0xffd23c, 0x3ccf6e, 0x9ad7ff, 0xff7a1a, 0xffffff].forEach(function (c, k) {
      I(box(0.015, 0.022, 0.03, glow(c)), 0.44, 0.86 - Math.floor(k / 3) * 0.05, -0.06 + (k % 3) * 0.07);
    });
    // steering column and wheel (suede rim, 3 spokes, 12 o'clock marker, paddles)
    function bar(x1, y1, z1, x2, y2, z2, r, m) {
      var v = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1), len = v.length(), o = cyl(r, r, len, 10, m);
      o.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); interior.add(o); return o;
    }
    bar(0.52, 0.86, -0.38, 0.22, 0.91, -0.38, 0.035, trimM);
    var wheelG = I(new THREE.Group(), 0.18, 0.92, -0.38); wheelG.rotation.z = -0.42;
    var sw = new THREE.Group(); wheelG.add(sw);
    var rimT = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.02, 12, 40), suede); rimT.rotation.y = Math.PI / 2; sw.add(rimT);
    [Math.PI / 2, -Math.PI / 2, Math.PI].forEach(function (an) {
      var sp = box(0.014, 0.15, 0.04, satin); sp.position.set(0, Math.cos(an + Math.PI / 2) * 0.085, Math.sin(an + Math.PI / 2) * 0.085);
      sp.rotation.x = -an; sw.add(sp);
    });
    var hub = cyl(0.042, 0.042, 0.04, 20, satin); hub.rotation.z = Math.PI / 2; sw.add(hub);
    var logo = cyl(0.022, 0.022, 0.005, 16, accent); logo.rotation.z = Math.PI / 2; logo.position.x = -0.022; sw.add(logo);
    var mark = box(0.012, 0.035, 0.025, accent); mark.position.set(0, 0.165, 0); sw.add(mark);
    [-1, 1].forEach(function (sd) { var pd = box(0.01, 0.09, 0.05, carbon); pd.position.set(0.04, 0.02, sd * 0.13); sw.add(pd); });
    parts.steeringWheel = sw;
    // centre console, sequential lever, hydraulic handbrake (rally style)
    I(box(0.62, 0.34, 0.24, trimM), 0.16, 0.58, 0.0);
    bar(0.22, 0.75, 0.04, 0.08, 1.02, 0.02, 0.014, satin);
    I(new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), satin), 0.075, 1.035, 0.02);
    bar(-0.05, 0.75, -0.08, 0.1, 0.93, -0.1, 0.014, satin);
    var hbGrip = bar(0.07, 0.895, -0.096, 0.115, 0.95, -0.1, 0.02, std(0xb5141c, { roughness: 0.7 })); void hbGrip;
    // bucket seats with bolsters and harness
    [-0.38, 0.38].forEach(function (z) {
      I(box(0.5, 0.1, 0.48, softM), -0.32, 0.53, z);
      var back = I(box(0.1, 0.86, 0.5, softM), -0.6, 0.98, z); back.rotation.z = 0.12;
      [-1, 1].forEach(function (s) { var bo = I(box(0.12, 0.6, 0.06, trimM), -0.56, 0.9, z + s * 0.25); bo.rotation.z = 0.12; });
      var hd = I(box(0.11, 0.08, 0.5, accent), -0.66, 1.41, z); hd.rotation.z = 0.12;
      if (z < 0) [-0.1, 0.1].forEach(function (dz) { var st = I(box(0.012, 0.6, 0.05, accent), -0.52, 1.0, z + dz); st.rotation.z = 0.2; });
    });
    // roll cage
    function tube(x1, y1, z1, x2, y2, z2) { bar(x1, y1, z1, x2, y2, z2, 0.018, cageM); }
    var yt = 1.37, yb = 0.54;
    [-0.64, 0.64].forEach(function (z) { tube(0.72, yb + 0.35, z, 0.42, yt, z); tube(0.42, yt, z, -1.05, yt, z); tube(-1.05, yt, z, -1.2, yb, z); tube(0.55, 0.78, z, -0.9, 0.78, z); });
    tube(0.42, yt, -0.64, 0.42, yt, 0.64); tube(-1.05, yt, -0.64, -1.05, yt, 0.64); tube(-1.05, yt, -0.64, 0.42, yt, 0.64);

    parts.cockpitMount = at(new THREE.Object3D(), -0.3, floorY + 1.0, -0.38); body.add(parts.cockpitMount);
    parts.cockpitMount.rotation.z = -0.06;
    parts.hoodMount = at(new THREE.Object3D(), 1.05, floorY + 0.78, 0); body.add(parts.hoodMount);

    // --- wheels: lathe-turned gravel tyres (rounded shoulders, moulded
    // tread), 15" white twin-window rims, vented discs, big calipers
    var tyreTex = treadTex();
    var tyreM = std(0xffffff, { roughness: 0.92, map: tyreTex, bumpMap: tyreTex, bumpScale: 0.02 });
    var rimM = std(0xe6e1d6, { metalness: 0.3, roughness: 0.42 }), rimIn = std(0x9a9ca0, { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
    var discM = std(0x8a8c90, { metalness: 0.8, roughness: 0.35 }), calM = std(0xd6202f, { roughness: 0.35, metalness: 0.2 });
    var TW = 0.235, RR = 0.205; // tyre width, rim radius
    var prof = [[RR, -TW / 2 + 0.01], [R * 0.86, -TW / 2 - 0.008], [R - 0.02, -TW / 2 + 0.004], [R - 0.004, -TW / 2 + 0.02], [R, -TW / 2 + 0.05], [R + 0.004, 0], [R, TW / 2 - 0.05], [R - 0.004, TW / 2 - 0.02], [R - 0.02, TW / 2 - 0.004], [R * 0.86, TW / 2 + 0.008], [RR, TW / 2 - 0.01]];
    var tyreGeo = new THREE.LatheGeometry(prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 44);
    tyreGeo.rotateX(Math.PI / 2);
    // tread lugs: one merged ring per tyre (low, chunky blocks)
    var lugs = [];
    for (var k = 0; k < 26; k++) {
      [-0.06, 0, 0.06].forEach(function (zz, row) {
        var an = (k + (row === 1 ? 0.5 : 0)) / 26 * Math.PI * 2, bl = new THREE.BoxGeometry(row === 1 ? 0.034 : 0.044, 0.016, row === 1 ? 0.04 : 0.05);
        bl.rotateZ(an - Math.PI / 2); bl.translate((R + 0.006) * Math.cos(an), (R + 0.006) * Math.sin(an), zz);
        lugs.push(bl);
      });
    }
    var lugGeo = merge(lugs), lugM = std(0x1d1d1f, { roughness: 0.95 });
    // rim face: a disc with six rounded windows (extruded, bevelled)
    function rimFace() {
      var sh = new THREE.Shape(); sh.absarc(0, 0, RR, 0, Math.PI * 2, false);
      for (var w = 0; w < 6; w++) {
        var c0 = w * Math.PI / 3 + 0.2, c1 = c0 + Math.PI / 3 - 0.4, hole = new THREE.Path();
        hole.absarc(0, 0, RR - 0.03, c0, c1, false); hole.absarc(0, 0, 0.075, c1 - 0.06, c0 + 0.06, true);
        sh.holes.push(hole);
      }
      var hub = new THREE.Path(); hub.absarc(0, 0, 0.03, 0, Math.PI * 2, true); sh.holes.push(hub);
      var g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 36 });
      return g;
    }
    var faceGeo = rimFace();
    var wheels = [];
    [[a, -tw, true], [a, tw, true], [-b, -tw, false], [-b, tw, false]].forEach(function (p) {
      var out = p[1] > 0 ? 1 : -1;
      var pivot = new THREE.Group(); pivot.position.set(p[0], 0, p[1]); root.add(pivot);
      var spin = new THREE.Group(); pivot.add(spin);
      spin.add(new THREE.Mesh(tyreGeo, tyreM));
      spin.add(new THREE.Mesh(lugGeo, lugM));
      var barrel = cyl(RR, RR, TW - 0.02, 32, rimIn, true); barrel.rotation.x = Math.PI / 2; spin.add(barrel);
      var face = new THREE.Mesh(faceGeo, rimM); face.position.z = out * 0.062; if (out < 0) face.rotation.y = Math.PI; spin.add(face);
      var lip = new THREE.Mesh(new THREE.TorusGeometry(RR, 0.008, 6, 36), rimM); lip.position.z = out * (TW / 2 - 0.012); spin.add(lip);
      var nut = cyl(0.03, 0.036, 0.04, 12, chrome); nut.rotation.x = Math.PI / 2; nut.position.z = out * 0.08; spin.add(nut);
      // disc (with a dark vented band) and caliper don't spin
      var disc = cyl(0.165, 0.165, 0.028, 32, discM); disc.rotation.x = Math.PI / 2; disc.position.z = -out * 0.0; pivot.add(disc);
      var vent = cyl(0.168, 0.168, 0.01, 32, black, true); vent.rotation.x = Math.PI / 2; pivot.add(vent);
      var bell = cyl(0.07, 0.07, 0.05, 16, satin); bell.rotation.x = Math.PI / 2; bell.position.z = out * 0.02; pivot.add(bell);
      var cal = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.07, 16, 1, false, 0, 0.9), calM);
      cal.rotation.x = Math.PI / 2; cal.rotation.y = 0; cal.position.z = out * 0.012; cal.rotation.z = Math.PI * 0.55; cal.scale.set(1.04, 1.04, 1); pivot.add(cal);
      wheels.push({ pivot: pivot, spin: spin, front: p[2], lx: p[0], lz: p[1] });
    });

    // contact shadow for when real shadows are off
    var blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; root.add(blob);

    root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    blob.castShadow = false;

    var mats = allMats.slice();
    var V = { root: root, body: body, parts: parts, wheels: wheels, blob: blob, floorY: floorY, mats: mats };
    V.update = function (car) { sync(V, car); };
    V.setInteriorVisible = function (on) { interior.visible = on; };
    // HIGH: clear-coat PBR with reflections; LOW: Lambert copies (cheaper)
    V.setQuality = function (high) {
      root.traverse(function (o) {
        if (!o.isMesh || o === blob) return;
        var list = Array.isArray(o.material) ? o.material : [o.material];
        var swapped = list.map(function (m) {
          if (!m.userData.pair) {
            if (m.isMeshBasicMaterial) return m;
            var low = new THREE.MeshLambertMaterial({ color: m.color, map: m.map || null, transparent: m.transparent, opacity: m.opacity, side: m.side, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor });
            m.userData.pair = { high: m, low: low }; low.userData.pair = m.userData.pair;
          }
          return high ? m.userData.pair.high : m.userData.pair.low;
        });
        o.material = Array.isArray(o.material) ? swapped : swapped[0];
      });
    };
    V.dispose = function () {
      var seen = new Set();
      root.traverse(function (o) {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (!m) return;
          [m, m.userData && m.userData.pair && m.userData.pair.low, m.userData && m.userData.pair && m.userData.pair.high].forEach(function (x) {
            if (x && !seen.has(x)) { seen.add(x); if (x.map && !seen.has(x.map)) { seen.add(x.map); x.map.dispose(); } x.dispose(); }
          });
        });
      });
    };
    return V;
  }

  // Digital dash: shift-light bar, gear, speed, rpm (every other frame).
  function drawDisplay(D, car) {
    if ((D.frame++ & 1) === 1) return;
    var g = D.ctx, w = 512, h = 160, rpm = car.rpm, lim = car.spec.limiter;
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
    var segs = 24, on = Math.round(Math.min(1, rpm / lim) * segs), flash = rpm > lim * 0.94 && (Date.now() / 90 | 0) % 2;
    for (var i = 0; i < segs; i++) {
      var f = i / segs, col = f < 0.6 ? '#2fe36a' : f < 0.82 ? '#ffd23c' : '#ff3b2f';
      g.fillStyle = i < on ? (flash ? '#4ad7ff' : col) : '#16191e'; g.fillRect(14 + i * 20.3, 10, 16, 22);
    }
    g.fillStyle = '#ff7a1a'; g.font = '900 70px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(car.shiftT > 0 ? '-' : car.gear === -1 ? 'R' : car.gear === 0 ? 'N' : car.gear, w / 2, 72); // above the wheel rim
    g.fillStyle = '#fff'; g.font = '800 54px ui-monospace, Consolas, monospace'; g.textAlign = 'right';
    g.fillText(Math.round(car.speed * 3.6), w - 20, 92);
    g.fillStyle = '#7d8794'; g.font = '700 20px system-ui, sans-serif'; g.fillText('km/h', w - 20, 136);
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '800 40px ui-monospace, Consolas, monospace';
    g.fillText((Math.round(rpm / 10) * 10 + ''), 20, 92);
    g.fillStyle = '#7d8794'; g.font = '700 20px system-ui, sans-serif'; g.fillText('rpm', 20, 136);
    D.tex.needsUpdate = true;
  }

  function sync(V, car) {
    var root = V.root;
    root.position.set(car.x, car.y, car.z);
    root.rotation.set(0, -car.yaw, 0);
    var roll = car.roll, lift = 0;
    if (car.flip) { roll += car.flip.visualRoll || 0; lift = Math.abs(Math.sin(car.flip.visualRoll || 0)) * 0.9; }
    V.body.rotation.set(roll, 0, car.pitch, 'YZX');
    V.body.position.y = lift;
    var spec = car.spec;
    for (var i = 0; i < 4; i++) {
      var w = car.wheels[i], vw = V.wheels[i];
      vw.pivot.position.y = w.wheelY - car.y;
      vw.pivot.rotation.y = -w.steer;
      vw.spin.rotation.z = -w.angle;
    }
    V.parts.steeringWheel.rotation.x = car.steer / spec.maxSteer * 2.2;
    if (V.parts.interior.visible) drawDisplay(V.parts.display, car);
    var gy = (car.wheels[0].gy + car.wheels[1].gy + car.wheels[2].gy + car.wheels[3].gy) / 4;
    V.blob.position.y = gy - car.y + 0.03;
  }

  RL.Vehicle = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);

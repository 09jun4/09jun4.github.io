// hi-track.js — the circuit itself for the 높음 renderer, generated from the
// track.js samples (no per-circuit modelling): asphalt (normal-mapped, with the
// same speed-vs-corner colouring as 낮음), paved run-off, raised 3D kerbs, white
// lines, concrete walls with sponsor bands, armco in wide run-offs, leaning catch
// fences with posts, the start line, grid boxes, the start gantry with its five
// lights, 300/200/100 boards before slow corners, light towers, the circuit name
// sign and a live big screen. Widths and offsets come straight from the samples
// (TRACK_WIDTH, wallLeft / wallRight), so it matches the physics exactly.
// World (x east, y north, h up) -> three (x, h, -y).
// Load order: after hi-tex.js. Depends on: THREE, CR.Hi, Config, Track, Race.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var T = Hi.Track = {};

  var WALL_H = 0.9, WALL_T = 0.6; // as renderer.js
  var FENCE_TOP = 4.1, FENCE_LEAN = 0.55;
  var KERB_W = 1.0, KERB_MIN_CURV = 1 / 300;

  // Cumulative distance along the lap at every sample, D[n] = lap length.
  function cumulative(S) {
    var n = S.length, D = new Float64Array(n + 1);
    for (var i = 1; i <= n; i++) {
      var a = S[i - 1], b = S[i % n];
      D[i] = D[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
    }
    return D;
  }
  T.cumulative = cumulative;

  // Strip along the lap: profile(i) -> [[offset, height], ...] (offset + = left
  // of the driving direction). Rows for samples i0..i1 (inclusive, may wrap;
  // default the whole closed lap). skip(i): no faces from sample i to i+1.
  // uv: 'across' (u 0..1 over the profile) or 'world' (u = offset / uScale);
  // v = distance / vScale. Returns a BufferGeometry (indexed, smooth normals
  // within the profile unless points are duplicated).
  function strip(S, D, profile, opts) {
    opts = opts || {};
    var n = S.length, i0 = opts.from || 0, count = opts.count !== undefined ? opts.count : n; // rows - 1
    var rows = count + 1;
    var m = profile(i0).length;
    var pos = new Float32Array(rows * m * 3), uv = new Float32Array(rows * m * 2), idx = [];
    var extra = opts.attr ? new Float32Array(rows * m) : null;
    var vScale = opts.vScale || 10, uScale = opts.uScale || 4;
    for (var r = 0; r < rows; r++) {
      var i = (i0 + r) % n, s = S[i];
      var dist = D[i0 + r <= n ? i0 + r : (i0 + r) % n] + (i0 + r > n ? D[n] : 0);
      if (opts.from === undefined && r === count) dist = D[n];
      var prof = profile(i, r);
      var across = 0, total = 0;
      if (opts.uv !== 'world') for (var q = 1; q < m; q++) total += Math.hypot(prof[q][0] - prof[q - 1][0], prof[q][1] - prof[q - 1][1]);
      for (var k = 0; k < m; k++) {
        var o = prof[k][0], h = prof[k][1];
        var x = s.x + s.nx * o, y = s.y + s.ny * o, p = (r * m + k);
        pos[p * 3] = x; pos[p * 3 + 1] = h; pos[p * 3 + 2] = -y;
        if (k > 0 && opts.uv !== 'world') across += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]);
        uv[p * 2] = opts.uv === 'world' ? o / uScale : (total > 0 ? across / total : 0);
        if (opts.flipU) uv[p * 2] = 1 - uv[p * 2];
        uv[p * 2 + 1] = dist / vScale;
        if (extra) extra[p] = opts.attr(i);
      }
    }
    for (var rr = 0; rr < count; rr++) {
      var ii = (i0 + rr) % n;
      if (opts.skip && opts.skip(ii)) continue;
      for (var kk = 0; kk < m - 1; kk++) {
        if (opts.gap && opts.gap(kk)) continue;
        var a = rr * m + kk, b = a + 1, c = a + m, d = c + 1;
        // offsets grow to the left; keep faces pointing up / towards the track
        if (opts.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (extra) g.setAttribute(opts.attrName, new THREE.BufferAttribute(extra, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  T.strip = strip;

  // Runs of consecutive samples where test(i) holds: [{from, count}] (count =
  // number of faces), wrapping round the start line.
  function runs(n, test) {
    var out = [], start = -1;
    var first = 0;
    while (first < n && test(first)) first++;
    if (first === n) return [{ from: 0, count: n }];
    for (var k = 1; k <= n; k++) {
      var i = (first + k) % n, on = test(i);
      if (on && start < 0) start = i;
      if ((!on || k === n) && start >= 0) {
        var end = on ? i : (i - 1 + n) % n;
        out.push({ from: start, count: ((end - start + n) % n) + 1 });
        start = -1;
      }
    }
    return out;
  }
  T.runs = runs;

  function mesh(R, geo, mat, opts) {
    var m = new THREE.Mesh(geo, mat);
    opts = opts || {};
    m.receiveShadow = opts.receive !== false;
    m.castShadow = !!opts.cast;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    if (opts.order) m.renderOrder = opts.order;
    return m;
  }
  T.mesh = mesh;

  // Merge geometries (same attributes) into one.
  function merge(list) {
    list = list.filter(function (g) { return g && g.attributes.position && g.attributes.position.count; });
    if (!list.length) return null;
    var names = Object.keys(list[0].attributes), total = 0, itotal = 0;
    list.forEach(function (g) { total += g.attributes.position.count; itotal += g.index ? g.index.count : g.attributes.position.count; });
    var out = new THREE.BufferGeometry(), arrays = {};
    names.forEach(function (nm) { arrays[nm] = new Float32Array(total * list[0].attributes[nm].itemSize); });
    var index = new Uint32Array(itotal), off = 0, ioff = 0;
    list.forEach(function (g) {
      var c = g.attributes.position.count;
      names.forEach(function (nm) { arrays[nm].set(g.attributes[nm].array, off * g.attributes[nm].itemSize); });
      if (g.index) { for (var i = 0; i < g.index.count; i++) index[ioff + i] = g.index.array[i] + off; ioff += g.index.count; }
      else { for (var j = 0; j < c; j++) index[ioff + j] = off + j; ioff += c; }
      off += c;
      g.dispose();
    });
    names.forEach(function (nm) { out.setAttribute(nm, new THREE.BufferAttribute(arrays[nm], list[0].attributes[nm].itemSize)); });
    out.setIndex(new THREE.BufferAttribute(index, 1));
    return out;
  }
  T.merge = merge;

  // Speed colouring of the asphalt (renderer.js SPEED_COLOR_STOPS): per-vertex
  // corner speed, current car speed as a uniform.
  function asphaltHook(uniforms) {
    return function (shader) {
      shader.uniforms.uCarSpeed = uniforms.uCarSpeed;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSafe;\nvarying float vSafe;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSafe = aSafe;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uCarSpeed;\nvarying float vSafe;\n' +
          'vec4 speedTint(float t) {\n' +
          '  vec3 green = vec3(0.016, 0.552, 0.195); vec3 yellow = vec3(1.0, 0.637, 0.023); vec3 red = vec3(0.846, 0.033, 0.046);\n' +
          '  if (t >= 1.0) return vec4(red, 0.58);\n' +
          '  if (t < 0.6) return vec4(green, mix(0.06, 0.14, t / 0.6));\n' +
          '  float f = clamp((t - 0.6) / 0.399, 0.0, 1.0);\n' +
          '  return vec4(mix(green, yellow, f), mix(0.14, 0.45, f));\n' +
          '}')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          '{ float t = floor(uCarSpeed / max(vSafe, 0.1) * 40.0) / 40.0; vec4 tc = speedTint(t); diffuseColor.rgb = mix(diffuseColor.rgb, tc.rgb * 0.4, tc.a); }');
    };
  }

  // Box-part geometry helper (reuses the car builder's prism code).
  function partsGroup(R, parts, x, y, heading) {
    var g = new THREE.Group();
    g.position.set(x, 0, -y);
    g.rotation.y = heading;
    Hi.Car.buildParts(R, parts, g, { cast: true });
    g.updateMatrixWorld(true);
    return g;
  }

  // Position / frame at a signed distance along the lap from the start line.
  function frameAt(S, D, dist) {
    var n = S.length, L = D[n];
    var d = ((dist % L) + L) % L;
    var lo = 0, hi = n;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (D[mid] <= d) lo = mid; else hi = mid; }
    var a = S[lo], b = S[(lo + 1) % n], f = (d - D[lo]) / Math.max(1e-6, D[lo + 1] - D[lo]);
    var hx = Math.cos(a.heading), hy = Math.sin(a.heading);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, heading: a.heading, nx: a.nx, ny: a.ny, fx: hx, fy: hy, i: lo, s: a };
  }
  T.frameAt = frameAt;

  // Is a world point clear of every part of the lap except near sample `near`?
  function clearOfTrack(S, x, y, radius, near, skipSamples) {
    var n = S.length;
    for (var m = 0; m < n; m += 2) {
      var gap = Math.abs(m - near); gap = Math.min(gap, n - gap);
      if (gap < skipSamples) continue;
      var q = S[m], dx = q.x - x, dy = q.y - y;
      if (Math.abs(dx) < radius + 30 && Math.abs(dy) < radius + 30) {
        var w = Math.max(q.wallLeft, q.wallRight) + 2;
        if (Math.hypot(dx, dy) < radius + w) return false;
      }
    }
    return true;
  }
  T.clearOfTrack = clearOfTrack;

  T.build = function (R) {
    var cfg = CR.Config, S = CR.Track.samples, n = S.length, half = cfg.TRACK_WIDTH / 2;
    var D = cumulative(S), L = D[n];
    var group = new THREE.Group();
    group.name = 'track';
    var out = { group: group, D: D, uniforms: { uCarSpeed: { value: 0 } }, lights: [], screen: null };
    var A = R.texAsphalt, aniso = R.tier.aniso;

    // --- Asphalt with speed colouring ---------------------------------------------
    var asphaltMat = R.std({ map: A.map, normalMap: A.normal, roughnessMap: A.rough, roughness: 1, metalness: 0,
      normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.3 }, 'asphalt', asphaltHook(out.uniforms));
    var road = strip(S, D, function (i) { return [[-half, 0], [half, 0]]; },
      { vScale: cfg.TRACK_WIDTH, attr: function (i) { return S[i].maxSafeSpeed; }, attrName: 'aSafe', flip: true });
    group.add(mesh(R, road, asphaltMat));
    out.roadGeometry = road;

    // --- Paved run-off between the white line and the wall --------------------------
    var runoffMat = R.std({ map: R.texRunoff, roughness: 0.95, metalness: 0, color: 0x9ea2a8, envMapIntensity: 0.3 }, 'runoff');
    var roL = strip(S, D, function (i) { var s = S[i], w = s.bridge ? half : s.wallLeft; return [[half, 0], [w + 0.05, 0]]; }, { uv: 'world', uScale: 6, vScale: 6, flip: true });
    var roR = strip(S, D, function (i) { var s = S[i], w = s.bridge ? half : s.wallRight; return [[-w - 0.05, 0], [-half, 0]]; }, { uv: 'world', uScale: 6, vScale: 6, flip: true });
    group.add(mesh(R, merge([roL, roR]), runoffMat));

    // --- White lines (track limits) ------------------------------------------------
    var lo = half - 0.2 - 0.2, hi = lo + 0.4;
    var lineMat = R.std({ color: 0xf2f2f0, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }, 'line');
    var lines = merge([
      strip(S, D, function () { return [[lo, 0.004], [hi, 0.004]]; }, { flip: true }),
      strip(S, D, function () { return [[-hi, 0.004], [-lo, 0.004]]; }, { flip: true }),
    ]);
    group.add(mesh(R, lines, lineMat, { order: 1 }));

    // --- Kerbs: raised, red / white, on real corners ----------------------------------
    var kerbMat = R.std({ map: R.texKerb, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, 'kerb');
    var kerbRuns = runs(n, function (i) { return Math.abs(S[i].curvature) >= KERB_MIN_CURV && !S[i].bridge; });
    var kerbs = [];
    kerbRuns.forEach(function (run) {
      if (run.count < 2) return;
      var ramp = function (r) { var e = Math.min(r, run.count - r); return Math.min(1, e / 1.5); };
      [1, -1].forEach(function (side) {
        kerbs.push(strip(S, D, function (i, r) {
          var hk = 0.05 * ramp(r), a = half, b = half + KERB_W;
          var p = [[a, 0.003], [a + 0.12, 0.003 + hk], [b - 0.12, 0.003 + hk], [b, 0.003]];
          if (side < 0) p = p.map(function (q) { return [-q[0], q[1]]; }).reverse();
          return p;
        }, { from: run.from, count: run.count, vScale: 3, flip: true }));
      });
    });
    var kerbGeo = merge(kerbs);
    if (kerbGeo) group.add(mesh(R, kerbGeo, kerbMat, { order: 1 }));
    out.kerbRuns = kerbRuns;

    // --- Walls: concrete barrier (inner face, top, outer face) --------------------------
    var wallMat = R.std({ map: R.texConcrete, color: 0xd9dce0, roughness: 0.85, metalness: 0 }, 'wall');
    var notBridge = function (i) { return S[i].bridge || S[(i + 1) % n].bridge; };
    // 리얼리스틱 pit entry / exit: no wall face where the pit-side wall jumps (openings)
    var skipL = function (i) { return notBridge(i) || S[i].pitJump === 1; };
    var skipR = function (i) { return notBridge(i) || S[i].pitJump === -1; };
    var wallL = strip(S, D, function (i) {
      var w = S[i].wallLeft;
      return [[w, 0], [w, WALL_H], [w, WALL_H], [w + WALL_T, WALL_H], [w + WALL_T, WALL_H], [w + WALL_T, 0]];
    }, { uv: 'world', uScale: 2, vScale: 4, skip: skipL, flip: true, gap: function (k) { return k === 1 || k === 3; } });
    var wallR = strip(S, D, function (i) {
      var w = S[i].wallRight;
      return [[-w - WALL_T, 0], [-w - WALL_T, WALL_H], [-w - WALL_T, WALL_H], [-w, WALL_H], [-w, WALL_H], [-w, 0]];
    }, { uv: 'world', uScale: 2, vScale: 4, skip: skipR, flip: true, gap: function (k) { return k === 1 || k === 3; } });
    group.add(mesh(R, merge([wallL, wallR]), wallMat, { cast: true }));

    // Sponsor bands on the inner face, board by board (atlas rows vary).
    var spMat = R.std({ map: R.texSponsors, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, 'sponsor');
    var sp = [], rowsN = Hi.SPONSOR_ROWS, BOARD = 36; // m per board
    [1, -1].forEach(function (side) {
      var pos = [], uvs = [];
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n, a = S[i], b = S[j];
        if (a.bridge || b.bridge || a.pitJump === side) continue;
        var chunk = Math.floor(D[i] / BOARD);
        if ((chunk + (side > 0 ? 0 : 1)) % 3 === 2) continue;
        var row = (chunk * 5 + (side > 0 ? 1 : 4)) % rowsN;
        var wa = side > 0 ? a.wallLeft - 0.01 : -(a.wallRight - 0.01), wb = side > 0 ? b.wallLeft - 0.01 : -(b.wallRight - 0.01);
        var ua = (D[i] % BOARD) / BOARD, ub = ua + (D[i + 1] - D[i]) / BOARD;
        var v0 = 1 - (row + 0.92) / rowsN, v1 = 1 - (row + 0.08) / rowsN;
        var ax = a.x + a.nx * wa, ay = a.y + a.ny * wa, bx = b.x + b.nx * wb, by = b.y + b.ny * wb;
        var z0 = 0.12, z1 = 0.78;
        var quad = side > 0
          ? [[ax, z0, ay, ua, v0], [bx, z0, by, ub, v0], [bx, z1, by, ub, v1], [ax, z0, ay, ua, v0], [bx, z1, by, ub, v1], [ax, z1, ay, ua, v1]]
          : [[bx, z0, by, ub, v0], [ax, z0, ay, ua, v0], [ax, z1, ay, ua, v1], [bx, z0, by, ub, v0], [ax, z1, ay, ua, v1], [bx, z1, by, ub, v1]];
        if (side < 0) quad.forEach(function (q) { q[3] = 1 - q[3]; });
        quad.forEach(function (q) { pos.push(q[0], q[1], -q[2]); uvs.push(q[3], q[4]); });
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      sp.push(g);
    });
    group.add(mesh(R, merge(sp), spMat));

    // --- Armco in front of the wall where the run-off is wide ----------------------------
    var armMat = R.std({ color: 0xb9c0c8, roughness: 0.35, metalness: 0.85, envMapIntensity: 1 }, 'armco');
    var arm = [];
    [1, -1].forEach(function (side) {
      var wide = runs(n, function (i) { var s = S[i]; return !s.bridge && (side > 0 ? s.wallLeft : s.wallRight) - half > 6; });
      wide.forEach(function (run) {
        if (run.count < 3) return;
        arm.push(strip(S, D, function (i) {
          var w = (side > 0 ? S[i].wallLeft : S[i].wallRight) - 0.32;
          var p = [[w, 0.42], [w + 0.05, 0.56], [w, 0.7], [w + 0.05, 0.8]];
          return side > 0 ? p : p.map(function (q) { return [-q[0], q[1]]; });
        }, { from: run.from, count: run.count, vScale: 4, flip: side < 0 }));
      });
    });
    var armGeo = merge(arm);
    if (armGeo) { var am = mesh(R, armGeo, armMat); am.material.side = THREE.DoubleSide; group.add(am); }

    // --- Catch fence on the walls: alpha-tested mesh, cables, posts -------------------------
    var fenceMat = new THREE.MeshStandardMaterial({ map: R.texFence, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6, color: 0x9aa2ad });
    fenceMat.map.repeat.set(1, 1);
    R.register(fenceMat);
    var fo = WALL_T / 2;
    var fences = [
      strip(S, D, function (i) { var w = S[i].wallLeft + fo; return [[w, WALL_H], [w - FENCE_LEAN, FENCE_TOP]]; }, { uv: 'world', uScale: 0.32, vScale: 0.32, skip: skipL }),
      strip(S, D, function (i) { var w = -S[i].wallRight - fo; return [[w, WALL_H], [w + FENCE_LEAN, FENCE_TOP]]; }, { uv: 'world', uScale: -0.32, vScale: 0.32, skip: skipR }),
    ];
    // world u = offset/scale is a poor fit for a sloped face: use height instead
    fences.forEach(function (g) {
      var p = g.attributes.position, uv = g.attributes.uv;
      for (var k = 0; k < p.count; k++) uv.setX(k, p.getY(k) / 0.32);
    });
    var fm = mesh(R, merge(fences), fenceMat, { receive: false });
    out.fence = fm;
    group.add(fm);
    var cableMat = R.std({ color: 0x6d737c, roughness: 0.5, metalness: 0.8 }, 'cable');
    var cables = [];
    [[FENCE_LEAN * 0.45, 2.47, 0.05], [FENCE_LEAN, FENCE_TOP - 0.03, 0.06]].forEach(function (cb) {
      cables.push(strip(S, D, function (i) { var w = S[i].wallLeft + fo - cb[0]; return [[w, cb[1] - cb[2]], [w, cb[1] + cb[2]]]; }, { skip: skipL }));
      cables.push(strip(S, D, function (i) { var w = -S[i].wallRight - fo + cb[0]; return [[w, cb[1] + cb[2]], [w, cb[1] - cb[2]]]; }, { skip: skipR }));
    });
    var cm = mesh(R, merge(cables), cableMat, { receive: false });
    cm.material.side = THREE.DoubleSide;
    group.add(cm);
    // posts every 8 m on both walls, leaning in like the mesh
    var postGeo = new THREE.BoxGeometry(0.1, FENCE_TOP - WALL_H + 0.1, 0.1);
    postGeo.translate(0, (FENCE_TOP - WALL_H) / 2, 0);
    var postMat = R.std({ color: 0x4f555e, roughness: 0.5, metalness: 0.7 }, 'post');
    var postCount = 0;
    for (var pi = 0; pi < n; pi += 2) if (!S[pi].bridge) postCount += 2;
    var posts = new THREE.InstancedMesh(postGeo, postMat, Math.max(1, postCount));
    var dummy = new THREE.Object3D(), pc = 0, lean = Math.atan2(FENCE_LEAN, FENCE_TOP - WALL_H);
    for (var pj = 0; pj < n; pj += 2) {
      var s = S[pj];
      if (s.bridge) continue;
      [1, -1].forEach(function (side) {
        var w = side > 0 ? s.wallLeft + fo : -s.wallRight - fo;
        dummy.position.set(s.x + s.nx * w, WALL_H, -(s.y + s.ny * w));
        dummy.rotation.set(0, s.heading, side * lean, 'YXZ');
        dummy.updateMatrix();
        posts.setMatrixAt(pc++, dummy.matrix);
      });
    }
    posts.count = pc;
    posts.castShadow = false;
    posts.receiveShadow = false;
    group.add(posts);

    // --- Start / finish line and grid boxes -------------------------------------------------
    var s0 = S[0];
    var chk = Hi.checker(8, 2);
    R.textures.push(chk);
    var chkMat = R.std({ map: chk, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }, 'checker');
    var lineGeo = new THREE.PlaneGeometry(cfg.TRACK_WIDTH, 1.8);
    lineGeo.rotateX(-Math.PI / 2);
    var lineMesh = new THREE.Mesh(lineGeo, chkMat);
    var fx0 = Math.cos(s0.heading), fy0 = Math.sin(s0.heading);
    lineMesh.position.set(s0.x + fx0 * 0.9, 0.006, -(s0.y + fy0 * 0.9));
    lineMesh.rotation.y = s0.heading - Math.PI / 2;
    lineMesh.receiveShadow = true;
    lineMesh.renderOrder = 2;
    group.add(lineMesh);
    var gridPos = [], gridMat = lineMat;
    var spacing = CR.Race && CR.Race.GRID_SPACING || 8, lat = CR.Race && CR.Race.GRID_LATERAL || 2.6;
    for (var gk = 0; gk < 10; gk++) {
      var f = frameAt(S, D, -(spacing + gk * spacing) + 2.4);
      var off = gk % 2 === 0 ? lat : -lat;
      // front bar across the slot + short side ticks (an open box)
      var bars = [[off - 1.1, off + 1.1, 0, 0.18], [off - 1.1, off - 0.95, -1.6, 0.18], [off + 0.95, off + 1.1, -1.6, 0.18]];
      bars.forEach(function (bar) {
        var o0 = bar[0], o1 = bar[1], back = bar[2], depth = bar[3];
        var pts = [[o0, 0], [o1, 0], [o1, back - depth], [o0, back - depth]];
        if (back === 0) pts = [[o0, 0], [o1, 0], [o1, -depth], [o0, -depth]];
        var q = pts.map(function (p) { return [f.x + f.nx * p[0] + f.fx * p[1], f.y + f.ny * p[0] + f.fy * p[1]]; });
        [[0, 1, 2], [0, 2, 3]].forEach(function (tri) {
          tri.forEach(function (t) { gridPos.push(q[t][0], 0.005, -q[t][1]); });
        });
      });
    }
    var gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
    gridGeo.computeVertexNormals();
    group.add(mesh(R, gridGeo, gridMat, { order: 1 }));

    // --- Start gantry (pillars, beam, chequered banner, five lights) -------------------------
    var wl = (s0.wallLeft || half + 2) + 1.4, wr = (s0.wallRight || half + 2) + 1.4;
    var steel = '#3b414c', dark = '#1d2127';
    var gp = [];
    gp.push({ box: [wr, 0, 1.1, 1.1], z: [0, 10.6], color: steel, metal: true });
    gp.push({ box: [-wl, 0, 1.1, 1.1], z: [0, 10.6], color: steel, metal: true });
    gp.push({ box: [wr, 0, 1.8, 1.8], z: [0, 0.5], color: dark });
    gp.push({ box: [-wl, 0, 1.8, 1.8], z: [0, 0.5], color: dark });
    var x0 = -wl - 0.55, x1 = wr + 0.55, mid = (x0 + x1) / 2;
    gp.push({ box: [mid, 0, x1 - x0, 0.9], z: [8.8, 10.6], color: dark, top: '#2b3039' });
    var sq = 0.9, cnt = Math.floor((x1 - x0) / sq), sx = mid - (cnt * sq) / 2 + sq / 2;
    for (var r = 0; r < 2; r++) for (var k2 = 0; k2 < cnt; k2++) {
      gp.push({ box: [sx + k2 * sq, -0.47, sq, 0.04], z: [8.85 + r * 0.88, 9.73 + r * 0.88], color: (k2 + r) % 2 ? '#f2f2f2' : '#111111' });
    }
    for (var li = 0; li < 5; li++) gp.push({ box: [mid + (li - 2) * 1.0, -0.1, 0.78, 0.5], z: [7.7, 8.8], color: '#0d0f12' });
    var gantry = partsGroup(R, gp, s0.x, s0.y, s0.heading);
    group.add(gantry);
    // lamps: emissive, two per housing; lit by Race.lightsOn
    var lampGeo = new THREE.CircleGeometry(0.19, 16);
    out.lamps = [];
    for (var lj = 0; lj < 5; lj++) {
      var lm = new THREE.MeshStandardMaterial({ color: 0x2a0b0b, emissive: 0xff1a10, emissiveIntensity: 0, roughness: 0.3 });
      R.register(lm);
      [8.45, 8.0].forEach(function (z) {
        var lamp = new THREE.Mesh(lampGeo, lm);
        // car-local (x right, y forward) -> group-local (forward, up, right)
        lamp.position.set(-0.36, z, mid + (lj - 2) * 1.0);
        lamp.rotation.y = -Math.PI / 2;
        gantry.add(lamp);
      });
      out.lamps.push(lm);
    }
    gantry.updateMatrixWorld(true);

    // --- 300 / 200 / 100 boards before slow corners ---------------------------------------------
    var boards = Hi.textBoard([{ text: '300', size: 0.62 }, { text: '200', size: 0.62 }, { text: '100', size: 0.62 }], 128, 384, '#f4f4f4', '#141414');
    R.textures.push(boards.texture);
    var boardMat = R.std({ map: boards.texture, roughness: 0.5 }, 'boards');
    var postMat2 = R.std({ color: 0x2b313b, roughness: 0.6, metalness: 0.4 }, 'boardpost');
    var bPos = [], bUv = [], pPos = [];
    var cap = cfg.STRAIGHT_SPEED_CAP * 0.5, lastEntry = -1e9;
    for (var ci = 0; ci < n; ci++) {
      var prev = S[(ci - 1 + n) % n].maxSafeSpeed, cur = S[ci].maxSafeSpeed;
      if (!(cur < 52 && prev >= 52 && prev < cap * 2)) {
        if (!(cur < 52 && prev > cap)) continue;
      }
      if (D[ci] - lastEntry < 350 && D[ci] > lastEntry) continue;
      lastEntry = D[ci];
      var side2 = S[ci].curvature >= 0 ? -1 : 1; // outside of the corner
      [300, 200, 100].forEach(function (dist, bi) {
        var fr = frameAt(S, D, D[ci] - dist), ss = fr.s;
        if (ss.bridge || Math.abs(ss.curvature) > 1 / 250) return;
        var w = side2 > 0 ? ss.wallLeft : ss.wallRight;
        var o = side2 * (w - 0.9);
        var cx = fr.x + fr.nx * o, cy = fr.y + fr.ny * o;
        // panel faces the approaching car
        var hw = 0.45, z0 = 1.15, z1 = 2.15;
        var rx = -fr.nx * hw, ry = -fr.ny * hw; // to the right of the driving direction
        var pa = [cx - rx, cy - ry], pb = [cx + rx, cy + ry];
        var v0 = 1 - (bi + 1) / 3, v1 = 1 - bi / 3;
        [[pa, z0, 0, v0], [pb, z0, 1, v0], [pb, z1, 1, v1], [pa, z0, 0, v0], [pb, z1, 1, v1], [pa, z1, 0, v1]].forEach(function (q) {
          bPos.push(q[0][0] - fr.fx * 0.02, q[1], -(q[0][1] - fr.fy * 0.02)); bUv.push(q[2], q[3]);
        });
        // post behind the panel (thin box as two crossed quads)
        [[0.06, 0], [0, 0.06]].forEach(function (d) {
          var qa = [cx - fr.nx * d[0] + fr.fx * (0.05 + d[1]), cy - fr.ny * d[0] + fr.fy * (0.05 + d[1])];
          var qb = [cx + fr.nx * d[0] + fr.fx * (0.05 - d[1]), cy + fr.ny * d[0] + fr.fy * (0.05 - d[1])];
          [[qa, 0], [qb, 0], [qb, z0], [qa, 0], [qb, z0], [qa, z0]].forEach(function (q) { pPos.push(q[0][0], q[1], -q[0][1]); });
        });
      });
    }
    if (bPos.length) {
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(bUv, 2));
      bg.computeVertexNormals();
      var bm = mesh(R, bg, boardMat); bm.material.side = THREE.DoubleSide; group.add(bm);
      var pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
      pg.computeVertexNormals();
      var pm = mesh(R, pg, postMat2); pm.material.side = THREE.DoubleSide; group.add(pm);
    }

    // --- Circuit name sign and the big screen on the main straight ---------------------------------
    var tr = CR.Tracks.list[CR.Main.trackIndex] || CR.Tracks.list[0];
    var standsAt = R.standSpans || [];
    function spotFree(dist, side, w, minOff) {
      var fr = frameAt(S, D, dist);
      var off = (side > 0 ? fr.s.wallLeft : fr.s.wallRight) + (minOff || 8);
      for (var k = 0; k < standsAt.length; k++) {
        var st = standsAt[k];
        if (st.side !== side) continue;
        var d0 = D[st.i0], d1 = d0 + st.len * cfg.TRACK_SAMPLE_SPACING, dd = ((dist - d0) % L + L) % L;
        if (dd > -w && dd < d1 - d0 + w) off = Math.max(off, st.off + 15);
      }
      var cx = fr.x + fr.nx * side * off, cy = fr.y + fr.ny * side * off;
      return clearOfTrack(S, cx, cy, w / 2 + 3, fr.i, 30) ? { fr: fr, off: off, x: cx, y: cy, side: side } : null;
    }
    function billboard(texture, widthM, heightM, bottom, spot, emissive) {
      var side = spot.side;
      var g = new THREE.Group();
      var mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0, envMapIntensity: 0.15, emissive: emissive ? 0xffffff : 0x000000,
        emissiveMap: emissive ? texture : null, emissiveIntensity: emissive ? 0.55 : 0 });
      R.register(mat);
      var face = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), mat);
      face.position.y = bottom + heightM / 2;
      g.add(face);
      var frameMat = R.std({ color: 0x1d2127, roughness: 0.6, metalness: 0.5 }, 'billframe');
      var back = new THREE.Mesh(new THREE.BoxGeometry(widthM + 0.6, heightM + 0.6, 0.4), frameMat);
      back.position.set(0, bottom + heightM / 2, -0.25);
      back.castShadow = true;
      g.add(back);
      [-1, 1].forEach(function (sx2) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, bottom, 0.5), frameMat);
        leg.position.set(sx2 * widthM * 0.35, bottom / 2, -0.25);
        leg.castShadow = true;
        g.add(leg);
      });
      g.position.set(spot.x, 0, -spot.y);
      // face the track: the plane's +z normal points towards the centreline
      var tx = -spot.fr.nx * side, ty = -spot.fr.ny * side;
      g.rotation.y = Math.atan2(tx, -ty);
      g.updateMatrixWorld(true);
      return g;
    }
    var nameTex = Hi.textBoard([{ text: tr.name, size: 0.5, font: 'sans-serif', weight: 900 }, { text: tr.realName.toUpperCase(), size: 0.34 }], 1024, 256, '#101318', '#ffd23f');
    R.textures.push(nameTex.texture);
    var nameSpot = null;
    for (var tries = 0; tries < 12 && !nameSpot; tries++) nameSpot = spotFree(120 + tries * 40, tries % 2 ? -1 : 1, 22, 10);
    if (nameSpot) group.add(billboard(nameTex.texture, 20, 5, 6, nameSpot, false));
    out.nameSpot = nameSpot;
    var screen = Hi.textBoard([{ text: 'TRACK MASTER', size: 0.5 }], 512, 256, '#05070a', '#f4f4f4');
    R.textures.push(screen.texture);
    var scrSpot = null;
    for (var t2 = 0; t2 < 12 && !scrSpot; t2++) scrSpot = spotFree(-160 - t2 * 40, t2 % 2 ? 1 : -1, 16, 10);
    if (scrSpot) {
      group.add(billboard(screen.texture, 12, 6, 5, scrSpot, true));
      out.screen = { canvas: screen.canvas, texture: screen.texture, last: '', next: 0, spot: scrSpot };
    }

    // --- Light towers round the lap -------------------------------------------------------------------
    var towerSpots = [];
    for (var td = 60; td < L; td += 170) {
      var side3 = (Math.floor(td / 170) % 2) ? 1 : -1;
      var sp3 = spotFree(td, side3, 4, 5) || spotFree(td, -side3, 4, 5);
      if (sp3) towerSpots.push(sp3);
    }
    var poleGeo = new THREE.CylinderGeometry(0.22, 0.35, 22, 8);
    poleGeo.translate(0, 11, 0);
    var headGeo = new THREE.BoxGeometry(3.2, 1.6, 0.5);
    headGeo.translate(0, 22.4, 0);
    var poleMat = R.std({ color: 0x8c939d, roughness: 0.45, metalness: 0.8 }, 'pole');
    var headMat = new THREE.MeshStandardMaterial({ color: 0x222831, emissive: 0xfff3d6, emissiveIntensity: 0, roughness: 0.4 });
    R.register(headMat);
    var poles = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(1, towerSpots.length));
    var heads = new THREE.InstancedMesh(headGeo, headMat, Math.max(1, towerSpots.length));
    towerSpots.forEach(function (spt, k) {
      dummy.position.set(spt.x, 0, -spt.y);
      dummy.rotation.set(0, spt.fr.heading, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(k, dummy.matrix);
      heads.setMatrixAt(k, dummy.matrix);
    });
    poles.count = heads.count = towerSpots.length;
    poles.castShadow = true;
    group.add(poles);
    group.add(heads);
    out.towerHeads = headMat;
    out.towers = towerSpots;

    // 리얼리스틱: pit lane, garages and crews (gfx/hi-pit.js)
    if (S[0].pit && Hi.Pit && CR.RealPit && CR.RealPit.garages) out.pit = Hi.Pit.build(R, S, D, group);

    return out;
  };

  // Per frame: speed colour, start lights, big screen text.
  T.update = function (R, built, dt) {
    var car = CR.Car.state;
    if (built.pit) Hi.Pit.update(R, built.pit, dt);
    built.uniforms.uCarSpeed.value = car.speed;
    var lit = CR.Race && CR.Race.active ? CR.Race.lightsOn : 0;
    for (var i = 0; i < built.lamps.length; i++) built.lamps[i].emissiveIntensity = i < lit ? 6 : 0;
    var sc = built.screen;
    if (sc) {
      sc.next -= dt;
      if (sc.next <= 0) {
        sc.next = 0.5;
        var L = CR.Laps, text;
        if (CR.Race && CR.Race.active && CR.Race.results === null) {
          var pos = document.getElementById('race-pos-p');
          text = (pos ? pos.textContent : 'P-') + '  LAP ' + L.lap + '/' + CR.Race.LAPS;
        } else text = 'LAP ' + L.lap + '  ' + Math.round(car.speed * 3.6) + ' KM/H';
        if (text !== sc.last) {
          sc.last = text;
          var g = sc.canvas.getContext('2d');
          g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 256);
          g.fillStyle = '#c8102e'; g.fillRect(0, 0, 512, 46);
          g.fillStyle = '#ffffff'; g.font = '900 30px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('TRACK MASTER', 256, 24);
          g.fillStyle = '#ffd23f'; g.font = '900 64px Arial Black, Arial, sans-serif';
          g.fillText(text, 256, 150);
          sc.texture.needsUpdate = true;
        }
      }
    }
  };
})();

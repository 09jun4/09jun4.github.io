// hi-env.js — scenery for the 높음 renderer: per-circuit look (time of day,
// sun, haze, hills, forest, city), procedural sky dome with clouds, far
// mountains and city silhouettes (background pass), terrain that rises away
// from the circuit, instanced trees and bushes (culled per cell), and the
// grandstands — renderer.js's real-world stand layout (Renderer.standsFor,
// tracks' NAMED spots) turned into 3D stands with stepped seating, aisles,
// roofs, columns and an instanced, animated crowd.
// Load order: after hi-track.js. Depends on: THREE, CR.Hi, Config, Track,
// Tracks, Renderer.standsFor.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var E = Hi.Env = {};

  // --- Per-circuit look ------------------------------------------------------------
  // sun: elevation / azimuth (deg, azimuth clockwise from north); night: 0 day ..
  // 1 night (lamps, windows); hills: hill height scale; forest: tree density;
  // city: skyline amount; clouds: cover 0..1; ground: grass tint.
  var THEMES = {
    'Autodromo Nazionale Monza': { sun: [50, 200], night: 0, hills: 0.12, forest: 1.0, city: 0.15, clouds: 0.35, ground: [1, 1, 1],
      zenith: '#3f78c4', horizon: '#c6dbeb', haze: '#c9d9e6', mountains: '#7f93a8', exposure: 1.0, fog: [380, 2600], trees: 'deciduous' },
    'Suzuka International Racing Course': { sun: [38, 230], night: 0, hills: 0.65, forest: 0.8, city: 0.1, clouds: 0.45, ground: [0.95, 1.02, 0.95],
      zenith: '#3a74c2', horizon: '#cfe0ec', haze: '#cbdbe6', mountains: '#6f8799', exposure: 1.0, fog: [360, 2500], trees: 'mixed' },
    'Las Vegas Street Circuit': { sun: [4, 255], night: 0.65, hills: 0.4, forest: 0.06, city: 1.0, clouds: 0.25, ground: [1.25, 1.0, 0.72],
      zenith: '#26315e', horizon: '#f39a5b', haze: '#d98b62', mountains: '#5a4a5c', exposure: 1.15, fog: [320, 2400], trees: 'palm' },
    'Circuit de Spa-Francorchamps': { sun: [30, 215], night: 0, hills: 1.0, forest: 1.0, city: 0, clouds: 0.72, ground: [0.92, 1.0, 0.9],
      zenith: '#5d7fa6', horizon: '#c3ccd4', haze: '#b9c3cc', mountains: '#5f6f62', exposure: 1.05, fog: [300, 2200], trees: 'conifer' },
    'Silverstone Circuit': { sun: [40, 190], night: 0, hills: 0.08, forest: 0.45, city: 0.05, clouds: 0.62, ground: [1, 1.03, 0.95],
      zenith: '#4c7cb8', horizon: '#d2dde6', haze: '#cdd7df', mountains: '#7c8c96', exposure: 1.0, fog: [380, 2600], trees: 'deciduous' },
    'Autódromo José Carlos Pace': { sun: [16, 290], night: 0.1, hills: 0.5, forest: 0.45, city: 0.7, clouds: 0.4, ground: [1.08, 1.02, 0.86],
      zenith: '#3b6fb3', horizon: '#f2cf9e', haze: '#e3c6a0', mountains: '#7b7f86', exposure: 1.02, fog: [340, 2400], trees: 'mixed' },
  };
  var DEFAULT_THEME = THEMES['Autodromo Nazionale Monza'];
  E.theme = function (realName) { return THEMES[realName] || DEFAULT_THEME; };

  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  // Sun direction in three coords from (elevation, azimuth).
  E.sunDir = function (th) {
    var el = th.sun[0] * Math.PI / 180, az = th.sun[1] * Math.PI / 180;
    var x = Math.cos(el) * Math.sin(az), y = Math.cos(el) * Math.cos(az), h = Math.sin(el);
    return new THREE.Vector3(x, h, -y).normalize();
  };
  E.sunColor = function (th) {
    var e = th.sun[0];
    var warm = Math.max(0, Math.min(1, (25 - e) / 22));
    var c = new THREE.Color(1, 0.96 - warm * 0.4, 0.88 - warm * 0.62);
    return { color: c, intensity: 3.6 - warm * 1.3 };
  };

  // --- Sky dome ----------------------------------------------------------------------
  var SKY_VS = [
    'varying vec3 vDir;',
    'void main() {',
    '  vDir = position;',
    '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = p.xyww;', // on the far plane
    '}'].join('\n');
  var SKY_FS = [
    'uniform vec3 sunDir; uniform vec3 cZenith; uniform vec3 cHorizon; uniform vec3 cHaze; uniform vec3 cGround; uniform vec3 sunColor;',
    'uniform float cloudCover; uniform float time; uniform float sunSize;',
    'varying vec3 vDir;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }',
    'void main() {',
    '  vec3 d = normalize(vDir);',
    '  float h = d.y;',
    '  vec3 col = mix(cHorizon, cZenith, pow(clamp(h, 0.0, 1.0), 0.5));',
    '  float sd = max(dot(d, sunDir), 0.0);',
    '  col += sunColor * (pow(sd, 5.0) * 0.18 + pow(sd, 48.0) * 0.5);',
    '  if (h > 0.0) {',
    '    vec2 p = d.xz / (h + 0.08) * 0.9 + vec2(time * 0.006, time * 0.002);',
    '    float c = fbm(p) * 0.75 + fbm(p * 3.1) * 0.25;',
    '    float cover = smoothstep(1.0 - cloudCover, 1.0 - cloudCover + 0.32, c);',
    '    float lit = 0.62 + 0.38 * smoothstep(0.35, 0.9, c) + pow(sd, 6.0) * 0.8;',
    '    vec3 cloud = mix(cHaze * 0.82, vec3(1.0) * 0.95 + sunColor * 0.08, lit) * (0.85 + 0.25 * cZenith.b);',
    '    cloud += sunColor * pow(sd, 12.0) * (1.0 - cover) * 0.6;',
    '    col = mix(col, cloud, cover * smoothstep(0.0, 0.18, h) * 0.92);',
    '  }',
    '  col += sunColor * smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.55, sd) * 24.0;', // disc (HDR -> bloom, flare)
    '  col = mix(col, cHaze, exp(-max(h, 0.0) * 11.0) * 0.6);',
    '  col = mix(col, cGround, smoothstep(0.0, -0.06, h));',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'].join('\n');

  E.makeSky = function (R, th) {
    var sun = E.sunColor(th);
    var mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        sunDir: { value: E.sunDir(th) }, cZenith: { value: col(th.zenith) }, cHorizon: { value: col(th.horizon) },
        cHaze: { value: col(th.haze) }, cGround: { value: col(th.haze).multiplyScalar(0.55) },
        sunColor: { value: sun.color.clone().multiplyScalar(sun.intensity * 0.5) }, cloudCover: { value: th.clouds },
        time: { value: 0 }, sunSize: { value: 0.00042 },
      },
    });
    R.register(mat);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    return sky;
  };

  // --- Far mountains (background pass, own fog) ---------------------------------------
  E.makeMountains = function (R, th, center, radius) {
    var noise = Hi.makeNoise(41), group = new THREE.Group();
    var layers = [[radius + 2600, 260, 0], [radius + 4200, 520, 1], [radius + 6600, 900, 2]];
    var base = col(th.mountains);
    layers.forEach(function (Lr) {
      var R0 = Lr[0], H = Lr[1] * (0.25 + th.hills), seg = 256, pos = [], cols = [], idx = [];
      for (var i = 0; i <= seg; i++) {
        var a = i / seg * Math.PI * 2;
        var r = Hi.fbm(noise, i / seg * 24 + Lr[2] * 7, Lr[2] * 3.3, 24, 5);
        var ridge = Math.pow(r, 1.6) * H * 1.9 + H * 0.08;
        var x = center.x + Math.cos(a) * R0, z = center.z + Math.sin(a) * R0;
        pos.push(x, -60, z, x, ridge, z);
        var k = 0.75 + 0.25 * Lr[2] / 2;
        cols.push(base.r * 0.55 * k, base.g * 0.55 * k, base.b * 0.55 * k, base.r * k, base.g * k, base.b * k);
        if (i < seg) { var b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      var m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
      R.register(m);
      var mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = -5 + Lr[2] * -1;
      mesh.frustumCulled = false;
      group.add(mesh);
    });
    return group;
  };

  // City skyline: instanced boxes with lit windows at dusk.
  E.makeCity = function (R, th, center, radius) {
    if (th.city < 0.3) return null;
    var count = Math.round(260 * th.city), s = 1234567;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    var geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    var winTex = Hi.windows();
    winTex.repeat.set(2, 3);
    R.textures.push(winTex);
    var mat = new THREE.MeshLambertMaterial({ color: col('#4b5463'), emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.15 + th.night * 1.6, fog: true });
    R.register(mat);
    var mesh = new THREE.InstancedMesh(geo, mat, count), dummy = new THREE.Object3D();
    var a0 = rnd() * Math.PI * 2, spread = Math.PI * (0.6 + th.city * 0.9);
    for (var i = 0; i < count; i++) {
      var a = a0 + (rnd() - 0.5) * spread, r = radius + 1600 + rnd() * 2600 * (0.6 + th.city * 0.6);
      var w = 40 + rnd() * 70, h = (40 + Math.pow(rnd(), 2.2) * 260) * (0.5 + th.city * 0.6);
      dummy.position.set(center.x + Math.cos(a) * r, -5, center.z + Math.sin(a) * r);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.set(w, h, w * (0.6 + rnd() * 0.8));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.frustumCulled = false;
    return mesh;
  };

  // --- Distance field to the circuit (chamfer transform on the terrain grid) ------------
  function distanceGrid(S, x0, z0, cell, nx, nz) {
    var INF = 1e9, d = new Float32Array(nx * nz);
    for (var k = 0; k < d.length; k++) d[k] = INF;
    for (var i = 0; i < S.length; i++) {
      var s = S[i], gx = (s.x - x0) / cell, gz = (-s.y - z0) / cell;
      var ix = Math.round(gx), iz = Math.round(gz);
      for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) {
        var X = ix + dx, Z = iz + dz;
        if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
        var dd = Math.hypot(x0 + X * cell - s.x, z0 + Z * cell + s.y);
        var j = Z * nx + X;
        if (dd < d[j]) d[j] = dd;
      }
    }
    var c1 = cell, c2 = cell * Math.SQRT2;
    for (var z = 0; z < nz; z++) for (var x = 0; x < nx; x++) {
      var j1 = z * nx + x, v = d[j1];
      if (x > 0) v = Math.min(v, d[j1 - 1] + c1);
      if (z > 0) { v = Math.min(v, d[j1 - nx] + c1); if (x > 0) v = Math.min(v, d[j1 - nx - 1] + c2); if (x < nx - 1) v = Math.min(v, d[j1 - nx + 1] + c2); }
      d[j1] = v;
    }
    for (var z2 = nz - 1; z2 >= 0; z2--) for (var x2 = nx - 1; x2 >= 0; x2--) {
      var j2 = z2 * nx + x2, w = d[j2];
      if (x2 < nx - 1) w = Math.min(w, d[j2 + 1] + c1);
      if (z2 < nz - 1) { w = Math.min(w, d[j2 + nx] + c1); if (x2 < nx - 1) w = Math.min(w, d[j2 + nx + 1] + c2); if (x2 > 0) w = Math.min(w, d[j2 + nx - 1] + c2); }
      d[j2] = w;
    }
    return d;
  }

  function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // --- Terrain --------------------------------------------------------------------------
  E.makeTerrain = function (R, th) {
    var S = CR.Track.samples;
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    S.forEach(function (s) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, -s.y); maxZ = Math.max(maxZ, -s.y); });
    var M = 1100, cell = 20;
    var x0 = Math.floor((minX - M) / cell) * cell, z0 = Math.floor((minZ - M) / cell) * cell;
    var nx = Math.ceil((maxX + M - x0) / cell) + 1, nz = Math.ceil((maxZ + M - z0) / cell) + 1;
    var dist = distanceGrid(S, x0, z0, cell, nx, nz);
    var noise = Hi.makeNoise(7), noise2 = Hi.makeNoise(13);
    var heights = new Float32Array(nx * nz);
    var pos = new Float32Array(nx * nz * 3), colors = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    var tint = th.ground;
    for (var z = 0; z < nz; z++) for (var x = 0; x < nx; x++) {
      var j = z * nx + x, wx = x0 + x * cell, wz = z0 + z * cell, dd = dist[j];
      var edge = Math.min(x, z, nx - 1 - x, nz - 1 - z) / 12;
      var hill = (Hi.fbm(noise, wx / 700, wz / 700, 4096, 4) - 0.35) * 210 + Hi.fbm(noise2, wx / 160, wz / 160, 4096, 3) * 28;
      var h = Math.max(0, hill) * th.hills * smooth(70, 380, dd) * smooth(0, 1, edge);
      h -= 0.06; // just under the road
      heights[j] = h;
      pos[j * 3] = wx; pos[j * 3 + 1] = h; pos[j * 3 + 2] = wz;
      uv[j * 2] = wx / 7; uv[j * 2 + 1] = wz / 7;
      // colour: patchy greens, mowing stripes near the track, drier on hills
      var patch = Hi.fbm(noise2, wx / 90, wz / 90, 4096, 3);
      var stripe = dd < 70 ? ((Math.floor(dd / 7) % 2) ? 1.06 : 0.95) : 1;
      var dry = Math.min(1, h / 140);
      var k = (0.8 + patch * 0.35) * stripe;
      colors[j * 3] = k * tint[0] * (1 + dry * 0.25); colors[j * 3 + 1] = k * tint[1] * (1 - dry * 0.05); colors[j * 3 + 2] = k * tint[2] * (1 - dry * 0.2);
    }
    var idx = new Uint32Array((nx - 1) * (nz - 1) * 6), q = 0;
    for (var zz = 0; zz < nz - 1; zz++) for (var xx = 0; xx < nx - 1; xx++) {
      var a = zz * nx + xx, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    var mat = R.std({ map: R.texGrass.map, normalMap: R.texGrass.normal, normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }, 'terrain');
    var mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    // Outer ground to the horizon (fogged), a ring around the grid.
    var outer = new THREE.RingGeometry(10, 14000, 48, 1);
    outer.rotateX(-Math.PI / 2);
    var cx = x0 + (nx - 1) * cell / 2, cz = z0 + (nz - 1) * cell / 2;
    var rIn = Math.min(nx, nz) * cell / 2 - cell * 3;
    var p = outer.attributes.position;
    for (var v = 0; v < p.count; v++) {
      var px = p.getX(v), pz = p.getZ(v), len = Math.hypot(px, pz);
      if (len < 100) { p.setX(v, px / len * rIn); p.setZ(v, pz / len * rIn); }
      p.setY(v, -0.3);
    }
    outer.translate(cx, 0, cz);
    var outerMat = R.std({ color: new THREE.Color(0.17 * tint[0], 0.27 * tint[1], 0.12 * tint[2]), roughness: 1, metalness: 0 }, 'outerground');
    var outerMesh = new THREE.Mesh(outer, outerMat);
    outerMesh.matrixAutoUpdate = false;
    outerMesh.receiveShadow = false;
    function heightAt(wx2, wz2) {
      var fx = (wx2 - x0) / cell, fz = (wz2 - z0) / cell;
      var ix = Math.max(0, Math.min(nx - 2, Math.floor(fx))), iz = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
      var tx = Math.max(0, Math.min(1, fx - ix)), tz = Math.max(0, Math.min(1, fz - iz));
      var h00 = heights[iz * nx + ix], h10 = heights[iz * nx + ix + 1], h01 = heights[(iz + 1) * nx + ix], h11 = heights[(iz + 1) * nx + ix + 1];
      return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
    }
    function distAt(wx2, wz2) {
      var ix = Math.round((wx2 - x0) / cell), iz = Math.round((wz2 - z0) / cell);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return 1e9;
      return dist[iz * nx + ix];
    }
    return { mesh: mesh, outer: outerMesh, heightAt: heightAt, distAt: distAt, bounds: { x0: x0, z0: z0, x1: x0 + (nx - 1) * cell, z1: z0 + (nz - 1) * cell },
      center: new THREE.Vector3(cx, 0, cz), radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 };
  };

  // --- Trees and bushes (instanced, grouped in cells for culling) ------------------------
  function treeGeometry(kind) {
    var parts = [];
    function add(g, r, gC, b) {
      var n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gC; c[i * 3 + 2] = b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      if (g.index) g = g.toNonIndexed();
      g.deleteAttribute('uv');
      parts.push(g);
    }
    // Low-poly on purpose (~40-60 triangles): thousands are drawn, and again
    // into each shadow cascade.
    if (kind === 'conifer') {
      add(new THREE.CylinderGeometry(0.18, 0.28, 3, 5, 1, true).translate(0, 1.5, 0), 0.25, 0.17, 0.1);
      add(new THREE.ConeGeometry(2.4, 5.5, 6, 1, true).translate(0, 4.6, 0), 0.09, 0.22, 0.1);
      add(new THREE.ConeGeometry(1.8, 4.5, 6, 1, true).translate(0, 7.4, 0), 0.1, 0.25, 0.11);
      add(new THREE.ConeGeometry(1.1, 3.2, 6, 1, true).translate(0, 9.8, 0), 0.11, 0.27, 0.12);
    } else if (kind === 'palm') {
      add(new THREE.CylinderGeometry(0.16, 0.26, 9, 5, 1, true).translate(0, 4.5, 0), 0.42, 0.34, 0.24);
      for (var k = 0; k < 7; k++) {
        var leaf = new THREE.ConeGeometry(0.5, 4.2, 3);
        leaf.rotateZ(Math.PI / 2 + 0.35).translate(2.0, 8.6, 0).rotateY(k / 7 * Math.PI * 2);
        add(leaf, 0.16, 0.36, 0.12);
      }
    } else if (kind === 'bush') {
      add(new THREE.IcosahedronGeometry(1.2, 0).scale(1.3, 0.75, 1.1).translate(0, 0.65, 0), 0.13, 0.27, 0.1);
      add(new THREE.IcosahedronGeometry(0.9, 0).translate(0.8, 0.55, 0.3), 0.15, 0.3, 0.11);
    } else {
      add(new THREE.CylinderGeometry(0.2, 0.32, 3.6, 5, 1, true).translate(0, 1.8, 0), 0.3, 0.21, 0.13);
      add(new THREE.IcosahedronGeometry(2.6, 0).scale(1, 0.85, 1).translate(0, 5.2, 0), 0.14, 0.3, 0.1);
      add(new THREE.IcosahedronGeometry(1.8, 0).translate(1.2, 6.4, 0.6), 0.16, 0.33, 0.12);
    }
    var g = Hi.Track.merge(parts);
    g.computeVertexNormals();
    return g;
  }

  E.makeTrees = function (R, th, terrain) {
    var b = terrain.bounds, s = 987654;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    var noise = Hi.makeNoise(23);
    var kinds = th.trees === 'mixed' ? ['deciduous', 'conifer'] : [th.trees];
    var CELL = 420, cells = {}, maxTrees = Math.round(9000 * th.forest), maxBush = Math.round(2400 * Math.max(0.25, th.forest));
    function put(kind, x, z, scale) {
      var key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL) + ',' + kind;
      var c = cells[key] || (cells[key] = { kind: kind, list: [], cx: 0, cz: 0 });
      c.list.push([x, terrain.heightAt(x, z) - 0.1, z, scale, rnd() * Math.PI * 2, 0.8 + rnd() * 0.35]);
    }
    var tries = 0, placed = 0;
    while (placed < maxTrees && tries < maxTrees * 8) {
      tries++;
      var x = b.x0 + rnd() * (b.x1 - b.x0), z = b.z0 + rnd() * (b.z1 - b.z0);
      var d = terrain.distAt(x, z);
      if (d < 62 || d > 1500) continue;
      var dens = Hi.fbm(noise, x / 260, z / 260, 4096, 3);
      if (dens < 0.5 - th.forest * 0.12 + d / 9000) continue;
      put(kinds[(rnd() * kinds.length) | 0], x, z, 0.75 + rnd() * 0.7);
      placed++;
    }
    var pb = 0;
    tries = 0;
    while (pb < maxBush && tries < maxBush * 10) {
      tries++;
      var bx = b.x0 + rnd() * (b.x1 - b.x0), bz = b.z0 + rnd() * (b.z1 - b.z0), bd = terrain.distAt(bx, bz);
      if (bd < 46 || bd > 260) continue;
      put('bush', bx, bz, 0.7 + rnd() * 0.8);
      pb++;
    }
    var geos = {}, mat = R.std({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 }, 'tree');
    var dummy = new THREE.Object3D(), color = new THREE.Color(), list = [];
    Object.keys(cells).forEach(function (key) {
      var c = cells[key];
      var geo = geos[c.kind] || (geos[c.kind] = treeGeometry(c.kind));
      // shuffle so any prefix is an even thinning (detail tiers)
      for (var i = c.list.length - 1; i > 0; i--) { var j = (rnd() * (i + 1)) | 0, t = c.list[i]; c.list[i] = c.list[j]; c.list[j] = t; }
      var mesh = new THREE.InstancedMesh(geo, mat, c.list.length);
      var sx = 0, sz = 0;
      c.list.forEach(function (e, k) {
        dummy.position.set(e[0], e[1], e[2]);
        dummy.rotation.set(0, e[4], 0);
        dummy.scale.set(e[3], e[3] * (0.85 + (k % 7) * 0.05), e[3]);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
        color.setRGB(e[5], e[5] * (0.95 + (k % 5) * 0.025), e[5] * 0.9);
        mesh.setColorAt(k, color);
        sx += e[0]; sz += e[2];
      });
      mesh.frustumCulled = false;
      mesh.castShadow = c.kind !== 'bush';
      mesh.receiveShadow = true;
      var center = new THREE.Vector3(sx / c.list.length, 0, sz / c.list.length);
      list.push({ mesh: mesh, full: c.list.length, kind: c.kind, sphere: new THREE.Sphere(center, CELL * 0.75 + 14) });
    });
    return { cells: list, geometries: geos };
  };

  // --- Grandstands -------------------------------------------------------------------------
  var STAND = { depth: 11, rise: 8, parapet: 1.6, back: 11.6, roof: 12.4, roofFront: 2.2, gap: 3.5 };
  var GA = { depth: 6, rise: 2.8, parapet: 0.9, back: 6.2, roof: 3.1, gap: 3.5, ga: true };
  var SHIRTS = ['#d63a3a', '#f2f2f2', '#2b5fd9', '#ffd23f', '#1e9a52', '#ff8a1f', '#14171c', '#c8102e', '#7a4bd1', '#0fa3a3', '#e86aa6', '#9aa3ad'];

  // Seating rows of a stand: [{d0, d1, h}] tread from d0 to d1 at height h.
  function rowsOf(Dm) {
    var rows = Math.max(2, Math.floor((Dm.depth - 0.5) / 0.95)), out = [];
    for (var r = 0; r < rows; r++) {
      var d0 = 0.5 + r * (Dm.depth - 0.5) / rows, d1 = 0.5 + (r + 1) * (Dm.depth - 0.5) / rows;
      out.push({ d0: d0, d1: d1, h: Dm.parapet + (Dm.rise - Dm.parapet) * (r + 0.5) / rows });
    }
    return out;
  }

  // Crowd instance: body + head, with a 'skin' flag for the head.
  function personGeometry() {
    var body = new THREE.BoxGeometry(0.46, 0.62, 0.3).translate(0, 0.31, 0);
    var head = new THREE.BoxGeometry(0.22, 0.24, 0.22).translate(0, 0.76, 0.02);
    [body, head].forEach(function (g, k) {
      var n = g.attributes.position.count, sk = new Float32Array(n);
      for (var i = 0; i < n; i++) sk[i] = k;
      g.setAttribute('skin', new THREE.BufferAttribute(sk, 1));
      g.deleteAttribute('uv');
    });
    var g = Hi.Track.merge([body, head]);
    return g;
  }

  function crowdHook(uniforms) {
    return function (shader) {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float skin;\nuniform float uTime;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n vColor = mix(vColor, vec3(0.75, 0.45, 0.3), skin);\n#endif')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          '{ float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);\n' +
          '  float jump = step(0.82, ph) * max(0.0, sin(uTime * (7.0 + ph * 3.0) + ph * 40.0)) * 0.22;\n' +
          '  float sway = sin(uTime * 2.2 + ph * 30.0) * 0.04 * step(ph, 0.82);\n' +
          '  transformed.y += jump; transformed.x += sway * transformed.y; }');
    };
  }

  function flagHook(uniforms) {
    return function (shader) {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          '{ float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(4.898, 7.23))) * 437.5453);\n' +
          '  float w = max(0.0, position.x) / 0.9; transformed.z += sin(uTime * 6.0 + position.x * 5.0 + ph * 20.0) * 0.16 * w;\n' +
          '  transformed.x += sin(uTime * 1.3 + ph * 9.0) * 0.25 * step(0.01, position.y); }');
    };
  }

  E.makeStands = function (R, th) {
    var S = CR.Track.samples, n = S.length, sp = CR.Config.TRACK_SAMPLE_SPACING;
    var tr = CR.Tracks.list[CR.Main.trackIndex] || CR.Tracks.list[0];
    var Dist = Hi.Track.cumulative(S);
    var stands = CR.Renderer.standsFor(S, tr.realName) || [];
    R.standSpans = stands;
    var group = new THREE.Group();
    var concreteMat = R.std({ map: R.texConcrete, color: 0x9aa1ab, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }, 'standconcrete');
    var seatMat = R.std({ map: R.texCrowd, roughness: 0.8, metalness: 0, color: 0xffffff }, 'seats');
    var darkMat = R.std({ color: 0x23282f, roughness: 0.7, metalness: 0.3 }, 'standdark');
    var roofMat = R.std({ color: 0x3a414c, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }, 'roof');
    var steelMat = R.std({ color: 0x8d949e, roughness: 0.4, metalness: 0.85 }, 'steel');
    var fasciaMats = {};
    function fascia(hex) { return fasciaMats[hex] || (fasciaMats[hex] = R.std({ color: new THREE.Color(hex), roughness: 0.45, metalness: 0.2 }, 'fascia')); }
    var geos = { concrete: [], seats: [], dark: [], roof: [], steel: [] }, fasciaGeo = {};
    var crowd = [], uniforms = { uTime: { value: 0 } };
    var personGeo = personGeometry();
    var crowdMat = new THREE.MeshLambertMaterial({ vertexColors: false });
    crowdMat.onBeforeCompile = crowdHook(uniforms);
    crowdMat.customProgramCacheKey = function () { return 'crowd'; };
    R.register(crowdMat);
    var flagGeo = new THREE.PlaneGeometry(0.9, 0.55, 6, 1).translate(0.45, 1.5, 0);
    var pole = new THREE.CylinderGeometry(0.015, 0.015, 1.8, 3).translate(0, 0.9, 0);
    pole.deleteAttribute('uv'); flagGeo.deleteAttribute('uv');
    var flagG = Hi.Track.merge([flagGeo.toNonIndexed(), pole.toNonIndexed()]);
    var flagMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    flagMat.onBeforeCompile = flagHook(uniforms);
    flagMat.customProgramCacheKey = function () { return 'flag'; };
    R.register(flagMat);
    var seed = 4242;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var dummy = new THREE.Object3D(), color = new THREE.Color();

    stands.forEach(function (st) {
      var Dm = st.ga ? GA : STAND, rows = rowsOf(Dm), side = st.side;
      var P = function (s, d) { var o = side * (st.off + d); return [s.x + s.nx * o, s.y + s.ny * o]; };
      // profile across the stand (d from the front, h) for strips
      function addStrip(list, prof, opts) {
        var g = Hi.Track.strip(S, Dist, function () {
          return prof.map(function (q) { return [side * (st.off + q[0]), q[1]]; });
        }, Object.assign({ from: st.i0, count: st.len, uv: 'world', uScale: 3, vScale: 3, flip: side > 0 }, opts || {}));
        list.push(g);
      }
      // front parapet (track side), with a fascia stripe
      addStrip(geos.dark, [[0, 0], [0, Dm.parapet], [0, Dm.parapet], [0.35, Dm.parapet]], { gap: function (k) { return k === 1; } });
      (fasciaGeo[st.fascia] = fasciaGeo[st.fascia] || []);
      addStrip(fasciaGeo[st.fascia], [[-0.03, Dm.parapet - 0.55], [-0.03, Dm.parapet - 0.15]]);
      // stepped seating (riser + tread per row)
      var prof = [[0.35, Dm.parapet]];
      rows.forEach(function (r) { prof.push([r.d0, r.h - 0.45], [r.d0, r.h], [r.d0, r.h], [r.d1, r.h]); });
      var seatProf = [];
      for (var k = 0; k < prof.length - 1; k++) seatProf.push(prof[k], prof[k + 1]);
      addStrip(geos.seats, seatProf, { gap: function (q) { return q % 2 === 1; }, uScale: 1.9, vScale: 6 });
      // back wall (both faces) and roof
      addStrip(geos.concrete, [[Dm.back, 0], [Dm.back, Dm.ga ? Dm.rise + 0.4 : Dm.roof]], {});
      addStrip(geos.concrete, [[Dm.back + 0.3, Dm.ga ? Dm.rise + 0.4 : Dm.roof], [Dm.back + 0.3, 0]], {});
      if (!st.ga) {
        addStrip(geos.roof, [[Dm.roofFront, Dm.roof], [Dm.back + 0.6, Dm.roof + 0.6]], {});
        addStrip(fasciaGeo[st.fascia], [[Dm.roofFront, Dm.roof - 0.9], [Dm.roofFront, Dm.roof + 0.1]], {});
      }
      // ends: closed side walls (cross-section polygons)
      [0, st.len].forEach(function (j, e) {
        var s = S[(st.i0 + j) % n];
        var outline = [[0, 0], [0, Dm.parapet], [Dm.depth, Dm.rise], [Dm.back, st.ga ? Dm.rise + 0.4 : Dm.roof], [Dm.back + 0.3, st.ga ? Dm.rise + 0.4 : Dm.roof], [Dm.back + 0.3, 0]];
        var pos = [], tri = THREE.ShapeUtils.triangulateShape(outline.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), []);
        tri.forEach(function (t) {
          var order = (e === 0) === (side > 0) ? [t[0], t[2], t[1]] : t;
          order.forEach(function (ix) { var w = P(s, outline[ix][0]); pos.push(w[0], outline[ix][1], -w[1]); });
        });
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
        g.computeVertexNormals();
        geos.concrete.push(g);
      });
      // roof columns along the back and aisle stairs every ~20 m
      for (var c = 0; c <= st.len; c += 5) {
        var s2 = S[(st.i0 + c) % n];
        if (!st.ga) {
          var colP = P(s2, Dm.back - 0.25);
          var cg = new THREE.BoxGeometry(0.35, Dm.roof, 0.35).translate(colP[0], Dm.roof / 2, -colP[1]);
          geos.steel.push(cg);
          var fp = P(s2, Dm.roofFront + 0.6);
          var strut = new THREE.BoxGeometry(0.2, 0.2, Dm.back - Dm.roofFront).translate(0, 0, 0);
          strut.rotateY(Math.atan2(s2.nx * side, -s2.ny * side));
          var mp = P(s2, (Dm.back + Dm.roofFront) / 2);
          strut.translate(mp[0], Dm.roof - 0.25, -mp[1]);
          geos.steel.push(strut);
          void fp;
        }
        if (c % 5 === 0 && c > 0 && c < st.len) {
          rows.forEach(function (r) {
            var a = P(s2, (r.d0 + r.d1) / 2);
            var stp = new THREE.BoxGeometry(1.1, 0.05, r.d1 - r.d0);
            stp.rotateY(Math.atan2(s2.nx * side, -s2.ny * side));
            stp.translate(a[0], r.h + 0.03, -a[1]);
            geos.concrete.push(stp);
          });
        }
      }
      // crowd: one person per seat (0.68 m apart), some empty seats, a few flags
      var list = [], flags = [];
      var lenM = st.len * sp;
      rows.forEach(function (r) {
        for (var t = 0.4; t < lenM - 0.3; t += 0.68) {
          if (rnd() < 0.14) continue;
          var kk = t / sp, i = Math.floor(kk), f = kk - i;
          var a = S[(st.i0 + i) % n], b2 = S[(st.i0 + i + 1) % n];
          var dd = (r.d0 + r.d1) / 2 + (rnd() - 0.5) * 0.15;
          var pa = P(a, dd), pb = P(b2, dd);
          var x = pa[0] + (pb[0] - pa[0]) * f, y = pa[1] + (pb[1] - pa[1]) * f;
          var face = Math.atan2(-a.nx * side, a.ny * side); // towards the track
          list.push([x, r.h, -y, face, (rnd() * SHIRTS.length) | 0]);
          if (rnd() < 0.025) flags.push([x, r.h + 0.6, -y, face + Math.PI / 2, (rnd() * SHIRTS.length) | 0]);
        }
      });
      for (var i2 = list.length - 1; i2 > 0; i2--) { var j2 = (rnd() * (i2 + 1)) | 0, tt = list[i2]; list[i2] = list[j2]; list[j2] = tt; }
      if (list.length) {
        var im = new THREE.InstancedMesh(personGeo, crowdMat, list.length);
        var cx = 0, cz = 0;
        list.forEach(function (e, k) {
          dummy.position.set(e[0], e[1], e[2]);
          dummy.rotation.set(0, e[3], 0);
          dummy.scale.set(1, 0.9 + (k % 5) * 0.05, 1);
          dummy.updateMatrix();
          im.setMatrixAt(k, dummy.matrix);
          color.set(SHIRTS[e[4]]).convertSRGBToLinear();
          im.setColorAt(k, color);
          cx += e[0]; cz += e[2];
        });
        im.frustumCulled = false;
        var item = { mesh: im, full: list.length, sphere: new THREE.Sphere(new THREE.Vector3(cx / list.length, 4, cz / list.length), lenM / 2 + 14) };
        if (flags.length) {
          var fm = new THREE.InstancedMesh(flagG, flagMat, flags.length);
          flags.forEach(function (e, k) {
            dummy.position.set(e[0], e[1], e[2]);
            dummy.rotation.set(0, e[3], 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            fm.setMatrixAt(k, dummy.matrix);
            color.set(SHIRTS[e[4]]).convertSRGBToLinear();
            fm.setColorAt(k, color);
          });
          fm.frustumCulled = false;
          item.flags = fm;
        }
        crowd.push(item);
      }
    });

    function add(list, mat, cast) {
      var g = Hi.Track.merge(list);
      if (!g) return;
      var m = new THREE.Mesh(g, mat);
      m.castShadow = !!cast; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      group.add(m);
    }
    add(geos.concrete, concreteMat, true);
    add(geos.seats, seatMat, false);
    add(geos.dark, darkMat, true);
    add(geos.roof, roofMat, true);
    add(geos.steel, steelMat, true);
    Object.keys(fasciaGeo).forEach(function (hex) { add(fasciaGeo[hex], fascia(hex), false); });
    personGeo.userData.shared = true;
    return { group: group, crowd: crowd, uniforms: uniforms, personGeo: personGeo, flagGeo: flagG };
  };
})();

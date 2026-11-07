// world.js — the rally stage on screen (three.js).
// Rendering only: nothing here changes the physics.
//  * Terrain: one mesh per 128 m chunk with two LODs (4 m and 8 m grid),
//    switched by distance; three.js frustum-culls each chunk.
//  * Road: ribbon pieces of 200 m (culled), gravel / mud vertex tint over a
//    procedural gravel texture with wheel ruts.
//  * Forest: InstancedMesh per 256 m zone and per LOD (detailed pine near,
//    one cone far). Instances are sorted by their seeded `u`, so the
//    vegetation density is just the instance count (no rebuild). Zones are
//    culled against the camera frustum by hand (an InstancedMesh's own
//    bounds do not cover its instances).
//  * Grass tufts, rocks, rockfall boulders, marker posts: instanced.
//  * Dust / mud particles: a fixed pool of points (no allocation per frame).
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var T = RL.Track, D = RL.Data;

  var W = {
    renderer: null, scene: null, stage: null, sun: null, hemi: null, gfx: null,
    zones: [], chunks: [], roadPieces: [], frustum: null, stats: { calls: 0, tris: 0 },
  };
  var tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
  var projM = new THREE.Matrix4();

  W.init = function (canvas) {
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = THREE.sRGBEncoding;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    W.renderer = r;
    W.scene = new THREE.Scene();
    W.scene.background = new THREE.Color(0xb7c9d6);
    W.scene.fog = new THREE.Fog(0xb7c9d6, 120, 900);
    W.hemi = new THREE.HemisphereLight(0xdfeaf2, 0x4a4630, 0.62); W.scene.add(W.hemi);
    var sun = new THREE.DirectionalLight(0xfff1dc, 0.95);
    sun.position.set(120, 220, 80);
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 600; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    W.scene.add(sun); W.scene.add(sun.target); W.sun = sun;
    W.sky = makeSky(); W.scene.add(W.sky);
    W.frustum = new THREE.Frustum();
    W.particles = makeParticles(1200); W.scene.add(W.particles.points);
    return W;
  };

  function makeSky() {
    var g = new THREE.SphereGeometry(1, 24, 12), col = [], pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i), t = Math.max(0, y);
      var c = new THREE.Color(0xb7c9d6).lerp(new THREE.Color(0x5d8fc4), Math.pow(t, 0.6));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1; m.frustumCulled = false;
    return m;
  }

  // ------------------------------------------------------------------
  // Graphics settings: resolution, view distance, shadows, particles,
  // vegetation. Called at start and whenever a setting changes.
  W.applyGraphics = function (gfx) {
    W.gfx = gfx;
    var r = W.renderer, dpr = Math.min(2, G.devicePixelRatio || 1);
    r.setPixelRatio(Math.max(0.35, dpr * gfx.resolution));
    r.shadowMap.enabled = !!gfx.shadows;
    W.sun.castShadow = !!gfx.shadows;
    var sz = gfx.shadows ? (gfx.resolution >= 0.9 ? 2048 : 1024) : 512;
    if (W.sun.shadow.mapSize.x !== sz) { W.sun.shadow.mapSize.set(sz, sz); if (W.sun.shadow.map) { W.sun.shadow.map.dispose(); W.sun.shadow.map = null; } }
    W.scene.fog.near = gfx.viewDistance * 0.18; W.scene.fog.far = gfx.viewDistance;
    W.zones.forEach(function (z) { setZoneCounts(z); });
    W.particles.max = Math.round(W.particles.cap * gfx.particles);
    if (W.vehicle) W.vehicle.blob.visible = !gfx.shadows;
    // materials must recompile when shadows toggle
    W.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); });
  };

  W.resize = function (w, h, cam) {
    W.renderer.setSize(w, h, false);
    if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  };

  // ------------------------------------------------------------------
  // Build / dispose a stage
  W.clear = function () {
    if (!W.stage) return;
    W.scene.remove(W.stage);
    W.stage.traverse(function (o) {
      if (o.geometry && !o.geometry.shared) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (!m.shared) { if (m.map && !m.map.shared) m.map.dispose(); m.dispose(); } });
    });
    W.stage = null; W.zones = []; W.chunks = []; W.roadPieces = [];
    W.particles.reset();
  };

  W.build = function (route, gfx) {
    W.clear();
    var stage = new THREE.Group(); W.stage = stage; W.scene.add(stage);
    W.route = route;
    buildTerrain(route, stage);
    buildRoad(route, stage);
    buildProps(route, stage);
    buildGates(route, stage);
    W.applyGraphics(gfx || W.gfx || D.GRAPHICS.high);
  };

  // ---- terrain
  var terrainMat = null;
  function buildTerrain(route, stage) {
    var T0 = route.terrain, N = T0.CHUNK + 1, size = T0.size, noise = T0.noise;
    terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var cGrass = new THREE.Color(0x4f6b2f), cDry = new THREE.Color(0x7a7a48), cDirt = new THREE.Color(0x6b5a40), cRock = new THREE.Color(0x77736b), c = new THREE.Color();
    T0.chunks.forEach(function (ch) {
      var lods = [];
      [1, 2].forEach(function (step) {
        var n = (N - 1) / step + 1, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
        for (var b = 0; b < n; b++) for (var a = 0; a < n; a++) {
          var ia = a * step, ib = b * step, h = ch.h[ib * N + ia];
          var x = ch.cx * size + ia * T0.CELL, z = ch.cz * size + ib * T0.CELL;
          // keep the terrain under the road surface (no poking through)
          var L = null, dd = 1e9;
          route.hash.near(x, z, 10, function (j) { var dx = route.x[j] - x, dz = route.z[j] - z, d = dx * dx + dz * dz; if (d < dd) { dd = d; L = j; } });
          if (L != null && dd < Math.pow(route.w[L] / 2 + 1.6, 2)) h = Math.min(h, route.y[L] - 0.18);
          var k = (b * n + a) * 3;
          pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
          // colour: grass with dry patches, dirt near the road, rock on steep bits
          var nz = noise.fbm(x / 40, z / 40, 2);
          c.copy(cGrass).lerp(cDry, Math.max(0, nz) * 0.9);
          if (dd < 100) c.lerp(cDirt, 1 - Math.sqrt(dd) / 10);
          var hx = ch.h[ib * N + Math.min(N - 1, ia + 1)] - ch.h[ib * N + Math.max(0, ia - 1)];
          var hz = ch.h[Math.min(N - 1, ib + 1) * N + ia] - ch.h[Math.max(0, ib - 1) * N + ia];
          var slope = Math.hypot(hx, hz) / (2 * T0.CELL);
          if (slope > 0.55) c.lerp(cRock, Math.min(1, (slope - 0.55) * 2));
          col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
        }
        for (b = 0; b < n - 1; b++) for (a = 0; a < n - 1; a++) {
          var i0 = b * n + a, i1 = i0 + 1, i2 = i0 + n, i3 = i2 + 1;
          idx.push(i0, i2, i3, i0, i3, i1); // split along 00-11 (matches terrainHeight)
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
        var m = new THREE.Mesh(g, terrainMat); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
        m.visible = step === 1;
        stage.add(m); lods.push(m);
      });
      W.chunks.push({ cx: (ch.cx + 0.5) * size, cz: (ch.cz + 0.5) * size, lods: lods });
    });
  }

  // ---- road
  function gravelTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d'), img = g.createImageData(256, 256), d = img.data, r = RL.Rng.stream('tex', 'gravel');
    for (var y = 0; y < 256; y++) for (var x = 0; x < 256; x++) {
      var k = (y * 256 + x) * 4, n = 175 + (r.next() - 0.5) * 70;
      // two wheel ruts (darker, smoother) at u = 0.36 and 0.64
      var u = x / 256, rut = Math.exp(-Math.pow((u - 0.36) / 0.045, 2)) + Math.exp(-Math.pow((u - 0.64) / 0.045, 2));
      n = n * (1 - 0.22 * rut) + (r.next() < 0.03 ? -60 : 0);
      d[k] = d[k + 1] = d[k + 2] = Math.max(0, Math.min(255, n)); d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  }
  function buildRoad(route, stage) {
    var tex = gravelTexture();
    var mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
    var gC = D.SURFACES.gravel.color, mC = D.SURFACES.mud.color;
    var PIECE = 100, cols = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]; // shoulder, edge, .. centre .. edge, shoulder
    for (var s0 = 0; s0 < route.n - 1; s0 += PIECE) {
      var s1 = Math.min(route.n - 1, s0 + PIECE), rows = s1 - s0 + 1, nc = cols.length;
      var pos = new Float32Array(rows * nc * 3), uv = new Float32Array(rows * nc * 2), col = new Float32Array(rows * nc * 3), idx = [];
      for (var r = 0; r < rows; r++) {
        var i = s0 + r, h = route.h[i], nx = -Math.sin(h), nz = Math.cos(h), w2 = route.w[i] / 2;
        var mud = 0; for (var q = -3; q <= 3; q++) mud += route.surf[Math.max(0, Math.min(route.n - 1, i + q))]; mud /= 7;
        for (var c = 0; c < nc; c++) {
          var f = cols[c], off = Math.abs(f) <= 1 ? f * w2 : Math.sign(f) * (w2 + 1.3);
          var x = route.x[i] + nx * off, z = route.z[i] + nz * off, y;
          if (Math.abs(f) <= 1) y = route.y[i] + 0.06 * (1 - Math.abs(f)) + 0.035;
          else y = Math.min(route.y[i] - 0.05, T.terrainHeight(route, x, z) + 0.05);
          var k = (r * nc + c) * 3;
          pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
          uv[(r * nc + c) * 2] = (f + 1.5) / 3; uv[(r * nc + c) * 2 + 1] = i * route.SP / 7;
          var edge = Math.abs(f) > 1 ? 0.75 : 1;
          col[k] = (gC[0] + (mC[0] - gC[0]) * mud) * edge * 1.45; col[k + 1] = (gC[1] + (mC[1] - gC[1]) * mud) * edge * 1.45; col[k + 2] = (gC[2] + (mC[2] - gC[2]) * mud) * edge * 1.45;
        }
      }
      for (r = 0; r < rows - 1; r++) for (c = 0; c < nc - 1; c++) {
        var a = r * nc + c, b = a + 1, d = a + nc, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      var m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      stage.add(m); W.roadPieces.push(m);
    }
  }

  // ---- props (instanced per zone)
  var ZONE = 256;
  function mergeColored(parts) {
    // parts: [{geo, color, matrix}] -> one BufferGeometry with vertex colors
    var pos = [], nor = [], col = [], c = new THREE.Color();
    parts.forEach(function (p) {
      var g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.matrix || new THREE.Matrix4());
      g.computeVertexNormals();
      var P = g.attributes.position, Nn = g.attributes.normal; c.set(p.color);
      for (var i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i));
        var sh = p.shade ? 0.85 + 0.15 * (P.getY(i) / 10) : 1; col.push(c.r * sh, c.g * sh, c.b * sh);
      }
      g.dispose(); p.geo.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  function tr(x, y, z) { return new THREE.Matrix4().makeTranslation(x, y, z); }
  var GEO = null;
  function propGeometries() {
    if (GEO) return GEO;
    GEO = {
      pineNear: mergeColored([
        { geo: new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6), color: 0x4a3524, matrix: tr(0, 1.2, 0) },
        { geo: new THREE.ConeGeometry(2.3, 4.2, 8), color: 0x22401f, matrix: tr(0, 3.6, 0), shade: true },
        { geo: new THREE.ConeGeometry(1.8, 3.6, 8), color: 0x2a4c25, matrix: tr(0, 5.6, 0), shade: true },
        { geo: new THREE.ConeGeometry(1.2, 3.0, 8), color: 0x31572b, matrix: tr(0, 7.5, 0), shade: true },
      ]),
      pineFar: mergeColored([
        { geo: new THREE.CylinderGeometry(0.2, 0.2, 2.2, 4), color: 0x4a3524, matrix: tr(0, 1.1, 0) },
        { geo: new THREE.ConeGeometry(2.2, 7.4, 5), color: 0x274722, matrix: tr(0, 5.2, 0) },
      ]),
      broadNear: mergeColored([
        { geo: new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6), color: 0x4d3a28, matrix: tr(0, 1.6, 0) },
        { geo: new THREE.IcosahedronGeometry(2.4, 1), color: 0x3d5e2a, matrix: tr(0, 4.6, 0) },
        { geo: new THREE.IcosahedronGeometry(1.6, 1), color: 0x47693a, matrix: tr(0.9, 5.8, 0.4) },
      ]),
      broadFar: mergeColored([
        { geo: new THREE.CylinderGeometry(0.22, 0.22, 3, 4), color: 0x4d3a28, matrix: tr(0, 1.5, 0) },
        { geo: new THREE.IcosahedronGeometry(2.6, 0), color: 0x3f602c, matrix: tr(0, 4.8, 0) },
      ]),
      rock: mergeColored([{ geo: new THREE.DodecahedronGeometry(1, 0), color: 0x85817a }]),
      grass: (function () {
        var p = [];
        for (var i = 0; i < 3; i++) { var g = new THREE.PlaneGeometry(0.9, 0.55); var m = new THREE.Matrix4().makeRotationY(i * Math.PI / 3).multiply(tr(0, 0.27, 0)); p.push({ geo: g, color: i % 2 ? 0x5c7a34 : 0x6d8a3c, matrix: m }); }
        return mergeColored(p);
      })(),
      post: mergeColored([
        { geo: new THREE.BoxGeometry(0.12, 1.0, 0.12), color: 0xeeeeee, matrix: tr(0, 0.5, 0) },
        { geo: new THREE.BoxGeometry(0.13, 0.16, 0.13), color: 0xd01e1e, matrix: tr(0, 0.86, 0) },
      ]),
    };
    for (var k in GEO) GEO[k].shared = true;
    return GEO;
  }
  var propMat = null, grassMat = null;
  function buildProps(route, stage) {
    var geo = propGeometries();
    propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    var zones = new Map();
    function zoneOf(x, z) {
      var k = Math.floor(x / ZONE) + ',' + Math.floor(z / ZONE), zz = zones.get(k);
      if (!zz) { zz = { trees: [[], []], rocks: [], grass: [], minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, minY: 1e9, maxY: -1e9 }; zones.set(k, zz); }
      zz.minX = Math.min(zz.minX, x); zz.maxX = Math.max(zz.maxX, x); zz.minZ = Math.min(zz.minZ, z); zz.maxZ = Math.max(zz.maxZ, z);
      return zz;
    }
    route.trees.forEach(function (t) { var z = zoneOf(t.x, t.z); z.trees[t.kind].push(t); z.minY = Math.min(z.minY, t.y); z.maxY = Math.max(z.maxY, t.y + 10 * t.s); });
    route.rocks.forEach(function (r) { var z = zoneOf(r.x, r.z); z.rocks.push(r); z.minY = Math.min(z.minY, r.y); z.maxY = Math.max(z.maxY, r.y + 2); });
    // grass tufts near the road (seeded)
    var gr = RL.Rng.stream(route.seed, 'grass');
    for (var s = 0; s < route.total; s += 3) {
      var i = Math.min(route.n - 1, Math.floor(s / route.SP)), h = route.h[i];
      for (var k = 0; k < 2; k++) {
        var side = gr.sign(), off = route.w[i] / 2 + gr.range(1.8, 18), along = gr.range(-1.5, 1.5);
        var x = route.x[i] + Math.cos(h) * along - Math.sin(h) * off * side, z = route.z[i] + Math.sin(h) * along + Math.cos(h) * off * side;
        var L = T.locate(route, x, z, i, 6);
        if (Math.abs(L.lat) < L.w / 2 + 1.2) continue;
        var y = T.terrainHeight(route, x, z);
        var zz = zoneOf(x, z); zz.grass.push({ x: x, y: y, z: z, s: gr.range(0.7, 1.5), rot: gr.range(0, 6.28), u: gr.next() });
      }
    }
    zones.forEach(function (z) {
      z.cx = (z.minX + z.maxX) / 2; z.cz = (z.minZ + z.maxZ) / 2; z.cy = (z.minY + z.maxY) / 2;
      z.radius = Math.hypot(z.maxX - z.minX, z.maxZ - z.minZ, z.maxY - z.minY) / 2 + 12;
      z.sphere = new THREE.Sphere(new THREE.Vector3(z.cx, z.cy, z.cz), z.radius);
      z.meshes = [];
      function inst(list, g, mat, shadow, scaleFn) {
        if (!list.length) return null;
        list.sort(function (a, b) { return a.u - b.u; });
        var m = new THREE.InstancedMesh(g, mat, list.length);
        list.forEach(function (o, n) {
          tmpP.set(o.x, o.y - 0.15, o.z); tmpE.set(0, o.rot, 0); tmpQ.setFromEuler(tmpE);
          var sc = scaleFn(o); tmpS.set(sc[0], sc[1], sc[2]);
          tmpM.compose(tmpP, tmpQ, tmpS); m.setMatrixAt(n, tmpM);
        });
        m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = !shadow;
        m.userData.list = list; stage.add(m); z.meshes.push(m);
        return m;
      }
      var tsc = function (o) { return [o.s, o.s * (0.85 + 0.3 * o.u), o.s]; };
      z.pineNear = inst(z.trees[0], geo.pineNear, propMat, true, tsc);
      z.pineFar = inst(z.trees[0].slice(), geo.pineFar, propMat, true, tsc);
      z.broadNear = inst(z.trees[1], geo.broadNear, propMat, true, tsc);
      z.broadFar = inst(z.trees[1].slice(), geo.broadFar, propMat, true, tsc);
      z.rockMesh = inst(z.rocks, geo.rock, propMat, true, function (o) { return [o.r, o.r * 0.7, o.r * 1.1]; });
      z.grassMesh = inst(z.grass, geo.grass, grassMat, false, function (o) { return [o.s, o.s, o.s]; });
      W.zones.push(z);
    });
    // rockfall boulders on the road (always visible)
    if (route.hazards.length) {
      var hm = new THREE.InstancedMesh(geo.rock, propMat, route.hazards.length);
      route.hazards.forEach(function (o, n) { tmpP.set(o.x, o.y - o.r * 0.25, o.z); tmpQ.setFromEuler(tmpE.set(0.4 * n, n, 0)); tmpS.set(o.r, o.r * 0.8, o.r); tmpM.compose(tmpP, tmpQ, tmpS); hm.setMatrixAt(n, tmpM); });
      hm.castShadow = true; stage.add(hm);
    }
    // marker posts every 25 m on both edges
    var posts = [];
    for (var ps = 0; ps < route.total; ps += 25) {
      var pi = Math.min(route.n - 1, Math.floor(ps / route.SP));
      [-1, 1].forEach(function (sd) {
        var off2 = route.w[pi] / 2 + 1.0, x2 = route.x[pi] - Math.sin(route.h[pi]) * off2 * sd, z2 = route.z[pi] + Math.cos(route.h[pi]) * off2 * sd;
        posts.push({ x: x2, z: z2, y: T.terrainHeight(route, x2, z2) });
      });
    }
    var pm = new THREE.InstancedMesh(geo.post, propMat, posts.length);
    posts.forEach(function (o, n) { tmpP.set(o.x, Math.min(o.y, route.y[0] + 1e6) - 0.1, o.z); tmpQ.identity(); tmpS.set(1, 1, 1); tmpM.compose(tmpP, tmpQ, tmpS); pm.setMatrixAt(n, tmpM); });
    pm.frustumCulled = false; stage.add(pm);
  }
  function setZoneCounts(z) {
    var veg = W.gfx ? W.gfx.vegetation : 1;
    function cnt(m, f) { if (m) m.count = Math.round(m.userData.list.length * f); }
    // trees: the first `veg` share (sorted by u) — includes every collidable tree
    var f = veg <= 0.4 ? 0.4 : veg;
    cnt(z.pineNear, f); cnt(z.pineFar, f); cnt(z.broadNear, f); cnt(z.broadFar, f);
    cnt(z.grassMesh, Math.max(0.15, veg));
  }

  // ---- start / split / finish gates
  function bannerTex(text, color) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 96;
    var g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#fff'; g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
    return new THREE.CanvasTexture(c);
  }
  function buildGates(route, stage) {
    var list = [{ s: route.startS, text: 'START', color: '#1a7f3a' }];
    route.checkpoints.forEach(function (s, k) { list.push({ s: s, text: 'SPLIT ' + (k + 1), color: '#1f4fa8' }); });
    list.push({ s: route.finishS, text: 'FINISH', color: '#b3121f' });
    var poleM = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    list.forEach(function (gt) {
      var i = Math.min(route.n - 1, Math.round(gt.s / route.SP)), h = route.h[i], w2 = route.w[i] / 2 + 1.6;
      var grp = new THREE.Group(); grp.position.set(route.x[i], route.y[i], route.z[i]); grp.rotation.y = -h;
      [-1, 1].forEach(function (sd) { var p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.2, 0.25), poleM); p.position.set(0, 2.6, sd * w2); p.castShadow = true; grp.add(p); });
      var ban = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, w2 * 2 + 0.3), [poleM, poleM, poleM, poleM, new THREE.MeshBasicMaterial({ map: bannerTex(gt.text, gt.color) }), new THREE.MeshBasicMaterial({ map: bannerTex(gt.text, gt.color) })]);
      ban.position.y = 4.7; ban.rotation.y = Math.PI / 2; grp.add(ban);
      // swap so the banner faces along the road
      ban.rotation.y = 0;
      var face = new THREE.Mesh(new THREE.PlaneGeometry(w2 * 2, 1.0), new THREE.MeshBasicMaterial({ map: bannerTex(gt.text, gt.color), side: THREE.DoubleSide }));
      face.position.set(-0.07, 4.7, 0); face.rotation.y = -Math.PI / 2; grp.add(face);
      stage.add(grp);
    });
  }

  // ------------------------------------------------------------------
  // Per-frame: LOD switching, zone culling, particles, sun follows the car.
  W.update = function (dt, camera, car) {
    var cx = camera.position.x, cz = camera.position.z, gfx = W.gfx;
    projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    W.frustum.setFromProjectionMatrix(projM);
    var far = gfx.viewDistance + 60, far2 = far * far, lodD = Math.min(260, gfx.viewDistance * 0.4);
    W.chunks.forEach(function (c) {
      var dx = c.cx - cx, dz = c.cz - cz, d2 = dx * dx + dz * dz, near = d2 < lodD * lodD;
      var vis = d2 < (far + 90) * (far + 90);
      c.lods[0].visible = vis && near; c.lods[1].visible = vis && !near;
    });
    W.roadPieces.forEach(function (m) {
      var bs = m.geometry.boundingSphere, dx = bs.center.x - cx, dz = bs.center.z - cz;
      m.visible = dx * dx + dz * dz < (far + bs.radius) * (far + bs.radius);
    });
    var treeLod = Math.min(180, gfx.viewDistance * 0.3);
    W.zones.forEach(function (z) {
      var dx = z.cx - cx, dz = z.cz - cz, d = Math.sqrt(dx * dx + dz * dz) - z.radius;
      var inView = d < far && W.frustum.intersectsSphere(z.sphere);
      var near = d < treeLod;
      if (z.pineNear) z.pineNear.visible = inView && near;
      if (z.broadNear) z.broadNear.visible = inView && near;
      if (z.pineFar) z.pineFar.visible = inView && !near;
      if (z.broadFar) z.broadFar.visible = inView && !near;
      if (z.rockMesh) z.rockMesh.visible = inView && d < far * 0.7;
      if (z.grassMesh) z.grassMesh.visible = inView && d < 110;
    });
    W.sky.position.copy(camera.position); W.sky.scale.setScalar(Math.min(camera.far * 0.95, 2000));
    if (car) {
      W.sun.position.set(car.x + 60, car.y + 140, car.z + 40);
      W.sun.target.position.set(car.x, car.y, car.z); W.sun.target.updateMatrixWorld();
    }
    W.particles.update(dt);
  };

  W.render = function (camera) {
    W.renderer.render(W.scene, camera);
    var info = W.renderer.info.render; W.stats.calls = info.calls; W.stats.tris = info.triangles;
  };

  // ------------------------------------------------------------------
  // Dust / mud particles: fixed pool, soft round points with alpha.
  function makeParticles(cap) {
    var pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), alpha = new Float32Array(cap), size = new Float32Array(cap);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    var mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      uniforms: { scale: { value: 600 }, fogColor: { value: new THREE.Color(0xb7c9d6) } },
      vertexShader: 'attribute float alpha; attribute float size; varying float vA; varying vec3 vC; uniform float scale;\n' +
        'void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; varying vec3 vC;\n' +
        'void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p,p); if (d > 0.25) discard; gl_FragColor = vec4(vC, vA * (1.0 - d * 4.0)); }',
    });
    var pts = new THREE.Points(g, mat); pts.frustumCulled = false;
    var P = { points: pts, cap: cap, max: cap, live: new Float32Array(cap), vel: new Float32Array(cap * 3), life: new Float32Array(cap), next: 0 };
    P.reset = function () { P.live.fill(0); alpha.fill(0); g.attributes.alpha.needsUpdate = true; };
    P.emit = function (x, y, z, vx, vy, vz, rgb, sz, life) {
      if (P.max <= 0) return;
      var i = P.next; P.next = (P.next + 1) % P.max;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
      col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
      size[i] = sz; P.life[i] = life; P.live[i] = life;
    };
    P.update = function (dt) {
      for (var i = 0; i < cap; i++) {
        if (P.live[i] <= 0) { alpha[i] = 0; continue; }
        P.live[i] -= dt;
        var k = i * 3; pos[k] += P.vel[k] * dt; pos[k + 1] += P.vel[k + 1] * dt; pos[k + 2] += P.vel[k + 2] * dt;
        P.vel[k] *= 1 - 1.6 * dt; P.vel[k + 2] *= 1 - 1.6 * dt; P.vel[k + 1] = P.vel[k + 1] * (1 - 1.2 * dt) + 0.4 * dt;
        size[i] += dt * 1.6;
        var t = P.live[i] / P.life[i];
        alpha[i] = Math.max(0, t) * 0.38 * (i < P.max ? 1 : 0);
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
    };
    return P;
  }

  W.dust = function (car, dt) {
    var P = W.particles; if (P.max <= 0) return;
    for (var i = 0; i < 4; i++) {
      var w = car.wheels[i];
      if (!w.contact || car.speed < 4) continue;
      var S = D.SURFACES[w.surf], rate = (car.speed / 30 + w.slide * 1.5) * (w.front ? 0.5 : 1) * (w.surf === 'grass' ? 10 : 26) * W.gfx.particles;
      var n = rate * dt + Math.random();
      for (var k = 0; k < Math.floor(n); k++) {
        var j = (Math.random() - 0.5) * 0.4;
        P.emit(w.wx + j, w.gy + 0.25, w.wz + j, -car.vx * 0.15 + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.2 + (w.surf === 'mud' ? 1.2 : 0), -car.vz * 0.15 + (Math.random() - 0.5) * 2,
          S.dust, w.surf === 'mud' ? 0.3 : w.surf === 'grass' ? 0.5 : 0.9, w.surf === 'mud' ? 0.7 : w.surf === 'grass' ? 0.8 : 1.4 + Math.random());
      }
    }
  };

  RL.World = W;
})(typeof window !== 'undefined' ? window : globalThis);

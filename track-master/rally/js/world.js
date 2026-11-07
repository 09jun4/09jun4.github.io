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
  var SKY_H = 0xb3c8d9; // horizon / fog colour

  W.init = function (canvas) {
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = THREE.sRGBEncoding;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    W.renderer = r;
    W.scene = new THREE.Scene();
    W.scene.background = new THREE.Color(SKY_H);
    W.scene.fog = new THREE.Fog(SKY_H, 120, 900);
    W.hemi = new THREE.HemisphereLight(0xdfeaf2, 0x4a4630, 0.8); W.scene.add(W.hemi);
    var sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
    sun.position.set(120, 220, 80);
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 600; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    W.scene.add(sun); W.scene.add(sun.target); W.sun = sun;
    W.sky = makeSky(); W.scene.add(W.sky);
    W.sunDir = new THREE.Vector3(0.62, 0.6, 0.5).normalize(); // ~37 deg sun: long shadows
    W.skyHigh = makePhysSky(); if (W.skyHigh) W.scene.add(W.skyHigh);
    W.frustum = new THREE.Frustum();
    W.scene.environment = makeEnv(r, W.sunDir); // reflections on the car's paint, glass and chrome
    W.particles = makeParticles(1600); W.scene.add(W.particles.points);
    W.clouds = makeClouds(); W.scene.add(W.clouds);
    W.far = makeFar(); W.scene.add(W.far);
    W.sunDisc = makeSunDisc(); W.scene.add(W.sunDisc);
    return W;
  };

  // Environment map: a small sky / ground / sun scene rendered once into a
  // prefiltered cube (PMREM), used for PBR reflections.
  // HIGH sky: Preetham analytic daylight (vendor/sky.js), sun from sunDir.
  // The analytic sky is HDR (made for exposure ~0.5); scale it to this
  // scene's exposure so it stays a deep, realistic blue instead of white.
  function tuneSky(s) {
    s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'vec3 sc = retColor * 0.3; float lu = dot(sc, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(max(vec3(0.0), mix(vec3(lu), sc, 1.55)), 1.0);');
    s.material.needsUpdate = true;
  }
  function makePhysSky() {
    if (!THREE.Sky) return null;
    var s = new THREE.Sky(), u = s.material.uniforms;
    u.turbidity.value = 3.2; u.rayleigh.value = 2.6; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.82; tuneSky(s);
    u.sunPosition.value.copy(W.sunDir);
    s.frustumCulled = false; s.renderOrder = -2; s.visible = false;
    return s;
  }
  function makeEnv(r, sunDir) {
    if (THREE.Sky) {
      // reflections of the same physical sky (plus a dark ground below)
      var ps = new THREE.Scene(), sky = new THREE.Sky(), s = sky, u = sky.material.uniforms;
      u.turbidity.value = 3.2; u.rayleigh.value = 2.6; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.82; tuneSky(s); u.sunPosition.value.copy(sunDir);
      sky.scale.setScalar(100); ps.add(sky);
      var gnd = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: 0x3b4529 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -2; ps.add(gnd);
      var pm0 = new THREE.PMREMGenerator(r), rt0 = pm0.fromScene(ps, 0.01);
      pm0.dispose(); return rt0.texture;
    }
    var es = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), col = [], pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 10, c = y >= 0 ? new THREE.Color(0xcfdde8).lerp(new THREE.Color(0x4f86c6), Math.pow(y, 0.7)) : new THREE.Color(0x6b6247).lerp(new THREE.Color(0x3a4a26), Math.min(1, -y * 3));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    var sunM = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5) }));
    sunM.position.set(5, 7, 3.5); es.add(sunM);
    var pm = new THREE.PMREMGenerator(r), rt = pm.fromScene(es, 0.02);
    pm.dispose(); g.dispose();
    return rt.texture;
  }

  // HIGH only: a cloud dome (procedural canvas) and a sun glow.
  // Tileable value noise (wraps every P lattice cells) for seamless textures.
  function tileNoise(seed, P) {
    var r = RL.Rng.stream('tile', seed), v = new Float32Array(P * P);
    for (var i = 0; i < v.length; i++) v[i] = r.next();
    function f(t) { return t * t * (3 - 2 * t); }
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), fx = f(x - xi), fy = f(y - yi);
      var x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
      var a = v[y0 * P + x0], b = v[y0 * P + x1], c = v[y1 * P + x0], d = v[y1 * P + x1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }
  function tileFbm(seed, P, oct) {
    var ns = []; for (var o = 0; o < oct; o++) ns.push(tileNoise(seed + o, P << o));
    return function (x, y) { var s = 0, amp = 0.5, tot = 0; for (var o = 0; o < oct; o++) { s += amp * ns[o](x * (1 << o), y * (1 << o)); tot += amp; amp *= 0.5; } return s / tot; };
  }
  // Clouds: fBm cumulus / stratocumulus, lit tops and grey bases, thinning
  // toward the horizon so the sky stays deep blue overhead.
  function cloudTex() {
    var W2 = 1024, H2 = 512, c = document.createElement('canvas'); c.width = W2; c.height = H2;
    var g = c.getContext('2d'), img = g.createImageData(W2, H2), d = img.data, n = tileFbm('clouds', 8, 6), m = tileFbm('cover', 4, 3);
    for (var y = 0; y < H2; y++) for (var x = 0; x < W2; x++) {
      var u = x / W2 * 8, v = y / H2 * 4;
      var cover = 0.33 + 0.2 * m(x / W2 * 4, y / H2 * 2);
      var den = n(u, v * 1.6) - (1 - cover) * 0.9;
      var hz = y / H2; // 0 = zenith, 1 = horizon
      var a = Math.max(0, Math.min(1, (den - 0.01) * 7)) * (hz < 0.08 ? hz / 0.08 : 1) * (1 - Math.pow(hz, 3) * 0.6);
      var below = n(u, (v + 0.06) * 1.6) - (1 - cover) * 0.9; // density just under: darker base
      var lit = 0.92 + 0.08 * Math.max(0, den - below) * 8 - 0.25 * Math.max(0, Math.min(1, (below - 0.05) * 3));
      var k = (y * W2 + x) * 4, L = Math.max(0.78, Math.min(1, lit + 0.05));
      d[k] = 255 * L; d[k + 1] = 255 * L * 0.995; d[k + 2] = 255 * Math.min(1, L * 1.02); d[k + 3] = 255 * a;
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t;
  }
  function makeClouds() {
    var g = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.48);
    var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }));
    m.material.map.repeat.set(2, 1); m.renderOrder = -1; m.frustumCulled = false; m.visible = false;
    return m;
  }
  function makeSunDisc() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d'), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,253,240,1)'); grad.addColorStop(0.12, 'rgba(255,246,215,0.95)'); grad.addColorStop(0.35, 'rgba(255,230,180,0.25)'); grad.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false, transparent: true }));
    s.visible = false; s.renderOrder = -1;
    return s;
  }
  // HIGH only: distant mountain ranges around the stage (beyond the fog,
  // faded into the sky colour by hand) so the horizon is not empty.
  // (unit ring that follows the camera at the edge of the view distance;
  // heights are in metres, so scale.x/z = radius)
  function makeFar() {
    var cx = 0, cz = 0, rad = 1, baseY = 0;
    var noise = RL.Rng.noise2('far-ranges'), grp = new THREE.Group();
    var sky = new THREE.Color(SKY_H);
    [[0.6, 0x5b7186, 190, 0.7], [0.78, 0x7489a0, 300, 0.55], [0.95, 0x92a7bb, 420, 0.4]].forEach(function (L, li) {
      var segs = 180, R = rad * L[0], pos = [], col = [], idx = [], base = new THREE.Color(L[1]);
      for (var s = 0; s <= segs; s++) {
        var an = s / segs * Math.PI * 2, h = L[2] * (0.35 + 0.65 * Math.max(0, noise.fbm(Math.cos(an) * 3 + li * 7, Math.sin(an) * 3, 4) * 1.4 + 0.45));
        var x = cx + Math.cos(an) * R, z = cz + Math.sin(an) * R;
        pos.push(x, baseY - 40, z, x, baseY + h, z);
        var top = base.clone().lerp(new THREE.Color(0xe6eef3), 0.15 * li), bot = base.clone().lerp(sky, L[3]);
        col.push(bot.r, bot.g, bot.b, top.r, top.g, top.b);
        if (s < segs) { var k = s * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.renderOrder = -1 + li * 0; m.frustumCulled = false; grp.add(m);
    });
    grp.visible = false;
    return grp;
  }
  // HIGH only: grass detail texture multiplied over the terrain colours
  // Normal map from a height function (tileable): strong surface texture
  // in sunlight on HIGH.
  function normalFrom(H, w, h, strength) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var l = H[y * w + (x - 1 + w) % w], r = H[y * w + (x + 1) % w], u = H[((y - 1 + h) % h) * w + x], dn = H[((y + 1) % h) * w + x];
      var nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1, len = Math.sqrt(nx * nx + ny * ny + 1), k = (y * w + x) * 4;
      d[k] = (nx / len * 0.5 + 0.5) * 255; d[k + 1] = (ny / len * 0.5 + 0.5) * 255; d[k + 2] = (nz / len * 0.5 + 0.5) * 255; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.shared = true; return t;
  }
  var grassTex = null, grassNrm = null;
  function grassTexture() {
    if (grassTex) return grassTex;
    var S2 = 256, H = new Float32Array(S2 * S2), c = document.createElement('canvas'); c.width = c.height = S2;
    var g = c.getContext('2d'), img = g.createImageData(S2, S2), d = img.data, n = tileFbm('grassH', 16, 4), m = tileFbm('grassC', 4, 3), r = RL.Rng.stream('tex', 'grass2');
    for (var i = 0; i < S2 * S2; i++) H[i] = n((i % S2) / S2 * 16, Math.floor(i / S2) / S2 * 16) * 0.6;
    // blades: short random strokes raise the height field
    for (var k = 0; k < 9000; k++) {
      var x = r.next() * S2, y = r.next() * S2, len = 2 + r.next() * 6, dx = (r.next() - 0.5) * 0.6, hgt = 0.3 + r.next() * 0.7;
      for (var s = 0; s < len; s++) { var px = Math.floor(x + dx * s + S2) % S2, py = Math.floor(y - s + S2) % S2; H[py * S2 + px] = Math.max(H[py * S2 + px], hgt * (1 - s / len * 0.4)); }
    }
    for (i = 0; i < S2 * S2; i++) {
      var tone = m((i % S2) / S2 * 4, Math.floor(i / S2) / S2 * 4), h = H[i], v = 0.55 + 0.6 * h;
      d[i * 4] = Math.min(255, 255 * v * (0.92 + 0.12 * tone)); d[i * 4 + 1] = Math.min(255, 255 * v); d[i * 4 + 2] = Math.min(255, 255 * v * (0.72 + 0.1 * tone)); d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grassTex = new THREE.CanvasTexture(c); grassTex.encoding = THREE.sRGBEncoding; grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.anisotropy = 8; grassTex.shared = true;
    grassNrm = normalFrom(H, S2, S2, 3.2);
    return grassTex;
  }
  // Gravel road: stones (domes) over fine grit, two smoother wheel ruts.
  var gravelHigh = null;
  function gravelTextures() {
    if (gravelHigh) return gravelHigh;
    var S2 = 512, H = new Float32Array(S2 * S2), r = RL.Rng.stream('tex', 'stones'), n = tileFbm('grit', 64, 3);
    for (var i = 0; i < S2 * S2; i++) H[i] = n((i % S2) / S2 * 64, Math.floor(i / S2) / S2 * 64) * 0.35;
    var tint = new Float32Array(S2 * S2);
    for (var k = 0; k < 2600; k++) {
      var cx = r.next() * S2, cy = r.next() * S2, rad = 1.5 + Math.pow(r.next(), 2) * 7, hh = 0.5 + r.next() * 0.6, tn = r.next();
      for (var yy = -rad; yy <= rad; yy++) for (var xx = -rad; xx <= rad; xx++) {
        var q = 1 - (xx * xx + yy * yy) / (rad * rad); if (q <= 0) continue;
        var px = Math.floor(cx + xx + S2) % S2, py = Math.floor(cy + yy + S2) % S2, j = py * S2 + px, v2 = hh * Math.sqrt(q);
        if (v2 > H[j]) { H[j] = v2; tint[j] = tn; }
      }
    }
    var c = document.createElement('canvas'); c.width = c.height = S2;
    var g = c.getContext('2d'), img = g.createImageData(S2, S2), d = img.data;
    for (i = 0; i < S2 * S2; i++) {
      var u = (i % S2) / S2, rut = Math.exp(-Math.pow((u - 0.36) / 0.05, 2)) + Math.exp(-Math.pow((u - 0.64) / 0.05, 2));
      H[i] *= 1 - 0.55 * rut;
      var v = 0.5 + 0.55 * H[i] - 0.1 * rut, tn2 = tint[i];
      d[i * 4] = 255 * Math.min(1, v * (0.98 + 0.1 * tn2)); d[i * 4 + 1] = 255 * Math.min(1, v * 0.95); d[i * 4 + 2] = 255 * Math.min(1, v * (0.86 - 0.08 * tn2)); d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var map = new THREE.CanvasTexture(c); map.encoding = THREE.sRGBEncoding; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; map.shared = true;
    gravelHigh = { map: map, normal: normalFrom(H, S2, S2, 5) };
    return gravelHigh;
  }

  function makeSky() {
    var g = new THREE.SphereGeometry(1, 24, 12), col = [], pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i), t = Math.max(0, y);
      var c = new THREE.Color(SKY_H).lerp(new THREE.Color(0x3c76c0), Math.pow(t, 0.55));
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
    var high = gfx.preset === 'high' || (gfx.preset !== 'low' && gfx.resolution >= 0.85);
    var sz = gfx.shadows ? (high ? 4096 : 1536) : 512;
    var ext = high ? 48 : 70, sc = W.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    if (W.vehicle && W.vehicle.setQuality) W.vehicle.setQuality(high);
    if (W.sun.shadow.mapSize.x !== sz) { W.sun.shadow.mapSize.set(sz, sz); if (W.sun.shadow.map) { W.sun.shadow.map.dispose(); W.sun.shadow.map = null; } }
    W.scene.fog.near = gfx.viewDistance * 0.18; W.scene.fog.far = gfx.viewDistance;
    W.zones.forEach(function (z) { setZoneCounts(z); });
    W.particles.max = Math.round(W.particles.cap * gfx.particles);
    W.high = high;
    W.clouds.visible = high; W.sunDisc.visible = high && !W.skyHigh; if (W.far) W.far.visible = high;
    // HIGH: PBR terrain + road with detail and normal maps; LOW: Lambert
    if (high && terrainMat && !terrainMatHigh) {
      grassTexture(); var gv = gravelTextures();
      terrainMatHigh = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, normalMap: grassNrm, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, metalness: 0 });
      roadMatHigh = new THREE.MeshStandardMaterial({ vertexColors: true, map: gv.map, normalMap: gv.normal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, metalness: 0 });
    }
    W.chunks.forEach(function (c) { c.lods.forEach(function (m) { m.material = high && terrainMatHigh ? terrainMatHigh : terrainMat; }); });
    W.roadPieces.forEach(function (m) { m.material = high && roadMatHigh ? roadMatHigh : roadMat; });
    // light balance: HIGH is darker with more contrast (strong sun, less fill)
    W.renderer.toneMappingExposure = high ? 0.8 : 1.05;
    W.sun.intensity = high ? 2.0 : 1.35; W.hemi.intensity = high ? 0.36 : 0.8;
    W.hemi.color.set(high ? 0xcfe0f0 : 0xdfeaf2); W.hemi.groundColor.set(high ? 0x3a3524 : 0x4a4630);
    W.scene.fog.color.set(high ? 0xaebfcf : SKY_H); W.scene.background.copy(W.scene.fog.color);
    if (W.skyHigh) { W.skyHigh.visible = high; W.sky.visible = !high; }
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
  var terrainMat = null, terrainMatHigh = null, roadMat = null, roadMatHigh = null;
  function buildTerrain(route, stage) {
    var T0 = route.terrain, N = T0.CHUNK + 1, size = T0.size, noise = T0.noise;
    terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    terrainMatHigh = null;
    var cGrass = new THREE.Color(0x3f6524), cDry = new THREE.Color(0x77753a), cDirt = new THREE.Color(0x6b5a40), cRock = new THREE.Color(0x77736b), c = new THREE.Color();
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
        var uv = new Float32Array(n * n * 2); for (var q = 0; q < n * n; q++) { uv[q * 2] = pos[q * 3] / 7; uv[q * 2 + 1] = pos[q * 3 + 2] / 7; }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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
    var mat = roadMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }); roadMatHigh = null;
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
        // per-tree colour variation (seeded by u): lighter / darker / yellower
        if (mat === propMat) { var cc = new THREE.Color(); list.forEach(function (o, n) { var u = (o.u * 7.31) % 1; cc.setRGB(0.82 + 0.3 * u, 0.85 + 0.25 * ((o.u * 3.7) % 1), 0.8 + 0.2 * u); m.setColorAt(n, cc); }); if (m.instanceColor) m.instanceColor.needsUpdate = true; }
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
      whiteColors(hm); hm.castShadow = true; stage.add(hm);
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
    whiteColors(pm); pm.frustumCulled = false; stage.add(pm);
  }
  // every InstancedMesh sharing propMat needs instance colours (same shader)
  function whiteColors(m) { var w = new THREE.Color(1, 1, 1); for (var i = 0; i < m.count; i++) m.setColorAt(i, w); m.instanceColor.needsUpdate = true; }
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
    if (W.high) {
      var R2 = Math.min(camera.far * 0.9, 1900);
      W.clouds.position.copy(camera.position); W.clouds.position.y -= R2 * 0.05; W.clouds.scale.set(R2, R2 * 0.35, R2); W.clouds.rotation.y += dt * 0.002;
      W.sunDisc.position.copy(camera.position).addScaledVector(W.sunDir, R2 * 0.85); W.sunDisc.scale.setScalar(R2 * 0.22);
      W.far.position.set(camera.position.x, camera.position.y - 70, camera.position.z); W.far.scale.set(R2, 1, R2);
      if (W.skyHigh) { W.skyHigh.position.copy(camera.position); W.skyHigh.scale.setScalar(Math.min(camera.far * 1.05, 2100)); }
    }
    if (car) {
      W.sun.position.set(car.x + W.sunDir.x * 160, car.y + W.sunDir.y * 160, car.z + W.sunDir.z * 160);
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
        alpha[i] = Math.max(0, t) * Math.min(1, (1 - t) * 8) * 0.42 * (i < P.max ? 1 : 0);
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
    };
    return P;
  }

  W.dust = function (car, dt) {
    var P = W.particles; if (P.max <= 0) return;
    // drift plume: big slow clouds from the rear wheels while sliding
    var slideAng = Math.abs(car.beta || 0);
    if (car.speed > 6 && slideAng > 0.12) {
      var amt = Math.min(1, (slideAng - 0.12) / 0.35) * Math.min(1, car.speed / 18);
      for (var r2 = 2; r2 < 4; r2++) {
        var wr = car.wheels[r2]; if (!wr.contact) continue;
        var Sd = D.SURFACES[wr.surf], nn = amt * 70 * W.gfx.particles * dt + Math.random();
        for (var q = 0; q < Math.floor(nn); q++) {
          var jx = (Math.random() - 0.5) * 0.8, jz = (Math.random() - 0.5) * 0.8;
          P.emit(wr.wx + jx, wr.gy + 0.3, wr.wz + jz, car.vx * 0.25 + (Math.random() - 0.5) * 3, 0.8 + Math.random() * 1.4, car.vz * 0.25 + (Math.random() - 0.5) * 3,
            Sd.dust, wr.surf === 'mud' ? 0.6 : 1.6 + Math.random() * 0.8, wr.surf === 'mud' ? 1.0 : 2.2 + Math.random() * 1.2);
        }
      }
    }
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

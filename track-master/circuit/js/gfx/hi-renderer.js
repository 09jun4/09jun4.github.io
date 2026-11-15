// hi-renderer.js — the 높음 renderer: three.js r128 on WebGL2 (WebGL1 where
// that is all the device has). Same interface as the 낮음 renderer behind
// CR.Gfx: init(canvas, opts) / render(dt) / resize() / dispose(), plus
// explode / resetEffects / setQuality / info.
// It only reads the game state: CR.Camera (after Camera.begin, the exact view
// the 2D renderer and the cockpit overlay use — same position, heading, pitch,
// focal length and off-centre horizon), CR.Car.state, CR.Race.ai, CR.Track
// samples. Nothing here writes physics, input, laps or camera state, so lap
// times are the same in both presets for the same inputs.
// Scopes: 'global' (textures, shared materials), 'track' (rebuilt per circuit:
// road, scenery, stands, sky, env map) and 'cars' (car models, cached per
// livery). Every geometry / material / texture / render target is disposed when
// its scope goes, and dispose() also releases the WebGL context.
// Load order: last of the gfx/hi-* files. Depends on: THREE, THREE.CSM, CR.Hi.*.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi;

  function newScope() { return { mats: [], tex: [], roots: [] }; }

  function HiRenderer() {
    this.scopes = { global: newScope(), track: newScope(), cars: newScope() };
    this.mats = [];
    this.scope = this.scopes.global;
    this.textures = this.scope.tex;
    this.csm = null;
    this.sun = null;
    this.trackKey = null;
    this.carCache = new Map();
    this.fx = null;
    this.disposing = false;
    this.fovK = 1; this.lon = 0; this.prevSpeed = 0; this.spring = 0;
    this.shakeT = 0;
  }
  var P = HiRenderer.prototype;

  // --- Resource registry -------------------------------------------------------
  P.useScope = function (name) { this.scope = this.scopes[name]; this.textures = this.scope.tex; };
  P.register = function (m) { this.scope.mats.push(m); return m; };
  P.lit = function (m, name, hook) {
    m.userData.hiName = name || 'm';
    m.userData.hiHook = hook || null;
    this.register(m);
    if (this.previewMode) { // studio previews: no cascaded shadows on these
      var key = (name || 'm') + '|pv';
      m.onBeforeCompile = hook || THREE.Material.prototype.onBeforeCompile;
      m.customProgramCacheKey = function () { return key; };
      return m;
    }
    this.mats.push(m);
    this.shadowSetup(m);
    return m;
  };
  P.std = function (params, name, hook) { return this.lit(new THREE.MeshStandardMaterial(params), name, hook); };
  P.phys = function (params, name, hook) { return this.lit(new THREE.MeshPhysicalMaterial(params), name, hook); };

  // CSM needs its own onBeforeCompile; chain ours after it and give every
  // variant a distinct program cache key.
  P.shadowSetup = function (m) {
    var hook = m.userData.hiHook, name = m.userData.hiName;
    if (this.csm) {
      this.csm.setupMaterial(m);
      var csmHook = m.onBeforeCompile;
      m.onBeforeCompile = hook ? function (s, r) { csmHook(s, r); hook(s, r); } : csmHook;
      var key = name + '|csm' + this.csm.cascades;
      m.customProgramCacheKey = function () { return key; };
    } else {
      m.onBeforeCompile = hook || THREE.Material.prototype.onBeforeCompile;
      m.customProgramCacheKey = function () { return name; };
    }
    m.needsUpdate = true;
  };

  P.addRoot = function (obj, parent) {
    (parent || this.scene).add(obj);
    this.scope.roots.push(obj);
    return obj;
  };

  P.disposeScope = function (name) {
    var sc = this.scopes[name], self = this;
    var geos = new Set();
    sc.roots.forEach(function (root) {
      if (root.parent) root.parent.remove(root);
      root.traverse(function (o) {
        if (o.geometry) geos.add(o.geometry);
        if (o.isInstancedMesh && o.dispose) o.dispose();
      });
    });
    geos.forEach(function (g) { g.dispose(); });
    sc.mats.forEach(function (m) {
      if (self.csm) self.csm.shaders.delete(m);
      var i = self.mats.indexOf(m);
      if (i >= 0) self.mats.splice(i, 1);
      ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap'].forEach(function (k) { if (m[k] && sc.tex.indexOf(m[k]) < 0) sc.tex.push(m[k]); });
      m.dispose();
    });
    var texSet = new Set(sc.tex);
    texSet.forEach(function (t) { if (t && t.dispose) t.dispose(); });
    this.scopes[name] = newScope();
    if (this.scope === sc) this.useScope(name);
  };

  // --- Setup ---------------------------------------------------------------------
  P.init = function (canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    this.device = opts.device;
    this.tier = opts.tier;
    this.tierIndex = opts.tierIndex || 0;
    this.previewCars = new Map();
    this.previewImages = {};
    this.pvCache = null;
    var attrs = { alpha: false, antialias: false, depth: true, stencil: false, powerPreference: this.device.mobile ? 'default' : 'high-performance', preserveDrawingBuffer: false };
    var gl = null;
    try {
      if (!opts.forceWebGL1) gl = canvas.getContext('webgl2', attrs);
      this.webglVersion = gl ? 2 : 1;
      if (!gl) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    } catch (e) { gl = null; }
    if (!gl) return false;
    var self = this;
    this.onLost = function (e) { e.preventDefault(); if (!self.disposing && self.onContextLost) self.onContextLost(); };
    canvas.addEventListener('webglcontextlost', this.onLost, false);
    var r = this.renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl, antialias: false, alpha: false, powerPreference: attrs.powerPreference });
    r.setPixelRatio(1);
    r.info.autoReset = false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputEncoding = THREE.LinearEncoding;
    // Renderable half floats -> HDR chain; otherwise tone-map while rendering.
    this.hdr = this.checkHalfFloat();
    r.toneMapping = this.hdr ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.maxAniso = r.capabilities.getMaxAnisotropy ? r.capabilities.getMaxAnisotropy() : 1;

    this.scene = new THREE.Scene();
    this.bgScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 3200);
    this.camera.matrixAutoUpdate = true;
    this.bgCamera = new THREE.PerspectiveCamera(60, 1, 1, 20000);
    this.proxy = new THREE.PerspectiveCamera(60, 1, 0.3, 3200); // symmetric stand-in for CSM
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a4a2a, 0.75);
    this.scene.add(this.hemi);
    this.bgHemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a4a2a, 0.9);
    this.bgSun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.bgScene.add(this.bgHemi, this.bgSun);
    this.carsGroup = new THREE.Group();
    this.scene.add(this.carsGroup);

    // global textures + shared bits
    this.useScope('global');
    var aniso = Math.min(this.maxAniso, Math.max(1, this.tier.aniso));
    this.texAsphalt = Hi.asphalt(aniso, this.device.mobile ? 256 : 512);
    this.texRunoff = Hi.concrete(aniso, [92, 95, 100]);
    this.texConcrete = Hi.concrete(aniso);
    this.texGrass = Hi.grass(aniso);
    this.texSand = Hi.sand(aniso);
    this.texKerb = Hi.kerb(aniso);
    this.texFence = Hi.fence();
    this.texCrowd = Hi.crowdCarpet();
    this.texSponsors = Hi.sponsors();
    this.texPuff = Hi.puff();
    this.texGlow = Hi.glow();
    this.texTread = Hi.tread();
    this.texCarbon = Hi.carbon(Math.min(this.maxAniso, 8));
    var blob = Hi.blob();
    [this.texAsphalt.map, this.texAsphalt.normal, this.texAsphalt.rough, this.texRunoff, this.texConcrete, this.texGrass.map, this.texGrass.normal, this.texSand,
      this.texKerb, this.texFence, this.texCrowd, this.texSponsors, this.texPuff, this.texGlow, this.texTread, this.texCarbon.map, this.texCarbon.normal, this.texCarbon.rough, blob].forEach(function (t) { self.textures.push(t); });
    this.blobGeo = new THREE.PlaneGeometry(1, 1);
    this.blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.register(this.blobMat);
    this.coneGeo = new THREE.ConeGeometry(1.5, 11, 20, 1, true).translate(0, -5.5, 0);
    this.coneMat = new THREE.ShaderMaterial({
      vertexShader: 'varying float vT; void main() { vT = -position.y / 11.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vT; void main() { float a = (1.0 - vT) * (1.0 - vT) * smoothstep(0.0, 0.08, vT) * 0.09; gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    this.register(this.coneMat);
    this.scope.roots.push(this.carsGroup);

    this.post = new Hi.Post(this);
    this.post.configure(this.tier, this.webglVersion === 2);
    this.fx = Hi.Fx.create(this);
    this.scene.add(this.fx.group);
    this.scope.roots.push(this.fx.group);
    this.setupShadows();
    this.resize();
    return true;
  };

  P.checkHalfFloat = function () {
    var r = this.renderer, ext = r.extensions;
    var ok = this.webglVersion === 2 ? ext.has('EXT_color_buffer_float') : (ext.has('OES_texture_half_float') && ext.has('EXT_color_buffer_half_float'));
    if (!ok) return false;
    try {
      var rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat });
      r.setRenderTarget(rt);
      var gl = r.getContext(), st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      r.setRenderTarget(null);
      rt.dispose();
      return st === gl.FRAMEBUFFER_COMPLETE;
    } catch (e) { return false; }
  };

  // --- Shadows: cascades that follow the camera (and so the car ahead) --------------
  P.setupShadows = function () {
    var t = this.tier, th = this.theme || Hi.Env.theme('');
    var sunDir = Hi.Env.sunDir(th), sun = Hi.Env.sunColor(th);
    if (this.csm) {
      this.csm.remove();
      this.csm.lights.forEach(function (l) { if (l.shadow && l.shadow.map) l.shadow.map.dispose(); });
      this.csm.dispose();
      this.csm = null;
    }
    if (this.sun) { this.scene.remove(this.sun); this.scene.remove(this.sun.target); this.sun = null; }
    this.renderer.shadowMap.enabled = t.shadow > 0;
    if (t.shadow > 0) {
      this.csm = new THREE.CSM({ camera: this.proxy, parent: this.scene, cascades: t.cascades, maxFar: t.shadowFar, shadowMapSize: t.shadow,
        lightDirection: sunDir.clone().negate(), lightIntensity: sun.intensity, lightNear: 1, lightFar: 1400, lightMargin: 150, mode: 'practical' });
      this.csm.fade = true;
      this.csm.lights.forEach(function (l) { l.color.copy(sun.color); l.shadow.bias = -0.0003; l.shadow.normalBias = 0.04; });
      this.csm.updateFrustums();
    } else {
      this.sun = new THREE.DirectionalLight(sun.color, sun.intensity);
      this.sun.position.copy(sunDir).multiplyScalar(500);
      this.scene.add(this.sun, this.sun.target);
    }
    var self = this;
    // A rebuilt CSM strips its uniforms from the old shaders: drop each lit
    // material's cached program state so it recompiles with the new setup.
    if (this.shadowsReady) this.mats.forEach(function (m) { m.dispose(); });
    this.shadowsReady = true;
    this.mats.forEach(function (m) { self.shadowSetup(m); });
    this.proxyKey = '';
  };

  P.applyTheme = function (th) {
    this.theme = th;
    var sunDir = Hi.Env.sunDir(th), sun = Hi.Env.sunColor(th);
    if (this.csm) {
      this.csm.lightDirection.copy(sunDir).negate();
      this.csm.lights.forEach(function (l) { l.color.copy(sun.color); l.intensity = sun.intensity; });
    }
    if (this.sun) { this.sun.color.copy(sun.color); this.sun.intensity = sun.intensity; this.sun.position.copy(sunDir).multiplyScalar(500); }
    var zen = new THREE.Color(th.zenith).convertSRGBToLinear(), hz = new THREE.Color(th.haze).convertSRGBToLinear();
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.45);
    this.hemi.groundColor.setRGB(0.16 * th.ground[0], 0.2 * th.ground[1], 0.12 * th.ground[2]);
    // night circuits: floodlit, so a stronger neutral fill
    this.hemi.intensity = 0.34 + (1 - th.night) * 0.14 + th.clouds * 0.12 + th.night * 0.7;
    if (th.night > 0.3) this.hemi.color.lerp(new THREE.Color(1, 0.95, 0.88), 0.6);
    this.bgHemi.color.copy(hz);
    this.bgHemi.groundColor.copy(hz).multiplyScalar(0.4);
    this.bgSun.position.copy(sunDir);
    this.bgSun.color.copy(sun.color);
    this.bgSun.intensity = sun.intensity * 0.45;
    this.scene.fog = new THREE.Fog(hz, th.fog[0], th.fog[1]);
    this.bgScene.fog = new THREE.Fog(hz, 900, 9000);
    this.renderer.toneMappingExposure = th.exposure;
    this.post.uniforms.exposure.value = th.exposure;
    this.post.uniforms.bloomStrength.value = 0.11 + th.night * 0.16;
    this.post.uniforms.sunTint.value.copy(sun.color);
    this.flareBase = 0.55 + Math.max(0, (30 - th.sun[0]) / 30) * 0.6;
  };

  // --- Circuit-dependent scene ----------------------------------------------------------
  function trackKey() {
    var S = CR.Track.samples;
    return (CR.Main ? CR.Main.trackIndex : -1) + ':' + S.length + ':' + S[0].x.toFixed(2) + ',' + S[0].y.toFixed(2);
  }

  P.ensureTrack = function () {
    var S = CR.Track.samples;
    if (S === this.samplesRef) return;
    var key = trackKey();
    if (key === this.trackKey && this.built) {
      // Same circuit, rebuilt for another car: only the corner speeds change.
      var a = this.built.track.roadGeometry.attributes.aSafe;
      var m = a.count / (S.length + 1);
      for (var i = 0; i < a.count; i++) a.array[i] = S[Math.floor(i / m) % S.length].maxSafeSpeed;
      a.needsUpdate = true;
      this.samplesRef = S;
      return;
    }
    this.buildTrack();
    this.samplesRef = S;
    this.trackKey = key;
  };

  P.buildTrack = function () {
    var t0 = performance.now();
    this.disposeScope('track');
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    this.useScope('track');
    var tr = CR.Tracks.list[CR.Main.trackIndex] || CR.Tracks.list[0];
    var th = Hi.Env.theme(tr.realName);
    this.applyTheme(th);
    var b = {};
    b.terrain = Hi.Env.makeTerrain(this, th);
    this.addRoot(b.terrain.mesh);
    this.addRoot(b.terrain.outer);
    b.stands = Hi.Env.makeStands(this, th);
    this.addRoot(b.stands.group);
    var self = this;
    b.stands.crowd.forEach(function (c) { self.addRoot(c.mesh); if (c.flags) self.addRoot(c.flags); });
    b.track = Hi.Track.build(this);
    this.addRoot(b.track.group);
    b.trees = Hi.Env.makeTrees(this, th, b.terrain);
    b.trees.cells.forEach(function (c) { self.addRoot(c.mesh); });
    b.sky = Hi.Env.makeSky(this, th);
    this.addRoot(b.sky, this.bgScene);
    b.mountains = Hi.Env.makeMountains(this, th, b.terrain.center, b.terrain.radius);
    this.addRoot(b.mountains, this.bgScene);
    b.city = Hi.Env.makeCity(this, th, b.terrain.center, b.terrain.radius);
    if (b.city) this.addRoot(b.city, this.bgScene);
    // tower lamps glow at dusk
    b.track.towerHeads.emissiveIntensity = th.night * 6;
    this.built = b;
    this.applyCounts();
    // Reflections: the sky / mountains as a prefiltered environment map.
    try {
      var pm = new THREE.PMREMGenerator(this.renderer);
      b.sky.position.set(b.terrain.center.x, 2, b.terrain.center.z);
      this.envRT = pm.fromScene(this.bgScene, 0, 1, 20000);
      this.scene.environment = this.envRT.texture;
      pm.dispose();
    } catch (e) { console.warn('[Hi] env map', e); this.scene.environment = null; }
    this.useScope('global');
    // Cars get the dusk headlights on circuits that need them: rebuild them.
    this.night = th.night;
    this.disposeCars();
    console.info('[Hi] built ' + tr.name + ' in ' + Math.round(performance.now() - t0) + ' ms');
  };

  P.applyCounts = function () {
    var t = this.tier, b = this.built;
    if (!b) return;
    b.trees.cells.forEach(function (c) { c.mesh.count = Math.max(0, Math.floor(c.full * t.trees)); });
    b.stands.crowd.forEach(function (c) { c.mesh.count = Math.max(0, Math.floor(c.full * t.crowd)); });
  };

  // --- Cars --------------------------------------------------------------------------------
  P.disposeCars = function () {
    this.carCache.forEach(function (c) { if (c.group.parent) c.group.parent.remove(c.group); });
    this.carCache.clear();
    this.disposeScope('cars');
    this.carShared = null;
    var self = this;
    ['intakeMat', 'rimMat', 'tubMat', 'suitMat', 'strapMat', 'padMat', 'boltMat', 'seamMat', 'btnMat', 'mirrorGlassMat', 'sticker-E', 'sticker-F'].forEach(function (k) { self[k] = null; });
    this.previewCars = new Map();
    this.previewImages = {};
    this.pvCache = null;
  };

  // Detail of the car / cockpit for the current tier: 2 = everything (최고 /
  // 높음), 1 = simplified (중간), 0 = basic rounded cockpit (낮춤 / 최소).
  P.detailLevel = function () { var t = this.tierIndex || 0; return t <= 1 ? 2 : t === 2 ? 1 : 0; };

  P.carFor = function (model, number, cockpit) {
    var c = this.carCache.get(model);
    if (c) return c;
    var prev = this.scope;
    this.useScope('cars');
    var mirror3d = !!cockpit && this.tierIndex === 0;
    if (mirror3d) this.ensureMirrorRT();
    c = Hi.Car.create(this, model, { number: number, night: this.night || 0, cockpit: !!cockpit, detail: this.detailLevel(), mirror3d: mirror3d });
    this.scope.roots.push(c.group);
    this.scope = prev; this.textures = prev.tex;
    this.carCache.set(model, c);
    return c;
  };

  // --- Frame ----------------------------------------------------------------------------------
  var tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

  P.render = function (dt, realDt) {
    var S = CR.Track.samples;
    if (!S.length || !CR.Car.def) return;
    this.ensureTrack();
    var r = this.renderer, Cam = CR.Camera, cfg = CR.Config;
    r.info.reset();
    var w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    if (w !== this.cssW || h !== this.cssH) this.resize();
    Cam.begin(this.canvas);
    var c = CR.Car.state;
    var cockpit = Cam.inCockpit(), finish = Cam.frontT > 0 && !cockpit, chase = !cockpit && !finish;

    // Speed sense without any shaking: smoothed longitudinal acceleration
    // drives a slow camera "spring" (pulled back when accelerating, pushed in
    // when braking) and a slightly wider lens at speed. No jitter, no haze.
    if (dt > 0) {
      var lon = (c.speed - this.prevSpeed) / dt;
      this.lon += (Math.max(-30, Math.min(20, lon)) - this.lon) * Math.min(1, dt * 3);
      var springT = chase ? Math.max(-0.9, Math.min(1.1, this.lon * 0.06)) : 0;
      this.spring += (springT - this.spring) * Math.min(1, dt * 2.2);
    }
    this.prevSpeed = c.speed;
    var sf = Math.max(0, Math.min(1, (c.speed - 18) / 72));
    var targetK = chase ? 1 / (1 + 0.14 * sf) : 1;
    if (dt > 0) this.fovK += (targetK - this.fovK) * Math.min(1, dt * 2);
    var F = Cam.focal * this.fovK, cy = Cam.centerPx, pitch = Cam.pitch, hd = Cam.viewHeading;
    var cam = this.camera, near = cockpit ? 0.08 : 0.3, far = 3200;
    tmpV.set(Math.cos(hd) * Math.cos(pitch), -Math.sin(pitch), -Math.sin(hd) * Math.cos(pitch));
    var back = chase ? this.spring : 0;
    cam.position.set(Cam.pos.x - Math.cos(hd) * back, Cam.pos.h + back * 0.12, -Cam.pos.y + Math.sin(hd) * back);
    cam.up.set(0, 1, 0);
    cam.lookAt(tmpV2.copy(cam.position).add(tmpV));
    cam.near = near; cam.far = far;
    cam.projectionMatrix.makePerspective(-near * (w / 2) / F, near * (w / 2) / F, near * cy / F, -near * (h - cy) / F, near, far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld(true);
    var bg = this.bgCamera;
    bg.position.copy(cam.position); bg.quaternion.copy(cam.quaternion);
    bg.projectionMatrix.makePerspective(-(w / 2) / F, (w / 2) / F, cy / F, -(h - cy) / F, 1, 20000);
    bg.projectionMatrixInverse.copy(bg.projectionMatrix).invert();
    bg.updateMatrixWorld(true);
    this.built.sky.position.copy(cam.position);
    this.projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);

    // Cars
    this.carsGroup.children.length = 0;
    var player = this.carFor(CR.Car.def.model, Hi.Car.NUMBERS[CR.Car.def.id], true);
    this.carsGroup.add(player.group);
    var brake = c.retired || c.autopilot ? 0 : CR.Input.state.brake;
    this.camDistToCar = Math.hypot(Cam.pos.x - c.x, Cam.pos.y - c.y);
    Hi.Car.update(player, c, { lon: this.lon, brake: brake, cockpit: cockpit, camDist: this.camDistToCar });
    // crash: char the car and throw its wings / two wheels off; back on reset
    if (c.exploded && !player.wrecked) Hi.Car.detach(player, this.scene, c);
    else if (!c.exploded && player.wrecked) Hi.Car.reattach(player);
    Hi.Car.updateWreck(player, dt);
    if (CR.Race && CR.Race.active) {
      var ais = CR.Race.ai;
      for (var i = 0; i < ais.length; i++) {
        var a = ais[i], ac = this.carFor(a.model, Hi.Car.NUMBERS[a.driver && a.driver.id]);
        var dist = Math.hypot(Cam.pos.x - a.x, Cam.pos.y - a.y);
        if (dist > 900) continue;
        var dec = dt > 0 && a._hiPrevV !== undefined ? (a._hiPrevV - a.v) / dt : 0;
        if (dt > 0) a._hiPrevV = a.v;
        Hi.Car.update(ac, a, { brake: Math.max(0, Math.min(1, (dec - 2) / 10)), camDist: dist });
        this.carsGroup.add(ac.group);
      }
    }

    // Live 3D mirrors (top tier, cockpit view): the scene from the driver's
    // head looking back, every other frame, into a small target the glass shows.
    this.mirrorFrame = (this.mirrorFrame || 0) + 1;
    if (cockpit && player.mirrorGlass && player.mirrorGlass.length && this.mirrorRT && this.mirrorFrame % 2 === 0) this.renderMirror(player, c);

    // Culling (crowd, trees) per cell / stand
    var b = this.built, t = this.tier, fr = this.frustum, cp = cam.position;
    var crowdFar = 150 + 260 * t.crowd, treeFar = 700 + 1100 * t.trees;
    b.stands.crowd.forEach(function (it) {
      var vis = it.sphere.center.distanceTo(cp) < crowdFar + it.sphere.radius && fr.intersectsSphere(it.sphere);
      it.mesh.visible = vis;
      if (it.flags) it.flags.visible = vis;
    });
    var shadowReach = (t.shadowFar || 0) + 60;
    b.trees.cells.forEach(function (it) {
      var d = it.sphere.center.distanceTo(cp) - it.sphere.radius;
      it.mesh.visible = d < treeFar && fr.intersectsSphere(it.sphere);
      // only nearby cells cast into the cascades; far cells are thinned (LOD)
      it.mesh.castShadow = it.kind !== 'bush' && d < shadowReach;
      it.mesh.count = Math.floor(it.full * t.trees * (d > 650 ? 0.45 : d > 350 ? 0.75 : 1));
    });
    b.stands.uniforms.uTime.value += dt;
    b.sky.material.uniforms.time.value += dt;
    Hi.Track.update(this, b.track, realDt || dt);
    this.playerCar = player;
    Hi.Fx.update(this.fx, this, dt);

    // Shadows follow the view (CSM on a symmetric proxy of the off-centre camera)
    if (this.csm) {
      var px = this.proxy, vh = Math.max(cy, h - cy) / F, hh = (w / 2) / F;
      var fov = 2 * Math.atan(vh) * 180 / Math.PI, aspect = hh / vh;
      var pk = fov.toFixed(1) + '|' + aspect.toFixed(3) + '|' + near;
      px.position.copy(cam.position); px.quaternion.copy(cam.quaternion);
      px.updateMatrixWorld(true);
      if (pk !== this.proxyKey) {
        px.fov = fov; px.aspect = aspect; px.near = near; px.far = far;
        px.updateProjectionMatrix();
        this.csm.updateFrustums();
        this.proxyKey = pk;
      }
      this.csm.update();
    }

    // Post uniforms
    var U = this.post.uniforms;
    U.time.value += realDt || 0.016;
    U.blurCenter.value.set(0.5, Math.max(0.2, Math.min(0.9, 1 - Cam.horizonY / h)));
    U.blurAmount.value = finish ? 0 : (chase ? 0.085 : 0.055) * Math.pow(sf, 1.35);
    U.speedLines.value = finish ? 0 : Math.max(0, Math.min(1, (c.speed - 58) / 30)) * 0.8;
    U.vignette.value = 0.32 + 0.28 * sf;
    U.flash.value = Math.max(0, this.fx.flash) * 0.9;
    // sun on screen for the flare
    var sd = Hi.Env.sunDir(this.theme);
    tmpV.copy(cam.position).addScaledVector(sd, 1000).project(cam);
    var front = tmpV2.set(0, 0, -1).applyQuaternion(cam.quaternion).dot(sd) > 0;
    U.sunPos.value.set((tmpV.x + 1) / 2, (tmpV.y + 1) / 2, front ? 1 : 0);
    U.flare.value = this.flareBase;
    // keep the car itself sharp: no motion blur over it, only round it
    if (chase && !c.exploded) {
      tmpV.set(c.x, 0.45, -c.y).project(cam);
      U.carPos.value.set((tmpV.x + 1) / 2, (tmpV.y + 1) / 2);
      U.carRadius.value = Math.min(0.45, 2.6 * F / (Math.max(4, this.camDistToCar) * h));
    } else U.carRadius.value = 0;

    // Draw: background (sky, mountains, city) then the scene, into the HDR target.
    r.setRenderTarget(this.post.targets.scene);
    r.autoClear = false;
    r.clear(true, true, false);
    r.render(this.bgScene, bg);
    r.clearDepth();
    r.render(this.scene, cam);
    this.post.finish();
  };

  // --- Mirrors -------------------------------------------------------------------------------
  P.ensureMirrorRT = function () {
    if (this.mirrorRT) return;
    var opts = { type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.mirrorRT = new THREE.WebGLRenderTarget(560, 96, opts);
    this.mirrorRT.texture.generateMipmaps = false;
    if (!this.hdr) this.mirrorRT.texture.encoding = THREE.sRGBEncoding;
    this.mirrorTex = this.mirrorRT.texture;
    // same lens as cockpit.js renderMirrorImage: focal 2.1 x height, 1.5 deg down
    this.mirrorCam = new THREE.PerspectiveCamera(2 * Math.atan(0.5 / 2.1) * 180 / Math.PI, 560 / 96, 0.2, 1500);
  };

  P.renderMirror = function (player, c) {
    var r = this.renderer, eye = CR.Camera.EYE, back = c.heading + Math.PI, mc = this.mirrorCam;
    var ex = c.x + Math.cos(c.heading) * eye.forward, ey = c.y + Math.sin(c.heading) * eye.forward;
    mc.position.set(ex, eye.height, -ey);
    var p = 1.5 * Math.PI / 180;
    mc.lookAt(ex + Math.cos(back) * Math.cos(p), eye.height - Math.sin(p), -(ey + Math.sin(back) * Math.cos(p)));
    mc.updateMatrixWorld(true);
    // own car: only the rear tyres show (as 낮음 does); the cockpit is hidden
    var hideCk = player.cockpit && player.cockpit.visible;
    if (hideCk) player.cockpit.visible = false;
    var rear = player.wheels.filter(function (w) { return !w.front; });
    rear.forEach(function (w) { w.pivot.visible = true; });
    var autoSh = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.mirrorRT);
    r.autoClear = false;
    r.clear(true, true, false);
    this.built.sky.position.copy(mc.position);
    r.render(this.bgScene, mc);
    r.clearDepth();
    r.render(this.scene, mc);
    r.shadowMap.autoUpdate = autoSh;
    this.built.sky.position.copy(this.camera.position);
    rear.forEach(function (w) { w.pivot.visible = !player.hidden; });
    if (hideCk) player.cockpit.visible = true;
  };

  // --- Car previews for the menu (studio render of the 높음 car) -------------------------------
  P.ensureStudio = function () {
    if (this.studio) return this.studio;
    var prev = this.scope;
    this.useScope('global');
    var sc = new THREE.Scene();
    sc.background = new THREE.Color('#2a2e37'); // clear colour is written as is (matches the card)
    sc.add(new THREE.HemisphereLight(0xdfe7f2, 0x2a2d33, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 5, 4); sc.add(key);
    var rim = new THREE.DirectionalLight(0xbfd4ff, 1.6); rim.position.set(-4, 3, -3); sc.add(rim);
    // soft studio reflections: a dark room with three light panels
    var room = new THREE.Scene();
    room.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.BackSide })));
    [[0, 6, 0, 10, 0.2, 4], [7, 3, 3, 0.2, 3, 6], [-7, 3, -3, 0.2, 3, 6]].forEach(function (q) {
      var pm = new THREE.Mesh(new THREE.BoxGeometry(q[3], q[4], q[5]), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      pm.position.set(q[0], q[1], q[2]); room.add(pm);
    });
    var pmrem = new THREE.PMREMGenerator(this.renderer);
    this.studioEnv = pmrem.fromScene(room, 0, 0.1, 50);
    pmrem.dispose();
    room.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    sc.environment = this.studioEnv.texture;
    this.studio = { scene: sc, camera: new THREE.PerspectiveCamera(28, 1.8, 0.1, 60), holder: new THREE.Group() };
    sc.add(this.studio.holder);
    this.scope = prev; this.textures = prev.tex;
    return this.studio;
  };

  P.previewCar = function (model) {
    var c = this.previewCars.get(model);
    if (c) return c;
    var id = null;
    (CR.Cars.list || []).forEach(function (k) { if (k.model === model) id = k.id; });
    if (!id && CR.Race && CR.Race.DRIVERS) CR.Race.DRIVERS.forEach(function (d) { if (d.model === model) id = d.id; });
    var prev = this.scope, self = this;
    this.useScope('cars');
    // own set of shared materials (the race cars' ones carry the cascade setup)
    var keys = ['carShared', 'intakeMat', 'rimMat', 'tubMat', 'suitMat', 'strapMat', 'padMat', 'boltMat', 'seamMat', 'btnMat', 'mirrorGlassMat', 'sticker-E', 'sticker-F'];
    var saved = {};
    keys.forEach(function (k) { saved[k] = self[k]; self[k] = self.pvCache ? self.pvCache[k] : null; });
    this.previewMode = true;
    try {
      c = Hi.Car.create(this, model, { number: id ? Hi.Car.NUMBERS[id] : null, detail: 2 });
    } finally {
      this.previewMode = false;
      this.pvCache = {};
      keys.forEach(function (k) { self.pvCache[k] = self[k]; self[k] = saved[k]; });
    }
    this.scope.roots.push(c.group);
    this.scope = prev; this.textures = prev.tex;
    c.wheels.forEach(function (w) { if (w.front) w.pivot.rotation.y = 0.3; w.sharp.forEach(function (d) { d.visible = true; }); });
    this.previewCars.set(model, c);
    return c;
  };

  // Renders `model` (turntable angle, rad) at pw x ph pixels. onCanvas: draw
  // straight onto the (hidden) game canvas and return where to copy from (menu
  // turntable); otherwise render off-screen and return the pixels.
  P.renderPreview = function (model, pw, ph, angle, onCanvas) {
    var r = this.renderer, st = this.ensureStudio(), car = this.previewCar(model);
    st.holder.add(car.group);
    car.group.position.set(0, 0, 0);
    car.group.rotation.set(0, angle, 0);
    car.group.updateMatrixWorld(true);
    // frame the car: fit ~5 m (length seen at three-quarters) across the width
    var cam = st.camera, s = car.scale, aspect = pw / ph;
    cam.aspect = aspect;
    cam.fov = 26;
    cam.updateProjectionMatrix();
    var halfV = Math.tan(cam.fov * Math.PI / 360), halfH = halfV * aspect;
    var dist = Math.max(2.45 * s / halfH, 1.25 / halfV);
    cam.position.set(0.12 * dist, 0.36 * dist, dist);
    cam.lookAt(0, 0.32, 0);
    var prevTM = r.toneMapping, prevEnc = r.outputEncoding, prevExp = r.toneMappingExposure, prevClear = r.autoClear;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputEncoding = THREE.sRGBEncoding;
    r.autoClear = true;
    var out;
    if (onCanvas) {
      var cw = r.domElement.width, chh = r.domElement.height;
      var ss = Math.min(2, cw / pw, chh / ph); // supersample, then the copy scales down
      pw = Math.floor(pw * ss); ph = Math.floor(ph * ss);
      r.setRenderTarget(null);
      r.setViewport(0, 0, pw, ph); r.setScissor(0, 0, pw, ph); r.setScissorTest(true);
      r.render(st.scene, cam);
      r.setScissorTest(false);
      r.setViewport(0, 0, cw, chh);
      out = { source: r.domElement, sx: 0, sy: chh - ph, sw: pw, sh: ph };
    } else {
      var rt = this.previewRT;
      if (!rt || rt.width !== pw || rt.height !== ph) {
        if (rt) rt.dispose();
        rt = this.previewRT = (this.webglVersion === 2 && THREE.WebGLMultisampleRenderTarget) ? new THREE.WebGLMultisampleRenderTarget(pw, ph) : new THREE.WebGLRenderTarget(pw, ph);
        if (this.webglVersion === 2) rt.samples = 4;
        rt.texture.encoding = THREE.sRGBEncoding;
        rt.texture.generateMipmaps = false;
      }
      r.setRenderTarget(rt);
      r.render(st.scene, cam);
      var px = new Uint8Array(pw * ph * 4);
      r.readRenderTargetPixels(rt, 0, 0, pw, ph, px);
      r.setRenderTarget(null);
      var img = new ImageData(pw, ph), row = pw * 4; // flip rows: GL origin is bottom-left
      for (var y = 0; y < ph; y++) img.data.set(px.subarray((ph - 1 - y) * row, (ph - y) * row), y * row);
      out = img;
    }
    r.toneMapping = prevTM; r.outputEncoding = prevEnc; r.toneMappingExposure = prevExp; r.autoClear = prevClear;
    st.holder.remove(car.group);
    return out;
  };

  // --- Size / quality -----------------------------------------------------------------------
  P.resize = function () {
    if (!this.renderer) return;
    var w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w; this.cssH = h;
    var t = this.tier;
    var dpr = Math.min(window.devicePixelRatio || 1, t.dprCap);
    if (this.opts.mobileDprCap) dpr = Math.min(dpr, this.opts.mobileDprCap);
    if (w * h * dpr * dpr > t.maxPixels) dpr = Math.sqrt(t.maxPixels / (w * h));
    var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    this.renderer.setSize(pw, ph, false);
    this.post.setSize(Math.max(1, Math.round(pw * t.scale)), Math.max(1, Math.round(ph * t.scale)));
    this.proxyKey = '';
  };

  P.setQuality = function (tier, index) {
    this.tier = tier;
    if (index !== undefined) this.tierIndex = index;
    this.disposeCars(); // rebuilt lazily with this tier's car / cockpit detail
    this.post.configure(tier, this.webglVersion === 2);
    this.resize();
    this.setupShadows();
    this.applyCounts();
    Hi.Fx.setQuality(this.fx, tier.particles);
  };

  P.explode = function (car) { if (this.fx) Hi.Fx.explode(this.fx, car); };
  P.resetEffects = function () { if (this.fx) Hi.Fx.reset(this.fx); };

  P.info = function () {
    var r = this.renderer;
    return { webgl: this.webglVersion, hdr: this.hdr, tier: this.tier.id, calls: r.info.render.calls, triangles: r.info.render.triangles,
      geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs ? r.info.programs.length : 0,
      size: [this.renderer.domElement.width, this.renderer.domElement.height], internal: [this.post.w, this.post.h] };
  };

  P.dispose = function () {
    this.disposing = true;
    if (this.canvas && this.onLost) this.canvas.removeEventListener('webglcontextlost', this.onLost, false);
    if (!this.renderer) return;
    this.disposeCars();
    this.disposeScope('track');
    if (this.csm) {
      this.csm.remove();
      this.csm.lights.forEach(function (l) { if (l.shadow && l.shadow.map) l.shadow.map.dispose(); });
      this.csm.dispose();
      this.csm = null;
    }
    this.disposeScope('global');
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    if (this.studioEnv) { this.studioEnv.dispose(); this.studioEnv = null; }
    if (this.studio) { this.studio.scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); this.studio = null; }
    if (this.mirrorRT) { this.mirrorRT.dispose(); this.mirrorRT = null; this.mirrorTex = null; }
    if (this.previewRT) { this.previewRT.dispose(); this.previewRT = null; }
    this.scene.environment = null;
    this.post.dispose();
    this.coneGeo.dispose(); this.blobGeo.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    // free the GL context now (browsers cap live contexts); skip when already lost
    var gl = this.renderer.getContext();
    if (gl && !gl.isContextLost()) { try { this.renderer.forceContextLoss(); } catch (e) { /* ignore */ } }
    this.renderer = null;
    this.scene = this.bgScene = null;
    this.built = null;
  };

  CR.HiRenderer = HiRenderer;
})();

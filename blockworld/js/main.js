// Game core: renderer, sky, input, interaction, spawning, dimensions
'use strict';
const LIGHT_LUT = (() => { const a = new Float32Array(16); for (let i = 0; i < 16; i++) a[i] = Math.pow(i / 15, 1.6) * 0.95 + 0.05 * i / 15; return a; })();
const BLOCK_VS = `
attribute vec2 alight; attribute vec3 acolor;
varying vec2 vUv; varying vec2 vLight; varying vec3 vColor; varying float vDist;
void main(){ vUv = uv; vLight = alight; vColor = acolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = length(mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BLOCK_FS = `
uniform sampler2D map; uniform float uDay; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uSkyTint; uniform float uMin; uniform float uAlpha; uniform float uOpacity;
varying vec2 vUv; varying vec2 vLight; varying vec3 vColor; varying float vDist;
void main(){
  vec4 t = texture2D(map, vUv);
  if (t.a < uAlpha) discard;
  vec3 sky = uSkyTint * (vLight.x * uDay);
  vec3 bl = vec3(1.0, 0.88, 0.7) * vLight.y;
  vec3 l = max(max(sky, bl), vec3(uMin));
  vec3 c = t.rgb * vColor * l;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(c, uFog, f), t.a * uOpacity);
}`;

const GAME = {
  started: false, paused: true, renderDist: 6, fov: 70, sens: 0.0022, time: 1000, daylight: 1, stats: { kills: 0, mined: 0 },
  entities: [], keys: {}, mouse: { l: false, r: false }, camShake: 0, dragonKilled: false, worlds: {}, chunkMeshes: new Map(),
  init() {
    TEX.init();
    TEX.add('particle_white', p => p.fill('#FFFFFF', 0));
    for (let i = 0; i < 10; i++) TEX.add('crack_' + i, G.crack(i));
    registerAll(); registerRecipes(); buildTables();
    Mesher.wheatTiles = [0, 1, 2, 3, 4, 5, 6, 7].map(s => TEX.add('wheat_stage' + s, G.wheat(s)));
    const tex = new THREE.CanvasTexture(TEX.canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    TEX.texture = tex;
    // renderer
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.05, 1000);
    this.camera.rotation.order = 'YXZ';
    this.hudScene = new THREE.Scene(); this.hudCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    const mkMat = (alpha, side, trans) => new THREE.ShaderMaterial({
      vertexShader: BLOCK_VS, fragmentShader: BLOCK_FS, side, transparent: trans, depthWrite: !trans,
      uniforms: { map: { value: tex }, uDay: { value: 1 }, uFog: { value: new THREE.Color() }, uFogNear: { value: 50 }, uFogFar: { value: 90 }, uSkyTint: { value: new THREE.Vector3(1, 1, 1) }, uMin: { value: 0.03 }, uAlpha: { value: alpha }, uOpacity: { value: 1 } },
    });
    this.mats = [mkMat(0.01, THREE.FrontSide, false), mkMat(0.5, THREE.DoubleSide, false), mkMat(0.01, THREE.DoubleSide, true)];
    this.particles = new Particles(this.scene);
    this.buildSky(); this.buildSelection(); this.buildHand();
    window.addEventListener('resize', () => this.resize()); this.resize();
    this.bindInput();
    UI.init();
    this.lastT = performance.now(); this.acc = 0;
    requestAnimationFrame(t => this.frame(t));
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.hudCam.aspect = w / h; this.hudCam.updateProjectionMatrix();
  },
  // ---------------- sky ----------------
  buildSky() {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunset: { value: new THREE.Color(1, 0.5, 0.3) }, sunAmt: { value: 0 }, mode: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunset; uniform float sunAmt; uniform float mode; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          if (mode > 1.5) { vec3 q = floor(vP * 60.0); float n = h(q); vec3 c = mix(vec3(0.06,0.03,0.08), vec3(0.13,0.09,0.15), n); if (n > 0.995) c = vec3(0.55,0.45,0.6); gl_FragColor = vec4(c,1.0); return; }
          float y = max(vP.y, 0.0);
          vec3 c = mix(hor, top, pow(y, 0.55));
          if (vP.y < 0.0) c = mix(hor, hor*0.6, min(1.0, -vP.y*3.0));
          float s = max(dot(normalize(vec3(vP.x,0.0,vP.z)), normalize(vec3(sunDir.x,0.0,sunDir.z))), 0.0);
          c = mix(c, sunset, sunAmt * pow(s, 3.0) * (1.0 - smoothstep(0.0, 0.5, abs(vP.y - 0.05))));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    const sunTex = pixTex(16, 16, c => { c.fillStyle = '#FFF6A0'; c.fillRect(2, 2, 12, 12); c.fillStyle = '#FFFFE8'; c.fillRect(4, 4, 8, 8); });
    const moonTex = pixTex(16, 16, c => { c.fillStyle = '#DDE2EA'; c.fillRect(3, 3, 10, 10); c.fillStyle = '#A8AEB8'; [[5, 5, 2, 2], [9, 8, 2, 3], [6, 10, 1, 1], [10, 4, 1, 1]].forEach(r => c.fillRect(...r)); });
    const mk = (t, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); m.renderOrder = -9; m.frustumCulled = false; this.scene.add(m); return m; };
    this.sun = mk(sunTex, 60); this.moon = mk(moonTex, 40);
    const sg = new THREE.BufferGeometry(); const sp = [];
    const r = mulberry32(42);
    for (let i = 0; i < 1500; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); sp.push(Math.cos(a) * s * 450, u * 450, Math.sin(a) * s * 450); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xFFFFFF, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    this.stars.renderOrder = -9; this.stars.frustumCulled = false; this.scene.add(this.stars);
    const cloudTex = pixTex(64, 64, c => { const rr = mulberry32(7); const n = new Simplex(3); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = n.fbm2(x / 9, y / 9, 2); if (v > 0.15) { c.fillStyle = '#FFFFFF'; c.fillRect(x, y, 1, 1); } } });
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(4, 4);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1536, 1536), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.1 }));
    this.clouds.rotation.x = -Math.PI / 2; this.clouds.renderOrder = -8; this.scene.add(this.clouds);
  },
  updateSky(dt) {
    const P = this.player, dim = this.world.dim;
    const cam = this.camera.position;
    this.sky.position.copy(cam); this.stars.position.copy(cam);
    const u = this.sky.material.uniforms;
    let fogCol;
    if (dim === 'overworld') {
      const ang = (this.time / 24000) * Math.PI * 2;
      const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.15).normalize();
      const sy = sunDir.y;
      this.daylight = 0.2 + 0.8 * smooth(-0.18, 0.22, sy);
      const dayT = smooth(-0.2, 0.3, sy);
      const top = new THREE.Color().lerpColors(new THREE.Color(0x05060F), new THREE.Color(0x6E9EFF), dayT);
      const hor = new THREE.Color().lerpColors(new THREE.Color(0x16122A), new THREE.Color(0xBFD6FF), dayT);
      const sunsetAmt = Math.max(0, 1 - Math.abs(sy) / 0.32);
      u.top.value.copy(top); u.hor.value.copy(hor); u.sunDir.value.copy(sunDir); u.sunAmt.value = sunsetAmt * 0.9; u.mode.value = 0;
      u.sunset.value.setRGB(1, 0.45 + 0.15 * sy, 0.35);
      this.sun.visible = this.moon.visible = true; this.clouds.visible = true;
      this.sun.position.copy(cam).addScaledVector(sunDir, 400); this.sun.lookAt(cam);
      this.moon.position.copy(cam).addScaledVector(sunDir, -400); this.moon.lookAt(cam);
      this.stars.visible = true; this.stars.material.opacity = Math.max(0, 1 - dayT * 1.6);
      this.stars.rotation.z = ang;
      const lookD = P.lookDir(); const toSun = Math.max(0, new THREE.Vector3(lookD.x, 0, lookD.z).normalize().dot(new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize()));
      fogCol = hor.clone().lerp(u.sunset.value, sunsetAmt * 0.6 * toSun * toSun);
      this.clouds.position.set(cam.x, 140, cam.z);
      this.clouds.material.map.offset.set((cam.x / 1536 * 4) + this.time * 0.00002, -(cam.z / 1536 * 4));
      this.clouds.material.color.setRGB(0.25 + 0.75 * this.daylight, 0.25 + 0.75 * this.daylight, 0.3 + 0.7 * this.daylight);
      this.skyTint = new THREE.Vector3(1, 1, 1).lerp(new THREE.Vector3(0.6, 0.65, 1.0), 1 - dayT).lerp(new THREE.Vector3(1.1, 0.85, 0.75), sunsetAmt * 0.5);
      this.minLight = 0.025;
    } else if (dim === 'nether') {
      fogCol = new THREE.Color(0x3A0E0A); u.top.value.copy(fogCol); u.hor.value.copy(fogCol); u.sunAmt.value = 0; u.mode.value = 0;
      this.sun.visible = this.moon.visible = this.stars.visible = this.clouds.visible = false;
      this.daylight = 0; this.skyTint = new THREE.Vector3(1, 1, 1); this.minLight = 0.3;
    } else {
      fogCol = new THREE.Color(0x0E0A12); u.mode.value = 2;
      this.sun.visible = this.moon.visible = this.stars.visible = this.clouds.visible = false;
      this.daylight = 0; this.skyTint = new THREE.Vector3(1, 1, 1); this.minLight = 0.55;
    }
    // fog
    const far = this.renderDist * 16;
    let near = far * 0.55, ffar = far - 6;
    const headId = this.world.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    this.underwater = LIQ[headId] === 1; this.inLavaView = LIQ[headId] === 2;
    if (dim === 'nether') { near = 8; ffar = Math.min(far, 70); }
    if (this.underwater) { fogCol = new THREE.Color(0x10306A).multiplyScalar(0.3 + 0.7 * this.daylight); near = 1; ffar = 28; }
    if (this.inLavaView) { fogCol = new THREE.Color(0xC04A08); near = 0; ffar = 2.5; }
    this.renderer.setClearColor(fogCol);
    for (const m of this.mats) {
      const mu = m.uniforms;
      mu.uDay.value = this.daylight; mu.uFog.value.copy(fogCol); mu.uFogNear.value = near; mu.uFogFar.value = ffar; mu.uSkyTint.value.copy(this.skyTint); mu.uMin.value = this.minLight;
    }
    this.fogCol = fogCol;
    this.skyVisible = !this.underwater && !this.inLavaView;
    this.sky.visible = this.skyVisible;
    if (!this.skyVisible) { this.sun.visible = this.moon.visible = this.stars.visible = false; }
  },
  lightAt(x, y, z) {
    const L = this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    const s = LIGHT_LUT[L >> 4] * this.daylight, b = LIGHT_LUT[L & 15];
    const t = this.skyTint || { x: 1, y: 1, z: 1 };
    const o = this._lc || (this._lc = { r: 1, g: 1, b: 1 });
    o.r = Math.max(s * t.x, b, this.minLight || 0.03) * 1.0; o.g = Math.max(s * t.y, b * 0.88, this.minLight || 0.03); o.b = Math.max(s * t.z, b * 0.7, this.minLight || 0.03);
    return o;
  },
  // ---------------- selection & crack & hand ----------------
  buildSelection() {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selBox = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    this.selBox.visible = false; this.scene.add(this.selBox);
    this.crackGeo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.crack = new THREE.Mesh(this.crackGeo, new THREE.MeshBasicMaterial({ map: TEX.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, color: 0x000000, opacity: 0.85 }));
    this.crack.visible = false; this.crackStage = -1; this.scene.add(this.crack);
  },
  setCrack(stage) {
    if (stage === this.crackStage) return;
    this.crackStage = stage;
    const u = TEX.uv(TEX.names['crack_' + stage]); const uv = this.crackGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (i % 2 === 0 || i % 4 === 2) && ((i & 1) === 0) ? u[0] : u[2], i % 4 < 2 ? u[3] : u[1]);
    // proper per-vertex mapping for three box (v0 TL, v1 TR, v2 BL, v3 BR)
    for (let f = 0; f < 6; f++) { const o = f * 4; uv.setXY(o, u[0], u[3]); uv.setXY(o + 1, u[2], u[3]); uv.setXY(o + 2, u[0], u[1]); uv.setXY(o + 3, u[2], u[1]); }
    uv.needsUpdate = true;
  },
  buildHand() {
    this.hand = new THREE.Group(); this.hudScene.add(this.hand);
    const skin = pixTex(4, 12, c => noiseFill(c, 4, 12, '#C89A78', 0.06, 9));
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.6), new THREE.MeshBasicMaterial({ map: skin }));
    this.arm.position.set(0.42, -0.42, -0.62); this.arm.rotation.set(0.25, -0.2, 0.15);
    this.hand.add(this.arm);
    this.handItem = null; this.handItemId = -1;
  },
  updateHand(dt) {
    const P = this.player;
    const s = P.held();
    const id = s ? s.id : 0;
    if (id !== this.handItemId) {
      if (this.handItem) { this.hand.remove(this.handItem); this.handItem = null; }
      this.handItemId = id;
      if (id) {
        const m = itemMesh(id);
        const it = ITEMS[id];
        const isBlock = it.block && BLOCKS[it.block].shape !== 'cross';
        if (isBlock) { m.scale.setScalar(0.32); m.position.set(0.42, -0.36, -0.62); m.rotation.set(0.2, 0.7, 0); }
        else { m.scale.setScalar(0.42); m.position.set(0.44, -0.3, -0.66); m.rotation.set(0.05, -0.55, 0.12); if (it.tool || it.bow) { m.rotation.set(0.1, -0.7, 0.25); m.position.set(0.46, -0.24, -0.66); } }
        this.handItem = m; this.hand.add(m);
      }
      this.arm.visible = !id;
      this.equipT = 0.3;
    }
    if (this.equipT > 0) this.equipT -= dt;
    const sw = P.swing > 0 ? Math.sin((1 - P.swing) * Math.PI) : 0;
    const bob = this.bobT || 0;
    const moving = Math.hypot(P.vel.x, P.vel.z) > 0.5 && P.onGround;
    const bx = moving ? Math.sin(bob) * 0.025 : 0, by = moving ? -Math.abs(Math.cos(bob)) * 0.025 : 0;
    this.hand.position.set(bx - sw * 0.15, by + sw * 0.08 - (this.equipT > 0 ? this.equipT : 0), -sw * 0.15);
    this.hand.rotation.set(-sw * 0.9, sw * 0.4, -sw * 0.2);
    if (P.eating > 0) { this.hand.position.y += Math.sin(P.eating * 25) * 0.03 + 0.05; this.hand.position.x -= 0.15; this.hand.rotation.y = 0.4; }
    if (P.bowCharge > 0) { this.hand.position.x -= 0.18; this.hand.position.z -= Math.min(1, P.bowCharge) * 0.1; this.hand.rotation.z = 0.3; }
    const c = this.lightAt(P.pos.x, P.pos.y + 1.4, P.pos.z);
    this.hand.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.color.setRGB(c.r, c.g, c.b)); });
  },
  // ---------------- world lifecycle ----------------
  newGame(seedStr, mode) {
    this.seed = strSeed(seedStr || String(Date.now() % 1e9));
    this.seedStr = seedStr || String(this.seed);
    this.worlds = {};
    this.player = new Player(); this.player.mode = mode;
    this.time = 1000; this.dragonKilled = false; this.dragon = null; this.stats = { kills: 0, mined: 0 };
    this.setWorld('overworld');
    const sp = this.findSpawn();
    this.player.spawn = sp.clone();
    this.player.pos.copy(sp);
    if (mode === 'creative') this.player.flying = false;
    this.started = true; this.loading = true;
    UI.showLoading(true);
    // starter: give nothing in survival (authentic), creative has creative inventory
  },
  setWorld(dim) {
    for (const e of this.entities) if (e !== this.player) { if (e.mesh) this.scene.remove(e.mesh); if (e.remove) e.removed = true; if (e.beam) this.scene.remove(e.beam); if (e.headG) { this.scene.remove(e.headG); e.neck.forEach(n => this.scene.remove(n)); e.tail.forEach(n => this.scene.remove(n)); } }
    this.entities = [];
    for (const [k, m] of this.chunkMeshes) this.disposeChunkMesh(m);
    this.chunkMeshes.clear();
    if (this.world) for (const c of this.world.chunks.values()) c.dirty = true;
    if (!this.worlds[dim]) this.worlds[dim] = new World(dim, this.seed);
    this.world = this.worlds[dim];
    this.world.onContainerBreak = (x, y, z, data) => { for (const s of (data.slots || [])) if (s) this.dropItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count, s.dur); };
    this.dragon = null;
    if (dim === 'end') this.setupEnd();
  },
  findSpawn() {
    const w = this.world;
    for (let r = 0; r < 400; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a / 8 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 8 * Math.PI * 2) * r);
        const [h, b] = w.gen.column(x, z);
        if (h > SEA + 1 && b !== 0 && b !== 11 && b !== 14) { w.ensureChunk(x >> 4, z >> 4); const y = w.highestSolid(x, z); if (y > SEA) return new THREE.Vector3(x + 0.5, y + 1, z + 0.5); }
      }
    }
    return new THREE.Vector3(0.5, 90, 0.5);
  },
  setupEnd() {
    const w = this.world;
    for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) w.ensureChunk(cx, cz);
    if (!this.dragonKilled) {
      for (const p of w.gen.pillars) {
        const top = w.highestSolid(p.x, p.z);
        this.addEntity(new EndCrystal(p.x + 0.5, top + 1, p.z + 0.5));
      }
      this.dragon = new Dragon(40, 80, 0); this.addEntity(this.dragon);
      UI.boss(true);
    } else UI.boss(false);
  },
  onDragonDeath() {
    this.dragonKilled = true; this.dragon = null; UI.boss(false);
    const w = this.world; let top = 60;
    for (let y = CH - 1; y > 0; y--) if (w.getBlock(0, y, 0) === BID.end_stone) { top = y; break; }
    const y0 = top + 1;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 3.5) continue;
      w.setBlock(dx, y0 - 1, dz, BID.bedrock);
      if (d > 2.5) w.setBlock(dx, y0, dz, BID.bedrock);
      else w.setBlock(dx, y0, dz, (dx === 0 && dz === 0) ? BID.bedrock : BID.end_portal);
      for (let y = y0 + 1; y < y0 + 4; y++) if (!(dx === 0 && dz === 0)) w.setBlock(dx, y, dz, 0);
    }
    for (let y = y0 + 1; y < y0 + 4; y++) w.setBlock(0, y, 0, BID.bedrock);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.setBlock(dx, y0 + 2, dz, BID.end_rod);
    w.setBlock(0, y0 + 4, 0, BID.dragon_egg);
    UI.toast('엔더 드래곤을 물리쳤습니다! 가운데 차원문으로 돌아가세요.', 6);
    this.sound('win');
  },
  // ---------------- entities ----------------
  addEntity(e) { this.entities.push(e); return e; },
  hitTargets() { return this.entities.filter(e => e instanceof Mob || e instanceof EndCrystal || e instanceof Dragon || e === this.player); },
  dropItem(x, y, z, id, count = 1, dur) { if (!ITEMS[id] || count <= 0) return; this.addEntity(new ItemEntity(x, y, z, id, count, dur)); },
  dropXP(x, y, z, v) { while (v > 0) { const k = v > 50 ? 50 : v > 10 ? 10 : v > 3 ? 3 : 1; this.addEntity(new XPOrb(x, y, z, k)); v -= k; } },
  spawnFalling(x, y, z, id) { this.addEntity(new FallingBlock(x, y, z, id)); },
  primeTNT(x, y, z, fuse = 4) { this.world.setBlock(x, y, z, 0); this.addEntity(new PrimedTNT(x, y, z, fuse)); },
  explode(x, y, z, power, fire, breakBlocks) {
    const w = this.world, r = power * 1.3;
    this.sound('explode', { x, y, z });
    this.particles.explosion(x, y, z, Math.max(1, power * 0.6));
    if (breakBlocks) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > r * (0.7 + Math.random() * 0.3)) continue;
        const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
        const id = w.getBlock(bx, by, bz); if (!id) continue;
        const b = BLOCKS[id];
        if (b.hard < 0 || (b.blast || 0) >= 1000 || LIQ[id]) continue;
        if (id === BID.end_stone && power < 4) continue;
        if (id === BID.tnt) { w.setBlock(bx, by, bz, 0); this.addEntity(new PrimedTNT(bx, by, bz, 0.5 + Math.random())); continue; }
        w.setBlock(bx, by, bz, 0);
        if (Math.random() < 1 / power) this.dropBlockLoot(bx, by, bz, id, null, true);
        if (fire && Math.random() < 0.3 && FULL[w.getBlock(bx, by - 1, bz)]) w.setBlock(bx, by, bz, BID.fire);
      }
    }
    for (const e of this.entities.concat([this.player])) {
      if (e.dead || !(e instanceof Mob || e === this.player || e instanceof ItemEntity || e instanceof EndCrystal)) continue;
      const ex = e.pos.x - x, ey = e.pos.y + e.h / 2 - y, ez = e.pos.z - z;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d > power * 2) continue;
      const imp = 1 - d / (power * 2);
      const dmg = Math.floor((imp * imp + imp) / 2 * 7 * power * 2 + 1);
      if (e instanceof ItemEntity) { if (Math.random() < 0.5) e.remove(); continue; }
      if (e instanceof EndCrystal) { if (d < power * 1.2) e.damage(1); continue; }
      e.invuln = 0;
      e.damage(dmg, 'explosion');
      const k = imp * 14 / Math.max(0.5, d);
      e.vel.x += ex * k; e.vel.y += Math.max(3, ey * k + 4) * imp; e.vel.z += ez * k;
    }
    this.camShake = Math.max(this.camShake, 0.4);
  },
  dropBlockLoot(x, y, z, id, tool, natural) {
    const b = BLOCKS[id]; if (!b) return;
    if (this.player.mode === 'creative' && !natural) return;
    if (b.req && !natural && !(tool && tool.type === b.tool && tool.tier >= b.tier)) return;
    let dropName = b.drop, n = 1;
    if (b.leaves) {
      const r = Math.random();
      if (tool && tool.type === 'shears') { dropName = b.name; }
      else if (r < 0.05) dropName = b.leaves + '_sapling';
      else if (r < 0.07) dropName = 'stick';
      else if (r < 0.075 && (b.leaves === 'oak' || b.leaves === 'dark_oak')) dropName = 'apple';
      else return;
    }
    if (b.glass || id === BID.ice) return;
    if (id === BID.wheat_crop) { const m = this.world.getMeta(x, y, z); if (m >= 7) { this.dropItem(x + 0.5, y + 0.5, z + 0.5, IID.wheat, 1); this.dropItem(x + 0.5, y + 0.5, z + 0.5, IID.wheat_seeds, 1 + ((Math.random() * 3) | 0)); } else this.dropItem(x + 0.5, y + 0.5, z + 0.5, IID.wheat_seeds, 1); return; }
    if (b.flint && Math.random() < 0.1) dropName = 'flint';
    if (b.dropChance !== undefined && Math.random() > b.dropChance) return;
    if (b.web && !(tool && (tool.type === 'sword' || tool.type === 'shears'))) return;
    if (tool && tool.type === 'shears' && (b.name === 'short_grass' || b.name === 'fern' || b.name === 'cobweb' || b.name === 'dead_bush')) dropName = b.name;
    if (!dropName) return;
    if (b.dropN) n = b.dropN[0] + Math.floor(Math.random() * (b.dropN[1] - b.dropN[0] + 1));
    if (n > 0 && IID[dropName] !== undefined) this.dropItem(x + 0.5, y + 0.3, z + 0.5, IID[dropName], n);
    if (b.xp && !natural) this.dropXP(x + 0.5, y + 0.5, z + 0.5, b.xp[0] + Math.floor(Math.random() * (b.xp[1] - b.xp[0] + 1)));
  },
  growTree(x, y, z, sapId) {
    const type = BLOCKS[sapId].name.replace('_sapling', '');
    const w = this.world;
    for (let k = 1; k < 6; k++) { const id = w.getBlock(x, y + k, z); if (id && !BLOCKS[id].leaves) return false; }
    w.setBlock(x, y, z, 0);
    const set = (lx, ly, lz, id) => { const cur = w.getBlock(lx, ly, lz); if (!cur || BLOCKS[cur].replaceable || BLOCKS[cur].leaves || cur === sapId) w.setBlock(lx, ly, lz, id, 0, false); };
    const get = (lx, ly, lz) => { const id = w.getBlock(lx, ly, lz); return id && !BLOCKS[id].replaceable ? id : 0; };
    Trees.grow(type, set, get, x, y, z, Math.random);
    return true;
  },
  sound(name, pos, blockId) {
    if (name === 'block_place' || name === 'block_break' || name === 'block_step' || name === 'block_hit') {
      const b = BLOCKS[blockId]; if (!b) return;
      Sound.material(b.sound, name === 'block_hit' ? 0.35 : name === 'block_step' ? 1 : 0.9, pos, name === 'block_step');
      return;
    }
    Sound.play(name, pos);
  },
  // ---------------- chunk management ----------------
  disposeChunkMesh(m) { for (const mesh of m) if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); } },
  buildChunkMesh(c) {
    const old = this.chunkMeshes.get(c.cx + ',' + c.cz);
    if (old) this.disposeChunkMesh(old);
    const bufs = Mesher.build(this.world, c);
    const meshes = bufs.map((b, i) => {
      if (!b.n) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('alight', new THREE.Float32BufferAttribute(b.light, 2));
      g.setAttribute('acolor', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mats[i]);
      m.position.set(c.cx * CS, 0, c.cz * CS);
      m.renderOrder = i === 2 ? 2 : 0;
      this.scene.add(m);
      return m;
    });
    this.chunkMeshes.set(c.cx + ',' + c.cz, meshes);
    c.dirty = false;
  },
  updateChunks(budgetMs) {
    const w = this.world, P = this.player;
    const pcx = Math.floor(P.pos.x / 16), pcz = Math.floor(P.pos.z / 16), R = this.renderDist;
    const t0 = performance.now();
    // generation (spiral by distance)
    if (!this.spiral || this.spiralR !== R) {
      this.spiralR = R; this.spiral = [];
      for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) if (dx * dx + dz * dz <= (R + 1.5) * (R + 1.5)) this.spiral.push([dx, dz, dx * dx + dz * dz]);
      this.spiral.sort((a, b) => a[2] - b[2]);
    }
    let gen = 0, missing = 0;
    for (const [dx, dz] of this.spiral) {
      if (!w.getChunk(pcx + dx, pcz + dz)) {
        missing++;
        if (performance.now() - t0 < budgetMs * 0.6 || gen === 0) { w.ensureChunk(pcx + dx, pcz + dz); gen++; }
      }
    }
    // meshing
    for (const [dx, dz, d2] of this.spiral) {
      if (d2 > R * R + 1) continue;
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (!c || !c.dirty) continue;
      if (!w.getChunk(c.cx + 1, c.cz) || !w.getChunk(c.cx - 1, c.cz) || !w.getChunk(c.cx, c.cz + 1) || !w.getChunk(c.cx, c.cz - 1)) continue;
      if (performance.now() - t0 > budgetMs && !(d2 <= 2)) break;
      this.buildChunkMesh(c);
    }
    // unload
    if ((this.frameN || 0) % 60 === 0) {
      for (const c of [...w.chunks.values()]) {
        if (Math.abs(c.cx - pcx) > R + 3 || Math.abs(c.cz - pcz) > R + 3) {
          const k = c.cx + ',' + c.cz; const m = this.chunkMeshes.get(k);
          if (m) { this.disposeChunkMesh(m); this.chunkMeshes.delete(k); }
          w.unloadChunk(c);
        }
      }
      for (const [k, m] of this.chunkMeshes) { const [cx, cz] = k.split(',').map(Number); if (Math.abs(cx - pcx) > R + 1 || Math.abs(cz - pcz) > R + 1) { this.disposeChunkMesh(m); this.chunkMeshes.delete(k); const c = w.getChunk(cx, cz); if (c) c.dirty = true; } }
    }
    this.missing = missing;
    return missing;
  },
  // ---------------- input ----------------
  bindInput() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => { if (this.started && !UI.open && !this.player.dead) this.lock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.started && !UI.open && !this.player.dead && !this.ignoreUnlock) UI.pause(true);
      this.ignoreUnlock = false;
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      const P = this.player;
      P.yaw -= e.movementX * this.sens; P.pitch -= e.movementY * this.sens;
      P.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, P.pitch));
    });
    document.addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.l = true; this.attackClick = true; }
      if (e.button === 2) { this.mouse.r = true; this.useClick = true; this.useRepeat = 0; }
      if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) { this.mouse.r = false; this.releaseUse(); }
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('wheel', e => {
      if (!this.locked) return;
      const P = this.player; P.sel = (P.sel + (e.deltaY > 0 ? 1 : 8)) % 9; UI.dirty = true;
    }, { passive: true });
    document.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.code;
      if (k === 'Tab' || k === 'F3' || k === 'F5' || k === 'F1' || (k === 'Space' && this.locked)) e.preventDefault();
      if (!this.started) return;
      if (UI.open) { if (k === 'KeyE' || k === 'Escape') { UI.close(); } return; }
      if (this.player.dead) return;
      if (!this.locked) return;
      if (!this.keys[k]) this.onKeyPress(k);
      this.keys[k] = true;
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.l = this.mouse.r = false; });
  },
  lock() {
    const c = this.renderer.domElement;
    try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { }
    Sound.init();
  },
  unlock() { this.ignoreUnlock = true; if (document.pointerLockElement) document.exitPointerLock(); },
  onKeyPress(k) {
    const P = this.player, now = performance.now();
    if (k.startsWith('Digit')) { const n = +k.slice(5); if (n >= 1 && n <= 9) { P.sel = n - 1; UI.dirty = true; } }
    if (k === 'KeyE') { UI.openScreen(P.mode === 'creative' ? 'creative' : 'inventory'); }
    if (k === 'KeyQ') this.dropHeld(this.keys.ControlLeft);
    if (k === 'F5') this.thirdPerson = ((this.thirdPerson || 0) + 1) % 3;
    if (k === 'F3') UI.toggleDebug();
    if (k === 'F1') UI.toggleHud();
    if (k === 'KeyR' && P.mode === 'creative') { this.time = (this.time + 6000) % 24000; UI.toast('시간 +6시간'); }
    if (k === 'Space') {
      if ((P.mode === 'creative' || P.mode === 'spectator') && now - (this.lastSpace || 0) < 300) { P.flying = !P.flying; P.vel.y = 0; this.lastSpace = 0; }
      else this.lastSpace = now;
    }
    if (k === 'KeyW') { if (now - (this.lastW || 0) < 280 && P.food > 6) P.sprinting = true; this.lastW = now; }
  },
  dropHeld(all) {
    const P = this.player, s = P.held(); if (!s) return;
    const n = all ? s.count : 1;
    const eye = P.eyePos(), d = P.lookDir();
    const e = new ItemEntity(eye.x + d.x * 0.3, eye.y - 0.3, eye.z + d.z * 0.3, s.id, n, s.dur);
    e.vel.set(d.x * 6, d.y * 6 + 2, d.z * 6); e.pickDelay = 1.5; this.addEntity(e);
    if (P.mode !== 'creative' || true) { s.count -= n; if (s.count <= 0) P.inv[P.sel] = null; }
    UI.dirty = true; P.swing = 1;
  },
  pickBlock() {
    const hit = this.raycast(); if (!hit || !hit.block) return;
    let id = hit.id;
    const b = BLOCKS[id];
    if (b.noItem) { id = IID[b.drop] || 0; if (id === BID.lit_furnace) id = BID.furnace; }
    if (!ITEMS[id]) return;
    const P = this.player;
    for (let i = 0; i < 9; i++) if (P.inv[i] && P.inv[i].id === id) { P.sel = i; UI.dirty = true; return; }
    if (P.mode === 'creative') { P.inv[P.sel] = { id, count: 64 }; UI.dirty = true; }
    else for (let i = 9; i < 36; i++) if (P.inv[i] && P.inv[i].id === id) { const t = P.inv[P.sel]; P.inv[P.sel] = P.inv[i]; P.inv[i] = t; UI.dirty = true; return; }
  },
  // ---------------- raycast ----------------
  selBoxOf(id) {
    const b = BLOCKS[id];
    if (b.shape === 'cross') return id === BID.short_grass || id === BID.fern ? [0.15, 0, 0.15, 0.85, 0.8, 0.85] : [0.2, 0, 0.2, 0.8, 0.85, 0.8];
    if (b.shape === 'box') return b.box;
    if (b.shape === 'pane') return [0, 0, 0.375, 1, 1, 0.625];
    return [0, 0, 0, 1, 1, 1];
  },
  raycast(reach, liquids) {
    const P = this.player;
    reach = reach || (P.mode === 'creative' ? 6 : 5);
    const o = P.eyePos(), d = P.lookDir();
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
    let tmx = sx > 0 ? (x + 1 - o.x) * tdx : (o.x - x) * tdx, tmy = sy > 0 ? (y + 1 - o.y) * tdy : (o.y - y) * tdy, tmz = sz > 0 ? (z + 1 - o.z) * tdz : (o.z - z) * tdz;
    let t = 0, n = [0, 0, 0];
    let blockHit = null;
    for (let i = 0; i < 64 && t <= reach; i++) {
      const id = this.world.getBlock(x, y, z);
      if (id && (!LIQ[id] || (liquids && (this.world.getMeta(x, y, z) & 15) === 0)) && id !== BID.barrier_air) {
        const bb = LIQ[id] ? [0, 0, 0, 1, 1, 1] : this.selBoxOf(id);
        const r = rayBox(o, d, x + bb[0], y + bb[1], z + bb[2], x + bb[3], y + bb[4], z + bb[5]);
        if (r && r.t <= reach) { blockHit = { block: true, x, y, z, id, n: r.n, t: r.t, bb }; break; }
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; n = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; n = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; n = [0, 0, -sz]; }
    }
    // entities
    let best = blockHit ? blockHit.t : reach, ent = null;
    for (const e of this.entities) {
      if (e.dead || e.removed || !(e instanceof Mob || e instanceof EndCrystal || e instanceof Fireball || e instanceof Dragon)) continue;
      if (e instanceof Dragon) {
        for (let s = 0; s < best; s += 0.25) { const p = o.clone().addScaledVector(d, s); if (e.hitTest(p, 0)) { if (s < best) { best = s; ent = e; } break; } }
        continue;
      }
      const w = e.w + (e instanceof EndCrystal ? 0.5 : 0.1);
      const r = rayBox(o, d, e.pos.x - w, e.pos.y, e.pos.z - w, e.pos.x + w, e.pos.y + (e.h || 1), e.pos.z + w);
      if (r && r.t < best) { best = r.t; ent = e; }
    }
    if (ent) return { entity: ent, t: best };
    return blockHit;
  },
  // ---------------- interaction ----------------
  breakTime(id) {
    const b = BLOCKS[id], P = this.player;
    if (b.hard < 0) return Infinity;
    const it = P.heldItem(); const tool = it && it.tool;
    let speed = 1;
    const correct = tool && tool.type === b.tool;
    if (correct) speed = tool.speed;
    if (tool && tool.type === 'sword' && b.web) speed = 15;
    if (tool && tool.type === 'shears' && (b.leaves || b.web || b.name.endsWith('_wool'))) speed = b.web ? 15 : 5;
    if (tool && tool.type === 'sword' && (b.leaves || b.cat === CAT.PLANT)) speed = 1.5;
    const can = !b.req || (correct && tool.tier >= b.tier);
    let t = b.hard * (can ? 1.5 : 5) / speed;
    if (!P.onGround && !P.flying && !P.inWater) t *= 5;
    if (P.inWater && !P.onGround) t *= 5;
    return t;
  },
  handleMining(dt, hit) {
    const P = this.player;
    if (!this.mouse.l || !hit || !hit.block) { this.mining = null; this.crack.visible = false; return; }
    const key = hit.x + ',' + hit.y + ',' + hit.z;
    if (P.mode === 'creative') {
      this.creativeCool = (this.creativeCool || 0) - dt;
      if (this.creativeCool <= 0) {
        const it = P.heldItem();
        if (it && it.tool && it.tool.type === 'sword') return;
        this.breakBlock(hit.x, hit.y, hit.z, hit.id); this.creativeCool = 0.2;
      }
      return;
    }
    if (!this.mining || this.mining.key !== key) this.mining = { key, prog: 0, t: this.breakTime(hit.id), snd: 0 };
    const m = this.mining;
    m.prog += dt / m.t;
    m.snd -= dt; if (m.snd <= 0) { this.sound('block_hit', hit, hit.id); m.snd = 0.25; this.particles.burst(hit.x + 0.5 + hit.n[0] * 0.5, hit.y + 0.5 + hit.n[1] * 0.5, hit.z + 0.5 + hit.n[2] * 0.5, BLOCKS[hit.id].faces.side, 2, 0.3); }
    P.swing = Math.max(P.swing, 0.01); if (P.swing <= 0.05) P.swing = 1;
    if (m.prog >= 1) { this.breakBlock(hit.x, hit.y, hit.z, hit.id); this.mining = null; this.crack.visible = false; return; }
    const stage = Math.min(9, Math.floor(m.prog * 10));
    this.setCrack(stage);
    const bb = hit.bb;
    this.crack.visible = true;
    this.crack.position.set(hit.x + (bb[0] + bb[3]) / 2, hit.y + (bb[1] + bb[4]) / 2, hit.z + (bb[2] + bb[5]) / 2);
    this.crack.scale.set(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
  },
  breakBlock(x, y, z, id) {
    const P = this.player, w = this.world, b = BLOCKS[id];
    if (id === BID.end_portal_frame || id === BID.end_portal_frame_eye) { if (P.mode !== 'creative') return; }
    const it = P.heldItem();
    w.setBlock(x, y, z, 0);
    w.scheduleFluidAround(x, y, z);
    this.sound('block_break', { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, id);
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, b.faces.side, 28, 0.35);
    this.dropBlockLoot(x, y, z, id, it && it.tool, false);
    if (b.name === 'ice' && P.mode !== 'creative' && FULL[w.getBlock(x, y - 1, z)] | LIQ[w.getBlock(x, y - 1, z)]) w.setBlock(x, y, z, BID.water);
    if (b.half === 'upper') { }
    if (P.mode !== 'creative') { if (it && it.tool) P.useDurability(it.tool.type === 'sword' ? 2 : 1); P.exhaust(0.005); }
    this.stats.mined++;
    // stacked plants above
    const above = w.getBlock(x, y + 1, z);
    if (above && (above === BID.sugar_cane || above === BID.cactus || above === BID.bamboo)) w.schedule(x, y + 1, z, 1);
  },
  attack(ent) {
    const P = this.player;
    P.swing = 1;
    const it = P.heldItem();
    let dmg = it && it.tool ? it.tool.dmg : 1;
    const crit = P.vel.y < -1 && !P.onGround && !P.inWater;
    if (crit) { dmg *= 1.5; this.particles.crit(ent.pos.x, ent.pos.y + (ent.h || 1) * 0.6, ent.pos.z); }
    if (ent.damage(dmg, P)) {
      if (ent.knock) ent.knock(P.pos, P.sprinting ? 9 : 5);
      if (it && it.tool) P.useDurability(it.tool.type === 'sword' ? 1 : 2);
      P.exhaust(0.1);
      if (P.sprinting) P.sprinting = false;
    }
  },
  placeTarget(hit) {
    const w = this.world;
    const tb = BLOCKS[hit.id];
    if (tb.replaceable && !LIQ[hit.id]) return [hit.x, hit.y, hit.z];
    return [hit.x + hit.n[0], hit.y + hit.n[1], hit.z + hit.n[2]];
  },
  tryPlace(hit, blockId) {
    const P = this.player, w = this.world, b = BLOCKS[blockId];
    // slab stacking
    const tb = BLOCKS[hit.id];
    if (b.slabOf && hit.id === blockId && hit.n[1] === 1) { w.setBlock(hit.x, hit.y, hit.z, BID[b.slabOf]); this.sound('block_place', hit, blockId); P.consumeHeld(); P.swing = 1; return true; }
    const [x, y, z] = this.placeTarget(hit);
    if (y < 0 || y >= CH) return false;
    const cur = w.getBlock(x, y, z);
    if (!w.isReplaceable(cur) && !LIQ[cur]) return false;
    const below = w.getBlock(x, y - 1, z);
    if (b.shape === 'cross' || b.attach || b.name.endsWith('_carpet') || blockId === BID.snow) {
      if (!below || !(FULL[below] || (BLOCKS[below].shape === 'box' && BLOCKS[below].solid) || BLOCKS[below].leaves)) { if (!(b.hanging && FULL[w.getBlock(x, y + 1, z)])) return false; }
      const soil = [BID.grass_block, BID.dirt, BID.podzol, BID.coarse_dirt, BID.farmland, BID.moss_block, BID.rooted_dirt, BID.mud, BID.mycelium];
      if (b.cat === CAT.PLANT && b.shape === 'cross') {
        if (blockId === BID.dead_bush) { if (![BID.sand, BID.red_sand, BID.terracotta, ...soil].includes(below)) return false; }
        else if (blockId === BID.crimson_fungus || blockId === BID.warped_fungus || blockId === BID.crimson_roots || blockId === BID.warped_roots || blockId === BID.nether_sprouts) { if (![BID.crimson_nylium, BID.warped_nylium, BID.soul_soil, ...soil].includes(below)) return false; }
        else if (blockId === BID.brown_mushroom || blockId === BID.red_mushroom) { }
        else if (blockId === BID.sugar_cane) { if (below !== BID.sugar_cane && !((soil.includes(below) || below === BID.sand || below === BID.red_sand) && w.nearWater(x, y - 1, z))) return false; }
        else if (blockId === BID.bamboo) { }
        else if (!soil.includes(below) && below !== blockId) return false;
      }
    }
    if (blockId === BID.cactus && !(below === BID.sand || below === BID.red_sand || below === BID.cactus)) return false;
    // entity intersection
    const bb = blockBox(blockId);
    if (bb) {
      const ents = [P, ...this.entities.filter(e => e instanceof Mob)];
      for (const e of ents) {
        if (P.mode === 'spectator') break;
        if (e.pos.x + e.w > x + bb[0] && e.pos.x - e.w < x + bb[3] && e.pos.z + e.w > z + bb[2] && e.pos.z - e.w < z + bb[5] && e.pos.y + e.h > y + bb[1] && e.pos.y < y + bb[4]) return false;
      }
    }
    let meta = 0;
    if (b.facing) { const d = P.lookDir(); meta = Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 1 : 3) : (d.z > 0 ? 2 : 0); }
    w.setBlock(x, y, z, blockId, meta);
    if (b.gravity || b.powder) w.schedule(x, y, z, 2);
    w.scheduleFluidAround(x, y, z);
    if (b.use === 'chest' && !w.containers.has(x + ',' + y + ',' + z)) w.containers.set(x + ',' + y + ',' + z, { type: 'chest', slots: new Array(27).fill(null) });
    if (b.use === 'furnace') w.containers.set(x + ',' + y + ',' + z, { type: 'furnace', slots: [null, null, null], burn: 0, burnMax: 0, cook: 0, speed: blockId === BID.furnace ? 1 : 2 });
    this.sound('block_place', { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, blockId);
    P.consumeHeld(); P.swing = 1;
    if (blockId === BID.end_portal_frame_eye) this.checkEndPortal(x, y, z);
    return true;
  },
  use(hit) {
    const P = this.player, w = this.world, s = P.held(), it = s ? ITEMS[s.id] : null;
    // using a block
    if (hit && hit.block && !P.sneaking) {
      const b = BLOCKS[hit.id];
      if (b.use === 'craft') { UI.openScreen('craft'); return true; }
      if (b.use === 'chest') { const k = hit.x + ',' + hit.y + ',' + hit.z; if (!w.containers.has(k)) w.containers.set(k, { type: 'chest', slots: new Array(27).fill(null) }); UI.openScreen('chest', w.containers.get(k)); this.sound('chest', hit); return true; }
      if (b.use === 'furnace') { const k = hit.x + ',' + hit.y + ',' + hit.z; if (!w.containers.has(k)) w.containers.set(k, { type: 'furnace', slots: [null, null, null], burn: 0, burnMax: 0, cook: 0, speed: hit.id === BID.blast_furnace || hit.id === BID.smoker ? 2 : 1 }); UI.openScreen('furnace', w.containers.get(k), k); return true; }
      if (b.use === 'note') { this.sound('note', hit); this.particles.colored(hit.x + 0.5, hit.y + 1.2, hit.z + 0.5, 1, [0x50FF50, 0xFF5050, 0x5050FF, 0xFFFF50][(Math.random() * 4) | 0], { v: 0, vy: 0.6, size: 0.15, life: 0.8 }); P.swing = 1; return true; }
      if (b.use === 'lamp') { w.setBlock(hit.x, hit.y, hit.z, hit.id === BID.redstone_lamp ? BID.redstone_lamp_on : BID.redstone_lamp); this.sound('click'); return true; }
      if (hit.id === BID.tnt && it && it.igniter) { this.primeTNT(hit.x, hit.y, hit.z); P.useDurability(); P.swing = 1; return true; }
      if (hit.id === BID.end_portal_frame && it && it.name === 'eye_of_ender') { w.setBlock(hit.x, hit.y, hit.z, BID.end_portal_frame_eye); P.consumeHeld(); this.sound('crystal', hit); this.checkEndPortal(hit.x, hit.y, hit.z); return true; }
      if (hit.id === BID.pumpkin && it && it.name === 'shears') { w.setBlock(hit.x, hit.y, hit.z, BID.carved_pumpkin, (() => { const d = P.lookDir(); return Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 1 : 3) : (d.z > 0 ? 2 : 0); })()); P.useDurability(); return true; }
    }
    if (hit && hit.entity) {
      const e = hit.entity;
      if (e.type === 'sheep' && it && it.name === 'shears' && !e.sheared) { e.sheared = true; this.dropItem(e.pos.x, e.pos.y + 1, e.pos.z, BID.white_wool, 1 + ((Math.random() * 3) | 0)); P.useDurability(); P.swing = 1; return true; }
      if (e.type === 'cow' && it && it.name === 'bucket') { P.consumeHeld(); P.addItem(IID.water_bucket, 0); P.addItem(IID.bucket, 0); return true; }
    }
    if (!it) return false;
    // tools on blocks
    if (hit && hit.block) {
      if (it.tool && it.tool.type === 'hoe' && (hit.id === BID.grass_block || hit.id === BID.dirt || hit.id === BID.dirt_path) && !w.getBlock(hit.x, hit.y + 1, hit.z)) { w.setBlock(hit.x, hit.y, hit.z, BID.farmland); this.sound('block_place', hit, BID.dirt); P.useDurability(); P.swing = 1; return true; }
      if (it.tool && it.tool.type === 'shovel' && hit.id === BID.grass_block && !w.getBlock(hit.x, hit.y + 1, hit.z)) { w.setBlock(hit.x, hit.y, hit.z, BID.dirt_path); this.sound('block_place', hit, BID.dirt); P.useDurability(); P.swing = 1; return true; }
      if (it.tool && it.tool.type === 'axe' && BLOCKS[hit.id].log && !BLOCKS[hit.id].name.startsWith('stripped')) {
        const nm = BLOCKS[hit.id].name; const target = BID['stripped_' + nm.replace('_wood', '_log').replace('_hyphae', '_stem')];
        if (target) { w.setBlock(hit.x, hit.y, hit.z, target); this.sound('block_place', hit, hit.id); P.useDurability(); P.swing = 1; return true; }
      }
      if (it.plant && hit.n[1] === 1) {
        const pid = BID[it.plant];
        if (pid === BID.wheat_crop && hit.id === BID.farmland && !w.getBlock(hit.x, hit.y + 1, hit.z)) { w.setBlock(hit.x, hit.y + 1, hit.z, pid, 0); P.consumeHeld(); P.swing = 1; this.sound('block_place', hit, BID.short_grass); return true; }
        if (pid === BID.sweet_berry_bush && [BID.grass_block, BID.dirt, BID.podzol].includes(hit.id) && !w.getBlock(hit.x, hit.y + 1, hit.z)) { w.setBlock(hit.x, hit.y + 1, hit.z, pid); P.consumeHeld(); P.swing = 1; return true; }
      }
      if (it.name === 'bone_meal') {
        const b = BLOCKS[hit.id];
        if (b.name.endsWith('_sapling')) { if (this.growTree(hit.x, hit.y, hit.z, hit.id)) { P.consumeHeld(); this.particles.colored(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 15, 0x60FF60, { spread: 1, v: 0.3, vy: 0.5 }); } return true; }
        if (hit.id === BID.wheat_crop) { w.setBlock(hit.x, hit.y, hit.z, hit.id, Math.min(7, w.getMeta(hit.x, hit.y, hit.z) + 3)); P.consumeHeld(); this.particles.colored(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 10, 0x60FF60, { spread: 1, v: 0.3, vy: 0.5 }); return true; }
        if (hit.id === BID.grass_block) {
          for (let i = 0; i < 20; i++) { const dx = ((Math.random() * 7) | 0) - 3, dz = ((Math.random() * 7) | 0) - 3; if (w.getBlock(hit.x + dx, hit.y, hit.z + dz) === BID.grass_block && !w.getBlock(hit.x + dx, hit.y + 1, hit.z + dz)) w.setBlock(hit.x + dx, hit.y + 1, hit.z + dz, Math.random() < 0.85 ? BID.short_grass : [BID.dandelion, BID.poppy, BID.cornflower][(Math.random() * 3) | 0]); }
          P.consumeHeld(); this.particles.colored(hit.x + 0.5, hit.y + 1.2, hit.z + 0.5, 20, 0x60FF60, { spread: 4, v: 0.3, vy: 0.5 }); return true;
        }
      }
      if (it.igniter) {
        const [x, y, z] = [hit.x + hit.n[0], hit.y + hit.n[1], hit.z + hit.n[2]];
        if (!w.getBlock(x, y, z)) {
          if (this.tryPortal(x, y, z)) { this.sound('portal', { x, y, z }); }
          else if (FULL[w.getBlock(x, y - 1, z)]) w.setBlock(x, y, z, w.getBlock(x, y - 1, z) === BID.soul_sand || w.getBlock(x, y - 1, z) === BID.soul_soil ? BID.soul_fire : BID.fire);
          this.sound('ignite', { x, y, z }); P.useDurability(); P.swing = 1; return true;
        }
      }
    }
    // buckets
    if (it.bucket !== undefined) {
      if (it.bucket === null) {
        const lh = this.raycast(5, true);
        if (lh && lh.block && LIQ[lh.id] && (w.getMeta(lh.x, lh.y, lh.z) & 15) === 0) {
          w.setBlock(lh.x, lh.y, lh.z, 0); w.scheduleFluidAround(lh.x, lh.y, lh.z);
          const nid = LIQ[lh.id] === 1 ? IID.water_bucket : IID.lava_bucket;
          if (P.mode !== 'creative') { P.consumeHeld(); if (!P.held()) P.inv[P.sel] = { id: nid, count: 1 }; else P.addItem(nid, 1); }
          this.sound('splash', lh); P.swing = 1; return true;
        }
        return false;
      }
      if (hit && hit.block) {
        const [x, y, z] = this.placeTarget(hit);
        const cur = w.getBlock(x, y, z);
        if (!w.isReplaceable(cur) && !LIQ[cur]) return false;
        if (it.bucket === 'water' && w.dim === 'nether') { this.sound('fizz', { x, y, z }); this.particles.smoke(x + 0.5, y + 0.5, z + 0.5, 8); }
        else { w.setBlock(x, y, z, BID[it.bucket], 0); w.schedule(x, y, z, 2); }
        if (P.mode !== 'creative') P.inv[P.sel] = { id: IID.bucket, count: 1 };
        UI.dirty = true; this.sound('splash', { x, y, z }); P.swing = 1; return true;
      }
      return false;
    }
    // placing blocks
    if (it.block && hit && hit.block) return this.tryPlace(hit, it.block);
    // food
    if (it.food && (P.food < 20 || it.regen || P.mode === 'creative')) { P.eating = 0.0001; return true; }
    if (it.bow) { if (P.mode === 'creative' || P.countItem(IID.arrow) > 0) P.bowCharge = 0.0001; return true; }
    if (it.throwable) {
      const eye = P.eyePos(), d = P.lookDir();
      if (it.throwable === 'eye') {
        if (w.dim !== 'overworld') return false;
        const s2 = w.gen.stronghold; const dir = new THREE.Vector3(s2.x - eye.x, 0, s2.z - eye.z); const dist = dir.length(); dir.normalize();
        if (dist < 12) { UI.toast('엔더의 눈이 바로 아래를 가리킵니다! (Y ' + s2.y + ' 부근)'); }
        const e = new Thrown(eye.x, eye.y, eye.z, new THREE.Vector3(dir.x * 7, 3, dir.z * 7), P, 'eye'); this.addEntity(e);
      } else this.addEntity(new Thrown(eye.x + d.x * 0.3, eye.y + d.y * 0.3, eye.z + d.z * 0.3, d.multiplyScalar(20), P, it.throwable));
      P.consumeHeld(); P.swing = 1; this.sound('bow', P.pos); return true;
    }
    return false;
  },
  releaseUse() {
    const P = this.player;
    if (P.bowCharge > 0) {
      const pw = Math.min(1, P.bowCharge / 1.0);
      if (pw > 0.1) {
        const eye = P.eyePos(), d = P.lookDir();
        const a = new Arrow(eye.x + d.x * 0.5, eye.y + d.y * 0.5 - 0.1, eye.z + d.z * 0.5, d.multiplyScalar(45 * pw), P, pw >= 1 ? 1.5 : 1);
        this.addEntity(a);
        if (P.mode !== 'creative') P.takeItem(IID.arrow, 1);
        P.useDurability(); this.sound('bow');
      }
      P.bowCharge = 0;
    }
    P.eating = 0;
  },
  finishEating() {
    const P = this.player, it = P.heldItem(); if (!it || !it.food) return;
    P.food = Math.min(20, P.food + it.food[0]); P.sat = Math.min(P.food, P.sat + it.food[0] * it.food[1] * 0.2 + it.food[1]);
    if (it.regen) P.regen = 100;
    if (it.name === 'chorus_fruit') { this.player.pos.x += (Math.random() - 0.5) * 16; this.player.pos.z += (Math.random() - 0.5) * 16; this.player.pos.y = Math.max(this.player.pos.y, this.world.highestSolid(Math.floor(this.player.pos.x), Math.floor(this.player.pos.z)) + 1); this.sound('teleport'); }
    P.consumeHeld();
    if (it.leaves) P.addItem(IID[it.leaves], 1);
    this.sound('burp'); UI.hudDirty = true;
  },
  // ---------------- portals ----------------
  tryPortal(x, y, z) {
    const w = this.world;
    if (w.dim === 'end') return false;
    for (const ax of [0, 1]) {
      const dx = ax === 0 ? 1 : 0, dz = ax === 1 ? 1 : 0;
      // find bottom-left interior
      let bx = x, bz = z, by = y;
      while (w.getBlock(bx, by - 1, bz) !== BID.obsidian && by > y - 21) { if (w.getBlock(bx, by - 1, bz) !== 0 && w.getBlock(bx, by - 1, bz) !== BID.fire) break; by--; }
      if (w.getBlock(bx, by - 1, bz) !== BID.obsidian) continue;
      let k = 0; while (k < 22 && (w.getBlock(bx - dx, by, bz - dz) === 0 || w.getBlock(bx - dx, by, bz - dz) === BID.fire)) { bx -= dx; bz -= dz; k++; }
      if (w.getBlock(bx - dx, by, bz - dz) !== BID.obsidian) continue;
      let width = 0; while (width < 22 && (w.getBlock(bx + dx * width, by, bz + dz * width) === 0 || w.getBlock(bx + dx * width, by, bz + dz * width) === BID.fire)) width++;
      if (width < 2 || width > 21 || w.getBlock(bx + dx * width, by, bz + dz * width) !== BID.obsidian) continue;
      let height = 0; while (height < 22 && (w.getBlock(bx, by + height, bz) === 0 || w.getBlock(bx, by + height, bz) === BID.fire)) height++;
      if (height < 3 || height > 21) continue;
      let ok = true;
      for (let i = 0; i < width && ok; i++) {
        if (w.getBlock(bx + dx * i, by - 1, bz + dz * i) !== BID.obsidian || w.getBlock(bx + dx * i, by + height, bz + dz * i) !== BID.obsidian) ok = false;
        for (let j = 0; j < height && ok; j++) { const id = w.getBlock(bx + dx * i, by + j, bz + dz * i); if (id !== 0 && id !== BID.fire) ok = false; }
      }
      for (let j = 0; j < height && ok; j++) if (w.getBlock(bx - dx, by + j, bz - dz) !== BID.obsidian || w.getBlock(bx + dx * width, by + j, bz + dz * width) !== BID.obsidian) ok = false;
      if (!ok) continue;
      for (let i = 0; i < width; i++) for (let j = 0; j < height; j++) w.setBlock(bx + dx * i, by + j, bz + dz * i, BID.nether_portal, ax, false);
      return true;
    }
    return false;
  },
  checkEndPortal(x, y, z) {
    const w = this.world;
    for (let cx = x - 3; cx <= x + 3; cx++) for (let cz = z - 3; cz <= z + 3; cz++) {
      let ok = true;
      for (let i = -1; i <= 1 && ok; i++) for (const [ox, oz] of [[i, -2], [i, 2], [-2, i], [2, i]]) if (w.getBlock(cx + ox, y, cz + oz) !== BID.end_portal_frame_eye) { ok = false; break; }
      if (ok) {
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) w.setBlock(cx + i, y, cz + j, BID.end_portal);
        this.sound('portal', { x: cx, y, z: cz }); UI.toast('엔드 차원문이 열렸습니다!'); return true;
      }
    }
    return false;
  },
  travel(kind) {
    const P = this.player, from = this.world.dim;
    let to, pos;
    if (kind === 'nether') {
      to = from === 'nether' ? 'overworld' : 'nether';
      const sc = to === 'nether' ? 1 / 8 : 8;
      pos = new THREE.Vector3(Math.floor(P.pos.x * sc), P.pos.y, Math.floor(P.pos.z * sc));
    } else {
      if (from === 'end') { to = 'overworld'; pos = null; } else { to = 'end'; pos = new THREE.Vector3(100.5, 49, 0.5); }
    }
    const fromEnd = from === 'end';
    this.setWorld(to);
    const w = this.world;
    if (kind === 'nether') {
      const cx = pos.x >> 4, cz = pos.z >> 4;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.ensureChunk(cx + dx, cz + dz);
      let found = null;
      for (let dx = -20; dx <= 20 && !found; dx++) for (let dz = -20; dz <= 20 && !found; dz++) for (let y = 1; y < CH - 1; y++) if (w.getBlock(pos.x + dx, y, pos.z + dz) === BID.nether_portal && w.getBlock(pos.x + dx, y - 1, pos.z + dz) !== BID.nether_portal) { found = new THREE.Vector3(pos.x + dx + 0.5, y, pos.z + dz + 0.5); break; }
      if (!found) found = this.buildPortalAt(pos.x, pos.z);
      P.pos.copy(found);
      if (w.getBlock(Math.floor(found.x), Math.floor(found.y), Math.floor(found.z)) === BID.nether_portal) { const ax = w.getMeta(Math.floor(found.x), Math.floor(found.y), Math.floor(found.z)); if (ax === 0) P.pos.z += 0; }
    } else if (to === 'end') {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.ensureChunk(6 + dx, dz);
      for (let x = 98; x <= 102; x++) for (let z = -2; z <= 2; z++) { w.setBlock(x, 48, z, BID.obsidian, 0, false); for (let y = 49; y < 52; y++) w.setBlock(x, y, z, 0, 0, false); }
      P.pos.copy(pos); P.yaw = Math.PI / 2;
    } else {
      P.pos.copy(P.spawn || this.findSpawn());
      if (fromEnd) { UI.showWin(); }
    }
    P.vel.set(0, 0, 0); P.fallDist = 0; P.portalCool = 4; P.portalT = 0;
    UI.showLoading(true); this.loading = true;
    this.sound('portal');
  },
  buildPortalAt(x, z) {
    const w = this.world;
    let y = -1;
    if (w.dim === 'nether') {
      for (let yy = 34; yy < 110 && y < 0; yy++) { let ok = true; for (let i = -1; i <= 2 && ok; i++) for (let j = 0; j < 5 && ok; j++) if (w.getBlock(x + i, yy + j, z)) ok = false; if (ok && FULL[w.getBlock(x, yy - 1, z)]) y = yy; }
      if (y < 0) y = 64;
    } else { y = w.highestSolid(x, z) + 1; if (y < SEA + 1) y = SEA + 1; }
    for (let i = -1; i <= 2; i++) for (let j = 0; j < 5; j++) for (let k = -1; k <= 1; k++) w.setBlock(x + i, y + j, z + k, 0, 0, false);
    for (let i = -2; i <= 3; i++) for (let k = -1; k <= 1; k++) if (!FULL[w.getBlock(x + i, y - 1, z + k)]) w.setBlock(x + i, y - 1, z + k, BID.obsidian, 0, false);
    for (let i = -1; i <= 2; i++) { w.setBlock(x + i, y - 1, z, BID.obsidian, 0, false); w.setBlock(x + i, y + 4, z, BID.obsidian, 0, false); }
    for (let j = 0; j < 5; j++) { w.setBlock(x - 1, y + j, z, BID.obsidian, 0, false); w.setBlock(x + 2, y + j, z, BID.obsidian, 0, false); }
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) w.setBlock(x + i, y + j, z, BID.nether_portal, 0, false);
    return new THREE.Vector3(x + 1, y, z + 0.5);
  },
  // ---------------- death / respawn ----------------
  onPlayerDeath(src) {
    const P = this.player;
    this.unlock();
    if (P.mode === 'survival') {
      for (let i = 0; i < 36; i++) if (P.inv[i]) { const s = P.inv[i]; this.dropItem(P.pos.x, P.pos.y + 1, P.pos.z, s.id, s.count, s.dur); P.inv[i] = null; }
      this.dropXP(P.pos.x, P.pos.y + 1, P.pos.z, Math.min(100, P.level * 7));
      P.level = 0; P.xp = 0;
    }
    const msgs = { fall: '높은 곳에서 떨어졌습니다', lava: '용암에서 수영하려 했습니다', fire: '불에 타 죽었습니다', explosion: '폭발로 사망했습니다', starve: '굶어 죽었습니다', drown: '익사했습니다', void: '세상 밖으로 떨어졌습니다', cactus: '선인장에 찔려 죽었습니다', pearl: '엔더 진주에 맞았습니다' };
    let msg = msgs[src] || '사망했습니다';
    if (src instanceof Mob) msg = MOB_KO[src.type] + '에게 죽었습니다';
    if (src instanceof Dragon) msg = '엔더 드래곤에게 죽었습니다';
    if (src instanceof Arrow && src.owner instanceof Mob) msg = MOB_KO[src.owner.type] + '의 화살에 맞았습니다';
    UI.showDeath(msg, this.stats);
  },
  respawn() {
    const P = this.player;
    if (this.world.dim !== 'overworld') this.setWorld('overworld');
    P.pos.copy(P.spawn); P.vel.set(0, 0, 0); P.health = 20; P.food = 20; P.sat = 5; P.dead = false; P.fire = 0; P.air = 15; P.fallDist = 0; P.invuln = 2;
    UI.hudDirty = true; UI.dirty = true;
    this.loading = true; UI.showLoading(true);
  },
  // ---------------- spawning ----------------
  spawnMobs() {
    const w = this.world, P = this.player;
    if (P.mode === 'spectator') return;
    const mobs = this.entities.filter(e => e instanceof Mob);
    const hostile = mobs.filter(m => !m.def.passive).length, passive = mobs.filter(m => m.def.passive).length;
    const pick = (a) => { let s = 0; for (const [, wt] of a) s += wt; let r = Math.random() * s; for (const [t, wt] of a) { r -= wt; if (r <= 0) return t; } return a[0][0]; };
    const tryAt = (type, minD, maxD, surfaceOnly, needDark) => {
      const ang = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = Math.floor(P.pos.x + Math.cos(ang) * d), z = Math.floor(P.pos.z + Math.sin(ang) * d);
      if (!w.chunkAt(x, z)) return false;
      const def = MOBDEF[type];
      const y0 = surfaceOnly ? CH - 2 : Math.min(CH - 3, Math.floor(P.pos.y) + 20), y1 = surfaceOnly ? 1 : Math.max(2, Math.floor(P.pos.y) - 28);
      for (let y = y0; y > y1; y--) {
        const below = w.getBlock(x, y - 1, z);
        if (!FULL[below] || below === BID.bedrock) { if (surfaceOnly && FULL[below] === 0 && below && !BLOCKS[below].leaves && !LIQ[below] && BLOCKS[below].solid) break; continue; }
        if (w.getBlock(x, y, z) || w.getBlock(x, y + 1, z)) { if (surfaceOnly) break; continue; }
        if (def.h > 2 && w.getBlock(x, y + 2, z)) continue;
        const L = w.getLight(x, y, z), sky = L >> 4, bl = L & 15;
        if (needDark) { const eff = Math.max(bl, Math.round(sky * (w.dim === 'overworld' ? this.daylight : 0.3))); if (bl > 0 || eff > 7) { if (surfaceOnly) break; continue; } }
        else { if (below !== BID.grass_block || sky < 9) break; }
        if (Math.hypot(x - P.pos.x, y - P.pos.y, z - P.pos.z) < 20) return false;
        this.addEntity(new Mob(type, x + 0.5, y, z + 0.5));
        return true;
      }
      return false;
    };
    if (w.dim === 'overworld') {
      if (hostile < 18) for (let i = 0; i < 3; i++) tryAt(pick([['zombie', 35], ['skeleton', 30], ['creeper', 25], ['enderman', 8]]), 24, 48, false, true);
      if (passive < 10 && this.daylight > 0.5 && Math.random() < 0.3) {
        const t = pick([['pig', 25], ['cow', 25], ['sheep', 25], ['chicken', 20]]);
        for (let i = 0; i < 3; i++) tryAt(t, 24, 44, true, false);
      }
    } else if (w.dim === 'nether') {
      if (hostile < 6 && Math.random() < 0.3) {
        const t = pick([['ghast', 40], ['blaze', 30], ['enderman', 5]]);
        if (t === 'enderman') tryAt(t, 20, 40, false, false);
        else {
          const ang = Math.random() * Math.PI * 2, d = 24 + Math.random() * 24;
          const x = P.pos.x + Math.cos(ang) * d, z = P.pos.z + Math.sin(ang) * d, y = 40 + Math.random() * 60;
          if (aabbFree(w, x, y, z, MOBDEF[t].w + 0.5, MOBDEF[t].h + 1) && w.chunkAt(x, z)) this.addEntity(new Mob(t, x, y, z));
        }
      }
    } else if (w.dim === 'end') {
      if (hostile < 10) for (let i = 0; i < 2; i++) {
        const ang = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
        const x = Math.floor(P.pos.x + Math.cos(ang) * d), z = Math.floor(P.pos.z + Math.sin(ang) * d);
        if (!w.chunkAt(x, z)) continue;
        const y = w.highestSolid(x, z);
        if (y > 0 && w.getBlock(x, y, z) === BID.end_stone && !w.getBlock(x, y + 1, z) && !w.getBlock(x, y + 3, z)) this.addEntity(new Mob('enderman', x + 0.5, y + 1, z + 0.5));
      }
    }
  },
  // ---------------- main update ----------------
  updatePlayer(dt) {
    const P = this.player, w = this.world, K = this.keys;
    if (P.dead) return;
    if (P.invuln > 0) P.invuln -= dt;
    if (P.hurtTime > 0) P.hurtTime -= dt;
    if (P.swing > 0) P.swing = Math.max(0, P.swing - dt * 4);
    const fwd = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), str = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    P.sneaking = !!(K.ShiftLeft || K.ShiftRight) && !P.flying;
    if (K.ControlLeft && fwd > 0 && P.food > 6) P.sprinting = true;
    if (fwd <= 0 || P.sneaking || (P.food <= 6 && P.mode === 'survival') || P.hitWall) P.sprinting = false;
    const sinY = Math.sin(P.yaw), cosY = Math.cos(P.yaw);
    let mx = -sinY * fwd + cosY * str, mz = -cosY * fwd - sinY * str;
    const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
    const spectator = P.mode === 'spectator';
    let speed = 4.317;
    if (P.sprinting) speed = 5.612; if (P.sneaking) speed = 1.31;
    if (P.eating > 0 || P.bowCharge > 0) speed *= 0.35;
    const feetId = w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y - 0.05), Math.floor(P.pos.z));
    if (BLOCKS[feetId] && BLOCKS[feetId].slow) speed *= BLOCKS[feetId].slow;
    if (P.flying || spectator) {
      speed = P.sprinting ? 21 : 10.9;
      const vy = (K.Space ? 1 : 0) - (K.ShiftLeft || K.ShiftRight ? 1 : 0);
      P.vel.x += (mx * speed - P.vel.x) * Math.min(1, dt * 10);
      P.vel.z += (mz * speed - P.vel.z) * Math.min(1, dt * 10);
      P.vel.y += (vy * 8 - P.vel.y) * Math.min(1, dt * 10);
      if (spectator) P.pos.addScaledVector(P.vel, dt);
      else { const r = moveAABB(w, P, P.vel.x * dt, P.vel.y * dt, P.vel.z * dt); if (r.ground && P.mode === 'creative') P.flying = false; P.onGround = r.ground; }
      P.fallDist = 0;
    } else {
      const slip = BLOCKS[feetId] && BLOCKS[feetId].slip;
      const acc = P.onGround ? (slip ? 1.2 : 14) : 2.2;
      const inLiq = P.inWater || P.inLava;
      const tsp = inLiq ? speed * 0.45 : speed;
      P.vel.x += (mx * tsp - P.vel.x) * Math.min(1, dt * (inLiq ? 6 : acc));
      P.vel.z += (mz * tsp - P.vel.z) * Math.min(1, dt * (inLiq ? 6 : acc));
      if (K.Space) {
        if (inLiq) { P.vel.y = Math.min(P.vel.y + GRAV * 0.55 * dt, 3.2); if (Math.random() < 0.05) this.sound('swim', P.pos); }
        else if (P.onGround && (this.jumpCool || 0) <= 0) { P.vel.y = 9.0; if (P.sprinting) { P.vel.x += -sinY * 2; P.vel.z += -cosY * 2; P.exhaust(0.2); } else P.exhaust(0.05); this.jumpCool = 0.1; }
      }
      this.jumpCool = (this.jumpCool || 0) - dt;
      // sneaking edge guard
      const ox = P.pos.x, oz = P.pos.z;
      const wasGround = P.onGround;
      P.physics(dt, w);
      if (P.sneaking && wasGround && !P.onGround && P.vel.y <= 0) {
        if (!collideBoxes(w, P.pos.x - P.w, P.pos.y - 0.6, P.pos.z - P.w, P.pos.x + P.w, P.pos.y - 0.01, P.pos.z + P.w).length) { P.pos.x = ox; P.pos.z = oz; P.vel.x = P.vel.z = 0; P.onGround = true; P.pos.y = Math.ceil(P.pos.y - 0.01); P.vel.y = 0; P.fallDist = 0; }
      }
      if (P.hitWall && P.inWater && K.Space) P.vel.y = 4;
      if (P.sprinting && P.onGround) P.exhaust(0.1 * Math.hypot(P.vel.x, P.vel.z) * dt);
    }
    // footsteps
    if (P.onGround && !P.flying) {
      this.stepAcc = (this.stepAcc || 0) + Math.hypot(P.vel.x, P.vel.z) * dt;
      this.bobT = (this.bobT || 0) + Math.hypot(P.vel.x, P.vel.z) * dt * 2.2;
      if (this.stepAcc > 1.6 && !P.sneaking) { this.stepAcc = 0; const b = w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y - 0.2), Math.floor(P.pos.z)); if (b) this.sound('block_step', null, b); }
    }
    // hazards
    if (P.mode === 'survival') {
      const at = [w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y + 0.1), Math.floor(P.pos.z)), w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y + 1), Math.floor(P.pos.z))];
      for (const id of at) { const b = BLOCKS[id]; if (b && b.damage === 'fire') { P.fire = Math.max(P.fire, 5); } if (b && b.damage === 'berry' && Math.hypot(P.vel.x, P.vel.z) > 0.5) P.damage(1, 'cactus'); if (b && b.damage === 'wither') P.damage(1, 'fire'); }
      if (BLOCKS[feetId] && BLOCKS[feetId].damage === 'magma' && !P.sneaking) P.damage(1, 'fire');
      // cactus contact
      const near = collideBoxes(w, P.pos.x - P.w - 0.05, P.pos.y, P.pos.z - P.w - 0.05, P.pos.x + P.w + 0.05, P.pos.y + P.h, P.pos.z + P.w + 0.05);
      for (let xx = Math.floor(P.pos.x - 0.4); xx <= Math.floor(P.pos.x + 0.4); xx++) for (let zz = Math.floor(P.pos.z - 0.4); zz <= Math.floor(P.pos.z + 0.4); zz++) for (let yy = Math.floor(P.pos.y - 0.05); yy <= Math.floor(P.pos.y + 1.7); yy++) if (w.getBlock(xx, yy, zz) === BID.cactus) P.damage(1, 'cactus');
      if (BLOCKS[w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y), Math.floor(P.pos.z))]?.damage === 'dripstone' && P.fallDist > 1) P.damage(2, 'fall');
      if (P.fire > 0) { P.fire -= dt; this.fireTick = (this.fireTick || 0) + dt; if (this.fireTick > 1) { this.fireTick = 0; P.damage(1, 'fire'); } }
      // air
      const headId = w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y + P.eye), Math.floor(P.pos.z));
      if (LIQ[headId] === 1) { P.air -= dt; if (P.air < 0) { P.air = 0; this.drownT = (this.drownT || 0) + dt; if (this.drownT > 1) { this.drownT = 0; P.damage(2, 'drown'); } } }
      else P.air = Math.min(15, P.air + dt * 5);
    } else { P.fire = 0; P.air = 15; }
    if (P.pos.y < -40) P.damage(1000, 'void');
    if (P.inLava) P.fire = Math.max(P.fire, 8);
    // portals
    const inPortal = w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y + 0.5), Math.floor(P.pos.z));
    if (P.portalCool > 0) P.portalCool -= dt;
    if (inPortal === BID.nether_portal && P.portalCool <= 0) { if (P.portalT === 0) this.sound('portal', P.pos); P.portalT += dt; if (P.portalT > (P.mode === 'creative' ? 0.6 : 3.5)) this.travel('nether'); }
    else if ((inPortal === BID.end_portal || w.getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y), Math.floor(P.pos.z)) === BID.end_portal) && P.portalCool <= 0) this.travel('end');
    else P.portalT = Math.max(0, P.portalT - dt * 2);
    // eating / bow
    if (P.eating > 0) { if (!this.mouse.r) P.eating = 0; else { P.eating += dt; if (Math.floor(P.eating * 5) !== Math.floor((P.eating - dt) * 5)) { this.sound('eat', P.pos); const it = P.heldItem(); if (it) this.particles.burst(P.pos.x + P.lookDir().x * 0.4, P.pos.y + 1.3, P.pos.z + P.lookDir().z * 0.4, it.tex !== undefined ? it.tex : BLOCKS[it.block].faces.side, 3, 0.1); } if (P.eating >= 1.6) { P.eating = 0; this.finishEating(); } } }
    if (P.bowCharge > 0) P.bowCharge += dt;
  },
  tick() {
    // 20 tps logic
    this.time = (this.time + 1) % 24000;
    const w = this.world, P = this.player;
    w.processTicks(this);
    if ((this.tickN = (this.tickN || 0) + 1) % 2 === 0) w.randomTick(this, P.pos.x, P.pos.z);
    P.tickSurvival();
    if (this.tickN % 20 === 0) this.spawnMobs();
    // furnaces
    for (const [k, c] of w.containers) {
      if (c.type !== 'furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!w.chunkAt(x, z)) continue;
      const [inp, fuel, out] = c.slots;
      const recipe = inp && SMELT[ITEMS[inp.id].name];
      const outId = recipe ? IID[recipe.out] : 0;
      const canCook = recipe && outId !== undefined && (!out || (out.id === outId && out.count < (ITEMS[outId].stack || 64)));
      if (c.burn > 0) c.burn -= c.speed;
      if (c.burn <= 0 && canCook && fuel && ITEMS[fuel.id].fuel) {
        c.burnMax = c.burn = ITEMS[fuel.id].fuel * 200; fuel.count--;
        if (ITEMS[fuel.id].name === 'lava_bucket') c.slots[1] = { id: IID.bucket, count: 1 };
        else if (fuel.count <= 0) c.slots[1] = null;
      }
      if (c.burn > 0 && canCook) {
        c.cook += c.speed;
        if (c.cook >= 200) {
          c.cook = 0; inp.count--; if (inp.count <= 0) c.slots[0] = null;
          if (out) out.count++; else c.slots[2] = { id: outId, count: 1 };
          c.xp = (c.xp || 0) + recipe.xp;
        }
      } else if (c.cook > 0) c.cook = Math.max(0, c.cook - 2);
      const lit = c.burn > 0;
      const bid = w.getBlock(x, y, z);
      if (bid === BID.furnace && lit) w.setBlock(x, y, z, BID.lit_furnace, w.getMeta(x, y, z), false);
      else if (bid === BID.lit_furnace && !lit) w.setBlock(x, y, z, BID.furnace, w.getMeta(x, y, z), false);
      if (UI.container === c) UI.dirty = true;
    }
    if (this.tickN % 40 === 0 && this.world.dim === 'nether' && Math.random() < 0.5) this.sound('lavapop', { x: P.pos.x + (Math.random() - 0.5) * 20, y: 31, z: P.pos.z + (Math.random() - 0.5) * 20 });
  },
  frame(t) {
    requestAnimationFrame(tt => this.frame(tt));
    let dt = Math.min(0.1, (t - this.lastT) / 1000); this.lastT = t;
    this.frameN = (this.frameN || 0) + 1;
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    TEX.tick(t / 1000);
    if (!this.started) { this.renderTitle(dt); return; }
    const P = this.player;
    if (this.loading) {
      const miss = this.updateChunks(30);
      const pc = this.world.getChunk(Math.floor(P.pos.x / 16), Math.floor(P.pos.z / 16));
      const total = this.spiral.length;
      UI.loadingProgress(1 - miss / total);
      if (miss === 0 || (pc && !pc.dirty && miss < total * 0.35)) {
        this.loading = false; UI.showLoading(false);
        // drop player on ground if spawned inside terrain
        while (!aabbFree(this.world, P.pos.x, P.pos.y, P.pos.z, P.w, P.h) && P.pos.y < CH) P.pos.y += 1;
        if (!UI.open && !P.dead) { this.paused = false; }
      }
    } else this.updateChunks(7);
    const paused = this.paused || this.loading;
    if (!paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= 0.05 && n < 4) { this.tick(); this.acc -= 0.05; n++; }
      if (n === 4) this.acc = 0;
      this.updatePlayer(dt);
      const hit = (P.dead || UI.open) ? null : this.raycast();
      this.hit = hit;
      // selection box
      if (hit && hit.block) {
        const bb = hit.bb;
        this.selBox.visible = true;
        this.selBox.position.set(hit.x + (bb[0] + bb[3]) / 2, hit.y + (bb[1] + bb[4]) / 2, hit.z + (bb[2] + bb[5]) / 2);
        this.selBox.scale.set((bb[3] - bb[0]) + 0.004, (bb[4] - bb[1]) + 0.004, (bb[5] - bb[2]) + 0.004);
      } else this.selBox.visible = false;
      if (!P.dead && this.locked) {
        if (this.attackClick) { this.attackClick = false; if (hit && hit.entity) this.attack(hit.entity); else P.swing = 1; }
        if (!(hit && hit.entity)) this.handleMining(dt, hit); else { this.crack.visible = false; this.mining = null; }
        if (this.mouse.r) {
          this.useRepeat -= dt;
          if (this.useClick || (this.useRepeat <= 0 && P.eating <= 0 && P.bowCharge <= 0)) {
            this.useClick = false; this.useRepeat = 0.22;
            if (P.eating <= 0 && P.bowCharge <= 0) this.use(hit);
          }
        }
      } else { this.crack.visible = false; }
      for (const e of this.entities) if (!e.removed) e.update(dt);
      this.entities = this.entities.filter(e => !e.removed);
      if (this.dragon) UI.bossHealth(this.dragon.health / this.dragon.maxHealth);
    }
    // camera
    const eye = P.eyePos();
    this.camera.fov += ((P.sprinting && !paused ? this.fov * 1.12 : this.fov) - this.camera.fov) * Math.min(1, dt * 8);
    if (P.flying && P.sprinting) this.camera.fov = Math.max(this.camera.fov, this.fov * 1.12);
    this.camera.updateProjectionMatrix();
    let shake = 0; if (this.camShake > 0) { this.camShake -= dt; shake = this.camShake; }
    this.camera.rotation.set(P.pitch, P.yaw, (P.hurtTime > 0 ? Math.sin(P.hurtTime * 20) * 0.04 : 0) + (Math.random() - 0.5) * shake * 0.05);
    if (P.dead) { this.camera.rotation.z = 0.6; eye.y -= 1.2; }
    if (this.thirdPerson) {
      const d = P.lookDir().multiplyScalar(this.thirdPerson === 1 ? -1 : 1);
      let dist = 4;
      for (let s = 0.2; s < 4; s += 0.1) { const p = eye.clone().addScaledVector(d, s); if (FULL[this.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))]) { dist = s - 0.2; break; } }
      this.camera.position.copy(eye).addScaledVector(d, dist);
      if (this.thirdPerson === 2) this.camera.lookAt(eye);
      this.updatePlayerModel(dt);
    } else { this.camera.position.copy(eye); if (this.playerModel) this.playerModel.g.visible = false; }
    if (!P.flying && !this.thirdPerson && !paused) { const b = this.bobT || 0; const m = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) * (P.onGround ? 1 : 0); this.camera.position.y += Math.abs(Math.cos(b)) * 0.06 * m; this.camera.position.x += Math.sin(b) * 0.03 * m * Math.cos(P.yaw); this.camera.position.z -= Math.sin(b) * 0.03 * m * Math.sin(P.yaw); }
    Sound.listener = { x: eye.x, y: eye.y, z: eye.z, yaw: P.yaw + Math.PI };
    this.updateSky(dt);
    this.particles.update(paused ? 0 : dt, this.camera);
    this.updateHand(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (!this.thirdPerson && !P.dead && UI.hudVisible) { this.renderer.clearDepth(); this.renderer.render(this.hudScene, this.hudCam); }
    UI.update(dt);
    Sound.update(this.world.dim, !paused);
  },
  updatePlayerModel(dt) {
    const P = this.player;
    if (!this.playerModel) { this.playerModel = buildModel('player'); this.scene.add(this.playerModel.g); }
    const m = this.playerModel; m.g.visible = true;
    m.g.position.copy(P.pos); m.g.rotation.y = P.yaw + Math.PI;
    if (P.sneaking) m.g.position.y -= 0.1;
    const s = Math.sin((this.bobT || 0) * 2) * Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 3) * 0.8;
    m.legs[0].rotation.x = s; m.legs[1].rotation.x = -s; m.arms[0].rotation.x = -s; m.arms[1].rotation.x = s - (P.swing > 0 ? Math.sin(P.swing * Math.PI) * 1.4 : 0);
    m.head.rotation.x = -P.pitch;
    const c = this.lightAt(P.pos.x, P.pos.y + 1, P.pos.z);
    for (const mm of m.mats) mm.color.setRGB(c.r, c.g, c.b);
  },
  renderTitle(dt) {
    // slowly rotating panorama of a demo world behind the title screen
    if (!this.titleWorld) {
      this.titleWorld = true;
      this.seed = strSeed('panorama'); this.worlds = {};
      this.player = new Player(); this.setWorld('overworld');
      const sp = this.findSpawn(); this.player.pos.set(sp.x, sp.y + 12, sp.z); this.player.pitch = -0.15;
      this.time = 3000;
    }
    const P = this.player;
    P.yaw += dt * 0.04;
    this.updateChunks(10);
    this.camera.position.copy(P.eyePos()); this.camera.rotation.set(P.pitch, P.yaw, 0);
    this.updateSky(dt);
    this.renderer.clear(); this.renderer.render(this.scene, this.camera);
  },
};
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, n = null;
  const ax = [[o.x, d.x, x0, x1, [-1, 0, 0], [1, 0, 0]], [o.y, d.y, y0, y1, [0, -1, 0], [0, 1, 0]], [o.z, d.z, z0, z1, [0, 0, -1], [0, 0, 1]]];
  for (const [oo, dd, a, b, na, nb] of ax) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let t1 = (a - oo) / dd, t2 = (b - oo) / dd, n1 = na, n2 = nb;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [n1, n2] = [n2, n1]; }
    if (t1 > tmin) { tmin = t1; n = n1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), n: n || [0, 1, 0] };
}

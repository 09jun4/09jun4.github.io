// hi-fx.js — effects for the 높음 renderer, driven only by reading the car
// state (never writing it): tyre smoke on lock-ups / slides / wheelspin, skid
// marks that fade on the road, dust off the line and over kerbs, sparks against
// walls and from the skid plank at top speed, explosion fire / smoke / debris
// with a light flash, and the burning wreck. Particles are instanced
// camera-facing quads (works on every WebGL1 device, no point-size limits).
// Load order: after hi-car.js. Depends on: THREE, CR.Hi, Config, Track, Car, Input.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var F = Hi.Fx = {};

  var PVS = [
    'attribute vec3 iPos; attribute vec4 iColor; attribute vec2 iSizeRot;',
    'varying vec2 vUv; varying vec4 vColor;',
    '#include <fog_pars_vertex>',
    'void main() {',
    '  vUv = uv; vColor = iColor;',
    '  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);',
    '  float c = cos(iSizeRot.y), s = sin(iSizeRot.y);',
    '  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSizeRot.x;',
    '  mvPosition.xy += q;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}'].join('\n');
  var PFS = [
    'uniform sampler2D map; uniform float uBoost;',
    'varying vec2 vUv; varying vec4 vColor;',
    '#include <fog_pars_fragment>',
    'void main() {',
    '  float a = texture2D(map, vUv).a * vColor.a;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(vColor.rgb * uBoost, a);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '  #include <fog_fragment>',
    '}'].join('\n');

  // Pool of camera-facing quads.
  function Pool(R, max, additive, texture) {
    this.max = max;
    this.n = 0;
    var base = new THREE.PlaneGeometry(1, 1);
    var g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.sr = new Float32Array(max * 2);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iSizeRot', new THREE.InstancedBufferAttribute(this.sr, 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    var mat = new THREE.ShaderMaterial({
      vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture }, uBoost: { value: additive ? 4 : 1 } }]),
    });
    mat.uniforms.map.value = texture;
    R.register(mat);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    // particle state
    this.p = [];
    for (var i = 0; i < max; i++) this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, rot: 0, vr: 0, r: 1, g: 1, b: 1, a: 1, kind: 0, drag: 1, grav: 0 });
    this.cursor = 0;
  }
  Pool.prototype.spawn = function () {
    for (var k = 0; k < this.max; k++) {
      var i = (this.cursor + k) % this.max, p = this.p[i];
      if (p.life <= 0) { this.cursor = (i + 1) % this.max; return p; }
    }
    return null;
  };
  Pool.prototype.update = function (dt) {
    var n = 0, P = this.p;
    for (var i = 0; i < this.max; i++) {
      var p = P[i];
      if (p.life <= 0) continue;
      if (dt > 0) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vx *= Math.max(0, 1 - p.drag * dt); p.vz *= Math.max(0, 1 - p.drag * dt); p.vy = p.vy * Math.max(0, 1 - p.drag * 0.5 * dt) - p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.03 && p.grav > 0) { p.y = 0.03; p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; }
        p.size += p.grow * dt;
        p.rot += p.vr * dt;
      }
      var t = p.life / p.max;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      var a = p.a, r = p.r, g = p.g, b = p.b;
      if (p.kind === 1) { // fire: yellow -> orange -> dark red
        r = 1; g = 0.25 + 0.6 * t; b = 0.05 + 0.25 * t * t; a = p.a * Math.min(1, t * 1.6);
      } else if (p.kind === 2) { // spark: white-hot -> orange
        r = 1; g = 0.5 + 0.45 * t; b = 0.2 + 0.6 * t * t; a = p.a * t;
      } else {
        a = p.a * Math.min(1, (1 - t) * 6) * t; // fade in, fade out
      }
      this.col[n * 4] = r; this.col[n * 4 + 1] = g; this.col[n * 4 + 2] = b; this.col[n * 4 + 3] = a;
      this.sr[n * 2] = p.size; this.sr[n * 2 + 1] = p.rot;
      n++;
    }
    this.n = n;
    var g2 = this.mesh.geometry;
    g2.instanceCount = n;
    if (n) {
      g2.attributes.iPos.needsUpdate = true; g2.attributes.iColor.needsUpdate = true; g2.attributes.iSizeRot.needsUpdate = true;
      g2.attributes.iPos.updateRange.count = n * 3; g2.attributes.iColor.updateRange.count = n * 4; g2.attributes.iSizeRot.updateRange.count = n * 2;
    }
  };
  Pool.prototype.clear = function () { for (var i = 0; i < this.max; i++) this.p[i].life = 0; this.n = 0; this.mesh.geometry.instanceCount = 0; };

  // --- Skid marks: ring buffer of quads that fade with age (shader) -------------------
  var SVS = [
    'attribute float aBirth; attribute float aStrength;',
    'uniform float uTime; varying float vA;',
    '#include <fog_pars_vertex>',
    'void main() {',
    '  float age = uTime - aBirth;',
    '  vA = aStrength * (1.0 - smoothstep(18.0, 45.0, age));',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}'].join('\n');
  var SFS = [
    'varying float vA;',
    '#include <fog_pars_fragment>',
    'void main() {',
    '  gl_FragColor = vec4(0.012, 0.012, 0.014, vA * 0.62);',
    '  #include <fog_fragment>',
    '}'].join('\n');

  function Skids(R, max) {
    this.max = max;
    this.next = 0;
    var pos = new Float32Array(max * 4 * 3), birth = new Float32Array(max * 4), str = new Float32Array(max * 4), idx = new Uint32Array(max * 6);
    for (var i = 0; i < max; i++) {
      var b = i * 4;
      idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6);
      for (var k = 0; k < 4; k++) birth[b + k] = -1e6;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aStrength', new THREE.BufferAttribute(str, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]);
    var mat = new THREE.ShaderMaterial({ vertexShader: SVS, fragmentShader: SFS, uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    R.register(mat);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.last = {};
    this.dirty = false;
  }
  // Extends the mark of tyre `key` to world point (x, y) (heading h).
  Skids.prototype.mark = function (key, x, y, h, width, strength, time) {
    var last = this.last[key];
    if (!last) { this.last[key] = { x: x, y: y, h: h }; return; }
    var dx = x - last.x, dy = y - last.y, d = Math.hypot(dx, dy);
    if (d < 0.35) return;
    if (d > 3) { this.last[key] = { x: x, y: y, h: h }; return; }
    var nx = -dy / d * width / 2, ny = dx / d * width / 2;
    var g = this.mesh.geometry, P = g.attributes.position.array, B = g.attributes.aBirth.array, S = g.attributes.aStrength.array;
    var i = this.next, b = i * 4;
    var pts = [[last.x + nx, last.y + ny], [last.x - nx, last.y - ny], [x + nx, y + ny], [x - nx, y - ny]];
    for (var k = 0; k < 4; k++) {
      P[(b + k) * 3] = pts[k][0]; P[(b + k) * 3 + 1] = 0.012; P[(b + k) * 3 + 2] = -pts[k][1];
      B[b + k] = time; S[b + k] = strength;
    }
    this.next = (i + 1) % this.max;
    this.last[key] = { x: x, y: y, h: h };
    this.dirty = true;
  };
  Skids.prototype.lift = function (key) { this.last[key] = null; };
  Skids.prototype.flush = function () {
    if (!this.dirty) return;
    var g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aBirth.needsUpdate = true; g.attributes.aStrength.needsUpdate = true;
    this.dirty = false;
  };
  Skids.prototype.clear = function () {
    var B = this.mesh.geometry.attributes.aBirth.array;
    for (var i = 0; i < B.length; i++) B[i] = -1e6;
    this.mesh.geometry.attributes.aBirth.needsUpdate = true;
    this.last = {};
  };

  // --- The effects system ---------------------------------------------------------------
  F.create = function (R) {
    var q = R.tier.particles;
    var fx = {
      group: new THREE.Group(),
      smoke: new Pool(R, Math.round(520 * Math.max(0.3, q)), false, R.texPuff),
      glow: new Pool(R, Math.round(420 * Math.max(0.3, q)), true, R.texGlow),
      skids: new Skids(R, Math.round(2400 * Math.max(0.35, q))),
      time: 0, flash: 0, wreck: 0, rumble: 0, quality: q,
      debris: null, debrisState: [],
      light: new THREE.PointLight(0xffa040, 0, 60, 2),
    };
    fx.group.add(fx.smoke.mesh, fx.glow.mesh, fx.skids.mesh, fx.light);
    var dg = new THREE.BoxGeometry(0.22, 0.08, 0.3);
    var dm = R.std({ color: 0x1c1f26, roughness: 0.5, metalness: 0.4 }, 'debris');
    fx.debris = new THREE.InstancedMesh(dg, dm, 48);
    fx.debris.count = 0;
    fx.debris.frustumCulled = false;
    fx.debris.castShadow = true;
    fx.group.add(fx.debris);
    return fx;
  };

  function rnd(a) { return (Math.random() * 2 - 1) * a; }
  // world (x, y, h) helpers
  function puff(fx, x, y, h, vx, vy, vh, size, grow, life, r, g, b, a, drag) {
    if (Math.random() > fx.quality + 0.25) return;
    var p = fx.smoke.spawn();
    if (!p) return;
    p.x = x; p.y = h; p.z = -y; p.vx = vx; p.vy = vh; p.vz = -vy;
    p.size = size; p.grow = grow; p.life = p.max = life; p.rot = Math.random() * 6.28; p.vr = rnd(0.8);
    p.r = r; p.g = g; p.b = b; p.a = a; p.kind = 0; p.drag = drag || 1.2; p.grav = 0;
  }
  function spark(fx, x, y, h, vx, vy, vh, life, size) {
    var p = fx.glow.spawn();
    if (!p) return;
    p.x = x; p.y = h; p.z = -y; p.vx = vx; p.vy = vh; p.vz = -vy;
    p.size = size || 0.09; p.grow = 0; p.life = p.max = life; p.rot = 0; p.vr = 0;
    p.a = 1; p.kind = 2; p.drag = 0.6; p.grav = 9.8;
  }
  function fire(fx, x, y, h, vx, vy, vh, size, grow, life) {
    var p = fx.glow.spawn();
    if (!p) return;
    p.x = x; p.y = h; p.z = -y; p.vx = vx; p.vy = vh; p.vz = -vy;
    p.size = size; p.grow = grow; p.life = p.max = life; p.rot = Math.random() * 6.28; p.vr = rnd(1.5);
    p.a = 0.9; p.kind = 1; p.drag = 1.5; p.grav = -1.5;
  }

  // Car-local (right, forward) -> world
  function local(c, lx, ly) {
    var ch = Math.cos(c.heading), sh = Math.sin(c.heading);
    return [c.x + ly * ch + lx * sh, c.y + ly * sh - lx * ch];
  }

  F.explode = function (fx, car) {
    fx.flash = 0.45;
    var vx = car.vx * 0.3, vy = car.vy * 0.3;
    for (var i = 0; i < 90; i++) fire(fx, car.x + rnd(1.2), car.y + rnd(1.2), 0.4 + Math.random(), vx + rnd(7), vy + rnd(7), 1.5 + Math.random() * 4, 0.7 + Math.random() * 0.7, 2.6, 0.5 + Math.random() * 0.5);
    for (var s = 0; s < 50; s++) puff(fx, car.x + rnd(1.5), car.y + rnd(1.5), 0.8 + Math.random(), vx + rnd(3), vy + rnd(3), 1.4 + Math.random() * 1.4, 1.2, 1.4, 2 + Math.random() * 1.5, 0.12, 0.12, 0.13, 0.75, 1.0);
    for (var k = 0; k < 40; k++) spark(fx, car.x, car.y, 0.5, vx + rnd(14), vy + rnd(14), 3 + Math.random() * 8, 0.6 + Math.random() * 0.8, 0.12);
    fx.debrisState.length = 0;
    for (var d = 0; d < 48; d++) {
      fx.debrisState.push({ x: car.x, y: car.y, h: 0.6, vx: vx + rnd(12), vy: vy + rnd(12), vh: 4 + Math.random() * 7, rx: Math.random() * 6, ry: Math.random() * 6, w: rnd(12), life: 2.5 + Math.random() });
    }
  };

  F.reset = function (fx) {
    fx.smoke.clear(); fx.glow.clear(); fx.skids.clear();
    fx.flash = 0; fx.wreck = 0; fx.debrisState.length = 0; fx.debris.count = 0; fx.light.intensity = 0;
  };

  var dummy = null;
  // Per frame. dt = game time (0 when paused).
  F.update = function (fx, R, dt) {
    var c = CR.Car.state, cfg = CR.Config, input = CR.Input.state;
    fx.time += dt;
    fx.skids.uniforms.uTime.value = fx.time;
    fx.rumble = 0;
    if (dt > 0 && CR.Track.samples.length) {
      var S = CR.Track.samples, s = S[c.nearestSampleIndex] || S[0], half = cfg.TRACK_WIDTH / 2;
      var offset = (c.x - s.x) * s.nx + (c.y - s.y) * s.ny, ao = Math.abs(offset);
      var speed = c.speed, lat = Math.abs(c.lateralVelocity || 0);
      var thr = c.autopilot || c.retired ? 0 : input.throttle, brk = c.autopilot || c.retired ? 0 : input.brake;
      var steer = Math.abs(c.steerSmoothed || 0);
      var lock = !c.retired && brk > 0.5 && speed > 22 && steer > 0.45;
      var slide = !c.retired && lat > 2.2 && speed > 6;
      var spin = !c.retired && thr > 0.9 && c.gear <= 2 && speed > 1 && speed < 16;
      var wheels = CR.Car.def ? CR.Car.def.model.filter(function (p) { return p.wheel; }) : [];
      var heat = R.camDistToCar;
      wheels.forEach(function (w, wi) {
        var p = local(c, w.wheel[0], w.wheel[1]);
        var front = !!w.front, key = 'p' + wi;
        var on = front ? lock : (slide || spin);
        if (on) {
          var str = front ? 0.85 : Math.min(1, spin ? 0.7 : (lat - 2.2) / 4 + 0.4);
          fx.skids.mark(key, p[0], p[1], c.heading, w.wheel[2] * 0.9, str, fx.time);
          var rate = front ? 26 : 18 + lat * 6;
          if (Math.random() < rate * dt * (heat < 160 ? 1 : 0.3)) puff(fx, p[0] + rnd(0.2), p[1] + rnd(0.2), 0.25, c.vx * 0.25 + rnd(1), c.vy * 0.25 + rnd(1), 0.5 + Math.random() * 0.7, 0.7, 2.4, 1.6 + Math.random(), 0.86, 0.86, 0.88, 0.32, 1.4);
        } else fx.skids.lift(key);
        // dust off the line / on the kerbs
        if (speed > 6 && ao > half - 0.3 && Math.random() < (ao > half + 0.9 ? 22 : 9) * dt) {
          var dust = ao > half + 0.9;
          puff(fx, p[0] + rnd(0.3), p[1] + rnd(0.3), 0.15, -c.vx * 0.05 + rnd(1.2), -c.vy * 0.05 + rnd(1.2), 0.4 + Math.random() * 0.5,
            dust ? 0.9 : 0.5, dust ? 2.8 : 1.6, dust ? 2.2 : 1.1, dust ? 0.62 : 0.55, dust ? 0.54 : 0.52, dust ? 0.42 : 0.5, dust ? 0.4 : 0.22, 1.1);
        }
      });
      if (ao > half - 0.5 && ao < half + 1.1 && Math.abs(s.curvature) >= 1 / 300) fx.rumble = Math.min(1, speed / 40);
      // sparks: against a wall, and from the skid plank at top speed
      if (c.touchingWall && speed > 4) {
        var side = offset > 0 ? 1 : -1, wall = side > 0 ? s.wallLeft : s.wallRight;
        var cx = s.x + s.nx * side * (wall - 0.1), cy = s.y + s.ny * side * (wall - 0.1);
        var px = c.x + (cx - c.x) * 0.8, py = c.y + (cy - c.y) * 0.8;
        var nSp = Math.min(14, 2 + speed * 0.25);
        for (var k = 0; k < nSp; k++) spark(fx, px + rnd(0.5), py + rnd(0.5), 0.3 + Math.random() * 0.4, c.vx * 0.6 + rnd(5), c.vy * 0.6 + rnd(5), 1 + Math.random() * 4, 0.3 + Math.random() * 0.4);
      }
      if (speed > 72 && Math.random() < 0.9 * dt) {
        var pr = local(c, 0, -1.2);
        for (var k2 = 0; k2 < 10; k2++) spark(fx, pr[0] + rnd(0.3), pr[1] + rnd(0.3), 0.04, c.vx * 0.82 + rnd(2), c.vy * 0.82 + rnd(2), 0.6 + Math.random() * 1.6, 0.25 + Math.random() * 0.25, 0.07);
      }
      // burning wreck
      if (c.exploded) {
        fx.wreck += dt * 9;
        while (fx.wreck >= 1) {
          fx.wreck -= 1;
          if (Math.random() < 0.5) fire(fx, c.x + rnd(0.9), c.y + rnd(1.4), 0.7, rnd(0.8), rnd(0.8), 1.5 + Math.random(), 0.6, 1.3, 0.55);
          else puff(fx, c.x + rnd(0.8), c.y + rnd(1.2), 1.0, rnd(0.8), rnd(0.8), 1 + Math.random() * 0.7, 0.8, 1.1, 2.6, 0.1, 0.1, 0.11, 0.6, 0.8);
        }
      }
    }
    if (dt > 0 && fx.flash > 0) fx.flash -= dt;
    fx.light.intensity = Math.max(0, fx.flash) * 60 + (CR.Car.state.exploded ? 3 + Math.random() * 2 : 0);
    if (CR.Car.state.exploded || fx.flash > 0) fx.light.position.set(CR.Car.state.x, 2, -CR.Car.state.y);
    fx.smoke.update(dt);
    fx.glow.update(dt);
    fx.skids.flush();
    // debris
    var D = fx.debrisState;
    if (D.length) {
      dummy = dummy || new THREE.Object3D();
      var alive = 0;
      for (var i = 0; i < D.length; i++) {
        var d = D[i];
        if (dt > 0) {
          d.life -= dt;
          d.vh -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.h += d.vh * dt;
          if (d.h < 0.05) { d.h = 0.05; d.vh = -d.vh * 0.3; d.vx *= 0.55; d.vy *= 0.55; d.w *= 0.5; }
          d.rx += d.w * dt; d.ry += d.w * 0.7 * dt;
        }
        if (d.life <= 0) continue;
        dummy.position.set(d.x, d.h, -d.y);
        dummy.rotation.set(d.rx, d.ry, 0);
        dummy.updateMatrix();
        fx.debris.setMatrixAt(alive++, dummy.matrix);
      }
      fx.debris.count = alive;
      fx.debris.instanceMatrix.needsUpdate = true;
      if (!alive) D.length = 0;
    }
  };

  F.setQuality = function (fx, q) { fx.quality = q; };
})();

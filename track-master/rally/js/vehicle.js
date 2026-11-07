// vehicle.js — RallyVehicle: the rally car built from three.js primitives.
// Model axes: +X forward, +Y up, +Z right (so rotation.y = -heading).
// The model only reads the physics state; swapping it for a GLB later
// needs no physics change. Parts:
//   root (position + yaw) -> body (pitch / roll / flip) -> shell, cabin,
//     bumpers, bonnet, roof, windows, lights, spoiler, mud flaps, interior
//     (dashboard, gauges, steering wheel, roll cage, seats), camera mounts
//   root -> 4 wheel pivots (height from the suspension, fronts steer)
//     -> wheel spin group (tyre, rim, spokes, disc) ; struts follow travel.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};

  function mat(color, opt) { var m = new THREE.MeshLambertMaterial(Object.assign({ color: color }, opt || {})); return m; }
  function std(color, opt) { return new THREE.MeshPhongMaterial(Object.assign({ color: color, shininess: 60, specular: 0x444444 }, opt || {})); }
  function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
  function cyl(rt, rb, h, seg, m) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), m); }
  function at(o, x, y, z) { o.position.set(x, y, z); return o; }

  // Livery on a canvas: white with an orange/red sweep and a door number.
  function liveryTex() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(0, 128); g.lineTo(0, 70); g.bezierCurveTo(180, 40, 300, 110, 512, 30); g.lineTo(512, 128); g.fill();
    g.fillStyle = '#d6202f'; g.beginPath(); g.moveTo(0, 128); g.lineTo(0, 98); g.bezierCurveTo(200, 80, 320, 120, 512, 70); g.lineTo(512, 128); g.fill();
    g.fillStyle = '#111'; g.fillRect(200, 18, 112, 58);
    g.fillStyle = '#fff'; g.font = 'bold 50px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('09', 256, 66);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  function create(spec) {
    var root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    var cg = spec.cgHeight, a = spec.wheelbase * (1 - spec.frontWeight), b = spec.wheelbase * spec.frontWeight;
    var tw = spec.track / 2, yGround = -cg;   // local y of the ground at rest (approx)
    var white = std(0xf1f1ee), dark = mat(0x16181b), black = mat(0x0c0c0d), grey = mat(0x5b6066);
    var glass = new THREE.MeshPhongMaterial({ color: 0x1b2633, shininess: 120, specular: 0x99aabb, transparent: true, opacity: 0.55 });
    var liv = new THREE.MeshPhongMaterial({ map: liveryTex(), shininess: 60, specular: 0x444444 });
    var parts = {};

    // --- shell: lower body with livery on the sides
    var floorY = yGround + 0.24;
    var shell = box(4.02, 0.62, 1.78, [liv, liv, white, dark, liv, liv]);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z — sides get the livery
    shell.material = [white, white, dark, dark, liv, liv]; // top is the cabin floor / under the bonnet
    at(shell, 0.05, floorY + 0.31, 0); body.add(shell); parts.shell = shell;
    // wheel arches / fender flares
    [[a, -1], [a, 1], [-b, -1], [-b, 1]].forEach(function (p) {
      var fl = box(0.95, 0.2, 0.12, white); at(fl, p[0], floorY + 0.56, p[1] * 0.93); body.add(fl);
      var lip = box(0.95, 0.06, 0.16, black); at(lip, p[0], floorY + 0.46, p[1] * 0.95); body.add(lip);
    });
    // bonnet (sloped) with a scoop
    var bonnet = box(1.25, 0.08, 1.62, white); at(bonnet, 1.38, floorY + 0.66, 0); bonnet.rotation.z = -0.1; body.add(bonnet); parts.bonnet = bonnet;
    var scoop = box(0.35, 0.08, 0.5, dark); at(scoop, 1.2, floorY + 0.72, 0); body.add(scoop);
    // cabin: pillars + roof + glass
    var roof = box(1.75, 0.07, 1.42, liv); roof.material = [white, white, liv, dark, white, white];
    at(roof, -0.35, floorY + 1.18, 0); body.add(roof); parts.roof = roof;
    var vent = box(0.4, 0.07, 0.3, dark); at(vent, -0.1, floorY + 1.24, 0); body.add(vent);
    var wind = box(0.05, 0.62, 1.44, glass); at(wind, 0.78, floorY + 0.92, 0); wind.rotation.z = 0.62; body.add(wind); parts.windscreen = wind;
    var rear = box(0.05, 0.55, 1.38, glass); at(rear, -1.35, floorY + 0.92, 0); rear.rotation.z = -0.55; body.add(rear);
    [-1, 1].forEach(function (s) {
      var side = box(1.7, 0.44, 0.04, glass); at(side, -0.3, floorY + 0.9, s * 0.73); body.add(side);
      var aPillar = box(0.07, 0.68, 0.07, white); at(aPillar, 0.78, floorY + 0.92, s * 0.7); aPillar.rotation.z = 0.62; body.add(aPillar);
      var cPillar = box(0.07, 0.6, 0.07, white); at(cPillar, -1.3, floorY + 0.92, s * 0.68); cPillar.rotation.z = -0.55; body.add(cPillar);
      var mirror = box(0.1, 0.08, 0.14, white); at(mirror, 0.6, floorY + 0.74, s * 0.97); body.add(mirror);
    });
    // bumpers
    var fb = box(0.3, 0.32, 1.84, dark); at(fb, 2.08, floorY + 0.16, 0); body.add(fb); parts.frontBumper = fb;
    var splitter = box(0.36, 0.04, 1.86, black); at(splitter, 2.1, floorY - 0.0, 0); body.add(splitter);
    var rb = box(0.26, 0.3, 1.82, dark); at(rb, -1.98, floorY + 0.16, 0); body.add(rb); parts.rearBumper = rb;
    // lights: headlights, light pod, tail lights
    var hl = new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), tl = new THREE.MeshBasicMaterial({ color: 0xc8151b });
    [-1, 1].forEach(function (s) {
      var h = box(0.06, 0.13, 0.36, hl); at(h, 2.08, floorY + 0.44, s * 0.62); body.add(h);
      var t = box(0.05, 0.12, 0.3, tl); at(t, -2.0, floorY + 0.48, s * 0.66); body.add(t);
    });
    var pod = box(0.12, 0.2, 1.05, black); at(pod, 2.13, floorY + 0.56, 0); body.add(pod);
    for (var p = 0; p < 4; p++) { var lp = cyl(0.08, 0.08, 0.04, 14, hl); lp.rotation.z = Math.PI / 2; at(lp, 2.2, floorY + 0.56, -0.39 + p * 0.26); body.add(lp); }
    parts.lights = pod;
    // spoiler on stands
    var wing = box(0.42, 0.04, 1.62, dark); at(wing, -1.82, floorY + 1.18, 0); wing.rotation.z = 0.12; body.add(wing); parts.spoiler = wing;
    [-1, 1].forEach(function (s) { var st = box(0.06, 0.32, 0.04, dark); at(st, -1.82, floorY + 1.0, s * 0.62); body.add(st); var ep = box(0.44, 0.16, 0.03, dark); at(ep, -1.82, floorY + 1.2, s * 0.82); body.add(ep); });
    // mud flaps behind each wheel
    [[a, -1], [a, 1], [-b, -1], [-b, 1]].forEach(function (pp) {
      var mf = box(0.02, 0.3, 0.32, mat(0x202225)); at(mf, pp[0] - 0.48, yGround + 0.2, pp[1] * 0.78); body.add(mf);
    });
    parts.mudflaps = true;

    // --- interior (seen from the cockpit camera)
    var interior = new THREE.Group(); body.add(interior); parts.interior = interior;
    var dashM = mat(0x1f2226), cageM = mat(0x9aa0a6);
    var dash = box(0.32, 0.16, 1.44, dashM); at(dash, 0.66, floorY + 0.5, 0); interior.add(dash);
    var dashTop = box(0.36, 0.03, 1.44, mat(0x101215)); at(dashTop, 0.64, floorY + 0.59, 0); interior.add(dashTop);
    // gauges: rpm (big) and speed, needles turn
    var gaugeFace = new THREE.MeshBasicMaterial({ color: 0x0b0d10 }), ring = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    function gauge(z, r) {
      var g = new THREE.Group();
      var face = new THREE.Mesh(new THREE.CircleGeometry(r, 24), gaugeFace); face.rotation.y = -Math.PI / 2; g.add(face);
      var rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 24, 1, Math.PI * 1.25, Math.PI * 1.5), ring); rim.rotation.y = -Math.PI / 2; rim.position.x = -0.001; g.add(rim);
      var nd = new THREE.Group(); var needle = box(0.002, r * 0.85, 0.008, new THREE.MeshBasicMaterial({ color: 0xffffff })); needle.position.y = r * 0.42; nd.add(needle); nd.position.x = -0.004; g.add(nd);
      g.position.set(0.5, floorY + 0.6, z); g.rotation.z = 0.25;
      interior.add(g);
      return nd;
    }
    parts.rpmNeedle = gauge(-0.38, 0.075);
    parts.speedNeedle = gauge(-0.22, 0.055);
    // steering wheel
    var wheelG = new THREE.Group(); at(wheelG, 0.3, floorY + 0.56, -0.38); wheelG.rotation.z = 0.4; interior.add(wheelG);
    var sw = new THREE.Group(); wheelG.add(sw);
    var rimT = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.016, 8, 26), mat(0x141414)); rimT.rotation.y = Math.PI / 2; sw.add(rimT);
    [0, 2.1, 4.2].forEach(function (an) { var sp = box(0.012, 0.15, 0.02, grey); sp.rotation.x = an; sp.position.set(0, Math.cos(an) * 0.075, -Math.sin(an) * 0.075); sw.add(sp); });
    var mark = box(0.01, 0.03, 0.02, ring); mark.position.set(0.003, 0.15, 0); sw.add(mark);
    parts.steeringWheel = sw;
    // seats
    [-0.38, 0.38].forEach(function (z) {
      var seat = box(0.55, 0.12, 0.5, mat(0x222428)); at(seat, -0.35, floorY + 0.25, z); interior.add(seat);
      var back = box(0.12, 0.72, 0.5, mat(0x26292e)); at(back, -0.62, floorY + 0.6, z); back.rotation.z = 0.15; interior.add(back);
    });
    // roll cage (tubes along the inside of the cabin)
    function tube(x1, y1, z1, x2, y2, z2) {
      var v = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1), len = v.length();
      var t = cyl(0.017, 0.017, len, 6, cageM); t.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); interior.add(t);
    }
    var yt = floorY + 1.13, yb = floorY + 0.3;
    [-0.66, 0.66].forEach(function (z) { tube(0.72, yb + 0.3, z, 0.42, yt, z); tube(0.42, yt, z, -1.05, yt, z); tube(-1.05, yt, z, -1.2, yb, z); });
    tube(0.42, yt, -0.66, 0.42, yt, 0.66); tube(-1.05, yt, -0.66, -1.05, yt, 0.66); tube(-1.05, yt, -0.66, 0.42, yt, 0.66);
    // door bars
    tube(0.55, yb + 0.25, -0.66, -0.9, yb + 0.25, -0.66);

    // camera mounts (cameras look along +X when rotated -90 deg about Y)
    parts.cockpitMount = at(new THREE.Object3D(), -0.3, floorY + 1.0, -0.38); body.add(parts.cockpitMount);
    parts.cockpitMount.rotation.z = -0.06; // eyes look slightly down the road
    parts.hoodMount = at(new THREE.Object3D(), 1.15, floorY + 0.92, 0); body.add(parts.hoodMount);

    // --- wheels
    var R = spec.wheelRadius, tyreM = mat(0x18191b), rimM = std(0xd9dde2, { shininess: 90 }), discM = mat(0x6e6e70);
    var wheels = [];
    [[a, -tw, true], [a, tw, true], [-b, -tw, false], [-b, tw, false]].forEach(function (p, i) {
      var pivot = new THREE.Group(); pivot.position.set(p[0], 0, p[1]); root.add(pivot);
      var spin = new THREE.Group(); pivot.add(spin);
      var tyre = cyl(R, R, 0.24, 20, tyreM); tyre.rotation.x = Math.PI / 2; spin.add(tyre);
      var tread = new THREE.Mesh(new THREE.TorusGeometry(R - 0.01, 0.035, 6, 20), tyreM); spin.add(tread); // rounded shoulder
      var rim = cyl(R * 0.6, R * 0.6, 0.25, 14, rimM); rim.rotation.x = Math.PI / 2; spin.add(rim);
      for (var s = 0; s < 6; s++) { var sp = box(0.04, R * 1.1, 0.03, rimM); sp.rotation.z = s * Math.PI / 3; sp.position.z = (p[1] > 0 ? 1 : -1) * 0.13; spin.add(sp); }
      var disc = cyl(R * 0.48, R * 0.48, 0.03, 16, discM); disc.rotation.x = Math.PI / 2; disc.position.z = (p[1] > 0 ? -1 : 1) * 0.04; pivot.add(disc);
      var strut = cyl(0.035, 0.035, 1, 6, grey); strut.position.set(0, 0, (p[1] > 0 ? -1 : 1) * 0.22); root.add(strut);
      wheels.push({ pivot: pivot, spin: spin, strut: strut, front: p[2], lx: p[0], lz: p[1] });
    });

    // contact shadow (used when real shadows are off)
    var blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; root.add(blob);

    root.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
    blob.castShadow = false;

    var V = { root: root, body: body, parts: parts, wheels: wheels, blob: blob, floorY: floorY };
    V.update = function (car) { sync(V, car); };
    V.setInteriorVisible = function (on) { interior.visible = on; };
    V.dispose = function () {
      root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      });
    };
    return V;
  }

  function sync(V, car) {
    var root = V.root;
    root.position.set(car.x, car.y, car.z);
    root.rotation.set(0, -car.yaw, 0);
    var roll = car.roll, lift = 0;
    if (car.flip) { roll += car.flip.visualRoll || 0; lift = Math.abs(Math.sin((car.flip.visualRoll || 0))) * 0.9; }
    V.body.rotation.set(roll, 0, car.pitch, 'YZX');
    V.body.position.y = lift;
    var spec = car.spec;
    for (var i = 0; i < 4; i++) {
      var w = car.wheels[i], vw = V.wheels[i];
      vw.pivot.position.y = w.wheelY - car.y;
      vw.pivot.rotation.y = -w.steer;
      vw.spin.rotation.z = -w.angle;
      // strut from the body mount down to the hub
      var top = V.floorY + 0.55 + vw.lx * car.pitch * 0, hub = vw.pivot.position.y;
      vw.strut.position.x = vw.lx; vw.strut.position.y = (top + hub) / 2;
      vw.strut.scale.y = Math.max(0.05, top - hub);
    }
    V.parts.steeringWheel.rotation.x = car.steer / spec.maxSteer * 2.2;
    V.parts.rpmNeedle.rotation.x = -(-2.3 + 4.6 * Math.min(1, car.rpm / 8000));
    V.parts.speedNeedle.rotation.x = -(-2.3 + 4.6 * Math.min(1, car.speed * 3.6 / 220));
    // blob shadow sits on the ground under the car
    var gy = (car.wheels[0].gy + car.wheels[1].gy + car.wheels[2].gy + car.wheels[3].gy) / 4;
    V.blob.position.y = gy - car.y + 0.03;
  }

  RL.Vehicle = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);

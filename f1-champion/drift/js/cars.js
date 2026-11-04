// cars.js — the three drift cars: specs, Circuit Racer physics values and
// three.js models built from their real side profiles.
// Real dimensions (mm): AE86 Sprinter Trueno 4205 x 1625 x 1335, wb 2400,
// 940 kg, 4A-GE 1.6 L I4 130 PS. RX-7 FD3S 4285 x 1760 x 1230, wb 2425,
// 1260 kg, 13B-REW twin-turbo rotary 255-280 PS. Miata NA 3970 x 1675 x
// 1235, wb 2265, 940 kg, 1.6 L I4 115 PS. All rear-wheel drive with
// pop-up headlights.
// `physics` overrides the Circuit Racer base values (physics.js) for this
// car; the model's nose points along +x, +y up, +z to the right.
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};

  var Cars = {
    list: [
      {
        id: 'ae86', name: 'AE86 트레노', full: 'Toyota Sprinter Trueno GT-APEX (AE86)',
        tagline: '가볍고 균형 잡힌 FR — 드리프트가 가장 쉬워요',
        engine: '1.6L 직렬 4기통 4A-GE · 130마력', weight: '940kg',
        len: 4.205, wid: 1.625, hgt: 1.335, wb: 2.4, tyre: 0.29,
        color: 0xf4f4f0, eye: { fwd: 1.0, up: 1.08 },
        sound: { cyl: 4, base: 0.5, cutoff: 2600, buzz: 0.25 },
        physics: { FINAL_DRIVE: 4.6, TORQUE_SCALE: 0.82, CAR_MASS: 880, DRAG_COEF: 0.37, TIRE_GRIP_TARMAC: 1.08,
          MAX_STEER_ANGLE: 0.56, STEER_RESPONSE_RATE: 6.0, DRIFT_TURN_ACCEL: 2.5, DRIFT_SPEED_COST: 0.32,
          CAR_HALF_WIDTH: 0.82, CAR_HALF_LENGTH: 2.1, REDLINE_RPM: 7600 },
        stats: { power: 0.45, grip: 0.6, drift: 1.0 },
      },
      {
        id: 'rx7', name: 'RX-7 (FD3S)', full: 'Mazda RX-7 Type R (FD3S)',
        tagline: '트윈터보 로터리 — 가장 빠르지만 미끄러지면 잡기 어려워요',
        engine: '1.3L 트윈터보 로터리 13B-REW · 280마력', weight: '1260kg',
        len: 4.285, wid: 1.76, hgt: 1.23, wb: 2.425, tyre: 0.31,
        color: 0xf2c418, eye: { fwd: 0.95, up: 1.1 },
        sound: { cyl: 2, base: 0.75, cutoff: 3400, buzz: 0.6 },
        physics: { FINAL_DRIVE: 4.1, TORQUE_SCALE: 1.32, CAR_MASS: 960, DRAG_COEF: 0.31, TIRE_GRIP_TARMAC: 1.15,
          MAX_STEER_ANGLE: 0.5, STEER_RESPONSE_RATE: 5.0, DRIFT_TURN_ACCEL: 1.95, DRIFT_SPEED_COST: 0.42,
          CAR_HALF_WIDTH: 0.89, CAR_HALF_LENGTH: 2.14, REDLINE_RPM: 8000 },
        stats: { power: 1.0, grip: 0.8, drift: 0.62 },
      },
      {
        id: 'miata', name: '미아타 (NA)', full: 'Mazda MX-5 Miata (NA)',
        tagline: '작고 날카로운 로드스터 — 코너 그립이 가장 좋아요',
        engine: '1.6L 직렬 4기통 B6-ZE · 115마력', weight: '940kg',
        len: 3.97, wid: 1.675, hgt: 1.235, wb: 2.265, tyre: 0.285,
        color: 0xc8102e, eye: { fwd: 0.8, up: 1.1 },
        sound: { cyl: 4, base: 0.45, cutoff: 2300, buzz: 0.2 },
        physics: { FINAL_DRIVE: 4.8, TORQUE_SCALE: 0.76, CAR_MASS: 840, DRAG_COEF: 0.38, TIRE_GRIP_TARMAC: 1.32,
          MAX_STEER_ANGLE: 0.6, STEER_RESPONSE_RATE: 7.2, DRIFT_TURN_ACCEL: 2.15, DRIFT_SPEED_COST: 0.36,
          CAR_HALF_WIDTH: 0.84, CAR_HALF_LENGTH: 1.98, REDLINE_RPM: 7200 },
        stats: { power: 0.38, grip: 1.0, drift: 0.8 },
      },
    ],
  };
  Cars.byId = {};
  Cars.list.forEach(function (c) { Cars.byId[c.id] = c; });

  // --- Models ----------------------------------------------------------------

  var MAT = {};
  function mat(key, make) { return MAT[key] || (MAT[key] = make()); }
  function phong(color, shin) { return new THREE.MeshPhongMaterial({ color: color, shininess: shin == null ? 60 : shin, specular: 0x555555 }); }
  var black = function () { return mat('black', function () { return phong(0x141518, 20); }); };
  var glass = function () { return mat('glass', function () { return new THREE.MeshPhongMaterial({ color: 0x1c2733, shininess: 120, specular: 0xaaaaaa, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false }); }); };
  var chrome = function () { return mat('chrome', function () { return phong(0xc9ccd1, 90); }); };

  // Side profile (x forward, y up) with wheel arches cut into the bottom,
  // extruded across the car's width with rounded edges.
  function bodyShape(spec, top, bottomY, archR) {
    var wf = spec.wb / 2 + spec.wbShift, wr = -spec.wb / 2 + spec.wbShift, r = spec.tyre, L = spec.len / 2;
    var s = new THREE.Shape();
    s.moveTo(-L, bottomY);
    s.lineTo(wr - archR, bottomY);
    s.absarc(wr, r, archR, Math.PI, 0, true);
    s.lineTo(wf - archR, bottomY);
    s.absarc(wf, r, archR, Math.PI, 0, true);
    s.lineTo(L - 0.05, bottomY);
    for (var i = 0; i < top.length; i++) {
      var p = top[i];
      if (p.length === 4) s.quadraticCurveTo(p[2], p[3], p[0], p[1]);
      else s.lineTo(p[0], p[1]);
    }
    s.lineTo(-L, bottomY);
    return s;
  }
  function extrude(shape, width, material, bevel) {
    bevel = bevel == null ? 0.05 : bevel;
    var g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10, steps: 1 });
    g.translate(0, 0, -(width - 2 * bevel) / 2);
    var m = new THREE.Mesh(g, material);
    m.castShadow = true;
    return m;
  }
  // Flat polygon (x, y points) on a side of the car at z.
  function sidePoly(pts, z, material) {
    var s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    var g = new THREE.ShapeGeometry(s);
    var m = new THREE.Mesh(g, material);
    m.position.z = z;
    if (z < 0) m.rotation.y = 0; // ShapeGeometry is double-sided via material
    return m;
  }
  // Quad across the car between two profile points (windscreen, rear glass).
  function crossQuad(a, b, halfA, halfB, material, lift) {
    lift = lift || 0.012;
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len * lift, ny = dx / len * lift;
    if (ny < 0) { nx = -nx; ny = -ny; }
    var v = new Float32Array([
      a[0] + nx, a[1] + ny, -halfA, a[0] + nx, a[1] + ny, halfA, b[0] + nx, b[1] + ny, halfB,
      a[0] + nx, a[1] + ny, -halfA, b[0] + nx, b[1] + ny, halfB, b[0] + nx, b[1] + ny, -halfB,
    ]);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
  function box(w, h, d, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }

  // A tyre with a spoked rim; spins about its axle (local z).
  function wheel(r, w, rimColor, spokes) {
    var g = new THREE.Group();
    var spin = new THREE.Group();
    g.add(spin);
    var tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22, 1), mat('tyre', function () { return phong(0x1a1a1a, 8); }));
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    spin.add(tyre);
    var rimM = mat('rim' + rimColor, function () { return phong(rimColor, 80); });
    var rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, w + 0.01, 18), black());
    rim.rotation.x = Math.PI / 2;
    spin.add(rim);
    for (var side = -1; side <= 1; side += 2) {
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.14, 0.02, 10), rimM);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = side * (w / 2 + 0.012);
      spin.add(hub);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, r * 0.05, 6, 22), rimM);
      ring.position.z = side * (w / 2 + 0.008);
      spin.add(ring);
      for (var k = 0; k < spokes; k++) {
        var sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.1, 0.02), rimM);
        var a = (k / spokes) * Math.PI * 2;
        sp.position.set(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, side * (w / 2 + 0.01));
        sp.rotation.z = a;
        spin.add(sp);
      }
    }
    g.userData.spin = spin;
    return g;
  }

  function addWheels(car, spec, rimColor, spokes, tyreW) {
    var wheels = [], halfTrack = spec.wid / 2 - tyreW / 2 - 0.04;
    [[spec.wb / 2 + spec.wbShift, true], [-spec.wb / 2 + spec.wbShift, false]].forEach(function (ax) {
      [-1, 1].forEach(function (side) {
        var w = wheel(spec.tyre, tyreW, rimColor, spokes);
        w.position.set(ax[0], spec.tyre, side * halfTrack);
        w.userData.front = ax[1];
        car.add(w);
        wheels.push(w);
      });
    });
    // Dark wheel wells so the arches don't show daylight through the car.
    [spec.wb / 2 + spec.wbShift, -spec.wb / 2 + spec.wbShift].forEach(function (x) {
      car.add(box(0.76, 0.5, spec.wid - 0.5, black(), x, 0.42, 0));
    });
    car.userData.wheels = wheels;
  }

  function lights(car, spec, frontPts, rearX, rearY, rearW, rearH) {
    var tail = new THREE.MeshPhongMaterial({ color: 0x5a0a0a, emissive: 0x220000, shininess: 80 });
    var hw = spec.wid / 2;
    [-1, 1].forEach(function (s) {
      var t = box(0.05, rearH, rearW, tail, -spec.len / 2 - 0.075, rearY, s * (hw - rearW / 2 - 0.08));
      car.add(t);
    });
    car.userData.tail = tail;
  }

  function buildAE86(spec) {
    var car = new THREE.Group(), body = phong(spec.color, 70);
    var top = [[2.1, 0.5], [2.08, 0.72], [0.95, 0.86], [0.18, 1.3], [-1.02, 1.31], [-1.9, 1.0], [-2.08, 0.96], [-2.1, 0.5]];
    car.add(extrude(bodyShape(spec, top, 0.3, 0.37), spec.wid, body));
    // Panda two-tone: black lower body and bumpers.
    var low = new THREE.Shape();
    low.moveTo(-2.13, 0.3); low.lineTo(2.14, 0.3); low.lineTo(2.15, 0.58); low.lineTo(-2.14, 0.6); low.lineTo(-2.13, 0.3);
    var lowM = extrude(low, spec.wid + 0.02, black(), 0.03);
    car.add(lowM);
    var hw = spec.wid / 2 + 0.004;
    [-1, 1].forEach(function (s) {
      var win = sidePoly([[0.84, 0.9], [0.16, 1.25], [-0.98, 1.26], [-1.78, 0.98], [-0.3, 0.92]], s * hw, glass());
      car.add(win);
      car.add(box(0.06, 0.38, 0.02, body, -0.38, 1.08, s * (hw + 0.002))); // B-pillar
    });
    car.add(crossQuad([0.95, 0.86], [0.18, 1.3], hw - 0.12, hw - 0.2, glass()));
    car.add(crossQuad([-1.02, 1.31], [-1.9, 1.0], hw - 0.2, hw - 0.12, glass()));
    // Closed pop-up headlights, grille slot, rear spoiler and garnish.
    [-1, 1].forEach(function (s) { car.add(box(0.5, 0.025, 0.36, black(), 1.75, 0.74, s * 0.5)); });
    car.add(box(0.03, 0.06, 1.1, black(), 2.17, 0.66, 0));
    car.add(box(0.36, 0.04, spec.wid - 0.1, body, -1.88, 1.03, 0));
    car.add(box(0.03, 0.13, spec.wid - 0.5, black(), -2.17, 0.78, 0));
    lights(car, spec, null, -2.1, 0.78, 0.36, 0.13);
    addWheels(car, spec, 0xb0b4ba, 8, 0.2);
    return car;
  }

  function buildRX7(spec) {
    var car = new THREE.Group(), body = phong(spec.color, 90);
    var top = [[2.16, 0.56], [1.95, 0.7, 2.12, 0.68], [0.95, 0.88, 1.5, 0.82], [0.25, 1.02], [-0.25, 1.22, 0.05, 1.18], [-0.7, 1.23],
      [-1.65, 0.98, -1.25, 1.18], [-2.06, 0.94], [-2.14, 0.86], [-2.14, 0.5]];
    car.add(extrude(bodyShape(spec, top, 0.3, 0.38), spec.wid, body, 0.08));
    car.add(extrude((function () {
      var s = new THREE.Shape(); s.moveTo(-2.16, 0.3); s.lineTo(2.17, 0.3); s.lineTo(2.18, 0.4); s.lineTo(-2.16, 0.4); s.lineTo(-2.16, 0.3); return s;
    })(), spec.wid + 0.01, black(), 0.03));
    var hw = spec.wid / 2 + 0.004;
    [-1, 1].forEach(function (s) {
      car.add(sidePoly([[0.24, 1.0], [-0.2, 1.17], [-0.72, 1.18], [-1.45, 0.99], [-0.2, 0.96]], s * (hw - 0.08), glass()));
    });
    car.add(crossQuad([0.28, 1.01], [-0.22, 1.2], hw - 0.22, hw - 0.3, glass()));
    car.add(crossQuad([-0.72, 1.22], [-1.6, 0.99], hw - 0.3, hw - 0.2, glass()));
    [-1, 1].forEach(function (s) { car.add(box(0.46, 0.02, 0.32, black(), 1.6, 0.79, s * 0.55)); });
    car.add(box(0.05, 0.1, 0.9, black(), 2.15, 0.45, 0)); // mouth
    // Rear wing (Type R) on two stays.
    car.add(box(0.28, 0.035, spec.wid - 0.12, body, -1.95, 1.07, 0));
    [-1, 1].forEach(function (s) { car.add(box(0.12, 0.12, 0.05, body, -1.95, 1.0, s * 0.65)); });
    lights(car, spec, null, -2.13, 0.72, 0.42, 0.09);
    addWheels(car, spec, 0x9aa0a8, 5, 0.23);
    return car;
  }

  function buildMiata(spec) {
    var car = new THREE.Group(), body = phong(spec.color, 80);
    var top = [[1.98, 0.6], [1.8, 0.71, 1.98, 0.7], [0.55, 0.85], [-1.9, 0.86], [-1.98, 0.6]];
    car.add(extrude(bodyShape(spec, top, 0.29, 0.36), spec.wid, body, 0.07));
    car.add(extrude((function () {
      var s = new THREE.Shape(); s.moveTo(-2.0, 0.29); s.lineTo(2.0, 0.29); s.lineTo(2.01, 0.38); s.lineTo(-2.0, 0.38); s.lineTo(-2.0, 0.29); return s;
    })(), spec.wid + 0.01, black(), 0.03));
    // Open cockpit: dark tub, seats with headrests, windscreen in a frame.
    car.add(box(1.3, 0.04, spec.wid - 0.34, black(), -0.35, 0.885, 0));
    var seat = mat('seat', function () { return phong(0x2a2a2e, 15); });
    [-1, 1].forEach(function (s) {
      car.add(box(0.14, 0.42, 0.44, seat, -0.75, 1.02, s * 0.34));
      car.add(box(0.12, 0.16, 0.26, seat, -0.76, 1.28, s * 0.34));
    });
    var hw = spec.wid / 2 - 0.12;
    var ws = crossQuad([0.48, 0.87], [0.06, 1.24], hw, hw - 0.06, glass(), 0.002);
    car.add(ws);
    [-1, 1].forEach(function (s) { car.add(box(0.05, 0.42, 0.05, black(), 0.27, 1.05, s * hw)); });
    car.add(box(0.06, 0.04, 2 * hw, black(), 0.06, 1.24, 0));
    // Driver's helmet (left-hand drive export car: driver on the left).
    car.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat('helmet', function () { return phong(0xeeeeee, 80); })));
    car.children[car.children.length - 1].position.set(-0.6, 1.3, -0.34);
    [-1, 1].forEach(function (s) { car.add(box(0.44, 0.02, 0.3, black(), 1.55, 0.735, s * 0.5)); });
    car.add(box(0.04, 0.1, 0.62, black(), 1.99, 0.47, 0)); // mouth
    lights(car, spec, null, -1.99, 0.72, 0.4, 0.1);
    addWheels(car, spec, 0xc7cacf, 7, 0.19);
    return car;
  }

  var BUILD = { ae86: buildAE86, rx7: buildRX7, miata: buildMiata };
  Cars.list.forEach(function (c) { c.wbShift = c.id === 'miata' ? -0.05 : 0.02; });

  // Returns a THREE.Group: root (yaw + position) > body (pitch / roll).
  Cars.build = function (id) {
    var spec = Cars.byId[id];
    var root = new THREE.Group(), body = BUILD[id](spec);
    root.add(body);
    root.userData.body = body;
    root.userData.wheels = body.userData.wheels;
    root.userData.tail = body.userData.tail;
    // Soft contact shadow under the car.
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(spec.len + 0.5, spec.wid + 0.4), mat('shadow', function () {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 6, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
    }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    root.add(sh);
    return root;
  };

  DR.Cars = Cars;
})();

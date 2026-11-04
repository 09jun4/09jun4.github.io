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
        color: 0xb3121c, eye: { fwd: 0.95, up: 1.1 },
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
        color: 0x18a39d, eye: { fwd: 0.8, up: 1.1 },
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

  function lights(car, spec, rearY, rearW, rearH) {
    var tail = new THREE.MeshPhongMaterial({ color: 0x5a0a0a, emissive: 0x220000, shininess: 80 });
    var hw = spec.wid / 2;
    [-1, 1].forEach(function (s) {
      car.add(box(0.05, rearH, rearW, tail, -spec.len / 2 - 0.075, rearY, s * (hw - rearW / 2 - 0.08)));
    });
    car.userData.tail = tail;
  }
  var amber = function () { return mat('amber', function () { return new THREE.MeshPhongMaterial({ color: 0xff8a1a, emissive: 0x552200, shininess: 90 }); }); };
  var lamp = function () { return mat('lamp', function () { return new THREE.MeshPhongMaterial({ color: 0xf4f1e0, emissive: 0x6a675a, shininess: 120 }); }); };
  var fog = function () { return mat('fog', function () { return new THREE.MeshPhongMaterial({ color: 0xffd21a, emissive: 0x665000, shininess: 120 }); }); };

  // Raised pop-up headlight pod: a black box on the bonnet with the lamp
  // facing forward (round or square lens).
  function popup(car, x, y, z, w, h, round) {
    var pod = box(0.2, h, w, black(), x, y + h / 2, z);
    car.add(pod);
    if (round) {
      var lens = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.36, h * 0.36, 0.02, 18), lamp());
      lens.rotation.z = Math.PI / 2;
      lens.position.set(x + 0.105, y + h / 2, z);
      car.add(lens);
    } else {
      car.add(box(0.02, h * 0.72, w * 0.82, lamp(), x + 0.105, y + h / 2, z));
    }
  }
  // Glasshouse: the cabin as a narrower dark-glass block (tumblehome),
  // capped by a body-colour roof panel between roof[0] and roof[1] (x).
  var cabinGlass = function () { return mat('cabinGlass', function () { return new THREE.MeshPhongMaterial({ color: 0x18222d, shininess: 140, specular: 0xbbbbbb }); }); };
  function cabin(car, pts, width, roofMat, roof, roofW) {
    var s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    car.add(extrude(s, width, cabinGlass(), 0.04));
    var r = new THREE.Shape(), top = pts.filter(function (p) { return p[0] <= roof[0] && p[0] >= roof[1]; });
    r.moveTo(roof[0], top[0][1] - 0.01);
    top.forEach(function (p) { r.lineTo(p[0], p[1] + 0.045); }); // above the glass bevel
    r.lineTo(roof[1], top[top.length - 1][1] - 0.01);
    car.add(extrude(r, roofW || width + 0.02, roofMat, 0.02));
  }

  // Door mirror on a short arm (housing in the given material).
  function mirror(car, x, y, halfW, material, round) {
    [-1, 1].forEach(function (s) {
      car.add(box(0.12, 0.04, 0.08, material, x, y - 0.04, s * (halfW + 0.03)));
      var h = round ? new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), material) : box(0.1, 0.1, 0.16, material, x, y, s * (halfW + 0.12));
      if (round) { h.scale.set(1, 0.85, 1.25); h.position.set(x, y, s * (halfW + 0.11)); }
      car.add(h);
    });
  }

  // Toyota Sprinter Trueno 3-door (AE86) in the classic two-tone: white
  // upper, black lower body and bumpers with a thin pinstripe, raised
  // square pop-ups, black grille with amber indicators, yellow fog lamps,
  // long hatch glass, separate rear quarter window, black 8-spoke wheels.
  function buildAE86(spec) {
    var car = new THREE.Group(), body = phong(spec.color, 70);
    var top = [[2.1, 0.5], [2.09, 0.71], [0.98, 0.86], [-1.95, 0.93], [-2.09, 0.97], [-2.1, 0.5]];
    car.add(extrude(bodyShape(spec, top, 0.3, 0.37), spec.wid, body, 0.05));
    cabin(car, [[1.0, 0.85], [0.22, 1.3], [-0.2, 1.33], [-0.88, 1.33], [-1.93, 0.99], [-1.95, 0.9], [1.0, 0.82]], spec.wid - 0.2, body, [0.25, -0.9]);
    // Black lower body (split at the door-handle line) and bumpers.
    var low = new THREE.Shape();
    low.moveTo(-2.13, 0.3); low.lineTo(2.14, 0.3); low.lineTo(2.15, 0.62); low.lineTo(-2.14, 0.66); low.lineTo(-2.13, 0.3);
    car.add(extrude(low, spec.wid + 0.02, black(), 0.03));
    var hw = spec.wid / 2 + 0.012, cw = (spec.wid - 0.2) / 2 + 0.006, stripe = mat('stripe', function () { return phong(0xd9d9d9, 40); });
    [-1, 1].forEach(function (s) {
      car.add(sidePoly([[-2.02, 0.565], [2.0, 0.535], [2.0, 0.555], [-2.02, 0.585]], s * hw, stripe));
      car.add(box(0.1, 0.42, 0.02, black(), -0.36, 1.1, s * cw)); // B-pillar
      car.add(box(0.13, 0.025, 0.02, black(), -0.1, 0.8, s * (hw + 0.004))); // door handle
    });
    mirror(car, 0.78, 1.0, spec.wid / 2, black());
    // Open square pop-ups, black grille with the indicators, fog lamps.
    [-1, 1].forEach(function (s) {
      popup(car, 1.84, 0.71, s * 0.55, 0.4, 0.24, false);
      car.add(box(0.03, 0.07, 0.3, amber(), 2.16, 0.6, s * 0.6));
      car.add(box(0.04, 0.07, 0.12, fog(), 2.15, 0.36, s * 0.55));
    });
    car.add(box(0.03, 0.08, 0.75, mat('grille', function () { return phong(0x1d1f22, 10); }), 2.16, 0.6, 0));
    car.add(box(0.03, 0.035, 0.24, stripe, 2.17, 0.6, 0)); // badge
    // Hatch spoiler and the black tail panel between the lamps.
    car.add(box(0.3, 0.035, spec.wid - 0.12, body, -1.92, 1.035, 0));
    car.add(box(0.03, 0.14, spec.wid - 0.6, black(), -2.17, 0.79, 0));
    lights(car, spec, 0.79, 0.34, 0.14);
    addWheels(car, spec, 0x232427, 8, 0.2);
    return car;
  }

  // Mazda RX-7 (FD3S): low rounded nose with a big centre intake, corner
  // lamps and closed pop-ups, bulging front wings, bubble cabin, steep
  // rear glass to a short tail, side scoops behind the front wheels,
  // three-piece rear wing, thin 5-spoke wheels.
  function buildRX7(spec) {
    var car = new THREE.Group(), body = phong(spec.color, 90);
    var top = [[2.16, 0.5], [2.02, 0.66, 2.16, 0.64], [1.2, 0.8, 1.7, 0.76], [0.45, 0.9, 0.8, 0.86], [-1.0, 0.95], [-1.75, 0.97], [-2.1, 0.86, -2.04, 0.97], [-2.15, 0.62, -2.17, 0.76], [-2.14, 0.48]];
    car.add(extrude(bodyShape(spec, top, 0.28, 0.38), spec.wid, body, 0.09));
    cabin(car, [[0.45, 0.88], [0.15, 1.05], [-0.25, 1.2], [-0.5, 1.22], [-0.7, 1.205], [-0.92, 1.215], [-1.3, 1.15], [-1.7, 1.0], [-1.7, 0.92], [0.45, 0.85]], spec.wid - 0.34, body, [-0.2, -1.0]);
    // Front wings bulge above the bonnet line.
    var wing = new THREE.Shape();
    wing.moveTo(0.75, 0.7); wing.quadraticCurveTo(1.2, 0.9, 1.75, 0.78); wing.lineTo(1.9, 0.66); wing.lineTo(0.75, 0.66);
    [-1, 1].forEach(function (s) { var w = extrude(wing, 0.36, body, 0.06); w.position.z = s * (spec.wid / 2 - 0.2); car.add(w); });
    car.add(extrude((function () {
      var s = new THREE.Shape(); s.moveTo(-2.12, 0.28); s.lineTo(2.2, 0.28); s.lineTo(2.22, 0.33); s.lineTo(-2.12, 0.33); s.lineTo(-2.12, 0.28); return s;
    })(), spec.wid + 0.02, black(), 0.02));
    var hw = spec.wid / 2 + 0.004;
    [-1, 1].forEach(function (s) {
      car.add(sidePoly([[0.95, 0.58], [0.72, 0.66], [0.72, 0.52]], s * (hw + 0.006), black())); // side scoop
      car.add(box(0.13, 0.05, 0.2, lamp(), 2.11, 0.55, s * 0.68)); // corner lamps
      car.add(box(0.06, 0.04, 0.16, amber(), 2.12, 0.47, s * 0.7));
      car.add(box(0.4, 0.015, 0.3, mat('popline', function () { return phong(0x6a0a10, 40); }), 1.6, 0.775, s * 0.55)); // closed pop-up seams
    });
    mirror(car, 0.3, 1.0, spec.wid / 2 - 0.12, body, true);
    car.add(box(0.05, 0.18, 0.95, black(), 2.15, 0.43, 0)); // centre intake
    car.add(box(0.3, 0.025, spec.wid - 0.1, black(), 2.06, 0.29, 0)); // front lip
    // Three-piece wing on two uprights.
    car.add(box(0.26, 0.035, spec.wid - 0.16, body, -1.98, 1.18, 0));
    [-1, 1].forEach(function (s) { car.add(box(0.2, 0.24, 0.06, body, -1.95, 1.05, s * 0.72)); });
    lights(car, spec, 0.75, 0.46, 0.08);
    car.add(box(0.03, 0.08, spec.wid - 0.6, black(), -2.17, 0.75, 0));
    addWheels(car, spec, 0x8d939b, 5, 0.24);
    return car;
  }

  // Mazda MX-5 Miata (NA): round body, black hardtop, open round pop-ups,
  // oval front lamps and the small oval mouth, round body-colour mirrors,
  // multi-spoke mesh wheels.
  function buildMiata(spec) {
    var car = new THREE.Group(), body = phong(spec.color, 85);
    var top = [[1.98, 0.56], [1.78, 0.71, 1.98, 0.7], [0.55, 0.84], [-1.6, 0.86], [-1.92, 0.82, -1.86, 0.86], [-1.99, 0.56]];
    car.add(extrude(bodyShape(spec, top, 0.27, 0.36), spec.wid, body, 0.1));
    car.add(extrude((function () {
      var s = new THREE.Shape(); s.moveTo(-1.98, 0.27); s.lineTo(1.99, 0.27); s.lineTo(2.0, 0.32); s.lineTo(-1.98, 0.32); s.lineTo(-1.98, 0.27); return s;
    })(), spec.wid + 0.02, black(), 0.02));
    // Black hardtop: windscreen frame to the rear deck, with side windows.
    var ht = new THREE.Shape();
    ht.moveTo(0.42, 0.86); ht.lineTo(0.02, 1.22); ht.lineTo(-0.7, 1.24); ht.quadraticCurveTo(-1.2, 1.2, -1.45, 0.87); ht.lineTo(0.42, 0.86);
    var roof = extrude(ht, spec.wid - 0.24, mat('hardtop', function () { return phong(0x15171a, 80); }), 0.06);
    car.add(roof);
    var hw = (spec.wid - 0.24) / 2 + 0.004;
    [-1, 1].forEach(function (s) {
      car.add(sidePoly([[0.3, 0.9], [0.0, 1.17], [-0.55, 1.18], [-0.62, 0.9]], s * hw, glass()));
      car.add(sidePoly([[-0.7, 0.9], [-0.7, 1.17], [-1.05, 1.12], [-1.3, 0.9]], s * hw, glass()));
    });
    car.add(crossQuad([0.42, 0.87], [0.02, 1.23], hw - 0.06, hw - 0.1, glass()));
    car.add(crossQuad([-0.85, 1.22], [-1.38, 0.9], hw - 0.12, hw - 0.12, glass()));
    mirror(car, 0.3, 1.0, spec.wid / 2 - 0.06, body, true);
    [-1, 1].forEach(function (s) {
      popup(car, 1.5, 0.74, s * 0.5, 0.32, 0.26, true);
      var ov = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8), lamp());
      ov.scale.set(0.25, 0.4, 1.4); ov.position.set(1.97, 0.62, s * 0.5); car.add(ov);
      car.add(box(0.03, 0.05, 0.1, amber(), 1.95, 0.48, s * 0.68));
    });
    var mouth = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 8), black());
    mouth.scale.set(0.15, 0.35, 1.6); mouth.position.set(2.0, 0.42, 0); car.add(mouth);
    lights(car, spec, 0.7, 0.42, 0.1);
    addWheels(car, spec, 0xc9ccd1, 12, 0.2);
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

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

  // --- Lofted bodies (RX-7, Miata) -----------------------------------------
  // The body is a smooth surface swept along the car: at each station x the
  // cross-section is a superellipse between bottom B(x) and top T(x) with
  // half-width W(x). The upper half is rounder than the lower (nUp / nLo),
  // pulls in towards the roof (tuck) and rises at the sides over the
  // wheels (bulge: the front wings standing proud of the bonnet). Wheel
  // arches lift the bottom line in a circle round each wheel. Rounded
  // noses and tails come from W and T shrinking at the ends.

  // Smooth curve through [[x, v], ...] (Catmull-Rom, clamped at the ends).
  function curve(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0]; });
    return function (x) {
      var n = pts.length;
      if (x <= pts[0][0]) return pts[0][1];
      if (x >= pts[n - 1][0]) return pts[n - 1][1];
      var i = 0;
      while (x > pts[i + 1][0]) i++;
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      var t = (x - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
      var m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * (p2[0] - p1[0]);
      var m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * (p2[0] - p1[0]);
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    };
  }
  function pw(v, e) { return v < 0 ? -Math.pow(-v, e) : Math.pow(v, e); }

  // Section point at station x, angle phi (0 = right side, pi/2 = top).
  function secPoint(d, x, phi, out) {
    var W = d.W(x), T = d.T(x), B = d.B(x);
    var c = Math.cos(phi), s = Math.sin(phi), up = s > 0;
    var n = up ? d.nUp(x) : d.nLo;
    var yc = (T + B) / 2, ry = (T - B) / 2;
    if (d.mid) { yc = d.mid(x); ry = up ? T - yc : yc - B; }
    var z = W * pw(c, 2 / n), y = yc + ry * pw(s, 2 / n);
    if (up) {
      z *= 1 - (d.tuck || 0) * s * s;
      if (d.bulge) {
        var q = Math.abs(z) / W, g = Math.exp(-Math.pow((q - (d.bulgeAt || 0.74)) / 0.22, 2));
        y += d.bulge(x) * g * Math.sqrt(s);
      }
    }
    out.y = y; out.z = z;
    return out;
  }

  // Builds the swept mesh. opts: {from, to, step, K, phiA, phiB, grow, lift, cap}
  function loft(d, material, opts) {
    opts = opts || {};
    var x0 = opts.from != null ? opts.from : d.x0, x1 = opts.to != null ? opts.to : d.x1;
    var K = opts.K || 44, phiA = opts.phiA != null ? opts.phiA : -Math.PI, phiB = opts.phiB != null ? opts.phiB : Math.PI;
    var closed = opts.phiA == null, grow = opts.grow || 1, lift = opts.lift || 0;
    var step = opts.step || 0.035, xs = [];
    for (var x = x0; x < x1 - 1e-6; x += step) xs.push(x);
    xs.push(x1);
    var pos = [], idx = [], o = { y: 0, z: 0 }, ring = closed ? K : K + 1;
    xs.forEach(function (xx) {
      for (var k = 0; k < ring; k++) {
        secPoint(d, xx, phiA + ((phiB - phiA) * k) / K, o);
        pos.push(xx, o.y + lift, o.z * grow);
      }
    });
    for (var i = 0; i < xs.length - 1; i++) {
      for (var j = 0; j < (closed ? K : K); j++) {
        var a = i * ring + j, b = i * ring + ((j + 1) % ring), c = a + ring, e = b + ring;
        idx.push(a, c, b, b, c, e);
      }
    }
    if (opts.cap !== false && closed) {
      // Fan caps at both ends.
      [0, xs.length - 1].forEach(function (si, end) {
        var cx = xs[si], cy = 0, base = si * ring;
        for (var k2 = 0; k2 < ring; k2++) cy += pos[(base + k2) * 3 + 1];
        cy /= ring;
        var ci = pos.length / 3;
        pos.push(cx, cy, 0);
        for (var k3 = 0; k3 < ring; k3++) {
          var p = base + k3, q2 = base + ((k3 + 1) % ring);
          if (end) idx.push(ci, p, q2); else idx.push(ci, q2, p);
        }
      });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, material);
    m.castShadow = true;
    return m;
  }

  // Surface helpers for placing details on a lofted body.
  function topY(d, x, z) { // height of the upper surface at (x, z)
    var o = { y: 0, z: 0 }, lo = 0, hi = Math.PI / 2;
    for (var i = 0; i < 24; i++) { var m = (lo + hi) / 2; secPoint(d, x, m, o); if (o.z > Math.abs(z)) lo = m; else hi = m; }
    return secPoint(d, x, (lo + hi) / 2, o).y;
  }
  function inside(d, x, y, z) {
    if (x < d.x0 || x > d.x1) return false;
    var o = { y: 0, z: 0 };
    var B = d.B(x), T = d.T(x) + (d.bulge ? d.bulge(x) : 0);
    if (y < B || y > T) return false;
    // widest |z| at this height: scan the section
    for (var k = -16; k <= 16; k++) {
      secPoint(d, x, (k / 16) * (Math.PI / 2), o);
      if (Math.abs(o.y - y) < 0.03 && Math.abs(z) <= o.z) return y <= topY(d, x, z) + 0.001;
    }
    return false;
  }
  // Extreme x of the body at height y, side offset z (dir +1 nose, -1 tail).
  function endX(d, y, z, dir) {
    var x = dir > 0 ? d.x1 : d.x0;
    for (var i = 0; i < 200; i++) { if (inside(d, x, y, z)) return x; x -= dir * 0.01; }
    return x;
  }
  function arches(wheels, r, R, base) {
    return function (x) {
      var b = base;
      wheels.forEach(function (w) { var dx = x - w; if (Math.abs(dx) < R) b = Math.max(b, r + Math.sqrt(R * R - dx * dx) - 0.02); });
      return b;
    };
  }
  // Soft sky reflection so the curves catch the light.
  var envTex = null;
  function env() {
    if (envTex) return envTex;
    var faces = [];
    for (var f = 0; f < 6; f++) {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
      if (f === 2) { g.fillStyle = '#dfeaf5'; g.fillRect(0, 0, 64, 64); }
      else if (f === 3) { g.fillStyle = '#3c3f3a'; g.fillRect(0, 0, 64, 64); }
      else { gr.addColorStop(0, '#d8e6f3'); gr.addColorStop(0.48, '#a9c4dc'); gr.addColorStop(0.52, '#55604c'); gr.addColorStop(1, '#2f342c'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
      faces.push(c);
    }
    envTex = new THREE.CubeTexture(faces);
    envTex.needsUpdate = true;
    return envTex;
  }
  function paint(color) {
    return new THREE.MeshPhongMaterial({ color: color, shininess: 110, specular: 0x8a8a8a, envMap: env(), reflectivity: 0.22, combine: THREE.MixOperation });
  }
  function glassMat() {
    return mat('loftGlass', function () { return new THREE.MeshPhongMaterial({ color: 0x0f161e, shininess: 160, specular: 0xcccccc, envMap: env(), reflectivity: 0.35, combine: THREE.MixOperation }); });
  }
  // A lens / intake: a flattened sphere set into the surface.
  function blob(car, mtl, x, y, z, sx, sy, sz, ry) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mtl);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    car.add(m);
    return m;
  }

  // Mazda RX-7 (FD3S).
  function buildRX7(spec) {
    var car = new THREE.Group(), body = paint(spec.color);
    var wf = spec.wb / 2 + spec.wbShift, wr = -spec.wb / 2 + spec.wbShift;
    var d = {
      x0: -2.14, x1: 2.15, nLo: 4.5, tuck: 0.1, bulgeAt: 0.76,
      W: curve([[-2.14, 0.6], [-2.08, 0.76], [-1.9, 0.85], [-1.4, 0.88], [0.4, 0.875], [1.3, 0.875], [1.75, 0.85], [1.98, 0.76], [2.09, 0.6], [2.15, 0.36]]),
      T: curve([[-2.14, 0.6], [-2.09, 0.84], [-1.96, 0.95], [-1.6, 0.97], [-0.8, 0.93], [0.3, 0.9], [0.7, 0.85], [1.2, 0.76], [1.65, 0.68], [1.95, 0.6], [2.1, 0.5], [2.15, 0.4]]),
      B: arches([wf, wr], spec.tyre, 0.38, 0.27),
      mid: curve([[-2.14, 0.52], [0, 0.56], [1.8, 0.48], [2.15, 0.38]]),
      nUp: curve([[-2.14, 2.2], [-1.6, 2.8], [0.5, 3.2], [1.6, 2.4], [2.15, 2.0]]),
      bulge: curve([[-2.0, 0.0], [-1.7, 0.05], [-1.3, 0.07], [-0.9, 0.03], [-0.3, 0], [0.5, 0], [0.9, 0.05], [1.3, 0.1], [1.7, 0.08], [2.0, 0.02], [2.12, 0]]),
    };
    car.add(loft(d, body));
    // Bubble glasshouse, roof and window frames.
    var gh = {
      x0: -1.72, x1: 0.55, nLo: 6, tuck: 0.16, nUp: function () { return 2.4; },
      W: curve([[-1.72, 0.72], [-1.2, 0.64], [-0.5, 0.62], [0.2, 0.66], [0.55, 0.72]]),
      T: curve([[-1.72, 0.97], [-1.35, 1.12], [-0.95, 1.205], [-0.6, 1.215], [-0.3, 1.19], [0.05, 1.07], [0.35, 0.96], [0.55, 0.88]]),
      B: function () { return 0.78; },
      mid: function () { return 0.86; },
    };
    car.add(loft(gh, glassMat(), { cap: true }));
    car.add(loft(gh, body, { from: -1.05, to: -0.22, phiA: 0.5, phiB: Math.PI - 0.5, grow: 1.012, lift: 0.006, K: 20 }));
    [[0.12, 0.42], [Math.PI - 0.42, Math.PI - 0.12]].forEach(function (r) {
      car.add(loft(gh, black(), { from: -1.68, to: 0.5, phiA: r[0], phiB: r[1], grow: 1.01, lift: 0.004, K: 4 }));
    });
    // Nose: big centre intake, corner lamps under clear covers, indicators,
    // closed pop-up lids, front lip.
    var nx = endX(d, 0.42, 0, 1);
    blob(car, black(), nx - 0.06, 0.42, 0, 0.08, 0.11, 0.42);
    [-1, 1].forEach(function (s) {
      var lx = endX(d, 0.53, s * 0.63, 1);
      blob(car, lamp(), lx - 0.035, 0.53, s * 0.63, 0.05, 0.045, 0.13, s * -0.5);
      var ax = endX(d, 0.42, s * 0.7, 1);
      blob(car, amber(), ax - 0.03, 0.42, s * 0.7, 0.03, 0.022, 0.08, s * -0.6);
      var px = 1.55, pz = s * 0.56, py = topY(d, px, pz);
      car.add(box(0.44, 0.012, 0.012, mat('seam', function () { return phong(0x2a0306, 20); }), px, py + 0.002, pz + s * 0.15));
      car.add(box(0.44, 0.012, 0.012, mat('seam', function () { return phong(0x2a0306, 20); }), px, py + 0.002, pz - s * 0.15));
      // side scoop behind the front wheel
      var sc = blob(car, black(), wf - 0.55, 0.62, s * 0.86, 0.16, 0.06, 0.03);
      sc.rotation.z = -0.25;
    });
    var lip = loft(d, black(), { from: 1.7, to: 2.1, phiA: -Math.PI + 0.25, phiB: -0.25, grow: 1.02, lift: -0.01, K: 12 });
    car.add(lip);
    mirror(car, 0.28, topY(gh, 0.28, 0.6) - 0.02, 0.7, body, true);
    // Three-piece wing.
    var deck = topY(d, -1.95, 0.6);
    car.add(box(0.26, 0.035, spec.wid - 0.18, body, -1.97, deck + 0.22, 0));
    [-1, 1].forEach(function (s) { car.add(box(0.22, 0.24, 0.05, body, -1.93, deck + 0.1, s * 0.7)); });
    // Tail lamps on the rounded tail.
    var tail = new THREE.MeshPhongMaterial({ color: 0x5a0a0a, emissive: 0x220000, shininess: 90 });
    [-1, 1].forEach(function (s) {
      var tx = endX(d, 0.8, s * 0.6, -1);
      blob(car, tail, tx + 0.03, 0.8, s * 0.6, 0.04, 0.05, 0.2, s * 0.35);
    });
    car.add(box(0.04, 0.06, 0.6, black(), endX(d, 0.8, 0, -1) + 0.01, 0.8, 0));
    car.userData.tail = tail;
    addWheels(car, spec, 0x8d939b, 5, 0.24);
    return car;
  }

  // Mazda MX-5 Miata (NA).
  function buildMiata(spec) {
    var car = new THREE.Group(), body = paint(spec.color);
    var wf = spec.wb / 2 + spec.wbShift, wr = -spec.wb / 2 + spec.wbShift;
    var d = {
      x0: -1.985, x1: 1.99, nLo: 4, tuck: 0.06, bulgeAt: 0.8,
      W: curve([[-1.985, 0.56], [-1.93, 0.72], [-1.75, 0.81], [-1.3, 0.835], [0.6, 0.835], [1.35, 0.82], [1.7, 0.75], [1.9, 0.6], [1.97, 0.45], [1.99, 0.3]]),
      T: curve([[-1.985, 0.56], [-1.94, 0.76], [-1.8, 0.85], [-1.3, 0.87], [0.0, 0.86], [0.45, 0.84], [1.0, 0.79], [1.5, 0.72], [1.82, 0.64], [1.95, 0.55], [1.99, 0.45]]),
      B: arches([wf, wr], spec.tyre, 0.36, 0.26),
      mid: curve([[-1.985, 0.5], [0, 0.55], [1.7, 0.5], [1.99, 0.42]]),
      nUp: curve([[-1.985, 2.0], [-1.5, 2.4], [0.3, 2.8], [1.4, 2.3], [1.99, 1.8]]),
      bulge: curve([[-1.7, 0], [-1.35, 0.035], [-0.9, 0.0], [0.6, 0], [1.0, 0.035], [1.4, 0.04], [1.8, 0.0]]),
    };
    car.add(loft(d, body));
    // Black hardtop with glass sides and windscreen.
    var gh = {
      x0: -1.45, x1: 0.46, nLo: 6, tuck: 0.12, nUp: function () { return 2.6; },
      W: curve([[-1.45, 0.74], [-1.0, 0.7], [-0.3, 0.68], [0.2, 0.7], [0.46, 0.74]]),
      T: curve([[-1.45, 0.88], [-1.2, 1.1], [-0.85, 1.22], [-0.4, 1.24], [-0.05, 1.21], [0.25, 1.03], [0.46, 0.88]]),
      B: function () { return 0.76; },
      mid: function () { return 0.84; },
    };
    car.add(loft(gh, glassMat(), { cap: true }));
    var hard = mat('hardtop', function () { return new THREE.MeshPhongMaterial({ color: 0x14161a, shininess: 100, specular: 0x666666, envMap: env(), reflectivity: 0.15, combine: THREE.MixOperation }); });
    car.add(loft(gh, hard, { from: -1.44, to: -0.02, phiA: 0.42, phiB: Math.PI - 0.42, grow: 1.012, lift: 0.006, K: 22 }));
    [[0.1, 0.42], [Math.PI - 0.42, Math.PI - 0.1]].forEach(function (r) {
      car.add(loft(gh, hard, { from: -1.44, to: 0.44, phiA: r[0], phiB: r[1], grow: 1.01, lift: 0.004, K: 4 }));
    });
    // Open round pop-ups, the oval parking lamps and the small oval mouth.
    [-1, 1].forEach(function (s) {
      var px = 1.44, pz = s * 0.52, py = topY(d, px, pz);
      var pod = loftPod(0.29, 0.2, 0.17);
      pod.position.set(px, py - 0.045, pz);
      pod.rotation.z = -0.08;
      car.add(pod);
      var ox = endX(d, 0.6, s * 0.5, 1);
      blob(car, lamp(), ox - 0.03, 0.6, s * 0.5, 0.04, 0.035, 0.12, s * -0.55);
      var ax = endX(d, 0.47, s * 0.72, 1);
      blob(car, amber(), ax - 0.02, 0.47, s * 0.72, 0.025, 0.025, 0.05, s * -0.9);
    });
    var mx = endX(d, 0.43, 0, 1);
    blob(car, black(), mx - 0.04, 0.43, 0, 0.06, 0.065, 0.3);
    mirror(car, 0.32, topY(d, 0.32, 0.7) + 0.12, 0.76, body, true);
    var tail = new THREE.MeshPhongMaterial({ color: 0x5a0a0a, emissive: 0x220000, shininess: 90 });
    [-1, 1].forEach(function (s) {
      var tx = endX(d, 0.72, s * 0.52, -1);
      blob(car, tail, tx + 0.03, 0.72, s * 0.52, 0.035, 0.05, 0.22, s * 0.25);
    });
    car.userData.tail = tail;
    addWheels(car, spec, 0xc9ccd1, 12, 0.2);
    return car;
  }

  // Open pop-up pod with a round lamp, rounded edges (Miata).
  function loftPod(w, h, len) {
    var g = new THREE.Group();
    var shape = new THREE.Shape();
    var r = 0.05, x0 = -w / 2, y0 = 0;
    shape.moveTo(x0 + r, y0); shape.lineTo(-x0 - r, y0); shape.quadraticCurveTo(-x0, y0, -x0, y0 + r);
    shape.lineTo(-x0, h - r); shape.quadraticCurveTo(-x0, h, -x0 - r, h); shape.lineTo(x0 + r, h);
    shape.quadraticCurveTo(x0, h, x0, h - r); shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0);
    var geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, -len / 2);
    var m = new THREE.Mesh(geo, black());
    m.rotation.y = Math.PI / 2; // the face points forward (+x)
    m.castShadow = true;
    g.add(m);
    var lens = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.36, h * 0.36, 0.02, 24), lamp());
    lens.rotation.z = Math.PI / 2; lens.position.set(len / 2 + 0.02, h / 2, 0);
    g.add(lens);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(h * 0.37, 0.012, 6, 24), chrome());
    rim.rotation.y = Math.PI / 2; rim.position.set(len / 2 + 0.025, h / 2, 0);
    g.add(rim);
    return g;
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

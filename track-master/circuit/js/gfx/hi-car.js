// hi-car.js — 3D cars for the 높음 renderer, built from the same model data as
// 낮음 (cars.js formulaModel parts: prism / box with taper, decals, wheels), so
// every car keeps its livery. Paint is a clear-coated PBR material that picks
// up the environment map; carbon parts are satin; helmet with a reflective
// visor; car numbers on the nose and engine cover; tyres roll with wheelDist
// and blur into rings at speed; front wheels steer; brake light glows harder
// under braking; headlight cones show at dusk; soft contact shadow.
// Car-local (x right, y forward, z up) -> group-local three (y, z, x); the group
// sits at (x, 0, -y) with rotation.y = heading.
// Load order: after hi-env.js. Depends on: THREE, CR.Hi.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var C = Hi.Car = {};

  var NUMBERS = { f4: 14, f3: 23, f2: 27, fe: 9, f1: 1, vas: 16, hol: 8, nak: 22, mor: 31, san: 12 };
  C.NUMBERS = NUMBERS;

  function lum(hex) {
    var v = parseInt(hex.slice(1), 16);
    return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  }

  function outline(part) {
    if (part._hiPts) return part._hiPts;
    var pts;
    if (part.box) {
      var b = part.box, x0 = b[0] - b[2] / 2, x1 = b[0] + b[2] / 2, y0 = b[1] - b[3] / 2, y1 = b[1] + b[3] / 2;
      pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    } else pts = part.prism.slice();
    var area = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    if (area < 0) pts.reverse();
    part._hiPts = pts;
    return pts;
  }

  // Triangles of a simple polygon, each CCW (x right, y forward).
  function triangulate(pts) {
    var tris = THREE.ShapeUtils.triangulateShape(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), []);
    return tris.map(function (t) {
      var a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
      var cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return cross >= 0 ? t : [t[0], t[2], t[1]];
    });
  }

  // Prism geometry (non-indexed): sides (smoothed where the outline bends
  // gently), top (taper) and bottom. Writes into the sink arrays of the
  // groups for its side and top colours.
  function prism(part, sinkSide, sinkTop, smoothDeg) {
    var pts = outline(part), n = pts.length, z0 = part.z[0], z1 = part.z[1];
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= n; cy /= n;
    var taper = part.taper || 1;
    var top = pts.map(function (p) { return [cx + (p[0] - cx) * taper, cy + (p[1] - cy) * taper]; });
    function V(lx, ly, z) { return [ly, z, lx]; } // car-local -> three-local
    // side face normals
    var fn = [];
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var a = V(pts[i][0], pts[i][1], z0), b = V(pts[j][0], pts[j][1], z0), c = V(top[i][0], top[i][1], z1);
      var u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      var nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
      var l = Math.hypot(nx, ny, nz) || 1;
      fn.push([nx / l, ny / l, nz / l]);
    }
    var cosS = Math.cos((smoothDeg || 0) * Math.PI / 180);
    function vn(i, face) { // normal at outline vertex i for side face `face`
      var other = face === i ? (i - 1 + n) % n : (i + 1) % n;
      var f = fn[face], o = fn[other];
      if (f[0] * o[0] + f[1] * o[1] + f[2] * o[2] < cosS) return f;
      var s = [f[0] + o[0], f[1] + o[1], f[2] + o[2]], l = Math.hypot(s[0], s[1], s[2]) || 1;
      return [s[0] / l, s[1] / l, s[2] / l];
    }
    for (var k = 0; k < n; k++) {
      var k2 = (k + 1) % n;
      var b0 = V(pts[k][0], pts[k][1], z0), b1 = V(pts[k2][0], pts[k2][1], z0), t1 = V(top[k2][0], top[k2][1], z1), t0 = V(top[k][0], top[k][1], z1);
      var n0 = vn(k, k), n1 = vn(k2, k);
      [[b0, n0], [b1, n1], [t1, n1], [b0, n0], [t1, n1], [t0, n0]].forEach(function (e) { sinkSide.p.push(e[0][0], e[0][1], e[0][2]); sinkSide.n.push(e[1][0], e[1][1], e[1][2]); });
    }
    triangulate(top).forEach(function (t) {
      t.forEach(function (ix) { var v = V(top[ix][0], top[ix][1], z1); sinkTop.p.push(v[0], v[1], v[2]); sinkTop.n.push(0, 1, 0); });
    });
    if (z0 > 0.02) triangulate(pts).forEach(function (t) {
      [t[0], t[2], t[1]].forEach(function (ix) { var v = V(pts[ix][0], pts[ix][1], z0); sinkSide.p.push(v[0], v[1], v[2]); sinkSide.n.push(0, -1, 0); });
    });
    return z1;
  }

  function decal(d, h, sink) {
    var pts;
    if (d.poly) pts = d.poly.slice();
    else { var r = d.rect, x0 = r[0] - r[2] / 2, x1 = r[0] + r[2] / 2, y0 = r[1] - r[3] / 2, y1 = r[1] + r[3] / 2; pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
    var area = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    if (area < 0) pts.reverse();
    triangulate(pts).forEach(function (t) {
      t.forEach(function (ix) { sink.p.push(pts[ix][1], h, pts[ix][0]); sink.n.push(0, 1, 0); });
    });
  }

  function geometryFrom(sink) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sink.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(sink.n, 3));
    return g;
  }

  // Material for a livery colour: paint (clear coat), carbon or metal.
  function materialFor(R, hex, kind) {
    var c = new THREE.Color(hex).convertSRGBToLinear();
    if (kind === 'metal') return R.std({ color: c, roughness: 0.38, metalness: 0.85 }, 'metal');
    if (kind === 'emit') { var m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.4 }); R.register(m); return m; }
    if (lum(hex) < 0.13) return R.std({ color: c, roughness: 0.42, metalness: 0.25, envMapIntensity: 0.9 }, 'carbon');
    return R.phys({ color: c, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.25 }, 'paint');
  }

  // Generic box/prism parts (gantry etc.) into `group`, merged per colour.
  C.buildParts = function (R, parts, group, opts) {
    opts = opts || {};
    var sinks = {};
    function sink(hex, kind) { var k = hex + '|' + (kind || ''); return sinks[k] || (sinks[k] = { hex: hex, kind: kind, p: [], n: [] }); }
    var lastTop = 0;
    parts.forEach(function (part) {
      if (part.wheel) return;
      if (part.decal) { decal(part.decal, lastTop + 0.005, sink(part.decal.fill.charAt(0) === '#' ? part.decal.fill : '#ffffff')); return; }
      var kind = part.metal ? 'metal' : '';
      lastTop = prism(part, sink(part.color, kind), sink(part.top || part.color, kind), opts.smooth || 0);
    });
    var meshes = [];
    Object.keys(sinks).forEach(function (k) {
      var s = sinks[k];
      if (!s.p.length) return;
      var m = new THREE.Mesh(geometryFrom(s), materialFor(R, s.hex, s.kind));
      m.castShadow = !!opts.cast;
      m.receiveShadow = true;
      group.add(m);
      meshes.push(m);
    });
    return meshes;
  };

  // --- Wheels ---------------------------------------------------------------------
  function makeWheel(R, part, shared) {
    var w = part.wheel, r = w[3], width = w[2];
    var pivot = new THREE.Group();
    pivot.position.set(w[1], r, w[0]);
    var spin = new THREE.Group();
    pivot.add(spin);
    var key = r.toFixed(3) + '|' + width.toFixed(3);
    var tyreGeo = shared.tyres[key];
    if (!tyreGeo) {
      tyreGeo = new THREE.CylinderGeometry(r, r, width, 28, 1, false);
      tyreGeo.rotateX(Math.PI / 2);
      shared.tyres[key] = tyreGeo;
      var disc = new THREE.CircleGeometry(r * 0.985, 28);
      shared.discs[key] = disc;
    }
    var tyre = new THREE.Mesh(tyreGeo, shared.tyreMat);
    tyre.castShadow = true;
    spin.add(tyre);
    var sideSign = w[0] >= 0 ? 1 : -1; // outer side faces away from the car
    var texKey = part.stripe + '|' + part.rim;
    var mats = shared.sideMats[texKey];
    if (!mats) {
      var sharp = Hi.sidewall(part.stripe, part.rim, false), blur = Hi.sidewall(part.stripe, part.rim, true);
      R.textures.push(sharp, blur);
      mats = shared.sideMats[texKey] = {
        sharp: R.std({ map: sharp, roughness: 0.55, metalness: 0.3, transparent: true, alphaTest: 0.5 }, 'sidewall'),
        blur: (function () { var m = new THREE.MeshStandardMaterial({ map: blur, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0, depthWrite: false }); R.register(m); return m; })(),
      };
    }
    var discs = [];
    // rear wheels: outer face only (the inner one is never seen); fronts also
    // show their inner face to the cockpit camera
    (part.front ? [sideSign, -sideSign] : [sideSign]).forEach(function (sd, k) {
      var d = new THREE.Mesh(shared.discs[key], mats.sharp);
      d.position.z = sd * (width / 2 + 0.003);
      if (sd < 0) d.rotation.y = Math.PI;
      spin.add(d);
      var b = new THREE.Mesh(shared.discs[key], mats.blur);
      b.position.z = sd * (width / 2 + 0.006);
      if (sd < 0) b.rotation.y = Math.PI;
      b.renderOrder = 3;
      b.visible = false;
      spin.add(b);
      discs.push(d, b);
      void k;
    });
    return { pivot: pivot, spin: spin, r: r, front: !!part.front, blurMat: mats.blur, discs: discs, blur: discs.filter(function (x, i) { return i % 2 === 1; }), sharp: discs.filter(function (x, i) { return i % 2 === 0; }) };
  }

  // A complete car. opts: number, night (0..1).
  C.create = function (R, model, opts) {
    opts = opts || {};
    var group = new THREE.Group(), body = new THREE.Group();
    group.add(body);
    var shared = R.carShared || (R.carShared = {
      tyres: {}, discs: {},
      tyreMat: R.std({ map: R.texTread, color: 0xffffff, roughness: 0.88, metalness: 0 }, 'tyre'),
      sideMats: {},
    });
    // scale of this model (rear axle at -1.35 * s)
    var rear = model.filter(function (p) { return p.wheel && !p.front; })[0], s = rear ? -rear.wheel[1] / 1.35 : 1;
    // Body parts grouped by colour and by cockpit visibility (as renderer.js
    // drawCockpitCar: chassis, front wheels and parts well ahead of the driver).
    var sinks = {}, lastTop = 0, helmet = null;
    function sink(hex, cock) { var k = hex + '|' + (cock ? 1 : 0); return sinks[k] || (sinks[k] = { hex: hex, cock: cock, p: [], n: [] }); }
    model.forEach(function (part) {
      if (part.wheel) return;
      if (part.decal) {
        var r = part.decal.rect, cockD = r ? r[1] - r[3] / 2 > 0.5 : false;
        decal(part.decal, lastTop + 0.006, sink(part.decal.fill.charAt(0) === '#' ? part.decal.fill : '#ffffff', cockD));
        return;
      }
      if (part.box && Math.abs(part.box[2] - 0.24) < 1e-6 && Math.abs(part.box[3] - 0.3) < 1e-6 && part.z[0] === 0.46) { helmet = part; lastTop = part.z[1]; return; }
      var chassis = part.prism && part.prism.length > 6;
      var minY = Math.min.apply(null, outline(part).map(function (p) { return p[1]; }));
      var cock = chassis || minY > 0.9;
      lastTop = prism(part, sink(part.color, cock), sink(part.top || part.color, cock), chassis ? 38 : 22);
    });
    var bodyMeshes = [], cockpitHidden = [], materials = [];
    Object.keys(sinks).forEach(function (k) {
      var sk = sinks[k];
      if (!sk.p.length) return;
      var mat = materialFor(R, sk.hex);
      var m = new THREE.Mesh(geometryFrom(sk), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      body.add(m);
      bodyMeshes.push(m);
      materials.push(mat);
      if (!sk.cock) cockpitHidden.push(m);
    });
    // Helmet + visor
    if (helmet) {
      var hc = helmet.color;
      var hm = R.phys({ color: new THREE.Color(hc).convertSRGBToLinear(), roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }, 'helmet');
      var hg = new THREE.SphereGeometry(0.135, 18, 12);
      hg.scale(1.18, 1.0, 0.95);
      var hmesh = new THREE.Mesh(hg, hm);
      hmesh.position.set(helmet.box[1], 0.6, helmet.box[0]);
      hmesh.castShadow = true;
      body.add(hmesh);
      var vm = R.phys({ color: 0x0a0c10, roughness: 0.04, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 }, 'visor');
      var vg = new THREE.SphereGeometry(0.139, 16, 6, -0.9, 1.8, 1.15, 0.42);
      vg.scale(1.18, 1.0, 0.95);
      var vmesh = new THREE.Mesh(vg, vm);
      vmesh.position.copy(hmesh.position);
      vmesh.rotation.y = Math.PI / 2;
      body.add(vmesh);
      cockpitHidden.push(hmesh, vmesh);
      materials.push(hm);
    }
    // Wheels
    var wheels = [];
    model.forEach(function (part) {
      if (!part.wheel) return;
      var wh = makeWheel(R, part, shared);
      body.add(wh.pivot);
      wheels.push(wh);
      if (!part.front) cockpitHidden.push(wh.pivot);
    });
    // Numbers: nose top and both sides of the engine cover
    if (opts.number) {
      var nt = Hi.number(opts.number, '#ffffff', '#111111');
      R.textures.push(nt);
      var nm = new THREE.MeshStandardMaterial({ map: nt, transparent: true, alphaTest: 0.3, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      R.register(nm);
      var ng = new THREE.PlaneGeometry(0.2, 0.2);
      var nose = new THREE.Mesh(ng, nm);
      nose.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      nose.position.set(1.62 * s, 0.443, 0);
      body.add(nose);
      [1, -1].forEach(function (sd) {
        var side = new THREE.Mesh(ng, nm);
        side.position.set(-0.85 * s, 0.57, sd * 0.172);
        side.rotation.y = sd > 0 ? 0 : Math.PI;
        side.scale.setScalar(0.8);
        body.add(side);
        cockpitHidden.push(side);
      });
    }
    // Brake / rain light (centre rear), headlights + cones (dusk)
    var brakeMat = new THREE.MeshStandardMaterial({ color: 0x300606, emissive: 0xff1e1e, emissiveIntensity: 0.6, roughness: 0.4 });
    R.register(brakeMat);
    var bl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.2), brakeMat);
    bl.position.set(-1.95 * s - 0.23, 0.33, 0);
    body.add(bl);
    cockpitHidden.push(bl);
    var lampMat = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xfff1d8, emissiveIntensity: 0.4 + (opts.night || 0) * 5, roughness: 0.3 });
    R.register(lampMat);
    var cones = [];
    [1, -1].forEach(function (sd) {
      var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), lampMat);
      lamp.position.set(2.0 * s, 0.26, sd * 0.62);
      body.add(lamp);
      if ((opts.night || 0) > 0.3 && R.coneMat) {
        var cone = new THREE.Mesh(R.coneGeo, R.coneMat);
        cone.position.copy(lamp.position);
        cone.position.x += 0.05;
        cone.rotation.z = Math.PI / 2 - 0.06;
        cone.renderOrder = 4;
        body.add(cone);
        cones.push(cone);
        cockpitHidden.push(cone);
      }
    });
    // Contact shadow
    var shadow = new THREE.Mesh(R.blobGeo, R.blobMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.rotation.z = -Math.PI / 2;
    shadow.position.y = 0.014;
    shadow.scale.set(2.2, 4.9 * s, 1);
    shadow.renderOrder = 2;
    group.add(shadow);
    var baseColors = materials.map(function (m) { return m.color.clone(); });

    return {
      group: group, body: body, wheels: wheels, brakeMat: brakeMat, cockpitHidden: cockpitHidden, materials: materials, baseColors: baseColors,
      scale: s, tint: 1, lod: 0, model: model, cones: cones,
    };
  };

  // Per frame: pose, wheels, brake light, tint (wreck), cockpit/LOD visibility.
  C.update = function (car, st, opts) {
    var g = car.group;
    g.position.set(st.x, 0, -st.y);
    g.rotation.y = st.heading;
    // small body roll / pitch from the car's motion
    var lat = opts.lat || 0, lon = opts.lon || 0;
    car.body.rotation.x = Math.max(-0.035, Math.min(0.035, -lat * 0.0016));
    car.body.rotation.z = Math.max(-0.02, Math.min(0.02, lon * 0.0012));
    var dist = st.wheelDist || 0, speed = Math.abs(st.forwardSpeed || 0);
    var near = opts.camDist < 70;
    for (var i = 0; i < car.wheels.length; i++) {
      var w = car.wheels[i];
      w.spin.rotation.z = -dist / w.r;
      if (w.front) w.pivot.rotation.y = st.wheelSteer || 0;
      var omega = speed / w.r, blur = Math.max(0, Math.min(1, (omega - 10) / 24));
      w.blurMat.opacity = blur;
      for (var k = 0; k < w.blur.length; k++) w.blur[k].visible = near && blur > 0.02;
      for (var k2 = 0; k2 < w.sharp.length; k2++) w.sharp[k2].visible = near || opts.camDist < 140;
    }
    car.brakeMat.emissiveIntensity = 0.5 + (opts.brake || 0) * 9;
    var tint = st.exploded ? 0.22 : 1;
    if (tint !== car.tint) {
      car.tint = tint;
      for (var m = 0; m < car.materials.length; m++) car.materials[m].color.copy(car.baseColors[m]).multiplyScalar(tint);
    }
    var hide = !!opts.cockpit;
    if (hide !== car.hidden) {
      car.hidden = hide;
      for (var h = 0; h < car.cockpitHidden.length; h++) car.cockpitHidden[h].visible = !hide;
    }
  };
})();

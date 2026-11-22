// hi-car.js — 3D formula cars for the 높음 renderer.
// Built from the same livery and proportions as 낮음 (cars.js formulaModel
// options: colours, length, sidepod width, wing span, rear-wing height, fin,
// halo, Formula E wheel pods), but modelled as a real single-seater:
//  - monocoque + nose, sidepods (undercut, coke-bottle taper) and engine cover
//    with roll hoop are lofted through superellipse cross-sections (smooth,
//    rounded, no hard edges);
//  - front wing (three cambered elements rising at the tips) and rear wing
//    (main plane + flap, beam wing) are real airfoil sections; endplates, fin
//    and swan-neck pylon are bevelled extrusions;
//  - halo tube, carbon wishbones / push rods / track rods, floor, diffuser with
//    strakes, crash structure with rain light, mirrors on stalks;
//  - tyres are lathed with rounded shoulders, rims blur at speed;
//  - surfaces are exposed carbon fibre (2x2 twill, clear coat) with the livery
//    painted on the upper surfaces, as on modern cars.
// First person: a rounded 3D cockpit (deck, shoulders, padded rim, tub, legs,
// halo, mirror housings) replaces cockpit.js's flat 2D body; cockpit.js still
// draws the steering wheel and the mirror glass on top (Cockpit.hiBody).
// After an explosion the car is charred and loses its wings and two wheels,
// which fly off as debris (detach / reattach).
// Car-local (x right, y forward, z up) -> group-local three (y, z, x).
// Load order: after hi-env.js. Depends on: THREE, CR.Hi, Cockpit (geometry).
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var C = Hi.Car = {};

  var NUMBERS = { f4: 14, f3: 23, f2: 27, fe: 9, f1: 1, vas: 16, hol: 8, nak: 22, mor: 31, san: 12 };
  C.NUMBERS = NUMBERS;
  var WEAVE = 0.07; // metres per carbon texture tile (8 tows of ~9 mm)

  function V3(x, y, z) { return new THREE.Vector3(y, z, x); } // car-local -> three-local

  // --- Geometry helpers ------------------------------------------------------------

  function sp(v, e) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e); }

  // Catmull-Rom through numeric keyframes (objects with the same fields), by y.
  function sampleKeys(keys, steps) {
    var out = [];
    for (var i = 0; i < keys.length - 1; i++) {
      var k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
      for (var s = 0; s < steps; s++) {
        var t = s / steps, t2 = t * t, t3 = t2 * t, o = {};
        for (var f in k1) {
          if (typeof k1[f] !== 'number') { o[f] = k1[f]; continue; }
          var p0 = k0[f], p1 = k1[f], p2 = k2[f], p3 = k3[f];
          o[f] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        }
        out.push(o);
      }
    }
    out.push(Object.assign({}, keys[keys.length - 1]));
    return out;
  }
  C.sampleKeys = sampleKeys;

  // Value of a keyframed field at y (linear between samples, keys sorted by y desc).
  function keyAt(keys, y, f) {
    var S = sampleKeys(keys, 8);
    for (var i = 0; i < S.length - 1; i++) {
      var a = S[i], b = S[i + 1];
      if ((y <= a.y && y >= b.y) || (y >= a.y && y <= b.y)) { var t = (y - a.y) / ((b.y - a.y) || 1); return a[f] + (b[f] - a[f]) * t; }
    }
    return S[S.length - 1][f];
  }

  // Make a closed mesh's faces point outwards (signed volume test).
  function orient(g) {
    var p = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : p.count;
    var cx = 0, cy = 0, cz = 0;
    for (var i = 0; i < p.count; i++) { cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
    cx /= p.count; cy /= p.count; cz /= p.count;
    var vol = 0, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (var t = 0; t < n; t += 3) {
      var ia = idx ? idx[t] : t, ib = idx ? idx[t + 1] : t + 1, ic = idx ? idx[t + 2] : t + 2;
      a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
      vol += e1.x * ((a.x + b.x + c.x) / 3 - cx) + e1.y * ((a.y + b.y + c.y) / 3 - cy) + e1.z * ((a.z + b.z + c.z) / 3 - cz);
    }
    if (vol < 0 && idx) { for (var k = 0; k < idx.length; k += 3) { var tmp = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tmp; } g.index.needsUpdate = true; }
    return g;
  }

  // Loft through rings of car-local points (all rings the same length).
  // u = arc length round the ring / WEAVE, v = distance along / WEAVE.
  function loftRings(rings, opts) {
    opts = opts || {};
    var R = rings.length, M = rings[0].length, closed = opts.open ? false : true;
    var pos = [], uv = [], idx = [];
    var along = 0;
    for (var r = 0; r < R; r++) {
      if (r > 0) {
        var c0 = rings[r - 1][0], c1 = rings[r][0], dm = 0;
        for (var q = 0; q < M; q++) dm += Math.hypot(rings[r][q][0] - rings[r - 1][q][0], rings[r][q][1] - rings[r - 1][q][1], rings[r][q][2] - rings[r - 1][q][2]);
        along += dm / M;
        void c0; void c1;
      }
      var arc = 0;
      for (var k = 0; k <= M; k++) {
        var pt = rings[r][k % M];
        if (k > 0) { var pv = rings[r][k - 1]; arc += Math.hypot(pt[0] - pv[0], pt[1] - pv[1], pt[2] - pv[2]); }
        if (!closed && k === M) break;
        pos.push(pt[1], pt[2], pt[0]);
        uv.push(arc / WEAVE, along / WEAVE);
      }
    }
    var W = closed ? M + 1 : M;
    for (var r2 = 0; r2 < R - 1; r2++) for (var k2 = 0; k2 < W - 1; k2++) {
      var a = r2 * W + k2, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    // caps (fans), optional
    var caps = {};
    ['capStart', 'capEnd'].forEach(function (cap, ci) {
      if (!opts[cap]) return;
      var ring = rings[ci === 0 ? 0 : R - 1], cx = 0, cy = 0, cz = 0;
      ring.forEach(function (p) { cx += p[0]; cy += p[1]; cz += p[2]; });
      cx /= M; cy /= M; cz /= M;
      var cp = [cy, cz, cx], cpos = [], cuv = [], cidx = [];
      cpos.push(cp[0], cp[1], cp[2]); cuv.push(0, 0);
      ring.forEach(function (p) { cpos.push(p[1], p[2], p[0]); cuv.push((p[0] - cx) / WEAVE, (p[2] - cz) / WEAVE); });
      for (var m = 1; m <= M; m++) cidx.push(0, m, m % M + 1);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
      g.setIndex(cidx);
      // face away from the body: compare normal with the loft direction
      var ref = rings[ci === 0 ? 1 : R - 2], rx = 0, ry = 0, rz = 0;
      ref.forEach(function (p) { rx += p[0]; ry += p[1]; rz += p[2]; });
      var out = new THREE.Vector3(cy - ry / M, cz - rz / M, cx - rx / M);
      var A = new THREE.Vector3(cpos[3], cpos[4], cpos[5]), B = new THREE.Vector3(cpos[6], cpos[7], cpos[8]);
      var nrm = A.clone().sub(new THREE.Vector3(cp[0], cp[1], cp[2])).cross(B.clone().sub(new THREE.Vector3(cp[0], cp[1], cp[2])));
      if (nrm.dot(out) < 0) for (var z = 0; z < cidx.length; z += 3) { var tt = cidx[z + 1]; cidx[z + 1] = cidx[z + 2]; cidx[z + 2] = tt; }
      g.setIndex(cidx);
      g.computeVertexNormals();
      caps[cap] = g;
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    if (!opts.noOrient) orient(geo);
    geo.computeVertexNormals();
    return { geo: geo, capStart: caps.capStart || null, capEnd: caps.capEnd || null };
  }

  // Body loft: keyframes {y, cx, cz, hw, hh, n, under} -> superellipse rings.
  function bodyLoft(keys, opts) {
    opts = opts || {};
    var M = opts.M || 32, S = sampleKeys(keys, opts.steps || 6), rings = [];
    S.forEach(function (k) {
      var ring = [], e = 2 / (k.n || 2.6);
      for (var i = 0; i < M; i++) {
        var t = (i / M) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        var x = k.hw * sp(c, e), z = k.hh * sp(s, e);
        if (z < 0 && k.under) x *= 1 - k.under * Math.pow(-z / k.hh, 1.4);
        ring.push([(k.cx || 0) + x, k.y, k.cz + z]);
      }
      rings.push(ring);
    });
    return loftRings(rings, opts);
  }

  // Closed smooth ring through 2D control points (x, z), resampled to M.
  function smoothRing(ctrl, M) {
    var pts = ctrl.map(function (p) { return new THREE.Vector3(p[0], 0, p[1]); });
    var curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    return curve.getSpacedPoints(M).slice(0, M).map(function (v) { return [v.x, v.z]; });
  }

  // Airfoil (unit chord, LE at 0, TE at 1 along `back`), cambered.
  function airfoil(N, thick, camber) {
    var up = [], lo = [];
    for (var i = 0; i <= N; i++) {
      var x = (1 - Math.cos(Math.PI * i / N)) / 2;
      var t = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
      var c = camber * 4 * x * (1 - x);
      up.push([x, c + t]); lo.push([x, c - t]);
    }
    var ring = up.slice();
    for (var j = N - 1; j >= 1; j--) ring.push(lo[j]);
    return ring;
  }

  // Wing element spanning x0..x1: stations {x, y (LE), z (LE), chord, ang (rad, TE up), thick, camber}.
  function wingLoft(stations, steps) {
    var S = sampleKeys(stations, steps || 4), rings = [];
    S.forEach(function (st) {
      var foil = airfoil(10, st.thick || 0.08, st.camber || -0.04), ca = Math.cos(st.ang), sa = Math.sin(st.ang);
      rings.push(foil.map(function (p) {
        var bx = p[0] * st.chord, bz = p[1] * st.chord; // back along -y, up
        var yy = st.y - (bx * ca - bz * sa), zz = st.z + bx * sa + bz * ca;
        return [st.x, yy, zz];
      }));
    });
    return loftRings(rings, { capStart: true, capEnd: true });
  }

  function tube(a, b, r, seg) {
    var A = V3(a[0], a[1], a[2]), B = V3(b[0], b[1], b[2]), d = B.clone().sub(A), len = d.length();
    var g = new THREE.CylinderGeometry(r, r, len, seg || 6, 1, true);
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    return g;
  }

  // Box with rounded edges (all corners radius r).
  function roundedBox(w, h, d, r, seg) {
    seg = seg || 4;
    var g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2), p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
    var hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      v.sub(inner).normalize().multiplyScalar(r).add(inner);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  C.roundedBox = roundedBox;

  // Bevelled plate from a side profile (car y, z) at car x, thickness t.
  function plate(profile, x, t, bevel) {
    var sh = new THREE.Shape();
    profile.forEach(function (p, i) { if (i === 0) sh.moveTo(p[0], p[1]); else sh.lineTo(p[0], p[1]); });
    var b = bevel === undefined ? Math.min(0.008, t * 0.4) : bevel;
    var g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, x - (t - 2 * b) / 2);
    boxUV(g);
    return g;
  }
  // Rounded profile helper: rounds every corner of a polygon by radius r.
  function roundPoly(pts, r, seg) {
    var out = [], n = pts.length;
    seg = seg || 4;
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      var d0x = p0[0] - p1[0], d0y = p0[1] - p1[1], d2x = p2[0] - p1[0], d2y = p2[1] - p1[1];
      var l0 = Math.hypot(d0x, d0y), l2 = Math.hypot(d2x, d2y), rr = Math.min(r, l0 * 0.45, l2 * 0.45);
      var a = [p1[0] + d0x / l0 * rr, p1[1] + d0y / l0 * rr], b = [p1[0] + d2x / l2 * rr, p1[1] + d2y / l2 * rr];
      for (var s = 0; s <= seg; s++) {
        var t = s / seg, it = 1 - t;
        out.push([it * it * a[0] + 2 * it * t * p1[0] + t * t * b[0], it * it * a[1] + 2 * it * t * p1[1] + t * t * b[1]]);
      }
    }
    return out;
  }

  // Box-projected UVs (for extrusions etc.), in WEAVE tiles.
  function boxUV(g) {
    var p = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    var n = g.attributes.normal, uv = new Float32Array(p.count * 2);
    for (var i = 0; i < p.count; i++) {
      var ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      var u, v;
      if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = u / WEAVE; uv[i * 2 + 1] = v / WEAVE;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  function mergeAll(list) {
    var clean = list.filter(Boolean).map(function (g) {
      var h = g.index ? g.toNonIndexed() : g;
      if (h !== g) g.dispose();
      if (!h.attributes.normal) h.computeVertexNormals();
      if (!h.attributes.uv) boxUV(h);
      Object.keys(h.attributes).forEach(function (k) { if (k !== 'position' && k !== 'normal' && k !== 'uv') h.deleteAttribute(k); });
      return h;
    });
    return Hi.Track.merge(clean);
  }

  // Swept tube with an elliptical cross-section along a smooth curve through
  // car-local points. rad(t) -> [a, b]: half-width sideways (horizontal,
  // perpendicular to the path) and half-height. Ends are open (they are buried
  // in the bodywork or in another tube).
  var UPV = new THREE.Vector3(0, 1, 0);
  function sweep(pts, rad, segs, radial) {
    var curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return V3(p[0], p[1], p[2]); }), false, 'centripetal');
    var P = curve.getSpacedPoints(segs), T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
    var pos = [], uv = [], idx = [], along = 0;
    for (var i = 0; i <= segs; i++) {
      var t = i / segs;
      curve.getTangentAt(Math.min(0.9999, Math.max(0.0001, t)), T);
      B.crossVectors(T, UPV);
      if (B.lengthSq() < 1e-6) B.set(0, 0, 1);
      B.normalize();
      N.crossVectors(B, T).normalize();
      var r = rad(t);
      if (i > 0) along += P[i].distanceTo(P[i - 1]);
      var per = Math.PI * (r[0] + r[1]);
      for (var k = 0; k <= radial; k++) {
        var th = k / radial * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        pos.push(P[i].x + B.x * r[0] * c + N.x * r[1] * sn, P[i].y + B.y * r[0] * c + N.y * r[1] * sn, P[i].z + B.z * r[0] * c + N.z * r[1] * sn);
        uv.push(k / radial * per / WEAVE, along / WEAVE);
      }
    }
    var W = radial + 1;
    for (var j = 0; j < segs; j++) for (var q = 0; q < radial; q++) {
      var a = j * W + q, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  C.sweep = sweep;

  function smoothstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // FIA-style halo (three mounting points: two behind the head on the cockpit
  // sides, one on the chassis ahead of the driver): one continuous hoop with
  // an oval section, and a front stay that leaves the front of the hoop with
  // the hoop's own size and narrows smoothly to a ~50 mm tube down to the
  // chassis. ring: car-local points from one rear mount over the apex to the
  // other; stay: points from inside the apex down into the chassis.
  // dims: {a, b} hoop half-width / half-height, {s} stay radius.
  function haloGeometry(ring, stay, dims) {
    var out = [];
    out.push(sweep(ring, function (t) {
      // legs swell slightly towards their mounts
      var leg = Math.max(smoothstep(0.12, 0, t), smoothstep(0.88, 1, t));
      return [dims.a * (1 + 0.25 * leg), dims.b * (1 + 0.45 * leg)];
    }, 72, 14));
    out.push(sweep(stay, function (t) {
      var top = smoothstep(0.32, 0, t), base = smoothstep(0.85, 1, t);
      return [dims.s + (dims.a - dims.s) * top + 0.008 * base, dims.s + (dims.b * 1.15 - dims.s) * top + 0.006 * base];
    }, 40, 14));
    return out;
  }

  // A bolted mounting fitting: rounded block on the bodywork + bolt heads.
  function fitting(at, size, yaw, bolts, boltList) {
    var g = roundedBox(size[1], size[2], size[0], Math.min(size[0], size[1], size[2]) * 0.35, 2); // three (car y, z, x)
    g.rotateY(yaw || 0);
    var c = V3(at[0], at[1], at[2] + size[2] / 2);
    g.translate(c.x, c.y, c.z);
    if (bolts && boltList) {
      for (var i = 0; i < bolts; i++) {
        var bx = at[0] + (bolts > 1 ? (i % 2 ? 1 : -1) * size[0] * 0.28 : 0), by = at[1] + (i < 2 ? -1 : 1) * size[1] * 0.3 * (bolts > 2 ? 1 : 0);
        var bg = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 6);
        var bc = V3(bx, by, at[2] + size[2] + 0.002);
        bg.translate(bc.x, bc.y, bc.z);
        boltList.push(bg);
      }
    }
    return g;
  }

  // Small decal (canvas texture on a plane) lying on a surface.
  function stickerTex(R, kind) {
    var key = 'sticker-' + kind;
    if (R[key]) return R[key];
    var S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    if (kind === 'E') { // electrical isolator marking: blue triangle, white border, red spark + E
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(S / 2, 6); g.lineTo(S - 6, S - 10); g.lineTo(6, S - 10); g.closePath(); g.fill();
      g.fillStyle = '#1f4fd1'; g.beginPath(); g.moveTo(S / 2, 18); g.lineTo(S - 18, S - 18); g.lineTo(18, S - 18); g.closePath(); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(S / 2 + 6, 34); g.lineTo(S / 2 - 12, 74); g.lineTo(S / 2, 74); g.lineTo(S / 2 - 8, 102); g.lineTo(S / 2 + 14, 62); g.lineTo(S / 2 + 2, 62); g.closePath(); g.fill();
    } else { // fire extinguisher marking: white circle, red ring, E
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#d6322f'; g.lineWidth = 12; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 16, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#d6322f'; g.font = '900 54px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('E', S / 2, S / 2 + 3);
    }
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    R.textures.push(t);
    var m = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    R.register(m);
    R[key] = m;
    return m;
  }

  // Top of a surface (closest hit straight down) at car-local (x, y).
  var ray = null;
  function surfaceAt(meshes, x, y) {
    ray = ray || new THREE.Raycaster();
    ray.set(V3(x, y, 3), new THREE.Vector3(0, -1, 0));
    var hits = ray.intersectObjects(meshes, false);
    return hits.length ? { z: hits[0].point.y, n: hits[0].face ? hits[0].face.normal.clone() : new THREE.Vector3(0, 1, 0) } : null;
  }

  // --- Materials: carbon, and livery paint over carbon ----------------------------------
  // paint mode 0: carbon only; 1: livery on the upper surfaces (normal facing
  // up), carbon on the sides and below; 2: fully painted.
  function paintHook(uniforms, mode) {
    return function (shader) {
      shader.uniforms.uPaint = uniforms.uPaint;
      shader.uniforms.uChar = uniforms.uChar;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vUp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUp = normal.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uPaint; uniform float uChar; varying float vUp; float paintMask;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          (mode === 2 ? 'paintMask = 1.0;' : mode === 1 ? 'paintMask = smoothstep(0.34, 0.46, vUp);' : 'paintMask = 0.0;') +
          '\ndiffuseColor.rgb = mix(diffuseColor.rgb, uPaint, paintMask);' +
          '\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.016, 0.014, 0.013), uChar * 0.96);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, paintMask);\nroughnessFactor = mix(roughnessFactor, 0.92, uChar);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, geometryNormal, paintMask * 0.92));')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat *= 1.0 - uChar;\n#endif');
    };
  }

  function makeMat(R, kind, hex, char) {
    var t = R.texCarbon, uniforms = { uPaint: { value: new THREE.Color(hex || '#000000').convertSRGBToLinear() }, uChar: char };
    var mode = kind === 'carbon' || kind === 'satin' ? 0 : kind === 'top' ? 1 : 2;
    var satin = kind === 'satin'; // floor, suspension, halo: unlacquered carbon
    var m = R.phys({ map: t.map, normalMap: t.normal, roughnessMap: t.rough, normalScale: new THREE.Vector2(0.6, 0.6), roughness: satin ? 1.25 : 1, metalness: 0.05,
      clearcoat: satin ? 0.1 : 0.9, clearcoatRoughness: satin ? 0.4 : 0.09, envMapIntensity: satin ? 0.2 : 0.75, color: satin ? 0x6a6a6a : 0xffffff }, 'paint' + mode + (satin ? 's' : ''), paintHook(uniforms, mode));
    m.userData.uniforms = uniforms;
    return m;
  }

  // --- Generic box/prism parts (start gantry etc.) ------------------------------------------
  function outline(part) {
    var pts;
    if (part.box) {
      var b = part.box, x0 = b[0] - b[2] / 2, x1 = b[0] + b[2] / 2, y0 = b[1] - b[3] / 2, y1 = b[1] + b[3] / 2;
      pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    } else pts = part.prism.slice();
    return pts;
  }
  C.buildParts = function (R, parts, group, opts) {
    opts = opts || {};
    var byColor = {};
    parts.forEach(function (part) {
      if (part.wheel || part.decal) return;
      var pts = outline(part), cx = 0, cy = 0;
      pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
      cx /= pts.length; cy /= pts.length;
      var w = Math.max.apply(null, pts.map(function (p) { return p[0]; })) - Math.min.apply(null, pts.map(function (p) { return p[0]; }));
      var l = Math.max.apply(null, pts.map(function (p) { return p[1]; })) - Math.min.apply(null, pts.map(function (p) { return p[1]; }));
      var h = part.z[1] - part.z[0], r = Math.min(0.06, w * 0.3, l * 0.3, h * 0.3);
      var g = roundedBox(Math.max(0.01, l), Math.max(0.01, h), Math.max(0.01, w), Math.max(0.002, r), 2);
      g.translate(cy, part.z[0] + h / 2, cx);
      var key = part.color + (part.metal ? '|m' : '');
      (byColor[key] = byColor[key] || { hex: part.color, metal: part.metal, list: [] }).list.push(g);
    });
    Object.keys(byColor).forEach(function (k) {
      var e = byColor[k];
      var c = new THREE.Color(e.hex).convertSRGBToLinear();
      var mat = R.std({ color: c, roughness: e.metal ? 0.38 : 0.5, metalness: e.metal ? 0.85 : 0.2 }, e.metal ? 'metal' : 'part');
      var m = new THREE.Mesh(mergeAll(e.list), mat);
      m.castShadow = !!opts.cast; m.receiveShadow = true;
      group.add(m);
    });
  };

  // --- Livery from the model ------------------------------------------------------------------
  function liveryOf(model) {
    var o = model.opts || {};
    var rear = model.filter(function (p) { return p.wheel && !p.front; })[0];
    var s = o.length || (rear ? -rear.wheel[1] / 1.35 : 1);
    var fw = model.filter(function (p) { return p.box && p.z[0] === 0.06 && p.z[1] === 0.13; })[0];
    var chassis = model.filter(function (p) { return p.prism && p.prism.length > 6; })[0];
    var main = o.main || (chassis ? chassis.color : '#d0d0d0');
    return {
      s: s, w: o.wing || (fw ? fw.box[2] / 1.9 : 1), pod: o.pod || 0.6, rw: o.rearWing || 1, fin: !!o.fin, halo: o.halo !== false, pods: !!o.wheelPods,
      main: main, dark: o.dark || '#1c1f26', accent: o.accent || main, helmet: o.helmet || o.accent || main,
    };
  }

  // Driver's suit from the livery (team colours) and the helmet from the car's own helmet colour.
  C.livery = liveryOf;
  C.driverColours = function (L) {
    var c = Hi.Crew.teamColours(L.main, L.dark, L.accent, L.helmet);
    c.helmet = L.helmet;
    c.hstripe = lum(L.helmet) > 0.55 ? L.dark : '#f2f3f5';
    c.hband = L.accent !== L.helmet ? L.accent : L.main;
    return c;
  };

  function lum(hex) { var v = parseInt(hex.slice(1), 16); return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255; }

  // --- Wheels -----------------------------------------------------------------------------------
  function tyreGeometry(r, w) {
    var sh = Math.min(0.06, w * 0.22), pts = [], rim = r * 0.64;
    pts.push(new THREE.Vector2(rim, -w / 2 + 0.01));
    pts.push(new THREE.Vector2(r - sh * 1.2, -w / 2));
    for (var i = 0; i <= 6; i++) { var a = -Math.PI / 2 + (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh)); }
    for (var j = 0; j <= 6; j++) { var b = (j / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - sh + Math.cos(b) * sh, w / 2 - sh + Math.sin(b) * sh)); }
    pts.push(new THREE.Vector2(r - sh * 1.2, w / 2));
    pts.push(new THREE.Vector2(rim, w / 2 - 0.01));
    var g = new THREE.LatheGeometry(pts, 36);
    g.rotateX(Math.PI / 2);
    return g;
  }

  function makeWheel(R, part, shared) {
    var w = part.wheel, r = w[3], width = w[2];
    var pivot = new THREE.Group();
    pivot.position.set(w[1], r, w[0]);
    var spin = new THREE.Group();
    pivot.add(spin);
    var key = r.toFixed(3) + '|' + width.toFixed(3);
    if (!shared.tyres[key]) { shared.tyres[key] = tyreGeometry(r, width); shared.discs[key] = new THREE.CircleGeometry(r * 0.66, 32); }
    var tyre = new THREE.Mesh(shared.tyres[key], shared.tyreMat);
    tyre.castShadow = true;
    spin.add(tyre);
    var sideSign = w[0] >= 0 ? 1 : -1, texKey = part.stripe + '|' + part.rim;
    var mats = shared.sideMats[texKey];
    if (!mats) {
      var sharp = Hi.sidewall(part.stripe, part.rim, false), blur = Hi.sidewall(part.stripe, part.rim, true);
      R.textures.push(sharp, blur);
      sharp.repeat.set(1, 1);
      mats = shared.sideMats[texKey] = {
        sharp: R.std({ map: sharp, roughness: 0.4, metalness: 0.6, transparent: true, alphaTest: 0.5 }, 'sidewall'),
        blur: (function () { var m = new THREE.MeshStandardMaterial({ map: blur, roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0, depthWrite: false }); R.register(m); return m; })(),
      };
    }
    // rim discs (centre part of the sidewall texture) set into the tyre
    var discs = [];
    (part.front ? [sideSign, -sideSign] : [sideSign]).forEach(function (sd) {
      var d = new THREE.Mesh(shared.discs[key], mats.sharp);
      d.position.z = sd * (width / 2 - 0.02);
      if (sd < 0) d.rotation.y = Math.PI;
      spin.add(d);
      var b = new THREE.Mesh(shared.discs[key], mats.blur);
      b.position.z = sd * (width / 2 - 0.017);
      if (sd < 0) b.rotation.y = Math.PI;
      b.renderOrder = 3; b.visible = false;
      spin.add(b);
      discs.push(d, b);
    });
    return { pivot: pivot, spin: spin, r: r, front: !!part.front, blurMat: mats.blur, tyre: tyre, key: key, size: [r, width],
      blur: discs.filter(function (x, i) { return i % 2 === 1; }), sharp: discs.filter(function (x, i) { return i % 2 === 0; }) };
  }

  // Rain tyres: full wets / intermediates show their grooves (hi-tex treadWet on
  // a lathe with tread UVs); slicks keep the plain tread. id: compound S/M/H/I/W.
  C.setTyre = function (R, car, id) {
    var kind = id === 'W' ? 'wet' : id === 'I' ? 'inter' : 'slick';
    if (!car || car.tyreKind === kind || !R.carShared) return;
    car.tyreKind = kind;
    var sh = R.carShared;
    if (kind !== 'slick' && !sh['tread_' + kind]) {
      var t = Hi.treadWet(kind);
      R.textures.push(t.map, t.normal);
      sh['tread_' + kind] = R.std({ map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(1.3, 1.3), color: 0xffffff, roughness: kind === 'wet' ? 0.78 : 0.82, metalness: 0 }, 'tyre_' + kind);
    }
    sh.tyresTread = sh.tyresTread || {};
    car.wheels.forEach(function (wh) {
      if (!wh.tyre) return;
      if (kind === 'slick') { wh.tyre.geometry = sh.tyres[wh.key]; wh.tyre.material = sh.tyreMat; return; }
      if (!sh.tyresTread[wh.key]) sh.tyresTread[wh.key] = Hi.tyreTreadUV(tyreGeometry(wh.size[0], wh.size[1]), 18);
      wh.tyre.geometry = sh.tyresTread[wh.key];
      wh.tyre.material = sh['tread_' + kind];
    });
  };

  // --- The car ------------------------------------------------------------------------------------
  // Monocoque / nose keyframes for scale s (top of the cockpit at z 0.5).
  function monoKeys(s) {
    return [
      { y: 2.27 * s, cz: 0.2, hw: 0.025, hh: 0.025, n: 2.2, under: 0 },
      { y: 2.17 * s, cz: 0.21, hw: 0.07, hh: 0.055, n: 2.4, under: 0.1 },
      { y: 1.85 * s, cz: 0.25, hw: 0.115, hh: 0.095, n: 2.6, under: 0.2 },
      { y: 1.45 * s, cz: 0.295, hw: 0.165, hh: 0.13, n: 2.7, under: 0.25 },
      { y: 1.05 * s, cz: 0.325, hw: 0.215, hh: 0.155, n: 2.8, under: 0.28 },
      { y: 0.65, cz: 0.335, hw: 0.265, hh: 0.168, n: 2.9, under: 0.3 },
      { y: 0.3, cz: 0.33, hw: 0.295, hh: 0.172, n: 3, under: 0.3 },
      { y: -0.1, cz: 0.32, hw: 0.31, hh: 0.18, n: 3, under: 0.3 },
      { y: -0.42, cz: 0.31, hw: 0.29, hh: 0.19, n: 3, under: 0.3 },
    ];
  }

  C.create = function (R, model, opts) {
    opts = opts || {};
    var L = liveryOf(model), s = L.s, w = L.w;
    var group = new THREE.Group(), body = new THREE.Group();
    group.add(body);
    var shared = R.carShared || (R.carShared = {
      tyres: {}, discs: {}, sideMats: {},
      tyreMat: R.std({ map: R.texTread, color: 0xffffff, roughness: 0.82, metalness: 0 }, 'tyre'),
    });
    var char = { value: 0 };
    var mats = {};
    function mat(kind, hex) {
      var k = kind + (hex || '');
      return mats[k] || (mats[k] = makeMat(R, kind, hex, char));
    }
    var carbon = mat('carbon'), satin = mat('satin');
    var darkKind = lum(L.dark) < 0.12 ? null : L.dark;
    var buckets = {}; // material key -> {mat, list, cock, group}
    function add(g, m, grp) {
      var key = m.uuid + '|' + (grp || 'body');
      (buckets[key] = buckets[key] || { mat: m, list: [], grp: grp || 'body' }).list.push(g);
    }

    // Monocoque + nose (painted top)
    var mk = monoKeys(s);
    var mono = bodyLoft(mk, { capEnd: true, M: 36, steps: 7 });
    add(mono.geo, mat('top', L.main));
    if (mono.capEnd) add(mono.capEnd, carbon);
    // Engine cover with roll hoop and airbox
    var ek = [
      { y: -0.18, cz: 0.42, hw: 0.27, hh: 0.17, n: 2.6, under: 0.2 },
      { y: -0.34, cz: 0.6, hw: 0.17, hh: 0.33, n: 2.4, under: 0.2 },
      { y: -0.62, cz: 0.55, hw: 0.2, hh: 0.26, n: 2.6, under: 0.25 },
      { y: -1.0 * s, cz: 0.46, hw: 0.17, hh: 0.18, n: 2.7, under: 0.25 },
      { y: -1.4 * s, cz: 0.4, hw: 0.11, hh: 0.11, n: 2.6, under: 0.2 },
      { y: -1.76 * s, cz: 0.36, hw: 0.05, hh: 0.055, n: 2.4, under: 0.1 },
      { y: -1.96 * s, cz: 0.345, hw: 0.018, hh: 0.02, n: 2.2, under: 0 },
    ];
    var eng = bodyLoft(ek, { capStart: true, M: 32, steps: 7 });
    add(eng.geo, mat('top', L.main));
    if (eng.capStart) add(eng.capStart, carbon);
    // airbox intake above the driver's head
    var intakeGeo = new THREE.CircleGeometry(1, 20);
    intakeGeo.scale(0.08, 0.065, 1);
    intakeGeo.rotateY(Math.PI / 2);
    intakeGeo.translate(-0.25, 0.84, 0);
    add(intakeGeo, R.intakeMat || (R.intakeMat = R.std({ color: 0x050506, roughness: 0.9 }, 'intake')));
    // Sidepods: undercut, tapering inwards to the rear (coke bottle)
    var xo = L.pod + 0.04, xi = 0.27;
    [1, -1].forEach(function (sd) {
      var xin = 0.12; // inner edge buried in the monocoque: blends into it
      var pk = [
        { y: 0.47 * s, cx: sd * (xin + xo) / 2, cz: 0.29, hw: (xo - xin) / 2, hh: 0.1, n: 4.2, under: 0.6 },
        { y: 0.3 * s, cx: sd * (xin + xo) / 2, cz: 0.3, hw: (xo - xin) / 2 + 0.005, hh: 0.125, n: 4.2, under: 0.62 },
        { y: -0.2 * s, cx: sd * (xin + xo - 0.04) / 2, cz: 0.29, hw: (xo - xin - 0.04) / 2, hh: 0.125, n: 3.8, under: 0.62 },
        { y: -0.8 * s, cx: sd * (xin + 0.44) / 2, cz: 0.265, hw: (0.44 - xin) / 2, hh: 0.1, n: 3.2, under: 0.55 },
        { y: -1.3 * s, cx: sd * 0.17, cz: 0.235, hw: 0.08, hh: 0.055, n: 2.6, under: 0.35 },
      ];
      var pod = bodyLoft(pk, { capStart: true, M: 32, steps: 6 });
      add(pod.geo, mat('top', L.main));
      if (pod.capStart) add(pod.capStart, R.intakeMat);
    });
    // Floor with rounded plan outline, diffuser and strakes (carbon)
    var fp = [[0, 1.05 * s], [0.3, 1.0 * s], [xo + 0.1, 0.42 * s], [xo + 0.12, -1.1 * s], [0.56, -1.62 * s], [0.5, -1.72 * s], [-0.5, -1.72 * s], [-0.56, -1.62 * s], [-(xo + 0.12), -1.1 * s], [-(xo + 0.1), 0.42 * s], [-0.3, 1.0 * s]];
    var fsh = new THREE.Shape(), fr = roundPoly(fp, 0.12, 4);
    fr.forEach(function (p, i) { if (i === 0) fsh.moveTo(p[1], p[0]); else fsh.lineTo(p[1], p[0]); });
    var floor = new THREE.ExtrudeGeometry(fsh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 });
    floor.rotateX(Math.PI / 2);
    floor.translate(0, 0.075, 0);
    add(boxUV(floor), satin);
    var dShape = new THREE.Shape(), dw = 0.47;
    dShape.moveTo(-dw, 0); dShape.lineTo(dw, 0); dShape.lineTo(dw, 0.018); dShape.lineTo(-dw, 0.018);
    var dif = new THREE.ExtrudeGeometry(dShape, { depth: 0.4 * s, bevelEnabled: false });
    dif.rotateY(-Math.PI / 2); // depth along -x (three) = backwards
    dif.rotateZ(-0.42);
    dif.translate(-1.66 * s, 0.08, 0);
    add(boxUV(dif), satin);
    [-0.32, -0.12, 0.12, 0.32].forEach(function (x) {
      add(plate([[-1.66 * s, 0.075], [-2.05 * s, 0.075], [-2.05 * s, 0.25], [-1.7 * s, 0.1]], x, 0.012, 0.003), satin);
    });
    // Crash structure + rain light
    var crash = roundedBox(0.24 * s, 0.09, 0.14, 0.035, 2);
    crash.translate(-1.98 * s, 0.33, 0);
    add(crash, carbon);
    // Front wing: three cambered elements rising at the tips, endplates
    var fwHalf = 0.95 * w, fwY = 2.32 * s;
    var frontWing = new THREE.Group();
    function fwStations(y, z, chord, ang, rise, inner) {
      var st = [], xs = [-fwHalf, -fwHalf * 0.72, -fwHalf * 0.4, -inner, inner, fwHalf * 0.4, fwHalf * 0.72, fwHalf];
      xs.forEach(function (x) {
        var t = Math.max(0, (Math.abs(x) - fwHalf * 0.4) / (fwHalf * 0.6));
        st.push({ x: x, y: y + t * 0.06, z: z + rise * t * t, chord: chord * (1 - 0.15 * t), ang: ang + t * 0.15, thick: 0.1, camber: -0.05 });
      });
      return st;
    }
    var fwMain = wingLoft(fwStations(fwY, 0.075, 0.24, 0.05, 0.04, 0.12), 3);
    var fwF1 = wingLoft(fwStations(fwY - 0.2, 0.12, 0.13, 0.32, 0.08, 0.2), 3);
    var fwF2 = wingLoft(fwStations(fwY - 0.3, 0.165, 0.1, 0.55, 0.1, 0.24), 3);
    var fwBuckets = [];
    [fwMain].forEach(function (lw) { fwBuckets.push([lw.geo, carbon], [lw.capStart, carbon], [lw.capEnd, carbon]); });
    [fwF1, fwF2].forEach(function (lw, i) { var m = mat('full', i ? L.accent : L.main); fwBuckets.push([lw.geo, m], [lw.capStart, m], [lw.capEnd, m]); });
    [1, -1].forEach(function (sd) {
      var ep = roundPoly([[fwY + 0.04, 0.03], [fwY - 0.42, 0.04], [fwY - 0.44, 0.33], [fwY - 0.05, 0.22]], 0.04, 3);
      fwBuckets.push([plate(ep, sd * (fwHalf + 0.012), 0.024, 0.006), darkKind ? mat('full', L.dark) : carbon]);
      // nose pylons
      fwBuckets.push([plate([[fwY - 0.18, 0.09], [fwY - 0.32, 0.09], [fwY - 0.28, 0.2], [fwY - 0.16, 0.2]], sd * 0.07, 0.018, 0.004), carbon]);
    });
    // Rear wing: main plane + flap, rounded endplates, beam wing, swan neck
    var ry = -2.12 * s, rwHalf = 0.52 * w, rwTop = L.rw;
    var rearWing = new THREE.Group();
    function rwSt(y, z, chord, ang) { return [{ x: -rwHalf + 0.01, y: y, z: z, chord: chord, ang: ang, thick: 0.11, camber: -0.06 }, { x: 0, y: y, z: z - 0.008, chord: chord, ang: ang, thick: 0.11, camber: -0.06 }, { x: rwHalf - 0.01, y: y, z: z, chord: chord, ang: ang, thick: 0.11, camber: -0.06 }]; }
    var rwMain = wingLoft(rwSt(ry + 0.2, rwTop - 0.16, 0.3, 0.12), 3);
    var rwFlap = wingLoft(rwSt(ry - 0.08, rwTop - 0.07, 0.15, 0.55), 3);
    var beam = wingLoft([{ x: -0.42 * w, y: ry + 0.16, z: 0.36, chord: 0.18, ang: 0.1, thick: 0.1, camber: -0.04 }, { x: 0.42 * w, y: ry + 0.16, z: 0.36, chord: 0.18, ang: 0.1, thick: 0.1, camber: -0.04 }], 2);
    var rwBuckets = [];
    [[rwMain, mat('full', L.main)], [rwFlap, mat('full', L.accent)], [beam, carbon]].forEach(function (e) { rwBuckets.push([e[0].geo, e[1]], [e[0].capStart, e[1]], [e[0].capEnd, e[1]]); });
    [1, -1].forEach(function (sd) {
      var ep = roundPoly([[ry + 0.24, 0.4], [ry - 0.26, 0.34], [ry - 0.3, rwTop + 0.04], [ry + 0.02, rwTop + 0.05], [ry + 0.24, rwTop - 0.12]], 0.08, 4);
      rwBuckets.push([plate(ep, sd * (rwHalf + 0.012), 0.026, 0.007), darkKind ? mat('full', L.dark) : carbon]);
    });
    rwBuckets.push([plate([[ry + 0.32, 0.36], [ry + 0.12, 0.36], [ry + 0.06, rwTop - 0.12], [ry + 0.16, rwTop - 0.1]], 0, 0.02, 0.005), carbon]); // swan neck
    // Shark fin
    if (L.fin) add(plate(roundPoly([[-0.55, 0.78], [-1.62 * s, 0.4], [-1.62 * s, 0.6], [-0.75, 0.9]], 0.05, 3), 0, 0.012, 0.004), mat('full', L.main));
    // Halo, mirrors on stalks
    if (L.halo) {
      var exRing = [[0.27, -0.4, 0.4], [0.266, -0.33, 0.57], [0.25, -0.2, 0.72], [0.19, 0.08, 0.775], [0.1, 0.24, 0.79], [0, 0.29, 0.792],
        [-0.1, 0.24, 0.79], [-0.19, 0.08, 0.775], [-0.25, -0.2, 0.72], [-0.266, -0.33, 0.57], [-0.27, -0.4, 0.4]];
      var exStay = [[0, 0.265, 0.79], [0, 0.33, 0.765], [0, 0.45, 0.66], [0, 0.56, 0.54], [0, 0.6, 0.47]];
      var haloPaint = mat('full', '#1b1e23');
      haloGeometry(exRing, exStay, { a: 0.03, b: 0.02, s: 0.021 }).forEach(function (g) { add(g, haloPaint, 'halo'); });
    }
    [1, -1].forEach(function (sd) {
      var mh = roundedBox(0.07, 0.075, 0.19, 0.03, 3);
      mh.rotateY(sd * 0.2);
      mh.translate(0.5, 0.64, sd * 0.47);
      add(mh, mat('full', L.main), 'mirror');
      add(tube([sd * 0.43, 0.5, 0.62], [sd * 0.31, 0.47, 0.49], 0.012, 6), carbon, 'mirror');
    });
    // Suspension (carbon wishbones, push rods, track rods)
    var fy = 1.35 * s, ryA = -1.35 * s, sus = [];
    [1, -1].forEach(function (sd) {
      sus.push(tube([sd * 0.2, fy + 0.13, 0.42], [sd * 0.66, fy, 0.43], 0.014), tube([sd * 0.22, fy - 0.2, 0.42], [sd * 0.66, fy, 0.43], 0.014));
      sus.push(tube([sd * 0.16, fy + 0.15, 0.17], [sd * 0.68, fy, 0.17], 0.014), tube([sd * 0.18, fy - 0.22, 0.17], [sd * 0.68, fy, 0.17], 0.014));
      sus.push(tube([sd * 0.67, fy - 0.02, 0.19], [sd * 0.2, fy - 0.05, 0.46], 0.011), tube([sd * 0.2, fy - 0.08, 0.3], [sd * 0.67, fy - 0.08, 0.3], 0.01));
      sus.push(tube([sd * 0.12, ryA + 0.18, 0.43], [sd * 0.66, ryA, 0.45], 0.014), tube([sd * 0.12, ryA - 0.22, 0.43], [sd * 0.66, ryA, 0.45], 0.014));
      sus.push(tube([sd * 0.12, ryA + 0.2, 0.18], [sd * 0.68, ryA, 0.18], 0.014), tube([sd * 0.12, ryA - 0.22, 0.18], [sd * 0.68, ryA, 0.18], 0.014));
      sus.push(tube([sd * 0.66, ryA + 0.02, 0.2], [sd * 0.14, ryA + 0.1, 0.44], 0.011));
    });
    var frontSus = sus.filter(function (g, i) { return (i % 11) < 6; }), rearSus = sus.filter(function (g, i) { return (i % 11) >= 6; });
    frontSus.forEach(function (g) { add(g, satin, 'fsus'); });
    rearSus.forEach(function (g) { add(g, satin); });
    // Formula E: fairings arching over the front wheels
    if (L.pods) [1, -1].forEach(function (sd) {
      var fg = new THREE.CylinderGeometry(0.39, 0.39, 0.42, 20, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
      fg.rotateX(Math.PI / 2);
      fg.translate(fy, 0.31, sd * 0.78);
      add(boxUV(fg), mat('top', L.accent));
    });
    // Driver in the opening: shoulders, HANS, harness, headrest pads (detail >= 1)
    var det = opts.detail || 0, bolts = [];
    // the rigged driver (hi-crew.js) in the team's race suit and the car's helmet colours
    var driver = det >= 1 && Hi.Crew && !opts.noDriver ? new Hi.Crew.Driver(R, C.driverColours(L)) : null;
    if (driver) body.add(driver.group);
    if (det >= 1) {
      if (!driver) {
        var suitM = R.suitMat || (R.suitMat = R.std({ color: new THREE.Color('#252b3a').convertSRGBToLinear(), roughness: 0.85 }, 'suit'));
        var sh = new THREE.SphereGeometry(1, 16, 10);
        sh.scale(0.11, 0.07, 0.2);
        sh.translate(-0.06, 0.47, 0);
        add(sh, suitM);
      }
      var hans = new THREE.TorusGeometry(0.115, det >= 2 ? 0.022 : 0.018, det >= 2 ? 8 : 6, det >= 2 ? 22 : 12, Math.PI * 1.15);
      hans.rotateX(Math.PI / 2); hans.rotateY(Math.PI / 2 + Math.PI * 0.07);
      hans.translate(-0.04, 0.505, 0);
      add(boxUV(hans), carbon);
      var strapM = R.strapMat || (R.strapMat = R.std({ color: new THREE.Color(L.accent).convertSRGBToLinear(), roughness: 0.7 }, 'strap'));
      [1, -1].forEach(function (sd) {
        add(sweep([[sd * 0.085, -0.2, 0.49], [sd * 0.09, -0.08, 0.545], [sd * 0.08, 0.04, 0.53], [sd * 0.05, 0.14, 0.49]], function () { return [0.022, 0.004]; }, 10, 4), strapM);
      });
      var padM = R.padMat || (R.padMat = R.std({ color: new THREE.Color('#1d1f24').convertSRGBToLinear(), roughness: 0.95 }, 'pad'));
      var topZ = keyAt(mk, -0.1, 'cz') + keyAt(mk, -0.1, 'hh');
      [1, -1].forEach(function (sd) {
        var pg = det >= 2 ? roundedBox(0.36, 0.11, 0.055, 0.025, 3) : new THREE.BoxGeometry(0.36, 0.11, 0.055);
        pg.translate(-0.15, topZ + 0.03, sd * 0.165);
        add(pg, padM);
      });
      var back = det >= 2 ? roundedBox(0.06, 0.13, 0.3, 0.025, 3) : new THREE.BoxGeometry(0.06, 0.13, 0.3);
      back.translate(-0.33, topZ + 0.04, 0);
      add(back, padM);
    }

    // Cockpit opening and padded rim
    var ck = new THREE.Shape(), cr = roundPoly([[0.19, -0.35], [0.19, 0.42], [-0.19, 0.42], [-0.19, -0.35]], 0.1, 4);
    cr.forEach(function (p, i) { if (i === 0) ck.moveTo(p[1], p[0]); else ck.lineTo(p[1], p[0]); });
    var hole = new THREE.ShapeGeometry(ck);
    hole.rotateX(-Math.PI / 2);
    hole.translate(0, keyAt(mk, 0.1, 'cz') + keyAt(mk, 0.1, 'hh') + 0.004, 0);
    add(hole, R.intakeMat);
    var rimPts = cr.map(function (p) { return V3(p[0], p[1], keyAt(mk, Math.max(-0.4, p[1]), 'cz') + keyAt(mk, Math.max(-0.4, p[1]), 'hh') + 0.01); });
    var rimCurve = new THREE.CatmullRomCurve3(rimPts, true);
    add(new THREE.TubeGeometry(rimCurve, 48, 0.022, 8, true), R.rimMat || (R.rimMat = R.std({ color: 0x0b0c0e, roughness: 0.85 }, 'rim')));

    // Build meshes
    var meshes = { body: [], halo: [], mirror: [], fsus: [] };
    Object.keys(buckets).forEach(function (k) {
      var b = buckets[k], g = mergeAll(b.list), m = new THREE.Mesh(g, b.mat);
      m.castShadow = true; m.receiveShadow = true;
      body.add(m);
      meshes[b.grp].push(m);
    });
    function groupFrom(list, parent) {
      var gm = {};
      list.forEach(function (e) { if (!e[0]) return; var k = e[1].uuid; (gm[k] = gm[k] || { mat: e[1], list: [] }).list.push(e[0]); });
      Object.keys(gm).forEach(function (k) { var m = new THREE.Mesh(mergeAll(gm[k].list), gm[k].mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); });
    }
    groupFrom(fwBuckets, frontWing);
    groupFrom(rwBuckets, rearWing);
    body.add(frontWing, rearWing);

    // Helmet + visor (sits in the cockpit opening)
    var hm = R.phys({ color: new THREE.Color(L.helmet).convertSRGBToLinear(), roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }, 'helmet');
    var hg = new THREE.SphereGeometry(0.135, 20, 14);
    hg.scale(1.18, 1.0, 0.95);
    var hmesh = new THREE.Mesh(hg, hm);
    hmesh.position.set(0.02, 0.6, 0);
    hmesh.castShadow = true;
    if (!driver) body.add(hmesh);
    var vm = R.phys({ color: 0x0a0c10, roughness: 0.04, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 }, 'visor');
    var vg = new THREE.SphereGeometry(0.139, 18, 6, -0.9, 1.8, 1.15, 0.42);
    vg.scale(1.18, 1.0, 0.95);
    var vmesh = new THREE.Mesh(vg, vm);
    vmesh.position.copy(hmesh.position);
    vmesh.rotation.y = Math.PI / 2;
    if (!driver) body.add(vmesh);

    // Wheels
    var wheels = [];
    model.forEach(function (part) {
      if (!part.wheel) return;
      var wh = makeWheel(R, part, shared);
      body.add(wh.pivot);
      wheels.push(wh);
    });

    // Numbers: nose top and both sides of the engine cover
    var numberMeshes = [];
    if (opts.number) {
      var nt = Hi.number(opts.number, '#ffffff', '#111111');
      R.textures.push(nt);
      var nm = new THREE.MeshStandardMaterial({ map: nt, transparent: true, alphaTest: 0.3, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      R.register(nm);
      var ng = new THREE.PlaneGeometry(0.17, 0.17), ny = 1.5 * s;
      var nose = new THREE.Mesh(ng, nm);
      nose.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      nose.position.set(ny, keyAt(mk, ny, 'cz') + keyAt(mk, ny, 'hh') + 0.003, 0);
      body.add(nose);
      var ey = -0.95 * s, ehw = keyAt(ek, ey, 'hw');
      [1, -1].forEach(function (sd) {
        var side = new THREE.Mesh(ng, nm);
        side.position.set(ey, keyAt(ek, ey, 'cz') + 0.04, sd * (ehw * 0.93 + 0.004));
        side.rotation.y = sd > 0 ? 0 : Math.PI;
        side.scale.setScalar(0.85);
        body.add(side);
        numberMeshes.push(side);
      });
    }
    // Rain light, headlights + cones (dusk)
    var brakeMat = new THREE.MeshStandardMaterial({ color: 0x300606, emissive: 0xff1e1e, emissiveIntensity: 0.6, roughness: 0.4 });
    R.register(brakeMat);
    var bl = new THREE.Mesh(roundedBox(0.02, 0.06, 0.14, 0.008, 1), brakeMat);
    bl.position.set(-2.1 * s, 0.33, 0);
    body.add(bl);
    var lampMat = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xfff1d8, emissiveIntensity: 0.4 + (opts.night || 0) * 5, roughness: 0.3 });
    R.register(lampMat);
    var cones = [];
    [1, -1].forEach(function (sd) {
      var lamp = new THREE.Mesh(roundedBox(0.03, 0.04, 0.09, 0.012, 1), lampMat);
      lamp.position.set(fwY - 0.2, 0.25, sd * (fwHalf - 0.08));
      frontWing.add(lamp);
      if ((opts.night || 0) > 0.3 && R.coneMat) {
        var cone = new THREE.Mesh(R.coneGeo, R.coneMat);
        cone.position.copy(lamp.position); cone.position.x += 0.05;
        cone.rotation.z = Math.PI / 2 - 0.06;
        cone.renderOrder = 4;
        frontWing.add(cone);
        cones.push(cone);
      }
    });
    // Contact shadow
    var shadow = new THREE.Mesh(R.blobGeo, R.blobMat);
    shadow.rotation.x = -Math.PI / 2; shadow.rotation.z = -Math.PI / 2;
    shadow.position.y = 0.014;
    shadow.scale.set(2.1, 4.9 * s, 1);
    shadow.renderOrder = 2;
    group.add(shadow);

    // First-person cockpit (player cars)
    var cockpit = opts.cockpit ? buildCockpit(R, L, mat, carbon, s, opts) : null;
    if (cockpit) { cockpit.visible = false; body.add(cockpit); }

    // Exterior parts hidden from the driver's seat (cockpit view keeps the
    // front wing, front wheels and front suspension, plus the 3D cockpit).
    var hideInCockpit = meshes.body.concat(meshes.halo, meshes.mirror, [rearWing, driver ? driver.group : hmesh, vmesh, bl, shadow], numberMeshes);
    wheels.forEach(function (wh) { if (!wh.front) hideInCockpit.push(wh.pivot); });

    var allMats = Object.keys(mats).map(function (k) { return mats[k]; });
    return {
      group: group, body: body, wheels: wheels, brakeMat: brakeMat, cockpitHidden: hideInCockpit, cockpit: cockpit, driver: driver, mirrorGlass: cockpit ? cockpit.userData.glass : null,
      materials: allMats, char: char, scale: s, model: model, cones: cones, frontWing: frontWing, rearWing: rearWing,
      livery: L, hidden: undefined, wrecked: false,
    };
  };

  // --- 리얼리스틱 safety car: a silver GT coupe with a roof light bar ------------------------
  // model.opts.gt (real-data.js safetyCarModel). Same return shape as create().
  C.createGT = function (R, model, opts) {
    var o = model.opts, group = new THREE.Group(), body = new THREE.Group();
    group.add(body);
    var shared = R.carShared || (R.carShared = {
      tyres: {}, discs: {}, sideMats: {},
      tyreMat: R.std({ map: R.texTread, color: 0xffffff, roughness: 0.82, metalness: 0 }, 'tyre'),
    });
    var char = { value: 0 };
    var paint = R.phys({ color: new THREE.Color(o.main).convertSRGBToLinear(), roughness: 0.32, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1 }, 'scPaint');
    var glass = R.phys({ color: 0x0b0f15, roughness: 0.06, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2 }, 'scGlass');
    var black = R.std({ color: 0x0d0f12, roughness: 0.6, metalness: 0.1 }, 'scTrim');
    var lower = bodyLoft([
      { y: 2.33, cz: 0.4, hw: 0.5, hh: 0.1, n: 3, under: 0.1 },
      { y: 2.22, cz: 0.46, hw: 0.84, hh: 0.19, n: 3.4, under: 0.2 },
      { y: 1.75, cz: 0.53, hw: 0.95, hh: 0.27, n: 4, under: 0.2 },
      { y: 1.0, cz: 0.58, hw: 0.93, hh: 0.31, n: 4, under: 0.2 },
      { y: 0.0, cz: 0.6, hw: 0.91, hh: 0.33, n: 4, under: 0.2 },
      { y: -1.0, cz: 0.62, hw: 0.97, hh: 0.34, n: 4, under: 0.2 },
      { y: -1.85, cz: 0.62, hw: 0.98, hh: 0.33, n: 4, under: 0.2 },
      { y: -2.22, cz: 0.6, hw: 0.88, hh: 0.27, n: 3.6, under: 0.2 },
      { y: -2.34, cz: 0.58, hw: 0.66, hh: 0.17, n: 3, under: 0.1 },
    ], { capStart: true, capEnd: true, M: 40, steps: 6 });
    var cabin = bodyLoft([
      { y: 1.05, cz: 0.9, hw: 0.74, hh: 0.02, n: 3.2 },
      { y: 0.45, cz: 1.0, hw: 0.7, hh: 0.17, n: 3.2 },
      { y: -0.2, cz: 1.04, hw: 0.67, hh: 0.2, n: 3.4 },
      { y: -0.9, cz: 1.0, hw: 0.65, hh: 0.16, n: 3.4 },
      { y: -1.55, cz: 0.93, hw: 0.62, hh: 0.04, n: 3.2 },
    ], { capStart: true, capEnd: true, M: 32, steps: 6 });
    var roof = bodyLoft([
      { y: 0.25, cz: 1.205, hw: 0.5, hh: 0.015, n: 3 },
      { y: -0.2, cz: 1.235, hw: 0.56, hh: 0.02, n: 3 },
      { y: -0.85, cz: 1.165, hw: 0.52, hh: 0.015, n: 3 },
    ], { capStart: true, capEnd: true, M: 24, steps: 4 });
    var list = [[lower.geo, paint], [cabin.geo, glass], [roof.geo, paint]];
    [lower.capStart, lower.capEnd, cabin.capStart, cabin.capEnd, roof.capStart, roof.capEnd].forEach(function (g, i) { if (g) list.push([g, i < 2 ? black : i < 4 ? glass : paint]); });
    // splitter, side skirts, rear wing
    var sp = roundedBox(0.12, 0.04, 1.8, 0.015, 1); sp.translate(2.25, 0.16, 0); list.push([sp, black]);
    [1, -1].forEach(function (sd) { var sk = roundedBox(2.6, 0.06, 0.06, 0.02, 1); sk.translate(-0.1, 0.27, sd * 0.93); list.push([sk, black]); });
    var wing = roundedBox(0.28, 0.03, 1.7, 0.012, 1); wing.translate(-2.12, 1.0, 0); list.push([wing, black]);
    [1, -1].forEach(function (sd) { var st = roundedBox(0.16, 0.12, 0.03, 0.01, 1); st.translate(-2.08, 0.93, sd * 0.6); list.push([st, black]); });
    var meshes = [];
    list.forEach(function (e) { var m = new THREE.Mesh(e[0], e[1]); m.castShadow = true; m.receiveShadow = true; body.add(m); meshes.push(m); });
    // lights
    var brakeMat = new THREE.MeshStandardMaterial({ color: 0x300606, emissive: 0xff1e1e, emissiveIntensity: 0.6, roughness: 0.4 });
    var headMat = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0xfff4e0, emissiveIntensity: 2.2, roughness: 0.2 });
    var amber = new THREE.MeshStandardMaterial({ color: 0x402000, emissive: 0xff9a14, emissiveIntensity: 0.4, roughness: 0.3 });
    var amber2 = amber.clone();
    var green = new THREE.MeshStandardMaterial({ color: 0x033016, emissive: 0x22e070, emissiveIntensity: 0.3, roughness: 0.3 });
    [brakeMat, headMat, amber, amber2, green].forEach(function (m) { R.register(m); });
    [1, -1].forEach(function (sd) {
      var hl = new THREE.Mesh(roundedBox(0.06, 0.07, 0.34, 0.02, 1), headMat); hl.position.set(2.22, 0.58, sd * 0.62); body.add(hl);
      var tl = new THREE.Mesh(roundedBox(0.04, 0.06, 0.46, 0.02, 1), brakeMat); tl.position.set(-2.3, 0.72, sd * 0.56); body.add(tl);
    });
    var bar = new THREE.Mesh(roundedBox(0.24, 0.07, 1.1, 0.03, 2), black); bar.position.set(-0.3, 1.27, 0); body.add(bar);
    [[-0.38, amber], [0.38, amber2]].forEach(function (e) { var l = new THREE.Mesh(roundedBox(0.2, 0.06, 0.32, 0.025, 2), e[1]); l.position.set(-0.3, 1.3, e[0]); body.add(l); });
    var gl = new THREE.Mesh(roundedBox(0.2, 0.06, 0.18, 0.025, 2), green); gl.position.set(-0.3, 1.3, 0); body.add(gl);
    // SAFETY CAR lettering on both doors
    var cnv = document.createElement('canvas'); cnv.width = 512; cnv.height = 96;
    var g2 = cnv.getContext('2d');
    g2.fillStyle = o.accent; g2.fillRect(0, 70, 512, 14);
    g2.font = '900 54px Arial Black, Arial, sans-serif'; g2.fillStyle = '#10141a'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('SAFETY CAR', 256, 38);
    var tex = new THREE.CanvasTexture(cnv); R.textures.push(tex);
    var decal = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    R.register(decal);
    [1, -1].forEach(function (sd) {
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), decal);
      pl.position.set(-0.1, 0.62, sd * 0.945);
      pl.rotation.y = sd > 0 ? 0 : Math.PI;
      body.add(pl);
    });
    // wheels
    var wheels = [];
    [[0.82, -1.4, false], [-0.82, -1.4, false], [0.82, 1.42, true], [-0.82, 1.42, true]].forEach(function (w) {
      var wh = makeWheel(R, { wheel: [w[0], w[1], 0.28, 0.34], front: w[2], rim: '#b9bec6', stripe: '#b9bec6' }, shared);
      body.add(wh.pivot);
      wheels.push(wh);
    });
    var shadow = new THREE.Mesh(R.blobGeo, R.blobMat);
    shadow.rotation.x = -Math.PI / 2; shadow.rotation.z = -Math.PI / 2;
    shadow.position.y = 0.014; shadow.scale.set(2.3, 5.0, 1); shadow.renderOrder = 2;
    group.add(shadow);
    return {
      group: group, body: body, wheels: wheels, brakeMat: brakeMat, cockpitHidden: [], cockpit: null, mirrorGlass: null,
      materials: [paint, glass], char: char, scale: 1, model: model, cones: [], frontWing: null, rearWing: null,
      livery: null, hidden: undefined, wrecked: false, lightbar: [amber, amber2, green],
    };
  };

  // --- First-person cockpit (cockpit.js layout, rounded) ----------------------------------------
  function buildCockpit(R, L, mat, carbon, s, opts) {
    opts = opts || {};
    var G = (CR.Cockpit && CR.Cockpit.GEO) || null, CY = G ? G.COCKPIT_Y : 0.6;
    var grp = new THREE.Group(), list = [];
    function add(g, m) { list.push([g, m]); }
    var paint = mat('top', L.main), full = mat('full', L.main);
    var xo = 0.94;
    // Sides: one smooth ring per station (rim -> shoulder -> sidepod -> floor), both halves
    [1, -1].forEach(function (sd) {
      var stations = [-0.75, -0.3, 0.1, 0.24, 0.36, 0.44, 0.5];
      var rings = stations.map(function (yc) {
        var shoulder = yc < 0.18 ? xo : yc < 0.44 ? xo - (yc - 0.18) / 0.26 * 0.14 : 0.8 - (yc - 0.44) * 4;
        var k = yc > 0.44 ? Math.max(0.05, 1 - (yc - 0.44) / 0.06) : 1;
        var top = yc > 0.36 ? 0.668 - (yc - 0.36) * 0.4 : 0.668;
        var ctrl = [[0.275, top - 0.002], [0.4, top + 0.004], [0.58, top - 0.012], [shoulder - 0.13, top - 0.04], [shoulder - 0.02, top - 0.1],
          [shoulder, 0.42], [shoulder - 0.02, 0.14], [0.6, 0.1], [0.3, 0.12], [0.26, 0.4]];
        var cx = 0.27;
        ctrl = ctrl.map(function (p) { return [cx + (p[0] - cx) * k, 0.4 + (p[1] - 0.4) * Math.max(k, 0.3)]; });
        return smoothRing(ctrl, 40).map(function (p) { return [sd * p[0], yc + CY, p[1]]; });
      });
      var lf = loftRings(rings, { capStart: true });
      add(lf.geo, paint);
      if (lf.capStart) add(lf.capStart, carbon);
    });
    // Front deck sweeping down into the nose
    var dk = [
      { y: 0.34 + CY, cz: 0.45, hw: 0.335, hh: 0.218, n: 3.2, under: 0.3 },
      { y: 0.7 + CY, cz: 0.4, hw: 0.29, hh: 0.2, n: 3, under: 0.3 },
      { y: 1.15 + CY, cz: 0.33, hw: 0.22, hh: 0.17, n: 2.8, under: 0.28 },
    ].concat(monoKeys(s).filter(function (k) { return k.y > 1.15 + CY + 0.05; }).reverse().reverse());
    dk.sort(function (a, b) { return a.y - b.y; });
    var deck = bodyLoft(dk, { capStart: true, M: 36, steps: 6 });
    add(deck.geo, paint);
    if (deck.capStart) add(deck.capStart, carbon);
    // Tub (dark inside, seen through the opening) and the driver's legs
    var tub = new THREE.BoxGeometry(1.15, 0.46, 0.44);
    tub.translate(-0.19 + CY, 0.445, 0);
    var tubMat = R.tubMat || (R.tubMat = (function () { var m = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.9, side: THREE.BackSide }); R.register(m); return m; })());
    var suit = R.suitMat || (R.suitMat = R.std({ color: new THREE.Color('#252b3a').convertSRGBToLinear(), roughness: 0.85 }, 'suit'));
    add(tub, tubMat);
    [1, -1].forEach(function (sd) {
      add(tube([sd * 0.09, -0.25 + CY, 0.36], [sd * 0.095, 0.34 + CY, 0.31], 0.06, 12), suit);
      var knee = new THREE.SphereGeometry(0.062, 12, 8);
      knee.translate(-0.25 + CY, 0.36, sd * 0.09);
      add(knee, suit);
    });
    // Padded rim round the opening
    var rr = roundPoly([[0.235, -0.8], [0.235, 0.33], [0.14, 0.42], [-0.14, 0.42], [-0.235, 0.33], [-0.235, -0.8]], 0.08, 4);
    var rimCurve = new THREE.CatmullRomCurve3(rr.map(function (p) { return V3(p[0], p[1] + CY, 0.675); }), true);
    add(new THREE.TubeGeometry(rimCurve, 64, 0.04, 10, true), R.rimMat || (R.rimMat = R.std({ color: 0x0b0c0e, roughness: 0.85 }, 'rim')));
    // Surfaces to sit things on (found by casting rays at the real geometry)
    var probeMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    var surf = list.filter(function (e) { return e[1] === paint; }).map(function (e) { var m = new THREE.Mesh(e[0], probeMat); m.updateMatrixWorld(true); return m; });
    function topAt(x, yc, fallback) { var h = surfaceAt(surf, x, yc + CY); return h ? h : { z: fallback, n: new THREE.Vector3(0, 1, 0) }; }
    var det = opts.detail || 0, bolts = [], metal = R.boltMat || (R.boltMat = R.std({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 }, 'bolt'));
    var seamMat = R.seamMat || (R.seamMat = R.std({ color: 0x050506, roughness: 0.7 }, 'seam'));
    var padM = R.padMat || (R.padMat = R.std({ color: new THREE.Color('#1d1f24').convertSRGBToLinear(), roughness: 0.95 }, 'pad'));

    // Halo: hoop from cockpit.js (its top surface -> tube centre), the rear legs
    // carried down onto the shoulders behind the head, and the front stay
    // growing out of the front of the hoop down onto the deck ahead.
    if (G && L.halo) {
      var b = G.HALO_T / 2, a = G.HALO_W / 2;
      var rearZ = topAt(0.38, -0.725, 0.67).z, frontZ = topAt(0, 0.8, 0.58).z;
      var half = G.HALO_CTRL.slice(0, 7).map(function (p) { return [p[0], p[1], p[2] - b]; })
        .concat([[0.372, -0.69, 0.83], [0.378, -0.715, 0.72], [0.38, -0.725, rearZ - 0.025]]);
      var ringPts = half.slice().reverse().map(function (p) { return [-p[0], p[1] + CY, p[2]]; })
        .concat(half.slice(1).map(function (p) { return [p[0], p[1] + CY, p[2]]; }));
      var apexZ = G.HALO_CTRL[0][2] - b;
      var stayPts = [[0, 0.09 + CY, apexZ], [0, 0.17 + CY, apexZ - 0.03], [0, 0.32 + CY, apexZ - 0.12], [0, 0.55 + CY, (apexZ + frontZ) / 2 - 0.05],
        [0, 0.76 + CY, frontZ + 0.03], [0, 0.82 + CY, frontZ - 0.03]];
      var haloMat = mat('full', '#1b1e23'); // titanium, painted
      haloGeometry(ringPts, stayPts, { a: a, b: b, s: 0.024 }).forEach(function (g) { add(g, haloMat); });
      // bolted fittings at the three mounting points
      var nb = det >= 2 ? 4 : 0;
      add(fitting([0, 0.8 + CY, frontZ - 0.012], [0.075, 0.11, 0.026], 0, nb, bolts), haloMat);
      [1, -1].forEach(function (sd) { add(fitting([sd * 0.38, -0.725 + CY, rearZ - 0.012], [0.07, 0.09, 0.026], 0, nb, bolts), haloMat); });
    }
    // Mirror housings (aero pods) on stalks; glass from cockpit.js (2D) or, at
    // the top detail tier, live 3D glass (opts.mirror3d)
    var glass = [];
    if (G) G.MIRRORS.forEach(function (m) {
      var sg = m.side === 'L' ? -1 : 1, c = m.c, yaw = 0.35 * sg;
      var hb = roundedBox(0.075, G.GLASS_H + 0.03, G.GLASS_W + 0.035, 0.03, 3);
      hb.rotateY(yaw);
      var back = V3(c[0], c[1] + CY + 0.012 + 0.037, c[2]);
      hb.translate(back.x, back.y, back.z);
      add(hb, full);
      var foot = topAt(c[0] * 1.08, c[1] + 0.04, c[2] - 0.17).z;
      add(sweep([[c[0], c[1] + CY + 0.03, c[2] - G.GLASS_H / 2], [c[0] * 1.04, c[1] + CY + 0.035, c[2] - 0.1], [c[0] * 1.08, c[1] + CY + 0.04, foot - 0.01]],
        function (t) { return [0.012 + 0.006 * t, 0.012 + 0.004 * t]; }, 10, 8), carbon);
      if (det >= 2) add(fitting([c[0] * 1.08, c[1] + 0.04 + CY, foot - 0.008], [0.04, 0.05, 0.014], 0, 2, bolts), carbon);
      if (opts.mirror3d && R.mirrorTex) {
        var pg = new THREE.PlaneGeometry(G.GLASS_W, G.GLASS_H);
        var u0 = sg < 0 ? 1 : 0.5, u1 = sg < 0 ? 0.5 : 0; // left edge -> right edge (flipped like a mirror)
        var uvA = pg.attributes.uv;
        for (var i = 0; i < uvA.count; i++) uvA.setX(i, uvA.getX(i) < 0.5 ? u0 : u1);
        var ux = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), nrm = new THREE.Vector3().crossVectors(ux, UPV);
        pg.applyMatrix4(new THREE.Matrix4().makeBasis(ux, UPV, nrm).setPosition(V3(c[0], c[1] + CY - 0.002, c[2])));
        var gm2 = R.mirrorGlassMat || (R.mirrorGlassMat = (function () { var mm = new THREE.MeshBasicMaterial({ map: R.mirrorTex, color: 0xd8dde4, toneMapped: false }); R.register(mm); return mm; })());
        var gl = new THREE.Mesh(pg, gm2);
        glass.push(gl);
      }
    });
    // Detail tiers: 1 = pads + panel seams; 2 = + fasteners, bolts, switch panel, safety stickers
    if (det >= 1) {
      [1, -1].forEach(function (sd) {
        var pd = det >= 2 ? roundedBox(0.98, 0.11, 0.03, 0.012, 2) : new THREE.BoxGeometry(0.98, 0.11, 0.03);
        pd.translate(-0.21 + CY, 0.6, sd * 0.207);
        add(pd, padM);
      });
      var seams = [];
      // across the deck where the nose panel meets it
      var row = [];
      for (var sx = -0.2; sx <= 0.2001; sx += 0.025) { var hh = topAt(sx, 1.0, 0.52); row.push([sx, 1.0 + CY, hh.z + 0.002]); }
      seams.push(row);
      // along both shoulders
      [1, -1].forEach(function (sd) {
        var line = [];
        for (var sy = -0.7; sy <= 0.3001; sy += 0.05) { var h2 = topAt(sd * 0.62, sy, 0.66); line.push([sd * 0.62, sy + CY, h2.z + 0.002]); }
        seams.push(line);
      });
      seams.forEach(function (ln) {
        add(sweep(ln, function () { return [0.0028, 0.0016]; }, ln.length * 2, 4), seamMat);
        if (det >= 2) for (var f = 1; f < ln.length - 1; f += 2) {
          var fg = new THREE.CylinderGeometry(0.0055, 0.0055, 0.0025, 10);
          var fp = V3(ln[f][0], ln[f][1], ln[f][2] + 0.0005);
          fg.translate(fp.x, fp.y, fp.z);
          bolts.push(fg);
        }
      });
    }
    if (det >= 2) {
      // switch panel on the left shoulder by the rim (isolator, ignition, drink)
      var sp0 = topAt(-0.34, 0.27, 0.66);
      var plate = roundedBox(0.05, 0.007, 0.075, 0.003, 1);
      var pc = V3(-0.34, 0.27 + CY, sp0.z + 0.004);
      plate.translate(pc.x, pc.y, pc.z);
      add(plate, R.intakeMat || (R.intakeMat = R.std({ color: 0x050506, roughness: 0.9 }, 'intake')));
      [[-0.362, 0.258], [-0.34, 0.258], [-0.318, 0.258]].forEach(function (q) {
        var tg = new THREE.CylinderGeometry(0.0022, 0.0026, 0.014, 6);
        tg.rotateX(0.35);
        var tp = V3(q[0], q[1] + CY, sp0.z + 0.013);
        tg.translate(tp.x, tp.y, tp.z);
        bolts.push(tg);
      });
      var btn = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 12), bp = V3(-0.34, 0.288 + CY, sp0.z + 0.009);
      btn.translate(bp.x, bp.y, bp.z);
      add(btn, R.btnMat || (R.btnMat = R.std({ color: 0xc8102e, roughness: 0.4, emissive: 0x200000 }, 'button')));
      // safety markings on the shoulders
      [['E', 0.46], ['F', -0.5]].forEach(function (st) {
        var yy = st[0] === 'E' ? 0.3 : 0.05;
        var h3 = topAt(st[1], yy, 0.65), sg2 = new THREE.PlaneGeometry(0.075, 0.075);
        sg2.rotateX(-Math.PI / 2); sg2.rotateY(-Math.PI / 2);
        var sp = V3(st[1], yy + CY, h3.z + 0.003);
        sg2.translate(sp.x, sp.y, sp.z);
        add(sg2, stickerTex(R, st[0]));
      });
    }
    if (bolts.length) add(mergeAll(bolts), metal);
    probeMat.dispose();
    grp.userData.glass = glass;
    glass.forEach(function (g) { grp.add(g); });
    var gm = {};
    list.forEach(function (e) { if (!e[0]) return; var k = e[1].uuid; (gm[k] = gm[k] || { mat: e[1], list: [] }).list.push(e[0]); });
    Object.keys(gm).forEach(function (k) { var m = new THREE.Mesh(mergeAll(gm[k].list), gm[k].mat); m.receiveShadow = true; m.castShadow = false; grp.add(m); });
    return grp;
  }

  // --- Crash: charred car, wings and two wheels fly off --------------------------------------------
  C.detach = function (car, scene, carState) {
    if (car.wrecked) return;
    if (car.dmgFly) restoreDamage(car);
    car.wrecked = true;
    car.group.updateMatrixWorld(true);
    var parts = [car.frontWing, car.rearWing, car.wheels[0].pivot, car.wheels[3] ? car.wheels[3].pivot : car.wheels[1].pivot];
    car.flying = parts.map(function (o, i) {
      var rec = { obj: o, parent: o.parent, pos: o.position.clone(), quat: o.quaternion.clone() };
      scene.attach(o);
      var ang = carState.heading + (Math.random() - 0.5) * 2.4, sp2 = 6 + Math.random() * 8;
      rec.v = new THREE.Vector3(carState.vx * 0.5 + Math.cos(ang) * sp2, 4 + Math.random() * 5 + (i > 1 ? 2 : 0), -(carState.vy * 0.5 + Math.sin(ang) * sp2));
      rec.w = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
      rec.wheel = i > 1;
      return rec;
    });
  };
  C.reattach = function (car) {
    if (!car.wrecked) return;
    car.wrecked = false;
    (car.flying || []).forEach(function (r) {
      r.parent.add(r.obj);
      r.obj.position.copy(r.pos);
      r.obj.quaternion.copy(r.quat);
    });
    car.flying = null;
  };
  // --- 리얼리스틱 damage (real-damage.js): bent / hanging / torn-off wings,
  // broken suspension (the wheel leans in and drops), parts that fly off.
  C.damage = function (car, D, scene, st, dt) {
    var on = CR.Config.REAL && CR.Real && CR.Real.on && D.any() && !st.exploded;
    if (!on) { if (car.dmgOn) restoreDamage(car); return; }
    car.dmgOn = true;
    var s = D.st;
    function base(o) { if (!o.userData.dmgBase) o.userData.dmgBase = { p: o.position.clone(), r: o.rotation.clone(), parent: o.parent }; return o.userData.dmgBase; }
    function wing(o, amount, gone, sign) {
      if (!o) return;
      var b = base(o);
      if (gone && !o.userData.dmgGone) {
        o.userData.dmgGone = true;
        car.group.updateMatrixWorld(true);
        scene.attach(o);
        var a = st.heading + Math.PI * (sign > 0 ? 0 : 1) + (Math.random() - 0.5) * 1.6, sp = 4 + Math.random() * 5;
        (car.dmgFly = car.dmgFly || []).push({ obj: o, v: new THREE.Vector3(st.vx * 0.6 + Math.cos(a) * sp, 2.5 + Math.random() * 3, -(st.vy * 0.6 + Math.sin(a) * sp)),
          w: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10) });
      } else if (!o.userData.dmgGone) {
        var hang = amount >= 0.55;
        o.position.copy(b.p); o.position.y -= hang ? 0.07 : amount * 0.06;
        o.rotation.set(b.r.x + (hang ? 0.2 : amount * 0.25), b.r.y, b.r.z + sign * (hang ? 0.12 : 0.03));
      }
    }
    wing(car.frontWing, s.fw, s.fw >= 1, 1);
    wing(car.rearWing, s.rw, s.rw >= 1, -1);
    car.wheels.forEach(function (wh) {
      var b = base(wh.pivot), left = b.p.z < 0, front = wh.front;
      var broken = front ? (left ? s.fl : s.fr) : (left ? s.rl : s.rr);
      if (!broken) return;
      wh.pivot.position.y = b.p.y - 0.07;
      wh.pivot.rotation.x = (left ? -1 : 1) * 0.38; // top of the wheel leans in
      if (front) wh.pivot.rotation.y += (left ? 1 : -1) * 0.18;
    });
    (car.dmgFly || []).forEach(function (r) {
      if (!(dt > 0)) return;
      r.v.y -= 9.8 * dt;
      r.obj.position.addScaledVector(r.v, dt);
      if (r.obj.position.y < 0.05) { r.obj.position.y = 0.05; r.v.multiplyScalar(0.55); r.v.y = Math.abs(r.v.y) * 0.3; r.w.multiplyScalar(0.6); }
      tmpE.set(r.w.x * dt, r.w.y * dt, r.w.z * dt);
      r.obj.quaternion.multiply(tmpQ.setFromEuler(tmpE));
    });
  };
  function restoreDamage(car) {
    car.dmgOn = false;
    var objs = [car.frontWing, car.rearWing].concat(car.wheels.map(function (w) { return w.pivot; }));
    objs.forEach(function (o) {
      if (!o || !o.userData.dmgBase) return;
      var b = o.userData.dmgBase;
      if (o.userData.dmgGone) { b.parent.add(o); o.userData.dmgGone = false; }
      o.position.copy(b.p); o.rotation.copy(b.r);
    });
    car.dmgFly = null;
  }

  var tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  C.updateWreck = function (car, dt) {
    if (!car.flying || !(dt > 0)) return;
    car.flying.forEach(function (r) {
      r.v.y -= 9.8 * dt;
      r.obj.position.addScaledVector(r.v, dt);
      var ground = r.wheel ? 0.32 : 0.06;
      if (r.obj.position.y < ground) {
        r.obj.position.y = ground;
        if (r.v.y < 0) r.v.y = -r.v.y * 0.35;
        r.v.x *= 0.7; r.v.z *= 0.7; r.w.multiplyScalar(0.6);
        if (Math.abs(r.v.y) < 0.6) r.v.y = 0;
      }
      tmpE.set(r.w.x * dt, r.w.y * dt, r.w.z * dt);
      r.obj.quaternion.multiply(tmpQ.setFromEuler(tmpE));
    });
  };

  // Per frame: pose, wheels, brake light, char, cockpit / LOD visibility.
  C.update = function (car, st, opts) {
    var g = car.group;
    g.position.set(st.x, 0, -st.y);
    g.rotation.y = st.heading;
    // gentle, smoothed pitch under braking / acceleration (no high-frequency motion)
    var lon = opts.lon || 0;
    car.body.rotation.z = Math.max(-0.012, Math.min(0.012, lon * 0.0006));
    car.body.rotation.x = 0;
    var dist = st.wheelDist || 0, speed = Math.abs(st.forwardSpeed || 0);
    var near = opts.camDist < 70;
    for (var i = 0; i < car.wheels.length; i++) {
      var w = car.wheels[i];
      if (car.wrecked && car.flying && car.flying.some(function (r) { return r.obj === w.pivot; })) continue;
      w.spin.rotation.z = -dist / w.r;
      if (w.front) w.pivot.rotation.y = st.wheelSteer || 0;
      var omega = speed / w.r, blur = Math.max(0, Math.min(1, (omega - 10) / 24));
      w.blurMat.opacity = blur;
      for (var k = 0; k < w.blur.length; k++) w.blur[k].visible = near && blur > 0.02;
      for (var k2 = 0; k2 < w.sharp.length; k2++) w.sharp[k2].visible = near || opts.camDist < 140;
    }
    // kerbs (kerb.js): each wheel rides up the hump and over the ridges
    if (CR.Kerb && opts.camDist < 140) {
      var wi = st.nearestSampleIndex !== undefined ? st.nearestSampleIndex : st.idx;
      var kw = CR.Kerb.wheels(st.x, st.y, st.heading, wi || 0, dist, car.kerbH || (car.kerbH = [0, 0, 0, 0]));
      var lift = (kw[0] + kw[1] + kw[2] + kw[3]) / 4;
      g.position.y = lift;
      car.body.rotation.x = ((kw[0] + kw[2]) - (kw[1] + kw[3])) / 2 / 1.6;
      car.body.rotation.z += ((kw[0] + kw[1]) - (kw[2] + kw[3])) / 2 / 2.7;
    } else { g.position.y = 0; car.body.rotation.x = 0; }
    // driver: hands on the turning wheel, head pushed by the cornering forces (close cars only)
    if (car.driver && opts.camDist < 90 && !opts.cockpit) {
      var now = performance.now(), ddt = car.drvT ? Math.min(0.1, (now - car.drvT) / 1000) : 0;
      var dh = car.drvH === undefined ? 0 : Math.atan2(Math.sin(st.heading - car.drvH), Math.cos(st.heading - car.drvH));
      car.drvT = now; car.drvH = st.heading;
      car.driver.update({ steer: Math.max(-1.3, Math.min(1.3, (st.wheelSteer || 0) * 3.2)), lat: ddt > 0 ? dh / ddt * speed : 0, dt: ddt });
    }
    car.brakeMat.emissiveIntensity = st.exploded ? 0 : 0.5 + (opts.brake || 0) * 9;
    if (car.lightbar) { // safety car: amber lights alternate, green on while it leads the field
      var ph = Math.floor(performance.now() / 260) % 2;
      car.lightbar[0].emissiveIntensity = ph ? 5 : 0.3;
      car.lightbar[1].emissiveIntensity = ph ? 0.3 : 5;
      car.lightbar[2].emissiveIntensity = CR.Real && CR.Real.scEnding ? 0.3 : 3;
    }
    car.char.value = st.exploded ? 1 : 0;
    var hide = !!opts.cockpit;
    if (hide !== car.hidden) {
      car.hidden = hide;
      for (var h = 0; h < car.cockpitHidden.length; h++) car.cockpitHidden[h].visible = !hide;
      if (car.cockpit) car.cockpit.visible = hide;
    }
  };
})();

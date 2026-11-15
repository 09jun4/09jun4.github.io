// hi-pit.js — 리얼리스틱 pit lane for the 높음 renderer: lane surface, lines
// and painted team boxes, the garage block with one open bay per team, and
// the pit crews: 17 people per stop (4 wheel teams of gun / off / on, front
// and rear jack, two stabilisers, the release man) who walk out as their car
// comes in, jack it up, swap all four wheels (the old ones slide off, new
// ones in the compound's colour go on) and drop it for the release.
// Only built when the track samples carry s.pit (real/real-pit.js).
// Load order: after hi-track.js. Depends on: THREE, CR.Hi, Track, RealPit, Race.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var PIT = Hi.Pit = {};
  var T = function () { return Hi.Track; };

  var MAX_CREWS = 4, PER = 17;

  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function vec(s, o, h) { return new THREE.Vector3(s.x + s.nx * o, h, -(s.y + s.ny * o)); }

  // Static scenery + crew instancing. S: samples, D: cumulative, group: track group.
  PIT.build = function (R, S, D, group) {
    var P = CR.RealPit, n = S.length, sd = P.side, Tr = T();
    var out = { crews: [], used: {} };
    var inPit = function (i) { return !!S[i].pit && !!S[(i + 1) % n].pit; };
    var lim = function (i) { return inPit(i) && S[i].pit.lim && S[(i + 1) % n].pit.lim; };
    var pitRuns = Tr.runs(n, inPit), limRuns = Tr.runs(n, lim);

    // lane surface
    var asphalt = R.std({ map: R.texAsphalt.map, normalMap: R.texAsphalt.normal, roughness: 0.92, metalness: 0, color: 0x8d9097, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.3,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, 'pitlane');
    var lanes = [];
    pitRuns.forEach(function (run) {
      lanes.push(Tr.strip(S, D, function (i) {
        var p = S[i].pit, a = [sd * p.lane0, 0.006], b = [sd * p.lane1, 0.006];
        return sd > 0 ? [a, b] : [b, a];
      }, { from: run.from, count: run.count, flip: true, vScale: 12 }));
    });
    var lg = Tr.merge(lanes);
    if (lg) group.add(Tr.mesh(R, lg, asphalt, { order: 1 }));
    // divider (fast / working lane) and the limiter lines
    var paint = R.std({ color: 0xf2f2f0, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }, 'pitline');
    var marks = [];
    limRuns.forEach(function (run) {
      marks.push(Tr.strip(S, D, function () { var m = P.lane + sd * 1.6, a = [m, 0.01], b = [m + sd * 0.15, 0.01]; return sd > 0 ? [a, b] : [b, a]; }, { from: run.from, count: run.count, flip: true }));
    });
    var mg = Tr.merge(marks);
    if (mg) group.add(Tr.mesh(R, mg, paint, { order: 2 }));
    // limiter start / end lines across the lane
    var ctx = CR.Race._ctx();
    [-P.ENTRY + P.RAMP_IN, P.EXIT - P.RAMP_OUT].forEach(function (rel) {
      var i = ctx.indexAt(ctx.wrapDist(rel), 0), s = S[i], p = s.pit;
      if (!p) return;
      var g = new THREE.PlaneGeometry(1, 0.5);
      var m = new THREE.Mesh(g, paint);
      var a = vec(s, sd * p.lane0, 0.012), b = vec(s, sd * p.lane1, 0.012);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.x = a.distanceTo(b);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = s.heading + Math.PI / 2;
      m.renderOrder = 2;
      group.add(m);
    });

    // garage block: front face, roof, back
    var concrete = R.std({ map: R.texConcrete, color: 0xc9cdd3, roughness: 0.8, metalness: 0.05 }, 'garage');
    var roofMat = R.std({ color: 0x6b717a, roughness: 0.7, metalness: 0.3 }, 'garageRoof');
    var H = 5.6, blocks = [], roofs = [];
    limRuns.forEach(function (run) {
      blocks.push(Tr.strip(S, D, function () {
        var p = [[sd * P.garage, 0], [sd * P.garage, H], [sd * P.back, H], [sd * P.back, 0]];
        return sd > 0 ? p : p.map(function (q) { return [q[0], q[1]]; });
      }, { from: run.from, count: run.count, uv: 'world', uScale: 3, vScale: 3, flip: sd < 0, gap: function (k) { return k === 1; } }));
      roofs.push(Tr.strip(S, D, function () {
        var a = [sd * (P.garage - 1.2), H + 0.25], b = [sd * P.back, H + 0.25];
        return sd > 0 ? [a, b] : [b, a];
      }, { from: run.from, count: run.count, flip: true }));
    });
    var bg = Tr.merge(blocks);
    if (bg) { var bm = Tr.mesh(R, bg, concrete, { cast: true }); bm.material.side = THREE.DoubleSide; group.add(bm); }
    var rg = Tr.merge(roofs);
    if (rg) { var rm = Tr.mesh(R, rg, roofMat, { cast: true }); rm.material.side = THREE.DoubleSide; group.add(rm); }

    // team bays: dark opening, colour band, painted box on the lane
    var dark = R.std({ color: lin('#121418'), roughness: 0.9, metalness: 0, envMapIntensity: 0.1 }, 'bay');
    P.garages.forEach(function (gar) {
      var s0 = S[gar.i0], s1 = S[gar.i1];
      var o = sd * (P.garage - 0.03);
      var quad = function (oa, z0, z1, mat, order) {
        var a = vec(s0, oa, z0), b = vec(s1, oa, z0), c = vec(s1, oa, z1), d = vec(s0, oa, z1);
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
        g.computeVertexNormals();
        var m = new THREE.Mesh(g, mat);
        m.material.side = THREE.DoubleSide;
        if (order) m.renderOrder = order;
        group.add(m);
      };
      quad(o, 0, 4.0, dark);
      var band = R.std({ color: lin(gar.color), roughness: 0.45, metalness: 0.2, emissive: lin(gar.color), emissiveIntensity: 0.15 }, 'band');
      quad(sd * (P.garage - 0.05), 4.2, 5.35, band);
      // painted box on the working lane
      var boxMat = R.std({ color: lin(gar.color), roughness: 0.6, metalness: 0, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }, 'boxpaint');
      var w0 = sd * (P.garage - 4.4), w1 = sd * (P.garage - 0.4);
      var a = vec(s0, w0, 0.014), b = vec(s1, w0, 0.014), c = vec(s1, w1, 0.014), d = vec(s0, w1, 0.014);
      var g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z], 3));
      g2.computeVertexNormals();
      var bmesh = new THREE.Mesh(g2, boxMat);
      bmesh.material.side = THREE.DoubleSide;
      bmesh.renderOrder = 3;
      group.add(bmesh);
    });

    // pit entry / exit markings and signs
    buildSigns(R, S, group, paint);
    // overhead gantry over every box (boom from the garage with lamps and the release light)
    var steel = R.std({ color: lin('#2a2e35'), roughness: 0.5, metalness: 0.7, envMapIntensity: 0.4 }, 'gantry');
    var lampMat = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xfff6e8, emissiveIntensity: 1.6, roughness: 0.3 });
    R.register(lampMat);
    out.relLights = {};
    P.garages.forEach(function (gar) {
      var i = ctx.indexAt(ctx.wrapDist(gar.rel), 0), s = S[i];
      var parts = [], lamps = [];
      var o0 = sd * (P.garage - 0.1), o1 = sd * (P.work - sd * 0 - 1.6 * sd * sd);
      o1 = sd * (Math.abs(P.work) - 2.2);
      var a = vec(s, o0, 4.3), b = vec(s, o1, 4.3), len = a.distanceTo(b);
      [-1.1, 1.1].forEach(function (f) {
        var g = new THREE.BoxGeometry(len, 0.14, 0.14);
        var m = new THREE.Mesh(g, steel);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.position.x += Math.cos(s.heading) * f; m.position.z -= Math.sin(s.heading) * f;
        m.rotation.y = s.heading + Math.PI / 2;
        m.castShadow = true;
        group.add(m);
      });
      var cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), steel);
      cross.position.copy(b); cross.rotation.y = s.heading + Math.PI / 2; group.add(cross);
      for (var k = 0; k < 2; k++) {
        var lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), lampMat);
        var t = (k + 1) / 3;
        lb.position.lerpVectors(a, b, t); lb.position.y = 4.12;
        group.add(lb);
      }
      // release light at the end of the boom (red / green)
      var rl = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2020, emissiveIntensity: 2.5, roughness: 0.3 });
      R.register(rl);
      var light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.12), rl);
      light.position.copy(b); light.position.y = 3.95; light.rotation.y = s.heading;
      group.add(light);
      out.relLights[gar.team] = rl;
    });

    // crew (MAX_CREWS stops at once): two poses (standing / kneeling), each as
    // instanced suit (team colour), trim (second colour), dark (boots, gloves,
    // visor, belt) and helmet; plus tyres, wheel guns and jacks.
    var N = MAX_CREWS * PER;
    var suit = R.std({ color: 0xffffff, roughness: 0.78, metalness: 0, envMapIntensity: 0.25 }, 'crew');
    var trim = R.std({ color: 0xffffff, roughness: 0.7, metalness: 0, envMapIntensity: 0.25 }, 'crewTrim');
    var dk = R.std({ color: lin('#121317'), roughness: 0.8, metalness: 0, envMapIntensity: 0.2 }, 'crewDark');
    var hel = R.std({ color: 0xffffff, roughness: 0.22, metalness: 0.15, envMapIntensity: 0.7 }, 'crewHelmet');
    var tyreMat = R.std({ color: lin('#141518'), roughness: 0.9, metalness: 0, envMapIntensity: 0.15 }, 'crewTyre');
    var bandMat = R.std({ color: 0xffffff, roughness: 0.5, metalness: 0, envMapIntensity: 0.3 }, 'crewTyreBand');
    var toolMat = R.std({ color: lin('#2b2f36'), roughness: 0.4, metalness: 0.8, envMapIntensity: 0.6 }, 'crewTool');
    var F = figureGeos();
    function inst(geo, mat, count, colors) {
      var m = new THREE.InstancedMesh(geo, mat, count);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      if (colors) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      group.add(m);
      return m;
    }
    out.pose = ['stand', 'kneel'].map(function (k) {
      var f = F[k];
      return { suit: inst(f.suit, suit, N, true), trim: inst(f.trim, trim, N, true), dark: inst(f.dark, dk, N, false), helmet: inst(f.helmet, hel, N, true) };
    });
    out.tyres = inst(F.tyre, tyreMat, MAX_CREWS * 8, false);
    out.bands = inst(F.band, bandMat, MAX_CREWS * 8, true);
    out.guns = inst(F.gun, toolMat, MAX_CREWS * 4, false);
    out.jacks = inst(F.jack, toolMat, MAX_CREWS * 2, false);
    out.dummy = new THREE.Object3D();
    out.color = new THREE.Color();
    return out;
  };

  // --- Pit entry / exit markings ---------------------------------------------------------
  function textTex(lines, bg, fg, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(function (l) { g.font = l.font; g.fillText(l.text, w / 2, l.y * h); });
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function buildSigns(R, S, group, paint) {
    var P = CR.RealPit, sd = P.side, ctx = CR.Race._ctx(), hw = CR.Config.TRACK_WIDTH / 2;
    var yellow = R.std({ color: lin('#ffd23f'), roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }, 'pitYellow');
    // solid yellow line along the track edge where the entry / exit lanes run beside it
    var Tr = T(), n = S.length, lines = [];
    [[-P.ENTRY, -P.ENTRY + P.RAMP_IN + 20], [P.EXIT - P.RAMP_OUT - 20, P.EXIT]].forEach(function (r) {
      var i0 = ctx.indexAt(ctx.wrapDist(r[0]), 0), i1 = ctx.indexAt(ctx.wrapDist(r[1]), 0);
      var count = (i1 - i0 + n) % n;
      if (count < 2) return;
      lines.push(Tr.strip(S, T().cumulative(S), function () { var a = [sd * (hw + 0.45), 0.012], b = [sd * (hw + 0.75), 0.012]; return sd > 0 ? [a, b] : [b, a]; }, { from: i0, count: count, flip: true }));
    });
    var lg = Tr.merge(lines);
    if (lg) group.add(Tr.mesh(R, lg, yellow, { order: 2 }));
    // painted PIT IN / PIT OUT and 80 on the lane
    var words = [['PIT IN', -P.ENTRY + 55], ['PIT OUT', P.EXIT - 50], ['80', -P.ENTRY + P.RAMP_IN + 12], ['80', P.EXIT - P.RAMP_OUT - 12]];
    words.forEach(function (wd) {
      var i = ctx.indexAt(ctx.wrapDist(wd[1]), 0), s = S[i], p = s.pit;
      if (!p) return;
      var tex = textTex([{ text: wd[0], font: '900 150px Arial Black, Arial, sans-serif', y: 0.52 }], null, '#f4f4f0', 512, 200);
      R.textures.push(tex);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(wd[0] === '80' ? 3 : 7, 2.6), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
      R.register(m.material);
      var off = sd * ((p.lane0 + p.lane1) / 2);
      m.position.set(s.x + s.nx * off, 0.016, -(s.y + s.ny * off));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = s.heading - Math.PI / 2; // text reads along the driving direction
      m.renderOrder = 3;
      group.add(m);
    });
    // signboards: big PIT arrow board at the entry, 80 km/h boards at the limiter lines
    var boards = [[-P.ENTRY - 60, 'PIT', true], [-P.ENTRY - 15, 'PIT', true], [-P.ENTRY + P.RAMP_IN, '80', false], [P.EXIT - P.RAMP_OUT, 'END', false]];
    var post = R.std({ color: lin('#3a3f47'), roughness: 0.5, metalness: 0.6 }, 'signPost');
    boards.forEach(function (bd) {
      var i = ctx.indexAt(ctx.wrapDist(bd[0]), 0), s = S[i];
      var wall = sd > 0 ? s.wallLeft : s.wallRight;
      var off = sd * (bd[2] ? Math.max(hw + 3, Math.min(wall - 0.5, hw + 6)) : Math.abs(s.pit ? P.inner || hw + 5 : hw + 5));
      var tex = bd[1] === 'PIT'
        ? textTex([{ text: 'PIT', font: '900 120px Arial Black, Arial, sans-serif', y: 0.36 }, { text: sd > 0 ? '◀ ◀ ◀' : '▶ ▶ ▶', font: '900 80px Arial, sans-serif', y: 0.78 }], '#ffd23f', '#111111', 256, 256)
        : bd[1] === '80'
          ? textTex([{ text: '80', font: '900 120px Arial Black, Arial, sans-serif', y: 0.5 }], '#f4f4f4', '#111111', 256, 256)
          : textTex([{ text: 'END', font: '900 70px Arial Black, Arial, sans-serif', y: 0.38 }, { text: '80', font: '900 80px Arial Black, Arial, sans-serif', y: 0.72 }], '#f4f4f4', '#555555', 256, 256);
      R.textures.push(tex);
      var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
      R.register(mat);
      var size = bd[2] ? 2.2 : 1.1, h = bd[2] ? 2.2 : 1.6;
      var x = s.x + s.nx * off, y = s.y + s.ny * off;
      // thin along the driving direction: the big faces look at the oncoming cars
      var board = new THREE.Mesh(new THREE.BoxGeometry(0.08, size, size), [mat, mat, post, post, post, post]);
      board.position.set(x, h + size / 2, -y);
      board.rotation.y = s.heading;
      board.castShadow = true;
      group.add(board);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 8), post);
      pole.position.set(x, h / 2, -y);
      group.add(pole);
      if (bd[1] === 'PIT') { // a ring of red / white on the pole top for night visibility
        var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0x402000, emissive: 0xffb020, emissiveIntensity: 2 }));
        R.register(lamp.material);
        lamp.position.set(x, h + size + 0.18, -y);
        group.add(lamp);
      }
    });
  }

  function mergeGeos(list) {
    var pos = [], nor = [], idx = [], base = 0;
    list.forEach(function (g) {
      var p = g.attributes.position, nn = g.attributes.normal;
      for (var i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); }
      if (g.index) for (var k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + base);
      base += p.count;
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  // Crew figures (1.78 m, facing +z). Rounded limbs (capsule-like cylinders),
  // race suit with shoulder / side panels in the second team colour, belt,
  // gloves and boots, full-face helmet with a dark visor (like the pit crews
  // in the reference photos). Kneeling pose: one knee down, leaning forward,
  // hands low in front (wheel gun).
  function limb(r0, r1, a, b) {
    // cylinder from point a to b (arrays x, y, z)
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    var g = new THREE.CylinderGeometry(r1, r0, L, 8);
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return g;
  }
  function ball(r, p) { var g = new THREE.SphereGeometry(r, 8, 6); g.translate(p[0], p[1], p[2]); return g; }
  function boxAt(w, h, d, p, rx) { var g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(p[0], p[1], p[2]); return g; }
  function figure(j) {
    // j: joints {hip, chest, neck, head, shL, shR, elL, elR, haL, haR, hipL, hipR, knL, knR, anL, anR, lean}
    var suit = [], trim = [], dark = [], helmet = [];
    var torso = new THREE.CylinderGeometry(0.2, 0.165, 0.56, 12);
    torso.translate(0, 0.28, 0);
    torso.rotateX(j.lean);
    torso.translate(j.hip[0], j.hip[1] + 0.06, j.hip[2]);
    suit.push(torso);
    // side panels / shoulder yoke in the second colour
    var yoke = new THREE.CylinderGeometry(0.205, 0.2, 0.14, 12, 1, true);
    yoke.translate(0, 0.48, 0); yoke.rotateX(j.lean); yoke.translate(j.hip[0], j.hip[1] + 0.06, j.hip[2]);
    trim.push(yoke);
    var band = new THREE.CylinderGeometry(0.168, 0.17, 0.07, 12, 1, true);
    band.translate(j.hip[0], j.hip[1] + 0.06, j.hip[2]);
    dark.push(band); // belt
    suit.push(ball(0.17, [j.hip[0], j.hip[1], j.hip[2]]));
    ['L', 'R'].forEach(function (k) {
      var sh = j['sh' + k], el = j['el' + k], ha = j['ha' + k], hp = j['hip' + k], kn = j['kn' + k], an = j['an' + k];
      suit.push(limb(0.06, 0.055, sh, el), limb(0.052, 0.045, el, ha), ball(0.065, sh));
      trim.push(limb(0.062, 0.058, sh, [sh[0] + (el[0] - sh[0]) * 0.35, sh[1] + (el[1] - sh[1]) * 0.35, sh[2] + (el[2] - sh[2]) * 0.35]));
      dark.push(ball(0.055, ha)); // gloves
      suit.push(limb(0.085, 0.07, hp, kn), limb(0.07, 0.055, kn, an), ball(0.075, kn));
      trim.push(limb(0.072, 0.06, [kn[0] + (an[0] - kn[0]) * 0.55, kn[1] + (an[1] - kn[1]) * 0.55, kn[2] + (an[2] - kn[2]) * 0.55], an));
      dark.push(boxAt(0.12, 0.09, 0.27, [an[0], an[1] - 0.02, an[2] + 0.06], j.footRx || 0));
    });
    var hg = new THREE.SphereGeometry(0.165, 16, 12);
    hg.scale(1, 1.1, 1.12);
    hg.translate(j.head[0], j.head[1], j.head[2]);
    helmet.push(hg);
    var visor = new THREE.SphereGeometry(0.168, 14, 6, Math.PI / 2 - 0.9, 1.8, 1.15, 0.5);
    visor.rotateY(Math.PI / 2 * 0); visor.scale(1.01, 1.1, 1.14);
    visor.translate(j.head[0], j.head[1], j.head[2]);
    dark.push(visor);
    dark.push(limb(0.07, 0.07, j.neck, [j.head[0], j.head[1] - 0.12, j.head[2]]));
    return { suit: mergeGeos(suit), trim: mergeGeos(trim), dark: mergeGeos(dark), helmet: mergeGeos(helmet) };
  }
  function figureGeos() {
    var stand = figure({ lean: 0.04, hip: [0, 0.92, 0], neck: [0, 1.52, 0.02], head: [0, 1.68, 0.03],
      shL: [0.22, 1.42, 0.02], shR: [-0.22, 1.42, 0.02], elL: [0.27, 1.15, 0.1], elR: [-0.27, 1.15, 0.1], haL: [0.2, 0.98, 0.26], haR: [-0.2, 0.98, 0.26],
      hipL: [0.1, 0.9, 0], hipR: [-0.1, 0.9, 0], knL: [0.11, 0.48, 0.03], knR: [-0.11, 0.48, 0.03], anL: [0.11, 0.08, 0], anR: [-0.11, 0.08, 0] });
    var kneel = figure({ lean: 0.55, hip: [0, 0.55, -0.12], neck: [0, 1.05, 0.2], head: [0, 1.2, 0.27],
      shL: [0.22, 0.98, 0.17], shR: [-0.22, 0.98, 0.17], elL: [0.25, 0.72, 0.35], elR: [-0.25, 0.72, 0.35], haL: [0.12, 0.58, 0.55], haR: [-0.12, 0.58, 0.55],
      hipL: [0.11, 0.53, -0.1], hipR: [-0.11, 0.53, -0.1], knL: [0.12, 0.5, 0.35], knR: [-0.12, 0.08, -0.05], anL: [0.12, 0.08, 0.32], anR: [-0.12, 0.08, -0.48], footRx: 0 });
    var tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.36, 18); tyre.rotateX(Math.PI / 2);
    var band = new THREE.TorusGeometry(0.33, 0.025, 6, 24); band.translate(0, 0, 0.181);
    // wheel gun in the kneeling man's hands, hose to the gantry side
    var gun = mergeGeos([limb(0.05, 0.05, [0, 0.6, 0.5], [0, 0.6, 0.85]), boxAt(0.1, 0.18, 0.12, [0, 0.52, 0.55]), limb(0.025, 0.025, [0, 0.45, 0.5], [0, 0.4, 0.1])]);
    // front / rear jack: a long bar with a cradle at the far end, held at hip height
    var jack = mergeGeos([limb(0.035, 0.035, [0, 0.95, 0.25], [0, 0.25, 1.75]), boxAt(0.6, 0.1, 0.12, [0, 0.22, 1.8]), boxAt(0.3, 0.08, 0.3, [0, 0.95, 0.2])]);
    return { stand: stand, kneel: kneel, tyre: tyre, band: band, gun: gun, jack: jack };
  }

  // Crew positions (car-local: x right, y forward, metres) for the four wheel
  // corners, the jacks, stabilisers and release man.
  var WX = 0.82, WF = 1.72, WR = -1.62;
  function layout() {
    var L = [];
    [[WX, WF], [-WX, WF], [WX, WR], [-WX, WR]].forEach(function (w) {
      var sx = w[0] > 0 ? 1 : -1;
      L.push({ role: 'gun', corner: w, x: w[0] + sx * 0.62, y: w[1] });
      L.push({ role: 'off', corner: w, x: w[0] + sx * 0.55, y: w[1] - 0.6 });
      L.push({ role: 'on', corner: w, x: w[0] + sx * 1.4, y: w[1] + 0.6 });
    });
    L.push({ role: 'jackF', x: 0, y: 4.1 });
    L.push({ role: 'jackR', x: 0, y: -3.9 });
    L.push({ role: 'stab', x: 1.2, y: 0.25 });
    L.push({ role: 'stab', x: -1.2, y: 0.25 });
    L.push({ role: 'rel', x: 0, y: 5.4 });
    return L;
  }
  var LAYOUT = null;

  // Active stops this frame: player + AI cars in their pit run near their box.
  function stops(R) {
    var list = [], P = CR.RealPit;
    var pp = P.player, c = CR.Car.state;
    if (pp && c.inPit && pp.box !== null && pp.rel - pp.box < 60 && pp.box - pp.rel < 70) list.push({ key: 'you', run: pp, team: 'you', car: R.playerCar, tyre: pp.tyre });
    var ai = CR.Race.ai;
    for (var i = 0; i < ai.length && list.length < MAX_CREWS; i++) {
      var a = ai[i], run = a.rt && a.rt.pit;
      if (!run || run.box === null || run.rel - run.box > 60 || run.box - run.rel > 70) continue;
      if (Math.hypot(a.x - c.x, a.y - c.y) > 260) continue;
      var obj = R.carCache && R.carFor(a.model, a.driver && (Hi.Car.NUMBERS[a.driver.id] || a.driver.num));
      list.push({ key: a.driver.id, run: run, team: a.rt.team, car: obj, tyre: run.tyre });
    }
    return list;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function sm(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  PIT.update = function (R, st, dt) {
    if (!st || !CR.RealPit || !CR.RealPit.built) return;
    LAYOUT = LAYOUT || layout();
    var list = stops(R), d = st.dummy, col = st.color, P = CR.RealPit, ctx = CR.Race._ctx(), S = CR.Track.samples;
    var cnt = [0, 0], kt = 0, kg = 0, kj = 0;
    Object.keys(st.used).forEach(function (key) {
      if (!list.some(function (s) { return s.key === key; })) { restoreCar(st.used[key]); delete st.used[key]; }
    });
    Object.keys(st.relLights).forEach(function (k) { st.relLights[k].emissive.setHex(0xff2020); });
    list.forEach(function (s) {
      var run = s.run, team = CR.RealData.team(s.team);
      var po = CR.Cars.byId('f1').model && CR.Cars.byId('f1').model.opts;
      var suitC = team.player ? (po ? po.main : '#16181d') : team.main;
      var trimC = team.player ? (po ? po.accent : '#d4a82a') : team.accent;
      var helmC = team.player ? (po ? po.accent : '#d4a82a') : (team.id === 'vel' ? '#f4f4f4' : team.accent);
      // the crew always works in the box frame (not the car's): where the car stops
      var i = ctx.indexAt(ctx.wrapDist(run.box), 0), sb = S[i];
      var bx = sb.x + sb.nx * P.work, by = sb.y + sb.ny * P.work, cs = Math.cos(sb.heading), sn = Math.sin(sb.heading);
      var toW = function (lx, ly) { return { x: bx + ly * cs + lx * sn, y: by + ly * sn - lx * cs }; };
      var approach = run.phase === 'in' ? sm(1 - (run.box - run.rel) / 70) : 1;
      var serve = run.serve || 0, T = Math.max(1.6, (run.stopTime || 2.5) - serve);
      var t = run.phase === 'stop' ? Math.max(0, run.t - serve) / T : run.phase === 'out' ? 1 + (run.t || 0) : 0;
      var lift = run.phase === 'stop' ? sm(t / 0.12) * (1 - sm((t - 0.86) / 0.08)) : 0;
      var back = run.phase === 'out' ? sm((t - 1.6) / 1.2) : 0; // walk back after the car has gone
      if (run.phase === 'out' && st.relLights[s.team]) st.relLights[s.team].emissive.setHex(0x22ff55);
      var garageSide = -P.side;
      LAYOUT.forEach(function (m, idx) {
        var wait = { x: garageSide * (2.4 + (idx % 3) * 0.55), y: (idx - 8) * 0.6 };
        var lx = lerp(wait.x, m.x, approach), ly = lerp(wait.y, m.y, approach), kneel = false, carry = 0;
        var w = m.corner;
        if (m.role === 'gun') kneel = approach > 0.8;
        if (m.role === 'off' && w) {
          var off2 = sm((t - 0.22) / 0.2) * (1 - back);
          lx += (w[0] > 0 ? 1 : -1) * off2 * 1.2; ly -= off2 * 0.7;
          carry = t > 0.22 && t < 2.2 ? 1 : 0;
          kneel = approach > 0.8 && t < 0.22;
        }
        if (m.role === 'on' && w) {
          var on = sm((t - 0.42) / 0.22) * (1 - sm((t - 1.3) / 0.6));
          lx = lerp(lx, w[0] + (w[0] > 0 ? 0.8 : -0.8), on); ly = lerp(ly, w[1] + 0.15, on);
          carry = t < 0.66 ? 2 : 0;
        }
        if (m.role === 'jackF' || m.role === 'jackR') { if (t > 0.9) ly += (m.role === 'jackF' ? 1 : -1) * sm((t - 0.9) / 0.1) * 1.4; }
        if (m.role === 'stab') kneel = run.phase === 'stop';
        if (m.role === 'rel' && run.phase === 'out') lx = lerp(lx, garageSide * 2.5, sm(t - 1));
        if (back > 0) { lx = lerp(lx, wait.x, back); ly = lerp(ly, wait.y, back); }
        var p = toW(lx, ly);
        var dxw = -ly * cs - lx * sn, dyw = -ly * sn + lx * cs;
        if (m.role === 'jackF' || m.role === 'jackR' || m.role === 'rel') { dxw = -ly * cs; dyw = -ly * sn; }
        if (m.role === 'off' && carry) { dxw = -dxw; dyw = -dyw; } // walking away with the old wheel
        var yaw = Math.atan2(dxw, -dyw);
        d.position.set(p.x, 0, -p.y);
        d.rotation.set(0, yaw, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        var pz = kneel ? 1 : 0, ps = st.pose[pz], k = cnt[pz]++;
        ps.suit.setMatrixAt(k, d.matrix); ps.trim.setMatrixAt(k, d.matrix); ps.dark.setMatrixAt(k, d.matrix); ps.helmet.setMatrixAt(k, d.matrix);
        col.set(suitC).convertSRGBToLinear(); ps.suit.setColorAt(k, col);
        col.set(trimC).convertSRGBToLinear(); ps.trim.setColorAt(k, col);
        col.set(helmC).convertSRGBToLinear(); ps.helmet.setColorAt(k, col);
        if (m.role === 'gun' && kneel && kg < st.guns.instanceMatrix.count) st.guns.setMatrixAt(kg++, d.matrix);
        if ((m.role === 'jackF' || m.role === 'jackR') && approach > 0.6 && kj < st.jacks.instanceMatrix.count) {
          d.position.y = -0.15 * lift; d.updateMatrix();
          st.jacks.setMatrixAt(kj++, d.matrix);
          d.position.y = 0;
        }
        if (carry && kt < st.tyres.instanceMatrix.count) {
          var fwd = 0.42;
          var tp = { x: p.x + Math.sin(yaw) * fwd, y: p.y - Math.cos(yaw) * fwd };
          d.position.set(tp.x, 0.72, -tp.y);
          d.rotation.set(0, yaw + Math.PI / 2, 0);
          d.updateMatrix();
          st.tyres.setMatrixAt(kt, d.matrix); st.bands.setMatrixAt(kt, d.matrix);
          col.set(carry === 2 ? CR.RealData.tyre(s.tyre).color : '#555a62').convertSRGBToLinear();
          st.bands.setColorAt(kt, col);
          kt++;
        }
      });
      if (s.car) {
        st.used[s.key] = s.car;
        s.car.group.position.y = lift * 0.07;
        var wheelsOff = run.phase === 'stop' && t > 0.25 && t < 0.62;
        var slide = run.phase === 'stop' ? sm((t - 0.2) / 0.08) * (1 - sm((t - 0.6) / 0.08)) : 0;
        s.car.wheels.forEach(function (wh) {
          if (wh.pivot.userData.baseZ === undefined) wh.pivot.userData.baseZ = wh.pivot.position.z;
          var bz = wh.pivot.userData.baseZ;
          wh.pivot.position.z = bz + Math.sign(bz || 1) * slide * 0.35;
          wh.pivot.visible = !wheelsOff;
        });
      }
    });
    st.pose.forEach(function (ps, pz) { ps.suit.count = ps.trim.count = ps.dark.count = ps.helmet.count = cnt[pz]; });
    st.tyres.count = st.bands.count = kt;
    st.guns.count = kg; st.jacks.count = kj;
    var all = [st.tyres, st.bands, st.guns, st.jacks];
    st.pose.forEach(function (ps) { all.push(ps.suit, ps.trim, ps.dark, ps.helmet); });
    all.forEach(function (m) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  };

  function restoreCar(car) {
    if (!car || !car.group) return;
    car.group.position.y = 0;
    car.wheels.forEach(function (wh) {
      if (wh.pivot.userData.baseZ !== undefined) wh.pivot.position.z = wh.pivot.userData.baseZ;
      wh.pivot.visible = true;
    });
  }
})();

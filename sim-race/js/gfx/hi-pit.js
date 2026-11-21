// hi-pit.js — 리얼리스틱 pit lane for the 높음 renderer: lane surface, lines
// and painted team boxes, the garage block with one open bay per team, the
// gantries with release lights, and the pit crews (hi-crew.js: rigged people
// who run out as their car comes down the lane, change the tyres in ~2.4 s,
// do every repair as its own job and walk back in after the release).
// Only built when the track samples carry s.pit (real/real-pit.js).
// Load order: after hi-crew.js and hi-track.js. Depends on: THREE, CR.Hi (Crew, Track), RealPit, Race, RealData.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};
  var PIT = Hi.Pit = {};
  var T = function () { return Hi.Track; };

  var MAX_CREWS = 3; // stops drawn at once (player + the nearest AI stops)

  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function vec(s, o, h) { return new THREE.Vector3(s.x + s.nx * o, h, -(s.y + s.ny * o)); }

  // Static scenery + the crew pool. S: samples, D: cumulative, group: track group.
  PIT.build = function (R, S, D, group) {
    var P = CR.RealPit, n = S.length, sd = P.side, Tr = T();
    var out = {};
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

    // crews: a pool of stops (hi-crew.js), handed to the cars that come in
    var M = Hi.Crew.materials(R);
    out.pool = [];
    for (var c = 0; c < MAX_CREWS; c++) {
      var stop = new Hi.Crew.Stop(M);
      stop.group.visible = false;
      group.add(stop.group);
      out.pool.push({ stop: stop, key: null });
    }
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

  // Active stops this frame: player + AI cars in their pit run near their box
  // (from 70 m before it until the crew is back in the garage).
  function near(run) { return run.box !== null && (run.phase === 'out' ? run.t < 6 : run.box - run.rel < 70); }
  function stops(R) {
    var list = [], P = CR.RealPit;
    var pp = P.player, c = CR.Car.state;
    if (pp && c.inPit && near(pp)) list.push({ key: 'you', run: pp, team: 'you', car: R.playerCar, tyre: pp.tyre, old: pp.old });
    var ai = CR.Race.ai;
    for (var i = 0; i < ai.length && list.length < MAX_CREWS; i++) {
      var a = ai[i], run = a.rt && a.rt.pit;
      if (!run || !near(run)) continue;
      if (Math.hypot(a.x - c.x, a.y - c.y) > 260) continue;
      var obj = R.carCache && R.carFor(a.model, a.driver && (Hi.Car.NUMBERS[a.driver.id] || a.driver.num));
      list.push({ key: a.driver.id, run: run, team: a.rt.team, car: obj, tyre: run.tyre, old: run.old });
    }
    return list;
  }

  function sm(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  // Crew colours: the player's team as in the reference (black suits, red
  // panels, black helmets), the others in their livery.
  function colours(team) {
    if (team.player) return { main: '#16171b', accent: '#d7192a', helmet: '#0d0e11' };
    return { main: team.main, accent: team.accent, helmet: team.id === 'vel' ? '#f4f4f4' : team.accent, dark: '#141518' };
  }

  PIT.update = function (R, st, dt) {
    if (!st || !st.pool || !CR.RealPit || !CR.RealPit.built) return;
    var list = stops(R), P = CR.RealPit, ctx = CR.Race._ctx(), S = CR.Track.samples, RD = CR.RealData;
    // free the crews whose car has gone, then hand free crews to new stops
    st.pool.forEach(function (slot) {
      if (slot.key && !list.some(function (s) { return s.key === slot.key; })) {
        Hi.Crew.restoreCar(slot.car);
        slot.key = null; slot.car = null; slot.stop.group.visible = false;
      }
    });
    Object.keys(st.relLights).forEach(function (k) { st.relLights[k].emissive.setHex(0xff2020); });
    list.forEach(function (s) {
      var slot = st.pool.filter(function (x) { return x.key === s.key; })[0];
      if (!slot) {
        slot = st.pool.filter(function (x) { return !x.key; })[0];
        if (!slot) return;
        slot.key = s.key; slot.stop.reset(); slot.tyres = null;
      }
      var run = s.run, stop = slot.stop, team = RD.team(s.team);
      stop.setTeam(s.team, colours(team));
      if (s.car && slot.car !== s.car) { Hi.Crew.tagWheels(s.car); stop.setCar(s.car); }
      slot.car = s.car;
      var tk = (s.old || 'M') + s.tyre;
      if (slot.tyres !== tk) {
        slot.tyres = tk;
        var oc = new THREE.Color(RD.tyre(s.old || 'M').color).convertSRGBToLinear(), nc = new THREE.Color(RD.tyre(s.tyre).color).convertSRGBToLinear();
        stop.oldT.forEach(function (g) { g.userData.band.color.copy(oc); });
        stop.newT.forEach(function (g) { g.userData.band.color.copy(nc); });
      }
      // the crew works in the box frame (where the car stops), placed like a car there
      var i = ctx.indexAt(ctx.wrapDist(run.box), 0), sb = S[i];
      var bx = sb.x + sb.nx * P.work, by = sb.y + sb.ny * P.work;
      stop.group.position.set(bx, 0, -by);
      stop.group.rotation.set(0, sb.heading, 0);
      stop.group.visible = true;
      var serve = run.serve || 0, fix = 0;
      (run.items || []).forEach(function (it) { fix += it.d; });
      var work = Math.max(1.6, (run.stopTime || 2.4) - serve);
      var ctl = stop.update({
        phase: run.phase, approach: run.phase === 'in' ? sm(1 - (run.box - run.rel) / 70) : 1, t: run.t, outT: run.t,
        serve: serve, work: work, items: run.items || [], slow: work - fix > 2.7 ? hash(s.key) % 4 : -1, garage: -P.side,
      }, dt);
      if (s.car) Hi.Crew.applyCar(s.car, ctl, run.phase !== 'stop');
      if (ctl.green && st.relLights[s.team]) st.relLights[s.team].emissive.setHex(0x22ff55);
    });
  };
})();

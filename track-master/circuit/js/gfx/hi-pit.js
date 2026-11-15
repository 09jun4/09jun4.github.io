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
    var dark = R.std({ color: 0x101215, roughness: 0.9, metalness: 0 }, 'bay');
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
      var band = R.std({ color: new THREE.Color(gar.color), roughness: 0.45, metalness: 0.2, emissive: new THREE.Color(gar.color), emissiveIntensity: 0.15 }, 'band');
      quad(sd * (P.garage - 0.05), 4.2, 5.35, band);
      // painted box on the working lane
      var boxMat = R.std({ color: new THREE.Color(gar.color), roughness: 0.6, metalness: 0, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }, 'boxpaint');
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

    // crew: instanced torsos, legs, helmets, tyres (MAX_CREWS stops at once)
    var N = MAX_CREWS * PER;
    // matte race suits: low environment reflection so the team colours stay deep
    var suit = R.std({ color: 0xffffff, roughness: 0.75, metalness: 0, envMapIntensity: 0.25 }, 'crew');
    var dk = R.std({ color: 0x15171b, roughness: 0.85, metalness: 0, envMapIntensity: 0.2 }, 'crewLegs');
    var hel = R.std({ color: 0xffffff, roughness: 0.25, metalness: 0.1, envMapIntensity: 0.6 }, 'crewHelmet');
    var tyreMat = R.std({ color: 0x141518, roughness: 0.9, metalness: 0, envMapIntensity: 0.15 }, 'crewTyre');
    var bandMat = R.std({ color: 0xffffff, roughness: 0.5, metalness: 0, envMapIntensity: 0.3 }, 'crewTyreBand');
    // figure (1.78 m): suit = torso + upper arms + forearms + collar; dark = legs, boots, gloves, visor
    function box(w, h, d, x, y, z, rz) { var g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; }
    var torso = new THREE.CylinderGeometry(0.19, 0.155, 0.6, 10); torso.translate(0, 1.15, 0);
    var hips = new THREE.CylinderGeometry(0.155, 0.16, 0.16, 10); hips.translate(0, 0.84, 0);
    var tg = mergeGeos([torso, hips, box(0.1, 0.34, 0.1, 0.25, 1.24, 0, 0.18), box(0.1, 0.34, 0.1, -0.25, 1.24, 0, -0.18),
      box(0.09, 0.3, 0.09, 0.29, 0.94, 0.06, 0.05), box(0.09, 0.3, 0.09, -0.29, 0.94, 0.06, -0.05), box(0.2, 0.06, 0.18, 0, 1.47, 0)]);
    var legs = mergeGeos([box(0.13, 0.78, 0.15, 0.085, 0.42, 0), box(0.13, 0.78, 0.15, -0.085, 0.42, 0),
      box(0.14, 0.08, 0.26, 0.085, 0.04, 0.05), box(0.14, 0.08, 0.26, -0.085, 0.04, 0.05),
      box(0.09, 0.1, 0.1, 0.3, 0.75, 0.08), box(0.09, 0.1, 0.1, -0.3, 0.75, 0.08), box(0.2, 0.07, 0.06, 0, 1.63, 0.12)]);
    var head = new THREE.SphereGeometry(0.16, 14, 10); head.scale(1, 1.08, 1.12); head.translate(0, 1.62, 0);
    var tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.36, 18); tyre.rotateX(Math.PI / 2);
    var tband = new THREE.TorusGeometry(0.33, 0.025, 6, 24); tband.translate(0, 0, 0.181);
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
    out.torso = inst(tg, suit, N, true);
    out.legs = inst(legs, dk, N, false);
    out.head = inst(head, hel, N, true);
    out.tyres = inst(tyre, tyreMat, MAX_CREWS * 8, false);
    out.bands = inst(tband, bandMat, MAX_CREWS * 8, true);
    out.geos = [tg, legs, head, tyre, tband];
    out.dummy = new THREE.Object3D();
    out.color = new THREE.Color();
    return out;
  };

  function mergeGeos(list) {
    var pos = [], nor = [], idx = [], base = 0;
    list.forEach(function (g) {
      var gi = g.index ? g : g;
      var p = gi.attributes.position, nn = gi.attributes.normal;
      for (var i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); }
      if (gi.index) for (var k = 0; k < gi.index.count; k++) idx.push(gi.index.getX(k) + base);
      base += p.count;
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  // Crew positions (car-local: x right, y forward, metres) for the four wheel
  // corners, the jacks, stabilisers and release man.
  var WX = 0.82, WF = 1.72, WR = -1.62;
  function layout() {
    var L = [];
    [[WX, WF], [-WX, WF], [WX, WR], [-WX, WR]].forEach(function (w) {
      var sx = w[0] > 0 ? 1 : -1;
      L.push({ role: 'gun', corner: w, x: w[0] + sx * 0.55, y: w[1] });
      L.push({ role: 'off', corner: w, x: w[0] + sx * 0.5, y: w[1] - 0.55 });
      L.push({ role: 'on', corner: w, x: w[0] + sx * 1.35, y: w[1] + 0.55 });
    });
    L.push({ role: 'jackF', x: 0, y: 3.05 });
    L.push({ role: 'jackR', x: 0, y: -2.95 });
    L.push({ role: 'stab', x: 1.25, y: 0.2 });
    L.push({ role: 'stab', x: -1.25, y: 0.2 });
    L.push({ role: 'rel', x: 0, y: 4.4 });
    return L;
  }
  var LAYOUT = null;

  // Active stops this frame: player + AI cars in their pit run near their box.
  function stops(R) {
    var list = [], P = CR.RealPit;
    var pp = P.player, c = CR.Car.state;
    if (pp && c.inPit && pp.box !== null && Math.abs(pp.box - pp.rel) < 60) list.push({ key: 'you', run: pp, x: c.x, y: c.y, h: c.heading, team: 'you', car: R.playerCar, tyre: pp.tyre });
    var ai = CR.Race.ai;
    for (var i = 0; i < ai.length && list.length < MAX_CREWS; i++) {
      var a = ai[i], run = a.rt && a.rt.pit;
      if (!run || run.box === null || Math.abs(run.box - run.rel) > 60) continue;
      if (Math.hypot(a.x - c.x, a.y - c.y) > 260) continue;
      var obj = R.carCache && R.carFor(a.model, a.driver && (Hi.Car.NUMBERS[a.driver.id] || a.driver.num));
      list.push({ key: a.driver.id, run: run, x: a.x, y: a.y, h: a.heading, team: a.rt.team, car: obj, tyre: run.tyre });
    }
    return list;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function sm(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  PIT.update = function (R, st, dt) {
    if (!st || !CR.RealPit || !CR.RealPit.built) return;
    LAYOUT = LAYOUT || layout();
    var list = stops(R), d = st.dummy, col = st.color, P = CR.RealPit;
    var k = 0, kt = 0;
    // restore any car we moved last frame that is no longer stopping
    Object.keys(st.used).forEach(function (key) {
      if (!list.some(function (s) { return s.key === key; })) { restoreCar(st.used[key]); delete st.used[key]; }
    });
    list.forEach(function (s) {
      var run = s.run, team = CR.RealData.team(s.team);
      var po = CR.Cars.byId('f1').model && CR.Cars.byId('f1').model.opts;
      var suitC = team.player ? (po ? po.main : '#16181d') : team.main, helmC = team.player ? (po ? po.accent : '#d4a82a') : team.accent;
      // stop timeline: 0..1 approach (crew walk out), work phases, release
      var approach = run.phase === 'in' ? sm(1 - (run.box - run.rel) / 60) : 1;
      var serve = run.serve || 0, T = Math.max(1.6, (run.stopTime || 2.5) - serve);
      var t = run.phase === 'stop' ? Math.max(0, run.t - serve) / T : run.phase === 'out' ? 1 + Math.min(1, (run.rel - run.box) / 30) : 0;
      var lift = run.phase === 'stop' ? sm(t / 0.12) * (1 - sm((t - 0.86) / 0.08)) : 0;
      var cs = Math.cos(s.h), sn = Math.sin(s.h);
      var toW = function (lx, ly) { return { x: s.x + ly * cs + lx * sn, y: s.y + ly * sn - lx * cs }; };
      // box centre while the car is still coming: stand where it will stop
      if (run.phase === 'in') {
        var ctx = CR.Race._ctx(), i = ctx.indexAt(ctx.wrapDist(run.box), 0), sb = CR.Track.samples[i];
        var off = P.work;
        var bx = sb.x + sb.nx * off, by = sb.y + sb.ny * off;
        cs = Math.cos(sb.heading); sn = Math.sin(sb.heading);
        toW = function (lx, ly) { return { x: bx + ly * cs + lx * sn, y: by + ly * sn - lx * cs }; };
      }
      var garageSide = -P.side; // car-local x of the garage (+x = right of the car)
      LAYOUT.forEach(function (m, idx) {
        if (k >= st.torso.count + 1000) return;
        // waiting spot: lined up on the garage side, walk in with the approach
        var wait = { x: garageSide * (2.6 + (idx % 3) * 0.5), y: (idx - 8) * 0.55 };
        var lx = lerp(wait.x, m.x, approach), ly = lerp(wait.y, m.y, approach), crouch = 0, carry = 0;
        var w = m.corner;
        if (m.role === 'gun') { crouch = run.phase === 'stop' ? 1 : approach * 0.5; }
        if (m.role === 'off' && w) {
          var off2 = sm((t - 0.22) / 0.2);
          lx += (w[0] > 0 ? 1 : -1) * off2 * 1.1; ly -= off2 * 0.6;
          carry = run.phase === 'stop' && t > 0.22 ? 1 : 0;
        }
        if (m.role === 'on' && w) {
          var on = sm((t - 0.42) / 0.22);
          lx = lerp(lx, w[0] + (w[0] > 0 ? 0.75 : -0.75), on); ly = lerp(ly, w[1] + 0.1, on);
          carry = run.phase === 'stop' && t < 0.66 ? 2 : 0;
        }
        if (m.role === 'jackF' || m.role === 'jackR') { crouch = 0.35 * lift; if (t > 0.9) ly += (m.role === 'jackF' ? 1 : -1) * sm((t - 0.9) / 0.1) * 1.2; }
        if (m.role === 'rel' && run.phase === 'out') lx = lerp(lx, garageSide * 2.5, sm(t - 1));
        if (run.phase === 'out') { var back = sm((t - 1) * 1.5); lx = lerp(lx, wait.x, back); ly = lerp(ly, wait.y, back); }
        var p = toW(lx, ly);
        // face the car: world direction to its centre (three: x, -y)
        var dxw = -ly * cs - lx * sn, dyw = -ly * sn + lx * cs;
        if (m.role === 'rel' || m.role === 'jackF' || m.role === 'jackR') { dxw = -ly * cs; dyw = -ly * sn; }
        d.position.set(p.x, 0, -p.y);
        d.rotation.set(0, Math.atan2(dxw, -dyw), 0);
        d.scale.set(1, 1 - crouch * 0.38, 1);
        d.updateMatrix();
        st.torso.setMatrixAt(k, d.matrix); st.legs.setMatrixAt(k, d.matrix); st.head.setMatrixAt(k, d.matrix);
        col.set(suitC); st.torso.setColorAt(k, col);
        col.set(helmC); st.head.setColorAt(k, col);
        // tyres carried
        if (carry && kt < st.tyres.instanceMatrix.count) {
          var tp = toW(lx + (w[0] > 0 ? -0.35 : 0.35), ly);
          d.position.set(tp.x, 0.62 - crouch * 0.2, -tp.y);
          d.rotation.set(0, s.h, 0);
          d.scale.set(1, 1, 1);
          d.updateMatrix();
          st.tyres.setMatrixAt(kt, d.matrix); st.bands.setMatrixAt(kt, d.matrix);
          col.set(carry === 2 ? CR.RealData.tyre(s.tyre).color : '#555a62');
          st.bands.setColorAt(kt, col);
          kt++;
        }
        k++;
      });
      // the car: up on the jacks, wheels off between gun-off and gun-on
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
    st.torso.count = st.legs.count = st.head.count = k;
    st.tyres.count = st.bands.count = kt;
    [st.torso, st.legs, st.head, st.tyres, st.bands].forEach(function (m) {
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

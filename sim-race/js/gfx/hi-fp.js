// hi-fp.js — the driver's arms and hands in 3D for the cockpit view (높음).
// The steering wheel is drawn on the 2D canvas over the 3D scene
// (wheel.js / cockpit.js), so the arms render on their own transparent
// Three.js layer above it, through a camera that matches the cockpit view
// exactly (camera.js projection, as hi-renderer.js builds its own).
//
// Rig per arm: upper arm -> forearm -> hand -> four fingers of three joints
// and a three-joint thumb, one skinned mesh in the team's race suit (sleeve
// stripe and piping, gauntlet with its strap, knuckle guard). The arm
// reaches its wrist by two-bone IK from a shoulder behind the eyes; the hand
// is turned to the wheel face (back of the hand towards the driver, fingers
// wrapped round the outer edge of the grip, thumb on the front by the
// buttons) and the fingers curl by rotating their joints. Motions: the index
// finger pulls the paddle at a gear change (right up, left down), the thumb
// presses buttons (left: PIT limiter / BOOST, right: MOM), a buzz on kerbs.
// Load order: after hi-crew.js. Depends on: THREE, CR.Hi.Crew, Camera, Hands (state).
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};

  var FP = { tilt: 0.35 }; // tilt: how far the back of the hand turns from facing out towards the driver (rad)
  var canvas = null, renderer = null, scene = null, camera = null, arms = null, colKey = null, failed = false;

  // --- Arm mesh (bind pose: hanging down from the shoulder at the origin) -----------------------
  var FING_Z = [0.031, 0.011, -0.009, -0.027], FING_R = [0.0098, 0.0103, 0.0097, 0.0086];
  var FING_L = [[0.042, 0.026, 0.021], [0.047, 0.029, 0.022], [0.044, 0.027, 0.021], [0.034, 0.021, 0.017]];
  var THUMB_D = [0.35, -0.75, 0.55], THUMB_L = [0.032, 0.026, 0.021];

  function bones(sd) {
    var list = [], idx = {};
    function add(name, parent, pos) { var b = new THREE.Bone(); b.name = name; b.position.fromArray(pos); if (parent) idx[parent].add(b); idx[name] = b; list.push(b); return b; }
    add('upper', null, [0, 0, 0]); add('fore', 'upper', [0, -0.29, 0]); add('hand', 'fore', [0, -0.26, 0]);
    FING_Z.forEach(function (z, i) {
      add('f' + i + '0', 'hand', [0, -0.095, z]); add('f' + i + '1', 'f' + i + '0', [0, -FING_L[i][0], 0]); add('f' + i + '2', 'f' + i + '1', [0, -FING_L[i][1], 0]);
    });
    var d = new THREE.Vector3(THUMB_D[0] * -sd, THUMB_D[1], THUMB_D[2]).normalize();
    add('t0', 'hand', [-sd * 0.008, -0.028, 0.034]);
    add('t1', 't0', d.clone().multiplyScalar(THUMB_L[0]).toArray()); add('t2', 't1', d.clone().multiplyScalar(THUMB_L[1]).toArray());
    return { list: list, by: idx, tdir: d };
  }

  function armGeometry(sd, B) {
    var L = Hi.Crew.lib, S = L.SLOT, g = new L.GeoB(), I = {};
    B.list.forEach(function (b, i) { I[b.name] = i; });
    function w1(n) { return [[I[n], 1]]; }
    function w2(a, b, t) { return [[I[a], 1 - t], [I[b], t]]; }
    // sleeve: shoulder -> wrist, stripe and piping down the outside
    var A = [[-0.53, 0.046, w1('fore')], [-0.5, 0.047, w1('fore')], [-0.4, 0.052, w1('fore')], [-0.32, 0.058, w2('upper', 'fore', 0.75)],
      [-0.29, 0.06, w2('upper', 'fore', 0.5)], [-0.26, 0.062, w2('upper', 'fore', 0.25)], [-0.15, 0.068, w1('upper')], [0, 0.075, w1('upper')]];
    g.loft(A.map(function (r) { return { c: [0, r[0], 0], ra: r[1], rb: r[1] * 1.04, w: r[2] }; }), 22, 2.1, function (ct, st, r, p) {
      var o = ct * sd;
      return o > 0.9 ? S.accent : o > 0.8 ? S.accent2 : S.main;
    });
    // gauntlet over the cuff, strap in the piping colour
    var Gt = [[-0.555, 0.047, w2('fore', 'hand', 0.5)], [-0.54, 0.05, w1('fore')], [-0.5, 0.054, w1('fore')], [-0.47, 0.053, w1('fore')]];
    g.loft(Gt.map(function (r) { return { c: [0, r[0], 0], ra: r[1], rb: r[1] * 1.05, w: r[2] }; }), 22, 2.2, function (ct, st, r, p) {
      return p[1] > -0.515 && p[1] < -0.49 ? S.accent2 : S.glove;
    });
    // palm (thickness along x, width along z; the back of the hand on the +x*sd side)
    var Pm = [[-0.645, 0.017, 0.047], [-0.63, 0.02, 0.048], [-0.6, 0.022, 0.048], [-0.57, 0.021, 0.044], [-0.55, 0.02, 0.04]];
    g.loft(Pm.map(function (r) { return { c: [sd * 0.002, r[0], 0.002], ra: r[1], rb: r[2], w: w1('hand') }; }), 20, 2.6, function () { return S.glove; }, { cap0: true });
    // knuckle guard: pads over each finger and a plate on the back of the hand
    FING_Z.forEach(function (z) { g.box([sd * 0.019, -0.637, z], 0.006, 0.012, 0.014, S.accent2, w1('hand')); });
    g.box([sd * 0.02, -0.6, 0.002], 0.004, 0.006, 0.07, S.accent, w1('hand')); // thin accent line across the back
    // fingers: three segments each, rounded tips
    FING_Z.forEach(function (z, i) {
      var y0 = -0.095 - 0.55, r0 = FING_R[i], Lf = FING_L[i];
      var y1 = y0 - Lf[0], y2 = y1 - Lf[1], y3 = y2 - Lf[2];
      var n = 'f' + i;
      var R = [[y3 - 0.004, r0 * 0.35, w1(n + '2')], [y3 + 0.002, r0 * 0.8, w1(n + '2')], [y2 - 0.003, r0 * 0.88, w2(n + '1', n + '2', 0.75)], [y2 + 0.003, r0 * 0.9, w2(n + '1', n + '2', 0.25)],
        [y1 - 0.003, r0 * 0.95, w2(n + '0', n + '1', 0.75)], [y1 + 0.003, r0 * 0.98, w2(n + '0', n + '1', 0.25)], [y0 + 0.002, r0, w2('hand', n + '0', 0.7)], [y0 + 0.012, r0, w2('hand', n + '0', 0.2)]];
      g.loft(R.map(function (r) { return { c: [0, r[0], z], ra: r[1], rb: r[1], w: r[2] }; }), 10, 2.2, function () { return S.glove; });
    });
    // thumb along its own direction
    var d = B.tdir, base = new THREE.Vector3(-sd * 0.008, -0.55 - 0.028, 0.034);
    var ax = new THREE.Vector3(1, 0, 0), bx = new THREE.Vector3().crossVectors(d, ax).normalize();
    ax.crossVectors(bx, d).normalize();
    var segs = [[-0.004, 0.0125, w2('hand', 't0', 0.6)], [0.02, 0.012, w1('t0')], [THUMB_L[0] - 0.003, 0.0112, w2('t0', 't1', 0.6)],
      [THUMB_L[0] + 0.02, 0.0108, w1('t1')], [THUMB_L[0] + THUMB_L[1] - 0.003, 0.0102, w2('t1', 't2', 0.6)], [THUMB_L[0] + THUMB_L[1] + THUMB_L[2] - 0.006, 0.0085, w1('t2')],
      [THUMB_L[0] + THUMB_L[1] + THUMB_L[2], 0.004, w1('t2')]];
    g.loft(segs.map(function (r) { var c = base.clone().addScaledVector(d, r[0]); return { c: c.toArray(), ra: r[1], rb: r[1], w: r[2], a: ax.toArray(), b: bx.toArray() }; }), 10, 2.2, function () { return S.glove; });
    return g.build();
  }

  function makeArm(sd, mat, col) {
    var B = bones(sd), geo = armGeometry(sd, B);
    Hi.Crew.lib.paint(geo, col);
    var mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(B.by.upper);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(B.list));
    mesh.frustumCulled = false;
    return { mesh: mesh, b: B.by, sd: sd, geo: geo };
  }

  // --- Layer ---------------------------------------------------------------------------------------
  function init() {
    if (renderer || failed) return !!renderer;
    try {
      canvas = document.createElement('canvas');
      canvas.id = 'fp-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;display:none;';
      var gc = document.getElementById('game-canvas');
      gc.parentNode.insertBefore(canvas, gc.nextSibling);
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, premultipliedAlpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      scene = new THREE.Scene();
      // light: sky above, the cockpit below, a key light from the front; reflections from a painted sky
      scene.add(new THREE.HemisphereLight(0xdfe7f2, 0x2a2622, 0.85));
      FP.key = new THREE.DirectionalLight(0xfff4e6, 1.7);
      scene.add(FP.key, FP.key.target);
      var c = document.createElement('canvas'); c.width = 256; c.height = 128;
      var x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, '#f2f5fa'); gr.addColorStop(0.45, '#aab8c8'); gr.addColorStop(0.55, '#5d6066'); gr.addColorStop(1, '#1e1d1c');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
      var t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
      var pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(t).texture;
      t.dispose(); pm.dispose();
      camera = new THREE.PerspectiveCamera(60, 1, 0.02, 10);
      return true;
    } catch (e) {
      failed = true;
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      renderer = null;
      return false;
    }
  }

  function buildArms(col) {
    col = Object.assign({}, col);
    var c = new THREE.Color(col.glove || col.main);
    if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.08) col.glove = '#2b2e35'; // near-black gloves would read as holes
    if (col.accent2 === col.glove || new THREE.Color(col.accent2).getHSL({}).l < 0.15) col.accent2 = '#3a3e46';
    var key = JSON.stringify(col);
    if (arms && colKey === key) return;
    if (arms) arms.forEach(function (a) { scene.remove(a.mesh); a.geo.dispose(); });
    colKey = key;
    var M = Hi.Crew.materials(null), mat = Hi.Crew.lib.suitMaterial(null, M);
    arms = [makeArm(1, mat, col), makeArm(-1, mat, col)]; // left (+x in bind), right
    arms.forEach(function (a) { scene.add(a.mesh); });
  }

  FP.ready = function () { return !!(window.THREE && Hi.Crew && Hi.Crew.lib && CR.Gfx && CR.Gfx.active === 'high' && init()); };
  FP.hide = function () { if (canvas && canvas.style.display !== 'none') canvas.style.display = 'none'; };

  var _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
  // view: cockpit.js wheel view (pt3 = cockpit point of a sheet point, eye), car: Car.state,
  // col: driver colours (Crew.teamColours), H: CR.Hands state (flick, thumb, kerb), cockpitY: COCKPIT_Y
  FP.draw = function (view, car, col, H, cockpitY) {
    if (!FP.ready()) { FP.hide(); return false; }
    buildArms(col);
    var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
    canvas.style.display = 'block';
    // camera = camera.js cockpit projection (principal point off centre)
    var Cam = CR.Camera, F = Cam.focal, cy = Cam.centerPx, p = Cam.pitch, hd = Cam.viewHeading, near = 0.02, far = 10;
    camera.position.set(Cam.pos.x, Cam.pos.h, -Cam.pos.y);
    camera.up.set(0, 1, 0);
    camera.lookAt(_v.set(Math.cos(hd) * Math.cos(p), -Math.sin(p), -Math.sin(hd) * Math.cos(p)).add(camera.position));
    camera.projectionMatrix.makePerspective(-near * (w / 2) / F, near * (w / 2) / F, near * cy / F, -near * (h - cy) / F, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld(true);
    FP.key.position.copy(camera.position).add(_v.set(Math.cos(hd) * 2, 3, -Math.sin(hd) * 2));
    FP.key.target.position.copy(camera.position);
    // cockpit point (x right, y forward relative to the cockpit, z up) -> three world
    var ch = Math.cos(car.heading), sh = Math.sin(car.heading);
    function W(q) { var f = q[1] + cockpitY, X = car.x + f * ch + q[0] * sh, Y = car.y + f * sh - q[0] * ch; return new THREE.Vector3(X, q[2], -Y); }
    function S(x, y, d) { return W(view.pt3(x, y, d)); }
    var c0 = S(500, 320, 0), Rv = S(501, 320, 0).sub(c0).normalize(), Uv = c0.clone().sub(S(500, 321, 0)).normalize(), Nv = S(500, 320, 0.01).sub(c0).normalize();
    var jit = (H && H.kerb || 0) * 0.002, eye = view.eye;
    arms.forEach(function (a, k) {
      var s = k ? 1 : -1, b = a.b, sd = a.sd; // s: -1 left, +1 right
      // straight wrist: the hand carries on along the forearm and the fingers close round the grip;
      // the back of the hand faces out, turned only a little towards the driver (FP.tilt)
      var gx = k ? 1000 - 48 : 48, grip = S(gx, 380, -0.022); // outer part of the grip: the hand stays off the wheel face
      grip.x += (Math.random() - 0.5) * jit; grip.y += (Math.random() - 0.5) * jit;
      var shoulder = W([s * 0.19, eye[1] - 0.2, eye[2] - 0.3]);
      a.mesh.position.copy(shoulder);
      a.mesh.updateMatrixWorld(true);
      var pole = Uv.clone().multiplyScalar(-0.8).addScaledVector(Rv, 0.55 * s).addScaledVector(Nv, 0.2);
      var tilt = FP.tilt, back = Rv.clone().multiplyScalar(s * Math.cos(tilt)).addScaledVector(Nv, Math.sin(tilt));
      var d = Uv.clone().multiplyScalar(0.6).addScaledVector(Nv, -0.8).normalize(), bb = new THREE.Vector3(), wrist = new THREE.Vector3();
      for (var it = 0; it < 3; it++) {
        bb.copy(back).addScaledVector(d, -back.dot(d)).normalize();
        wrist.copy(grip).addScaledVector(bb, 0.035).addScaledVector(d, -0.075); // the grip sits inside the curled fingers
        Hi.Crew.lib.ik(b.upper, b.fore, b.hand, wrist, pole, pole.clone().negate());
        d = wrist.clone().sub(b.fore.getWorldPosition(new THREE.Vector3())).normalize();
      }
      var y = d.clone().negate(), x = bb.copy(back).addScaledVector(y, -back.dot(y)).normalize().multiplyScalar(sd);
      var z = new THREE.Vector3().crossVectors(x, y);
      _m.makeBasis(x, y, z); _q.setFromRotationMatrix(_m);
      b.fore.getWorldQuaternion(_q2);
      b.hand.quaternion.copy(_q2.invert().multiply(_q));
      // fingers wrap the grip (curl towards the palm, about the grip axis z); the index pulls the paddle
      var flick = H ? H.flick[k] : 0, th = H ? H.thumb[k] : 0;
      for (var i = 0; i < 4; i++) {
        var extra = i === 0 ? flick * 0.5 : 0;
        b['f' + i + '0'].rotation.set(0, 0, -sd * (1.15 + extra + i * 0.05));
        b['f' + i + '1'].rotation.set(0, 0, -sd * (1.45 + extra));
        b['f' + i + '2'].rotation.set(0, 0, -sd * (1.1 + extra * 0.6));
      }
      // thumb: lies on the wheel face pointing up and in; pressing = reaching further in and down on the button
      b.t0.rotation.set(0.15 - th * 0.3, 0, -sd * (0.25 + th * 0.25));
      b.t1.rotation.set(0, 0, -sd * (0.3 + th * 0.35));
      b.t2.rotation.set(0, 0, -sd * (0.35 + th * 0.4));
      a.mesh.updateMatrixWorld(true);
    });
    renderer.render(scene, camera);
    return true;
  };

  FP._makeArm = makeArm; // tests
  Hi.FP = FP;
  CR.FPArms = FP;
})();

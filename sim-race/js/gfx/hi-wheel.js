// hi-wheel.js — the F1 steering wheel as a Three.js model (cockpit view, 높음),
// rendered with the driver's arms on the hi-fp.js layer so the gloves really
// wrap its grips. Same layout as the 2D wheel (wheel.js LAYOUT: a 1000 x 640
// sheet), so buttons, screen and grip positions match everywhere.
//
// SteeringWheel
// ├── MainBody      CarbonFrame (bevelled carbon plate, face artwork), LeftGrip / RightGrip (rubber)
// ├── Display       Screen (glass over the panel), ScreenUI (live: gear, speed, lap, delta, tyres,
// │                 ERS, shift lights, flag LEDs — wheel.js drawScreen)
// ├── Buttons       ShiftUp (+1), ShiftDown (-1), Neutral (N), PitLimiter (PIT), Radio (TALK)
// │                 and the rest, plus the two toggles
// ├── RotarySwitches STRAT / MODE / HPP knobs (knurled, pointer at the setting), four thumb wheels
// ├── PaddleShifters carbon paddles behind the shoulders (pulled at each gear change)
// └── RearConnectors quick-release hub (anodised gold), electrical connectors
// Local frame: x right, y up, z towards the driver (metres); origin = sheet centre on the face.
// Load order: after hi-tex.js, before hi-fp.js. Depends on: THREE, CR.Hi (carbon), Wheel3D (LAYOUT).
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};

  var WIDTH = 0.33; // m across the sheet (cockpit.js WHEEL.width)

  Hi.SteeringWheel = function () {
    var Lw = CR.Wheel3D.LAYOUT, S = WIDTH / Lw.W, CX = Lw.W / 2, CY = Lw.H / 2;
    function X(x) { return (x - CX) * S; }
    function Y(y) { return (CY - y) * S; }
    function lin(h) { return new THREE.Color(h).convertSRGBToLinear(); }
    function shapeOf(d, mirror) {
      var pts = CR.Wheel3D.flatten(d).map(function (p) { return new THREE.Vector2(X(mirror ? Lw.W - p[0] : p[0]), Y(p[1])); });
      return new THREE.Shape(pts);
    }
    // extrude between depths z0..z1 (bevel inside that range)
    function extrude(shape, z0, z1, bevel, segs) {
      var b = Math.min(bevel, (z1 - z0) / 2 - 0.0005);
      var g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0 - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: segs || 3, curveSegments: 12 });
      g.translate(0, 0, z0 + b);
      return g;
    }
    // sheet UVs (u across, v up) so the face artwork lands where the 2D wheel paints it
    function sheetUV(g) {
      var p = g.attributes.position, uv = g.attributes.uv;
      for (var i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) / S + CX) / Lw.W, 1 - (CY - p.getY(i) / S) / Lw.H);
      uv.needsUpdate = true;
      return g;
    }
    function named(o, n) { o.name = n; return o; }
    function grp(n, parent) { var g = named(new THREE.Group(), n); if (parent) parent.add(g); return g; }
    function mesh(geo, mat, n, parent) { var m = named(new THREE.Mesh(geo, mat), n); m.castShadow = m.receiveShadow = false; if (parent) parent.add(m); return m; }

    // materials
    var cb = Hi.carbon ? Hi.carbon(8) : null;
    var carbon = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: cb && cb.map, normalMap: cb && cb.normal, roughnessMap: cb && cb.rough, roughness: 0.55, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
    if (cb) [cb.map, cb.normal, cb.rough].forEach(function (t) { t.repeat.set(9, 9); });
    var artTex = new THREE.CanvasTexture(CR.Wheel3D.buildArt());
    artTex.encoding = THREE.sRGBEncoding; artTex.anisotropy = 8;
    var face = new THREE.MeshPhysicalMaterial({ map: artTex, roughness: 0.42, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    var rubber = new THREE.MeshStandardMaterial({ color: lin('#17181b'), roughness: 0.92, metalness: 0 });
    var dark = new THREE.MeshStandardMaterial({ color: lin('#0d0e10'), roughness: 0.55, metalness: 0.2 });
    var metal = new THREE.MeshStandardMaterial({ color: lin('#9aa0a8'), roughness: 0.3, metalness: 0.9 });
    var gold = new THREE.MeshStandardMaterial({ color: lin('#c9a23a'), roughness: 0.28, metalness: 1 });
    var white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    var root = grp('SteeringWheel');

    // --- MainBody ---
    var body = grp('MainBody', root);
    var plate = sheetUV(extrude(shapeOf(Lw.PLATE), -Lw.PLATE_T, 0, 0.006, 4));
    mesh(plate, [face, carbon], 'CarbonFrame', body);
    [['LeftGrip', false], ['RightGrip', true]].forEach(function (g) {
      var geo = extrude(shapeOf(Lw.GRIP, g[1]), -Lw.GRIP_BACK, Lw.GRIP_FRONT, 0.005, 4);
      mesh(geo, rubber, g[0], body);
    });

    // --- Display ---
    var disp = grp('Display', root);
    var x0 = 320, y0 = 92, x1 = 680, y1 = 340, k = 3; // live layer covers screen, shift lights and flag LEDs
    var ui = document.createElement('canvas'); ui.width = (x1 - x0) * k; ui.height = (y1 - y0) * k;
    var uiTex = new THREE.CanvasTexture(ui); uiTex.encoding = THREE.sRGBEncoding;
    var uiMat = new THREE.MeshBasicMaterial({ map: uiTex, transparent: true, toneMapped: false, depthWrite: false });
    var uiMesh = mesh(new THREE.PlaneGeometry((x1 - x0) * S, (y1 - y0) * S), uiMat, 'ScreenUI', disp);
    uiMesh.position.set(X((x0 + x1) / 2), Y((y0 + y1) / 2), 0.0015);
    var glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.06, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.22, depthWrite: false });
    var scr = mesh(new THREE.PlaneGeometry(304 * S, 198 * S), glass, 'Screen', disp);
    scr.position.set(X(500), Y(233), 0.003);

    // --- Buttons ---
    var btns = grp('Buttons', root);
    var NAMES = { '+1': 'ShiftUp', '-1': 'ShiftDown', N: 'Neutral', PIT: 'PitLimiter', TALK: 'Radio' };
    function label(text, bg, fg) {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var g = c.getContext('2d');
      g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
      var rg = g.createRadialGradient(48, 40, 4, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fill();
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 ' + (text.length > 3 ? 30 : text.length > 2 ? 38 : 50) + "px 'Arial Narrow', Arial, sans-serif";
      g.fillText(text, 64, 68);
      var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      return t;
    }
    var pressable = {};
    Lw.BUTTONS.forEach(function (b, i) {
      var top = new THREE.MeshPhysicalMaterial({ map: label(b[3], b[2], b[4]), roughness: 0.35, clearcoat: 0.7 });
      var side = new THREE.MeshStandardMaterial({ color: lin(b[2]).multiplyScalar(0.55), roughness: 0.4 });
      var geo = new THREE.CylinderGeometry(17 * S, 18 * S, Lw.BTN_H, 24);
      geo.rotateX(Math.PI / 2); geo.translate(0, 0, Lw.BTN_H / 2);
      var n = NAMES[b[3]] && !pressable[NAMES[b[3]]] ? NAMES[b[3]] : 'Button_' + b[3] + '_' + i;
      var m = mesh(geo, [side, top, side], n, btns);
      m.position.set(X(b[0]), Y(b[1]), 0);
      pressable[n] = m;
    });
    Lw.TOGGLES.forEach(function (t) {
      var g = grp('Toggle_' + t[2], btns);
      g.position.set(X(t[0]), Y(t[1]), 0);
      var base = mesh(new THREE.BoxGeometry(20 * S, 30 * S, 0.004), dark, 'Base', g); base.position.z = 0.002;
      var lev = new THREE.CylinderGeometry(3.5 * S, 4.5 * S, Lw.TOGGLE_H, 10); lev.rotateX(Math.PI / 2); lev.translate(0, 0, Lw.TOGGLE_H / 2);
      var lm = mesh(lev, metal, 'Lever', g); lm.rotation.x = 0.35;
    });

    // --- RotarySwitches ---
    var rots = grp('RotarySwitches', root);
    Lw.ROTARIES.forEach(function (r) {
      var R = (r[2] - 14) * S, g = grp('Rotary_' + r[4], rots);
      g.position.set(X(r[0]), Y(r[1]), 0);
      var kn = new THREE.CylinderGeometry(R * 0.92, R, Lw.KNOB_H, 36, 1);
      var p = kn.attributes.position; // knurled sides
      for (var i = 0; i < p.count; i++) {
        var px = p.getX(i), pz = p.getZ(i), rr = Math.hypot(px, pz);
        if (rr > R * 0.5) { var a = Math.atan2(pz, px), f = 1 + 0.06 * (Math.round(a / (Math.PI * 2) * 36) % 2 ? 1 : -1); p.setX(i, px * f); p.setZ(i, pz * f); }
      }
      kn.computeVertexNormals();
      kn.rotateX(Math.PI / 2); kn.translate(0, 0, Lw.KNOB_H / 2);
      mesh(kn, dark, 'Knob', g);
      var cap = new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.002, 28); cap.rotateX(Math.PI / 2); cap.translate(0, 0, Lw.KNOB_H + 0.001);
      mesh(cap, new THREE.MeshStandardMaterial({ color: lin(r[3]), roughness: 0.35, metalness: 0.4 }), 'Cap', g);
      var ptr = mesh(new THREE.BoxGeometry(2.6 * S, R * 0.9, 0.0015), white, 'Pointer', g);
      var ang = -((-150 + (r[5] - 1) * 25 + 11.5) * Math.PI / 180); // sheet angle (y down) -> local
      ptr.position.set(Math.cos(ang) * R * 0.5, Math.sin(ang) * R * 0.5, Lw.KNOB_H + 0.0025);
      ptr.rotation.z = ang - Math.PI / 2;
    });
    Lw.THUMBS.forEach(function (t) {
      var g = grp('Thumbwheel_' + t[3], rots);
      g.position.set(X(t[0]), Y(t[1]), 0);
      var dr = new THREE.CylinderGeometry(16 * S, 16 * S, 22 * S, 24); dr.rotateZ(Math.PI / 2);
      var d = mesh(dr, rubber, 'Drum', g); d.position.z = 0.002;
      var band = new THREE.CylinderGeometry(16.6 * S, 16.6 * S, 6 * S, 24); band.rotateZ(Math.PI / 2);
      var bm = mesh(band, new THREE.MeshStandardMaterial({ color: lin(t[2]), roughness: 0.4 }), 'Band', g); bm.position.z = 0.002;
    });

    // --- PaddleShifters ---
    var pads = grp('PaddleShifters', root), paddles = [];
    [['Left', false], ['Right', true]].forEach(function (pp) {
      var piv = grp(pp[0] + 'Paddle', pads);
      var px = pp[1] ? Lw.W - 150 : 150;
      piv.position.set(X(px), Y(130), -Lw.PLATE_T - 0.008);
      var sh = shapeOf('M 150 110 L 92 96 Q 70 92 74 116 L 150 150 Z', pp[1]);
      var geo = extrude(sh, -0.003, 0.003, 0.0012, 2);
      geo.translate(-X(px), -Y(130), 0);
      mesh(geo, carbon, 'Blade', piv);
      paddles.push(piv);
    });

    // --- RearConnectors ---
    var rear = grp('RearConnectors', root);
    rear.position.z = -Lw.PLATE_T;
    var hub = new THREE.CylinderGeometry(0.03, 0.032, 0.022, 32); hub.rotateX(Math.PI / 2); hub.translate(0, 0, -0.011);
    mesh(hub, gold, 'QuickRelease', rear);
    var nut = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6); nut.rotateX(Math.PI / 2); nut.translate(0, 0, -0.016);
    mesh(nut, metal, 'Hub', rear);
    [-1, 1].forEach(function (sd) {
      var c = mesh(new THREE.BoxGeometry(0.03, 0.016, 0.014), dark, sd < 0 ? 'ConnectorL' : 'ConnectorR', rear);
      c.position.set(sd * 0.075, -0.02, -0.007);
      var pin = new THREE.CylinderGeometry(0.004, 0.004, 0.01, 10); pin.rotateX(Math.PI / 2);
      var pm = mesh(pin, gold, 'Pin', c); pm.position.z = -0.01;
    });

    // live parts
    var lastUI = 0;
    root.userData = {
      // s: wheel.js state (cockpit.js wheelState); flick: [left, right] paddle pull 0..1
      update: function (s, flick, now) {
        if (s && now - lastUI > 33) { // screen at ~30 fps
          lastUI = now;
          var g = ui.getContext('2d');
          g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, ui.width, ui.height);
          g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
          CR.Wheel3D.drawScreen(g, s, now);
          uiTex.needsUpdate = true;
        }
        paddles.forEach(function (p, i) { p.rotation.y = (i ? -1 : 1) * 0.18 * (flick ? flick[i] : 0); });
      },
      buttons: pressable,
    };
    return root;
  };
})();

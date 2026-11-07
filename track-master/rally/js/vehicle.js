// vehicle.js — RallyVehicle: a modern Rally2-style hatchback built from
// three.js primitives (no external model). Model axes: +X forward, +Y up,
// +Z right (root.rotation.y = -heading). Original design and livery —
// inspired by the class, not a copy of any real car:
//   * hatchback body from an extruded side profile with real wheel-arch
//     cut-outs and rounded (bevelled) edges, narrower glasshouse on top
//   * blistered wheel arches, side skirts, front splitter + air curtains,
//     light pod, roof scoop, big rear wing on swan-neck stands, diffuser,
//     exhaust, tow hooks, mud flaps, wipers, mirrors, number plates
//   * livery drawn on canvases (clipped to the body outline) as decals
//   * 15" white gravel wheels with spokes, chunky tread blocks, discs and
//     calipers; fronts steer, all spin, struts follow the travel
//   * interior: dashboard, gauges, steering wheel, seats, roll cage
// HIGH graphics: clear-coated PBR paint with environment reflections.
// LOW: the same shapes with cheap Lambert materials.
// The model only reads the physics state (swap for a GLB without touching
// physics).
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};

  var allMats = [];
  function reg(m) { allMats.push(m); return m; }
  function paint(color, o) { return reg(new THREE.MeshPhysicalMaterial(Object.assign({ color: color, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }, o || {}))); }
  function std(color, o) { return reg(new THREE.MeshStandardMaterial(Object.assign({ color: color, metalness: 0.1, roughness: 0.6 }, o || {}))); }
  function glow(color) { return reg(new THREE.MeshBasicMaterial({ color: color })); }
  function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
  function cyl(rt, rb, h, seg, m, open) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open), m); }
  function at(o, x, y, z) { o.position.set(x, y, z); return o; }

  // ---- side profile (ground-relative metres; y = 0 is the road)
  // tub = true cuts the cabin out of the top (doors are separate panels),
  // so the cockpit has a real floor, footwells and door cards.
  function profile(a, b, tub) {
    var s = new THREE.Shape(), AR = 0.43, AY = 0.33;
    s.moveTo(2.0, 0.2);
    s.bezierCurveTo(2.07, 0.26, 2.08, 0.5, 2.05, 0.6);   // front bumper face
    s.bezierCurveTo(2.02, 0.68, 1.98, 0.71, 1.9, 0.72);   // nose top
    s.lineTo(0.95, 0.86);                                 // bonnet to cowl
    if (tub) { s.lineTo(0.62, 0.87); s.lineTo(0.62, 0.4); s.lineTo(-1.45, 0.4); s.lineTo(-1.45, 0.915); }
    s.lineTo(-1.55, 0.92);                                // shoulder / beltline
    s.bezierCurveTo(-1.85, 0.93, -1.96, 0.92, -1.99, 0.86); // hatch lip
    s.bezierCurveTo(-2.04, 0.7, -2.05, 0.4, -2.0, 0.22);    // rear face
    s.lineTo(-b - AR - 0.02, 0.2);
    s.absarc(-b, AY, AR, Math.PI, 0, true);               // rear arch
    s.lineTo(a - AR, 0.2);
    s.absarc(a, AY, AR, Math.PI, 0, true);                // front arch
    s.lineTo(2.0, 0.2);
    return s;
  }
  function greenhouse() {
    var s = new THREE.Shape();
    s.moveTo(0.98, 0.84);
    s.bezierCurveTo(0.6, 1.08, 0.3, 1.28, 0.02, 1.39);    // windscreen
    s.bezierCurveTo(-0.3, 1.43, -1.0, 1.43, -1.32, 1.4);  // roof
    s.bezierCurveTo(-1.6, 1.3, -1.82, 1.08, -1.9, 0.9);   // rear hatch glass
    s.lineTo(-1.9, 0.84);
    s.lineTo(0.98, 0.84);
    return s;
  }

  // ---- livery canvases (clipped to the body outline so arches stay clear)
  var X0 = -2.1, X1 = 2.12, Y0 = 0.12, Y1 = 0.98;
  function liveryCanvas(shape, mirror) {
    var c = document.createElement('canvas'); c.width = 2048; c.height = 420;
    var g = c.getContext('2d');
    function px(x) { var u = (x - X0) / (X1 - X0); return (mirror ? 1 - u : u) * c.width; }
    function py(y) { return (1 - (y - Y0) / (Y1 - Y0)) * c.height; }
    g.beginPath();
    shape.getPoints(48).forEach(function (p, i) { if (i) g.lineTo(px(p.x), py(p.y)); else g.moveTo(px(p.x), py(p.y)); });
    g.closePath(); g.clip();
    // lower black band
    g.fillStyle = '#16181c'; g.fillRect(0, py(0.36), c.width, c.height);
    // orange / red sweep from the front wheel to the rear quarter
    function sweep(col, lift, thick) {
      g.fillStyle = col; g.beginPath();
      g.moveTo(px(2.2), py(0.38 + lift));
      g.bezierCurveTo(px(1.0), py(0.42 + lift), px(0.2), py(0.86 + lift * 0.3), px(-1.0), py(0.84));
      g.lineTo(px(-2.2), py(0.92));
      g.lineTo(px(-2.2), py(0.92 - thick));
      g.bezierCurveTo(px(-1.0), py(0.8 - thick), px(0.2), py(0.78 - thick + lift * 0.3), px(2.2), py(0.38 + lift - thick));
      g.closePath(); g.fill();
    }
    sweep('#ff7a1a', 0.1, 0.16); sweep('#e8202f', 0.02, 0.07);
    // door number panel
    g.fillStyle = '#ffffff'; g.fillRect(px(mirror ? -0.15 : 0.55), py(0.74), Math.abs(px(0.7) - px(0)), py(0.48) - py(0.74));
    g.fillStyle = '#111'; g.font = '900 120px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('09', (px(mirror ? -0.15 : 0.55) + px(mirror ? 0.55 : -0.15)) / 2, (py(0.74) + py(0.48)) / 2 + 6);
    // event banner + team text
    g.fillStyle = '#fff'; g.font = 'italic 900 64px "Segoe UI", system-ui, sans-serif';
    g.fillText('TRACK MASTER RALLY', (px(-0.9) + px(-0.1)) / 2, py(0.3));
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = '800 34px "Segoe UI", system-ui, sans-serif';
    g.fillText('J. YANG', (px(0.75) + px(0.25)) / 2, py(0.83));
    var t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function textTex(lines, w, h, bg, fg, font) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
    lines.forEach(function (l, i) { g.fillText(l, w / 2, h * (i + 0.5) / lines.length + 2); });
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function treadTex() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 256;
    var g = c.getContext('2d'); g.fillStyle = '#141416'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#252528';
    for (var i = 0; i < 16; i++) { var y = i * 16; g.fillRect(4, y + 2, 24, 11); g.fillRect(36, y + 9, 24, 11); }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  function create(spec) {
    allMats = [];
    var root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    var cg = spec.cgHeight, a = spec.wheelbase * (1 - spec.frontWeight), b = spec.wheelbase * spec.frontWeight;
    var tw = spec.track / 2, R = spec.wheelRadius, yG = -cg; // ground level in body space
    var floorY = yG + 0.24;
    var shell = new THREE.Group(); shell.position.y = yG; body.add(shell);  // ground-relative parts
    var parts = {};

    var white = paint(0xf3f3f1), black = std(0x15171a, { roughness: 0.5 }), satin = std(0x22252a, { roughness: 0.45, metalness: 0.3 });
    var carbon = std(0x1a1c20, { roughness: 0.35, metalness: 0.4 }), chrome = std(0xdadde2, { metalness: 1, roughness: 0.18 });
    var glass = reg(new THREE.MeshPhysicalMaterial({ color: 0x0d141c, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.62, clearcoat: 1 }));
    var orange = paint(0xff7a1a), red = paint(0xd6202f);

    // --- lower body (extruded profile, bevelled = rounded edges)
    var W = 1.74, shape = profile(a, b, false);
    var bg = new THREE.ExtrudeGeometry(profile(a, b, true), { depth: W, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 28 });
    bg.translate(0, 0, -W / 2);
    var lower = new THREE.Mesh(bg, white); shell.add(lower); parts.shell = lower;
    // glasshouse, narrower with rounded edges (tumblehome)
    var GW = 1.36, gg = new THREE.ExtrudeGeometry(greenhouse(), { depth: GW, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelSegments: 5, curveSegments: 24 });
    gg.translate(0, 0, -GW / 2);
    var house = new THREE.Mesh(gg, [glass, white]); shell.add(house); parts.cabin = house;
    // window frames painted over the side glass (A, B, C pillars) + roof rails
    [-1, 1].forEach(function (sd) {
      var z = sd * (GW / 2 + 0.105);
      var bp = box(0.12, 0.5, 0.012, black); at(bp, -0.42, 1.12, z); shell.add(bp);
      var trim = box(2.75, 0.03, 0.014, black); at(trim, -0.45, 0.875, z); shell.add(trim);
      var rail = box(1.3, 0.03, 0.04, satin); at(rail, -0.65, 1.47, sd * 0.55); shell.add(rail);
    });
    // windscreen + rear glass as separate glossy panels (on top of the paint)
    // (lifted off the bevelled glasshouse along the outward normal)
    var glassTop = reg(new THREE.MeshPhysicalMaterial({ color: 0x0b1118, metalness: 0.3, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.42, depthWrite: false }));
    function glassPanel(x1, y1, x2, y2, w, nx, ny, off) {
      var len = Math.hypot(x2 - x1, y2 - y1), m = box(len, 0.01, w, glassTop);
      m.position.set((x1 + x2) / 2 + nx * (off || 0.085), (y1 + y2) / 2 + ny * (off || 0.085), 0); m.rotation.z = Math.atan2(y2 - y1, x2 - x1); shell.add(m); return m;
    }
    parts.windscreen = glassPanel(0.86, 0.9, 0.1, 1.36, 1.3, 0.52, 0.85);
    glassPanel(-1.4, 1.36, -1.82, 1.0, 1.2, -0.66, 0.75, 0.16);
    // inside: headliner and a dark cabin floor (the outer shells are one-sided)
    var liner2 = box(1.6, 0.02, 1.3, std(0x2a2c30, { roughness: 1 })); at(liner2, -0.55, 1.4, 0); shell.add(liner2);
    // doors: outer skin painted, inner door card dark
    var cardM = std(0x1c1e22, { roughness: 0.85 });
    [-1, 1].forEach(function (sd) {
      var mats = [white, white, black, white, sd > 0 ? white : cardM, sd > 0 ? cardM : white];
      var door = new THREE.Mesh(new THREE.BoxGeometry(2.07, 0.5, 0.07), mats);
      at(door, -0.415, 0.655, sd * (W / 2 + 0.025)); shell.add(door);
      var pull = box(0.2, 0.03, 0.03, std(0xff7a1a)); at(pull, 0.05, 0.8, sd * (W / 2 - 0.03)); shell.add(pull);
    });

    // --- livery decals on both sides (clipped canvases)
    var livR = liveryCanvas(shape, false), livL = liveryCanvas(shape, true);
    [[1, livR], [-1, livL]].forEach(function (p) {
      var g2 = new THREE.PlaneGeometry(X1 - X0, Y1 - Y0);
      var m = new THREE.Mesh(g2, reg(new THREE.MeshPhysicalMaterial({ map: p[1], transparent: true, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, polygonOffset: true, polygonOffsetFactor: -2 })));
      m.position.set((X0 + X1) / 2, (Y0 + Y1) / 2, p[0] * (W / 2 + 0.062));
      if (p[0] < 0) m.rotation.y = Math.PI;
      shell.add(m);
    });
    // bonnet stripe + roof number
    var stripe = box(1.0, 0.006, 0.34, orange); stripe.position.set(1.42, 0.79, 0.0); stripe.rotation.z = -0.15; shell.add(stripe);
    var stripe2 = box(1.0, 0.006, 0.08, red); stripe2.position.set(1.42, 0.792, 0.22); stripe2.rotation.z = -0.15; shell.add(stripe2);
    var stripe3 = stripe2.clone(); stripe3.position.z = -0.22; shell.add(stripe3);
    var roofNum = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), reg(new THREE.MeshStandardMaterial({ map: textTex(['09'], 256, 256, '#ffffff', '#111', '900 170px system-ui, sans-serif'), roughness: 0.5 })));
    roofNum.rotation.x = -Math.PI / 2; roofNum.rotation.z = -Math.PI / 2; roofNum.position.set(-0.75, 1.535, 0); shell.add(roofNum);

    // --- blistered wheel arches + black liners (half cylinders over the tyres)
    var linerGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.52, 24, 1, true, Math.PI / 2, Math.PI);
    var linerM = reg(new THREE.MeshStandardMaterial({ color: 0x0b0b0c, side: THREE.DoubleSide, roughness: 0.9 }));
    [[a, -1], [a, 1], [-b, -1], [-b, 1]].forEach(function (p) {
      var fl = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.075, 10, 28, Math.PI), white);
      fl.position.set(p[0], 0.33, p[1] * (W / 2 + 0.02)); fl.scale.set(1, 1, 1.7); shell.add(fl);
      var lip = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 6, 28, Math.PI), black);
      lip.position.set(p[0], 0.33, p[1] * (W / 2 + 0.1)); shell.add(lip);
      var liner = new THREE.Mesh(linerGeo, linerM); liner.rotation.x = Math.PI / 2; liner.position.set(p[0], 0.33, p[1] * (W / 2 - 0.2)); shell.add(liner);
    });
    // side skirts
    [-1, 1].forEach(function (sd) { var sk = box(1.5, 0.07, 0.1, carbon); at(sk, (a - b) / 2 - 0.08, 0.19, sd * (W / 2 + 0.03)); shell.add(sk); });

    // --- front: splitter, grille, air curtains, headlights, light pod, tow hook
    var split = box(0.24, 0.035, 1.86, carbon); at(split, 2.02, 0.17, 0); shell.add(split);
    var grille = box(0.1, 0.2, 1.05, satin); at(grille, 2.05, 0.36, 0); shell.add(grille);
    for (var gi = 0; gi < 5; gi++) { var gb = box(0.02, 0.012, 1.0, chrome); at(gb, 2.1, 0.29 + gi * 0.035, 0); shell.add(gb); }
    [-1, 1].forEach(function (sd) {
      var cur = box(0.08, 0.2, 0.09, black); at(cur, 2.04, 0.34, sd * 0.78); cur.rotation.y = sd * 0.4; shell.add(cur);
      // swept headlight: chrome bezel + glowing lens + DRL strip
      var hb = box(0.2, 0.13, 0.46, satin); at(hb, 2.0, 0.65, sd * 0.6); hb.rotation.y = sd * 0.28; hb.rotation.z = -0.32; shell.add(hb);
      var hl = box(0.2, 0.1, 0.42, glow(0xfff6dc)); at(hl, 2.035, 0.665, sd * 0.6); hl.rotation.y = sd * 0.28; hl.rotation.z = -0.32; shell.add(hl);
      var drl = box(0.05, 0.022, 0.4, glow(0xd9f0ff)); at(drl, 2.1, 0.6, sd * 0.6); drl.rotation.y = sd * 0.28; shell.add(drl);
      var fog = cyl(0.05, 0.05, 0.03, 16, glow(0xfff2c8)); fog.rotation.z = Math.PI / 2; at(fog, 2.1, 0.3, sd * 0.72); shell.add(fog);
      var mirrorArm = box(0.12, 0.04, 0.12, black); at(mirrorArm, 0.72, 0.92, sd * 0.86); shell.add(mirrorArm);
      var mirror = box(0.16, 0.13, 0.22, white); at(mirror, 0.72, 0.97, sd * 0.96); shell.add(mirror);
      var mglass = box(0.01, 0.1, 0.18, chrome); at(mglass, 0.63, 0.97, sd * 0.96); shell.add(mglass);
      var wiper = box(0.62, 0.012, 0.025, black); at(wiper, 0.86, 0.9, sd * 0.25); wiper.rotation.y = 0.15 * sd; wiper.rotation.z = 0.08; shell.add(wiper);
    });
    var hook = box(0.12, 0.05, 0.05, red); at(hook, 2.1, 0.24, 0.45); shell.add(hook);
    var plateF = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), reg(new THREE.MeshStandardMaterial({ map: textTex(['TM · 09'], 256, 64, '#f4f4f4', '#111', '800 40px system-ui, sans-serif') })));
    plateF.rotation.y = Math.PI / 2; at(plateF, 2.1, 0.45, 0); shell.add(plateF);
    // light pod on the bonnet front (4 round lamps)
    var pod = box(0.16, 0.22, 1.12, carbon); at(pod, 1.98, 0.84, 0); pod.rotation.z = -0.1; shell.add(pod);
    var lampM = glow(0xfffbe8), ringM = chrome;
    for (var p = 0; p < 4; p++) {
      var z = -0.42 + p * 0.28;
      var rim = cyl(0.11, 0.11, 0.05, 20, ringM); rim.rotation.z = Math.PI / 2; at(rim, 2.07, 0.84, z); shell.add(rim);
      var lens = cyl(0.095, 0.095, 0.02, 20, lampM); lens.rotation.z = Math.PI / 2; at(lens, 2.1, 0.84, z); shell.add(lens);
    }
    parts.lights = pod;
    // bonnet vents
    [-1, 1].forEach(function (sd) { for (var v = 0; v < 4; v++) { var vt = box(0.3, 0.012, 0.03, black); at(vt, 1.25, 0.82 + 0.005, sd * (0.32 + v * 0.06)); vt.rotation.z = -0.15; shell.add(vt); } });

    // --- roof scoop + antenna
    var scoop = box(0.42, 0.1, 0.36, white); at(scoop, -0.05, 1.47, 0); scoop.rotation.z = -0.12; shell.add(scoop);
    var mouth = box(0.02, 0.07, 0.3, black); at(mouth, 0.16, 1.47, 0); shell.add(mouth);
    var ant = cyl(0.006, 0.006, 0.4, 6, black); at(ant, -1.1, 1.62, 0.3); ant.rotation.z = 0.5; shell.add(ant);

    // --- rear: wing on swan necks, tail lights, diffuser, exhaust, flaps
    var wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.12, 0.06, 0.38, 0.06, 0.52, 0.0); wingShape.bezierCurveTo(0.36, 0.015, 0.12, 0.012, 0, 0);
    var wg = new THREE.ExtrudeGeometry(wingShape, { depth: 1.68, bevelEnabled: false, curveSegments: 12 }); wg.translate(-0.52, 0, -0.84);
    var wing = new THREE.Mesh(wg, carbon); wing.position.set(-1.52, 1.47, 0); wing.rotation.z = -0.1; shell.add(wing); parts.spoiler = wing;
    var gurney = box(0.012, 0.04, 1.68, orange); at(gurney, -2.03, 1.53, 0); shell.add(gurney);
    [-1, 1].forEach(function (sd) {
      var ep = box(0.6, 0.24, 0.015, carbon); at(ep, -1.78, 1.45, sd * 0.85); shell.add(ep);
      var neck = box(0.05, 0.2, 0.03, carbon); at(neck, -1.62, 1.4, sd * 0.42); neck.rotation.z = 0.3; shell.add(neck);
      var tlb = box(0.08, 0.16, 0.46, black); at(tlb, -2.06, 0.74, sd * 0.6); tlb.rotation.y = -sd * 0.22; shell.add(tlb);
      var tl = box(0.06, 0.11, 0.42, glow(0xd0141c)); at(tl, -2.085, 0.76, sd * 0.6); tl.rotation.y = -sd * 0.22; shell.add(tl);
      var tl2 = box(0.06, 0.025, 0.38, glow(0xff8a8a)); at(tl2, -2.09, 0.7, sd * 0.6); tl2.rotation.y = -sd * 0.22; shell.add(tl2);
    });
    var diff = box(0.3, 0.12, 1.4, carbon); at(diff, -1.95, 0.24, 0); shell.add(diff);
    for (var f = 0; f < 5; f++) { var fin = box(0.3, 0.12, 0.015, black); at(fin, -1.96, 0.22, -0.5 + f * 0.25); shell.add(fin); }
    var ex = cyl(0.055, 0.055, 0.22, 16, chrome); ex.rotation.z = Math.PI / 2; at(ex, -2.08, 0.27, 0.55); shell.add(ex);
    var exIn = cyl(0.04, 0.04, 0.23, 12, black); exIn.rotation.z = Math.PI / 2; at(exIn, -2.085, 0.27, 0.55); shell.add(exIn);
    var plateR = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), plateF.material); plateR.rotation.y = -Math.PI / 2; at(plateR, -2.06, 0.5, 0); shell.add(plateR);
    var flapTex = textTex(['RALLY'], 128, 128, '#16181c', '#ff7a1a', 'italic 900 34px system-ui, sans-serif');
    var flapM = reg(new THREE.MeshStandardMaterial({ map: flapTex, roughness: 0.8, side: THREE.DoubleSide }));
    [[a, -1], [a, 1], [-b, -1], [-b, 1]].forEach(function (pp) {
      var mf = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), flapM); mf.rotation.y = Math.PI / 2;
      at(mf, pp[0] - 0.5, 0.16, pp[1] * (tw - 0.02)); shell.add(mf);
    });
    parts.mudflaps = true;

    // --- interior (cockpit camera), ground-relative like the shell
    var interior = new THREE.Group(); shell.add(interior); parts.interior = interior;
    var trimM = std(0x1d2024, { roughness: 0.85 }), softM = std(0x141619, { roughness: 1 }), cageM = std(0xb9bec4, { metalness: 0.6, roughness: 0.35 });
    var accent = std(0xff7a1a, { roughness: 0.6 }), suede = std(0x111214, { roughness: 1 });
    function I(o, x, y, z) { at(o, x, y, z); interior.add(o); return o; }
    I(box(2.05, 0.02, 1.6, softM), -0.4, 0.41, 0);                       // floor
    // dashboard: main body under the windscreen, padded top, knee panel
    I(box(0.45, 0.22, 1.62, trimM), 0.74, 0.84, 0);
    var pad = I(box(0.34, 0.05, 1.62, softM), 0.7, 0.965, 0); pad.rotation.z = 0.08;
    I(box(0.12, 0.3, 1.5, trimM), 0.5, 0.66, 0);
    // driver's binnacle with a digital display
    I(box(0.2, 0.12, 0.44, trimM), 0.54, 1.02, -0.38);
    var visor = I(box(0.26, 0.022, 0.48, softM), 0.52, 1.09, -0.38); visor.rotation.z = -0.12;
    var dc = document.createElement('canvas'); dc.width = 512; dc.height = 160;
    var dTex = new THREE.CanvasTexture(dc); dTex.encoding = THREE.sRGBEncoding;
    var disp = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.112), new THREE.MeshBasicMaterial({ map: dTex, toneMapped: false }));
    disp.rotation.set(0, -Math.PI / 2, 0); I(disp, 0.437, 1.025, -0.38);
    parts.display = { canvas: dc, ctx: dc.getContext('2d'), tex: dTex, frame: 0 };
    // co-driver trip meter on the passenger side
    I(box(0.14, 0.09, 0.24, trimM), 0.62, 1.01, 0.36);
    var trip = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), new THREE.MeshBasicMaterial({ map: textTex(['TRIP 0.00'], 256, 80, '#05170c', '#57ff8a', '700 40px ui-monospace, monospace'), toneMapped: false }));
    trip.rotation.y = -Math.PI / 2; I(trip, 0.548, 1.012, 0.36);
    // centre switch panel (coloured buttons) on the dash face
    I(box(0.02, 0.16, 0.34, softM), 0.448, 0.82, 0.02);
    [0xff3b2f, 0xffd23c, 0x3ccf6e, 0x9ad7ff, 0xff7a1a, 0xffffff].forEach(function (c, k) {
      I(box(0.015, 0.022, 0.03, glow(c)), 0.44, 0.86 - Math.floor(k / 3) * 0.05, -0.06 + (k % 3) * 0.07);
    });
    // steering column and wheel (suede rim, 3 spokes, 12 o'clock marker, paddles)
    function bar(x1, y1, z1, x2, y2, z2, r, m) {
      var v = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1), len = v.length(), o = cyl(r, r, len, 10, m);
      o.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); interior.add(o); return o;
    }
    bar(0.52, 0.86, -0.38, 0.22, 0.91, -0.38, 0.035, trimM);
    var wheelG = I(new THREE.Group(), 0.18, 0.92, -0.38); wheelG.rotation.z = -0.42;
    var sw = new THREE.Group(); wheelG.add(sw);
    var rimT = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.02, 12, 40), suede); rimT.rotation.y = Math.PI / 2; sw.add(rimT);
    [Math.PI / 2, -Math.PI / 2, Math.PI].forEach(function (an) {
      var sp = box(0.014, 0.15, 0.04, satin); sp.position.set(0, Math.cos(an + Math.PI / 2) * 0.085, Math.sin(an + Math.PI / 2) * 0.085);
      sp.rotation.x = -an; sw.add(sp);
    });
    var hub = cyl(0.042, 0.042, 0.04, 20, satin); hub.rotation.z = Math.PI / 2; sw.add(hub);
    var logo = cyl(0.022, 0.022, 0.005, 16, accent); logo.rotation.z = Math.PI / 2; logo.position.x = -0.022; sw.add(logo);
    var mark = box(0.012, 0.035, 0.025, accent); mark.position.set(0, 0.165, 0); sw.add(mark);
    [-1, 1].forEach(function (sd) { var pd = box(0.01, 0.09, 0.05, carbon); pd.position.set(0.04, 0.02, sd * 0.13); sw.add(pd); });
    parts.steeringWheel = sw;
    // centre console, sequential lever, hydraulic handbrake (rally style)
    I(box(0.62, 0.34, 0.24, trimM), 0.16, 0.58, 0.0);
    bar(0.22, 0.75, 0.04, 0.08, 1.02, 0.02, 0.014, satin);
    I(new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), satin), 0.075, 1.035, 0.02);
    bar(-0.05, 0.75, -0.08, 0.1, 0.93, -0.1, 0.014, satin);
    var hbGrip = bar(0.07, 0.895, -0.096, 0.115, 0.95, -0.1, 0.02, std(0xb5141c, { roughness: 0.7 })); void hbGrip;
    // bucket seats with bolsters and harness
    [-0.38, 0.38].forEach(function (z) {
      I(box(0.5, 0.1, 0.48, softM), -0.32, 0.53, z);
      var back = I(box(0.1, 0.86, 0.5, softM), -0.6, 0.98, z); back.rotation.z = 0.12;
      [-1, 1].forEach(function (s) { var bo = I(box(0.12, 0.6, 0.06, trimM), -0.56, 0.9, z + s * 0.25); bo.rotation.z = 0.12; });
      var hd = I(box(0.11, 0.08, 0.5, accent), -0.66, 1.41, z); hd.rotation.z = 0.12;
      if (z < 0) [-0.1, 0.1].forEach(function (dz) { var st = I(box(0.012, 0.6, 0.05, accent), -0.52, 1.0, z + dz); st.rotation.z = 0.2; });
    });
    // roll cage
    function tube(x1, y1, z1, x2, y2, z2) { bar(x1, y1, z1, x2, y2, z2, 0.018, cageM); }
    var yt = 1.37, yb = 0.54;
    [-0.64, 0.64].forEach(function (z) { tube(0.72, yb + 0.35, z, 0.42, yt, z); tube(0.42, yt, z, -1.05, yt, z); tube(-1.05, yt, z, -1.2, yb, z); tube(0.55, 0.78, z, -0.9, 0.78, z); });
    tube(0.42, yt, -0.64, 0.42, yt, 0.64); tube(-1.05, yt, -0.64, -1.05, yt, 0.64); tube(-1.05, yt, -0.64, 0.42, yt, 0.64);

    parts.cockpitMount = at(new THREE.Object3D(), -0.3, floorY + 1.0, -0.38); body.add(parts.cockpitMount);
    parts.cockpitMount.rotation.z = -0.06;
    parts.hoodMount = at(new THREE.Object3D(), 1.05, floorY + 0.78, 0); body.add(parts.hoodMount);

    // --- wheels: 15" white gravel rims, tread blocks, disc + caliper
    var tyreM = std(0x161618, { roughness: 0.95, map: treadTex() }), sideM = std(0x1b1b1d, { roughness: 0.9 });
    var rimM = std(0xf2f2f2, { metalness: 0.4, roughness: 0.3 }), discM = std(0x8a8c90, { metalness: 0.8, roughness: 0.4 }), calM = std(0xd6202f, { roughness: 0.4 });
    tyreM.map.repeat.set(1, 2);
    var tyreGeo = new THREE.CylinderGeometry(R, R, 0.23, 36, 1, true);
    var sideGeo = new THREE.RingGeometry(R * 0.62, R, 36);
    var blockGeo = new THREE.BoxGeometry(0.06, 0.035, 0.09);
    var wheels = [];
    [[a, -tw, true], [a, tw, true], [-b, -tw, false], [-b, tw, false]].forEach(function (p) {
      var out = p[1] > 0 ? 1 : -1;
      var pivot = new THREE.Group(); pivot.position.set(p[0], 0, p[1]); root.add(pivot);
      var spin = new THREE.Group(); pivot.add(spin);
      var tyre = new THREE.Mesh(tyreGeo, tyreM); tyre.rotation.x = Math.PI / 2; spin.add(tyre);
      [-1, 1].forEach(function (s) { var sd = new THREE.Mesh(sideGeo, sideM); sd.position.z = s * 0.115; if (s < 0) sd.rotation.y = Math.PI; spin.add(sd); });
      // chunky gravel tread blocks (two staggered rows)
      for (var k = 0; k < 18; k++) {
        var an = k / 18 * Math.PI * 2;
        [-0.055, 0.055].forEach(function (zz, row) {
          var bl = new THREE.Mesh(blockGeo, tyreM), aa = an + row * Math.PI / 18;
          bl.position.set(Math.cos(aa) * (R + 0.008), Math.sin(aa) * (R + 0.008), zz); bl.rotation.z = aa; spin.add(bl);
        });
      }
      // rim: dish + 6 spokes + centre nut
      var dish = cyl(R * 0.62, R * 0.62, 0.2, 28, rimM, true); dish.rotation.x = Math.PI / 2; spin.add(dish);
      var face = new THREE.Mesh(new THREE.RingGeometry(R * 0.5, R * 0.62, 28), rimM); face.position.z = out * 0.09; if (out < 0) face.rotation.y = Math.PI; spin.add(face);
      for (var s = 0; s < 6; s++) { var spk = box(0.05, R * 0.95, 0.025, rimM); spk.rotation.z = s * Math.PI / 3; spk.position.z = out * 0.085; spin.add(spk); }
      var nut = cyl(0.045, 0.05, 0.05, 12, chrome); nut.rotation.x = Math.PI / 2; nut.position.z = out * 0.1; spin.add(nut);
      // disc and caliper don't spin
      var disc = cyl(R * 0.5, R * 0.5, 0.025, 28, discM); disc.rotation.x = Math.PI / 2; disc.position.z = -out * 0.01; pivot.add(disc);
      var cal = box(0.14, 0.08, 0.06, calM); cal.position.set(-0.05, R * 0.42, out * 0.03); pivot.add(cal);
      var strut = cyl(0.035, 0.035, 1, 8, satin); strut.position.set(0, 0, -out * 0.22); root.add(strut);
      var spring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), std(0xff7a1a)); spring.rotation.x = Math.PI / 2; strut.add(spring);
      wheels.push({ pivot: pivot, spin: spin, strut: strut, front: p[2], lx: p[0], lz: p[1] });
    });

    // contact shadow for when real shadows are off
    var blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; root.add(blob);

    root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    blob.castShadow = false;

    var mats = allMats.slice();
    var V = { root: root, body: body, parts: parts, wheels: wheels, blob: blob, floorY: floorY, mats: mats };
    V.update = function (car) { sync(V, car); };
    V.setInteriorVisible = function (on) { interior.visible = on; };
    // HIGH: clear-coat PBR with reflections; LOW: Lambert copies (cheaper)
    V.setQuality = function (high) {
      root.traverse(function (o) {
        if (!o.isMesh || o === blob) return;
        var list = Array.isArray(o.material) ? o.material : [o.material];
        var swapped = list.map(function (m) {
          if (!m.userData.pair) {
            if (m.isMeshBasicMaterial) return m;
            var low = new THREE.MeshLambertMaterial({ color: m.color, map: m.map || null, transparent: m.transparent, opacity: m.opacity, side: m.side, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor });
            m.userData.pair = { high: m, low: low }; low.userData.pair = m.userData.pair;
          }
          return high ? m.userData.pair.high : m.userData.pair.low;
        });
        o.material = Array.isArray(o.material) ? swapped : swapped[0];
      });
    };
    V.dispose = function () {
      var seen = new Set();
      root.traverse(function (o) {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (!m) return;
          [m, m.userData && m.userData.pair && m.userData.pair.low, m.userData && m.userData.pair && m.userData.pair.high].forEach(function (x) {
            if (x && !seen.has(x)) { seen.add(x); if (x.map && !seen.has(x.map)) { seen.add(x.map); x.map.dispose(); } x.dispose(); }
          });
        });
      });
    };
    return V;
  }

  // Digital dash: shift-light bar, gear, speed, rpm (every other frame).
  function drawDisplay(D, car) {
    if ((D.frame++ & 1) === 1) return;
    var g = D.ctx, w = 512, h = 160, rpm = car.rpm, lim = car.spec.limiter;
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
    var segs = 24, on = Math.round(Math.min(1, rpm / lim) * segs), flash = rpm > lim * 0.94 && (Date.now() / 90 | 0) % 2;
    for (var i = 0; i < segs; i++) {
      var f = i / segs, col = f < 0.6 ? '#2fe36a' : f < 0.82 ? '#ffd23c' : '#ff3b2f';
      g.fillStyle = i < on ? (flash ? '#4ad7ff' : col) : '#16191e'; g.fillRect(14 + i * 20.3, 10, 16, 22);
    }
    g.fillStyle = '#ff7a1a'; g.font = '900 70px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(car.shiftT > 0 ? '-' : car.gear === -1 ? 'R' : car.gear === 0 ? 'N' : car.gear, w / 2, 72); // above the wheel rim
    g.fillStyle = '#fff'; g.font = '800 54px ui-monospace, Consolas, monospace'; g.textAlign = 'right';
    g.fillText(Math.round(car.speed * 3.6), w - 20, 92);
    g.fillStyle = '#7d8794'; g.font = '700 20px system-ui, sans-serif'; g.fillText('km/h', w - 20, 136);
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '800 40px ui-monospace, Consolas, monospace';
    g.fillText((Math.round(rpm / 10) * 10 + ''), 20, 92);
    g.fillStyle = '#7d8794'; g.font = '700 20px system-ui, sans-serif'; g.fillText('rpm', 20, 136);
    D.tex.needsUpdate = true;
  }

  function sync(V, car) {
    var root = V.root;
    root.position.set(car.x, car.y, car.z);
    root.rotation.set(0, -car.yaw, 0);
    var roll = car.roll, lift = 0;
    if (car.flip) { roll += car.flip.visualRoll || 0; lift = Math.abs(Math.sin(car.flip.visualRoll || 0)) * 0.9; }
    V.body.rotation.set(roll, 0, car.pitch, 'YZX');
    V.body.position.y = lift;
    var spec = car.spec;
    for (var i = 0; i < 4; i++) {
      var w = car.wheels[i], vw = V.wheels[i];
      vw.pivot.position.y = w.wheelY - car.y;
      vw.pivot.rotation.y = -w.steer;
      vw.spin.rotation.z = -w.angle;
      var top = V.floorY + 0.55, hub = vw.pivot.position.y;
      vw.strut.position.x = vw.lx; vw.strut.position.y = (top + hub) / 2;
      vw.strut.scale.y = Math.max(0.05, top - hub);
    }
    V.parts.steeringWheel.rotation.x = car.steer / spec.maxSteer * 2.2;
    if (V.parts.interior.visible) drawDisplay(V.parts.display, car);
    var gy = (car.wheels[0].gy + car.wheels[1].gy + car.wheels[2].gy + car.wheels[3].gy) / 4;
    V.blob.position.y = gy - car.y + 0.03;
  }

  RL.Vehicle = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);

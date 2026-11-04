// world.js — three.js scene for the mountain pass: terrain, road, guardrails,
// forest, lake, start/finish gates and skid marks.
// Physics (x, y, h) -> three (x, h, -y).
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};
  var C = DR.Course;
  var World = {};
  // Looks per course (course.js `theme`).
  var THEMES = {
    summer: { sky: 0xa9c7de, fog: [250, 1500], hemi: [0xdcecff, 0x4a5a3a, 0.75], sun: [0xfff1dc, 0.85, -60, 120, 40],
      grass: [0x3f6b2c, 0x2b4a22], tree: function (r, c) { c.setHSL(0.3 + r() * 0.06, 0.45, 0.1 + r() * 0.07); }, treeH: 1, lake: 0x4a7a96 },
    sunset: { sky: 0xe9a66f, fog: [220, 1300], hemi: [0xffd1a0, 0x3d3226, 0.7], sun: [0xffb06a, 1.0, -120, 55, -40],
      grass: [0x5d6a2e, 0x3e4a22], tree: function (r, c) { c.setHSL(0.25 + r() * 0.08, 0.35, 0.13 + r() * 0.08); }, treeH: 1, lake: 0x8a6a6a },
    autumn: { sky: 0xbfd4e6, fog: [230, 1400], hemi: [0xf1e8dc, 0x5a4a30, 0.78], sun: [0xffe4c0, 0.85, -40, 110, 60],
      grass: [0x77703a, 0x5a5228], tree: function (r, c) {
        var k = r();
        if (k < 0.18) c.setHSL(0.28, 0.35, 0.12 + r() * 0.05); // a few evergreens
        else c.setHSL(0.0 + r() * 0.12, 0.65 + r() * 0.2, 0.27 + r() * 0.1); // red, orange, gold
      }, treeH: 0.9, lake: 0x5a7f96 },
    fog: { sky: 0xc5cbd0, fog: [50, 430], hemi: [0xdfe5ea, 0x3a443a, 0.85], sun: [0xf2f4f6, 0.45, -60, 120, 40],
      grass: [0x3c5a34, 0x2a4128], tree: function (r, c) { c.setHSL(0.33 + r() * 0.04, 0.3, 0.12 + r() * 0.06); }, treeH: 1.5, lake: 0x7a8a90 },
  };
  var TH = THEMES[C.def.theme] || THEMES.summer;
  World.theme = TH;

  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // Asphalt with Korean national-road markings: double yellow centre line,
  // white edge lines.
  function roadTexture(renderer) {
    var t = canvasTex(256, 512, function (g, w, h) {
      g.fillStyle = '#3b3d40'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 9000; i++) {
        var v = 40 + Math.random() * 50 | 0;
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 3) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      var m = w / (2 * (C.HALF + 0.6)); // px per metre
      var cx = w / 2;
      g.fillStyle = '#e8b923';
      g.fillRect(cx - 0.3 * m, 0, 0.15 * m, h);
      g.fillRect(cx + 0.15 * m, 0, 0.15 * m, h);
      g.fillStyle = '#e9e9e4';
      g.fillRect(cx - C.LINE * m - 0.15 * m, 0, 0.15 * m, h);
      g.fillRect(cx + C.LINE * m, 0, 0.15 * m, h);
      // old tyre marks
      g.fillStyle = 'rgba(20,20,22,0.18)';
      for (var k = 0; k < 6; k++) g.fillRect(cx + (k - 3) * 2.2 * m + 0.6 * m, 0, 0.3 * m, h);
    });
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  function strip(points, uvs, material, indexW, flip) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    var idx = [], rows = points.length / 3 / indexW;
    for (var r = 0; r < rows - 1; r++) for (var c = 0; c < indexW - 1; c++) {
      var a = r * indexW + c, b = a + 1, d = a + indexW, e = d + 1;
      if (flip) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }

  function buildTerrain(scene) {
    var minRoad = Math.min.apply(null, C.samples.map(function (q) { return q.h; }));
    var T = C.TERRAIN, size = Math.min(T.size, 5200), seg = Math.round(size / 12), cx = T.cx, cy = T.cy;
    var geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    var c1 = new THREE.Color(TH.grass[0]), c2 = new THREE.Color(TH.grass[1]), c3 = new THREE.Color(0x7c7a6a), c4 = new THREE.Color(0x8a8576), tmp = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i) + cx, z = pos.getZ(i), y = -z + cy;
      pos.setX(i, x); pos.setZ(i, -y);
      var h = C.ground(x, y);
      pos.setY(i, h);
      var near = C.roadNear(x, y), n = 0.5 + 0.5 * Math.sin(x * 0.05) * Math.cos(y * 0.07);
      tmp.copy(c1).lerp(c2, n);
      if (h > 470) tmp.lerp(c3, Math.min(1, (h - 470) / 60) * 0.6);
      if (near.d < C.HALF + 4) tmp.copy(c4);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    var m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    scene.add(m);
    // Lake at the foot of the mountain and far hills under the fog.
    var lake = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshPhongMaterial({ color: TH.lake, shininess: 90, specular: 0x88aacc }));
    lake.rotation.x = -Math.PI / 2;
    World.lakeH = Math.min(70, minRoad - 60);
    lake.position.set(cx, World.lakeH, -cy);
    scene.add(lake);
  }

  function buildRoad(scene, renderer) {
    var S = C.samples, n = S.length, W = C.HALF + 0.6, pts = [], uv = [];
    for (var i = 0; i < n; i++) {
      var s = S[i];
      pts.push(s.x + s.nx * W, s.h + 0.03, -(s.y + s.ny * W), s.x - s.nx * W, s.h + 0.03, -(s.y - s.ny * W));
      uv.push(0, s.dist / 22, 1, s.dist / 22);
    }
    var road = strip(pts, uv, new THREE.MeshLambertMaterial({ map: roadTexture(renderer) }), 2, true);
    road.receiveShadow = true;
    scene.add(road);
    // Gravel verges sloping down to the ground outside the rails.
    [1, -1].forEach(function (side) {
      var vp = [];
      for (var i = 0; i < n; i++) {
        var s = S[i];
        vp.push(s.x + s.nx * side * W, s.h + 0.02, -(s.y + s.ny * side * W), s.x + s.nx * side * (W + 4), s.h - 2.6, -(s.y + s.ny * side * (W + 4)));
      }
      var v = strip(vp, null, new THREE.MeshLambertMaterial({ color: 0x7d7869, side: THREE.DoubleSide }), 2);
      v.receiveShadow = true;
      scene.add(v);
    });
  }

  // W-beam guardrails (국도 가드레일) on galvanised posts, with reflectors.
  function buildRails(scene) {
    var S = C.samples, n = S.length;
    var railMat = new THREE.MeshPhongMaterial({ color: 0xc9ced4, shininess: 70, specular: 0x777777, side: THREE.DoubleSide });
    var prof = [[0, 0.48], [0.07, 0.56], [0.03, 0.64], [0.07, 0.72], [0, 0.8]]; // (outward, height)
    [1, -1].forEach(function (side) {
      var pts = [];
      for (var i = 0; i < n; i++) {
        var s = S[i];
        for (var k = 0; k < prof.length; k++) {
          var o = side * (C.HALF + 0.02 + prof[k][0]);
          pts.push(s.x + s.nx * o, s.h + prof[k][1], -(s.y + s.ny * o));
        }
      }
      var m = strip(pts, null, railMat, prof.length);
      m.castShadow = false;
      scene.add(m);
    });
    var every = 2, count = Math.ceil(n / every) * 2;
    var post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }), count);
    var refl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: 0xffb21e }), Math.ceil(count / 5) + 2);
    var M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    var pi = 0, ri = 0;
    for (var i2 = 0; i2 < n; i2 += every) {
      var s2 = S[i2];
      [1, -1].forEach(function (side) {
        var o = side * (C.HALF + 0.22);
        q.setFromAxisAngle(up, s2.heading);
        p.set(s2.x + s2.nx * o, s2.h + 0.1, -(s2.y + s2.ny * o));
        M.compose(p, q, sc);
        post.setMatrixAt(pi++, M);
        if ((i2 / every) % 5 === 0 && ri < refl.count) {
          p.set(s2.x + s2.nx * side * (C.HALF + 0.12), s2.h + 0.86, -(s2.y + s2.ny * side * (C.HALF + 0.12)));
          M.compose(p, q, sc);
          refl.setMatrixAt(ri++, M);
        }
      });
    }
    post.count = pi; refl.count = ri;
    scene.add(post, refl);
  }

  function buildTrees(scene) {
    var N = 6500, cone = new THREE.ConeGeometry(2.4, 9, 7), trunk = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 5);
    cone.translate(0, 6.5, 0); trunk.translate(0, 1.25, 0);
    var a = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    var b = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x4b3a2a }), N);
    var M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var k = 0, tries = 0;
    while (k < N && tries < N * 8) {
      tries++;
      // Most trees within a few hundred metres of the road.
      var S = C.samples[(rnd() * C.samples.length) | 0], side = rnd() < 0.5 ? -1 : 1, dist = C.HALF + 8 + Math.pow(rnd(), 1.6) * 420;
      var x = S.x + S.nx * side * dist + (rnd() - 0.5) * 30, y = S.y + S.ny * side * dist + (rnd() - 0.5) * 30;
      var nr = C.roadNear(x, y);
      if (nr.d < C.HALF + 7) continue;
      var h = C.ground(x, y);
      // Keep the valley side open near the road so the view drops away.
      if (nr.d < 70 && h < nr.h - 4) continue;
      if (h < World.lakeH + 2) continue;
      var sz = 0.7 + rnd() * 0.8;
      p.set(x, h - 0.2, -y); s.set(sz, sz * (0.85 + rnd() * 0.4) * TH.treeH, sz);
      M.compose(p, q, s);
      a.setMatrixAt(k, M); b.setMatrixAt(k, M);
      TH.tree(rnd, col);
      a.setColorAt(k, col);
      k++;
    }
    a.count = b.count = k;
    scene.add(a, b);
  }

  // Gantry over the road with a chequered banner.
  function gate(scene, index, label) {
    var s = C.samples[index], g = new THREE.Group();
    var tex = canvasTex(512, 64, function (ctx, w, h) {
      for (var i = 0; i < 32; i++) for (var j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2'; ctx.fillRect(i * 16, j * 16, 16, 16); }
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(176, 8, 160, 48);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 256, 33);
    });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    var W = C.HALF * 2 + 1.5;
    var banner = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.set(0, 6.2, 0);
    g.add(banner);
    var pm = new THREE.MeshLambertMaterial({ color: 0x333333 });
    [-1, 1].forEach(function (sd) { var p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.3), pm); p.position.set(sd * (W / 2), 3.5, 0); g.add(p); });
    // A painted line on the road.
    var line = new THREE.Mesh(new THREE.PlaneGeometry(C.HALF * 2, 0.6), new THREE.MeshBasicMaterial({ map: tex }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.06;
    g.add(line);
    g.position.set(s.x, s.h, -s.y);
    g.rotation.y = s.heading - Math.PI / 2; // banner faces the oncoming cars
    scene.add(g);
  }

  function endBarrier(scene, index, dir) {
    var s = C.samples[index];
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, C.HALF * 2 + 0.6), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    var tex = canvasTex(64, 16, function (g) { for (var i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e33' : '#fff'; g.fillRect(i * 8, 0, 8, 16); } });
    tex.repeat.set(5, 1);
    m.material.map = tex;
    m.position.set(s.x + Math.cos(s.heading) * dir * 2, s.h + 0.6, -(s.y + Math.sin(s.heading) * dir * 2));
    m.rotation.y = s.heading;
    scene.add(m);
  }

  // Skid marks: a ring buffer of dark quads laid on the road.
  var SKID_N = 3000;
  function buildSkids(scene) {
    var geo = new THREE.PlaneGeometry(0.24, 0.5);
    geo.rotateX(-Math.PI / 2);
    var mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKID_N);
    var M = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < SKID_N; i++) mesh.setMatrixAt(i, M);
    mesh.frustumCulled = false;
    scene.add(mesh);
    World.skids = { mesh: mesh, i: 0 };
  }
  var sm = new THREE.Matrix4(), sq = new THREE.Quaternion(), sp = new THREE.Vector3(), ss = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
  World.skid = function (x, y, h, heading, len) {
    var S = World.skids;
    sq.setFromAxisAngle(yAxis, heading + Math.PI / 2);
    sp.set(x, h + 0.045, -y); ss.set(1, 1, len / 0.5);
    sm.compose(sp, sq, ss);
    S.mesh.setMatrixAt(S.i, sm);
    S.i = (S.i + 1) % SKID_N;
    S.mesh.instanceMatrix.needsUpdate = true;
  };
  World.clearSkids = function () {
    var M = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < SKID_N; i++) World.skids.mesh.setMatrixAt(i, M);
    World.skids.mesh.instanceMatrix.needsUpdate = true;
  };

  World.build = function (scene, renderer) {
    scene.background = new THREE.Color(TH.sky);
    scene.fog = new THREE.Fog(TH.sky, TH.fog[0], TH.fog[1]);
    scene.add(new THREE.HemisphereLight(TH.hemi[0], TH.hemi[1], TH.hemi[2]));
    var sun = new THREE.DirectionalLight(TH.sun[0], TH.sun[1]);
    sun.position.set(-60, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    var sc = sun.shadow.camera; sc.left = sc.bottom = -28; sc.right = sc.top = 28; sc.near = 1; sc.far = 300;
    scene.add(sun, sun.target);
    World.sun = sun;
    buildTerrain(scene);
    buildRoad(scene, renderer);
    buildRails(scene);
    buildTrees(scene);
    gate(scene, C.startIndex, 'START');
    gate(scene, C.finishIndex, 'GOAL');
    endBarrier(scene, C.samples.length - 1, 1);
    endBarrier(scene, 0, -1);
    buildSkids(scene);
  };

  // Keeps the shadow camera around the player.
  World.follow = function (x, h, z) {
    World.sun.position.set(x + TH.sun[2], h + TH.sun[3], z + TH.sun[4]);
    World.sun.target.position.set(x, h, z);
  };

  DR.World = World;
})();

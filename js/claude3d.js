// 3D 클로드 스타버스트 로고 (Three.js). [data-claude3d] 요소에 붙어요.
// - 가만히 있어도 천천히 돌고 떠다녀요. 마우스·손가락을 따라 기울고, 누르면 한 바퀴 휙 돌아요.
// - 화면 밖이거나 탭이 숨겨지면 멈춰요. prefers-reduced-motion 이면 정지 상태로 그려요.
// - WebGL이 없거나 Three.js를 못 불러오면 평평한 SVG 로고로 대신해요.
(function () {
  'use strict';
  var THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var CORAL = 0xd97757;
  // 광선 12개: 길이가 들쭉날쭉한 별 모양
  var LEN = [1, .8, .95, .72, 1, .84, .92, .74, .98, .8, .9, .7];
  var N = LEN.length, VALLEY = .2, TIP = .046;

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var loading = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    return loading || (loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = THREE_SRC; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }));
  }
  function hasWebGL() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }

  // 별 윤곽 점들 [x, y]
  function points() {
    var p = [], gap = Math.PI / N, i, a;
    for (i = 0; i < N; i++) {
      a = i / N * Math.PI * 2 + ((i % 3) - 1) * .025;
      p.push([Math.cos(a - gap) * VALLEY, Math.sin(a - gap) * VALLEY]);
      p.push([Math.cos(a - TIP) * LEN[i], Math.sin(a - TIP) * LEN[i]]);
      p.push([Math.cos(a + TIP) * LEN[i], Math.sin(a + TIP) * LEN[i]]);
    }
    return p;
  }

  function flat(el) {
    var d = points().map(function (q, i) { return (i ? 'L' : 'M') + (q[0] * 50 + 60).toFixed(1) + ' ' + (60 - q[1] * 50).toFixed(1); }).join('') + 'Z';
    el.classList.add('is-flat');
    el.innerHTML = '<svg viewBox="0 0 120 120" role="img" aria-label="Claude 로고"><path d="' + d + '" fill="#d97757" stroke="#d97757" stroke-width="3" stroke-linejoin="round"/></svg>';
  }

  function start(el) {
    var T = window.THREE;
    var canvas = document.createElement('canvas');
    el.appendChild(canvas);
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(32, 1, .1, 50);
    camera.position.z = 5.6;

    // 모양: 윤곽을 두께로 밀어낸 뒤 모서리를 둥글게
    var shape = new T.Shape(), pts = points();
    pts.forEach(function (q, i) { if (i) shape.lineTo(q[0], q[1]); else shape.moveTo(q[0], q[1]); });
    shape.closePath();
    var geo = new T.ExtrudeGeometry(shape, { depth: .26, bevelEnabled: true, bevelThickness: .08, bevelSize: .04, bevelSegments: 5, curveSegments: 6 });
    geo.center();
    var mat = new T.MeshStandardMaterial({ color: CORAL, roughness: .36, metalness: .18 });
    var mesh = new T.Mesh(geo, mat);
    var group = new T.Group();
    group.add(mesh);
    scene.add(group);

    scene.add(new T.AmbientLight(0xffffff, .62));
    var key = new T.DirectionalLight(0xfff1e6, 1.15); key.position.set(2.5, 3, 4); scene.add(key);
    var rim = new T.PointLight(0x5eead4, .9, 14); rim.position.set(-3.2, -1.4, 2.4); scene.add(rim);

    function size() {
      var w = el.clientWidth || 280, h = el.clientHeight || 280;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    size();
    if (window.ResizeObserver) new ResizeObserver(function () { size(); draw(); }).observe(el);

    // 상태: 포인터 기울기(목표값을 부드럽게 따라가요), 클릭 회전 속도
    var px = 0, py = 0, tx = 0, ty = 0, yaw = -.5, vel = 0, t0 = performance.now(), last = t0, vis = true, raf = 0;
    function onMove(e) {
      var r = el.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2)));
      py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2)));
    }
    if (!reduce) {
      addEventListener('pointermove', onMove, { passive: true });
      el.addEventListener('pointerdown', function () { vel += 9; });
    }

    function draw() { renderer.render(scene, camera); }
    function frame(now) {
      raf = 0;
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      var k = 1 - Math.pow(.0008, dt); // 프레임 속도와 상관없이 같은 느낌의 감쇠
      tx += (py * .5 - tx) * k; ty += (px * .7 - ty) * k;
      vel *= Math.exp(-2.6 * dt);
      yaw += (.55 + vel) * dt;
      group.rotation.set(tx, yaw + ty, 0);
      group.position.y = Math.sin((now - t0) / 1000 * 1.3) * .07;
      draw();
      if (vis && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function run() { if (!reduce && vis && !document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    group.rotation.set(.12, -.5, 0);
    draw();
    el.classList.add('is-ready');
    if (reduce) return;
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; run(); }).observe(el);
    document.addEventListener('visibilitychange', run);
    run();
  }

  function mount(el) {
    if (el.__claude3d) return; el.__claude3d = true;
    if (!hasWebGL()) { flat(el); return; }
    loadThree().then(function () { start(el); }, function () { flat(el); });
  }
  window.mountClaude3d = mount;
  function auto() { Array.prototype.forEach.call(document.querySelectorAll('[data-claude3d]'), mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();

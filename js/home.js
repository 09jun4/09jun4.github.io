// 메인 페이지 동작: 스크롤 진행률 → 3D 장면·텍스트, 내비게이션, 테마 전환, 커서, 마그네틱 버튼, 카드 틸트
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var mobile = matchMedia('(max-width: 720px)').matches || !fine;
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var ss = function (a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ---------- 작품 갤러리 (data/works.js 의 모든 작품, 대표작 제외) ----------
  var FEATURED = '/track-master/';
  var works = (window.WORKS || []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); })
    .filter(function (w) { return w.url !== FEATURED && w.url !== '/f1-champion/'; });
  $('#cards').innerHTML = works.map(function (w, i) {
    return '<a class="card rv" href="' + esc(w.url) + '" data-tilt data-cursor>' +
      '<div class="media">' + (w.thumb ? '<img src="' + esc(w.thumb) + '" alt="' + esc(w.title) + ' screenshot" width="1200" height="900" loading="lazy">' : '') + '</div>' +
      '<div class="meta"><span class="idx">' + String(i + 1).padStart(2, '0') + '</span><h3>' + esc(w.title) + '</h3>' +
      '<p>' + esc(w.desc || '') + '</p><span class="go">Open →</span></div></a>';
  }).join('');
  $('#year').textContent = new Date().getFullYear();

  // ---------- 테마 ----------
  var themeBtn = $('#theme'), themeMeta = $('meta[name="theme-color"]');
  var theme = root.dataset.theme === 'light' ? 'light' : 'dark';
  function paintTheme(t) {
    theme = t; root.dataset.theme = t;
    if (themeMeta) themeMeta.content = t === 'light' ? '#F3F5F9' : '#08090D';
    themeBtn.setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    if (scene && scene.setTheme) scene.setTheme(t);
  }
  themeBtn.addEventListener('click', function (e) {
    var next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch (err) {}
    var r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (document.startViewTransition && !reduce) {
      var vt = document.startViewTransition(function () { paintTheme(next); });
      vt.ready.then(function () {
        var rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + rad + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' });
      }, function () {});
    } else {
      root.classList.add('theme-anim'); paintTheme(next);
      setTimeout(function () { root.classList.remove('theme-anim'); }, 520);
    }
  });

  // ---------- 3D 장면 (실패하면 CSS 구체로 대체) ----------
  var scene = null, canvas = $('#gl'), orb = $('#orb'), sceneOK = false;
  function fallback() { sceneOK = false; canvas.hidden = true; orb.hidden = false; }
  scene = window.HomeScene ? window.HomeScene.create({
    canvas: canvas, mobile: mobile, reduce: reduce, onFail: fallback,
    onReady: function () { sceneOK = true; scene.setTheme(theme); dirty = true; }
  }) : (fallback(), null);
  if (!scene) fallback();

  // ---------- 스크롤 상태 ----------
  var sections = $$('main > section[data-name]');
  var NAV = { home: 'home', project: 'project', works: 'project', about: 'about', skills: 'about', contact: 'contact' };
  var pin = $('#project'), steps = $$('.step'), navLinks = $$('[data-nav]');
  var geo = { top: 0, span: 1, end: 1, vh: innerHeight, doc: 1, tops: [] };
  function measure() {
    geo.vh = innerHeight; var y = scrollY;
    geo.top = pin.getBoundingClientRect().top + y;
    geo.span = Math.max(1, pin.offsetHeight - geo.vh); geo.end = geo.top + geo.span;
    geo.doc = Math.max(1, document.documentElement.scrollHeight - geo.vh);
    geo.tops = sections.map(function (s) { return s.getBoundingClientRect().top + y; });
    if (scene && scene.resize) scene.resize();
    dirty = true;
  }
  var sp = 0, dirty = true, lastY = -1, last = performance.now(), start = last;
  var ptr = { x: 0, y: 0 };
  var ui = { idx: -1, pct: -1, vis: [], clickable: [] };

  function updateSteps(p) {
    steps.forEach(function (el, i) {
      var a = +el.dataset.a, b = +el.dataset.b;
      var v = ss(a - .03, a + .03, p) * (1 - ss(b - .03, b + .03, p));
      if (Math.abs(v - (ui.vis[i] == null ? -1 : ui.vis[i])) > .004) {
        ui.vis[i] = v; el.style.opacity = v.toFixed(3);
        var dir = p < (a + b) / 2 ? 1 : -1;
        el.style.transform = 'translate3d(0,' + ((1 - v) * 22 * dir).toFixed(1) + 'px,0)';
        var on = v > .5;
        if (on !== ui.clickable[i]) { ui.clickable[i] = on; el.style.pointerEvents = on ? 'auto' : 'none'; $$('a', el).forEach(function (l) { l.tabIndex = on ? 0 : -1; }); }
      }
      var shot = $('.shot img', el);
      if (shot) shot.style.setProperty('--zs', (1.16 - .16 * ss(a, a + (b - a) * .55, p)).toFixed(3));
    });
  }

  function updateChrome(y) {
    var idx = 0; for (var i = 0; i < geo.tops.length; i++) if (y + geo.vh * .45 >= geo.tops[i]) idx = i;
    var pct = Math.round(clamp(y / geo.doc, 0, 1) * 100);
    if (idx !== ui.idx) {
      ui.idx = idx; var name = sections[idx].dataset.name;
      $('#pNum').textContent = String(idx + 1).padStart(2, '0'); $('#pName').textContent = name;
      var nk = NAV[sections[idx].id];
      navLinks.forEach(function (a) { var on = a.dataset.nav === nk; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
    if (pct !== ui.pct) { ui.pct = pct; $('#pPct').textContent = pct + '%'; }
    var f = clamp(y / geo.doc, 0, 1);
    $('#pFill').style.transform = 'scaleY(' + f.toFixed(4) + ')'; $('#topFill').style.transform = 'scaleX(' + f.toFixed(4) + ')';
  }

  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    var y = scrollY, target = clamp((y - geo.top) / geo.span, 0, 1);
    var moved = Math.abs(y - lastY) > .1 || Math.abs(target - sp) > .0005;
    // 스크롤을 부드럽게 따라가요 (역방향도 같은 함수라 그대로 되돌아가요)
    sp = reduce ? target : sp + (target - sp) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - sp) < .0004) sp = target;
    if (moved || dirty) { updateSteps(sp); updateChrome(y); lastY = y; }
    if (scene && sceneOK) {
      var vis = 1 - ss(geo.end, geo.end + geo.vh * .8, y);
      var live = vis > .003 && !document.hidden;
      stageEl.style.opacity = vis.toFixed(3);
      if (live && (!reduce || moved || dirty || themeBusy())) {
        scene.pointer(reduce ? 0 : ptr.x, reduce ? 0 : ptr.y);
        scene.render(sp, 1, reduce ? 0 : (now - start) / 1000, dt);
      }
    } else if (orb && !orb.hidden) {
      orb.style.setProperty('--os', (1 + .25 * Math.sin(sp * Math.PI)).toFixed(3)); orb.style.setProperty('--oh', (sp * 40).toFixed(1) + 'deg');
      stageEl.style.opacity = (1 - ss(geo.end, geo.end + geo.vh * .8, y)).toFixed(3);
    }
    dirty = false;
    cursorTick(dt);
    if (!document.hidden) requestAnimationFrame(frame);
  }
  var stageEl = $('#stage'), themeUntil = 0;
  function themeBusy() { return performance.now() < themeUntil; }
  themeBtn.addEventListener('click', function () { themeUntil = performance.now() + 900; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = performance.now(); requestAnimationFrame(frame); } });
  var rz; addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(measure, 120); }, { passive: true });
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  addEventListener('scroll', function () { dirty = true; }, { passive: true });

  // ---------- 포인터 · 터치 패럴랙스 ----------
  function setPtr(cx, cy) { ptr.x = clamp(cx / innerWidth * 2 - 1, -1, 1); ptr.y = clamp(cy / innerHeight * 2 - 1, -1, 1); }
  if (!reduce) {
    addEventListener('pointermove', function (e) { setPtr(e.clientX, e.clientY); }, { passive: true });
    addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
  }

  // ---------- 커서 · 마그네틱 버튼 · 카드 틸트 (마우스가 있는 기기에서만) ----------
  var ring = $('#cRing'), dot = $('#cDot'), cx = 0, cy = 0, rx = 0, ry = 0, shown = false;
  function cursorTick(dt) {
    if (!shown) return;
    var k = 1 - Math.exp(-dt * 16); rx += (cx - rx) * k; ry += (cy - ry) * k;
    ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)'; dot.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
  }
  if (fine && !reduce) {
    addEventListener('pointermove', function (e) {
      cx = e.clientX; cy = e.clientY;
      if (!shown) { shown = true; rx = cx; ry = cy; ring.classList.add('on'); dot.classList.add('on'); }
      var hot = !!(e.target.closest && e.target.closest('a,button,[data-cursor]')); ring.classList.toggle('hot', hot);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { shown = false; ring.classList.remove('on'); dot.classList.remove('on'); });
    $$('.mag').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transition = 'transform .12s ease-out'; el.style.transform = 'translate3d(' + clamp(dx * .22, -9, 9).toFixed(1) + 'px,' + clamp(dy * .3, -7, 7).toFixed(1) + 'px,0)';
      });
      el.addEventListener('pointerleave', function () { el.style.transition = 'transform .45s cubic-bezier(.2,.7,.2,1)'; el.style.transform = ''; });
    });
    $('#cards').addEventListener('pointermove', function (e) {
      var c = e.target.closest('[data-tilt]'); if (!c) return;
      var r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      c.style.transition = 'transform .12s ease-out,border-color .25s,box-shadow .25s'; c.style.transform = 'rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) translateZ(0)';
    });
    $('#cards').addEventListener('pointerout', function (e) { var c = e.target.closest('[data-tilt]'); if (c && !c.contains(e.relatedTarget)) { c.style.transition = ''; c.style.transform = ''; } });
  }

  // ---------- 등장 효과 ----------
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    $$('.rv, .card').forEach(function (el) { io.observe(el); });
  } else { $$('.rv, .card').forEach(function (el) { el.classList.add('in'); }); }

  measure();
  requestAnimationFrame(function (t) { last = t; start = t; frame(t); });
  // 자동 검증용 (화면 동작에는 쓰이지 않아요)
  window.__home = { get progress() { return sp; }, get scene() { return scene && scene.state; }, get ok() { return sceneOK; }, measure: measure, geo: geo };
})();

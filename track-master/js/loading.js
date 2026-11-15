// loading.js — a simple loading screen shared by every Track Master page.
// The spinner and bar are CSS transform animations, so they keep moving even
// while the page is busy building a 3D world on the main thread.
//
//   TMLoading.show('코스 만드는 중')   — show (or change the text)
//   TMLoading.hide()                  — fade out
//   TMLoading.run('그래픽 바꾸는 중', fn)  — show, let it paint, run fn
//                                       (fn may return a Promise), then hide
// Put <script src="../js/loading.js"></script> at the top of <body> and call
// TMLoading.show() right after it to cover a heavy page start.
(function (G) {
  'use strict';
  var el = null, txt = null, hideT = 0, shownAt = 0, maxT = 0;
  var CSS =
    '#tm-loading{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
    'background:rgba(8,9,12,.92);color:#f2f2f2;font:600 14px/1.4 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;' +
    'letter-spacing:.04em;opacity:1;transition:opacity .25s ease}' +
    '#tm-loading.out{opacity:0;pointer-events:none}' +
    '#tm-loading .tl-ring{width:46px;height:46px;border-radius:50%;border:3px solid rgba(255,255,255,.14);border-top-color:#ff7a1a;' +
    'animation:tl-spin .8s linear infinite;will-change:transform}' +
    '#tm-loading .tl-bar{width:180px;height:3px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}' +
    '#tm-loading .tl-bar i{display:block;width:40%;height:100%;background:#ff7a1a;animation:tl-slide 1.1s ease-in-out infinite;will-change:transform}' +
    '#tm-loading .tl-sub{font-weight:500;font-size:12px;color:rgba(255,255,255,.5)}' +
    '@keyframes tl-spin{to{transform:rotate(360deg)}}' +
    '@keyframes tl-slide{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}';

  function ensure() {
    if (el) return;
    var st = document.createElement('style'); st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
    el = document.createElement('div'); el.id = 'tm-loading';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="tl-ring"></div><div class="tl-text"></div><div class="tl-bar"><i></i></div><div class="tl-sub">TRACK MASTER</div>';
    txt = el.querySelector('.tl-text');
    // clicks on the loading screen must not reach the game
    ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: t === 'touchstart' });
    });
    (document.body || document.documentElement).appendChild(el);
  }

  var L = { visible: false };
  L.show = function (text) {
    ensure();
    clearTimeout(hideT);
    txt.textContent = text || '불러오는 중';
    if (!L.visible) shownAt = Date.now();
    el.hidden = false; el.style.display = '';
    el.classList.remove('out');
    L.visible = true;
    // never trap the player behind it (a script error, a stuck load)
    clearTimeout(maxT); maxT = setTimeout(L.hide, 30000);
  };
  L.hide = function () {
    if (!el || !L.visible) return;
    // stay at least a moment so a quick load does not flash
    var wait = Math.max(0, 350 - (Date.now() - shownAt));
    clearTimeout(hideT);
    hideT = setTimeout(function () {
      el.classList.add('out');
      L.visible = false;
      hideT = setTimeout(function () { if (!L.visible) el.style.display = 'none'; }, 260);
    }, wait);
  };
  // Show, give the browser two frames to paint the screen, then do the work.
  L.run = function (text, fn) {
    L.show(text);
    return new Promise(function (ok) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () {
            var r;
            try { r = fn && fn(); } catch (e) { console.error(e); }
            Promise.resolve(r).then(function (v) { L.hide(); ok(v); }, function (e) { console.error(e); L.hide(); ok(); });
          }, 0);
        });
      });
    });
  };
  G.addEventListener('error', function () { L.hide(); });
  G.TMLoading = L;
})(window);

// touchguard.js — stops the phone's browser from reacting to game touches,
// and a fullscreen toggle for touch play.
// Load order: after input.js. Depends on: Main (at call time).
//
// While driving (not in the menu), every touch belongs to the game:
//  - long press: no image menu / "Look Up" / Google Lens / text selection
//  - double tap: no zoom, no word selection
//  - pinch: no zoom (iOS gesture events too)
// Touches on real buttons outside the driving pads (리셋, 메뉴, pause and
// results screens) are left alone so their taps still click, and scrollable
// overlays (results) can still scroll. The CSS side (style.css "Touch guard")
// turns off selection, callouts and tap highlight everywhere.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Guard = {};

  // Elements whose own taps / scrolling must keep working during play.
  var ALLOW = 'a, input, textarea, select, button:not(.tc-btn), #pause, #race-results, #retired';

  function inGame() {
    return !document.body.classList.contains('in-menu');
  }

  function guard(e) {
    if (!inGame()) {
      // Menu: still no pinch zoom, but scrolling and inputs work normally.
      if (e.touches && e.touches.length > 1) e.preventDefault();
      return;
    }
    var t = e.target;
    if (t && t.closest && t.closest(ALLOW)) {
      if (e.touches && e.touches.length > 1) e.preventDefault();
      return;
    }
    if (e.cancelable) e.preventDefault();
  }

  ['touchstart', 'touchmove', 'touchend'].forEach(function (type) {
    document.addEventListener(type, guard, { passive: false, capture: true });
  });
  // iOS Safari pinch gestures and leftovers from older engines.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
    document.addEventListener(type, function (e) { e.preventDefault(); }, { passive: false });
  });
  document.addEventListener('dblclick', function (e) { if (inGame()) e.preventDefault(); }, { passive: false });
  document.addEventListener('selectstart', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea')) return;
    e.preventDefault();
  });
  document.addEventListener('dragstart', function (e) { e.preventDefault(); });
  // Long press on Android fires contextmenu; input.js already blocks it on
  // the window, this also covers elements that stop propagation.
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea')) return;
    e.preventDefault();
  }, { capture: true });

  // --- Fullscreen ----------------------------------------------------------

  var root = document.documentElement;
  Guard.fullscreenSupported = !!(root.requestFullscreen || root.webkitRequestFullscreen);

  Guard.isFullscreen = function () {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  };

  // Opened as a home-screen app (iOS "홈 화면에 추가" / Android install): it is
  // already fullscreen. Checked once at load — while the Fullscreen API is
  // active, display-mode also reports "fullscreen".
  Guard.installed = (window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) ||
    window.navigator.standalone === true;

  Guard.toggleFullscreen = function () {
    if (Guard.isFullscreen()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return Promise.resolve(false);
    }
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) return Promise.reject(new Error('unsupported'));
    var p = req.call(root, { navigationUI: 'hide' });
    return Promise.resolve(p).then(function () { return true; });
  };

  function updateButton() {
    var b = document.getElementById('tc-full');
    if (!b) return;
    var on = Guard.isFullscreen();
    b.textContent = on ? '⤡ 전체화면 끄기' : '⤢ 전체화면';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.hidden = Guard.installed;
  }

  Guard.init = function () {
    var b = document.getElementById('tc-full');
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      if (!Guard.fullscreenSupported) {
        // iPhone Safari: no fullscreen for web pages; a home-screen app is.
        if (CR.Hud && CR.Hud.flash) CR.Hud.flash('아이폰은 공유 버튼 → "홈 화면에 추가"로 열면 전체화면으로 플레이돼요', 'is-lap');
        return;
      }
      Guard.toggleFullscreen().catch(function () {
        if (CR.Hud && CR.Hud.flash) CR.Hud.flash('전체화면을 켤 수 없어요', 'is-lap');
      });
    });
    document.addEventListener('fullscreenchange', updateButton);
    document.addEventListener('webkitfullscreenchange', updateButton);
    updateButton();
  };

  CR.TouchGuard = Guard;
})();

// touchguard.js — the same touch protection as Circuit Race: while driving,
// long press (image menu, Look Up, Google Lens, text selection), double-tap
// zoom and pinch zoom are all blocked so every touch belongs to the game.
// Real buttons (pause, reset, view, the pause / result screens) still click,
// and the menu still scrolls.
(function () {
  'use strict';
  var ALLOW = 'a, input, textarea, button:not([data-hold]), #pause, #result';
  function inGame() { return !document.body.classList.contains('in-menu'); }
  function guard(e) {
    if (!inGame()) { if (e.touches && e.touches.length > 1) e.preventDefault(); return; }
    var t = e.target;
    if (t && t.closest && t.closest(ALLOW)) { if (e.touches && e.touches.length > 1) e.preventDefault(); return; }
    if (e.cancelable) e.preventDefault();
  }
  ['touchstart', 'touchmove', 'touchend'].forEach(function (type) {
    document.addEventListener(type, guard, { passive: false, capture: true });
  });
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
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea')) return;
    e.preventDefault();
  }, { capture: true });
})();

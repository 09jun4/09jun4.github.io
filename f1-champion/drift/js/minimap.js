// minimap.js — the whole course in the corner: road, start and goal,
// the player (orange, with heading) and the rival (red). North-up, fitted
// to the course; the road line is drawn once into an offscreen canvas.
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};
  var C = DR.Course;
  var M = {}, cv = null, ctx = null, base = null, fit = null, size = 0;

  function prepare() {
    cv = document.getElementById('minimap');
    if (!cv) return false;
    var css = cv.clientWidth || 160, dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.round(css * dpr);
    cv.width = cv.height = size;
    ctx = cv.getContext('2d');
    var S = C.samples, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    S.forEach(function (s) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); });
    var pad = size * 0.1, k = (size - 2 * pad) / Math.max(maxX - minX, maxY - minY);
    fit = { k: k, ox: (size - (maxX - minX) * k) / 2 - minX * k, oy: (size - (maxY - minY) * k) / 2 + maxY * k };
    base = document.createElement('canvas');
    base.width = base.height = size;
    var g = base.getContext('2d');
    g.lineJoin = g.lineCap = 'round';
    function path(from, to) {
      g.beginPath();
      for (var i = from; i <= to; i += 2) { var p = S[i]; if (i === from) g.moveTo(px(p.x), py(p.y)); else g.lineTo(px(p.x), py(p.y)); }
    }
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = size * 0.05; path(0, S.length - 1); g.stroke();
    g.strokeStyle = '#d9dde2'; g.lineWidth = size * 0.022; path(C.startIndex, C.finishIndex); g.stroke();
    g.strokeStyle = 'rgba(217,221,226,0.35)'; path(C.finishIndex, S.length - 1); g.stroke(); path(0, C.startIndex); g.stroke();
    marker(g, S[C.startIndex], '#5fe08f');
    marker(g, S[C.finishIndex], '#ffffff', true);
    return true;
  }
  function px(x) { return fit.ox + x * fit.k; }
  function py(y) { return fit.oy - y * fit.k; }
  function marker(g, s, color, chequer) {
    var x = px(s.x), y = py(s.y), r = size * 0.035;
    g.save(); g.translate(x, y); g.rotate(-s.heading);
    if (chequer) {
      for (var i = -2; i < 2; i++) for (var j = -1; j < 1; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(j * r, i * r / 2, r, r / 2); }
    } else { g.fillStyle = color; g.fillRect(-r * 0.35, -r * 1.2, r * 0.7, r * 2.4); }
    g.restore();
  }
  function dot(c, color, big) {
    var x = px(c.x), y = py(c.y), r = size * (big ? 0.04 : 0.032);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-c.heading);
    ctx.fillStyle = color; ctx.strokeStyle = '#111'; ctx.lineWidth = size * 0.008;
    ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
  }

  var lastW = 0;
  M.draw = function (G) {
    if (!G.player) return;
    if (!base || (cv && cv.clientWidth !== lastW)) { if (!prepare()) return; lastW = cv.clientWidth; }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(base, 0, 0);
    if (G.rival) dot(G.rival, '#ff5b5b', false);
    dot(G.player, '#ff9b3d', true);
  };
  DR.Minimap = M;
})();

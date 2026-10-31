// wheel.js — the F1 steering wheel for the cockpit view, as a 3D object.
// Load order: before cockpit.js. No dependencies.
//
// Layout follows current F1 wheels: a wide carbon plate with rubber grips,
// 15 shift-light LEDs above a central screen (5 green, 5 red, 5 blue; all
// flash blue at the shift point), three warning LEDs either side of the
// screen, coloured push buttons on both shoulders, thumb wheels for the
// differential (ENTRY / MID / EXIT / TORQ), toggle switches, and three big
// rotaries along the bottom (STRAT, MODE, HPP). No team logo.
//
// The wheel is designed on a 1000 x 640 sheet and built in 3D by
// cockpit.js, which hands in proj(x, y, depth): sheet point + depth in
// metres towards the driver -> screen point. The plate has thickness (its
// edges show), and the grips, buttons, rotary knobs, thumb wheels and
// toggles stand out from it (no driver's hands, so every control shows): each is drawn as the side walls that face
// the eye plus a front cap. Flat artwork (carbon weave, screen, labels) is
// painted on each face with that face's own transform (exact, because the
// wheel faces the camera).
//
// Wheel3D.draw(ctx, view, s, now)
//   view = { proj(x, y, d) -> {x, y} | null, toEye(x, y, d, nx, ny) -> bool,
//            dpr, side }
//   s = { gear, kph, rpm, shift (0..1 lights), flash, lap, laps, pos,
//         lapTime, delta, ers, bb, eb, mode, tyres[4], flagL, flagR, accent }
(function () {
  'use strict';
  window.CR = window.CR || {};

  var SHEET_W = 1000, SHEET_H = 640;
  var PLATE_T = 0.032, GRIP_FRONT = 0.03, GRIP_BACK = 0.035; // m
  var BTN_H = 0.011, KNOB_H = 0.02, DRUM_H = 0.012, TOGGLE_H = 0.014;

  // Push buttons: [cx, cy, colour, label, text colour]
  var BUTTONS = [
    [196, 146, '#f4c430', 'PIT', '#1a1a1a'], [248, 128, '#2a6fdb', '+10', '#fff'], [298, 142, '#27a844', 'N', '#fff'],
    [244, 196, '#f07a1a', 'TALK', '#fff'], [296, 214, '#202329', 'BB-', '#fff'],
    [292, 270, '#f07a1a', 'DR', '#fff'], [236, 258, '#d8262e', 'X', '#fff'], [204, 366, '#202329', 'BB+', '#fff'],
    [804, 146, '#f4c430', 'PL', '#1a1a1a'], [752, 128, '#2a6fdb', '+1', '#fff'], [702, 142, '#1f4f9e', 'OT', '#fff'],
    [756, 196, '#27a844', 'MARK', '#fff'], [704, 214, '#202329', 'BB+', '#fff'],
    [708, 270, '#27a844', 'DRS', '#fff'], [764, 258, '#e9edf2', 'OK', '#1a1a1a'], [796, 366, '#202329', '-1', '#fff'],
  ];
  var THUMBS = [[192, 212, '#c8202a', 'ENTRY', '345'], [808, 212, '#2a6fdb', 'EXIT', '678'], [256, 318, '#f07a1a', 'MID', '234'], [744, 318, '#9b5de5', 'TORQ', '456']];
  var TOGGLES = [[308, 350, 'BMIG'], [692, 350, 'BBAL']];
  var ROTARIES = [[394, 432, 37, '#f4c430', 'STRAT', 3], [500, 456, 41, '#9b5de5', 'MODE', 7], [606, 432, 37, '#2fc48d', 'HPP', 5]];
  var RING = ['#e63946', '#f4a261', '#f4c430', '#8ac926', '#2fc48d', '#1fb5d6', '#2a6fdb', '#6c5ce7', '#b14ec7', '#e056a0', '#f1f1f1', '#9aa0a6'];

  var GRIP = 'M 172 150 C 122 138 78 158 72 214 C 64 300 56 400 62 490 C 68 556 128 594 180 570 C 214 554 230 520 228 474 L 214 262 Z';
  var PLATE = 'M 236 88 Q 500 66 764 88 Q 846 96 854 168 L 856 300 Q 856 364 800 400 L 726 448 Q 708 532 640 540 L 360 540 Q 292 532 274 448 L 200 400 Q 144 364 144 300 L 146 168 Q 154 96 236 88 Z';

  var NUM = "'Roboto Condensed', 'Arial Narrow', 'Segoe UI', Arial, sans-serif";
  var LBL = "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";

  // --- Outlines: SVG path (absolute M L Q C Z) -> polyline ---------------------
  function flatten(d) {
    var tok = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g), pts = [], i = 0, cx = 0, cy = 0, cmd = '';
    function num() { return +tok[i++]; }
    while (i < tok.length) {
      if (/[MLQCZ]/.test(tok[i])) cmd = tok[i++];
      if (cmd === 'Z') break;
      if (cmd === 'M' || cmd === 'L') { cx = num(); cy = num(); pts.push([cx, cy]); }
      else if (cmd === 'Q') {
        var qx = num(), qy = num(), ex = num(), ey = num();
        for (var t = 1; t <= 8; t++) { var u = t / 8, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; pts.push([a * cx + b * qx + c * ex, a * cy + b * qy + c * ey]); }
        cx = ex; cy = ey;
      } else if (cmd === 'C') {
        var x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        for (var k = 1; k <= 8; k++) {
          var w = k / 8, m = 1 - w;
          pts.push([m * m * m * cx + 3 * m * m * w * x1 + 3 * m * w * w * x2 + w * w * w * x3, m * m * m * cy + 3 * m * m * w * y1 + 3 * m * w * w * y2 + w * w * w * y3]);
        }
        cx = x3; cy = y3;
      }
    }
    return pts;
  }
  function inside(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  }
  function mirrorPath(d) {
    var p = new Path2D();
    p.addPath(new Path2D(d), new DOMMatrix([-1, 0, 0, 1, SHEET_W, 0]));
    return p;
  }
  // Outline with an outward normal per edge (sheet units, y down).
  function outline(d, mirror) {
    var pts = flatten(d);
    if (mirror) pts = pts.map(function (p) { return [SHEET_W - p[0], p[1]]; });
    var edges = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      var nx = dy / l, ny = -dx / l;
      if (inside(pts, (a[0] + b[0]) / 2 + nx * 2, (a[1] + b[1]) / 2 + ny * 2)) { nx = -nx; ny = -ny; }
      edges.push({ a: a, b: b, nx: nx, ny: ny });
    }
    return { pts: pts, edges: edges, path: mirror ? mirrorPath(d) : new Path2D(d) };
  }
  var PLATE_O = outline(PLATE), GRIPS = [outline(GRIP), outline(GRIP, true)];

  // --- Drawing helpers -----------------------------------------------------------

  function setFace(ctx, view, depth) {
    // Affine for the plane at this depth (exact: the wheel faces the camera).
    var o = view.proj(0, 0, depth), ex = view.proj(SHEET_W, 0, depth), ey = view.proj(0, SHEET_H, depth);
    if (!o || !ex || !ey) return false;
    var d = view.dpr;
    ctx.setTransform(d * (ex.x - o.x) / SHEET_W, d * (ex.y - o.y) / SHEET_W, d * (ey.x - o.x) / SHEET_H, d * (ey.y - o.y) / SHEET_H, d * o.x, d * o.y);
    return true;
  }
  function resetT(ctx, view) { ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); }

  var shadeCache = {};
  function shadeHex(hex, k) {
    var key = hex + (k * 32 | 0);
    if (shadeCache[key]) return shadeCache[key];
    var v = parseInt(hex.slice(1), 16), q = (k * 32 | 0) / 32;
    return (shadeCache[key] = 'rgb(' + Math.min(255, ((v >> 16) & 255) * q | 0) + ',' + Math.min(255, ((v >> 8) & 255) * q | 0) + ',' + Math.min(255, (v & 255) * q | 0) + ')');
  }

  // Side walls of an outline between two depths, only those facing the eye.
  function walls(ctx, view, o, d0, d1, base) {
    for (var i = 0; i < o.edges.length; i++) {
      var e = o.edges[i];
      if (!view.toEye((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (d0 + d1) / 2, e.nx, e.ny)) continue;
      var p0 = view.proj(e.a[0], e.a[1], d0), p1 = view.proj(e.b[0], e.b[1], d0), p2 = view.proj(e.b[0], e.b[1], d1), p3 = view.proj(e.a[0], e.a[1], d1);
      if (!p0 || !p1 || !p2 || !p3) continue;
      // light from above: walls facing up (sheet -y) are brighter
      ctx.fillStyle = shadeHex(base, 0.6 + 0.5 * Math.max(0, -e.ny) + 0.15 * Math.max(0, e.nx * view.side));
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.7; ctx.stroke(); // close hairline seams
    }
  }

  // A cylinder standing out of the face: base disc + side band (screen space).
  function cylinder(ctx, view, cx, cy, r, d0, d1, side) {
    var b = view.proj(cx, cy, d0), t = view.proj(cx, cy, d1), br = view.proj(cx + r, cy, d0), tr = view.proj(cx + r, cy, d1);
    if (!b || !t || !br || !tr) return false;
    var rb = Math.hypot(br.x - b.x, br.y - b.y), rt = Math.hypot(tr.x - t.x, tr.y - t.y);
    var dx = t.x - b.x, dy = t.y - b.y, l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
    ctx.fillStyle = side;
    ctx.beginPath(); ctx.arc(b.x, b.y, rb, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x + px * rb, b.y + py * rb); ctx.lineTo(t.x + px * rt, t.y + py * rt);
    ctx.lineTo(t.x - px * rt, t.y - py * rt); ctx.lineTo(b.x - px * rb, b.y - py * rb);
    ctx.closePath(); ctx.fill();
    return true;
  }

  // Rectangle on the sheet standing out of the face (side walls only).
  function box(ctx, view, x0, y0, x1, y1, d0, d1, base) {
    walls(ctx, view, { edges: [
      { a: [x0, y0], b: [x1, y0], nx: 0, ny: -1 }, { a: [x1, y0], b: [x1, y1], nx: 1, ny: 0 },
      { a: [x1, y1], b: [x0, y1], nx: 0, ny: 1 }, { a: [x0, y1], b: [x0, y0], nx: -1, ny: 0 },
    ] }, d0, d1, base);
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  function text(g, s, x, y, font, fill, align) {
    g.font = font; g.fillStyle = fill; g.textAlign = align || 'center'; g.fillText(s, x, y);
  }

  // --- The flat artwork on the plate (drawn once into an image) ------------------

  var art = null;
  function carbonPattern(g) {
    var c = document.createElement('canvas');
    c.width = c.height = 14;
    var x = c.getContext('2d');
    x.fillStyle = '#121418'; x.fillRect(0, 0, 14, 14);
    x.fillStyle = '#1d2026'; x.fillRect(0, 0, 7, 14);
    x.fillStyle = '#262a31'; x.fillRect(7, 7, 7, 7);
    x.fillStyle = '#181b20'; x.fillRect(0, 0, 7, 7);
    var p = g.createPattern(c, 'repeat');
    if (p.setTransform) p.setTransform(new DOMMatrix().rotate(45));
    return p;
  }

  function buildArt() {
    var S = 2, c = document.createElement('canvas');
    c.width = SHEET_W * S; c.height = SHEET_H * S;
    var g = c.getContext('2d');
    g.scale(S, S);
    g.fillStyle = '#2a2d33'; // paddles behind the shoulders
    g.fill(new Path2D('M 150 110 L 92 96 Q 70 92 74 116 L 150 150 Z'));
    g.fill(new Path2D('M 850 110 L 908 96 Q 930 92 926 116 L 850 150 Z'));
    var plate = new Path2D(PLATE);
    g.fillStyle = carbonPattern(g); g.fill(plate);
    var gl = g.createLinearGradient(0, 70, 0, 540);
    gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.03)'); gl.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gl; g.fill(plate);
    g.strokeStyle = '#4a4f58'; g.lineWidth = 1.5; g.stroke(plate);
    [[214, 112], [786, 112], [330, 512], [670, 512], [170, 368], [830, 368]].forEach(function (s) {
      g.beginPath(); g.arc(s[0], s[1], 4.5, 0, Math.PI * 2); g.fillStyle = '#5d636c'; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
    });
    rr(g, 344, 98, 312, 22, 11); g.fillStyle = '#050608'; g.fill(); g.strokeStyle = '#2b2f36'; g.lineWidth = 1.5; g.stroke();
    rr(g, 340, 126, 320, 214, 14); g.fillStyle = '#050607'; g.fill(); g.strokeStyle = '#2b2f36'; g.lineWidth = 2; g.stroke();
    var sg = g.createLinearGradient(0, 134, 0, 332); sg.addColorStop(0, '#0b0f14'); sg.addColorStop(1, '#030507');
    rr(g, 348, 134, 304, 198, 8); g.fillStyle = sg; g.fill();
    g.strokeStyle = '#1f2a33'; g.lineWidth = 1.5;
    line(g, 438, 140, 438, 268); line(g, 562, 140, 562, 268); line(g, 354, 270, 646, 270);
    text(g, 'KPH', 394, 186, '700 10px ' + LBL, '#8fa3b3');
    text(g, 'LAP TIME', 606, 180, '700 9.5px ' + LBL, '#8fa3b3');
    text(g, 'ERS', 358, 289, '700 10px ' + LBL, '#8fa3b3', 'left');
    rr(g, 384, 280, 170, 12, 2); g.fillStyle = '#1a1f26'; g.fill();
    BUTTONS.forEach(function (b) { g.beginPath(); g.arc(b[0], b[1], 20.5, 0, Math.PI * 2); g.fillStyle = '#0a0b0d'; g.fill(); g.strokeStyle = '#3b3f46'; g.lineWidth = 1.5; g.stroke(); });
    THUMBS.forEach(function (t) {
      rr(g, t[0] - 16, t[1] - 30, 32, 60, 7); g.fillStyle = '#0a0b0d'; g.fill(); g.strokeStyle = '#3b3f46'; g.lineWidth = 1.5; g.stroke();
      text(g, t[3], t[0], t[1] + 46, '700 10px ' + LBL, '#d9dde3');
    });
    TOGGLES.forEach(function (t) {
      rr(g, t[0] - 14, t[1] - 20, 28, 40, 6); g.fillStyle = '#0a0b0d'; g.fill(); g.strokeStyle = '#3b3f46'; g.lineWidth = 1.5; g.stroke();
      text(g, t[2], t[0], t[1] + 34, '700 10px ' + LBL, '#d9dde3');
    });
    ROTARIES.forEach(function (r) {
      var cx = r[0], cy = r[1], R = r[2];
      g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fillStyle = '#0a0b0d'; g.fill(); g.strokeStyle = '#3b3f46'; g.lineWidth = 1.5; g.stroke();
      for (var i = 0; i < 12; i++) {
        var a0 = (-150 + i * 25) * Math.PI / 180, a1 = a0 + 23 * Math.PI / 180;
        g.beginPath(); g.arc(cx, cy, R + 1, a0, a1); g.arc(cx, cy, R - 11, a1, a0, true); g.closePath();
        g.fillStyle = RING[i]; g.fill();
        var am = (a0 + a1) / 2;
        text(g, String(i + 1), cx + Math.cos(am) * (R - 5), cy + Math.sin(am) * (R - 5) + 2.6, '800 7.5px ' + LBL, '#111');
      }
      text(g, r[4], cx, cy + R + 19, '800 11px ' + LBL, '#e8ebef');
    });
    text(g, 'F1 CHAMPION', 500, 560, '700 10px ' + LBL, '#6f7680');
    return c;
  }

  function fmtLap(t) {
    if (t == null || !isFinite(t)) return '-:--.---';
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  function tyreColour(c) { return c < 80 ? '#1f6fd1' : c < 100 ? '#1c8f3c' : c < 112 ? '#d39b12' : '#c92a2a'; }
  var FLAG = { yellow: '#ffd21f', blue: '#2f7bff', green: '#29e05a', red: '#ff2a2a' };
  var OFF = '#1d2025';

  // Screen, shift lights and warning LEDs (on the face's transform).
  function drawScreen(g, s, now) {
    var lit = Math.round(s.shift * 15), flashOn = s.flash && Math.floor(now / 70) % 2 === 0;
    for (var i = 0; i < 15; i++) {
      var x = 357 + i * 20.4;
      var col = s.flash ? (flashOn ? '#2f7bff' : OFF) : i < lit ? (i < 5 ? '#29e05a' : i < 10 ? '#ff2a2a' : '#2f7bff') : OFF;
      if (col !== OFF) { g.globalAlpha = 0.35; g.beginPath(); g.arc(x, 109, 9.5, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.globalAlpha = 1; }
      g.beginPath(); g.arc(x, 109, 5.6, 0, Math.PI * 2); g.fillStyle = col; g.fill();
    }
    ['L', 'R'].forEach(function (k) {
      var f = k === 'L' ? s.flagL : s.flagR, col = f && Math.floor(now / 250) % 2 === 0 ? FLAG[f] || '#ffd21f' : OFF;
      for (var j = 0; j < 3; j++) {
        g.beginPath(); g.arc(k === 'L' ? 330 : 670, 160 + j * 30, 6, 0, Math.PI * 2);
        g.fillStyle = col; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
      }
    });
    text(g, String(Math.round(s.kph)), 394, 172, '800 30px ' + NUM, '#fff');
    text(g, s.laps ? 'L' + s.lap + '/' + s.laps : 'L' + s.lap, 394, 214, '800 17px ' + NUM, '#fff');
    if (s.pos) text(g, 'P' + s.pos, 394, 242, '800 17px ' + NUM, '#ffd23f');
    text(g, Math.round(s.rpm / 10) * 10 + ' RPM', 394, 262, '700 11px ' + NUM, '#8fa3b3');
    text(g, s.gear, 500, 238, '800 112px ' + NUM, '#fff');
    text(g, fmtLap(s.lapTime), 606, 166, '800 18px ' + NUM, '#fff');
    var faster = s.delta != null && s.delta <= 0;
    rr(g, 446, 248, 108, 18, 3);
    g.fillStyle = s.delta == null ? '#1a1f26' : faster ? '#0f3a1f' : '#3d1214'; g.fill();
    text(g, s.delta == null ? '+-.---' : (faster ? '-' : '+') + Math.abs(s.delta).toFixed(3), 500, 262, '800 15px ' + NUM, s.delta == null ? '#8fa3b3' : faster ? '#3dff7a' : '#ff4d4d');
    for (var k = 0; k < 4; k++) {
      var tx = 580 + (k % 2) * 34, ty = 192 + Math.floor(k / 2) * 34;
      rr(g, tx - 15, ty, 30, 28, 4); g.fillStyle = tyreColour(s.tyres[k]); g.fill();
      text(g, String(Math.round(s.tyres[k])), tx, ty + 19, '800 12px ' + NUM, '#fff');
    }
    var ers = Math.max(0, Math.min(1, s.ers));
    if (ers > 0) { rr(g, 384, 280, Math.max(4, 170 * ers), 12, 2); g.fillStyle = ers < 0.2 ? '#ff4d4d' : '#f4c430'; g.fill(); }
    text(g, Math.round(ers * 100) + '%', 560, 290, '800 11px ' + NUM, '#fff', 'left');
    text(g, 'BB ' + s.bb.toFixed(1), 358, 320, '800 14px ' + NUM, '#fff', 'left');
    text(g, 'EB ' + s.eb, 470, 320, '800 14px ' + NUM, '#fff', 'left');
    text(g, s.mode || 'RACE', 642, 320, '800 12px ' + NUM, '#9b5de5', 'right');
  }

  // --- Per frame -----------------------------------------------------------------

  var Wheel3D = {};

  Wheel3D.draw = function (ctx, view, s, now) {
    if (!art) art = buildArt();
    ctx.save();
    // 1. Plate thickness (edges behind the face) and the grips' sides.
    walls(ctx, view, PLATE_O, -PLATE_T, 0, '#22252c');
    GRIPS.forEach(function (o) { walls(ctx, view, o, -GRIP_BACK, GRIP_FRONT, '#2d2f33'); });
    // 2. Grip fronts (rubber), standing proud of the plate.
    GRIPS.forEach(function (o, k) {
      if (setFace(ctx, view, GRIP_FRONT)) {
        var gr = ctx.createLinearGradient(k ? 940 : 60, 0, k ? 780 : 220, 0);
        gr.addColorStop(0, '#46494f'); gr.addColorStop(0.5, '#2a2c30'); gr.addColorStop(1, '#18191c');
        ctx.fillStyle = gr; ctx.fill(o.path);
      }
      resetT(ctx, view);
    });
    // 3. The plate's face with its artwork, screen and lights.
    if (setFace(ctx, view, 0)) {
      ctx.drawImage(art, 0, 0, SHEET_W, SHEET_H);
      drawScreen(ctx, s, now);
    }
    resetT(ctx, view);
    // 4. Controls standing out of the face.
    ROTARIES.forEach(function (r) {
      var cx = r[0], cy = r[1], R = r[2] - 13;
      if (cylinder(ctx, view, cx, cy, R, 0, KNOB_H, '#15171b') && setFace(ctx, view, KNOB_H)) {
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        var g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 1, cx, cy, R);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, r[3]); g.addColorStop(1, shadeHex(r[3], 0.55));
        ctx.fillStyle = g; ctx.fill();
        var pa = (-150 + (r[5] - 0.5) * 25) * Math.PI / 180;
        ctx.beginPath(); ctx.moveTo(cx - 5 * Math.sin(pa), cy + 5 * Math.cos(pa)); ctx.lineTo(cx + Math.cos(pa) * (R + 3), cy + Math.sin(pa) * (R + 3));
        ctx.lineTo(cx + 5 * Math.sin(pa), cy - 5 * Math.cos(pa)); ctx.closePath(); ctx.fillStyle = '#111'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      }
      resetT(ctx, view);
    });
    THUMBS.forEach(function (t) {
      box(ctx, view, t[0] - 11, t[1] - 26, t[0] + 11, t[1] + 26, 0, DRUM_H, t[2]);
      if (setFace(ctx, view, DRUM_H)) {
        rr(ctx, t[0] - 11, t[1] - 26, 22, 52, 5); ctx.fillStyle = t[2]; ctx.fill();
        var g = ctx.createLinearGradient(0, t[1] - 26, 0, t[1] + 26);
        g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = g; ctx.fill();
        for (var i = 0; i < 3; i++) { ctx.globalAlpha = i === 1 ? 1 : 0.55; text(ctx, t[4][i], t[0], t[1] - 6 + (i - 1) * 15 + 10, '800 11px ' + LBL, '#fff'); }
        ctx.globalAlpha = 1;
      }
      resetT(ctx, view);
    });
    TOGGLES.forEach(function (t) {
      box(ctx, view, t[0] - 9, t[1] - 15, t[0] + 9, t[1] + 15, 0, TOGGLE_H, '#c9a227');
      if (setFace(ctx, view, TOGGLE_H)) {
        rr(ctx, t[0] - 9, t[1] - 15, 18, 30, 4); ctx.fillStyle = '#d8b13a'; ctx.fill();
        ctx.strokeStyle = '#7a5f10'; ctx.lineWidth = 2;
        for (var i = -1; i <= 1; i++) line(ctx, t[0] - 6, t[1] + i * 7, t[0] + 6, t[1] + i * 7);
      }
      resetT(ctx, view);
    });
    BUTTONS.forEach(function (b) {
      if (cylinder(ctx, view, b[0], b[1], 17, 0, BTN_H, shadeHex(b[2], 0.55)) && setFace(ctx, view, BTN_H)) {
        ctx.beginPath(); ctx.arc(b[0], b[1], 17, 0, Math.PI * 2);
        var g = ctx.createRadialGradient(b[0] - 6, b[1] - 7, 1, b[0], b[1], 18);
        g.addColorStop(0, shadeHex(b[2], 1.6)); g.addColorStop(0.45, b[2]); g.addColorStop(1, shadeHex(b[2], 0.7));
        ctx.fillStyle = g; ctx.fill();
        text(ctx, b[3], b[0], b[1] + 4.5, '800 ' + (b[3].length > 3 ? 9.5 : b[3].length > 2 ? 11 : 13) + 'px ' + LBL, b[4]);
      }
      resetT(ctx, view);
    });
    ctx.restore();
  };

  Wheel3D.SHEET = { w: SHEET_W, h: SHEET_H, cx: 500, cy: 330 };
  CR.Wheel3D = Wheel3D;
})();

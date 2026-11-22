// fp-hands.js — the driver's forearms and gloves in the cockpit view, drawn
// on the steering wheel (wheel.js) so they turn with it.
// Load order: after wheel.js, before cockpit.js. Depends on: Wheel3D (at call time).
//
// The gloves are painted on the wheel's own face transform (Wheel3D.setFace),
// just in front of the grips: back of the hand and knuckle pad on the grip,
// four fingers curled round its inner edge, the thumb resting on the plate by
// the buttons, a gauntlet with its strap over the cuff of the suit. The
// forearms run from the wrists to elbows that stay put in the cockpit, so
// they swing as the wheel turns. Small motions: a finger flick on the paddle
// at each gear change (right = up, left = down), the thumb reaching for a
// button (left: PIT limiter / BOOST, right: MOM), a buzz on the kerbs.
// Colours: the team's race suit (cockpit.js passes the car livery).
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Hands = { flick: [0, 0], thumb: [0, 0], thumbTo: [0, 0] };
  // thumb targets on the sheet (left hand; the right one is mirrored)
  var BTN = { pit: [196, 146], boost: [244, 196], ot: [298, 142] };

  function shade(hex, k) {
    var v = parseInt(hex.slice(1), 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    var f = function (c) { return Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k))); };
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }
  function lum(hex) { var v = parseInt(hex.slice(1), 16); return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255; }
  // the suit colours, as hi-crew.js Crew.teamColours
  Hands.colours = function (main, dark, accent) {
    dark = dark || main; accent = accent || main;
    var panel = Math.abs(lum(main) - lum(dark)) > 0.06 ? main : accent;
    var pipe = accent !== panel ? accent : (lum(panel) > 0.5 ? '#16181d' : '#eef0f3');
    // gloves a touch lighter than a near-black suit so they read against the black grips
    return { suit: dark, panel: panel, pipe: pipe, glove: lum(dark) > 0.5 ? dark : lum(dark) < 0.08 ? '#2a2d34' : dark };
  };

  // Per frame (cockpit.js): s = {gear, kerb 0..1, pit, boost, ot}
  var lastGear = null;
  Hands.update = function (dt, s) {
    if (lastGear !== null && s.gear !== lastGear) Hands.flick[s.gear > lastGear ? 1 : 0] = 1;
    lastGear = s.gear;
    for (var i = 0; i < 2; i++) Hands.flick[i] = Math.max(0, Hands.flick[i] - dt * 6);
    var want = [s.pit ? 1 : s.boost ? 1 : 0, s.ot ? 1 : 0];
    Hands.thumbTo = [s.pit ? 'pit' : 'boost', 'ot'];
    for (var j = 0; j < 2; j++) Hands.thumb[j] += (want[j] - Hands.thumb[j]) * Math.min(1, dt * 12);
    Hands.kerb = s.kerb || 0;
  };

  function capsule(ctx, x0, y0, x1, y1, r0, r1) {
    var dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x0 + nx * r0, y0 + ny * r0);
    ctx.lineTo(x1 + nx * r1, y1 + ny * r1);
    ctx.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2, true);
    ctx.lineTo(x0 - nx * r0, y0 - ny * r0);
    ctx.arc(x0, y0, r0, a - Math.PI / 2, a + Math.PI / 2, true);
    ctx.closePath();
  }

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // One glove in sheet coordinates (left hand; mirrored for the right).
  function glove(ctx, col, k) {
    var G = col.glove, f = Hands.flick[k], th = Hands.thumb[k], jit = (Hands.kerb || 0) * 3;
    var jx = (Math.random() - 0.5) * jit, jy = (Math.random() - 0.5) * jit;
    ctx.save();
    ctx.translate(jx + f * 5, jy);
    // soft shadow on the grip
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(150, 370, 92, 150, 0.05, 0, Math.PI * 2); ctx.fill();
    // gauntlet over the suit cuff, strap in the panel colour
    var gg = ctx.createLinearGradient(56, 0, 176, 0);
    gg.addColorStop(0, shade(G, 0.6)); gg.addColorStop(0.45, shade(G, 1.3)); gg.addColorStop(1, shade(G, 0.7));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(66, 420); ctx.bezierCurveTo(60, 470, 64, 520, 74, 556); ctx.lineTo(166, 550); ctx.bezierCurveTo(172, 510, 172, 466, 166, 424); ctx.closePath(); ctx.fill();
    var sg = ctx.createLinearGradient(0, 474, 0, 504);
    sg.addColorStop(0, shade(col.panel, 1.25)); sg.addColorStop(1, shade(col.panel, 0.75));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(64, 478); ctx.lineTo(170, 472); ctx.lineTo(171, 500); ctx.lineTo(66, 506); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(68, 504, 100, 3);
    // back of the hand: rounded, raised in the middle
    var bg = ctx.createLinearGradient(70, 250, 214, 440);
    bg.addColorStop(0, shade(G, 1.45)); bg.addColorStop(0.4, shade(G, 1.15)); bg.addColorStop(1, shade(G, 0.7));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(72, 438); ctx.bezierCurveTo(60, 380, 62, 300, 92, 258);
    ctx.bezierCurveTo(120, 236, 176, 238, 208, 256);
    ctx.bezierCurveTo(216, 320, 218, 380, 212, 420); ctx.bezierCurveTo(186, 444, 120, 450, 72, 438); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.ellipse(132, 340, 44, 70, -0.15, 0, Math.PI * 2); ctx.fill();
    // fingers curled round the inner edge of the grip (tips go behind it)
    var fy = [256, 296, 336, 374], fh = [38, 38, 36, 30];
    for (var i = 0; i < 4; i++) {
      var y0 = fy[i] - (i === 0 ? f * 8 : 0), x0 = 188, x1 = 238 + (i === 0 ? f * 6 : 0), cy = y0 + fh[i] / 2;
      var fg = ctx.createLinearGradient(0, y0, 0, y0 + fh[i]);
      fg.addColorStop(0, shade(G, 1.5)); fg.addColorStop(0.5, shade(G, 1.1)); fg.addColorStop(1, shade(G, 0.55));
      ctx.fillStyle = fg;
      capsule(ctx, x0, cy, x1, cy + 3, fh[i] / 2 - 2, fh[i] / 2 - 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; // the tip turning behind the grip
      capsule(ctx, x1 - 6, cy + 3, x1, cy + 3, fh[i] / 2 - 4, fh[i] / 2 - 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x0 + 4, y0 + fh[i] - 1); ctx.lineTo(x1 - 4, y0 + fh[i] + 1); ctx.stroke(); // gap to the next finger
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(218, y0 + 7); ctx.lineTo(216, y0 + fh[i] - 7); ctx.stroke(); // knuckle crease
    }
    // knuckle guard: three pads in the panel colour
    for (var q = 0; q < 3; q++) {
      var px = 104 + q * 32, pg = ctx.createLinearGradient(0, 258, 0, 296);
      pg.addColorStop(0, shade(col.panel, 1.3)); pg.addColorStop(1, shade(col.panel, 0.7));
      ctx.fillStyle = pg;
      rrect(ctx, px, 262 - q * 2, 28, 30, 9); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(80, 428); ctx.bezierCurveTo(72, 360, 80, 306, 100, 300); ctx.stroke();
    ctx.setLineDash([]);
    // thumb: resting on the plate, or reaching for a button
    var rest = [244, 212], to = BTN[Hands.thumbTo[k]] || rest;
    var tx = rest[0] + (to[0] - rest[0]) * th, ty = rest[1] + (to[1] - rest[1]) * th;
    var mx = (176 + tx) / 2 + 6, my = (280 + ty) / 2 + 4;
    var tg = ctx.createLinearGradient(170, 290, tx, ty);
    tg.addColorStop(0, shade(G, 0.9)); tg.addColorStop(1, shade(G, 1.45));
    ctx.fillStyle = tg;
    capsule(ctx, 172, 282, mx, my, 26, 21); ctx.fill();
    capsule(ctx, mx, my, tx, ty, 21, 16 - th * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 18, 0, Math.PI * 2); ctx.stroke(); // joint
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.ellipse(tx - 4, ty - 4, 8, 5, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Forearm from the elbow (screen point) to the wrist (screen point).
  function forearm(ctx, e, w, re, rw, col, dpr) {
    var dx = w.x - e.x, dy = w.y - e.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = ctx.createLinearGradient(e.x + nx * re, e.y + ny * re, e.x - nx * re, e.y - ny * re);
    g.addColorStop(0, shade(col.suit, 0.5)); g.addColorStop(0.35, shade(col.suit, 1.15)); g.addColorStop(1, shade(col.suit, 0.45));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(e.x + nx * re, e.y + ny * re); ctx.lineTo(w.x + nx * rw, w.y + ny * rw);
    ctx.lineTo(w.x - nx * rw, w.y - ny * rw); ctx.lineTo(e.x - nx * re, e.y - ny * re); ctx.closePath(); ctx.fill();
    // stripe down the outside (panel colour) with piping
    var s0 = 0.55, s1 = 0.85;
    [[s0 - 0.12, s0, col.pipe], [s0, s1, col.panel]].forEach(function (b) {
      ctx.fillStyle = b[2];
      ctx.beginPath();
      ctx.moveTo(e.x + nx * re * b[0], e.y + ny * re * b[0]); ctx.lineTo(w.x + nx * rw * b[0], w.y + ny * rw * b[0]);
      ctx.lineTo(w.x + nx * rw * b[1], w.y + ny * rw * b[1]); ctx.lineTo(e.x + nx * re * b[1], e.y + ny * re * b[1]); ctx.closePath(); ctx.fill();
    });
  }

  // view: wheelView from cockpit.js + pt3 (cockpit point of a sheet point), P (project cockpit point), eye
  Hands.draw = function (ctx, view, col) {
    var W3 = CR.Wheel3D;
    if (!W3 || !W3.setFace || !view.pt3) return;
    ctx.save();
    [0, 1].forEach(function (k) {
      var sd = k ? 1 : -1;
      // wrist on the sheet (left hand at x ~110) and the elbow in the cockpit
      var wsx = k ? 1000 - 112 : 112, wsy = 520;
      var w3 = view.pt3(wsx, wsy, 0.05), e3 = [sd * 0.25, view.eye[1] + 0.05, view.eye[2] - 0.5];
      var w = view.P(w3[0], w3[1], w3[2]), e = view.P(e3[0], e3[1], e3[2]);
      if (!e) e = view.P(w3[0] + (e3[0] - w3[0]) * 0.6, w3[1] + (e3[1] - w3[1]) * 0.6, w3[2] + (e3[2] - w3[2]) * 0.6);
      if (w && e) {
        var wx = view.P(w3[0] + 0.05, w3[1], w3[2]), ex = view.P(e3[0] + 0.065, e3[1], e3[2]);
        var rw = wx ? Math.abs(wx.x - w.x) : 20, re = ex ? Math.abs(ex.x - e.x) : rw * 1.6;
        forearm(ctx, e, w, Math.min(re, rw * 3), rw, col, view.dpr);
      }
      if (!W3.setFace(ctx, view, 0.05)) return;
      if (k) { ctx.translate(1000, 0); ctx.scale(-1, 1); }
      glove(ctx, col, k);
    });
    ctx.restore();
  };

  CR.Hands = Hands;
})();

// wheel.js — the F1 steering wheel for the cockpit view (SVG).
// Load order: before cockpit.js. No dependencies.
//
// Layout follows current F1 wheels: a wide carbon plate with rubber grips,
// 15 shift-light LEDs above a central screen (5 green, 5 red, 5 blue; all
// flash blue at the shift point), three warning LEDs either side of the
// screen, coloured push buttons on both shoulders, thumb wheels for the
// differential (ENTRY / MID / EXIT), toggle switches for brake balance,
// and three big rotaries along the bottom (STRAT, MODE, HPP). No team logo.
//
// Wheel.build(parent) -> root element.  Wheel.update(root, s) each frame:
//   s = { gear, kph, rpm, rpmFrac, shift (0..1 lights), flash (bool),
//         lap, laps, pos, lapTime, delta (s or null), ers (0..1), bb, eb,
//         tyres [fl, fr, rl, rr] °C, flagL, flagR ('yellow'|'blue'|...),
//         steer (-1..1, + = left), accent }
(function () {
  'use strict';
  window.CR = window.CR || {};

  var NS = 'http://www.w3.org/2000/svg';
  var W = 1000, H = 640;

  // Push buttons: [cx, cy, colour, label, text colour]
  var BUTTONS = [
    // left shoulder
    [196, 146, '#f4c430', 'PIT', '#1a1a1a'], [248, 128, '#2a6fdb', '+10', '#fff'], [298, 142, '#27a844', 'N', '#fff'],
    [244, 196, '#f07a1a', 'TALK', '#fff'], [296, 214, '#202329', 'BB-', '#fff'],
    [292, 270, '#f07a1a', 'DR', '#fff'], [236, 258, '#d8262e', 'X', '#fff'],
    [204, 366, '#202329', 'BB+', '#fff'],
    // right shoulder
    [804, 146, '#f4c430', 'PL', '#1a1a1a'], [752, 128, '#2a6fdb', '+1', '#fff'], [702, 142, '#1f4f9e', 'OT', '#fff'],
    [756, 196, '#27a844', 'MARK', '#fff'], [704, 214, '#202329', 'BB+', '#fff'],
    [708, 270, '#27a844', 'DRS', '#fff'], [764, 258, '#e9edf2', 'OK', '#1a1a1a'],
    [796, 366, '#202329', '-1', '#fff'],
  ];
  // Thumb wheels (rolling drums): [cx, cy, colour, label, digits]
  var THUMBS = [
    [192, 212, '#c8202a', 'ENTRY', '345'],
    [808, 212, '#2a6fdb', 'EXIT', '678'],
    [256, 318, '#f07a1a', 'MID', '234'],
    [744, 318, '#9b5de5', 'TORQ', '456'],
  ];
  // Gold toggle switches: [cx, cy, label]
  var TOGGLES = [[308, 350, 'BMIG'], [692, 350, 'BBAL']];
  // Rotaries: [cx, cy, r, colour, label, position 1..12]
  var ROTARIES = [
    [394, 432, 37, '#f4c430', 'STRAT', 3],
    [500, 456, 41, '#9b5de5', 'MODE', 7],
    [606, 432, 37, '#2fc48d', 'HPP', 5],
  ];
  var RING = ['#e63946', '#f4a261', '#f4c430', '#8ac926', '#2fc48d', '#1fb5d6', '#2a6fdb', '#6c5ce7', '#b14ec7', '#e056a0', '#f1f1f1', '#9aa0a6'];

  function el(tag, attrs, parent, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  var GRIP = 'M 172 150 C 122 138 78 158 72 214 C 64 300 56 400 62 490 C 68 556 128 594 180 570 C 214 554 230 520 228 474 L 214 262 Z';
  var PLATE = 'M 236 88 Q 500 66 764 88 Q 846 96 854 168 L 856 300 Q 856 364 800 400 L 726 448 Q 708 532 640 540 L 360 540 Q 292 532 274 448 L 200 400 Q 144 364 144 300 L 146 168 Q 154 96 236 88 Z';
  var GLOVE = 'M 66 232 C 56 280 54 346 60 398 C 66 436 86 452 114 450 L 150 444 C 166 440 172 426 170 410 L 166 330 C 166 312 160 300 150 294 L 152 284 C 156 258 146 238 128 228 C 108 216 76 214 66 232 Z';
  var THUMB = 'M 150 296 C 162 284 184 280 198 286 C 208 290 208 302 198 306 C 184 312 168 314 156 316 Z';

  function defs(svg) {
    var d = el('defs', {}, svg);
    // Twill-weave carbon fibre.
    var p = el('pattern', { id: 'cw-carbon', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, d);
    el('rect', { width: 10, height: 10, fill: '#121418' }, p);
    el('rect', { width: 5, height: 10, fill: '#1c1f25' }, p);
    el('rect', { x: 5, y: 5, width: 5, height: 5, fill: '#24282f' }, p);
    el('rect', { x: 0, y: 0, width: 5, height: 5, fill: '#181b20' }, p);
    var gloss = el('linearGradient', { id: 'cw-gloss', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.16 }, gloss);
    el('stop', { offset: '0.35', 'stop-color': '#fff', 'stop-opacity': 0.03 }, gloss);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': 0.35 }, gloss);
    var rub = el('linearGradient', { id: 'cw-rubber', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
    el('stop', { offset: '0', 'stop-color': '#3a3d43' }, rub);
    el('stop', { offset: '0.45', 'stop-color': '#26282c' }, rub);
    el('stop', { offset: '1', 'stop-color': '#17181b' }, rub);
    var btn = el('radialGradient', { id: 'cw-btn', cx: '35%', cy: '30%', r: '75%' }, d);
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.55 }, btn);
    el('stop', { offset: '0.35', 'stop-color': '#fff', 'stop-opacity': 0.08 }, btn);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': 0.35 }, btn);
    var glove = el('linearGradient', { id: 'cw-glove', x1: 0, y1: 0, x2: 1, y2: 1 }, d);
    el('stop', { offset: '0', 'stop-color': '#2b3242' }, glove);
    el('stop', { offset: '1', 'stop-color': '#10131a' }, glove);
    var glow = el('filter', { id: 'cw-glow', x: '-1', y: '-1', width: 3, height: 3 }, d);
    el('feGaussianBlur', { stdDeviation: 3.5 }, glow);
    var scr = el('linearGradient', { id: 'cw-screen', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    el('stop', { offset: '0', 'stop-color': '#0b0f14' }, scr);
    el('stop', { offset: '1', 'stop-color': '#030507' }, scr);
  }

  function button(g, b) {
    var cx = b[0], cy = b[1], r = 17;
    el('circle', { cx: cx, cy: cy + 2, r: r + 4, fill: '#000', opacity: 0.55 }, g);
    el('circle', { cx: cx, cy: cy, r: r + 3, fill: '#0a0b0d', stroke: '#3b3f46', 'stroke-width': 1.5 }, g);
    el('circle', { cx: cx, cy: cy, r: r, fill: b[2] }, g);
    el('circle', { cx: cx, cy: cy, r: r, fill: 'url(#cw-btn)' }, g);
    el('text', { x: cx, y: cy + 4.5, 'text-anchor': 'middle', 'font-size': b[3].length > 3 ? 9.5 : b[3].length > 2 ? 11 : 13, 'font-weight': 800, fill: b[4], class: 'cw-font' }, g, b[3]);
  }

  function thumb(g, t) {
    var cx = t[0], cy = t[1];
    el('rect', { x: cx - 16, y: cy - 30, width: 32, height: 60, rx: 7, fill: '#0a0b0d', stroke: '#3b3f46', 'stroke-width': 1.5 }, g);
    el('rect', { x: cx - 11, y: cy - 26, width: 22, height: 52, rx: 5, fill: t[2] }, g);
    for (var i = 0; i < 3; i++) {
      el('text', { x: cx, y: cy - 10 + i * 15, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#fff', opacity: i === 1 ? 1 : 0.55, class: 'cw-font' }, g, t[4][i]);
    }
    el('rect', { x: cx - 11, y: cy - 26, width: 22, height: 52, rx: 5, fill: 'url(#cw-btn)', opacity: 0.6 }, g);
    var side = cx < W / 2 ? -1 : 1;
    el('text', { x: cx, y: cy + 46, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#d9dde3', 'letter-spacing': 0.6, class: 'cw-font' }, g, t[3]);
    return side;
  }

  function toggle(g, t) {
    var cx = t[0], cy = t[1];
    el('rect', { x: cx - 14, y: cy - 20, width: 28, height: 40, rx: 6, fill: '#0a0b0d', stroke: '#3b3f46', 'stroke-width': 1.5 }, g);
    el('rect', { x: cx - 9, y: cy - 15, width: 18, height: 30, rx: 4, fill: '#c9a227' }, g);
    for (var i = -1; i <= 1; i++) el('line', { x1: cx - 6, y1: cy + i * 7, x2: cx + 6, y2: cy + i * 7, stroke: '#7a5f10', 'stroke-width': 2 }, g);
    el('text', { x: cx, y: cy + 34, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#d9dde3', 'letter-spacing': 0.6, class: 'cw-font' }, g, t[2]);
  }

  function rotary(g, r) {
    var cx = r[0], cy = r[1], R = r[2];
    el('circle', { cx: cx, cy: cy + 3, r: R + 6, fill: '#000', opacity: 0.5 }, g);
    el('circle', { cx: cx, cy: cy, r: R + 4, fill: '#0a0b0d', stroke: '#3b3f46', 'stroke-width': 1.5 }, g);
    // Coloured setting ring with numbers.
    for (var i = 0; i < 12; i++) {
      var a0 = (-150 + i * 25) * Math.PI / 180, a1 = a0 + 23 * Math.PI / 180;
      var ri = R - 11, ro = R + 1;
      var d = 'M ' + (cx + Math.cos(a0) * ri) + ' ' + (cy + Math.sin(a0) * ri) +
        ' L ' + (cx + Math.cos(a0) * ro) + ' ' + (cy + Math.sin(a0) * ro) +
        ' A ' + ro + ' ' + ro + ' 0 0 1 ' + (cx + Math.cos(a1) * ro) + ' ' + (cy + Math.sin(a1) * ro) +
        ' L ' + (cx + Math.cos(a1) * ri) + ' ' + (cy + Math.sin(a1) * ri) +
        ' A ' + ri + ' ' + ri + ' 0 0 0 ' + (cx + Math.cos(a0) * ri) + ' ' + (cy + Math.sin(a0) * ri) + ' Z';
      el('path', { d: d, fill: RING[i] }, g);
      var am = (a0 + a1) / 2;
      el('text', { x: cx + Math.cos(am) * (R - 5), y: cy + Math.sin(am) * (R - 5) + 3, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 800, fill: '#111', class: 'cw-font' }, g, String(i + 1));
    }
    // Knob with a pointer.
    el('circle', { cx: cx, cy: cy, r: R - 13, fill: r[3] }, g);
    el('circle', { cx: cx, cy: cy, r: R - 13, fill: 'url(#cw-btn)' }, g);
    var pa = (-150 + (r[5] - 0.5) * 25) * Math.PI / 180;
    el('path', { d: 'M ' + (cx - 5) + ' ' + cy + ' L ' + (cx + Math.cos(pa) * (R - 10)) + ' ' + (cy + Math.sin(pa) * (R - 10)) + ' L ' + (cx + 5) + ' ' + cy + ' Z', fill: '#111', transform: '' }, g);
    el('circle', { cx: cx, cy: cy, r: 7, fill: '#111' }, g);
    el('text', { x: cx, y: cy + R + 19, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8ebef', 'letter-spacing': 0.8, class: 'cw-font' }, g, r[4]);
  }

  var Wheel = {};

  Wheel.build = function (parent) {
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'cw', 'aria-hidden': 'true' });
    defs(svg);
    var rot = el('g', { class: 'cw-rot' }, svg); // rotated with the steering
    rot.style.transformOrigin = '500px 330px';

    // Grips (rubber) behind the plate.
    el('path', { d: GRIP, fill: 'url(#cw-rubber)', stroke: '#0c0d0f', 'stroke-width': 3 }, rot);
    el('path', { d: GRIP, fill: 'url(#cw-rubber)', stroke: '#0c0d0f', 'stroke-width': 3, transform: 'translate(1000,0) scale(-1,1)' }, rot);
    // Paddles peeking out behind the shoulders.
    el('path', { d: 'M 150 110 L 92 96 Q 70 92 74 116 L 150 150 Z', fill: '#2a2d33' }, rot);
    el('path', { d: 'M 850 110 L 908 96 Q 930 92 926 116 L 850 150 Z', fill: '#2a2d33' }, rot);

    // Carbon plate with gloss and edge.
    el('path', { d: PLATE, fill: 'url(#cw-carbon)', stroke: '#050607', 'stroke-width': 5 }, rot);
    el('path', { d: PLATE, fill: 'url(#cw-gloss)' }, rot);
    el('path', { d: PLATE, fill: 'none', stroke: '#4a4f58', 'stroke-width': 1.5, opacity: 0.8 }, rot);
    // Screws.
    [[214, 112], [786, 112], [330, 512], [670, 512], [170, 368], [830, 368]].forEach(function (s) {
      el('circle', { cx: s[0], cy: s[1], r: 4.5, fill: '#5d636c', stroke: '#111', 'stroke-width': 1 }, rot);
    });

    // Shift lights: 15 LEDs across the top.
    var leds = [];
    var ledBar = el('g', {}, rot);
    el('rect', { x: 344, y: 98, width: 312, height: 22, rx: 11, fill: '#050608', stroke: '#2b2f36', 'stroke-width': 1.5 }, ledBar);
    for (var i = 0; i < 15; i++) {
      var lx = 357 + i * 20.4;
      el('circle', { cx: lx, cy: 109, r: 6.4, fill: '#15181c' }, ledBar);
      var glow = el('circle', { cx: lx, cy: 109, r: 8, fill: 'none', filter: 'url(#cw-glow)', opacity: 0 }, ledBar);
      var dot = el('circle', { cx: lx, cy: 109, r: 5.6, fill: '#1d2025' }, ledBar);
      leds.push({ dot: dot, glow: glow, base: i < 5 ? '#29e05a' : i < 10 ? '#ff2a2a' : '#2f7bff' });
    }
    // Warning LEDs beside the screen (3 each side).
    var side = { L: [], R: [] };
    for (var j = 0; j < 3; j++) {
      side.L.push(el('circle', { cx: 330, cy: 160 + j * 30, r: 6, fill: '#1d2025', stroke: '#000', 'stroke-width': 1.5 }, rot));
      side.R.push(el('circle', { cx: 670, cy: 160 + j * 30, r: 6, fill: '#1d2025', stroke: '#000', 'stroke-width': 1.5 }, rot));
    }

    // Screen.
    el('rect', { x: 340, y: 126, width: 320, height: 214, rx: 14, fill: '#050607', stroke: '#2b2f36', 'stroke-width': 2 }, rot);
    el('rect', { x: 348, y: 134, width: 304, height: 198, rx: 8, fill: 'url(#cw-screen)' }, rot);
    var scr = el('g', { class: 'cw-screen' }, rot);
    // grid lines like the race page
    el('line', { x1: 438, y1: 140, x2: 438, y2: 268, stroke: '#1f2a33', 'stroke-width': 1.5 }, scr);
    el('line', { x1: 562, y1: 140, x2: 562, y2: 268, stroke: '#1f2a33', 'stroke-width': 1.5 }, scr);
    el('line', { x1: 354, y1: 270, x2: 646, y2: 270, stroke: '#1f2a33', 'stroke-width': 1.5 }, scr);
    var t = {};
    t.kph = el('text', { x: 394, y: 172, 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, '0');
    el('text', { x: 394, y: 186, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#8fa3b3', class: 'cw-font' }, scr, 'KPH');
    t.lap = el('text', { x: 394, y: 214, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, 'L1');
    t.pos = el('text', { x: 394, y: 242, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: '#ffd23f', class: 'cw-num' }, scr, '');
    t.rpm = el('text', { x: 394, y: 262, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#8fa3b3', class: 'cw-num' }, scr, '');
    t.gear = el('text', { x: 500, y: 238, 'text-anchor': 'middle', 'font-size': 112, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, 'N');
    t.lapTime = el('text', { x: 606, y: 166, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, '0:00.000');
    el('text', { x: 606, y: 180, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: '#8fa3b3', class: 'cw-font' }, scr, 'LAP TIME');
    // Tyre temperatures (2 x 2).
    t.tyres = [];
    for (var k = 0; k < 4; k++) {
      var tx = 580 + (k % 2) * 34, ty = 192 + Math.floor(k / 2) * 34;
      var box = el('rect', { x: tx - 15, y: ty, width: 30, height: 28, rx: 4, fill: '#1c8f3c' }, scr);
      var txt = el('text', { x: tx, y: ty + 19, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, '90');
      t.tyres.push({ box: box, txt: txt });
    }
    // Delta bar under the gear.
    t.deltaBg = el('rect', { x: 446, y: 248, width: 108, height: 18, rx: 3, fill: '#13311f' }, scr);
    t.delta = el('text', { x: 500, y: 262, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: '#3dff7a', class: 'cw-num' }, scr, '-0.000');
    // Bottom strip: ERS state of charge, brake balance, engine braking.
    el('text', { x: 358, y: 289, 'font-size': 10, 'font-weight': 700, fill: '#8fa3b3', class: 'cw-font' }, scr, 'ERS');
    el('rect', { x: 384, y: 280, width: 170, height: 12, rx: 2, fill: '#1a1f26' }, scr);
    t.ers = el('rect', { x: 384, y: 280, width: 120, height: 12, rx: 2, fill: '#f4c430' }, scr);
    t.ersTxt = el('text', { x: 560, y: 290, 'font-size': 11, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, '70%');
    t.bb = el('text', { x: 358, y: 320, 'font-size': 14, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, 'BB 56.5');
    t.eb = el('text', { x: 470, y: 320, 'font-size': 14, 'font-weight': 800, fill: '#fff', class: 'cw-num' }, scr, 'EB 6');
    t.mode = el('text', { x: 642, y: 320, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 800, fill: '#9b5de5', class: 'cw-num' }, scr, 'RACE');

    // Shoulder controls and rotaries.
    var ctl = el('g', {}, rot);
    THUMBS.forEach(function (x) { thumb(ctl, x); });
    TOGGLES.forEach(function (x) { toggle(ctl, x); });
    BUTTONS.forEach(function (x) { button(ctl, x); });
    ROTARIES.forEach(function (x) { rotary(ctl, x); });
    // Silkscreen labels.
    el('text', { x: 500, y: 560, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#6f7680', 'letter-spacing': 3, class: 'cw-font' }, ctl, 'F1 CHAMPION');

    // Gloves on the grips (the accent stripe follows the car).
    var gl = el('g', { class: 'cw-gloves' }, rot);
    var gloveL = el('g', {}, gl), gloveR = el('g', { transform: 'translate(1000,0) scale(-1,1)' }, gl);
    [gloveL, gloveR].forEach(function (g) {
      el('path', { d: GLOVE, fill: 'url(#cw-glove)', stroke: '#07080b', 'stroke-width': 3 }, g);
      el('path', { d: 'M 62 330 C 90 326 130 330 166 330', fill: 'none', stroke: '#3a4152', 'stroke-width': 2 }, g);
      el('path', { d: 'M 60 370 C 90 368 130 372 168 370', fill: 'none', stroke: '#3a4152', 'stroke-width': 2 }, g);
      el('path', { d: 'M 62 410 C 92 408 130 412 170 408', fill: 'none', stroke: '#3a4152', 'stroke-width': 2 }, g);
      g._accent = el('path', { d: 'M 76 242 C 98 232 122 234 140 246', fill: 'none', stroke: '#ffd23f', 'stroke-width': 7, 'stroke-linecap': 'round' }, g);
      el('path', { d: THUMB, fill: 'url(#cw-glove)', stroke: '#07080b', 'stroke-width': 3 }, g);
    });

    parent.appendChild(svg);
    svg._w = { rot: rot, leds: leds, side: side, t: t, gloves: [gloveL, gloveR], last: {} };
    return svg;
  };

  function setText(node, key, cache, v) {
    if (cache[key] !== v) { cache[key] = v; node.textContent = v; }
  }
  function setAttr(node, name, key, cache, v) {
    if (cache[key] !== v) { cache[key] = v; node.setAttribute(name, v); }
  }

  function fmtLap(t) {
    if (t == null || !isFinite(t)) return '-:--.---';
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  function tyreColour(c) {
    return c < 80 ? '#1f6fd1' : c < 100 ? '#1c8f3c' : c < 112 ? '#d39b12' : '#c92a2a';
  }
  var FLAG = { yellow: '#ffd21f', blue: '#2f7bff', green: '#29e05a', red: '#ff2a2a', white: '#f2f4f8' };

  Wheel.update = function (svg, s, now) {
    var w = svg._w, c = w.last, t = w.t;
    // Steering: the wheel turns ~±90° at full lock.
    var ang = -(s.steer || 0) * 90;
    var rotKey = Math.round(ang * 4) / 4;
    if (c.rot !== rotKey) { c.rot = rotKey; w.rot.style.transform = 'rotate(' + rotKey + 'deg)'; }

    // Shift lights: fill green -> red -> blue; all blue flashing at the shift point.
    var lit = Math.round(s.shift * 15);
    var flashOn = s.flash && Math.floor(now / 70) % 2 === 0;
    for (var i = 0; i < 15; i++) {
      var L = w.leds[i];
      var col = s.flash ? (flashOn ? '#2f7bff' : '#1d2025') : i < lit ? L.base : '#1d2025';
      if (L.col !== col) {
        L.col = col;
        L.dot.setAttribute('fill', col);
        var on = col !== '#1d2025';
        L.glow.setAttribute('fill', on ? col : 'none');
        L.glow.setAttribute('opacity', on ? 0.85 : 0);
      }
    }
    // Warning LEDs.
    ['L', 'R'].forEach(function (k) {
      var f = k === 'L' ? s.flagL : s.flagR;
      var col = f && Math.floor(now / 250) % 2 === 0 ? FLAG[f] || '#ffd21f' : '#1d2025';
      if (c['f' + k] !== col) {
        c['f' + k] = col;
        w.side[k].forEach(function (n) { n.setAttribute('fill', col); });
      }
    });

    setText(t.gear, 'gear', c, s.gear);
    setText(t.kph, 'kph', c, String(Math.round(s.kph)));
    setText(t.rpm, 'rpm', c, Math.round(s.rpm / 10) * 10 + ' RPM');
    setText(t.lap, 'lap', c, s.laps ? 'L' + s.lap + '/' + s.laps : 'L' + s.lap);
    setText(t.pos, 'pos', c, s.pos ? 'P' + s.pos : '');
    setText(t.lapTime, 'lt', c, fmtLap(s.lapTime));
    if (s.delta == null) {
      setText(t.delta, 'dl', c, '+-.---');
      setAttr(t.delta, 'fill', 'dlc', c, '#8fa3b3');
      setAttr(t.deltaBg, 'fill', 'dlb', c, '#1a1f26');
    } else {
      var faster = s.delta <= 0;
      setText(t.delta, 'dl', c, (faster ? '-' : '+') + Math.abs(s.delta).toFixed(3));
      setAttr(t.delta, 'fill', 'dlc', c, faster ? '#3dff7a' : '#ff4d4d');
      setAttr(t.deltaBg, 'fill', 'dlb', c, faster ? '#0f3a1f' : '#3d1214');
    }
    var ers = Math.max(0, Math.min(1, s.ers));
    setAttr(t.ers, 'width', 'ers', c, String(Math.round(170 * ers)));
    setAttr(t.ers, 'fill', 'ersc', c, ers < 0.2 ? '#ff4d4d' : '#f4c430');
    setText(t.ersTxt, 'erst', c, Math.round(ers * 100) + '%');
    setText(t.bb, 'bb', c, 'BB ' + s.bb.toFixed(1));
    setText(t.eb, 'eb', c, 'EB ' + s.eb);
    setText(t.mode, 'md', c, s.mode || 'RACE');
    for (var k = 0; k < 4; k++) {
      var temp = Math.round(s.tyres[k]);
      setText(w.t.tyres[k].txt, 'ty' + k, c, String(temp));
      setAttr(w.t.tyres[k].box, 'fill', 'tyc' + k, c, tyreColour(temp));
    }
    if (s.accent && c.accent !== s.accent) {
      c.accent = s.accent;
      w.gloves.forEach(function (g) { g._accent.setAttribute('stroke', s.accent); });
    }
  };

  CR.Wheel = Wheel;
})();

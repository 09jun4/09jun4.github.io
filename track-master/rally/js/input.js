// input.js — RallyInput: keyboard, gamepad and touch, each a separate
// device object with the same output, so a racing wheel can be added later
// as one more device. The active device is the last one used.
//  Keyboard: W gas, S brake / reverse, A D steer, Space handbrake,
//    Shift up / Ctrl down (also E / Q), 1-6 + N gears (MANUAL),
//    R recover, C camera, B brake-bias panel, [ ] bias, Esc pause.
//  Keyboard steering and pedals are smoothed (ramp up / return to centre),
//  the steering ramp is slower at speed.
//  Gamepad (standard mapping): left stick steer, RT gas, LT brake,
//    A handbrake, RB / LB gears, Y camera, X recover, D-pad left/right bias,
//    Start pause.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  var I = { keys: {}, edges: {}, touch: {}, device: 'keyboard', state: { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, padPrev: [] };
  var EDGE_KEYS = { ShiftLeft: 'up', ShiftRight: 'up', KeyE: 'up', ControlLeft: 'down', ControlRight: 'down', KeyQ: 'down',
    KeyR: 'recover', KeyC: 'camera', KeyB: 'biasUI', BracketLeft: 'biasDown', BracketRight: 'biasUp', Escape: 'pause', KeyP: 'pause',
    Digit1: 'g1', Digit2: 'g2', Digit3: 'g3', Digit4: 'g4', Digit5: 'g5', Digit6: 'g6', KeyN: 'g0', KeyF: 'fps', KeyM: 'mute' };
  var GAME_KEYS = /^(Key[WASDQERCBNMFP]|Arrow|Space|Shift|Control|Bracket|Digit[0-6]|Escape)/;

  I.attach = function (isPlaying) {
    I.isPlaying = isPlaying;
    G.addEventListener('keydown', function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (!I.keys[e.code] && EDGE_KEYS[e.code]) I.edges[EDGE_KEYS[e.code]] = true;
      I.keys[e.code] = true; I.device = 'keyboard';
      if (isPlaying() && GAME_KEYS.test(e.code)) e.preventDefault();
    });
    G.addEventListener('keyup', function (e) { I.keys[e.code] = false; });
    G.addEventListener('blur', function () { I.keys = {}; I.touch = {}; });
  };

  // Touch buttons: [data-hold] (held) and [data-tap] (edge).
  I.bindTouch = function (root) {
    root.querySelectorAll('[data-hold]').forEach(function (b) {
      var k = b.getAttribute('data-hold');
      function on(e) { e.preventDefault(); I.touch[k] = 1; b.classList.add('on'); I.device = 'touch'; }
      function off(e) { if (e) e.preventDefault(); I.touch[k] = 0; b.classList.remove('on'); }
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    });
    root.querySelectorAll('[data-tap]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); I.edges[b.getAttribute('data-tap')] = true; });
    });
  };

  function pad() {
    var ps = G.navigator && navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].connected && ps[i].mapping === 'standard') return ps[i];
    for (i = 0; i < ps.length; i++) if (ps[i] && ps[i].connected) return ps[i];
    return null;
  }

  // Read everything once per frame. speed (m/s) shapes the keyboard steering.
  I.read = function (dt, speed) {
    var k = I.keys, t = I.touch, s = I.state, out = { edges: I.edges };
    I.edges = {};
    var gp = pad(), padOut = null;
    if (gp) {
      var ax = gp.axes[0] || 0, dz = 0.08;
      var st = Math.abs(ax) < dz ? 0 : Math.sign(ax) * Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.35);
      var btn = function (n) { var b = gp.buttons[n]; return b ? (typeof b === 'object' ? b.value : b) : 0; };
      var pressed = function (n) { var b = gp.buttons[n]; return !!(b && (b.pressed || b.value > 0.5)); };
      padOut = { steer: st, throttle: btn(7), brake: btn(6), handbrake: pressed(0) ? 1 : 0 };
      if (Math.abs(st) > 0.15 || padOut.throttle > 0.1 || padOut.brake > 0.1 || padOut.handbrake) I.device = 'gamepad';
      var map = { 5: 'up', 4: 'down', 3: 'camera', 2: 'recover', 15: 'biasUp', 14: 'biasDown', 9: 'pause', 8: 'biasUI' };
      for (var n in map) { var p = pressed(+n); if (p && !I.padPrev[n]) out.edges[map[n]] = true; I.padPrev[n] = p; }
    }
    if (I.device === 'gamepad' && padOut) {
      s.steer = padOut.steer; s.throttle = padOut.throttle; s.brake = padOut.brake; s.handbrake = padOut.handbrake;
    } else {
      var left = k.KeyA || k.ArrowLeft || t.left, right = k.KeyD || k.ArrowRight || t.right;
      var target = (right ? 1 : 0) - (left ? 1 : 0);
      // keyboard steering: ramps toward the target, slower at speed,
      // returns to centre faster
      var v = speed || 0, rate = target === 0 ? 4.2 : (Math.sign(target) !== Math.sign(s.steer) && s.steer !== 0 ? 5.5 : 3.4 - 1.9 * clamp(v / 40, 0, 1));
      var d = target - s.steer; s.steer += clamp(d, -rate * dt, rate * dt);
      var gas = k.KeyW || k.ArrowUp || t.gas ? 1 : 0, brk = k.KeyS || k.ArrowDown || t.brake ? 1 : 0;
      s.throttle += clamp(gas - s.throttle, -dt / 0.1, dt / 0.16);
      s.brake += clamp(brk - s.brake, -dt / 0.08, dt / 0.12);
      s.handbrake = k.Space || t.handbrake ? 1 : 0;
    }
    out.steer = s.steer; out.throttle = s.throttle; out.brake = s.brake; out.handbrake = s.handbrake;
    out.shiftUp = !!out.edges.up; out.shiftDown = !!out.edges.down;
    for (var g = 0; g <= 6; g++) if (out.edges['g' + g]) out.gear = g;
    return out;
  };
  I.reset = function () { I.state = { steer: 0, throttle: 0, brake: 0, handbrake: 0 }; I.edges = {}; };

  RL.Input = I;
})(typeof window !== 'undefined' ? window : globalThis);

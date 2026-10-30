// input.js — keyboard state: digital throttle/brake (S, ↓, Space)/steer; R = restart after retiring; Esc = pause; M = mute;
// mouse left/right click = shift up/down (edge-triggered).
// Load order: 3rd. Depends on: Config.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Input = {
    state: {
      throttle: 0,
      brake: 0,
      steerTarget: 0,
    },
  };

  var pressedKeys = new Set();

  // On-screen touch controls (mobile). Held flags merged with the keyboard.
  var touch = { left: false, right: false, gas: false, brake: false };
  var lastTouchTime = -1e9;
  // Touch play has no mouse buttons to shift with, so gears change
  // automatically once the touch controls have been used.
  Input.autoShift = false;

  var ACCEL_KEYS = ['ArrowUp', 'KeyW'];
  var BRAKE_KEYS = ['Space', 'ArrowDown', 'KeyS'];
  var LEFT_KEYS = ['ArrowLeft', 'KeyA'];
  var RIGHT_KEYS = ['ArrowRight', 'KeyD'];

  function anyPressed(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (pressedKeys.has(keys[i])) return true;
    }
    return false;
  }

  function recomputeState() {
    Input.state.throttle = anyPressed(ACCEL_KEYS) || touch.gas ? 1 : 0;
    Input.state.brake = anyPressed(BRAKE_KEYS) || touch.brake ? 1 : 0;
    var left = anyPressed(LEFT_KEYS) || touch.left;
    var right = anyPressed(RIGHT_KEYS) || touch.right;
    // steerTarget=+1 must mean "turn left" to match PLAN.md's world convention
    // (heading increases CCW = turning left; car.js: steerAngle>0 -> yawRate>0
    // -> heading increases). Left key -> +1, right key -> -1.
    Input.state.steerTarget = left && right ? 0 : left ? 1 : right ? -1 : 0;
  }

  function onKeyDown(e) {
    pressedKeys.add(e.code);
    recomputeState();

    if (e.code === 'KeyM' && !e.repeat) CR.Audio.toggleMute();
    // Esc: pause the race / close the pause overlay again.
    if (e.code === 'Escape' && !e.repeat) {
      if (playing()) CR.Main.pause();
      else if (CR.Main && CR.Main.state === 'paused') CR.Main.resume();
      return;
    }
    if (!playing()) return;
    // Space (brake) would otherwise scroll or re-press a focused menu button.
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    // Edge-triggered actions, ignoring OS key-repeat.
    // R restarts the race, only after the car has retired.
    if (e.code === 'KeyR' && CR.Car.state.retired) CR.Main.restart();
  }

  function playing() {
    return CR.Main && CR.Main.state === 'playing';
  }

  // Shifting: left click = up, right click = down. Edge-triggered per press.
  function onMouseDown(e) {
    if (!playing()) return;
    // Taps also fire mouse events on touch screens — they must not shift.
    if (Date.now() - lastTouchTime < 1000) return;
    if (e.button === 0) CR.Car.shiftUp();
    else if (e.button === 2) CR.Car.shiftDown();
  }

  function onKeyUp(e) {
    pressedKeys.delete(e.code);
    recomputeState();
  }

  // Forget held keys (e.g. the Enter/click that started the race).
  Input.clear = function () {
    pressedKeys.clear();
    for (var k in touch) touch[k] = false;
    recomputeState();
  };

  // Wires one on-screen button to a held flag using pointer events (works
  // with several fingers at once; each button tracks its own pointer).
  function bindHold(el, flag) {
    function press(e) {
      e.preventDefault();
      lastTouchTime = Date.now();
      Input.autoShift = true;
      touch[flag] = true;
      el.classList.add('is-down');
      if (el.setPointerCapture && e.pointerId !== undefined) {
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      recomputeState();
    }
    function release() {
      touch[flag] = false;
      el.classList.remove('is-down');
      recomputeState();
    }
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // Shows the touch controls on touch screens (coarse pointer) or as soon as
  // the screen is touched.
  function enableTouchUI() {
    document.body.classList.add('touch');
  }

  Input.initTouch = function () {
    var buttons = document.querySelectorAll('[data-hold]');
    for (var i = 0; i < buttons.length; i++) bindHold(buttons[i], buttons[i].getAttribute('data-hold'));
    function tap(id, fn) {
      document.getElementById(id).addEventListener('click', function (e) {
        e.preventDefault();
        lastTouchTime = Date.now();
        fn();
      });
    }
    tap('tc-reset', function () { if (playing()) CR.Main.restart(); });
    tap('tc-menu', function () { if (playing()) CR.Main.pause(); });
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouchUI();
    window.addEventListener('touchstart', function () {
      lastTouchTime = Date.now();
      enableTouchUI();
    }, { passive: true });
  };

  Input.init = function () {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    // Right click is a downshift, not the browser menu.
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // Defensive: if the window loses focus mid-press, keys would otherwise
    // get stuck "held" forever with no keyup event.
    window.addEventListener('blur', function () {
      pressedKeys.clear();
      recomputeState();
    });
  };

  CR.Input = Input;
})();

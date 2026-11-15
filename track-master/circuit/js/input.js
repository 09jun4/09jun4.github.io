// input.js — keyboard state: digital throttle/brake (S, ↓, Space)/steer; Q/E = down/up shift;
// R = restart after retiring; Esc = pause; M = mute; mouse left/right click = shift up/down
// (all shifting is edge-triggered).
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
    if (!left && !right && tilt.on && tilt.live) Input.state.steerTarget = tilt.steer;
  }

  // --- Tilt (gyro / accelerometer) steering and haptics ------------------------------
  // Settings (this browser): steering 'buttons' | 'tilt', sensitivity, zero
  // angle, invert, vibration. Tilt steering reads the gravity direction in
  // screen coordinates (devicemotion): turning the phone like a steering
  // wheel gives an analogue steer; the left / right pads are hidden.
  var CTRL_KEY = 'track-master.circuit.controls';
  var SENS = { low: 34, mid: 24, high: 16 }; // degrees for full lock
  var tilt = { on: false, live: false, steer: 0, angle: 0, zero: 0, sens: 'mid', invert: false, vibrate: true, vibLevel: 'mid' };
  try {
    var saved = JSON.parse(localStorage.getItem(CTRL_KEY) || 'null');
    if (saved) { tilt.on = saved.mode === 'tilt'; tilt.sens = SENS[saved.sens] ? saved.sens : 'mid'; tilt.zero = +saved.zero || 0; tilt.invert = !!saved.invert; tilt.vibrate = saved.vibrate !== false; if (['low', 'mid', 'high'].indexOf(saved.vibLevel) >= 0) tilt.vibLevel = saved.vibLevel; }
  } catch (e) { /* storage unavailable */ }
  function saveCtrl() {
    try { localStorage.setItem(CTRL_KEY, JSON.stringify({ mode: tilt.on ? 'tilt' : 'buttons', sens: tilt.sens, zero: tilt.zero, invert: tilt.invert, vibrate: tilt.vibrate, vibLevel: tilt.vibLevel })); } catch (e) { /* ignore */ }
  }
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function onMotion(e) {
    var g = e.accelerationIncludingGravity;
    if (!g || g.x === null) return;
    var ax = IOS ? -g.x : g.x, ay = IOS ? -g.y : g.y;
    var th = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * Math.PI / 180;
    var sx = ax * Math.cos(th) - ay * Math.sin(th), sy = ax * Math.sin(th) + ay * Math.cos(th);
    tilt.angle = Math.atan2(sx, sy) * 180 / Math.PI;
    var a = tilt.angle - tilt.zero;
    a = ((a + 540) % 360) - 180;
    if (Math.abs(a) < 2) a = 0; else a -= a > 0 ? 2 : -2; // small dead zone
    var s = Math.max(-1, Math.min(1, a / SENS[tilt.sens]));
    tilt.steer = tilt.invert ? -s : s;
    tilt.live = true;
    recomputeState();
  }
  function startTilt() {
    var go = function () { window.addEventListener('devicemotion', onMotion); };
    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
      return DeviceMotionEvent.requestPermission().then(function (r) { if (r === 'granted') { go(); return true; } return false; }).catch(function () { return false; });
    }
    go();
    return Promise.resolve(!!window.DeviceMotionEvent);
  }
  function stopTilt() { window.removeEventListener('devicemotion', onMotion); tilt.live = false; recomputeState(); }
  function applyMode() { document.body.classList.toggle('tilt-steer', tilt.on); }
  Input.tilt = tilt;
  var VIB_K = { low: 0.55, mid: 1, high: 1.6 };
  var lastEventVib = 0;
  function canVibrate() { return tilt.vibrate && document.body.classList.contains('touch') && !!navigator.vibrate; }
  function scale(p) { var k = VIB_K[tilt.vibLevel] || 1; return Array.isArray(p) ? p.map(function (v, i) { return i % 2 ? v : Math.round(v * k); }) : Math.round(p * k); }
  // Events: crashes, damage, sausage kerbs (stronger with the level).
  Input.vibrate = function (pattern) {
    if (!canVibrate()) return;
    lastEventVib = performance.now();
    try { navigator.vibrate(scale(pattern)); } catch (e) { /* not supported */ }
  };
  // Driving: engine pulses that come faster and stronger with the revs
  // (stronger with the throttle down), a short kick on every gear change.
  // Called every playing frame (main.js). Android only (iOS Safari has no vibration API).
  var vibT = 0, lastGear = 0;
  Input.driveVibe = function (dt) {
    if (!canVibrate()) return;
    var c = CR.Car.state, cfg = CR.Config, now = performance.now();
    if (c.retired || c.inPit) { lastGear = c.gear; return; }
    if (now - lastEventVib < 250) return; // let crash / kerb buzzes play out
    var k = VIB_K[tilt.vibLevel] || 1;
    if (lastGear && c.gear !== lastGear && c.speed > 3) {
      lastGear = c.gear; vibT = 0.12;
      try { navigator.vibrate(Math.round(28 * k)); } catch (e) { /* ignore */ }
      return;
    }
    lastGear = c.gear;
    var r = Math.max(0, Math.min(1, (c.rpm - cfg.IDLE_RPM) / (cfg.REDLINE_RPM - cfg.IDLE_RPM)));
    var thr = Input.state.throttle;
    vibT -= dt;
    if (vibT > 0 || (r < 0.15 && thr <= 0) || c.speed < 0.5 && thr <= 0) return;
    vibT = (0.22 - 0.16 * r) / 1; // 4.5 -> 16 pulses a second
    var len = (4 + 10 * r) * (thr > 0 ? 1 : 0.45) * k;
    if (r > 0.93) len *= 1.4; // near the limiter
    try { navigator.vibrate(Math.max(2, Math.round(len))); } catch (e) { /* ignore */ }
  };
  // Settings panel (menu 조작 fold).
  Input.buildSettings = function (panel, onSummary) {
    if (!panel) return;
    function summary() { return (tilt.on ? '기울기 조향 · 감도 ' + { low: '낮음', mid: '보통', high: '높음' }[tilt.sens] : '버튼 조향') + (tilt.vibrate ? ' · 진동 ' + { low: '약', mid: '중', high: '강' }[tilt.vibLevel] : ''); }
    function render() {
      panel.textContent = '';
      function row(label, items, cur, pick) {
        var r = document.createElement('div'); r.className = 'ctrl-row';
        var l = document.createElement('span'); l.className = 'ctrl-label'; l.textContent = label; r.appendChild(l);
        items.forEach(function (it) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'ctrl-opt' + (it[0] === cur ? ' is-on' : '');
          b.textContent = it[1]; b.setAttribute('aria-pressed', it[0] === cur ? 'true' : 'false');
          b.addEventListener('click', function () { pick(it[0]); });
          r.appendChild(b);
        });
        panel.appendChild(r);
      }
      row('조향', [['buttons', '버튼'], ['tilt', '기울기(자이로)']], tilt.on ? 'tilt' : 'buttons', function (v) {
        if (v === 'tilt') {
          startTilt().then(function (ok) {
            if (!ok) { note.textContent = '이 기기·브라우저에서 기울기 센서를 쓸 수 없어요.'; return; }
            tilt.on = true; applyMode(); saveCtrl(); render();
            setTimeout(function () { if (tilt.live) { tilt.zero = tilt.angle; saveCtrl(); } }, 300);
          });
        } else { tilt.on = false; stopTilt(); applyMode(); saveCtrl(); render(); }
      });
      if (tilt.on) {
        row('감도', [['low', '낮음'], ['mid', '보통'], ['high', '높음']], tilt.sens, function (v) { tilt.sens = v; saveCtrl(); render(); });
        row('보정', [['zero', '지금 자세를 중앙으로'], ['inv', tilt.invert ? '방향 반전 켜짐' : '방향 반전']], null, function (v) {
          if (v === 'zero' && tilt.live) tilt.zero = tilt.angle;
          if (v === 'inv') tilt.invert = !tilt.invert;
          saveCtrl(); render();
        });
      }
      row('진동', [['off', '끄기'], ['low', '약'], ['mid', '중'], ['high', '강']], tilt.vibrate ? tilt.vibLevel : 'off', function (v) {
        tilt.vibrate = v !== 'off';
        if (v !== 'off') { tilt.vibLevel = v; try { navigator.vibrate && navigator.vibrate(scale([30, 60, 30])); } catch (e) { /* ignore */ } }
        saveCtrl(); render();
      });
      var note = document.createElement('p'); note.className = 'ctrl-note';
      note.textContent = tilt.on ? '휴대폰을 핸들처럼 좌우로 돌려 조향해요. 차를 세운 자세에서 \'지금 자세를 중앙으로\'를 눌러 맞추세요.' : '기울기 조향은 휴대폰·태블릿에서 쓸 수 있어요(아이폰은 센서 권한을 물어봐요).';
      note.textContent += ' 진동은 충돌·파손·연석과 주행(엔진 회전수가 오를수록 빠르고 강하게, 변속 때 툭) 모두에 쓰여요. 아이폰 사파리는 진동을 지원하지 않아요.';
      panel.appendChild(note);
      if (onSummary) onSummary(summary());
    }
    render();
    applyMode();
    if (tilt.on) startTilt(); // permission persists on Android; iOS asks again on the next tap
  };

  function onKeyDown(e) {
    pressedKeys.add(e.code);
    recomputeState();

    if (e.code === 'KeyM' && !e.repeat) CR.Audio.toggleMute();
    if (e.code === 'KeyC' && !e.repeat && CR.Main && CR.Main.state === 'playing') CR.Cockpit.toggle();
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
    // Keyboard shifting: Q = down, E = up (left/right click stays the same).
    if (e.code === 'KeyQ') CR.Car.shiftDown();
    else if (e.code === 'KeyE') CR.Car.shiftUp();
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

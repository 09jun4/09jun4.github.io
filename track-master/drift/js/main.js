// main.js — drift race: menu, countdown, race loop, cameras, input, HUD, AI.
// Modes: 'ta' (downhill time attack, ranked) and 'battle' (1:1 against an
// AI car; first to the goal wins). Views: chase camera and bonnet (C).
(function () {
  'use strict';
  var DR = window.DR, C = DR.Course, P = DR.Physics, Cars = DR.Cars, Sc = DR.Score;
  var $ = function (id) { return document.getElementById(id); };

  var G = {
    state: 'menu', // menu | countdown | race | done | paused
    mode: 'ta',
    carId: 'ae86',
    view: 'chase',
    time: 0, countdown: 0,
    player: null, rival: null,
    models: {},
  };
  try {
    var pref = JSON.parse(localStorage.getItem('f1-champion.drift-ui')) || {};
    if (Cars.byId[pref.car]) G.carId = pref.car;
    if (pref.mode === 'battle') G.mode = 'battle';
    if (pref.view === 'hood') G.view = 'hood';
    if (pref.gfx === 'low' || pref.gfx === 'high') G.gfx = pref.gfx;
  } catch (e) { /* defaults */ }
  // Graphics: 'high' (shadows, antialiasing, dense forest) or 'low' (no
  // shadows, lower resolution, a lighter forest and shorter view, plus an
  // automatic resolution drop if the frame rate still falls). Phones and
  // tablets start on low.
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (!G.gfx) G.gfx = coarse ? 'low' : 'high';
  DR.GFX = G.gfx;
  var LOW = G.gfx === 'low';
  function savePref(course) { try { localStorage.setItem('f1-champion.drift-ui', JSON.stringify({ car: G.carId, mode: G.mode, view: G.view, course: course || C.SLUG, gfx: G.gfx })); } catch (e) { /* ignore */ } }

  // --- three.js setup --------------------------------------------------------
  var canvas = $('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !LOW, powerPreference: 'high-performance' });
  var dpr = window.devicePixelRatio || 1;
  var pixelScale = LOW ? Math.min(1, dpr) * 0.8 : Math.min(dpr, 1.6);
  renderer.setPixelRatio(pixelScale);
  renderer.shadowMap.enabled = !LOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(62, 1, 0.1, LOW ? 1100 : 3000);
  // Low: if frames still take too long, render at a lower resolution.
  var perf = { t: 0, frames: 0 };
  function adapt(dt) {
    if (!LOW) return;
    perf.t += dt; perf.frames++;
    if (perf.t < 2) return;
    var fps = perf.frames / perf.t;
    perf.t = 0; perf.frames = 0;
    if (fps < 45 && pixelScale > 0.5) { pixelScale = Math.max(0.5, pixelScale - 0.1); renderer.setPixelRatio(pixelScale); resize(); }
  }
  DR.World.build(scene, renderer);
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 75 : 62;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function model(id, slot) {
    var key = id + ':' + slot;
    if (!G.models[key]) { G.models[key] = Cars.build(id); scene.add(G.models[key]); }
    return G.models[key];
  }
  function hideModels() { Object.keys(G.models).forEach(function (k) { G.models[k].visible = false; }); }

  // Places a car's model from its physics state.
  var tmpV = new THREE.Vector3();
  function syncModel(m, c, dt) {
    m.visible = true;
    m.position.set(c.x, c.h, -c.y);
    m.rotation.y = c.heading;
    var body = m.userData.body, s = C.samples[c.idx];
    var grade = s.grade * Math.cos(c.heading - s.heading);
    var bank = s.grade * Math.sin(c.heading - s.heading);
    var k = Math.min(1, dt * 6);
    c.pitch += (Math.atan(grade) - Math.max(-0.05, Math.min(0.05, c.accel * 0.006)) - c.pitch) * k;
    c.roll += (Math.max(-0.07, Math.min(0.07, -c.latAcc * 0.006)) + Math.atan(bank) * 0 - c.roll) * k;
    body.rotation.set(c.roll, 0, c.pitch);
    var wheels = m.userData.wheels, steerA = c.steer * c.p.MAX_STEER_ANGLE * (c.drifting ? 1 : Math.max(0.35, 1 - c.speed / 50));
    for (var i = 0; i < wheels.length; i++) {
      var w = wheels[i];
      w.userData.spin.rotation.z = -c.wheelSpin;
      w.rotation.y = w.userData.front ? steerA : 0;
    }
    if (m.userData.tail) m.userData.tail.emissive.setHex(c.braking ? 0xff2020 : 0x220000);
  }

  // --- Input -----------------------------------------------------------------
  var keys = {}, touch = { left: 0, right: 0, gas: 0, brake: 0, drift: 0 };
  window.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    DR.Audio.unlock();
    if (e.repeat) return;
    if (e.code === 'Escape') { if (G.state === 'race' || G.state === 'countdown') pause(); else if (G.state === 'paused') resume(); }
    if (e.code === 'KeyC') toggleView();
    if (e.code === 'KeyR' && G.state === 'race') resetCar(G.player);
    if (e.code === 'KeyM') { DR.Audio.setMuted(!DR.Audio.muted); }
    if (e.code === 'KeyE' || e.code === 'KeyQ') { if (G.player && G.state === 'race') { G.player.autoGear = false; P.shift(G.player, e.code === 'KeyE'); hudGearMode(); } }
    if (e.code === 'KeyT' && G.player) { G.player.autoGear = !G.player.autoGear; hudGearMode(); }
    if (e.code === 'Enter' && G.state === 'menu') start();
    if (e.code === 'Enter' && G.state === 'done') start();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  Array.prototype.forEach.call(document.querySelectorAll('[data-hold]'), function (b) {
    var k = b.getAttribute('data-hold');
    function on(e) { e.preventDefault(); touch[k] = 1; b.classList.add('on'); DR.Audio.unlock(); }
    function off(e) { e.preventDefault(); touch[k] = 0; b.classList.remove('on'); }
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  function playerInput() {
    var l = keys.KeyA || keys.ArrowLeft || touch.left, r = keys.KeyD || keys.ArrowRight || touch.right;
    return {
      throttle: keys.KeyW || keys.ArrowUp || touch.gas ? 1 : 0,
      brake: keys.KeyS || keys.ArrowDown || touch.brake ? 1 : 0,
      drift: keys.Space || touch.drift ? 1 : 0,
      steer: (l ? 1 : 0) - (r ? 1 : 0),
    };
  }

  // --- AI driver -----------------------------------------------------------------
  // See ai.js: drifts every corner; the rival's pace follows the player's so
  // the two stay about a second apart.
  function aiInput(c) { return DR.AI.input(c); }

  // --- Race flow ---------------------------------------------------------------
  function resetCar(c) {
    if (!c) return;
    var i = Math.max(C.startIndex, Math.min(C.samples.length - 4, c.idx));
    P.place(c, i, 0);
    c.idx = i;
  }

  function pickRival() {
    var others = Cars.list.filter(function (s) { return s.id !== G.carId; });
    return others[(Math.random() * others.length) | 0];
  }

  function start() {
    DR.Audio.unlock();
    DR.Audio.reset();
    DR.World.clearSkids();
    hideModels();
    var spec = Cars.byId[G.carId];
    G.player = P.create(spec);
    P.place(G.player, C.startIndex - 3, G.mode === 'battle' ? 3.6 : 0);
    G.player.model = model(spec.id, 'p');
    G.player.lane = 0;
    DR.AI.prepare(G.player, 0.6); // drives the car in after the finish
    G.rival = null;
    if (G.mode === 'battle') {
      var rs = pickRival();
      G.rival = P.create(rs);
      P.place(G.rival, C.startIndex - 3, -3.6);
      G.rival.lane = -2.5;
      DR.AI.prepare(G.rival, 0.9);
      G.rival.model = model(rs.id, 'r');
      $('hud-rival').hidden = false;
      $('hud-rival-name').textContent = rs.name;
    } else {
      $('hud-rival').hidden = true;
    }
    G.time = 0;
    G.clock = 0;
    G.countdown = 3.999;
    G.lastBeep = 4;
    G.state = 'countdown';
    G.camHeading = G.player.heading;
    G.camPos = null;
    G.result = null;
    showScreen(null);
    $('hud').hidden = false;
    hudGearMode();
    updateHUD();
  }

  function pause() { G.prevState = G.state; G.state = 'paused'; DR.Audio.silence(); showScreen('pause'); }
  function resume() { G.state = G.prevState || 'race'; showScreen(null); }
  function toMenu() { G.state = 'menu'; DR.Audio.silence(); $('hud').hidden = true; showScreen('menu'); renderMenu(); }

  function finishCar(c) {
    if (c.finished) return;
    c.finished = true;
    c.finishTime = G.clock;
    c.finalDrift = c.driftSec || 0;
  }

  function endRace() {
    G.state = 'done';
    var p = G.player, res = { time: p.finishTime, car: p.spec.id, drift: p.finalDrift || 0 };
    res.score = DR.Score.calc(res.time, res.drift);
    if (G.mode === 'ta') {
      res.pb = DR.Cloud.recordRun(p.spec.id, p.finishTime, res.drift);
      res.best = DR.Cloud.best(null, p.spec.id);
    } else {
      res.won = !G.rival.finished || G.rival.finishTime > p.finishTime;
      res.gap = G.rival.finished ? G.rival.finishTime - p.finishTime : null;
      DR.Cloud.recordBattle(res.won);
    }
    G.result = res;
    setTimeout(function () { if (G.state === 'done') showResult(); }, 1600);
  }

  function toggleView() {
    G.view = G.view === 'chase' ? 'hood' : 'chase';
    $('tc-view').textContent = G.view === 'chase' ? '보닛 시점' : '3인칭';
    savePref();
  }

  // --- Loop --------------------------------------------------------------------
  var STEP = 1 / 120, acc = 0, last = performance.now(), skidT = 0;
  function tick(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (G.state === 'countdown') {
      G.countdown -= dt;
      var sec = Math.ceil(G.countdown);
      if (sec < G.lastBeep && sec > 0) { DR.Audio.beep(false); G.lastBeep = sec; }
      $('countdown').textContent = sec > 0 ? sec : 'GO';
      $('countdown').hidden = false;
      if (G.countdown <= 0) { G.state = 'race'; DR.Audio.beep(true); setTimeout(function () { $('countdown').hidden = true; }, 700); }
    }
    if (G.state === 'race' || G.state === 'done' || G.state === 'countdown') {
      acc += dt;
      var racing = G.state !== 'countdown';
      while (acc >= STEP) {
        acc -= STEP;
        stepCar(G.player, racing ? (G.player.finished ? aiInput(G.player) : playerInput()) : { throttle: 0, brake: 1, drift: 0, steer: 0 }, STEP);
        if (G.rival) {
          stepCar(G.rival, racing ? aiInput(G.rival) : { throttle: 0, brake: 1, drift: 0, steer: 0 }, STEP);
          var hit = P.collideCars(G.player, G.rival);
          if (hit > 2) DR.Audio.hit(hit);
        }
        if (racing) { G.clock += STEP; if (!G.player.finished) G.time = G.clock; }
      }
      if (G.state === 'race') {
        if (G.rival && !G.rival.finished) DR.AI.updatePace(G.rival, G.player, dt);
        if (G.player.prog >= C.samples[C.finishIndex].dist) { finishCar(G.player); endRace(); }
        if (G.rival && G.rival.prog >= C.samples[C.finishIndex].dist) finishCar(G.rival);
      } else if (G.rival && G.rival.prog >= C.samples[C.finishIndex].dist) finishCar(G.rival);
      syncModel(G.player.model, G.player, dt);
      if (G.rival) syncModel(G.rival.model, G.rival, dt);
      skidT += dt;
      if (skidT > 0.05) { skidT = 0; skids(G.player); if (G.rival) skids(G.rival); }
      var cam = { x: camera.position.x, y: -camera.position.z, heading: G.camHeading || 0 };
      var list = [{ car: G.player, throttle: G.player.lastIn ? G.player.lastIn.throttle : 0 }];
      if (G.rival) list.push({ car: G.rival, throttle: G.rival.lastIn ? G.rival.lastIn.throttle : 0 });
      if (G.state !== 'paused') DR.Audio.update(list, cam, dt);
      updateCamera(dt);
      updateHUD();
    } else if (G.state === 'menu') {
      menuCamera(dt);
    }
    adapt(dt);
    if (G.state !== 'menu' && G.state !== 'paused') DR.Minimap.draw(G);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  function stepCar(c, input, dt) {
    c.lastIn = input;
    c.braking = input.brake > 0;
    P.update(c, input, dt);
    if (c.autoGear || c !== G.player) P.autoShift(c);
    if (c.wallHit) { if (c === G.player || Math.hypot(c.x - G.player.x, c.y - G.player.y) < 60) DR.Audio.hit(c.wallHit); c.wallHit = 0; }
  }

  function skids(c) {
    if (c.speed < 6 || !(c.drifting || Math.abs(c.slip) > 0.14 || (c.braking && c.lastIn && c.lastIn.drift))) return;
    var hx = Math.cos(c.heading), hy = Math.sin(c.heading), lx = -hy, ly = hx;
    var rear = -c.spec.wb / 2 + c.spec.wbShift, half = c.spec.wid / 2 - 0.15;
    [-1, 1].forEach(function (s) {
      var x = c.x + hx * rear + lx * s * half, y = c.y + hy * rear + ly * s * half;
      DR.World.skid(x, y, C.roadHeight(x, y, c.idx), Math.atan2(c.vy, c.vx), Math.max(0.4, c.speed * 0.05));
    });
  }

  var look = new THREE.Vector3();
  function updateCamera(dt) {
    var c = G.player;
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
    var travel = c.speed > 2 ? Math.atan2(c.vy, c.vx) : c.heading;
    var d = Math.atan2(Math.sin(travel - G.camHeading), Math.cos(travel - G.camHeading));
    G.camHeading += d * Math.min(1, 4.5 * dt);
    if (G.view === 'hood') {
      var e = c.spec.eye, hx = Math.cos(c.heading), hy = Math.sin(c.heading);
      camera.position.set(c.x + hx * e.fwd, c.h + e.up, -(c.y + hy * e.fwd));
      camera.rotation.order = 'YXZ';
      camera.rotation.set(c.pitch * 0.9 - 0.03, c.heading - Math.PI / 2, -c.roll * 0.5);
      G.camPos = null;
      return;
    }
    var dist = 7.2 + Math.min(2.5, c.speed * 0.05), hgt = 2.5;
    var px = c.x - Math.cos(G.camHeading) * dist, py = c.y - Math.sin(G.camHeading) * dist;
    var i = C.nearest(px, py, c.idx, 20), gh = Math.max(C.roadHeight(px, py, i), C.ground(px, py));
    var ph = Math.max(c.h, gh) + hgt;
    if (!G.camPos) G.camPos = new THREE.Vector3(px, ph, -py);
    G.camPos.lerp(tmpV.set(px, ph, -py), Math.min(1, 10 * dt));
    camera.position.copy(G.camPos);
    look.set(c.x + Math.cos(G.camHeading) * 3, c.h + 1.0, -(c.y + Math.sin(G.camHeading) * 3));
    camera.lookAt(look);
    DR.World.follow(c.x, c.h, -c.y);
  }

  var menuT = 0;
  function menuCamera(dt) {
    menuT += dt;
    hideModels();
    var spec = Cars.byId[G.carId], m = model(spec.id, 'p'), s = C.samples[C.startIndex + 8];
    m.visible = true;
    m.position.set(s.x, s.h, -s.y);
    m.rotation.y = s.heading;
    m.userData.body.rotation.set(0, 0, Math.atan(s.grade));
    var a = window.__a != null ? window.__a : menuT * 0.25, r = window.__r || 9.5;
    camera.position.set(s.x + Math.cos(a) * r, s.h + 2.2, -(s.y + Math.sin(a) * r));
    camera.lookAt(s.x, s.h + 0.7, -s.y);
    // Wide screens: the menu sits on the left, so frame the car on the right.
    if (window.innerWidth >= 1100) camera.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.2, 0, window.innerWidth, window.innerHeight);
    else camera.clearViewOffset();
    DR.World.follow(s.x, s.h, -s.y);
  }

  // --- HUD -----------------------------------------------------------------------
  function fmt(t) {
    if (t == null || !isFinite(t)) return '-:--.---';
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  function hudGearMode() { $('hud-gearmode').textContent = G.player && !G.player.autoGear ? 'MANUAL' : 'AUTO'; }
  function updateHUD() {
    var c = G.player;
    if (!c) return;
    $('hud-speed').textContent = Math.round(c.speed * 3.6);
    $('hud-gear').textContent = c.gear;
    var rf = (c.rpm - c.p.IDLE_RPM) / (c.p.REDLINE_RPM - c.p.IDLE_RPM);
    $('hud-rpm-fill').style.width = Math.max(0, Math.min(100, rf * 100)) + '%';
    $('hud-rpm-fill').classList.toggle('red', rf > 0.9);
    $('hud-time').textContent = fmt(G.time);
    var best = G.mode === 'ta' ? DR.Cloud.best(null, c.spec.id) : null;
    $('hud-best').textContent = best ? '베스트 ' + (best.score != null ? Sc.fmt(best.score) + '점' : fmt(best.time)) : '';
    var dsec = c.finished ? c.finalDrift : c.driftSec || 0;
    $('hud-score').textContent = '드리프트 ' + dsec.toFixed(1) + '초 · +' + Sc.fmt(Sc.calc(1e9, dsec).drift) + '점';
    var total = C.samples[C.finishIndex].dist - C.samples[C.startIndex].dist;
    var done = Math.max(0, Math.min(1, (c.prog - C.samples[C.startIndex].dist) / total));
    $('hud-prog-fill').style.width = (done * 100) + '%';
    $('hud-dist').textContent = Math.max(0, Math.round((1 - done) * total)) + ' m';
    $('hud-drift').classList.toggle('on', c.drifting || Math.abs(c.slip) > 0.25);
    $('hud-angle').textContent = Math.round(Math.abs(c.slip) * 180 / Math.PI) + '°';
    if (G.rival) {
      var r = G.rival, dp = c.prog - r.prog, gap = dp / Math.max(8, (c.speed + r.speed) / 2);
      $('hud-rival-pos').textContent = dp >= 0 ? '1위' : '2위';
      $('hud-rival-gap').textContent = (dp >= 0 ? '+' : '-') + Math.abs(gap).toFixed(1) + '초';
      $('hud-rival').classList.toggle('ahead', dp >= 0);
      var rd = Math.max(0, Math.min(1, (r.prog - C.samples[C.startIndex].dist) / total));
      $('hud-prog-rival').style.left = (rd * 100) + '%';
      $('hud-prog-rival').hidden = false;
    } else $('hud-prog-rival').hidden = true;
  }

  // --- Screens -------------------------------------------------------------------
  function showScreen(id) {
    ['menu', 'pause', 'result'].forEach(function (s) { $(s).hidden = s !== id; });
    document.body.classList.toggle('in-menu', id === 'menu');
  }

  // A saved record: score first (old records only have a time).
  function recText(r) { return r.score != null ? Sc.fmt(r.score) + '점 · ' + fmt(r.time) : fmt(r.time); }
  function scoreKey(r) { return r.score != null ? r.score : -1; }
  function bar(v) { return '<span class="bar"><i style="width:' + Math.round(v * 100) + '%"></i></span>'; }
  function renderMenu() {
    var grid = $('cars');
    grid.innerHTML = '';
    Cars.list.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'car' + (s.id === G.carId ? ' on' : '');
      var best = DR.Cloud.best(null, s.id);
      b.innerHTML = '<b>' + s.name + '</b><small>' + s.tagline + '</small>' +
        '<span class="spec">' + s.engine + ' · ' + s.weight + '</span><span class="spec tune">튜닝: ' + s.tune + '</span>' +
        '<span class="stat">파워 ' + bar(s.stats.power) + '</span><span class="stat">그립 ' + bar(s.stats.grip) + '</span><span class="stat">드리프트 ' + bar(s.stats.drift) + '</span>' +
        '<span class="pb">내 기록 ' + (best ? recText(best) : '없음') + '</span>';
      b.addEventListener('click', function () { G.carId = s.id; savePref(); renderMenu(); });
      grid.appendChild(b);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mode[data-mode]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === G.mode);
    });
    // Courses: picking another one reloads the page with that mountain.
    var cl = $('courses');
    cl.innerHTML = '';
    C.LIST.forEach(function (d) {
      var b = document.createElement('button'), len = 0;
      d.program.forEach(function (c) { len += c[0] === 'S' ? c[1] : c[1] * c[2] * Math.PI / 180; });
      var cb = DR.Cloud.save.best[d.slug] || {}, best = null;
      Object.keys(cb).forEach(function (k) { if (!best || scoreKey(cb[k]) > scoreKey(best)) best = cb[k]; });
      b.type = 'button';
      b.className = 'course' + (d.slug === C.SLUG ? ' on' : '');
      b.innerHTML = '<b>' + d.name + '</b><span class="tag">' + d.tag + ' · 약 ' + (len / 1000).toFixed(1) + 'km</span><small>' + d.desc + '</small><span class="pb">내 기록 ' + (best ? recText(best) : '없음') + '</span>';
      b.addEventListener('click', function () {
        if (d.slug === C.SLUG) return;
        savePref(d.slug);
        location.search = '?course=' + d.slug;
      });
      cl.appendChild(b);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.gfx'), function (b) { b.classList.toggle('on', b.getAttribute('data-gfx') === G.gfx); });
    var bt = DR.Cloud.save.battle;
    $('battle-rec').textContent = 'AI 배틀 전적 ' + bt.wins + '승 ' + bt.losses + '패';
    $('course-info').textContent = C.NAME + ' · 길이 ' + (C.raceLength / 1000).toFixed(2) + 'km · 고도차 ' + Math.round(C.drop) + 'm · ' + C.def.tag;
    $('rank-course').textContent = C.NAME.replace(' 다운힐', '');
    renderAccount();
    renderRanking(false);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.mode[data-mode]'), function (b) {
    b.addEventListener('click', function () { G.mode = b.getAttribute('data-mode'); savePref(); renderMenu(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.gfx'), function (b) {
    b.addEventListener('click', function () {
      var g = b.getAttribute('data-gfx');
      if (g === G.gfx) return;
      G.gfx = g; savePref();
      location.reload(); // the renderer and the world are rebuilt for it
    });
  });

  function renderAccount() {
    var Cl = DR.Cloud, el = $('account');
    if (!Cl.enabled) { el.innerHTML = '<span class="dim">기록은 이 브라우저에 저장돼요.</span>'; return; }
    if (Cl.state === 'in') {
      el.innerHTML = '<span><b>' + escapeHtml(Cl.displayName()) + '</b> 로그인됨 · 기록이 계정에 저장돼요</span> <button type="button" id="logout" class="link">로그아웃</button>' +
        (Cl.rulesMissing ? '<p class="warn">랭킹 저장 권한이 아직 없어요. (Firestore 규칙 게시 필요) 기록은 이 기기에 저장돼요.</p>' : '');
      $('logout').onclick = function () { Cl.signOut(); };
    } else if (Cl.state === 'pending') {
      el.innerHTML = '<span class="dim">계정 불러오는 중…</span>';
    } else {
      el.innerHTML = '<button type="button" id="login" class="login">G 구글 로그인</button> <span class="dim">로그인하면 기록이 계정에 저장되고 랭킹에 올라가요.</span>' + (Cl.error ? '<p class="warn">' + escapeHtml(Cl.error) + '</p>' : '');
      $('login').onclick = function () { Cl.signIn(); };
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  DR.Cloud.onChange(function () { if (G.state === 'menu') renderMenu(); });

  function renderRanking(force) {
    var el = $('ranking'), Cl = DR.Cloud;
    if (!Cl.enabled || !Cl.ranking) { el.innerHTML = '<li class="dim">온라인 랭킹을 쓸 수 없어요.</li>'; return; }
    el.innerHTML = '<li class="dim">불러오는 중…</li>';
    Cl.ranking(force).then(function (rows) {
      if (!rows.length) { el.innerHTML = '<li class="dim">아직 기록이 없어요. 첫 기록을 세워 보세요!</li>'; return; }
      var me = Cl.user && Cl.user.uid;
      el.innerHTML = rows.map(function (r, i) {
        var car = Cars.byId[r.car];
        return '<li' + (r.uid === me ? ' class="me"' : '') + '><span class="rk">' + (i + 1) + '</span><span class="nm">' + escapeHtml(r.name) + '</span><span class="cr">' + (car ? car.name : '') + ' · ' + fmt(r.time) + '</span><span class="tm">' + (r.score != null ? Sc.fmt(r.score) + '점' : fmt(r.time)) + '</span></li>';
      }).join('');
    }, function () { el.innerHTML = '<li class="dim">랭킹을 불러오지 못했어요.' + (Cl.rulesMissing ? ' (Firestore 규칙 게시 필요)' : '') + '</li>'; });
  }

  function showResult() {
    var r = G.result, el = $('result-body');
    var car = Cars.byId[r.car];
    if (G.mode === 'ta') {
      el.innerHTML = '<div class="big">' + Sc.fmt(r.score.total) + '점</div><p>' + car.name + ' · ' + C.NAME + '</p>' +
        '<p>기록 ' + fmt(r.time) + ' (' + Sc.fmt(r.score.time) + '점) + 드리프트 ' + r.drift.toFixed(1) + '초 (' + Sc.fmt(r.score.drift) + '점)</p>' +
        (r.pb ? '<p class="pb-new">개인 최고 기록!</p>' : '<p>내 베스트 ' + (r.best ? recText(r.best) : '-') + '</p>') +
        (DR.Cloud.enabled && DR.Cloud.state !== 'in' ? '<p class="dim">구글 로그인하면 랭킹에 올라가요.</p>' : '');
    } else {
      el.innerHTML = '<div class="big ' + (r.won ? 'win' : 'lose') + '">' + (r.won ? 'WIN' : 'LOSE') + '</div>' +
        '<p>점수 ' + Sc.fmt(r.score.total) + '점 (드리프트 ' + r.drift.toFixed(1) + '초)</p><p>내 기록 ' + fmt(r.time) + (r.gap != null ? ' · 차이 ' + (r.gap >= 0 ? '+' : '') + r.gap.toFixed(2) + '초' : ' · 상대 아직 주행 중') + '</p>' +
        '<p>상대 ' + G.rival.spec.name + '</p>';
    }
    showScreen('result');
  }

  $('play').addEventListener('click', start);
  $('rank-refresh').addEventListener('click', function () { renderRanking(true); });
  $('pause-resume').addEventListener('click', resume);
  $('pause-restart').addEventListener('click', start);
  $('pause-menu').addEventListener('click', toMenu);
  $('result-retry').addEventListener('click', start);
  $('result-menu').addEventListener('click', toMenu);
  $('tc-view').addEventListener('click', toggleView);
  $('tc-reset').addEventListener('click', function () { if (G.state === 'race') resetCar(G.player); });
  $('tc-pause').addEventListener('click', function () { if (G.state === 'race' || G.state === 'countdown') pause(); });
  $('tc-view').textContent = G.view === 'chase' ? '보닛 시점' : '3인칭';

  // Test hook: runs the race physics for `sec` seconds without rendering.
  G.simulate = function (sec, inputFn) {
    if (G.state === 'countdown') { G.countdown = 0; G.state = 'race'; }
    for (var t = 0; t < sec; t += STEP) {
      stepCar(G.player, inputFn ? inputFn(G.player) : aiInput(G.player), STEP);
      if (G.rival) { stepCar(G.rival, aiInput(G.rival), STEP); P.collideCars(G.player, G.rival); }
      G.clock += STEP;
      if (!G.player.finished) G.time = G.clock;
      if (G.state === 'race') {
        if (G.player.prog >= C.samples[C.finishIndex].dist) { finishCar(G.player); endRace(); }
      }
      if (G.rival && G.rival.prog >= C.samples[C.finishIndex].dist) finishCar(G.rival);
    }
  };
  G.aiInput = aiInput;
  DR.Main = G; // for tests
  G.start = start;
  toMenu();
  requestAnimationFrame(tick);
})();

// main.js — RallyMode: menus, settings screens, the game loop.
// Loop: input -> stage (physics at a fixed 600 Hz inside) -> vehicle model
// -> camera -> world (LOD, culling, particles) -> render -> HUD.
(function (G) {
  'use strict';
  var RL = G.RL, D = RL.Data, PS = RL.Persist, W = RL.World, Input = RL.Input;
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var M = {
    screen: 'home', mode: 'stage', length: 'short', seed: '', route: null, routeKey: '',
    stage: null, car: null, vehicle: null, cam: null, playing: false, paused: false, resultT: 0,
    returnTo: 'home',
  };
  G.RL.Main = M; // for tests
  function S() { return PS.settings(); }

  // ---------------------------------------------------------------- screens
  var SCREENS = ['home', 'select', 'vehicle', 'rallyset', 'graphics', 'loading', 'pause', 'result'];
  function show(name) {
    M.screen = name;
    SCREENS.forEach(function (s) { $(s).hidden = s !== name; });
    var inMenu = !!name && name !== 'none';
    document.body.classList.toggle('in-menu', inMenu);
    document.body.classList.toggle('playing', !inMenu);
    if (name === 'select') renderSelect();
    if (name === 'vehicle') renderVehicle();
    if (name === 'rallyset') renderRally();
    if (name === 'graphics') renderGraphics();
    if (name === 'home') renderAccount();
  }
  function go(name, ret) { M.returnTo = ret || (M.playing ? 'pause' : M.screen === 'select' ? 'select' : 'home'); show(name); }

  qa('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.mode) M.mode = b.dataset.mode;
      var t = b.dataset.go;
      if (t === 'vehicle' || t === 'rallyset' || t === 'graphics') go(t, b.dataset.ret || M.screen);
      else show(t);
    });
  });
  ['veh-back', 'rs-back', 'gx-back'].forEach(function (id) { $(id).addEventListener('click', function () { show(M.returnTo || 'home'); }); });

  // ---------------------------------------------------------------- account
  function renderAccount() {
    var el = $('account'), h = '';
    if (!PS.enabled) h = '<span class="note">온라인 설정이 없어 이 브라우저에만 저장돼요.</span>';
    else if (PS.state === 'in') h = '<span>로그인: <b>' + esc(PS.displayName()) + '</b> · 기록과 설정이 계정에 저장돼요</span><button type="button" class="btn" id="acct-out">로그아웃</button>';
    else if (PS.state === 'pending') h = '<span class="note">계정 불러오는 중…</span>';
    else h = '<button type="button" class="btn white" id="acct-in">Google로 로그인</button><span class="note">로그인하면 기록·세팅이 계정에 저장돼요 (지금 기록도 함께 옮겨져요).</span>';
    if (PS.error) h += '<div class="warn" style="width:100%">' + esc(PS.error) + '</div>';
    if (PS.rulesMissing) h += '<div class="warn" style="width:100%">계정 저장이 거부됐어요. Firebase 콘솔에서 Track Master의 firestore.rules를 다시 게시해야 해요 (그 전에도 이 브라우저에는 저장돼요).</div>';
    el.innerHTML = h;
    if ($('acct-in')) $('acct-in').onclick = function () { PS.signIn(); };
    if ($('acct-out')) $('acct-out').onclick = function () { PS.signOut(); };
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  PS.onChange(function () { if (M.screen === 'home') renderAccount(); if (M.screen === 'select') renderSelect(true); applyAll(); });

  // ---------------------------------------------------------------- stage select
  var genTimer = null;
  function renderSelect(soft) {
    $('sel-title').innerHTML = M.mode === 'free' ? 'FREE <span>DRIVE</span>' : 'SPECIAL <span>STAGE</span>';
    $('sel-sub').textContent = M.mode === 'free' ? '기록·페널티 없이 자유롭게 달려요. 복구(R)도 자유예요.' : '출발선 정차 → 3초 카운트다운 → 출발. 스플릿과 결승 기록을 재요.';
    var chips = '';
    Object.keys(D.LENGTHS).forEach(function (k) { var L = D.LENGTHS[k]; chips += '<button type="button" class="chip' + (M.length === k ? ' on' : '') + '" data-len="' + k + '">' + L.name + '<small>' + L.label + ' · ' + L.time + ' · 약 ' + L.km + 'km</small></button>'; });
    $('len-chips').innerHTML = chips;
    qa('[data-len]').forEach(function (b) { b.onclick = function () { M.length = b.dataset.len; renderSelect(); }; });
    if (!M.seed) M.seed = (PS.data.seeds[0] && PS.data.seeds[0].seed) || RL.Rng.randomSeed();
    if (document.activeElement !== $('seed')) $('seed').value = M.seed;
    var list = PS.data.seeds.map(function (s) {
      var b = PS.best(s.seed, s.length);
      return '<li data-seed="' + esc(s.seed) + '" data-l="' + s.length + '"><span><b>' + esc(s.seed) + '</b> · ' + D.LENGTHS[s.length].name + '</span><span>' + (b ? 'PB ' + RL.HUD.fmt(b.final) : '-') + '</span></li>';
    }).join('');
    $('recent-seeds').innerHTML = list || '<li><span class="note">아직 없어요</span></li>';
    qa('#recent-seeds [data-seed]').forEach(function (li) { li.onclick = function () { M.seed = li.dataset.seed; M.length = li.dataset.l; renderSelect(); }; });
    if (!soft) schedulePreview();
  }
  function schedulePreview() {
    clearTimeout(genTimer);
    var key = M.seed + '|' + M.length;
    if (M.route && M.routeKey === key) { drawPreview(M.route); return; }
    $('stage-info').innerHTML = '<dt>생성 중</dt><dd>…</dd>';
    genTimer = setTimeout(function () {
      var t0 = performance.now();
      M.route = RL.Track.generate(M.seed, M.length); M.routeKey = key;
      M.genMs = performance.now() - t0;
      drawPreview(M.route);
    }, 60);
  }
  function drawPreview(r) {
    var cv = $('preview'), g = cv.getContext('2d'), w = cv.width, h = cv.height;
    var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, i;
    for (i = 0; i < r.n; i += 4) { minX = Math.min(minX, r.x[i]); maxX = Math.max(maxX, r.x[i]); minZ = Math.min(minZ, r.z[i]); maxZ = Math.max(maxZ, r.z[i]); }
    var sc = Math.min((w - 40) / (maxX - minX || 1), (h - 40) / (maxZ - minZ || 1)), ox = (w - (maxX - minX) * sc) / 2, oz = (h - (maxZ - minZ) * sc) / 2;
    var P = function (j) { return [ox + (r.x[j] - minX) * sc, oz + (r.z[j] - minZ) * sc]; };
    g.fillStyle = '#0f1216'; g.fillRect(0, 0, w, h);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 6; g.strokeStyle = '#2a313b'; g.beginPath(); for (i = 0; i < r.n; i += 2) { var p = P(i); if (!i) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); } g.stroke();
    g.lineWidth = 3;
    for (i = 2; i < r.n; i += 2) { var a = P(i - 2), b = P(i); g.strokeStyle = r.surf[i] ? '#8a5a2b' : '#d9cdb5'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    function dot(s, c, rad) { var p = P(Math.min(r.n - 1, Math.round(s / r.SP))); g.fillStyle = c; g.beginPath(); g.arc(p[0], p[1], rad, 0, 7); g.fill(); }
    r.checkpoints.forEach(function (s) { dot(s, '#fff', 4); });
    dot(r.startS, '#3ccf6e', 7); dot(r.finishS, '#ff3b2f', 7);
    // info from the route data
    var g6 = {}, hp = 0;
    r.corners.forEach(function (c) { if (c.hairpin) hp++; else g6[c.grade] = (g6[c.grade] || 0) + 1; });
    var mud = 0; r.features.forEach(function (f) { if (f.type === 'mud') mud += f.s1 - f.s0; });
    var cnt = function (t) { return r.features.filter(function (f) { return f.type === t; }).length; };
    var ys = Array.prototype.slice.call(r.y), elev = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    var best = PS.best(r.seed, r.lengthKey);
    $('stage-info').innerHTML =
      '<dt>시드</dt><dd>' + esc(r.seed) + ' · ' + D.LENGTHS[r.lengthKey].name + '</dd>' +
      '<dt>길이</dt><dd>' + ((r.finishS - r.startS) / 1000).toFixed(2) + ' km · 스플릿 ' + r.checkpoints.length + '곳</dd>' +
      '<dt>코너</dt><dd>' + [1, 2, 3, 4, 5, 6].map(function (k) { return k + ':' + (g6[k] || 0); }).join(' ') + ' · 헤어핀 ' + hp + '</dd>' +
      '<dt>노면</dt><dd>자갈 ' + Math.round(100 - mud / (r.finishS - r.startS) * 100) + '% · 진흙 ' + Math.round(mud / (r.finishS - r.startS) * 100) + '%</dd>' +
      '<dt>지형</dt><dd>고저차 ' + Math.round(elev) + ' m · 점프 ' + cnt('jump') + ' · 크레스트 ' + cnt('crest') + ' · 낙석 ' + cnt('rockfall') + '</dd>' +
      '<dt>개인 최고</dt><dd>' + (best ? RL.HUD.fmt(best.final) + ' (페널티 ' + best.penalty + '초)' : '없음') + '</dd>';
  }
  $('seed').addEventListener('keydown', function (e) { if (e.key === 'Enter') applySeed(); });
  $('seed-apply').onclick = applySeed;
  function applySeed() {
    var s = RL.Rng.cleanSeed($('seed').value);
    if (!s) { $('seed-msg').textContent = '영문·숫자(최대 16자)로 입력해 주세요.'; return; }
    M.seed = s; $('seed').value = s; $('seed-msg').textContent = '시드 ' + s + ' 코스를 만들었어요.'; renderSelect();
  }
  $('seed-random').onclick = function () { M.seed = RL.Rng.randomSeed(); $('seed').value = M.seed; renderSelect(); };
  function copySeed(seed, msgEl) {
    var txt = seed;
    function done(ok) { if (msgEl) msgEl.textContent = ok ? '시드 ' + txt + ' 복사했어요.' : '복사가 막혔어요. 시드: ' + txt; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }
  $('seed-copy').onclick = function () { copySeed(M.seed, $('seed-msg')); };
  $('start').onclick = function () { start(M.mode === 'free'); };

  // ---------------------------------------------------------------- vehicle settings
  function renderVehicle() {
    var v = S().vehicle, live = M.playing;
    var lock = live && M.stage && !M.stage.free;
    $('veh-lock').textContent = lock ? '스페셜 스테이지 중에는 브레이크 바이어스만 바꿀 수 있어요 (타이어·서스펜션·변속기는 출발 전에 정해요).' : live ? '자유 주행 중에는 바꾼 값이 바로 차에 적용돼요.' : '';
    chipSet('tyre-type', [['gravel', '자갈용'], ['mud', '진흙용']], v.tyre, function (k) { v.tyre = k; saveVeh(); }, lock);
    chipSet('tyre-comp', [['soft', '소프트'], ['hard', '하드']], v.compound, function (k) { v.compound = k; saveVeh(); }, lock);
    chipSet('v-trans', [['AUTOMATIC', '자동'], ['MANUAL', '수동'], ['SEQUENTIAL', '시퀀셜']], v.transmission, function (k) { v.transmission = k; saveVeh(); }, lock);
    slider('v-bias', Math.round(v.brakeBias * 100), function (x) { v.brakeBias = x / 100; saveVeh(); return x + ' : ' + (100 - x); });
    slider('v-stiff', Math.round(v.stiffness * 100), function (x) { v.stiffness = x / 100; saveVeh(); return x + '%'; }, lock);
    slider('v-ride', Math.round(v.rideHeight * 100), function (x) { v.rideHeight = x / 100; saveVeh(); return (x > 0 ? '+' : '') + x + ' cm'; }, lock);
  }
  function saveVeh() { PS.save(); applyCarSetup(); renderVehicle(); }
  function chipSet(id, opts, cur, fn, disabled) {
    $(id).innerHTML = opts.map(function (o) { return '<button type="button" class="chip' + (o[0] === cur ? ' on' : '') + '" data-k="' + o[0] + '"' + (disabled ? ' disabled' : '') + '>' + o[1] + '</button>'; }).join('');
    qa('#' + id + ' [data-k]').forEach(function (b) { b.onclick = function () { fn(b.dataset.k); }; });
  }
  function slider(id, val, fn, disabled) {
    var el = $(id); el.value = val; el.disabled = !!disabled;
    var lab = $(id + '-v'); lab.textContent = fn(+el.value, true);
    el.oninput = function () { lab.textContent = fn(+el.value); };
  }
  // override fn calls during render (no save loop): wrap
  var _slider = slider;
  slider = function (id, val, fn, disabled) {
    var first = true;
    _slider(id, val, function (x) { if (first) { first = false; return fmtOnly(id, x); } return fn(x); }, disabled);
  };
  function fmtOnly(id, x) {
    if (id === 'v-bias') return x + ' : ' + (100 - x);
    if (id === 'v-stiff' || id === 'gx-res' || id === 'gx-part' || id === 'gx-veg' || id === 'rs-timing') return x + '%';
    if (id === 'v-ride') return (x > 0 ? '+' : '') + x + ' cm';
    if (id === 'gx-view') return x + ' m';
    return x;
  }

  // ---------------------------------------------------------------- rally settings
  var HUD_NAMES = { speed: '속도', rpm: 'RPM', gear: '기어', pacenote: '페이스노트', nextCorner: '다음 코너', cornerDist: '코너까지 거리', remaining: '남은 거리', progress: '진행도', splits: '스플릿', bias: '브레이크 바이어스', tyres: '타이어 상태', suspension: '서스펜션 상태', engine: '엔진 상태', assists: '보조장치 표시', timer: '시간', fps: '성능 (FPS)' };
  var PEN_NAMES = { offCourse: '코스 이탈', collision: '심각한 충돌', rollover: '차량 전복', recover: '수동 복구 (R)', stuck: '주행 불가 (자동 복구)' };
  function renderRally() {
    var st = S();
    $('rs-assists').innerHTML = [['drift', '드리프트 어시스트 (자동 카운터스티어)'], ['abs', 'ABS (바퀴 잠김 방지)'], ['tcs', 'TCS (휠스핀 억제)'], ['esc', 'ESC (자세 제어)']].map(function (a) {
      return '<label class="tg"><input type="checkbox" data-as="' + a[0] + '"' + (st.assists[a[0]] ? ' checked' : '') + ' /> ' + a[1] + '</label>';
    }).join('');
    qa('[data-as]').forEach(function (c) { c.onchange = function () { st.assists[c.dataset.as] = c.checked; PS.save(); applyCarSetup(); }; });
    $('rs-damage').checked = st.rally.damage;
    $('rs-damage').onchange = function () { st.rally.damage = this.checked; PS.save(); applyCarSetup(); };
    $('rs-pen').innerHTML = Object.keys(PEN_NAMES).map(function (k) {
      return '<div class="field"><label>' + PEN_NAMES[k] + ' <input type="number" min="0" max="120" step="1" data-pen="' + k + '" value="' + st.rally.penalties[k] + '" /></label></div>';
    }).join('');
    qa('[data-pen]').forEach(function (i) { i.onchange = function () { st.rally.penalties[i.dataset.pen] = Math.max(0, Math.min(120, +i.value || 0)); i.value = st.rally.penalties[i.dataset.pen]; PS.save(); }; });
    slider('rs-timing', Math.round(st.rally.pacenoteTiming * 100), function (x) { st.rally.pacenoteTiming = x / 100; PS.save(); if (M.stage) M.stage.caller.timing = x / 100; return x + '%'; });
    $('rs-hud').innerHTML = Object.keys(HUD_NAMES).map(function (k) {
      return '<label class="tg"><input type="checkbox" data-hk="' + k + '"' + (st.hud[k] ? ' checked' : '') + ' /> ' + HUD_NAMES[k] + '</label>';
    }).join('');
    qa('[data-hk]').forEach(function (c) { c.onchange = function () { st.hud[c.dataset.hk] = c.checked; PS.save(); RL.HUD.applyVisibility(st.hud); }; });
    $('rs-reset').onclick = function () { ['assists', 'rally', 'hud'].forEach(function (p) { PS.resetSettings(p); }); renderRally(); applyAll(); };
  }

  // ---------------------------------------------------------------- graphics
  function renderGraphics() {
    var g = S().graphics;
    chipSet('gx-preset', [['high', 'HIGH'], ['low', 'LOW'], ['custom', '사용자 지정']], g.preset, function (k) {
      if (k === 'custom') { g.preset = 'custom'; }
      else { Object.assign(g, D.GRAPHICS[k]); g.preset = k; }
      PS.save(); applyGraphics(); renderGraphics();
    });
    var custom = function (fn) { return function (x) { var r = fn(x); g.preset = 'custom'; PS.save(); applyGraphics(); markPreset(); return r; }; };
    slider('gx-res', Math.round(g.resolution * 100), custom(function (x) { g.resolution = x / 100; return x + '%'; }));
    slider('gx-view', g.viewDistance, custom(function (x) { g.viewDistance = x; return x + ' m'; }));
    slider('gx-part', Math.round(g.particles * 100), custom(function (x) { g.particles = x / 100; return x + '%'; }));
    slider('gx-veg', Math.round(g.vegetation * 100), custom(function (x) { g.vegetation = x / 100; return x + '%'; }));
    $('gx-shadow').checked = g.shadows; $('gx-shadow').onchange = function () { g.shadows = this.checked; g.preset = 'custom'; PS.save(); applyGraphics(); markPreset(); };
    $('gx-fps').checked = S().hud.fps; $('gx-fps').onchange = function () { S().hud.fps = this.checked; PS.save(); RL.HUD.applyVisibility(S().hud); };
  }
  function markPreset() { qa('#gx-preset [data-k]').forEach(function (b) { b.classList.toggle('on', b.dataset.k === S().graphics.preset); }); }

  // ---------------------------------------------------------------- applying settings
  function carSetup() {
    var st = S(), v = st.vehicle;
    return { tyre: v.tyre, compound: v.compound, brakeBias: v.brakeBias, stiffness: v.stiffness, rideHeight: v.rideHeight, transmission: v.transmission, abs: st.assists.abs, tcs: st.assists.tcs, esc: st.assists.esc, driftAssist: st.assists.drift, damage: st.rally.damage };
  }
  function applyCarSetup() {
    if (!M.car) return;
    var s = carSetup(), cur = M.car.setup;
    if (M.stage && !M.stage.free) {
      // during a special stage only the bias and the assists can change
      cur.brakeBias = s.brakeBias; cur.abs = s.abs; cur.tcs = s.tcs; cur.esc = s.esc; cur.driftAssist = s.driftAssist;
    } else {
      var transChanged = cur.transmission !== s.transmission;
      Object.assign(cur, s);
      if (transChanged && s.transmission === 'AUTOMATIC' && M.car.gear < 1) M.car.gear = 1;
    }
  }
  function applyGraphics() {
    var g = S().graphics;
    if (W.renderer) { W.applyGraphics(g); if (M.cam) M.cam.setFar(g.viewDistance + 80); }
  }
  function applyAll() { applyCarSetup(); applyGraphics(); RL.HUD.applyVisibility(S().hud); }

  // ---------------------------------------------------------------- run
  var canvas = $('game');
  function ensureWorld() {
    if (W.renderer) return;
    W.init(canvas);
    M.cam = RL.Camera.create(innerWidth / innerHeight);
    M.cam.set(S().camera);
    resize();
  }
  function resize() { if (W.renderer) W.resize(innerWidth, innerHeight, M.cam && M.cam.cam); }
  addEventListener('resize', resize);

  function start(free) {
    RL.Audio.unlock();
    var key = M.seed + '|' + M.length;
    show('loading'); $('loading-text').textContent = '코스 생성 중… (' + D.LENGTHS[M.length].label + ')';
    setTimeout(function () {
      try {
        ensureWorld();
        if (!M.route || M.routeKey !== key) { M.route = RL.Track.generate(M.seed, M.length); M.routeKey = key; }
        PS.rememberSeed(M.route.seed, M.length);
        var t0 = performance.now();
        W.build(M.route, S().graphics);
        M.buildMs = performance.now() - t0;
        if (M.vehicle) { W.scene.remove(M.vehicle.root); M.vehicle.dispose(); }
        M.car = RL.Physics.create(carSetup());
        M.vehicle = RL.Vehicle.create(M.car.spec); W.scene.add(M.vehicle.root); W.vehicle = M.vehicle;
        M.stage = RL.Stage.create(M.route, M.car, { free: free, penalties: S().rally.penalties });
        M.stage.caller.timing = S().rally.pacenoteTiming;
        applyAll();
        Input.reset();
        RL.HUD.setup(M.stage, PS.best(M.route.seed, M.length));
        RL.HUD.applyVisibility(S().hud);
        M.playing = true; M.paused = false; M.resultT = 0; M.recorded = false;
        $('hud').hidden = false; $('bias-panel').hidden = true;
        $('tc-cam').textContent = M.cam.name() + ' 시점';
        show('none');
        // warm up: one frame so shaders compile before the clock runs
        M.vehicle.update(M.car); M.cam.update(0.016, M.car, M.vehicle); W.update(0.016, M.cam.cam, M.car); W.render(M.cam.cam);
        last = performance.now();
      } catch (e) {
        console.error(e); $('loading-text').textContent = '코스를 만들지 못했어요: ' + e.message;
      }
    }, 30);
  }

  function pause(on) {
    if (!M.playing || (M.stage && M.stage.phase === 'finished' && on)) return;
    M.paused = on;
    if (on) { show('pause'); $('p-sound').textContent = RL.Audio.muted ? '소리 켜기' : '소리 끄기'; RL.Audio.silence(); }
    else { show('none'); last = performance.now(); Input.reset(); }
  }
  $('p-resume').onclick = function () { pause(false); };
  $('p-restart').onclick = function () { recordAbandon(); M.stage.reset(); RL.HUD.setup(M.stage, PS.best(M.route.seed, M.length)); M.recorded = false; pause(false); };
  $('p-vehicle').onclick = function () { go('vehicle', 'pause'); };
  $('p-rally').onclick = function () { go('rallyset', 'pause'); };
  $('p-gfx').onclick = function () { go('graphics', 'pause'); };
  $('p-sound').onclick = function () { RL.Audio.setMuted(!RL.Audio.muted); S().sound = !RL.Audio.muted; PS.save(); this.textContent = RL.Audio.muted ? '소리 켜기' : '소리 끄기'; };
  $('p-menu').onclick = function () { recordAbandon(); quit(); };
  function recordAbandon() { var a = M.stage && M.stage.abandon(); if (a && M.stage.time > 5 && !M.recorded) { PS.recordRun(a); } }
  function quit() { M.playing = false; M.paused = false; $('hud').hidden = true; RL.Audio.silence(); show('select'); }

  // results
  function showResult() {
    var r = M.stage.result, best = PS.best(r.seed, r.length), pb = PS.recordRun(r);
    M.recorded = true;
    var prev = best && !pb ? best : (pb && best && best.final !== r.final ? null : null);
    var diff = best ? r.final - best.final : null;
    var rows = r.splits.map(function (t, i) {
      var lab = i === r.splits.length - 1 ? '결승' : '스플릿 ' + (i + 1), bt = best && best.splits ? best.splits[i] : null;
      return '<tr><td>' + lab + '</td><td class="r">' + RL.HUD.fmt(t) + '</td><td class="r">' + (bt != null ? '<span class="' + (t <= bt ? 'good' : 'bad') + '">' + RL.HUD.fmtDiff(t - bt) + '</span>' : '-') + '</td></tr>';
    }).join('');
    var pens = Object.keys(PEN_NAMES).map(function (k) { return '<tr><td>' + PEN_NAMES[k] + '</td><td class="r" colspan="2">' + (r.penalties[k] ? '+' + r.penalties[k] + '초' : '0') + '</td></tr>'; }).join('');
    $('res-body').innerHTML =
      '<div class="top"><div><h1>STAGE <span>FINISH</span></h1><p class="sub">시드 <b>' + esc(r.seed) + '</b> · ' + D.LENGTHS[r.length].name + '</p></div></div>' +
      '<div class="res-time' + (pb ? ' pb' : '') + '">' + RL.HUD.fmt(r.final) + '</div>' +
      '<p class="sub">' + (pb ? (best ? '개인 최고 기록 경신! (' + RL.HUD.fmtDiff(diff) + ')' : '첫 기록이에요!') : '개인 최고 ' + RL.HUD.fmt(best.final) + ' 와(과) ' + RL.HUD.fmtDiff(diff)) + '</p>' +
      '<h2>구간 기록 (개인 최고 대비)</h2><table><tr><th>구간</th><th class="r">시간</th><th class="r">차이</th></tr>' + rows + '</table>' +
      '<h2>페널티</h2><table>' + pens + '<tr><td><b>주행 시간</b></td><td class="r" colspan="2">' + RL.HUD.fmt(r.raw) + '</td></tr><tr><td><b>최종 기록</b></td><td class="r" colspan="2"><b>' + RL.HUD.fmt(r.final) + '</b></td></tr></table>' +
      '<h2>주행</h2><table><tr><td>최고 속도</td><td class="r">' + r.topSpeed.toFixed(0) + ' km/h</td></tr><tr><td>평균 속도</td><td class="r">' + r.avgSpeed.toFixed(1) + ' km/h</td></tr>' +
      '<tr><td>세팅</td><td class="r">' + D.TYRES[r.setup.tyre].name + ' ' + D.TYRES[r.setup.tyre][r.setup.compound].name + ' · BB ' + Math.round(r.setup.brakeBias * 100) + ' · ' + r.setup.transmission + '</td></tr></table>';
    show('result');
    void prev;
  }
  $('r-retry').onclick = function () { start(false); };
  $('r-new').onclick = function () { M.seed = RL.Rng.randomSeed(); M.mode = 'stage'; quit(); };
  $('r-menu').onclick = function () { quit(); show('home'); };
  $('r-copy').onclick = function () { copySeed(M.route.seed, null); this.textContent = '복사됨'; var b = this; setTimeout(function () { b.textContent = '시드 복사'; }, 1500); };

  addEventListener('beforeunload', function (e) { if (M.playing && M.stage && !M.stage.free && M.stage.phase === 'running') { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- loop
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var realDt = Math.max(0.001, (now - last) / 1000), dt = Math.min(0.05, realDt); last = now;
    if (!M.playing || !W.renderer) return;
    var car = M.car, stage = M.stage;
    var inp = Input.read(dt, car.speed);
    if (inp.edges.pause) { pause(!M.paused); return; }
    if (M.paused) return;
    if (inp.edges.camera) { M.cam.cycle(); S().camera = M.cam.mode; PS.save(); $('tc-cam').textContent = M.cam.name() + ' 시점'; stage.say(M.cam.name() + ' 시점', 'info'); }
    if (inp.edges.biasUI) $('bias-panel').hidden = !$('bias-panel').hidden;
    if (inp.edges.biasUp || inp.edges.biasDown) {
      var v = S().vehicle; v.brakeBias = Math.round(Math.max(0.4, Math.min(0.8, v.brakeBias + (inp.edges.biasUp ? 0.01 : -0.01))) * 100) / 100;
      car.setup.brakeBias = v.brakeBias; PS.save();
      $('bias-panel').hidden = false; clearTimeout(M.biasT); M.biasT = setTimeout(function () { $('bias-panel').hidden = true; }, 2200);
    }
    if (inp.edges.fps) { S().hud.fps = !S().hud.fps; PS.save(); RL.HUD.applyVisibility(S().hud); }
    if (inp.edges.mute) RL.Audio.setMuted(!RL.Audio.muted);

    var ev = stage.update(dt, inp);
    ev.forEach(function (e) { RL.Audio.event(e); if (e.type === 'finish') M.resultT = 2.6; });
    if (stage.phase === 'finished' && M.resultT > 0) { M.resultT -= dt; if (M.resultT <= 0) { RL.Audio.silence(); showResult(); M.playing = false; return; } }
    RL.Audio.update(car, car.throttleOut || inp.throttle, dt, false);
    W.dust(car, dt);
    M.vehicle.update(car);
    M.cam.update(dt, car, M.vehicle);
    W.update(dt, M.cam.cam, car);
    W.render(M.cam.cam);
    RL.HUD.update(realDt, stage, car, S(), { best: PS.best(M.route.seed, M.length), calls: W.stats.calls });
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- boot
  Input.attach(function () { return M.playing && !M.paused; });
  Input.bindTouch($('touch'));
  if (RL.Settings.isTouch()) document.body.classList.add('touch');
  RL.Audio.muted = S().sound === false;
  // deep link: ?seed=XXXX&len=short
  (function () {
    var q = new URLSearchParams(location.search);
    if (q.get('seed')) M.seed = RL.Rng.cleanSeed(q.get('seed'));
    if (D.LENGTHS[q.get('len')]) M.length = q.get('len');
  })();
  show('home');
})(typeof window !== 'undefined' ? window : globalThis);

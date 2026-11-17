// real-ui.js — 리얼리스틱 screens and HUD.
//  - menu tab: championship (round, calendar, drivers' / constructors'
//    standings), weekend settings (race length, weather, AI level, qualifying)
//  - qualifying: session HUD, knockout table after each flying lap
//  - pre-race: starting grid, forecast, starting tyre and strategy
//  - race HUD: 20-car timing tower (gap, tyre, PIT / OUT), car panel (tyre
//    wear, fuel, battery, Overtake Mode / Boost / Straight Mode, next tyre,
//    box), flags (yellow / SC / VSC / blue / chequered), team radio, pit
//    stop panel, rain on the screen; keys P (box) T (tyre) O (Overtake) B
//    (Boost, hold) and touch buttons
//  - results: classification, prize, standings, season end.
// Load order: after raceui.js, before menu.js. Depends on: Real, RealData,
// RealPhys, RealPit, Race, Garage, Laps, Main (at call time).
(function () {
  'use strict';
  window.CR = window.CR || {};

  var UI = {};
  var els = {};
  var RD = function () { return CR.RealData; };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function btn(text, cls, fn) {
    var b = el('button', 'rr-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function fmt(t) { return t === null || t === undefined ? '—' : CR.Laps.format(t); }
  function info(id) {
    if (id === 'you') {
      var f1 = CR.Cars.byId('f1');
      return { code: 'YOU', name: '나', team: 'you', teamName: '내 팀', color: f1.color };
    }
    var d = RD().driver(id);
    if (!d) return { code: '???', name: id, team: '', teamName: '', color: '#888' };
    return { code: d.code, name: d.name, team: d.team, teamName: RD().team(d.team).name, color: d.main || RD().team(d.team).main };
  }
  function teamColor(id) { var t = RD().team(id); return t.player ? CR.Cars.byId('f1').color : t.main; }
  function tyreChip(id, small) {
    var t = RD().tyre(id), s = el('span', 'rl-tyre' + (small ? ' is-small' : ''), id);
    s.style.setProperty('--ty', t.color);
    s.title = t.name;
    return s;
  }
  function driverCell(id) {
    var d = info(id), td = el('td', 'rr-driver');
    var chip = el('span', 'rr-chip');
    chip.style.background = d.color;
    td.appendChild(chip);
    td.appendChild(el('b', null, d.code));
    td.appendChild(el('small', null, d.name + ' · ' + d.teamName));
    return td;
  }

  // --- Init -----------------------------------------------------------------
  UI.init = function () {
    // overlay for weekend screens
    els.screen = el('div', 'race-results rl-screen');
    els.screen.hidden = true;
    els.card = el('div', 'rr-card rl-card');
    els.card.setAttribute('role', 'dialog');
    els.card.setAttribute('aria-modal', 'true');
    els.screen.appendChild(els.card);
    document.body.appendChild(els.screen);
    // race HUD
    els.hud = el('div', 'rl-hud');
    els.hud.hidden = true;
    els.hud.innerHTML =
      '<div class="rl-flag" hidden></div>' +
      '<div class="rl-radio" aria-live="polite"></div>' +
      '<div class="rl-panel">' +
      '  <div class="rl-row rl-tyre-row"><span class="rl-k">타이어</span><span class="rl-cur"></span><span class="rl-wear"><i></i></span><b class="rl-wear-txt"></b></div>' +
      '  <div class="rl-row"><span class="rl-k">배터리</span><span class="rl-bar rl-soc"><i></i></span><b class="rl-soc-txt"></b></div>' +
      '  <div class="rl-row rl-temps"><span class="rl-k">온도</span><span class="rl-car"><i></i><i></i><i></i><i></i></span><b class="rl-temp-txt"></b></div>' +
      '  <div class="rl-row rl-modes"><span class="rl-mode rl-ot">OVERTAKE</span><span class="rl-mode rl-boost">BOOST</span><span class="rl-mode rl-straight">STRAIGHT</span><span class="rl-mode rl-tow">TOW</span></div>' +
      '  <div class="rl-row"><span class="rl-k">연료</span><b class="rl-fuel"></b><span class="rl-k">다음</span><span class="rl-next"></span><b class="rl-box"></b></div>' +
      '  <div class="rl-row rl-pen" hidden></div>' +
      '  <div class="rl-row rl-dmg" hidden></div>' +
      '  <div class="rl-row rl-gaps"></div>' +
      '</div>' +
      '<div class="rl-pitcue" hidden></div>' +
      '<div class="rl-pitstop" hidden><div class="rl-ps-title">PIT STOP</div><div class="rl-ps-time">0.0</div><div class="rl-ps-crew"></div><div class="rl-ps-note"></div></div>' +
      '<div class="rl-q" hidden></div>' +
      '<div class="rl-touch">' +
      '  <button type="button" data-act="box">BOX<small>F</small></button>' +
      '  <button type="button" data-act="stay">STAY<small>X</small></button>' +
      '  <button type="button" data-act="tyre">타이어<small>T</small></button>' +
      '  <button type="button" data-act="ot">MOM<small>Shift</small></button>' +
      '  <button type="button" data-act="boost">BOOST<small>B</small></button>' +
      '</div>';
    document.body.appendChild(els.hud);
    var q = function (s) { return els.hud.querySelector(s); };
    els.flag = q('.rl-flag'); els.radio = q('.rl-radio'); els.panel = q('.rl-panel');
    els.cur = q('.rl-cur'); els.wear = q('.rl-wear i'); els.wearTxt = q('.rl-wear-txt');
    els.soc = q('.rl-soc i'); els.socTxt = q('.rl-soc-txt');
    els.ot = q('.rl-ot'); els.boost = q('.rl-boost'); els.straight = q('.rl-straight');
    els.fuel = q('.rl-fuel'); els.next = q('.rl-next'); els.box = q('.rl-box'); els.pen = q('.rl-pen');
    els.ps = q('.rl-pitstop'); els.psTime = q('.rl-ps-time'); els.psCrew = q('.rl-ps-crew'); els.psNote = q('.rl-ps-note');
    els.q = q('.rl-q');
    els.tyreRow = q('.rl-tyre-row');
    els.temps = q('.rl-car').children; els.tempTxt = q('.rl-temp-txt'); els.tow = q('.rl-tow'); els.pitcue = q('.rl-pitcue');
    els.gaps = q('.rl-gaps');
    els.dmg = q('.rl-dmg');
    // crew dots for the 2D pit stop panel (top view of the car and 4 wheel crews)
    els.psCrew.innerHTML = '<svg viewBox="0 0 120 70" aria-hidden="true"><rect class="ps-car" x="44" y="10" width="32" height="50" rx="10"/>' +
      '<g class="ps-w" data-w="0"><rect x="34" y="14" width="10" height="14" rx="3"/></g><g class="ps-w" data-w="1"><rect x="76" y="14" width="10" height="14" rx="3"/></g>' +
      '<g class="ps-w" data-w="2"><rect x="34" y="42" width="10" height="14" rx="3"/></g><g class="ps-w" data-w="3"><rect x="76" y="42" width="10" height="14" rx="3"/></g>' +
      '<circle class="ps-man" cx="24" cy="21" r="4"/><circle class="ps-man" cx="96" cy="21" r="4"/><circle class="ps-man" cx="24" cy="49" r="4"/><circle class="ps-man" cx="96" cy="49" r="4"/>' +
      '<circle class="ps-man is-jack" cx="60" cy="4" r="4"/><circle class="ps-man is-jack" cx="60" cy="66" r="4"/><rect class="ps-light" x="104" y="2" width="12" height="8" rx="2"/></svg>';
    els.psWheels = els.psCrew.querySelectorAll('.ps-w');
    els.psLight = els.psCrew.querySelector('.ps-light');
    // rain on the screen
    els.rain = el('canvas', 'rl-rain');
    els.rain.hidden = true;
    document.body.appendChild(els.rain);
    els.touch = q('.rl-touch');
    els.touch.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'box') CR.Real.requestBox();
      else if (a === 'stay') CR.Real.stayOut();
      else if (a === 'tyre') CR.Real.cycleTyre();
      else if (a === 'ot') CR.Real.overtake();
      else if (a === 'boost') { boostLatch = !boostLatch; CR.Real.setBoost(boostLatch); }
    });
    window.addEventListener('keydown', function (e) {
      if (!CR.Real || !CR.Real.on || !CR.Main || CR.Main.state !== 'playing') return;
      if (e.code === 'KeyB') CR.Real.setBoost(true);
      if (e.repeat) return;
      if (e.code === 'KeyF' || e.code === 'KeyP') CR.Real.requestBox();
      else if (e.code === 'KeyX') CR.Real.stayOut();
      else if (e.code === 'KeyT') CR.Real.cycleTyre();
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') CR.Real.overtake(); // MOM (Manual Override Mode)
    });
    window.addEventListener('keyup', function (e) { if (e.code === 'KeyB' && CR.Real) CR.Real.setBoost(boostLatch); });
    CR.Real.onMessage = function (m) { pushRadio(m); };
    CR.Real.onQualiSession = function (s, table) {
      var q = CR.Real.q;
      setTimeout(function () { if (CR.Real.on && CR.Real.q === q && q.session === s) showQualiTable(s, table); }, 1600);
    };
  };
  var boostLatch = false;

  // Session started / ended (main.js): HUD on/off.
  UI.onSession = function () {
    var on = CR.Real.on;
    els.hud.hidden = !on;
    els.hud.classList.toggle('is-quali', on && CR.Real.phase === 'quali');
    els.screen.hidden = true;
    els.radio.textContent = '';
    boostLatch = false;
    document.body.classList.toggle('in-real', on);
    var tot = document.querySelector('#race-pos span');
    if (tot) tot.textContent = '/' + (on && CR.Real.phase === 'race' ? 20 : 6);
    if (CR.Real.phase === 'quali' && on) {
      els.q.hidden = false;
      els.q.innerHTML = '';
      els.q.appendChild(el('b', null, 'Q' + CR.Real.q.session));
      els.q.appendChild(el('span', null, CR.Real.q.session === 1 ? '20명 · 하위 5명 탈락' : CR.Real.q.session === 2 ? '15명 · 하위 5명 탈락' : '10명 · 폴 포지션 결정'));
      var cut = cutTime();
      if (cut) els.q.appendChild(el('span', 'rl-q-cut', '예상 컷 ' + fmt(cut)));
    } else els.q.hidden = true;
    lastTower = 0;
  };
  // Expected knockout time for the current session (from the AI pace).
  function cutTime() {
    var R = CR.Real, q = R.q;
    if (!q || q.session === 3) return null;
    var keep = q.alive.length - 5, ts = [];
    q.alive.forEach(function (id) {
      if (id === 'you') return;
      var d = RD().driver(id);
      ts.push(R.qIdeal * R.level().factor * RD().team(d.team).perf * d.skill * (1 - 0.0015 * (q.session - 1)));
    });
    ts.sort(function (a, b) { return a - b; });
    return ts[keep - 1];
  }

  // --- Radio --------------------------------------------------------------------
  function pushRadio(m) {
    if (!els.radio) return;
    var row = el('div', 'rl-msg is-' + m.kind);
    row.appendChild(el('b', null, m.kind === 'race' ? '레이스 컨트롤' : m.kind === 'flag' ? '플래그' : m.kind === 'box' ? '팀 라디오' : '엔지니어'));
    row.appendChild(el('span', null, m.text));
    els.radio.appendChild(row);
    while (els.radio.children.length > 3) els.radio.removeChild(els.radio.firstChild);
    setTimeout(function () { row.classList.add('is-old'); }, 6500);
    setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 7400);
  }

  // --- Per frame --------------------------------------------------------------------
  var lastTower = 0, panelT = 0;
  UI.update = function (dt) {
    var R = CR.Real;
    if (!R || !R.on) { if (!els.rain.hidden) els.rain.hidden = true; return; }
    drawRain(dt);
    panelT -= dt;
    if (panelT <= 0) { panelT = 0.1; updatePanel(); }
    updatePitStop();
    updateFlag();
    updatePitCue();
  };

  function updatePanel() {
    var R = CR.Real, RP = CR.RealPhys, st = RP.st, d = RD().CAR;
    els.cur.textContent = '';
    els.cur.appendChild(tyreChip(st.tyre));
    var life = Math.max(0, 1 - st.wear);
    els.wear.style.width = Math.round(life * 100) + '%';
    els.wear.style.background = life > 0.5 ? '#5ee39a' : life > 0.2 ? '#ffd23f' : '#ff5a4e';
    els.wearTxt.textContent = Math.round(life * 100) + '%';
    // tyre temperatures: four corners coloured cold (blue) / window (green) / hot (red)
    var opt = CR.RealPhys.OPT[st.tyre] || 100;
    for (var ti = 0; ti < 4; ti++) {
      var tc = st.corners[ti], dd = tc - opt;
      els.temps[ti].style.background = dd < -30 ? '#3d7bff' : dd < -12 ? '#5ec8ff' : dd <= 15 ? '#5ee39a' : dd <= 28 ? '#ffb020' : '#ff4e3e';
      els.temps[ti].title = Math.round(tc) + '°C';
    }
    var dAvg = st.temp - opt;
    els.tempTxt.textContent = Math.round(st.temp) + '°C' + (dAvg < -20 ? ' 저온' : dAvg > 20 ? ' 과열' : '');
    els.tempTxt.style.color = dAvg < -20 ? '#5ec8ff' : dAvg > 20 ? '#ff8a7a' : '';
    els.tow.classList.toggle('is-on', st.tow > 0.25);
    var Dm = CR.RealDmg, dtx = Dm && Dm.any() ? '파손: ' + (Dm.repairText() || '경미') : '';
    els.dmg.hidden = !dtx;
    if (els.dmg.textContent !== dtx) els.dmg.textContent = dtx;
    els.soc.style.width = Math.round(st.soc / d.BATTERY_MJ * 100) + '%';
    els.socTxt.textContent = st.soc.toFixed(1) + 'MJ';
    els.ot.classList.toggle('is-avail', !!st.otAvail);
    els.ot.classList.toggle('is-on', !!st.otActive);
    els.ot.textContent = st.otActive ? 'OVERTAKE ' + Math.max(0, st.otBudget).toFixed(2) : 'OVERTAKE';
    els.boost.classList.toggle('is-on', !!st.boost && st.soc > 0);
    els.straight.classList.toggle('is-on', st.wing > 0.5);
    els.fuel.textContent = st.fuel.toFixed(1) + 'kg';
    var race = R.phase === 'race' && R.pl;
    els.next.textContent = '';
    if (race) els.next.appendChild(tyreChip(R.pl.nextTyre, true));
    els.box.textContent = race ? (CR.Car.state.inPit ? 'PIT' : R.pl.box ? 'BOX 요청' : '') : '';
    els.box.classList.toggle('is-on', !!(race && R.pl.box));
    var pen = race ? R.pl.pen : 0, warn = race ? R.pl.warnings : 0;
    els.pen.hidden = !(pen || warn);
    if (pen || warn) els.pen.textContent = (warn ? '트랙 리밋 ' + Math.min(3, warn) + '/3' : '') + (pen ? '  ·  페널티 +' + pen + '초' : '');
    els.touch.classList.toggle('is-quali', !race);
    // touch screens: the timing tower is hidden, the cars around you show here
    if (race && document.body.classList.contains('touch')) {
      var order = R.order(), i = order.indexOf(CR.Race.player), L = CR.Race._ctx().L, vRef = L / (R.idealLap * 1.04);
      var txt = function (a, b) { var d = a.dist - b.dist; return d > L ? '+' + Math.floor(d / L) + '랩' : (d / vRef).toFixed(1) + '초'; };
      var parts = [];
      if (i > 0) parts.push('앞 ' + order[i - 1].driver.code + ' ' + txt(order[i - 1], CR.Race.player));
      if (i >= 0 && i < order.length - 1 && !order[i + 1].retired) parts.push('뒤 ' + order[i + 1].driver.code + ' ' + txt(CR.Race.player, order[i + 1]));
      els.gaps.textContent = parts.join(' · ');
    } else els.gaps.textContent = '';
    if (race) {
      var lastTowerNow = performance.now();
      if (lastTowerNow - lastTower > 250) lastTower = lastTowerNow;
    }
  }

  function updateFlag() {
    var R = CR.Real, f = null, cls = '';
    if (R.phase === 'race') {
      if (R.chequered) { f = '체커기'; cls = 'is-cheq'; }
      else if (R.scMode === 'sc') { f = R.scEnding ? 'SC 이번 랩 피트인' : 'SAFETY CAR'; cls = 'is-sc'; }
      else if (R.scMode === 'vsc') { f = 'VIRTUAL SAFETY CAR · 델타 ' + (R.pl.vscDelta >= 0 ? '+' : '') + R.pl.vscDelta.toFixed(1); cls = R.pl.vscDelta < 0 ? 'is-sc is-bad' : 'is-sc'; }
      else if (CR.RealDmg && CR.RealDmg.meatball && !CR.RealDmg.meatball.done && CR.RealDmg.dangerous()) { f = '흑색·주황 깃발 · 위험 차량 — 피트인'; cls = 'is-meatball'; }
      else if (R.pl && R.pl.blue) { f = '블루 플래그 · 뒤차에 길을 비켜'; cls = 'is-blue'; }
      else if (yellowAhead()) { f = '옐로 플래그'; cls = 'is-yellow'; }
      else if (R.pl && R.pl.warnings === 3 && !R.pl.bwShown) { f = '흑백기 · 다음 트랙 리밋은 5초'; cls = 'is-bw'; }
      else if (R.restartLap !== undefined && CR.Race.clock < (R.greenAt || 0) + 4) { f = 'GREEN'; cls = 'is-green'; }
    }
    if (R.restartLap !== undefined && R.restartLap !== UI._lastRestart) { UI._lastRestart = R.restartLap; R.greenAt = CR.Race.clock; }
    var txt = f || '';
    if (els.flag.textContent !== txt) els.flag.textContent = txt;
    els.flag.hidden = !f;
    els.flag.className = 'rl-flag ' + cls;
  }
  function yellowAhead() {
    var R = CR.Real, inc = R.incidents || [], p = CR.Race.player, L = CR.Race._ctx().L;
    for (var i = 0; i < inc.length; i++) {
      if (CR.Race.clock - inc[i].at > 40) continue;
      var g = ((inc[i].dist - p.dist) % L + L * 1.5) % L - L / 2;
      if (g > -60 && g < 400) return true;
    }
    return false;
  }

  // Box requested: distance to the pit entry and which side it is on.
  function updatePitCue() {
    var R = CR.Real, show = false;
    if (R.phase === 'race' && R.pl && R.pl.box && !CR.Car.state.inPit && CR.Race.phase === 'green') {
      var rel = CR.RealPit.relOf(CR.Race.player.dist), to = -CR.RealPit.ENTRY - rel;
      if (to > 0 && to < 1200) {
        show = true;
        var left = CR.RealPit.side > 0;
        var txt = (left ? '◀ ' : '') + 'PIT ENTRY ' + Math.round(to) + 'm' + (left ? '' : ' ▶');
        if (els.pitcue.textContent !== txt) els.pitcue.textContent = txt;
        els.pitcue.classList.toggle('is-near', to < 300);
      }
    }
    els.pitcue.hidden = !show;
  }

  // 2D pit stop panel (both presets; the 3D view adds the crew around the car).
  function updatePitStop() {
    var p = CR.RealPit.player;
    var show = !!(p && (p.phase === 'stop' || (p.phase === 'out' && p.t < 1.2)));
    els.ps.hidden = !show;
    if (!show) return;
    var t = p.phase === 'stop' ? p.t : p.stopTime;
    els.psTime.textContent = t.toFixed(1) + '초';
    var serve = p.serve || 0, work = t - serve;
    els.psNote.textContent = serve > 0 && work < 0 ? '페널티 ' + serve + '초 소화 중' : p.phase === 'out' ? '출발! ' + RD().tyre(p.tyre).name : '타이어 교체 · ' + RD().tyre(p.tyre).name;
    var wf = Math.max(0, Math.min(1, (work - 0.25) / Math.max(0.6, p.stopTime - serve - 0.6)));
    for (var i = 0; i < 4; i++) {
      var g = els.psWheels[i];
      var off = wf > 0.05 && wf < 0.75; // wheel off between gun-off and gun-on
      g.classList.toggle('is-off', off);
      g.classList.toggle('is-new', wf >= 0.75);
      g.style.setProperty('--ty', RD().tyre(p.tyre).color);
    }
    els.psLight.classList.toggle('is-go', p.phase === 'out');
  }

  // Rain streaks and drops on the screen (wet track / rain).
  var drops = [], rctx = null;
  function drawRain(dt) {
    var R = CR.Real, rain = R.phase === 'race' ? R.rain : (R.weather && R.weather.start > 0.3 ? 0.6 : 0);
    var wet = CR.RealPhys.wet;
    var show = rain > 0.03 || wet > 0.25;
    if (els.rain.hidden === show) els.rain.hidden = !show;
    document.body.classList.toggle('real-wet', wet > 0.25);
    if (!show) return;
    var c = els.rain, w = window.innerWidth, h = window.innerHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; rctx = c.getContext('2d'); }
    var ctx = rctx || (rctx = c.getContext('2d'));
    ctx.clearRect(0, 0, w, h);
    var v = CR.Car.state.speed, n = Math.floor(rain * 160);
    ctx.strokeStyle = 'rgba(210,225,245,' + (0.18 + rain * 0.2) + ')';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    var t = performance.now() / 1000, len = 14 + v * 0.35;
    for (var i = 0; i < n; i++) {
      var sx = (Math.sin(i * 12.9898) * 43758.5453) % 1, sy = (Math.sin(i * 78.233) * 12543.123) % 1;
      sx = (sx + 1) % 1; sy = (sy + 1) % 1;
      var x = sx * w, y = ((sy + t * (1.1 + v * 0.012)) % 1) * h;
      var dx = (x - w / 2) / w * len * 0.6;
      ctx.moveTo(x, y); ctx.lineTo(x + dx, y + len);
    }
    ctx.stroke();
    // drops on the lens (cockpit) / spray mist
    if (CR.Camera.inCockpit && CR.Camera.inCockpit()) {
      if (Math.random() < rain * dt * 30) drops.push({ x: Math.random() * w, y: Math.random() * h * 0.6, r: 2 + Math.random() * 5, life: 1 });
      ctx.fillStyle = 'rgba(220,235,255,0.22)';
      drops.forEach(function (d) { d.life -= dt * (0.4 + v / 60); d.y += dt * v * 0.8; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill(); });
      drops = drops.filter(function (d) { return d.life > 0 && d.y < h; });
    } else drops.length = 0;
    if (wet > 0.3) {
      var g = ctx.createLinearGradient(0, h * 0.35, 0, h);
      g.addColorStop(0, 'rgba(150,165,185,0)');
      g.addColorStop(1, 'rgba(150,165,185,' + (wet * 0.16) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // --- Timing tower (raceui.js calls this in a realistic race) ----------------------
  UI.renderTower = function (tower) {
    var R = CR.Real, order = R.order(), lead = order[0], L = CR.Race._ctx().L;
    var vRef = L / (R.idealLap * 1.04);
    tower.textContent = '';
    tower.classList.add('is-real');
    var me = order.indexOf(CR.Race.player);
    var compact = document.body.classList.contains('touch') || window.innerHeight < 760;
    order.forEach(function (car, i) {
      if (compact && i > 2 && Math.abs(i - me) > 2) return;
      var li = el('li', car.isPlayer ? 'is-you' : null);
      if (compact && i > 2 && i === me - 2 && me - 2 > 3) li.classList.add('is-gap');
      li.appendChild(el('span', 'rt-pos', String(i + 1)));
      var chip = el('span', 'rt-chip');
      chip.style.background = car.isPlayer ? CR.Cars.byId('f1').color : car.driver.main;
      li.appendChild(chip);
      li.appendChild(el('span', 'rt-code', car.driver.code));
      var gap = '', tyre = car.isPlayer ? CR.RealPhys.st.tyre : car.rt.tyre;
      var pit = car.isPlayer ? CR.Car.state.inPit : !!car.rt.pit;
      if (car.retired) gap = 'OUT';
      else if (pit) gap = 'PIT';
      else if (car.finished) gap = '완주';
      else if (i === 0) gap = '리더';
      else {
        var dd = lead.dist - car.dist;
        gap = dd > L ? '+' + Math.floor(dd / L) + '랩' : '+' + (dd / vRef).toFixed(1);
      }
      var g = el('span', 'rt-gap' + (pit ? ' is-pit' : car.retired ? ' is-out' : ''), gap);
      li.appendChild(g);
      li.appendChild(tyreChip(tyre, true));
      tower.appendChild(li);
    });
  };

  // --- Menu tab ----------------------------------------------------------------------
  UI.renderMenu = function (panel) {
    var G = CR.Garage, save = G.realSave(), set = save.settings, season = save.season;
    RD().buildModels();
    panel.textContent = '';
    if (!CR.Race.canEnter()) {
      var lock = el('section', 'race-card race-locked');
      lock.appendChild(el('h2', 'race-card-title', '리얼리스틱 모드'));
      lock.appendChild(el('p', 'race-card-text', 'F1을 구매하고 F1으로 ' + CR.Race.UNLOCK_F1_LAPS + '랩을 달리면 실제 F1과 같은 레이스 주말(예선 · 결선 · 피트스톱 · 시즌 챔피언십)에 참가할 수 있어요.'));
      panel.appendChild(lock);
      return;
    }
    var round = Math.min(season.races.length, RD().CALENDAR.length - 1);
    var next = RD().CALENDAR[round], ti = CR.Real.trackIndexOf(next), track = CR.Tracks.list[ti];
    var realLaps = RD().LAPS[next];

    // next round
    var hero = el('section', 'race-card rl-next-card');
    hero.appendChild(el('div', 'menu-section', '시즌 ' + season.num + ' · 라운드 ' + (round + 1) + '/' + RD().CALENDAR.length));
    hero.appendChild(el('h2', 'race-card-title', track.name));
    hero.appendChild(el('p', 'race-card-text rl-left', realLaps + '랩 실제 레이스 · ' + Math.max(3, Math.round(realLaps * set.length / 100)) + '랩으로 진행 · 비 확률 ' + Math.round((RD().RAIN_CHANCE[next] || 0) * 100) + '%'));
    hero.appendChild(el('p', 'race-card-note rl-left', 'Sim Race · 20대 · 10팀 · 실제 F1 포인트(25-18-15-12-10-8-6-4-2-1) · 2026 규정: DRS 대신 오버테이크 모드(MOM)·액티브 에어로(스트레이트 모드)'));
    panel.appendChild(hero);

    // settings
    var sc = el('section', 'race-card');
    sc.appendChild(el('div', 'menu-section', '레이스 주말 설정'));
    sc.appendChild(choiceRow('레이스 길이', RD().LENGTHS.map(function (l) { return { id: l.id, name: l.name, desc: l.desc + ' · ' + Math.max(3, Math.round(realLaps * l.id / 100)) + '랩' }; }), set.length, function (v) { G.setRealSetting('length', v); }));
    sc.appendChild(choiceRow('날씨', RD().WEATHER, set.weather, function (v) { G.setRealSetting('weather', v); }));
    sc.appendChild(choiceRow('AI 수준', RD().LEVELS.map(function (l) { return { id: l.id, name: l.name, desc: '이상적인 랩 +' + Math.round((l.factor - 1) * 1000) / 10 + '%' }; }), set.level, function (v) { G.setRealSetting('level', v); }));
    sc.appendChild(choiceRow('예선', [{ id: true, name: '진행', desc: 'Q1·Q2·Q3 녹아웃, 플라잉 랩 1회씩' }, { id: false, name: '건너뛰기', desc: '시뮬레이션으로 그리드 결정' }], set.quali, function (v) { G.setRealSetting('quali', v); }));
    panel.appendChild(sc);

    // calendar
    var cal = el('section', 'race-card');
    cal.appendChild(el('div', 'menu-section', '캘린더'));
    var ol = el('ol', 'rl-cal');
    RD().CALENDAR.forEach(function (name, k) {
      var t = CR.Tracks.list[CR.Real.trackIndexOf(name)];
      var li = el('li', k === round ? 'is-next' : k < season.races.length ? 'is-done' : null);
      li.appendChild(el('span', 'rl-cal-no', 'R' + (k + 1)));
      li.appendChild(el('span', 'rl-cal-name', t.name));
      var r = season.races[k];
      li.appendChild(el('span', 'rl-cal-res', r ? (r.retired ? 'DNF' : 'P' + r.playerPos) : k === round ? '다음' : ''));
      ol.appendChild(li);
    });
    cal.appendChild(ol);
    panel.appendChild(cal);

    // standings
    var st = CR.Real.standings(season);
    var sd = el('section', 'race-card');
    sd.appendChild(el('div', 'menu-section', '드라이버 순위'));
    sd.appendChild(standingsTable(st.drivers, true, 10));
    panel.appendChild(sd);
    var stc = el('section', 'race-card');
    stc.appendChild(el('div', 'menu-section', '컨스트럭터 순위'));
    stc.appendChild(standingsTable(st.teams, false, 10));
    panel.appendChild(stc);

    if (save.seasons.length) {
      var hist = el('section', 'race-card');
      hist.appendChild(el('div', 'menu-section', '지난 시즌'));
      var ul = el('ul', 'rl-hist');
      save.seasons.slice(-5).reverse().forEach(function (s) {
        ul.appendChild(el('li', null, '시즌 ' + s.num + ' · 드라이버 ' + s.playerRank + '위 · 팀 ' + s.teamRank + '위' + (s.playerRank === 1 ? ' · 챔피언!' : '')));
      });
      hist.appendChild(ul);
      panel.appendChild(hist);
    }
    // Sim Race: online career ranking (cloud.js, its own Firebase project)
    if (CR.Cloud && CR.Cloud.enabled) {
      var rk = el('section', 'race-card sr-rank');
      rk.appendChild(el('div', 'menu-section', '커리어 랭킹 · 포인트'));
      var body = el('div', null);
      body.appendChild(el('p', 'race-card-note', '불러오는 중…'));
      rk.appendChild(body);
      panel.appendChild(rk);
      CR.Cloud.careerRanking(false).then(function (data) {
        body.textContent = '';
        var mine = CR.Cloud.user ? CR.Cloud.user.uid : null;
        if (!data.top.length) body.appendChild(el('p', 'race-card-note', '아직 기록이 없어요. 첫 레이스를 완주해 보세요!'));
        else {
          var tb = el('table', 'rr-table'), hr = el('tr');
          ['#', '드라이버', '포인트', '우승', '챔피언', '레이스'].forEach(function (h, i) { hr.appendChild(el('th', i >= 2 ? 'rr-num' : null, h)); });
          tb.appendChild(hr);
          data.top.forEach(function (r, i) {
            var tr = el('tr', r.uid === mine ? 'is-you' : null);
            tr.appendChild(el('td', 'rr-pos', String(i + 1)));
            var who = el('td', 'rr-driver'); who.appendChild(el('b', null, r.name || '드라이버')); tr.appendChild(who);
            [r.points, r.wins, r.titles, r.races].forEach(function (v, k) { tr.appendChild(el('td', 'rr-num' + (k === 0 ? ' rr-pts' : ''), String(v || 0))); });
            tb.appendChild(tr);
          });
          body.appendChild(tb);
        }
        body.appendChild(el('p', 'rank-foot', CR.Cloud.state !== 'in' ? '구글로 로그인하면 내 기록도 올라가요. (총 ' + data.total + '명)'
          : data.me ? '내 순위 ' + data.me.rank + '위 / ' + data.total + '명 · ' + data.me.points + '점' : '레이스를 완주하면 랭킹에 올라가요. (총 ' + data.total + '명)'));
      }, function () { body.textContent = ''; body.appendChild(el('p', 'acct-error', '랭킹을 불러오지 못했어요. 네트워크를 확인해 주세요.')); });
    }
    var keys = el('section', 'race-card rl-keys');
    keys.appendChild(el('div', 'menu-section', '조작'));
    keys.appendChild(el('p', 'race-card-note rl-left', 'F 피트인 요청(BOX BOX BOX) · X 스테이 아웃 · T 다음 타이어 · Shift 오버테이크 모드 MOM(앞차 1초 이내로 감지선 통과 시) · B 부스트(누르는 동안 배터리 사용) · 직선 구간 스트레이트 모드 자동 · 앞차 바로 뒤 슬립스트림(TOW)'));
    panel.appendChild(keys);
  };
  function choiceRow(label, items, cur, onPick) {
    var row = el('div', 'rl-choice');
    row.appendChild(el('span', 'rl-choice-label', label));
    var g = el('div', 'rl-choice-btns');
    items.forEach(function (it) {
      var b = el('button', 'rl-opt' + (it.id === cur ? ' is-on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', it.id === cur ? 'true' : 'false');
      b.appendChild(el('b', null, it.name));
      if (it.desc) b.appendChild(el('small', null, it.desc));
      b.addEventListener('click', function () { onPick(it.id); CR.Menu.refresh(); });
      g.appendChild(b);
    });
    row.appendChild(g);
    return row;
  }
  function standingsTable(list, drivers, max) {
    var tb = el('table', 'rr-table'), head = el('tr');
    ['#', drivers ? '드라이버' : '팀', '승', '포인트'].forEach(function (h, i) { head.appendChild(el('th', i >= 2 ? 'rr-num' : null, h)); });
    tb.appendChild(head);
    var me = list.map(function (s) { return s.id; }).indexOf('you');
    list.forEach(function (s, i) {
      if (i >= max && i !== me) return;
      var tr = el('tr', s.id === 'you' ? 'is-you' : null);
      tr.appendChild(el('td', 'rr-pos', String(i + 1)));
      if (drivers) tr.appendChild(driverCell(s.id));
      else {
        var td = el('td', 'rr-driver'), chip = el('span', 'rr-chip');
        chip.style.background = teamColor(s.id);
        td.appendChild(chip);
        td.appendChild(el('b', null, RD().team(s.id).name));
        tr.appendChild(td);
      }
      tr.appendChild(el('td', 'rr-num', String(s.wins)));
      tr.appendChild(el('td', 'rr-num rr-pts', String(s.points)));
      tb.appendChild(tr);
    });
    return tb;
  }

  // --- Weekend screens -------------------------------------------------------------------
  function open(cls) {
    if (CR.Main.state === 'menu') { CR.Menu.hide(); document.body.classList.remove('in-menu'); }
    CR.Main.state = 'realscreen';
    CR.Audio.silence();
    els.card.className = 'rr-card rl-card ' + (cls || '');
    els.card.textContent = '';
    els.screen.hidden = false;
    els.card.scrollTop = 0;
  }
  function head(title, sub) {
    var h = el('div', 'rr-head');
    h.appendChild(el('h2', 'rr-title', title));
    if (sub) h.appendChild(el('p', 'rr-sub', sub));
    els.card.appendChild(h);
  }
  function actions(list) {
    var a = el('div', 'rr-actions');
    list.forEach(function (b) { a.appendChild(b); });
    els.card.appendChild(a);
    var last = a.lastChild;
    if (last) setTimeout(function () { last.focus(); }, 30);
  }

  // Knockout table after a qualifying session.
  function showQualiTable(s, table) {
    var R = CR.Real, q = R.q, my = q.run ? q.run.time : null;
    open('is-quali');
    var outCount = s < 3 ? 5 : 0, keep = table.length - outCount;
    var myPos = table.map(function (e) { return e.id; }).indexOf('you') + 1;
    var title = 'Q' + s + ' 결과';
    var sub = CR.Tracks.list[R.trackIndex].name + ' · ' + (my === null ? (q.run && q.run.deleted ? '랩 타임 삭제 (트랙 리밋)' : '기록 없음') : '내 기록 ' + fmt(my) + ' · P' + myPos);
    head(title, sub);
    var tb = el('table', 'rr-table'), hr = el('tr');
    ['#', '드라이버', '타임', '차이'].forEach(function (h, i) { hr.appendChild(el('th', i >= 2 ? 'rr-num' : null, h)); });
    tb.appendChild(hr);
    var best = table[0].time;
    table.forEach(function (e, i) {
      var tr = el('tr', (e.id === 'you' ? 'is-you' : '') + (i === keep ? ' rl-cut' : '') + (i >= keep ? ' rl-out' : ''));
      tr.appendChild(el('td', 'rr-pos', String(i + 1)));
      tr.appendChild(driverCell(e.id));
      tr.appendChild(el('td', 'rr-num', fmt(e.time)));
      tr.appendChild(el('td', 'rr-num', i === 0 || e.time === null ? '' : '+' + (e.time - best).toFixed(3)));
      tb.appendChild(tr);
    });
    els.card.appendChild(tb);
    var done = s === 3 || myPos > keep;
    if (s < 3) els.card.appendChild(el('p', 'rr-note', myPos <= keep ? 'Q' + (s + 1) + ' 진출!' : '탈락 · 결선은 P' + myPos + ' 이후에서 출발'));
    actions([btn(done ? '결선 그리드 보기 ▶' : 'Q' + (s + 1) + ' 시작 ▶', 'is-primary', function () {
      var over = R.advanceQuali();
      els.screen.hidden = true;
      if (over) UI.showGrid();
      else CR.Main.nextQualiRun();
    })]);
  }

  // Starting grid, forecast and starting tyre.
  UI.showGrid = function () {
    var R = CR.Real;
    open('is-grid');
    var my = R.grid.map(function (g) { return g.isPlayer; }).indexOf(true) + 1;
    head('결선 그리드 · P' + my + ' 출발', CR.Tracks.list[R.trackIndex].name + ' · ' + R.laps + '랩 · AI ' + R.level().name);
    var grid = el('ol', 'rl-grid');
    R.grid.forEach(function (g, i) {
      var id = g.isPlayer ? 'you' : g.driver.id, d = info(id);
      var li = el('li', (g.isPlayer ? 'is-you ' : '') + (i % 2 ? 'is-r' : 'is-l'));
      li.appendChild(el('span', 'rl-grid-no', String(i + 1)));
      var chip = el('span', 'rr-chip');
      chip.style.background = d.color;
      li.appendChild(chip);
      li.appendChild(el('b', null, d.code));
      var gt = R.gridTimes && R.gridTimes[i];
      li.appendChild(el('small', null, gt && gt.time ? fmt(gt.time) : d.teamName));
      grid.appendChild(li);
    });
    els.card.appendChild(grid);
    // forecast
    var w = R.weather, fc = el('p', 'rl-forecast');
    fc.textContent = w.mode === 'dry' ? '예보: 맑음 · 노면 건조' : w.start > 0.3 ? '예보: 비 · 젖은 노면에서 출발, 레이스 중 마를 수 있어요' :
      '예보: 레이스 ' + Math.round(w.rain[0].a * 100) + '% 지점부터 비 가능성';
    els.card.appendChild(fc);
    // tyre pick
    var pick = el('div', 'rl-tyres');
    pick.appendChild(el('div', 'menu-section', '출발 타이어 · 랩당 차이와 수명(이번 레이스 기준)'));
    var rec = recommend();
    var ids = w.start > 0.3 ? ['I', 'W', 'S', 'M', 'H'] : ['S', 'M', 'H', 'I', 'W'];
    var chosen = rec.tyre;
    var btns = el('div', 'rl-tyre-btns');
    ids.forEach(function (id) {
      var t = RD().tyre(id);
      var b = el('button', 'rl-tyre-btn' + (id === chosen ? ' is-on' : ''));
      b.type = 'button';
      b.appendChild(tyreChip(id));
      b.appendChild(el('b', null, t.name));
      var life = Math.round(t.life * Math.max(0.15, Math.min(1, R.laps / R.realLaps * 1.15)));
      b.appendChild(el('small', null, (t.wet ? '젖은 노면용' : '약 ' + life + '랩') + (id === rec.tyre ? ' · 추천' : '')));
      b.addEventListener('click', function () {
        chosen = id;
        Array.prototype.forEach.call(btns.children, function (x) { x.classList.toggle('is-on', x === b); });
      });
      btns.appendChild(b);
    });
    pick.appendChild(btns);
    pick.appendChild(el('p', 'race-card-note', '엔지니어 추천 전략: ' + rec.text));
    els.card.appendChild(pick);
    actions([
      btn('메뉴로', '', function () { els.screen.hidden = true; CR.Main.leaveReal(); }),
      btn('레이스 시작 ▶', 'is-primary', function () {
        els.screen.hidden = true;
        var go = function () { CR.Main.startRealRace(chosen); };
        if (window.TMLoading) TMLoading.run('레이스 준비 중', go); else go();
      }),
    ]);
  };
  // Engineer's pick for the start (dry: cheapest strategy).
  function recommend() {
    var R = CR.Real, w = R.weather;
    if (w.start > 0.3) return { tyre: CR.RealPhys.bestFor(w.start) || 'I', text: '젖은 노면 — 인터/웨트로 출발, 마르면 슬릭으로' };
    var N = R.laps, ls = Math.max(0.15, Math.min(1, N / R.realLaps * 1.15));
    var life = { S: 18 * ls, M: 28 * ls, H: 40 * ls };
    if (life.H >= N * 0.95 && N <= 8) return { tyre: life.M >= N ? 'M' : 'H', text: '노 스톱 — ' + (life.M >= N ? '미디엄' : '하드') + '으로 끝까지' };
    var stop = Math.round(N * (life.M / (life.M + life.H)));
    if (life.M + life.H >= N) return { tyre: 'M', text: '1스톱 — 미디엄 → ' + stop + '랩 전후 하드' };
    return { tyre: 'M', text: '2스톱 — 미디엄 → 하드 → 미디엄 (피트 창은 무전으로 알려줄게요)' };
  }

  // --- Results ----------------------------------------------------------------------------
  UI.showResults = function (res, rec) {
    var flow = [function () { resultsTable(res, rec, next); }, function () { standingsScreen(res, rec, next); }];
    if (rec.finishedSeason) flow.push(function () { seasonEnd(rec.finishedSeason, next); });
    var k = 0;
    function next() { k++; if (k < flow.length) flow[k](); else { els.screen.hidden = true; CR.Main.leaveReal(); } }
    flow[0]();
  };
  function resultsTable(res, rec, next) {
    open('is-results');
    var me = res.entries.filter(function (e) { return e.isPlayer; })[0];
    head('라운드 ' + res.round + ' 결과 · ' + res.trackName, res.laps + '랩 · ' + (res.weather === 'dry' ? '맑음' : '비') + (res.fastest ? ' · 패스티스트 랩 ' + res.fastest.code + ' ' + fmt(res.fastest.time) : ''));
    var hero = el('div', 'rr-hero' + (me.dnf ? ' is-ret' : me.pos <= 3 ? ' is-podium' : ''));
    hero.appendChild(el('span', 'rr-hero-pos', me.dnf ? 'DNF' : 'P' + me.pos));
    hero.appendChild(el('span', 'rr-hero-pts', '+' + me.points + '점 · 상금 ' + CR.Garage.format(rec.prize) + ' · 그리드 P' + me.grid + ' · 피트 ' + me.stops + '회' + (me.pen ? ' · 페널티 ' + me.pen + '초' : '')));
    els.card.appendChild(hero);
    var tb = el('table', 'rr-table'), hr = el('tr');
    ['#', '드라이버', '기록', '피트', '점수'].forEach(function (h, i) { hr.appendChild(el('th', i >= 2 ? 'rr-num' : null, h)); });
    tb.appendChild(hr);
    res.entries.forEach(function (e) {
      var tr = el('tr', e.isPlayer ? 'is-you' : null);
      tr.appendChild(el('td', 'rr-pos', String(e.pos)));
      tr.appendChild(driverCell(e.id));
      var txt = e.dnf ? 'DNF' + (e.why ? ' · ' + e.why : '') : e.pos === 1 ? fmt(e.time) : e.lapsDown ? '+' + e.lapsDown + '랩' : '+' + e.gap.toFixed(3);
      tr.appendChild(el('td', 'rr-num', txt));
      tr.appendChild(el('td', 'rr-num', String(e.stops || 0)));
      tr.appendChild(el('td', 'rr-num rr-pts', e.points ? '+' + e.points : ''));
      tb.appendChild(tr);
    });
    els.card.appendChild(tb);
    actions([btn('챔피언십 순위 ▶', 'is-primary', next)]);
  }
  function standingsScreen(res, rec, next) {
    open('is-standings');
    var season = rec.season, st = CR.Real.standings(season);
    head('챔피언십 · 시즌 ' + season.num, season.races.length + '/' + RD().CALENDAR.length + ' 라운드 완료');
    var wrap = el('div', 'rl-two');
    var a = el('div'); a.appendChild(el('div', 'menu-section', '드라이버')); a.appendChild(standingsTable(st.drivers, true, 10));
    var b = el('div'); b.appendChild(el('div', 'menu-section', '컨스트럭터')); b.appendChild(standingsTable(st.teams, false, 10));
    wrap.appendChild(a); wrap.appendChild(b);
    els.card.appendChild(wrap);
    actions([btn(rec.finishedSeason ? '시즌 최종 결과 ▶' : '메뉴로 ▶', 'is-primary', next)]);
  }
  function seasonEnd(fs, next) {
    open('is-season');
    var champ = info(fs.drivers[0].id), team = RD().team(fs.teams[0].id);
    head('시즌 ' + fs.num + ' 종료', '드라이버 챔피언 ' + champ.name + ' · 컨스트럭터 챔피언 ' + team.name);
    var hero = el('div', 'rr-hero' + (fs.playerRank === 1 ? ' is-podium' : ''));
    hero.appendChild(el('span', 'rr-hero-pos', fs.playerRank === 1 ? '챔피언!' : fs.playerRank + '위'));
    hero.appendChild(el('span', 'rr-hero-pts', '드라이버 ' + fs.playerRank + '위 · 내 팀 컨스트럭터 ' + fs.teamRank + '위'));
    els.card.appendChild(hero);
    actions([btn('새 시즌으로 ▶', 'is-primary', next)]);
  }

  CR.RealUI = UI;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { UI.init(); });
  else UI.init();
})();

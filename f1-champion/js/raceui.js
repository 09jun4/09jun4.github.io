// raceui.js — AI 대전 HUD and the post-race screens.
// Load order: after audio.js, before menu.js. Depends on: Race, Garage,
// Laps, Renderer, Tracks (and Main at call time).
//
// HUD during a race: start lights, big position (P3/6), lap "1/3" and an
// F1-style timing tower (gap to the leader). After the flag:
//   results table -> race podium -> (every 5th race) season standings ->
//   season podium -> menu.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var UI = {};
  var els = {};
  var towerTimer = 0;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // Driver info by id (AI roster or the player).
  UI.driver = function (id) {
    if (id === 'you') return { code: 'YOU', name: CR.Race.PLAYER.name, team: CR.Race.PLAYER.team, main: CR.Cars.byId('f1').color, model: CR.Cars.byId('f1').model };
    for (var i = 0; i < CR.Race.DRIVERS.length; i++) if (CR.Race.DRIVERS[i].id === id) return CR.Race.DRIVERS[i];
    return { code: '???', name: id, team: '', main: '#888888' };
  };

  UI.init = function () {
    els.lights = document.getElementById('race-lights');
    els.lamps = els.lights.querySelectorAll('span');
    els.pos = document.getElementById('race-pos');
    els.posP = document.getElementById('race-pos-p');
    els.tower = document.getElementById('race-tower');
    els.lapNo = document.getElementById('lap-no');
    els.results = document.getElementById('race-results');
    els.card = document.getElementById('rr-card');
    els.record = document.getElementById('lap-record');
    els.recordLabel = document.getElementById('lap-record-label');
  };

  // Shows/hides the race-only HUD (called when a session starts).
  UI.setRaceHud = function (on) {
    els.pos.hidden = !on;
    els.tower.hidden = !on;
    els.lights.hidden = !on;
    els.record.hidden = on;
    els.recordLabel.hidden = on;
    document.body.classList.toggle('in-race', on);
    lastLit = -1;
    lastPos = -1;
    towerTimer = 0;
  };

  // Practice: the track's all-time practice best in the lap panel.
  UI.showRecord = function (trackId) {
    if (trackId) UI.recordTrack = trackId;
    var view = CR.Camera.mode, rec = CR.Garage.bestBook(view)[UI.recordTrack];
    if (els.recordLabel) els.recordLabel.textContent = view === 'cockpit' ? '1인칭 기록' : '트랙 기록';
    els.record.textContent = rec ? CR.Laps.format(rec.time) : '—:——.———';
  };

  var lastLit = -1, lastPos = -1, lastLapText = '';
  UI.update = function (dt) {
    var R = CR.Race;
    if (!R.active) return;
    if (R.lightsOn !== lastLit) {
      lastLit = R.lightsOn;
      for (var i = 0; i < 5; i++) els.lamps[i].classList.toggle('is-on', i < R.lightsOn);
      els.lights.classList.toggle('is-out', R.phase !== 'lights');
    }
    var pos = R.position();
    if (pos !== lastPos) {
      lastPos = pos;
      els.posP.textContent = 'P' + pos;
    }
    var lap = Math.min(R.LAPS, CR.Laps.lap) + '/' + R.LAPS;
    if (els.lapNo.textContent !== lap) els.lapNo.textContent = lap;
    if (lap !== lastLapText) lastLapText = lap;

    towerTimer -= dt;
    if (towerTimer <= 0) {
      towerTimer = 0.25;
      renderTower();
    }
  };

  function renderTower() {
    var order = CR.Race.order(), lead = order[0];
    els.tower.textContent = '';
    order.forEach(function (car, i) {
      var li = el('li', car.isPlayer ? 'is-you' : null);
      li.appendChild(el('span', 'rt-pos', String(i + 1)));
      var chip = el('span', 'rt-chip');
      chip.style.background = car.isPlayer ? CR.Cars.byId('f1').color : car.driver.main;
      li.appendChild(chip);
      li.appendChild(el('span', 'rt-code', car.driver.code));
      var gap = '';
      if (car.isPlayer && car.retired) gap = 'RET';
      else if (i === 0) gap = '리더';
      else if (car.finished) gap = '완주';
      else {
        var v = Math.max(20, lead.isPlayer ? CR.Car.state.speed : lead.v); // leader's speed: gaps stay in order
        gap = '+' + ((lead.dist - car.dist) / v).toFixed(1);
      }
      li.appendChild(el('span', 'rt-gap', gap));
      els.tower.appendChild(li);
    });
  }

  // --- Post-race screens ------------------------------------------------------

  function fmtTime(t) { return t === null || t === undefined ? '—' : CR.Laps.format(t); }

  function button(text, cls, fn) {
    var b = el('button', 'rr-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function open() {
    els.results.hidden = false;
    els.card.scrollTop = 0;
  }

  // data: {results (race.js), record (Garage.recordRace return)}
  var flow = null;
  UI.showResults = function (results, record) {
    flow = { results: results, record: record };
    showRaceTable();
  };

  function header(title, sub) {
    els.card.textContent = '';
    var h = el('div', 'rr-head');
    h.appendChild(el('h2', 'rr-title', title)).id = 'rr-title';
    if (sub) h.appendChild(el('p', 'rr-sub', sub));
    els.card.appendChild(h);
  }

  function showRaceTable() {
    var r = flow.results, rec = flow.record;
    var diff = CR.Race.difficultyById(r.difficulty).name;
    header('레이스 결과', '시즌 ' + rec.season.num + ' · 경기 ' + rec.season.races.length + '/' + CR.Race.RACES_PER_SEASON + ' · ' + r.trackName + ' · ' + diff);
    var me = r.entries[r.playerPos - 1];
    var hero = el('div', 'rr-hero' + (r.retired ? ' is-ret' : r.playerPos <= 3 ? ' is-podium' : ''));
    hero.appendChild(el('span', 'rr-hero-pos', r.retired ? 'RET' : 'P' + r.playerPos));
    hero.appendChild(el('span', 'rr-hero-pts', r.retired ? '리타이어 · 0 포인트' : '+' + me.points + ' 포인트'));
    els.card.appendChild(hero);

    var table = el('table', 'rr-table');
    var thead = el('thead');
    var hr = el('tr');
    ['순위', '드라이버', '기록', '베스트 랩', '포인트'].forEach(function (t) { hr.appendChild(el('th', null, t)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = el('tbody');
    var winner = r.entries[0].time;
    r.entries.forEach(function (e, i) {
      var tr = el('tr', e.isPlayer ? 'is-you' : null);
      tr.appendChild(el('td', 'rr-pos', String(e.pos)));
      var td = el('td', 'rr-driver');
      var chip = el('span', 'rr-chip');
      chip.style.background = e.color;
      td.appendChild(chip);
      td.appendChild(el('b', null, e.name));
      td.appendChild(el('small', null, e.team));
      tr.appendChild(td);
      var t = e.retired ? 'RET' : i === 0 ? fmtTime(e.time) : '+' + (e.time - winner).toFixed(3);
      tr.appendChild(el('td', 'rr-num', t));
      tr.appendChild(el('td', 'rr-num', fmtTime(e.best)));
      tr.appendChild(el('td', 'rr-num rr-pts', e.points ? '+' + e.points : '0'));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    els.card.appendChild(table);
    var actions = el('div', 'rr-actions');
    actions.appendChild(button('포디움 ▶', 'is-primary', showRacePodium));
    els.card.appendChild(actions);
    open();
  }

  // Three steps: 2nd | 1st | 3rd, each with the car and the driver.
  function podium(top3, label) {
    var wrap = el('div', 'podium');
    var order = [1, 0, 2];
    var canvases = [];
    order.forEach(function (k) {
      var e = top3[k];
      if (!e) return;
      var col = el('div', 'podium-col podium-p' + (k + 1) + (e.isYou ? ' is-you' : ''));
      var cnv = el('canvas', 'podium-car');
      cnv.setAttribute('aria-hidden', 'true');
      col.appendChild(cnv);
      col.appendChild(el('div', 'podium-name', e.name));
      col.appendChild(el('div', 'podium-team', e.team));
      col.appendChild(el('div', 'podium-val', label(e)));
      var step = el('div', 'podium-step');
      step.appendChild(el('span', null, String(k + 1)));
      col.appendChild(step);
      wrap.appendChild(col);
      canvases.push({ cnv: cnv, model: e.model });
    });
    // Confetti
    var conf = el('div', 'confetti');
    var colors = ['#ffd23f', '#ff4d4d', '#3d7fe0', '#2fbf71', '#f4f7ff'];
    for (var i = 0; i < 36; i++) {
      var p = el('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 1.6).toFixed(2) + 's';
      p.style.animationDuration = (2.2 + Math.random() * 1.6).toFixed(2) + 's';
      conf.appendChild(p);
    }
    wrap.appendChild(conf);
    setTimeout(function () {
      canvases.forEach(function (c) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = c.cnv.clientWidth || 150, h = c.cnv.clientHeight || 90;
        c.cnv.width = Math.round(w * dpr);
        c.cnv.height = Math.round(h * dpr);
        var ctx = c.cnv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        CR.Renderer.drawCarPreview(ctx, { model: c.model }, w, h);
      });
    }, 0);
    return wrap;
  }

  function showRacePodium() {
    var r = flow.results, rec = flow.record;
    header('포디움', r.trackName + ' · ' + CR.Race.difficultyById(r.difficulty).name);
    var top3 = r.entries.slice(0, 3).map(function (e) {
      var d = UI.driver(e.id);
      return { name: e.name, team: e.team, model: d.model, isYou: e.isPlayer, time: e.time, pos: e.pos };
    });
    els.card.appendChild(podium(top3, function (e) { return e.pos === 1 ? fmtTime(e.time) : '+' + (e.time - top3[0].time).toFixed(3); }));
    var actions = el('div', 'rr-actions');
    if (rec.finishedSeason) actions.appendChild(button('시즌 결과 ▶', 'is-primary', showSeasonTable));
    else {
      actions.appendChild(button('메뉴로', 'is-primary', UI.close));
      els.card.appendChild(el('p', 'rr-note', '시즌 ' + rec.season.num + ' 남은 경기 ' + (CR.Race.RACES_PER_SEASON - rec.season.races.length) + '회'));
    }
    els.card.appendChild(actions);
    open();
  }

  // Standings table for a finished (or current) season.
  UI.standingsTable = function (season, standings) {
    var table = el('table', 'rr-table rr-standings');
    var thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', null, '순위'));
    hr.appendChild(el('th', null, '드라이버'));
    for (var i = 0; i < CR.Race.RACES_PER_SEASON; i++) hr.appendChild(el('th', 'rr-num', 'R' + (i + 1)));
    hr.appendChild(el('th', 'rr-num', '포인트'));
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = el('tbody');
    standings.forEach(function (s, k) {
      var d = UI.driver(s.id);
      var tr = el('tr', s.id === 'you' ? 'is-you' : null);
      tr.appendChild(el('td', 'rr-pos', String(k + 1)));
      var td = el('td', 'rr-driver');
      var chip = el('span', 'rr-chip');
      chip.style.background = d.main;
      td.appendChild(chip);
      td.appendChild(el('b', null, d.name));
      tr.appendChild(td);
      for (var r = 0; r < CR.Race.RACES_PER_SEASON; r++) {
        var race = season.races[r], cell = '';
        if (race) {
          var e = race.entries.filter(function (x) { return x.id === s.id; })[0];
          cell = e ? (s.id === 'you' && race.retired ? 'R' : String(e.pos)) : '';
        }
        tr.appendChild(el('td', 'rr-num rr-cell' + (cell === '1' ? ' is-win' : ''), cell));
      }
      tr.appendChild(el('td', 'rr-num rr-pts', String(s.points)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    return table;
  };

  function showSeasonTable() {
    var fs = flow.record.finishedSeason;
    header('시즌 ' + fs.num + ' 최종 순위', CR.Race.RACES_PER_SEASON + '경기 합산 포인트');
    var hero = el('div', 'rr-hero' + (fs.playerRank <= 3 ? ' is-podium' : ''));
    hero.appendChild(el('span', 'rr-hero-pos', fs.playerRank === 1 ? '챔피언!' : '시즌 ' + fs.playerRank + '위'));
    var mine = fs.standings.filter(function (s) { return s.id === 'you'; })[0];
    hero.appendChild(el('span', 'rr-hero-pts', (mine ? mine.points : 0) + ' 포인트 · ' + (mine ? mine.wins : 0) + '승'));
    els.card.appendChild(hero);
    els.card.appendChild(UI.standingsTable(fs, fs.standings));
    var actions = el('div', 'rr-actions');
    actions.appendChild(button('시즌 포디움 ▶', 'is-primary', showSeasonPodium));
    els.card.appendChild(actions);
    open();
  }

  function showSeasonPodium() {
    var fs = flow.record.finishedSeason;
    header('시즌 ' + fs.num + ' 포디움', '월드 챔피언십');
    var top3 = fs.standings.slice(0, 3).map(function (s) {
      var d = UI.driver(s.id);
      return { name: d.name, team: d.team, model: d.model, isYou: s.id === 'you', points: s.points };
    });
    els.card.appendChild(podium(top3, function (e) { return e.points + ' pt'; }));
    var actions = el('div', 'rr-actions');
    actions.appendChild(button('메뉴로', 'is-primary', UI.close));
    els.card.appendChild(actions);
    open();
  }

  UI.close = function () {
    els.results.hidden = true;
    els.card.textContent = '';
    flow = null;
    CR.Main.leaveRace();
  };

  CR.RaceUI = UI;
})();

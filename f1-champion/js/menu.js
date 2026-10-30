// menu.js — start screen / shop: the current car, money, cars for sale and
// the circuit to race on.
// Load order: before main.js. Depends on: Cars, Garage, Renderer, Main (at call time).
//
// With no race in progress the main button starts a new race; while a race
// is paused (Esc -> 메뉴로 돌아가기) it resumes it, and 레이스 종료하기 ends it.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Menu = {};

  // `better` says which direction is good; `short` rows appear on shop cards.
  var STAT_ROWS = [
    { key: 'zeroTo100', label: '가속 (0→100)', better: 'low', short: true, format: function (v) { return v === null ? '—' : v.toFixed(1) + '초'; } },
    { key: 'topSpeedKmh', label: '최고속도', better: 'high', short: true, format: function (v) { return Math.round(v) + 'km/h'; } },
    { key: 'corneringG', label: '코너링', better: 'high', short: true, format: function (v) { return v.toFixed(2) + 'G'; } },
    { key: 'steerTime', label: '조향 반응', better: 'low', short: true, format: function (v) { return v.toFixed(2) + '초'; } },
    { key: 'brakeDecel', label: '제동력', better: 'high', format: function (v) { return v.toFixed(1) + 'm/s²'; } },
  ];

  var els = {};
  var stats = {}; // car id -> measured stats (fixed per car, measured once)
  var range = {}; // stat key -> {lo, hi} across all cars (lo = worst)

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Stats with each car's saved tuning; the bar range spans every car from
  // stock to fully tuned, so upgrades visibly grow the bars.
  function measureAll() {
    var all = [];
    CR.Cars.list.forEach(function (car) {
      stats[car.id] = CR.Main.measureCar(car);
      all.push(CR.Main.measureCar(car, 0), CR.Main.measureCar(car, CR.Tuning.MAX_LEVEL));
    });
    STAT_ROWS.forEach(function (row) {
      var vals = all.map(function (s) { return s[row.key] || 0; });
      var worst = row.better === 'low' ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
      var best = row.better === 'low' ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
      range[row.key] = { lo: worst, hi: best };
    });
  }

  // 0.08 for the worst car in the shop .. 1 for the best.
  function barFraction(key, v) {
    var r = range[key];
    var t = r.hi === r.lo ? 1 : (v - r.lo) / (r.hi - r.lo);
    return Math.max(0.08, Math.min(1, 0.08 + 0.92 * t));
  }

  function statList(car, shortOnly) {
    var dl = el('dl', 'car-stats');
    dl.style.setProperty('--car-color', car.color);
    STAT_ROWS.forEach(function (row) {
      if (shortOnly && !row.short) return;
      var v = stats[car.id][row.key];
      var dd = el('dd');
      var bar = el('span', 'stat-bar');
      var fill = el('span', 'stat-fill');
      fill.style.width = (barFraction(row.key, v || 0) * 100).toFixed(0) + '%';
      bar.appendChild(fill);
      dd.appendChild(bar);
      dd.appendChild(el('span', 'stat-value', row.format(v)));
      dl.appendChild(el('dt', null, row.label));
      dl.appendChild(dd);
    });
    return dl;
  }

  function drawPreview(cnv, car) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cnv.clientWidth || 200, h = cnv.clientHeight || 110;
    cnv.width = Math.round(w * dpr);
    cnv.height = Math.round(h * dpr);
    var ctx = cnv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    CR.Renderer.drawCarPreview(ctx, car, w, h);
  }

  // Earning rate relative to the starter car (lap pay also grows with speed).
  function earnMult(car) {
    return (car.moneyPerSecond / CR.Cars.list[0].moneyPerSecond).toFixed(1);
  }

  function renderCurrent() {
    var car = CR.Garage.car();
    els.carName.textContent = car.name;
    els.carTag.textContent = car.tagline + ' · 수익 배율 ×' + earnMult(car);
    els.money.textContent = CR.Garage.format(CR.Garage.money);
    var dl = statList(car, false);
    dl.id = 'garage-stats';
    els.stats.replaceWith(dl);
    els.stats = dl;
  }

  // --- Tuning panel (selected car) -----------------------------------------

  function renderTuning() {
    var G = CR.Garage, T = CR.Tuning, car = G.car();
    els.tuningTitle.textContent = '튜닝 · ' + car.name;
    var spent = T.spent(car);
    els.tuningSpent.textContent = spent ? '투자 ' + G.format(spent) : '';
    els.tuning.textContent = '';
    els.tuning.style.setProperty('--car-color', car.color);
    T.PARTS.forEach(function (part) {
      var lv = T.level(car.id, part.key), cost = T.nextCost(car, part.key);
      var row = el('div', 'tune-row');
      var info = el('div', 'tune-info');
      info.appendChild(el('span', 'tune-name', part.name));
      info.appendChild(el('span', 'tune-desc', part.desc));
      row.appendChild(info);

      var pips = el('div', 'tune-pips');
      pips.setAttribute('aria-label', part.name + ' ' + lv + '/' + T.MAX_LEVEL + '단계');
      for (var i = 0; i < T.MAX_LEVEL; i++) pips.appendChild(el('span', 'tune-pip' + (i < lv ? ' is-on' : '')));
      row.appendChild(pips);

      row.appendChild(el('span', 'tune-effect', lv ? part.effect(part.gain * lv) : '기본'));

      var btn = el('button', 'tune-btn');
      btn.type = 'button';
      if (cost === null) {
        btn.textContent = 'MAX';
        btn.disabled = true;
        btn.classList.add('is-max');
      } else {
        btn.textContent = '+1단계 ' + G.format(cost);
        btn.disabled = G.money < cost;
        btn.title = '다음 단계: ' + part.effect(part.gain * (lv + 1));
        btn.addEventListener('click', function () {
          if (!T.upgrade(car, part.key)) return;
          stats[car.id] = CR.Main.measureCar(car);
          Menu.refresh();
        });
      }
      row.appendChild(btn);
      els.tuning.appendChild(row);
    });
  }

  function renderShop() {
    var G = CR.Garage;
    els.shop.textContent = '';
    CR.Cars.list.forEach(function (car) {
      var owned = G.isOwned(car.id), selected = G.selected === car.id;
      var card = el('div', 'shop-card' + (selected ? ' is-selected' : ''));
      card.style.setProperty('--car-color', car.color);

      var preview = el('canvas', 'shop-preview');
      preview.setAttribute('aria-hidden', 'true');
      card.appendChild(preview);

      var head = el('div', 'shop-card-head');
      head.appendChild(el('span', 'shop-name', car.name));
      head.appendChild(el('span', 'shop-price' + (car.price === 0 ? ' is-free' : ''), car.price === 0 ? '무료' : G.format(car.price)));
      card.appendChild(head);
      card.appendChild(el('div', 'shop-tag', car.tagline));
      card.appendChild(el('div', 'shop-earn', '수익 배율 ×' + earnMult(car)));
      var tunedLv = CR.Tuning.PARTS.reduce(function (n, p) { return n + CR.Tuning.level(car.id, p.key); }, 0);
      if (tunedLv) card.appendChild(el('div', 'shop-tuned', '튜닝 ' + tunedLv + '/' + CR.Tuning.PARTS.length * CR.Tuning.MAX_LEVEL));
      card.appendChild(statList(car, true));

      var btn = el('button', 'shop-btn');
      btn.type = 'button';
      if (selected) {
        btn.textContent = '사용 중';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = '이 차로 바꾸기';
        btn.className = 'shop-btn is-select';
        btn.addEventListener('click', function () { if (G.select(car.id)) Menu.refresh(); });
      } else {
        var short = car.price - G.money;
        btn.textContent = short > 0 ? '구매 ' + G.format(car.price) + ' (' + G.format(short) + ' 부족)' : '구매 ' + G.format(car.price);
        btn.disabled = short > 0;
        btn.addEventListener('click', function () { if (G.buy(car.id)) Menu.refresh(); });
      }
      card.appendChild(btn);
      els.shop.appendChild(card);
      card._preview = preview;
      card._car = car;
    });
  }

  // --- Circuit picker ------------------------------------------------------

  // Lap length (km) from a track's segments.
  function lapKm(segs) {
    var m = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      m += s.type === 'straight' ? s.length : s.radius * Math.abs(s.turnAngle);
    }
    return m / 1000;
  }

  // Draws a circuit's outline (north up), start line marked.
  function drawTrackOutline(cnv, track, color) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cnv.clientWidth || 160, h = cnv.clientHeight || 96;
    cnv.width = Math.round(w * dpr);
    cnv.height = Math.round(h * dpr);
    var ctx = cnv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var pts = track.segments.points;
    if (!pts || !pts.length) return;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    });
    var pad = 10, k = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
    var ox = (w - (x1 - x0) * k) / 2, oy = (h - (y1 - y0) * k) / 2;
    function X(p) { return ox + (p[0] - x0) * k; }
    function Y(p) { return h - (oy + (p[1] - y0) * k); } // y north -> screen up
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p), Y(p)); else ctx.moveTo(X(p), Y(p)); });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // start/finish
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(X(pts[0]), Y(pts[0]), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function renderTracks() {
    var G = CR.Garage;
    els.tracks.textContent = '';
    var options = [{ id: 'random', name: '랜덤', sub: '매 레이스 무작위 서킷', track: null }];
    CR.Tracks.list.forEach(function (t) {
      options.push({ id: t.realName, name: t.name, sub: t.realName + ' · ' + lapKm(t.segments).toFixed(2) + 'km', track: t });
    });
    options.forEach(function (o) {
      var selected = G.track === o.id || (o.id === 'random' && G.trackIndex(G.track) < 0);
      var card = el('button', 'track-card' + (selected ? ' is-selected' : ''));
      card.type = 'button';
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', selected ? 'true' : 'false');
      if (o.track) {
        var cnv = el('canvas', 'track-preview');
        cnv.setAttribute('aria-hidden', 'true');
        card.appendChild(cnv);
        card._draw = function () { drawTrackOutline(cnv, o.track, selected ? '#ffd23f' : '#c9d1de'); };
      } else {
        card.appendChild(el('div', 'track-preview track-random', '?'));
      }
      card.appendChild(el('span', 'track-name', o.name));
      card.appendChild(el('span', 'track-sub', o.sub));
      card.addEventListener('click', function () {
        if (G.selectTrack(o.id)) { renderTracks(); drawTracks(); }
      });
      els.tracks.appendChild(card);
    });
    els.tracksNote.textContent = CR.Main.raceActive ? '바꾼 서킷은 다음 레이스부터 적용' : '';
  }

  function drawTracks() {
    var cards = els.tracks.children;
    for (var i = 0; i < cards.length; i++) if (cards[i]._draw) cards[i]._draw();
  }

  function drawAllPreviews() {
    drawPreview(els.preview, CR.Garage.car());
    var cards = els.shop.children;
    for (var i = 0; i < cards.length; i++) drawPreview(cards[i]._preview, cards[i]._car);
  }

  // Redraws money, current car and shop (after a purchase / switch or on show).
  // --- Tabs: 연습 | AI 대전 | 기록 ----------------------------------------------

  Menu.tab = 'practice';

  Menu.showTab = function (tab) {
    Menu.tab = tab;
    var tabs = document.querySelectorAll('.menu-tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-tab') === tab;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    els.tabPractice.hidden = tab !== 'practice';
    els.tabRace.hidden = tab !== 'race';
    els.tabRecords.hidden = tab !== 'records';
    els.tracksSection.hidden = tab !== 'practice'; // AI 대전 circuits are drawn at random
    els.actions.hidden = tab === 'records';
    els.keys.hidden = tab === 'records';
    if (!Menu.el.hidden) Menu.refresh();
  };

  function fmt(t) { return t === null || t === undefined ? '—' : CR.Laps.format(t); }
  function fmtShort(t) { var s = fmt(t); return s === '—' ? s : s.slice(0, -1); }

  function selectedTrackIndex() {
    return CR.Garage.trackIndex(CR.Garage.track);
  }

  function renderRacePanel() {
    var G = CR.Garage, R = CR.Race, panel = els.racePanel;
    panel.textContent = '';
    els.raceLock.textContent = R.unlocked() ? '' : '🔒';

    if (!R.unlocked()) {
      var lock = el('section', 'race-card race-locked');
      lock.appendChild(el('div', 'race-lock-icon', '🎟️'));
      lock.appendChild(el('h2', 'race-card-title', 'AI 대전 입장권'));
      lock.appendChild(el('p', 'race-card-text', 'F1으로 누적 ' + R.UNLOCK_F1_LAPS + '랩을 달리면 입장권을 받아 AI 대전에 참가할 수 있어요.'));
      var bar = el('div', 'race-progress');
      var fill = el('span');
      fill.style.width = Math.min(100, (G.f1Laps / R.UNLOCK_F1_LAPS) * 100) + '%';
      bar.appendChild(fill);
      lock.appendChild(bar);
      lock.appendChild(el('p', 'race-progress-text', 'F1 누적 ' + Math.min(G.f1Laps, R.UNLOCK_F1_LAPS) + ' / ' + R.UNLOCK_F1_LAPS + '랩'));
      if (!G.isOwned('f1')) lock.appendChild(el('p', 'race-card-note', '먼저 연습 탭의 상점에서 F1을 구매하세요.'));
      panel.appendChild(lock);
      return;
    }

    // Rules
    var rules = el('section', 'race-card');
    rules.appendChild(el('h2', 'menu-section', 'AI 대전 규칙'));
    var chips = el('div', 'race-rules');
    ['6대 출전 (AI 5대)', R.LAPS + '랩 경기', 'P' + R.PLAYER_GRID + ' 출발', '차량 간 충돌 있음', '리타이어 = 최하위',
      '포인트 1위 ' + R.POINTS[0] + ' · 2위 ' + R.POINTS[1] + ' · 3위 ' + R.POINTS[2] + ' · 4위 ' + R.POINTS[3],
      R.RACES_PER_SEASON + '경기 = 1시즌'].forEach(function (t) { chips.appendChild(el('span', 'race-rule', t)); });
    rules.appendChild(chips);
    var tuned = CR.Tuning.PARTS.reduce(function (n, p) { return n + CR.Tuning.level('f1', p.key); }, 0);
    rules.appendChild(el('p', 'race-card-note', '출전 차량: 내 F1 (튜닝 ' + tuned + '/' + CR.Tuning.PARTS.length * CR.Tuning.MAX_LEVEL + ')'));
    panel.appendChild(rules);

    // Difficulty
    var diffSec = el('section', 'race-card');
    var refIndex = 0;
    diffSec.appendChild(el('h2', 'menu-section', 'AI 난이도 · 예상 AI 랩타임 (몬자 기준)'));
    var grid = el('div', 'diff-list');
    grid.setAttribute('role', 'radiogroup');
    R.DIFFICULTIES.forEach(function (d) {
      var on = G.raceDifficulty === d.id;
      var b = el('button', 'diff-card diff-' + d.id + (on ? ' is-selected' : ''));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.appendChild(el('span', 'diff-name', d.name));
      b.appendChild(el('span', 'diff-time', '~' + fmtShort(R.expectedLap(refIndex, d.id)).slice(0, -1)));
      b.appendChild(el('span', 'diff-desc', d.desc));
      b.addEventListener('click', function () { G.setRaceDifficulty(d.id); Menu.refresh(); });
      grid.appendChild(b);
    });
    diffSec.appendChild(grid);
    panel.appendChild(diffSec);

    // Season circuits: random each race, no repeats within a season.
    var used = {};
    G.season.races.forEach(function (r, k) { used[r.track] = { round: k + 1, pos: r.retired ? 'RET' : 'P' + r.playerPos }; });
    var trackSec = el('section', 'race-card');
    var left = CR.Tracks.list.filter(function (t) { return !used[t.realName]; }).length;
    trackSec.appendChild(el('h2', 'menu-section', '시즌 ' + G.season.num + ' 서킷 · 다음 경기는 남은 ' + left + '곳 중 랜덤 🎲'));
    var tl = el('div', 'season-tracks');
    CR.Tracks.list.forEach(function (t) {
      var u = used[t.realName];
      var chip = el('div', 'season-track' + (u ? ' is-done' : ''));
      chip.appendChild(el('span', 'st-round', u ? 'R' + u.round : '?'));
      chip.appendChild(el('span', 'st-name', t.name));
      chip.appendChild(el('span', 'st-res', u ? u.pos : '남음'));
      tl.appendChild(chip);
    });
    trackSec.appendChild(tl);
    trackSec.appendChild(el('p', 'race-card-note', '대전 서킷은 매 경기 랜덤으로 정해지고, 한 시즌(' + R.RACES_PER_SEASON + '경기) 안에서는 같은 서킷이 다시 나오지 않아요.'));
    panel.appendChild(trackSec);

    // Current season
    var season = G.season;
    var seasonSec = el('section', 'race-card');
    seasonSec.appendChild(el('h2', 'menu-section', '시즌 ' + season.num + ' · 경기 ' + season.races.length + '/' + R.RACES_PER_SEASON));
    seasonSec.appendChild(CR.RaceUI.standingsTable(season, currentStandings(season)));
    panel.appendChild(seasonSec);
  }

  // Standings including drivers with no points yet.
  function currentStandings(season) {
    var st = CR.Garage.standings(season), have = {};
    st.forEach(function (s) { have[s.id] = true; });
    ['you'].concat(CR.Race.DRIVERS.map(function (d) { return d.id; })).forEach(function (id) {
      if (!have[id]) st.push({ id: id, points: 0, wins: 0, best: 99 });
    });
    return st;
  }

  function raceList(races) {
    var ol = el('ol', 'rec-races');
    races.forEach(function (r, i) {
      var li = el('li', r.playerPos <= 3 && !r.retired ? 'is-podium' : null);
      li.appendChild(el('span', 'rec-r', 'R' + (i + 1)));
      li.appendChild(el('span', 'rec-track', r.trackName));
      li.appendChild(el('span', 'rec-diff', CR.Race.difficultyById(r.difficulty).name));
      var me = r.entries.filter(function (e) { return e.id === 'you'; })[0];
      li.appendChild(el('span', 'rec-pos', r.retired ? 'RET' : 'P' + r.playerPos));
      li.appendChild(el('span', 'rec-pts', '+' + (me ? me.points : 0)));
      ol.appendChild(li);
    });
    return ol;
  }

  function renderRecords() {
    var G = CR.Garage, panel = els.recordsPanel;
    panel.textContent = '';
    var all = [];
    G.seasons.forEach(function (s) { all = all.concat(s.races); });
    all = all.concat(G.season.races);
    var wins = all.filter(function (r) { return !r.retired && r.playerPos === 1; }).length;
    var podiums = all.filter(function (r) { return !r.retired && r.playerPos <= 3; }).length;
    var titles = G.seasons.filter(function (s) { return s.playerRank === 1; }).length;

    var tiles = el('section', 'rec-tiles');
    [['F1 누적 랩', G.f1Laps], ['대전 수', all.length], ['우승', wins], ['포디움', podiums], ['시즌 챔피언', titles]].forEach(function (t) {
      var d = el('div', 'rec-tile');
      d.appendChild(el('b', null, String(t[1])));
      d.appendChild(el('span', null, t[0]));
      tiles.appendChild(d);
    });
    panel.appendChild(tiles);

    // Practice bests per track
    var prac = el('section', 'race-card');
    prac.appendChild(el('h2', 'menu-section', '연습 베스트 랩 · 트랙별'));
    var table = el('table', 'rr-table');
    var hr = el('tr');
    ['서킷', '베스트 랩', '차량', '날짜'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var thead = el('thead'); thead.appendChild(hr); table.appendChild(thead);
    var tb = el('tbody');
    CR.Tracks.list.forEach(function (t) {
      var rec = G.practice[t.realName];
      var tr = el('tr');
      tr.appendChild(el('td', 'rr-driver', t.name));
      tr.appendChild(el('td', 'rr-num' + (rec ? ' rec-best' : ''), rec ? fmt(rec.time) : '—'));
      tr.appendChild(el('td', null, rec ? CR.Cars.byId(rec.car).name : ''));
      tr.appendChild(el('td', 'rr-num', rec ? new Date(rec.at).toLocaleDateString('ko-KR') : ''));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    prac.appendChild(table);
    panel.appendChild(prac);

    // Current season
    var cur = el('section', 'race-card');
    cur.appendChild(el('h2', 'menu-section', '현재 시즌 ' + G.season.num + ' · ' + G.season.races.length + '/' + CR.Race.RACES_PER_SEASON + '경기'));
    if (G.season.races.length) {
      cur.appendChild(raceList(G.season.races));
      cur.appendChild(CR.RaceUI.standingsTable(G.season, currentStandings(G.season)));
    } else cur.appendChild(el('p', 'race-card-note', '아직 이번 시즌 경기가 없어요.'));
    panel.appendChild(cur);

    // Past seasons, newest first
    var past = el('section', 'race-card');
    past.appendChild(el('h2', 'menu-section', '지난 시즌'));
    if (!G.seasons.length) past.appendChild(el('p', 'race-card-note', '완료한 시즌이 없어요. 대전 ' + CR.Race.RACES_PER_SEASON + '경기를 마치면 시즌이 기록돼요.'));
    G.seasons.slice().reverse().forEach(function (s) {
      var det = el('details', 'rec-season');
      var sum = el('summary');
      var champ = CR.RaceUI.driver(s.standings[0].id);
      var mine = s.standings.filter(function (x) { return x.id === 'you'; })[0];
      sum.appendChild(el('b', null, '시즌 ' + s.num));
      sum.appendChild(el('span', 'rec-rank' + (s.playerRank === 1 ? ' is-champ' : ''), s.playerRank === 1 ? '🏆 챔피언' : s.playerRank + '위'));
      sum.appendChild(el('span', null, (mine ? mine.points : 0) + ' pt'));
      sum.appendChild(el('small', null, '챔피언 ' + champ.name + ' · ' + new Date(s.at).toLocaleDateString('ko-KR')));
      det.appendChild(sum);
      det.appendChild(raceList(s.races));
      det.appendChild(CR.RaceUI.standingsTable(s, s.standings));
      past.appendChild(det);
    });
    panel.appendChild(past);
  }

  // Redraws money, current car and shop (after a purchase / switch or on show).
  Menu.refresh = function () {
    CR.Main.applyCar(); // the selected car may have changed
    renderCurrent();
    renderTuning();
    renderShop();
    renderTracks();
    renderRacePanel();
    if (Menu.tab === 'records') renderRecords();
    if (!Menu.el.hidden) { drawAllPreviews(); drawTracks(); }

    var racing = CR.Main.raceActive && !CR.Race.active;
    els.endRace.hidden = !racing || Menu.tab !== 'practice';
    if (Menu.tab === 'race') {
      var ok = CR.Race.unlocked() && CR.Garage.isOwned('f1');
      els.play.textContent = ok ? '대전 시작 ▶' : '🔒 입장권 필요';
      els.play.disabled = !ok;
      els.sub.textContent = 'AI 5대와 3랩 대전! 순위별 포인트를 모아 5경기 시즌 챔피언에 도전하세요.';
    } else {
      els.play.disabled = false;
      els.play.textContent = racing ? '연습으로 돌아가기 ▶' : '연습 주행 ▶';
      els.sub.textContent = racing
        ? '연습이 일시정지되었습니다. 상점에서 차를 바꾼 뒤 돌아갈 수 있습니다.'
        : '실제 F1 서킷 ' + CR.Tracks.list.length + '곳에서 연습 주행. 랩타임이 짧을수록 더 많은 돈을 받고, 트랙별 베스트 랩은 기록 탭에 저장됩니다. F1으로 ' + CR.Race.UNLOCK_F1_LAPS + '랩을 달리면 AI 대전 입장권!';
    }
  };

  function primary() {
    if (Menu.tab === 'race') {
      if (CR.Main.raceActive) { CR.Main.raceActive = false; CR.Laps.reset(false); } // drop a paused practice
      CR.Main.startRace();
    } else if (CR.Main.raceActive) CR.Main.resume();
    else CR.Main.start();
  }

  var SAVE_TEXT = {
    local: '이 브라우저에만 저장됨',
    loading: '계정 저장 불러오는 중…',
    synced: '☁ Claude 계정에 저장됨',
    saving: '☁ 계정에 저장 중…',
    error: '계정 저장 실패 · 이 브라우저에는 저장됨',
  };
  function renderSaveStatus(st) {
    if (!els.save) return;
    els.save.textContent = SAVE_TEXT[st] || '';
    els.save.className = 'save-status is-' + st;
  }

  Menu.init = function () {
    Menu.el = document.getElementById('menu');
    els.preview = document.getElementById('garage-preview');
    els.stats = document.getElementById('garage-stats');
    els.shop = document.getElementById('shop-list');
    els.money = document.getElementById('money-count');
    els.carName = document.getElementById('car-name');
    els.carTag = document.getElementById('car-tag');
    els.play = document.getElementById('play-btn');
    els.endRace = document.getElementById('end-race-btn');
    els.sub = document.getElementById('menu-sub');
    els.save = document.getElementById('save-status');
    els.tracks = document.getElementById('track-list');
    els.tabPractice = document.getElementById('tab-practice');
    els.tabRace = document.getElementById('tab-race');
    els.tabRecords = document.getElementById('tab-records');
    els.racePanel = document.getElementById('race-panel');
    els.recordsPanel = document.getElementById('records-panel');
    els.raceLock = document.getElementById('race-tab-lock');
    els.tracksSection = document.querySelector('.tracks');
    els.actions = document.querySelector('.menu-actions');
    els.keys = document.querySelector('.menu-keys');
    var tabBtns = document.querySelectorAll('.menu-tab');
    for (var tb = 0; tb < tabBtns.length; tb++) {
      tabBtns[tb].addEventListener('click', function (e) { Menu.showTab(e.currentTarget.getAttribute('data-tab')); });
    }
    els.tuning = document.getElementById('tuning-list');
    els.tuningTitle = document.getElementById('tuning-title');
    els.tuningSpent = document.getElementById('tuning-spent');
    els.tracksNote = document.getElementById('tracks-note');
    measureAll();

    // Account save: show its state, and redraw when it loads.
    CR.Garage.onStatus = renderSaveStatus;
    renderSaveStatus(CR.Garage.cloudStatus);
    CR.Garage.onCloudChange = function () {
      // In a race the menu redraws itself next time it opens.
      if (CR.Main.state === 'menu' && !Menu.el.hidden) Menu.refresh();
    };

    els.play.addEventListener('click', primary);
    els.endRace.addEventListener('click', function () { CR.Main.endRace(); });

    window.addEventListener('keydown', function (e) {
      if (CR.Main.state !== 'menu' || Menu.el.hidden || e.repeat) return;
      if (e.code === 'Enter') { e.preventDefault(); primary(); }
      else if (e.code === 'Escape' && CR.Main.raceActive) { e.preventDefault(); CR.Main.resume(); }
    });
  };

  Menu.show = function () {
    Menu.el.hidden = false;
    Menu.refresh(); // draws previews now that the canvases have their size
    els.play.focus();
  };

  Menu.hide = function () {
    Menu.el.hidden = true;
    // Drop focus from the hidden button so Space (brake) can't press it.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  };

  CR.Menu = Menu;
})();

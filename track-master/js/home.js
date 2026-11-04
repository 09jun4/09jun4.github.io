// home.js — Track Master main screen: Google login (shared by both race
// modes: same Firebase project and the same site origin, so signing in here
// signs you in to Circuit Race and Drift Race too), nickname, the Game
// Mode picker and the Records screen (personal bests + online rankings of
// both modes).
// Saves read here (nothing is written except the nickname):
//   Circuit: guest 'circuit-racer-copy.shop', account users/{uid}.save
//            (or its local cache 'f1-champion.account.<uid>', newer wins)
//   Drift:   guest 'f1-champion.drift', account drift_users/{uid}.save
// Rankings: tracks/{slug}/laps|laps_cockpit, career, drift/{course}/times.
(function () {
  'use strict';
  var SDK = window.FirebaseSDK, cfg = window.F1C_FIREBASE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var enabled = !!(SDK && cfg.apiKey && cfg.projectId);

  var TRACKS = [
    { id: 'Autodromo Nazionale Monza', slug: 'monza', name: '몬자' },
    { id: 'Suzuka International Racing Course', slug: 'suzuka', name: '스즈카' },
    { id: 'Las Vegas Street Circuit', slug: 'lasvegas', name: '라스베이거스' },
    { id: 'Circuit de Spa-Francorchamps', slug: 'spa', name: '스파' },
    { id: 'Silverstone Circuit', slug: 'silverstone', name: '실버스톤' },
    { id: 'Autódromo José Carlos Pace', slug: 'interlagos', name: '인테를라고스' },
  ];
  var CIRCUIT_CARS = { f4: 'F4', f3: 'F3', f2: 'F2', fe: 'Formula E', f1: 'F1' };
  var COURSES = [
    { slug: 'haruna', name: '하루나' }, { slug: 'akagi', name: '아카기' },
    { slug: 'irohazaka', name: '이로하자카' }, { slug: 'usui', name: '우스이' },
  ];
  var DRIFT_CARS = { ae86: 'AE86', rx7: 'RX-7', miata: '미아타' };

  var state = { user: null, nickname: '', error: '', rec: 'circuit', track: 0, view: 'laps', course: 0, pending: false };

  // --- Navigation -------------------------------------------------------------
  function show(id) {
    ['home', 'modes', 'records'].forEach(function (s) { $(s).hidden = s !== id; });
    if (id === 'records') renderRecords();
    try { history.replaceState(null, '', id === 'home' ? location.pathname : '#' + id); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-go')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-rec]'), function (b) {
    b.addEventListener('click', function () {
      state.rec = b.getAttribute('data-rec');
      Array.prototype.forEach.call(document.querySelectorAll('[data-rec]'), function (x) { x.classList.toggle('on', x === b); });
      renderRecords();
    });
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(t) {
    if (t == null || !isFinite(t)) return '-';
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  function readLocal(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function inApp() {
    var ua = navigator.userAgent || '';
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '앱';
    return '';
  }
  function defaultNick(uid) {
    var h = 0;
    for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return '드라이버' + String(1000 + (h % 9000));
  }
  function displayName() { return state.nickname || (state.user ? defaultNick(state.user.uid) : ''); }

  // --- Firebase -------------------------------------------------------------------
  var auth = null, db = null;
  if (enabled) {
    var app = SDK.initializeApp(cfg);
    auth = SDK.getAuth(app);
    db = SDK.getFirestore(app);
    SDK.getRedirectResult(auth).catch(function () { /* shown on next try */ });
    SDK.onAuthStateChanged(auth, function (u) {
      state.user = u ? { uid: u.uid, name: u.displayName || '' } : null;
      state.nickname = '';
      state.pending = !!u;
      renderAccount();
      if (!u) { saves.circuit = saves.drift = null; if (!$('records').hidden) renderRecords(); return; }
      SDK.getDoc(SDK.doc(db, 'users', u.uid)).then(function (snap) {
        var d = snap.exists() ? snap.data() : null;
        state.nickname = d && typeof d.nickname === 'string' ? d.nickname : '';
        var remote = null;
        if (d && typeof d.save === 'string') { try { remote = JSON.parse(d.save); } catch (e) { remote = null; } }
        saves.circuitRemote = remote;
      }).catch(function () { /* offline */ }).then(function () {
        return SDK.getDoc(SDK.doc(db, 'drift_users', u.uid)).then(function (snap) {
          saves.driftRemote = null;
          if (snap.exists()) { try { saves.driftRemote = JSON.parse(snap.data().save); } catch (e) { /* bad */ } }
        }).catch(function () { saves.driftRemote = null; });
      }).then(function () {
        state.pending = false;
        renderAccount();
        if (!$('records').hidden) renderRecords();
      });
    });
  }

  function signIn() {
    state.error = '';
    var where = inApp();
    if (where) { state.error = where + ' 안의 브라우저에서는 구글 로그인이 막혀 있어요. 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.'; renderAccount(); return; }
    var provider = new SDK.GoogleAuthProvider();
    SDK.signInWithPopup(auth, provider).catch(function (e) {
      var code = (e && e.code) || '';
      if (/popup-blocked|operation-not-supported/.test(code)) return SDK.signInWithRedirect(auth, provider);
      if (!/popup-closed|cancelled-popup/.test(code)) { state.error = '로그인하지 못했어요. ' + code; renderAccount(); }
    });
  }

  function validNick(n) { return n.length >= 2 && n.length <= 12 && !/[<>"'`\\]/.test(n); }
  function saveNick() {
    var input = $('nick-input'), n = (input.value || '').trim();
    if (!validNick(n)) { state.error = '닉네임은 2~12자, < > " \' ` \\ 는 쓸 수 없어요.'; renderAccount(); return; }
    SDK.setDoc(SDK.doc(db, 'users', state.user.uid), { nickname: n, updatedAt: SDK.serverTimestamp() }, { merge: true }).then(function () {
      state.nickname = n; state.error = ''; state.editNick = false; renderAccount();
    }, function () { state.error = '닉네임을 저장하지 못했어요.'; renderAccount(); });
  }

  function renderAccount() {
    var el = $('account');
    if (!enabled) { el.innerHTML = '<span class="dim">기록은 이 브라우저에 저장돼요.</span>'; return; }
    var err = state.error ? '<p class="warn">' + esc(state.error) + '</p>' : '';
    if (!state.user) {
      el.innerHTML = '<button type="button" class="btn white" id="login">G 구글 로그인</button>' + err;
      $('login').onclick = signIn;
      return;
    }
    if (state.editNick) {
      el.innerHTML = '<div class="nick"><input id="nick-input" maxlength="12" value="' + esc(state.nickname) + '" placeholder="랭킹 닉네임 (2~12자)"><button type="button" class="btn small acc" id="nick-save">저장</button><button type="button" class="btn small" id="nick-cancel">취소</button></div>' + err;
      $('nick-save').onclick = saveNick;
      $('nick-cancel').onclick = function () { state.editNick = false; state.error = ''; renderAccount(); };
      $('nick-input').focus();
      return;
    }
    el.innerHTML = '<span class="who"><b>' + esc(displayName()) + '</b>' + (state.pending ? ' <span class="dim">불러오는 중…</span>' : '') + '</span>' +
      '<button type="button" class="btn small" id="nick-edit">닉네임</button><button type="button" class="btn small" id="logout">로그아웃</button>' + err;
    $('nick-edit').onclick = function () { state.editNick = true; renderAccount(); };
    $('logout').onclick = function () { SDK.signOut(auth); };
  }

  // --- Saves ------------------------------------------------------------------
  var saves = { circuitRemote: null, driftRemote: null };
  function circuitSave() {
    if (state.user) {
      var cache = readLocal('f1-champion.account.' + state.user.uid), remote = saves.circuitRemote;
      if (cache && remote) return (Number(cache.savedAt) || 0) > (Number(remote.savedAt) || 0) ? cache : remote;
      return remote || cache || {};
    }
    return readLocal('circuit-racer-copy.shop') || {};
  }
  function driftSave() {
    var s = state.user ? saves.driftRemote : readLocal('f1-champion.drift');
    s = s || {};
    var b = s.best || {};
    if (Object.keys(b).some(function (k) { return b[k] && typeof b[k].time === 'number'; })) s.best = { haruna: b };
    return s;
  }
  function careerStats(sv) {
    var st = { points: 0, wins: 0, podiums: 0, titles: 0, races: 0 }, all = [];
    (sv.seasons || []).forEach(function (s) { all = all.concat(s.races || []); if (s.playerRank === 1) st.titles++; });
    all = all.concat((sv.season && sv.season.races) || []);
    all.forEach(function (r) {
      st.races++;
      var me = (r.entries || []).filter(function (e) { return e.id === 'you'; })[0];
      if (me) st.points += me.points || 0;
      if (!r.retired && r.playerPos === 1) st.wins++;
      if (!r.retired && r.playerPos <= 3) st.podiums++;
    });
    return st;
  }

  // --- Rankings -----------------------------------------------------------------
  var cache = {};
  function query(key, path, order, dir, n) {
    if (!enabled) return Promise.reject(new Error('offline'));
    var c = cache[key];
    if (c && Date.now() - c.at < 30000) return Promise.resolve(c.rows);
    var col = SDK.collection.apply(null, [db].concat(path));
    return SDK.getDocs(SDK.query(col, SDK.orderBy(order, dir || 'asc'), SDK.limit(n || 10))).then(function (snap) {
      var rows = [];
      snap.forEach(function (d) { rows.push(d.data()); });
      cache[key] = { at: Date.now(), rows: rows };
      return rows;
    });
  }
  function rankTable(rows, cols) {
    if (!rows.length) return '<p class="dim">아직 기록이 없어요.</p>';
    var me = state.user && state.user.uid;
    return '<table><tr><th>#</th><th>닉네임</th>' + cols.map(function (c) { return '<th class="' + (c.r ? 'r' : '') + '">' + c.h + '</th>'; }).join('') + '</tr>' +
      rows.map(function (r, i) {
        return '<tr' + (r.uid === me ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(r.name || '') + '</td>' +
          cols.map(function (c) { return '<td class="' + (c.r ? 'r' : '') + '">' + c.f(r) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table>';
  }
  function fill(id, promise, cols) {
    promise.then(function (rows) { var el = $(id); if (el) el.innerHTML = rankTable(rows, cols); },
      function () { var el = $(id); if (el) el.innerHTML = '<p class="dim">랭킹을 불러오지 못했어요.</p>'; });
  }

  // --- Records screen -----------------------------------------------------------
  function chips(list, on, attr) {
    return '<div class="chips">' + list.map(function (x, i) { return '<button type="button" class="chip' + (i === on ? ' on' : '') + '" data-' + attr + '="' + i + '">' + x + '</button>'; }).join('') + '</div>';
  }
  function bindChips(attr, fn) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
      b.addEventListener('click', function () { fn(Number(b.getAttribute('data-' + attr))); renderRecords(); });
    });
  }

  function renderRecords() {
    var el = $('rec-body');
    var login = !state.user && enabled ? '<p class="dim">구글 로그인하면 계정에 저장된 기록이 보여요. 지금은 이 브라우저의 기록이에요.</p>' : '';
    if (state.rec === 'circuit') {
      var sv = circuitSave(), st = careerStats(sv), pr = sv.practice || {}, fp = sv.practiceFP || {};
      var rows = TRACKS.map(function (t) {
        var a = pr[t.id], b = fp[t.id];
        return '<tr><td>' + t.name + '</td><td class="r">' + (a ? fmt(a.time) + ' <span class="dim">' + (CIRCUIT_CARS[a.car] || '') + '</span>' : '-') + '</td><td class="r">' + (b ? fmt(b.time) + ' <span class="dim">' + (CIRCUIT_CARS[b.car] || '') + '</span>' : '-') + '</td></tr>';
      }).join('');
      var t = TRACKS[state.track], viewCol = state.view === 'cockpit' ? 'laps_cockpit' : 'laps';
      el.innerHTML = login +
        '<div class="grid2"><div class="card"><h3>내 베스트 랩 (연습)</h3><table><tr><th>서킷</th><th class="r">3인칭</th><th class="r">1인칭</th></tr>' + rows + '</table></div>' +
        '<div class="card"><h3>내 AI 대전 커리어</h3><div class="stats"><div><b>' + st.points + '</b><small>포인트</small></div><div><b>' + st.wins + '</b><small>우승</small></div><div><b>' + st.podiums + '</b><small>포디움</small></div><div><b>' + st.titles + '</b><small>챔피언</small></div><div><b>' + st.races + '</b><small>레이스</small></div></div>' +
        '<p class="dim" style="font-size:13px;margin:10px 0 0">F1 누적 랩 ' + (sv.f1Laps || 0) + '</p></div></div>' +
        '<div class="grid2" style="margin-top:14px"><div class="card"><h3>서킷 랭킹</h3>' + chips(TRACKS.map(function (x) { return x.name; }), state.track, 'trk') +
        chips(['3인칭', '1인칭'], state.view === 'cockpit' ? 1 : 0, 'vw') + '<div id="rk-lap"><p class="dim">불러오는 중…</p></div></div>' +
        '<div class="card"><h3>AI 대전 커리어 랭킹</h3><div id="rk-career"><p class="dim">불러오는 중…</p></div></div></div>';
      bindChips('trk', function (i) { state.track = i; });
      bindChips('vw', function (i) { state.view = i ? 'cockpit' : 'laps'; });
      fill('rk-lap', query('lap:' + viewCol + ':' + t.slug, ['tracks', t.slug, viewCol], 'time'), [
        { h: '차', f: function (r) { return CIRCUIT_CARS[r.car] || ''; } }, { h: '랩', r: true, f: function (r) { return fmt(r.time); } }]);
      fill('rk-career', query('career', ['career'], 'points', 'desc'), [
        { h: '포인트', r: true, f: function (r) { return r.points; } }, { h: '우승', r: true, f: function (r) { return r.wins; } }, { h: '챔피언', r: true, f: function (r) { return r.titles; } }]);
    } else {
      var ds = driftSave(), best = ds.best || {}, bt = ds.battle || { wins: 0, losses: 0 };
      var head = '<tr><th>코스</th>' + Object.keys(DRIFT_CARS).map(function (k) { return '<th class="r">' + DRIFT_CARS[k] + '</th>'; }).join('') + '</tr>';
      var body = COURSES.map(function (c) {
        var cb = best[c.slug] || {};
        return '<tr><td>' + c.name + '</td>' + Object.keys(DRIFT_CARS).map(function (k) { return '<td class="r">' + (cb[k] ? fmt(cb[k].time) : '-') + '</td>'; }).join('') + '</tr>';
      }).join('');
      var c = COURSES[state.course];
      el.innerHTML = login +
        '<div class="grid2"><div class="card"><h3>내 다운힐 타임어택 기록</h3><table>' + head + body + '</table></div>' +
        '<div class="card"><h3>내 AI 배틀 전적</h3><div class="stats" style="grid-template-columns:repeat(3,1fr)"><div><b>' + bt.wins + '</b><small>승</small></div><div><b>' + bt.losses + '</b><small>패</small></div><div><b>' + (bt.wins + bt.losses ? Math.round(bt.wins * 100 / (bt.wins + bt.losses)) + '%' : '-') + '</b><small>승률</small></div></div></div></div>' +
        '<div class="card" style="margin-top:14px"><h3>타임어택 랭킹</h3>' + chips(COURSES.map(function (x) { return x.name; }), state.course, 'crs') + '<div id="rk-drift"><p class="dim">불러오는 중…</p></div></div>';
      bindChips('crs', function (i) { state.course = i; });
      fill('rk-drift', query('drift:' + c.slug, ['drift', c.slug, 'times'], 'time'), [
        { h: '차', f: function (r) { return DRIFT_CARS[r.car] || ''; } }, { h: '기록', r: true, f: function (r) { return fmt(r.time); } }]);
    }
  }

  renderAccount();
  var hash = (location.hash || '').slice(1);
  if (hash === 'modes' || hash === 'records') show(hash);
})();

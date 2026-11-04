// cloud.js — Google login (shared with F1 Champion and the site), account
// save and the time-attack ranking for the drift race.
// Same Firebase project as F1 Champion (../js/firebase-config.js), so a
// player signed in there is signed in here too. Firestore (../firestore.rules):
//   drift_users/{uid}            { save: JSON string, updatedAt }   — private
//   drift/{course}/times/{uid}   { uid, name, time, car, device, at } — public read
// The nickname is the one picked in F1 Champion (users/{uid}.nickname).
// Without a config everything is browser-only.
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};
  var SDK = window.FirebaseSDK, cfg = window.F1C_FIREBASE_CONFIG || {};
  var Cloud = { enabled: !!(SDK && cfg.apiKey && cfg.projectId), state: 'out', user: null, nickname: '', error: '', rulesMissing: false };
  var listeners = [];
  Cloud.onChange = function (fn) { listeners.push(fn); };
  function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  Cloud.inAppBrowser = function () {
    var ua = navigator.userAgent || '';
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '앱';
    return '';
  };
  function defaultNick(uid) {
    var h = 0;
    for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return '드라이버' + String(1000 + (h % 9000));
  }
  Cloud.displayName = function () { return Cloud.nickname || (Cloud.user ? defaultNick(Cloud.user.uid) : ''); };
  Cloud.device = function () { return window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'mobile' : 'pc'; };

  // Local save (always) — merged with the account save on sign-in.
  var KEY = 'f1-champion.drift';
  function blank() { return { best: {}, battle: { wins: 0, losses: 0 } }; }
  // save.best is {course: {car: {time, at}}}; early saves kept the times
  // per car directly (the first course, Haruna).
  function upgrade(s) {
    if (!s || !s.best) return s;
    var b = s.best, flat = Object.keys(b).some(function (k) { return b[k] && typeof b[k].time === 'number'; });
    if (flat) s.best = { haruna: b };
    return s;
  }
  function load() { try { var s = upgrade(JSON.parse(localStorage.getItem(KEY))); if (s && s.best) return s; } catch (e) { /* none */ } return blank(); }
  Cloud.save = load();
  function merge(a, b) {
    var out = blank();
    [a, b].forEach(function (s) {
      if (!s) return;
      Object.keys(s.best || {}).forEach(function (course) {
        var cb = s.best[course] || {}, ob = out.best[course] = out.best[course] || {};
        Object.keys(cb).forEach(function (car) {
          var r = cb[car];
          if (r && r.time > 0 && (!ob[car] || r.time < ob[car].time)) ob[car] = r;
        });
      });
      if (s.battle) { out.battle.wins += s.battle.wins || 0; out.battle.losses += s.battle.losses || 0; }
    });
    return out;
  }
  var remote = null;
  function store() {
    try { localStorage.setItem(KEY, JSON.stringify(Cloud.save)); } catch (e) { /* full */ }
    if (remote) remote(Cloud.save);
  }
  // Records a finished time attack; returns true for a new personal best.
  Cloud.best = function (course, car) { var c = Cloud.save.best[course || DR.Course.SLUG]; return c ? c[car] : null; };
  Cloud.recordTime = function (car, time) {
    var slug = DR.Course.SLUG, cb = Cloud.save.best[slug] = Cloud.save.best[slug] || {}, b = cb[car];
    if (b && b.time <= time) return false;
    cb[car] = { time: Math.round(time * 1000) / 1000, at: Date.now() };
    store();
    pushTime();
    return true;
  };
  Cloud.recordBattle = function (won) {
    Cloud.save.battle[won ? 'wins' : 'losses']++;
    store();
  };
  Cloud.bestOverall = function () {
    var best = null;
    var cb = Cloud.save.best[DR.Course.SLUG] || {};
    Object.keys(cb).forEach(function (car) { var r = cb[car]; if (!best || r.time < best.time) best = { time: r.time, car: car }; });
    return best;
  };

  if (!Cloud.enabled) { DR.Cloud = Cloud; return; }

  var app = SDK.initializeApp(cfg), auth = SDK.getAuth(app), db = SDK.getFirestore(app);
  var provider = new SDK.GoogleAuthProvider();
  var COURSE = DR.Course.SLUG;
  function timesCol() { return SDK.collection(db, 'drift', COURSE, 'times'); }
  function timeRef(uid) { return SDK.doc(db, 'drift', COURSE, 'times', uid); }

  Cloud.signIn = function () {
    Cloud.error = '';
    var inApp = Cloud.inAppBrowser();
    if (inApp) {
      Cloud.error = inApp + ' 안의 브라우저에서는 구글 로그인이 막혀 있어요. 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.';
      changed();
      return Promise.resolve(false);
    }
    return SDK.signInWithPopup(auth, provider).then(function () { return true; }, function (e) {
      if (e && /popup-blocked|operation-not-supported/.test(e.code || '')) return SDK.signInWithRedirect(auth, provider).then(function () { return true; });
      if (!/popup-closed|cancelled-popup/.test((e && e.code) || '')) Cloud.error = '로그인하지 못했어요. ' + ((e && e.code) || '');
      changed();
      return false;
    });
  };
  Cloud.signOut = function () { return SDK.signOut(auth); };
  SDK.getRedirectResult(auth).catch(function () { /* shown on next try */ });

  function denied(e) { return e && /permission/.test(e.code || e.message || ''); }

  SDK.onAuthStateChanged(auth, function (u) {
    if (!u) {
      Cloud.state = 'out'; Cloud.user = null; Cloud.nickname = ''; remote = null;
      Cloud.save = load(); // back to the guest save in this browser
      changed();
      return;
    }
    Cloud.state = 'pending';
    Cloud.user = { uid: u.uid, name: u.displayName || '' };
    changed();
    var userDoc = SDK.doc(db, 'users', u.uid), saveDoc = SDK.doc(db, 'drift_users', u.uid);
    Promise.all([
      SDK.getDoc(userDoc).catch(function () { return null; }),
      SDK.getDoc(saveDoc).catch(function (e) { if (denied(e)) Cloud.rulesMissing = true; return null; }),
    ]).then(function (r) {
      var ud = r[0] && r[0].exists() ? r[0].data() : null;
      Cloud.nickname = ud && typeof ud.nickname === 'string' ? ud.nickname : '';
      var acc = null;
      if (r[1] && r[1].exists()) { try { acc = upgrade(JSON.parse(r[1].data().save)); } catch (e) { acc = null; } }
      // First sign-in on this browser moves the guest records into the account.
      var guest = load();
      Cloud.save = merge(acc, guest);
      try { localStorage.setItem(KEY, JSON.stringify(blank())); } catch (e) { /* ignore */ }
      remote = function (save) {
        SDK.setDoc(saveDoc, { save: JSON.stringify(save), updatedAt: SDK.serverTimestamp() }).catch(function (e) {
          if (denied(e)) { Cloud.rulesMissing = true; changed(); }
        });
      };
      remote(Cloud.save);
      Cloud.state = 'in';
      pushTime();
      changed();
    });
  });

  // The ranking keeps each player's best time over all three cars.
  function pushTime() {
    if (!remote || !Cloud.user) return Promise.resolve();
    var best = Cloud.bestOverall();
    if (!best || !Cloud.user) return Promise.resolve();
    var uid = Cloud.user.uid, ref = timeRef(uid);
    return SDK.getDoc(ref).then(function (snap) {
      var cur = snap.exists() ? snap.data() : null;
      var name = Cloud.displayName();
      if (cur && cur.time <= best.time && cur.name === name) return;
      return SDK.setDoc(ref, { uid: uid, name: name, time: best.time, car: best.car, device: Cloud.device(), at: SDK.serverTimestamp() });
    }).then(function () { cache = null; }, function (e) {
      if (denied(e)) { Cloud.rulesMissing = true; changed(); }
      console.warn('[drift] ranking write failed', e);
    });
  }

  var cache = null;
  Cloud.ranking = function (force) {
    if (cache && !force && Date.now() - cache.at < 30000) return Promise.resolve(cache.data);
    return SDK.getDocs(SDK.query(timesCol(), SDK.orderBy('time'), SDK.limit(30))).then(function (snap) {
      var rows = [];
      snap.forEach(function (d) { rows.push(d.data()); });
      cache = { at: Date.now(), data: rows };
      return rows;
    }, function (e) {
      if (denied(e)) Cloud.rulesMissing = true;
      throw e;
    });
  };

  DR.Cloud = Cloud;
})();

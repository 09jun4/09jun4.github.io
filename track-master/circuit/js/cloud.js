// cloud.js — Google login, account save and shared rankings (Firebase).
// Load order: after garage.js / tracks.js / race.js, before menu.js.
// Depends on: window.FirebaseSDK (js/vendor/firebase.js), firebase-config.js,
// Garage, Tracks, Cars.
//
// Firestore layout (rules: ../firestore.rules):
//   users/{uid}               { save: JSON string, nickname, updatedAt }  — private
//   tracks/{slug}/laps/{uid}  { uid, name, time, car, at }               — public read
//   career/{uid}              { uid, name, points, wins, podiums, titles, races, at }
// Leaderboard docs are the player's own all-time bests, written when they
// improve (and once on sign-in, so offline records catch up).
// Without a config (or SDK) everything here is disabled and the game keeps
// its browser-only save.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var SDK = window.FirebaseSDK;
  var cfg = window.F1C_FIREBASE_CONFIG || {};
  var Cloud = {
    enabled: !!(SDK && cfg.apiKey && cfg.projectId),
    state: 'out', // 'out' | 'pending' | 'in'
    user: null, // {uid, name, photo}
    nickname: '',
    error: '',
    NICK_MIN: 2,
    NICK_MAX: 12,
  };
  // Admin accounts: SHA-256 of the lowercase Google e-mail (the address
  // itself is not published). Admins get unlimited money.
  var ADMIN_EMAIL_SHA256 = ['c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991'];
  Cloud.isAdmin = false;
  function checkAdmin(u) {
    if (!u || !u.email || !u.emailVerified || !window.crypto || !crypto.subtle) return Promise.resolve(false);
    var bytes = new TextEncoder().encode(u.email.trim().toLowerCase());
    return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      return ADMIN_EMAIL_SHA256.indexOf(hex) >= 0;
    }, function () { return false; });
  }

  var listeners = [];
  Cloud.onChange = function (fn) { listeners.push(fn); };
  function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  // Short ids for the circuits (Firestore paths).
  var SLUGS = {
    'Autodromo Nazionale Monza': 'monza',
    'Suzuka International Racing Course': 'suzuka',
    'Las Vegas Street Circuit': 'lasvegas',
    'Circuit de Spa-Francorchamps': 'spa',
    'Silverstone Circuit': 'silverstone',
    'Autódromo José Carlos Pace': 'interlagos',
  };
  Cloud.slug = function (trackId) {
    return SLUGS[trackId] || String(trackId).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  };

  // Google blocks sign-in inside app webviews (Instagram, KakaoTalk, ...).
  Cloud.inAppBrowser = function () {
    var ua = navigator.userAgent || '';
    if (/Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) {
      if (/KAKAOTALK/i.test(ua)) return '카카오톡';
      if (/Instagram/i.test(ua)) return '인스타그램';
      if (/FBAN|FBAV/i.test(ua)) return '페이스북';
      if (/NAVER/i.test(ua)) return '네이버';
      return '앱';
    }
    return '';
  };

  // A stable anonymous default name until the player picks one.
  function defaultNick(uid) {
    var h = 0;
    for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return '드라이버' + String(1000 + (h % 9000));
  }
  Cloud.displayName = function () {
    return Cloud.nickname || (Cloud.user ? defaultNick(Cloud.user.uid) : '');
  };

  if (!Cloud.enabled) {
    CR.Cloud = Cloud;
    return;
  }

  var app = SDK.initializeApp(cfg);
  var auth = SDK.getAuth(app);
  var db = SDK.getFirestore(app);
  if (cfg.emulatorHost) { // local testing only
    SDK.connectAuthEmulator(auth, 'http://' + cfg.emulatorHost + ':9099', { disableWarnings: true });
    SDK.connectFirestoreEmulator(db, cfg.emulatorHost, 8080);
  }
  var provider = new SDK.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  function userRef(uid) { return SDK.doc(db, 'users', uid); }
  // Lap rankings are kept per view: 'laps' (3인칭) and 'laps_cockpit' (1인칭).
  function lapCol(view) { return view === 'cockpit' ? 'laps_cockpit' : 'laps'; }
  function lapRef(slug, uid, view) { return SDK.doc(db, 'tracks', slug, lapCol(view), uid); }
  function careerRef(uid) { return SDK.doc(db, 'career', uid); }

  function errText(e) {
    var code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    if (code === 'auth/unauthorized-domain') return '이 주소는 아직 로그인 허용 도메인에 등록되지 않았어요.';
    if (code === 'auth/network-request-failed' || code === 'unavailable') return '네트워크 연결을 확인해 주세요.';
    if (code === 'permission-denied') return '서버가 요청을 거부했어요.';
    return '로그인 중 문제가 생겼어요. (' + (code || 'unknown') + ')';
  }

  // --- Sign in / out -------------------------------------------------------

  Cloud.signIn = function () {
    Cloud.error = '';
    var inApp = Cloud.inAppBrowser();
    if (inApp) {
      Cloud.error = inApp + ' 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.';
      changed();
      return Promise.resolve(false);
    }
    return SDK.signInWithPopup(auth, provider).then(function () { return true; }, function (e) {
      var code = (e && e.code) || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        return SDK.signInWithRedirect(auth, provider).then(function () { return true; });
      }
      Cloud.error = errText(e);
      changed();
      return false;
    });
  };

  Cloud.signOut = function () {
    return SDK.signOut(auth);
  };

  SDK.getRedirectResult(auth).catch(function (e) { Cloud.error = errText(e); changed(); });

  SDK.onAuthStateChanged(auth, function (u) {
    if (!u) {
      var was = Cloud.state === 'in';
      Cloud.state = 'out';
      Cloud.user = null;
      Cloud.nickname = '';
      Cloud.isAdmin = false;
      CR.Garage.unlimited = false;
      if (was || CR.Garage.uid) CR.Garage.detachAccount();
      changed();
      return;
    }
    Cloud.state = 'pending';
    Cloud.user = { uid: u.uid, name: u.displayName || '', photo: u.photoURL || '' };
    CR.Garage.setStatus('loading');
    changed();
    Promise.all([SDK.getDoc(userRef(u.uid)), checkAdmin(u)]).then(function (res) {
      var snap = res[0];
      if (!Cloud.user || Cloud.user.uid !== u.uid) return; // signed out meanwhile
      Cloud.isAdmin = res[1];
      CR.Garage.unlimited = res[1];
      var data = snap.exists() ? snap.data() : null;
      var remote = null;
      if (data && typeof data.save === 'string') {
        try { remote = JSON.parse(data.save); } catch (e) { remote = null; }
      }
      Cloud.nickname = data && typeof data.nickname === 'string' ? data.nickname : '';
      Cloud.state = 'in';
      CR.Garage.attachAccount(u.uid, remote, {
        set: function (save) {
          return SDK.setDoc(userRef(u.uid), { save: JSON.stringify(save), updatedAt: SDK.serverTimestamp() }, { merge: true });
        },
      });
      changed();
      syncAll();
    }, function (e) {
      console.error('[F1C] load failed', e);
      Cloud.state = 'in';
      Cloud.error = '계정 저장을 불러오지 못했어요. ' + errText(e);
      CR.Garage.setStatus('error');
      changed();
    });
  });

  // --- Nickname ------------------------------------------------------------

  Cloud.validNick = function (name) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (name.length < Cloud.NICK_MIN || name.length > Cloud.NICK_MAX) return null;
    if (/[<>"'`\\]/.test(name)) return null;
    return name;
  };

  Cloud.setNickname = function (name) {
    var nick = Cloud.validNick(name);
    if (!nick || Cloud.state !== 'in') return Promise.reject(new Error('invalid'));
    var uid = Cloud.user.uid;
    return SDK.setDoc(userRef(uid), { nickname: nick, updatedAt: SDK.serverTimestamp() }, { merge: true }).then(function () {
      Cloud.nickname = nick;
      cache = {};
      changed();
      return syncAll(true);
    });
  };

  // --- Leaderboard writes ----------------------------------------------------

  // Puts this player's practice best on `trackId` into the ranking if it is
  // better than what the ranking has (or the name changed).
  // Writes a ranking doc with its `device` field; if the published rules
  // predate that field (permission-denied), writes it without for this visit.
  var deviceAllowed = true;
  function setRank(ref, data) {
    if (!deviceAllowed) { delete data.device; return SDK.setDoc(ref, data); }
    return SDK.setDoc(ref, data).catch(function (e) {
      if (!e || e.code !== 'permission-denied' || !('device' in data)) throw e;
      deviceAllowed = false;
      delete data.device;
      console.warn('[F1C] ranking rules do not accept "device" yet — publish the updated firestore.rules');
      return SDK.setDoc(ref, data);
    });
  }

  function pushLap(trackId, force, view) {
    if (Cloud.state !== 'in') return Promise.resolve();
    var rec = CR.Garage.bestBook(view)[trackId];
    if (!rec || !(rec.time > 0)) return Promise.resolve();
    var uid = Cloud.user.uid, ref = lapRef(Cloud.slug(trackId), uid, view), name = Cloud.displayName();
    return SDK.getDoc(ref).then(function (snap) {
      var cur = snap.exists() ? snap.data() : null;
      var time = Math.round(rec.time * 1000) / 1000;
      var dev = rec.dev || CR.deviceType();
      if (cur && !force && cur.time <= time && cur.name === name && (cur.device || !deviceAllowed)) return;
      var best = cur && cur.time < time ? cur : { time: time, car: rec.car, device: dev };
      var data = { uid: uid, name: name, time: best.time, car: best.car, at: SDK.serverTimestamp() };
      if (best.device === 'mobile' || best.device === 'pc') data.device = best.device;
      return setRank(ref, data);
    }).catch(function (e) {
      // 1인칭 rankings need the updated firestore.rules published.
      if (view === 'cockpit' && e && e.code === 'permission-denied') console.warn('[F1C] 1인칭 ranking needs the updated firestore.rules');
      else console.error('[F1C] lap rank write failed', e);
    });
  }

  function pushCareer() {
    if (Cloud.state !== 'in') return Promise.resolve();
    var st = CR.Garage.careerStats();
    if (!st.races) return Promise.resolve();
    var uid = Cloud.user.uid;
    return setRank(careerRef(uid), {
      uid: uid, name: Cloud.displayName(), points: st.points, wins: st.wins, podiums: st.podiums,
      titles: st.titles, races: st.races, device: CR.deviceType(), at: SDK.serverTimestamp(),
    }).catch(function (e) { console.error('[F1C] career rank write failed', e); });
  }

  function syncAll(force) {
    var jobs = Object.keys(CR.Garage.practice).map(function (t) { return pushLap(t, force, 'chase'); })
      .concat(Object.keys(CR.Garage.practiceFP).map(function (t) { return pushLap(t, force, 'cockpit'); }));
    jobs.push(pushCareer());
    return Promise.all(jobs).then(function () { cache = {}; });
  }

  CR.Garage.on('practiceRecord', function (r) {
    pushLap(r.track, false, r.view).then(function () { delete cache['lap:' + r.view + ':' + Cloud.slug(r.track)]; });
  });
  CR.Garage.on('race', function () {
    pushCareer().then(function () { delete cache.career; });
  });

  // --- Leaderboard reads -------------------------------------------------------

  var cache = {}; // key -> {at, data}
  var CACHE_MS = 30000;

  function cached(key, load, force) {
    var c = cache[key];
    if (c && !force && Date.now() - c.at < CACHE_MS) return Promise.resolve(c.data);
    return load().then(function (data) {
      cache[key] = { at: Date.now(), data: data };
      return data;
    });
  }

  function rows(snap) {
    var out = [];
    snap.forEach(function (d) { out.push(d.data()); });
    return out;
  }

  // Top laps on a circuit + this player's rank. -> {top, me: {rank, total, time}|null, total}
  Cloud.lapRanking = function (trackId, force, view) {
    var slug = Cloud.slug(trackId);
    view = view === 'cockpit' ? 'cockpit' : 'chase';
    return cached('lap:' + view + ':' + slug, function () {
      var col = SDK.collection(db, 'tracks', slug, lapCol(view));
      var jobs = [
        SDK.getDocs(SDK.query(col, SDK.orderBy('time'), SDK.limit(50))).then(rows),
        SDK.getCountFromServer(col).then(function (c) { return c.data().count; }),
      ];
      var mine = Cloud.state === 'in' ? CR.Garage.bestBook(view)[trackId] : null;
      if (mine) {
        var t = Math.round(mine.time * 1000) / 1000;
        jobs.push(SDK.getCountFromServer(SDK.query(col, SDK.where('time', '<', t))).then(function (c) {
          return { rank: c.data().count + 1, time: t };
        }));
      }
      return Promise.all(jobs).then(function (r) {
        return { top: r[0], total: r[1], me: r[2] || null };
      });
    }, force);
  };

  // AI 대전 career ranking by points.
  Cloud.careerRanking = function (force) {
    return cached('career', function () {
      var col = SDK.collection(db, 'career');
      var jobs = [
        SDK.getDocs(SDK.query(col, SDK.orderBy('points', 'desc'), SDK.limit(50))).then(rows),
        SDK.getCountFromServer(col).then(function (c) { return c.data().count; }),
      ];
      var st = Cloud.state === 'in' ? CR.Garage.careerStats() : null;
      if (st && st.races) {
        jobs.push(SDK.getCountFromServer(SDK.query(col, SDK.where('points', '>', st.points))).then(function (c) {
          return { rank: c.data().count + 1, points: st.points };
        }));
      }
      return Promise.all(jobs).then(function (r) {
        var top = r[0].sort(function (a, b) { return b.points - a.points || b.wins - a.wins || b.titles - a.titles; });
        return { top: top, total: r[1], me: r[2] || null };
      });
    }, force);
  };

  CR.Cloud = Cloud;
})();

// persistence.js — RallySettings defaults + RallyPersistence.
// Saved: settings (vehicle, assists, rally/penalties, HUD, graphics, camera),
// personal bests per stage (seed + length, with the car setup used), recent
// runs and recent seeds. Always in this browser (localStorage); with a Google
// login also in the account (Firestore rally_users/{uid}) — the same
// Firebase project and login as the rest of Track Master.
// The data shape is plain JSON so a server ranking can be added later.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var D = RL.Data;
  var KEY = 'track-master.rally';

  function isTouch() { return G.matchMedia && matchMedia('(pointer: coarse)').matches; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function defaults() {
    var gp = isTouch() ? 'low' : 'high';
    return {
      vehicle: { tyre: 'gravel', compound: 'soft', brakeBias: 0.62, stiffness: 1.0, rideHeight: 0, transmission: 'AUTOMATIC' },
      assists: { abs: true, tcs: true, esc: false, drift: true },
      rally: { damage: true, penalties: clone(D.PENALTIES), pacenoteTiming: 1.0 },
      hud: { speed: true, rpm: true, gear: true, pacenote: true, nextCorner: true, cornerDist: true, remaining: true, progress: true, splits: true, bias: true, tyres: true, suspension: true, engine: true, assists: true, timer: true, fps: false },
      graphics: Object.assign({ preset: gp }, clone(D.GRAPHICS[gp])),
      camera: 'cockpit',
      sound: true,
    };
  }
  // fill missing keys (older saves) from the defaults
  function fill(dst, src) {
    for (var k in src) {
      if (dst[k] == null || typeof dst[k] !== typeof src[k]) dst[k] = clone(src[k]);
      else if (typeof src[k] === 'object' && !Array.isArray(src[k])) fill(dst[k], src[k]);
    }
    return dst;
  }
  function blank() { return { v: 1, settings: defaults(), records: {}, recent: [], seeds: [] }; }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) { fill(s, blank()); return s; } } catch (e) { /* none */ }
    return blank();
  }

  var P = { data: load(), user: null, nickname: '', state: 'out', error: '', rulesMissing: false, enabled: false };
  var listeners = [];
  P.onChange = function (fn) { listeners.push(fn); };
  function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  var remote = null, saveTimer = null;
  P.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(P.data)); } catch (e) { /* full */ }
    if (remote) { clearTimeout(saveTimer); saveTimer = setTimeout(function () { remote(P.data); }, 800); }
  };
  P.settings = function () { return P.data.settings; };
  P.resetSettings = function (part) { var d = defaults(); if (part) P.data.settings[part] = d[part]; else P.data.settings = d; P.save(); };

  function recKey(seed, len) { return seed + '|' + len; }
  P.best = function (seed, len) { return P.data.records[recKey(seed, len)] || null; };
  // result: { seed, length, raw, penalty, final, splits, topSpeed, avgSpeed, setup }
  P.recordRun = function (res) {
    var k = recKey(res.seed, res.length), b = P.data.records[k], pb = false;
    if (res.finished && (!b || res.final < b.final)) {
      P.data.records[k] = { seed: res.seed, length: res.length, final: res.final, raw: res.raw, penalty: res.penalty, splits: res.splits, top: res.topSpeed, avg: res.avgSpeed, setup: res.setup, at: Date.now() };
      pb = true;
    }
    P.data.recent.unshift({ seed: res.seed, length: res.length, final: res.finished ? res.final : null, finished: res.finished, at: Date.now() });
    P.data.recent = P.data.recent.slice(0, 20);
    P.save();
    return pb;
  };
  P.rememberSeed = function (seed, len) {
    P.data.seeds = P.data.seeds.filter(function (s) { return !(s.seed === seed && s.length === len); });
    P.data.seeds.unshift({ seed: seed, length: len, at: Date.now() });
    P.data.seeds = P.data.seeds.slice(0, 12);
    P.save();
  };

  function merge(a, b) {
    // a: account, b: guest — keep the better record per stage, join history
    var out = a ? fill(a, blank()) : blank();
    if (!b) return out;
    Object.keys(b.records || {}).forEach(function (k) { var r = b.records[k], o = out.records[k]; if (!o || r.final < o.final) out.records[k] = r; });
    out.recent = (out.recent || []).concat(b.recent || []).sort(function (x, y) { return y.at - x.at; }).slice(0, 20);
    var seen = {};
    out.seeds = (out.seeds || []).concat(b.seeds || []).sort(function (x, y) { return y.at - x.at; }).filter(function (s) { var k = s.seed + s.length; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 12);
    if (!a) out.settings = b.settings;
    return out;
  }

  // ------------------------------------------------------------------
  // Google login (Firebase), same project as the rest of Track Master.
  P.inAppBrowser = function () {
    var ua = navigator.userAgent || '';
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '앱';
    return '';
  };
  function defaultNick(uid) { var h = 0; for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0; return '드라이버' + String(1000 + (h % 9000)); }
  P.displayName = function () { return P.nickname || (P.user ? defaultNick(P.user.uid) : ''); };

  var SDK = G.FirebaseSDK, cfg = G.F1C_FIREBASE_CONFIG || {};
  P.enabled = !!(SDK && cfg.apiKey && cfg.projectId);
  if (P.enabled) {
    var app = SDK.initializeApp(cfg), auth = SDK.getAuth(app), db = SDK.getFirestore(app), provider = new SDK.GoogleAuthProvider();
    var denied = function (e) { return e && /permission/.test(e.code || e.message || ''); };
    P.signIn = function () {
      P.error = '';
      var inApp = P.inAppBrowser();
      if (inApp) { P.error = inApp + ' 안의 브라우저에서는 구글 로그인이 막혀 있어요. 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.'; changed(); return; }
      SDK.signInWithPopup(auth, provider).catch(function (e) {
        if (e && /popup-blocked|operation-not-supported/.test(e.code || '')) return SDK.signInWithRedirect(auth, provider);
        if (!/popup-closed|cancelled-popup/.test((e && e.code) || '')) P.error = '로그인하지 못했어요. ' + ((e && e.code) || '');
        changed();
      });
    };
    P.signOut = function () { SDK.signOut(auth); };
    SDK.getRedirectResult(auth).catch(function () { /* shown on next try */ });
    SDK.onAuthStateChanged(auth, function (u) {
      if (!u) { P.state = 'out'; P.user = null; P.nickname = ''; remote = null; P.data = load(); changed(); return; }
      P.state = 'pending'; P.user = { uid: u.uid, name: u.displayName || '' }; changed();
      var userDoc = SDK.doc(db, 'users', u.uid), saveDoc = SDK.doc(db, 'rally_users', u.uid);
      Promise.all([
        SDK.getDoc(userDoc).catch(function () { return null; }),
        SDK.getDoc(saveDoc).catch(function (e) { if (denied(e)) P.rulesMissing = true; return null; }),
      ]).then(function (r) {
        var ud = r[0] && r[0].exists() ? r[0].data() : null;
        P.nickname = ud && typeof ud.nickname === 'string' ? ud.nickname : '';
        var acc = null;
        if (r[1] && r[1].exists()) { try { acc = JSON.parse(r[1].data().save); } catch (e) { acc = null; } }
        // first sign-in on this browser moves the guest progress into the account
        var guest = load(), hasGuest = Object.keys(guest.records).length || guest.recent.length;
        P.data = merge(acc, hasGuest ? guest : null);
        try { localStorage.setItem(KEY, JSON.stringify(Object.assign(blank(), { settings: P.data.settings }))); } catch (e) { /* ignore */ }
        remote = function (data) {
          SDK.setDoc(saveDoc, { save: JSON.stringify(data), updatedAt: SDK.serverTimestamp() }).catch(function (e) { if (denied(e)) { P.rulesMissing = true; changed(); } });
        };
        remote(P.data);
        P.state = 'in'; changed();
      });
    });
  } else {
    P.signIn = function () { P.error = '온라인 설정이 비어 있어 이 브라우저에만 저장돼요.'; changed(); };
    P.signOut = function () {};
  }

  RL.Persist = P;
  RL.Settings = { defaults: defaults, isTouch: isTouch };
})(typeof window !== 'undefined' ? window : globalThis);

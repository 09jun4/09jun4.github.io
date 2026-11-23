// cloud.js — 구글 로그인과 계정 저장 (Firebase). 설정이 비어 있으면 아무것도 하지 않고 브라우저 저장만 써요.
// Firestore: pixel_forge_users/{uid} { save: JSON 문자열, updatedAt } — 본인만 읽고 쓰기 (../firestore.rules)
//            pixel_forge_rank/{uid}  { nick, wave, power, label, snap, updatedAt } — 누구나 읽기, 본인 기록만 쓰기
'use strict';
(function () {
  const SDK = window.FirebaseSDK, cfg = window.PF_FIREBASE_CONFIG || {};
  const Cloud = window.Cloud = { enabled: !!(SDK && cfg.apiKey && cfg.projectId), state: 'out', user: null, error: '', isAdmin: false };
  const ls = [];
  Cloud.onChange = f => ls.push(f);
  const changed = () => ls.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  // 관리자: 소문자 구글 이메일의 SHA-256 (이메일 주소 자체는 공개하지 않아요). 이메일 인증된 계정만 인정.
  const ADMIN_SHA256 = ['c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991'];
  function checkAdmin(u) {
    if (!u || !u.email || !u.emailVerified || !window.crypto || !crypto.subtle) return Promise.resolve(false);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(u.email.trim().toLowerCase())).then(buf => {
      const hex = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
      return ADMIN_SHA256.includes(hex);
    }, () => false);
  }

  // 인스타그램·카카오톡 같은 앱 안 브라우저는 구글 로그인이 막혀요.
  function inApp() {
    const ua = navigator.userAgent || '';
    if (!/Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '';
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV/i.test(ua)) return '페이스북';
    if (/NAVER/i.test(ua)) return '네이버';
    return '앱';
  }
  Cloud.inApp = inApp;
  if (inApp()) setTimeout(() => Game.toast(inApp() + ' 안에서는 구글 로그인이 안 돼요. 메뉴의 "다른 브라우저로 열기"를 눌러 주세요'), 1500);

  // 랭킹 닉네임: 직접 정한 이름(2~12자), 정하기 전에는 계정마다 고정된 익명 이름
  Cloud.NICK_MIN = 2; Cloud.NICK_MAX = 12;
  Cloud.defaultNick = uid => { let h = 0; for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0; return '모험가' + (1000 + h % 9000); };
  Cloud.rankName = () => Game.S.nick || (Cloud.user ? Cloud.defaultNick(Cloud.user.uid) : '게스트');
  Cloud.validNick = name => {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (name.length < Cloud.NICK_MIN || name.length > Cloud.NICK_MAX || /[<>"'`\\]/.test(name)) return null;
    return name;
  };
  Cloud.ranking = () => Promise.reject(new Error('disabled'));
  Cloud.pushRank = () => Promise.resolve();
  ['equip', 'skills', 'pets', 'forge'].forEach(n => Game.on(n, () => { Game.rankDirty = true; }));

  if (!Cloud.enabled) return;

  // 사이트 로그인과 같이 쓰도록 기본 앱 이름 + 기본 저장 방식
  const app = SDK.initializeApp(cfg), auth = SDK.getAuth(app), db = SDK.getFirestore(app);
  const provider = new SDK.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const ref = uid => SDK.doc(db, 'pixel_forge_users', uid);

  function errText(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    if (code === 'auth/unauthorized-domain') return '이 주소는 아직 로그인 허용 도메인에 등록되지 않았어요.';
    if (code === 'auth/network-request-failed' || code === 'unavailable') return '네트워크 연결을 확인해 주세요.';
    if (code === 'permission-denied') return '서버가 요청을 거부했어요. (보안 규칙 게시 확인)';
    return '로그인 중 문제가 생겼어요. (' + (code || 'unknown') + ')';
  }

  Cloud.signIn = function () {
    Cloud.error = '';
    const app = inApp();
    if (app) { Cloud.error = app + ' 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.'; changed(); return; }
    SDK.signInWithPopup(auth, provider).catch(e => {
      const code = (e && e.code) || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return SDK.signInWithRedirect(auth, provider);
      Cloud.error = errText(e); changed();
    });
  };
  Cloud.signOut = () => SDK.signOut(auth);
  SDK.getRedirectResult(auth).catch(e => { Cloud.error = errText(e); changed(); });

  // ---- 웨이브 랭킹 ----
  const rankCol = () => SDK.collection(db, 'pixel_forge_rank');
  let rankCache = null, lastPush = 0;
  Cloud.rankError = '';
  Cloud.pushRank = function (force) {
    if (Cloud.state !== 'in' || !Cloud.user) return Promise.resolve();
    if (!force && (!Game.rankDirty || Date.now() - lastPush < 20000)) return Promise.resolve();
    Game.rankDirty = false; lastPush = Date.now();
    const S = Game.S, w = S.bestWave || 0, gi = Math.max(0, Math.ceil(w / PF.WAVES) - 1);
    const label = PF.DIFFS[Math.min(4, Math.floor(gi / 50))] + ' ' + (Math.floor(gi / 5) % 10 + 1) + '-' + (gi % 5 + 1);
    return SDK.setDoc(SDK.doc(db, 'pixel_forge_rank', Cloud.user.uid), {
      nick: Cloud.rankName(), wave: w, power: Game.stats().power, label,
      snap: JSON.stringify(Game.snapshot()), updatedAt: SDK.serverTimestamp(),
    }).then(() => { Cloud.rankError = ''; rankCache = null; }, e => {
      console.error('[PF] rank push failed', e);
      Game.rankDirty = true;
      Cloud.rankError = e && e.code === 'permission-denied' ? '랭킹 서버 규칙이 아직 게시되지 않았어요.' : '랭킹을 올리지 못했어요.';
    });
  };
  setInterval(() => Cloud.pushRank(), 5000);
  // 상위 50명 + 내 순위 → { top: [{uid, nick, wave, power, label, snap}], me: {rank}|null, total }
  Cloud.ranking = function (force) {
    if (rankCache && !force && Date.now() - rankCache.at < 30000) return Promise.resolve(rankCache.data);
    const col = rankCol(), jobs = [
      SDK.getDocs(SDK.query(col, SDK.orderBy('wave', 'desc'), SDK.limit(50))).then(snap => { const out = []; snap.forEach(d => out.push(Object.assign({ uid: d.id }, d.data()))); return out; }),
      SDK.getCountFromServer(col).then(c => c.data().count),
    ];
    if (Cloud.state === 'in') jobs.push(SDK.getCountFromServer(SDK.query(col, SDK.where('wave', '>', Game.S.bestWave || 0))).then(c => ({ rank: c.data().count + 1 })));
    return Promise.all(jobs).then(r => {
      const data = { top: r[0].sort((a, b) => b.wave - a.wave || b.power - a.power), total: r[1], me: r[2] || null };
      rankCache = { at: Date.now(), data };
      return data;
    });
  };
  Cloud.setNick = function (name) {
    const nick = Cloud.validNick(name);
    if (!nick) return Promise.reject(new Error('invalid'));
    Game.S.nick = nick; Game.Store.save();
    return Cloud.pushRank(true);
  };

  SDK.onAuthStateChanged(auth, u => {
    if (!u) {
      const was = Cloud.state === 'in';
      Cloud.state = 'out'; Cloud.user = null; Cloud.isAdmin = false;
      if (was) Game.Store.detach();
      changed();
      return;
    }
    Cloud.state = 'pending';
    Cloud.user = { uid: u.uid, name: u.displayName || '' };
    changed();
    Promise.all([SDK.getDoc(ref(u.uid)), checkAdmin(u)]).then(([snap, admin]) => {
      if (!Cloud.user || Cloud.user.uid !== u.uid) return; // 그사이 로그아웃
      Cloud.isAdmin = admin;
      let remote = null;
      const data = snap.exists() ? snap.data() : null;
      if (data && typeof data.save === 'string') { try { remote = JSON.parse(data.save); } catch (e) { remote = null; } }
      Cloud.state = 'in';
      Game.Store.attach(u.uid, remote, {
        set: save => SDK.setDoc(ref(u.uid), { save: JSON.stringify(save), updatedAt: SDK.serverTimestamp() }),
      });
      Game.rankDirty = true; setTimeout(() => Cloud.pushRank(true), 1500);
      changed();
    }, e => {
      console.error('[PF] load failed', e);
      Cloud.state = 'out'; Cloud.error = '계정 저장을 불러오지 못했어요. ' + errText(e);
      changed();
    });
  });
})();

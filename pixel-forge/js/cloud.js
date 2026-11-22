// cloud.js — 구글 로그인과 계정 저장 (Firebase). 설정이 비어 있으면 아무것도 하지 않고 브라우저 저장만 써요.
// Firestore: pixel_forge_users/{uid} { save: JSON 문자열, updatedAt } — 본인만 읽고 쓰기 (../firestore.rules)
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
      changed();
    }, e => {
      console.error('[PF] load failed', e);
      Cloud.state = 'out'; Cloud.error = '계정 저장을 불러오지 못했어요. ' + errText(e);
      changed();
    });
  });
})();

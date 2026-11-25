// 구글 로그인과 계정 저장 (Firebase Auth + Firestore). 설정이 비어 있으면 아무것도 하지 않고 브라우저 저장만 써요.
// Firestore: fold_users/{uid} { save: JSON 문자열, updatedAt } — 본인만 읽고 쓰기 (../firestore.rules)
// 사이트 로그인과 이어지도록 기본 앱 이름 + 기본 저장 방식으로 초기화해요.
const ADMIN_SHA256 = ['c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991'];

// 관리자: 소문자 구글 이메일의 SHA-256 (주소 자체는 코드에 없어요). 이메일 인증된 계정만 인정.
function checkAdmin(u) {
  if (!u || !u.email || !u.emailVerified || !window.crypto || !crypto.subtle) return Promise.resolve(false);
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(u.email.trim().toLowerCase())).then(buf => {
    const hex = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    return ADMIN_SHA256.includes(hex);
  }, () => false);
}

// 인스타그램·카카오톡 같은 앱 안 브라우저는 구글 로그인을 막아요.
export function inAppBrowser() {
  const ua = navigator.userAgent || '';
  if (!/Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '';
  if (/KAKAOTALK/i.test(ua)) return '카카오톡';
  if (/Instagram/i.test(ua)) return '인스타그램';
  if (/FBAN|FBAV/i.test(ua)) return '페이스북';
  if (/NAVER/i.test(ua)) return '네이버';
  return '앱';
}

function errText(e) {
  const code = (e && e.code) || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/unauthorized-domain') return '이 주소는 아직 로그인 허용 도메인에 등록되지 않았어요.';
  if (code === 'auth/network-request-failed' || code === 'unavailable') return '네트워크 연결을 확인해 주세요.';
  if (code === 'permission-denied') return '서버가 요청을 거부했어요. (보안 규칙 게시 확인)';
  return '로그인 중 문제가 생겼어요. (' + (code || 'unknown') + ')';
}

export class Cloud {
  constructor(save) {
    this.save = save;
    this.state = 'out'; this.user = null; this.error = ''; this.isAdmin = false;
    this.listeners = [];
    const SDK = window.FirebaseSDK, cfg = window.FOLD_FIREBASE_CONFIG || {};
    this.enabled = !!(SDK && cfg.apiKey && cfg.projectId);
    if (!this.enabled) return;
    try {
      this.SDK = SDK;
      this.app = SDK.initializeApp(cfg);
      this.auth = SDK.getAuth(this.app);
      this.db = SDK.getFirestore(this.app);
    } catch (e) { console.error('[FOLD] Firebase 초기화 실패', e); this.enabled = false; return; }
    this.provider = new SDK.GoogleAuthProvider();
    this.provider.setCustomParameters({ prompt: 'select_account' });
    SDK.getRedirectResult(this.auth).catch(e => { this.error = errText(e); this.emit(); });
    SDK.onAuthStateChanged(this.auth, u => this.onUser(u));
  }
  onChange(f) { this.listeners.push(f); }
  emit() { this.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
  ref(uid) { return this.SDK.doc(this.db, 'fold_users', uid); }

  signIn() {
    this.error = '';
    const app = inAppBrowser();
    if (app) { this.error = app + ' 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.'; this.emit(); return; }
    if (!this.enabled) { this.error = '로그인 설정이 아직 없어요. 진행은 이 브라우저에 저장돼요.'; this.emit(); return; }
    this.SDK.signInWithPopup(this.auth, this.provider).catch(e => {
      const code = (e && e.code) || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return this.SDK.signInWithRedirect(this.auth, this.provider);
      this.error = errText(e); this.emit();
    });
  }
  signOut() { if (this.enabled) this.SDK.signOut(this.auth); }

  onUser(u) {
    const SDK = this.SDK;
    if (!u) {
      const was = this.state === 'in';
      this.state = 'out'; this.user = null; this.isAdmin = false;
      if (was) this.save.detach(); // 로그아웃 → 게스트 상태로
      this.emit();
      return;
    }
    this.state = 'pending';
    this.user = { uid: u.uid, name: u.displayName || '', photo: u.photoURL || '' };
    this.emit();
    Promise.all([SDK.getDoc(this.ref(u.uid)), checkAdmin(u)]).then(([snap, admin]) => {
      if (!this.user || this.user.uid !== u.uid) return;
      this.isAdmin = admin;
      let remote = null;
      const data = snap.exists() ? snap.data() : null;
      if (data && typeof data.save === 'string') { try { remote = JSON.parse(data.save); } catch (e) { remote = null; } }
      this.state = 'in';
      this.save.attach(u.uid, remote, {
        set: save => SDK.setDoc(this.ref(u.uid), { save: JSON.stringify(save), updatedAt: SDK.serverTimestamp() }),
      });
      this.emit();
    }, e => {
      console.error('[FOLD] 계정 기록 불러오기 실패', e);
      // 규칙 게시 전이어도 로그인 상태(관리자 판별 등)는 유지하고, 저장은 브라우저에만
      checkAdmin(u).then(admin => {
        this.isAdmin = admin; this.state = 'in';
        this.error = '계정 저장을 불러오지 못해 이 브라우저에만 저장해요. ' + errText(e);
        this.emit();
      });
    });
  }
}

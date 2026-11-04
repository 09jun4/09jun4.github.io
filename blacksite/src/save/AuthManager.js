// 구글 로그인 (Firebase Auth) + 계정 저장 (Firestore users/{uid}).
// js/firebase-config.js가 비어 있으면 Firebase를 초기화하지 않고 게스트(localStorage)로만 동작한다.
// 사이트 로그인과 연결되도록 기본 이름 앱 + 기본 저장 방식(getAuth)으로 만든다.
import { bus } from '../core/EventBus.js';
import { DIFFS } from './defaults.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.1.0/';
// 관리자: 소문자 구글 이메일의 SHA-256 (주소는 공개 저장소에 쓰지 않는다). 이메일 인증된 계정만 인정.
const ADMIN_EMAIL_SHA256 = ['c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991'];

export function inAppBrowser() {
  const ua = navigator.userAgent || '';
  if (!/Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '';
  return /KAKAOTALK/i.test(ua) ? '카카오톡' : /Instagram/i.test(ua) ? '인스타그램' : /FBAN|FBAV/i.test(ua) ? '페이스북' : /NAVER/i.test(ua) ? '네이버' : '앱';
}

async function checkAdmin(u) {
  if (!u || !u.email || !u.emailVerified || !crypto.subtle) return false;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(u.email.trim().toLowerCase()));
    return ADMIN_EMAIL_SHA256.includes([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));
  } catch (e) { return false; }
}

// Firestore에 쓰는 형태 (규칙과 같은 모양으로 정리)
function toDoc(data, F) {
  const records = {};
  for (const d of DIFFS) records[d] = { bestTimeSec: Number(data.records[d].bestTimeSec) || 0, clears: Math.floor(data.records[d].clears) || 0 };
  return { settings: data.settings, records, readLogs: data.readLogs.slice(0, 50), updatedAt: F.serverTimestamp() };
}

export class AuthManager {
  constructor(game) {
    this.game = game;
    this.cfg = window.BLACKSITE_FIREBASE_CONFIG || {};
    this.enabled = !!(this.cfg.apiKey && this.cfg.projectId);
    this.state = 'out'; // out | pending | in
    this.user = null;
    this.isAdmin = false;
    this.error = '';
  }

  changed() { bus.emit('auth:changed', this); }

  async init() {
    const inApp = inAppBrowser();
    if (inApp) {
      this.game.ui.showNotice(`<b>${inApp}</b> 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위 메뉴에서 <b>"다른 브라우저로 열기"</b>를 눌러 크롬이나 사파리에서 열어 주세요. (게스트로는 그대로 플레이할 수 있어요)`);
    }
    if (!this.enabled) { this.changed(); return; }
    try {
      const [I, A, F] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => import(SDK + f)));
      this.A = A; this.F = F;
      this.app = I.initializeApp(this.cfg);
      this.auth = A.getAuth(this.app);
      this.db = F.getFirestore(this.app);
    } catch (e) {
      console.warn('[Auth] Firebase load failed — guest mode', e);
      this.enabled = false;
      this.changed();
      return;
    }
    this.A.getRedirectResult(this.auth).catch((e) => { this.error = this.errText(e); this.changed(); });
    this.A.onAuthStateChanged(this.auth, (u) => this.onUser(u));
  }

  errText(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    if (code === 'auth/unauthorized-domain') return '이 주소는 아직 로그인 허용 도메인에 등록되지 않았어요.';
    if (code === 'auth/network-request-failed' || code === 'unavailable') return '네트워크 연결을 확인해 주세요.';
    if (code === 'permission-denied') return '서버가 요청을 거부했어요. (보안 규칙 게시 필요)';
    return '로그인 중 문제가 생겼어요. (' + (code || 'unknown') + ')';
  }

  async signIn() {
    this.error = '';
    const inApp = inAppBrowser();
    if (inApp) {
      this.error = `${inApp} 안의 브라우저에서는 구글 로그인이 막혀 있어요. "다른 브라우저로 열기"로 크롬·사파리에서 열어 주세요.`;
      this.changed();
      return;
    }
    if (!this.enabled) return;
    const provider = new this.A.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    this.state = 'pending'; this.changed();
    try {
      await this.A.signInWithPopup(this.auth, provider);
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await this.A.signInWithRedirect(this.auth, provider);
        return;
      }
      this.state = this.user ? 'in' : 'out';
      this.error = this.errText(e);
      this.changed();
    }
  }

  signOut() { if (this.auth) this.A.signOut(this.auth); }

  async onUser(u) {
    const save = this.game.save;
    if (!u) {
      const was = this.state === 'in' || save.uid;
      this.state = 'out'; this.user = null; this.isAdmin = false;
      if (was) save.detachAccount();
      this.game.setAdmin(false);
      this.changed();
      return;
    }
    this.state = 'pending';
    this.user = { uid: u.uid, name: u.displayName || '', photo: u.photoURL || '' };
    save.setStatus('loading');
    this.changed();
    const F = this.F, ref = F.doc(this.db, 'users', u.uid);
    try {
      const [snap, admin] = await Promise.all([F.getDoc(ref), checkAdmin(u)]);
      if (!this.user || this.user.uid !== u.uid) return; // 그 사이 로그아웃
      this.isAdmin = admin;
      const remote = snap.exists() ? snap.data() : null;
      this.state = 'in';
      const moved = save.attachAccount(u.uid, remote, { set: (data) => F.setDoc(ref, toDoc(data, F)) });
      if (moved) this.game.ui.hud.toast?.('ACCOUNT SYNCED', '게스트 진행을 계정으로 옮겼어요.', 3);
      this.game.setAdmin(admin);
    } catch (e) {
      console.error('[Auth] load failed', e);
      this.state = 'in';
      this.error = '계정 저장을 불러오지 못했어요. ' + this.errText(e);
      save.setStatus('error');
    }
    this.changed();
  }
}

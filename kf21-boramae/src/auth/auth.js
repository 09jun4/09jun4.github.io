// 구글 로그인(Firebase Authentication). 설정값이 비어 있으면 꺼진 상태(enabled=false)로 남고 게임은 localStorage만 쓴다.
// 사이트 공통 로그인과 이어지도록 기본 이름의 앱 + 기본 저장 방식(getAuth)으로 만든다.
import { readConfig, loadSdk } from './firebase-sdk.js';
import { inAppBrowser, inAppText } from './inapp-browser.js';
import { isAdminUser } from './admin.js';

export const AUTH = { OFF: 'off', LOADING: 'loading', OUT: 'out', PENDING: 'pending', IN: 'in' };

export function authErrorText(e) {
  const code = (e && e.code) || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/unauthorized-domain') return '이 주소는 아직 로그인 허용 도메인에 등록되지 않았어요.';
  if (code === 'auth/network-request-failed' || code === 'unavailable') return '네트워크 연결을 확인해 주세요.';
  if (code === 'permission-denied') return '서버가 요청을 거부했어요. (보안 규칙을 확인해 주세요)';
  return `문제가 생겼어요. (${code || 'unknown'})`;
}

export class Auth {
  constructor() {
    this.config = readConfig();
    this.enabled = !!this.config;
    this.state = this.enabled ? AUTH.LOADING : AUTH.OFF;
    this.user = null; // {uid, email, emailVerified, displayName}
    this.isAdmin = false;
    this.error = '';
    this.sdk = null;
    this.auth = null;
    this.db = null;
    this.listeners = [];
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  _emit(event) {
    for (const fn of this.listeners) {
      try { fn(event, this); } catch (e) { console.error(e); }
    }
  }

  /** SDK를 불러와 로그인 상태를 지켜본다. 실패하면 오프라인 모드로 남는다. */
  async init() {
    if (!this.enabled) return false;
    try {
      const sdk = await loadSdk();
      const app = sdk.initializeApp(this.config);
      this.sdk = sdk;
      this.auth = sdk.getAuth(app);
      this.db = sdk.getFirestore(app);
      sdk.getRedirectResult(this.auth).catch((e) => { this.error = authErrorText(e); this._emit('error'); });
      sdk.onAuthStateChanged(this.auth, (u) => this._onUser(u));
      return true;
    } catch (e) {
      console.warn('[KF21] 온라인 기능을 불러오지 못해 브라우저 저장만 사용해요.', e);
      this.enabled = false;
      this.state = AUTH.OFF;
      this._emit('state');
      return false;
    }
  }

  async _onUser(u) {
    if (!u) {
      const was = this.state === AUTH.IN || this.state === AUTH.PENDING;
      this.user = null;
      this.isAdmin = false;
      this.state = AUTH.OUT;
      this._emit(was ? 'signed-out' : 'state');
      return;
    }
    this.user = { uid: u.uid, email: u.email || '', emailVerified: !!u.emailVerified, displayName: u.displayName || '' };
    this.state = AUTH.PENDING;
    this._emit('state');
    this.isAdmin = await isAdminUser(this.user);
    if (!this.user || this.user.uid !== u.uid) return; // 그 사이 로그아웃
    this._emit('signed-in'); // 계정 데이터 불러오기는 online.js가 맡고, 끝나면 ready()를 부른다
  }

  ready() {
    if (this.user) { this.state = AUTH.IN; this._emit('state'); }
  }

  /** @returns {Promise<boolean>} */
  async signIn() {
    if (!this.enabled || !this.sdk) return false;
    this.error = '';
    const inApp = inAppBrowser();
    if (inApp) {
      this.error = inAppText(inApp);
      this._emit('error');
      return false;
    }
    const provider = new this.sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await this.sdk.signInWithPopup(this.auth, provider);
      return true;
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await this.sdk.signInWithRedirect(this.auth, provider);
        return false;
      }
      this.error = authErrorText(e);
      if (this.error) this._emit('error');
      return false;
    }
  }

  signOut() {
    return this.enabled && this.sdk ? this.sdk.signOut(this.auth) : Promise.resolve();
  }
}

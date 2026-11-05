// Cloud — 구글 로그인 · 계정 저장 · 챕터별 랭킹 (Firebase Authentication + Firestore).
// 설정(js/firebase-config.js)이 비어 있으면 꺼지고, 게임은 브라우저 저장만으로 정상 동작해요.
//
// Firestore 구조 (보안 규칙: ../../firestore.rules)
//   users/{uid}                       { save: JSON 문자열, nickname, updatedAt }  — 본인만 읽기/쓰기
//   chapters/{chapterId}/scores/{uid} { uid, name, score, grade, time, at }        — 누구나 읽기, 본인 기록만 쓰기
const ADMIN_EMAIL_SHA256 = ['c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991'];
const CHAPTER_IDS = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9', 'ch10'];

function checkAdmin(u) {
  if (!u || !u.email || !u.emailVerified || !window.crypto || !crypto.subtle) return Promise.resolve(false);
  const bytes = new TextEncoder().encode(u.email.trim().toLowerCase());
  return crypto.subtle.digest('SHA-256', bytes).then((buf) => {
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return ADMIN_EMAIL_SHA256.includes(hex);
  }, () => false);
}

export function inAppBrowser() {
  const ua = navigator.userAgent || '';
  if (/Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) {
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/FBAN|FBAV/i.test(ua)) return '페이스북';
    if (/NAVER/i.test(ua)) return '네이버';
    return '앱';
  }
  return '';
}

export class Cloud {
  constructor(saveSystem) {
    this.save = saveSystem;
    const SDK = window.FirebaseSDK;
    const cfg = window.SUNHO_FIREBASE_CONFIG || {};
    this.SDK = SDK;
    this.enabled = !!(SDK && cfg.apiKey && cfg.projectId);
    this.state = 'out'; // out | pending | in
    this.user = null;
    this.nickname = '';
    this.isAdmin = false;
    this.error = '';
    this.listeners = [];
    this.cache = {};
    if (!this.enabled) return;
    // 사이트 로그인과 공유되도록 기본 이름의 앱 + 기본 저장 방식
    this.app = SDK.initializeApp(cfg);
    this.auth = SDK.getAuth(this.app);
    this.db = SDK.getFirestore(this.app);
    this.provider = new SDK.GoogleAuthProvider();
    this.provider.setCustomParameters({ prompt: 'select_account' });
    SDK.getRedirectResult(this.auth).catch((e) => { this.error = this._err(e); this._changed(); });
    SDK.onAuthStateChanged(this.auth, (u) => this._onAuth(u));
  }

  onChange(fn) { this.listeners.push(fn); }
  _changed() { this.listeners.forEach((f) => { try { f(this); } catch (e) { console.error(e); } }); }

  _err(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    if (code === 'auth/unauthorized-domain') return '이 주소는 아직 로그인 허용 도메인에 등록되지 않았어요.';
    if (code === 'auth/network-request-failed' || code === 'unavailable') return '네트워크 연결을 확인해 주세요.';
    if (code === 'permission-denied') return '서버가 요청을 거부했어요. (보안 규칙 게시 필요)';
    return '로그인 중 문제가 생겼어요. (' + (code || 'unknown') + ')';
  }

  defaultNick(uid) {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return '라이더' + String(1000 + (h % 9000));
  }
  displayName() { return this.nickname || (this.user ? this.defaultNick(this.user.uid) : ''); }

  signIn() {
    this.error = '';
    const app = inAppBrowser();
    if (app) {
      this.error = `${app} 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위(또는 아래) 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.`;
      this._changed();
      return Promise.resolve(false);
    }
    if (!this.enabled) { this.error = '온라인 기능이 아직 설정되지 않았어요. (브라우저 저장으로 플레이 중)'; this._changed(); return Promise.resolve(false); }
    const SDK = this.SDK;
    return SDK.signInWithPopup(this.auth, this.provider).then(() => true, (e) => {
      const code = (e && e.code) || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return SDK.signInWithRedirect(this.auth, this.provider).then(() => true);
      this.error = this._err(e); this._changed(); return false;
    });
  }
  signOut() { return this.enabled ? this.SDK.signOut(this.auth) : Promise.resolve(); }

  _userRef(uid) { return this.SDK.doc(this.db, 'users', uid); }
  _scoreRef(ch, uid) { return this.SDK.doc(this.db, 'chapters', ch, 'scores', uid); }

  _onAuth(u) {
    const SDK = this.SDK;
    if (!u) {
      const was = this.state === 'in';
      this.state = 'out'; this.user = null; this.nickname = ''; this.isAdmin = false;
      if (was || this.save.uid) this.save.detachAccount();
      this._changed();
      return;
    }
    this.state = 'pending';
    this.user = { uid: u.uid, name: u.displayName || '', photo: u.photoURL || '' };
    this.save.status = 'loading';
    this._changed();
    Promise.all([SDK.getDoc(this._userRef(u.uid)), checkAdmin(u)]).then(([snap, admin]) => {
      if (!this.user || this.user.uid !== u.uid) return;
      this.isAdmin = admin;
      const data = snap.exists() ? snap.data() : null;
      let remote = null;
      if (data && typeof data.save === 'string') { try { remote = JSON.parse(data.save); } catch { remote = null; } }
      this.nickname = data && typeof data.nickname === 'string' ? data.nickname : '';
      this.state = 'in';
      this.save.attachAccount(u.uid, remote, {
        set: (save) => SDK.setDoc(this._userRef(u.uid), { save: JSON.stringify(save), updatedAt: SDK.serverTimestamp() }, { merge: true }),
      });
      this._changed();
      this.syncAll();
    }, (e) => {
      console.error('[cloud] load failed', e);
      this.state = 'in';
      this.error = '계정 저장을 불러오지 못했어요. ' + this._err(e);
      this.save.status = 'error';
      this._changed();
    });
  }

  validNick(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 12 || /[<>"'`\\]/.test(name)) return null;
    return name;
  }
  setNickname(name) {
    const nick = this.validNick(name);
    if (!nick || this.state !== 'in') return Promise.reject(new Error('invalid'));
    const SDK = this.SDK;
    return SDK.setDoc(this._userRef(this.user.uid), { nickname: nick, updatedAt: SDK.serverTimestamp() }, { merge: true }).then(() => {
      this.nickname = nick; this.cache = {}; this._changed();
      return this.syncAll(true);
    });
  }

  // 내 최고 기록을 랭킹에 올리기 (더 좋아졌거나 이름이 바뀌었을 때만)
  pushScore(chId, force = false) {
    if (this.state !== 'in' || !CHAPTER_IDS.includes(chId)) return Promise.resolve();
    const rec = this.save.chapter(chId);
    if (!rec || !(rec.best > 0)) return Promise.resolve();
    const SDK = this.SDK, uid = this.user.uid, ref = this._scoreRef(chId, uid), name = this.displayName();
    return SDK.getDoc(ref).then((snap) => {
      const cur = snap.exists() ? snap.data() : null;
      if (cur && !force && cur.score >= rec.best && cur.name === name) return;
      const best = cur && cur.score > rec.best ? cur : rec;
      return SDK.setDoc(ref, { uid, name, score: Math.round(best.best ?? best.score), grade: best.grade || 'D', time: Number(best.time) || 0, at: SDK.serverTimestamp() });
    }).then(() => { delete this.cache[chId]; }).catch((e) => console.error('[cloud] score write failed', e));
  }
  syncAll(force) { return Promise.all(Object.keys(this.save.data.chapters).map((id) => this.pushScore(id, force))); }

  // 챕터 랭킹 상위 20 + 내 순위
  ranking(chId, force = false) {
    if (!this.enabled) return Promise.resolve(null);
    const c = this.cache[chId];
    if (c && !force && Date.now() - c.at < 30000) return Promise.resolve(c.data);
    const SDK = this.SDK;
    const col = SDK.collection(this.db, 'chapters', chId, 'scores');
    const jobs = [SDK.getDocs(SDK.query(col, SDK.orderBy('score', 'desc'), SDK.limit(20))).then((s) => { const out = []; s.forEach((d) => out.push(d.data())); return out; })];
    const mine = this.state === 'in' ? this.save.chapter(chId) : null;
    if (mine && mine.best > 0) jobs.push(SDK.getCountFromServer(SDK.query(col, SDK.where('score', '>', mine.best))).then((r) => ({ rank: r.data().count + 1, score: mine.best })));
    return Promise.all(jobs).then(([top, me]) => {
      const data = { top, me: me || null };
      this.cache[chId] = { at: Date.now(), data };
      return data;
    });
  }
}

// 사이트 공통 구글 로그인 (Firebase). assets/site.js 의 header() 가 모든 페이지에서 불러와요.
// - 사이트 프로젝트(치이카와 토벌 대작전과 같은 프로젝트)로 로그인하면 그 작품도 같이 로그인된 상태가 돼요.
// - 다른 프로젝트를 쓰는 작품(LINKED_WORKS)은 숨은 bridge.html 로 같은 구글 계정을 넘겨서 같이 로그인시켜요.
// - 로그아웃하면 연결된 작품도 모두 로그아웃(게스트)돼요.
import { SITE_FIREBASE, LINKED_WORKS } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.1.0/';
const ROOT = new URL('../', import.meta.url).href;
// 관리자: 소문자 구글 이메일의 SHA-256 (주소는 공개 저장소에 쓰지 않아요). 이메일 인증된 계정만 인정해요.
const ADMIN_EMAIL_SHA256 = ['c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991'];

export let enabled = !!(SITE_FIREBASE && SITE_FIREBASE.apiKey);
export let A = null, F = null, app = null, auth = null, db = null;
if (enabled){
  try {
    let I; [I, A, F] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(SDK + f)));
    app = I.initializeApp(SITE_FIREBASE); auth = A.getAuth(app); db = F.getFirestore(app);
  } catch (e) { console.warn('firebase', e); enabled = false; }
}

export const state = { ready: false, user: null, admin: false };
const subs = [];
export function onUser(fn){ subs.push(fn); if (state.ready) fn(state); }
function emit(){ state.ready = true; render(); subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const setOwner = v => { try { v ? localStorage.setItem('owner', '1') : localStorage.removeItem('owner'); } catch (e) {} };

export async function isAdminUser(u){
  if (!u || !u.email || !u.emailVerified || !crypto.subtle) return false;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(u.email.trim().toLowerCase()));
    return ADMIN_EMAIL_SHA256.includes([...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''));
  } catch (e) { return false; }
}

// 구글은 앱 안 브라우저(인스타그램, 카카오톡 ...)에서 로그인을 막아요
export function inAppBrowser(){
  const ua = navigator.userAgent || '';
  if (!/Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '';
  return /KAKAOTALK/i.test(ua) ? '카카오톡' : /Instagram/i.test(ua) ? '인스타그램' : /FBAN|FBAV/i.test(ua) ? '페이스북' : /NAVER/i.test(ua) ? '네이버' : '앱';
}
export const inAppText = n => `${n} 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.`;

export function toast(msg, ms = 4000){
  let t = document.getElementById('toast');
  if (!t){ t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
}

// --- 연결된 작품에 같이 로그인 / 로그아웃 ---------------------------------
function bridge(id, msg){
  return new Promise(res => {
    const f = document.createElement('iframe');
    f.hidden = true; f.title = 'login bridge'; f.src = ROOT + 'js/bridge.html#' + encodeURIComponent(id);
    const done = r => { clearTimeout(t); removeEventListener('message', on); f.remove(); res(r); };
    const on = e => {
      if (e.source !== f.contentWindow || e.origin !== location.origin) return;
      if (e.data && e.data.ready) f.contentWindow.postMessage(msg, location.origin); else done(e.data || {});
    };
    const t = setTimeout(() => done({ ok: false, code: 'timeout' }), 20000);
    addEventListener('message', on); document.body.appendChild(f);
  });
}
async function linkWorks(result){
  const c = result && A.GoogleAuthProvider.credentialFromResult(result);
  if (!c || !LINKED_WORKS.length) return;
  const msg = { op: 'in', idToken: c.idToken, accessToken: c.accessToken, email: result.user.email };
  const res = await Promise.all(LINKED_WORKS.map(w => bridge(w.id, msg)));
  const bad = LINKED_WORKS.map((w, i) => res[i].ok ? '' : `${w.title}(${res[i].code})`).filter(Boolean);
  if (bad.length){
    console.warn('자동 로그인 연결 실패:', bad.join(', '));
    if (await isAdminUser(result.user)) toast('작품 자동 로그인 연결 실패: ' + bad.join(', '), 8000);
  }
}

export async function signIn(){
  if (!enabled) return false;
  const inApp = inAppBrowser();
  if (inApp){ toast(inAppText(inApp), 8000); return false; }
  const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  try { const r = await A.signInWithPopup(auth, p); linkWorks(r); return true; }
  catch (e){
    const c = (e && e.code) || '';
    if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment'){ await A.signInWithRedirect(auth, p); return false; }
    if (c !== 'auth/popup-closed-by-user' && c !== 'auth/cancelled-popup-request') toast('로그인하지 못했어요 (' + (c || 'unknown') + ')');
    return false;
  }
}
export async function signOut(){
  if (!enabled) return;
  setOwner(false);
  await Promise.all(LINKED_WORKS.map(w => bridge(w.id, { op: 'out' })));
  await A.signOut(auth);
}

// --- 머리말: 로그인 버튼, 관리자에게만 notes 탭과 새 피드백 수 ---------------
let badgeFor = '';
function render(){
  const el = document.getElementById('acct');
  if (el){
    el.innerHTML = !enabled || !state.ready ? '' : state.user
      ? `<span class="who">${esc(state.user.displayName || '')}</span><button class="acct-btn" title="${esc(state.user.email || '')} 로그아웃">logout</button>`
      : '<button class="acct-btn">login</button>';
    const b = el.querySelector('button');
    if (b) b.onclick = async () => { b.disabled = true; try { await (state.user ? signOut() : signIn()); } finally { b.disabled = false; } };
  }
  const notes = document.querySelector('nav [data-nav="notes"]');
  if (notes && enabled && !notes.classList.contains('on')) notes.hidden = !state.admin;
  const fb = document.querySelector('nav [data-nav="feedback"]');
  if (fb && state.admin && badgeFor !== state.user.uid){
    badgeFor = state.user.uid;
    F.getCountFromServer(F.query(F.collection(db, 'feedback'), F.where('read', '==', false)))
      .then(s => { const n = s.data().count; fb.querySelector('.badge')?.remove(); if (n) fb.insertAdjacentHTML('beforeend', `<b class="badge">${n}</b>`); })
      .catch(() => {});
  }
  if (!state.admin) badgeFor = '';
}
export function refreshBadge(){ badgeFor = ''; render(); }

if (enabled){
  A.getRedirectResult(auth).then(r => r && linkWorks(r)).catch(e => toast('로그인하지 못했어요 (' + ((e && e.code) || 'unknown') + ')'));
  A.onAuthStateChanged(auth, async u => {
    state.user = u; state.admin = await isAdminUser(u);
    if (state.admin) setOwner(true);
    emit();
  });
} else emit();

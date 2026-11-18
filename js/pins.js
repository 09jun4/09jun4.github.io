// 작품 고정(pin): 고정한 작품이 메인 Works 맨 위에 떠요.
// - 고정 목록은 Firestore site/pins 문서에 저장돼서 모든 방문자에게 같게 보여요 (읽기 누구나, 쓰기 관리자만).
// - 핀 버튼은 관리자 계정에게만 보여요.
// - 서버 규칙을 아직 게시하지 않았으면 이 브라우저에만 저장해 두었다가, 규칙이 게시된 뒤 관리자가 열면 서버로 올려요.
import { enabled, F, db, onUser, toast } from './auth.js';

const LS = 'pins:local';
const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } };
const writeLocal = v => { try { v ? localStorage.setItem(LS, JSON.stringify(v)) : localStorage.removeItem(LS); } catch (e) {} };

let remote = null; // 서버 목록 (null = 아직 못 읽음)
let local = readLocal(); // 서버에 못 올린 목록
let admin = false;
const effective = () => remote !== null ? remote : (admin && local ? local : []);

const PIN_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/><path d="M12 14v7"/></svg>';

function paint() { if (window.renderWorks) window.renderWorks(effective()); }

// 카드를 다시 그릴 때마다 관리자에게 핀 버튼을 붙여요
window.addEventListener('works-rendered', () => {
  if (!admin) return;
  const pinned = effective();
  document.querySelectorAll('#works .card').forEach(card => {
    const url = card.getAttribute('href'), on = pinned.includes(url), thumb = card.querySelector('.thumb');
    if (!thumb) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pin-btn' + (on ? ' on' : '');
    b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? '고정 해제' : '맨 위에 고정'); b.title = on ? '고정 해제' : '맨 위에 고정';
    b.innerHTML = PIN_SVG;
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(url); });
    thumb.appendChild(b);
  });
});

async function save(urls) {
  try {
    await F.setDoc(F.doc(db, 'site', 'pins'), { urls, updatedAt: Date.now() });
    remote = urls; local = null; writeLocal(null);
  } catch (e) {
    local = urls; writeLocal(urls);
    toast(e && e.code === 'permission-denied'
      ? '서버 규칙을 아직 게시하지 않아서 이 브라우저에만 고정됐어요. 콘솔에서 firestore.rules 의 사이트 규칙을 게시해 주세요.'
      : '서버에 저장하지 못해 이 브라우저에만 고정했어요 (' + ((e && e.code) || 'error') + ')', 7000);
  }
  paint();
}
function toggle(url) {
  const cur = effective().slice(), i = cur.indexOf(url);
  if (i >= 0) cur.splice(i, 1); else cur.unshift(url); // 새로 고정하면 맨 위로
  save(cur);
}

if (enabled) {
  try {
    F.onSnapshot(F.doc(db, 'site', 'pins'),
      snap => { remote = snap.exists() ? (Array.isArray(snap.data().urls) ? snap.data().urls : []) : []; paint(); },
      () => { remote = null; paint(); });
  } catch (e) { console.warn('pins', e); }
  onUser(s => {
    const was = admin; admin = !!s.admin;
    // 규칙 게시 전에 이 브라우저에만 고정해 둔 목록이 있으면, 이제 서버로 올려 봐요
    if (admin && local && !was) F.setDoc(F.doc(db, 'site', 'pins'), { urls: local, updatedAt: Date.now() }).then(() => { remote = local; local = null; writeLocal(null); paint(); }, () => {});
    paint();
  });
}

// 메인 메뉴 계정 영역: 게스트 표시 · 구글 로그인/로그아웃 · 저장 상태.
import { esc } from '../utils/dom.js';

export function renderAccount(box, game) {
  const a = game.auth, save = game.save;
  const status = { local: '이 브라우저에 저장', loading: '불러오는 중…', synced: '계정에 저장됨', saving: '저장 중…', error: '저장 실패 — 다시 시도해요' }[save.status] || '';
  if (!a || !a.enabled) {
    box.innerHTML = `<div class="acc"><div class="acc-who"><span class="acc-dot guest"></span><b>GUEST</b><span class="acc-st">${esc(status)}</span></div>
      <div class="acc-note">온라인 저장이 아직 설정되지 않았어요. 진행은 이 브라우저에 저장돼요.</div></div>`;
    return;
  }
  if (a.state === 'in') {
    box.innerHTML = `<div class="acc"><div class="acc-who">${a.user.photo ? `<img src="${esc(a.user.photo)}" alt="" referrerpolicy="no-referrer">` : '<span class="acc-dot"></span>'}
      <b>${esc(a.user.name || 'AGENT')}</b>${a.isAdmin ? '<span class="acc-admin">ADMIN</span>' : ''}<span class="acc-st">${esc(status)}</span></div>
      <button class="btn small" data-a="logout">LOGOUT</button></div>`;
    box.querySelector('[data-a=logout]').onclick = () => a.signOut();
  } else {
    box.innerHTML = `<div class="acc"><div class="acc-who"><span class="acc-dot guest"></span><b>GUEST</b><span class="acc-st">${a.state === 'pending' ? '로그인 중…' : esc(status)}</span></div>
      <button class="btn small primary" data-a="login" ${a.state === 'pending' ? 'disabled' : ''}>GOOGLE LOGIN</button>
      ${a.error ? `<div class="acc-err">${esc(a.error)}</div>` : '<div class="acc-note">로그인하면 기록·설정·로그가 계정에 저장돼요. 지금까지의 게스트 진행도 옮겨져요.</div>'}</div>`;
    box.querySelector('[data-a=login]').onclick = () => a.signIn();
  }
}

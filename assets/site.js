// 공통: 머리말, 작품 카드
const BASE = /\/notes\//.test(location.pathname) ? '../' : '';
// 노트 탭은 관리자로 로그인한 적 있는 브라우저에만 보여요 (실제 내용은 Firebase 규칙으로 잠겨 있음)
const OWNER = (() => { try { return localStorage.getItem('owner') === '1'; } catch (e) { return false; } })();
function header(active){
  document.body.insertAdjacentHTML('afterbegin', `<div class="wrap"><header><a class="logo" href="${BASE || './'}">09jun<span>4</span></a>
    <nav><a href="${BASE || './'}" class="${active === 'works' ? 'on' : ''}">works</a>${OWNER || active === 'notes' ? `<a href="${BASE}notes/" class="${active === 'notes' ? 'on' : ''}">notes</a>` : ''}</nav></header></div>`);
  document.body.insertAdjacentHTML('beforeend', '<div class="wrap"><footer>© ' + new Date().getFullYear() + ' 09jun4</footer></div>');
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
const workCard = w => `<a class="wcard" href="${esc(w.url)}">${w.thumb ? `<div class="img" style="background-image:url('${esc(BASE + w.thumb)}')" role="img" aria-label="${esc(w.title)} 화면"></div>` : '<div class="img none">no image</div>'}
  <div class="body"><div class="t">${esc(w.title)}</div>${w.desc ? `<div class="d">${esc(w.desc)}</div>` : ''}<span class="play">실행하기 →</span></div></a>`;

// 공통: 머리말, 작품 카드
const BASE = /\/(notes|feedback)\//.test(location.pathname) ? '../' : '';
function header(active){
  document.body.insertAdjacentHTML('afterbegin', `<div class="wrap"><header><a class="logo" href="${BASE || './'}">09jun<span>4</span></a>
    <nav><a href="${BASE || './'}" class="${active === 'works' ? 'on' : ''}">works</a><a href="${BASE}feedback/" data-nav="feedback" class="${active === 'feedback' ? 'on' : ''}">feedback</a>
    <a href="${BASE}notes/" data-nav="notes" class="${active === 'notes' ? 'on' : ''}">notes</a><span class="acct" id="acct"></span></nav></header></div>`);
  document.body.insertAdjacentHTML('beforeend', '<div class="wrap"><footer>© ' + new Date().getFullYear() + ' 09jun4</footer></div>');
  // 구글 로그인 (js/auth.js): 사이트에 로그인하면 작품을 열 때도 로그인돼 있어요
  const s = document.createElement('script'); s.type = 'module'; s.src = BASE + 'js/auth.js'; document.head.appendChild(s);
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
const workCard = w => `<a class="wcard" href="${esc(w.url)}">${w.thumb ? `<div class="img" style="background-image:url('${esc(BASE + w.thumb)}')" role="img" aria-label="${esc(w.title)} 화면"></div>` : '<div class="img none">no image</div>'}
  <div class="body"><div class="t">${esc(w.title)}</div>${w.desc ? `<div class="d">${esc(w.desc)}</div>` : ''}<span class="play">실행하기 →</span></div></a>`;

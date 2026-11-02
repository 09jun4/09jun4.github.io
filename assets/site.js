// 공통: 머리말, 바닥글, 작품 카드
const BASE = /\/(notes|feedback)\//.test(location.pathname) ? '../' : '';
const ARROW = '<svg class="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pad = n => String(n).padStart(2, '0');

function header(active){
  document.body.insertAdjacentHTML('afterbegin', `<a class="skip" href="#main">본문으로</a>
  <header class="site-head"><div class="shell head-inner">
    <a class="brand" href="${BASE || './'}">09jun<span>4</span></a>
    <nav class="nav" aria-label="주요 메뉴">
      <a href="${BASE || './'}" class="${active === 'works' ? 'on' : ''}">works</a>
      <a href="${BASE}notes/" data-nav="notes" class="${active === 'notes' ? 'on' : ''}">notes</a>
      <a href="${BASE}feedback/" data-nav="feedback" class="${active === 'feedback' ? 'on' : ''}">feedback</a>
      <span class="acct" id="acct"></span>
    </nav>
  </div></header>`);
  const footLink = active === 'feedback'
    ? `<a href="${BASE}notes/">notes</a>`
    : `<a href="${BASE}feedback/">feedback</a>`;
  document.body.insertAdjacentHTML('beforeend', `<footer class="site-foot"><div class="shell foot-inner">
    <span>© ${new Date().getFullYear()} 09jun4</span>
    <span class="foot-links"><a href="https://github.com/09jun4/09jun4.github.io">github</a>${footLink}</span>
  </div></footer>`);
  // 구글 로그인 (js/auth.js): 사이트에 로그인하면 작품을 열 때도 로그인돼 있어요
  const s = document.createElement('script'); s.type = 'module'; s.src = BASE + 'js/auth.js'; document.head.appendChild(s);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

const workCard = (w, i = 0) => `<a class="card" href="${esc(w.url)}">
  <div class="thumb">${w.thumb
    ? `<img src="${esc(BASE + w.thumb)}" alt="${esc(w.title)} 화면" width="1200" height="900" loading="lazy">`
    : '<span class="none">no image</span>'}<span class="idx">${pad(i + 1)}</span></div>
  <div class="card-body">
    <div class="title-row"><h3>${esc(w.title)}</h3>${ARROW}</div>
    ${w.desc ? `<p class="desc">${esc(w.desc)}</p>` : ''}
    <div class="card-foot"><span>${esc(w.date || '')}</span><span class="open">open</span></div>
  </div>
</a>`;

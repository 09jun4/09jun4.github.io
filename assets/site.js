// 공통: 머리말, 바닥글, 작품 카드
const BASE = /\/(notes|feedback|map)\//.test(location.pathname) ? '../' : '';
const ARROW = '<svg class="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pad = n => String(n).padStart(2, '0');

function header(active){
  document.body.insertAdjacentHTML('afterbegin', `<a class="skip" href="#main">본문으로</a>
  <header class="site-head"><div class="shell head-inner">
    <a class="brand" href="${BASE || './'}">09jun<span>4</span></a>
    <nav class="nav" aria-label="주요 메뉴">
      <a href="${BASE || './'}" class="${active === 'works' ? 'on' : ''}">works</a>
      <a href="${BASE}notes/" data-nav="notes" class="${active === 'notes' ? 'on' : ''}">notes</a>
      <a href="${BASE}map/" class="${active === 'map' ? 'on' : ''}">map</a>
      <a href="${BASE}feedback/" data-nav="feedback" class="${active === 'feedback' ? 'on' : ''}">feedback</a>
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="다크 모드로 바꾸기" title="다크 모드"><svg class="i-moon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><svg class="i-sun" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
      <span class="acct" id="acct"></span>
    </nav>
  </div></header>`);
  const footLink = active === 'feedback'
    ? `<a href="${BASE}notes/">notes</a>`
    : `<a href="${BASE}feedback/">feedback</a>`;
  document.body.insertAdjacentHTML('beforeend', `<footer class="site-foot"><div class="shell foot-inner">
    <span>© ${new Date().getFullYear()} 09jun4</span>
    <span class="foot-stats" aria-label="방문자 수" title="한국 시간 기준"><span>오늘 <b data-visitors="today">—</b></span><span class="sep">·</span><span>누적 <b data-visitors="total">—</b></span></span>
    <span class="foot-links"><a href="https://github.com/09jun4/09jun4.github.io">github</a>${footLink}</span>
  </div></footer>`);
  // 라이트/다크 전환 (선택은 localStorage 'theme' 에 저장, 각 페이지 머리에서 먼저 적용해 깜빡임 없음)
  const tg = document.getElementById('themeToggle'), root = document.documentElement;
  const paintToggle = () => { const d = root.dataset.theme === 'dark'; tg.setAttribute('aria-label', d ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'); tg.title = d ? '라이트 모드' : '다크 모드'; };
  paintToggle();
  tg.addEventListener('click', () => {
    const d = root.dataset.theme !== 'dark';
    root.classList.add('theme-anim'); if (d) root.dataset.theme = 'dark'; else delete root.dataset.theme;
    try { localStorage.setItem('theme', d ? 'dark' : 'light'); } catch (e) {}
    paintToggle(); setTimeout(() => root.classList.remove('theme-anim'), 500);
  });
  // 구글 로그인 (js/auth.js): 사이트에 로그인하면 작품을 열 때도 로그인돼 있어요
  const s = document.createElement('script'); s.type = 'module'; s.src = BASE + 'js/auth.js'; document.head.appendChild(s);
  // 방문자 수 (js/visitors.js): 하루 한 번 오늘·누적을 세고, 주인 계정은 제외해요
  const v = document.createElement('script'); v.type = 'module'; v.src = BASE + 'js/visitors.js'; document.head.appendChild(v);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

const workCard = (w, i = 0, pinned = false) => `<a class="card${pinned ? ' pinned' : ''}" href="${esc(w.url)}">
  <div class="thumb">${w.thumb
    ? `<img src="${esc(BASE + w.thumb)}" alt="${esc(w.title)} 화면" width="1200" height="900" loading="lazy">`
    : '<span class="none">no image</span>'}<span class="idx">${pad(i + 1)}</span>${pinned ? '<span class="pin-flag">고정</span>' : ''}</div>
  <div class="card-body">
    <div class="title-row"><h3>${esc(w.title)}</h3>${ARROW}</div>
    ${w.desc ? `<p class="desc">${esc(w.desc)}</p>` : ''}
    <div class="card-foot"><span>${esc(w.date || '')}</span><span class="open">open</span></div>
  </div>
</a>`;

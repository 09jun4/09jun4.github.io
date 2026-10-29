// 공통: 머리말, 목록 한 줄 그리기
const BASE = /\/(notes|works)\//.test(location.pathname) ? '../' : '';
function header(active){
  document.body.insertAdjacentHTML('afterbegin', `<div class="wrap"><header><a class="logo" href="${BASE || './'}">09jun<span>4</span></a>
    <nav><a href="${BASE}works/" class="${active === 'works' ? 'on' : ''}">works</a><a href="${BASE}notes/" class="${active === 'notes' ? 'on' : ''}">notes</a></nav></header></div>`);
  document.body.insertAdjacentHTML('beforeend', '<div class="wrap"><footer>© ' + new Date().getFullYear() + ' 09jun4</footer></div>');
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
const row = (href, x) => `<li><a href="${esc(href)}"><span class="t">${esc(x.title)}${x.desc ? `<span class="d">${esc(x.desc)}</span>` : ''}</span><span class="date">${esc(x.date || '')}</span></a></li>`;
const workRow = w => row(w.url, w);
const noteRow = n => row(BASE + 'notes/view.html?id=' + encodeURIComponent(n.id), n);
function fill(id, items, fn, emptyText){ document.getElementById(id).innerHTML = items.map(fn).join('') || `<li class="empty">${emptyText}</li>`; }

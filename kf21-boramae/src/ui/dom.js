// DOM 도우미.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML 문자열로 요소 하나를 만든다. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const fmtTime = (sec) => {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
export const fmtScore = (n) => Math.round(n).toLocaleString('en-US');

/** 조작 키 안내 목록 HTML */
export function controlsHtml(controls) {
  return controls.map((c) => `<li>${c.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}<span>${esc(c.text)}</span></li>`).join('');
}

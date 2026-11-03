// 사이트 바닥글 방문자 수 — 한국 시간 기준 오늘 · 누적.
// Firebase 로그인 계정이 사이트 주인이면 집계에서 제외해요.
// 카운터는 키 발급 없이 쓸 수 있는 Abacus(https://jasoncameron.dev/abacus/)를 써요.
const API = 'https://abacus.jasoncameron.dev';
const NS = '09jun4.github.io';
const TOTAL_KEY = 'site-total';
const DAY_STORE = '09jun4:visit-day';
const OWNER_STORE = '09jun4:visit-owner';

const todayEl = document.querySelector('[data-visitors="today"]');
const totalEl = document.querySelector('[data-visitors="total"]');
let renderVersion = 0;
let recording = false;

const store = {
  get(key){ try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value){ try { localStorage.setItem(key, value); } catch (e) {} },
};

function kstDay(){
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const v = {};
    for (const part of parts) v[part.type] = part.value;
    return `${v.year}-${v.month}-${v.day}`;
  } catch (e) {
    const d = new Date();
    const n = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}`;
  }
}
const dayKey = day => `site-${day}`;
const fmt = n => Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—';

function paint(today, total){
  if (todayEl) todayEl.textContent = fmt(today);
  if (totalEl) totalEl.textContent = fmt(total);
}

async function read(key){
  const res = await fetch(`${API}/get/${NS}/${key}`, { cache: 'no-store' });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`Abacus ${res.status}`);
  const data = await res.json();
  return Number(data.value) || 0;
}

async function hit(key){
  const res = await fetch(`${API}/hit/${NS}/${key}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Abacus ${res.status}`);
  const data = await res.json();
  return Number(data.value) || 0;
}

async function refresh(){
  const version = ++renderVersion;
  const day = kstDay();
  try {
    const [today, total] = await Promise.all([read(dayKey(day)), read(TOTAL_KEY)]);
    if (version === renderVersion) paint(today, total);
  } catch (e) {
    console.warn('[visitors] count read failed', e);
  }
}

async function record(){
  if (recording || store.get(OWNER_STORE) === '1') return;
  const day = kstDay();
  if (store.get(DAY_STORE) === day) return;
  recording = true;
  try {
    const [today, total] = await Promise.all([hit(dayKey(day)), hit(TOTAL_KEY)]);
    store.set(DAY_STORE, day);
    renderVersion++;
    paint(today, total);
  } catch (e) {
    console.warn('[visitors] count write failed', e);
    refresh();
  } finally {
    recording = false;
  }
}

refresh();

if (store.get(OWNER_STORE) === '1') {
  // 사이트 주인 브라우저: 이미 제외 표시가 있으면 더 세지 않아요.
} else {
  let decided = false;
  const decide = state => {
    if (decided) return;
    decided = true;
    if (state && state.admin) {
      store.set(OWNER_STORE, '1');
      return;
    }
    record();
  };
  import('./auth.js')
    .then(({ onUser }) => onUser(state => { if (state.ready) decide(state); }))
    .catch(() => decide(null));
  // 로그인 확인이 오래 걸려도 방문 기록이 사라지지 않게 하는 안전장치.
  setTimeout(() => decide(null), 10000);
}

// SaveSystem — 진행 저장. 로그인 전에는 브라우저(localStorage) 게스트 칸에 저장하고,
// 로그인하면 계정(Firestore)에 저장해요. 첫 로그인 때 게스트 진행을 계정으로 옮기고 게스트 칸은 비워요.
// 로그아웃하면 다시 게스트 칸을 써요.
const GUEST_KEY = 'sunho-journey-save-v1';

function blank() {
  return { v: 1, unlocked: 1, chapters: {}, totals: { plays: 0, clears: 0, falls: 0, poop: 0, distance: 0 }, settings: {} };
}

function readGuest() {
  try { const s = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); return s && s.v === 1 ? s : blank(); } catch { return blank(); }
}
function writeGuest(data) { try { localStorage.setItem(GUEST_KEY, JSON.stringify(data)); } catch { /* 저장 불가(사생활 보호 모드 등) */ } }

// 두 저장을 합치기: 챕터별 최고 기록·해금 단계는 큰 쪽, 누적값은 더하기
export function mergeSaves(a, b) {
  const out = blank();
  out.unlocked = Math.max(a.unlocked || 1, b.unlocked || 1);
  for (const src of [a, b]) for (const [id, c] of Object.entries(src.chapters || {})) {
    const cur = out.chapters[id];
    if (!cur) { out.chapters[id] = { ...c }; continue; }
    const best = (c.best || 0) > (cur.best || 0) ? c : cur;
    out.chapters[id] = { ...best, plays: (cur.plays || 0) + (c.plays || 0), clears: (cur.clears || 0) + (c.clears || 0) };
  }
  for (const k of Object.keys(out.totals)) out.totals[k] = (a.totals?.[k] || 0) + (b.totals?.[k] || 0);
  out.settings = { ...(a.settings || {}), ...(b.settings || {}) };
  return out;
}

export class SaveSystem {
  constructor() {
    this.data = readGuest();
    this.uid = null;
    this.remote = null; // {set(data)}
    this.status = 'local'; // local | loading | synced | error
    this.listeners = [];
  }
  onChange(fn) { this.listeners.push(fn); }
  _changed() { this.listeners.forEach((f) => f(this)); }

  save() {
    if (this.uid && this.remote) {
      this.status = 'saving';
      this.remote.set(this.data).then(() => { this.status = 'synced'; this._changed(); }, (e) => { console.error('[save]', e); this.status = 'error'; this._changed(); });
    } else writeGuest(this.data);
    this._changed();
  }

  // 로그인: remoteData가 없으면(첫 로그인) 게스트 진행을 옮기고, 있으면 게스트 진행과 합쳐요. 게스트 칸은 비움.
  attachAccount(uid, remoteData, remote) {
    const guest = readGuest();
    const hasGuest = guest.totals.plays > 0;
    this.uid = uid;
    this.remote = remote;
    this.data = remoteData ? (hasGuest ? mergeSaves(remoteData, guest) : remoteData) : guest;
    if (hasGuest || !remoteData) { writeGuest(blank()); this.save(); }
    this.status = 'synced';
    this._changed();
  }
  detachAccount() {
    this.uid = null;
    this.remote = null;
    this.data = readGuest();
    this.status = 'local';
    this._changed();
  }

  chapter(id) { return this.data.chapters[id] || null; }

  // 결과 기록 → {newBest}
  record(ch, res, stats) {
    const d = this.data;
    const cur = d.chapters[ch.id] || { best: 0, grade: null, time: null, plays: 0, clears: 0 };
    cur.plays++;
    cur.clears++;
    const newBest = res.score > (cur.best || 0);
    if (newBest) { cur.best = res.score; cur.grade = res.grade; cur.time = Math.round(stats.time * 10) / 10; }
    d.chapters[ch.id] = cur;
    d.unlocked = Math.max(d.unlocked, ch.no + 1);
    d.totals.plays++; d.totals.clears++;
    d.totals.falls += stats.falls; d.totals.poop += stats.poop;
    d.totals.distance += Math.round(stats.distance);
    this.save();
    return { newBest, record: cur };
  }
}

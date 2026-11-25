// 저장: 진행 기록은 브라우저(localStorage)에, 로그인하면 계정(Firestore)에도.
// 손상 대비: 쓰기 전 이전 값을 백업 칸에 두고, 읽다 실패하면 백업을 써요. 버전 필드로 이후 형식 변경에 대비해요.
export const SAVE_VERSION = 1;
const GUEST = 'fold:guest', SETTINGS = 'fold:settings';

export function newSave() { return { v: SAVE_VERSION, cleared: {}, resume: null, updated: 0 }; }

// 외부(저장소·서버)에서 들어온 값 검증
export function fixSave(s) {
  const out = newSave();
  if (!s || typeof s !== 'object') return out;
  if (s.cleared && typeof s.cleared === 'object') {
    for (const [id, r] of Object.entries(s.cleared)) {
      if (typeof id !== 'string' || id.length > 16 || !r || typeof r !== 'object') continue;
      out.cleared[id] = { best: Math.max(0, Math.min(999, r.best | 0)), at: Number(r.at) || 0 };
    }
  }
  if (s.resume && typeof s.resume === 'object' && typeof s.resume.stage === 'string' && s.resume.state && typeof s.resume.state === 'object')
    out.resume = { stage: s.resume.stage, state: s.resume.state, at: Number(s.resume.at) || 0 };
  out.updated = Number(s.updated) || 0;
  return out;
}

function read(key) {
  for (const k of [key, key + ':bak']) {
    try { const raw = localStorage.getItem(k); if (raw) return fixSave(JSON.parse(raw)); } catch (e) { /* 손상 → 백업 시도 */ }
  }
  return null;
}
function write(key, data) {
  try {
    const prev = localStorage.getItem(key);
    if (prev) localStorage.setItem(key + ':bak', prev);
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export class Save {
  constructor() {
    this.uid = null; this.writer = null; this.status = 'local'; this.dirty = false;
    this.data = read(GUEST) || newSave();
    this.listeners = [];
  }
  key() { return this.uid ? 'fold:u:' + this.uid : GUEST; }
  onChange(f) { this.listeners.push(f); }
  emit() { this.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
  persist() {
    this.data.updated = Date.now();
    const ok = write(this.key(), this.data);
    if (this.writer) { this.dirty = true; this.flush(); }
    return ok;
  }
  flush() {
    if (!this.writer || !this.dirty || this.flushing) return;
    this.dirty = false; this.flushing = true;
    this.writer.set(this.data).then(() => { this.status = 'synced'; }, e => {
      console.error('[FOLD] 계정 저장 실패', e); this.dirty = true; this.status = 'error';
    }).finally(() => { this.flushing = false; this.emit(); });
  }
  clear(stageId, folds) {
    const r = this.data.cleared[stageId];
    this.data.cleared[stageId] = { best: r ? Math.min(r.best, folds) : folds, at: Date.now() };
    if (this.data.resume && this.data.resume.stage === stageId) this.data.resume = null;
    this.persist(); this.emit();
  }
  setResume(stageId, state) { this.data.resume = stageId ? { stage: stageId, state, at: Date.now() } : null; return this.persist(); }

  // 로그인: 계정 기록이 있으면 그것을, 없으면 게스트 진행을 계정으로 옮기고 게스트 칸을 비워요
  attach(uid, remote, writer) {
    this.uid = uid; this.writer = writer;
    const local = read('fold:u:' + uid);
    if (remote) this.data = merge(fixSave(remote), local);
    else {
      const guest = read(GUEST) || newSave();
      this.data = merge(guest, local);
      try { localStorage.removeItem(GUEST); localStorage.removeItem(GUEST + ':bak'); } catch (e) { /* 무시 */ }
    }
    this.status = 'synced';
    this.persist(); this.emit();
  }
  detach() {
    this.uid = null; this.writer = null; this.status = 'local';
    this.data = read(GUEST) || newSave();
    this.emit();
  }

  static loadSettings(defaults) {
    try { const s = JSON.parse(localStorage.getItem(SETTINGS) || '{}'); return { ...defaults, ...sanitize(s, defaults) }; } catch (e) { return { ...defaults }; }
  }
  static saveSettings(s) { try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch (e) { /* 저장 불가 환경 */ } }
}

// 두 기록 합치기: 각 스테이지 최고 기록을 살려요 (기록을 잃지 않게)
function merge(a, b) {
  if (!b) return a;
  const out = fixSave(a);
  for (const [id, r] of Object.entries(b.cleared)) {
    const o = out.cleared[id];
    out.cleared[id] = o ? { best: Math.min(o.best, r.best), at: Math.max(o.at, r.at) } : r;
  }
  if (!out.resume && b.resume) out.resume = b.resume;
  return out;
}
function sanitize(s, d) {
  const o = {};
  for (const k of Object.keys(d)) {
    if (typeof d[k] === 'number' && typeof s[k] === 'number' && isFinite(s[k])) o[k] = Math.max(0, Math.min(1, s[k]));
    if (typeof d[k] === 'string' && typeof s[k] === 'string' && s[k].length < 20) o[k] = s[k];
    if (typeof d[k] === 'boolean' && typeof s[k] === 'boolean') o[k] = s[k];
  }
  return o;
}

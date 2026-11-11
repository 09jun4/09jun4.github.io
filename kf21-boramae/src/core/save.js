// 캠페인 진행도 저장. 설정과는 별도 키로 관리한다.
// - 게스트: localStorage `kf21.progress.guest`
// - 로그인: 계정 저장(Firestore)이 원본이고, localStorage `kf21.progress.<uid>` 는 오프라인 대비 사본
// - 첫 로그인 때 게스트 진행을 계정으로 옮긴다(충돌 시 더 진행된 쪽). 로그아웃하면 게스트 상태로 돌아간다.
import { SAVE_VERSION, STORAGE_PREFIX } from '../data/app.js';
import { MISSIONS } from '../data/missions.js';
import { betterGrade } from './scoring.js';
import { GRADE_ORDER } from '../data/grades.js';

const key = (slot) => `${STORAGE_PREFIX}.progress.${slot}`;

export function emptyProgress() {
  return { v: SAVE_VERSION, missions: {}, updatedAt: 0 };
}

/** 어떤 형태로 저장돼 있든 현재 형식으로 맞춘다(버전이 올라가면 여기서 변환). */
export function normalizeProgress(raw) {
  const p = emptyProgress();
  if (!raw || typeof raw !== 'object') return p;
  const src = raw.missions && typeof raw.missions === 'object' ? raw.missions : {};
  for (const m of MISSIONS) {
    const r = src[m.id];
    if (!r || typeof r !== 'object') continue;
    const bestScore = Number.isFinite(r.bestScore) ? Math.max(0, Math.round(r.bestScore)) : 0;
    const grade = GRADE_ORDER.includes(r.grade) ? r.grade : null;
    const bestTime = Number.isFinite(r.bestTime) && r.bestTime > 0 ? r.bestTime : 0;
    const clears = Number.isInteger(r.clears) && r.clears > 0 ? r.clears : grade ? 1 : 0;
    if (clears > 0 || bestScore > 0) p.missions[m.id] = { bestScore, grade, bestTime, clears };
  }
  p.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  return p;
}

export function clearedCount(p) {
  let n = 0;
  for (const m of MISSIONS) if (p.missions[m.id] && p.missions[m.id].clears > 0) n++;
  return n;
}

export function totalScore(p) {
  let n = 0;
  for (const m of MISSIONS) if (p.missions[m.id]) n += p.missions[m.id].bestScore;
  return n;
}

export const hasProgress = (p) => clearedCount(p) > 0 || totalScore(p) > 0;

/** 둘 중 더 진행된 쪽을 고른다: 클리어한 미션 수 → 최고 점수 합 → 최근 저장 순. */
export function moreProgressed(a, b) {
  const ca = clearedCount(a), cb = clearedCount(b);
  if (ca !== cb) return ca > cb ? a : b;
  const sa = totalScore(a), sb = totalScore(b);
  if (sa !== sb) return sa > sb ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export class SaveData {
  /** @param {Storage|null} storage */
  constructor(storage) {
    this.storage = storage;
    this.uid = null;
    this.writer = null; // 계정 저장 함수(progress) => Promise
    this.listeners = [];
    this.progress = this._read('guest');
    this.syncError = false;
  }

  _read(slot) {
    try { return normalizeProgress(JSON.parse(this.storage ? this.storage.getItem(key(slot)) : 'null')); } catch (e) { return emptyProgress(); }
  }

  _write(slot, p) {
    try { if (this.storage) this.storage.setItem(key(slot), JSON.stringify(p)); } catch (e) { /* 무시 */ }
  }

  _remove(slot) {
    try { if (this.storage) this.storage.removeItem(key(slot)); } catch (e) { /* 무시 */ }
  }

  _emit() {
    for (const fn of this.listeners) fn(this.progress);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  _persist() {
    this.progress.updatedAt = Date.now();
    this._write(this.uid || 'guest', this.progress);
    if (this.uid && this.writer) {
      this.writer(this.progress).then(() => { this.syncError = false; }, (e) => { this.syncError = true; console.warn('[KF21] 계정 저장 실패', e); });
    }
  }

  record(missionId) {
    return this.progress.missions[missionId] || null;
  }

  /** 미션은 순서대로 열린다: 첫 미션은 항상, 나머지는 앞 미션을 클리어해야 */
  isUnlocked(missionId) {
    const i = MISSIONS.findIndex((m) => m.id === missionId);
    if (i <= 0) return i === 0;
    const prev = this.progress.missions[MISSIONS[i - 1].id];
    return !!prev && prev.clears > 0;
  }

  /**
   * 미션 결과 반영. 성공했을 때만 기록이 남는다.
   * @returns {{newBest:boolean, firstClear:boolean}}
   */
  applyResult(result) {
    if (!result.success) return { newBest: false, firstClear: false };
    const cur = this.progress.missions[result.missionId] || { bestScore: 0, grade: null, bestTime: 0, clears: 0 };
    const firstClear = cur.clears === 0;
    const newBest = result.score > cur.bestScore;
    this.progress.missions[result.missionId] = {
      bestScore: Math.max(cur.bestScore, result.score),
      grade: betterGrade(cur.grade, result.grade),
      bestTime: cur.bestTime > 0 ? Math.min(cur.bestTime, result.time) : result.time,
      clears: cur.clears + 1,
    };
    this._persist();
    this._emit();
    return { newBest, firstClear };
  }

  /**
   * 로그인: 계정 저장과 연결한다.
   * @param {string} uid
   * @param {object|null} remote 계정에 저장돼 있던 진행도(없으면 null)
   * @param {(p:object)=>Promise} writer
   * @returns {'remote'|'guest'|'local'} 어느 쪽 진행도를 쓰게 됐는지
   */
  attachAccount(uid, remote, writer) {
    const guest = this._read('guest');
    const cached = this._read(uid);
    // 계정 쪽 후보: 서버 값과 이 기기에 남아 있던 사본 중 더 진행된 것(오프라인에서 깬 기록 보호)
    let account = remote ? normalizeProgress(remote) : emptyProgress();
    let source = 'remote';
    if (moreProgressed(cached, account) === cached && hasProgress(cached) && cached !== account) {
      if (clearedCount(cached) !== clearedCount(account) || totalScore(cached) !== totalScore(account)) { account = cached; source = 'local'; }
    }
    let chosen = account;
    if (hasProgress(guest)) {
      chosen = moreProgressed(guest, account);
      if (chosen === guest) source = 'guest';
      this._remove('guest'); // 게스트 칸은 비운다(계정으로 옮김)
    }
    this.uid = uid;
    this.writer = writer;
    this.progress = normalizeProgress(chosen);
    this._write(uid, this.progress);
    if (source !== 'remote') this._persist();
    this._emit();
    return source;
  }

  /** 로그아웃: 게스트 상태로 돌아간다. */
  detachAccount() {
    this.uid = null;
    this.writer = null;
    this.syncError = false;
    this.progress = this._read('guest');
    this._emit();
  }
}

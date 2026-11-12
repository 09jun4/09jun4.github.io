// 랭킹(Firestore). 누구나 읽고, 본인 기록만 쓴다.
//   미션별        rankings/{missionId}/entries/{uid}  { uid, name, score, time, at }
//   캠페인별·전체 rankTotals/{scope}/entries/{uid}    { uid, name, score, missions, at }   scope = 'c1'~'c5' | 'overall'
// 점수는 클라이언트가 올리는 구조라 완전한 부정 방지는 불가능하다. 규칙의 타입·범위 검증과 관리자 삭제로 대응한다.
import { RANKING } from '../data/online.js';

export const isTotalScope = (scope) => scope === 'overall' || /^c\d+$/.test(scope);

export class Ranking {
  constructor(sdk, db) {
    this.sdk = sdk;
    this.db = db;
    this.cache = new Map();
  }

  _path(scope) {
    return isTotalScope(scope) ? ['rankTotals', scope, 'entries'] : ['rankings', scope, 'entries'];
  }

  col(scope) {
    return this.sdk.collection(this.db, ...this._path(scope));
  }

  ref(scope, uid) {
    return this.sdk.doc(this.db, ...this._path(scope), uid);
  }

  /**
   * 내 기록 올리기. 이미 올라간 점수보다 높을 때(또는 이름이 바뀌었을 때)만 쓴다.
   * @param {string} scope 미션 ID, 캠페인 ID 또는 'overall'
   * @param {number} extra 미션이면 클리어 시간(초), 합산이면 클리어한 미션 수
   * @returns {Promise<'written'|'kept'|'skipped'>}
   */
  async submit(scope, uid, name, score, extra) {
    const total = isTotalScope(scope);
    if (!(score > 0) || (!total && !(extra >= RANKING.minTime))) return 'skipped';
    const ref = this.ref(scope, uid);
    const snap = await this.sdk.getDoc(ref);
    const cur = snap.exists() ? snap.data() : null;
    if (cur && cur.score >= score && cur.name === name) return 'kept';
    const keep = cur && cur.score >= score;
    const data = { uid, name, score: keep ? cur.score : Math.round(score), at: this.sdk.serverTimestamp() };
    if (total) data.missions = keep ? cur.missions : Math.round(extra); else data.time = keep ? cur.time : Math.round(extra * 10) / 10;
    await this.sdk.setDoc(ref, data);
    this.cache.delete(scope);
    return 'written';
  }

  /** 상위 기록 @returns {Promise<Array<{uid,name,score,time?,missions?}>>} */
  async top(scope, force = false) {
    const c = this.cache.get(scope);
    if (c && !force && Date.now() - c.at < RANKING.cacheMs) return c.rows;
    const { sdk } = this;
    const snap = await sdk.getDocs(sdk.query(this.col(scope), sdk.orderBy('score', 'desc'), sdk.limit(RANKING.top)));
    const rows = [];
    snap.forEach((d) => rows.push(d.data()));
    rows.sort((a, b) => b.score - a.score || (a.time || 0) - (b.time || 0));
    this.cache.set(scope, { at: Date.now(), rows });
    return rows;
  }

  /** 기록 삭제(본인 또는 관리자: 부정 기록 정리) */
  async remove(scope, uid) {
    await this.sdk.deleteDoc(this.ref(scope, uid));
    this.cache.delete(scope);
  }
}

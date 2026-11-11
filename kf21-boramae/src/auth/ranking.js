// 미션별 랭킹(Firestore rankings/{missionId}/scores/{uid}): 누구나 읽고, 본인 최고 기록만 쓴다.
//   { uid, name, score, time, at }
// 점수는 클라이언트가 올리는 구조라 완전한 부정 방지는 불가능하다. 규칙의 범위·점수식 검증과 관리자 삭제로 대응한다.
import { RANKING } from '../data/online.js';

export class Ranking {
  constructor(sdk, db) {
    this.sdk = sdk;
    this.db = db;
    this.cache = new Map();
  }

  col(missionId) {
    return this.sdk.collection(this.db, 'rankings', missionId, 'scores');
  }

  ref(missionId, uid) {
    return this.sdk.doc(this.db, 'rankings', missionId, 'scores', uid);
  }

  /**
   * 내 기록 올리기. 이미 올라간 점수보다 높을 때(또는 이름이 바뀌었을 때)만 쓴다.
   * @returns {Promise<'written'|'kept'|'skipped'>}
   */
  async submit(missionId, uid, name, score, time) {
    if (!(score > 0) || !(time >= RANKING.minTime)) return 'skipped';
    const ref = this.ref(missionId, uid);
    const snap = await this.sdk.getDoc(ref);
    const cur = snap.exists() ? snap.data() : null;
    if (cur && cur.score >= score && cur.name === name) return 'kept';
    const best = cur && cur.score >= score ? { score: cur.score, time: cur.time } : { score: Math.round(score), time: Math.round(time * 10) / 10 };
    await this.sdk.setDoc(ref, { uid, name, score: best.score, time: best.time, at: this.sdk.serverTimestamp() });
    this.cache.delete(missionId);
    return 'written';
  }

  /** 상위 기록 @returns {Promise<Array<{uid,name,score,time}>>} */
  async top(missionId, force = false) {
    const c = this.cache.get(missionId);
    if (c && !force && Date.now() - c.at < RANKING.cacheMs) return c.rows;
    const { sdk } = this;
    const snap = await sdk.getDocs(sdk.query(this.col(missionId), sdk.orderBy('score', 'desc'), sdk.limit(RANKING.top)));
    const rows = [];
    snap.forEach((d) => rows.push(d.data()));
    rows.sort((a, b) => b.score - a.score || a.time - b.time);
    this.cache.set(missionId, { at: Date.now(), rows });
    return rows;
  }

  /** 기록 삭제(본인 또는 관리자: 부정 기록 정리) */
  async remove(missionId, uid) {
    await this.sdk.deleteDoc(this.ref(missionId, uid));
    this.cache.delete(missionId);
  }
}

// 계정 저장(Firestore users/{uid}): 진행도·설정·닉네임. 본인만 읽고 쓴다(firestore.rules).
//   users/{uid}      { progress: JSON 문자열, settings: JSON 문자열, nickname, nickKey, updatedAt }
//   nicknames/{key}  { uid }   ← 닉네임 중복 방지용(누구나 읽기, 본인 것만 만들고 지움)
import { checkNickname } from './nickname-rules.js';

export class CloudSave {
  constructor(sdk, db) {
    this.sdk = sdk;
    this.db = db;
  }

  userRef(uid) {
    return this.sdk.doc(this.db, 'users', uid);
  }

  /** @returns {Promise<{progress:object|null, settings:object|null, nickname:string, nickKey:string}>} */
  async load(uid) {
    const snap = await this.sdk.getDoc(this.userRef(uid));
    const data = snap.exists() ? snap.data() : {};
    const parse = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : null; } catch (e) { return null; } };
    return {
      progress: parse(data.progress),
      settings: parse(data.settings),
      nickname: typeof data.nickname === 'string' ? data.nickname : '',
      nickKey: typeof data.nickKey === 'string' ? data.nickKey : '',
    };
  }

  writeProgress(uid, progress) {
    return this.sdk.setDoc(this.userRef(uid), { progress: JSON.stringify(progress), updatedAt: this.sdk.serverTimestamp() }, { merge: true });
  }

  writeSettings(uid, settings) {
    return this.sdk.setDoc(this.userRef(uid), { settings: JSON.stringify(settings), updatedAt: this.sdk.serverTimestamp() }, { merge: true });
  }

  /**
   * 닉네임 정하기. 다른 사람이 쓰고 있으면 실패한다.
   * @returns {Promise<{name:string, key:string}>} 실패 시 Error(code: 'invalid' | 'taken' | Firestore 코드)
   */
  async claimNickname(uid, raw, oldKey) {
    const c = checkNickname(raw);
    if (!c.ok) throw Object.assign(new Error(c.reason), { code: 'invalid' });
    const { sdk, db } = this;
    const ref = sdk.doc(db, 'nicknames', c.key);
    await sdk.runTransaction(db, async (tx) => {
      const cur = await tx.get(ref);
      if (cur.exists() && cur.data().uid !== uid) throw Object.assign(new Error('이미 다른 사람이 쓰고 있는 닉네임이에요.'), { code: 'taken' });
      tx.set(ref, { uid });
      if (oldKey && oldKey !== c.key) tx.delete(sdk.doc(db, 'nicknames', oldKey));
      tx.set(this.userRef(uid), { nickname: c.name, nickKey: c.key, updatedAt: sdk.serverTimestamp() }, { merge: true });
    });
    return { name: c.name, key: c.key };
  }
}

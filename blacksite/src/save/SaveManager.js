// 저장 관리: 게스트는 localStorage, 로그인하면 Firestore(users/{uid}) ↔ 로컬 캐시.
// AuthManager가 attachAccount/detachAccount로 계정을 연결한다.
import { bus } from '../core/EventBus.js';
import { defaultData, normalize, mergeData, isEmptyProgress } from './defaults.js';

const GUEST_KEY = 'blacksite.guest.v1';
const ACCT_KEY = (uid) => `blacksite.acct.${uid}.v1`;

function readLS(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function writeLS(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
}

export class SaveManager {
  constructor() {
    this.uid = null;
    this.remote = null; // { set(data) → Promise }
    this.status = 'local'; // local | loading | synced | saving | error
    this.data = normalize(readLS(GUEST_KEY));
    this._timer = 0;
  }

  get settings() { return this.data.settings; }
  get records() { return this.data.records; }
  get readLogs() { return this.data.readLogs; }

  _key() { return this.uid ? ACCT_KEY(this.uid) : GUEST_KEY; }

  // 변경 후 호출: 로컬 즉시 저장, 원격은 묶어서 저장
  commit(immediate = false) {
    writeLS(this._key(), this.data);
    if (this.remote) {
      clearTimeout(this._timer);
      const push = () => {
        this.setStatus('saving');
        this.remote.set(this.data).then(() => this.setStatus('synced'), (e) => { console.warn('[Save] remote failed', e); this.setStatus('error'); });
      };
      if (immediate) push(); else this._timer = setTimeout(push, 1200);
    }
    bus.emit('save:changed', this.data);
  }

  setStatus(s) { this.status = s; bus.emit('save:status', s); }

  updateSettings(group, patch) {
    Object.assign(this.data.settings[group], patch);
    this.commit();
    bus.emit('settings:changed', { group, patch });
  }
  replaceSettings(settings) {
    this.data.settings = normalize({ settings }).settings;
    this.commit();
    bus.emit('settings:changed', { group: '*' });
  }

  // 미션 클리어 기록. → { newRecord, prevBest }
  recordClear(diff, timeSec) {
    const r = this.data.records[diff];
    const prevBest = r.bestTimeSec;
    const newRecord = prevBest === 0 || timeSec < prevBest;
    if (newRecord) r.bestTimeSec = Math.round(timeSec * 100) / 100;
    r.clears += 1;
    this.commit(true);
    return { newRecord, prevBest };
  }

  markLogRead(id) {
    if (this.data.readLogs.includes(id)) return false;
    this.data.readLogs.push(id);
    this.commit();
    return true;
  }

  // --- 계정 연결 ---------------------------------------------------------
  // remoteRaw: Firestore 문서 데이터(없으면 null). 게스트 진행이 있으면 합쳐서 올리고 게스트 칸은 비운다.
  attachAccount(uid, remoteRaw, remote) {
    this.uid = uid;
    this.remote = remote;
    const guest = normalize(readLS(GUEST_KEY));
    const cached = readLS(ACCT_KEY(uid));
    const base = remoteRaw ? normalize(remoteRaw) : cached ? normalize(cached) : defaultData();
    const hasSettings = !!(remoteRaw && remoteRaw.settings) || !!cached;
    const guestHasData = !isEmptyProgress(guest) || !!readLS(GUEST_KEY);
    this.data = guestHasData ? mergeData(base, guest, hasSettings) : base;
    if (guestHasData) { try { localStorage.removeItem(GUEST_KEY); } catch (e) { /* ignore */ } }
    this.setStatus('synced');
    this.commit(guestHasData || !remoteRaw);
    bus.emit('settings:changed', { group: '*' });
    return guestHasData;
  }

  // 로그아웃 → 게스트 상태 (설정만 게스트로 이어받는다)
  detachAccount() {
    const settings = this.data.settings;
    this.uid = null;
    this.remote = null;
    clearTimeout(this._timer);
    const guest = normalize(readLS(GUEST_KEY));
    guest.settings = settings;
    this.data = guest;
    this.setStatus('local');
    writeLS(GUEST_KEY, this.data);
    bus.emit('save:changed', this.data);
    bus.emit('settings:changed', { group: '*' });
  }
}

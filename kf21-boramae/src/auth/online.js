// 온라인 기능 묶음: 구글 로그인, 계정 저장 연동, 닉네임, 랭킹. 화면(계정 영역·닉네임 창·랭킹 창)도 여기서 연결한다.
// Firebase 설정이 비어 있으면 전부 꺼진 채로 남고, 게임은 브라우저 저장만으로 동작한다.
import { Auth, AUTH, authErrorText } from './auth.js';
import { CloudSave } from './cloud-save.js';
import { Ranking } from './ranking.js';
import { inAppBrowser, inAppText } from './inapp-browser.js';
import { defaultNickname } from './nickname-rules.js';
import { createNicknameDialog } from '../ui/nickname.js';
import { createRankingDialog } from '../ui/ranking.js';
import { esc } from '../ui/dom.js';
import { MISSIONS } from '../data/missions.js';
import { SETTINGS_SYNC_DELAY, DEVICE_ONLY_SETTINGS } from '../data/online.js';

export function createOnline({ save, settings, uiEl, toast }) {
  const auth = new Auth();
  let cloud = null;
  let ranking = null;
  let nickname = '';
  let nickKey = '';
  let accountEl = null;
  let settingsTimer = 0;
  let applyingRemote = false;

  const signedIn = () => auth.state === AUTH.IN && !!auth.user;
  const displayName = () => nickname || (auth.user ? defaultNickname(auth.user.uid) : '');

  // ── 계정 영역(메인 메뉴 오른쪽 위) ─────────────────────────────────────
  function render() {
    if (!accountEl) return;
    const s = auth.state;
    if (s === AUTH.OFF) accountEl.innerHTML = '<span class="who">게스트 · 이 브라우저에 저장</span>';
    else if (s === AUTH.LOADING || s === AUTH.PENDING) accountEl.innerHTML = '<span class="who">계정 확인 중…</span>';
    else if (s === AUTH.OUT) accountEl.innerHTML = '<span class="who">게스트</span><button class="btn" data-act="login">구글 로그인</button>';
    else {
      accountEl.innerHTML = `<span class="who"><b>${esc(displayName())}</b>${auth.isAdmin ? ' <span class="tag">관리자</span>' : ''}${save.syncError ? ' <span class="tag">저장 대기</span>' : ''}</span>
        <button class="btn" data-act="nick">닉네임</button><button class="btn" data-act="logout">로그아웃</button>`;
    }
  }

  async function onAccountClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.act === 'login') await auth.signIn();
      else if (b.dataset.act === 'logout') await auth.signOut();
      else if (b.dataset.act === 'nick') nickDialog.open({ current: nickname, fallback: displayName(), first: false });
    } finally { b.disabled = false; }
  }

  // ── 닉네임·랭킹 창 ─────────────────────────────────────────────────────
  const nickDialog = createNicknameDialog({
    async submit(name) {
      const r = await cloud.claimNickname(auth.user.uid, name, nickKey);
      nickname = r.name;
      nickKey = r.key;
      render();
      toast(`닉네임을 "${r.name}"(으)로 정했어요.`);
      await pushAll(); // 이미 올라간 랭킹 기록의 이름도 바꾼다
      rankDialog.refresh();
    },
  });
  const rankDialog = createRankingDialog({
    load: (missionId, force) => ranking.top(missionId, force),
    remove: (missionId, uid) => ranking.remove(missionId, uid),
    viewer: () => ({ uid: auth.user ? auth.user.uid : null, isAdmin: auth.isAdmin, enabled: auth.enabled && !!ranking, signedIn: signedIn() }),
    localBest: (missionId) => save.record(missionId),
  });
  uiEl.appendChild(nickDialog.el);
  uiEl.appendChild(rankDialog.el);

  // ── 랭킹 올리기 ────────────────────────────────────────────────────────
  async function push(missionId) {
    const rec = save.record(missionId);
    if (!signedIn() || !rec || !rec.clears) return 'skipped';
    return ranking.submit(missionId, auth.user.uid, displayName(), rec.bestScore, rec.bestTime);
  }
  /** 내 최고 기록을 모두 랭킹에 맞춘다(로그인 직후, 닉네임 변경 후). */
  async function pushAll() {
    for (const m of MISSIONS) {
      try { await push(m.id); } catch (e) { console.warn('[KF21] 랭킹 기록 실패', m.id, e); }
    }
  }

  // ── 로그인 상태 변화 ───────────────────────────────────────────────────
  auth.onChange(async (event) => {
    if (event === 'error') { if (auth.error) toast(auth.error, 9000); render(); return; }
    if (event === 'signed-out') {
      clearTimeout(settingsTimer);
      nickname = '';
      nickKey = '';
      save.detachAccount(); // 게스트 상태로
      nickDialog.close();
      render();
      toast('로그아웃했어요. 게스트 상태로 돌아왔어요.');
      return;
    }
    if (event === 'signed-in') {
      const uid = auth.user.uid;
      if (!ranking) { cloud = new CloudSave(auth.sdk, auth.db); ranking = new Ranking(auth.sdk, auth.db); }
      render();
      try {
        const data = await cloud.load(uid);
        if (!auth.user || auth.user.uid !== uid) return;
        nickname = data.nickname;
        nickKey = data.nickKey;
        const source = save.attachAccount(uid, data.progress, (p) => cloud.writeProgress(uid, p));
        if (data.settings) {
          // 기기마다 다른 게 자연스러운 값(품질)은 이 기기 것을 유지한다
          const merged = { ...data.settings };
          for (const k of DEVICE_ONLY_SETTINGS) merged[k] = settings.get(k);
          applyingRemote = true;
          settings.replace(merged);
          applyingRemote = false;
        } else {
          cloud.writeSettings(uid, settings.values).catch(() => {});
        }
        auth.ready();
        render();
        toast(source === 'guest' ? '게스트로 진행한 기록을 계정으로 옮겼어요.' : '계정 저장을 불러왔어요.');
        if (!nickname) nickDialog.open({ current: '', fallback: displayName(), first: true });
        pushAll();
      } catch (e) {
        // 계정 저장을 못 읽었으면 덮어쓰지 않도록 연결하지 않는다(이 브라우저 저장으로 계속)
        console.error('[KF21] 계정 저장 불러오기 실패', e);
        auth.ready();
        render();
        toast(`계정 저장을 불러오지 못했어요. ${authErrorText(e)} 지금은 이 브라우저에만 저장돼요.`, 9000);
      }
      return;
    }
    render();
  });
  save.onChange(render);
  settings.onChange(() => {
    if (applyingRemote || !signedIn() || !save.uid) return;
    clearTimeout(settingsTimer);
    const uid = auth.user.uid;
    settingsTimer = setTimeout(() => { cloud.writeSettings(uid, settings.values).catch((e) => console.warn('[KF21] 설정 저장 실패', e)); }, SETTINGS_SYNC_DELAY);
  });

  return {
    auth,
    /** @param {HTMLElement} el 메인 메뉴의 계정 영역 */
    mount(el) {
      accountEl = el;
      el.addEventListener('click', onAccountClick);
      render();
      const inApp = inAppBrowser();
      if (inApp && auth.enabled) toast(inAppText(inApp), 9000);
      auth.init().then(render);
    },
    openRanking(mission) {
      rankDialog.open(mission ? mission.id : undefined);
    },
    /** 미션 결과가 나왔을 때: 성공 기록을 랭킹에 올리고 결과 화면에 한 줄 안내를 남긴다. */
    async submitResult(result, setNote) {
      if (!result.success) return;
      if (!auth.enabled) return;
      if (!signedIn()) { setNote('로그인하면 이 기록이 랭킹에 올라가요.'); return; }
      try {
        const r = await push(result.missionId);
        setNote(r === 'written' ? `랭킹에 기록했어요. (${displayName()})` : r === 'kept' ? '랭킹에는 더 높은 내 기록이 이미 있어요.' : '');
      } catch (e) {
        setNote('랭킹에 기록하지 못했어요. 기록은 계정/브라우저에 저장됐어요.');
        console.warn('[KF21] 랭킹 기록 실패', e);
      }
    },
    /** ESC: 열려 있는 창이 있으면 닫고 true */
    closeTop() {
      if (nickDialog.isOpen) { nickDialog.close(); return true; }
      if (rankDialog.isOpen) { rankDialog.close(); return true; }
      return false;
    },
    get nickname() { return displayName(); },
  };
}

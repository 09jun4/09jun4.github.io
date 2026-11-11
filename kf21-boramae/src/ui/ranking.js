// 랭킹 창: 미션별 최고 점수 순위. 누구나 볼 수 있고, 관리자는 부정 기록을 지울 수 있다.
import { el, esc, fmtScore, fmtTime } from './dom.js';
import { MISSIONS } from '../data/missions.js';

/**
 * @param {object} actions
 * @param {(missionId:string, force:boolean)=>Promise<object[]>} actions.load 순위 불러오기(온라인이 꺼져 있으면 null 반환)
 * @param {(missionId:string, uid:string)=>Promise<void>} actions.remove
 * @param {()=>{uid:string|null, isAdmin:boolean, enabled:boolean, signedIn:boolean}} actions.viewer
 * @param {(missionId:string)=>object|null} actions.localBest
 */
export function createRankingDialog(actions) {
  const root = el(`
    <div class="modal rank" hidden>
      <div class="panel dialog wide" role="dialog" aria-modal="true" aria-labelledby="rank-title">
        <h2 id="rank-title">랭킹</h2>
        <div class="rank-tabs">${MISSIONS.map((m) => `<button class="btn" data-mission="${m.id}">${String(m.order).padStart(2, '0')} ${esc(m.title)}</button>`).join('')}</div>
        <div data-body></div>
        <p class="hint" data-foot></p>
        <div class="card-actions"><button class="btn primary" data-act="close">닫기</button><button class="btn ghost" data-act="refresh">새로 고침</button></div>
      </div>
    </div>`);
  const body = root.querySelector('[data-body]');
  const foot = root.querySelector('[data-foot]');
  let missionId = MISSIONS[0].id;
  let token = 0;

  async function render(force = false) {
    for (const b of root.querySelectorAll('[data-mission]')) b.classList.toggle('on', b.dataset.mission === missionId);
    const viewer = actions.viewer();
    const mine = actions.localBest(missionId);
    const mineText = mine && mine.clears ? `내 최고 기록: ${fmtScore(mine.bestScore)}점 · ${fmtTime(mine.bestTime)} · ${mine.grade}` : '아직 이 미션을 완수한 기록이 없어요.';
    if (!viewer.enabled) {
      body.innerHTML = '<p class="rank-empty">온라인 랭킹이 아직 연결되지 않았어요. 기록은 이 브라우저에 저장되고 있어요.</p>';
      foot.textContent = mineText;
      return;
    }
    foot.textContent = viewer.signedIn ? mineText : `${mineText} 로그인하면 랭킹에 올라가요.`;
    body.innerHTML = '<p class="rank-empty">불러오는 중…</p>';
    const my = ++token;
    try {
      const rows = await actions.load(missionId, force);
      if (my !== token) return;
      if (!rows.length) { body.innerHTML = '<p class="rank-empty">아직 기록이 없어요. 첫 번째로 이름을 올려 보세요.</p>'; return; }
      body.innerHTML = `<ol class="rank-list">${rows.map((r, i) => `
        <li class="${r.uid === viewer.uid ? 'me' : ''}">
          <span class="pos">${i + 1}</span><span class="name">${esc(r.name)}</span>
          <span class="tm">${fmtTime(r.time)}</span><span class="pts">${fmtScore(r.score)}</span>
          ${viewer.isAdmin ? `<button class="btn del" data-del="${esc(r.uid)}" title="관리자: 기록 삭제">삭제</button>` : '<span></span>'}
        </li>`).join('')}</ol>`;
    } catch (e) {
      if (my !== token) return;
      body.innerHTML = '<p class="rank-empty">랭킹을 불러오지 못했어요. 네트워크나 보안 규칙 게시 여부를 확인해 주세요.</p>';
    }
  }

  const close = () => { root.hidden = true; token++; };
  root.addEventListener('click', async (e) => {
    if (e.target === root || e.target.closest('[data-act="close"]')) { close(); return; }
    if (e.target.closest('[data-act="refresh"]')) { render(true); return; }
    const tab = e.target.closest('[data-mission]');
    if (tab) { missionId = tab.dataset.mission; render(); return; }
    const del = e.target.closest('[data-del]');
    if (del && window.confirm('이 기록을 랭킹에서 삭제할까요?')) {
      del.disabled = true;
      try { await actions.remove(missionId, del.dataset.del); } catch (err) { del.textContent = '실패'; return; }
      render(true);
    }
  });
  return {
    el: root,
    open(id) { missionId = id || missionId; root.hidden = false; render(); root.querySelector('[data-act="close"]').focus(); },
    close,
    refresh: () => { if (!root.hidden) render(true); },
    get isOpen() { return !root.hidden; },
  };
}

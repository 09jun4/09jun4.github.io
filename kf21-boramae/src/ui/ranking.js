// 랭킹 창: 탭 3개(미션별 / 캠페인별 / 전체). 상위 20명과 내 순위를 보여 준다. 관리자는 부정 기록을 지울 수 있다.
import { el, esc, fmtScore, fmtTime } from './dom.js';
import { MISSIONS, missionById, missionsOf } from '../data/missions.js';
import { CAMPAIGNS } from '../data/campaigns.js';

/**
 * @param {object} actions
 * @param {(scope:string, force:boolean)=>Promise<object[]>} actions.load scope = 미션 ID | 캠페인 ID | 'overall'
 * @param {(scope:string, uid:string)=>Promise<void>} actions.remove
 * @param {()=>{uid:string|null, isAdmin:boolean, enabled:boolean, signedIn:boolean}} actions.viewer
 * @param {(scope:string)=>string} actions.mineText 그 범위에서 내 기록 한 줄
 */
export function createRankingDialog(actions) {
  const root = el(`
    <div class="modal rank" hidden>
      <div class="panel dialog wide" role="dialog" aria-modal="true" aria-labelledby="rank-title">
        <h2 id="rank-title">랭킹</h2>
        <div class="rank-tabs" role="tablist">
          <button class="btn" data-tab="mission">미션별</button><button class="btn" data-tab="campaign">캠페인별</button><button class="btn" data-tab="overall">전체</button>
        </div>
        <div class="rank-sub" data-sub></div>
        <div data-body></div>
        <p class="hint" data-foot></p>
        <div class="card-actions"><button class="btn primary" data-act="close">닫기</button><button class="btn ghost" data-act="refresh">새로 고침</button></div>
      </div>
    </div>`);
  const body = root.querySelector('[data-body]');
  const foot = root.querySelector('[data-foot]');
  const sub = root.querySelector('[data-sub]');
  let tab = 'mission';
  let missionId = MISSIONS[0].id;
  let campaignId = CAMPAIGNS[0].id;
  let token = 0;
  const scope = () => (tab === 'overall' ? 'overall' : tab === 'campaign' ? campaignId : missionId);

  async function render(force = false) {
    for (const b of root.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    // 둘째 줄: 캠페인 고르기(+ 미션별이면 그 캠페인의 미션)
    const camp = tab === 'mission' ? missionById(missionId).campaign : campaignId;
    sub.innerHTML = tab === 'overall' ? '<p class="rank-note">클리어한 모든 미션의 최고 점수를 더한 순위예요.</p>'
      : `<div class="rank-row">${CAMPAIGNS.map((c) => `<button class="btn chip${c.id === camp ? ' on' : ''}" data-campaign="${c.id}">${String(c.order).padStart(2, '0')} ${esc(c.title)}</button>`).join('')}</div>`
        + (tab === 'mission' ? `<div class="rank-row">${missionsOf(camp).map((m) => `<button class="btn chip${m.id === missionId ? ' on' : ''}" data-mission="${m.id}">${String(m.order).padStart(2, '0')} ${esc(m.title)}</button>`).join('')}</div>`
          : '<p class="rank-note">이 캠페인의 미션을 모두 클리어한 사람만 오르고, 미션별 최고 점수의 합으로 겨뤄요.</p>');
    const s = scope();
    const viewer = actions.viewer();
    const mineText = actions.mineText(s);
    if (!viewer.enabled) {
      body.innerHTML = '<p class="rank-empty">온라인 랭킹이 아직 연결되지 않았어요. 기록은 이 브라우저에 저장되고 있어요.</p>';
      foot.textContent = mineText;
      return;
    }
    foot.textContent = viewer.signedIn ? mineText : `${mineText} 로그인하면 랭킹에 올라가요.`;
    body.innerHTML = '<p class="rank-empty">불러오는 중…</p>';
    const my = ++token;
    try {
      const all = await actions.load(s, force);
      if (my !== token) return;
      if (!all.length) { body.innerHTML = '<p class="rank-empty">아직 기록이 없어요. 첫 번째로 이름을 올려 보세요.</p>'; return; }
      const rows = all.slice(0, 20).map((r, i) => ({ r, pos: i + 1 }));
      const mine = all.findIndex((r) => r.uid === viewer.uid);
      if (mine >= 20) rows.push({ r: all[mine], pos: mine + 1, gap: true }); // 20위 밖이면 내 순위를 따로 붙인다
      body.innerHTML = `<ol class="rank-list">${rows.map(({ r, pos, gap }) => `
        <li class="${r.uid === viewer.uid ? 'me' : ''}${gap ? ' gap' : ''}">
          <span class="pos">${pos}</span><span class="name">${esc(r.name)}</span>
          <span class="tm">${r.time != null ? fmtTime(r.time) : `${r.missions || 0}개 미션`}</span><span class="pts">${fmtScore(r.score)}</span>
          ${viewer.isAdmin ? `<button class="btn del" data-del="${esc(r.uid)}" title="관리자: 기록 삭제">삭제</button>` : '<span></span>'}
        </li>`).join('')}</ol>`;
      if (viewer.signedIn && mine >= 0) foot.textContent = `${mineText} · 현재 ${mine + 1}위`;
    } catch (e) {
      if (my !== token) return;
      body.innerHTML = '<p class="rank-empty">랭킹을 불러오지 못했어요. 네트워크나 보안 규칙 게시 여부를 확인해 주세요.</p>';
    }
  }

  const close = () => { root.hidden = true; token++; };
  root.addEventListener('click', async (e) => {
    if (e.target === root || e.target.closest('[data-act="close"]')) { close(); return; }
    if (e.target.closest('[data-act="refresh"]')) { render(true); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; if (tab === 'campaign') campaignId = missionById(missionId).campaign; render(); return; }
    const c = e.target.closest('[data-campaign]');
    if (c) { campaignId = c.dataset.campaign; if (tab === 'mission') missionId = missionsOf(campaignId)[0].id; render(); return; }
    const m = e.target.closest('[data-mission]');
    if (m) { missionId = m.dataset.mission; render(); return; }
    const del = e.target.closest('[data-del]');
    if (del && window.confirm('이 기록을 랭킹에서 삭제할까요?')) {
      del.disabled = true;
      try { await actions.remove(scope(), del.dataset.del); } catch (err) { del.textContent = '실패'; return; }
      render(true);
    }
  });
  return {
    el: root,
    open(id) { if (id && missionById(id)) { missionId = missionById(id).id; tab = 'mission'; } root.hidden = false; render(); root.querySelector('[data-act="close"]').focus(); },
    close,
    refresh: () => { if (!root.hidden) render(true); },
    get isOpen() { return !root.hidden; },
  };
}

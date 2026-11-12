// 미션 선택: 캠페인 카드(왼쪽) → 그 캠페인의 미션 목록과 상세(오른쪽). 잠금은 없고 권장 문구만 보여 준다.
import { el, esc, fmtScore, fmtTime, controlsBothHtml } from './dom.js';
import { MISSIONS, missionById, missionsOf } from '../data/missions.js';
import { CAMPAIGNS } from '../data/campaigns.js';
import { CONTROLS, CONTROLS_MOBILE } from '../data/controls.js';
import { missionType, objectiveText, targetSummary, airSummary, weaponsText, timeLabel, skyGradient, campaignProgress } from './mission-info.js';

export function createMissionSelect(actions, save) {
  const root = el(`
    <section class="screen select" aria-label="미션 선택">
      <header class="bar">
        <button class="btn ghost" data-act="back">← 메인 메뉴</button>
        <h2>작전 선택</h2>
        <span class="bar-note">모든 작전을 바로 고를 수 있어요</span>
      </header>
      <div class="select-body">
        <div class="panel map-panel"><ol class="campaign-list"></ol></div>
        <div class="panel card"></div>
      </div>
      <div class="panel controls"><h3>조작</h3>${controlsBothHtml(CONTROLS, CONTROLS_MOBILE)}</div>
    </section>`);
  const card = root.querySelector('.card');
  const list = root.querySelector('.campaign-list');
  let selected = MISSIONS[0].id;

  function render() {
    const m = missionById(selected) || MISSIONS[0];
    list.innerHTML = CAMPAIGNS.map((c) => {
      const p = campaignProgress(save, c.id);
      return `<li><button class="campaign${c.id === m.campaign ? ' on' : ''}" data-campaign="${c.id}">
        <span class="sky" style="background:${skyGradient(c.timeOfDay)}" aria-hidden="true"></span>
        <span class="cm"><b>${String(c.order).padStart(2, '0')} ${esc(c.title)}</b><small>${esc(c.recommended)}</small></span>
        <span class="cp">${p.cleared}/${p.total}${p.avgGrade ? ` <b class="grade g-${p.avgGrade}">${p.avgGrade}</b>` : ''}</span></button></li>`;
    }).join('');
    const camp = CAMPAIGNS.find((c) => c.id === m.campaign);
    const rec = save.record(m.id);
    const type = missionType(m);
    const ground = targetSummary(m), air = airSummary(m);
    card.innerHTML = `
      <p class="eyebrow">${esc(camp.codename)} · ${esc(camp.summary)}</p>
      <ol class="mission-list">${missionsOf(m.campaign).map((x) => {
        const r = save.record(x.id), t = missionType(x);
        return `<li><button class="mission-row${x.id === m.id ? ' on' : ''}" data-id="${x.id}">
          <span class="no">${String(x.order).padStart(2, '0')}</span><span class="nm">${esc(x.title)} <i class="tag">${t.tag}</i></span>
          <span class="st">${r && r.grade ? `${fmtScore(r.bestScore)} <b class="grade g-${r.grade}">${r.grade}</b>` : '미완료'}</span></button></li>`;
      }).join('')}</ol>
      <h3 class="card-title"><span>${esc(type.label)} · ${timeLabel(m)}</span>${esc(m.title)}</h3>
      <p class="card-sum">${esc(m.summary)}</p>
      <dl class="facts">
        <div><dt>목표</dt><dd>${m.objectives.map((o) => esc(objectiveText(o)) + (o.required === false ? ' <small>선택</small>' : '')).join('<br>')}</dd></div>
        ${air ? `<div><dt>공중</dt><dd>${esc(air)}</dd></div>` : ''}
        ${ground ? `<div><dt>지상</dt><dd>${esc(ground)}</dd></div>` : ''}
        <div><dt>무장</dt><dd>${esc(weaponsText(m))}</dd></div>
        <div><dt>기준 시간</dt><dd>${m.refTime}초${m.timeLimit ? ` · 제한 ${m.timeLimit}초` : ''}</dd></div>
        <div><dt>최고 기록</dt><dd>${rec && rec.clears ? `${fmtScore(rec.bestScore)}점 · ${fmtTime(rec.bestTime)} <b class="grade g-${rec.grade}">${rec.grade}</b>` : '없음'}</dd></div>
      </dl>
      <div class="card-actions">
        <button class="btn primary" data-act="brief" data-autofocus>브리핑</button>
        <button class="btn" data-act="rank">랭킹 보기</button>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const camp = e.target.closest('[data-campaign]');
    if (camp) {
      const first = missionsOf(camp.dataset.campaign);
      // 그 캠페인에서 아직 안 깬 첫 미션(다 깼으면 첫 미션)
      selected = (first.find((x) => !(save.record(x.id) && save.record(x.id).clears)) || first[0]).id;
      render();
      return;
    }
    const row = e.target.closest('[data-id]');
    if (row) { selected = row.dataset.id; render(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'back') actions.back();
    else if (act.dataset.act === 'brief') actions.brief(missionById(selected));
    else if (act.dataset.act === 'rank') actions.ranking(missionById(selected));
  });
  save.onChange(() => { if (!root.hidden) render(); });

  return {
    el: root,
    show(payload) {
      if (payload && payload.missionId && missionById(payload.missionId)) selected = missionById(payload.missionId).id;
      else {
        const next = MISSIONS.find((m) => !(save.record(m.id) && save.record(m.id).clears)); // 아직 안 깬 첫 미션
        if (next) selected = next.id;
      }
      render();
    },
  };
}

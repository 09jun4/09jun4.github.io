// 브리핑: 목표, 적기 수, 상황 설명, "출격" 버튼. 튜토리얼 대신 조작 키 요약을 함께 보여 준다.
import { el, esc, controlsBothHtml } from './dom.js';
import { missionType, objectiveText, targetSummary, airSummary, weaponsText, timeLabel } from './mission-info.js';
import { TARGETS } from '../data/targets.js';
import { CONTROLS, CONTROLS_MOBILE, TIPS } from '../data/controls.js';

export function createBriefing(actions) {
  const root = el(`
    <section class="screen briefing" aria-label="브리핑">
      <div class="panel brief-panel">
        <div class="brief-main"></div>
        <aside class="brief-side">
          <h3>조작</h3>${controlsBothHtml(CONTROLS, CONTROLS_MOBILE)}
          <h3>알아 두기</h3><ul class="tips">${TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </aside>
      </div>
    </section>`);
  const main = root.querySelector('.brief-main');
  let mission = null;
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'back') actions.back(mission);
    else if (act.dataset.act === 'launch') actions.launch(mission);
  });
  return {
    el: root,
    show(payload) {
      mission = payload.mission;
      const m = mission;
      const type = missionType(m), air = airSummary(m), ground = targetSummary(m);
      const kinds = [...new Set((m.groundTargets || []).map((t) => t.type))];
      const lose = ['체력 0(회복 없음)'];
      if (m.objectives.some((o) => o.type === 'intercept')) lose.push('수송기·폭격기가 한 대라도 도달');
      if (m.timeLimit || m.objectives.some((o) => o.timeLimit && o.required !== false)) lose.push('제한시간 초과');
      main.innerHTML = `
        <p class="eyebrow">BRIEFING · ${esc(m.codename)}</p>
        <h2 class="brief-title"><span>${m.campaign.toUpperCase()} · MISSION ${String(m.order).padStart(2, '0')}</span>${esc(m.title)}</h2>
        <p class="brief-text">${esc(m.briefing)}</p>
        <dl class="facts">
          <div><dt>유형</dt><dd>${esc(type.label)} · ${timeLabel(m)}${m.terrain === 'coast' ? ' · 해안' : ''}</dd></div>
          <div><dt>목표</dt><dd><ul class="obj-list">${m.objectives.map((o) => `<li class="${o.required === false ? 'opt' : 'req'}"><b>${o.required === false ? '선택' : '필수'}</b>${esc(objectiveText(o))} <small>${o.points.toLocaleString()}점</small></li>`).join('')}</ul></dd></div>
          ${air ? `<div><dt>공중 전력</dt><dd>${esc(air)}</dd></div>` : ''}
          ${ground ? `<div><dt>지상 목표</dt><dd>${esc(ground)}<br><small>${kinds.map((k) => `${TARGETS[k].short} ${TARGETS[k].armor === 'hard' ? '폭탄만 통함' : '기관포도 통함'}`).join(' · ')}</small></dd></div>` : ''}
          <div><dt>무장</dt><dd>${esc(weaponsText(m))}</dd></div>
          <div><dt>기준 시간</dt><dd>${m.refTime}초 — 빨리 끝낼수록 점수가 높아요</dd></div>
          <div><dt>패배 조건</dt><dd>${lose.join(' · ')}</dd></div>
        </dl>
        <div class="card-actions">
          <button class="btn primary big" data-act="launch" data-autofocus>출격</button>
          <button class="btn ghost" data-act="back">← 작전 선택</button>
        </div>`;
    },
  };
}

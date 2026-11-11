// 브리핑: 목표, 적기 수, 상황 설명, "출격" 버튼. 튜토리얼 대신 조작 키 요약을 함께 보여 준다.
import { el, esc, controlsHtml } from './dom.js';
import { missionEnemyCount } from '../data/missions.js';
import { CONTROLS, TIPS } from '../data/controls.js';
import { WEAPONS, LOADOUT } from '../data/weapons.js';

export function createBriefing(actions) {
  const root = el(`
    <section class="screen briefing" aria-label="브리핑">
      <div class="panel brief-panel">
        <div class="brief-main"></div>
        <aside class="brief-side">
          <h3>조작</h3><ul class="keys">${controlsHtml(CONTROLS)}</ul>
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
      main.innerHTML = `
        <p class="eyebrow">BRIEFING · ${esc(m.codename)}</p>
        <h2 class="brief-title"><span>MISSION ${String(m.order).padStart(2, '0')}</span>${esc(m.title)}</h2>
        <p class="brief-text">${esc(m.briefing)}</p>
        <dl class="facts">
          <div><dt>목표</dt><dd>등장하는 적기 ${missionEnemyCount(m)}대 전부 격추</dd></div>
          <div><dt>적 전력</dt><dd>전투기 ${missionEnemyCount(m)}대 (편대 ${m.waves.length}개로 나뉘어 등장)</dd></div>
          <div><dt>기준 시간</dt><dd>${m.parTime}초 — 빨리 끝낼수록 점수가 높아요</dd></div>
          <div><dt>무장</dt><dd>${LOADOUT.map((id) => (WEAPONS[id].ammo ? `${WEAPONS[id].name} ${WEAPONS[id].ammo}발` : `${WEAPONS[id].name}(무제한·과열)`)).join(' · ')}</dd></div>
          <div><dt>패배 조건</dt><dd>체력 0 (회복 없음)</dd></div>
        </dl>
        <div class="card-actions">
          <button class="btn primary big" data-act="launch" data-autofocus>출격</button>
          <button class="btn ghost" data-act="back">← 작전 선택</button>
        </div>`;
    },
  };
}

// 자동플레이 패널(주소에 ?auto=1 이 있을 때만 나온다): 실력 슬라이더·단계 버튼·미션·연속 반복, 지금 상태와 누적 결과.
import { el, esc, fmtScore } from './dom.js';
import { SKILL_LEVELS, levelName, skillParams } from '../core/autopilot.js';
import { MISSIONS } from '../data/missions.js';

export function createAutoplayPanel({ autopilot, options, onStart, onStop, onChange }) {
  const root = el(`
    <aside class="autopanel" aria-label="자동플레이">
      <header><b>AUTO PLAY</b><button type="button" data-act="fold" aria-label="접기">–</button></header>
      <div class="ap-body">
        <div class="ap-field">
          <label for="ap-skill">실력 <output data-out="skill"></output></label>
          <input id="ap-skill" type="range" min="0" max="100" step="1">
          <div class="ap-levels">${SKILL_LEVELS.map((l) => `<button type="button" data-skill="${l.skill}">${l.label}</button>`).join('')}</div>
        </div>
        <div class="ap-field">
          <label for="ap-mission">미션</label>
          <select id="ap-mission">${MISSIONS.map((m) => `<option value="${m.id}">${m.order}. ${esc(m.title)}</option>`).join('')}</select>
          <label class="ap-check"><input id="ap-loop" type="checkbox"> 끝나면 다음 미션으로 계속</label>
        </div>
        <dl class="ap-stats">
          <div><dt>상태</dt><dd data-out="mode">대기</dd></div>
          <div><dt>전적</dt><dd data-out="record">0승 0패</dd></div>
          <div><dt>최근</dt><dd data-out="last">-</dd></div>
        </dl>
        <div class="ap-actions"><button type="button" class="primary" data-act="toggle"></button></div>
      </div>
    </aside>`);
  const slider = root.querySelector('#ap-skill');
  const out = (k) => root.querySelector(`[data-out="${k}"]`);
  const missionSel = root.querySelector('#ap-mission');
  const loopBox = root.querySelector('#ap-loop');
  const toggle = root.querySelector('[data-act="toggle"]');
  const rec = { win: 0, lose: 0 };

  function refresh() {
    slider.value = autopilot.skill;
    out('skill').textContent = `${autopilot.skill} · ${levelName(autopilot.skill)}`;
    for (const b of root.querySelectorAll('[data-skill]')) b.classList.toggle('on', Number(b.dataset.skill) === autopilot.skill);
    missionSel.value = options.mission;
    loopBox.checked = options.loop;
    toggle.textContent = autopilot.enabled ? '자동플레이 끄기' : '자동플레이 켜기';
    toggle.classList.toggle('on', autopilot.enabled);
  }
  slider.addEventListener('input', () => { autopilot.setSkill(Number(slider.value)); refresh(); onChange(); });
  root.addEventListener('click', (e) => {
    const sk = e.target.closest('[data-skill]');
    if (sk) { autopilot.setSkill(Number(sk.dataset.skill)); refresh(); onChange(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'fold') root.classList.toggle('folded');
    else if (act.dataset.act === 'toggle') { if (autopilot.enabled) onStop(); else onStart(); refresh(); }
  });
  missionSel.addEventListener('change', () => { options.mission = missionSel.value; onChange(); });
  loopBox.addEventListener('change', () => { options.loop = loopBox.checked; onChange(); });
  // 패널 안 키 입력(슬라이더 방향키 등)이 게임 키(W/A/S/D)로 새지 않게 한다
  root.addEventListener('keydown', (e) => e.stopPropagation());
  refresh();
  return {
    el: root, refresh,
    setMode(text) { out('mode').textContent = text; },
    record(result) {
      if (result.success) rec.win++; else rec.lose++;
      out('record').textContent = `${rec.win}승 ${rec.lose}패`;
      out('last').textContent = `M${result.missionId.slice(1)} ${result.success ? `${result.grade} ${fmtScore(result.score)}점` : '실패'} · 피격 ${result.hitsTaken}회`;
    },
    skillSummary() { return skillParams(autopilot.skill); },
  };
}

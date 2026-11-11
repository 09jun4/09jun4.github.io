// 결과 화면(성공/실패 공통): 통계 + 점수·등급 카운트업 + 다음 미션 / 재시작 / 메인 메뉴.
import { el, esc, fmtScore, fmtTime } from './dom.js';
import { nextMission, missionById } from '../data/missions.js';
import { WEAPONS } from '../data/weapons.js';
import { referenceScore } from '../core/scoring.js';

const COUNT_MS = 900;

export function createResult(actions) {
  const root = el('<section class="screen result" aria-label="임무 결과"><div class="panel dialog wide result-panel"></div></section>');
  const panel = root.querySelector('.result-panel');
  let raf = 0;
  let current = null;
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act || !current) return;
    const mission = missionById(current.missionId);
    if (act.dataset.act === 'next') actions.next(nextMission(current.missionId));
    else if (act.dataset.act === 'retry') actions.retry(mission);
    else if (act.dataset.act === 'menu') actions.menu();
    else if (act.dataset.act === 'rank') actions.ranking(mission);
  });

  return {
    el: root,
    /** @param {{result:object, saved:{newBest:boolean,firstClear:boolean}}} payload */
    show(payload) {
      const r = payload.result;
      current = r;
      const mission = missionById(r.missionId);
      const next = r.success ? nextMission(r.missionId) : null;
      const weapons = r.weaponsUsed.length ? r.weaponsUsed.map((id) => WEAPONS[id].name).join(', ') : '없음';
      const acc = r.gunShots ? ` (${Math.round((r.gunHits / r.gunShots) * 100)}%)` : '';
      panel.innerHTML = `
        <p class="eyebrow">MISSION ${String(mission.order).padStart(2, '0')} · ${esc(mission.title)}</p>
        <h2 class="result-title ${r.success ? 'ok' : 'fail'}">${r.success ? '임무 완수' : '임무 실패'}</h2>
        <div class="result-body">
          <dl class="facts stats">
            <div><dt>격추</dt><dd>${r.kills} / ${r.total}</dd></div>
            <div><dt>기관포 명중</dt><dd>${r.gunHits}발${acc}</dd></div>
            <div><dt>피격</dt><dd>${r.hitsTaken}회</dd></div>
            <div><dt>${r.success ? '클리어 시간' : '생존 시간'}</dt><dd>${fmtTime(r.time)} <small>기준 ${mission.parTime}초</small></dd></div>
            <div><dt>사용 무장</dt><dd>${esc(weapons)}${r.missilesFired ? ` · 미사일 ${r.missilesFired}발` : ''}</dd></div>
          </dl>
          <div class="scorebox">
            <span class="score-label">점수</span>
            <span class="score" data-score>0</span>
            <span class="score-ref">기준 점수 ${fmtScore(referenceScore(mission))}</span>
            <span class="grade big ${r.grade ? `g-${r.grade}` : 'none'}" data-grade aria-label="등급">${r.grade ? r.grade : '–'}</span>
            <span class="grade-note">${r.success ? (payload.saved && payload.saved.newBest ? '최고 기록 갱신' : '등급') : '실패 시 등급 없음'}</span>
          </div>
        </div>
        <p class="result-note" data-note></p>
        <div class="card-actions">
          ${next ? '<button class="btn primary" data-act="next" data-autofocus>다음 미션</button>' : ''}
          <button class="btn${next ? '' : ' primary'}" data-act="retry" ${next ? '' : 'data-autofocus'}>재시작</button>
          <button class="btn" data-act="menu">메인 메뉴</button>
          ${r.success ? '<button class="btn ghost" data-act="rank">랭킹 보기</button>' : ''}
        </div>`;
      // 점수 카운트업 → 끝나면 등급이 나타난다
      const scoreEl = panel.querySelector('[data-score]');
      const gradeEl = panel.querySelector('[data-grade]');
      gradeEl.classList.remove('show');
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / COUNT_MS);
        const eased = 1 - Math.pow(1 - k, 3);
        scoreEl.textContent = fmtScore(r.score * eased);
        if (k < 1) raf = requestAnimationFrame(tick);
        else { scoreEl.textContent = fmtScore(r.score); gradeEl.classList.add('show'); }
      };
      raf = requestAnimationFrame(tick);
      if (r.success && !next) this.setNote('모든 미션을 완수했어요. 더 높은 등급에 도전해 보세요.');
    },
    setNote(text) {
      const n = panel.querySelector('[data-note]');
      if (n) n.textContent = text;
    },
  };
}

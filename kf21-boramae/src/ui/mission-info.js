// 미션 표시용 도우미(선택·브리핑·결과 화면 공용): 유형 이름, 목표 문장, 목표물 요약, 무장, 캠페인 진행도.
import { MISSIONS } from '../data/missions.js';
import { TARGETS } from '../data/targets.js';
import { TIME_OF_DAY } from '../data/timeOfDay.js';
import { GRADE_ORDER } from '../data/grades.js';
import { WEAPONS } from '../data/weapons.js';

export const TYPE_LABEL = { killAir: '요격', timedKill: '시간제한 요격', intercept: '차단', destroy: '타격', checkpoints: '정찰', boss: '결전' };
const TYPE_TAG = { killAir: 'AIR', timedKill: 'TIME', intercept: 'CUT', destroy: 'GND', checkpoints: 'RECON', boss: 'ACE' };

/** 미션의 대표 유형(첫 필수 목표) */
export function missionType(m) {
  const o = m.objectives.find((x) => x.required !== false) || m.objectives[0];
  return { key: o.type, label: TYPE_LABEL[o.type] || o.type, tag: TYPE_TAG[o.type] || '' };
}

export function objectiveText(o) {
  const n = o.count || 1;
  const limit = o.timeLimit ? ` (${o.timeLimit}초 안에)` : '';
  return `${o.label || TYPE_LABEL[o.type]}${n > 1 ? ` ${n}` : ''}${limit}`;
}

/** 지상 목표 종류별 개수: "레이더 2 · 대공포 2" */
export function targetSummary(m) {
  const n = {};
  for (const t of m.groundTargets || []) n[t.type] = (n[t.type] || 0) + (t.count || 1);
  return Object.entries(n).map(([type, c]) => `${TARGETS[type] ? TARGETS[type].name : type} ${c}`).join(' · ');
}

/** 공중 전력: "전투기 3 · 폭격기 4" */
export function airSummary(m) {
  const n = {};
  const NAME = { fighter: '전투기', transport: '수송기', bomber: '폭격기', boss: '에이스' };
  for (const w of m.waves || []) n[w.role || 'fighter'] = (n[w.role || 'fighter'] || 0) + w.count;
  return Object.entries(n).map(([role, c]) => `${NAME[role] || role} ${c}`).join(' · ');
}

export function weaponsText(m) {
  const parts = [`${WEAPONS.gun.name}(무제한·과열)`, `${WEAPONS.missile.name} ${m.weapons.missile}`];
  if (m.weapons.bomb > 0) parts.push(`${WEAPONS.bomb.name} ${WEAPONS.bomb.unlimited ? '무제한' : m.weapons.bomb}`);
  return parts.join(' · ');
}

export const timeLabel = (m) => (TIME_OF_DAY[m.timeOfDay] || TIME_OF_DAY.day).label;
export const skyGradient = (tod) => { const p = (TIME_OF_DAY[tod] || TIME_OF_DAY.day).preview; return `linear-gradient(180deg, ${p[0]} 0%, ${p[1]} 55%, ${p[2]} 100%)`; };

/** 캠페인 진행도: 클리어 수, 평균 등급(클리어한 미션만), 합산 점수 */
export function campaignProgress(save, campaignId) {
  const list = MISSIONS.filter((m) => m.campaign === campaignId);
  let cleared = 0, sum = 0, score = 0;
  for (const m of list) {
    const r = save.record(m.id);
    if (!r || !r.clears) continue;
    cleared++; score += r.bestScore; sum += GRADE_ORDER.indexOf(r.grade);
  }
  return { total: list.length, cleared, score, avgGrade: cleared ? GRADE_ORDER[Math.round(sum / cleared)] : null };
}

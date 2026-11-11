// 점수·등급 계산(순수 함수). 규칙 수치는 data/grades.js.
import { SCORING, GRADES, GRADE_FALLBACK, GRADE_ORDER } from '../data/grades.js';
import { missionEnemyCount } from '../data/missions.js';

/** 점수 = killScore × 격추 수 + max(0, 기준시간 − 클리어시간) × timeScore. 실패하면 시간 점수는 없다. */
export function computeScore(mission, kills, clearTime, success) {
  const timeBonus = success ? Math.max(0, mission.parTime - clearTime) * SCORING.timeScore : 0;
  return Math.round(SCORING.killScore * kills + timeBonus);
}

/** 기준 점수 = killScore × 적기 수 + 기준시간 × timeScore */
export function referenceScore(mission) {
  return SCORING.killScore * missionEnemyCount(mission) + mission.parTime * SCORING.timeScore;
}

/** 성공했을 때만 등급이 있다. 실패면 null. */
export function gradeFor(mission, score, success) {
  if (!success) return null;
  const ratio = score / referenceScore(mission);
  for (const g of GRADES) if (ratio >= g.ratio) return g.grade;
  return GRADE_FALLBACK;
}

/** 두 등급 중 더 높은 쪽 */
export function betterGrade(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

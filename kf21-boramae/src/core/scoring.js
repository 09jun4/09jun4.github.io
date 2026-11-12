// 점수·등급 계산(순수 함수). 점수 규칙은 src/mission/engine.js, 등급 임계값은 data/grades.js.
import { GRADES, GRADE_FALLBACK, GRADE_ORDER } from '../data/grades.js';
import { MissionEngine, referenceScore as engineReference } from '../mission/engine.js';

/** 공중 격추만 있는 미션의 점수(격추 수와 시간으로 계산). 세션은 엔진의 score()를 직접 쓴다. */
export function computeScore(mission, kills, clearTime, success) {
  const e = new MissionEngine(mission);
  for (let i = 0; i < kills; i++) e.airKill();
  if (!success && e.running) e.playerDead();
  return e.score(clearTime);
}

/** 기준 점수 = 목표 points 합 + 기준시간 × 10 */
export const referenceScore = engineReference;

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

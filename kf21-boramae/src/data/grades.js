// 점수·등급 규칙.
// 점수 = killScore × 격추 수 + max(0, 기준시간 − 클리어시간) × timeScore   (피격은 반영하지 않는다)
// 기준 점수 = killScore × 적기 수 + 기준시간 × timeScore
export const SCORING = {
  killScore: 1000,
  timeScore: 10,
};

// 기준 점수 대비 비율(높은 등급부터). 어느 것에도 못 미치면 fallback 등급.
export const GRADES = [
  { grade: 'S', ratio: 0.9 },
  { grade: 'A', ratio: 0.75 },
  { grade: 'B', ratio: 0.55 },
];
export const GRADE_FALLBACK = 'C';
export const GRADE_ORDER = ['C', 'B', 'A', 'S']; // 낮은 것부터(최고 등급 비교용)

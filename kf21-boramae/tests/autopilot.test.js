import { describe, it, expect } from 'vitest';
import { skillParams, levelName, SKILL_LEVELS } from '../src/core/autopilot.js';

describe('자동플레이 실력 → 행동 값', () => {
  it('실력이 높을수록 반응이 빠르고 조준이 정확하고 멀리서 쏜다', () => {
    const a = skillParams(10), b = skillParams(50), c = skillParams(95);
    expect(a.reaction).toBeGreaterThan(b.reaction);
    expect(b.reaction).toBeGreaterThan(c.reaction);
    expect(a.aimError).toBeGreaterThan(b.aimError);
    expect(b.aimError).toBeGreaterThan(c.aimError);
    expect(a.fireRange).toBeLessThan(c.fireRange);
    expect(a.turnDeadzone).toBeGreaterThan(c.turnDeadzone);
  });
  it('초보는 키 입력처럼 0/±1, 과열까지 쏘고 미사일을 안 쓴다. 전문가는 연속 조종·열 관리·회피·미사일', () => {
    const lo = skillParams(12), hi = skillParams(95);
    expect(lo.analog).toBe(false); expect(hi.analog).toBe(true);
    expect(lo.heatCut).toBeGreaterThan(1); expect(hi.heatCut).toBeLessThan(0.9);
    expect(lo.missiles).toBe(false); expect(hi.missiles).toBe(true);
    expect(lo.weave).toBe(0); expect(hi.weave).toBeGreaterThan(0.2);
  });
  it('범위 밖 값도 안전하고 단계 이름이 맞다', () => {
    expect(skillParams(-50).reaction).toBeCloseTo(0.5, 5);
    expect(skillParams(500).aimError).toBe(0);
    expect(SKILL_LEVELS.map((l) => levelName(l.skill))).toEqual(['초보', '중급', '숙련', '전문가']);
  });
});

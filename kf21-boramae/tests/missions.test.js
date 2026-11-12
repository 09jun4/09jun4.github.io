// 미션 스모크 테스트: (1) 스키마 검증 (2) 헤드리스 엔진 시뮬레이션(승리·점수·등급, 패배 경로) (3) 이식한 미션이 예전과 같은 점수인지
import { describe, it, expect } from 'vitest';
import { MISSIONS, missionById, nextMission, LEGACY_MISSION_IDS } from '../src/data/missions.js';
import { CAMPAIGNS } from '../src/data/campaigns.js';
import { validateMissions } from '../src/mission/schema.js';
import { MissionEngine, OBJ, OUTCOME, LOSS, objectiveRole, referenceScore } from '../src/mission/engine.js';
import { gradeFor } from '../src/core/scoring.js';

/** 헤드리스 봇: 활성 목표를 순서대로 처리한다. pace = 목표 하나(수량 1)를 처리하는 데 걸리는 시간(초) */
export function playMission(mission, { pace = 8, stopAfter = Infinity } = {}) {
  const e = new MissionEngine(mission);
  let guard = 0, acts = 0;
  while (e.running && guard++ < 2000) {
    const o = e.objectives.find((x) => x.active && x.required) || e.objectives.find((x) => x.active);
    if (!o || acts >= stopAfter) { e.tick(pace); continue; }
    e.tick(pace);
    if (!e.running) break;
    acts++;
    if (o.type === OBJ.DESTROY) e.groundDestroyed(o.def.targetType);
    else if (o.type === OBJ.CHECKPOINTS) e.checkpoint(o.progress);
    else e.airKill(objectiveRole(o));
  }
  return e;
}

describe('미션 데이터', () => {
  it('스키마: 모든 참조가 유효하고 빠진 값이 없다', () => {
    expect(validateMissions(MISSIONS, CAMPAIGNS.filter((c) => MISSIONS.some((m) => m.campaign === c.id)))).toEqual([]);
  });
  it('검증기가 실제로 잘못을 잡는다', () => {
    const bad = [{ id: 'x1', campaign: 'c1', title: 't', brief: 'b', refTime: 60, waves: [{ count: 1 }], groundTargets: [{ type: 'radar', near: 'nope' }],
      objectives: [{ id: 'o1', type: 'destroy', targetType: 'radar', count: 2, points: 100 }, { id: 'o2', type: 'killAir', count: 3, points: 0, after: 'zz' }] }];
    const errs = validateMissions(bad, CAMPAIGNS).join('\n');
    for (const word of ['near nope', '폭탄이 없다', '1개뿐', 'points 필요', 'after zz', 'fighter 1대뿐']) expect(errs).toContain(word);
  });
  it('미션 ID·다음 미션: 같은 캠페인 안에서만 이어진다', () => {
    for (const [old, id] of Object.entries(LEGACY_MISSION_IDS)) expect(missionById(old).id).toBe(id);
    expect(nextMission('c1m1').id).toBe('c1m2');
    const last = MISSIONS.filter((m) => m.campaign === 'c1').pop();
    expect(nextMission(last.id)).toBe(null);
  });
});

describe('미션 엔진', () => {
  it('모든 미션: 봇이 목표를 순서대로 처리하면 승리하고 점수·등급이 나온다', () => {
    for (const m of MISSIONS) {
      const e = playMission(m, { pace: 4 });
      expect(e.outcome, m.id).toBe(OUTCOME.WON);
      const score = e.score();
      expect(score, m.id).toBeGreaterThan(0);
      expect(score, m.id).toBeLessThanOrEqual(referenceScore(m));
      expect(['S', 'A', 'B', 'C'], m.id).toContain(gradeFor(m, score, true));
    }
  });
  it('모든 미션: 체력 0이면 패배하고 그때까지의 부분 점수만 남는다(시간 점수 없음)', () => {
    for (const m of MISSIONS) {
      const e = playMission(m, { pace: 4, stopAfter: 1 });
      if (e.running) e.playerDead();
      if (e.outcome === OUTCOME.WON) continue; // 한 번에 끝나는 미션
      expect(e.outcome, m.id).toBe(OUTCOME.LOST);
      expect(e.timeBonus()).toBe(0);
      expect(e.score()).toBeLessThan(referenceScore(m) - m.refTime * 10);
      expect(gradeFor(m, e.score(), false)).toBe(null);
    }
  });
  it('이식한 미션 1~3은 예전 규칙(격추당 1000점 + 남은 시간 × 10)과 점수가 같다', () => {
    const old = { c1m1: [3, 90], c1m2: [4, 120], c1m3: [5, 150] };
    for (const [id, [count, par]] of Object.entries(old)) {
      const m = missionById(id);
      expect(referenceScore(m)).toBe(count * 1000 + par * 10);
      const e = new MissionEngine(m);
      e.tick(40.25);
      for (let i = 0; i < count - 1; i++) e.airKill();
      expect(e.score()).toBe((count - 1) * 1000); // 진행 중: 격추당 1000점
      e.airKill();
      expect(e.outcome).toBe(OUTCOME.WON);
      expect(e.score()).toBe(Math.round(count * 1000 + Math.max(0, par - 40.25) * 10));
      const lost = new MissionEngine(m);
      lost.airKill(); lost.playerDead();
      expect(lost.score(30)).toBe(1000);
    }
  });
  it('목표 유형별 승패 규칙', () => {
    const base = { id: 't', campaign: 'c1', title: 't', brief: 'b', refTime: 100 };
    // 단계형 + 선택 목표
    let e = new MissionEngine({ ...base, objectives: [
      { id: 'a', type: 'destroy', targetType: 'sam', count: 2, points: 1200 },
      { id: 'b', type: 'destroy', targetType: 'comm_tower', count: 1, points: 800, after: 'a' },
      { id: 'c', type: 'killAir', count: 2, points: 1000, required: false }] });
    expect(e.groundDestroyed('comm_tower')).toBe(false); // 아직 활성화 전
    e.groundDestroyed('sam'); e.airKill(); e.groundDestroyed('sam');
    expect(e.byId.get('b').active).toBe(true);
    e.groundDestroyed('comm_tower');
    expect(e.outcome).toBe(OUTCOME.WON);
    expect(e.score(100)).toBe(1200 + 800 + 500); // 선택 목표는 절반만
    // 수송기 도달 → 실패
    e = new MissionEngine({ ...base, objectives: [{ id: 'a', type: 'intercept', role: 'transport', count: 3, points: 2100 }] });
    e.airKill('transport'); e.escaped('transport');
    expect([e.outcome, e.reason]).toEqual([OUTCOME.LOST, LOSS.ESCAPED]);
    expect(e.score()).toBe(700);
    // 시간제한 요격: 제한시간을 넘기면 실패
    e = new MissionEngine({ ...base, objectives: [{ id: 'a', type: 'timedKill', count: 8, points: 8000, timeLimit: 150 }] });
    for (let i = 0; i < 7; i++) e.airKill();
    e.tick(149); expect(e.running).toBe(true); expect(e.timeLeft()).toBeCloseTo(1);
    e.tick(2);
    expect([e.outcome, e.reason]).toEqual([OUTCOME.LOST, LOSS.TIMEOUT]);
    // 체크포인트: 순서대로만
    e = new MissionEngine({ ...base, objectives: [{ id: 'a', type: 'checkpoints', count: 3, points: 1500 }] });
    expect(e.checkpoint(1)).toBe(false);
    expect(e.nextCheckpoint()).toBe(0);
    e.checkpoint(0); e.checkpoint(1); e.checkpoint(2);
    expect(e.outcome).toBe(OUTCOME.WON);
    // 미션 전체 제한시간
    e = new MissionEngine({ ...base, timeLimit: 240, objectives: [{ id: 'a', type: 'destroy', count: 4, points: 3000 }] });
    e.tick(241);
    expect(e.reason).toBe(LOSS.TIMEOUT);
    // 보스 + 호위(선택)
    e = new MissionEngine({ ...base, objectives: [{ id: 'a', type: 'boss', points: 3000 }, { id: 'b', type: 'killAir', count: 2, points: 2000, required: false }] });
    e.airKill('fighter'); e.airKill('boss');
    expect(e.outcome).toBe(OUTCOME.WON);
    expect(e.score(100)).toBe(4000);
    // 끝난 뒤의 사건은 무시한다
    e.airKill('fighter');
    expect(e.score(100)).toBe(4000);
  });
});

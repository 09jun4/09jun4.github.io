import { describe, it, expect } from 'vitest';
import { raySphere, aimHit, segmentSphere, angleBetween } from '../src/combat/hit-test.js';
import { createGun } from '../src/combat/gun.js';
import { WEAPONS } from '../src/data/weapons.js';
import { computeScore, referenceScore, gradeFor, betterGrade } from '../src/core/scoring.js';
import { MISSIONS, missionEnemyCount } from '../src/data/missions.js';

const DT = 1 / 60;

describe('명중 판정', () => {
  it('raySphere', () => {
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, -100, 10)).toBeCloseTo(90, 5);
    expect(raySphere(0, 0, 0, 0, 0, -1, 30, 0, -100, 10)).toBe(-1);
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, 100, 10)).toBe(-1); // 뒤에 있는 표적
  });
  it('aimHit: 먼 표적은 각도 보정 반경으로 맞는다', () => {
    const tan1deg = Math.tan(Math.PI / 180);
    expect(aimHit(0, 0, 0, 0, 0, -1, 14, 0, -1000, 10, tan1deg, 1500)).toBeGreaterThan(0); // 1000m에서 14m 벗어남 < 17.5m
    expect(aimHit(0, 0, 0, 0, 0, -1, 14, 0, -200, 10, tan1deg, 1500)).toBe(-1); // 200m에서는 기본 반경 10m
    expect(aimHit(0, 0, 0, 0, 0, -1, 0, 0, -2000, 10, tan1deg, 1500)).toBe(-1); // 사거리 밖
  });
  it('segmentSphere: 빠른 발사체가 한 스텝에 지나쳐도 잡는다', () => {
    expect(segmentSphere(0, 0, 50, 0, 0, -50, 3, 0, 0, 5)).toBe(true);
    expect(segmentSphere(0, 0, 50, 0, 0, 20, 3, 0, 0, 5)).toBe(false);
  });
  it('angleBetween', () => {
    expect(angleBetween(1, 0, 0, 0, 1, 0)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('기관포 과열', () => {
  function ctxStub() {
    const stats = { gunShots: 0, gunHits: 0 };
    const v = { x: 0, y: 0, z: 0, copy() { return this; }, addScaledVector() { return this; } };
    return {
      stats, enemies: [], aim: { origin: v, dir: v }, player: { flight: { pos: v } },
      fx: { tracer() {}, muzzleFlash() {}, spark() {} }, rig: { addShake() {} }, audio: { play() {} },
      muzzleWorld: (o) => o, markWeaponUsed() {}, random: () => 0.5,
    };
  }
  it('초당 12발, 약 3.8초 연사로 과열 → 2.5초 발사 불가 → 냉각', () => {
    const gun = createGun(WEAPONS.gun);
    const ctx = ctxStub();
    let t = 0;
    while (!gun.overheated && t < 10) { gun.update(DT, ctx, true, true); t += DT; }
    expect(t).toBeGreaterThan(3.6);
    expect(t).toBeLessThan(4.0);
    expect(ctx.stats.gunShots).toBe(Math.ceil(1 / WEAPONS.gun.heatPerShot));
    const shots = ctx.stats.gunShots;
    for (let i = 0; i < Math.round(2.4 / DT); i++) gun.update(DT, ctx, true, true);
    expect(ctx.stats.gunShots).toBe(shots); // 잠금 중에는 버튼을 눌러도 나가지 않는다
    expect(gun.overheated).toBe(true);
    for (let i = 0; i < Math.round(0.2 / DT); i++) gun.update(DT, ctx, true, false);
    expect(gun.overheated).toBe(false);
    expect(gun.heat).toBeLessThan(0.3); // 잠금 동안 식었다
  });
  it('1초 연사 = 12발, 쏘지 않으면 초당 30% 식는다', () => {
    const gun = createGun(WEAPONS.gun);
    const ctx = ctxStub();
    for (let i = 0; i < 60; i++) gun.update(DT, ctx, true, true);
    expect(ctx.stats.gunShots).toBe(12);
    const heat = gun.heat;
    expect(heat).toBeCloseTo(12 * WEAPONS.gun.heatPerShot, 5);
    for (let i = 0; i < 30; i++) gun.update(DT, ctx, true, false);
    expect(heat - gun.heat).toBeGreaterThan(0.09);
    expect(heat - gun.heat).toBeLessThan(0.16);
  });
  it('선택되지 않은 무장은 발사되지 않는다', () => {
    const gun = createGun(WEAPONS.gun);
    const ctx = ctxStub();
    for (let i = 0; i < 60; i++) gun.update(DT, ctx, false, true);
    expect(ctx.stats.gunShots).toBe(0);
  });
});

describe('점수·등급', () => {
  const m1 = MISSIONS[0];
  it('점수식과 기준 점수', () => {
    expect(missionEnemyCount(m1)).toBe(3);
    expect(referenceScore(m1)).toBe(3000 + 900);
    expect(computeScore(m1, 3, 60, true)).toBe(3000 + 300);
    expect(computeScore(m1, 3, 200, true)).toBe(3000); // 기준 시간을 넘기면 시간 점수 0
    expect(computeScore(m1, 1, 30, false)).toBe(1000); // 실패: 격추 점수만
  });
  it('등급 경계', () => {
    const ref = referenceScore(m1);
    expect(gradeFor(m1, Math.ceil(ref * 0.9), true)).toBe('S');
    expect(gradeFor(m1, Math.ceil(ref * 0.75), true)).toBe('A');
    expect(gradeFor(m1, Math.ceil(ref * 0.55), true)).toBe('B');
    expect(gradeFor(m1, Math.floor(ref * 0.5), true)).toBe('C');
    expect(gradeFor(m1, ref, false)).toBe(null); // 실패 시 등급 없음
  });
  it('미션 구성: 3·4·5대, 기준 시간 90·120·150초', () => {
    expect(MISSIONS.map(missionEnemyCount)).toEqual([3, 4, 5]);
    expect(MISSIONS.map((m) => m.parTime)).toEqual([90, 120, 150]);
    expect(MISSIONS.map((m) => m.waves.length)).toEqual([1, 2, 3]);
  });
  it('betterGrade', () => {
    expect(betterGrade('A', 'S')).toBe('S');
    expect(betterGrade(null, 'C')).toBe('C');
    expect(betterGrade('B', null)).toBe('B');
  });
});

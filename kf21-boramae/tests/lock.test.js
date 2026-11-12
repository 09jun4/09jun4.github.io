import { describe, it, expect } from 'vitest';
import { LockOn, LOCK } from '../src/combat/lock-on.js';
import { WEAPONS } from '../src/data/weapons.js';
import { DEG } from '../src/core/math.js';

const DT = 1 / 60;
const R = WEAPONS.missile.lock.radius * DEG;
const mk = (angle) => ({ alive: true, angle });
const angleOf = (e) => e.angle;

describe('미사일 락온', () => {
  it('탐색 → 추적 → 0.5초 유지 시 락온 완료', () => {
    const lock = new LockOn(R, WEAPONS.missile.lock.time);
    const e = mk(3 * DEG);
    expect(lock.state).toBe(LOCK.SEARCH);
    expect(lock.update(DT, true, [e], angleOf)).toBe('acquired');
    expect(lock.state).toBe(LOCK.TRACKING);
    let t = DT, ev = '';
    while (ev !== 'locked' && t < 5) { ev = lock.update(DT, true, [e], angleOf); t += DT; }
    expect(t).toBeGreaterThan(0.45);
    expect(t).toBeLessThan(0.6);
    expect(WEAPONS.missile.lock.time).toBe(0.5);
    expect(lock.state).toBe(LOCK.LOCKED);
    expect(lock.progress).toBe(1);
  });
  it('반경 안의 적 중 화면 중심에 가장 가까운 적을 고른다', () => {
    const lock = new LockOn(R, 2);
    const a = mk(6 * DEG), b = mk(2 * DEG), c = mk(20 * DEG);
    lock.update(DT, true, [a, b, c], angleOf);
    expect(lock.target).toBe(b);
  });
  it('반경 밖이면 포착하지 않는다', () => {
    const lock = new LockOn(R, 2);
    lock.update(DT, true, [mk(8.5 * DEG)], angleOf);
    expect(lock.target).toBe(null);
    expect(lock.state).toBe(LOCK.SEARCH);
  });
  it('대상이 반경을 벗어나면 즉시 초기화(락온 완료 뒤에도)', () => {
    const lock = new LockOn(R, 2);
    const e = mk(1 * DEG);
    for (let i = 0; i < 60; i++) lock.update(DT, true, [e], angleOf);
    expect(lock.progress).toBeGreaterThan(0.4);
    e.angle = 9 * DEG;
    expect(lock.update(DT, true, [e], angleOf)).toBe('lost');
    expect(lock.state).toBe(LOCK.SEARCH);
    expect(lock.progress).toBe(0);
    e.angle = 1 * DEG;
    for (let i = 0; i < 130; i++) lock.update(DT, true, [e], angleOf);
    expect(lock.state).toBe(LOCK.LOCKED);
    e.angle = 30 * DEG;
    lock.update(DT, true, [e], angleOf);
    expect(lock.state).toBe(LOCK.SEARCH);
  });
  it('대상이 격추되면 초기화, 미사일 모드가 아니면 락온하지 않는다', () => {
    const lock = new LockOn(R, 2);
    const e = mk(0);
    lock.update(DT, true, [e], angleOf);
    e.alive = false;
    lock.update(DT, true, [e], angleOf);
    expect(lock.target).toBe(null);
    e.alive = true;
    for (let i = 0; i < 200; i++) lock.update(DT, false, [e], angleOf);
    expect(lock.state).toBe(LOCK.SEARCH);
  });
});

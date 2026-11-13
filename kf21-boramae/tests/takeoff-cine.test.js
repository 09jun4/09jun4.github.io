import { describe, it, expect } from 'vitest';
import { CINE, SHOTS, TRACKS, CAMERAS, trackAt, shotAt, stateAt, newState, cameraAt, wakeAmount, wakeNoise } from '../src/data/takeoff-cine.js';

describe('이륙 시네마틱 타임라인', () => {
  it('샷이 0~8초를 빈틈·겹침 없이 덮는다', () => {
    expect(SHOTS[0].t0).toBe(0);
    expect(SHOTS[SHOTS.length - 1].t1).toBe(CINE.duration);
    for (let i = 1; i < SHOTS.length; i++) expect(SHOTS[i].t0).toBe(SHOTS[i - 1].t1);
    expect(SHOTS.map((s) => [s.t0, s.t1])).toEqual([[0, 1], [1, 3], [3, 5], [5, 7], [7, 8]]);
    expect([0.5, 2, 4, 6, 7.5].map((t) => shotAt(t).id)).toEqual(['pilot', 'start', 'side', 'gear', 'flyby']);
  });
  it('키프레임 시간이 단조 증가하고 0~8초를 덮는다', () => {
    for (const [name, keys] of Object.entries(TRACKS)) {
      expect(keys[0][0], name).toBe(0);
      expect(keys[keys.length - 1][0], name).toBe(CINE.duration);
      for (let i = 1; i < keys.length; i++) expect(keys[i][0], name).toBeGreaterThan(keys[i - 1][0]);
    }
    for (const c of Object.values(CAMERAS)) for (let i = 1; i < (c.keys || []).length; i++) expect(c.keys[i][0]).toBeGreaterThan(c.keys[i - 1][0]);
  });
  it('기체 상태: 활주 → 이륙 → 기어 접힘 → 수평 비행으로 끝난다', () => {
    const s = newState();
    expect(stateAt(1, s).speed).toBe(0);
    expect(stateAt(4, s).flap).toBeCloseTo(25, 0); // 플랩 0 → 25 → 15
    expect(stateAt(4.5, s).flap).toBeCloseTo(15, 0);
    expect(stateAt(4.4, s).agl).toBe(0);
    expect(stateAt(5.2, s).agl).toBeGreaterThan(3);
    expect(stateAt(5.4, s).gear).toBe(1);
    expect(stateAt(6.6, s).gear).toBe(0);
    let prev = -1;
    for (let t = 0; t <= 8; t += 0.1) { const d = stateAt(t, s).dist; expect(d).toBeGreaterThanOrEqual(prev); prev = d; }
    stateAt(8, s);
    expect([s.agl, s.speed, s.pitch, s.gear, s.flap]).toEqual([CINE.endAgl, CINE.endSpeed, 0, 0, 0]);
    expect(s.dist).toBeLessThan(2800 - 250); // 활주로 안에서 떠오른다
    expect(trackAt(TRACKS.fov, 1.75)).toBe(75);
    expect(trackAt(TRACKS.scaleZ, 2)).toBe(1);
  });
  it('카메라: 1인칭 → 측면 추적(약 25m → 20m) → 물러난 고정 샷', () => {
    const c = {};
    expect(cameraAt(2, c).mode).toBe('cockpit');
    cameraAt(4, c);
    expect(c.mode).toBe('rel');
    expect(Math.hypot(c.px, c.pz)).toBeGreaterThan(20);
    cameraAt(6, c);
    expect(Math.hypot(c.px, c.pz)).toBeLessThan(21.5);
    expect(c.py).toBeLessThan(0); // 기체보다 낮다: 하부가 보인다
    const a = cameraAt(7.1, {}), b = cameraAt(7.9, {});
    expect(a.mode).toBe('fixed');
    expect([a.px, a.py, a.pz, a.lx, a.ly, a.lz]).toEqual([b.px, b.py, b.pz, b.lx, b.ly, b.lz]); // 고정, 회전 없음
    // 통과: 7.0초에는 멀고, 가장 가까울 때는 와류 범위(40m) 안
    const s = newState();
    const dist = (t) => { stateAt(t, s); return Math.hypot(a.px, a.py - s.agl, a.pz + s.dist); };
    expect(dist(7)).toBeGreaterThan(60);
    expect(Math.min(...[7.5, 7.6, 7.7, 7.8, 7.9].map(dist))).toBeLessThan(CINE.wake.range);
  });
  it('와류 흔들림: 가까울수록 크고, 40m 밖에서는 사라진다', () => {
    expect(wakeAmount(10)).toBe(1);
    expect(wakeAmount(20)).toBeGreaterThan(wakeAmount(35));
    expect(wakeAmount(35)).toBeGreaterThan(0);
    expect(wakeAmount(60, 0)).toBe(0);
    expect(wakeAmount(60, 0.5)).toBeLessThan(wakeAmount(39));
    for (let t = 0; t < 2; t += 0.013) expect(Math.abs(wakeNoise(t, 1.7))).toBeLessThanOrEqual(1);
  });
});

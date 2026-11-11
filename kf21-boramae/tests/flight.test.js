import { describe, it, expect } from 'vitest';
import { createFlightState, resetFlight, stepFlight } from '../src/flight/flight-model.js';
import { KF21 } from '../src/data/aircraft.js';
import { DEG, RAD } from '../src/core/math.js';

const DT = 1 / 60;
function fly(seconds, input, s = resetFlight(createFlightState(), KF21), onStep) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) { stepFlight(s, input, KF21, DT); if (onStep) onStep(s, i * DT); }
  return s;
}

describe('비행 모델 — 조작감 기준', () => {
  it('(a) 입력 지연이 느껴지지 않는다: 0.1초 안에 최대 각속도의 60% 이상', () => {
    const p = fly(0.1, { pitch: 1, turn: 0 });
    expect(p.pitchRate * RAD).toBeGreaterThan(KF21.rates.pitchMax * 0.6);
    const t = fly(0.15, { pitch: 0, turn: 1 });
    expect(t.yawRate * RAD).toBeGreaterThan(KF21.rates.yawMax * 0.6);
  });

  it('(c) 무한 상승으로 도망칠 수 없다: 속도가 떨어지고 기수가 숙여진다', () => {
    let maxPitch = 0;
    const s = fly(60, { pitch: 1, turn: 0 }, undefined, (st, t) => { if (t > 20) maxPitch = Math.max(maxPitch, st.pitch); });
    expect(s.speed).toBeGreaterThanOrEqual(KF21.speed.min);
    expect(s.speed).toBeLessThan(KF21.speed.min + KF21.stall.margin);
    expect(maxPitch * RAD).toBeLessThan(50); // 계속 당겨도 지속 상승각은 제한된다
    expect(s.pos.y).toBeLessThanOrEqual(KF21.altitude.ceilHard);
  });

  it('(c) 상한 고도에서는 더 올라가지 못한다', () => {
    const s = fly(240, { pitch: 1, turn: 0 });
    expect(s.pos.y).toBeLessThanOrEqual(KF21.altitude.ceilHard);
    expect(s.pitch * RAD).toBeLessThan(8);
  });

  it('(c) 무한 선회: 속도를 잃고 선회율이 최대치보다 낮게 유지된다', () => {
    const s = fly(30, { pitch: 0, turn: 1 });
    expect(s.speed).toBeLessThan(KF21.speed.cruise - 10);
    expect(s.speed).toBeGreaterThanOrEqual(KF21.speed.min);
    expect(Math.abs(s.yawRate) * RAD).toBeLessThanOrEqual(KF21.rates.yawMax);
    expect(Math.abs(s.roll) * RAD).toBeLessThanOrEqual(KF21.rates.rollMax + 0.01);
  });

  it('(d) 입력을 놓으면 안정적으로 수평을 회복한다', () => {
    const s = fly(3, { pitch: 1, turn: 1 });
    expect(Math.abs(s.roll) * RAD).toBeGreaterThan(40);
    fly(2.5, { pitch: 0, turn: 0 }, s);
    expect(Math.abs(s.roll) * RAD).toBeLessThan(3);
    expect(Math.abs(s.yawRate) * RAD).toBeLessThan(1);
    fly(12, { pitch: 0, turn: 0 }, s);
    expect(Math.abs(s.pitch) * RAD).toBeLessThan(3);
    // 수평 비행에서는 순항속도로 수렴
    fly(40, { pitch: 0, turn: 0 }, s);
    expect(s.speed).toBeCloseTo(KF21.speed.cruise, 0);
  });

  it('상승하면 감속, 하강하면 가속(범위 안)', () => {
    const up = fly(6, { pitch: 1, turn: 0 });
    expect(up.speed).toBeLessThan(KF21.speed.cruise - 8);
    const down = fly(6, { pitch: -1, turn: 0 });
    expect(down.speed).toBeGreaterThan(KF21.speed.cruise + 8);
    expect(down.speed).toBeLessThanOrEqual(KF21.speed.max);
  });

  it('고도 하한: 계속 기수를 내려도 그 아래로 내려가지 않고 부드럽게 들어 올린다', () => {
    let minY = Infinity;
    let maxRate = 0;
    const s = fly(90, { pitch: -1, turn: 0 }, undefined, (st) => {
      minY = Math.min(minY, st.pos.y);
      maxRate = Math.max(maxRate, Math.abs(st.pitchRate));
    });
    expect(minY).toBeGreaterThanOrEqual(KF21.altitude.floorHard);
    expect(minY).toBeGreaterThan(KF21.altitude.floorHard + 20); // 바닥에 닿기 전에 회복
    expect(maxRate * RAD).toBeLessThanOrEqual(KF21.rates.pitchMax + 0.01);
    expect(s.pitch).toBeGreaterThan(-25 * DEG);
  });

  it('프레임 중 NaN이 생기지 않는다', () => {
    const s = fly(20, { pitch: -1, turn: -1 });
    fly(20, { pitch: 1, turn: 1 }, s);
    for (const v of [s.pos.x, s.pos.y, s.pos.z, s.yaw, s.pitch, s.roll, s.speed]) expect(Number.isFinite(v)).toBe(true);
  });
});

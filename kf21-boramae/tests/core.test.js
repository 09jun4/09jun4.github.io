import { describe, it, expect } from 'vitest';
import { GameLoop } from '../src/core/game-loop.js';
import { StateMachine } from '../src/core/state-machine.js';
import { STATE, TRANSITIONS, LOOP } from '../src/data/app.js';
import { wrapAngle, damp, moveToward, makeRng } from '../src/core/math.js';

function makeLoop() {
  const log = { steps: 0, renders: 0, alpha: 0 };
  const loop = new GameLoop({ ...LOOP, step: () => { log.steps++; }, render: (a) => { log.renders++; log.alpha = a; } });
  return { loop, log };
}

describe('GameLoop', () => {
  it('프레임 길이가 달라도 같은 시간에는 같은 스텝 수를 돈다', () => {
    const a = makeLoop();
    for (let i = 0; i < 60; i++) a.loop.advance(1 / 60);
    const b = makeLoop();
    for (let i = 0; i < 20; i++) b.loop.advance(1 / 20);
    const c = makeLoop();
    for (let i = 0; i < 144; i++) c.loop.advance(1 / 144);
    expect(Math.abs(a.log.steps - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.log.steps - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.log.steps - 60)).toBeLessThanOrEqual(1);
  });
  it('긴 정지(탭 복귀) 뒤에도 시간 점프가 없다', () => {
    const { loop, log } = makeLoop();
    loop.advance(30);
    expect(log.steps).toBe(Math.round(LOOP.maxFrameDelta * LOOP.hz));
    expect(log.renders).toBe(1);
  });
  it('보간 계수는 0 이상 1 미만이다', () => {
    const { loop, log } = makeLoop();
    for (let i = 0; i < 50; i++) { loop.advance(0.0123); expect(log.alpha).toBeGreaterThanOrEqual(0); expect(log.alpha).toBeLessThan(1); }
  });
  it('timeScale 0이면 멈춘다', () => {
    const { loop, log } = makeLoop();
    loop.timeScale = 0;
    loop.advance(0.1);
    expect(log.steps).toBe(0);
  });
});

describe('StateMachine', () => {
  it('허용된 전환만 통과시키고 enter/exit을 부른다', () => {
    const fsm = new StateMachine(TRANSITIONS);
    const calls = [];
    for (const s of Object.values(STATE)) fsm.add(s, { enter: () => calls.push('in:' + s), exit: () => calls.push('out:' + s) });
    fsm.go(STATE.MENU);
    fsm.go(STATE.SELECT);
    expect(calls).toEqual(['in:menu', 'out:menu', 'in:select']);
    expect(() => fsm.go(STATE.RESULT)).toThrow();
    expect(fsm.name).toBe(STATE.SELECT);
  });
});

describe('math', () => {
  it('wrapAngle', () => {
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI, 6); // ±PI는 같은 각도
    expect(wrapAngle(Math.PI * 2 + 0.3)).toBeCloseTo(0.3, 6);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 6);
  });
  it('damp는 프레임률과 무관하게 같은 곳에 도달한다', () => {
    let a = 0; for (let i = 0; i < 60; i++) a = damp(a, 1, 0.2, 1 / 60);
    let b = 0; for (let i = 0; i < 30; i++) b = damp(b, 1, 0.2, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
  });
  it('moveToward / makeRng', () => {
    expect(moveToward(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(moveToward(0.9, 1, 0.3)).toBe(1);
    const r1 = makeRng(7), r2 = makeRng(7);
    expect(r1()).toBe(r2());
  });
});

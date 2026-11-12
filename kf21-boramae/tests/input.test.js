import { describe, it, expect } from 'vitest';
import { Input } from '../src/core/input.js';
import { INPUT } from '../src/data/input.js';

function make(settings = {}) {
  const inp = new Input();
  inp.setSettings({ get: (k) => ({ steerEnabled: true, steerSens: 1, steerInvertY: false, mouseSensitivity: 1, ...settings })[k] });
  return inp;
}
const ax = (inp) => inp.flightAxes({ pitch: 0, turn: 0 });
// dt 간격으로 프레임을 돌리며 마우스를 (vx, vy) px/s로 움직인다
function run(inp, vx, vy, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) { inp._acc.x += vx * dt; inp._acc.y += vy * dt; inp.poll(dt); }
}

describe('입력 계층: 우클릭 조향', () => {
  it('우클릭을 누르고 오른쪽·위로 움직이면 우선회·상승, 속도에 비례한다', () => {
    const inp = make(); inp.mouse.right = true;
    run(inp, 600, -600, 0.6); // 최대 속도의 절반
    const half = ax(inp);
    expect(half.turn).toBeGreaterThan(0.4); expect(half.turn).toBeLessThan(0.6);
    expect(half.pitch).toBeGreaterThan(0.4);
    run(inp, 1500, -1500, 0.6); // 최대 이상 → 1로 자른다
    expect(ax(inp).turn).toBeCloseTo(1, 1);
    run(inp, -600, 600, 1); // 반대로
    expect(ax(inp).turn).toBeLessThan(-0.3); expect(ax(inp).pitch).toBeLessThan(-0.3);
  });
  it('마우스가 멈추면 약 0.15초 시정수로 0에 돌아간다', () => {
    const inp = make(); inp.mouse.right = true;
    run(inp, 1200, 0, 1);
    expect(ax(inp).turn).toBeGreaterThan(0.9);
    run(inp, 0, 0, 0.15);
    expect(ax(inp).turn).toBeLessThan(0.45);
    run(inp, 0, 0, 1);
    expect(Math.abs(ax(inp).turn)).toBeLessThan(0.01);
  });
  it('우클릭을 놓으면 조향이 사라지고, 끄면 무시한다', () => {
    const inp = make(); inp.mouse.right = true; run(inp, 1200, 0, 0.5);
    inp.mouse.right = false; run(inp, 1200, 0, 1.2);
    expect(ax(inp).turn).toBe(0);
    const off = make({ steerEnabled: false }); off.mouse.right = true; run(off, 1200, 0, 0.5);
    expect(ax(off).turn).toBe(0);
  });
  it('감도·상하 반전', () => {
    const a = make({ steerSens: 2 }); a.mouse.right = true; run(a, 300, 0, 0.6);
    const b = make({ steerSens: 1 }); b.mouse.right = true; run(b, 300, 0, 0.6);
    expect(ax(a).turn).toBeGreaterThan(ax(b).turn * 1.7);
    const inv = make({ steerInvertY: true }); inv.mouse.right = true; run(inv, 0, -1000, 0.6);
    expect(ax(inv).pitch).toBeLessThan(-0.3); // 위로 움직이는데 반전 → 하강
  });
  it('WASD가 하나라도 눌려 있으면 우클릭 조향은 무시하고, 놓으면 다시 동작한다', () => {
    const inp = make(); inp.mouse.right = true; run(inp, 1200, 0, 0.6);
    inp.keys.add('KeyW');
    expect(ax(inp)).toEqual({ pitch: -1, turn: 0 }); // W = 기수 내림, 조향 turn은 섞이지 않는다
    inp.keys.add('KeyD');
    expect(ax(inp)).toEqual({ pitch: -1, turn: 1 });
    inp.keys.clear();
    expect(ax(inp).turn).toBeGreaterThan(0.5);
  });
  it('조이스틱·자이로·조향 합이 ±1로 잘린다', () => {
    const inp = make(); inp.stick.x = 0.8; inp.gyro.x = 0.6; inp.stick.y = -0.7; inp.gyro.y = -0.7;
    expect(ax(inp)).toEqual({ pitch: -1, turn: 1 });
  });
  it('마우스 이동 입력 상수', () => {
    expect(INPUT.steerSpeed).toBe(1200); expect(INPUT.steerTau).toBe(0.08); expect(INPUT.steerReleaseTau).toBe(0.15);
  });
});

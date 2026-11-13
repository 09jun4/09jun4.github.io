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

// 마우스를 (dx, dy)px 옮긴 뒤 seconds 동안 가만히 둔다
function move(inp, dx, dy, seconds = 0.5, dt = 1 / 60) {
  inp._acc.x += dx; inp._acc.y += dy;
  for (let t = 0; t < seconds; t += dt) inp.poll(dt);
}

describe('입력 계층: 우클릭 조향(조이스틱 방식)', () => {
  it('누른 점에서 벗어난 거리·방향이 조향이고, 마우스를 멈춰도 누르고 있는 동안 유지된다', () => {
    const inp = make(); inp.mouse.right = true; inp.poll(1 / 60);
    move(inp, INPUT.steerRadius * 0.55, -INPUT.steerRadius * 0.55);
    const half = ax(inp);
    expect(half.turn).toBeGreaterThan(0.4); expect(half.turn).toBeLessThan(0.65);
    expect(half.pitch).toBeGreaterThan(0.4); // 위로 = 상승
    move(inp, 0, 0, 2); // 2초 동안 가만히: 그대로 유지
    expect(ax(inp).turn).toBeCloseTo(half.turn, 2);
    move(inp, INPUT.steerRadius * 3, 0); // 반경 밖으로 나가도 1에서 멈춘다
    expect(ax(inp).turn).toBeCloseTo(1, 2);
    move(inp, -INPUT.steerRadius, 0); // 반대로 움직이면 바로 줄어든다(중심으로 복귀)
    expect(Math.abs(ax(inp).turn)).toBeLessThan(0.05);
    move(inp, -INPUT.steerRadius, 0);
    expect(ax(inp).turn).toBeCloseTo(-1, 2);
  });
  it('버튼을 놓으면 0으로 돌아가고, 다시 누르면 그 자리가 새 중심이다', () => {
    const inp = make(); inp.mouse.right = true; inp.poll(1 / 60);
    move(inp, INPUT.steerRadius, 0);
    expect(ax(inp).turn).toBeGreaterThan(0.95);
    inp.mouse.right = false; move(inp, 400, 0, 1);
    expect(ax(inp).turn).toBe(0);
    inp.mouse.right = true; move(inp, 0, 0, 0.5);
    expect(ax(inp).turn).toBe(0); // 새 중심
    const off = make({ steerEnabled: false }); off.mouse.right = true; move(off, 500, 0);
    expect(ax(off).turn).toBe(0);
  });
  it('불감대·감도·상하 반전', () => {
    const d = make(); d.mouse.right = true; d.poll(1 / 60); move(d, INPUT.steerRadius * INPUT.steerDeadzone * 0.8, 0);
    expect(ax(d).turn).toBe(0);
    const a = make({ steerSens: 2 }); a.mouse.right = true; a.poll(1 / 60); move(a, 40, 0);
    const b = make({ steerSens: 1 }); b.mouse.right = true; b.poll(1 / 60); move(b, 40, 0);
    expect(ax(a).turn).toBeGreaterThan(ax(b).turn * 1.7);
    const inv = make({ steerInvertY: true }); inv.mouse.right = true; inv.poll(1 / 60); move(inv, 0, -100);
    expect(ax(inv).pitch).toBeLessThan(-0.3); // 위로 움직이는데 반전 → 하강
  });
  it('WASD가 하나라도 눌려 있으면 우클릭 조향은 무시하고, 놓으면 다시 동작한다', () => {
    const inp = make(); inp.mouse.right = true; inp.poll(1 / 60); move(inp, INPUT.steerRadius, 0);
    inp.keys.add('KeyW');
    expect(ax(inp)).toEqual({ pitch: -1, turn: 0 }); // W = 기수 내림, 조향 turn은 섞이지 않는다
    inp.keys.add('KeyD');
    expect(ax(inp)).toEqual({ pitch: -1, turn: 1 });
    inp.keys.clear();
    expect(ax(inp).turn).toBeGreaterThan(0.5);
  });
  it('자이로 융합: 켜면 조이스틱은 상하만, 좌우는 기울기만. 끄면 조이스틱이 둘 다', () => {
    const inp = make(); inp.stick.x = 0.8; inp.gyro.x = -0.6; inp.stick.y = -0.7; inp.gyro.y = 0.9;
    expect(ax(inp)).toEqual({ pitch: -0.7, turn: 0.8 }); // 꺼짐: 조이스틱만
    inp.gyroOn = true;
    expect(ax(inp)).toEqual({ pitch: -0.7, turn: -0.6 }); // 켜짐: 상하 = 조이스틱, 좌우 = 자이로
  });
  it('마우스 이동 입력 상수', () => {
    expect(INPUT.steerRadius).toBe(130); expect(INPUT.steerDeadzone).toBe(0.07);
  });
});

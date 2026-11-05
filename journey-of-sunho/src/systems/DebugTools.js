// DebugTools — 개발·자동 테스트용. 주소 끝에 ?auto 를 붙이면 자동 주행(경로 추종)으로 전체 흐름을 확인할 수 있어요.
import { clamp, wrapAngle } from '../core/utils.js';

export class Autopilot {
  constructor(game) { this.game = game; this.on = false; this.speedKmh = 20; this.lane = null; }
  update() {
    const g = this.game, v = g.input.virtual;
    if (!this.on || !g.player || !g.route || (g.state && g.state !== 'playing')) return;
    const P = g.player.physics;
    const pr = g.route.project(P.x, P.z);
    const look = 6 + P.v * 1.2;
    const p = g.route.pointAt(pr.s + look);
    const lane = this.lane ?? (g.laneOffset ? g.laneOffset(pr.s) : 2.6);
    const tx = p.x - p.tz * lane, tz = p.z + p.tx * lane; // 오른쪽 차선
    const want = Math.atan2(tx - P.x, tz - P.z);
    const err = wrapAngle(want - P.heading); // + = 왼쪽
    const s = clamp(-err * 2.2, -1, 1);
    v.right = s > 0 ? s : 0;
    v.left = s < 0 ? -s : 0;
    const kmh = P.v * 3.6;
    v.up = kmh < this.speedKmh ? 1 : 0;
    v.brake = kmh > this.speedKmh + 6 ? 0.6 : 0;
  }
}

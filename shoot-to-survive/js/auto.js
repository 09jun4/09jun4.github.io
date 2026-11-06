import { hasLOS, tileOf, centerOf, findPath } from './maze.js';
import { GHOST_FLOAT } from './ghost.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const turn = (cur, goal, maxStep) => cur + Math.max(-maxStep, Math.min(maxStep, angDiff(goal, cur)));

// 자동 플레이 AI: 가상 키 입력과 시점 회전만으로 게임을 조작한다
export class Bot {
  constructor(game) { this.g = game; this.idle = 0; this.leanT = 0; this.leanDir = 0; this.swapWait = 0; }

  update(dt) {
    const { g } = this, p = g.player, w = g.weapons, keys = g.keys, grid = g.grid;
    keys.clear();
    const cx = g.camera.position.x, cz = g.camera.position.z;

    // 보이는 유령 중 가장 가까운 것
    let tgt = null, best = 1e9;
    for (const gh of g.ghosts) {
      const d = Math.hypot(gh.x - cx, gh.z - cz);
      if (d < 14 && d < best && hasLOS(grid, cx, cz, gh.x, gh.z)) { best = d; tgt = gh; }
    }

    if (tgt) {
      this.idle = 0;
      if (w.current !== 'pistol' && !w.switching) w.equip('pistol');
      const yawGoal = Math.atan2(-(tgt.x - cx), -(tgt.z - cz));
      const pitchGoal = Math.atan2(GHOST_FLOAT + 1.9 - 1.6, best); // 굽은 상체(가슴) 높이를 겨냥
      p.yaw = turn(p.yaw, yawGoal, 7 * dt);
      p.pitch = turn(p.pitch, pitchGoal, 5 * dt);
      const yErr = Math.abs(angDiff(yawGoal, p.yaw)), pErr = Math.abs(angDiff(pitchGoal, p.pitch));
      if (best < 1.7 && yErr < 0.3) { w.tryMelee(); }
      if (w.current === 'pistol' && !w.reloading && !w.switching) {
        if (w.ammo === 0 && best > 3.5) w.tryReload();
        else if (w.ammo === 0 && best < 3.5) w.tryMelee();
        else if (yErr < 0.05 && pErr < 0.06 && best > 1.5) w.tryFire();
      }
      return;
    }

    // 유령이 없으면: 탄 보충 → 손전등으로 탐색
    this.idle += dt;
    p.pitch = turn(p.pitch, 0, 2 * dt);
    if (w.ammo < 5 && !w.reloading && !w.switching && w.current === 'pistol') { w.tryReload(); return; }
    if (w.reloading) return;
    if (w.current === 'pistol' && this.idle > 1.2 && !w.switching) w.equip('flash');

    // 가장 가까운(경로 기준) 유령 쪽으로 이동
    const here = [tileOf(p.pos.x), tileOf(p.pos.z)];
    let path = null;
    for (const gh of g.ghosts) {
      const pp = findPath(grid, here, [tileOf(gh.x), tileOf(gh.z)]);
      if (pp.length && (!path || pp.length < path.length)) path = pp;
    }
    if (!path) return;
    const next = path.length > 1 ? path[1] : path[0];
    const wx = centerOf(next[0]), wz = centerOf(next[1]);
    const yawGoal = Math.atan2(-(wx - p.pos.x), -(wz - p.pos.z));
    p.yaw = turn(p.yaw, yawGoal, 4 * dt);
    if (Math.abs(angDiff(yawGoal, p.yaw)) < 0.7) keys.add('KeyW');
    // 가끔 기울여 구석 살피기 (연출)
    this.leanT -= dt;
    if (this.leanT <= 0) { this.leanDir = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1); this.leanT = 1.5 + Math.random() * 1.5; }
    if (this.leanDir < 0) keys.add('KeyQ'); else if (this.leanDir > 0) keys.add('KeyE');
  }
}

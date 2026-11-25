// 플레이어 이동 (연속 이동 + 칸 단위 충돌). 판정은 전부 논리 계층(sim.neighbor)에 물어봐요.
// 키보드: 화면 기준 방향으로 걷기. 터치/클릭: 길찾기 경로를 따라 자동 이동.
import { DIR4, ckey } from '../logic/math.js';
import { pathTo, reachable } from '../logic/Collision.js';

const R = 0.22, SPEED = 2.5;
export const yawOf = d => Math.atan2(DIR4[d][0], DIR4[d][1]);

export class Player {
  constructor(game) { this.game = game; }
  get sim() { return this.game.sim; }

  place(node, facing) {
    this.node = node.slice();
    this.x = node[0] + 0.5; this.z = node[2] + 0.5;
    this.yaw = yawOf(facing || 0);
    this.path = null; this.queued = null; this.speed = 0;
    this.pushT = 0; this.mirrorHold = null; this.lockedMsgT = 0; this.stuckT = 0;
  }
  stop() { this.path = null; this.queued = null; }

  // 발 높이 (계단이면 진행도만큼 올라감)
  get level() {
    const o = this.sim.occ.get(ckey(...this.node));
    let y = this.node[1];
    if (o && o.o.type === 'stairs' && o.functional) {
      const fx = this.x - this.node[0], fz = this.z - this.node[2];
      const p = [fx, 1 - fx, fz, 1 - fz][o.dir4];
      y += Math.max(0, Math.min(1, p));
    }
    return y;
  }

  update(dt, input) {
    let vx = 0, vz = 0;
    const moving = input.x !== 0 || input.z !== 0;
    if (moving) { this.path = null; this.queued = null; vx = input.x; vz = input.z; }
    else if (this.path) {
      const n = this.path[0];
      let tx = n[0] + 0.5, tz = n[2] + 0.5;
      if (ckey(...this.node) !== ckey(...n)) {
        // 다음 칸이 착시·숨은 통로로 이어지면 3D 중심이 아니라 그 방향 경계로 걸어가요
        for (let dd = 0; dd < 4; dd++) {
          const r = this.sim.neighbor(this.node, dd);
          if (r && r.to && ckey(...r.to) === ckey(...n) && (r.shift || r.hidden)) { tx = this.node[0] + 0.5 + DIR4[dd][0]; tz = this.node[2] + 0.5 + DIR4[dd][1]; break; }
        }
      }
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      if (d < 0.05 && ckey(...this.node) === ckey(...n)) {
        this.path.shift();
        if (!this.path.length) { this.path = null; this.arrive(); }
        return this.finish(0, 0, dt);
      }
      vx = dx / (d || 1); vz = dz / (d || 1);
      if (d < SPEED * dt) { vx *= d / (SPEED * dt); vz *= d / (SPEED * dt); }
    }
    return this.finish(vx, vz, dt);
  }

  finish(vx, vz, dt) {
    const len = Math.hypot(vx, vz);
    this.contacting = null; this.dt = dt;
    if (len > 0.001) {
      const s = SPEED * dt;
      const ox = this.x, oz = this.z;
      this.axis(0, vx * s); this.axis(2, vz * s);
      // 한쪽이 막히면 남은 방향으로 제 속도 유지 (벽을 따라 미끄러짐)
      const mx = Math.abs(this.x - ox), mz = Math.abs(this.z - oz), want = len * s;
      if (mx < Math.abs(vx * s) * 0.5 && mz > 0 && vz) this.axis(2, Math.sign(vz) * Math.max(0, want - mz) * 0.6);
      else if (mz < Math.abs(vz * s) * 0.5 && mx > 0 && vx) this.axis(0, Math.sign(vx) * Math.max(0, want - mx) * 0.6);
      this.clamp();
      const moved = Math.hypot(this.x - ox, this.z - oz);
      this.speed = moved / dt;
      if (moved > 0.0005) this.yaw = Math.atan2(vx, vz);
      if (this.path && moved < 0.0005) { this.stuckT += dt; if (this.stuckT > 0.5) { this.path = null; this.queued = null; } }
      else this.stuckT = 0;
    } else this.speed = 0;
    if (!this.contacting || this.contacting.kind !== 'push') this.pushT = 0;
    if (!this.contacting || this.contacting.kind !== 'mirror') this.mirrorHold = null;
    this.lockedMsgT = Math.max(0, this.lockedMsgT - dt);
    return this.speed;
  }

  axis(a, delta) {
    if (!delta) return;
    const n = this.node, lo = a === 0 ? n[0] : n[2], hi = lo + 1;
    const cur = a === 0 ? this.x : this.z;
    let p = cur + delta;
    const d = a === 0 ? (delta > 0 ? 0 : 1) : (delta > 0 ? 2 : 3);
    if (delta > 0 ? p + R > hi : p - R < lo) {
      const r = this.sim.neighbor(n, d);
      if (!r || r.kind !== 'move') {
        p = delta > 0 ? Math.min(p, Math.max(cur, hi - R)) : Math.max(p, Math.min(cur, lo + R));
        this.contact(r, d);
      } else if (delta > 0 ? p >= hi : p < lo) {
        this.set(a, p);
        this.cross(r, d);
        return;
      }
    }
    this.set(a, p);
  }
  set(a, p) { if (a === 0) this.x = p; else this.z = p; }
  // 현재 칸 밖으로 몸이 삐져나가지 않게 (접힌 뒤 벽이 생긴 경우 등)
  clamp() {
    const n = this.node;
    for (const [a, dPos, dNeg] of [[0, 0, 1], [2, 2, 3]]) {
      const lo = a === 0 ? n[0] : n[2], hi = lo + 1;
      let p = a === 0 ? this.x : this.z;
      if (p + R > hi) { const r = this.sim.neighbor(n, dPos); if (!r || r.kind !== 'move') p = hi - R; }
      if (p - R < lo) { const r = this.sim.neighbor(n, dNeg); if (!r || r.kind !== 'move') p = lo + R; }
      p = Math.max(lo - 0.45, Math.min(hi + 0.45, p));
      this.set(a, p);
    }
  }

  cross(r, d) {
    const to = r.to;
    if (r.shift) { this.x += r.shift[0]; this.z += r.shift[2]; } // 착시: 화면에서는 보이지 않는 깊이 이동
    if (r.hidden) { // 숨은 통로: 기둥 뒤를 지나 반대편에서 나타남
      this.x = to[0] + 0.5 - DIR4[d][0] * 0.45; this.z = to[2] + 0.5 - DIR4[d][1] * 0.45;
      this.game.onHidden();
    }
    this.node = to.slice();
    this.game.onEnterNode(to, d, r);
  }

  contact(r, d) {
    if (!r) return;
    this.contacting = r;
    const g = this.game;
    if (r.kind === 'push') {
      this.pushT += this.dt;
      if (this.pushT > 0.14) {
        this.pushT = 0;
        if (r.ok) g.doPush(r); else g.bump();
      }
    } else if (r.kind === 'mirror') {
      if (this.mirrorHold !== r.obj.o.id) { this.mirrorHold = r.obj.o.id; if (r.obj.functional) g.doMirror(r.obj.o.id); }
    } else if (r.kind === 'unlock') {
      g.doUnlock(r);
    } else if (r.kind === 'blocked' && r.locked && !this.lockedMsgT) {
      this.lockedMsgT = 2.5; g.toast('열쇠가 있어야 열 수 있는 문이에요');
    }
  }

  // ---- 터치/클릭 이동 ----
  walkTo(goal, queued) {
    const sim = this.sim, gk = ckey(...goal);
    let path = pathTo(sim, this.node, gk, true);
    let ok = !!path;
    if (!path) { // 못 가는 곳이면 가장 가까운 곳까지
      const { nodes } = reachable(sim, this.node, 4000, true);
      let best = null, bd = Infinity;
      for (const n of nodes) { const dd = Math.abs(n[0] - goal[0]) + Math.abs(n[2] - goal[2]) + Math.abs(n[1] - goal[1]) * 2; if (dd < bd) { bd = dd; best = n; } }
      path = best ? pathTo(sim, this.node, ckey(...best), true) : null;
    }
    this.path = path && path.length > 1 ? path.slice(1) : null;
    this.queued = ok ? queued || null : null;
    if (!this.path && ok) this.arrive();
    return ok;
  }
  arrive() {
    const q = this.queued;
    this.queued = null;
    if (q) this.game.runQueued(q);
  }
}

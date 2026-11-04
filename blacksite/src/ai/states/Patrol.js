// 순찰: 웨이포인트 + 지점별 대기 시간 (또는 제자리 경계: 정해진 방향을 번갈아 바라봄).
// 수색 후 복귀도 여기서 처리한다(경로로 순찰로에 돌아감).
import { DEG } from '../../utils/math.js';

export const Patrol = {
  enter(g) {
    g.icon.set(null);
    g.anim.aimTarget = 0;
    g.anim.headYawTarget = 0;
    g.p = { wait: 0, returning: true, turnT: 0, lookIdx: 0, headT: 3 + Math.random() * 3 };
    g.clearPath();
  },
  update(g, dt) {
    const p = g.p, d = g.def;
    // 시야
    const seen = g.see();
    if (seen === 'core') return g.setState('alert');
    if (seen === 'peripheral') return g.setState('suspicious', { x: g.session.player.x, z: g.session.player.z });

    // 가끔 고개를 돌려 주변을 본다
    p.headT -= dt;
    if (p.headT <= 0) {
      g.anim.headYawTarget = g.anim.headYawTarget === 0 ? (Math.random() - 0.5) * 1.1 : 0;
      p.headT = g.anim.headYawTarget === 0 ? 3 + Math.random() * 4 : 1.2 + Math.random();
    }

    if (d.mode === 'stationary') {
      const home = { x: d.pos[0], z: d.pos[2] };
      if (p.returning) {
        if (g.goTo(home.x, home.z, g.cfg.walkSpeed, dt)) { p.returning = false; p.turnT = 0; }
        return;
      }
      const looks = d.lookDegs || [d.lookDeg || 0];
      p.turnT += dt;
      if (p.turnT >= (d.turnInterval || 4)) { p.turnT = 0; p.lookIdx = (p.lookIdx + 1) % looks.length; }
      g.faceYaw(looks[p.lookIdx] * DEG, dt, 0.5);
      return;
    }

    const wps = d.waypoints;
    const wp = wps[g.wpIndex];
    if (p.wait > 0) {
      p.wait -= dt;
      if (wp.lookDeg != null) g.faceYaw(wp.lookDeg * DEG, dt, 0.6);
      if (p.wait <= 0) g.wpIndex = (g.wpIndex + 1) % wps.length;
      return;
    }
    if (g.goTo(wp.pos[0], wp.pos[2], g.cfg.walkSpeed, dt)) {
      p.wait = wp.wait || 0;
      p.returning = false;
      if (p.wait <= 0) g.wpIndex = (g.wpIndex + 1) % wps.length;
    }
  },
};

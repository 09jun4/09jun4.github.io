// 교전: 능동적 추적 — 사격 거리를 확보하고 시야가 트이면 일정 간격으로 사격. 놓치면 마지막 목격 지점 → 수색.
export const Combat = {
  enter(g) {
    g.icon.set('!');
    g.anim.aimTarget = 1;
    g.p = { fireT: g.session.diff.fireInterval * 0.5, lostT: 0, repath: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0 };
    g.clearPath();
  },
  update(g, dt) {
    const p = g.p, c = g.cfg.combat, s = g.session, pl = s.player;
    const seen = g.see(true);
    const dist = Math.hypot(pl.x - g.pos.x, pl.z - g.pos.z);
    if (seen !== 'none') { g.knowPlayer(); p.lostT = 0; } else p.lostT += dt;
    // 시야를 잃은 직후 잠깐은 위치를 추적한다(소리 감지 대신 짧은 인지 유지)
    if (p.lostT > 0 && p.lostT < 0.6) g.knowPlayer();

    if (seen !== 'none') {
      g.faceTo(pl.x, pl.z, dt, 2.2);
      // 거리 조절
      if (dist > c.preferredRange[1]) g.goTo(pl.x, pl.z, g.cfg.runSpeed * 0.8, dt, c.preferredRange[1] * 0.8, true);
      else { g.clearPath(); g.stopMoving(); }
      // 사격
      p.fireT -= dt;
      if (p.fireT <= 0 && dist < c.maxFireRange) {
        p.fireT = s.diff.fireInterval * (0.85 + Math.random() * 0.3);
        g.shoot();
      }
    } else {
      // 마지막 목격 지점으로 추적
      p.fireT = Math.max(p.fireT, 0.35);
      const lk = g.lastKnown;
      const arrived = g.goTo(lk.x, lk.z, g.cfg.runSpeed, dt, 0.8);
      if ((arrived && p.lostT > 0.8) || p.lostT > c.lostSightToSearch + 6) return g.setState('search', { x: lk.x, z: lk.z });
    }
  },
};

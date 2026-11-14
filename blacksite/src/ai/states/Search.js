// 수색: 마지막 목격 지점 확인 → 주변 둘러보기 → 근처 지점 몇 곳 확인 → 순찰 복귀.
export const Search = {
  enter(g, at) {
    g.icon.set('?');
    g.anim.aimTarget = 0.7;
    const cfg = g.cfg.search;
    g.p = { x: at.x, z: at.z, phase: 'go', t: 0, total: 0, points: [], look: 0, maxTime: at.short ? 5 : g.session.diff.searchTime };
    // 주변 확인 지점 (마지막 지점에서 막힘없이 갈 수 있는 곳)
    for (let i = 0; i < 8 && g.p.points.length < (at.short ? 0 : cfg.points); i++) {
      const a = Math.random() * Math.PI * 2, r = cfg.radius * (0.5 + Math.random() * 0.5);
      const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      if (g.nav.clear(at.x, at.z, x, z)) g.p.points.push({ x, z });
    }
    g.clearPath();
  },
  update(g, dt) {
    const p = g.p, cfg = g.cfg.search;
    p.total += dt;
    const seen = g.see();
    if (seen === 'core') return g.setState('alert');
    if (seen === 'peripheral') { p.x = g.session.player.x; p.z = g.session.player.z; p.phase = 'go'; g.clearPath(); }
    if (p.total > p.maxTime) return g.setState('patrol');
    if (p.phase === 'go') {
      if (g.goTo(p.x, p.z, g.cfg.searchSpeed, dt, 0.6)) { p.phase = 'look'; p.t = 0; }
    } else if (p.phase === 'look') {
      p.t += dt;
      g.stopMoving();
      g.anim.headYawTarget = Math.sin(p.t * 1.6) * 0.9;
      g.yaw += Math.sin(p.t * 0.8) * dt * 0.8;
      if (p.t > cfg.lookAroundTime) {
        g.anim.headYawTarget = 0;
        const next = p.points.shift();
        if (next) { p.x = next.x; p.z = next.z; p.phase = 'go'; g.clearPath(); } else return g.setState('patrol');
      }
    }
  },
};

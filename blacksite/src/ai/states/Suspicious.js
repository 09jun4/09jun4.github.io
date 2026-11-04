// 의심 (노랑 ?): 주변 시야에 무언가 보임 → 그쪽을 바라보고, 계속 보이면 다가가 확인한다.
export const Suspicious = {
  enter(g, at) {
    g.icon.set('?');
    g.anim.aimTarget = 0.25;
    g.p = { x: at.x, z: at.z, t: 0, since: 0, investigating: false };
    g.clearPath();
    g.emit('guard:suspicious');
  },
  update(g, dt) {
    const p = g.p, cfg = g.cfg.suspicious;
    p.t += dt;
    const seen = g.see();
    if (seen === 'core') return g.setState('alert');
    if (seen === 'peripheral') {
      p.x = g.session.player.x; p.z = g.session.player.z;
      p.since = 0;
    } else p.since += dt;
    if (p.since > cfg.giveUpAfter) return g.setState('patrol');
    if (!p.investigating) {
      g.faceTo(p.x, p.z, dt);
      g.anim.headYawTarget = 0;
      if (p.t > cfg.investigateAfter) p.investigating = true;
    } else if (g.goTo(p.x, p.z, g.cfg.walkSpeed * 1.1, dt, 1.2)) {
      return g.setState('search', { x: p.x, z: p.z, short: true });
    }
  },
};

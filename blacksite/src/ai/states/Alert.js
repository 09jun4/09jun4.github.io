// 발견 (빨강 !): 플레이어를 확실히 봄 → 반응 시간(난이도) 후 교전.
export const Alert = {
  enter(g) {
    g.icon.set('!');
    g.anim.aimTarget = 1;
    g.anim.headYawTarget = 0;
    g.p = { t: 0 };
    g.clearPath();
    g.knowPlayer();
    g.session.onDetected(g);
    g.emit('guard:alert');
  },
  update(g, dt) {
    g.p.t += dt;
    const seen = g.see();
    if (seen !== 'none') g.knowPlayer();
    g.faceTo(g.lastKnown.x, g.lastKnown.z, dt, 2);
    if (g.p.t >= g.session.diff.reactionTime) g.setState('combat');
  },
};

// 전투 불능 (사살·제압): 쓰러지는 연출 후 미션 끝까지 그 자리에 유지.
export const Down = {
  enter(g, info = {}) {
    g.icon.set(null);
    g.clearPath();
    g.stopMoving();
    g.anim.override = null;
    g.anim.die(info.dir ?? 1);
  },
  update() {},
};

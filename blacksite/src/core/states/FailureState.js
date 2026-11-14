// 미션 실패 — 전술 시스템 오류 화면.
export class FailureState {
  constructor(game) { this.game = game; }
  enter(info) { this.info = info; this.game.ui.show('failure', info); }
  exit() {}
  update(dt) {
    const g = this.game;
    if (g.menuBackdrop) g.menuBackdrop.render(g.renderer, dt);
    else g.renderer.clear();
  }
}

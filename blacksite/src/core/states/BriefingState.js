// 작전 브리핑 상태: 난이도 선택 → DEPLOY.
export class BriefingState {
  constructor(game) { this.game = game; }
  enter() { this.game.ui.show('briefing'); }
  exit() {}
  update(dt) {
    const g = this.game;
    if (g.menuBackdrop) g.menuBackdrop.render(g.renderer, dt);
    else g.renderer.clear();
  }
}

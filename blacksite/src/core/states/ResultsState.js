// 미션 성공 — 작전 결과 보고서.
export class ResultsState {
  constructor(game) { this.game = game; }
  enter(result) { this.result = result; this.game.ui.show('results', result); }
  exit() {}
  update(dt) {
    const g = this.game;
    if (g.menuBackdrop) g.menuBackdrop.render(g.renderer, dt);
    else g.renderer.clear();
  }
}

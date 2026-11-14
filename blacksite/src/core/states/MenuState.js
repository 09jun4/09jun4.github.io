// 메인 메뉴 상태: 가벼운 3D 배경 + 메뉴 UI.
export class MenuState {
  constructor(game) { this.game = game; }
  enter() {
    this.game.ui.show('menu');
    this.game.audio?.playMenuMusic?.();
  }
  exit() {}
  update(dt) {
    const g = this.game;
    if (g.menuBackdrop) g.menuBackdrop.render(g.renderer, dt);
    else g.renderer.clear();
  }
}

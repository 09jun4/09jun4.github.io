// BLACKSITE 진입점.
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('view'), document.getElementById('ui'));
window.__BLACKSITE__ = game; // 디버그용
game.init().catch((e) => {
  console.error(e);
  const boot = document.getElementById('boot');
  if (boot) boot.querySelector('.boot-line').textContent = 'SYSTEM ERROR — ' + (e && e.message ? e.message : e);
});

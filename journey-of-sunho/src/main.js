// 선호의 여정 — 진입점
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('view'), document.getElementById('ui'));
window.__game = game; // 디버그·자동 테스트용
game.init().then(() => {
  document.getElementById('boot').classList.add('hide');
}).catch((e) => {
  console.error(e);
  document.getElementById('boot').textContent = '게임을 불러오지 못했어요: ' + e.message;
});

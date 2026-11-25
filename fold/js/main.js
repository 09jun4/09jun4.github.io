// 시작점: 설정·저장·사운드·UI·게임·로그인을 만들고 연결해요.
import { Game } from './core/Game.js';
import { UI } from './ui/UI.js';
import { Audio } from './core/Audio.js';
import { Save } from './core/Save.js';
import { Cloud } from './core/Cloud.js';

const mobile = matchMedia('(pointer: coarse)').matches;
const settings = Save.loadSettings({ master: 0.8, music: 0.5, sfx: 0.8, quality: mobile ? 'medium' : 'high' });
if (!['low', 'medium', 'high'].includes(settings.quality)) settings.quality = 'medium';

const save = new Save();
const audio = new Audio();
audio.setVolumes(settings);
const ui = new UI({ settings, save, audio });
let game;
try {
  game = new Game({ canvas: document.getElementById('cv'), ui, audio, save, settings });
} catch (e) {
  console.error(e);
  ui.error('3D 화면(WebGL)을 시작할 수 없어요. 다른 브라우저나 기기로 열어 주세요.\n' + e.message, () => location.reload(), () => location.reload());
  throw e;
}
ui.game = game;

const cloud = new Cloud(save);
ui.cloud = cloud;
cloud.onChange(() => { game.admin = cloud.isAdmin; ui.updateAccount(); });
save.onChange(() => { ui.refreshSelect(); if (game.state === 'MainMenu') ui.showMenu(); });

// 예상하지 못한 오류가 나도 게임이 멈추지 않게: 알리고 계속 진행 (일시정지 메뉴에서 다시 시작 가능)
let lastErr = 0;
const onErr = e => {
  console.error('[FOLD]', e);
  if (Date.now() - lastErr > 4000) { lastErr = Date.now(); ui.toast('문제가 생겼어요. 계속 안 되면 메뉴 → 스테이지 다시 시작'); }
  if (game.state === 'Folding' && !game.anim) game.state = 'Playing';
};
window.addEventListener('error', e => onErr(e.error || e.message));
window.addEventListener('unhandledrejection', e => onErr(e.reason));

game.loadIndex().then(() => {
  const q = new URLSearchParams(location.search).get('stage');
  if (q && game.stageDefs.has(q) && (game.isUnlocked(q) || location.hostname === 'localhost')) { ui.hideAll(); game.startStage(q); document.getElementById('loading').classList.add('out'); }
  else game.toMenu();
}, e => ui.error(e.message, () => location.reload(), () => location.reload()));
window.FOLD = game; // 디버그·테스트용

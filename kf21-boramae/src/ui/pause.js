// 일시정지(ESC): 설정 + 재시작 + 메인 메뉴. 게임 시간은 완전히 멈추고, 계속하면 바로 이어진다.
import { el, controlsBothHtml } from './dom.js';
import { settingsFields, bindSettings } from './settings-panel.js';
import { CONTROLS, CONTROLS_MOBILE } from '../data/controls.js';

export function createPause(actions, settings, quality, hooks) {
  const root = el(`
    <section class="screen pause" aria-label="일시정지">
      <div class="panel dialog wide">
        <h2>일시정지</h2>
        <div class="pause-cols">
          <div>
            ${settingsFields()}
          </div>
          <div>
            <h3>조작</h3>${controlsBothHtml(CONTROLS, CONTROLS_MOBILE)}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn primary" data-act="resume" data-autofocus>계속하기 <kbd>ESC</kbd></button>
          <button class="btn" data-act="restart">재시작</button>
          <button class="btn" data-act="menu">메인 메뉴</button>
        </div>
      </div>
    </section>`);
  const refresh = bindSettings(root, settings, quality, hooks);
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && actions[act.dataset.act]) actions[act.dataset.act]();
  });
  return { el: root, show: refresh };
}

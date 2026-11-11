// 로딩 화면: 고폴리 모델·텍스처를 만드는 동안 진행 막대와 조종 팁을 보여 준다. 낮음 프리셋에서는 쓰지 않는다.
import { el, esc } from './dom.js';
import { TIPS } from '../data/controls.js';

export function createLoading(parent) {
  const root = el(`
    <div class="loading" hidden role="status" aria-live="polite">
      <div class="loading-box">
        <p class="loading-title" data-title></p>
        <div class="loading-bar"><i></i></div>
        <p class="loading-step" data-step></p>
        <p class="loading-tip"><b>TIP</b><span data-tip></span></p>
      </div>
    </div>`);
  parent.appendChild(root);
  const bar = root.querySelector('i');
  let tipIndex = Math.floor(Math.random() * TIPS.length);
  return {
    el: root,
    show(title) {
      root.querySelector('[data-title]').textContent = title;
      root.querySelector('[data-tip]').innerHTML = esc(TIPS[tipIndex++ % TIPS.length]);
      bar.style.width = '0%';
      root.hidden = false;
    },
    /** @param {number} f 0~1 @param {string} [step] 지금 하는 일 */
    progress(f, step) {
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
      if (step !== undefined) root.querySelector('[data-step]').textContent = step;
    },
    hide() { root.hidden = true; },
    get visible() { return !root.hidden; },
  };
}

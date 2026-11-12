// 튜토리얼 안내 띠(화면 위쪽 가운데)와 리플레이 표시. 상태는 core/tutorial.js가 갖고, 여기서는 바뀔 때만 다시 그린다.
import { el, esc } from './dom.js';

export function createTutorialBanner(parent) {
  const root = el('<div class="tutorial" hidden aria-live="polite"><p class="tut-step"></p><p class="tut-text"></p><p class="tut-skip"></p></div>');
  const replay = el('<div class="replay-tag" hidden><b>REPLAY</b><span></span></div>');
  parent.append(root, replay);
  const stepEl = root.querySelector('.tut-step'), textEl = root.querySelector('.tut-text'), skipEl = root.querySelector('.tut-skip');
  let seen = -1;
  let replayKey = '';
  return {
    el: root,
    /** @param {import('../core/tutorial.js').Tutorial} t @param {boolean} show */
    update(t, show) {
      const on = show && t.active;
      if (root.hidden === on) root.hidden = !on;
      if (!on || t.version === seen) return;
      seen = t.version;
      stepEl.innerHTML = `튜토리얼 ${t.index + 1} / ${t.total} · ${esc(t.step.title)}${t.stepDone ? ' <b>완료</b>' : ''}`;
      textEl.textContent = t.text;
      skipEl.textContent = t.skipText;
      root.classList.toggle('done', t.stepDone);
    },
    /** 리플레이 중 표시: pass 0 = 추적 시점, 1 = 표적 옆 시점 */
    setReplay(on, pass, mobile) {
      const key = on ? `${pass}${mobile}` : '';
      if (key === replayKey) return;
      replayKey = key;
      replay.hidden = !on;
      if (on) replay.querySelector('span').textContent = `${pass === 0 ? '시점 1 · 추적' : '시점 2 · 표적 옆'} — ${mobile ? '화면을 누르면 닫기' : 'Enter: 닫기'}`;
    },
  };
}

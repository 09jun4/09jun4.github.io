// 화면 관리: 화면 하나만 보이게 하고, 전환은 짧은 페이드로 처리한다.
import { FADE_SECONDS } from '../data/app.js';

export class Screens {
  /** @param {HTMLElement} fadeEl */
  constructor(fadeEl) {
    this.fadeEl = fadeEl;
    this.screens = new Map();
    this.busy = false;
    fadeEl.style.transitionDuration = `${FADE_SECONDS}s`;
  }

  add(name, screen) {
    this.screens.set(name, screen);
    screen.el.hidden = true;
  }

  /** 지정한 화면만 보인다(null이면 전부 숨김). */
  show(name, payload) {
    for (const [n, s] of this.screens) {
      const on = n === name;
      if (on && s.show) s.show(payload);
      s.el.hidden = !on;
      if (on) {
        const focus = s.el.querySelector('[data-autofocus]');
        if (focus) focus.focus({ preventScroll: true });
      }
    }
  }

  /** 어두워졌다가(0.25초) fn을 실행하고 다시 밝아진다. 전환 중 중복 입력은 무시한다. */
  fade(fn) {
    if (this.busy) return;
    this.busy = true;
    const ms = FADE_SECONDS * 1000;
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      try { fn(); } finally {
        requestAnimationFrame(() => {
          this.fadeEl.classList.remove('on');
          setTimeout(() => { this.busy = false; }, ms);
        });
      }
    }, ms);
  }
}

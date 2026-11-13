// 메인 메뉴: 배경은 3D(구름 사이를 나는 KF-21). 버튼은 "게임 시작", "설정" 두 개만.
import { el } from './dom.js';

export function createMenu(actions) {
  const root = el(`
    <section class="screen menu" aria-label="메인 메뉴">
      <div class="account" id="account"></div>
      <div class="menu-main">
        <p class="eyebrow">ROKAF · 4.5세대 전투기</p>
        <h1 class="title">KF-21<span>BORAMAE</span></h1>
        <p class="tagline">보라매를 몰고 영공을 지켜라</p>
        <nav class="menu-buttons">
          <button class="btn primary" data-act="start" data-autofocus>게임 시작</button>
          <button class="btn" data-act="settings">설정</button>
        </nav>
      </div>
      <p class="menu-foot">PC · 모바일 · 소리 있음</p>
    </section>`);
  root.querySelector('[data-act="start"]').addEventListener('click', actions.start);
  root.querySelector('[data-act="settings"]').addEventListener('click', actions.settings);
  return { el: root };
}

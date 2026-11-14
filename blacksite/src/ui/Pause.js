// 일시정지 (ESC): 전술 시스템 패널 — 게임 화면 위 어두운 반투명 패널 + 일렉트릭 블루 포인트.
export function renderPause(el, h) {
  el.innerHTML = `
    <div class="pause-panel">
      <div class="pp-head"><span class="tag">TACTICAL SYSTEM</span><span class="pp-state">PAUSED</span></div>
      <div class="pp-obj"></div>
      <nav class="pp-nav">
        <button class="mm-item" data-a="resume"><i>▸</i>RESUME</button>
        <button class="mm-item" data-a="settings"><i>⚙</i>SETTINGS</button>
        <button class="mm-item" data-a="restart"><i>↻</i>RESTART MISSION</button>
        <button class="mm-item" data-a="menu"><i>⏏</i>MAIN MENU</button>
      </nav>
      <div class="pp-foot">ESC 계속하기</div>
    </div>`;
  for (const a of ['resume', 'settings', 'restart', 'menu']) el.querySelector(`[data-a=${a}]`).onclick = h[a];
}

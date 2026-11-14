// 미션 실패 — 전술 시스템 오류 화면 (글리치 연출).
export function renderFailure(el, info, { onRetry, onMenu }) {
  const code = (0x7f000 + Math.floor(Math.random() * 0xfff)).toString(16).toUpperCase();
  el.innerHTML = `
  <div class="failure">
    <div class="scan"></div>
    <div class="f-box">
      <div class="f-sys">TACTICAL LINK // ERR_0x${code}</div>
      <h1 class="glitch" data-text="SIGNAL LOST">SIGNAL LOST</h1>
      <div class="f-sub">MISSION FAILED</div>
      <div class="f-lines">
        <div>&gt; operator vitals ............ <b>NO RESPONSE</b></div>
        <div>&gt; uplink ..................... <b>TERMINATED</b></div>
        <div>&gt; 작전 요원과의 연결이 끊어졌습니다.</div>
      </div>
      <div class="report-actions">
        <button class="btn primary" data-a="retry">RETRY</button>
        <button class="btn" data-a="menu">MAIN MENU</button>
      </div>
    </div>
  </div>`;
  el.querySelector('[data-a=retry]').onclick = onRetry;
  el.querySelector('[data-a=menu]').onclick = onMenu;
}

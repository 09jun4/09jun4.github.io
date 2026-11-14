// 미션 성공 — 작전 결과 보고서.
import { esc } from '../utils/dom.js';
import { formatTime } from '../utils/math.js';

export function renderResults(el, r, diffs, { onRetry, onMenu }) {
  const d = diffs[r.difficulty] || {};
  const best = r.newRecord ? r.timeSec : r.prevBest;
  el.innerHTML = `
  <div class="report">
    <div class="report-head">
      <div class="rh-left"><div class="tag">OPERATION REPORT</div><div class="code">${esc(r.missionCode)}</div></div>
      <div class="rh-right"><div class="tag">STATUS</div><div class="ok">SUCCESS</div></div>
    </div>
    <h1 class="report-title">MISSION COMPLETE</h1>
    <div class="report-sub">${esc(r.missionTitle)} — 데이터 확보 및 탈출 완료</div>
    ${r.newRecord ? '<div class="record">NEW RECORD</div>' : ''}
    <div class="stats">
      <div class="st wide"><div class="k">TIME · 소요 시간</div><div class="v">${formatTime(r.timeSec)}</div><div class="s">BEST ${best ? formatTime(best) : '—'}</div></div>
      <div class="st"><div class="k">DIFFICULTY · 난이도</div><div class="v sm">${esc(d.labelEn || r.difficulty)}</div><div class="s">${esc(d.label || '')}</div></div>
      <div class="st"><div class="k">KILLS · 처치</div><div class="v">${r.kills}</div></div>
      <div class="st"><div class="k">TAKEDOWNS · 암살</div><div class="v">${r.takedowns}</div></div>
      <div class="st"><div class="k">DETECTED · 발각</div><div class="v ${r.detections ? 'warn' : ''}">${r.detections}</div></div>
      <div class="st"><div class="k">DATA LOGS · 열람</div><div class="v">${r.logsRead}<span class="of"> / ${r.logsTotal}</span></div></div>
    </div>
    <div class="report-actions">
      <button class="btn primary" data-a="retry">RETRY</button>
      <button class="btn" data-a="menu">MAIN MENU</button>
    </div>
  </div>`;
  el.querySelector('[data-a=retry]').onclick = onRetry;
  el.querySelector('[data-a=menu]').onclick = onMenu;
}

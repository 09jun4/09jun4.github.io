// 미션 선택: 작전 지도(왼쪽) + 미션 카드(오른쪽) + 조작 키 안내(항상 표시).
import { el, esc, fmtScore, fmtTime, controlsBothHtml } from './dom.js';
import { MISSIONS, missionEnemyCount } from '../data/missions.js';
import { CONTROLS, CONTROLS_MOBILE } from '../data/controls.js';

// 단순화한 작전 지도(400×300). 가운데 땅덩이를 두고 동·남·서쪽 바다에 작전 구역이 있다.
const LAND = '176,22 214,30 236,58 250,96 246,128 262,160 252,196 228,226 196,236 170,222 160,190 142,170 150,138 136,110 148,74 160,44';

function mapSvg() {
  const pts = MISSIONS.map((m) => ({ x: m.map.x * 400, y: m.map.y * 300 }));
  const route = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ');
  let grid = '';
  for (let x = 40; x < 400; x += 40) grid += `<line x1="${x}" y1="0" x2="${x}" y2="300"/>`;
  for (let y = 30; y < 300; y += 30) grid += `<line x1="0" y1="${y}" x2="400" y2="${y}"/>`;
  return `
    <svg class="opmap" viewBox="0 0 400 300" role="img" aria-label="작전 지도">
      <g class="grid">${grid}</g>
      <polygon class="land" points="${LAND}"/>
      <polygon class="land-inner" points="${LAND}" transform="translate(200 130) scale(0.82) translate(-200 -130)"/>
      <path class="route" d="${route}"/>
      <g class="rings"><circle cx="200" cy="130" r="118"/><circle cx="200" cy="130" r="176"/></g>
      ${MISSIONS.map((m, i) => `
        <g class="node" data-id="${m.id}" transform="translate(${pts[i].x.toFixed(0)} ${pts[i].y.toFixed(0)})" tabindex="0" role="button" aria-label="미션 ${m.order} ${esc(m.title)}">
          <circle class="hit" r="26"/><circle class="halo" r="17"/><path class="mark" d="M0,-10 L9,7 L0,3 L-9,7 Z"/>
          <text class="num" y="-22">${String(m.order).padStart(2, '0')}</text>
          <text class="lbl" y="34">${esc(m.area)}</text>
        </g>`).join('')}
      <text class="compass" x="372" y="24">N</text><path class="compass-arrow" d="M372,30 L372,52 M366,38 L372,30 L378,38"/>
    </svg>`;
}

export function createMissionSelect(actions, save) {
  const root = el(`
    <section class="screen select" aria-label="미션 선택">
      <header class="bar">
        <button class="btn ghost" data-act="back">← 메인 메뉴</button>
        <h2>작전 선택</h2>
        <span class="bar-note">미션은 순서대로 열려요</span>
      </header>
      <div class="select-body">
        <div class="panel map-panel">${mapSvg()}<ol class="mission-list"></ol></div>
        <div class="panel card"></div>
      </div>
      <div class="panel controls"><h3>조작</h3>${controlsBothHtml(CONTROLS, CONTROLS_MOBILE)}</div>
    </section>`);
  const card = root.querySelector('.card');
  const list = root.querySelector('.mission-list');
  let selected = MISSIONS[0].id;

  function render() {
    list.innerHTML = MISSIONS.map((m) => {
      const rec = save.record(m.id);
      const open = save.isUnlocked(m.id);
      return `<li><button class="mission-row${m.id === selected ? ' on' : ''}${open ? '' : ' locked'}" data-id="${m.id}">
        <span class="no">${String(m.order).padStart(2, '0')}</span><span class="nm">${esc(m.title)}</span>
        <span class="st">${!open ? '잠김' : rec && rec.grade ? `<b class="grade g-${rec.grade}">${rec.grade}</b>` : '미완료'}</span></button></li>`;
    }).join('');
    for (const n of root.querySelectorAll('.node')) {
      const id = n.dataset.id;
      n.classList.toggle('on', id === selected);
      n.classList.toggle('locked', !save.isUnlocked(id));
      n.classList.toggle('done', !!(save.record(id) && save.record(id).clears));
    }
    const m = MISSIONS.find((x) => x.id === selected);
    const rec = save.record(m.id);
    const open = save.isUnlocked(m.id);
    card.innerHTML = `
      <p class="eyebrow">${esc(m.codename)}</p>
      <h3 class="card-title"><span>MISSION ${String(m.order).padStart(2, '0')}</span>${esc(m.title)}</h3>
      <p class="card-sum">${esc(m.summary)}</p>
      <dl class="facts">
        <div><dt>작전 구역</dt><dd>${esc(m.area)}</dd></div>
        <div><dt>적기</dt><dd>${missionEnemyCount(m)}대 · 편대 ${m.waves.length}개</dd></div>
        <div><dt>기준 시간</dt><dd>${m.parTime}초</dd></div>
        <div><dt>최고 기록</dt><dd>${rec && rec.clears ? `${fmtScore(rec.bestScore)}점 · ${fmtTime(rec.bestTime)} <b class="grade g-${rec.grade}">${rec.grade}</b>` : '없음'}</dd></div>
      </dl>
      <div class="card-actions">
        <button class="btn primary" data-act="brief" ${open ? '' : 'disabled'} data-autofocus>${open ? '브리핑' : '이전 미션을 먼저 완수하세요'}</button>
        <button class="btn" data-act="rank">랭킹 보기</button>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (row) { selected = row.dataset.id; render(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'back') actions.back();
    else if (act.dataset.act === 'brief') actions.brief(MISSIONS.find((m) => m.id === selected));
    else if (act.dataset.act === 'rank') actions.ranking(MISSIONS.find((m) => m.id === selected));
  });
  root.addEventListener('keydown', (e) => {
    const node = e.target.closest && e.target.closest('.node');
    if (node && (e.key === 'Enter' || e.key === ' ')) { selected = node.dataset.id; render(); }
  });
  save.onChange(() => { if (!root.hidden) render(); });

  return {
    el: root,
    show(payload) {
      if (payload && payload.missionId) selected = payload.missionId;
      else {
        // 아직 안 깬 첫 미션을 기본 선택
        const next = MISSIONS.find((m) => save.isUnlocked(m.id) && !(save.record(m.id) && save.record(m.id).clears));
        if (next) selected = next.id;
      }
      render();
    },
  };
}

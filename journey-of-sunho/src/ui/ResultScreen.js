// ResultScreen — 귀가 결과(종합 평가) 화면
import { rankTable, fmtTime } from './Menu.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ResultScreen {
  constructor(root, game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'result hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const g = this.game;
      if (b.dataset.act === 'next') g.startChapter(b.dataset.id);
      if (b.dataset.act === 'retry') g.startChapter(b.dataset.id);
      if (b.dataset.act === 'title') g.toTitle();
    });
  }
  hide() { this.el.classList.add('hidden'); }

  show(ch, st, res, extra) {
    const next = this.game.chapters.next(ch.id);
    const row = (k, v, cls = '') => `<div class="r-row ${cls}"><span>${k}</span><b>${v}</b></div>`;
    const lvl = (ok) => (ok ? 'ok' : 'bad');
    this.el.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div><div class="ch-no">CHAPTER ${ch.no} · ${esc(ch.title)}</div><h2>귀가 성공!</h2><p class="muted">${esc(ch.outro || '')}</p></div>
          <div class="r-grade g-${res.grade}"><span>${res.grade}</span><small>${esc(res.title)}</small></div>
        </div>
        <div class="r-body">
          <div class="r-stats">
            ${row('소요 시간', `${fmtTime(st.time)} <small>(기준 ${fmtTime(res.par)})</small>`, lvl(st.time <= res.par))}
            ${row('체온', `${st.bodyTemp.toFixed(1)}°C <small>(최저 ${st.minTemp.toFixed(1)}°C)</small>`, lvl(st.bodyTemp >= 35.9))}
            ${row('피로도', Math.round(st.fatigue), lvl(st.fatigue < 60))}
            ${row('감기', st.sick ? '걸림' : '없음', lvl(!st.sick))}
            ${row('넘어짐', `${st.falls}회`, lvl(st.falls === 0))}
            ${row('청결도', Math.round(st.cleanliness), lvl(st.cleanliness >= 55))}
            ${row('새똥 / 행인 충돌 / 간식', `${st.poop} / ${st.hits} / ${st.pickups}`)}
            ${row('주행 거리', `${(st.distance / 1000).toFixed(2)} km`)}
          </div>
          <div class="r-score">
            <div class="r-total"><small>최종 점수</small><b>${res.score}</b>${extra.newBest ? '<em>최고 기록!</em>' : ''}</div>
            <div class="r-parts">${res.parts.map((p) => `<div><span>${esc(p.label)}</span><b class="${p.v < 0 ? 'neg' : ''}">${p.v > 0 ? '+' : ''}${p.v}</b></div>`).join('')}</div>
          </div>
        </div>
        ${res.comments.length ? `<div class="r-comments">${res.comments.map((c) => `<p>“${esc(c)}”</p>`).join('')}</div>` : ''}
        <div class="r-rank"></div>
        <div class="menu-buttons row">
          ${next ? `<button class="btn primary" data-act="next" data-id="${next.id}">다음 챕터 · ${esc(next.title)}</button>` : '<span class="muted">모든 챕터를 마쳤어요! 다른 조건으로 다시 도전해 보세요.</span>'}
          <button class="btn" data-act="retry" data-id="${ch.id}">다시 하기 (새 조건)</button>
          <button class="btn ghost" data-act="title">타이틀로</button>
        </div>
      </div>`;
    this.el.classList.remove('hidden');
    const cloud = this.game.cloud;
    const rk = this.el.querySelector('.r-rank');
    if (cloud.enabled) {
      if (cloud.state !== 'in') rk.innerHTML = '<p class="muted">구글 로그인하면 랭킹에 기록이 올라가요. (타이틀 화면)</p>';
      rk.insertAdjacentHTML('beforeend', '<p class="muted">랭킹 불러오는 중…</p>');
      (extra.pushed || Promise.resolve()).then(() => cloud.ranking(ch.id, true)).then((r) => {
        rk.querySelectorAll('p.muted').forEach((p) => { if (p.textContent.includes('불러오는')) p.remove(); });
        rk.insertAdjacentHTML('beforeend', rankTable(r, cloud));
      }, () => { rk.innerHTML = '<p class="muted">랭킹을 불러오지 못했어요.</p>'; });
    }
  }
}

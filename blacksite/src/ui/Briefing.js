// 작전 브리핑: 군사 작전 보고서 스타일 + 시설 도면(맵 JSON에서 생성) + 난이도 선택 + DEPLOY.
import { esc } from '../utils/dom.js';

function schematic(map) {
  const xs = map.zones.flatMap((z) => [z.rect[0], z.rect[2]]), zs = map.zones.flatMap((z) => [z.rect[1], z.rect[3]]);
  const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 1, minZ = Math.min(...zs) - 1, maxZ = Math.max(...zs) + 1;
  const W = maxX - minX, H = maxZ - minZ;
  const rooms = map.zones.map((z) => {
    const [x1, z1, x2, z2] = z.rect;
    const cx = (x1 + x2) / 2 - minX, cz = (z1 + z2) / 2 - minZ;
    const cls = z.id === 'server' ? 'target' : z.id === 'entry' ? 'entry' : z.id === 'corridor' ? 'corr' : '';
    return `<rect class="${cls}" x="${x1 - minX}" y="${z1 - minZ}" width="${x2 - x1}" height="${z2 - z1}"/>` +
      (z.id === 'corridor' ? '' : `<text x="${cx}" y="${cz}">${esc(z.nameEn)}</text>`);
  }).join('');
  const doors = map.doors.map((d) => d.axis === 'x'
    ? `<line class="door" x1="${d.pos[0] - d.width / 2 - minX}" y1="${d.pos[1] - minZ}" x2="${d.pos[0] + d.width / 2 - minX}" y2="${d.pos[1] - minZ}"/>`
    : `<line class="door" x1="${d.pos[0] - minX}" y1="${d.pos[1] - d.width / 2 - minZ}" x2="${d.pos[0] - minX}" y2="${d.pos[1] + d.width / 2 - minZ}"/>`).join('');
  const sp = map.spawn.pos;
  return `<svg class="schem" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${rooms}${doors}
    <circle class="spawn" cx="${sp[0] - minX}" cy="${sp[2] - minZ}" r="0.7"/><text class="lbl" x="${sp[0] - minX}" y="${sp[2] - minZ + 2.4}">INSERTION</text></svg>`;
}

export function renderBriefing(el, game, h) {
  const m = game.cfg.mission, b = m.briefing, diffs = game.cfg.game.difficulties;
  let sel = h.difficulty || game.cfg.game.defaultDifficulty;
  const desc = {
    easy: '적 시야가 짧고 반응이 느려요. 처음 플레이에 추천.',
    normal: '기본 난이도. 잠입과 교전의 균형.',
    hard: '적이 멀리 보고 빠르게 반응해요. 명중률·피해 증가.',
  };
  el.innerHTML = `
  <div class="briefing">
    <header class="bf-head">
      <div><div class="tag">OPERATION ORDER</div><div class="bf-code">${esc(m.code)}</div></div>
      <div class="stamp">TOP SECRET</div>
    </header>
    <div class="bf-grid">
      <section class="bf-main">
        <h1>${esc(m.titleEn)}<small>${esc(m.title)}</small></h1>
        <h3>01 · SITUATION <em>상황</em></h3>
        <p>${esc(b.summary)}</p>
        <h3>02 · OBJECTIVES <em>목표</em></h3>
        <ol class="bf-obj">${b.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>
        <h3>03 · NOTES <em>지침</em></h3>
        <ul class="bf-notes">${b.notes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
      </section>
      <section class="bf-side">
        <h3>FACILITY <em>시설 정보</em></h3>
        ${schematic(game.cfg.map)}
        <table class="bf-table">${b.facility.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
      </section>
    </div>
    <section class="bf-diff">
      <h3>04 · DIFFICULTY <em>난이도</em></h3>
      <div class="diffs">${Object.entries(diffs).map(([id, d]) => `
        <button class="diff ${id === sel ? 'on' : ''}" data-d="${id}">
          <b>${esc(d.labelEn)}</b><span>${esc(d.label)}</span><p>${esc(desc[id] || '')}</p>
          <div class="dm"><i>VISION ${d.visionRange}m</i><i>REACT ${d.reactionTime}s</i></div>
        </button>`).join('')}</div>
    </section>
    <footer class="bf-foot">
      <button class="btn" data-a="back">BACK</button>
      <button class="btn primary deploy" data-a="deploy">DEPLOY ▸</button>
    </footer>
  </div>`;
  el.querySelectorAll('.diff').forEach((d) => {
    d.onclick = () => {
      sel = d.dataset.d;
      el.querySelectorAll('.diff').forEach((x) => x.classList.toggle('on', x === d));
      h.onDifficulty?.(sel);
    };
  });
  el.querySelector('[data-a=back]').onclick = h.back;
  el.querySelector('[data-a=deploy]').onclick = () => h.deploy(sel);
}

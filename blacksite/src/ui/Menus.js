// 메인 메뉴: 3D 배경 위 BLACKSITE 로고 + 메뉴 + 전술 정보 패널 + 계정 영역.
import { esc } from '../utils/dom.js';
import { formatTime } from '../utils/math.js';

export function renderMainMenu(el, game, h) {
  const g = game.cfg.game, recs = game.save.records, logs = game.cfg.logs.logs || [];
  const read = game.save.readLogs.filter((id) => logs.some((l) => l.id === id)).length;
  const best = (d) => (recs[d].bestTimeSec ? formatTime(recs[d].bestTimeSec) : '— —');
  el.innerHTML = `
  <div class="mainmenu">
    <div class="mm-left">
      <div class="mm-logo">
        <div class="mm-classified">CLASSIFIED // EYES ONLY</div>
        <h1>BLACK<span>SITE</span></h1>
        <div class="mm-sub">비밀 연구시설 잠입 작전 · OPERATION NIGHTFALL</div>
      </div>
      <nav class="mm-nav">
        <button class="mm-item" data-a="start"><i>01</i>GAME START</button>
        <button class="mm-item" data-a="settings"><i>02</i>SETTINGS</button>
        <button class="mm-item" data-a="controls"><i>03</i>CONTROLS</button>
        <button class="mm-item" data-a="logs"><i>04</i>DATA LOGS <em>${read}/${logs.length}</em></button>
        <button class="mm-item" data-a="credits"><i>05</i>CREDITS</button>
      </nav>
      <div class="mm-foot">v${esc(g.version)} · PC 크롬 · 키보드 + 마우스</div>
    </div>
    <aside class="mm-panel">
      <div class="mm-account" id="mm-account"></div>
      <div class="tp">
        <div class="tp-h"><span>TACTICAL FEED</span><span class="live">● LIVE</span></div>
        <div class="tp-row"><span>TARGET</span><b>K-7 RESEARCH FACILITY</b></div>
        <div class="tp-row"><span>STATUS</span><b class="warn">COMMS DARK · 72H</b></div>
        <div class="tp-row"><span>HOSTILES</span><b>4 (EST.)</b></div>
        <div class="tp-row"><span>LOCAL TIME</span><b id="mm-clock">--:--:--</b></div>
        <div class="tp-h sm"><span>SERVICE RECORD</span></div>
        <div class="tp-row"><span>EASY</span><b>${best('easy')}</b></div>
        <div class="tp-row"><span>NORMAL</span><b>${best('normal')}</b></div>
        <div class="tp-row"><span>HARD</span><b>${best('hard')}</b></div>
        <div class="tp-row"><span>CLEARS</span><b>${recs.easy.clears + recs.normal.clears + recs.hard.clears}</b></div>
        <div class="tp-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
    </aside>
  </div>`;
  const on = (a, fn) => { el.querySelector(`[data-a=${a}]`).onclick = fn; };
  on('start', h.start); on('settings', h.settings); on('controls', h.controls); on('logs', h.logs); on('credits', h.credits);
  const clock = el.querySelector('#mm-clock');
  const tick = () => { if (!clock.isConnected) return; clock.textContent = new Date().toLocaleTimeString('en-GB'); setTimeout(tick, 1000); };
  tick();
  h.account(el.querySelector('#mm-account'));
}

export function renderCredits(body) {
  body.innerHTML = `
    <div class="credits">
      <div class="cr-logo">BLACK<span>SITE</span></div>
      <p>솔로 1인칭 잠입 FPS — MVP v0.1</p>
      <dl>
        <dt>DESIGN · 기획</dt><dd>09jun4</dd>
        <dt>DEVELOPMENT · 개발</dt><dd>09jun4 with Claude Code</dd>
        <dt>ENGINE</dt><dd>Three.js r170 · Vanilla JavaScript (ES Modules)</dd>
        <dt>ART · AUDIO</dt><dd>모든 모델·텍스처·효과음은 코드로 생성 (외부 에셋 없음)</dd>
        <dt>FONTS</dt><dd>Rajdhani · Share Tech Mono · Noto Sans KR (Google Fonts)</dd>
      </dl>
      <p class="dim">이 작품은 허구이며 실제 인물·단체·사건과 관계가 없습니다.</p>
    </div>`;
}

export function renderControls(body, bindings, keyName, ACTIONS) {
  body.innerHTML = `
    <div class="controls-list">
      ${ACTIONS.map((a) => `<div class="cl-row"><span class="cl-act">${esc(a.label)} <em>${esc(a.en)}</em></span><span class="key">${esc(keyName(bindings.get(a.id)))}</span></div>`).join('')}
      <div class="cl-row"><span class="cl-act">시점 <em>LOOK</em></span><span class="key">MOUSE</span></div>
      <div class="cl-row"><span class="cl-act">일시정지 <em>PAUSE</em></span><span class="key">ESC</span></div>
    </div>
    <ul class="tips">
      <li>앉으면(토글) 적의 감지 거리가 줄어요. 달리면 늘어나요.</li>
      <li>발각되지 않은 적의 뒤로 다가가면 <b>TAKEDOWN</b>을 할 수 있어요.</li>
      <li>적은 서로 무전을 하지 않아요. 나를 본 적만 교전해요.</li>
      <li>마지막 피격 후 5초가 지나면 체력이 회복돼요.</li>
      <li>키는 SETTINGS › 조작에서 바꿀 수 있어요.</li>
    </ul>`;
}

export function renderLogList(body, logs, readIds, onOpen) {
  body.innerHTML = `<div class="loglist">${logs.map((l, i) => {
    const r = readIds.includes(l.id);
    return `<button class="ll-item ${r ? '' : 'locked'}" data-id="${esc(l.id)}" ${r ? '' : 'disabled'}>
      <span class="ll-n">${String(i + 1).padStart(2, '0')}</span>
      <span class="ll-t">${r ? esc(l.title) : '[ENCRYPTED] 미확보 로그'}<em>${r ? esc(l.titleEn) : 'FIND IT IN THE FACILITY'}</em></span>
      <span class="ll-z">${esc((l.zone || '').toUpperCase())}</span></button>`;
  }).join('')}</div>
  <p class="dim small">로그는 시설 안의 단말기에서 F로 열람하면 여기에 기록돼요.</p>`;
  body.querySelectorAll('.ll-item:not(.locked)').forEach((b) => { b.onclick = () => onOpen(logs.find((l) => l.id === b.dataset.id)); });
}

// 설정 패널(메인 메뉴의 "설정"과 일시정지 화면이 함께 쓴다): 마우스 감도, 그래픽 품질, 자동 품질 조절, 카메라 흔들림.
import { el } from './dom.js';
import { SETTING_RANGES, QUALITY_CHOICES, PAINTS } from '../data/settings.js';
import { PRESETS } from '../data/quality.js';
import { isMobileMode } from '../core/device.js';

/** 설정 조작부 HTML(값 채우기는 bind에서) */
export function settingsFields() {
  const r = SETTING_RANGES.mouseSensitivity;
  return `
    <div class="field" data-keys-only="pc">
      <label for="set-sens">마우스 감도 <output data-out="sens"></output></label>
      <input id="set-sens" type="range" min="${r.min}" max="${r.max}" step="${r.step}" data-set="mouseSensitivity">
      <p class="hint">조준 커서가 마우스보다 얼마나 빨리 움직이는지예요(화면 가운데 기준).</p>
    </div>
    <div class="field">
      <span class="label">그래픽 품질 <output data-out="step"></output></span>
      <div class="seg three" role="radiogroup" aria-label="그래픽 품질">
        ${QUALITY_CHOICES.map((q) => `<button type="button" role="radio" data-quality="${q}">${PRESETS[q].label}</button>`).join('')}
      </div>
      <p class="hint">낮음은 가벼운 로우폴리, 높음·최고는 사실적인 기체와 효과예요. 바꾸면 잠깐 다시 불러와요.</p>
    </div>
    <div class="field">
      <label for="set-volume">음량 <output data-out="volume"></output></label>
      <input id="set-volume" type="range" min="0" max="1" step="0.05" data-set="volume">
      <label for="set-music">배경음악 음량 <output data-out="musicVolume"></output></label>
      <input id="set-music" type="range" min="0" max="1" step="0.05" data-set="musicVolume">
    </div>
    <div class="field">
      <span class="label">도색</span>
      <div class="seg three" role="radiogroup" aria-label="도색">
        ${PAINTS.map((p) => `<button type="button" role="radio" data-paint="${p.id}">${p.label}</button>`).join('')}
      </div>
    </div>
    <div class="field" data-device="pc">
      <label for="set-steer">우클릭 조향 감도 <output data-out="steerSens"></output></label>
      <input id="set-steer" type="range" min="0.5" max="2" step="0.05" data-set="steerSens">
      <div class="field row">
        <label><input type="checkbox" data-set="steerEnabled"> 우클릭 조향 사용 (누른 자리가 중심인 조이스틱: 벗어난 방향으로, 누르고 있는 동안 계속 선회)</label>
        <label><input type="checkbox" data-set="steerInvertY"> 조향 상하 반전</label>
      </div>
    </div>
    <div class="field" data-device="mobile">
      <label for="set-stick">조이스틱 감도 <output data-out="stickSens"></output></label>
      <input id="set-stick" type="range" min="0.5" max="2" step="0.05" data-set="stickSens">
      <div class="field row">
        <label><input type="checkbox" data-set="gyro"> 자이로(기울기) 조종: 기울여서 좌우, 조이스틱은 상하만</label>
        <label><input type="checkbox" data-set="gyroInvert"> 자이로 상하 반전</label>
      </div>
      <label for="set-gyro">자이로 감도 <output data-out="gyroSens"></output></label>
      <input id="set-gyro" type="range" min="0.5" max="2" step="0.05" data-set="gyroSens">
      <button type="button" class="btn" data-act="recalibrate">자이로 재보정</button>
    </div>
    <div class="field">
      <span class="label">입력 방식</span>
      <div class="seg three" role="radiogroup" aria-label="입력 방식">
        <button type="button" role="radio" data-mode="auto">자동</button>
        <button type="button" role="radio" data-mode="pc">PC</button>
        <button type="button" role="radio" data-mode="mobile">모바일</button>
      </div>
    </div>
    <div class="field row">
      <label><input type="checkbox" data-set="autoQuality"> 느려지면 자동으로 품질 낮추기</label>
      <label><input type="checkbox" data-set="skipTakeoff"> 이륙 시네마틱 기본 생략</label>
      <label><input type="checkbox" data-set="cameraShake"> 카메라 흔들림</label>
      <label><input type="checkbox" data-set="sound"> 소리</label>
      <label><input type="checkbox" data-set="music"> 배경음악</label>
    </div>
    <button type="button" class="btn" data-act="tutorial">튜토리얼 다시 보기</button>`;
}

/**
 * 조작부를 설정 값과 연결한다.
 * @param {HTMLElement} root settingsFields()가 들어 있는 요소
 * @param {import('../core/settings.js').Settings} settings
 * @param {{setQuality:(q:string)=>void, describe:()=>string}} quality
 */
export function bindSettings(root, settings, quality, hooks = {}) {
  const stepOut = root.querySelector('[data-out="step"]');
  const sliders = [...root.querySelectorAll('input[type="range"][data-set]')];
  function refresh() {
    const mobile = isMobileMode(settings.get('inputMode'));
    for (const el of root.querySelectorAll('[data-device]')) el.hidden = (el.dataset.device === 'mobile') !== mobile;
    for (const sl of sliders) {
      sl.value = settings.get(sl.dataset.set);
      const out = root.querySelector(`[data-out="${sl.dataset.set}"]`);
      if (out) out.textContent = `×${Number(settings.get(sl.dataset.set)).toFixed(2)}`;
    }
    for (const b of root.querySelectorAll('[data-paint]')) {
      const on = b.dataset.paint === settings.get('paint');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const b of root.querySelectorAll('[data-mode]')) {
      const on = b.dataset.mode === settings.get('inputMode');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const b of root.querySelectorAll('[data-quality]')) {
      const cur = settings.get('quality') === 'min' ? 'low' : settings.get('quality');
      const on = b.dataset.quality === cur;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      // 모바일에는 최고 프리셋이 없고, 높음은 벤치마크를 통과한 기기만 고를 수 있다
      b.hidden = !!(hooks.mobileQualityLimit && isMobileMode(settings.get('inputMode')) && (b.dataset.quality === 'ultra' || (b.dataset.quality === 'high' && !settings.get('mobileHighOk'))));
    }
    for (const c of root.querySelectorAll('input[type="checkbox"][data-set]')) c.checked = !!settings.get(c.dataset.set);
    if (stepOut) stepOut.textContent = quality.describe();
  }
  for (const sl of sliders) sl.addEventListener('input', () => settings.set(sl.dataset.set, Number(sl.value)));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quality]');
    if (b) quality.setQuality(b.dataset.quality, true);
    const p = e.target.closest('[data-paint]');
    if (p) settings.set('paint', p.dataset.paint);
    const m = e.target.closest('[data-mode]');
    if (m) { settings.set('inputMode', m.dataset.mode); if (hooks.onMode) hooks.onMode(); }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'recalibrate' && hooks.onRecalibrate) hooks.onRecalibrate();
    if (a && a.dataset.act === 'tutorial' && hooks.onTutorial) hooks.onTutorial();
  });
  root.addEventListener('change', (e) => {
    const c = e.target.closest('input[type="checkbox"][data-set]');
    if (c) settings.set(c.dataset.set, c.checked);
  });
  settings.onChange(refresh);
  refresh();
  return refresh;
}

/** 메인 메뉴에서 여는 설정 창 */
export function createSettingsDialog(settings, quality, hooks) {
  const root = el(`
    <div class="modal" hidden>
      <div class="panel dialog" role="dialog" aria-modal="true" aria-label="설정">
        <h2>설정</h2>
        ${settingsFields()}
        <div class="card-actions"><button class="btn primary" data-act="close">닫기</button></div>
      </div>
    </div>`);
  const refresh = bindSettings(root, settings, quality, hooks);
  const close = () => { root.hidden = true; };
  root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-act="close"]')) close(); });
  return { el: root, open() { refresh(); root.hidden = false; root.querySelector('[data-act="close"]').focus(); }, close, get isOpen() { return !root.hidden; } };
}

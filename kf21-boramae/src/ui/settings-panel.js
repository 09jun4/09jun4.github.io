// 설정 패널(메인 메뉴의 "설정"과 일시정지 화면이 함께 쓴다): 마우스 감도, 그래픽 품질, 자동 품질 조절, 카메라 흔들림.
import { el } from './dom.js';
import { SETTING_RANGES, QUALITY_CHOICES, PAINTS } from '../data/settings.js';
import { PRESETS } from '../data/quality.js';

/** 설정 조작부 HTML(값 채우기는 bind에서) */
export function settingsFields() {
  const r = SETTING_RANGES.mouseSensitivity;
  return `
    <div class="field">
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
      <span class="label">도색</span>
      <div class="seg three" role="radiogroup" aria-label="도색">
        ${PAINTS.map((p) => `<button type="button" role="radio" data-paint="${p.id}">${p.label}</button>`).join('')}
      </div>
    </div>
    <div class="field row">
      <label><input type="checkbox" data-set="autoQuality"> 느려지면 자동으로 품질 낮추기</label>
      <label><input type="checkbox" data-set="skipTakeoff"> 이륙 연출 건너뛰기</label>
      <label><input type="checkbox" data-set="cameraShake"> 카메라 흔들림</label>
    </div>`;
}

/**
 * 조작부를 설정 값과 연결한다.
 * @param {HTMLElement} root settingsFields()가 들어 있는 요소
 * @param {import('../core/settings.js').Settings} settings
 * @param {{setQuality:(q:string)=>void, describe:()=>string}} quality
 */
export function bindSettings(root, settings, quality) {
  const sens = root.querySelector('[data-set="mouseSensitivity"]');
  const out = root.querySelector('[data-out="sens"]');
  const stepOut = root.querySelector('[data-out="step"]');
  function refresh() {
    sens.value = settings.get('mouseSensitivity');
    out.textContent = `×${Number(settings.get('mouseSensitivity')).toFixed(2)}`;
    for (const b of root.querySelectorAll('[data-paint]')) {
      const on = b.dataset.paint === settings.get('paint');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const b of root.querySelectorAll('[data-quality]')) {
      const on = b.dataset.quality === (settings.get('quality') === 'min' ? 'low' : settings.get('quality'));
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const c of root.querySelectorAll('input[type="checkbox"][data-set]')) c.checked = !!settings.get(c.dataset.set);
    stepOut.textContent = quality.describe();
  }
  sens.addEventListener('input', () => settings.set('mouseSensitivity', Number(sens.value)));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quality]');
    if (b) quality.setQuality(b.dataset.quality, true);
    const p = e.target.closest('[data-paint]');
    if (p) settings.set('paint', p.dataset.paint);
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
export function createSettingsDialog(settings, quality) {
  const root = el(`
    <div class="modal" hidden>
      <div class="panel dialog" role="dialog" aria-modal="true" aria-label="설정">
        <h2>설정</h2>
        ${settingsFields()}
        <div class="card-actions"><button class="btn primary" data-act="close">닫기</button></div>
      </div>
    </div>`);
  const refresh = bindSettings(root, settings, quality);
  const close = () => { root.hidden = true; };
  root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-act="close"]')) close(); });
  return { el: root, open() { refresh(); root.hidden = false; root.querySelector('[data-act="close"]').focus(); }, close, get isOpen() { return !root.hidden; } };
}

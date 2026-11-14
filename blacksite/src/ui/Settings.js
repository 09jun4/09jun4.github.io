// 설정: 그래픽 · 사운드 · 조작 · 화면. 변경 즉시 적용·자동 저장.
import { esc } from '../utils/dom.js';
import { ACTIONS, keyName, DEFAULT_BINDINGS } from '../input/KeyBindings.js';

const TABS = [['graphics', '그래픽', 'GRAPHICS'], ['audio', '사운드', 'AUDIO'], ['controls', '조작', 'CONTROLS'], ['display', '화면', 'DISPLAY']];

export class SettingsView {
  constructor(game) { this.game = game; this.tab = 'graphics'; }

  render(body) {
    this.body = body;
    body.innerHTML = `
      <div class="set-tabs">${TABS.map(([id, ko, en]) => `<button class="set-tab ${id === this.tab ? 'on' : ''}" data-t="${id}"><b>${en}</b><span>${ko}</span></button>`).join('')}</div>
      <div class="set-body"></div>
      <div class="set-foot"><span class="dim small">변경 사항은 즉시 적용되고 자동 저장돼요.</span></div>`;
    body.querySelectorAll('.set-tab').forEach((b) => { b.onclick = () => { this.tab = b.dataset.t; this.render(body); }; });
    this.renderTab(body.querySelector('.set-body'));
  }

  renderTab(el) {
    const s = this.game.save.settings;
    const row = (label, ctrl, hint = '') => `<div class="set-row"><div class="sr-l">${label}${hint ? `<em>${hint}</em>` : ''}</div><div class="sr-c">${ctrl}</div></div>`;
    const slider = (g, k, min, max, step, fmt) => `<input type="range" data-g="${g}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[g][k]}"><output>${fmt(s[g][k])}</output>`;
    const toggle = (g, k) => `<button class="tog ${s[g][k] ? 'on' : ''}" data-g="${g}" data-k="${k}">${s[g][k] ? 'ON' : 'OFF'}</button>`;
    const pct = (v) => Math.round(v * 100) + '%';
    let html = '';
    if (this.tab === 'graphics') {
      const presets = this.game.cfg.game.graphicsPresets;
      html += row('프리셋 <b>PRESET</b>', `<div class="seg">${Object.keys(presets).map((p) => `<button class="${s.graphics.preset === p ? 'on' : ''}" data-preset="${p}">${{ low: '낮음', medium: '보통', high: '높음' }[p]}</button>`).join('')}</div>`, '낮음은 내장 그래픽에 추천');
      html += row('해상도 배율 <b>RESOLUTION</b>', slider('graphics', 'resolutionScale', 0.5, 1, 0.05, pct));
      html += row('그림자 <b>SHADOWS</b>', toggle('graphics', 'shadows'));
      html += row('FPS 표시 <b>SHOW FPS</b>', toggle('graphics', 'showFps'));
      html += `<p class="dim small">안티에일리어싱(높음 프리셋)은 다음에 게임을 열 때 적용돼요.</p>`;
    } else if (this.tab === 'audio') {
      html += row('전체 <b>MASTER</b>', slider('audio', 'master', 0, 1, 0.05, pct));
      html += row('효과음 <b>SFX</b>', slider('audio', 'sfx', 0, 1, 0.05, pct));
      html += row('배경음악 <b>MUSIC</b>', slider('audio', 'music', 0, 1, 0.05, pct));
      html += row('환경음 <b>AMBIENCE</b>', slider('audio', 'ambience', 0, 1, 0.05, pct));
    } else if (this.tab === 'controls') {
      html += row('마우스 감도 <b>SENSITIVITY</b>', slider('controls', 'sensitivity', 0.1, 3, 0.05, (v) => (+v).toFixed(2) + '×'));
      html += row('조준 감도 비율 <b>ADS SENSITIVITY</b>', slider('controls', 'aimSensitivity', 0.2, 1, 0.05, pct), '기본 감도 대비');
      html += row('Y축 반전 <b>INVERT Y</b>', toggle('controls', 'invertY'));
      const b = this.game.bindings, dup = b.duplicates();
      html += `<div class="set-sub">KEY BINDINGS <em>키 재지정 — 칸을 누르고 원하는 키·마우스 버튼을 누르세요 (ESC 취소)</em></div><div class="binds">`;
      html += ACTIONS.map((a) => `<div class="bind ${dup.has(a.id) ? 'dup' : ''}"><span>${esc(a.label)}<em>${esc(a.en)}</em></span><button class="key-btn" data-act="${a.id}">${esc(keyName(b.get(a.id)))}</button></div>`).join('');
      html += `</div>${dup.size ? '<p class="warn small">⚠ 같은 키가 여러 행동에 지정돼 있어요. 빨간 항목을 바꿔 주세요.</p>' : ''}
        <button class="btn small" data-a="resetKeys">기본값 복원 RESET DEFAULTS</button>`;
    } else if (this.tab === 'display') {
      html += row('시야각 <b>FOV</b>', slider('display', 'fov', 70, 110, 1, (v) => v + '°'), '기본 90° (수평)');
      html += row('화면 흔들림 <b>CAMERA SHAKE</b>', slider('display', 'shake', 0, 1.5, 0.05, pct));
    }
    el.innerHTML = html;
    this.bind(el);
  }

  bind(el) {
    const save = this.game.save;
    el.querySelectorAll('input[type=range]').forEach((r) => {
      r.oninput = () => {
        const v = parseFloat(r.value);
        r.nextElementSibling.textContent = fmtOf(r, v);
        save.updateSettings(r.dataset.g, { [r.dataset.k]: v });
      };
    });
    el.querySelectorAll('.tog').forEach((b) => {
      b.onclick = () => { const g = b.dataset.g, k = b.dataset.k; save.updateSettings(g, { [k]: !save.settings[g][k] }); this.renderTab(el); };
    });
    el.querySelectorAll('[data-preset]').forEach((b) => {
      b.onclick = () => {
        const p = this.game.cfg.game.graphicsPresets[b.dataset.preset];
        save.updateSettings('graphics', { preset: b.dataset.preset, resolutionScale: p.resolutionScale, shadows: p.shadows });
        this.renderTab(el);
      };
    });
    el.querySelectorAll('.key-btn').forEach((b) => {
      b.onclick = () => {
        el.querySelectorAll('.key-btn.wait').forEach((x) => x.classList.remove('wait'));
        b.classList.add('wait');
        b.textContent = 'PRESS A KEY';
        this.game.input.captureNext((code) => {
          if (code) {
            const kb = { ...save.settings.keyBindings, [b.dataset.act]: code };
            save.updateSettings('keyBindings', kb);
          }
          this.renderTab(el);
        });
      };
    });
    const reset = el.querySelector('[data-a=resetKeys]');
    if (reset) reset.onclick = () => { save.updateSettings('keyBindings', { ...DEFAULT_BINDINGS }); this.renderTab(el); };
  }
}

function fmtOf(r, v) {
  const k = r.dataset.k;
  if (k === 'sensitivity') return v.toFixed(2) + '×';
  if (k === 'fov') return v + '°';
  return Math.round(v * 100) + '%';
}

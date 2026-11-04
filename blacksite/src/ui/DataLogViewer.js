// 데이터 로그 열람: 모노스페이스 터미널 화면 + 타이핑 효과. 클릭·F·Space로 즉시 전체 표시, 한 번 더 누르면 닫기.
import { el, esc } from '../utils/dom.js';

export class DataLogViewer {
  constructor(root) {
    this.root = el('div', 'logview hidden');
    this.root.innerHTML = `
      <div class="lv-win">
        <div class="lv-bar"><span class="lv-id"></span><span class="lv-sys">K-7 // SECURE TERMINAL</span></div>
        <div class="lv-head"><div class="lv-title-en"></div><div class="lv-title"></div><div class="lv-meta"></div></div>
        <pre class="lv-body"></pre>
        <div class="lv-foot"><span class="lv-hint">F / SPACE  계속</span><button class="btn small" data-a="close">CLOSE</button></div>
      </div>`;
    root.appendChild(this.root);
    this.body = this.root.querySelector('.lv-body');
    this.root.querySelector('[data-a=close]').onclick = () => this.close('button');
    this.root.addEventListener('mousedown', (e) => { if (e.target.dataset.a !== 'close') this.advance(); });
    this._key = (e) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.code === 'KeyF' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.advance(); }
    };
    addEventListener('keydown', this._key);
    this.onClose = null;
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(log, { index = 1, total = 5, onClose } = {}) {
    this.log = log;
    this.text = log.body;
    this.pos = 0;
    this.acc = 0;
    this.onClose = onClose;
    this.root.querySelector('.lv-id').textContent = `LOG ${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    this.root.querySelector('.lv-title-en').textContent = log.titleEn || '';
    this.root.querySelector('.lv-title').textContent = log.title || '';
    this.root.querySelector('.lv-meta').innerHTML = `${esc(log.author || '')}  ·  ${esc(log.date || '')}`;
    this.body.textContent = '';
    this.root.classList.remove('hidden');
  }
  get done() { return this.pos >= (this.text || '').length; }
  advance() {
    if (!this.done) { this.pos = this.text.length; this.render(); } else this.close('key');
  }
  close(via) {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    const cb = this.onClose; this.onClose = null;
    cb?.(via);
  }
  render() {
    this.body.innerHTML = esc(this.text.slice(0, this.pos)) + (this.done ? '' : '<span class="cursor">▌</span>');
    this.root.querySelector('.lv-hint').textContent = this.done ? 'F / SPACE  닫기' : 'F / SPACE  모두 보기';
  }
  update(dt) {
    if (!this.isOpen || this.done) return;
    this.acc += dt * 70;
    const n = Math.floor(this.acc);
    if (n > 0) { this.acc -= n; this.pos = Math.min(this.text.length, this.pos + n); this.render(); }
  }
}

// HUD: 실제 전투기 HUD를 본뜬 미니멀 표시(2D 캔버스 오버레이). 청록 단색 + 얇은 선.
// 기준 해상도(1280×720)의 좌표로 그리고 화면 크기에 비례해 확대한다. 원점은 화면 중앙.
import * as THREE from 'three';
import { HUD } from '../data/hud.js';
import { RAD, clamp } from '../core/math.js';
import { LOCK } from '../combat/lock-on.js';
import { PHASE } from '../core/mission-session.js';

const _v = new THREE.Vector3();
const TEXT = {
  speed: 'SPD', alt: 'ALT', hp: 'HP', targets: '남은 적기', hit: '피격', lowHp: '체력 경고', pullUp: '고도 주의',
  ceiling: '상승 한계', overheat: '과열', kill: '격추', wave: '적 편대 접근', lock: 'LOCK', noAmmo: '미사일 없음',
  clear: '임무 완수', down: '격추당함', time: 'TIME',
};

export class Hud {
  /** @param {HTMLCanvasElement} canvas @param {HTMLElement} damageEl 피격 붉은 효과 레이어 */
  constructor(canvas, damageEl) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.damageEl = damageEl;
    this.w = 0;
    this.h = 0;
    this.scale = 1;
    this.dpr = 1;
    this.time = 0;
    this.visible = false;
    this.lastDamage = -1;
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.scale = clamp(Math.min(w / HUD.baseWidth, h / HUD.baseHeight), HUD.minScale, HUD.maxScale);
  }

  setVisible(on) {
    if (this.visible === on) return;
    this.visible = on;
    this.canvas.style.display = on ? 'block' : 'none';
    if (!on) this._setDamage(0);
  }

  _setDamage(v) {
    const q = Math.round(v * 50) / 50;
    if (q === this.lastDamage) return;
    this.lastDamage = q;
    this.damageEl.style.opacity = String(q);
  }

  // ── 그리기 도우미 ───────────────────────────────────────────────────────
  _line(color, width = HUD.lineWidth) {
    const g = this.g;
    g.lineWidth = width + 2;
    g.strokeStyle = HUD.shadow;
    g.stroke();
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
  }

  _text(str, x, y, size, color, align = 'left', ko = false, weight = 500) {
    const g = this.g;
    g.font = `${weight} ${size}px ${ko ? HUD.fontKo : HUD.font}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = HUD.shadow;
    g.strokeText(str, x, y);
    g.fillStyle = color;
    g.fillText(str, x, y);
  }

  /** 모서리만 있는 사각형. gap(0~1)이 클수록 모서리가 짧다. */
  _corners(x, y, half, len) {
    const g = this.g;
    g.beginPath();
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        g.moveTo(x + sx * half, y + sy * (half - len));
        g.lineTo(x + sx * half, y + sy * half);
        g.lineTo(x + sx * (half - len), y + sy * half);
      }
    }
  }

  /** 월드 좌표 → HUD 좌표. 화면 앞쪽이면 true */
  _project(pos, camera, out) {
    _v.copy(pos).applyMatrix4(camera.matrixWorldInverse);
    const front = _v.z < 0;
    out.cx = _v.x; // 카메라 좌표(화면 밖 방향 계산용)
    out.cy = _v.y;
    _v.applyMatrix4(camera.projectionMatrix);
    out.x = (_v.x * this.w) / 2 / this.scale;
    out.y = (-_v.y * this.h) / 2 / this.scale;
    return front;
  }

  // ── 메인 ────────────────────────────────────────────────────────────────
  /**
   * @param {import('../core/mission-session.js').MissionSession} session
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} dt
   */
  render(session, camera, dt) {
    if (!this.visible) return;
    this.time += dt;
    const g = this.g;
    const s = this.scale * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(s, 0, 0, s, this.canvas.width / 2, this.canvas.height / 2);
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    const W = this.w / this.scale / 2;
    const H = this.h / this.scale / 2;
    const player = session.player;
    const view = player.view;
    const fb = session.feedback;
    const hpRatio = player.hp / player.cfg.hp;
    const blink = Math.sin(this.time * 9) > 0;

    // 피격 붉은 효과 + 체력 낮을 때 은은한 맥동
    const low = hpRatio <= HUD.lowHp && player.alive;
    this._setDamage(Math.max(fb.hit * 0.9, low ? 0.22 + 0.12 * Math.sin(this.time * 5) : 0));

    if (player.alive) {
      this._attitude(camera);
      this._tapes(view, player, W, H, blink);
    }
    this._enemies(session, camera, W, H);
    if (player.alive && session.phase === PHASE.ACTIVE) this._weaponAim(session, camera, W, H);
    this._status(session, player, hpRatio, W, H, blink);
    this._notices(session, player, fb, low, W, H, blink);
  }

  /** 수평선·피치 사다리(기체 롤만큼 기울어진다) */
  _attitude(camera) {
    const g = this.g;
    const L = HUD.ladder;
    // 카메라 기준으로 그려서 실제 수평선과 겹치게 한다(1인칭에서는 곧 기체 자세)
    const m = camera.matrixWorld.elements;
    const pitchDeg = Math.asin(clamp(-m[9], -1, 1)) * RAD; // 카메라 전방(-z축)의 y
    const camRoll = Math.atan2(m[1], m[5]); // 카메라 오른쪽·위쪽 축의 y 성분
    g.save();
    g.beginPath();
    g.rect(-L.halfWidth - 60, -150, (L.halfWidth + 60) * 2, 300);
    g.clip();
    g.rotate(camRoll);
    const first = Math.ceil((pitchDeg - L.range) / L.stepDeg) * L.stepDeg;
    for (let d = first; d <= pitchDeg + L.range; d += L.stepDeg) {
      const y = (pitchDeg - d) * L.pxPerDeg;
      g.beginPath();
      if (d === 0) {
        g.moveTo(-L.halfWidth - 46, y); g.lineTo(-L.gap, y);
        g.moveTo(L.gap, y); g.lineTo(L.halfWidth + 46, y);
        this._line(HUD.color);
      } else {
        const tick = d > 0 ? 7 : -7;
        if (d < 0) g.setLineDash([7, 5]);
        g.moveTo(-L.halfWidth, y + tick); g.lineTo(-L.halfWidth, y); g.lineTo(-L.gap, y);
        g.moveTo(L.halfWidth, y + tick); g.lineTo(L.halfWidth, y); g.lineTo(L.gap, y);
        this._line(HUD.dim);
        g.setLineDash([]);
        this._text(String(Math.abs(d)), -L.halfWidth - 8, y, 11, HUD.dim, 'right');
        this._text(String(Math.abs(d)), L.halfWidth + 8, y, 11, HUD.dim, 'left');
      }
    }
    g.restore();
    // 기체 기준 표시(고정)
    g.beginPath();
    g.moveTo(-18, 0); g.lineTo(-7, 0); g.lineTo(0, 6); g.lineTo(7, 0); g.lineTo(18, 0);
    this._line(HUD.color);
  }

  /** 속도(왼쪽)·고도(오른쪽) */
  _tapes(view, player, W, H, blink) {
    const g = this.g;
    const T = HUD.tape;
    const x = Math.min(T.offsetX, W - 120);
    const draw = (sign, value, unit, label, warn) => {
      const cx = sign * x;
      const color = warn ? (blink ? HUD.warn : HUD.dim) : HUD.color;
      // 눈금 띠
      g.beginPath();
      const step = unit;
      const pxPer = 2.2 / (unit / 10);
      const base = Math.floor(value / step) * step;
      for (let i = -4; i <= 5; i++) {
        const v = base + i * step;
        const y = (value - v) * pxPer;
        if (Math.abs(y) > T.height / 2) continue;
        const major = Math.round(v / step) % 5 === 0;
        g.moveTo(cx + sign * 34, y);
        g.lineTo(cx + sign * (34 + (major ? T.tick * 1.6 : T.tick)), y);
      }
      this._line(HUD.dim);
      // 현재 값 상자
      g.beginPath();
      g.rect(cx - 34, -13, 68, 26);
      this._line(color);
      this._text(String(Math.round(value)), cx, 1, 16, color, 'center', false, 600);
      this._text(label, cx, -26, 10, HUD.dim, 'center');
    };
    const sp = player.cfg.speed;
    draw(-1, view.speed, 10, TEXT.speed, view.speed < sp.min + 6);
    const alt = view.pos.y;
    draw(1, alt, 100, TEXT.alt, alt < player.cfg.altitude.warnBelow);
    void H;
  }

  /** 적기 표시: 화면 안은 붉은 모서리 상자, 화면 밖은 가장자리 화살표(거리 숫자 없음) */
  _enemies(session, camera, W, H) {
    const g = this.g;
    const A = HUD.arrow;
    const p = this._p || (this._p = { x: 0, y: 0, cx: 0, cy: 0 });
    for (const e of session.enemies.list) {
      if (!e.alive) continue;
      const front = this._project(e.group.position, camera, p);
      const inside = front && Math.abs(p.x) < W - 12 && Math.abs(p.y) < H - 12;
      if (inside) {
        this._corners(p.x, p.y, 13, 5);
        this._line(HUD.enemy, 1.25);
        continue;
      }
      // 화면 밖: 카메라 기준 방향으로 가장자리에 화살표
      let dx = p.cx, dy = -p.cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const k = Math.min((W - A.margin) / Math.max(Math.abs(dx), 1e-4), (H - A.margin) / Math.max(Math.abs(dy), 1e-4));
      const ax = dx * k, ay = clamp(dy * k, -H + A.keepOut, H - A.keepOut);
      const nx = -dy, ny = dx;
      g.beginPath();
      g.moveTo(ax + dx * A.size, ay + dy * A.size);
      g.lineTo(ax - dx * A.size * 0.5 + nx * A.size * 0.75, ay - dy * A.size * 0.5 + ny * A.size * 0.75);
      g.lineTo(ax - dx * A.size * 0.5 - nx * A.size * 0.75, ay - dy * A.size * 0.5 - ny * A.size * 0.75);
      g.closePath();
      g.fillStyle = HUD.enemy;
      g.fill();
      this._line(HUD.shadow, 0.5);
    }
  }

  /** 조준점(기관포) / 락온 사각형(미사일) */
  _weaponAim(session, camera, W, H) {
    const g = this.g;
    const ui = session.weapons.uiState();
    if (ui.kind === 'heat') {
      const x = session.cursor.x / this.scale - W;
      const y = session.cursor.y / this.scale - H;
      const color = ui.overheated ? HUD.warn : ui.onTarget ? HUD.ok : HUD.color;
      g.beginPath();
      g.arc(x, y, 11, 0, Math.PI * 2);
      g.moveTo(x - 20, y); g.lineTo(x - 6, y);
      g.moveTo(x + 6, y); g.lineTo(x + 20, y);
      g.moveTo(x, y - 20); g.lineTo(x, y - 6);
      g.moveTo(x, y + 6); g.lineTo(x, y + 20);
      this._line(color);
      g.beginPath();
      g.arc(x, y, 1.4, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      // 과열 게이지를 조준점 아래에도 작게
      if (ui.heat > 0.02) {
        g.beginPath();
        g.moveTo(x - 16, y + 27); g.lineTo(x - 16 + 32 * ui.heat, y + 27);
        this._line(ui.overheated || ui.heat > 0.8 ? HUD.warn : HUD.dim, 2);
      }
      return;
    }
    // 미사일: 화면 중심의 락온 범위(옅은 원) + 상태별 사각형
    const radiusPx = (Math.tan((ui.lockRadius * Math.PI) / 180) / Math.tan((camera.fov * Math.PI) / 360)) * H;
    g.beginPath();
    g.setLineDash([3, 9]);
    g.arc(0, 0, radiusPx, 0, Math.PI * 2);
    this._line(HUD.faint, 1);
    g.setLineDash([]);
    if (ui.lockState === LOCK.SEARCH || !ui.target) {
      this._corners(0, 0, 24, 9);
      this._line(ui.ammo > 0 ? HUD.lock.search : HUD.dim);
      return;
    }
    const p = this._p;
    this._project(ui.target.group.position, camera, p);
    if (ui.lockState === LOCK.TRACKING) {
      // 진행도에 따라 모서리가 대상 쪽으로 조여들고 길어진다
      const t = ui.lockProgress;
      const half = 46 - 24 * t;
      this._corners(p.x, p.y, half, 6 + 12 * t);
      this._line(HUD.lock.tracking, 1.75);
      g.beginPath();
      g.arc(p.x, p.y, half + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      this._line(HUD.lock.tracking, 1);
    } else {
      g.beginPath();
      g.rect(p.x - 22, p.y - 22, 44, 44);
      this._line(HUD.lock.locked, 2);
      g.beginPath();
      g.moveTo(p.x - 30, p.y); g.lineTo(p.x - 22, p.y);
      g.moveTo(p.x + 22, p.y); g.lineTo(p.x + 30, p.y);
      g.moveTo(p.x, p.y - 30); g.lineTo(p.x, p.y - 22);
      g.moveTo(p.x, p.y + 22); g.lineTo(p.x, p.y + 30);
      this._line(HUD.lock.locked, 2);
      this._text(TEXT.lock, p.x, p.y + 38, 12, HUD.lock.locked, 'center', false, 700);
    }
  }

  /** 체력·무장·미션 진행 */
  _status(session, player, hpRatio, W, H, blink) {
    const g = this.g;
    // 체력(왼쪽 아래)
    const hx = -W + 36, hy = H - 44;
    const hpColor = hpRatio <= HUD.lowHp ? (blink ? HUD.danger : HUD.warn) : HUD.color;
    this._text(TEXT.hp, hx, hy - 18, 11, HUD.dim);
    this._text(String(Math.ceil(player.hp)), hx + 190, hy - 18, 13, hpColor, 'right', false, 600);
    g.beginPath();
    g.rect(hx, hy - 7, 190, 12);
    this._line(hpColor);
    g.fillStyle = hpColor;
    const segs = 20;
    const filled = Math.ceil(hpRatio * segs);
    for (let i = 0; i < filled; i++) g.fillRect(hx + 3 + i * 9.25, hy - 4, 7.25, 6);

    // 무장(오른쪽 아래)
    const ui = session.weapons.uiState();
    const wx = W - 36, wy = H - 44;
    const flash = session.feedback.switched > 0;
    this._text(ui.name, wx, wy - 18, 14, flash ? HUD.ok : HUD.color, 'right', true, 600);
    this._text('F', wx - 190, wy - 18, 10, HUD.dim, 'left');
    if (ui.kind === 'heat') {
      const hot = ui.overheated || ui.heat > 0.8;
      const c = ui.overheated ? (blink ? HUD.danger : HUD.warn) : hot ? HUD.warn : HUD.color;
      g.beginPath();
      g.rect(wx - 190, wy - 7, 190, 12);
      this._line(c);
      g.fillStyle = c;
      g.fillRect(wx - 187, wy - 4, 184 * clamp(ui.heat, 0, 1), 6);
      if (ui.overheated) this._text(`${TEXT.overheat} ${ui.lock.toFixed(1)}`, wx - 196, wy, 12, c, 'right', true, 600);
    } else {
      for (let i = 0; i < ui.ammoMax; i++) {
        const x = wx - 14 - i * 20;
        g.beginPath();
        g.moveTo(x, wy - 9); g.lineTo(x + 6, wy - 3); g.lineTo(x + 6, wy + 7); g.lineTo(x - 6, wy + 7); g.lineTo(x - 6, wy - 3);
        g.closePath();
        if (i < ui.ammo) { g.fillStyle = HUD.color; g.fill(); }
        this._line(i < ui.ammo ? HUD.color : HUD.dim, 1);
      }
      this._text(`${ui.ammo}/${ui.ammoMax}`, wx - 120, wy, 13, ui.ammo > 0 ? HUD.color : HUD.warn, 'right', false, 600);
    }

    // 미션 진행(위쪽 가운데)
    const left = Math.max(0, session.total - session.stats.kills);
    this._text(TEXT.targets, -8, -H + 34, 12, HUD.dim, 'right', true);
    this._text(`${left} / ${session.total}`, 4, -H + 34, 16, left === 0 ? HUD.ok : HUD.color, 'left', false, 600);
    const t = session.stats.time;
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60);
    this._text(`${TEXT.time} ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 0, -H + 56, 11, HUD.dim, 'center');
  }

  /** 순간 알림: 꼭 필요한 것만 */
  _notices(session, player, fb, low, W, H, blink) {
    let y = -H * 0.36;
    const put = (str, color, size = 15) => { this._text(str, 0, y, size, color, 'center', true, 700); y += size + 9; };
    if (session.phase === PHASE.ENDING || session.phase === PHASE.DONE) {
      put(session.success ? TEXT.clear : TEXT.down, session.success ? HUD.ok : HUD.danger, 26);
      return;
    }
    if (fb.wave > 0) put(TEXT.wave, HUD.warn);
    if (fb.kill > 0) put(TEXT.kill, HUD.ok);
    const lim = player.flight.limit;
    if (lim < 0 || player.view.pos.y < player.cfg.altitude.warnBelow) { if (blink) put(TEXT.pullUp, HUD.warn); else y += 24; } else if (lim > 0 && blink) put(TEXT.ceiling, HUD.warn);
    // 피격·체력 경고는 아래쪽 가운데
    let wy = H * 0.3;
    if (fb.hitWarn > 0) { this._text(TEXT.hit, 0, wy, 16, HUD.danger, 'center', true, 700); wy += 26; }
    if (low && blink) this._text(TEXT.lowHp, 0, wy, 14, HUD.danger, 'center', true, 700);
    void W;
  }
}

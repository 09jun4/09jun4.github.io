// HUD: 실제 전투기 HUD를 본뜬 미니멀 표시(2D 캔버스 오버레이). 청록 단색 + 얇은 선.
// 기준 해상도(1280×720)의 좌표로 그리고 화면 크기에 비례해 확대한다. 원점은 화면 중앙.
import * as THREE from 'three';
import { THREAT } from '../data/extras.js';
import { HUD } from '../data/hud.js';
import { RAD, clamp } from '../core/math.js';
import { LOCK } from '../combat/lock-on.js';
import { PHASE } from '../core/mission-session.js';

const _v = new THREE.Vector3();
const TEXT = {
  speed: 'SPD', alt: 'ALT', hp: 'HP', targets: '남은 적기', takeoff: '이륙 활주', rotate: 'W 또는 S — 기수 들기', climb: '상승 중 · 기어 접는 중', skip: 'Enter / Space  건너뛰기', hit: '피격', lowHp: '체력 경고', pullUp: '고도 주의',
  ceiling: '상승 한계', overheat: '과열', kill: '격추', wave: '적 편대 접근', lock: 'LOCK', noAmmo: '미사일 없음',
  clear: '임무 완수', down: '격추당함', time: 'TIME',
  warn: 'WARNING', warnMissile: 'MISSILE', threat_gun: '적 사격', threat_chase: '후방 추격', threat_missile: '미사일 접근', skipTouch: '건너뛰기 버튼',
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
    this.touch = false; // 모바일 배치(체력을 위로, 글자 크기 하한)
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.scale = clamp(Math.min(w / HUD.baseWidth, h / HUD.baseHeight), this.touch ? HUD.touchMinScale : HUD.minScale, HUD.maxScale);
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
    if (this.touch) size = Math.max(size, HUD.touchMinFont / this.scale); // 모바일 최소 글자 크기
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
    // 킬캠(옆 카메라): 조준·계기 대신 격추 표시만
    if (session.killcam && session.killcam.cam) {
      this._setDamage(0);
      this._text(TEXT.kill, 0, -H * 0.36, 26, HUD.ok, 'center', true, 700);
      this._text(this.touch ? TEXT.skipTouch : TEXT.skip, 0, H * 0.4, 12, HUD.dim, 'center', true, 600);
      return;
    }

    // 피격 붉은 효과 + 체력 낮을 때 은은한 맥동
    const low = hpRatio <= HUD.lowHp && player.alive;
    this._setDamage(Math.max(fb.hit * 0.9, low ? 0.22 + 0.12 * Math.sin(this.time * 5) : 0));

    if (player.alive) {
      const cockpit = player.cockpit;
      if (player.cockpitView && cockpit && cockpit.hudCanvas) this._glass(cockpit, view, player, W, H, blink);
      else {
        this._attitude(camera.matrixWorld.elements, 1);
        this._tapes(view, player, W, H, blink, Math.min(HUD.tape.offsetX, W - 120), 1);
      }
    }
    this._enemies(session, camera, W, H);
    if (player.alive && session.phase === PHASE.ACTIVE) this._weaponAim(session, camera, W, H);
    this._status(session, player, hpRatio, W, H, blink);
    this._notices(session, player, fb, low, W, H, blink);
    if (player.alive && session.phase === PHASE.ACTIVE && session.threat) this._threat(session.threat.state, W, H, blink);
  }

  /** 위협 경고: 화면 가장자리의 방향 화살표 + WARNING (위 = 정면, 아래 = 뒤) */
  _threat(t, W, H, blink) {
    if (!t.active) return;
    const g = this.g;
    const sx = Math.sin(t.bearing), sy = -Math.cos(t.bearing);
    const x = sx * W * THREAT.edgeX, y = sy * H * THREAT.edgeY;
    const fast = t.kind !== 'chase';
    const on = fast ? Math.sin(this.time * 16) > -0.3 : blink;
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(sy, sx) + Math.PI / 2);
    g.globalAlpha = on ? 1 : 0.35;
    g.fillStyle = HUD.danger;
    g.beginPath(); g.moveTo(0, -17); g.lineTo(15, 11); g.lineTo(0, 4); g.lineTo(-15, 11); g.closePath(); g.fill();
    g.restore();
    const ty = y + (sy > 0.5 ? -30 : 34);
    const tx = Math.max(-W + 70, Math.min(W - 70, x));
    if (on) this._text(t.kind === 'missile' ? TEXT.warnMissile : TEXT.warn, tx, ty, 14, HUD.danger, 'center', false, 700);
    this._text(TEXT['threat_' + t.kind], tx, ty + 16, 11, HUD.danger, 'center', true, 600);
  }

  /** 수평선·피치 사다리(기체 롤만큼 기울어진다) */
  /**
   * 1인칭(하이폴리 조종석): 자세·속도·고도 기호를 2D 오버레이가 아니라 HUD 유리판 뒤의 가상 면 텍스처에 그린다.
   * 기체에 고정된 면이라 머리가 움직이면 기호가 조종석 틀에 대해 미세하게 어긋나 보인다(시차).
   */
  _glass(cockpit, view, player, W, H, blink) {
    const cv = cockpit.hudCanvas;
    if (!this._glassCtx || this._glassCanvas !== cv) { this._glassCanvas = cv; this._glassCtx = cv.getContext('2d'); }
    const main = this.g;
    const gg = this._glassCtx;
    this.g = gg;
    gg.setTransform(1, 0, 0, 1, 0, 0);
    gg.clearRect(0, 0, cv.width, cv.height);
    const f = cv.width / (HUD.glass.spanDeg * HUD.ladder.pxPerDeg); // 기준 단위 1 = 1/pxPerDeg 도
    gg.setTransform(f, 0, 0, f, cv.width / 2, cv.height / 2);
    this._attitude(player.root.matrixWorld.elements, HUD.glass.ladderScale);
    this._tapes(view, player, W, H, blink, HUD.glass.tapeX, HUD.glass.tapeScale);
    this.g = main;
    cockpit.hudTexture.needsUpdate = true;
  }

  _attitude(m, widthScale) {
    const g = this.g;
    const L = HUD.ladder;
    const halfWidth = L.halfWidth * widthScale;
    // 기준 축(3인칭은 카메라, 1인칭은 기체)으로 그려서 실제 수평선과 겹치게 한다
    const pitchDeg = Math.asin(clamp(-m[9], -1, 1)) * RAD; // 카메라 전방(-z축)의 y
    const camRoll = Math.atan2(m[1], m[5]); // 카메라 오른쪽·위쪽 축의 y 성분
    g.save();
    g.beginPath();
    g.rect(-halfWidth - 60, -150 * Math.max(0.7, widthScale), (halfWidth + 60) * 2, 300 * Math.max(0.7, widthScale));
    g.clip();
    g.rotate(camRoll);
    const first = Math.ceil((pitchDeg - L.range) / L.stepDeg) * L.stepDeg;
    for (let d = first; d <= pitchDeg + L.range; d += L.stepDeg) {
      const y = (pitchDeg - d) * L.pxPerDeg;
      g.beginPath();
      if (d === 0) {
        g.moveTo(-halfWidth - 46 * widthScale, y); g.lineTo(-L.gap, y);
        g.moveTo(L.gap, y); g.lineTo(halfWidth + 46 * widthScale, y);
        this._line(HUD.color);
      } else {
        const tick = d > 0 ? 7 : -7;
        if (d < 0) g.setLineDash([7, 5]);
        g.moveTo(-halfWidth, y + tick); g.lineTo(-halfWidth, y); g.lineTo(-L.gap, y);
        g.moveTo(halfWidth, y + tick); g.lineTo(halfWidth, y); g.lineTo(L.gap, y);
        this._line(HUD.dim);
        g.setLineDash([]);
        this._text(String(Math.abs(d)), -halfWidth - 8, y, 11, HUD.dim, 'right');
        this._text(String(Math.abs(d)), halfWidth + 8, y, 11, HUD.dim, 'left');
      }
    }
    g.restore();
    // 기체 기준 표시(고정)
    g.beginPath();
    g.moveTo(-18, 0); g.lineTo(-7, 0); g.lineTo(0, 6); g.lineTo(7, 0); g.lineTo(18, 0);
    this._line(HUD.color);
  }

  /** 속도(왼쪽)·고도(오른쪽) */
  _tapes(view, player, W, H, blink, x, scale) {
    const g = this.g;
    const T = HUD.tape;
    const draw = (sign, value, unit, label, warn) => {
      g.save();
      g.translate(sign * x, 0);
      g.scale(scale, scale);
      const cx = 0;
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
      g.restore();
    };
    const sp = player.cfg.speed;
    draw(-1, view.speed, 10, TEXT.speed, !player.manual && view.speed < sp.min + 6);
    const alt = view.pos.y;
    draw(1, alt, 100, TEXT.alt, player.flight.limit < 0 && player.flight.pitch < 0.03);
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
    // 미사일: 가상 조준점(마우스·터치 위치) 둘레의 락온 범위(옅은 원) + 상태별 사각형
    const cx = session.cursor.x / this.scale - W;
    const cy = session.cursor.y / this.scale - H;
    const radiusPx = (Math.tan((ui.lockRadius * Math.PI) / 180) / Math.tan((camera.fov * Math.PI) / 360)) * H;
    g.beginPath();
    g.setLineDash([3, 9]);
    g.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    this._line(HUD.faint, 1);
    g.setLineDash([]);
    if (ui.lockState === LOCK.SEARCH || !ui.target) {
      this._corners(cx, cy, 24, 9);
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
      // 락온 완료: 초록 사각형 + 0.3초짜리 펄스(바깥으로 퍼지는 사각형)
      const age = ui.lockedFor || 0;
      if (age < 0.3) {
        const k = age / 0.3, r = 22 + 26 * k;
        g.globalAlpha = 1 - k;
        g.beginPath();
        g.rect(p.x - r, p.y - r, r * 2, r * 2);
        this._line(HUD.lock.locked, 2);
        g.globalAlpha = 1;
      }
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
    const hx = this.touch ? -W + 20 : -W + 36;
    const hy = this.touch ? -H + 58 : H - 44; // 모바일: 왼쪽 아래는 조이스틱 자리라 체력을 위로
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
    if (session.phase === PHASE.TAKEOFF) {
      const st = session.takeoff.state;
      if (st === 'rotate') { if (blink) put(TEXT.rotate, HUD.ok, 20); else y += 29; } else put(st === 'roll' ? TEXT.takeoff : TEXT.climb, HUD.color, 16);
      this._text(TEXT.skip, 0, H * 0.4, 12, HUD.dim, 'center', true, 600);
      return;
    }
    if (session.phase === PHASE.ENDING || session.phase === PHASE.DONE) {
      put(session.success ? TEXT.clear : TEXT.down, session.success ? HUD.ok : HUD.danger, 26);
      return;
    }
    if (fb.wave > 0) put(TEXT.wave, HUD.warn);
    if (fb.kill > 0) put(TEXT.kill, HUD.ok);
    const lim = player.flight.limit;
    if (lim < 0 && player.flight.pitch < 0.03) { if (blink) put(TEXT.pullUp, HUD.warn); else y += 24; } else if (lim > 0 && blink) put(TEXT.ceiling, HUD.warn);
    // 피격·체력 경고는 아래쪽 가운데
    let wy = H * 0.3;
    if (fb.hitWarn > 0) { this._text(TEXT.hit, 0, wy, 16, HUD.danger, 'center', true, 700); wy += 26; }
    if (low && blink) this._text(TEXT.lowHp, 0, wy, 14, HUD.danger, 'center', true, 700);
    void W;
  }
}

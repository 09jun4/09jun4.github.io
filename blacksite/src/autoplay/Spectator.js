// 관전 화면: 전술 미니맵(경비원 상태·시야, 봇 경로·목표), 봇 상태, 사건 기록, 배속·난이도·재시작 버튼.
import { bus } from '../core/EventBus.js';
import { el, esc } from '../utils/dom.js';
import { formatTime } from '../utils/math.js';

const STATE_COLOR = { patrol: '#7fd18b', suspicious: '#ffd23a', search: '#ffb347', alert: '#ff5b4b', combat: '#ff3b30', down: '#5b636b' };
const STATE_KO = { patrol: '순찰', suspicious: '의심', search: '수색', alert: '발견', combat: '교전', down: '무력화' };

export class Spectator {
  constructor(game, director) {
    this.game = game; this.d = director;
    this.root = el('div', 'spec');
    this.root.innerHTML = `
      <div class="spec-head"><span class="spec-live">● AUTO PLAY</span><span class="spec-run"></span></div>
      <canvas class="spec-map" width="720" height="300"></canvas>
      <div class="spec-bot"><span class="lbl">BOT</span><b class="spec-mode">—</b><span class="spec-obj"></span></div>
      <div class="spec-guards"></div>
      <div class="spec-feed"></div>
      <div class="spec-ctrl">
        <div class="seg spec-speed"><button data-s="1" class="on">1×</button><button data-s="2">2×</button><button data-s="4">4×</button></div>
        <div class="seg spec-diff"><button data-d="easy">쉬움</button><button data-d="normal" class="on">보통</button><button data-d="hard">어려움</button></div>
        <div class="seg spec-route"><button data-r="tour" class="on">전체 탐색</button><button data-r="fast">최단 경로</button></div>
        <button class="btn small spec-restart">재시작</button>
        <button class="btn small spec-sound">소리 켜기</button>
      </div>
      <div class="spec-stats"></div>`;
    game.uiRoot.appendChild(this.root);
    this.canvas = this.root.querySelector('.spec-map');
    this.ctx = this.canvas.getContext('2d');
    this.root.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
      game.timeScale = +b.dataset.s;
      this.root.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
    });
    this.root.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => {
      director.setDifficulty(b.dataset.d);
      this.root.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === b));
      director.restart();
    });
    this.root.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => {
      director.setTour(b.dataset.r === 'tour');
      this.root.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b));
    });
    const snd = this.root.querySelector('.spec-sound');
    snd.onclick = () => { game.audio?.unlock(); snd.remove(); };
    this.root.querySelector('.spec-restart').onclick = () => director.restart();
    this.feed = [];
    this._t = 0;
    const name = (g) => { const z = game.session?.facility.zoneById[g.def.zone]; return (z ? z.name : '') + ' 경비원'; };
    const add = (txt, kind = '') => {
      const t = game.session ? formatTime(game.session.time).slice(0, 5) : '--:--';
      this.feed.unshift({ t, txt, kind });
      this.feed.length = Math.min(this.feed.length, 7);
      this.renderFeed();
    };
    bus.on('state:changed', ({ name: n }) => { if (n === 'playing') { this.feed = []; add(`작전 시작 · 난이도 ${game.cfg.game.difficulties[director.difficulty].label}`); } });
    bus.on('guard:down', ({ guard, kind }) => add(`${kind === 'takedown' ? '암살' : '사살'} — ${name(guard)}`, kind === 'takedown' ? 'good' : ''));
    bus.on('guard:detected', ({ guard }) => add(`발각 — ${name(guard)}`, 'bad'));
    bus.on('terminal:start', () => add('터미널 다운로드 시작'));
    bus.on('terminal:cancel', () => add('다운로드 중단', 'bad'));
    bus.on('terminal:complete', () => add('기밀 데이터 확보', 'good'));
    bus.on('log:open', ({ log }) => add(`로그 열람 — ${log.title}`));
    bus.on('mission:complete', (r) => add(`탈출 성공 · ${formatTime(r.timeSec)}`, 'good'));
    bus.on('mission:failed', () => add('요원 사망 — 작전 실패', 'bad'));
  }

  renderFeed() {
    this.root.querySelector('.spec-feed').innerHTML = this.feed.map((f) => `<div class="${f.kind}"><i>${f.t}</i>${esc(f.txt)}</div>`).join('');
  }

  update(dt) {
    const s = this.game.session;
    this.drawMap(s);
    this._t += dt;
    if (this._t < 0.2) return;
    this._t = 0;
    const d = this.d;
    this.root.querySelector('.spec-run').textContent = `RUN ${d.runs} · 성공 ${d.wins} · 실패 ${d.fails}`;
    const ap = s?.autopilot;
    const name = this.game.fsm.name;
    this.root.querySelector('.spec-mode').textContent = name === 'playing' ? (ap ? ap.modeText : '—') : name === 'results' ? '작전 성공 — 곧 재도전' : name === 'failure' ? '작전 실패 — 곧 재도전' : '준비 중';
    this.root.querySelector('.spec-obj').textContent = s?.mission?.current ? s.mission.current.text : '';
    this.root.querySelector('.spec-guards').innerHTML = s ? s.enemies.map((g) => {
      const z = s.facility.zoneById[g.def.zone];
      return `<span style="--c:${STATE_COLOR[g.stateName]}"><i></i>${esc(z ? z.name : g.id)} <em>${STATE_KO[g.stateName] || g.stateName}</em></span>`;
    }).join('') : '';
    const h = d.history.slice(-6);
    this.root.querySelector('.spec-stats').innerHTML = s ? `
      <span>시간 <b>${formatTime(s.time).slice(0, 5)}</b></span><span>체력 <b>${Math.ceil(s.player.health.hp)}</b></span>
      <span>처치 <b>${s.stats.kills}</b></span><span>암살 <b>${s.stats.takedowns}</b></span><span>발각 <b>${s.stats.detections}</b></span>
      <span>최고 <b>${d.best ? formatTime(d.best).slice(0, 5) : '—'}</b></span>
      <span class="hist">${h.map((x) => `<i class="${x.ok ? 'ok' : 'no'}" title="${x.ok ? '성공' : '실패'} ${formatTime(x.time)}"></i>`).join('')}</span>` : '';
  }

  drawMap(s) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.fillStyle = '#060a0e'; c.fillRect(0, 0, W, H);
    if (!s) return;
    const map = s.facility.map;
    if (!this.bounds || this.bounds.map !== map) {
      const xs = map.zones.flatMap((z) => [z.rect[0], z.rect[2]]), zs = map.zones.flatMap((z) => [z.rect[1], z.rect[3]]);
      const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 1, minZ = Math.min(...zs) - 1, maxZ = Math.max(...zs) + 1;
      const k = Math.min(W / (maxX - minX), H / (maxZ - minZ));
      this.bounds = { map, minX, minZ, k, ox: (W - (maxX - minX) * k) / 2, oy: (H - (maxZ - minZ) * k) / 2 };
    }
    const b = this.bounds;
    const X = (x) => b.ox + (x - b.minX) * b.k, Y = (z) => b.oy + (z - b.minZ) * b.k;
    // 구역
    c.lineWidth = 1.5;
    for (const z of map.zones) {
      const [x1, z1, x2, z2] = z.rect;
      c.fillStyle = z.id === 'corridor' ? '#0b131b' : '#0d1822';
      if (s.zone === z) c.fillStyle = '#12263a';
      c.fillRect(X(x1), Y(z1), (x2 - x1) * b.k, (z2 - z1) * b.k);
      c.strokeStyle = '#2b5a86'; c.strokeRect(X(x1), Y(z1), (x2 - x1) * b.k, (z2 - z1) * b.k);
      if (z.id !== 'corridor') { c.fillStyle = '#4f7394'; c.font = '600 13px Rajdhani, sans-serif'; c.fillText(z.nameEn, X(x1) + 5, Y(z1) + 15); }
    }
    // 문
    for (const d of s.facility.doors) {
      c.strokeStyle = d.open ? '#3dff8a' : '#ff5b4b'; c.lineWidth = 3.5;
      c.beginPath();
      if (d.axis === 'x') { c.moveTo(X(d.cx - d.width / 2), Y(d.cz)); c.lineTo(X(d.cx + d.width / 2), Y(d.cz)); }
      else { c.moveTo(X(d.cx), Y(d.cz - d.width / 2)); c.lineTo(X(d.cx), Y(d.cz + d.width / 2)); }
      c.stroke();
    }
    // 로그 단말
    for (const t of s.mission.logs.terminals) {
      const read = s.mission.logs.readThisRun.has(t.id);
      c.fillStyle = read ? '#24563a' : '#5fd896';
      c.fillRect(X(t.pos.x) - 3, Y(t.pos.z) - 3, 6, 6);
    }
    // 목표
    const obj = s.mission.current;
    if (obj && !s.ended) {
      const m = obj.markerPos, mx = X(m.x), my = Y(m.z), r = 7 + Math.sin(performance.now() / 200) * 1.5;
      c.strokeStyle = '#6cb6ff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(mx, my - r); c.lineTo(mx + r, my); c.lineTo(mx, my + r); c.lineTo(mx - r, my); c.closePath(); c.stroke();
    }
    // 봇 경로
    const ap = s.autopilot;
    if (ap?.path) {
      c.strokeStyle = 'rgba(108,182,255,.55)'; c.setLineDash([4, 4]); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(X(s.player.x), Y(s.player.z));
      for (let i = ap.pathIdx || 0; i < ap.path.length; i++) c.lineTo(X(ap.path[i].x), Y(ap.path[i].z));
      c.stroke(); c.setLineDash([]);
    }
    // 경비원 (시야 부채꼴)
    for (const g of s.enemies) {
      const gx = X(g.x), gy = Y(g.z), col = STATE_COLOR[g.stateName] || '#aaa';
      if (g.alive) {
        const face = g.yaw + g.anim.headYaw, half = (g.cfg.vision.fovDeg / 2) * Math.PI / 180;
        const range = s.diff.visionRange * b.k;
        // 맵 좌표계: 앞 방향 (-sin, -cos) → 캔버스 각도
        const ang = Math.atan2(-Math.cos(face), -Math.sin(face));
        c.fillStyle = g.aware ? 'rgba(255,59,48,.16)' : 'rgba(255,210,58,.08)';
        c.beginPath(); c.moveTo(gx, gy); c.arc(gx, gy, range, ang - half, ang + half); c.closePath(); c.fill();
        c.fillStyle = col; c.beginPath(); c.arc(gx, gy, 5, 0, Math.PI * 2); c.fill();
      } else {
        c.strokeStyle = col; c.lineWidth = 2;
        c.beginPath(); c.moveTo(gx - 4, gy - 4); c.lineTo(gx + 4, gy + 4); c.moveTo(gx + 4, gy - 4); c.lineTo(gx - 4, gy + 4); c.stroke();
      }
    }
    // 플레이어 (화살표)
    const p = s.player, px = X(p.x), py = Y(p.z), a = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw));
    c.save(); c.translate(px, py); c.rotate(a);
    c.fillStyle = '#6cb6ff'; c.strokeStyle = '#e8f3ff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, 6); c.lineTo(-3, 0); c.lineTo(-6, -6); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}

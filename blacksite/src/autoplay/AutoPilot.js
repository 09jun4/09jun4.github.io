// AI 자동 플레이 봇: 플레이어와 같은 입력(키·시점)만으로 미션을 수행한다.
// 목표 이동(길찾기·문 열기) → 잠입(앉기·후방 접근 → 암살) → 교전(조준·사격·재장전) → 다운로드 → 로그 열람 → 탈출.
import { clamp, dampAngle, damp, wrapAngle, yawTo, DEG } from '../utils/math.js';

const MODE_KO = {
  idle: '대기', move: '목표 이동', sneak: '잠입 접근', takedown: '암살', combat: '교전', reload: '재장전',
  download: '데이터 다운로드', log: '로그 확인', watch: '감시 대기', extract: '탈출', door: '문 여는 중', unstuck: '경로 재탐색',
};

export class AutoPilot {
  constructor(session) {
    this.s = session;
    this.mode = 'idle';
    this.path = null; this.pathGoal = null; this.repathT = 0;
    this.lastPos = { x: 0, z: 0 }; this.stuckT = 0; this.unstuckT = 0; this.unstuckDir = 1;
    this.fireT = 0; this.reactT = 0; this.strafeT = 0; this.strafeDir = 1;
    this.doorT = 0; this.interactT = 0;
    this.watchT = 0; this.watchGuard = null;
    this.target = null; // 교전·암살 대상
    this.logsDone = new Set();
    this.noise = { x: 0, y: 0, t: 0 };
    this.desiredYaw = session.player.yaw; this.desiredPitch = 0;
    this.tour = true; // true: 모든 구역을 돌며 로그 확보, false: 최단 경로
  }

  // 전체 탐색 순서: 다운로드 전에는 진입→보안실→실험실→서버실, 그 뒤에는 통제실
  nextTourLog(obj) {
    const s = this.s;
    const order = obj.def.type === 'download' ? ['entry', 'security', 'lab', 'server'] : ['control'];
    for (const zid of order) {
      const t = s.mission.logs.terminals.find((x) => !this.logsDone.has(x.id) && s.facility.zoneAt(x.pos.x, x.pos.z)?.id === zid);
      if (t) return t;
    }
    return null;
  }

  get modeText() { return MODE_KO[this.mode] || this.mode; }

  // --- 입력 주입 ----------------------------------------------------------------
  _begin() {
    const inp = this.s.game.input;
    inp.down.clear(); inp.pressed.clear();
    this.inp = inp;
  }
  hold(a) { this.inp.down.add(this.s.game.bindings.get(a)); }
  press(a) { const c = this.s.game.bindings.get(a); this.inp.pressed.add(c); this.inp.down.add(c); }

  // --- 유틸 -------------------------------------------------------------------
  eye() { return this.s.player.eye; }
  canSee(g, y = 1.3) {
    const e = this.eye();
    const d = Math.hypot(g.x - e.x, g.z - e.z);
    if (d > 26) return false;
    return this.s.collision.lineOfSight(e.x, e.y, e.z, g.x, y, g.z, 'vision');
  }
  lookAt(x, y, z, rate = 7, dt) {
    const e = this.eye();
    this.desiredYaw = yawTo(x - e.x, z - e.z);
    this.desiredPitch = Math.atan2(y - e.y, Math.max(0.05, Math.hypot(x - e.x, z - e.z)));
    this._rate = rate;
  }
  aimError() {
    const p = this.s.player;
    return Math.hypot(wrapAngle(p.yaw - this.desiredYaw), p.pitch - this.desiredPitch);
  }
  frontOf(item, dist) {
    const r = ((item.prop?.def?.rotDeg) || 0) * DEG;
    return { x: item.pos.x + Math.sin(r) * dist, z: item.pos.z + Math.cos(r) * dist };
  }

  // 길찾기 이동. 도착하면 true
  navTo(x, z, dt, { stop = 0.45, run = false } = {}) {
    const p = this.s.player, nav = this.s.nav;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d <= stop) { this.path = null; return true; }
    this.repathT -= dt;
    if (!this.path || !this.pathGoal || Math.hypot(this.pathGoal.x - x, this.pathGoal.z - z) > 0.6 || this.repathT <= 0) {
      this.path = nav.findPath(p.x, p.z, x, z) || [{ x, z }];
      this.pathGoal = { x, z }; this.pathIdx = 0; this.repathT = 1.5;
    }
    let node = this.path[this.pathIdx];
    while (node && this.pathIdx < this.path.length - 1 && Math.hypot(node.x - p.x, node.z - p.z) < 0.5) node = this.path[++this.pathIdx];
    // 경로 다듬기: 다음 지점까지 막힘없이 갈 수 있으면 지금 지점은 건너뛴다(뒤로 돌아가는 왕복 방지)
    for (let k = 0; k < 3 && this.pathIdx < this.path.length - 1; k++) {
      const nx = this.path[this.pathIdx + 1];
      if (nx.door && !nx.door.open) break;
      if (!nav.clear(p.x, p.z, nx.x, nx.z)) break;
      node = this.path[++this.pathIdx];
    }
    if (!node) return false;
    // 닫힌 문: 문을 보고 F
    if (node.door && !node.door.open) {
      const dd = Math.hypot(node.door.cx - p.x, node.door.cz - p.z);
      if (dd < 2.0) {
        this.mode = 'door';
        this.lookAt(node.door.cx, 1.3, node.door.cz);
        this.doorT -= dt;
        if (this.doorT <= 0 && this.aimError() < 0.25 && this.s.interaction.current?.label === 'OPEN DOOR') { this.press('interact'); this.doorT = 0.8; }
        if (dd > 1.2) this.hold('forward');
        return false;
      }
    }
    if (node.door && node.door.t < 0.9) return false; // 열리는 중
    this.desiredYaw = yawTo(node.x - p.x, node.z - p.z);
    this.desiredPitch = damp(this.desiredPitch, 0, 4, dt);
    this._rate = 6;
    if (Math.abs(wrapAngle(p.yaw - this.desiredYaw)) < 0.9) {
      this.hold('forward');
      if (run) this.hold('sprint');
    }
    this.wantMove = true;
    return false;
  }

  setCrouch(want) {
    if (this.s.player.crouched !== want && this.crouchT <= 0) { this.press('crouch'); this.crouchT = 0.5; }
  }

  // --- 매 프레임 ------------------------------------------------------------------
  update(dt) {
    if (this.enabled === false) return; // 자동 플레이 꺼짐: 직접 조작
    this._begin();
    const s = this.s, p = s.player, w = s.weapon;
    this.wantMove = false;
    if (!s.controlsEnabled || s.ended || s.cinematic || p.health.dead) { this.mode = s.cinematic ? 'takedown' : 'idle'; this.path = null; return; }

    // 주변 경비원 파악
    const alive = s.enemies.filter((g) => g.alive);
    const seen = alive.filter((g) => this.canSee(g));
    const threats = seen.filter((g) => g.aware).sort((a, b) => dist(a, p) - dist(b, p));
    // 방금 놓친 적은 잠깐 더 겨눈다 (모드가 깜빡이지 않게)
    this.memT = (this.memT || 0) - dt;
    if (threats.length) this.memT = 0.8;
    else if (this.target && this.target.alive && this.target.aware && this.memT > 0) threats.push(this.target);
    const nearUnaware = alive.filter((g) => !g.aware && dist(g, p) < 13);

    this.fireT -= dt; this.interactT -= dt; this.crouchT = (this.crouchT || 0) - dt;
    let aiming = false;

    // 1) 암살 가능하면 바로
    if (s.interaction.current?.label === 'TAKEDOWN' && !threats.length) {
      this.press('interact');
      this.mode = 'takedown';
    } else if (threats.length) {
      // 2) 교전
      const g = threats[0];
      if (this.target !== g) { this.target = g; this.reactT = 0.25 + Math.random() * 0.2; }
      this.reactT -= dt;
      this.mode = w.reloading ? 'reload' : 'combat';
      this.setCrouch(false);
      const head = Math.random() < 0.5;
      this.lookAt(g.x, head ? 1.55 : 1.25, g.z, 9);
      aiming = true;
      if (w.ammo === 0 && !w.reloading) this.press('reload');
      else if (this.reactT <= 0 && this.fireT <= 0 && this.aimError() < 0.035 && w.canFire && s.aimT > 0.6) {
        this.press('fire');
        this.fireT = 0.28 + Math.random() * 0.22;
      }
      // 터미널 다운로드 중이 아니면 좌우로 움직이며 싸운다
      const obj = s.mission.current;
      if (!(obj && obj.downloading)) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 0.8 + Math.random() * 1.2; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
        this.hold(this.strafeDir > 0 ? 'right' : 'left');
      }
    } else {
      this.target = null;
      if (w.ammo < 6 && !w.reloading) this.press('reload');
      this.objective(dt, nearUnaware);
    }
    if (aiming) this.hold('aim');

    // 막힘 처리: 움직이려는데 제자리면 점프·옆걸음 후 경로 다시 찾기
    const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    this.lastPos.x = p.x; this.lastPos.z = p.z;
    if (this.wantMove && moved < 0.6 * dt) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.2) { this.stuckT = 0; this.unstuckT = 0.6; this.unstuckDir = Math.random() < 0.5 ? -1 : 1; this.path = null; }
    if (this.unstuckT > 0) {
      this.unstuckT -= dt; this.mode = 'unstuck';
      this.hold(this.unstuckDir > 0 ? 'right' : 'left'); this.hold('back');
      if (this.unstuckT > 0.5) this.press('jump');
    }

    // 시점 회전 (사람처럼 부드럽게 + 약간의 손떨림)
    this.noise.t += dt;
    const nx = Math.sin(this.noise.t * 2.3) * 0.004, ny = Math.sin(this.noise.t * 3.1) * 0.003;
    p.yaw = dampAngle(p.yaw, this.desiredYaw + nx, this._rate || 6, dt);
    p.pitch = damp(p.pitch, clamp(this.desiredPitch + ny, -1.2, 1.2), this._rate || 6, dt);
  }

  // 목표 수행 (교전이 없을 때)
  objective(dt, nearUnaware) {
    const s = this.s, p = s.player, obj = s.mission.current;
    if (!obj) return;

    // 경비원 근처면 앉아서 잠입
    const close = nearUnaware.filter((g) => dist(g, p) < 9);
    this.setCrouch(close.length > 0);

    // 잠입 암살: 등을 보이는 경비원이 가까우면 뒤로 접근
    const prey = nearUnaware
      .filter((g) => this.canSee(g) && behindAngle(g, p) > 105 * DEG && dist(g, p) < 11)
      .sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (prey && !(obj.downloading)) {
      this.mode = 'sneak';
      const fx = -Math.sin(prey.yaw), fz = -Math.cos(prey.yaw);
      this.navTo(prey.x - fx * 0.7, prey.z - fz * 0.7, dt, { stop: 0.25 });
      if (dist(prey, p) < 2.5) this.lookAt(prey.x, 1.3, prey.z, 6);
      return;
    }
    // 정면을 보고 있는 경비원이 시야 앞에 있으면 잠깐 숨어 기다렸다가, 오래 걸리면 선제 사격
    const facing = nearUnaware.find((g) => this.canSee(g) && behindAngle(g, p) < 70 * DEG && dist(g, p) < 11);
    if (facing) {
      if (this.watchGuard !== facing) { this.watchGuard = facing; this.watchT = 0; }
      this.watchT += dt;
      if (this.watchT < 3.5) { this.mode = 'watch'; this.setCrouch(true); this.lookAt(facing.x, 1.3, facing.z, 4); return; }
      this.mode = 'combat';
      this.lookAt(facing.x, 1.55, facing.z, 8);
      this.hold('aim');
      if (this.fireT <= 0 && this.aimError() < 0.03 && s.aimT > 0.6 && s.weapon.canFire) { this.press('fire'); this.fireT = 0.3; }
      return;
    }
    this.watchGuard = null;

    // 데이터 로그: 지나가는 길에 있는 것 + (전체 탐색이면) 구역 순서대로 모두
    const near = s.mission.logs.terminals.find((t) => !this.logsDone.has(t.id) && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 5 &&
      s.collision.lineOfSight(p.eye.x, p.eye.y, p.eye.z, t.pos.x, t.pos.y, t.pos.z, 'vision'));
    const log = near || (this.tour ? this.nextTourLog(obj) : null);
    if (log && !obj.downloading) {
      this.mode = 'log';
      if (this.logId !== log.id) { this.logId = log.id; this.logWait = 0; }
      this.logWait += dt;
      if (this.logWait > 40) { this.logsDone.add(log.id); return; } // 닿지 못하면 포기
      const spot = this.frontOf(log, 1.0); // 단말 앞 (단말 자체는 충돌 박스 안이라 길찾기 목표가 될 수 없다)
      if (this.navTo(spot.x, spot.z, dt, { stop: 0.4 })) {
        this.lookAt(log.pos.x, log.pos.y, log.pos.z, 7);
        if (s.interaction.current?.label?.startsWith('READ LOG')) { this.press('interact'); this.logsDone.add(log.id); }
      }
      return;
    }

    // 목표 지점으로
    const item = obj.term || obj.point;
    const stand = this.frontOf(item, 1.15);
    const isDownload = obj.def.type === 'download';
    this.mode = isDownload ? (obj.downloading ? 'download' : 'move') : 'extract';
    const safe = !s.enemies.some((g) => g.alive && dist(g, p) < 15);
    if (this.navTo(stand.x, stand.z, dt, { stop: 0.5, run: safe && !p.crouched })) {
      this.lookAt(item.pos.x, item.pos.y, item.pos.z, 6);
      const want = isDownload ? 'DOWNLOAD DATA' : 'EXTRACT';
      if (s.interaction.current?.label === want && this.interactT <= 0) { this.press('interact'); this.interactT = 0.8; }
      if (!this.s.interaction.current && this.aimError() < 0.05) this.hold('forward'); // 너무 멀면 반 걸음
    }
  }
}

function dist(g, p) { return Math.hypot(g.x - p.x, g.z - p.z); }
// 경비원 시선 방향과 (경비원→플레이어) 사이 각도: 180°에 가까우면 등 뒤
function behindAngle(g, p) { return Math.abs(wrapAngle(yawTo(p.x - g.x, p.z - g.z) - g.yaw)); }

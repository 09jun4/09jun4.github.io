// 자동플레이 봇. 사람처럼 키·마우스 입력에 해당하는 값만 만든다(입력 덮어쓰기: 피치·선회 축, 조준 커서, 발사 버튼, 무장 전환).
// 게임 규칙이나 적 AI는 건드리지 않는다. 실력(skill 0~100) 하나로 아래 값들이 함께 바뀐다.
//   반응 간격: 결정을 다시 내리는 주기(초보는 한참 뒤에야 반응한다)
//   조준 오차: 커서가 표적 중심에서 벗어나는 픽셀 수
//   선회 정밀도: 표적이 이 각도 안이면 더 돌지 않는다(불감대), 초보는 키 입력처럼 0/±1만, 숙련부터는 연속값
//   사격 거리·과열 관리: 먼저 쏘기 시작하는 거리, 열이 얼마일 때 사격을 멈추는지(초보는 과열까지 쏜다)
//   회피 기동·미사일 활용·실속 회피
import * as THREE from 'three';
import { clamp, lerp, wrapAngle, DEG } from './math.js';
import { PHASE } from './mission-session.js';

export const SKILL_LEVELS = [
  { id: 'beginner', label: '초보', skill: 12 },
  { id: 'intermediate', label: '중급', skill: 40 },
  { id: 'advanced', label: '숙련', skill: 70 },
  { id: 'expert', label: '전문가', skill: 95 },
];

export function levelName(skill) {
  let best = SKILL_LEVELS[0];
  for (const l of SKILL_LEVELS) if (Math.abs(l.skill - skill) < Math.abs(best.skill - skill)) best = l;
  return best.label;
}

/** 실력(0~100) → 봇 행동 값. 아티팩트(자동플레이 패널)에도 같은 식이 들어 있다. */
export function skillParams(skill) {
  const k = clamp(skill / 100, 0, 1);
  return {
    reaction: lerp(0.5, 0.04, k * k * 0.4 + k * 0.6), // 결정 주기(초)
    aimError: lerp(36, 0, Math.pow(k, 0.8)), // 조준 오차(px)
    turnDeadzone: lerp(10, 1.5, k), // 선회 불감대(도)
    pitchDeadzone: lerp(8, 1.5, k),
    analog: k >= 0.5, // 연속 조종(false면 0/±1)
    turnGain: lerp(1.6, 4.2, k),
    maxInput: lerp(0.75, 1, k),
    fireRange: lerp(520, 1050, k), // 이 거리 안에서 사격
    heatCut: k < 0.25 ? 1.01 : lerp(0.97, 0.8, (k - 0.25) / 0.75), // 이 열 이상이면 사격 중지(1.01 = 과열까지 쏜다)
    heatResume: lerp(0.5, 0.3, k),
    weave: k > 0.6 ? ((k - 0.6) / 0.4) * 0.3 : 0, // 회피 기동 세기
    missiles: k >= 0.35, // 미사일 사용
    missileMin: lerp(700, 380, k), // 이 거리보다 멀고 표적이 기수 앞쪽이면 미사일
    stallGuard: k >= 0.3, // 실속 직전에는 기수를 들지 않는다
    minDist: lerp(110, 190, k), // 이보다 가까우면 충돌을 피해 꺾는다
  };
}

const _v = new THREE.Vector3();

export class Autopilot {
  constructor(session) {
    this.s = session;
    this.enabled = false;
    this.skill = 40;
    this.p = skillParams(this.skill);
    this.timer = 0;
    this.time = 0;
    this.cooling = false;
    this.target = null;
    this.jx = 0;
    this.jy = 0;
    this.turn = 0;
    this.pitch = 0;
    this.lastSwitch = -9;
    this.status = { mode: '대기', dist: 0 };
  }

  setSkill(v) {
    this.skill = clamp(Math.round(v), 0, 100);
    this.p = skillParams(this.skill);
  }

  enable(on) {
    this.enabled = on;
    this.timer = 0;
    if (!on) this._release();
  }

  _release() {
    const s = this.s;
    s.inputOverride = null;
    s.triggerOverride = null;
    s.cursorOverride = null;
  }

  _neutral(pitch = 0) {
    const s = this.s;
    s.inputOverride = { pitch, turn: 0 };
    s.triggerOverride = false;
    s.cursorOverride = null;
  }

  /** 고정 스텝마다(세션이 부른다) */
  step(dt) {
    if (!this.enabled) return;
    const s = this.s;
    if (s.mode !== 'mission') { this.status.mode = '대기'; return; }
    this.time += dt;
    if (s.phase === PHASE.TAKEOFF) {
      this.status.mode = '이륙';
      this._neutral(s.takeoff.state === 'rotate' ? 1 : 0); // 기수 들 속도가 되면 바로 W/S를 누른 것처럼
      return;
    }
    if (s.phase !== PHASE.ACTIVE || !s.player.alive) { this.status.mode = '종료'; this._neutral(); return; }
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = this.p.reaction; this._decide(); }
    // 결정 사이에도 선회·피치는 유지한다(초보는 한동안 같은 입력을 누르고 있다)
    s.inputOverride = { pitch: this.pitch, turn: this.turn };
    this._aimAndFire();
  }

  _pickTarget() {
    const s = this.s;
    const f = s.player.flight;
    let best = null, bestScore = Infinity;
    for (const e of s.enemies.list) {
      if (!e.alive) continue;
      _v.subVectors(e.pos, f.pos);
      const d = _v.length();
      const bearing = Math.abs(wrapAngle(Math.atan2(-_v.x, -_v.z) - f.yaw));
      const score = d * (1 + bearing * (this.skill > 60 ? 0.6 : 0.25)); // 숙련자는 기수 앞쪽 적을 먼저 노린다
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** 미사일을 쓸 상황인가: 충분히 멀고 기수 앞쪽이거나, 이미 락온을 잡는 중이면 끝까지 */
  _wantMissile(dist, bearing) {
    const p = this.p;
    const m = this.s.weapons.byId('missile');
    if (!p.missiles || !m || m.ammo <= 0 || dist > 2800) return false;
    if (m.lock.state !== 'search') return true; // 락온 진행 중에는 무장을 바꾸지 않는다
    return dist > p.missileMin && Math.abs(bearing) < 25 * DEG;
  }

  _decide() {
    const s = this.s;
    const p = this.p;
    const f = s.player.flight;
    const e = this._pickTarget();
    this.target = e;
    this.jx = (Math.random() - 0.5) * 2 * p.aimError;
    this.jy = (Math.random() - 0.5) * 2 * p.aimError;
    const missile = s.weapons.byId('missile');
    // 고도가 낮으면 무조건 올라간다
    if (f.pos.y < 1500) { this.pitch = 0.6; this.turn = e ? this.turn : 0; }
    if (!e) { this.turn = 0; if (f.pos.y >= 1500) this.pitch = clamp(-f.pitch * 2, -0.4, 0.4); this.status.mode = '탐색'; return; }
    _v.subVectors(e.pos, f.pos);
    const dist = _v.length();
    const bearing = wrapAngle(Math.atan2(-_v.x, -_v.z) - f.yaw);
    let elev = Math.asin(clamp(_v.y / Math.max(dist, 1), -1, 1));
    const wantMissile = this._wantMissile(dist, bearing);
    // 락온 원은 카메라 중심이다. 3인칭 카메라는 기수보다 (5° + 피치의 8%)만큼 아래를 보므로 그만큼 기수를 표적 위로 든다
    if (wantMissile && s.view !== 'cockpit') elev += 5 * DEG + 0.08 * f.pitch;
    // 선회: 표적 쪽으로. 충돌이 가까우면 비껴 간다
    let turn;
    if (dist < p.minDist && Math.abs(bearing) < 0.6) turn = bearing >= 0 ? 1 : -1; // 정면 충돌 직전: 반대쪽으로 꺾는다
    else if (Math.abs(bearing) < p.turnDeadzone * DEG) turn = 0;
    else turn = p.analog ? clamp(-bearing * p.turnGain, -1, 1) : (bearing < 0 ? 1 : -1);
    turn *= p.maxInput;
    if (p.weave > 0 && dist > 380 && Math.abs(bearing) < 20 * DEG) turn = clamp(turn + Math.sin(this.time * 1.9) * p.weave, -1, 1); // 직진하지 않는다
    // 피치: 표적의 고도각을 따라간다
    // 이륙 직후처럼 낮은 고도에서는 적어도 14°는 올라간다(표적이 더 위에 있으면 그쪽으로)
    const want = f.pos.y < 1500 ? Math.max(0.25, clamp(elev, -0.6, 0.65)) : clamp(elev, -0.6, 0.65);
    const err = want - f.pitch;
    let pitch = Math.abs(err) < p.pitchDeadzone * DEG ? 0 : (p.analog ? clamp(err * 2.6, -1, 1) : (err > 0 ? 1 : -1));
    if (p.stallGuard && f.speed < s.player.cfg.speed.min + 14 && pitch > 0) pitch = 0;
    this.turn = turn;
    this.pitch = pitch * p.maxInput;
    this.status.dist = dist;
  }

  _aimAndFire() {
    const s = this.s;
    const p = this.p;
    const e = this.target && this.target.alive ? this.target : null;
    if (!e) { s.triggerOverride = false; s.cursorOverride = null; return; }
    const f = s.player.flight;
    const dist = e.pos.distanceTo(f.pos);
    const gun = s.weapons.byId('gun');
    const missile = s.weapons.byId('missile');
    // 무장 선택: 멀면 미사일, 가까우면 기관포(미사일이 없거나 열이 높아 기관포가 막혔을 때도 보조로)
    const bearing = wrapAngle(Math.atan2(-(e.pos.x - f.pos.x), -(e.pos.z - f.pos.z)) - f.yaw);
    const wantMissile = this._wantMissile(dist, bearing);
    const cur = s.weapons.current.id;
    if (this.time - this.lastSwitch > 1.4) {
      if (wantMissile && cur !== 'missile') { s.switchWeapon(); this.lastSwitch = this.time; } else if (!wantMissile && cur !== 'gun') { s.switchWeapon(); this.lastSwitch = this.time; }
    }
    if (s.weapons.current.id === 'missile') {
      s.cursorOverride = null;
      // 락온이 끝나면 쏜다. 이미 날아가는 미사일로 충분히 떨어뜨릴 수 있으면(피해 30) 더 쏘지 않는다
      const inFlight = missile.shots.filter((x) => x.active && x.target === e).length;
      s.triggerOverride = !!s.weapons.uiState().ready && e.hp > missile.cfg.damage * inFlight;
      this.status.mode = missile.lock.state === 'locked' ? '미사일 발사' : '락온 중';
      return;
    }
    // 기관포: 표적을 화면에 투영해 커서를 올린다(조준 오차만큼 빗나간다)
    _v.copy(e.group.position).project(s.camera);
    const { w, h } = s.viewport;
    const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
    const onScreen = _v.z < 1 && sx > w * 0.03 && sx < w * 0.97 && sy > h * 0.04 && sy < h * 0.94;
    s.cursorOverride = onScreen ? { x: sx + this.jx, y: sy + this.jy } : null;
    if (gun.overheated || gun.heat >= p.heatCut) this.cooling = true; else if (gun.heat <= p.heatResume) this.cooling = false;
    const fire = onScreen && dist < p.fireRange && !this.cooling;
    s.triggerOverride = fire;
    this.status.mode = fire ? '사격' : this.cooling ? '냉각' : '추적';
  }
}

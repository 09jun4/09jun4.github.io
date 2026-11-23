import * as THREE from '../../vendor/three.module.min.js';
import { Ragdoll, eulerQ, axisQ } from '../physics/Ragdoll.js';
import { createFighterState, StateManager } from './state.js';
import { nextState, tuning, DOWN_STATES } from './StateMachine.js';

const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Quaternion();
const SIGN = { R: 1, L: -1 };

// 선수 = 래그돌(물리) + FighterState(게임 상태) + 행동(이동·공격·가드·위빙)
export class Fighter {
  constructor(world, cfg, index) {
    this.cfg = cfg;
    this.index = index;
    this.body = new Ragdoll(world, cfg.fighter, cfg.physics, index);
    this.s = createFighterState(cfg.fighter.stats);
    this.attack = null;
    this.queued = null;
    this.attackId = 0;
    this.phase = 0;      // 걷기 주기
    this.flinch = 0;     // 피격 휘청임 0~1
    this.weave = 0;      // -1 왼쪽 ~ 1 오른쪽 (부드럽게)
    this.forward = new THREE.Vector3(1, 0, 0);
    this.sensors = { tilt: 0, pelvisY: 1, speed: 0, down: false, attacking: false, guarding: false };
  }

  reset(origin, yaw) {
    this.body.reset(origin, yaw);
    StateManager.resetRound(this.s);
    this.attack = this.queued = null;
    this.weave = 0;
  }

  get down() { return DOWN_STATES.includes(this.s.state); }
  get canAct() { return !this.down && this.s.state !== 'Stagger'; }

  // 공격 요청: 진행 중이면 하나만 예약(원투 같은 연타)
  requestAttack(type, side) {
    if (!this.canAct) return;
    if (this.attack) { this.queued = { type, side }; return; }
    const def = this.cfg.fighter.attacks[type];
    if (!StateManager.spendStamina(this.s, def.stamina)) return;
    const slow = this.s.state === 'Exhausted' ? 1.4 : 1;
    this.attack = { type, side, def, t: 0, id: ++this.attackId, hit: false, slow };
    this.s.action = type;
    this.s.round.thrown++;
  }

  // 지금 맞힐 수 있는 공격인지 (충돌 관리자가 확인)
  activeAttack(side) {
    const a = this.attack;
    if (!a || a.hit || a.side !== side) return null;
    const t = a.t / a.slow;
    return t > a.def.windup * 0.5 && t < a.def.windup + a.def.strike * 1.2 ? a : null;
  }

  // 한 물리 스텝: intent { fwd, side, guard, weave }, 상대 선수
  update(dt, intent, opp, time) {
    const s = this.s, cfg = this.cfg.fighter, st = cfg.stats, rd = this.body;
    s.stateTime += dt;

    // 감지
    const pel = rd.pos('pelvis', _a);
    const oppPel = opp.body.pos('pelvis', _b);
    const tq = rd.part('torso').body.rotation();
    _q.set(tq.x, tq.y, tq.z, tq.w);
    const k = this.sensors;
    k.tilt = Math.acos(Math.min(1, _f.copy(UP).applyQuaternion(_q).y)) / D;
    k.pelvisY = pel.y;
    const v = rd.part('pelvis').body.linvel();
    k.speed = Math.hypot(v.x, v.z);
    k.down = pel.y < 0.5 || rd.pos('head', _r).y < 0.7;
    s.groundContact.body = k.down;
    s.groundContact.feet = rd.pos('footL', _r).y < 0.12 || rd.pos('footR', _r).y < 0.12;

    // 상대 쪽 바라보기
    _f.subVectors(oppPel, pel).setY(0);
    if (_f.lengthSq() > 1e-4) this.forward.copy(_f.normalize());
    const yaw = Math.atan2(-this.forward.z, this.forward.x);
    _r.crossVectors(this.forward, UP); // 오른쪽

    const act = this.canAct;
    const guarding = act && intent.guard && !this.attack;
    if (guarding) StateManager.drainStamina(s, st.guardDrain * dt);
    if (act && intent.weave && !this.weaveHeld) StateManager.drainStamina(s, st.weaveCost);
    this.weaveHeld = !!intent.weave;
    this.weave += ((act ? intent.weave : 0) - this.weave) * Math.min(1, dt * 12);

    // 공격 진행
    let twist = 0;
    const a = this.attack;
    if (a) {
      a.t += dt;
      const t = a.t / a.slow, d = a.def, side = a.side, sg = SIGN[side];
      if (!act) this.attack = null;
      else if (t < d.windup) this._arm(side, d.wind);
      else if (t < d.windup + d.strike) {
        const p = (t - d.windup) / d.strike;
        this._arm(side, d.pose);
        twist = d.twist * sg * Math.sin(Math.min(1, p * 1.5) * Math.PI / 2);
        opp.body.pos('head', _b);
        if (d.path === 'hook') _b.addScaledVector(_r, p < 0.5 ? sg * 0.35 : -sg * 0.05).addScaledVector(this.forward, p < 0.5 ? -0.1 : 0);
        if (d.path === 'upper') _b.addScaledVector(UP, p < 0.4 ? -0.35 : 0.1).addScaledVector(this.forward, p < 0.4 ? -0.15 : 0);
        rd.pull(side, _b, d.pull * (s.state === 'Exhausted' ? 0.7 : 1));
      } else if (t < d.windup + d.strike + d.recover) this._arm(side, 'guard');
      else {
        this.attack = null;
        s.action = null;
        const q = this.queued;
        this.queued = null;
        if (q) this.requestAttack(q.type, q.side);
      }
    }
    for (const side of ['L', 'R']) if (!this.attack || this.attack.side !== side) this._arm(side, guarding ? 'guard' : 'idle');

    // 이동
    const mult = (guarding ? 0.55 : 1) * (this.attack ? 0.6 : 1) * (s.state === 'Exhausted' ? 0.7 : 1) * (s.state === 'OffBalance' ? 0.6 : 1);
    const mv = rd.moveVel.set(0, 0, 0);
    if (act) mv.addScaledVector(this.forward, intent.fwd).addScaledVector(_r, intent.side);
    if (mv.lengthSq() > 1) mv.normalize();
    mv.multiplyScalar(s.moveSpeed * mult);

    // 몸통: 방향 + 비틀기 + 위빙 기울기
    rd.yawQ.setFromAxisAngle(UP, yaw);
    rd.torsoQ.setFromAxisAngle(UP, yaw + twist * D)
      .multiply(_q.setFromAxisAngle(_f.set(1, 0, 0), this.weave * st.weaveAngle * D))
      .multiply(_q.setFromAxisAngle(_f.set(0, 0, 1), -6 * D));
    this._legs(dt, mv, yaw);

    // 상태 전이
    k.attacking = !!this.attack;
    k.guarding = guarding;
    const prev = s.state;
    const next = nextState(s, k, cfg, this.cfg.match);
    if (StateManager.setState(s, next)) {
      if (next === 'Knockdown') s.knockdowns++;
      if (next === 'Recovering') s.recovery = 0;
      if (next === 'Standing' && prev === 'Recovering') s.balance = s.maxBalance * 0.6;
      if (DOWN_STATES.includes(next)) this.attack = this.queued = null;
    }
    if (s.state === 'Recovering') s.recovery = Math.min(1, s.recovery + dt / cfg.recovery.riseTime);
    if (!this.down) StateManager.regen(s, dt, st, !this.attack && !guarding);
    const tn = tuning(s, cfg), fl = cfg.hit.flinch;
    // 맞은 직후 잠깐 힘이 빠져 래그돌이 크게 휘청인다
    this.flinch = Math.max(0, this.flinch - dt / fl.time);
    rd.assist = s.stability = tn.assist * (1 - this.flinch * fl.assist);
    rd.muscle = tn.muscle * (1 - this.flinch * fl.muscle);
  }

  _arm(side, poseName) {
    const p = this.cfg.fighter.poses[poseName];
    this.body.setJoint('shoulder' + side, eulerQ(p.shoulder, side, _q));
    this.body.setJoint('elbow' + side, axisQ(p.elbow, _q));
    this.s.posture = poseName;
  }

  // 걷기: 이동 방향으로 다리를 번갈아 흔든다
  _legs(dt, mv, yaw) {
    const L = this.cfg.fighter.poses.legs, rd = this.body;
    const sp = mv.length() / this.cfg.fighter.stats.moveSpeed;
    // 선수 로컬 기준 앞·옆 성분
    const fw = mv.x * Math.cos(yaw) - mv.z * Math.sin(yaw), sd = mv.x * Math.sin(yaw) + mv.z * Math.cos(yaw);
    this.phase += dt * L.stepRate * 2 * Math.PI * Math.min(1, sp * 1.5);
    for (const side of ['L', 'R']) {
      const ph = this.phase + (side === 'L' ? Math.PI : 0), sw = Math.sin(ph) * Math.min(1, sp * 1.5);
      const n = Math.hypot(fw, sd) || 1;
      const hip = [L.hip[0], L.hip[1], L.hip[2]];
      const m = side === 'L' ? -1 : 1;
      rd.setJoint('hip' + side, eulerQ([hip[0] + m * L.stepHip * 0.7 * sw * (sd / n), hip[1], hip[2] + L.stepHip * sw * (fw / n)], side, _q));
      rd.setJoint('knee' + side, axisQ(L.knee - L.stepKnee * Math.max(0, Math.cos(ph)) * Math.min(1, sp * 1.5), _q));
      rd.setJoint('ankle' + side, eulerQ(L.ankle, side, _q));
    }
  }

  // 맞았을 때 (충돌 관리자에서 호출)
  // 반환: { dmg, blocked, heavy }
  receiveHit(part, relSpeed, attack, dir, time) {
    const s = this.s, h = this.cfg.fighter.hit, partKind = part.kind, none = { dmg: 0, blocked: false, heavy: false };
    if (s.state === 'Knockdown' || s.state === 'KO') return none;
    const over = Math.min(relSpeed, h.maxSpeed) - h.minSpeed;
    if (over <= 0) return none;
    const mult = h.partMultiplier[partKind] ?? 1;
    const blocked = s.state === 'Guarding' && mult < 0.5;
    const soft = blocked || mult < 0.5;
    const dmg = over * h.damagePerSpeed * attack.def.power * mult;
    const bal = over * h.balancePerSpeed * attack.def.power * Math.max(mult, 0.4) * (soft ? h.guardBalanceFactor : 1);
    StateManager.applyHit(s, dmg, bal, time);
    if (bal > h.staggerBalance && s.balance > 0 && s.health > 0) StateManager.setState(s, 'Stagger');
    const power = Math.min(over, 10) / 10 * attack.def.power;
    if (!soft) this.flinch = Math.min(1, this.flinch + power * (partKind === 'head' ? 1.2 : 0.8));
    // 타격감: 맞은 부위와 몸통을 펀치 방향으로 크게 밀어낸다
    const imp = power * h.knockback * (soft ? 0.3 : 1);
    part.body.applyImpulse({ x: dir.x * imp, y: dir.y * imp * 0.3 + imp * 0.1, z: dir.z * imp }, true);
    if (!soft) this.body.part('torso').body.applyImpulse({ x: dir.x * imp * 0.6, y: 0, z: dir.z * imp * 0.6 }, true);
    return { dmg, blocked, heavy: !soft && (partKind === 'head' || power > 0.8) };
  }
}

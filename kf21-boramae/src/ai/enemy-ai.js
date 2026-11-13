// 적 AI. 적기마다 상태를 갖고, 매 스텝 "어느 방향으로, 얼마나 빠르게" 갈지를 정한다(운동은 Enemy.step).
//   approach 멀리서 접근 → orbit 공격 차례를 기다리며 선회 → attack 추격·사격
//   → break 너무 가까워지면 이탈 → (orbit) … / evade 피격 시 방향을 바꿔 회피
// 동시에 공격하는 적기 수는 공격 토큰으로 제한한다(미션의 maxAttackers). 적기끼리는 분리 벡터로 겹치지 않게 한다.
import * as THREE from 'three';
import { THREAT } from '../data/extras.js';
import { PERSONALITIES, CRUISE_ARRIVE } from '../data/enemies.js';
import { DEG, clamp, clamp01, lerp } from '../core/math.js';
import { angleBetween } from '../combat/hit-test.js';

const UP = new THREE.Vector3(0, 1, 0);
const _to = new THREE.Vector3();
const _lead = new THREE.Vector3();
const _want = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _from = new THREE.Vector3();
const _off = new THREE.Vector3();

/**
 * 회피기동 보정(0~1): 플레이어가 기수를 올리내리거나 선회하는 만큼 명중탄 비율이 준다. 대공포도 같은 값을 쓴다.
 * @param {object} ctx 세션 컨텍스트(player, touch) @param {{cut:number, mobile:number}} ev
 */
export function hitFactor(ctx, ev) {
  if (!ev) return 1;
  const p = ctx.player, r = p.cfg.rates;
  const move = Math.min(1, Math.abs(p.flight.yawRate) / (r.yawMax * DEG) + Math.abs(p.flight.pitchRate) / (r.pitchMax * DEG));
  return (1 - ev.cut * move) * (ctx.touch && ctx.touch() ? ev.mobile : 1);
}

export const AI = { APPROACH: 'approach', ORBIT: 'orbit', ATTACK: 'attack', BREAK: 'break', EVADE: 'evade' };

export class EnemyDirector {
  /** @param {import('../entities/enemy.js').Enemy[]} enemies */
  constructor(enemies) {
    this.enemies = enemies;
    this.maxAttackers = 1;
    this.rng = Math.random;
    this.playerAccel = new THREE.Vector3(); // 플레이어 가속도 추정(선회 중인 표적을 맞히기 위한 예측)
    this._prevVel = new THREE.Vector3();
    this._hasPrev = false;
  }

  reset(maxAttackers, rng) {
    this.maxAttackers = maxAttackers;
    this.rng = rng;
    this._hasPrev = false;
    this.playerAccel.set(0, 0, 0);
  }

  get attackers() {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.ai.hasToken) n++;
    return n;
  }

  /** 등장 직후 초기화 */
  onSpawn(e, slot) {
    const a = e.ai;
    const w = e.cfg.weapon;
    a.state = AI.APPROACH;
    a.time = 0;
    a.timer = 0;
    a.hasToken = false;
    a.tokenWait = slot * 0.8;
    a.fireTimer = lerp(w.firstShotDelay[0], w.firstShotDelay[1], this.rng());
    a.burstLeft = 0;
    a.burstTimer = 0;
    a.evadeCooldown = 0;
    a.side = slot % 2 === 0 ? 1 : -1;
    a.orbitSign = a.side;
    a.lift = ((slot % 3) - 1) * 0.35;
  }

  /** 피격: 방향을 바꿔 회피한다(연달아 하지는 않는다). */
  onHit(e) {
    const a = e.ai;
    const c = e.cfg.ai;
    if (!e.alive || a.state === AI.EVADE || a.evadeCooldown > 0 || (e.roleDef && e.roleDef.cruise)) return;
    // 지금 진행 방향에 수직인 쪽으로 꺾는다
    _tangent.crossVectors(e.forward, UP).normalize();
    const side = this.rng() < 0.5 ? -1 : 1;
    const vert = (this.rng() - 0.5) * 1.4;
    a.dir.copy(_tangent).multiplyScalar(side).addScaledVector(UP, vert).addScaledVector(e.forward, 0.35).normalize();
    this._enter(e, AI.EVADE);
    a.timer = lerp(c.evadeTime[0], c.evadeTime[1], this.rng()) * (e.pers ? e.pers.evadeScale : 1);
    a.evadeCooldown = c.evadeCooldown + a.timer;
    a.burstLeft = 0;
  }

  _enter(e, state) {
    e.ai.state = state;
    e.ai.time = 0;
  }

  _release(e) {
    const a = e.ai;
    if (a.hasToken) {
      a.hasToken = false;
      a.tokenWait = e.cfg.ai.tokenCooldown;
    }
  }

  step(dt, ctx) {
    const player = ctx.player;
    const pf = player.flight;
    // 플레이어 가속도 추정(이전 스텝 속도와의 차이)
    if (this._hasPrev) this.playerAccel.copy(player.velocity).sub(this._prevVel).multiplyScalar(1 / dt);
    this._prevVel.copy(player.velocity);
    this._hasPrev = true;

    let attackers = this.attackers;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const a = e.ai;
      const c = e.cfg.ai;
      const f = e.cfg.flight;
      a.time += dt;
      if (a.timer > 0) a.timer -= dt;
      if (a.tokenWait > 0) a.tokenWait -= dt;
      if (a.evadeCooldown > 0) a.evadeCooldown -= dt;
      if (a.fireTimer > 0) a.fireTimer -= dt;

      const P = e.pers || PERSONALITIES.aggressive;
      // 직진 표적(수송기·폭격기): 목표 지점으로만 간다. 도달하면 세션에 알린다
      if (e.roleDef && e.roleDef.cruise) {
        _want.subVectors(e.goal, e.pos);
        const left = Math.hypot(_want.x, _want.z);
        if (left < CRUISE_ARRIVE) { if (ctx.onEscaped) ctx.onEscaped(e); e.despawn(); continue; }
        _want.y = clamp(_want.y, -left * 0.1, left * 0.1);
        e.want.copy(_want.normalize());
        e.wantSpeed = e.roleDef.speed;
        continue;
      }
      // 보스 페이즈(체력 구간): 공격 시간·속도·사격 간격이 달라진다
      let ph = null;
      if (e.roleDef && e.roleDef.phases) {
        const ratio = e.hp / e.maxHp;
        let k = 0;
        for (let i = 0; i < e.roleDef.phases.length; i++) if (ratio <= e.roleDef.phases[i].below) k = i;
        if (k !== e.phase) { e.phase = k; if (e.roleDef.phases[k].evade) { a.evadeCooldown = 0; this.onHit(e); } }
        ph = e.roleDef.phases[k];
      }
      const attackTime = c.attackTimeMax * P.attackTime * (ph ? ph.attackTime : 1);
      // 락온당하면 급선회로 이탈(evasive·ace)
      if ((P.evadeOnLock || (ph && ph.evade)) && ctx.lockedEnemy === e && a.state !== AI.EVADE && a.evadeCooldown <= 0) this.onHit(e);

      _to.subVectors(pf.pos, e.pos);
      const dist = _to.length();
      // 추격용 예측 위치
      const leadT = c.leadTime * clamp(dist / c.keepMax, 0.25, 1.4);
      _lead.copy(pf.pos).addScaledVector(player.velocity, leadT);
      let speed = f.speed * P.speed + (f.speedMax - f.speed) * clamp01((dist - f.catchUpFrom) / (f.catchUpFull - f.catchUpFrom)) + (ph ? ph.speed : 0);

      if (!player.alive) {
        // 플레이어가 격추되면 그냥 지나간다
        _want.copy(e.forward);
        this._release(e);
      } else if (a.state === AI.EVADE) {
        _want.copy(a.dir);
        if (a.timer <= 0) this._enter(e, a.hasToken ? AI.ATTACK : AI.ORBIT);
      } else if (a.state === AI.BREAK) {
        _want.copy(a.dir);
        if (a.time > c.minStateTime && (a.timer <= 0 || dist > c.keepMax + 220)) this._enter(e, AI.ORBIT);
      } else if (a.state === AI.APPROACH) {
        _want.subVectors(_lead, e.pos).normalize();
        if (dist < c.orbitRadius + 180) this._enter(e, AI.ORBIT);
      } else if (a.state === AI.ORBIT) {
        // 플레이어 주위를 일정 거리로 돈다
        _radial.set(e.pos.x - pf.pos.x, 0, e.pos.z - pf.pos.z);
        if (_radial.lengthSq() < 1) _radial.set(1, 0, 0);
        _radial.normalize();
        _tangent.crossVectors(UP, _radial).multiplyScalar(a.orbitSign);
        _want.copy(pf.pos).addScaledVector(_radial, c.orbitRadius);
        _want.y += a.lift * c.orbitRadius * 0.5;
        _want.sub(e.pos).multiplyScalar(1.3 / c.orbitRadius).addScaledVector(_tangent, 0.85).normalize();
        speed = Math.max(speed, pf.speed + 8);
        // 측후방 접근(flanker): 동료가 정면에서 끄는 동안 플레이어 뒤쪽 옆으로 돌아 들어간다
        if (P.flank && attackers > 0) {
          _want.copy(pf.pos).addScaledVector(pf.forward, -c.keepMax).addScaledVector(_tangent.crossVectors(UP, pf.forward), a.side * c.keepMin).sub(e.pos).normalize();
          speed = Math.max(speed, pf.speed + c.attackClosing);
        }
        if (dist > c.returnDistance) this._enter(e, AI.APPROACH);
        else if (a.time > c.minStateTime && a.tokenWait <= 0 && attackers < this.maxAttackers + P.extraAttacker) {
          a.hasToken = true;
          attackers++;
          this._enter(e, AI.ATTACK);
        }
      } else { // ATTACK
        _want.subVectors(_lead, e.pos).normalize();
        // 뒤에서 따라올 때도 거리를 좁힐 수 있게 플레이어보다 조금 빠르게
        if (dist > c.keepMin + 40) speed = Math.max(speed, pf.speed + c.attackClosing);
        this._fire(e, dt, ctx, dist, P.fireRate * (ph ? ph.fireRate : 1));
        if (a.time > c.minStateTime && (dist < c.keepMin || a.time > attackTime)) {
          // 이탈: 플레이어에게서 멀어지되 옆·위아래로 비껴 나간다
          _radial.copy(_to).multiplyScalar(-1 / Math.max(dist, 1));
          _tangent.crossVectors(UP, _radial);
          if (_tangent.lengthSq() < 1e-4) _tangent.set(1, 0, 0);
          _tangent.normalize();
          a.side = -a.side;
          a.orbitSign = a.side;
          a.dir.copy(e.forward).multiplyScalar(0.7).addScaledVector(_tangent, a.side * 0.75).addScaledVector(_radial, 0.35).addScaledVector(UP, (this.rng() - 0.4) * 0.7).normalize();
          a.timer = lerp(c.breakTime[0], c.breakTime[1], this.rng());
          a.burstLeft = 0;
          this._release(e);
          attackers--;
          this._enter(e, AI.BREAK);
        }
      }

      // 분리: 가까운 아군에게서 밀려난다
      _sep.set(0, 0, 0);
      for (const o of this.enemies) {
        if (o === e || !o.alive) continue;
        const dx = e.pos.x - o.pos.x, dy = e.pos.y - o.pos.y, dz = e.pos.z - o.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < c.separationRadius * c.separationRadius) {
          const d = Math.sqrt(d2) || 1;
          const k = (1 - d / c.separationRadius) / d;
          _sep.x += dx * k; _sep.y += dy * k; _sep.z += dz * k;
          if (d2 < 1) _sep.x += (e.index - o.index) * 0.5; // 완전히 겹쳤을 때
        }
      }
      if (_sep.lengthSq() > 0) _want.addScaledVector(_sep, c.separationWeight).normalize();

      e.want.copy(_want);
      e.wantSpeed = speed;
    }
  }

  /** 공격 중 사격: 기수가 조준 방향을 향하고 사거리 안이면 짧은 연발 */
  _fire(e, dt, ctx, dist, rate = 1) {
    const a = e.ai;
    const w = e.cfg.weapon;
    const player = ctx.player;
    _from.copy(e.pos).addScaledVector(e.forward, e.cfg.hitRadius);
    // 탄 비행시간만큼 앞선 위치(선회 중이면 가속도까지 반영). 비행시간은 두 번 반복해 맞춘다.
    let t = dist / w.bulletSpeed;
    for (let i = 0; i < 3; i++) {
      _aim.copy(player.flight.pos).addScaledVector(player.velocity, t).addScaledVector(this.playerAccel, 0.5 * t * t * w.leadAccel);
      t = _aim.distanceTo(_from) / w.bulletSpeed;
    }
    _off.subVectors(_aim, _from).normalize();
    if (a.burstLeft > 0) {
      a.burstTimer -= dt;
      if (a.burstTimer <= 0) {
        a.burstLeft--;
        a.burstTimer = w.burstGap;
        // 산포: 일부는 플레이어 근처로, 나머지는 넓게 빗나간다
        const spread = this.rng() < w.accuracy * hitFactor(ctx, w.evasion) ? w.nearSpread * this.rng() : lerp(w.wideSpread[0], w.wideSpread[1], this.rng());
        const u = this.rng() * 2 - 1;
        const ang = this.rng() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        _aim.x += Math.cos(ang) * r * spread; _aim.y += u * spread; _aim.z += Math.sin(ang) * r * spread;
        _off.subVectors(_aim, _from).normalize();
        ctx.projectiles.spawn(_from, _off, w.bulletSpeed, w.bulletLife, w.damage);
      }
      return;
    }
    if (a.fireTimer > 0 || dist > w.range) return;
    if (angleBetween(e.forward.x, e.forward.y, e.forward.z, _off.x, _off.y, _off.z) > w.cone * DEG) return;
    a.burstLeft = w.burst;
    a.burstTimer = 0;
    e.fireWarn = THREAT.fireHold;
    a.fireTimer = w.interval * rate;
  }
}

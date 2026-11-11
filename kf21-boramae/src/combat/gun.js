// 기관포: 마우스 조준(카메라→커서 레이), 좌클릭 유지 연사, 즉시 판정, 탄약 무제한 + 과열.
import { registerWeapon } from './weapon-system.js';
import { aimHit } from './hit-test.js';
import { damageEnemy } from './damage.js';
import { DEG } from '../core/math.js';
import * as THREE from 'three';

const _muzzle = new THREE.Vector3();
const _end = new THREE.Vector3();
const _vel = new THREE.Vector3();

export function createGun(cfg) {
  const interval = 1 / cfg.fireRate;
  const assistTan = Math.tan(cfg.assistAngle * DEG);
  return {
    id: cfg.id,
    cfg,
    heat: 0,
    overheated: false,
    lock: 0,
    cooldown: 0,
    sinceShot: 99,
    target: null, // 지금 조준선에 걸린 적(HUD 표시용)
    targetDist: 0,
    _ui: { id: cfg.id, name: cfg.name, short: cfg.short, kind: 'heat', heat: 0, overheated: false, lock: 0, lockMax: cfg.overheatLock, onTarget: false },

    reset() {
      this.heat = 0;
      this.overheated = false;
      this.lock = 0;
      this.cooldown = 0;
      this.sinceShot = 99;
      this.target = null;
    },

    /** 조준 레이에 걸린 가장 가까운 적을 찾는다(사거리는 기체 기준). */
    pick(ctx) {
      const a = ctx.aim;
      const from = ctx.player.flight.pos;
      let best = null;
      let bestT = Infinity;
      const range2 = cfg.range * cfg.range;
      for (const e of ctx.enemies) {
        if (!e.alive) continue;
        if (e.pos.distanceToSquared(from) > range2) continue;
        const t = aimHit(a.origin.x, a.origin.y, a.origin.z, a.dir.x, a.dir.y, a.dir.z, e.pos.x, e.pos.y, e.pos.z, Math.max(cfg.hitRadius, e.cfg.hitRadius), assistTan, cfg.range * 1.2);
        if (t >= 0 && t < bestT) { bestT = t; best = e; }
      }
      this.target = best;
      this.targetDist = best ? bestT : 0;
      return best;
    },

    update(dt, ctx, active, trigger) {
      this.sinceShot += dt;
      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.overheated) {
        this.lock -= dt;
        if (this.lock <= 0) { this.overheated = false; this.lock = 0; }
      }
      if (active) this.pick(ctx); else this.target = null;
      if (active && trigger && !this.overheated && this.cooldown <= 1e-6) this.fire(ctx);
      // 쏘지 않는 동안에만 식는다
      if (this.sinceShot > cfg.coolDelay && this.heat > 0) this.heat = Math.max(0, this.heat - cfg.coolRate * dt);
    },

    fire(ctx) {
      this.cooldown = interval;
      this.sinceShot = 0;
      this.heat += cfg.heatPerShot;
      if (this.heat >= 1) {
        this.heat = 1;
        this.overheated = true;
        this.lock = cfg.overheatLock;
        ctx.audio.play('gun_overheat');
      }
      ctx.stats.gunShots++;
      ctx.markWeaponUsed(cfg.id);
      ctx.muzzleWorld(_muzzle);
      const a = ctx.aim;
      const target = this.target;
      if (target) {
        // 명중: 예광탄은 적기까지, 불꽃은 적기 표면 근처
        _end.copy(target.pos);
        ctx.stats.gunHits++;
        _vel.copy(target.velocity);
        ctx.fx.spark(_end, _vel);
        damageEnemy(ctx, target, cfg.damage, cfg.id);
      } else {
        _end.copy(a.origin).addScaledVector(a.dir, cfg.range);
        _end.x += (ctx.random() - 0.5) * cfg.spread * cfg.range;
        _end.y += (ctx.random() - 0.5) * cfg.spread * cfg.range;
      }
      if (ctx.onGunFired) ctx.onGunFired(_muzzle); // 탄피·화약 연기
      ctx.fx.tracer(_muzzle, _end);
      ctx.fx.muzzleFlash();
      ctx.rig.addShake(cfg.shake);
      ctx.audio.play('gun');
    },

    uiState() {
      const u = this._ui;
      u.heat = this.heat;
      u.overheated = this.overheated;
      u.lock = this.lock;
      u.onTarget = !!this.target;
      return u;
    },
  };
}

registerWeapon('gun', createGun);

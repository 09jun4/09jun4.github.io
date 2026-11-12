// 미사일: 락온 후 좌클릭으로 발사하는 추적형 발사체. 실제로 날아가며 선회 한계·수명이 있고 연기 꼬리를 남긴다.
// 미션당 탄약 제한(보충 없음). 락온은 미사일 모드에서만 동작한다.
import * as THREE from 'three';
import { registerWeapon } from './weapon-system.js';
import { LockOn, LOCK } from './lock-on.js';
import { segmentSphere } from './hit-test.js';
import { damageEnemy } from './damage.js';
import { GeoBuilder } from '../entities/geo-builder.js';
import { PALETTE } from '../data/palette.js';
import { FX } from '../data/fx.js';
import { DEG } from '../core/math.js';

const _camFwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _zNeg = new THREE.Vector3(0, 0, -1);
const _tail = new THREE.Vector3();

function buildMissileGeometry(visual) {
  const b = new GeoBuilder();
  const L = visual.length, r = visual.radius;
  const ring = (z, rad) => { const p = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.push([Math.cos(a) * rad, Math.sin(a) * rad, z]); } return p; };
  b.color(PALETTE.fx.missileBody);
  b.loft([ring(-L / 2, 0.01), ring(-L / 2 + L * 0.16, r), ring(L / 2, r)], { capEnd: true, capEndColor: PALETTE.kf21.nozzle });
  b.color(PALETTE.kf21.dark);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Matrix4().makeRotationZ((i * Math.PI) / 2 + Math.PI / 4);
    b.withMatrix(m, () => b.prism([[r * 0.8, L * 0.2], [r * 3.2, L * 0.44], [r * 3.2, L * 0.5], [r * 0.8, L * 0.5]], -0.02, 0.02));
  }
  return b.build();
}

class MissileShot {
  constructor(mesh, glow) {
    this.mesh = mesh;
    this.glow = glow;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.life = 0;
    this.target = null;
    this.smoke = 0;
  }
}

export function createMissile(cfg) {
  const lock = new LockOn(cfg.lock.radius * DEG, cfg.lock.time);
  const maxTurn = cfg.turnRate * DEG;
  const shots = [];
  let camera = null;

  const weapon = {
    id: cfg.id,
    cfg,
    ammo: cfg.ammo,
    cooldown: 0,
    lock,
    shots,
    prevTrigger: false,
    _ui: { id: cfg.id, name: cfg.name, short: cfg.short, kind: 'ammo', ammo: cfg.ammo, ammoMax: cfg.ammo, lockState: LOCK.SEARCH, lockProgress: 0, target: null, lockRadius: cfg.lock.radius, ready: false },

    /** 발사체 메시를 한 번만 만든다. */
    init(ctx) {
      camera = ctx.camera;
      const geo = buildMissileGeometry(cfg.visual);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const glowGeo = new THREE.OctahedronGeometry(cfg.visual.radius * 2.6, 0);
      const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.kf21.engineGlow, fog: false });
      for (let i = 0; i < cfg.pool; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.z = cfg.visual.length / 2 + cfg.visual.radius * 1.6;
        glow.scale.z = 2.2;
        mesh.add(glow);
        mesh.visible = false;
        ctx.scene.add(mesh);
        shots.push(new MissileShot(mesh, glow));
      }
    },

    reset() {
      this.ammo = this.ammoMax ?? cfg.ammo; // 미션 시작 시 가득
      this.cooldown = 0;
      this.prevTrigger = false;
      lock.reset();
      for (const s of shots) { s.active = false; s.mesh.visible = false; s.target = null; }
    },

    /** 조준 방향에서 적기까지의 각거리(rad). 사거리 밖이면 Infinity */
    _angleOf(e, ctx) {
      if (e.pos.distanceToSquared(ctx.player.flight.pos) > cfg.lock.range * cfg.lock.range) return Infinity;
      _to.subVectors(e.pos, camera.position).normalize();
      const d = _to.dot(_camFwd);
      return Math.acos(d > 1 ? 1 : d < -1 ? -1 : d);
    },

    update(dt, ctx, active, trigger) {
      if (this.cooldown > 0) this.cooldown -= dt;
      _camFwd.copy(ctx.aim.dir); // 락온 원은 가상 조준점(마우스·터치 위치)을 따라간다
      const event = lock.update(dt, active && ctx.player.alive, ctx.enemies, (e) => this._angleOf(e, ctx));
      if (event === 'acquired') ctx.audio.play('lock_tracking');
      else if (event === 'locked') ctx.audio.play('lock_on');
      // 누르는 순간에만 발사(누르고 있어도 연달아 나가지 않는다)
      if (active && trigger && !this.prevTrigger && lock.state === LOCK.LOCKED && this.ammo > 0 && this.cooldown <= 0) this.fire(ctx);
      this.prevTrigger = active && trigger;
      this._stepShots(dt, ctx);
    },

    fire(ctx) {
      const s = shots.find((x) => !x.active);
      if (!s) return;
      const f = ctx.player.flight;
      const shot = cfg.ammo - this.ammo; // 몇 번째 발인지(0부터): 그 자리의 파일런에서 떨어져 나간다
      this.ammo--;
      this.cooldown = cfg.cooldown;
      ctx.stats.missilesFired++;
      ctx.markWeaponUsed(cfg.id);
      s.active = true;
      s.target = lock.target;
      s.dir.copy(f.forward);
      if (!ctx.missileMount || !ctx.missileMount(shot, s.pos)) s.pos.set(0, -cfg.dropOffset, 0).applyQuaternion(f.quat).add(f.pos);
      if (ctx.onMissileFired) ctx.onMissileFired(s.pos); // 점화 섬광
      s.prev.copy(s.pos);
      s.speed = Math.max(cfg.launchSpeed, f.speed);
      s.life = cfg.life;
      s.smoke = 0;
      s.mesh.visible = true;
      ctx.audio.play('missile_launch');
    },

    _stepShots(dt, ctx) {
      for (const s of shots) {
        if (!s.active) continue;
        s.prev.copy(s.pos);
        s.speed = Math.min(cfg.speed, s.speed + cfg.accel * dt);
        const t = s.target;
        if (t && t.alive) {
          // 목표 방향으로 초당 최대 선회각만큼만 돈다
          _to.subVectors(t.pos, s.pos).normalize();
          const dot = s.dir.dot(_to);
          const angle = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
          if (angle > 1e-4) {
            _axis.crossVectors(s.dir, _to);
            if (_axis.lengthSq() < 1e-10) _axis.set(0, 1, 0);
            _axis.normalize();
            s.dir.applyAxisAngle(_axis, Math.min(angle, maxTurn * dt)).normalize();
          }
        } else {
          s.target = null; // 대상이 사라지면 직진
        }
        s.vel.copy(s.dir).multiplyScalar(s.speed);
        s.pos.addScaledVector(s.vel, dt);
        s.life -= dt;
        // 연기 꼬리
        s.smoke -= dt;
        if (s.smoke <= 0) {
          s.smoke = cfg.smokeEvery;
          _tail.copy(s.pos).addScaledVector(s.dir, -cfg.visual.length * 0.6);
          ctx.fx.smoke(_tail, FX.missileSmoke, PALETTE.fx.missileSmoke);
        }
        if (s.target && segmentSphere(s.prev.x, s.prev.y, s.prev.z, s.pos.x, s.pos.y, s.pos.z, s.target.pos.x, s.target.pos.y, s.target.pos.z, cfg.proximity)) {
          const target = s.target;
          this._end(s, ctx, target.pos, target.velocity);
          damageEnemy(ctx, target, cfg.damage, cfg.id);
          continue;
        }
        if (s.life <= 0) this._end(s, ctx, s.pos, s.vel);
      }
    },

    _end(s, ctx, pos, vel) {
      ctx.fx.missileBlast(pos, vel);
      s.active = false;
      s.target = null;
      s.mesh.visible = false;
    },

    render(alpha) {
      for (const s of shots) {
        if (!s.active) continue;
        s.mesh.position.lerpVectors(s.prev, s.pos, alpha);
        s.mesh.quaternion.copy(_q.setFromUnitVectors(_zNeg, s.dir));
      }
    },

    shift(dx, dz) {
      for (const s of shots) {
        if (!s.active) continue;
        s.pos.x += dx; s.pos.z += dz;
        s.prev.x += dx; s.prev.z += dz;
      }
    },

    get activeShots() {
      let n = 0;
      for (const s of shots) if (s.active) n++;
      return n;
    },

    /** 미션별 탄 수 */
    setAmmo(n) { this.ammoMax = n; this.ammo = n; },

    uiState() {
      const u = this._ui;
      u.ammo = this.ammo;
      u.ammoMax = this.ammoMax ?? cfg.ammo;
      u.lockState = lock.state;
      u.lockedFor = lock.lockedFor;
      u.lockProgress = lock.progress;
      u.target = lock.target;
      u.ready = lock.state === LOCK.LOCKED && this.ammo > 0 && this.cooldown <= 0;
      return u;
    },
  };
  return weapon;
}

registerWeapon('missile', createMissile);

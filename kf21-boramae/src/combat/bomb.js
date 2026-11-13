// 폭탄: 무유도 탄도 낙하. 폭탄 모드에서는 지면의 낙하 예측 지점(CCIP)에 마커가 보인다.
// 발사 버튼을 누르면 무장창이 열리고(doorTime) 그 뒤에 떨어진다. 땅에 닿으면 범위 피해.
import * as THREE from 'three';
import { registerWeapon } from './weapon-system.js';
import { getGroundHeight } from '../world/ground.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, -1);
const ZERO = new THREE.Vector3();

/** 탄도 계산(순수): 위치 p·속도 v에서 떨어뜨렸을 때 지면(높이 ground)에 닿는 시간과 지점. out = [x, z, t] */
export function bombImpact(px, py, pz, vx, vy, vz, gravity, ground, out) {
  const h = Math.max(0, py - ground);
  const t = (vy + Math.sqrt(vy * vy + 2 * gravity * h)) / gravity;
  out[0] = px + vx * t; out[1] = pz + vz * t; out[2] = t;
  return out;
}

export function createBomb(cfg) {
  const out = [0, 0, 0];
  return {
    id: cfg.id,
    cfg,
    ammo: 0,
    ammoMax: 0,
    available: false, // 이 미션에 폭탄이 있는가(없으면 무장 순환에서 건너뛴다)
    cooldown: 0,
    door: -1, // 무장창이 열리는 중이면 남은 시간
    prevTrigger: false,
    unlimited: false,
    ccip: { valid: false, pos: new THREE.Vector3(), time: 0, onTarget: false }, // onTarget: 지금 떨어뜨리면 목표에 맞는다
    held: 0, // 발사 버튼을 누르고 있는 시간
    bombs: Array.from({ length: cfg.pool }, () => ({ active: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3() })),
    mesh: null,
    marker: null,
    _ui: { id: cfg.id, name: cfg.name, short: cfg.short, kind: 'bomb', ammo: 0, ammoMax: 0, ready: false, door: false, lockState: 'search' },

    init(ctx) {
      const geo = new THREE.CapsuleGeometry(cfg.visual.radius, cfg.visual.length, 3, 8);
      geo.rotateX(Math.PI / 2);
      this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x3d4238 }), cfg.pool);
      this.mesh.count = 0; this.mesh.frustumCulled = false;
      ctx.scene.add(this.mesh);
      // 낙하 예측 지점: 땅에 눕힌 고리 + 십자(1인칭·3인칭 모두 보인다)
      const ring = new THREE.RingGeometry(0.86, 1, 28);
      ring.rotateX(-Math.PI / 2);
      this.marker = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false, fog: false, side: THREE.DoubleSide }));
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.5).rotateX(-Math.PI / 2), this.marker.material);
      const cross2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.16).rotateX(-Math.PI / 2), this.marker.material);
      this.marker.add(cross, cross2);
      this.marker.renderOrder = 6; this.marker.visible = false; this.marker.frustumCulled = false;
      ctx.scene.add(this.marker);
    },

    reset() {
      this.ammo = this.ammoMax;
      this.cooldown = 0; this.door = -1; this.prevTrigger = false;
      for (const b of this.bombs) b.active = false;
      if (this.mesh) this.mesh.count = 0;
      if (this.marker) this.marker.visible = false;
    },

    /** 미션별 탄 수 */
    setAmmo(n) {
      this.unlimited = n > 0 && !!cfg.unlimited;
      this.ammoMax = n; this.ammo = n; this.available = n > 0;
    },

    update(dt, ctx, active, trigger) {
      if (this.cooldown > 0) this.cooldown -= dt;
      const f = ctx.player.flight, vel = ctx.player.velocity;
      // CCIP: 지금 떨어뜨리면 닿을 자리(무장창이 열리는 시간만큼 앞서 계산)
      const c = this.ccip;
      c.valid = active && this.ammo > 0 && ctx.player.alive;
      if (c.valid) {
        const lead = cfg.doorTime;
        const px = f.pos.x + vel.x * lead, py = f.pos.y + vel.y * lead - cfg.dropOffset, pz = f.pos.z + vel.z * lead;
        let ground = getGroundHeight(px + ctx.origin.x, pz + ctx.origin.z);
        bombImpact(px, py, pz, vel.x, vel.y, vel.z, cfg.gravity, ground, out);
        ground = getGroundHeight(out[0] + ctx.origin.x, out[1] + ctx.origin.z);
        c.pos.set(out[0], ground + 0.6, out[1]);
        c.time = out[2];
        // 예측 지점 근처에 살아 있는 목표가 있는가(가장자리 기준)
        c.onTarget = false;
        if (ctx.ground) {
          const g = ctx.ground;
          for (let i = 0; i < g.count; i++) {
            const t = g.targets[i];
            if (t.alive && Math.hypot(t.base.x - c.pos.x, t.base.z - c.pos.z) - t.def.radius < cfg.aimRadius) { c.onTarget = true; break; }
          }
        }
      } else c.onTarget = false;
      // 누르는 순간 바로 투하. 계속 누르고 있으면 예측 지점이 목표에 들어올 때마다 자동으로 투하한다
      this.held = active && trigger ? this.held + dt : 0;
      const auto = this.held > 0.25 && c.onTarget;
      if (active && trigger && (!this.prevTrigger || auto) && this.ammo > 0 && this.cooldown <= 0 && this.door < 0) this.door = cfg.doorTime; // 무장창 개방 시작
      this.prevTrigger = trigger;
      if (this.door >= 0) {
        this.door -= dt;
        if (this.door <= 0) { this.door = -1; this.fire(ctx); }
      }
      for (const b of this.bombs) {
        if (!b.active) continue;
        b.prev.copy(b.pos);
        b.vel.y -= cfg.gravity * dt;
        b.pos.addScaledVector(b.vel, dt);
        const ground = getGroundHeight(b.pos.x + ctx.origin.x, b.pos.z + ctx.origin.z);
        if (b.pos.y <= ground) {
          b.active = false;
          b.pos.y = ground + 1;
          ctx.fx.explosion(b.pos, ZERO, cfg.blastScale);
          ctx.rig.addShake(ctx.shake.explosion * Math.max(0.15, 1 - b.pos.distanceTo(f.pos) / 1500));
          ctx.audio.play('bomb_explosion', { distance: b.pos.distanceTo(f.pos) });
          if (ctx.ground) ctx.ground.blast(b.pos, cfg, ctx);
        }
      }
    },

    fire(ctx) {
      const b = this.bombs.find((x) => !x.active);
      if (!b || this.ammo <= 0) return;
      if (!this.unlimited) this.ammo--;
      this.cooldown = cfg.cooldown;
      ctx.markWeaponUsed(cfg.id);
      ctx.stats.bombsDropped = (ctx.stats.bombsDropped || 0) + 1;
      const f = ctx.player.flight;
      b.active = true;
      b.pos.copy(f.pos); b.pos.y -= cfg.dropOffset;
      b.prev.copy(b.pos);
      b.vel.copy(ctx.player.velocity);
      ctx.audio.play('bomb_drop', { fall: this.ccip.valid ? this.ccip.time : 3 }); // 낙하 휘파람이 착탄에 맞춰 끝난다
    },

    render(alpha) {
      let n = 0;
      for (const b of this.bombs) {
        if (!b.active) continue;
        _v.lerpVectors(b.prev, b.pos, alpha);
        _q.setFromUnitVectors(FWD, _s.copy(b.vel).normalize());
        this.mesh.setMatrixAt(n++, _m.compose(_v, _q, _s.set(1, 1, 1)));
      }
      this.mesh.count = n;
      if (n) this.mesh.instanceMatrix.needsUpdate = true;
    },

    /** 렌더 프레임: 마커 크기를 거리에 맞춘다(멀어도 보이게) */
    updateMarker(camera, show = true) {
      const c = this.ccip;
      this.marker.visible = c.valid && show; // 이륙 시네마틱·킬캠·결과 화면에서는 그리지 않는다
      if (!this.marker.visible) return;
      this.marker.position.copy(c.pos);
      this.marker.material.color.setHex(c.onTarget ? 0x4dff9a : 0xffb347); // 목표에 들어오면 초록
      const k = Math.max(cfg.markerSize, camera.position.distanceTo(c.pos) * 0.03); // 멀어도 보이게 거리에 맞춰 키운다
      this.marker.scale.set(k, 1, k);
    },

    shift(dx, dz) {
      for (const b of this.bombs) { b.pos.x += dx; b.pos.z += dz; b.prev.x += dx; b.prev.z += dz; }
      this.ccip.pos.x += dx; this.ccip.pos.z += dz;
    },

    uiState() {
      const u = this._ui;
      u.ammo = this.ammo; u.ammoMax = this.ammoMax; u.unlimited = this.unlimited; u.onTarget = this.ccip.onTarget;
      u.door = this.door >= 0;
      u.ready = this.ammo > 0 && this.cooldown <= 0 && this.door < 0;
      return u;
    },
  };
}

registerWeapon('bomb', createBomb);

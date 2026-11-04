// 적(경비원) 개체: 모델 + 관절 애니메이터 + 상태 머신(Patrol/Suspicious/Alert/Combat/Search/Down).
// 각 적은 독립적으로 인식하며 경보를 다른 적에게 전파하지 않는다.
// 다른 적 종류는 같은 인터페이스(update, rayTest, onHit, canTakedown, takedown)로 만들면 된다.
import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { clamp, dampAngle, wrapAngle, yawTo, DEG } from '../utils/math.js';
import { rayVerticalCapsule, raySphere } from '../physics/Raycast.js';
import { createGuardModel } from '../characters/GuardModel.js';
import { JointAnimator } from '../animations/joint/JointAnimator.js';
import { AlertIcon } from './AlertIcon.js';
import { STATES } from './states/index.js';
import { look } from './Vision.js';

export class Guard {
  constructor(def, cfg, session) {
    this.def = def;
    this.id = def.id;
    this.cfg = cfg;
    this.session = session;
    this.nav = session.nav;
    this.health = cfg.health;
    this.alive = true;
    this.pos = new THREE.Vector3();
    if (def.mode === 'stationary') this.pos.set(def.pos[0], 0, def.pos[2]);
    else this.pos.set(def.waypoints[0].pos[0], 0, def.waypoints[0].pos[2]);
    this.yaw = def.mode === 'stationary' ? ((def.lookDegs || [0])[0]) * DEG : 0;
    if (def.mode !== 'stationary' && def.waypoints[1]) {
      this.yaw = yawTo(def.waypoints[1].pos[0] - this.pos.x, def.waypoints[1].pos[2] - this.pos.z);
    }
    this.wpIndex = 0;
    this.speed = 0;
    this.path = null;
    this.pathIdx = 0;
    this.pathTarget = null;
    this.repathT = 0;
    this.stuckT = 0;
    this.lastKnown = { x: this.pos.x, z: this.pos.z };
    this.visionT = Math.random() * 0.1;
    this.visionCache = 'none';
    this.pendingDetect = false;
    this.p = {};

    this.group = new THREE.Group();
    this.model = createGuardModel(cfg.appearance);
    this.group.add(this.model.root);
    this.anim = new JointAnimator(this.model);
    this.icon = new AlertIcon(this.group);
    this.buildFlashlight(cfg.flashlight || {});
    session.scene.add(this.group);
    this._v = new THREE.Vector3();

    this.stateName = '';
    this.state = null;
    this.setState('patrol');
    this.syncTransform();
  }

  get eyeY() { return this.cfg.eyeHeight; }
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
  get aware() { return this.stateName === 'alert' || this.stateName === 'combat'; }

  emit(type, extra = {}) { bus.emit(type, { guard: this, x: this.pos.x, z: this.pos.z, ...extra }); }

  setState(name, data) {
    if (!this.alive && name !== 'down') return;
    this.state?.exit?.(this);
    this.stateName = name;
    this.state = STATES[name];
    this.state.enter(this, data || {});
    bus.emit('guard:state', { guard: this, state: name });
  }

  // 시야 확인 (checkInterval마다 갱신). 시네마틱 중에는 발견을 보류했다가 끝난 뒤 반영한다.
  see(force = false) {
    if (this.visionT > 0 && !force) return this.visionCache;
    this.visionT = this.cfg.vision.checkInterval;
    const pl = this.session.player;
    if (pl.health.dead) { this.visionCache = 'none'; return 'none'; }
    const r = look(this, pl, this.session);
    if (this.session.cinematic) {
      if (r.level === 'core') this.pendingDetect = true;
      this.visionCache = 'none';
      return 'none';
    }
    this.visionCache = r.level;
    return r.level;
  }

  knowPlayer() {
    const pl = this.session.player;
    this.lastKnown.x = pl.x; this.lastKnown.z = pl.z;
  }

  faceYaw(target, dt, mul = 1) { this.yaw = dampAngle(this.yaw, target, this.cfg.turnSpeed * mul, dt); }
  faceTo(x, z, dt, mul = 1) { this.faceYaw(yawTo(x - this.pos.x, z - this.pos.z), dt, mul); }

  clearPath() { this.path = null; this.pathTarget = null; }
  stopMoving() { this.speed = 0; this.wantSpeed = 0; }

  // 목표 지점으로 이동 (길찾기·문 열기 포함). 도착하면 true.
  goTo(x, z, speed, dt, stop = 0.3, keepFacing = false) {
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d <= stop) { this.stopMoving(); this.clearPath(); return true; }
    this.repathT -= dt;
    if (!this.path || !this.pathTarget || Math.hypot(this.pathTarget.x - x, this.pathTarget.z - z) > 1.0 || this.repathT <= 0) {
      this.path = this.nav.findPath(this.pos.x, this.pos.z, x, z);
      this.pathIdx = 0;
      this.pathTarget = { x, z };
      this.repathT = 1.2;
    }
    let tx = x, tz = z;
    if (this.path) {
      let node = this.path[this.pathIdx];
      while (node && this.pathIdx < this.path.length - 1 && Math.hypot(node.x - this.pos.x, node.z - this.pos.z) < 0.4) {
        this.pathIdx++; node = this.path[this.pathIdx];
      }
      if (node) {
        tx = node.x; tz = node.z;
        // 닫힌 문: 문 앞에서 열고 기다린다
        if (node.door && (!node.door.open || node.door.t < 0.85)) {
          const dd = Math.hypot(node.door.cx - this.pos.x, node.door.cz - this.pos.z);
          if (dd < 1.5) {
            if (!node.door.open) { node.door.setOpen(true, []); bus.emit('door:toggled', { door: node.door, by: this }); }
            this.stopMoving();
            this.faceTo(node.door.cx, node.door.cz, dt);
            return false;
          }
        }
      }
    }
    this.moveToward(tx, tz, speed, dt, keepFacing);
    return false;
  }

  moveToward(x, z, speed, dt, keepFacing) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return;
    if (!keepFacing) this.faceYaw(yawTo(dx, dz), dt, 1.2);
    // 진행 방향과 몸 방향 차이가 크면 감속
    const diff = Math.abs(wrapAngle(yawTo(dx, dz) - this.yaw));
    const sp = speed * (keepFacing ? 0.8 : clamp(1.2 - diff / 1.6, 0.15, 1));
    const step = Math.min(L, sp * dt);
    const ox = this.pos.x, oz = this.pos.z;
    this.session.collision.moveCircle(this.pos, (dx / L) * step, (dz / L) * step, this.cfg.radius, 0.3, 1.8);
    // 플레이어와 겹치지 않게
    const pl = this.session.player;
    const px = this.pos.x - pl.x, pz = this.pos.z - pl.z, pd = Math.hypot(px, pz), min = this.cfg.radius + pl.radius;
    if (pd < min && pd > 1e-4) { this.pos.x = pl.x + (px / pd) * min; this.pos.z = pl.z + (pz / pd) * min; }
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.wantSpeed = moved / Math.max(dt, 1e-4);
    // 막힘 감지 → 경로 다시 계산
    if (moved < sp * dt * 0.25) { this.stuckT += dt; if (this.stuckT > 0.8) { this.stuckT = 0; this.repathT = 0; if (this.path && this.pathIdx < this.path.length - 1) this.pathIdx++; } } else this.stuckT = 0;
  }

  shoot() {
    const s = this.session, pl = s.player, c = this.cfg.combat, diff = s.diff;
    const dist = Math.hypot(pl.x - this.pos.x, pl.z - this.pos.z);
    const distF = clamp(1.15 - dist / 26, 0.45, 1);
    let chance = diff.accuracy * distF;
    if (pl.crouched) chance *= 0.9;
    if (pl.sprinting) chance *= 0.7; else if (pl.moving) chance *= 0.85;
    if (Math.abs(pl.lean) > 0.5) chance *= 0.8;
    const hit = Math.random() < chance;
    const from = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    const target = new THREE.Vector3(pl.x, pl.pos.y + pl.height * 0.62, pl.z);
    this.anim.fire();
    if (hit) {
      pl.health.damage(c.damage * diff.damageMul, { from: { x: this.pos.x, z: this.pos.z }, guard: this });
      s.effects.tracer(from, target, 90, 1.4);
    } else {
      // 빗나감: 플레이어 주변을 지나 벽에 맞음
      const dir = target.clone().sub(from).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - 0.5) * 2 * c.missOffset);
      const up = new THREE.Vector3(0, (Math.random() - 0.3) * c.missOffset * 0.8, 0);
      const aim = target.clone().add(side).add(up).sub(from).normalize();
      const w = s.collision.raycast(from.x, from.y, from.z, aim.x, aim.y, aim.z, 40, 'bullet');
      const end = from.clone().addScaledVector(aim, w ? w.dist : 40);
      s.effects.tracer(from, end, 90, 1.4);
      if (w) s.effects.impact(end, new THREE.Vector3(w.nx, w.ny, w.nz));
      bus.emit('guard:miss', { x: end.x, y: end.y, z: end.z, near: true });
    }
    s.effects.muzzleFlash(from, c.muzzleFlashIntensity || 55, 12, 0.06);
    this.emit('guard:fire');
  }

  // --- 피격·사망·암살 -----------------------------------------------------
  rayTest(o, d, maxT) {
    if (!this.alive) return null;
    const hc = this.cfg.hitbox;
    const head = this.model.joints.head.getWorldPosition(this._v);
    const hx = head.x, hy = head.y + 0.08, hz = head.z;
    const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, hx, hy, hz, hc.headRadius);
    const hips = this.model.joints.hips.getWorldPosition(new THREE.Vector3());
    const tb = rayVerticalCapsule(o.x, o.y, o.z, d.x, d.y, d.z, hips.x, hips.z, 0, hc.bodyTop, hc.bodyRadius);
    let best = null;
    if (th >= 0 && th < maxT) best = { t: th, part: 'head' };
    if (tb >= 0 && tb < maxT && (!best || tb < best.t - 0.05)) best = { t: tb, part: 'body' };
    return best;
  }

  onHit(dmg, info = {}) {
    if (!this.alive) return { killed: false };
    this.health -= dmg;
    this.anim.hit();
    if (this.health > 0) this.emit('guard:hit', { part: info.part });
    if (this.health <= 0) {
      // 앞에서 맞으면 뒤로, 뒤에서 맞으면 앞으로 쓰러진다
      const fromFront = Math.abs(wrapAngle(yawTo(info.from.x - this.pos.x, info.from.z - this.pos.z) - this.yaw)) < Math.PI / 2;
      this.kill('kill', fromFront ? 1 : -1);
      return { killed: true };
    }
    // 맞으면 즉시 플레이어 위치를 안다
    this.knowPlayer();
    if (this.stateName !== 'combat' && this.stateName !== 'alert') this.setState('alert');
    return { killed: false };
  }

  kill(kind = 'kill', dir = 1) {
    if (!this.alive) return;
    this.alive = false;
    this.setState('down', { dir });
    this.session.onGuardDown(this, kind);
  }

  // 암살 가능: 이 적에게 발각되지 않았고, 후방 일정 각도·거리 안
  canTakedown(pl) {
    if (!this.alive || this.aware || this.stateName === 'search') return false;
    const tk = this.cfg.takedown;
    const dx = pl.x - this.pos.x, dz = pl.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > tk.maxDistance) return false;
    const ang = Math.abs(wrapAngle(yawTo(dx, dz) - this.yaw));
    return ang >= Math.PI - tk.behindAngleDeg * DEG;
  }

  // 무기에 단 손전등: 스포트라이트 + 공기 중에 보이는 빛줄기(가산 혼합 원뿔) + 렌즈 글로우
  buildFlashlight(f) {
    const mount = this.model.lightMount;
    const angle = (f.angleDeg ?? 17) * DEG, len = f.beamLength ?? 5.5;
    const spot = new THREE.SpotLight(f.color || '#fff1d6', f.intensity ?? 45, f.distance ?? 20, angle, f.penumbra ?? 0.55, 1.4);
    spot.position.set(0, 0, 0);
    spot.target.position.set(0, 0, 10);
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.camera.near = 0.2; // 자기 총·손은 그림자에서 제외
    spot.shadow.camera.far = f.distance ?? 20;
    spot.shadow.bias = -0.0015;
    spot.shadow.normalBias = 0.03;
    mount.add(spot, spot.target);
    this.flash = spot;
    this.flashBase = spot.intensity;
    if (!Guard.beamTex) {
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#737373'); g.addColorStop(1, '#000000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
      Guard.beamTex = new THREE.CanvasTexture(c);
    }
    const geo = new THREE.ConeGeometry(Math.tan(angle) * len * 0.85, len, 18, 1, true);
    geo.translate(0, -len / 2, 0); // 꼭짓점을 렌즈에
    geo.rotateX(-Math.PI / 2); // +z(총구 방향)로
    // 원뿔 UV는 v=1이 꼭짓점 쪽 → 렌즈에서 멀어질수록 흐려지게 텍스처를 뒤집는다
    const tex = Guard.beamTex;
    this.beamMat = new THREE.MeshBasicMaterial({ color: f.color || '#fff1d6', alphaMap: tex, transparent: true, opacity: f.beamOpacity ?? 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beamMat.alphaMap.flipY = true;
    this.beam = new THREE.Mesh(geo, this.beamMat);
    this.beam.castShadow = false; this.beam.receiveShadow = false;
    this.beam.renderOrder = 2;
    mount.add(this.beam);
    this.glowMat = new THREE.SpriteMaterial({ color: f.color || '#fff1d6', map: Guard.glowTex || (Guard.glowTex = glowTexture()), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.set(0.22, 0.22, 1);
    this.glow.position.set(0, 0, 0.01);
    mount.add(this.glow);
    this.setShadows(!!this.session.game.save.settings.graphics.shadows);
  }

  setShadows(on) { if (this.flash) this.flash.castShadow = on; }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw + Math.PI; // 모델 앞면은 +z
  }

  update(dt) {
    this.visionT -= dt;
    this.wantSpeed = 0;
    if (this.alive && !this.inCinematic) this.state.update(this, dt);
    this.speed = this.wantSpeed || 0;
    // 발소리 (플레이어가 경비원 위치를 소리로 알 수 있게)
    this.stepAcc = (this.stepAcc || 0) + this.speed * dt;
    if (this.stepAcc > (this.speed > 2.5 ? 1.5 : 1.0)) { this.stepAcc = 0; this.emit('guard:footstep', { run: this.speed > 2.5 }); }
    this.anim.update(dt, this.alive ? this.speed : 0);
    // 쓰러지면 손전등은 바닥에 떨어진 채로 약하게 남는다
    if (!this.alive && this.flash) {
      const m = this.cfg.flashlight?.downIntensityMul ?? 0.6;
      this.flash.intensity = this.flashBase * m;
      this.beamMat.opacity = (this.cfg.flashlight?.beamOpacity ?? 0.07) * m;
    }
    this.syncTransform();
    const pl = this.session.player;
    this.icon.update(dt, Math.hypot(pl.x - this.pos.x, pl.z - this.pos.z));
  }

  dispose() {
    this.flash.dispose?.();
    this.beam.geometry.dispose(); this.beamMat.dispose(); this.glowMat.dispose();
    this.icon.dispose();
    this.session.scene.remove(this.group);
    this.model.dispose();
  }
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,240,210,.6)'); g.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

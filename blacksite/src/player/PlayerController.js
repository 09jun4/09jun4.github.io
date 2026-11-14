// 1인칭 플레이어 이동: 걷기·달리기·앉기 토글·점프·기울이기, 자체 충돌, 카메라 흔들림(bob).
import * as THREE from 'three';
import { clamp, damp, DEG, lerp } from '../utils/math.js';
import { Stance } from './Stance.js';
import { Health } from './Health.js';
import { bus } from '../core/EventBus.js';

export class PlayerController {
  constructor(cfg, collision, camera) {
    this.cfg = cfg;
    this.collision = collision;
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.stance = new Stance(cfg);
    this.health = new Health(cfg.health);
    this.lean = 0; // -1 왼쪽 ~ 1 오른쪽 (부드럽게)
    this.leanLimit = 1;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.speedNorm = 0; // 0~1 (달리기 기준)
    this.sprinting = false;
    this.moving = false;
    this.aiming = false;
    this.frozen = false;
    this.sensitivity = 1;
    this.aimSensMul = cfg.mouse.aimSensitivityMul;
    this.invertY = false;
    this.shake = 1; // 화면 흔들림 강도 배율
    this.kickPitch = 0; // 반동으로 생긴 카메라 킥
    this.kickYaw = 0;
    this.lookDX = 0; this.lookDY = 0; // 무기 흔들림용 마지막 마우스 이동
    this.landDip = 0;
    this._stepDist = 0;
    this.eye = new THREE.Vector3();
  }

  spawn(pos, yawDeg) {
    this.pos.set(pos[0], pos[1] || 0, pos[2]);
    this.vel.set(0, 0, 0);
    this.yaw = (yawDeg || 0) * DEG;
    this.pitch = 0;
    this.updateCamera(0);
  }

  get radius() { return this.cfg.radius; }
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
  get crouched() { return this.stance.crouched; }

  update(dt, input) {
    const c = this.cfg;
    // 시점
    if (!this.frozen) {
      const [mx, my] = input.consumeMouse();
      const k = c.mouse.radiansPerPixel * this.sensitivity * (this.aiming ? this.aimSensMul : 1);
      this.yaw -= mx * k;
      this.pitch -= my * k * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.5, 1.5);
      this.lookDX = mx; this.lookDY = my;
    } else { input.consumeMouse(); this.lookDX = this.lookDY = 0; }

    // 자세
    if (!this.frozen && input.wasPressed('crouch')) this.stance.toggle();
    this.stance.update(dt);

    // 이동 입력
    let fx = 0, fz = 0;
    if (!this.frozen) {
      if (input.isDown('forward')) fz -= 1;
      if (input.isDown('back')) fz += 1;
      if (input.isDown('left')) fx -= 1;
      if (input.isDown('right')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const wantSprint = !this.frozen && input.isDown('sprint') && fz < 0 && !this.aiming;
    if (wantSprint && this.stance.crouched) this.stance.set(false); // 달리면 일어선다
    this.sprinting = wantSprint && len > 0 && !this.stance.crouched;
    let speed = this.stance.crouched ? c.crouchSpeed : this.sprinting ? c.sprintSpeed : c.walkSpeed;
    if (this.aiming) speed *= c.aimSpeedMul;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // 로컬 (fx, fz) → 월드
    const wx = fx * cos + fz * sin, wz = -fx * sin + fz * cos;
    const accel = this.onGround ? c.acceleration : c.acceleration * c.airControl;
    this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wz * speed, accel, dt);

    // 점프
    if (!this.frozen && this.onGround && input.wasPressed('jump')) {
      if (this.stance.crouched) this.stance.set(false);
      else { this.vel.y = Math.sqrt(2 * c.gravity * c.jumpHeight); this.onGround = false; bus.emit('player:jump'); }
    }
    const wasAir = !this.onGround;
    this.vel.y -= c.gravity * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      if (wasAir && this.vel.y < -3) { this.landDip = Math.min(0.08, -this.vel.y * 0.012); bus.emit('player:land', { speed: -this.vel.y }); }
      this.pos.y = 0; this.vel.y = 0; this.onGround = true;
    }

    // 충돌 이동
    const ox = this.pos.x, oz = this.pos.z;
    this.collision.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, c.radius, this.pos.y + 0.25, this.pos.y + this.stance.height);
    const realSpeed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    this.moving = realSpeed > 0.4 && this.onGround;
    this.speedNorm = clamp(realSpeed / c.sprintSpeed, 0, 1);

    // 발소리 이벤트 (보폭 기준)
    if (this.onGround) {
      this._stepDist += realSpeed * dt;
      const stride = this.stance.crouched ? 0.6 : this.sprinting ? 1.6 : 1.1;
      if (this._stepDist >= stride) {
        this._stepDist = 0;
        bus.emit('player:footstep', { x: this.pos.x, z: this.pos.z, sprint: this.sprinting, crouch: this.stance.crouched });
      }
    }

    // 기울이기 (벽에 닿으면 제한)
    let leanTarget = 0;
    if (!this.frozen) {
      if (input.isDown('leanLeft')) leanTarget -= 1;
      if (input.isDown('leanRight')) leanTarget += 1;
    }
    if (leanTarget !== 0) {
      const eyeY = this.pos.y + this.stance.eyeHeight;
      const rx = cos * leanTarget, rz = -sin * leanTarget;
      const hit = this.collision.raycast(this.pos.x, eyeY, this.pos.z, rx, 0, rz, c.lean.offset + 0.25, 'solid');
      this.leanLimit = hit ? clamp((hit.dist - 0.22) / c.lean.offset, 0, 1) : 1;
    }
    this.lean = damp(this.lean, leanTarget * this.leanLimit, c.lean.speed, dt);

    // 흔들림(bob)
    const bobTarget = this.moving ? (this.stance.crouched ? 0.6 : this.sprinting ? 1.0 : 0.75) : 0;
    this.bobAmt = damp(this.bobAmt, bobTarget, 8, dt);
    const freq = this.stance.crouched ? c.bob.crouchFreq : this.sprinting ? c.bob.sprintFreq : c.bob.walkFreq;
    if (this.moving) this.bobPhase += dt * freq * Math.PI * 2;

    // 반동 킥 복귀
    this.kickPitch = damp(this.kickPitch, 0, 9, dt);
    this.kickYaw = damp(this.kickYaw, 0, 9, dt);
    this.landDip = damp(this.landDip, 0, 7, dt);

    this.health.update(dt);
    this.updateCamera(dt);
  }

  addRecoil(pitch, yaw) {
    // 일부는 실제 조준을 올리고(복귀 안 함), 일부는 화면 킥(복귀)
    this.pitch = clamp(this.pitch + pitch * 0.35, -1.5, 1.5);
    this.yaw += yaw * 0.35;
    this.kickPitch += pitch * 0.65 * this.shake;
    this.kickYaw += yaw * 0.65 * this.shake;
  }

  updateCamera() {
    const c = this.cfg;
    const amp = this.stance.crouched ? c.bob.crouchAmp : this.sprinting ? c.bob.sprintAmp : c.bob.walkAmp;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * amp * this.bobAmt * this.shake - amp * 0.5 * this.bobAmt * this.shake;
    const bobX = Math.sin(this.bobPhase * 0.5) * amp * 0.5 * this.bobAmt * this.shake;
    const leanOff = this.lean * c.lean.offset;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const eyeY = this.pos.y + this.stance.eyeHeight + bobY - this.landDip - Math.abs(this.lean) * 0.06;
    this.eye.set(this.pos.x + cos * (leanOff + bobX), eyeY, this.pos.z - sin * (leanOff + bobX));
    this.camera.position.copy(this.eye);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + this.kickPitch, this.yaw + this.kickYaw,
      -this.lean * c.lean.rollDeg * DEG + Math.sin(this.bobPhase * 0.5) * c.bob.rollAmp * this.bobAmt * this.shake);
  }

  // 시선 방향 (정규화)
  getForward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }
  get eyeHeight() { return this.stance.eyeHeight; }
  get height() { return this.stance.height; }
}

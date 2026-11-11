// 적기 개체: 상태 + 운동(목표 방향을 각속도 제한으로 따라감) + 렌더 보간.
// 무엇을 할지(want, wantSpeed)는 ai/enemy-ai.js 가 정한다.
import * as THREE from 'three';
import { DEG, clamp, damp, wrapAngle } from '../core/math.js';
import { createEnemyVisual } from './enemy-model.js';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class Enemy {
  constructor(cfg, index) {
    this.cfg = cfg;
    this.index = index;
    this.visual = createEnemyVisual(cfg.modelScale);
    this.group = this.visual.group;
    this.alive = false;
    this.hp = 0;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.prevQuat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.speed = cfg.flight.speed;
    this.want = new THREE.Vector3(0, 0, -1); // AI가 정한 목표 방향(단위벡터)
    this.wantSpeed = cfg.flight.speed;
    this.smokeTimer = 0;
    this.age = 0;
    // AI 상태(ai/enemy-ai.js 가 사용)
    this.ai = {
      state: 'approach', time: 0, timer: 0, hasToken: false, tokenWait: 0,
      fireTimer: 0, burstLeft: 0, burstTimer: 0, evadeCooldown: 0,
      side: 1, lift: 0, dir: new THREE.Vector3(), orbitSign: 1,
    };
  }

  spawn(x, y, z, yaw, pitch = 0) {
    this.alive = true;
    this.hp = this.cfg.hp;
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.roll = 0;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.speed = this.cfg.flight.speed;
    this.wantSpeed = this.speed;
    this.smokeTimer = 0;
    this.age = 0;
    this._orient();
    this.want.copy(this.forward);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.group.visible = true;
    this.interpolate(1);
  }

  despawn() {
    this.alive = false;
    this.group.visible = false;
  }

  _orient() {
    _euler.set(this.pitch, this.yaw, -this.roll, 'YXZ');
    this.quat.setFromEuler(_euler);
    const cp = Math.cos(this.pitch);
    this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  step(dt, frozen) {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    if (frozen) { this.velocity.set(0, 0, 0); return; }
    this.age += dt;
    const f = this.cfg.flight;
    const yawMax = f.yawMax * DEG;
    const pitchMax = f.pitchMax * DEG;
    const w = this.want;
    const wantYaw = Math.atan2(-w.x, -w.z);
    let wantPitch = clamp(Math.asin(clamp(w.y, -1, 1)), -f.pitchLimit * DEG, f.pitchLimit * DEG);
    // 고도 범위를 벗어나지 않게
    if (this.pos.y < f.altMin) wantPitch = Math.max(wantPitch, 0.25);
    else if (this.pos.y > f.altMax) wantPitch = Math.min(wantPitch, -0.2);

    this.yawRate = damp(this.yawRate, clamp(wrapAngle(wantYaw - this.yaw) * f.steerGain, -yawMax, yawMax), f.rateTau, dt);
    this.pitchRate = damp(this.pitchRate, clamp((wantPitch - this.pitch) * f.steerGain, -pitchMax, pitchMax), f.rateTau, dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    this.pitch = clamp(this.pitch + this.pitchRate * dt, -f.pitchLimit * DEG, f.pitchLimit * DEG);
    this.roll = damp(this.roll, -(this.yawRate / yawMax) * f.rollMax * DEG, f.rollTau, dt);
    this.speed = damp(this.speed, clamp(this.wantSpeed, f.speedMin, f.speedMax), f.speedTau, dt);
    this._orient();
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.pos.addScaledVector(this.velocity, dt);
  }

  shift(dx, dz) {
    this.pos.x += dx; this.pos.z += dz;
    this.prevPos.x += dx; this.prevPos.z += dz;
  }

  interpolate(alpha) {
    this.group.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.group.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }
}

/** 적기 풀: 시작할 때 전부 만들어 두고 재사용한다. */
export class EnemyPool {
  constructor(scene, cfg, size) {
    this.list = [];
    for (let i = 0; i < size; i++) {
      const e = new Enemy(cfg, i);
      scene.add(e.group);
      this.list.push(e);
    }
  }

  spawn(x, y, z, yaw, pitch) {
    for (const e of this.list) {
      if (!e.alive) { e.spawn(x, y, z, yaw, pitch); return e; }
    }
    return null;
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.list) if (e.alive) n++;
    return n;
  }

  clear() {
    for (const e of this.list) e.despawn();
  }

  /** 프리셋 전환: 모든 적기의 메시를 바꾼다. fill(group) → 삼각형 수 */
  rebuildVisuals(fill) {
    for (const e of this.list) e.visual.triangles = fill(e.group);
  }
}

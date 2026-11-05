// FollowCamera — 3인칭 후방 추적 카메라.
// · 선호의 머리와 등을 바라보도록 뒤쪽 위에 배치
// · 방향 전환은 부드럽게 따라가고(급회전 때 살짝 늦게), 속도가 빠르면 멀어지고 시야각이 넓어짐
// · 건물을 뚫고 들어가지 않게 앞으로 당김 · 노면 충격은 작은 흔들림으로만 반영
// · 연출(컷신)용 고정 샷과 부드러운 전환 지원
import * as THREE from '../lib/three.js';
import { clamp, damp, dampAngle, lerp } from '../core/utils.js';

export class FollowCamera {
  constructor(camera, collision, roads) {
    this.camera = camera;
    this.collision = collision;
    this.roads = roads;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.shakeT = 0;
    this.dist = 4.4;
    this.fov = 60;
    this.shot = null;       // {pos, look, fov}
    this.blend = 1;         // 0 = 컷신 샷, 1 = 추적
    this.blendRate = 0;
    this._shotPos = new THREE.Vector3();
    this._shotLook = new THREE.Vector3();
    this.initialized = false;
  }

  snap(player) { this.initialized = false; this.update(0.016, player); }

  addShake(amount) { this.shake = Math.min(0.6, this.shake + amount); }

  // 컷신 샷 지정 (null이면 추적으로 복귀, duration 초 동안 부드럽게)
  setShot(shot, duration = 0) {
    if (shot) {
      this._shotPos.copy(shot.pos); this._shotLook.copy(shot.look);
      this.shotFov = shot.fov || 55;
      if (duration <= 0) this.blend = 0;
      this.blendTarget = 0;
    } else this.blendTarget = 1;
    this.blendRate = duration > 0 ? 1 / duration : 1000;
  }

  update(dt, player) {
    const P = player.physics;
    const heading = player.bike.root.rotation.y;
    const v = P.v;
    if (!this.initialized) { this.yaw = heading; }
    // 급격한 회전일수록 카메라가 살짝 늦게 따라감
    const turnLag = clamp(Math.abs(P.yawRate) * 0.8, 0, 1);
    this.yaw = dampAngle(this.yaw, heading, lerp(5.0, 3.2, turnLag), dt);
    this.dist = damp(this.dist, lerp(4.2, 6.4, clamp(v / 16, 0, 1)), 2, dt);
    const height = lerp(1.95, 2.25, clamp(v / 16, 0, 1));
    const head = new THREE.Vector3(P.x, (player.camY ?? player.bike.root.position.y) + 1.45, P.z);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const want = new THREE.Vector3(head.x - fx * this.dist, head.y + height - 1.25, head.z - fz * this.dist);
    // 건물 관통 방지
    const t = this.collision.raycastBoxes(head.x, head.y, head.z, want.x, want.y, want.z, 0.35);
    if (t < 1) want.lerpVectors(head, want, Math.max(0.2, t * 0.92));
    // 지면 아래로 내려가지 않게
    const gy = this.roads.query(want.x, want.z).height;
    if (want.y < gy + 0.6) want.y = gy + 0.6;

    if (!this.initialized) { this.pos.copy(want); this.initialized = true; }
    this.pos.x = damp(this.pos.x, want.x, 9, dt);
    this.pos.z = damp(this.pos.z, want.z, 9, dt);
    this.pos.y = damp(this.pos.y, want.y, 6, dt);
    if (t < 1) this.pos.lerp(want, 0.5); // 벽에 막히면 즉시 당김
    const lookAt = new THREE.Vector3(head.x + fx * 3.5, head.y - 0.15, head.z + fz * 3.5);

    // 노면 충격 흔들림 (작게)
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.shakeT += dt * 38;
    const sh = Math.min(this.shake, 0.35) * 0.12;
    const ox = Math.sin(this.shakeT * 1.3) * sh, oy = Math.sin(this.shakeT * 1.7 + 1) * sh;

    // 컷신 블렌드
    if (this.blendTarget !== undefined) {
      const dir = Math.sign(this.blendTarget - this.blend);
      this.blend = clamp(this.blend + dir * this.blendRate * dt, 0, 1);
    }
    const b = this.blend * this.blend * (3 - 2 * this.blend);
    const cam = this.camera;
    cam.position.lerpVectors(this._shotPos, this.pos, b);
    cam.position.x += ox; cam.position.y += oy;
    this.look.lerpVectors(this._shotLook, lookAt, b);
    cam.lookAt(this.look);
    this.fov = damp(this.fov, lerp(60, 82, clamp((v - 2) / 14, 0, 1)), 2.5, dt);
    const f = lerp(this.shotFov || 55, this.fov, b);
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
  }
}

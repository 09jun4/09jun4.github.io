// 카메라 리그: 3인칭 추적(chase) / 1인칭 조종석(cockpit) / 메뉴 회전(orbit).
// 렌더 프레임마다 보간된 기체 자세를 받아 갱신한다(프레임률과 무관한 지수 감쇠).
import * as THREE from 'three';
import { DEG, dampFactor, damp } from '../core/math.js';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

export const VIEW = { CHASE: 'chase', COCKPIT: 'cockpit', ORBIT: 'orbit' };

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} cfg data/camera.js 의 CAMERA
   * @param {THREE.Vector3} eye 기체 좌표계의 조종사 눈 위치
   */
  constructor(camera, cfg, eye) {
    this.camera = camera;
    this.cfg = cfg;
    this.eye = eye.clone();
    this.mode = '';
    this.quat = new THREE.Quaternion();
    this.pos = new THREE.Vector3();
    this.snap = true;
    this.orbitAngle = 2.5;
    this.shakeAmp = 0;
    this.shakeEnabled = true;
    this.time = 0;
    this.headYaw = 0;
    this.headPitch = 0;
    this.fov = 0;
    this.fixed = null; // 디버그: {yaw, pitch, dist} 고정 시점
    this.setMode(VIEW.ORBIT);
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.snap = true;
    this.camera.near = this.cfg.near[mode];
    this.camera.far = this.cfg.far;
    this._setFov(this.cfg[mode].fov);
    this.camera.updateProjectionMatrix();
  }

  _setFov(fov) {
    if (Math.abs(fov - this.fov) < 0.02) return;
    this.fov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** 흔들림을 더한다(0~1). 설정에서 끄면 무시된다. */
  addShake(amount) {
    if (!this.shakeEnabled) return;
    this.shakeAmp = Math.min(1, this.shakeAmp + amount);
  }

  /** 원점 재배치 */
  shift(dx, dz) {
    this.pos.x += dx;
    this.pos.z += dz;
  }

  /**
   * @param {object} t 기체 상태(보간된 값): pos, quat, yaw, pitch, roll, speed, cruise, inPitch, inTurn
   * @param {number} dt 프레임 시간(초)
   */
  update(t, dt) {
    const cam = this.camera;
    this.time += dt;
    if (this.fixed) {
      this._fixedView(t);
      return;
    }
    if (this.mode === VIEW.CHASE) {
      const c = this.cfg.chase;
      _euler.set(t.pitch * c.pitchFollow - c.lookDown * DEG, t.yaw, -t.roll * c.rollFollow, 'YXZ');
      _q.setFromEuler(_euler);
      if (this.snap) this.quat.copy(_q); else this.quat.slerp(_q, dampFactor(c.rotTau, dt));
      _v.set(0, c.offset.up, c.offset.back).applyQuaternion(this.quat).add(t.pos);
      if (this.snap) this.pos.copy(_v); else this.pos.lerp(_v, dampFactor(c.posTau, dt));
      cam.position.copy(this.pos);
      cam.quaternion.copy(this.quat);
      this._setFov(c.fov + (t.speed - t.cruise) * c.fovSpeedGain);
    } else if (this.mode === VIEW.COCKPIT) {
      const c = this.cfg.cockpit;
      const yawTarget = -t.inTurn * c.headTurn * DEG;
      const pitchTarget = t.inPitch * c.headPitch * DEG;
      if (this.snap) { this.headYaw = yawTarget; this.headPitch = pitchTarget; } else {
        this.headYaw = damp(this.headYaw, yawTarget, c.headTau, dt);
        this.headPitch = damp(this.headPitch, pitchTarget, c.headTau, dt);
      }
      _euler.set(this.headPitch, this.headYaw, t.roll * c.headRoll, 'YXZ');
      _q.setFromEuler(_euler);
      cam.quaternion.copy(t.quat).multiply(_q);
      // 가속 방향 반대로 머리가 아주 조금 쏠린다
      _v.set(this.eye.x + t.inTurn * c.sway * -0.6, this.eye.y - Math.abs(t.inPitch) * c.sway * 0.4, this.eye.z);
      cam.position.copy(_v.applyQuaternion(t.quat)).add(t.pos);
      this.pos.copy(cam.position);
      this.quat.copy(cam.quaternion);
    } else {
      const c = this.cfg.orbit;
      this.orbitAngle += c.speed * dt;
      cam.position.set(t.pos.x + Math.sin(this.orbitAngle) * c.distance, t.pos.y + c.height, t.pos.z + Math.cos(this.orbitAngle) * c.distance);
      cam.up.set(0, 1, 0);
      _v.copy(t.pos);
      _v.y += c.lookUp;
      cam.lookAt(_v);
      if (c.lookShift) cam.translateX(-c.lookShift);
      this.pos.copy(cam.position);
      this.quat.copy(cam.quaternion);
    }
    this.snap = false;
    this._applyShake(dt);
  }

  _applyShake(dt) {
    if (this.shakeAmp <= 0.0005) { this.shakeAmp = 0; return; }
    const s = this.cfg.shake;
    const a = this.shakeAmp;
    const t = this.time * s.hz;
    const cam = this.camera;
    const ang = s.maxAngle * DEG * a;
    _euler.set(Math.sin(t * 1.13) * ang, Math.sin(t * 0.87 + 1.7) * ang, Math.sin(t * 1.31 + 0.6) * ang * 0.6, 'YXZ');
    cam.quaternion.multiply(_q.setFromEuler(_euler));
    cam.position.x += Math.sin(t * 0.93 + 2.1) * s.maxOffset * a;
    cam.position.y += Math.sin(t * 1.21 + 0.4) * s.maxOffset * a;
    this.shakeAmp *= Math.exp(-s.decay * dt);
  }

  _fixedView(player) {
    const f = this.fixed;
    const t = f.target || player;
    const cam = this.camera;
    const cp = Math.cos(f.pitch * DEG);
    _v.set(Math.sin(f.yaw * DEG) * cp, Math.sin(f.pitch * DEG), Math.cos(f.yaw * DEG) * cp).multiplyScalar(f.dist).applyQuaternion(t.quat).add(t.pos);
    cam.position.copy(_v);
    _up.set(0, Math.abs(f.pitch) > 80 ? 0 : 1, Math.abs(f.pitch) > 80 ? -1 : 0).applyQuaternion(t.quat);
    cam.up.copy(_up);
    cam.lookAt(t.pos);
    cam.up.set(0, 1, 0);
    this._setFov(f.fov || 30);
  }
}

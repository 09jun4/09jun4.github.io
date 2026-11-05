import * as THREE from 'three';
import { TILE, centerOf, pushOut } from './maze.js';

const SPEED = 4, EYE = 1.6, RADIUS = 0.3;
const LEAN_TIME = 0.7, LEAN_ROLL = 15 * Math.PI / 180, LEAN_SIDE = 0.35;
const smooth = (t) => t * t * (3 - 2 * t);

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3();
    this.reset(0, 0, 0);
  }
  reset(tx, tz, yaw) {
    this.pos.set(centerOf(tx), 0, centerOf(tz));
    this.yaw = yaw; this.pitch = 0;
    this.leanRaw = 0;      // -1(왼쪽) .. 1(오른쪽), 선형으로 0.7초에 걸쳐 이동
    this.hp = 5; this.invul = 0; this.lungeT = 0;
  }
  get lean() { return Math.sign(this.leanRaw) * smooth(Math.abs(this.leanRaw)); }

  // keys: Set of KeyboardEvent.code
  update(dt, keys, grid) {
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let vx = -sy * f + cy * r, vz = -cy * f - sy * r;
    const l = Math.hypot(vx, vz);
    if (l > 0) { vx /= l; vz /= l; this.pos.x += vx * SPEED * dt; this.pos.z += vz * SPEED * dt; pushOut(grid, this.pos, RADIUS); }
    // 기울이기: 누르는 동안 유지, 떼면 복귀 (0.7초 보간)
    const target = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    const step = dt / LEAN_TIME;
    if (this.leanRaw < target) this.leanRaw = Math.min(target, this.leanRaw + step);
    else if (this.leanRaw > target) this.leanRaw = Math.max(target, this.leanRaw - step);
    if (this.lungeT > 0) { // 근접공격 돌진: 짧게 앞으로 쏠린다 (벽 충돌 유지)
      const k = this.lungeT / 0.16; this.lungeT = Math.max(0, this.lungeT - dt);
      this.pos.x += -sy * 6.5 * k * dt; this.pos.z += -cy * 6.5 * k * dt; pushOut(grid, this.pos, RADIUS);
    }
    this.invul = Math.max(0, this.invul - dt);
    this.applyCamera(grid);
  }

  applyCamera(grid) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let off = this.lean * LEAN_SIDE;
    const probe = new THREE.Vector3();
    for (let k = 0; k < 5; k++) { // 기울인 머리가 벽에 파묻히면 줄인다
      probe.set(this.pos.x + cy * off, 0, this.pos.z - sy * off);
      const q = probe.clone(); pushOut(grid, q, 0.12);
      if (q.distanceToSquared(probe) < 1e-8) break;
      off *= 0.75;
    }
    this.camera.position.set(this.pos.x + cy * off, EYE, this.pos.z - sy * off);
    this.camera.rotation.set(this.pitch, this.yaw, -this.lean * LEAN_ROLL);
    this.camera.updateMatrixWorld(true);
  }

  lunge() { this.lungeT = 0.16; }

  hit() {
    if (this.invul > 0 || this.hp <= 0) return false;
    this.hp--; this.invul = 1;
    return true;
  }
}

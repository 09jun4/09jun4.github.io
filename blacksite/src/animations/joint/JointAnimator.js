// 관절형 파츠 애니메이션: 걷기·달리기·경계·조준·사격·피격·쓰러짐을 절차적으로 계산해 섞는다.
// 스켈레탈 방식으로 바꾸려면 같은 입력(params)을 받는 다른 애니메이터로 교체하면 된다.
import { clamp, damp, lerp, smooth } from '../../utils/math.js';

// 자세 정의: 관절 → [rx, ry, rz]
const LOW_READY = {
  rShoulder: [-0.35, 0, -0.12], rElbow: [-1.0, 0.25, 0],
  lShoulder: [-0.7, 0, 0.3], lElbow: [-1.1, -0.2, 0],
  weapon: [0.6, -0.45, 0.2], chest: [0.04, 0, 0], head: [0.05, 0, 0],
};
const AIM = {
  rShoulder: [-1.25, 0, -0.32], rElbow: [-0.75, 0.3, 0],
  lShoulder: [-1.45, 0, 0.62], lElbow: [-0.35, -0.4, 0],
  weapon: [0.0, 0, 0], chest: [0.0, 0, 0], head: [0.0, 0, 0],
};
const WEAPON_POS_LOW = [0.1, -0.12, 0.22];
const WEAPON_POS_AIM = [0.09, 0.2, 0.3];

export class JointAnimator {
  constructor(model) {
    this.m = model;
    this.J = model.joints;
    this.rest = model.rest;
    this.phase = Math.random() * 6;
    this.speed = 0;
    this.aim = 0;
    this.aimTarget = 0;
    this.flinch = 0;
    this.fireKick = 0;
    this.headYaw = 0; // 경계 시 고개 돌리기
    this.headYawTarget = 0;
    this.death = -1; // -1 살아 있음, 0~1 쓰러지는 중
    this.deathDir = 1; // 1 뒤로, -1 앞으로
    this.override = null; // 암살 시퀀스 등에서 직접 포즈 지정: fn(J, rest)
    this.time = Math.random() * 10;
  }

  hit() { this.flinch = 1; }
  fire() { this.fireKick = 1; }
  die(dir = 1) { if (this.death < 0) { this.death = 0; this.deathDir = dir; } }

  update(dt, speed) {
    const J = this.J, R = this.rest;
    this.time += dt;
    this.speed = damp(this.speed, speed, 8, dt);
    this.aim = damp(this.aim, this.aimTarget, 7, dt);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.fireKick = Math.max(0, this.fireKick - dt * 9);
    this.headYaw = damp(this.headYaw, this.headYawTarget, 3, dt);

    if (this.override) { this.override(J, R, dt); return; }

    // 기본 자세 (낮은 경계 ↔ 조준)
    const a = smooth(this.aim);
    for (const k of Object.keys(LOW_READY)) {
      const lo = LOW_READY[k], hi = AIM[k], r = R[k].rot;
      J[k].rotation.set(r.x + lerp(lo[0], hi[0], a), r.y + lerp(lo[1], hi[1], a), r.z + lerp(lo[2], hi[2], a));
    }
    J.weapon.position.set(lerp(WEAPON_POS_LOW[0], WEAPON_POS_AIM[0], a), lerp(WEAPON_POS_LOW[1], WEAPON_POS_AIM[1], a), lerp(WEAPON_POS_LOW[2], WEAPON_POS_AIM[2], a));

    // 걷기·달리기 주기
    const sp = this.speed;
    const k = clamp(sp / 1.4, 0, 1.6);
    this.phase += dt * (sp > 0.05 ? 2.2 + sp * 1.6 : 0);
    const ph = this.phase;
    const swing = 0.42 * Math.min(k, 1.25);
    J.lHip.rotation.x = R.lHip.rot.x - Math.sin(ph) * swing;
    J.rHip.rotation.x = R.rHip.rot.x + Math.sin(ph) * swing;
    J.lKnee.rotation.x = R.lKnee.rot.x + Math.max(0, Math.sin(ph + 1.3)) * 0.85 * Math.min(k, 1.3) + 0.05;
    J.rKnee.rotation.x = R.rKnee.rot.x + Math.max(0, -Math.sin(ph + 1.3)) * 0.85 * Math.min(k, 1.3) + 0.05;
    J.hips.position.y = R.hips.pos.y + Math.abs(Math.cos(ph)) * 0.025 * Math.min(k, 1) - 0.02 * Math.min(k, 1);
    J.hips.rotation.y = Math.sin(ph) * 0.08 * Math.min(k, 1);
    J.spine.rotation.y = -Math.sin(ph) * 0.06 * Math.min(k, 1);
    J.spine.rotation.x = 0.06 * Math.max(0, k - 1); // 달릴 때 앞으로 숙임
    // 숨쉬기
    J.chest.rotation.x += Math.sin(this.time * 1.6) * 0.012;
    // 고개
    J.head.rotation.y = this.headYaw;
    J.neck.rotation.y = this.headYaw * 0.3;
    // 피격 움찔
    if (this.flinch > 0) {
      const f = smooth(this.flinch);
      J.chest.rotation.x -= 0.25 * f;
      J.head.rotation.x -= 0.2 * f;
      J.spine.rotation.z += 0.12 * f;
    }
    // 사격 반동
    if (this.fireKick > 0) {
      J.weapon.rotation.x -= 0.12 * this.fireKick;
      J.weapon.position.z -= 0.03 * this.fireKick;
    }
    // 쓰러짐
    if (this.death >= 0) this._death(dt);
  }

  _death(dt) {
    const J = this.J, R = this.rest, root = this.m.root;
    this.death = Math.min(1, this.death + dt / 1.25);
    const t = this.death;
    const buckle = smooth(clamp(t / 0.35, 0, 1));
    const fall = smooth(clamp((t - 0.2) / 0.8, 0, 1));
    const d = this.deathDir;
    J.lKnee.rotation.x = lerp(1.2 * buckle, 0.35, fall);
    J.rKnee.rotation.x = lerp(1.0 * buckle, 0.2, fall);
    J.lHip.rotation.x = lerp(-0.6 * buckle, -0.15, fall);
    J.rHip.rotation.x = lerp(-0.4 * buckle, 0.1, fall);
    J.hips.position.y = R.hips.pos.y - 0.3 * buckle * (1 - fall);
    J.chest.rotation.x = 0.3 * buckle * d * -1 + 0.1;
    J.head.rotation.x = -0.3 * fall * d;
    J.lShoulder.rotation.set(lerp(-0.9, -0.2, fall), 0, lerp(0.5, 1.0, fall));
    J.rShoulder.rotation.set(lerp(-0.6, -0.4, fall), 0, lerp(-0.2, -0.9, fall));
    J.lElbow.rotation.x = lerp(-0.8, -0.3, fall);
    J.rElbow.rotation.x = lerp(-1.0, -0.5, fall);
    J.weapon.rotation.x = lerp(0.5, 1.2, fall);
    root.rotation.x = -1.48 * fall * d;
    root.position.y = 0.13 * fall;
  }
}

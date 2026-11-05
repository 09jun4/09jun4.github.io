// PlayerAnimation — 절차적 애니메이션. 모델(CharacterModel)의 관절만 움직이므로 모델을 바꿔도 그대로 써요.
// 자세: 주행(페달링·조향·상체 흔들림), 정지(한 발 딛기), 걷기, 서기, 넘어짐, 일어나기, 재탑승
// 상태 반영: 피로 → 상체가 숙여지고 고개가 떨어짐 / 저체온 → 어깨 움츠림·떨림 / 감기 → 재채기
import * as THREE from '../lib/three.js';
import { clamp, smoothstep } from '../core/utils.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const _v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
const _q = [0, 1, 2, 3].map(() => new THREE.Quaternion());
const _m = new THREE.Matrix4();

export class PlayerAnimation {
  constructor(character, bike) {
    this.ch = character;
    this.bike = bike;
    this.J = character.joints;
    this.order = ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'hipL', 'kneeL', 'footL', 'hipR', 'kneeR', 'footR'];
    this.bufA = this._makeBuf();
    this.bufB = this._makeBuf();
    this.time = 0;
    this.sneeze = 0;
    this.shiver = 0;
  }

  _makeBuf() { return { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), joints: this.order.map(() => new THREE.Quaternion()) }; }
  _capture(buf) {
    buf.pos.copy(this.ch.root.position); buf.quat.copy(this.ch.root.quaternion);
    this.order.forEach((n, i) => buf.joints[i].copy(this.J[n].quaternion));
  }
  _blend(a, b, t) {
    this.ch.root.position.lerpVectors(a.pos, b.pos, t);
    this.ch.root.quaternion.slerpQuaternions(a.quat, b.quat, t);
    this.order.forEach((n, i) => this.J[n].quaternion.slerpQuaternions(a.joints[i], b.joints[i], t));
    this.ch.root.updateMatrixWorld(true);
  }

  // 2관절 IK: upper(어깨/엉덩이) → lower(팔꿈치/무릎) → 끝점이 target에 닿도록. pole: 관절이 굽는 방향의 월드 점
  solveTwoBone(upper, lower, L1, L2, target, pole) {
    upper.parent.updateWorldMatrix(true, false);
    const A = _v[0].copy(upper.position).applyMatrix4(upper.parent.matrixWorld);
    const toT = _v[1].copy(target).sub(A);
    const dist = clamp(toT.length(), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.005);
    const n = toT.normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const p = _v[2].copy(pole).sub(A);
    p.addScaledVector(n, -p.dot(n));
    if (p.lengthSq() < 1e-8) p.set(0, 0, 1);
    p.normalize();
    const B = _v[3].copy(A).addScaledVector(n, a).addScaledVector(p, h);
    const T = _v[4].copy(A).addScaledVector(n, dist);
    // 위쪽 뼈
    const parentQ = upper.parent.getWorldQuaternion(_q[0]).invert();
    const dirU = _v[5].copy(B).sub(A).normalize().applyQuaternion(parentQ);
    upper.quaternion.setFromUnitVectors(DOWN, dirU);
    upper.updateMatrixWorld(true);
    const upQ = upper.getWorldQuaternion(_q[1]).invert();
    const dirL = _v[6].copy(T).sub(B).normalize().applyQuaternion(upQ);
    lower.quaternion.setFromUnitVectors(DOWN, dirL);
    lower.updateMatrixWorld(true);
  }

  // 끝 관절(발)의 월드 회전을 지정
  _setWorldQuat(joint, worldQ) {
    joint.parent.updateWorldMatrix(true, false);
    const pq = joint.parent.getWorldQuaternion(_q[2]).invert();
    joint.quaternion.copy(pq.multiply(worldQ));
  }

  _bodyCommon(ctx, ride) {
    const J = this.J;
    const fat = clamp((ctx.fatigue || 0) / 100, 0, 1);
    const cold = clamp((36.3 - (ctx.bodyTemp ?? 36.5)) / 2, 0, 1);
    const shiv = cold > 0.05 ? Math.sin(this.time * 47) * 0.02 * cold : 0;
    const sn = this.sneeze > 0 ? Math.sin((1 - this.sneeze) * Math.PI) : 0;
    J.pelvis.quaternion.identity();
    const lean = ride ? 0.32 + fat * 0.22 + cold * 0.1 : 0.04 + fat * 0.12;
    const sway = ride ? Math.sin(ctx.crank || 0) * 0.07 * (ctx.effort || 0) : 0;
    J.spine.rotation.set(lean + sn * 0.3, 0, sway * 0.6 + (ctx.bodyLean || 0) * 0.25);
    J.chest.rotation.set(0.08 + fat * 0.1 + shiv, 0, sway + shiv * 0.6);
    J.neck.rotation.set(ride ? -0.35 - fat * 0.05 : -0.05, 0, 0);
    J.head.rotation.set((ride ? -0.12 : 0) + fat * 0.35 + sn * 0.5 - (ride ? 0 : 0.05), (ctx.look || 0), shiv * 0.5);
    // 움츠린 어깨
    const shrug = cold * 0.04;
    J.shoulderL.position.y = 0.08 + shrug; J.shoulderR.position.y = 0.08 + shrug;
  }

  // 자전거 위 자세. footDown: 정지 중 오른발을 땅에 디딤
  poseRide(ctx, footDown = 0) {
    const ch = this.ch, J = this.J, bike = this.bike;
    bike.root.updateMatrixWorld(true);
    const seat = bike.anchors.seat.getWorldPosition(_v[7]);
    ch.root.position.copy(seat);
    bike.root.getWorldQuaternion(ch.root.quaternion);
    ch.root.translateY(0.03); ch.root.translateZ(0.02);
    this._bodyCommon(ctx, true);
    ch.root.updateMatrixWorld(true);
    const L = ch.lengths;
    const bq = bike.root.getWorldQuaternion(_q[3]);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bq);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(bq);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(bq);
    // 팔: 핸들 손잡이로 (팔꿈치는 바깥·아래쪽)
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      const grip = bike.anchors['grip' + s].getWorldPosition(new THREE.Vector3());
      const sh = J['shoulder' + s].getWorldPosition(new THREE.Vector3());
      const pole = sh.clone().addScaledVector(left, sx * 0.5).addScaledVector(up, -0.5).addScaledVector(fwd, -0.2);
      this.solveTwoBone(J['shoulder' + s], J['elbow' + s], L.upperArm, L.foreArm, grip, pole);
    }
    // 다리: 페달로 (무릎은 앞쪽)
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      let target;
      if (footDown > 0 && s === 'R') {
        const ped = bike.anchors.pedalR.getWorldPosition(new THREE.Vector3()).add(up.clone().multiplyScalar(0.05));
        const ground = ch.root.position.clone().addScaledVector(left, -0.42).addScaledVector(fwd, 0.15);
        ground.y = (ctx.groundY ?? 0) + 0.08;
        target = ped.lerp(ground, footDown);
      } else {
        target = bike.anchors['pedal' + s].getWorldPosition(new THREE.Vector3()).addScaledVector(up, 0.06);
      }
      const hip = J['hip' + s].getWorldPosition(new THREE.Vector3());
      const pole = hip.clone().addScaledVector(fwd, 1.0).addScaledVector(up, 0.2).addScaledVector(left, sx * 0.08);
      this.solveTwoBone(J['hip' + s], J['knee' + s], L.thigh, L.shin, target, pole);
      this._setWorldQuat(J['foot' + s], bq);
    }
  }

  // 서기/걷기. holdBike: 손으로 핸들을 잡음
  poseStand(ctx, { x, y, z, heading, walk = 0, phase = 0, holdBike = false }) {
    const ch = this.ch, J = this.J;
    const bob = walk * Math.abs(Math.sin(phase)) * 0.04;
    ch.root.position.set(x, y + ch.standHeight - 0.02 + bob, z);
    ch.root.quaternion.setFromEuler(new THREE.Euler(0, heading, 0, 'YXZ'));
    this._bodyCommon(ctx, false);
    // 뒤뚱뒤뚱 (체중 이동)
    J.pelvis.rotation.set(0, Math.sin(phase) * 0.12 * walk, Math.sin(phase) * 0.06 * walk);
    J.spine.rotation.z -= Math.sin(phase) * 0.05 * walk;
    const sw = Math.sin(phase) * 0.55 * walk;
    for (const [s, sx, k] of [['L', 1, 1], ['R', -1, -1]]) {
      const swing = sw * k;
      J['hip' + s].rotation.set(-swing, 0, sx * 0.04);
      J['knee' + s].rotation.set(Math.max(0, swing) * 0.9 + 0.05 * walk, 0, 0);
      J['foot' + s].rotation.set(-Math.max(0, swing) * 0.5, 0, 0);
      J['shoulder' + s].rotation.set(swing * 0.8, 0, sx * 0.18);
      J['elbow' + s].rotation.set(-0.35 - walk * 0.2, 0, 0);
    }
    ch.root.updateMatrixWorld(true);
    if (holdBike) {
      this.bike.root.updateMatrixWorld(true);
      const L = ch.lengths;
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        const grip = this.bike.anchors['grip' + s].getWorldPosition(new THREE.Vector3());
        const sh = J['shoulder' + s].getWorldPosition(new THREE.Vector3());
        const pole = sh.clone().add(new THREE.Vector3(0, -1, 0)).add(new THREE.Vector3(Math.cos(heading) * sx, 0, -Math.sin(heading) * sx).multiplyScalar(0.5));
        this.solveTwoBone(J['shoulder' + s], J['elbow' + s], L.upperArm, L.foreArm, grip, pole);
      }
    }
  }

  // 넘어진 뒤 바닥에 누운 자세 (자전거와 함께 옆으로)
  poseFallen(ctx) {
    this.poseRide(ctx);
    const J = this.J, s = ctx.fallSide || 1;
    const t = Math.sin(this.time * 3) * 0.1;
    J.spine.rotation.set(0.1, 0, -s * 0.25);
    J.chest.rotation.set(0, 0, -s * 0.1);
    J.neck.rotation.set(0.1, 0, s * 0.3);
    J.head.rotation.set(0, s * 0.3, 0);
    J.shoulderL.rotation.set(-0.4 + t, 0, 1.2);
    J.elbowL.rotation.set(-0.6, 0, 0);
    J.shoulderR.rotation.set(-0.4 - t, 0, -1.2);
    J.elbowR.rotation.set(-0.6, 0, 0);
    J.hipL.rotation.set(-0.9, 0, 0.2); J.kneeL.rotation.set(0.9 + t, 0, 0);
    J.hipR.rotation.set(-0.5, 0, -0.1); J.kneeR.rotation.set(0.5 - t, 0, 0);
    this.ch.root.updateMatrixWorld(true);
  }

  /**
   * ctx.mode: 'ride' | 'stopped' | 'walk' | 'stand' | 'falling' | 'lying' | 'getup' | 'mount'
   * ctx.t: 단계 진행도(0~1), ctx.stand: {x,y,z,heading}
   */
  update(dt, ctx) {
    this.time += dt;
    if (this.sneeze > 0) this.sneeze = Math.max(0, this.sneeze - dt * 1.6);
    const m = ctx.mode;
    if (m === 'ride') this.poseRide(ctx, 0);
    else if (m === 'stopped') this.poseRide(ctx, smoothstep(0, 1, ctx.footDown ?? 1));
    else if (m === 'walk' || m === 'stand') this.poseStand(ctx, { ...ctx.stand, walk: m === 'walk' ? 1 : 0, phase: ctx.walkPhase || 0, holdBike: !!ctx.holdBike });
    else if (m === 'falling') {
      this.poseRide(ctx);
      // 팔 허우적
      const t = ctx.t || 0;
      this.J.shoulderL.rotation.x -= t * 0.8; this.J.shoulderR.rotation.x -= t * 0.8;
      this.J.shoulderL.rotation.z += t * 0.9; this.J.shoulderR.rotation.z -= t * 0.9;
    } else if (m === 'lying') this.poseFallen(ctx);
    else if (m === 'getup') {
      this.poseFallen(ctx); this._capture(this.bufA);
      this.poseStand(ctx, { ...ctx.stand, holdBike: (ctx.t || 0) > 0.6 }); this._capture(this.bufB);
      this._blend(this.bufA, this.bufB, smoothstep(0, 1, ctx.t || 0));
    } else if (m === 'mount') {
      this.poseStand(ctx, { ...ctx.stand, holdBike: true }); this._capture(this.bufA);
      this.poseRide(ctx); this._capture(this.bufB);
      // 다리를 들어 넘기는 느낌: 중간에 살짝 위로
      const t = smoothstep(0, 1, ctx.t || 0);
      this._blend(this.bufA, this.bufB, t);
      this.ch.root.position.y += Math.sin(t * Math.PI) * 0.12;
    }
    this.ch.root.updateMatrixWorld(true);
  }

  triggerSneeze() { this.sneeze = 1; }
}


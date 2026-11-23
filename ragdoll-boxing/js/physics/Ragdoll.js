import * as THREE from '../../vendor/three.module.min.js';
import { RAPIER, GROUP, groups } from './World.js';

const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const _qa = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const qOf = (r) => _q2.set(r.x, r.y, r.z, r.w);

// 선수 로컬 오일러(도) → 쿼터니언. 왼쪽(L)은 XY 평면 거울상이라 x·y 회전을 뒤집는다.
export function eulerQ(e, side, out = new THREE.Quaternion()) {
  const m = side === 'L' ? -1 : 1;
  return out.setFromEuler(new THREE.Euler(e[0] * D * m, e[1] * D * m, e[2] * D, 'XYZ'));
}
export const axisQ = (deg, out = new THREE.Quaternion()) => out.setFromAxisAngle(new THREE.Vector3(0, 0, 1), deg * D);

export class Ragdoll {
  constructor(world, fcfg, pcfg, index) {
    this.world = world;
    this.cfg = fcfg;
    this.parts = {};
    this.joints = [];
    this.targets = {};       // 관절 이름 → 목표 상대 회전
    this.muscle = 1;          // 관절 근력 0~1
    this.assist = 1;          // 자세 유지 보조(중력 보정·높이·직립) 0~1
    this.hands = { L: null, R: null };
    const cg = groups(GROUP.FIGHTER[index], GROUP.ENV | GROUP.FIGHTER[1 - index]);

    for (const [name, def] of Object.entries(fcfg.parts)) {
      for (const side of def.side ? ['R', 'L'] : [null]) {
        const key = side ? name + side : name;
        const pos = vec(def.pos);
        if (side === 'L') pos.z = -pos.z;
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(pos.x, pos.y, pos.z)
          .setLinearDamping(pcfg.linearDamping).setAngularDamping(pcfg.angularDamping)
          .setCcdEnabled(name === 'hand').setCanSleep(false));
        const desc = def.shape === 'box' ? RAPIER.ColliderDesc.cuboid(...def.half)
          : def.shape === 'ball' ? RAPIER.ColliderDesc.ball(def.radius)
          : RAPIER.ColliderDesc.capsule(def.halfHeight, def.radius);
        desc.setMass(def.mass).setCollisionGroups(cg).setRestitution(pcfg.restitution)
          .setFriction(name === 'foot' ? pcfg.footFriction : pcfg.bodyFriction)
          .setContactSkin(pcfg.collisionMargin);
        if (name === 'hand') desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        const collider = world.createCollider(desc, body);
        this.parts[key] = { key, kind: name, side, def, body, collider, rest: pos, fighter: index };
        if (name === 'hand') this.hands[side] = this.parts[key];
      }
    }

    const sides = (def) => (def.side ? ['R', 'L'] : [null]);
    const pk = (def, side) => def.parent + (side && fcfg.parts[def.parent].side ? side : '');
    this.links = Object.values(fcfg.joints).flatMap((def) => sides(def).map((s) => [pk(def, s), def.child + (s ?? '')]));

    for (const [name, def] of Object.entries(fcfg.joints)) {
      for (const side of sides(def)) {
        const P = this.parts[pk(def, side)];
        const C = this.parts[def.child + (side ?? '')];
        const a = vec(def.anchor);
        if (side === 'L') a.z = -a.z;
        const a1 = a.clone().sub(P.rest), a2 = a.clone().sub(C.rest);
        const id = { x: 0, y: 0, z: 0, w: 1 };
        const data = def.type === 'revolute' ? RAPIER.JointData.revolute(a1, a2, vec(def.axis))
          : def.type === 'fixed' ? RAPIER.JointData.fixed(a1, id, a2, id)
          : RAPIER.JointData.spherical(a1, a2);
        const joint = world.createImpulseJoint(data, P.body, C.body, true);
        joint.setContactsEnabled(false);
        if (def.limits) joint.setLimits(def.limits[0] * D, def.limits[1] * D);
        const key = side ? name + side : name;
        this.joints.push({ key, name, side, def, parent: P, child: C, joint });
        this.targets[key] = new THREE.Quaternion();
      }
    }
    this.mass = Object.values(this.parts).reduce((s, p) => s + p.def.mass, 0);
    // 자세 유지 보조용 보이지 않는 키네마틱 기준점. 골반·몸통과 회전 모터만 있는 관절로 이어
    // 직립·방향을 암시적으로(안정적으로) 잡아 준다. 이동 축은 자유.
    this.anchor = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0));
    const free = (key) => world.createImpulseJoint(RAPIER.JointData.generic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0), this.anchor, this.parts[key].body, true);
    this.holdPelvis = free('pelvis');
    this.holdTorso = free('torso');
    this.holdPelvis.setContactsEnabled(false);
    this.holdTorso.setContactsEnabled(false);
    this.upper = Object.values(this.parts).filter((p) => p.kind !== 'foot' && p.kind !== 'lowerLeg');
    this.yawQ = new THREE.Quaternion();
    this.torsoQ = new THREE.Quaternion();
    this.moveVel = new THREE.Vector3();
    this.height = fcfg.balance.standHeight;
    this.pulls = [];
  }

  _subtree(key) {
    return [this.parts[key], ...this.links.filter(([p]) => p === key).flatMap(([, c]) => this._subtree(c))];
  }

  part(key) { return this.parts[key]; }
  pos(key, out = new THREE.Vector3()) { const t = this.parts[key].body.translation(); return out.set(t.x, t.y, t.z); }
  vel(key, out = new THREE.Vector3()) { const v = this.parts[key].body.linvel(); return out.set(v.x, v.y, v.z); }

  // 휴식 자세로 순간 배치 (라운드 시작에만 사용)
  reset(origin, yaw) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    for (const p of Object.values(this.parts)) {
      const w = p.rest.clone().applyQuaternion(q).add(origin);
      p.body.setTranslation(w, true);
      p.body.setRotation(q, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.anchor.setTranslation(origin, true);
    this.anchor.setRotation(q, true);
    this.yawQ.copy(q);
    this.torsoQ.copy(q);
  }

  _hold(joint, rel, freq) {
    const w0 = 2 * Math.PI * freq, k = w0 * w0 * this.assist, c = 2 * w0 * this.assist;
    const ang = 2 * Math.acos(Math.min(1, Math.abs(rel.w))), s = Math.sin(ang / 2), sg = rel.w < 0 ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      const v = s > 1e-6 ? [rel.x, rel.y, rel.z][i] / s * ang * sg : 0;
      joint.rawSet.jointConfigureMotorPosition(joint.handle, 3 + i, v, k, c);
    }
  }

  setJoint(key, q) { this.targets[key].copy(q); }

  // 관절 근육 = Rapier 내장 관절 모터(암시적이라 큰 힘에도 안정적). 목표는 부모 기준 회전 벡터.
  _motors() {
    for (const j of this.joints) {
      if (!j.def.freq) continue;
      const w0 = 2 * Math.PI * j.def.freq, k = w0 * w0 * this.muscle, c = 2 * j.def.damping * w0 * Math.sqrt(this.muscle);
      const q = this.targets[j.key];
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))), s = Math.sin(ang / 2), sg = q.w < 0 ? -1 : 1;
      const rv = s > 1e-6 ? [q.x / s * ang * sg, q.y / s * ang * sg, q.z / s * ang * sg] : [0, 0, 0];
      if (j.def.type === 'revolute') j.joint.configureMotorPosition(rv[2], k, c);
      else for (let i = 0; i < 3; i++) j.joint.rawSet.jointConfigureMotorPosition(j.joint.handle, 3 + i, rv[i], k, c);
    }
  }

  // 손을 목표 지점으로 끌어당긴다. 반작용은 몸통이 받아 몸 전체가 날아가지 않는다.
  pull(side, target, force) { this.pulls.push({ side, target: target.clone(), force }); }

  // 매 물리 스텝 전에 호출: 관절 근육 + 자세 유지 보조
  applyControl(dt, g) {
    const b = this.cfg.balance;
    this._motors();

    // 자세 유지 보조: 기준점을 골반 위치·목표 방향으로 옮기고, 모터 세기를 보조 수준에 맞춘다
    const a = this.assist, pel = this.parts.pelvis.body, pt = pel.translation(), pv = pel.linvel();
    this.anchor.setNextKinematicTranslation(pt);
    this.anchor.setNextKinematicRotation(this.yawQ);
    this._hold(this.holdPelvis, _qa.identity(), b.uprightFreq);
    this._hold(this.holdTorso, _qa.copy(this.yawQ).invert().multiply(this.torsoQ), b.torsoFreq);
    if (a > 0) {
      // 상체 부위마다 자기 질량만큼 힘을 줘서(부위별로 안정) 중력 보정·높이·이동 속도를 맞춘다
      const wh = 2 * Math.PI * b.heightFreq, ay = g + wh * wh * (this.height - pt.y);
      for (const p of this.upper) {
        const v = p.body.linvel(), m = p.def.mass * a * dt;
        p.body.applyImpulse({
          x: m * b.moveResponse * (this.moveVel.x - v.x),
          y: m * (ay - 2 * wh * pv.y),
          z: m * b.moveResponse * (this.moveVel.z - v.z),
        }, true);
      }
    }

    for (const { side, target, force } of this.pulls) {
      const h = this.hands[side].body, hp = h.translation(), hv = h.linvel();
      _v.set(target.x - hp.x, target.y - hp.y, target.z - hp.z);
      const d = _v.length();
      if (d < 1e-4) continue;
      // 목표까지 남은 거리에 비례, 목표 근처에서는 속도를 죽여 튀지 않게
      _v.multiplyScalar(force * Math.min(1, d / 0.12) / d);
      _v.x -= hv.x * force * 0.02; _v.y -= hv.y * force * 0.02; _v.z -= hv.z * force * 0.02;
      _v.multiplyScalar(dt * this.muscle);
      h.applyImpulse(_v, true);
      this.parts.torso.body.applyImpulse(_v.negate(), true);
    }
    this.pulls.length = 0;
  }
}

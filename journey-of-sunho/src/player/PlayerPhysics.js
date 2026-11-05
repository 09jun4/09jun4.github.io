// PlayerPhysics — 자전거 주행 물리 (렌더링과 분리, 고정 시간 간격으로 실행).
// 페달 힘(출력 한계) · 공기저항(바람 포함) · 구름저항 · 경사 · 브레이크(마찰 한계) ·
// 속도별 조향 한계 · 원심력 vs 노면 마찰(미끄러짐) · 옆바람 · 연석 충격 · 건물 충돌
import { clamp, damp } from '../core/utils.js';

const G = 9.81, RHO = 1.2;

export class PlayerPhysics {
  constructor(cfg, frictionCfg, bikePhys, roads, collision) {
    this.cfg = cfg;
    this.fr = frictionCfg;
    this.bike = bikePhys;
    this.roads = roads;
    this.collision = collision;
    this.q = {};
    this.hitInfo = {};
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    const q = this.roads.query(x, z, this.q);
    this.y = q.height; this.surface = q.surface;
    this.v = 0; this.vlat = 0; this.steer = 0; this.steerRate = 0;
    this.yawRate = 0; this.lean = 0; this.pitch = 0;
    this.slip = 0; this.skid = 0; this.bump = 0; this.hit = null;
    this.power = 0; this.grade = 0; this.mu = this.fr.road;
    this.distance = 0;
    this.stopped = true;
  }

  maxSteer(v) {
    const c = this.cfg;
    return c.steerMaxHighSpeed + (c.steerMax - c.steerMaxHighSpeed) / (1 + v / c.steerSpeedRef);
  }

  /**
   * ctrl: {throttle, brake, steer}
   * env: {powerMul, muMul(q,x,z)→배율, windX, windZ, wobble}
   */
  step(dt, ctrl, env) {
    const c = this.cfg, m = this.bike.mass;
    const q = this.roads.query(this.x, this.z, this.q);
    this.surface = q.surface;
    let mu = this.fr[q.surface] ?? this.fr.road;
    mu *= env.muMul ? env.muMul(q, this.x, this.z) : 1;
    this.mu = mu = clamp(mu, 0.08, 1.2);

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // 오른쪽
    // 진행 방향 경사
    let grade = 0;
    if (q.road && q.surface !== 'grass') grade = q.grade * (fx * q.tx + fz * q.tz);
    else {
      const h0 = this.roads.terrainHeight(this.x, this.z), h1 = this.roads.terrainHeight(this.x + fx, this.z + fz);
      grade = h1 - h0;
    }
    this.grade = grade;

    // --- 세로 방향 힘
    const v = this.v;
    const pedalF = ctrl.throttle * Math.min(c.maxForce * (env.powerMul ?? 1), (c.maxPower * (env.powerMul ?? 1)) / Math.max(v, 1.2));
    const windAlong = (env.windX || 0) * fx + (env.windZ || 0) * fz;
    const air = v - windAlong;
    const drag = 0.5 * RHO * c.cdA * Math.abs(air) * air;
    const roll = v > 0.05 ? (c.crr[q.surface] ?? c.crr.road) * m * G : 0;
    const gravity = m * G * grade / Math.sqrt(1 + grade * grade);
    let a = (pedalF - drag - roll - gravity) / m;
    // 브레이크: 마찰 한계를 넘으면 바퀴가 미끄러짐(skid)
    this.skid = 0;
    if (ctrl.brake > 0.01 && v > 0.01) {
      const want = ctrl.brake * c.brakeDecel;
      const maxD = mu * G * 0.92;
      let dec = want;
      if (want > maxD) { this.skid = clamp((want - maxD) / maxD, 0, 1) * clamp(v / 4, 0, 1); dec = mu * G * 0.7; }
      a -= dec;
    }
    if (this.extraDecel) { a -= this.extraDecel; this.extraDecel = 0; }
    let nv = v + a * dt;
    if (nv < 0) nv = 0;
    if (v <= 0.01 && pedalF < gravity && gravity > 0) nv = 0; // 오르막 정지: 발로 버팀
    nv = Math.min(nv, c.maxSpeedKmh / 3.6);
    this.v = nv;
    this.power = pedalF * nv;

    // --- 조향 (속도가 빠를수록 조향 한계가 작아져요)
    const target = ctrl.steer * this.maxSteer(nv);
    const rate = ctrl.steer === 0 ? c.steerReturn : c.steerRate;
    const prev = this.steer;
    const d = target - this.steer;
    this.steer += clamp(d, -rate * dt, rate * dt);
    this.steerRate = (this.steer - prev) / dt;
    let yaw = nv * Math.tan(this.steer) / c.wheelbase;
    // 원심 가속도가 노면 마찰 한계를 넘으면 미끄러짐
    const latA = nv * yaw;
    const limit = mu * G * c.slipLimit;
    this.slip = 0;
    if (Math.abs(latA) > limit && nv > 0.5) {
      this.slip = clamp((Math.abs(latA) - limit) / limit, 0, 1.5);
      yaw = Math.sign(yaw) * limit / nv;
      this.vlat -= Math.sign(latA) * (Math.abs(latA) - limit) * 0.5 * dt; // 바깥쪽으로 밀림
    }
    if (this.skid > 0) { yaw *= 1 - this.skid * 0.6; this.vlat += (Math.random() - 0.5) * this.skid * 2 * dt; }
    this.yawRate = yaw;
    this.heading -= yaw * dt;

    // --- 옆바람
    const windSide = (env.windX || 0) * rx + (env.windZ || 0) * rz;
    const sideF = 0.5 * RHO * 0.95 * Math.abs(windSide) * windSide;
    this.vlat += (sideF / m) * dt * (1.3 - Math.min(nv, 8) / 16);
    this.windSideAcc = sideF / m;
    this.vlat *= Math.exp(-c.lateralDamping * mu * dt);

    // --- 위치 갱신
    const ox = this.x, oz = this.z;
    this.x += (fx * nv + rx * this.vlat) * dt;
    this.z += (fz * nv + rz * this.vlat) * dt;
    const moved = Math.hypot(this.x - ox, this.z - oz);
    this.distance += moved;

    // --- 정적 충돌 (건물·나무·기둥)
    this.hit = null;
    const h = this.collision.resolveStatic(this.x, this.z, 0.38, this.hitInfo);
    if (h) {
      const vx = fx * nv + rx * this.vlat, vz = fz * nv + rz * this.vlat;
      const into = -(vx * h.nx + vz * h.nz);
      this.x = h.x; this.z = h.z;
      if (into > 0.2) {
        this.hit = { speed: into, tag: h.obj.tag };
        this.v *= clamp(1 - into / (nv + 0.01), 0.05, 1) * 0.6;
        this.vlat = 0;
      }
    }

    // --- 높이와 연석 충격
    const q2 = this.roads.query(this.x, this.z, this.q);
    const prevSurface = this.surface;
    this.bump = 0;
    const dh = q2.height - this.y;
    if (prevSurface !== q2.surface && Math.abs(dh) > 0.06) this.bump = Math.abs(dh) * nv;
    this.y = dh > 0 ? damp(this.y, q2.height, 40, dt) : damp(this.y, q2.height, 18, dt);
    this.surface = q2.surface;
    this.onCrosswalk = q2.crosswalk;
    this.road = q2.road;

    // --- 시각용 기울기
    const leanT = clamp(Math.atan2(nv * this.yawRate, G), -0.7, 0.7) + (env.wobble || 0);
    this.lean = damp(this.lean, leanT, 7, dt);
    this.pitch = damp(this.pitch, Math.atan(grade), 6, dt);
    this.stopped = nv < 0.35 && ctrl.throttle < 0.05;
    this.bike.advance(moved, ctrl.throttle > 0.05 && nv > 0.1);
    if (ctrl.throttle > 0.05 && nv <= 0.1) this.bike.spinCrank(dt * 2 * ctrl.throttle);
  }
}

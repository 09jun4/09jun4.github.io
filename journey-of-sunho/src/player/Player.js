// Player — 박선호. 모델(캐릭터·자전거) / 애니메이션 / 조작 / 물리 / 상태를 묶고,
// 넘어짐 → 쓰러짐 → 일어나기 → 재탑승 흐름을 관리해요.
import * as THREE from '../lib/three.js';
import { PlayerAnimation } from './PlayerAnimation.js';
import { PlayerController } from './PlayerController.js';
import { PlayerPhysics } from './PlayerPhysics.js';
import { BicyclePhysics } from '../bicycle/BicyclePhysics.js';
import { clamp, damp, smoothstep } from '../core/utils.js';

export class Player {
  constructor({ scene, assets, input, balance, world }) {
    this.balanceCfg = balance;
    this.character = assets.create('character');
    this.bike = assets.create('bicycle');
    scene.add(this.character.root, this.bike.root);
    this.anim = new PlayerAnimation(this.character, this.bike);
    this.controller = new PlayerController(input, balance.bike);
    this.bikePhys = new BicyclePhysics(balance.bike);
    this.physics = new PlayerPhysics(balance.bike, balance.friction, this.bikePhys, world.roads, world.collision);
    this.world = world;
    this.state = null; // PlayerState (PHASE 3)
    this.mode = 'ride'; // ride | falling | lying | getup | mount | cutscene
    this.modeT = 0;
    this.falls = 0;
    this.fallSide = 1;
    this.listeners = {};
    this.cutscene = null; // 연출 중 자세 지정 {mode, stand, holdBike, t, bikePose}
    // 전조등
    this.headlight = new THREE.SpotLight(0xfff2d0, 0, 38, 0.5, 0.5, 1.2);
    this.headlight.castShadow = false;
    scene.add(this.headlight, this.headlight.target);
    this.footDown = 1;
    this.tilt = 0; // 넘어질 때 자전거 기울기
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach((f) => f(data)); }

  get speed() { return this.physics.v; }
  get position() { return { x: this.physics.x, y: this.physics.y, z: this.physics.z }; }
  get heading() { return this.physics.heading; }
  get canControl() { return this.mode === 'ride'; }

  placeAt(x, z, heading) {
    this.physics.reset(x, z, heading);
    this.controller.reset();
    this.mode = 'ride';
    this.tilt = 0;
  }

  // 넘어짐 시작 (side: 1 오른쪽, -1 왼쪽)
  fall(reason = 'balance', side = Math.sign(this.physics.lean) || 1) {
    if (this.mode !== 'ride') return;
    this.mode = 'falling';
    this.modeT = 0;
    this.fallSide = side;
    this.fallReason = reason;
    this.falls++;
    this.controller.reset();
    this.emit('fall', { reason, count: this.falls });
  }

  // 자동차에 치여 날아가기: 선호와 자전거가 따로 날아가요.
  // 흐름: launched(둘 다 비행) → lyingL(선호 누워 있음) → getupL(일어남) → walkL(자전거까지 걸어감)
  //       → pickL(자전거를 일으켜 세움) → mount(탑승) → ride(재개)
  launch(vx, vy, vz) {
    if (this.mode !== 'ride') return;
    const P = this.physics;
    const r = Math.random, sg = () => (r() < 0.5 ? -1 : 1);
    const rx = -Math.cos(P.heading), rz = Math.sin(P.heading); // 선호가 바라보는 방향의 오른쪽
    this.mode = 'launched';
    this.modeT = 0;
    this.falls++;
    this.controller.reset();
    const body = (o) => ({ yaw: P.heading, wy: 0, pitch: 0, roll: 0, bounces: 0, landed: false, tmp: {}, ...o });
    this.sunB = body({ x: P.x, y: P.y + 1.1, z: P.z, vx, vy, vz, wp: -(5 + r() * 5), wr: sg() * (3 + r() * 4), wy: sg() * (1 + r() * 2), side: sg(), off: 0.25 });
    const k = sg();
    this.bikeB = body({ x: P.x, y: P.y + 0.5, z: P.z, vx: vx * 0.55 + rx * k * 7, vy: vy * 0.75 + 1, vz: vz * 0.55 + rz * k * 7, wp: sg() * (4 + r() * 4), wr: sg() * (5 + r() * 4), side: sg(), off: 0 });
    this.bikeB.wy = 0;
    P.v = 0; P.vlat = 0;
    this.camY = null;
    this.emit('fall', { reason: 'launch', count: this.falls });
  }

  // 날아가는 물체 하나(선호 또는 자전거) 적분. rest: 착지 후 목표 자세
  _flyBody(b, dt, restPitch) {
    if (b.landed) return;
    b.vy -= 24 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.bounces === 0) { b.pitch += b.wp * dt; b.roll += b.wr * dt; b.yaw += b.wy * dt; }
    else {
      const k = 1 - Math.exp(-9 * dt);
      b.pitch += (restPitch - b.pitch) * k;
      b.roll += ((restPitch !== 0 ? 0 : b.side * 1.35) - b.roll) * k;
    }
    const h = this.world.collision.resolveStatic(b.x, b.z, 0.45, b.tmp);
    if (h) { b.x = h.x; b.z = h.z; b.vx *= -0.15; b.vz *= -0.15; }
    const gy = this.world.roads.query(b.x, b.z, b.tmp).height + b.off;
    if (b.y <= gy && b.vy < 0) {
      b.y = gy;
      if (b.bounces < 2 && Math.abs(b.vy) > 2) { b.vy = -b.vy * 0.33; b.vx *= 0.6; b.vz *= 0.6; b.bounces++; this.emit('thud'); }
      else { b.vy = 0; b.landed = true; this.emit('thud'); }
    }
  }

  _groundY(x, z) { return this.world.roads.query(x, z, this._gq || (this._gq = {})).height; }

  // 자전거 옆 선 자리(탑승 전에 서는 곳)
  _bikeSpot() {
    const b = this.bikeB, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    return { x: b.x + fz * 0.55 - fx * 0.15, z: b.z - fx * 0.55 - fz * 0.15 };
  }

  // launched 이후 단계 진행
  _launchFlow(dt, env) {
    const P = this.physics, F = this.balanceCfg.fall, S = this.sunB, B = this.bikeB;
    if (this.state) this.state.passive(dt, env);
    this.modeT += dt;
    if (this.mode === 'launched') {
      this._flyBody(S, dt, -Math.PI / 2);
      this._flyBody(B, dt, 0);
      P.x = S.x; P.z = S.z; P.y = S.y;
      this.camY = S.y - 0.4;
      if (S.landed && B.landed) { this.mode = 'lyingL'; this.modeT = 0; S.pitch = -Math.PI / 2; S.roll = 0; B.roll = B.side * 1.35; B.pitch = 0; }
      return;
    }
    const foot = this.foot || (this.foot = {});
    if (this.mode === 'lyingL') {
      if (this.modeT > 1.4) { this.mode = 'getupL'; this.modeT = 0; }
    } else if (this.mode === 'getupL') {
      if (this.modeT > 1.3) { this.mode = 'walkL'; this.modeT = 0; this.walkPhase = 0; }
    } else if (this.mode === 'walkL') {
      const t = this._bikeSpot();
      const dx = t.x - S.x, dz = t.z - S.z, d = Math.hypot(dx, dz);
      if (d > 0.12) {
        const sp = Math.min(d / dt, 1.9) * dt;
        S.x += (dx / d) * sp; S.z += (dz / d) * sp;
        S.yaw = Math.atan2(dx, dz);
        this.walkPhase += dt * 6.2;
        const h = this.world.collision.resolveStatic(S.x, S.z, 0.3, S.tmp);
        if (h) { S.x = h.x; S.z = h.z; }
      } else { this.mode = 'pickL'; this.modeT = 0; S.yaw = B.yaw; }
      S.y = this._groundY(S.x, S.z);
      P.x = S.x; P.z = S.z; P.y = S.y; this.camY = S.y;
    } else if (this.mode === 'pickL') {
      const k = Math.min(1, this.modeT / 1.0), e = k * k * (3 - 2 * k);
      B.roll = B.side * 1.35 * (1 - e);
      if (this.modeT >= 1.0) {
        // 자전거 위치에서 탑승 시작
        P.x = B.x; P.z = B.z; P.y = this._groundY(B.x, B.z); P.heading = B.yaw;
        P.v = 0; P.vlat = 0; P.lean = 0; P.steer = 0; P.yawRate = 0;
        this.mode = 'mount'; this.modeT = 0; this.camY = null;
      }
    }
  }

  // 고정 간격 업데이트 (물리·상태)
  fixedUpdate(dt, env) {
    const P = this.physics, F = this.balanceCfg.fall;
    if (this.mode === 'cutscene') return;
    if (['launched', 'lyingL', 'getupL', 'walkL', 'pickL'].includes(this.mode)) { this._launchFlow(dt, env); return; }
    if (this.mode === 'ride') {
      this.controller.update(dt);
      P.step(dt, this.controller, env);
      if (this.state) {
        this.state.update(dt, P, this.controller, env);
        if (this.state.balance <= this.balanceCfg.state.balanceFallThreshold) this.fall('balance');
      }
      if (P.hit && P.hit.speed > F.hardHitSpeed) this.fall('crash', Math.random() < 0.5 ? -1 : 1);
      return;
    }
    // 넘어짐 단계: 미끄러지며 감속
    this.modeT += dt;
    P.v = Math.max(0, P.v - 9 * dt);
    if (P.v > 0) P.step(dt, { throttle: 0, brake: 1, steer: 0 }, { ...env, windX: 0, windZ: 0 });
    if (this.state) this.state.passive(dt, env);
    const next = { falling: ['lying', F.tipTime], lying: ['getup', F.lieTime], getup: ['mount', F.getupTime], mount: ['ride', F.mountTime] }[this.mode];
    if (next && this.modeT >= next[1]) {
      this.mode = next[0];
      this.modeT = 0;
      if (this.mode === 'ride') {
        P.v = 0; P.vlat = 0; P.lean = 0; P.steer = 0;
        if (this.state) this.state.balance = this.balanceCfg.state.balanceAfterGetup;
        this.emit('remount');
      }
    }
  }

  // 프레임 업데이트 (보이는 것)
  update(dt, ctx = {}) {
    const P = this.physics, F = this.balanceCfg.fall, B = this.bike.root;
    const st = this.state;
    const look = -P.steer * 0.8;
    const common = {
      fatigue: st ? st.fatigue : 0, bodyTemp: st ? st.bodyTemp : 36.5,
      crank: this.bikePhys.crankAngle, effort: this.controller.throttle, look, bodyLean: P.lean, groundY: P.y,
      fallSide: this.fallSide,
    };
    if (this.mode === 'cutscene' && this.cutscene) {
      const cs = this.cutscene;
      if (cs.bikePose) { B.position.set(cs.bikePose.x, cs.bikePose.y, cs.bikePose.z); B.rotation.set(0, cs.bikePose.heading, cs.bikePose.lean || 0); }
      this.bike.setKickstand(!!cs.kickstand);
      this.bike.setCrank(this.bikePhys.crankAngle);
      this.bike.setWheelSpin(this.bikePhys.wheelAngle);
      this.bike.setSteer(0);
      this.anim.update(dt, { ...common, ...cs });
      this._updateLight(ctx);
      return;
    }
    this.bike.setKickstand(false);
    if (['launched', 'lyingL', 'getupL', 'walkL', 'pickL'].includes(this.mode)) {
      const S = this.sunB, BK = this.bikeB, m = this.mode;
      const bg = this._groundY(BK.x, BK.z);
      B.position.set(BK.x, m === 'launched' ? BK.y : bg, BK.z);
      B.rotation.set(BK.pitch, BK.yaw, BK.roll);
      this.bike.setSteer(m === 'launched' ? 0.5 : 0);
      this.bike.setKickstand(m === 'pickL' && this.modeT > 0.9);
      if (m === 'launched') this.bike.setWheelSpin(this.bikePhys.wheelAngle += dt * 30);
      const body = { x: S.x, y: S.y, z: S.z, pitch: S.pitch, yaw: S.yaw, roll: S.roll };
      const stand = { x: S.x, y: S.y, z: S.z, heading: S.yaw };
      const lie = { x: S.x, y: S.y, z: S.z, heading: S.yaw, side: S.side };
      if (m === 'launched') this.anim.update(dt, { ...common, mode: 'tumble', body });
      else if (m === 'lyingL') this.anim.update(dt, { ...common, mode: 'lieL', stand: lie });
      else if (m === 'getupL') this.anim.update(dt, { ...common, mode: 'getupL', t: clamp(this.modeT / 1.3, 0, 1), stand, lie });
      else if (m === 'walkL') this.anim.update(dt, { ...common, mode: 'walk', stand, walkPhase: this.walkPhase });
      else this.anim.update(dt, { ...common, mode: 'stand', stand, holdBike: true });
      this._updateLight(ctx);
      return;
    }
    // 자전거 자세
    let tilt = 0;
    if (this.mode === 'falling') tilt = this.fallSide * 1.35 * smoothstep(0, 1, this.modeT / F.tipTime) ** 1.5;
    else if (this.mode === 'lying') tilt = this.fallSide * 1.35;
    else if (this.mode === 'getup') tilt = this.fallSide * 1.35 * (1 - smoothstep(0.35, 1, this.modeT / F.getupTime));
    // 정지하면 오른쪽으로 살짝 기울여 한 발 딛기
    this.footDown = damp(this.footDown, P.stopped && this.mode === 'ride' ? 1 : 0, 8, dt);
    const stopLean = this.mode === 'ride' ? this.footDown * 0.12 : 0;
    B.position.set(P.x, P.y, P.z);
    B.rotation.set(-P.pitch, P.heading, this.mode === 'ride' ? P.lean + stopLean : tilt + P.lean * 0.3);
    this.bike.setSteer(this.mode === 'ride' ? P.steer * 1.4 : this.mode === 'falling' ? this.fallSide * 0.6 : 0);
    this.bike.setCrank(this.bikePhys.crankAngle);
    this.bike.setWheelSpin(this.bikePhys.wheelAngle);

    // 캐릭터
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    const lx = fz, lz = -fx; // 왼쪽
    const stand = { x: P.x + lx * 0.55 - fx * 0.15, y: P.y, z: P.z + lz * 0.55 - fz * 0.15, heading: P.heading };
    if (this.mode === 'ride') {
      this.anim.update(dt, { ...common, mode: this.footDown > 0.05 ? 'stopped' : 'ride', footDown: this.footDown });
    } else if (this.mode === 'falling') {
      this.anim.update(dt, { ...common, mode: 'falling', t: this.modeT / F.tipTime });
    } else if (this.mode === 'lying') {
      this.anim.update(dt, { ...common, mode: 'lying' });
    } else if (this.mode === 'getup') {
      this.anim.update(dt, { ...common, mode: 'getup', t: clamp(this.modeT / F.getupTime, 0, 1), stand });
    } else if (this.mode === 'mount') {
      this.anim.update(dt, { ...common, mode: 'mount', t: clamp(this.modeT / F.mountTime, 0, 1), stand });
    }
    this._updateLight(ctx);
  }

  _updateLight(ctx) {
    const hl = this.bike.anchors.headlight;
    hl.getWorldPosition(this.headlight.position);
    const h = this.bike.root.rotation.y;
    this.headlight.target.position.set(this.headlight.position.x + Math.sin(h) * 10, this.headlight.position.y - 1.6, this.headlight.position.z + Math.cos(h) * 10);
    this.headlight.intensity = (ctx.night ?? 0) * 60 + (ctx.fog ?? 0) * 20;
  }
}

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

  // 고정 간격 업데이트 (물리·상태)
  fixedUpdate(dt, env) {
    const P = this.physics, F = this.balanceCfg.fall;
    if (this.mode === 'cutscene') return;
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

// 플레이어 기체: 비행 상태 + 모델 + 렌더 보간.
import * as THREE from 'three';
import { createFlightState, resetFlight, stepFlight } from '../flight/flight-model.js';

export class Player {
  /**
   * @param {object} cfg data/aircraft.js 의 기체 항목
   * @param {{group:THREE.Group}} model
   * @param {{group:THREE.Group}} cockpit
   */
  constructor(cfg, model, cockpit) {
    this.cfg = cfg;
    this.model = model;
    this.cockpit = cockpit;
    this.flight = createFlightState();
    this.prevPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.input = { pitch: 0, turn: 0 };
    this.hp = cfg.hp;
    this.alive = true;
    this.time = 0;
    // 렌더용 보간 값(카메라·HUD가 읽는다)
    this.view = { pos: this.renderPos, quat: this.renderQuat, yaw: 0, pitch: 0, roll: 0, speed: 0, cruise: cfg.speed.cruise, inPitch: 0, inTurn: 0 };
    this._prev = { yaw: 0, pitch: 0, roll: 0, speed: 0 };
    if (cockpit) {
      model.group.add(cockpit.group);
      cockpit.group.visible = false;
    }
    this.reset();
  }

  reset(spawn) {
    resetFlight(this.flight, this.cfg, spawn);
    this.prevPos.copy(this.flight.pos);
    this.prevQuat.copy(this.flight.quat);
    this.input.pitch = 0;
    this.input.turn = 0;
    this.hp = this.cfg.hp;
    this.alive = true;
    this.velocity.copy(this.flight.forward).multiplyScalar(this.flight.speed);
    this.model.group.visible = true;
    this._capture();
    this.interpolate(1);
  }

  _capture() {
    const f = this.flight;
    this._prev.yaw = f.yaw;
    this._prev.pitch = f.pitch;
    this._prev.roll = f.roll;
    this._prev.speed = f.speed;
  }

  step(dt) {
    this.prevPos.copy(this.flight.pos);
    this.prevQuat.copy(this.flight.quat);
    this._capture();
    this.time += dt;
    if (this.alive) stepFlight(this.flight, this.input, this.cfg, dt);
    this.velocity.copy(this.flight.forward).multiplyScalar(this.alive ? this.flight.speed : 0);
  }

  /** 원점 재배치 */
  shift(dx, dz) {
    this.flight.pos.x += dx;
    this.flight.pos.z += dz;
    this.prevPos.x += dx;
    this.prevPos.z += dz;
  }

  /** 렌더 프레임: 이전/현재 상태를 alpha로 섞어 모델에 반영한다. */
  interpolate(alpha) {
    const f = this.flight;
    this.renderPos.lerpVectors(this.prevPos, f.pos, alpha);
    this.renderQuat.slerpQuaternions(this.prevQuat, f.quat, alpha);
    const g = this.model.group;
    g.position.copy(this.renderPos);
    g.quaternion.copy(this.renderQuat);
    const v = this.view;
    const p = this._prev;
    let dy = f.yaw - p.yaw;
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    v.yaw = p.yaw + dy * alpha;
    v.pitch = p.pitch + (f.pitch - p.pitch) * alpha;
    v.roll = p.roll + (f.roll - p.roll) * alpha;
    v.speed = p.speed + (f.speed - p.speed) * alpha;
    v.inPitch = this.input.pitch;
    v.inTurn = this.input.turn;
  }

  /** 조종면·배기·조종간 연출(렌더 프레임마다) */
  animate(frameDt) {
    this.model.setControls(this.input.pitch, this.input.turn, frameDt);
    this.model.setExhaust(this.flight.throttle, this.time, frameDt);
    if (this.cockpit && this.cockpit.group.visible) this.cockpit.setStick(this.input.pitch, this.input.turn, frameDt);
  }

  /** 1인칭이면 외형을 숨기고 조종석을 보인다. */
  setCockpitView(on) {
    this.model.exterior.visible = !on;
    if (this.cockpit) this.cockpit.group.visible = on;
  }
}

// 이륙 시네마틱 실행부: 타임라인(data/takeoff-cine.js)대로 기체·기어·플랩·카메라를 움직인다. 비행 물리는 멈춰 있다.
// 시간은 세션의 고정 스텝으로만 흐르므로 일시정지하면 함께 멈추고, 재개하면 이어진다.
import * as THREE from 'three';
import { DEG } from './math.js';
import { updateOrientation } from '../flight/flight-model.js';
import { CINE, stateAt, newState, cameraAt, wakeAmount, wakeNoise } from '../data/takeoff-cine.js';
import { AIRBASE } from '../data/takeoff.js';
import { GEAR_HEIGHT } from '../entities/gear.js';
import { VIEW } from '../flight/camera-rig.js';
import { FX } from '../data/fx.js';
import { PALETTE } from '../data/palette.js';

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();


export class TakeoffCinematic {
  /** @param {import('./mission-session.js').MissionSession} session */
  constructor(session) {
    this.s = session;
    this.active = false;
    this.t = 0;
    this.hold = false; // 디버그 seek: 시간을 멈춘다
    this.simple = false; // 낮음 프리셋: 스케일 펄스·먼지·항적 생략
    this.state = newState();
    this.cam = { mode: 'rel', shot: '', px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 40 };
    this.start0 = new THREE.Vector3(); // 활주 시작점(렌더 좌표)
    this.shot = '';
    this.env = 0; // 와류 흔들림이 사라지는 중의 남은 세기
    this.dust = 0; this.ring = 0;
    this.blur = 0;
  }

  get ground() { return AIRBASE.height + GEAR_HEIGHT + 0.5; }

  start() {
    const s = this.s, p = s.player;
    this.active = true;
    this.t = 0; this.hold = false; this.env = 0; this.dust = 0; this.ring = 0; this.shot = '';
    this.start0.copy(p.flight.pos);
    this.start0.y = this.ground;
    p.manual = true;
    this._apply(0);
    p.prevPos.copy(p.flight.pos);
    p.prevQuat.copy(p.flight.quat);
  }

  /** 고정 스텝: 시간을 보내고 그 시각의 상태를 입힌다 */
  step(dt) {
    if (!this.active) return;
    if (!this.hold) this.t += dt;
    if (this.t >= CINE.duration) { this.finish(false); return; }
    this._apply(dt);
  }

  _apply(dt) {
    const s = this.s, p = s.player, f = p.flight, st = stateAt(this.t, this.state), v = p.visual;
    f.pos.set(this.start0.x, this.start0.y + st.agl, this.start0.z - st.dist);
    f.pitch = st.pitch * DEG; f.roll = 0; f.yaw = 0; f.speed = st.speed; f.throttle = st.power;
    f.pitchRate = 0; f.yawRate = 0;
    updateOrientation(f);
    p.velocity.copy(f.forward).multiplyScalar(st.speed);
    p.input.pitch = st.elevator; p.input.turn = st.aileron; // 조종면이 미세하게 움직인다
    v.gear = st.gear; v.flap = st.flap / CINE.flapMax; v.flapDirect = true;
    v.boost = st.boost; v.canopy = 0; v.airbrake = 0; v.surge = st.lean;
    s.gearTarget = st.gear > 0.5 ? 1 : 0;
    this.blur = st.blur;
    s.world.setDim(st.dim);
    // 샷이 바뀌면 시점을 바꾼다(조종석 샷만 1인칭)
    const cam = cameraAt(this.t, this.cam);
    if (cam.shot !== this.shot) {
      this.shot = cam.shot;
      const cockpit = cam.mode === 'cockpit';
      s.rig.setMode(cockpit ? VIEW.COCKPIT : VIEW.CHASE);
      s.rig.snap = true;
      p.setCockpitView(cockpit);
      if (cam.shot === 'pilot') { s.camera.near = 0.08; s.camera.updateProjectionMatrix(); } // 헬멧 0.6m 앞: 추적 카메라의 근접 절단면으로는 조종사가 잘려 나간다
    }
    const ck = p.cockpit;
    if (ck && ck.group) ck.group.scale.z = this.simple ? 1 : st.scaleZ;
    if (ck && ck.setPower) ck.setPower(st.mfd);
    if (this.simple || dt <= 0) return;
    // 지면 먼지(활주 중)와 항적 고리(통과 샷)
    if (st.agl < 3 && st.speed > 12) {
      this.dust -= dt;
      if (this.dust <= 0) { this.dust = CINE.dustEvery; _p.set(f.pos.x + (Math.random() - 0.5) * 3, this.start0.y - GEAR_HEIGHT + 0.4, f.pos.z + 6); s.fx.smoke(_p, FX.damageSmoke, PALETTE.fx.smokeA); }
    }
    if (this.shot === 'flyby') {
      this.ring -= dt;
      if (this.ring <= 0) { this.ring = CINE.ringEvery; _p.copy(f.pos).addScaledVector(f.forward, -9); s.fx.shockRing(_p, 5, 0.9); }
    }
  }

  /** 렌더 프레임: 카메라(rig.update 뒤에 부른다) */
  camera(frameDt) {
    if (!this.active) return;
    const s = this.s, cam = s.camera, c = this.cam, f = s.player.renderPos;
    if (c.mode === 'cockpit') {
      if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
      return;
    }
    if (c.mode === 'fixed') { _p.set(this.start0.x + c.px, this.start0.y + c.py, this.start0.z + c.pz); _l.set(this.start0.x + c.lx, this.start0.y + c.ly, this.start0.z + c.lz); } else { _p.set(f.x + c.px, f.y + c.py, f.z + c.pz); _l.set(f.x + c.lx, f.y + c.ly, f.z + c.lz); }
    if (_p.y < this.start0.y - GEAR_HEIGHT + 0.5) _p.y = this.start0.y - GEAR_HEIGHT + 0.5; // 땅 밑으로 내려가지 않게
    cam.position.copy(_p);
    cam.up.set(0, 1, 0);
    cam.lookAt(_l);
    if (c.mode === 'fixed') { // 와류 흔들림: 기체가 가까울 때만
      const dist = _p.distanceTo(f), w = CINE.wake;
      this.env = dist <= w.range ? 1 : Math.max(0, this.env - frameDt / w.fade);
      const k = wakeAmount(dist, this.env), t = this.t;
      if (k > 0) {
        cam.position.x += wakeNoise(t, 1.3) * w.pos * k; cam.position.y += wakeNoise(t, 2.9) * w.pos * k;
        cam.rotateX(wakeNoise(t, 4.1) * w.rot * DEG * k); cam.rotateZ(wakeNoise(t, 5.7) * w.rot * DEG * k);
      }
      this.shake = k;
    }
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  }

  /** 끝(완료·생략 공통): 마지막 프레임 상태에서 미션을 시작한다 */
  finish(skipped) {
    if (!this.active) return false;
    const s = this.s, p = s.player;
    this.t = CINE.duration; this.hold = false;
    this._apply(0);
    this.active = false;
    this.blur = 0; this.env = 0;
    const v = p.visual;
    v.gear = 0; v.flap = 0; v.flapDirect = false; v.surge = 0; v.boost = 0.35;
    if (p.cockpit && p.cockpit.group) p.cockpit.group.scale.z = 1;
    if (p.cockpit && p.cockpit.setPower) p.cockpit.setPower(1);
    s.world.setDim(1);
    s.takeoff.speed = CINE.endSpeed;
    p.prevPos.copy(p.flight.pos); p.prevQuat.copy(p.flight.quat);
    s._airStart(false);
    s._applyView(); // 사용자가 고른 시점으로
    if (!skipped && s.view === VIEW.CHASE) { // 고정 샷에서 추적 카메라로 부드럽게 넘어간다(리그의 감쇠 ≈ 0.5초)
      s.rig.pos.copy(s.camera.position); s.rig.quat.copy(s.camera.quaternion); s.rig.snap = false;
    }
    return true;
  }

  skip() { return this.finish(true); }

  /** 디버그: 임의 시점을 보여 주고 멈춘다 */
  seek(t) {
    if (!this.active) return false;
    this.t = Math.min(Math.max(t, 0), CINE.duration - 0.001);
    this.hold = true;
    this.shot = '';
    this._apply(0);
    this.s.player.prevPos.copy(this.s.player.flight.pos); this.s.player.prevQuat.copy(this.s.player.flight.quat);
    return true;
  }
}



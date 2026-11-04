// 세션 = 미션 한 번의 실행. 시설·플레이어·무기·적·미션을 만들고 매 프레임 갱신한다.
// 재시작은 세션을 버리고 새로 만든다(미션 처음부터).
import * as THREE from 'three';
import { bus } from './EventBus.js';
import { CollisionWorld } from '../physics/Collision.js';
import { build as buildFacility } from '../environments/FacilityBuilder.js';
import { PlayerController } from '../player/PlayerController.js';

export function hfovToV(hfovDeg, aspect) {
  return (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

export class Session {
  constructor(game, { difficulty = 'normal' } = {}) {
    this.game = game;
    this.cfg = game.cfg;
    this.difficulty = difficulty;
    this.diff = game.cfg.game.difficulties[difficulty];
    this.time = 0; // 미션 경과 시간 (일시정지 제외)
    this.paused = false;
    this.controlsEnabled = false;
    this.stats = { kills: 0, takedowns: 0, detections: 0, logsRead: 0 };
    this.disposers = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050607);
    this.scene.fog = new THREE.Fog(0x050607, 28, 70);
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, this.cfg.player.camera.near, this.cfg.player.camera.far);
    this.scene.add(this.camera);
    this.collision = new CollisionWorld();

    const gs = game.save.settings.graphics;
    this.facility = buildFacility(this.scene, this.cfg.map, {
      M: game.M, collision: this.collision, shadows: !!gs.shadows, shadowMapSize: game.preset.shadowMapSize,
    });

    this.player = new PlayerController(this.cfg.player, this.collision, this.camera);
    this.player.spawn(this.cfg.map.spawn.pos, this.cfg.map.spawn.yawDeg);
    this.fovBase = this.cfg.player.camera.fov;
    this.fovAim = this.cfg.player.camera.aimFov;
    this.aimT = 0;
    this.applySettings(game.save.settings);
    this.disposers.push(bus.on('resize', () => this.onResize()));
    this.onResize();
    this.zone = null;
  }

  applySettings(s) {
    const p = this.player;
    p.sensitivity = s.controls.sensitivity;
    p.aimSensMul = s.controls.aimSensitivity;
    p.invertY = s.controls.invertY;
    p.shake = s.display.shake;
    this.fovBase = s.display.fov;
    this.fovAim = Math.min(this.fovBase, this.cfg.player.camera.aimFov + (s.display.fov - 90) * 0.5);
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.updateFov();
  }
  updateFov() {
    const h = this.fovBase + (this.fovAim - this.fovBase) * this.aimT;
    this.camera.fov = hfovToV(h, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  get playerChars() { return [{ x: this.player.x, z: this.player.z }]; }

  update(dt) {
    if (this.paused) return;
    const input = this.game.input;
    this.time += dt;
    const p = this.player;
    p.frozen = !this.controlsEnabled;
    p.update(dt, input);
    this.facility.update(dt);
    // 구역 변경
    const z = this.facility.zoneAt(p.x, p.z);
    if (z && z !== this.zone) { this.zone = z; bus.emit('zone:changed', z); }
    // 문 (M1: 정면 문 F로 열기)
    if (this.controlsEnabled && input.wasPressed('interact')) this.tryInteract();
  }

  tryInteract() {
    const p = this.player;
    const dir = p.getForward(new THREE.Vector3());
    let best = null, bestD = this.cfg.game.interact.distance;
    for (const d of this.facility.doors) {
      const b = d.interactBox;
      const hit = rayBoxDist(p.eye, dir, b, bestD);
      if (hit !== null && hit < bestD) { bestD = hit; best = d; }
    }
    if (best) best.toggle(this.playerChars);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const off of this.disposers) off();
    this.facility.dispose();
  }
}

import { rayAABB } from '../physics/Raycast.js';
function rayBoxDist(o, d, b, max) {
  const h = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, b, max);
  return h ? h.t : null;
}

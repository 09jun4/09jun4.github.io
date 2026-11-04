// 세션 = 미션 한 번의 실행. 시설·플레이어·무기·적·미션을 만들고 매 프레임 갱신한다.
// 재시작은 세션을 버리고 새로 만든다(미션 처음부터).
import * as THREE from 'three';
import { bus } from './EventBus.js';
import { CollisionWorld } from '../physics/Collision.js';
import { build as buildFacility } from '../environments/FacilityBuilder.js';
import { PlayerController } from '../player/PlayerController.js';
import { FirstPersonRig } from '../player/FirstPersonRig.js';
import { Interaction } from '../player/Interaction.js';
import { Pistol } from '../weapons/Pistol.js';
import { WorldEffects } from '../weapons/Effects.js';
import { getEnvironment } from '../environments/EnvMap.js';
import { NavGraph } from '../ai/NavGraph.js';
import { Guard } from '../ai/EnemyAI.js';
import { createPlayerBodyModel } from '../characters/PlayerBodyModel.js';
import { pickTakedown } from '../animations/assassination/index.js';
import { MissionManager } from '../missions/MissionManager.js';

// 적 종류 레지스트리 (맵 JSON의 enemies[].type → 클래스, 설정 키)
export const ENEMY_TYPES = { guard: { cls: Guard, cfg: 'guard' } };
import { clamp, DEG } from '../utils/math.js';

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
    this.scene.environment = getEnvironment(game.renderer);
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, this.cfg.player.camera.near, this.cfg.player.camera.far);
    this.scene.add(this.camera);
    this.collision = new CollisionWorld();

    const gs = game.save.settings.graphics;
    this.facility = buildFacility(this.scene, this.cfg.map, {
      M: game.M, collision: this.collision, shadows: !!gs.shadows, shadowMapSize: game.preset.shadowMapSize,
    });

    this.player = new PlayerController(this.cfg.player, this.collision, this.camera);
    this.player.spawn(this.cfg.map.spawn.pos, this.cfg.map.spawn.yawDeg);

    // 무기 + 1인칭 리그
    this.weapon = new Pistol(this.cfg.pistol);
    this.rig = new FirstPersonRig(this.weapon, this.cfg.player);
    this.rig.scene.environment = this.scene.environment;
    this.rig.scene.environmentIntensity = 0.55;
    this.effects = new WorldEffects(this.scene);
    this.targets = []; // 사격 대상: { rayTest(o, d, max) → {t, part}, onHit(dmg, info) }
    this.hud = game.ui.hud;
    this.hud.reset();
    this.interaction = new Interaction(this);

    // 적
    this.nav = new NavGraph(this.facility, this.collision);
    this.enemies = [];
    for (const def of this.cfg.map.enemies || []) {
      const T = ENEMY_TYPES[def.type || 'guard'];
      if (!T) { console.warn('[Session] unknown enemy type', def.type); continue; }
      const e = new T.cls(def, this.cfg[T.cfg], this);
      this.enemies.push(e);
      this.targets.push(e);
    }
    this.combatCount = 0;

    // 암살: 플레이어 전신 모델 + 시네마틱 카메라
    this.body = createPlayerBodyModel();
    this.body.group = new THREE.Group();
    this.body.group.add(this.body.root);
    this.scene.add(this.body.group);
    this.cineCamera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 80);
    this.cinematic = null;
    this.interaction.add({
      find: () => {
        if (this.cinematic) return null;
        let best = null, bd = Infinity;
        for (const e of this.enemies) {
          if (!e.canTakedown(this.player)) continue;
          const d = Math.hypot(e.x - this.player.x, e.z - this.player.z);
          if (d < bd) { bd = d; best = e; }
        }
        return best ? { priority: 100, label: 'TAKEDOWN', action: () => this.startTakedown(best) } : null;
      },
    });
    this.disposers.push(bus.on('player:died', () => this.onPlayerDied()));
    this.disposers.push(bus.on('player:damaged', () => this.hud.damage()));

    // 상호작용 (문)
    this.interaction.add({
      find: (it) => {
        let best = null, bestD = this.cfg.game.interact.distance;
        for (const d of this.facility.doors) {
          const t = it.aimDistance(d.interactBox, bestD);
          if (t !== null && t < bestD) { bestD = t; best = d; }
        }
        if (!best) return null;
        return { priority: 40, label: best.locked ? 'LOCKED' : best.label, action: () => {
          if (best.toggle(this.allChars())) bus.emit('door:toggled', { door: best });
        } };
      },
    });
    this.fovBase = this.cfg.player.camera.fov;
    this.fovAim = this.cfg.player.camera.aimFov;
    this.aimT = 0;
    if (game.audio) game.audio.footsteps.zoneAt = this.facility.zoneAt;
    // 미션
    this.mission = new MissionManager(this, this.cfg.mission, this.cfg.logs);
    this.mission.start();
    this.applySettings(game.save.settings);
    this.disposers.push(bus.on('resize', () => this.onResize()));
    this.disposers.push(bus.on('zone:changed', (z) => {
      const L = z.lights && z.lights[0];
      if (L) this.rig.setTint(L.color);
    }));
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
    this.rig?.onResize();
  }
  updateFov() {
    const h = this.fovBase + (this.fovAim - this.fovBase) * this.aimT;
    this.camera.fov = hfovToV(h, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  // 문 닫힘 판정 등에 쓰는 캐릭터 위치 목록 (적은 M3에서 추가)
  allChars() {
    const out = [{ x: this.player.x, z: this.player.z }];
    for (const e of this.enemies) if (e.alive) out.push({ x: e.x, z: e.z });
    return out;
  }

  onDetected(guard) {
    this.stats.detections++;
    bus.emit('guard:detected', { guard });
  }

  onGuardDown(guard, kind) {
    if (kind === 'takedown') this.stats.takedowns++; else this.stats.kills++;
    bus.emit('guard:down', { guard, kind });
  }

  startTakedown(guard) {
    const seq = pickTakedown(this.cfg.guard.takedown.sequence);
    const ctx = {
      session: this, guard, body: this.body, player: this.player, camera: this.cineCamera,
      setFade: (v) => this.game.ui.setFade(v),
    };
    this.cinematic = { seq, ctx, t: 0 };
    this.player.health.invulnerable = true;
    this.weapon.cancelReload();
    guard.inCinematic = true;
    guard.anim.override = () => {};
    guard.icon.set(null);
    this.cineCamera.aspect = innerWidth / innerHeight;
    this.hud.cinematic(true);
    this.hud.setPrompt(null);
    seq.start(ctx);
    bus.emit('takedown:start', { guard });
  }

  updateCinematic(dt) {
    const c = this.cinematic;
    c.t += dt;
    c.seq.update(c.ctx, Math.min(c.t, c.seq.duration), dt);
    if (c.t < c.seq.duration) return;
    c.seq.end(c.ctx);
    const g = c.ctx.guard;
    g.inCinematic = false;
    g.kill('takedown', -1);
    g.anim.death = 0.999; // 연출이 끝난 자세에서 바로 쓰러진 상태로
    this.cinematic = null;
    this.player.health.invulnerable = false;
    this.hud.cinematic(false);
    bus.emit('takedown:end', { guard: g });
    // 연출 중 다른 적에게 보였다면 이제 발견 상태로
    for (const e of this.enemies) {
      if (e.alive && e.pendingDetect) { e.pendingDetect = false; e.knowPlayer(); if (!e.aware) e.setState('alert'); }
      e.pendingDetect = false;
    }
  }

  onPlayerDied() {
    if (this.ended) return;
    this.ended = true;
    this.controlsEnabled = false;
    bus.emit('mission:failed', { reason: 'killed' });
  }

  update(dt) {
    if (this.paused) return;
    const input = this.game.input;
    this.time += dt;
    const p = this.player;
    const w = this.weapon;
    p.frozen = !this.controlsEnabled || this.cinematic;

    // 조준(ADS)
    const aiming = !p.frozen && input.isDown('aim') && !w.reloading && !p.sprinting;
    p.aiming = aiming;
    const at = this.cfg.player.camera.aimTransition;
    this.aimT = clamp(this.aimT + (aiming ? dt : -dt) / at, 0, 1);
    this.updateFov();

    p.update(dt, input);
    this.facility.update(dt);
    if (this.cinematic) this.updateCinematic(dt);
    this.mission.update(dt);

    // 적
    let combat = 0;
    for (const e of this.enemies) {
      e.update(dt);
      if (e.alive && (e.stateName === 'combat' || e.stateName === 'alert')) combat++;
      // 플레이어가 적을 통과하지 못하게
      if (e.alive) {
        const dx = p.pos.x - e.x, dz = p.pos.z - e.z, d = Math.hypot(dx, dz), min = e.cfg.radius + p.radius;
        if (d < min && d > 1e-4) { p.pos.x = e.x + (dx / d) * min; p.pos.z = e.z + (dz / d) * min; }
      }
    }
    if (combat !== this.combatCount) { this.combatCount = combat; bus.emit('combat:count', combat); }

    // 사격·재장전
    w.update(dt);
    if (!p.frozen) {
      if (input.wasPressed('reload')) w.startReload();
      if (w.wantsFire(input) && !p.sprinting) w.tryFire(this);
    }
    this.rig.update(dt, p, this.aimT);
    this.effects.update(dt);

    // 구역 변경
    const z = this.facility.zoneAt(p.x, p.z);
    if (z && z !== this.zone) { this.zone = z; bus.emit('zone:changed', z); }

    // 상호작용
    const cand = p.frozen ? null : this.interaction.update();
    this.hud.setPrompt(cand ? cand.label : null);
    if (cand && input.wasPressed('interact')) this.interaction.trigger();

    this.updateHud(dt);
    if (this.game.audio) this.game.audio.setListener(p.x, p.z, p.yaw);
  }

  // 탄 판정: 즉시 레이캐스트 + 시각용 섬광·궤적
  shoot(weapon) {
    const c = weapon.cfg, p = this.player;
    const spreadDeg = (this.aimT > 0.8 ? c.aimSpreadDeg : c.spreadDeg) + c.moveSpreadDeg * p.speedNorm * (1 - this.aimT * 0.7) + (p.onGround ? 0 : 1.5);
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    if (spreadDeg > 0) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spreadDeg * DEG;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      dir.addScaledVector(up, Math.sin(a) * r).addScaledVector(right, Math.cos(a) * r).normalize();
    }
    const o = p.eye;
    const range = c.range;
    const wall = this.collision.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, range, 'bullet');
    let best = null, bestT = wall ? wall.dist : range;
    for (const tg of this.targets) {
      const h = tg.rayTest(o, dir, bestT);
      if (h && h.t < bestT) { bestT = h.t; best = { target: tg, ...h }; }
    }
    const end = new THREE.Vector3().copy(o).addScaledVector(dir, bestT);
    const muzzle = this.rig.muzzleWorld(this.camera);
    this.effects.tracer(muzzle, end, c.tracer.speed, c.tracer.length);
    this.effects.muzzleFlash(muzzle, c.muzzleFlash.lightIntensity);
    this.rig.fire(weapon.ammo === 0);
    p.addRecoil(c.recoil.pitchDeg * DEG * (1 - this.aimT * 0.35), (Math.random() - 0.5) * 2 * c.recoil.yawDeg * DEG);
    if (best) {
      const dmg = c.damage * (best.part === 'head' ? c.headshotMultiplier : 1);
      const res = best.target.onHit(dmg, { part: best.part, point: end, dir, from: o });
      this.effects.impact(end, null, { decal: false, spark: true });
      this.hud.hitMarker(res && res.killed);
      bus.emit('shot:hit', { target: best.target, killed: res && res.killed, part: best.part });
    } else if (wall) {
      this.effects.impact(end, new THREE.Vector3(wall.nx, wall.ny, wall.nz));
      bus.emit('shot:impact', { point: end, material: wall.box ? wall.box.material : 'concrete' });
    }
  }

  updateHud() {
    const p = this.player, w = this.weapon, h = this.hud;
    h.setHealth(p.health.hp, p.health.max);
    h.setAmmo(w.ammo, w.reserve, w.magSize, w.reloading);
    const spread = 6 + p.speedNorm * 14 + (p.onGround ? 0 : 10) + (w.lastShotT < 0.12 ? 6 : 0);
    h.setCrosshair(spread, this.aimT > 0.6, p.sprinting || w.reloading || !!this.cinematic);
    h.setFps(this.game.loop.fps, this.game.save.settings.graphics.showFps);
  }

  render(renderer) {
    renderer.render(this.scene, this.cinematic ? this.cineCamera : this.camera);
    if (!this.cinematic) this.rig.render(renderer);
  }

  dispose() {
    for (const off of this.disposers) off();
    this.mission.dispose();
    for (const e of this.enemies) e.dispose();
    this.body.dispose();
    this.rig.dispose();
    this.effects.dispose();
    this.facility.dispose();
  }
}

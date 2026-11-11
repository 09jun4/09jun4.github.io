// 미션 1회 진행(세션): 플레이어·적기·무장·효과를 묶어 고정 스텝으로 돌리고, 렌더 프레임에 보간한다.
// 메뉴 배경(쇼케이스)도 같은 세션이 맡는다: 기체가 구름 사이를 수평 비행하고 카메라가 주위를 돈다.
// 모든 개체는 생성자에서 한 번만 만들고 미션마다 상태만 초기화한다(메모리 누수 없음).
import * as THREE from 'three';
import { clamp, makeRng } from './math.js';
import { debugState } from './debug.js';
import { computeScore, gradeFor } from './scoring.js';
import { VIEW } from '../flight/camera-rig.js';
import { EnemyPool } from '../entities/enemy.js';
import { setEnemyOutlinePixels } from '../entities/enemy-model.js';
import { Effects } from '../entities/effects.js';
import { KF21_POINTS } from '../entities/kf21-model.js';
import { WeaponSystem } from '../combat/weapon-system.js';
import '../combat/gun.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMIES, DEFAULT_ENEMY, ENEMY_POOL_SIZE } from '../data/enemies.js';
import { MISSION_FLOW, missionEnemyCount } from '../data/missions.js';
import { CAMERA } from '../data/camera.js';
import { FX } from '../data/fx.js';
import { HUD_FEEDBACK } from '../data/hud.js';

const _v = new THREE.Vector3();
const _shift = { x: 0, z: 0 };

export const PHASE = { ACTIVE: 'active', ENDING: 'ending', DONE: 'done' };

export class MissionSession {
  constructor({ scene, camera, world, rig, input, settings, audio, player, loadout }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.rig = rig;
    this.input = input;
    this.settings = settings;
    this.audio = audio;
    this.player = player;

    this.mode = 'showcase';
    this.phase = PHASE.DONE;
    this.mission = null;
    this.total = 0;
    this.view = settings.get('view') === VIEW.COCKPIT ? VIEW.COCKPIT : VIEW.CHASE;
    this.viewport = { w: window.innerWidth, h: window.innerHeight };
    this.onFinished = null;
    this.endTimer = 0;
    this.success = false;
    this.rng = makeRng(1);

    this.stats = { kills: 0, gunShots: 0, gunHits: 0, missilesFired: 0, hitsTaken: 0, time: 0, clearTime: 0, weaponsUsed: [] };
    // HUD가 읽는 순간 연출 값(초 단위 타이머 / 0~1 세기)
    this.feedback = { hit: 0, hitWarn: 0, kill: 0, wave: 0, switched: 0 };
    this.cursor = { x: this.viewport.w / 2, y: this.viewport.h / 2 };
    this.aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };

    this.fx = new Effects(scene, FX);
    player.model.group.add(this.fx.muzzle);
    this.fx.muzzle.position.copy(KF21_POINTS.muzzle);
    this.fx.muzzle.position.z -= 0.6;

    this.enemyCfg = ENEMIES[DEFAULT_ENEMY];
    this.enemies = new EnemyPool(scene, this.enemyCfg, ENEMY_POOL_SIZE);
    this.weapons = new WeaponSystem(loadout, WEAPONS);

    const self = this;
    this.ctx = {
      player,
      enemies: this.enemies.list,
      fx: this.fx,
      rig,
      audio,
      stats: this.stats,
      aim: this.aim,
      camera,
      shake: CAMERA.shake,
      playerExplosionScale: FX.playerExplosion.scale,
      random: () => self.rng(),
      muzzleWorld(out) {
        return out.copy(KF21_POINTS.muzzle).applyQuaternion(player.flight.quat).add(player.flight.pos);
      },
      markWeaponUsed(id) {
        if (!self.stats.weaponsUsed.includes(id)) self.stats.weaponsUsed.push(id);
      },
      onEnemyHit(enemy, source) { self._onEnemyHit(enemy, source); },
      onEnemyKilled(enemy, source) { self._onEnemyKilled(enemy, source); },
      onPlayerHit(amount, kind) { self._onPlayerHit(amount, kind); },
      onPlayerKilled() { self._onPlayerKilled(); },
    };
    this.resize(this.viewport.w, this.viewport.h);
  }

  // ── 시작 ────────────────────────────────────────────────────────────────
  _resetWorld() {
    this.enemies.clear();
    this.fx.clear();
    this.weapons.reset();
    this.world.resetOrigin();
    const s = this.stats;
    s.kills = 0; s.gunShots = 0; s.gunHits = 0; s.missilesFired = 0; s.hitsTaken = 0; s.time = 0; s.clearTime = 0;
    s.weaponsUsed.length = 0;
    const f = this.feedback;
    f.hit = 0; f.hitWarn = 0; f.kill = 0; f.wave = 0; f.switched = 0;
    this.endTimer = 0;
    this.success = false;
  }

  /** 메뉴 배경: 수평 비행 + 회전 카메라 */
  startShowcase() {
    this.mode = 'showcase';
    this.phase = PHASE.DONE;
    this.mission = null;
    this._resetWorld();
    this.player.reset({ y: this.player.cfg.altitude.showcase });
    this._applyView();
  }

  /** @param {object} mission data/missions.js 의 미션 */
  startMission(mission, seed = (Date.now() & 0xffffff) + 1) {
    this.mode = 'mission';
    this.phase = PHASE.ACTIVE;
    this.mission = mission;
    this.total = missionEnemyCount(mission);
    this.rng = makeRng(seed);
    this._resetWorld();
    this.player.reset({ yaw: 0 });
    this._applyView();
    this._onMissionStart();
  }

  _onMissionStart() { /* 편대 스포너·AI 초기화(마일스톤 5) */ }

  _applyView() {
    const mode = this.mode === 'mission' ? this.view : VIEW.ORBIT;
    this.rig.setMode(mode);
    this.rig.snap = true;
    this.player.setCockpitView(mode === VIEW.COCKPIT && this.player.alive);
    this._updateOutline();
  }

  toggleView() {
    if (this.mode !== 'mission') return;
    this.view = this.view === VIEW.CHASE ? VIEW.COCKPIT : VIEW.CHASE;
    this.settings.set('view', this.view);
    this._applyView();
  }

  switchWeapon() {
    if (this.mode !== 'mission' || this.phase !== PHASE.ACTIVE) return;
    this.weapons.next(this.ctx);
    this.feedback.switched = HUD_FEEDBACK.switchFlash;
  }

  resize(w, h) {
    this.viewport.w = w;
    this.viewport.h = h;
    this._updateOutline();
  }

  _updateOutline() {
    setEnemyOutlinePixels(this.enemyCfg.outlinePixels, this.camera.fov, this.viewport.h);
  }

  // ── 이벤트 ──────────────────────────────────────────────────────────────
  _onEnemyHit(enemy, source) { void enemy; void source; }

  _onEnemyKilled() {
    this.stats.kills++;
    this.feedback.kill = HUD_FEEDBACK.killNotice;
    this._checkCleared();
  }

  _checkCleared() {
    if (this.phase !== PHASE.ACTIVE) return;
    if (this.stats.kills >= this.total && this.enemies.aliveCount === 0 && this._allSpawned()) {
      this.phase = PHASE.ENDING;
      this.success = true;
      this.stats.clearTime = this.stats.time;
      this.endTimer = MISSION_FLOW.clearDelay;
      this.audio.play('mission_clear');
    }
  }

  _allSpawned() { return true; }

  _onPlayerHit() {
    this.stats.hitsTaken++;
    this.feedback.hit = 1;
    this.feedback.hitWarn = HUD_FEEDBACK.hitWarn;
  }

  _onPlayerKilled() {
    this.player.model.group.visible = false;
    if (this.phase !== PHASE.ACTIVE) return;
    this.phase = PHASE.ENDING;
    this.success = false;
    this.stats.clearTime = this.stats.time;
    this.endTimer = MISSION_FLOW.failDelay;
    this.audio.play('mission_fail');
  }

  /** 미션 결과(결과 화면·저장·랭킹이 사용) */
  result() {
    const s = this.stats;
    const score = computeScore(this.mission, s.kills, s.clearTime, this.success);
    return {
      missionId: this.mission.id,
      success: this.success,
      kills: s.kills,
      total: this.total,
      gunHits: s.gunHits,
      gunShots: s.gunShots,
      missilesFired: s.missilesFired,
      hitsTaken: s.hitsTaken,
      time: s.clearTime,
      weaponsUsed: s.weaponsUsed.slice(),
      score,
      grade: gradeFor(this.mission, score, this.success),
    };
  }

  _finish() {
    this.phase = PHASE.DONE;
    if (this.onFinished) this.onFinished(this.result());
  }

  // ── 조준 ────────────────────────────────────────────────────────────────
  /** 조준 커서(화면 좌표). 마우스 감도는 화면 중앙 기준 배율로 적용한다. */
  updateCursor() {
    const { w, h } = this.viewport;
    const k = this.settings.get('mouseSensitivity');
    this.cursor.x = clamp(w / 2 + (this.input.mouse.x - w / 2) * k, 0, w);
    this.cursor.y = clamp(h / 2 + (this.input.mouse.y - h / 2) * k, 0, h);
  }

  _updateAim() {
    this.updateCursor();
    const { w, h } = this.viewport;
    _v.set((this.cursor.x / w) * 2 - 1, -((this.cursor.y / h) * 2 - 1), 0.5).unproject(this.camera);
    this.aim.origin.copy(this.camera.position);
    this.aim.dir.copy(_v).sub(this.camera.position).normalize();
  }

  // ── 고정 스텝 ───────────────────────────────────────────────────────────
  step(dt) {
    const player = this.player;
    const mission = this.mode === 'mission';
    const controllable = mission && player.alive && this.phase !== PHASE.DONE;
    if (controllable) {
      const o = this.inputOverride;
      player.input.pitch = o ? o.pitch : this.input.axis('KeyW', 'KeyS');
      player.input.turn = o ? o.turn : this.input.axis('KeyA', 'KeyD');
    } else {
      player.input.pitch = 0;
      player.input.turn = 0;
    }
    player.step(dt);

    if (mission) {
      const active = this.phase === PHASE.ACTIVE;
      this._updateAim();
      const trigger = active && player.alive && (this.triggerOverride ?? this.input.mouse.down);
      this.weapons.update(dt, this.ctx, trigger);
      this._stepEnemies(dt);
      if (active) {
        this.stats.time += dt;
        this._stepMission(dt);
      } else if (this.phase === PHASE.ENDING) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this._finish();
      }
      const f = this.feedback;
      if (f.hitWarn > 0) f.hitWarn -= dt;
      if (f.kill > 0) f.kill -= dt;
      if (f.wave > 0) f.wave -= dt;
      if (f.switched > 0) f.switched -= dt;
    }

    if (this.world.rebaseShift(player.flight.pos, _shift)) this._shiftAll(_shift.x, _shift.z);
  }

  _stepEnemies(dt) {
    const frozen = debugState.freezeEnemies;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      e.step(dt, frozen);
    }
  }

  _stepMission() { /* 편대 등장·충돌(마일스톤 5) */ }

  _shiftAll(dx, dz) {
    this.player.shift(dx, dz);
    this.rig.shift(dx, dz);
    this.fx.shift(dx, dz);
    for (const e of this.enemies.list) e.shift(dx, dz);
  }

  // ── 렌더 프레임 ─────────────────────────────────────────────────────────
  render(alpha, frameDt) {
    const player = this.player;
    player.interpolate(alpha);
    player.animate(frameDt);
    for (const e of this.enemies.list) if (e.alive) e.interpolate(alpha);
    this.rig.update(player.view, frameDt);
    this.world.update(this.camera);
    this.updateCursor();
    this.fx.update(frameDt, WEAPONS.gun.tracer);
    this._renderProjectiles(alpha);
    this.fx.endBolts();
    if (this.feedback.hit > 0) this.feedback.hit = Math.max(0, this.feedback.hit - frameDt * HUD_FEEDBACK.hitFade);
  }

  _renderProjectiles() { /* 적 탄·미사일(마일스톤 5·6) */ }

  // ── 디버그 ──────────────────────────────────────────────────────────────
  /** 플레이어 앞에 적기를 즉시 만든다. */
  debugSpawn(n = 1, { distance = 420, spread = 90, facing = 'away' } = {}) {
    if (this.mode !== 'mission') return 0;
    const f = this.player.flight;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const side = (i - (n - 1) / 2) * spread;
      _v.set(side, 12 + (i % 2) * 14, -distance).applyAxisAngle(THREE.Object3D.DEFAULT_UP, f.yaw).add(f.pos);
      const e = this.enemies.spawn(_v.x, _v.y, _v.z, facing === 'toward' ? f.yaw + Math.PI : f.yaw);
      if (e) { made++; this.total = Math.max(this.total, this.stats.kills + this.enemies.aliveCount); }
    }
    return made;
  }

  /** 미션을 즉시 끝낸다. */
  debugSkip(success = true) {
    if (this.mode !== 'mission' || this.phase !== PHASE.ACTIVE) return false;
    if (success) {
      for (const e of this.enemies.list) if (e.alive) e.despawn();
      this.stats.kills = this.total;
      this._debugSkipped = true;
      this.phase = PHASE.ENDING;
      this.success = true;
      this.stats.clearTime = this.stats.time;
      this.endTimer = 0.05;
    } else {
      this.player.alive = false;
      this._onPlayerKilled();
      this.endTimer = 0.05;
    }
    return true;
  }
}

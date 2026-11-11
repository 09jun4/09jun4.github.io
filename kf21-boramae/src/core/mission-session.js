// 미션 1회 진행(세션): 플레이어·적기·무장·효과를 묶어 고정 스텝으로 돌리고, 렌더 프레임에 보간한다.
// 메뉴 배경(쇼케이스)도 같은 세션이 맡는다: 기체가 구름 사이를 수평 비행하고 카메라가 주위를 돈다.
// 모든 개체는 생성자에서 한 번만 만들고 미션마다 상태만 초기화한다(메모리 누수 없음).
import * as THREE from 'three';
import { clamp, clamp01, makeRng, moveToward, DEG } from './math.js';
import { updateOrientation } from '../flight/flight-model.js';
import { TAKEOFF, AIRBASE } from '../data/takeoff.js';
import { GEAR_HEIGHT } from '../entities/gear.js';
import { debugState } from './debug.js';
import { computeScore, gradeFor } from './scoring.js';
import { VIEW } from '../flight/camera-rig.js';
import { EnemyPool } from '../entities/enemy.js';
import { setEnemyOutlinePixels } from '../entities/enemy-model.js';
import { Effects } from '../entities/effects.js';
import { KF21_POINTS } from '../entities/kf21-model.js';
import { WeaponSystem } from '../combat/weapon-system.js';
import '../combat/gun.js';
import '../combat/missile.js';
import { Projectiles } from '../combat/projectiles.js';
import { damageEnemy, damagePlayer } from '../combat/damage.js';
import { EnemyDirector } from '../ai/enemy-ai.js';
import { WaveSpawner } from '../ai/wave-spawner.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMIES, DEFAULT_ENEMY, ENEMY_POOL_SIZE, ENEMY_BULLET_POOL } from '../data/enemies.js';
import { MISSION_FLOW, SPAWN, missionEnemyCount } from '../data/missions.js';
import { PALETTE } from '../data/palette.js';
import { CAMERA } from '../data/camera.js';
import { FX } from '../data/fx.js';
import { HUD_FEEDBACK } from '../data/hud.js';

const _v = new THREE.Vector3();
const _shift = { x: 0, z: 0 };
const _q = new THREE.Quaternion();

export const PHASE = { TAKEOFF: 'takeoff', ACTIVE: 'active', ENDING: 'ending', DONE: 'done' };

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
    this.aimLocal = new THREE.Vector3(0, 0, -1); // 기체 기준 조준 방향(둘러보는 동안 고정)
    this.looking = false; // C키 둘러보기 중
    // 조종석 MFD에 보일 값
    this.mfd = { speed: 0, alt: 0, yaw: 0, pitch: 0, roll: 0, g: 1, px: 0, pz: 0, contacts: new Float32Array(ENEMY_POOL_SIZE * 2), contactCount: 0, ammo: 0, heat: 0, hp: 1, weapon: '' };
    player.cockpitData.data = this.mfd;

    this.fx = new Effects(scene, FX);
    player.root.add(this.fx.muzzle);
    this.fx.muzzle.position.copy(KF21_POINTS.muzzle);
    this.fx.muzzle.position.z -= 0.6;

    this.enemyCfg = ENEMIES[DEFAULT_ENEMY];
    this.enemies = new EnemyPool(scene, this.enemyCfg, ENEMY_POOL_SIZE);
    this.weapons = new WeaponSystem(loadout, WEAPONS);
    this.projectiles = new Projectiles(ENEMY_BULLET_POOL, this.enemyCfg.weapon.tracer);
    this.director = new EnemyDirector(this.enemies.list);
    this.spawner = new WaveSpawner(SPAWN);
    this.collisionCooldown = 0;
    // 이륙 연출 상태. state: 'roll' 활주 → 'rotate' 기수 들기 대기 → 'climb' 상승
    this.takeoff = { state: 'roll', speed: 0, pitch: 0, wait: 0, assisted: false, time: 0 };
    this.simpleTakeoff = false; // 낮음 프리셋: 막 떠오른 순간부터 시작
    this.gearTarget = 0;
    this._spawnArgs = {
      aliveCount: 0, time: 0, flight: player.flight, limits: this.enemyCfg.flight,
      spawn: (x, y, z, yaw, slot) => {
        const e = this.enemies.spawn(x, y, z, yaw);
        if (e) this.director.onSpawn(e, slot);
        return !!e;
      },
    };

    const self = this;
    this.ctx = {
      player,
      enemies: this.enemies.list,
      scene,
      fx: this.fx,
      projectiles: this.projectiles,
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
    this.weapons.init(this.ctx);
    this.resize(this.viewport.w, this.viewport.h);
  }

  // ── 시작 ────────────────────────────────────────────────────────────────
  _resetWorld() {
    this.enemies.clear();
    this.projectiles.clear();
    this.collisionCooldown = 0;
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
    this.gearTarget = 0;
    this.player.visual.gear = 0;
    this.player.visual.canopy = 0;
    this.player.visual.airbrake = 0;
    this.player.visual.boost = 0;
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
    const ground = AIRBASE.height + GEAR_HEIGHT + 0.5;
    this.player.reset({ yaw: 0, y: ground });
    this._onMissionStart();
    if (this.settings.get('skipTakeoff')) {
      this._airStart();
    } else {
      // 활주로에서 시작(낮음은 막 떠오른 순간부터)
      const tk = this.takeoff;
      const f = this.player.flight;
      this.phase = PHASE.TAKEOFF;
      this.player.manual = true;
      tk.time = 0; tk.wait = 0; tk.assisted = false;
      if (this.simpleTakeoff) { tk.state = 'climb'; tk.speed = TAKEOFF.low.speed; tk.pitch = TAKEOFF.climbPitch * 0.5 * DEG; f.pos.y = ground + TAKEOFF.low.startAgl; } else { tk.state = 'roll'; tk.speed = 0; tk.pitch = 0; }
      f.speed = tk.speed; f.pitch = tk.pitch; f.throttle = 1;
      updateOrientation(f);
      this.player.prevPos.copy(f.pos);
      this.player.prevQuat.copy(f.quat);
      this.gearTarget = 1;
      this.player.visual.gear = 1;
    }
    this._applyView();
  }

  /** 이륙 완료(또는 건너뛰기): 공중, 기어 접힘 상태로 미션을 시작한다. 미션 시간은 여기서부터 잰다. */
  _airStart(skipped = true) {
    const f = this.player.flight;
    const ground = AIRBASE.height + GEAR_HEIGHT;
    if (skipped) {
      f.pos.y = ground + TAKEOFF.finishAgl;
      f.pitch = TAKEOFF.climbPitch * 0.6 * DEG;
      this.player.visual.gear = 0;
      this.rig.snap = true;
    }
    f.speed = Math.max(this.takeoff.speed, TAKEOFF.handoffSpeed);
    f.pitchRate = 0;
    f.yawRate = 0;
    f.floor = Math.min(this.player.cfg.altitude.floorHard, f.pos.y - TAKEOFF.floorMargin);
    updateOrientation(f);
    if (skipped) { this.player.prevPos.copy(f.pos); this.player.prevQuat.copy(f.quat); }
    this.player.manual = false;
    this.gearTarget = 0;
    this.phase = PHASE.ACTIVE;
    this.stats.time = 0;
  }

  /** Enter/Space: 이륙 연출 건너뛰기 */
  skipTakeoff() {
    if (this.mode !== 'mission' || this.phase !== PHASE.TAKEOFF) return false;
    this._airStart(true);
    return true;
  }

  _stepTakeoff(dt) {
    const T = TAKEOFF;
    const tk = this.takeoff;
    const f = this.player.flight;
    const ground = AIRBASE.height + GEAR_HEIGHT;
    tk.time += dt;
    if (tk.state === 'roll') {
      tk.speed += T.accel * dt;
      if (tk.speed >= T.rotateSpeed) { tk.state = 'rotate'; tk.wait = 0; }
    } else if (tk.state === 'rotate') {
      tk.speed += T.accel * 0.45 * dt;
      tk.wait += dt;
      // W 또는 S로 기수를 든다. 누르지 않아도 잠시 뒤 자동으로 든다(이륙 실패 없음)
      const pressed = this.inputOverride ? this.inputOverride.pitch !== 0 : (this.input.isDown('KeyW') || this.input.isDown('KeyS'));
      if (pressed || tk.wait >= T.assistDelay) { tk.assisted = !pressed; tk.state = 'climb'; }
    } else {
      tk.pitch = moveToward(tk.pitch, T.climbPitch * DEG, T.pitchRate * DEG * dt);
      tk.speed = Math.min(T.climbSpeed, tk.speed + T.liftAccel * dt);
    }
    f.speed = tk.speed;
    f.pitch = tk.pitch;
    f.roll = 0;
    f.throttle = 1;
    updateOrientation(f);
    f.pos.addScaledVector(f.forward, tk.speed * dt);
    if (f.pos.y < ground) f.pos.y = ground;
    this.player.velocity.copy(f.forward).multiplyScalar(tk.speed);
    const agl = f.pos.y - ground;
    if (agl > T.gearUpAgl) this.gearTarget = 0;
    if (agl >= T.finishAgl) this._airStart(false);
  }

  /** 모델 연출 값(기어·플랩·에어브레이크·애프터버너)을 비행 상태에서 정한다. */
  _stepVisual(dt) {
    const v = this.player.visual;
    const f = this.player.flight;
    const cfg = this.player.cfg;
    v.gear = moveToward(v.gear, this.gearTarget, dt / TAKEOFF.gearTime);
    v.flap = v.gear > 0.5 ? 1 : 0;
    if (this.mode !== 'mission') return;
    const taking = this.phase === PHASE.TAKEOFF;
    // 에어브레이크: 순항보다 많이 빠를 때(급강하) 펼친다
    v.airbrake = taking ? 0 : clamp01((f.speed - cfg.speed.cruise - cfg.model.hi.brakeFrom) / cfg.model.hi.brakeRange);
    // 애프터버너: 이륙, 급선회, 피격 직후(회피), 가파른 상승에서 크게 점화
    const turn = Math.abs(f.yawRate) / (cfg.rates.yawMax * DEG);
    const want = taking ? 1 : Math.max(turn > 0.8 ? 1 : 0, this.feedback.hitWarn > 0 ? 1 : 0, f.pitch > 0.35 ? 0.8 : 0, clamp01((f.throttle - 0.72) * 3));
    v.boost = moveToward(v.boost, this.player.alive ? want : 0, dt * (want > v.boost ? 4 : 1.2));
  }

  _onMissionStart() {
    this.director.reset(this.mission.maxAttackers, this.rng);
    this.spawner.reset(this.mission, this.rng);
  }

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
  _onEnemyHit(enemy, source) {
    if (source !== 'collision') this.director.onHit(enemy);
  }

  _onEnemyKilled() {
    this.stats.kills++;
    this.feedback.kill = HUD_FEEDBACK.killNotice;
    this._checkCleared();
  }

  _checkCleared() {
    if (this.phase !== PHASE.ACTIVE || !this.player.alive) return;
    if (this.stats.kills >= this.total && this.enemies.aliveCount === 0 && this._allSpawned()) {
      this.phase = PHASE.ENDING;
      this.success = true;
      this.stats.clearTime = this.stats.time;
      this.endTimer = MISSION_FLOW.clearDelay;
      this.audio.play('mission_clear');
    }
  }

  _allSpawned() {
    return this.spawner.allSpawned;
  }

  _onPlayerHit() {
    this.stats.hitsTaken++;
    this.feedback.hit = 1;
    this.feedback.hitWarn = HUD_FEEDBACK.hitWarn;
  }

  _onPlayerKilled() {
    this.player.root.visible = false;
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
    const { w, h } = this.viewport;
    this.aim.origin.copy(this.camera.position);
    if (this.looking) {
      // 둘러보는 동안에는 조준을 멈춘다: 기체 기준 방향을 그대로 유지하고, 조준점 표시는 그 방향을 화면에 투영한다
      this.aim.dir.copy(this.aimLocal).applyQuaternion(this.player.flight.quat);
      _v.copy(this.aim.origin).addScaledVector(this.aim.dir, 1000).project(this.camera);
      this.cursor.x = _v.z < 1 ? (_v.x * 0.5 + 0.5) * w : -9999;
      this.cursor.y = (-_v.y * 0.5 + 0.5) * h;
      return;
    }
    this.updateCursor();
    _v.set((this.cursor.x / w) * 2 - 1, -((this.cursor.y / h) * 2 - 1), 0.5).unproject(this.camera);
    this.aim.dir.copy(_v).sub(this.camera.position).normalize();
    this.aimLocal.copy(this.aim.dir).applyQuaternion(_q.copy(this.player.flight.quat).invert());
  }

  /** C키 둘러보기(1인칭): 누른 채 마우스로 시선을 돌린다 */
  _updateLook() {
    const want = this.mode === 'mission' && this.view === VIEW.COCKPIT && this.player.alive && this.input.isDown('KeyC');
    const lk = this.rig.look;
    if (want) {
      const c = CAMERA.cockpit.look;
      const { w, h } = this.viewport;
      const nx = clamp((this.input.mouse.x / w) * 2 - 1, -1, 1), ny = clamp((this.input.mouse.y / h) * 2 - 1, -1, 1);
      lk.yaw = -nx * c.yawMax * (Math.PI / 180);
      lk.pitch = (ny < 0 ? -ny * c.pitchUp : -ny * c.pitchDown) * (Math.PI / 180);
    }
    lk.active = want;
    this.looking = want;
  }

  _updateMfd() {
    const d = this.mfd;
    const f = this.player.flight;
    d.speed = f.speed; d.alt = f.pos.y; d.yaw = f.yaw; d.pitch = f.pitch; d.roll = f.roll;
    d.g = 1 + (Math.abs(f.yawRate) + Math.max(0, f.pitchRate)) * f.speed / 9.81 * 0.55; // 표시용 근사값
    d.px = f.pos.x + this.world.origin.x; d.pz = f.pos.z + this.world.origin.z;
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
    let n = 0;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - f.pos.x, dz = e.pos.z - f.pos.z;
      d.contacts[n * 2] = dx * cy - dz * sy; // 기수 기준 오른쪽
      d.contacts[n * 2 + 1] = dx * sy + dz * cy; // 기수 기준 뒤쪽(+) / 앞쪽(-)
      n++;
    }
    d.contactCount = n;
    const gun = this.weapons.byId('gun'), msl = this.weapons.byId('missile');
    d.heat = gun ? gun.heat : 0;
    d.ammo = msl ? msl.ammo : 0;
    d.hp = this.player.hp / this.player.cfg.hp;
    d.weapon = this.weapons.current.cfg.short;
    this.player.visual.ammo = d.ammo;
  }

  // ── 고정 스텝 ───────────────────────────────────────────────────────────
  step(dt) {
    const player = this.player;
    const mission = this.mode === 'mission';
    const controllable = mission && player.alive && this.phase !== PHASE.DONE && this.phase !== PHASE.TAKEOFF;
    if (controllable) {
      const o = this.inputOverride;
      player.input.pitch = o ? o.pitch : this.input.axis('KeyW', 'KeyS');
      player.input.turn = o ? o.turn : this.input.axis('KeyA', 'KeyD');
    } else {
      player.input.pitch = 0;
      player.input.turn = 0;
    }
    player.step(dt);
    if (mission && this.phase === PHASE.TAKEOFF) this._stepTakeoff(dt);
    this._stepVisual(dt);

    if (mission) {
      const active = this.phase === PHASE.ACTIVE;
      this._updateAim();
      const trigger = active && player.alive && !this.looking && (this.triggerOverride ?? this.input.mouse.down);
      this.weapons.update(dt, this.ctx, trigger);
      if (!debugState.freezeEnemies && !debugState.passiveEnemies) this.director.step(dt, this.ctx);
      this._stepEnemies(dt);
      this.projectiles.step(dt, this.ctx);
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
    const fxc = this.enemyCfg.fx;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      e.step(dt, frozen);
      // 손상된 적기는 연기를 끌고 다닌다
      if (e.hp < e.cfg.hp * fxc.smokeBelow) {
        e.smokeTimer -= dt;
        if (e.smokeTimer <= 0) {
          e.smokeTimer = fxc.smokeEvery;
          this.fx.smoke(e.pos, FX.damageSmoke, PALETTE.fx.smokeB);
        }
      }
    }
  }

  _stepMission(dt) {
    // 편대 등장
    const a = this._spawnArgs;
    a.aliveCount = this.enemies.aliveCount;
    a.time = this.stats.time;
    if (this.spawner.step(dt, a) > 0) {
      this.feedback.wave = HUD_FEEDBACK.waveNotice;
      this._updateOutline();
    }
    this._collisions(dt);
    this._checkCleared();
  }

  /** 플레이어-적기 충돌: 양쪽 피해 + 밀림 */
  _collisions(dt) {
    if (this.collisionCooldown > 0) { this.collisionCooldown -= dt; return; }
    const player = this.player;
    if (!player.alive) return;
    const f = player.flight;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const r = player.cfg.hitRadius * 0.6 + e.cfg.collisionRadius;
      if (e.pos.distanceToSquared(f.pos) > r * r) continue;
      const k = player.cfg.collision;
      // 적기 반대쪽으로 밀려난다
      _v.subVectors(f.pos, e.pos);
      if (_v.lengthSq() < 1e-4) _v.set(0, 1, 0);
      _v.normalize();
      f.pos.addScaledVector(_v, k.push);
      f.speed = Math.max(player.cfg.speed.min, f.speed - k.speedLoss);
      f.pitchRate += Math.sign(_v.y || 1) * k.pitchKick * (Math.PI / 180);
      f.yawRate += (this.rng() < 0.5 ? -1 : 1) * k.yawKick * (Math.PI / 180);
      this.collisionCooldown = k.cooldown;
      damageEnemy(this.ctx, e, e.cfg.hp * 10, 'collision'); // 적기는 즉사급
      damagePlayer(this.ctx, e.cfg.collisionDamage, 'collision');
      break;
    }
  }

  _shiftAll(dx, dz) {
    this.player.shift(dx, dz);
    this.rig.shift(dx, dz);
    this.fx.shift(dx, dz);
    for (const e of this.enemies.list) e.shift(dx, dz);
    this.projectiles.shift(dx, dz);
    this.weapons.shift(dx, dz);
  }

  // ── 렌더 프레임 ─────────────────────────────────────────────────────────
  render(alpha, frameDt) {
    const player = this.player;
    player.interpolate(alpha);
    player.animate(frameDt);
    for (const e of this.enemies.list) if (e.alive) e.interpolate(alpha);
    this._updateLook();
    this._updateMfd();
    this.rig.update(player.view, frameDt);
    this.world.update(this.camera);
    if (!this.looking) this.updateCursor();
    this.fx.update(frameDt, WEAPONS.gun.tracer);
    this._renderProjectiles(alpha);
    this.fx.endBolts();
    if (this.feedback.hit > 0) this.feedback.hit = Math.max(0, this.feedback.hit - frameDt * HUD_FEEDBACK.hitFade);
  }

  _renderProjectiles(alpha) {
    this.projectiles.render(alpha, this.fx.bolts);
    this.weapons.render(alpha);
  }

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
      if (e) { made++; this.director.onSpawn(e, i); this.total = Math.max(this.total, this.stats.kills + this.enemies.aliveCount); }
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

// 미션 1회 진행(세션): 플레이어·적기·무장·효과를 묶어 고정 스텝으로 돌리고, 렌더 프레임에 보간한다.
// 메뉴 배경(쇼케이스)도 같은 세션이 맡는다: 기체가 구름 사이를 수평 비행하고 카메라가 주위를 돈다.
// 모든 개체는 생성자에서 한 번만 만들고 미션마다 상태만 초기화한다(메모리 누수 없음).
import * as THREE from 'three';
import { clamp, clamp01, makeRng, moveToward, DEG } from './math.js';
import { updateOrientation } from '../flight/flight-model.js';
import { TAKEOFF, AIRBASE } from '../data/takeoff.js';
import { CINEMATIC } from '../data/cinematic.js';
import { GEAR_HEIGHT } from '../entities/gear.js';
import { debugState } from './debug.js';
import { gradeFor } from './scoring.js';
import { VIEW } from '../flight/camera-rig.js';
import { EnemyPool } from '../entities/enemy.js';
import { setEnemyOutlinePixels, createEnemyVisual } from '../entities/enemy-model.js';
import { Effects } from '../entities/effects.js';
import { KF21_POINTS } from '../entities/kf21-model.js';
import { WeaponSystem } from '../combat/weapon-system.js';
import '../combat/gun.js';
import '../combat/missile.js';
import '../combat/bomb.js';
import { GroundSystem } from '../ground/ground-system.js';
import { Projectiles } from '../combat/projectiles.js';
import { damageEnemy, damagePlayer } from '../combat/damage.js';
import { EnemyDirector } from '../ai/enemy-ai.js';
import { WaveSpawner } from '../ai/wave-spawner.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMIES, DEFAULT_ENEMY, ENEMY_POOL_SIZE, ENEMY_BULLET_POOL, PERSONALITIES, ROLES } from '../data/enemies.js';
import { MISSION_FLOW, SPAWN, missionEnemyCount } from '../data/missions.js';
import { PALETTE } from '../data/palette.js';
import { CAMERA } from '../data/camera.js';
import { FX } from '../data/fx.js';
import { HUD_FEEDBACK } from '../data/hud.js';
import { PLAYER_AIRCRAFT } from '../data/aircraft.js';
import { KILLCAM, THREAT, DECALS, REPLAY, TUTORIAL, CHECKPOINT } from '../data/extras.js';
import { ThreatMonitor, enemyGunSource, enemyMissileSource } from '../combat/threat.js';
import { createDecals } from '../entities/decals.js';
import { Recorder } from './replay.js';
import { Tutorial } from './tutorial.js';
import { PHASE_NAMES } from './phase.js';
import { TakeoffCinematic } from './takeoff-cine.js';
import { MissionEngine, OUTCOME } from '../mission/engine.js';

const _v = new THREE.Vector3();
const _shift = { x: 0, z: 0 };
const _q = new THREE.Quaternion();
const _ax = { pitch: 0, turn: 0 };
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export const PHASE = PHASE_NAMES;

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

    this.stats = { groundKills: 0, bombsDropped: 0, kills: 0, gunShots: 0, gunHits: 0, missilesFired: 0, hitsTaken: 0, time: 0, clearTime: 0, weaponsUsed: [] };
    // HUD가 읽는 순간 연출 값(초 단위 타이머 / 0~1 세기)
    this.feedback = { hit: 0, hitWarn: 0, kill: 0, wave: 0, switched: 0, flash: 0 }; // flash: 폭발 섬광(화면 가장자리)
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
    // 추락하는 잔해(격추된 적기가 불타며 떨어진다)
    this.wrecks = [];
    for (let i = 0; i < FX.wreck.pool; i++) {
      const visual = createEnemyVisual(this.enemyCfg.modelScale);
      scene.add(visual.group);
      this.wrecks.push({ group: visual.group, active: false, vel: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), life: 0, timer: 0 });
    }
    this.damageTimer = 0;
    // 위협 경고: 적기 기관포·추격(+ 적 미사일 자리). HUD가 this.threat.state를 읽는다
    this.boss = null; // 보스 적기(HUD 체력바)
    // 정찰 체크포인트: 다음 링 하나만 보여 준다. HUD는 navPoint로 방향·거리를 그린다
    this.navPoint = { active: false, pos: new THREE.Vector3(), label: '', index: 0, total: 0 };
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(CHECKPOINT.radius, 5, 6, 36), new THREE.MeshBasicMaterial({ color: 0x6ee7d0, transparent: true, opacity: 0.85, toneMapped: false, fog: false }));
    this.ring.visible = false; this.ring.frustumCulled = false;
    scene.add(this.ring);
    this.ground = new GroundSystem(scene); // 지상 목표·대공포·SAM
    this.ground.onDestroyed = (t) => { this.stats.groundKills++; this.engine.groundDestroyed(t.type); this.feedback.kill = HUD_FEEDBACK.killNotice; this._checkCleared(); };
    this.enemyMissiles = this.ground.sams; // 적 미사일은 SAM만 쓴다(적기 미사일은 꺼져 있다)
    this.threat = new ThreatMonitor(THREAT).addSource(enemyGunSource(this.enemies.list, THREAT));
    this.threat.addSource(enemyMissileSource(this.enemyMissiles));
    // 피격 흔적(총알 구멍·그을음)
    this.decals = createDecals(DECALS);
    player.root.add(this.decals.mesh);
    // 킬캠: 마지막 격추 때 슬로모션(+ 옆에서 잡는 카메라)
    this.killcam = { active: false, cam: false, t: 0, wreck: null, side: 1, sideCam: true };
    this.timeScale = 1; // main이 게임 루프에 곱한다
    this.lastWreck = null;
    // 마지막 격추 리플레이
    this.rec = new Recorder(ENEMY_POOL_SIZE, REPLAY);
    this.replay = { on: false, t: 0, t0: 0, t1: 0, pass: 0, boomed: false, target: new THREE.Vector3(), targetQuat: new THREE.Quaternion(), sample: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), enemies: Array.from({ length: ENEMY_POOL_SIZE }, () => ({ alive: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion() })) } };
    this.onReplayEnd = null;
    // 튜토리얼(미션 1)
    this.tutorial = new Tutorial(TUTORIAL);
    this.tutorial.onFinish = () => { this.settings.set('tutorialDone', true); };
    this.tutorialEnabled = true; // 자동플레이에서는 끈다
    this.spawnClock = 0;
    this.gpuFrame = { depth: null, w: 1, h: 1 }; // 소프트 파티클용 장면 깊이(후처리가 있을 때 main이 채운다)
    // 이륙 연출 상태. state: 'roll' 활주 → 'rotate' 기수 들기 대기 → 'climb' 상승
    this.takeoff = { state: 'roll', speed: 0, pitch: 0, wait: 0, assisted: false, time: 0 };
    this.simpleTakeoff = false; // 낮음 프리셋: 이륙 시네마틱의 일부 효과를 뺀다
    this.takeoffCine = new TakeoffCinematic(this);
    // 메인 메뉴 시네마틱(높음·최고): 몇 번째 장면의 몇 초인지
    this.cine = { on: false, shot: 0, t: 0, view: { yaw: 0, pitch: 0, dist: 20, at: [0, 0, 0], shift: 0, fov: 40, level: true } };
    this.cursorOverride = null; // 자동플레이가 정하는 조준 커서(화면 좌표)
    this.skipTakeoffOverride = null; // 자동플레이 주소의 takeoff=skip|full
    this.autopilot = null;
    this.showcaseHold = false; // 디버그: 고정 시점으로 모델을 볼 때 시네마틱 카메라를 멈춘다
    this.gearTarget = 0;
    this.cineAmmo = 5;
    this._spawnArgs = {
      aliveCount: 0, time: 0, flight: player.flight, limits: this.enemyCfg.flight,
      origin: world.origin,
      spawn: (x, y, z, yaw, slot, wave, i, gx, gz) => {
        const e = this.enemies.spawn(x, y, z, yaw);
        if (!e) return false;
        // 역할(수송기·폭격기·보스)과 성격(편대 안에서 기체별로 다를 수 있다)
        const role = (wave && wave.role) || 'fighter', def = ROLES[role] || ROLES.fighter;
        const pn = wave && wave.personality ? (Array.isArray(wave.personality) ? wave.personality[i % wave.personality.length] : wave.personality) : def.personality || 'aggressive';
        e.setRole(role, def, PERSONALITIES[pn] || PERSONALITIES.aggressive);
        if (def.cruise) e.goal.set(gx, y, gz);
        if (role === 'boss') this.boss = e;
        this.director.onSpawn(e, slot);
        return true;
      },
    };

    const self = this;
    this.ctx = {
      player,
      enemies: this.enemies.list,
      ground: this.ground,
      origin: world.origin,
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
      touch: () => self.input.touchMode,
      lockedEnemy: null, // 플레이어가 락온 중인 적기(성격 evasive가 읽는다)
      onEscaped(enemy) { self.engine.escaped(enemy.role); self._checkCleared(); },
      onEnemyHit(enemy, source) { self._onEnemyHit(enemy, source); },
      onEnemyKilled(enemy, source) { self._onEnemyKilled(enemy, source); },
      onPlayerHit(amount, kind) { self._onPlayerHit(amount, kind); },
      onPlayerKilled() { self._onPlayerKilled(); },
      onGunFired(muzzle) {
        _v2.set(-1, 0.2, 0).applyQuaternion(player.flight.quat); // 탄피는 기체 왼쪽으로 튄다
        self.fx.casing(muzzle, player.velocity, _v2);
        self.fx.gunSmoke(muzzle, player.velocity);
      },
      onMissileFired(pos) { self.fx.flash(pos, FX.missileIgnite.size, FX.missileIgnite.life); player.visual.firePulse = 1; },
      /** 미사일이 달려 있던 파일런 위치(하이폴리 모델에만 있다). 없으면 false */
      missileMount(index, out) {
        const m = player.model;
        if (!m || !m.missileMount) return false;
        m.missileMount(index, out).applyQuaternion(player.flight.quat).add(player.flight.pos);
        return true;
      },
    };
    this.weapons.init(this.ctx);
    this.resize(this.viewport.w, this.viewport.h);
  }

  // ── 시작 ────────────────────────────────────────────────────────────────
  _resetWorld() {
    this.enemies.clear();
    for (const w of this.wrecks) { w.active = false; w.group.visible = false; }
    this.projectiles.clear();
    this.collisionCooldown = 0;
    this.fx.clear();
    this.weapons.reset();
    this.boss = null;
    this.navPoint.active = false;
    this.ring.visible = false;
    this.ground.clear();
    this.stats.groundKills = 0; this.stats.bombsDropped = 0;
    this.world.resetOrigin();
    const s = this.stats;
    s.kills = 0; s.gunShots = 0; s.gunHits = 0; s.missilesFired = 0; s.hitsTaken = 0; s.time = 0; s.clearTime = 0;
    s.weaponsUsed.length = 0;
    const f = this.feedback;
    f.hit = 0; f.hitWarn = 0; f.kill = 0; f.wave = 0; f.switched = 0; f.flash = 0;
    this.endTimer = 0;
    this.success = false;
    if (this.takeoffCine.active) { this.takeoffCine.active = false; this.world.setDim(1); const ck = this.player.cockpit; if (ck && ck.group) ck.group.scale.z = 1; this.player.visual.flapDirect = false; this.player.visual.surge = 0; }
    this.rig.fov = 0;
    this.threat.reset();
    this.decals.clear();
    this.killcam.active = false; this.killcam.cam = false;
    this.timeScale = 1;
    this.lastWreck = null;
    this.rec.reset();
    this.replay.on = false;
    this.tutorial.stop();
    this.spawnClock = 0;
  }

  /** 메뉴 배경: 수평 비행 + 회전 카메라 */
  startShowcase() {
    this._setEnvironment('day', 'inland');
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
    this.cine.on = !this.simpleTakeoff;
    this.cine.shot = -1;
    this.rig.fixed = null;
    if (this.cine.on) this._cineStart(0);
    this._applyView();
  }

  // ── 메인 메뉴 시네마틱 ──────────────────────────────────────────────────
  _cineStart(index) {
    const c = this.cine;
    const shot = CINEMATIC[index];
    c.shot = index;
    c.t = 0;
    const ground = AIRBASE.height + GEAR_HEIGHT;
    this.player.reset({ yaw: 0, y: shot.ground ? ground : ground + shot.altitude });
    this.world.resetOrigin();
    this.player.manual = shot.ground;
    const f = this.player.flight;
    if (shot.ground) { f.speed = 0; this.player.velocity.set(0, 0, 0); } else { f.pitch = shot.pitch; f.floor = Math.min(f.floor, f.pos.y - 200); }
    updateOrientation(f);
    this.player.prevQuat.copy(f.quat);
    this.fx.clear();
    this.rig.snap = true;
  }

  /** 장면 값 읽기: 숫자면 그대로, 배열이면 진행도 k(0~1)에 따라 구간 보간 */
  _cineValue(v, k) {
    if (typeof v === 'number') return v;
    const n = v.length - 1;
    const x = Math.min(n - 1e-6, k * n), i = Math.floor(x), t = x - i;
    const e = t * t * (3 - 2 * t);
    return v[i] + (v[i + 1] - v[i]) * e;
  }

  _stepCinematic(dt) {
    const c = this.cine;
    let shot = CINEMATIC[c.shot];
    c.t += dt;
    if (c.t >= shot.duration) { this._cineStart((c.shot + 1) % CINEMATIC.length); shot = CINEMATIC[c.shot]; }
    const k = c.t / shot.duration;
    const v = this.player.visual;
    v.canopy = this._cineValue(shot.canopy, k);
    v.boost = this._cineValue(shot.boost, k);
    this.gearTarget = this._cineValue(shot.gear, k) > 0.5 ? 1 : 0;
    if (shot.ground) { v.gear = 1; this.player.flight.throttle = this._cineValue(shot.power, k); } else this.player.input.turn = this._cineValue(shot.turn, k);
    this.cineAmmo = Math.round(this._cineValue(shot.ammo, k));
  }

  /** 시네마틱 카메라(렌더 프레임마다): 장면 안에서 부드럽게 이동한다 */
  _cineCamera() {
    const c = this.cine;
    const shot = CINEMATIC[c.shot];
    const k = Math.min(1, c.t / shot.duration);
    const e = k * k * (3 - 2 * k);
    const view = c.view;
    const cam = shot.cam;
    view.yaw = cam.yaw[0] + (cam.yaw[1] - cam.yaw[0]) * e;
    view.pitch = cam.pitch[0] + (cam.pitch[1] - cam.pitch[0]) * e;
    view.dist = cam.dist[0] + (cam.dist[1] - cam.dist[0]) * e;
    view.at = cam.at;
    view.shift = cam.shift * Math.min(1.6, this.viewport.w / this.viewport.h / 1.78); // 좁은 화면에서는 덜 민다
    view.fov = shot.fov;
    this.rig.fixed = view;
    this.player.visual.ammo = this.cineAmmo;
  }

  /** @param {object} mission data/missions.js 의 미션 */
  startMission(mission, seed = (Date.now() & 0xffffff) + 1) {
    this.mode = 'mission';
    this.cine.on = false;
    this.rig.fixed = null;
    this.phase = PHASE.ACTIVE;
    this.mission = mission;
    this.engine = new MissionEngine(mission); // 목표 진행·승패·점수(순수 로직)
    this._setEnvironment(mission.timeOfDay, mission.terrain);
    this.total = missionEnemyCount(mission);
    this.rng = makeRng(seed);
    this._resetWorld();
    this.player.visual.canopy = 0; // 메뉴 시네마틱에서 열려 있던 캐노피를 닫는다
    this.weapons.configure(mission.weapons);
    this.weapons.reset();
    this.ground.reset(mission, this.rng, this.world.look.lights);
    const ground = AIRBASE.height + GEAR_HEIGHT + 0.5;
    this.player.reset({ yaw: 0, y: ground });
    this._onMissionStart();
    if (this.skipTakeoffOverride ?? this.settings.get('skipTakeoff')) {
      this._airStart();
    } else {
      // 활주로에서 8초 이륙 시네마틱(조작 없음). 끝나면 공중에서 수평 비행으로 이어진다
      this.phase = PHASE.TAKEOFF;
      this.gearTarget = 1;
      this.player.visual.gear = 1;
      this.takeoffCine.simple = this.simpleTakeoff;
      this.takeoffCine.start();
    }
    if (this.tutorialEnabled && mission.id === TUTORIAL.missionId && !this.settings.get('tutorialDone') && !(this.autopilot && this.autopilot.enabled)) this.tutorial.start(this, this.input.touchMode);
    this._applyView();
  }

  /** 시간대·지형 적용. 시간대가 바뀌었으면 main이 환경맵을 다시 굽는다 */
  _setEnvironment(timeOfDay, terrain) {
    if (this.world.setEnvironment(timeOfDay, terrain) && this.onEnvironment) this.onEnvironment();
  }

  /** Enter/Space/건너뛰기 버튼: 이륙 → 킬캠 → 튜토리얼 순으로 하나를 넘긴다 */
  skip() {
    if (this.replay.on) { this.stopReplay(); return true; }
    if (this.skipTakeoff()) return true;
    if (this.killcam.active) { this._endKillcam(); return true; }
    if (this.tutorial.active) return this.tutorial.finish(this);
    return false;
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
    this.engine.time = 0;
    this._applyScale();
  }

  /** Enter/Space: 이륙 연출 건너뛰기 */
  skipTakeoff() {
    if (this.mode !== 'mission' || this.phase !== PHASE.TAKEOFF) return false;
    return this.takeoffCine.skip();
  }

  _stepTakeoff(dt) {
    this.takeoffCine.step(dt);
  }

  /** 모델 연출 값(기어·플랩·에어브레이크·애프터버너)을 비행 상태에서 정한다. */
  _stepVisual(dt) {
    if (this.mode === 'mission' && this.phase === PHASE.TAKEOFF) return; // 이륙 시네마틱이 직접 정한다
    const v = this.player.visual;
    const f = this.player.flight;
    const cfg = this.player.cfg;
    v.gear = moveToward(v.gear, this.gearTarget, dt / TAKEOFF.gearTime);
    v.flap = v.gear > 0.5 ? 1 : 0;
    if (this.mode !== 'mission') return;
    v.canopy = 0; // 이륙·비행·미션 중 캐노피는 항상 닫힘(열리는 것은 메뉴 시네마틱뿐)
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
    this._applyScale();
    this._updateOutline();
  }

  /** 3인칭 미션 비행 중에는 내 기체를 크게 보여 준다(지상·조종석·메뉴에서는 실제 크기) */
  _applyScale() {
    const big = this.mode === 'mission' && this.view === VIEW.CHASE && this.phase !== PHASE.TAKEOFF && !this.replay.on;
    this.player.root.scale.setScalar(big ? PLAYER_AIRCRAFT.model.chaseScale : 1);
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

  _onEnemyKilled(enemy) {
    this.stats.kills++;
    if (!this._debugSkipped) this.engine.airKill(enemy.role || 'fighter');
    // 가까운 폭발일수록 화면 가장자리가 밝게 번쩍인다
    this.feedback.flash = Math.max(this.feedback.flash, clamp01(1.15 - enemy.pos.distanceTo(this.player.flight.pos) / 900));
    // 잔해: 격추된 자리에서 속도를 이어받아 돌면서 떨어진다
    const w = this.wrecks.find((x) => !x.active) || this.wrecks[0];
    w.active = true;
    w.life = FX.wreck.life;
    w.timer = 0;
    w.group.position.copy(enemy.pos);
    w.group.quaternion.copy(enemy.quat);
    w.vel.copy(enemy.velocity).multiplyScalar(0.8);
    w.axis.set(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).normalize();
    w.group.visible = true;
    this.lastWreck = w;
    this.rec.markKill(enemy.index);
    this.feedback.kill = HUD_FEEDBACK.killNotice;
    this._checkCleared();
  }

  _checkCleared() {
    if (this.phase !== PHASE.ACTIVE || !this.player.alive) return;
    const e = this.engine;
    if (e.outcome === OUTCOME.LOST) { // 필수 목표 실패·제한시간 초과(체력 0은 _onPlayerKilled가 맡는다)
      this.phase = PHASE.ENDING;
      this.success = false;
      this.failReason = e.reason;
      this.stats.clearTime = this.stats.time;
      this.endTimer = MISSION_FLOW.failDelay;
      this.audio.play('mission_fail');
      this.tutorial.stop();
      return;
    }
    if (e.outcome === OUTCOME.WON) {
      this.phase = PHASE.ENDING;
      this.success = true;
      this.stats.clearTime = this.stats.time;
      this.endTimer = MISSION_FLOW.clearDelay;
      this.audio.play('mission_clear');
      this.tutorial.finish(this);
      this._startKillcam();
    }
  }

  _allSpawned() {
    return this.spawner.allSpawned;
  }

  _onPlayerHit(amount, kind) {
    this.stats.hitsTaken++;
    if (kind !== 'collision' || this.decals.count === 0) this.decals.add(this.player.root, this.player.model && (this.player.model.exterior || this.player.model.group), this.rng);
    this.feedback.hit = 1;
    this.feedback.hitWarn = HUD_FEEDBACK.hitWarn;
  }

  _onPlayerKilled() {
    this.player.root.visible = false;
    if (this.phase !== PHASE.ACTIVE) return;
    this.phase = PHASE.ENDING;
    this.success = false;
    this.engine.playerDead();
    this.failReason = this.engine.reason;
    this.stats.clearTime = this.stats.time;
    this.endTimer = MISSION_FLOW.failDelay;
    this.tutorial.stop();
    this.audio.play('mission_fail');
  }

  /** 미션 결과(결과 화면·저장·랭킹이 사용) */
  result() {
    const s = this.stats;
    const score = this.engine.score(s.clearTime);
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
      objectives: this.engine.summary(),
      timeBonus: this.engine.timeBonus(s.clearTime),
      failReason: this.success ? null : this.failReason || null,
    };
  }

  // ── 정찰 체크포인트 ─────────────────────────────────────────────────────
  _stepCheckpoints() {
    const list = this.mission.checkpoints, nav = this.navPoint;
    const i = list && list.length ? this.engine.nextCheckpoint() : -1;
    if (i < 0 || i >= list.length || this.phase !== PHASE.ACTIVE) { nav.active = false; this.ring.visible = false; return; }
    const c = list[i], o = this.world.origin;
    nav.active = true; nav.index = i; nav.total = list.length; nav.label = `CP ${i + 1}/${list.length}`;
    nav.pos.set(c[0] - o.x, c[1], c[2] - o.z);
    this.ring.visible = true;
    this.ring.position.copy(nav.pos);
    // 링은 들어오는 방향을 향해 세운다(이전 지점 → 이 지점)
    const p = i > 0 ? list[i - 1] : [0, 0, 0];
    this.ring.rotation.set(0, Math.atan2(c[0] - p[0], c[2] - p[2]), 0);
    if (this.player.flight.pos.distanceTo(nav.pos) < CHECKPOINT.radius && this.engine.checkpoint(i)) { this.feedback.switched = HUD_FEEDBACK.switchFlash; this._checkCleared(); }
  }

  // ── 킬캠 ────────────────────────────────────────────────────────────────
  _startKillcam() {
    const k = this.killcam;
    if (!this.lastWreck) return;
    k.active = true;
    k.t = 0;
    k.wreck = this.lastWreck;
    k.cam = k.sideCam && !this.input.touchMode; // 낮음·모바일은 슬로모션만
    k.side = this.rng() < 0.5 ? -1 : 1;
    this.timeScale = KILLCAM.timeScale;
    if (k.cam) this.player.setCockpitView(false);
  }

  _endKillcam() {
    const k = this.killcam;
    if (!k.active) return;
    k.active = false;
    this.timeScale = 1;
    if (k.cam) { k.cam = false; this.rig.fov = 0; this._applyView(); }
  }

  /** 격추된 적기를 옆에서 따라가는 카메라 */
  _killcamCamera(frameDt) {
    const k = this.killcam;
    k.t += frameDt;
    if (k.t >= KILLCAM.duration) { this._endKillcam(); return; }
    if (!k.cam) return;
    this._sideCamera(k.wreck.group.position, k.wreck.vel, k.side, KILLCAM);
  }

  _sideCamera(target, vel, side, c) {
    _v.copy(vel); _v.y = 0;
    if (_v.lengthSq() < 1) _v.set(0, 0, -1);
    _v.normalize();
    _v2.set(-_v.z, 0, _v.x); // 진행 방향의 오른쪽
    const cam = this.camera;
    cam.position.copy(target).addScaledVector(_v2, side * c.side).addScaledVector(_v, c.lead);
    cam.position.y += c.up;
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  }

  // ── 마지막 격추 리플레이 ────────────────────────────────────────────────
  canReplay() {
    return this.mode === 'mission' && this.success && !!this.rec.window();
  }

  startReplay() {
    const w = this.canReplay() && this.rec.window();
    if (!w) return false;
    const r = this.replay;
    this.rec.frozen = true;
    this._endKillcam();
    r.on = true; r.t0 = w.t0; r.t1 = w.t1; r.t = w.t0; r.pass = 0; r.boomed = false;
    this.mode = 'replay';
    this.fx.clear();
    this.projectiles.clear();
    for (const wr of this.wrecks) { wr.active = false; wr.group.visible = false; }
    this.player.root.visible = true;
    this.player.setCockpitView(false);
    this._updateOutline();
    return true;
  }

  stopReplay() {
    const r = this.replay;
    if (!r.on) return;
    r.on = false;
    this.mode = 'mission';
    for (const e of this.enemies.list) e.group.visible = e.alive;
    this.fx.clear();
    this.rig.fov = 0;
    this._applyView();
    if (this.onReplayEnd) this.onReplayEnd();
  }

  _renderReplay(frameDt) {
    const r = this.replay, rec = this.rec, s = r.sample, player = this.player;
    r.t += frameDt * REPLAY.speed;
    if (r.t >= r.t1) {
      if (r.pass === 0) { r.pass = 1; r.t = r.t0; r.boomed = false; this.fx.clear(); } else { this.stopReplay(); return; }
    }
    rec.sample(r.t, s);
    player.root.position.copy(s.pos);
    player.root.quaternion.copy(s.quat);
    player.renderPos.copy(s.pos);
    player.renderQuat.copy(s.quat);
    player.animate(frameDt);
    const list = this.enemies.list;
    for (let i = 0; i < list.length; i++) {
      const e = s.enemies[i], g = list[i].group;
      g.visible = e.alive;
      if (e.alive) { g.position.copy(e.pos); g.quaternion.copy(e.quat); }
    }
    const t = s.enemies[rec.killIndex];
    if (t && t.alive) { r.target.copy(t.pos); r.targetQuat.copy(t.quat); }
    if (!r.boomed && r.t >= rec.killT) { // 격추 순간: 폭발을 다시 터뜨린다
      r.boomed = true;
      _v3.set(0, 0, -1).applyQuaternion(r.targetQuat).multiplyScalar(this.enemyCfg.flight.speed);
      this.fx.explosion(r.target, _v3, 1);
    }
    const cam = this.camera;
    if (r.pass === 0) { // 뷰 1: 내 기체 뒤에서 표적을 본다
      const c = REPLAY.chase;
      _v.set(0, 0, 1).applyQuaternion(s.quat);
      cam.position.copy(s.pos).addScaledVector(_v, c.back);
      cam.position.y += c.up;
      cam.up.set(0, 1, 0);
      _v2.copy(s.pos).lerp(r.target, 0.5);
      cam.lookAt(_v2);
      if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    } else { // 뷰 2: 표적 옆
      _v3.set(0, 0, -1).applyQuaternion(r.targetQuat);
      this._sideCamera(r.target, _v3, 1, REPLAY.side);
    }
    cam.updateMatrixWorld();
    this.world.update(cam);
    this.fx.update(frameDt, WEAPONS.gun.tracer, cam);
    if (this.fx.gpu) this.fx.gpu.update(frameDt, cam, this.world.origin, this.gpuFrame.depth, this.gpuFrame.w, this.gpuFrame.h);
    this.fx.endBolts();
  }

  _finish() {
    this.phase = PHASE.DONE;
    if (this.onFinished) this.onFinished(this.result());
  }

  // ── 조준 ────────────────────────────────────────────────────────────────
  /** 조준 커서(화면 좌표). 마우스 감도는 화면 중앙 기준 배율로 적용한다. */
  updateCursor() {
    const { w, h } = this.viewport;
    if (this.cursorOverride) { // 자동플레이: 봇이 정한 조준 위치
      this.cursor.x = clamp(this.cursorOverride.x, 0, w);
      this.cursor.y = clamp(this.cursorOverride.y, 0, h);
      return;
    }
    if (this.input.touchMode) { // 터치: 조준 영역을 누르고 있으면 그 지점, 아니면 화면 중앙
      const t = this.input.touchAim;
      const use = t.active || t.released; // 뗀 바로 그 스텝까지는 마지막 위치를 유지해야 락온이 풀리지 않고 발사된다
      this.cursor.x = use ? t.x : w / 2;
      this.cursor.y = use ? t.y : h / 2;
      return;
    }
    // 포인터락이면 입력 계층이 이동량으로 이미 가상 조준점을 옮겨 놓았다. 잠금이 없을 때는 중앙 기준 배율
    const k = this.input.locked ? 1 : this.settings.get('mouseSensitivity');
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

  /**
   * 발사 버튼. PC는 좌클릭, 모바일은 조준 영역을 누르는 동안(기관포) / 누른 채 락온을 마치고 뗀 순간 한 번(미사일).
   */
  _manualTrigger() {
    const inp = this.input;
    if (!inp.touchMode) return inp.mouse.down;
    const t = inp.touchAim;
    if (this.weapons.current.id === 'missile') {
      // 락온 완료 상태에서 손가락을 떼면 발사: 뗀 프레임에 true를 한 스텝 준다
      const ml = this.weapons.byId('missile').lock;
      if (t.released) { t.released = false; const ok = this.weapons.uiState().ready; if (!ok) ml.reset(); return ok; }
      if (!t.active) ml.reset(); // 누르고 있지 않으면 락온하지 않는다
      return false;
    }
    return t.active;
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
    if (this.mode === 'replay') return; // 리플레이 중에는 시뮬레이션을 멈춘다
    if (this.autopilot) this.autopilot.step(dt); // 자동플레이가 켜져 있으면 입력 값을 먼저 정한다
    const player = this.player;
    const mission = this.mode === 'mission';
    const controllable = mission && player.alive && this.phase !== PHASE.DONE && this.phase !== PHASE.TAKEOFF;
    if (controllable) {
      const o = this.inputOverride;
      if (o) { player.input.pitch = o.pitch; player.input.turn = o.turn; } else {
        this.input.flightAxes(_ax);
        player.input.pitch = _ax.pitch;
        player.input.turn = _ax.turn;
      }
    } else {
      player.input.pitch = 0;
      if (!(this.mode === 'showcase' && this.cine.on)) player.input.turn = 0;
    }
    if (!mission && this.cine.on) this._stepCinematic(dt);
    player.step(dt);
    if (mission && this.phase === PHASE.TAKEOFF) this._stepTakeoff(dt);
    this._stepVisual(dt);
    this._stepDamageFx(dt);

    if (mission) {
      const active = this.phase === PHASE.ACTIVE;
      this._updateAim();
      const trigger = active && player.alive && !this.looking && (this.triggerOverride ?? this._manualTrigger());
      this.weapons.update(dt, this.ctx, trigger);
      { const ml = this.weapons.byId('missile'); const u = ml && ml._ui; this.ctx.lockedEnemy = u && u.lockState !== 'search' ? u.target : null; }
      if (!debugState.freezeEnemies && !debugState.passiveEnemies) this.director.step(dt, this.ctx);
      this._stepCheckpoints();
      this._stepEnemies(dt);
      this.ground.step(dt, this.ctx);
      this.projectiles.step(dt, this.ctx);
      this.tutorial.update(dt, this);
      this.threat.update(player);
      if (this.phase === PHASE.ACTIVE || this.phase === PHASE.ENDING) this.rec.step(dt, player, this.enemies.list);
      if (active) {
        if (!this.tutorial.active) { this.stats.time += dt; this.engine.tick(dt); } // 튜토리얼 중에는 시간이 흐르지 않는다
        if (!this.tutorial.holding) this._stepMission(dt); // 마지막 단계 전까지 적이 나오지 않는다
        if (!this.engine.running) this._checkCleared(); // 제한시간 초과 등
      } else if (this.phase === PHASE.ENDING) {
        if (!this.killcam.active) this.endTimer -= dt; // 킬캠이 끝난 뒤부터 센다
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
    this.spawnClock += dt;
    a.time = this.spawnClock;
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
    for (const w of this.wrecks) { w.group.position.x += dx; w.group.position.z += dz; }
    this.projectiles.shift(dx, dz);
    this.ground.shift(dx, dz);
    this.weapons.shift(dx, dz);
    this.rec.shift(dx, dz);
  }

  // ── 렌더 프레임 ─────────────────────────────────────────────────────────
  render(alpha, frameDt) {
    if (this.mode === 'replay') { this._renderReplay(frameDt); return; }
    const player = this.player;
    player.interpolate(alpha);
    player.animate(frameDt);
    for (const e of this.enemies.list) if (e.alive) e.interpolate(alpha);
    this._updateLook();
    this._updateMfd();
    if (this.mode === 'showcase' && this.cine.on && !this.showcaseHold) this._cineCamera();
    this.rig.update(player.view, frameDt);
    if (this.takeoffCine.active) this.takeoffCine.camera(frameDt);
    if (this.killcam.active) this._killcamCamera(frameDt); // 킬캠 시간은 실제 시간으로 센다
    this.world.update(this.camera);
    if (!this.looking) this.updateCursor();
    const fxDt = frameDt * this.timeScale; // 슬로모션에서는 잔해·파티클도 느리게
    this._renderWrecks(fxDt);
    this.fx.update(fxDt, WEAPONS.gun.tracer, this.camera);
    if (this.fx.gpu) this.fx.gpu.update(fxDt, this.camera, this.world.origin, this.gpuFrame.depth, this.gpuFrame.w, this.gpuFrame.h);
    this._renderProjectiles(alpha);
    this.ground.render(this.camera);
    const bomb = this.weapons.byId('bomb');
    if (bomb && bomb.marker) bomb.updateMarker(this.camera);
    this.fx.endBolts();
    if (this.feedback.hit > 0) this.feedback.hit = Math.max(0, this.feedback.hit - frameDt * HUD_FEEDBACK.hitFade);
    if (this.feedback.flash > 0) this.feedback.flash = Math.max(0, this.feedback.flash - frameDt * HUD_FEEDBACK.flashFade);
  }

  /** 잔해: 중력으로 떨어지며 불과 연기를 끈다(연출 전용이라 렌더 프레임에서 움직인다) */
  _renderWrecks(dt) {
    const c = FX.wreck;
    for (const w of this.wrecks) {
      if (!w.active) continue;
      w.life -= dt;
      if (w.life <= 0) { w.active = false; w.group.visible = false; this.fx.missileBlast(w.group.position, w.vel); continue; }
      w.vel.multiplyScalar(Math.max(0, 1 - c.drag * dt));
      w.vel.y -= c.gravity * dt;
      w.group.position.addScaledVector(w.vel, dt);
      w.group.rotateOnAxis(w.axis, c.spin * dt);
      w.timer -= dt;
      if (w.timer <= 0 && dt > 0) {
        w.timer = c.every;
        this.fx.fire(w.group.position, w.vel, c.fire);
        this.fx.smoke(w.group.position, c.smoke, PALETTE.fx.smokeB);
      }
    }
  }

  /** 플레이어 손상 표시: 체력이 낮으면 엔진에서 연기, 위급하면 불길 */
  _stepDamageFx(dt) {
    const p = this.player;
    const c = FX.playerDamage;
    const ratio = p.hp / p.cfg.hp;
    if (!p.alive || this.mode !== 'mission' || ratio >= c.smokeBelow) return;
    this.damageTimer -= dt;
    if (this.damageTimer > 0) return;
    this.damageTimer = c.every;
    _v3.set((this.rng() < 0.5 ? -1 : 1) * 0.66, 0, KF21_POINTS.nozzleEnd).applyQuaternion(p.flight.quat).add(p.flight.pos);
    this.fx.smoke(_v3, c.smoke, ratio < c.fireBelow ? PALETTE.fx.smokeB : PALETTE.fx.smokeA);
    if (ratio < c.fireBelow) this.fx.fire(_v3, p.velocity, c.fire);
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
  /** 살아 있는 적기 하나를 실제 피해 경로로 격추한다(킬캠·리플레이 검증용) */
  debugKill() {
    const e = this.enemies.list.find((x) => x.alive);
    if (!e) return false;
    damageEnemy(this.ctx, e, e.cfg.hp * 10, 'gun');
    return true;
  }

  debugSkip(success = true) {
    if (this.mode !== 'mission' || this.phase !== PHASE.ACTIVE) return false;
    if (success) {
      for (const e of this.enemies.list) if (e.alive) e.despawn();
      this.stats.kills = this.total;
      this._debugSkipped = true;
      for (const o of this.engine.objectives) if (o.required) this.engine._credit(o, o.count);
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

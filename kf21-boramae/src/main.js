// KF-21 BORAMAE — 조립 지점: 렌더러·월드·세션·UI·상태 머신을 만들고 연결한다.
import * as THREE from 'three';
import { GameLoop } from './core/game-loop.js';
import { StateMachine } from './core/state-machine.js';
import { Input } from './core/input.js';
import { Settings, safeStorage } from './core/settings.js';
import { SaveData } from './core/save.js';
import { QualityManager } from './core/quality.js';
import { audio } from './core/audio-stub.js';
import { isDebugEnabled, installDebug, debugState } from './core/debug.js';
import { MissionSession } from './core/mission-session.js';
import { LOOP, STATE, TRANSITIONS } from './data/app.js';
import { PLAYER_AIRCRAFT } from './data/aircraft.js';
import { CAMERA } from './data/camera.js';
import { WORLD } from './data/world.js';
import { MISSIONS } from './data/missions.js';
import { LOADOUT } from './data/weapons.js';
import { KF21_POINTS } from './entities/kf21-shape.js';
import { Visuals } from './core/visuals.js';
import { Player } from './entities/player.js';
import { CameraRig } from './flight/camera-rig.js';
import { World } from './world/world.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { toast } from './ui/toast.js';
import { createMenu } from './ui/menu.js';
import { createMissionSelect } from './ui/mission-select.js';
import { createBriefing } from './ui/briefing.js';
import { createPause } from './ui/pause.js';
import { createResult } from './ui/result.js';
import { createSettingsDialog } from './ui/settings-panel.js';
import { createOnline } from './auth/online.js';
import { createLoading } from './ui/loading.js';
import { runBenchmark } from './core/benchmark.js';
import { isMobileMode } from './core/device.js';
import { PostFX } from './world/post.js';
import { Autopilot } from './core/autopilot.js';
import { createAutoplayPanel } from './ui/autoplay-panel.js';
import { missionById, nextMission } from './data/missions.js';
import { GpuParticles, PARTICLE_LAYER } from './entities/gpu-particles.js';

const appEl = document.getElementById('app');
const stage = document.getElementById('stage');
const uiEl = document.getElementById('ui');

// ── 렌더러·월드·기체 ─────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.localClippingEnabled = true; // 1인칭에서 조종석 자리의 동체 외피를 잘라낸다
renderer.info.autoReset = false; // 후처리처럼 여러 번 그리는 프레임도 합계로 재기 위해 직접 초기화한다
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, CAMERA.far);
const world = new World(scene, WORLD);

const storage = safeStorage();
const settings = new Settings(storage);
const save = new SaveData(storage);

const player = new Player(PLAYER_AIRCRAFT);
scene.add(player.root);
const visuals = new Visuals({ renderer, scene, world, player, settings, tuning: PLAYER_AIRCRAFT });
const rig = new CameraRig(camera, CAMERA, KF21_POINTS.eye);
rig.shakeEnabled = settings.get('cameraShake');

const input = new Input();
input.setSettings(settings);
input.touchMode = isMobileMode(settings.get('inputMode'));
input.attach(stage);
const inputHooks = {
  onMode: () => { input.touchMode = isMobileMode(settings.get('inputMode')); input.releaseLock(); },
  onRecalibrate: () => { if (window.__kf21Touch) window.__kf21Touch.recalibrate(); },
  onTutorial: () => { settings.set('tutorialDone', false); toast('다음에 미션 1을 시작할 때 튜토리얼이 나와요.'); },
  mobileQualityLimit: true,
};
const session = new MissionSession({ scene, camera, world, rig, input, settings, audio, player, loadout: LOADOUT });
visuals.enemies = session.enemies;
const hud = new Hud(document.getElementById('hud'), document.getElementById('damage'));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  session.resize(w, h);
  hud.resize(w, h);
  if (post) post.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  session.gpuFrame.depth = post ? post.depthTexture : null;
  session.gpuFrame.w = post ? post.w : w;
  session.gpuFrame.h = post ? post.h : h;
}
const loading = createLoading(appEl);
let post = null; // 후처리(높음·최고에서만 존재)
const sunScreen = new THREE.Vector3();
const _sunWorld = new THREE.Vector3();
const postFrame = { sun: sunScreen, flash: 0, turn: 0, particleLayer: 0 };
/** 프리셋 적용: tier가 바뀌면 모델·재질을 통째로 다시 만들고(로딩 화면), 구름·파티클 양을 맞춘다. */
async function applyPreset(name, cfg) {
  const tierChanged = visuals.tier !== cfg.tier;
  if (visuals.tier !== cfg.tier) {
    quality.busy = true;
    const showBar = cfg.tier !== 'low'; // 낮음은 로딩 바 없이 바로
    if (showBar) loading.show(`그래픽 준비 중 · ${cfg.label}`);
    try {
      await visuals.build(cfg, showBar ? (f, text) => loading.progress(f, text) : null);
    } finally {
      loading.hide();
      quality.busy = false;
    }
  }
  if (post) { post.dispose(); post = null; }
  if (cfg.post) post = new PostFX(renderer, cfg.post, WORLD.post);
  world.setShadows(renderer, cfg.shadowMap);
  world.setCloudStyle(cfg.cloudStyle === 'soft' ? 'soft' : 'lowpoly', cfg.cloudLayers);
  world.setTerrainDetail(cfg.terrainSegments);
  // 파티클: 낮음은 CPU 인스턴싱, 높음·최고는 GPU 셰이더(소프트 파티클)
  session.fx.setBackend(cfg.particleCapacity ? new GpuParticles(cfg.particleCapacity, world.sunDirection) : null, cfg.particleScale);
  postFrame.particleLayer = cfg.particleCapacity ? PARTICLE_LAYER : 0;
  world.setCloudFraction(cfg.clouds);
  session.fx.setParticleFraction(cfg.particles);
  session.simpleTakeoff = cfg.tier === 'low';
  // 메뉴 화면에서 프리셋을 바꿨으면 배경(시네마틱 ↔ 회전)도 바로 바꾼다
  if (tierChanged && session.mode === 'showcase' && typeof fsm !== 'undefined' && fsm.name) session.startShowcase();
  resize();
}
const quality = new QualityManager({
  renderer, settings,
  onApply: applyPreset,
  onLowered: (name) => toast(`화면이 느려서 그래픽 품질을 낮췄어요(${quality.cfg.label}). 설정에서 바꿀 수 있어요.`),
});
window.addEventListener('resize', resize);
settings.onChange((key, value) => {
  if (key === 'cameraShake' || key === '*') rig.shakeEnabled = settings.get('cameraShake');
  if (key === 'paint' || key === '*') visuals.setPaint(settings.get('paint'));
  void value;
});

// ── 화면 흐름 ────────────────────────────────────────────────────────────
const fsm = new StateMachine(TRANSITIONS);
const screens = new Screens(document.getElementById('fade'));
/** 페이드와 함께 상태 전환 */
const goto = (state, payload) => screens.fade(() => fsm.go(state, payload));

const online = createOnline({ save, settings, uiEl, toast });
const settingsDialog = createSettingsDialog(settings, quality, inputHooks);
let currentMission = MISSIONS[0];

const ui = {
  menu: createMenu({ start: () => goto(STATE.SELECT), settings: () => settingsDialog.open() }),
  select: createMissionSelect({
    back: () => goto(STATE.MENU),
    brief: (mission) => goto(STATE.BRIEFING, { mission }),
    ranking: (mission) => online.openRanking(mission),
  }, save),
  briefing: createBriefing({
    back: (mission) => goto(STATE.SELECT, { missionId: mission.id }),
    launch: (mission) => goto(STATE.PLAYING, { mission }),
  }),
  pause: createPause({
    resume: () => fsm.go(STATE.PLAYING), // 3-2-1 없이 즉시 재개
    restart: () => goto(STATE.PLAYING, { mission: currentMission, restart: true }),
    menu: () => goto(STATE.MENU),
  }, settings, quality, inputHooks),
  result: createResult({
    next: (mission) => goto(STATE.BRIEFING, { mission }),
    retry: (mission) => goto(STATE.PLAYING, { mission }),
    menu: () => goto(STATE.MENU),
    ranking: (mission) => online.openRanking(mission),
  }),
};
for (const [name, screen] of Object.entries(ui)) { uiEl.appendChild(screen.el); screens.add(name, screen); }
uiEl.appendChild(settingsDialog.el);
online.mount(ui.menu.el.querySelector('#account'));

const backdrop = () => { input.setLockWanted(false); if (session.mode !== 'showcase') session.startShowcase(); };
fsm.add(STATE.MENU, { enter: () => { backdrop(); screens.show('menu'); } });
fsm.add(STATE.SELECT, { enter: (payload) => { backdrop(); screens.show('select', payload); } });
fsm.add(STATE.BRIEFING, { enter: (payload) => { backdrop(); currentMission = payload.mission; screens.show('briefing', payload); } });
fsm.add(STATE.PLAYING, {
  enter: (payload, prev) => {
    if (prev !== STATE.PAUSED || (payload && payload.restart)) {
      currentMission = (payload && payload.mission) || currentMission;
      session.startMission(currentMission);
    }
    input.reset();
    input.centerCursor();
    // 미션 중에는 포인터락(PC). 자동플레이·모바일에서는 쓰지 않는다. 잠글 수 없으면 일반 커서 조준으로 폴백한다
    input.setLockWanted(!autopilot.enabled && !input.touchMode);
    screens.show(null);
  },
});
fsm.add(STATE.PAUSED, { enter: () => { input.reset(); input.setLockWanted(false); screens.show('pause'); } });
fsm.add(STATE.RESULT, { enter: (payload) => { input.setLockWanted(false); screens.show('result', payload); } });
fsm.onChange((name) => {
  hud.setVisible(name === STATE.PLAYING || name === STATE.PAUSED);
  appEl.classList.toggle('playing', name === STATE.PLAYING);
  appEl.dataset.state = name;
});
fsm.go(STATE.MENU);

let lastResult = null; // 가장 최근 미션 결과(자동플레이가 다음 미션을 고르는 데 쓴다)
session.onFinished = (result) => {
  lastResult = result;
  if (autoPanel) autoPanel.record(result);
  const saved = save.applyResult(result);
  goto(STATE.RESULT, { result, saved });
  online.submitResult(result, (note) => ui.result.setNote(note, result));
};

// ── 자동플레이(?auto=1 &skill=0~100 &mission=m1|m2|m3 &loop=0|1 &view=chase|cockpit &takeoff=skip|full) ──
// 봇이 키·마우스 입력 값만 만들어 낸다. 주소로 켜지 않으면 아무 영향이 없다.
const q = new URLSearchParams(location.search);
const autopilot = new Autopilot(session);
session.autopilot = autopilot;
const autoOpts = { mission: missionById(q.get('mission')) ? q.get('mission') : MISSIONS[0].id, loop: q.get('loop') !== '0' };
let autoPanel = null;
let autoResultAt = 0;
function autoSyncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('skill', autopilot.skill);
  u.searchParams.set('mission', autoOpts.mission);
  u.searchParams.set('loop', autoOpts.loop ? 1 : 0);
  history.replaceState(null, '', u);
}
function autoStartMission() {
  const mission = missionById(autoOpts.mission);
  if (!mission || screens.busy) return;
  if (fsm.name === STATE.PLAYING) { currentMission = mission; session.startMission(mission); return; }
  if (fsm.name === STATE.MENU) fsm.go(STATE.SELECT);
  if (fsm.name === STATE.SELECT) fsm.go(STATE.BRIEFING, { mission });
  if (fsm.name === STATE.BRIEFING || fsm.name === STATE.RESULT || fsm.name === STATE.PAUSED) fsm.go(STATE.PLAYING, { mission, restart: true });
}
if (q.get('auto') === '1') {
  autopilot.setSkill(Number(q.get('skill') ?? 40));
  if (q.get('view') === 'cockpit' || q.get('view') === 'chase') session.view = q.get('view');
  if (q.get('takeoff') === 'skip') session.skipTakeoffOverride = true; else if (q.get('takeoff') === 'full') session.skipTakeoffOverride = false;
  autoPanel = createAutoplayPanel({
    autopilot, options: autoOpts, onChange: autoSyncUrl,
    onStart: () => { autopilot.enable(true); autoStartMission(); },
    onStop: () => autopilot.enable(false),
  });
  uiEl.appendChild(autoPanel.el);
  autopilot.enable(true);
  autoSyncUrl();
  // 메뉴·결과 화면을 사람 대신 넘긴다
  setInterval(() => {
    if (!autopilot.enabled || screens.busy || loading.visible) return;
    autoPanel.setMode(fsm.name === STATE.PLAYING ? autopilot.status.mode : fsm.name === STATE.RESULT ? '결과 확인' : '준비');
    if (fsm.name === STATE.MENU || fsm.name === STATE.SELECT || fsm.name === STATE.BRIEFING || fsm.name === STATE.PAUSED) autoStartMission();
    else if (fsm.name === STATE.RESULT) {
      if (!autoResultAt) autoResultAt = performance.now();
      if (performance.now() - autoResultAt < 3800) return; // 결과 화면을 잠깐 보여 준다
      autoResultAt = 0;
      if (lastResult && lastResult.success && autoOpts.loop) { const n = nextMission(lastResult.missionId); autoOpts.mission = n ? n.id : MISSIONS[0].id; autoPanel.refresh(); autoSyncUrl(); }
      else if (!autoOpts.loop && lastResult && lastResult.success) { autopilot.enable(false); autoPanel.refresh(); return; }
      autoStartMission();
    }
  }, 500);
}

const pause = () => { if (fsm.name === STATE.PLAYING && !screens.busy) fsm.go(STATE.PAUSED); };
input.onLockChange((locked) => { if (!locked && fsm.name === STATE.PLAYING && input.lockWanted && !autopilot.enabled) pause(); }); // 잠금이 풀리면(ESC 포함) 자동 일시정지
input.onBlur(() => { if (!autopilot.enabled) pause(); }); // 자동플레이 중에는 포커스가 패널로 옮겨 가도 멈추지 않는다 // 창 포커스가 사라지면 자동 일시정지
input.onKey((code) => {
  if (screens.busy) return;
  if (code === 'Escape') {
    if (online.closeTop()) return;
    if (settingsDialog.isOpen) settingsDialog.close();
    else if (fsm.name === STATE.PLAYING) pause();
    else if (fsm.name === STATE.PAUSED) fsm.go(STATE.PLAYING);
    else if (fsm.name === STATE.BRIEFING) goto(STATE.SELECT, { missionId: currentMission.id });
    else if (fsm.name === STATE.SELECT) goto(STATE.MENU);
    return;
  }
  if (fsm.name !== STATE.PLAYING) return;
  if (code === 'Enter' || code === 'Space') { session.skipTakeoff(); return; }
  if (code === 'KeyV') session.toggleView();
  else if (code === 'KeyF') session.switchWeapon();
});

// ── 루프 ─────────────────────────────────────────────────────────────────
const loop = new GameLoop({
  ...LOOP,
  step(dt) {
    if (fsm.name === STATE.PAUSED) return; // 일시정지 중에는 게임 시간이 완전히 멈춘다
    session.step(dt);
  },
  render(alpha, frameDt) {
    const paused = fsm.name === STATE.PAUSED;
    input.poll(frameDt);
    session.render(paused ? 1 : alpha, paused ? 0 : frameDt);
    visuals.animate(player.time, paused ? 0 : frameDt);
    renderer.info.reset();
    world.followLight(player.renderPos);
    if (post) {
      // 해의 화면 위치(렌즈 플레어용): 화면 안쪽일수록 강하다
      _sunWorld.copy(camera.position).addScaledVector(world.sunDirection, 10000).project(camera);
      const inFront = _sunWorld.z < 1 ? 1 : 0;
      sunScreen.set(_sunWorld.x * 0.5 + 0.5, _sunWorld.y * 0.5 + 0.5, inFront * Math.max(0, 1 - Math.max(Math.abs(_sunWorld.x), Math.abs(_sunWorld.y)) * 0.85));
      postFrame.flash = session.feedback.flash;
      postFrame.turn = Math.min(1, Math.abs(player.flight.yawRate) * 1.4 + Math.abs(player.flight.pitchRate) * 0.9);
      post.render(scene, camera, postFrame);
      renderer.setRenderTarget(null);
    } else renderer.render(scene, camera);
    hud.render(session, camera, paused ? 0 : frameDt);
    quality.frame(frameDt, !paused && !document.hidden && !loading.visible);
    if (debugPanel) debugPanel(frameDt);
  },
});

// ── 디버그 훅(?debug=1 또는 개발 서버에서만) ─────────────────────────────
let debugPanel = null;
if (isDebugEnabled()) {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.hidden = true;
  appEl.appendChild(panel);
  const proj = new THREE.Vector3();
  let acc = 0;
  let frames = 0;
  let fps = 0;
  let lastFrame = performance.now();
  let sampler = null; // measure() 진행 중이면 프레임 시간을 모은다
  debugPanel = (dt) => {
    const now = performance.now();
    if (sampler) {
      sampler.ms.push(now - lastFrame);
      sampler.calls = Math.max(sampler.calls, renderer.info.render.calls);
      sampler.tris = Math.max(sampler.tris, renderer.info.render.triangles);
      if (now >= sampler.until) { const done = sampler; sampler = null; done.finish(); }
    }
    lastFrame = now;
    acc += dt; frames++;
    if (acc < 0.5) return;
    fps = frames / acc; acc = 0; frames = 0;
    if (debugState.showFps) {
      const i = renderer.info;
      panel.textContent = `FPS ${fps.toFixed(0)}  preset ${quality.name}\ncalls ${i.render.calls}  tris ${i.render.triangles}\ngeo ${i.memory.geometries}  tex ${i.memory.textures}\nparticles ${session.fx.activeParticles}  state ${fsm.name}`;
    }
  };
  installDebug({
    skipMission: (success) => session.debugSkip(success),
    spawnEnemy: (n, opts) => session.debugSpawn(n, opts),
    onShowFps: (on) => { panel.hidden = !on; },
    extra: {
      state: () => ({
        state: fsm.name, mode: session.mode, phase: session.phase, tick: loop.tick, frame: loop.frame, view: session.view, fps,
        hp: player.hp, stats: { ...session.stats }, weapon: { ...session.weapons.uiState(), target: undefined }, alive: session.enemies.aliveCount,
        total: session.total, mission: session.mission && session.mission.id, quality: quality.name, busy: screens.busy,
        particles: session.fx.activeParticles,
        info: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length },
      }),
      flight: () => { const f = player.flight; return { x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.yaw, pitch: f.pitch, roll: f.roll, speed: f.speed }; },
      /** 살아 있는 적기와 화면 좌표·기체 기준 방향(자동 플레이 테스트용) */
      enemies: () => session.enemies.list.filter((e) => e.alive).map((e) => {
        proj.copy(e.group.position).project(camera);
        const front = proj.z < 1;
        const rel = e.pos.clone().sub(player.flight.pos);
        const dist = rel.length();
        const local = rel.applyQuaternion(player.flight.quat.clone().invert());
        return { id: e.index, hp: e.hp, dist, sx: (proj.x * 0.5 + 0.5) * window.innerWidth, sy: (-proj.y * 0.5 + 0.5) * window.innerHeight, front, state: e.ai.state,
          bearing: Math.atan2(local.x, -local.z), elevation: Math.asin(Math.max(-1, Math.min(1, rel.clone().applyQuaternion(player.flight.quat).y / Math.max(dist, 1)))), dy: e.pos.y - player.flight.pos.y };
      }),
      go: (name, payload) => fsm.go(name, payload),
      startMission: (id) => { const m = MISSIONS.find((x) => x.id === id); if (fsm.name === STATE.PLAYING) { currentMission = m; session.startMission(m); } else { if (fsm.name === STATE.MENU) fsm.go(STATE.SELECT); if (fsm.name !== STATE.BRIEFING) fsm.go(STATE.BRIEFING, { mission: m }); fsm.go(STATE.PLAYING, { mission: m }); } },
      advance: (seconds) => loop.advance(seconds),
      timeScale: (s) => { loop.timeScale = s; },
      setInput: (o) => { session.inputOverride = o; },
      setTrigger: (v) => { session.triggerOverride = v; },
      autopilot: () => autopilot,
      inspect: (f) => { session.showcaseHold = !!f; rig.fixed = f; rig.snap = true; if (!f) { rig.mode = ''; session._applyView(); } },
      inspectEnemy: (f) => {
        debugState.freezeEnemies = true;
        let e = session.enemies.list.find((x) => x.alive);
        if (!e) { session.debugSpawn(1, { distance: 200 }); e = session.enemies.list.find((x) => x.alive); }
        rig.fixed = { ...f, target: { pos: e.group.position, quat: e.group.quaternion } };
      },
      background: (hex) => { scene.background.setHex(hex); world.sky.visible = false; world.clouds.group.visible = false; world.terrain.mesh.visible = false; },
      origin: () => ({ ...world.origin }),
      setOrigin: (x, z) => { world.origin.x = x; world.origin.z = z; },
      teleport: (x, y, z, yaw = 0) => { player.reset({ x, y, z, yaw }); rig.snap = true; },
      controls: (p, t) => { visuals.current.model.setControls(p, t, 10); },
      visuals: () => visuals,
      session: () => session,
      save: () => save,
      settings: () => settings,
      quality: () => quality,
      /** seconds 동안 FPS(평균·최저)·드로우콜·삼각형 수를 잰다. */
      measure: (seconds = 3) => new Promise((resolve) => {
        sampler = {
          ms: [], calls: 0, tris: 0, until: performance.now() + seconds * 1000,
          finish() {
            const ms = this.ms.slice(1).sort((x, y) => x - y);
            const avg = ms.reduce((x, y) => x + y, 0) / Math.max(1, ms.length);
            const worst = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.99))] || 0; // 하위 1% 프레임
            resolve({ preset: quality.name, frames: ms.length, fpsAvg: +(1000 / avg).toFixed(1), fpsMin: +(1000 / worst).toFixed(1), drawCalls: this.calls, triangles: this.tris, pixelRatio: renderer.getPixelRatio() });
          },
        };
      }),
      benchmark: (force) => runBenchmark(renderer, null, force),
      setQuality: (name) => quality.setQuality(name, true),
      online: () => online,
    },
  });
}

// ── 시작: 첫 실행이면 벤치마크로 프리셋을 고른 뒤 적용한다 ───────────────
resize();
if (!settings.get('benchmarked')) {
  loading.show('그래픽 성능 확인 중');
  loading.progress(0, '이 기기에 맞는 그래픽 품질을 고르고 있어요');
  await new Promise((r) => requestAnimationFrame(r));
  let pick = 'low';
  try {
    const result = await runBenchmark(renderer, (f) => loading.progress(f * 0.9));
    pick = result.preset;
    if (debugState.enabled) console.info('[KF21] benchmark', result);
  } catch (e) { console.warn('[KF21] 벤치마크 실패, 낮음으로 시작해요', e); }
  quality.name = pick;
  settings.set('quality', pick);
  settings.set('benchmarked', true);
  loading.hide();
}
await quality.apply();
loop.start();
window.__kf21Ready = true;

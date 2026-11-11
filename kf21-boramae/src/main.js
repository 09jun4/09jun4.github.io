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
import { createKF21, KF21_POINTS } from './entities/kf21-model.js';
import { createCockpit } from './entities/cockpit.js';
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

const appEl = document.getElementById('app');
const stage = document.getElementById('stage');
const uiEl = document.getElementById('ui');

// ── 렌더러·월드·기체 ─────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false; // 후처리처럼 여러 번 그리는 프레임도 합계로 재기 위해 직접 초기화한다
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, CAMERA.far);
const world = new World(scene, WORLD);

const storage = safeStorage();
const settings = new Settings(storage);
const save = new SaveData(storage);

const model = createKF21(PLAYER_AIRCRAFT.model);
const cockpit = createCockpit(KF21_POINTS.eye);
const player = new Player(PLAYER_AIRCRAFT, model, cockpit);
scene.add(model.group);
const rig = new CameraRig(camera, CAMERA, KF21_POINTS.eye);
rig.shakeEnabled = settings.get('cameraShake');

const input = new Input();
input.attach(stage);
const session = new MissionSession({ scene, camera, world, rig, input, settings, audio, player, loadout: LOADOUT });
const hud = new Hud(document.getElementById('hud'), document.getElementById('damage'));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  session.resize(w, h);
  hud.resize(w, h);
}
const loading = createLoading(appEl);
/** 프리셋 적용: 구름·파티클 양을 맞춘다(모델 교체는 이후 단계에서 visuals가 맡는다). */
function applyPreset(name, cfg) {
  world.setCloudFraction(cfg.clouds);
  session.fx.setParticleFraction(cfg.particles);
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
  void value;
});

// ── 화면 흐름 ────────────────────────────────────────────────────────────
const fsm = new StateMachine(TRANSITIONS);
const screens = new Screens(document.getElementById('fade'));
/** 페이드와 함께 상태 전환 */
const goto = (state, payload) => screens.fade(() => fsm.go(state, payload));

const online = createOnline({ save, settings, uiEl, toast });
const settingsDialog = createSettingsDialog(settings, quality);
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
  }, settings, quality),
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

const backdrop = () => { if (session.mode !== 'showcase') session.startShowcase(); };
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
    screens.show(null);
  },
});
fsm.add(STATE.PAUSED, { enter: () => { input.reset(); screens.show('pause'); } });
fsm.add(STATE.RESULT, { enter: (payload) => screens.show('result', payload) });
fsm.onChange((name) => {
  hud.setVisible(name === STATE.PLAYING || name === STATE.PAUSED);
  appEl.classList.toggle('playing', name === STATE.PLAYING);
  appEl.dataset.state = name;
});
fsm.go(STATE.MENU);

session.onFinished = (result) => {
  const saved = save.applyResult(result);
  goto(STATE.RESULT, { result, saved });
  online.submitResult(result, (note) => ui.result.setNote(note, result));
};

const pause = () => { if (fsm.name === STATE.PLAYING && !screens.busy) fsm.go(STATE.PAUSED); };
input.onBlur(pause); // 창 포커스가 사라지면 자동 일시정지
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
    session.render(paused ? 1 : alpha, paused ? 0 : frameDt);
    renderer.info.reset();
    renderer.render(scene, camera);
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
      inspect: (f) => { rig.fixed = f; rig.snap = true; if (!f) { rig.mode = ''; session._applyView(); } },
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
      controls: (p, t) => { model.setControls(p, t, 10); },
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

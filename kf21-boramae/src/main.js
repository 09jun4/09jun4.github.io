// KF-21 BORAMAE — 조립 지점. (마일스톤 7: HUD)
import * as THREE from 'three';
import { GameLoop } from './core/game-loop.js';
import { StateMachine } from './core/state-machine.js';
import { Input } from './core/input.js';
import { Settings, safeStorage } from './core/settings.js';
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

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 60000);
const world = new World(scene, WORLD);
const settings = new Settings(safeStorage());

const model = createKF21(PLAYER_AIRCRAFT.model);
const cockpit = createCockpit(KF21_POINTS.eye);
const player = new Player(PLAYER_AIRCRAFT, model, cockpit);
scene.add(model.group);
const rig = new CameraRig(camera, CAMERA, KF21_POINTS.eye);

const input = new Input();
input.attach(stage);
const session = new MissionSession({ scene, camera, world, rig, input, settings, audio, player, loadout: LOADOUT });
session.startShowcase();
const hud = new Hud(document.getElementById('hud'), document.getElementById('damage'));
const appEl = document.getElementById('app');

const fsm = new StateMachine(TRANSITIONS);
fsm.add(STATE.MENU, { enter: () => session.startShowcase() });
fsm.add(STATE.SELECT, {});
fsm.add(STATE.BRIEFING, {});
fsm.add(STATE.PLAYING, { enter: (payload, prev) => { if (prev !== STATE.PAUSED) session.startMission((payload && payload.mission) || MISSIONS[0]); } });
fsm.add(STATE.PAUSED, {});
fsm.add(STATE.RESULT, {});
fsm.onChange((name) => {
  const inPlay = name === STATE.PLAYING || name === STATE.PAUSED;
  hud.setVisible(inPlay);
  appEl.classList.toggle('playing', name === STATE.PLAYING);
});
fsm.go(STATE.MENU);
session.onFinished = (result) => { lastResult = result; fsm.go(STATE.RESULT, result); };
let lastResult = null;

input.onKey((code) => {
  if (fsm.name !== STATE.PLAYING) return;
  if (code === 'KeyV') session.toggleView();
  else if (code === 'KeyF') session.switchWeapon();
});

const loop = new GameLoop({
  ...LOOP,
  step(dt) {
    if (fsm.name === STATE.PAUSED) return;
    session.step(dt);
  },
  render(alpha, frameDt) {
    session.render(fsm.name === STATE.PAUSED ? 1 : alpha, fsm.name === STATE.PAUSED ? 0 : frameDt);
    renderer.render(scene, camera);
    hud.render(session, camera, frameDt);
  },
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  session.resize(window.innerWidth, window.innerHeight);
  hud.resize(window.innerWidth, window.innerHeight);
});

if (isDebugEnabled()) {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.hidden = true;
  document.getElementById('app').appendChild(panel);
  const proj = new THREE.Vector3();
  installDebug({
    skipMission: (success) => session.debugSkip(success),
    spawnEnemy: (n, opts) => session.debugSpawn(n, opts),
    onShowFps: (on) => { panel.hidden = !on; },
    extra: {
      state: () => ({
        state: fsm.name, mode: session.mode, phase: session.phase, tick: loop.tick, frame: loop.frame, view: session.view,
        hp: player.hp, stats: { ...session.stats }, weapon: { ...session.weapons.uiState(), target: undefined }, alive: session.enemies.aliveCount,
        particles: session.fx.activeParticles, info: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geometries: renderer.info.memory.geometries },
      }),
      flight: () => { const f = player.flight; return { x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.yaw, pitch: f.pitch, roll: f.roll, speed: f.speed }; },
      /** 살아 있는 적기와 화면 좌표(자동 플레이 테스트용) */
      enemies: () => session.enemies.list.filter((e) => e.alive).map((e) => {
        proj.copy(e.group.position).project(camera);
        return { id: e.index, hp: e.hp, dist: e.pos.distanceTo(player.flight.pos), sx: (proj.x * 0.5 + 0.5) * window.innerWidth, sy: (-proj.y * 0.5 + 0.5) * window.innerHeight, front: proj.z < 1, state: e.ai.state };
      }),
      result: () => lastResult,
      go: (name, payload) => fsm.go(name, payload),
      advance: (seconds) => loop.advance(seconds),
      timeScale: (s) => { loop.timeScale = s; },
      setInput: (o) => { session.inputOverride = o; },
      setTrigger: (v) => { session.triggerOverride = v; },
      inspect: (f) => { rig.fixed = f; rig.snap = true; if (!f) { rig.mode = ''; session._applyView(); } },
      /** 적기 모델 확인: 적기 한 대를 세워 두고 고정 시점으로 본다 */
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
    },
  });
  setInterval(() => {
    if (debugState.showFps) panel.textContent = `state ${fsm.name}\ntick ${loop.tick}\ncalls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`;
  }, 250);
}

loop.start();
window.__kf21Ready = true;

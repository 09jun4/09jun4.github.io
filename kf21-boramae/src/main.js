// KF-21 BORAMAE — 조립 지점. (마일스톤 2: 기체 모델 + 비행 + 카메라)
import * as THREE from 'three';
import { GameLoop } from './core/game-loop.js';
import { StateMachine } from './core/state-machine.js';
import { Input } from './core/input.js';
import { isDebugEnabled, installDebug, debugState } from './core/debug.js';
import { LOOP, STATE, TRANSITIONS } from './data/app.js';
import { PLAYER_AIRCRAFT } from './data/aircraft.js';
import { CAMERA } from './data/camera.js';
import { createKF21, KF21_POINTS } from './entities/kf21-model.js';
import { createCockpit } from './entities/cockpit.js';
import { Player } from './entities/player.js';
import { CameraRig, VIEW } from './flight/camera-rig.js';

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5aa7e6);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 60000);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x56708a, 1.5));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(0.5, 0.8, 0.35);
scene.add(sun);

const model = createKF21(PLAYER_AIRCRAFT.model);
const cockpit = createCockpit(KF21_POINTS.eye);
const player = new Player(PLAYER_AIRCRAFT, model, cockpit);
scene.add(model.group);
const rig = new CameraRig(camera, CAMERA, KF21_POINTS.eye);
let view = VIEW.CHASE;
let inputOverride = null;

const input = new Input();
input.attach(stage);
input.onKey((code) => {
  if (code === 'KeyV' && fsm.name === STATE.PLAYING) {
    view = view === VIEW.CHASE ? VIEW.COCKPIT : VIEW.CHASE;
    applyView();
  }
});
function applyView() {
  const mode = fsm.name === STATE.PLAYING ? view : VIEW.ORBIT;
  rig.setMode(mode);
  player.setCockpitView(mode === VIEW.COCKPIT);
}

const fsm = new StateMachine(TRANSITIONS);
for (const name of Object.values(STATE)) fsm.add(name, { enter: applyView });
fsm.go(STATE.MENU);

const loop = new GameLoop({
  ...LOOP,
  step(dt) {
    if (fsm.name === STATE.PAUSED) return;
    if (fsm.name === STATE.PLAYING) {
      player.input.pitch = inputOverride ? inputOverride.pitch : input.axis('KeyW', 'KeyS');
      player.input.turn = inputOverride ? inputOverride.turn : input.axis('KeyA', 'KeyD');
    } else {
      player.input.pitch = 0;
      player.input.turn = 0;
    }
    player.step(dt);
  },
  render(alpha, frameDt) {
    player.interpolate(alpha);
    player.animate(frameDt);
    rig.update(player.view, frameDt);
    renderer.render(scene, camera);
  },
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

if (isDebugEnabled()) {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.hidden = true;
  document.getElementById('app').appendChild(panel);
  installDebug({
    skipMission: () => false,
    spawnEnemy: () => 0,
    onShowFps: (on) => { panel.hidden = !on; },
    extra: {
      state: () => ({ state: fsm.name, tick: loop.tick, frame: loop.frame, view, triangles: model.triangles, info: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles } }),
      flight: () => { const f = player.flight; return { x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.yaw, pitch: f.pitch, roll: f.roll, speed: f.speed }; },
      go: (name, payload) => fsm.go(name, payload),
      advance: (seconds) => loop.advance(seconds),
      timeScale: (s) => { loop.timeScale = s; },
      setInput: (o) => { inputOverride = o; },
      /** 모델 확인용 고정 시점. null이면 해제 */
      inspect: (f) => { rig.fixed = f; rig.snap = true; if (!f) { rig.mode = ''; applyView(); } },
      background: (hex) => { scene.background.setHex(hex); },
      controls: (p, t) => { model.setControls(p, t, 10); },
    },
  });
  setInterval(() => {
    if (debugState.showFps) panel.textContent = `state ${fsm.name}\ntick ${loop.tick}\ncalls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`;
  }, 250);
}

loop.start();
window.__kf21Ready = true;

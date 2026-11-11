// KF-21 BORAMAE — 조립 지점. (마일스톤 1: 루프·상태 머신·디버그 훅 뼈대)
import * as THREE from 'three';
import { GameLoop } from './core/game-loop.js';
import { StateMachine } from './core/state-machine.js';
import { Input } from './core/input.js';
import { isDebugEnabled, installDebug, debugState } from './core/debug.js';
import { LOOP, STATE, TRANSITIONS } from './data/app.js';

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5aa7e6);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 60000);
camera.position.set(0, 4, 24);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x41607a, 1.4));
const box = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 10), new THREE.MeshLambertMaterial({ color: 0x8a949c, flatShading: true }));
scene.add(box);
let prevAngle = 0;
let angle = 0;

const input = new Input();
input.attach(stage);

const fsm = new StateMachine(TRANSITIONS);
for (const name of Object.values(STATE)) fsm.add(name, {});
fsm.go(STATE.MENU);

const loop = new GameLoop({
  ...LOOP,
  step(dt) {
    prevAngle = angle;
    if (fsm.name !== STATE.PAUSED) angle += dt * 0.6;
    fsm.step(dt);
  },
  render(alpha, frameDt) {
    box.rotation.y = prevAngle + (angle - prevAngle) * alpha;
    fsm.render(alpha, frameDt);
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
      state: () => ({ state: fsm.name, tick: loop.tick, frame: loop.frame, angle }),
      go: (name, payload) => fsm.go(name, payload),
      advance: (seconds) => loop.advance(seconds),
    },
  });
  setInterval(() => {
    if (debugState.showFps) panel.textContent = `state ${fsm.name}\ntick ${loop.tick}`;
  }, 250);
}

loop.start();
window.__kf21Ready = true;

import * as THREE from 'three';
import { generateMaze, mulberry32, openTiles, bfsDist, openNeighbors, rayWorldDist, tileOf, centerOf } from './maze.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { Ghost, createGhostAssets, GHOST_FLOAT, HEAD_FROM } from './ghost.js';
import { Bot } from './auto.js';
import { setupTouch } from './touch.js';

let auto = !!window.__AUTO || new URLSearchParams(location.search).has('auto'); // AI 자동 플레이
const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); // 터치 기기
const GHOSTS = 10;
const $ = (id) => document.getElementById(id);

// ── 렌더러 (저사양: 그림자 없음, antialias 끔, pixelRatio 1) ──
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.085);
scene.add(new THREE.AmbientLight(0x222a33, 0.9)); // 거의 0: 벽 윤곽만 겨우 보이게

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
scene.add(camera);

// 총·손전등은 별도 씬에서 그려서 벽을 뚫고 보이지 않게 한다
const viewScene = new THREE.Scene();
const viewCam = new THREE.PerspectiveCamera(60, 1, 0.01, 5);
viewScene.add(viewCam, new THREE.AmbientLight(0xffffff, 0.35));
const key = new THREE.DirectionalLight(0xfff0dd, 3.2); key.position.set(0.5, 1, 0.8); viewScene.add(key);
{ // 금속 반사용 간단한 환경맵
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#d8dde6'); g.addColorStop(0.5, '#555a63'); g.addColorStop(1, '#15171a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.fillStyle = 'rgba(255,255,255,0.9)'; for (const [px, w] of [[20, 26], [90, 14], [160, 30], [220, 12]]) x.fillRect(px, 14, w, 34);
  x.fillStyle = 'rgba(0,0,0,0.55)'; for (const px of [60, 130, 195]) x.fillRect(px, 40, 18, 50);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  viewScene.environment = pm.fromEquirectangular(t).texture;
}

const spot = new THREE.SpotLight(0xfff1d6, 0, 18, 35 * Math.PI / 180, 0.4, 1.6);
scene.add(spot, spot.target);
const muzzleLight = new THREE.PointLight(0xffc860, 0, 9, 2);
scene.add(muzzleLight);

const world = new World(scene);
const player = new Player(camera);
const ghostAssets = createGhostAssets();
const raycaster = new THREE.Raycaster();

let grid = null, ghosts = [], state = 'title', endTimer = 0;
const keys = new Set();

const weapons = new Weapons(viewScene, {
  fire: shoot,
  meleeHit: meleeHit,
  lunge: () => player.lunge(),
});
const game = { paused: false, joy: { x: 0, y: 0 }, fireHeld: false, get auto() { return auto; }, touchActive: () => COARSE && !auto && state === 'playing', setAuto, keys, player, weapons, get ghosts() { return ghosts; }, get grid() { return grid; }, get state() { return state; }, camera, shoot, newGame };
const bot = new Bot(game); game.bot = bot;
setupTouch(game, $('stage'));
window.__game = game;

// ── 판정 ─────────────────────────────────────────────
function killGhost(g) {
  scene.remove(g.mesh);
  ghosts.splice(ghosts.indexOf(g), 1);
  if (ghosts.length === 0) finish('clear');
}

function shoot() {
  scene.updateMatrixWorld(true);
  const o = camera.getWorldPosition(new THREE.Vector3());
  const d = camera.getWorldDirection(new THREE.Vector3());
  const wallD = rayWorldDist(grid, o, d, 60);
  raycaster.set(o, d); raycaster.far = wallD;
  const hits = raycaster.intersectObjects(ghosts.map(g => g.mesh), false);
  if (!hits.length) return;
  const g = hits[0].object.userData.ghost;
  const head = hits[0].point.y - GHOST_FLOAT > HEAD_FROM; // 모델 상단 25%
  if (g.damage(head ? 100 : 50)) killGhost(g);
}

function meleeHit() { // 전방 1.8m, 전방 약 60° 안 즉살
  let kills = 0;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const g of ghosts.slice()) {
    const dx = g.x - player.pos.x, dz = g.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 1.8) continue;
    if (d > 0.5 && (dx * fx + dz * fz) / d < Math.cos(30 * Math.PI / 180)) continue;
    killGhost(g); kills++;
  }
  if (kills) weapons.punch = 1.9; // 명중 시 더 큰 화면 충격
}

function finish(kind) {
  if (state !== 'playing') return;
  state = kind;
  document.exitPointerLock?.();
  $('endTitle').textContent = kind === 'clear' ? '클리어!' : '게임 오버';
  $('endText').textContent = kind === 'clear' ? '유령 10마리를 모두 처리했어요' : '유령에게 5번 맞았어요';
  $('end').classList.remove('hide');
  $('restart').classList.toggle('hide', auto);
  endTimer = 3;
}

// ── 게임 시작 ────────────────────────────────────────
function newGame(seed) {
  const rng = mulberry32(seed ?? (Math.random() * 2 ** 32) >>> 0);
  grid = generateMaze(rng);
  world.build(grid, rng);
  for (const g of ghosts) scene.remove(g.mesh);
  ghosts = [];
  const tiles = openTiles(grid);
  const [sx, sz] = tiles[Math.floor(rng() * tiles.length)];
  const nb = openNeighbors(grid, sx, sz)[0];
  player.reset(sx, sz, Math.atan2(-nb[2], -nb[3]));
  const dist = bfsDist(grid, sx, sz);
  let cand = tiles.filter(([x, z]) => dist[z][x] >= 8).sort(() => rng() - 0.5);
  if (cand.length < GHOSTS) cand = tiles.filter(([x, z]) => dist[z][x] >= 4).sort(() => rng() - 0.5);
  for (const [x, z] of cand.slice(0, GHOSTS)) {
    const g = new Ghost(ghostAssets, x, z); scene.add(g.mesh); ghosts.push(g);
  }
  weapons.reset();
  player.applyCamera(grid);
  state = 'playing';
  $('end').classList.add('hide'); $('paused').classList.add('hide'); $('title').classList.add('hide');
  $('hud').style.display = 'block';
  $('badge').style.display = auto ? 'block' : 'none';
  hudHearts(true);
}
game.newGame = newGame;

// ── HUD ──────────────────────────────────────────────
let lastHearts = -1, lastCount = -1, lastAmmo = -1, lastEquip = '';
function hudHearts(force) {
  if (!force && lastHearts === player.hp) return;
  lastHearts = player.hp;
  $('hearts').innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < player.hp ? '' : 'off'}">♥</i>`).join('');
}
function hud() {
  hudHearts();
  if (lastCount !== ghosts.length) { lastCount = ghosts.length; $('count').textContent = `유령 ${ghosts.length}/${GHOSTS}`; }
  const eq = weapons.current === 'pistol' ? '[1] 권총' : '[2] 손전등';
  const cyl = $('cyl');
  if (eq !== lastEquip) { lastEquip = eq; $('equip').textContent = eq; cyl.style.display = weapons.current === 'pistol' ? 'flex' : 'none'; lastAmmo = -1; }
  if (weapons.displayAmmo !== lastAmmo) {
    lastAmmo = weapons.displayAmmo;
    cyl.innerHTML = Array.from({ length: 5 }, (_, i) => `<b class="${i < lastAmmo ? 'on' : ''}"></b>`).join('');
  }
}

// ── 입력 ─────────────────────────────────────────────
const locked = () => document.pointerLockElement === canvas;
const playable = () => auto || COARSE || locked();
function lock() { if (!auto && !COARSE) canvas.requestPointerLock?.(); }
function startTouch() { newGame(); try { (document.documentElement.requestFullscreen?.() || Promise.resolve()).catch(() => {}); screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch (e) {} }
// AI ↔ 직접 플레이 전환 (아티팩트 버튼용)
function setAuto(v) {
  auto = !!v; keys.clear(); game.joy.x = game.joy.y = 0; game.fireHeld = false;
  $('badge').style.display = auto ? 'block' : 'none'; $('restart').classList.toggle('hide', auto);
  $('touch').classList.toggle('hide', auto || !COARSE); document.body.classList.toggle('touch-ui', COARSE && !auto);
  if (auto) { $('paused').classList.add('hide'); endTimer = Math.max(endTimer, 1); }
  else if (!COARSE && state === 'playing' && !locked()) $('paused').classList.remove('hide');
}
document.addEventListener('pointerlockchange', () => {
  if (locked()) {
    if (state === 'title') newGame();
    $('paused').classList.add('hide'); $('title').classList.add('hide');
  } else if (state === 'playing') $('paused').classList.remove('hide');
});
$('title').addEventListener('click', () => auto ? newGame() : COARSE ? startTouch() : lock());
$('paused').addEventListener('click', lock);
$('restart').addEventListener('click', () => { newGame(); lock(); });
$('touch').classList.toggle('hide', auto || !COARSE); document.body.classList.toggle('touch-ui', COARSE && !auto);
document.addEventListener('mousemove', (e) => {
  if (!locked() || state !== 'playing') return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0022));
});
document.addEventListener('mousedown', (e) => { if (locked() && state === 'playing' && e.button === 0) weapons.tryFire(); });
document.addEventListener('wheel', (e) => { if (locked() && state === 'playing') weapons.cycle(); }, { passive: true });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!auto) keys.add(e.code);
  if (state !== 'playing' || !playable() || auto) return;
  if (e.code === 'Digit1') weapons.equip('pistol');
  else if (e.code === 'Digit2') weapons.equip('flash');
  else if (e.code === 'KeyR') weapons.tryReload();
  else if (e.code === 'KeyV') weapons.tryMelee();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  const a = w / h;
  camera.aspect = a; camera.fov = camera.userData.baseFov = a >= 1.2 ? 75 : Math.min(105, 75 + (1.2 - a) * 45); camera.updateProjectionMatrix();
  viewCam.aspect = a; viewCam.fov = camera.fov - 12; viewCam.updateProjectionMatrix();
}
addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
resize();

// ── 메인 루프 ────────────────────────────────────────
let last = performance.now();
const fwd = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'playing' && !game.paused && playable()) {
    if (auto) bot.update(dt);
    else if (game.fireHeld) weapons.tryFire(); // 발사 버튼 누르고 있으면 연사(발사 간격 제한 유지)
    player.update(dt, keys, grid, game.joy);
    weapons.update(dt);
    { // 근접 펀치: 화면 확대(FOV) + 아래로 숙임 + 흔들림
      const pu = weapons.punch, base = camera.userData.baseFov || camera.fov;
      const f = base + pu * 6;
      if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
      camera.rotation.x -= pu * 0.035; camera.rotation.z += Math.sin(performance.now() * 0.06) * pu * 0.012;
    }
    for (const g of ghosts.slice()) {
      if (g.update(dt, player, grid) && player.hit()) {
        $('vignette').classList.add('hit'); requestAnimationFrame(() => requestAnimationFrame(() => $('vignette').classList.remove('hit')));
        if (player.hp <= 0) finish('over');
      }
    }
    world.update(player.pos);
    hud();
  } else if (auto && (state === 'clear' || state === 'over')) {
    endTimer -= dt; if (endTimer <= 0) newGame();
  } else if (state === 'clear' || state === 'over') {
    for (const g of ghosts) g.sync();
  }
  // 손전등 SpotLight
  camera.getWorldDirection(fwd);
  spot.position.copy(camera.position).addScaledVector(fwd, 0.1); spot.position.y -= 0.08;
  spot.target.position.copy(camera.position).addScaledVector(fwd, 5);
  spot.intensity = weapons.lightOn ? 130 : 0;
  // 총구 화염 조명 (0.05초)
  muzzleLight.position.copy(camera.position).addScaledVector(fwd, 1.0);
  muzzleLight.intensity = weapons.flashT > 0 ? 6 : 0;
  viewScene.updateMatrixWorld(true);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(viewScene, viewCam);
}
if (COARSE) { $('title').querySelector('p').textContent = '탭하여 시작'; $('title').querySelector('small').innerHTML = '왼쪽 화면: 이동 조이스틱 · 오른쪽 화면: 드래그로 시점<br>오른쪽 아래 버튼: 발사 · 재장전 · 근접 · 전환 · 기울이기<br>가로 화면을 권장해요'; }
if (auto) { $('title').querySelector('p').textContent = 'AI 자동 플레이 · 탭하여 시작'; newGame(); }
requestAnimationFrame(frame);

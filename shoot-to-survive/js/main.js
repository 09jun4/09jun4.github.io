import * as THREE from 'three';
import { hasLOS, generateMaze, mulberry32, openTiles, bfsDist, openNeighbors, rayWorldDist, tileOf, centerOf, pushOut } from './maze.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapons, timingPlan } from './weapons.js';
import { Ghost, createGhostAssets, ghostTime, GHOST_FLOAT, BODY_DMG, HEAD_DMG } from './ghost.js';
import { Bot } from './auto.js';
import { setupTouch } from './touch.js';
import { Sound, GhostVoices } from './audio.js';

let auto = !!window.__AUTO || new URLSearchParams(location.search).has('auto'); // AI 자동 플레이
const COARSE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); // 터치 기기
const GHOSTS = 10;
const $ = (id) => document.getElementById(id);

// ── 설정 (그래픽 높음/낮음, 마우스 감도) — 브라우저에 저장 ──
const settings = { quality: COARSE ? 'low' : 'high', sens: 1, volume: 0.8 }; // 터치 기기는 기본 '낮음'
try { Object.assign(settings, JSON.parse(localStorage.getItem('sts-settings') || '{}')); } catch (e) {}
if (settings.quality !== 'low' && settings.quality !== 'high') settings.quality = 'high';
settings.sens = Math.min(3, Math.max(0.2, +settings.sens || 1));
settings.volume = Math.min(1, Math.max(0, isNaN(+settings.volume) ? 0.8 : +settings.volume));
const saveSettings = () => { try { localStorage.setItem('sts-settings', JSON.stringify(settings)); } catch (e) {} };

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
const viewAmbient = new THREE.AmbientLight(0xffffff, 0.35);
viewScene.add(viewCam, viewAmbient);
const key = new THREE.DirectionalLight(0xfff0dd, 3.2); key.position.set(0.5, 1, 0.8); viewScene.add(key);
let envTex = null;
{ // 금속 반사용 간단한 환경맵 (높음에서만 사용)
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#d8dde6'); g.addColorStop(0.5, '#555a63'); g.addColorStop(1, '#15171a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.fillStyle = 'rgba(255,255,255,0.9)'; for (const [px, w] of [[20, 26], [90, 14], [160, 30], [220, 12]]) x.fillRect(px, 14, w, 34);
  x.fillStyle = 'rgba(0,0,0,0.55)'; for (const px of [60, 130, 195]) x.fillRect(px, 40, 18, 50);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromEquirectangular(t).texture;
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

const sound = new Sound(); sound.setVolume(settings.volume);
const voices = new GhostVoices(sound); voices.setQuality(settings.quality); sound.voices = voices;
const weapons = new Weapons(viewScene, {
  sound: (n, o) => { sound.play(n, o); if (sound.onPlay2) sound.onPlay2(n, weapons.time); },
  stopSound: (g) => sound.stop(g),
  fire: shoot,
  meleeHit: meleeHit,
  lunge: () => player.lunge(),
}, settings.quality);
const game = { sound, timingPlan, freeze: false, demo, get endTimer() { return endTimer; }, settings, toggleMenu, paused: false, joy: { x: 0, y: 0 }, fireHeld: false, get auto() { return auto; }, touchActive: () => COARSE && !auto && state === 'playing', setAuto, keys, player, weapons, get ghosts() { return ghosts; }, get grid() { return grid; }, get state() { return state; }, camera, shoot, newGame };
const bot = new Bot(game); game.bot = bot;
setupTouch(game, $('stage'));
window.__game = game;

// ── 판정 ─────────────────────────────────────────────
function killGhost(g) {
  voices.stopFor(g);
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
  const hits = raycaster.intersectObjects(ghosts.map(g => g.mesh), true); // 머리·팔 등 자식 메시까지
  if (!hits.length) return;
  const g = hits[0].object.userData.ghost;
  const head = !!hits[0].object.userData.head; // 머리 메시에 맞았는가
  if (g.damage(head ? HEAD_DMG : BODY_DMG)) killGhost(g); // 몸통 3발 · 머리 2발
}

function meleeHit() { // 전방 1.8m, 전방 약 60° 안의 유령에게 50 피해 (체력 100 → 두 번 때려야 죽음)
  let kills = 0, hits = 0;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const g of ghosts.slice()) {
    const dx = g.x - player.pos.x, dz = g.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 1.8) continue;
    if (d > 0.5 && (dx * fx + dz * fz) / d < Math.cos(30 * Math.PI / 180)) continue;
    hits++;
    if (g.damage(50)) { killGhost(g); kills++; continue; }
    g.stunT = 0.6; g.attackT = -1; // 맞으면 뒤로 밀리고 잠깐 기절 → 두 번째 타격 가능
    if (d > 1e-3) { const p = { x: g.x + dx / d * 0.45, z: g.z + dz / d * 0.45 }; pushOut(grid, p, 0.35); g.x = p.x; g.z = p.z; }
  }
  if (hits) weapons.punch = kills ? 1.9 : 1.3; // 명중 시 더 큰 화면 충격
}

// 사운드 타이밍 확인용: AI·유령을 멈추고 발사/빈 총/재장전 한 동작만 실행 (아티팩트 패널에서 사용)
function demo(kind) {
  game.freeze = true; keys.clear(); const w = weapons; w.reset();
  if (kind === 'dry') { w.ammo = 0; w.displayAmmo = 0; w.slots = ['spent', 'spent', 'spent', 'spent', 'spent']; }
  if (kind === 'reload') { w.ammo = 1; w.displayAmmo = 1; w.slots = ['live', 'spent', 'spent', 'spent', 'spent']; }
  w.applySlots();
  const t0 = w.time;
  if (kind === 'reload') w.tryReload(); else w.tryFire();
  return t0;
}

function finish(kind) {
  if (state !== 'playing') return;
  state = kind;
  voices.stopAll();
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
  voices.stopAll();
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
    const g = new Ghost(ghostAssets, x, z, settings.quality); scene.add(g.mesh); ghosts.push(g);
  }
  weapons.reset();
  player.applyCamera(grid);
  state = 'playing';
  $('end').classList.add('hide'); $('menu').classList.add('hide'); $('title').classList.add('hide'); game.paused = false;
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
  if (eq !== lastEquip) { lastEquip = eq; $('bMelee').style.opacity = weapons.current === 'pistol' ? '' : '0.3'; /* 손전등은 근접공격 불가 */ $('equip').textContent = eq; cyl.style.display = weapons.current === 'pistol' ? 'flex' : 'none'; lastAmmo = -1; }
  if (weapons.displayAmmo !== lastAmmo) {
    lastAmmo = weapons.displayAmmo;
    cyl.innerHTML = Array.from({ length: 5 }, (_, i) => `<b class="${i < lastAmmo ? 'on' : ''}"></b>`).join('');
  }
}

// 브라우저는 사용자 입력 뒤에만 소리를 허용한다 → 첫 클릭·터치·키 입력에서 오디오를 켠다
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => sound.unlock(), { capture: true });
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
  if (auto) { closeMenu(true); endTimer = Math.max(endTimer, 1); }
  else if (!COARSE && state === 'playing' && !locked()) showMenu();
}
// ── 메뉴 (Esc) ──
function showMenu() { $('menu').classList.remove('hide'); game.paused = true; keys.clear(); game.fireHeld = false; sound.suspend(); }
function closeMenu(noLock) { $('menu').classList.add('hide'); game.paused = false; sound.resume(); if (!noLock) lock(); }
function toggleMenu() { if (state !== 'playing') return; $('menu').classList.contains('hide') ? showMenu() : closeMenu(); }
document.addEventListener('pointerlockchange', () => {
  if (locked()) {
    if (state === 'title') newGame();
    $('menu').classList.add('hide'); $('title').classList.add('hide'); game.paused = false;
  } else if (state === 'playing' && !auto) showMenu(); // Esc로 포인터락이 풀리면 메뉴
});
$('resumeBtn').addEventListener('click', () => closeMenu());
$('newMazeBtn').addEventListener('click', () => { newGame(); lock(); });
$('menuBtn').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggleMenu(); }, { passive: false });
$('menu').addEventListener('touchstart', (e) => e.stopPropagation());

// 설정 패널 (타이틀·메뉴 공용)
function mountSettings(el) {
  el.innerHTML = `<div class="set"><span>그래픽</span><div class="seg"><button type="button" data-q="low">낮음</button><button type="button" data-q="high">높음</button></div></div>
    <div class="set"><span>마우스 감도</span><input type="range" min="0.2" max="3" step="0.05" data-r="sens"><b></b></div>
    <div class="set"><span>소리 크기</span><input type="range" min="0" max="1" step="0.05" data-r="volume"><b></b></div>
    <small data-note></small>`;
  el.addEventListener('click', (e) => { e.stopPropagation(); const q = e.target.dataset && e.target.dataset.q; if (q) setQuality(q); });
  el.addEventListener('touchstart', (e) => e.stopPropagation());
  el.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', (e) => { settings[inp.dataset.r] = +e.target.value; if (inp.dataset.r === 'volume') sound.setVolume(settings.volume); saveSettings(); syncSettingsUI(); }));
}
function syncSettingsUI() {
  for (const el of [$('menuSettings'), $('titleSettings')]) {
    el.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('sel', b.dataset.q === settings.quality));
    el.querySelectorAll('input').forEach((inp) => { const k = inp.dataset.r; inp.value = settings[k]; inp.parentElement.querySelector('b').textContent = k === 'sens' ? settings.sens.toFixed(2) + '×' : Math.round(settings.volume * 100) + '%'; });
    el.querySelector('[data-note]').textContent = settings.quality === 'low'
      ? '낮음: 총까지 전부 로우폴리, 해상도 70%, 조명 최소화 (노트북·저사양 추천)'
      : '높음: 하이폴리 리볼버, 금속 반사, 조명 전체 사용';
  }
}
mountSettings($('menuSettings')); mountSettings($('titleSettings'));
// 그래픽 품질 적용: 총 모델 교체 + 조명 수 + 렌더 해상도 + 환경맵
function setQuality(q) { settings.quality = q; saveSettings(); applyQuality(); }
function applyQuality() {
  const q = settings.quality;
  weapons.setQuality(q); world.setQuality(q); voices.setQuality(q);
  for (const g of ghosts) g.setQuality(q, ghostAssets); // 유령도 품질별 모델(높음: 하이폴리 천 유령)
  viewScene.environment = q === 'high' ? envTex : null;
  muzzleLight.visible = q === 'high';
  key.intensity = q === 'high' ? 3.2 : 1.7; viewAmbient.intensity = q === 'high' ? 0.35 : 0.55; // 낮음(Lambert)은 조명을 낮춰 음영이 보이게
  perf.n = 0; perf.t = 0;
  resize(); syncSettingsUI();
}
$('title').addEventListener('click', () => auto ? newGame() : COARSE ? startTouch() : lock());
$('restart').addEventListener('click', () => { newGame(); lock(); });
$('touch').classList.toggle('hide', auto || !COARSE); document.body.classList.toggle('touch-ui', COARSE && !auto);
document.addEventListener('mousemove', (e) => {
  if (!locked() || state !== 'playing') return;
  player.yaw -= e.movementX * 0.0022 * settings.sens;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0022 * settings.sens));
});
document.addEventListener('mousedown', (e) => { if (locked() && state === 'playing' && e.button === 0) weapons.tryFire(); });
document.addEventListener('wheel', (e) => { if (locked() && state === 'playing') weapons.cycle(); }, { passive: true });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' && state === 'playing' && (auto || COARSE)) { toggleMenu(); return; }
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
  const sc = settings.quality === 'low' ? 0.7 : 1; // 낮음: 내부 해상도 70%
  renderer.setSize(Math.round(w * sc), Math.round(h * sc), false);
  const a = w / h;
  camera.aspect = a; camera.fov = camera.userData.baseFov = a >= 1.2 ? 75 : Math.min(105, 75 + (1.2 - a) * 45); camera.updateProjectionMatrix();
  viewCam.aspect = a; viewCam.fov = camera.fov - 12; viewCam.updateProjectionMatrix();
}
addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
resize();

// ── 메인 루프 ────────────────────────────────────────
let last = performance.now();
const perf = { n: 0, t: 0, hinted: false };
const fwd = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  if (state === 'playing' && !game.paused && !auto && settings.quality === 'high' && !perf.hinted && raw < 0.5) { // 높음에서 5초 평균 35fps 미만이면 안내
    perf.n++; perf.t += raw;
    if (perf.t >= 5) { if (perf.n / perf.t < 35) { $('hint').textContent = (COARSE ? '메뉴(☰)' : 'Esc 메뉴') + '에서 그래픽을 \'낮음\'으로 바꾸면 더 부드러워요'; $('hint').classList.remove('hide'); setTimeout(() => $('hint').classList.add('hide'), 8000); perf.hinted = true; } else { perf.n = 0; perf.t = 0; } }
  }
  if (state === 'playing' && !game.paused && playable()) {
    if (auto && !game.freeze) bot.update(dt);
    else if (game.fireHeld) weapons.tryFire(); // 발사 버튼 누르고 있으면 연사(발사 간격 제한 유지)
    player.update(dt, keys, grid, game.joy);
    weapons.update(dt);
    { // 근접 펀치: 화면 확대(FOV) + 아래로 숙임 + 흔들림
      const pu = weapons.punch, base = camera.userData.baseFov || camera.fov;
      const f = base + pu * 6;
      if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
      camera.rotation.x -= pu * 0.035; camera.rotation.z += Math.sin(performance.now() * 0.06) * pu * 0.012;
    }
    for (const g of (game.freeze ? [] : ghosts.slice())) {
      if (g.update(dt, player, grid) && player.hit()) {
        $('vignette').classList.add('hit'); requestAnimationFrame(() => requestAnimationFrame(() => $('vignette').classList.remove('hit')));
        if (player.hp <= 0) finish('over');
      }
    }
    world.update(player.pos);
    camera.getWorldDirection(fwd);
    voices.update(dt, game.freeze ? [] : ghosts, camera.position, fwd, (g) => hasLOS(grid, g.x, g.z, player.pos.x, player.pos.z)); // 유령 속삭임
    hud();
  } else if (auto && (state === 'clear' || state === 'over')) {
    endTimer -= dt; if (endTimer <= 0) newGame();
  } else if (state === 'clear' || state === 'over') {
    for (const g of ghosts) g.sync();
  }
  if (settings.quality === 'high') ghostTime.value = now / 1000; // 고화질 유령 밑단 천 일렁임
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
applyQuality();
if (COARSE) { $('title').querySelector('p').textContent = '탭하여 시작'; $('titleHelp').innerHTML = '왼쪽 화면: 이동 조이스틱 · 오른쪽 화면: 드래그로 시점<br>오른쪽 아래 버튼: 발사 · 재장전 · 근접 · 전환 · 기울이기<br>가로 화면을 권장해요'; }
if (auto) { $('title').querySelector('p').textContent = 'AI 자동 플레이 · 탭하여 시작'; newGame(); }
requestAnimationFrame(frame);

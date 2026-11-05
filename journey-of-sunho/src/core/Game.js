// Game — 전체 흐름과 시스템 연결.
// 상태: title(시작 화면) → briefing(챕터 조건) → intro(시작 연출) → playing(주행) ⇄ paused → outro(도착 연출) → result(종합 평가)
import * as THREE from '../lib/three.js';
import { SceneManager } from './SceneManager.js';
import { GameLoop } from './GameLoop.js';
import { AssetManager } from './AssetManager.js';
import { Input } from './Input.js';
import { loadJSON, wrapAngle, KMH } from './utils.js';
import { MapManager } from '../world/MapManager.js';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { PlayerState } from '../player/PlayerState.js';
import { FollowCamera } from '../camera/FollowCamera.js';
import { WeatherManager } from '../weather/WeatherManager.js';
import { WeatherEffects } from '../weather/WeatherEffects.js';
import { EventManager } from '../events/EventManager.js';
import { ChapterManager } from '../chapters/ChapterManager.js';
import { StoryManager } from '../chapters/StoryManager.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { Menu } from '../ui/Menu.js';
import { ResultScreen } from '../ui/ResultScreen.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { Cloud } from '../systems/Cloud.js';
import { Autopilot } from '../systems/DebugTools.js';

const params = new URLSearchParams(location.search);

export class Game {
  constructor(view, ui) { this.view = view; this.ui = ui; this.state = 'boot'; }

  async init() {
    // 데이터 파일은 index.html 기준 경로 (개발 서버·GitHub Pages·vite build 결과물 모두 같은 구조)
    const url = (p) => new URL(p, document.baseURI).href;
    const [balance, weatherDef, eventDefs, chapterData] = await Promise.all([
      loadJSON(url('src/data/balance.json')), loadJSON(url('src/data/weather.json')),
      loadJSON(url('src/data/events.json')), loadJSON(url('src/data/chapters.json')),
    ]);
    this.balance = balance; this.weatherDef = weatherDef;
    this.sm = new SceneManager(this.view);
    this.assets = new AssetManager();
    this.input = new Input();
    this.maps = new MapManager();
    const map = await this.maps.load(chapterData.map.id, url(chapterData.map.file));
    this.world = new World(this.sm.scene, map);
    this.player = new Player({ scene: this.sm.scene, assets: this.assets, input: this.input, balance, world: this.world });
    this.player.state = new PlayerState(balance.state, balance.bike);
    this.cam = new FollowCamera(this.sm.camera, this.world.collision, this.world.roads);
    this.weather = new WeatherManager(weatherDef, balance.friction);
    this.weatherFx = new WeatherEffects(this.sm, this.world);
    this.chapters = new ChapterManager(chapterData, weatherDef);
    this.route = this.world.route(this.chapters.list[0].route);
    this.events = new EventManager(eventDefs, this);
    this.hud = new HUD(this.ui);
    this.minimap = new Minimap(this.hud.mapSlot());
    this.story = new StoryManager(this, this.ui);
    this.result = new ResultScreen(this.ui, this);
    this.menu = new Menu(this.ui, this);
    this.score = new ScoreSystem(balance.score, balance.comments);
    this.save = new SaveSystem();
    this.cloud = new Cloud(this.save);
    this.autopilot = new Autopilot(this);
    this.debug = params.has('debug');
    this.env = { powerMul: 1, windX: 0, windZ: 0, muMul: (q, x, z) => this.weather.muMul(q) * this.events.muAt(x, z) };
    this.titleT = 0;
    this._wireEvents();
    if (this.debug) this._debugOverlay();

    this.loop = new GameLoop({ onFixed: (dt) => this.fixed(dt), onFrame: (dt, t) => this.frame(dt, t) });
    this.weather.reset({ baseTemp: 12, start: 'clear' });
    this.toTitle();
    this.loop.start();
    if (params.has('auto')) this._autoplay();
  }

  _wireEvents() {
    const st = this.player.state;
    this.weather.on('change', (e) => { if (this.state === 'playing') this.hud.toast(this.weatherDef.announce[e.to] || e.name, 'weather'); });
    st.on('cold', () => { this.hud.toast('감기에 걸렸어요! 힘이 빠져요', 'bad'); this.hud.say('으슬으슬… 에취!'); });
    st.on('sneeze', () => { this.player.anim.triggerSneeze(); this.hud.say(['에취!!', '에에에취!', '훌쩍…'][Math.floor(Math.random() * 3)], 1.6); this.cam.addShake(0.15); });
    st.on('stain', (k) => this.player.character.addStain(k));
    st.on('bump', (b) => this.cam.addShake(Math.min(0.5, b * 0.4)));
    st.on('hit', (h) => this.cam.addShake(Math.min(0.6, h.speed * 0.15)));
    this.player.on('fall', (e) => {
      const msg = { balance: '균형을 잃고 넘어졌어요!', crash: '쾅! 부딪혀 넘어졌어요', car: '자동차와 부딪혔어요!', person: '행인과 부딪혀 넘어졌어요', animal: '동물을 피하다 넘어졌어요', barrier: '공사 바리케이드에 부딪혔어요' }[e.reason] || '넘어졌어요!';
      this.hud.toast(msg, 'bad');
      setTimeout(() => this.state === 'playing' && this.hud.say(['아야야…', '괜찮아, 다시 가자!', '오늘 왜 이래…'][Math.floor(Math.random() * 3)], 2.2), 1500);
    });
    this.player.on('remount', () => this.afterRemount());
    this.cloud.onChange(() => { if (this.menu.screen === 'title') this.menu.renderAccount(); });
    this.save.onChange(() => { if (this.menu.screen === 'title') this.menu.renderAccount(); });
  }

  // ---------------------------------------------------------------- 흐름
  nextChapterId() {
    const d = this.save.data;
    const list = this.chapters.list;
    const firstNew = list.find((c) => !d.chapters[c.id] && c.no <= d.unlocked);
    return (firstNew || list[Math.min(list.length - 1, d.unlocked - 1)] || list[0]).id;
  }

  toTitle() {
    this.state = 'title';
    this.events.clear(); this.events.enabled = false;
    this.story.hide();
    this.result.hide();
    this.hud.show(false);
    this.input.enabled = true;
    this.sm.setTimeOfDay('sunset');
    this.world.env.setNight(this.sm.night);
    this._parkPlayer();
    this.menu.showTitle();
  }

  // 학원 앞 자전거 거치대에 자전거를 세워 두고 옆에 선 선호
  _parkPlayer() {
    const P = this.player, rack = this.world.env.landmarks.bikeRack;
    const h = rack.rot, fx = Math.sin(h), fz = Math.cos(h);
    const y = this.world.roads.query(rack.x, rack.z, {}).height;
    P.mode = 'cutscene';
    P.physics.reset(rack.x, rack.z, h);
    P.character.root.visible = true;
    P.cutscene = { mode: 'stand', stand: { x: rack.x + fz * 0.55 - fx * 0.15, y, z: rack.z - fx * 0.55 - fz * 0.15, heading: h + Math.PI / 2 }, bikePose: { x: rack.x, y, z: rack.z, heading: h }, kickstand: true };
  }

  startChapter(id) {
    const ch = this.chapters.get(id) || this.chapters.list[0];
    this.chapter = ch;
    this.roll = this.chapters.roll(ch);
    this.route = this.world.route(ch.route);
    this.minimap.setWorld(this.world, this.route);
    this.result.hide();
    this.story.hide();
    this.events.clear(); this.events.enabled = false;
    this.hud.show(false);
    // 챕터 환경
    this.sm.setTimeOfDay(ch.timeOfDay);
    this.world.env.setNight(this.sm.night);
    this.weather.reset({ baseTemp: this.roll.baseTemp, weights: this.roll.weights, longChance: this.roll.longChance, start: this.roll.start });
    const st = this.player.state;
    st.reset();
    this.player.falls = 0;
    this.player.character.clearStains();
    this.player.bike.clearStains();
    this.chapterTime = 0;
    this.progressS = 0;
    this._parkPlayer();
    this.state = 'briefing';
    this.menu.showBriefing(ch, this.roll, () => this.beginIntro());
  }

  restartChapter() { this.startChapter(this.chapter.id); }

  beginIntro() {
    this.menu.hide();
    this.state = 'intro';
    this.hud.setChapter(`CHAPTER ${this.chapter.no} · ${this.chapter.title}`);
    this.story.playIntro(this.chapter, () => this.beginPlay());
  }

  beginPlay() {
    this.state = 'playing';
    this.hud.show(true);
    this.input.enabled = true;
    this.chapterTime = 0;
    this.events.start({ rate: this.roll.eventRate, weights: this.roll.eventBias });
    this.story.startRide(this.chapter);
    const W = this.weather;
    this.hud.toast(`오늘의 날씨: ${W.name} · ${W.temp.toFixed(1)}°C`, 'weather');
  }

  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.menu.showPause(); }
  resume() { if (this.state !== 'paused') return; this.menu.hide(); this.state = 'playing'; }

  finish() {
    this.state = 'outro';
    this.events.enabled = false;
    this.hud.show(false);
    this.story.playOutro(this.chapter, () => this.showResult());
  }

  showResult() {
    this.state = 'result';
    const st = this.player.state, P = this.player.physics;
    const stats = {
      time: this.chapterTime, length: this.route.length, bodyTemp: st.bodyTemp, minTemp: st.stats.minTemp, fatigue: st.fatigue,
      sick: st.sick, falls: this.player.falls, cleanliness: st.cleanliness, poop: st.stats.poop, hits: st.stats.hits,
      pickups: st.stats.pickups, distance: P.distance, stars: this.roll.stars,
    };
    const res = this.score.evaluate(stats);
    const { newBest } = this.save.record(this.chapter, res, stats);
    const pushed = this.cloud.pushScore(this.chapter.id);
    this.result.show(this.chapter, stats, res, { newBest, pushed });
    this.lastResult = { stats, res };
  }

  startS() { return Math.min(14, this.route.length * 0.05); }
  laneOffset(s = this.progressS || 0) { return this.route.pointAt(s).road.halfW - 1.4; }

  placeOnRoute(sv, lat = this.laneOffset(sv)) {
    const p = this.route.pointAt(sv);
    this.player.placeAt(p.x - p.tz * lat, p.z + p.tx * lat, Math.atan2(p.tx, p.tz));
    this.player.cutscene = null;
    this.route.project(this.player.physics.x, this.player.physics.z, sv);
    this.progressS = sv;
    this.cam.snap(this.player);
  }

  // 다시 탔을 때: 장애물에 걸려 있으면 비켜 서고, 진행 방향을 도로와 나란히
  afterRemount() {
    const P = this.player.physics;
    const pr = this.route.project(P.x, P.z, this.progressS);
    const rp = this.route.pointAt(pr.s);
    const rx = -rp.tz, rz = rp.tx;
    const blocked = () => this.world.collision.overlapDynamic(P.x, P.z, 0.9, []).some((c) => c.solid && c.active) || this.world.collision.resolveStatic(P.x, P.z, 0.5, {});
    for (let i = 0; i < 12 && blocked(); i++) { P.x -= rx * 0.5; P.z -= rz * 0.5; }
    const h = Math.atan2(rp.tx, rp.tz);
    if (Math.abs(wrapAngle(P.heading - h)) > 0.6) P.heading = h;
  }

  nextTurnInfo() {
    const t = this.route.nextTurn(this.progressS);
    if (!t) return null;
    const h1 = this.route.headingAt(t.s - 10), h2 = this.route.headingAt(t.s + 10);
    const d = wrapAngle(h2 - h1);
    const road = this.route.pointAt(t.s + 12).road;
    const dir = d > 0.5 ? '좌회전' : d < -0.5 ? '우회전' : '직진';
    return { dist: t.s - this.progressS, text: `${dir} · ${road.name}` };
  }

  // ---------------------------------------------------------------- 루프
  fixed(dt) {
    const s = this.state;
    if (s === 'paused' || s === 'result' || s === 'boot') return;
    this.weather.update(dt);
    if (s === 'title' || s === 'briefing') return;
    this.autopilot.update();
    const W = this.weather, st = this.player.state;
    Object.assign(this.env, W.envFor(), { windX: W.windX, windZ: W.windZ, wobble: st.wobble });
    if (s === 'playing') {
      this.chapterTime += dt;
      this.events.update(dt);
    }
    this.env.powerMul = st.powerMul * this.events.mods.power;
    this.player.fixedUpdate(dt, this.env);
    if (this.player.mode !== 'cutscene') {
      const P = this.player.physics;
      this.progressS = this.route.project(P.x, P.z, this.progressS).s;
      if (s === 'playing') {
        const home = this.world.env.landmarks.home;
        const dh = Math.hypot(P.x - home.x, P.z - home.z);
        if (this.progressS > this.route.length - 4 || dh < 5) this.finish();
      }
    }
  }

  frame(dt, t) {
    const s = this.state, inp = this.input;
    if (s === 'playing' && inp.wasPressed('Escape', 'KeyP')) this.pause();
    else if (s === 'paused' && inp.wasPressed('Escape', 'KeyP')) this.resume();
    if (this.debug || this.cloud.isAdmin) this._debugKeys();
    if (s !== 'paused') this.story.update(dt);

    const night = this.sm.night;
    this.player.update(s === 'paused' ? 0 : dt, { night, fog: this.weather.fog });
    const st = this.player.state;
    this.player.character.setCleanliness(st.cleanliness);
    this.player.bike.setCleanliness(st.cleanliness);

    if (s === 'title' || s === 'briefing') this._titleCamera(dt);
    else this.cam.update(s === 'paused' ? 0 : dt, this.player);
    const P = this.player.physics;
    this.sm.followShadow(P.x, P.y, P.z);
    this.weatherFx.update(s === 'paused' ? 0 : dt, this.weather, this.sm.camera, night);
    this.world.env.setNight(night);
    this.world.update(dt, t);

    if (s === 'playing' || s === 'paused') {
      this.hud.update(dt, {
        state: st, physics: P,
        weather: { type: this.weather.type, name: this.weather.name, temp: this.weather.temp, windSpeed: this.weather.windSpeed },
        windRel: this.weather.windDir - P.heading + Math.PI,
        progress: { s: this.progressS, length: this.route.length },
        chapterTime: this.chapterTime,
        nextTurn: this.nextTurnInfo(),
      });
      this.minimap.draw(this.player, this.events);
      if (s === 'playing') this.story.rideUpdate(this.progressS / this.route.length);
    }
    if (this.dbg) {
      this.dbg.textContent = `${this.state} fps ${this.loop.fps.toFixed(0)}  ${(P.v * KMH).toFixed(1)}km/h  노면 ${P.surface} μ${P.mu.toFixed(2)}  경사 ${(P.grade * 100).toFixed(1)}%\n`
        + `진행 ${this.progressS.toFixed(0)}/${this.route.length.toFixed(0)}  젖음 ${this.weather.wetness.toFixed(2)} 적설 ${this.weather.snowCover.toFixed(2)}  이벤트 ${this.events.active.map((e) => e.id).join(',')}`;
    }
    this.sm.render();
    inp.endFrame();
  }

  _titleCamera(dt) {
    this.titleT += dt;
    const ac = this.world.env.landmarks.academy, rack = this.world.env.landmarks.bikeRack;
    const a = this.titleT * 0.06;
    const fx = ac.faceX, fz = ac.faceZ, tx = -fz, tz = fx;
    const base = new THREE.Vector3(rack.x + fx * 10, 0, rack.z + fz * 10);
    const cam = this.sm.camera;
    cam.position.set(base.x + tx * Math.sin(a) * 9 - tx * 4, 3.2 + Math.sin(a * 0.7) * 0.6, base.z + tz * Math.sin(a) * 9 - tz * 4);
    cam.lookAt(rack.x - tx * 4 - fx * 3, 2.6, rack.z - tz * 4 - fz * 3);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); }
  }

  // ---------------------------------------------------------------- 디버그 (?debug 또는 관리자)
  _debugOverlay() {
    this.dbg = document.createElement('div');
    this.dbg.className = 'dbg';
    this.dbg.style.cssText = 'position:absolute;left:12px;bottom:44px;font:12px monospace;background:rgba(0,0,0,.55);padding:6px 8px;white-space:pre;pointer-events:none';
    this.ui.appendChild(this.dbg);
  }
  _debugKeys() {
    const inp = this.input;
    ['clear', 'rain', 'snow', 'wind', 'fog'].forEach((w, i) => { if (inp.wasPressed('Digit' + (i + 1))) { this.weather.force(w); this.hud.toast(`[디버그] 날씨: ${w}`); } });
    if (inp.wasPressed('KeyG')) { this.autopilot.on = !this.autopilot.on; this.hud.toast(`[디버그] 자동 주행 ${this.autopilot.on ? '켜짐' : '꺼짐'}`); }
    if (inp.wasPressed('KeyE') && this.state === 'playing') {
      const ids = Object.keys(this.events.defs.events);
      const id = ids[Math.floor(Math.random() * ids.length)];
      this.events.force(id); this.hud.toast(`[디버그] 이벤트: ${this.events.defs.events[id].name}`);
    }
  }

  // ?auto: 메뉴를 자동으로 넘기고 자동 주행 (전체 흐름 점검용)
  _autoplay() {
    this.autopilot.on = true;
    this.autopilot.speedKmh = Number(params.get('speed') || 22);
    const tick = () => {
      if (this.state === 'title') this.startChapter(params.get('ch') || this.nextChapterId());
      else if (this.state === 'briefing') this.beginIntro();
      else if (this.state === 'intro' && params.has('skip')) this.story.skip();
      setTimeout(tick, 500);
    };
    setTimeout(tick, 300);
  }
}

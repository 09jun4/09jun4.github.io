// 게임 중심: 상태(MainMenu/Loading/Playing/Folding/Paused/StageComplete) 전환과 각 시스템 연결.
// 입력은 상태에 따라 막거나 허용하고, 논리(Sim) → 화면(StageView) 순서로 항상 동기화해요.
import * as THREE from '../../vendor/three.module.min.js';
import { Renderer, CAM_DIR, yawOfView } from '../render/Renderer.js';
import { StageView } from '../render/StageView.js';
import { PlayerView } from '../render/PlayerView.js';
import { MenuScene } from '../render/MenuScene.js';
import { DebugView } from '../render/DebugView.js';
import { rotAboutMatrix } from '../render/PaperGeometry.js';
import { parseStage } from '../logic/StageLoader.js';
import { Sim, diffPuzzle } from '../logic/Sim.js';
import { FOLD_REASONS, cloneState, creaseAxisWorld } from '../logic/Fold.js';
import { ckey, DIR4 } from '../logic/math.js';
import { Player, yawOf } from './Player.js';
import { Hint } from './Hint.js';

export const STATE = { MENU: 'MainMenu', LOADING: 'Loading', PLAYING: 'Playing', FOLDING: 'Folding', PAUSED: 'Paused', COMPLETE: 'StageComplete' };
const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export class Game {
  constructor({ canvas, ui, audio, save, settings }) {
    this.ui = ui; this.audio = audio; this.save = save; this.settings = settings;
    this.R = new Renderer(canvas);
    this.R.applyQuality(settings.quality);
    this.menuScene = new MenuScene(this.R);
    this.debug = new DebugView(this.R, document.getElementById('debug'));
    this.player = new Player(this);
    this.hint = new Hint();
    this.state = STATE.MENU;
    this.t = 0; this.keys = new Set();
    this.index = null; this.stageDefs = new Map(); this.order = [];
    this.gesture = null; this.selected = null;
    this.occlRay = new THREE.Raycaster();
    this.hintIdx = 0;
    this.bindInput(canvas);
    window.addEventListener('resize', () => { this.R.resize(); if (this.state === STATE.MENU) this.menuScene.frame(); else if (this.view) this.frameCamera(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === STATE.PLAYING) this.pause(); });
    this.last = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  // ---------- 스테이지 목록 ----------
  async loadIndex() {
    const res = await fetch('stages/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('스테이지 목록을 불러오지 못했어요 (' + res.status + ')');
    const idx = await res.json();
    if (!idx || !Array.isArray(idx.chapters)) throw new Error('스테이지 목록 형식이 잘못됐어요');
    this.index = idx;
    const jobs = [];
    for (const ch of idx.chapters) for (const file of ch.stages) jobs.push(fetch('stages/' + file, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(new Error(file + ' ' + r.status))).then(j => ({ ch, file, j }), e => ({ ch, file, err: e })));
    const all = await Promise.all(jobs);
    this.order = [];
    for (const r of all) {
      if (r.err) { console.error('[FOLD] 스테이지 로드 실패', r.file, r.err); continue; }
      try { const st = parseStage(r.j); st.paper = r.ch.paper; st.chapterName = r.ch.name; st.shadows = r.ch.shadows !== false; this.stageDefs.set(st.id, st); this.order.push(st.id); }
      catch (e) { console.error('[FOLD]', e.message); }
    }
    if (!this.order.length) throw new Error('불러온 스테이지가 없어요');
  }
  isUnlocked(id) {
    if (this.admin) return true;
    const i = this.order.indexOf(id);
    return i <= 0 || !!this.save.data.cleared[this.order[i - 1]];
  }

  // ---------- 상태 전환 ----------
  toMenu() {
    this.unloadStage();
    this.state = STATE.MENU;
    this.R.setPalette('white');
    this.R.setShadows(true);
    this.turn = null;
    this.R.setYaw(yawOfView(0));
    this.menuScene.show(true);
    this.ui.showMenu();
  }
  unloadStage() {
    this.hint.cancel();
    if (this.view) { this.R.scene.remove(this.view.root); this.view.dispose(); this.view = null; }
    if (this.pview) { this.R.scene.remove(this.pview.root); this.pview = null; }
    this.sim = null; this.selected = null; this.gesture = null;
    this.debug.rebuild(null);
  }
  startStage(id, resumeState) {
    const st = this.stageDefs.get(id);
    if (!st) { this.ui.error('스테이지를 찾을 수 없어요: ' + id); return; }
    this.state = STATE.LOADING;
    this.unloadStage();
    this.menuScene.show(false);
    try {
      this.stage = st;
      this.sim = new Sim(st);
      if (resumeState) {
        try { this.sim.setState(cloneState(resumeState)); } catch (e) { console.warn('[FOLD] 이어하기 상태 손상 → 처음부터', e); this.sim.reset(); }
      }
      this.R.setPalette(st.paper);
      this.R.setShadows(st.shadows);
      this.player.place(this.sim.state.player, this.sim.state.facing);
      this.buildViews();
      this.R.setYaw(yawOfView(this.sim.state.view));
      this.frameCamera(true);
      this.hintIdx = 0;
      this.state = STATE.PLAYING;
      this.ui.showHud(st);
      this.updateHud();
      if (st.intro && !resumeState) this.ui.showIntro(st);
      this.debug.rebuild(this.sim);
    } catch (e) {
      console.error(e);
      this.ui.error('스테이지를 준비하다 문제가 생겼어요.\n' + e.message, () => this.startStage(id), () => this.toMenu());
    }
  }
  buildViews() {
    const st = this.stage;
    this.view = new StageView(this.sim, { palette: st.paper, quality: this.settings.quality, camera: this.R.camera });
    this.view.onConnect = () => this.audio.play('connect');
    this.view.onLand = () => this.audio.play('land');
    this.R.scene.add(this.view.root);
    this.pview = new PlayerView(st.paper, this.settings.quality);
    this.pview.yaw = this.player.yaw;
    this.R.scene.add(this.pview.root);
  }
  // 품질 변경: 렌더러 설정 + 화면 객체만 다시 만듦 (진행·메뉴 상태는 그대로)
  setQuality(q) {
    this.R.applyQuality(q);
    if (!this.sim || this.anim) return;
    this.R.scene.remove(this.view.root); this.view.dispose();
    this.R.scene.remove(this.pview.root);
    this.buildViews();
  }
  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED; this.player.stop(); this.keys.clear();
    this.ui.showPause();
  }
  resume() { if (this.state === STATE.PAUSED) { this.state = STATE.PLAYING; this.ui.hidePause(); } }
  restartStage() {
    if (!this.sim) return;
    this.sim.reset(); this.afterLogic(true);
    this.player.place(this.sim.state.player, this.sim.state.facing);
    this.state = STATE.PLAYING; this.ui.hidePause();
    this.audio.play('undo');
    this.toast('처음 상태로 돌아왔어요');
  }
  saveProgress() {
    if (!this.sim) return false;
    const s = cloneState(this.sim.state);
    s.player = this.player.node.slice();
    return this.save.setResume(this.stage.id, s);
  }
  nextStageId() { const i = this.order.indexOf(this.stage.id); return this.order[i + 1] || null; }

  // ---------- 논리 → 화면 ----------
  afterLogic(instant) {
    this.view.sync(instant);
    this.debug.rebuild(this.sim);
    this.updateHud();
    this.frameCamera(false);
  }
  updateHud() {
    if (!this.sim) return;
    this.ui.updateHud({ folds: this.sim.state.folds, canUndo: this.sim.history.length > 0, exitActive: this.sim.puz.exitActive, keys: this.sim.state.keysHeld.length, goal: this.stage.goalText, requires: this.stage.goal.requires.length });
  }
  frameCamera(snap) {
    let pts = [];
    for (const fv of this.view.faces.values()) {
      if (!fv.mesh.geometry.boundingBox) fv.mesh.geometry.computeBoundingBox();
      const b = fv.mesh.geometry.boundingBox;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(fv.group.matrix));
    }
    // 아주 큰 건축물은 전체를 다 넣으면 너무 작아 보여서, 인형 주변(반경 9칸)만 담고 따라가요
    const box = new THREE.Box3().setFromPoints(pts), size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.z) > 20 && this.player.node) {
      const px = this.player.x, pz = this.player.z, R = 9;
      const near = pts.filter(p => Math.abs(p.x - px) < R && Math.abs(p.z - pz) < R);
      if (near.length > 8) pts = near;
      this.follow = true;
    } else this.follow = false;
    const mobile = this.R.aspect < 0.8;
    this.R.frame(pts, mobile ? { top: 0.16, bottom: 0.14 } : { top: 0.1, bottom: 0.08 });
    if (snap) this.R.updateCamera(0, true);
  }

  // ---------- 플레이 이벤트 ----------
  onEnterNode(node, d) {
    const ev = this.sim.enterNode(node, d);
    if (this.follow) this.frameCamera(false);
    this.audio.play('step');
    this.handleEvents(ev);
    this.updateHud();
    this.debug.rebuild(this.sim);
    if (this.sim.atExit()) this.complete();
  }
  handleEvents(ev) {
    for (const e of ev) {
      if (e.type === 'key') { this.audio.play('key'); this.pview.play('pick'); this.toast('열쇠를 주웠어요'); this.view.sync(); }
      if (e.type === 'switchOn') this.audio.play('switchOn');
      if (e.type === 'switchOff') this.audio.play('switchOff');
      if (e.type === 'doorOpen' || e.type === 'doorClose') this.audio.play('door');
      if (e.type === 'lit') this.audio.play('lit');
      if (e.type === 'exitOn') { this.audio.play('exitOn'); this.toast('출구가 열렸어요'); }
    }
    if (ev.some(e => e.type !== 'key')) this.view.sync();
  }
  doPush(r) {
    if (this.state !== STATE.PLAYING) return;
    const ev = this.sim.push(r);
    this.audio.play('push'); this.pview.play('push');
    this.handleEvents(ev); this.afterLogic(false);
  }
  doMirror(id) {
    if (this.state !== STATE.PLAYING) return;
    const ev = this.sim.rotateMirror(id);
    this.audio.play('mirror'); this.pview.play('bump');
    this.handleEvents(ev); this.afterLogic(false);
  }
  doUnlock(r) {
    if (this.state !== STATE.PLAYING) return;
    const ev = this.sim.unlock(r);
    this.audio.play('door'); this.toast('열쇠로 문을 열었어요');
    this.handleEvents(ev); this.afterLogic(false);
  }
  bump() { this.audio.play('deny'); this.pview.play('push'); }
  undo() {
    if (this.state !== STATE.PLAYING || !this.sim) return;
    const v = this.sim.state.view;
    if (!this.sim.undo()) { this.toast('되돌릴 것이 없어요'); return; }
    this.sim.state.view = v; this.sim.refresh(); // 시점은 되돌리지 않아요
    this.afterLogic(false);
    this.player.place(this.sim.state.player, this.sim.state.facing);
    this.audio.play('undo');
  }
  // ---- 시점 회전 ----
  turnBy(step) {
    if (this.state !== STATE.PLAYING || !this.stage.views || this.turn) return;
    this.player.stop(); this.sim.rotating = true; this.view.illu.count = 0;
    this.snapView(this.sim.state.view + step);
  }
  snapView(target) {
    const cur = this.R.yaw;
    // 가장 가까운 시점으로 (또는 지정한 시점으로) 부드럽게 맞춤
    let v = target !== undefined ? target : Math.round((Math.PI / 4 - cur) / (Math.PI / 2));
    let goal = Math.PI / 4 - v * Math.PI / 2;
    v = ((v % 4) + 4) % 4;
    this.turn = { from: cur, to: goal, t: 0, v };
    this.audio.play('grab');
  }
  stepTurn(dt) {
    const tr = this.turn;
    if (!tr) return;
    tr.t += dt;
    const k = Math.min(1, tr.t / 0.38);
    this.R.setYaw(tr.from + (tr.to - tr.from) * easeInOut(k));
    this.frameCamera(false);
    if (k < 1) return;
    this.turn = null;
    this.R.setYaw(yawOfView(tr.v));
    const changed = this.sim.state.view !== tr.v;
    this.sim.rotating = false; this.sim.state.view = tr.v;
    this.sim.refresh();
    this.player.clamp();
    this.afterLogic(false);
    if (changed) this.audio.play('foldEnd');
  }
  onHidden() { this.pview.play('vanish'); this.audio.play('mirror'); }
  runQueued(q) {
    if (q.type === 'mirror') this.doMirror(q.id);
    if (q.type === 'push') this.tapObject(q.id);
    if (q.type === 'pushDir') {
      const r = this.sim.neighbor(this.player.node, q.dir);
      this.player.yaw = yawOf(q.dir);
      if (r && r.kind === 'push' && r.ok && r.obj.o.id === q.id) { const to = r.obj.cube.slice(); this.doPush(r); this.player.walkTo(to); }
      else this.bump();
    }
  }
  complete() {
    if (this.state === STATE.COMPLETE) return;
    this.state = STATE.COMPLETE;
    this.player.stop(); this.selected = null; this.view.setSelected(null);
    this.pview.play('win');
    this.audio.play('win');
    const prev = this.save.data.cleared[this.stage.id];
    this.save.clear(this.stage.id, this.sim.state.folds);
    this.winT = 0;
    setTimeout(() => {
      if (this.state !== STATE.COMPLETE) return;
      this.ui.showComplete(this.stage, this.sim.state.folds, prev ? prev.best : null, this.nextStageId());
    }, 1300);
  }
  toast(msg) { this.ui.toast(msg); }

  // ---------- 접기 ----------
  canStartFold(cid) {
    const c = this.stage.creaseById.get(cid);
    const under = this.sim.res.top.get(ckey(...this.player.node));
    if (c.faces.includes(under)) { this.toast(FOLD_REASONS.player); this.audio.play('deny'); return false; }
    if (this.stage.reach && under !== c.parent) { this.toast(FOLD_REASONS.reach); this.audio.play('deny'); return false; }
    return true;
  }
  select(cid) {
    this.selected = cid;
    this.view.setSelected(cid);
    if (cid) this.audio.play('ui');
  }
  // 버튼/키보드로 90° 접기 (dq = ±1)
  foldBy(cid, dq) {
    if (this.state !== STATE.PLAYING || !cid || !this.canStartFold(cid)) return;
    this.player.stop();
    this.view.beginFold(cid);
    this.commitFold(cid, dq, 0);
  }
  commitFold(cid, dq, fromRad) {
    const before = this.sim.puz;
    const r = dq ? this.sim.fold(cid, dq) : { ok: false, reason: null };
    this.state = STATE.FOLDING;
    this.hint.cancel(); this.view.setHintCrease(null);
    const to = r.ok ? dq * Math.PI / 2 : 0;
    const dur = r.ok ? 0.32 + 0.12 * Math.abs(dq) : 0.25;
    if (r.ok) this.audio.play('fold'); else if (r.reason) { this.audio.play('deny'); this.toast(FOLD_REASONS[r.reason] || '접을 수 없어요'); } else this.audio.play('cancel');
    // 거부된 접기: 반대 방향으로 살짝 튕긴 뒤 원위치 (잘못된 방향 피드백)
    this.anim = { t: 0, dur, from: fromRad, to, ok: r.ok, cid, r, before };
  }
  stepFoldAnim(dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    let ang = a.from + (a.to - a.from) * easeInOut(k);
    if (!a.ok && a.r.reason) ang += Math.sin(k * Math.PI) * 0.12 * (a.from >= 0 ? 1 : -1);
    this.view.setFoldAngle(ang);
    this.frameCamera(false);
    if (k < 1) return;
    this.anim = null;
    this.view.endFold();
    if (a.ok) {
      for (const f of a.r.fx.falls) this.view.objs.get(f.id).pendingFx = 'fall';
      for (const f of a.r.fx.respawns) { this.view.objs.get(f.id).pendingFx = 'respawn'; this.toast('블록이 떨어질 곳이 없어 처음 자리로 돌아갔어요'); }
      this.audio.play('foldEnd');
      this.afterLogic(false);
      this.handleEvents(diffPuzzle(a.before, this.sim.puz, []));
    } else this.view.sync(true);
    this.state = STATE.PLAYING;
  }

  // ---------- 입력 ----------
  bindInput(canvas) {
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    canvas.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', e => this.onUp(e));
    window.addEventListener('pointercancel', e => this.onUp(e, true));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }
  onDown(e) {
    this.audio.unlock();
    if (this.state !== STATE.PLAYING || this.gesture) return;
    const ray = this.R.ray(e.clientX, e.clientY);
    const cid = this.view.creaseHit(ray);
    // 접힘선이 아니어도, 접을 수 있는 종이를 잡고 끌면 그 종이의 접힘선으로 접어요 (톡 누르면 이동)
    // 블록을 밀듯이 쓸면 그 방향으로 밀어요 (블록 뒤로 걸어가서 밀기)
    const pk = cid ? null : this.view.pick(ray);
    const block = pk && pk.obj && this.sim.byId.get(pk.obj) && this.sim.byId.get(pk.obj).o.type === 'block' ? pk.obj : null;
    const fid = cid || block ? null : this.view.faceHit(ray);
    const own = fid && this.stage.parentCrease.get(fid);
    this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, cid: cid || (own && own.id), block, mode: cid ? 'crease' : 'tap', moved: 0 };
    // 접을 수 없는 곳(빈 곳·고정된 바닥)을 옆으로 끌면 시점 회전
    this.gesture.canTurn = !this.gesture.cid && !block && this.stage.views && !this.turn;
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
  }
  onMove(e) {
    if (this.state === STATE.PLAYING && !this.gesture && e.pointerType === 'mouse') {
      const ray = this.R.ray(e.clientX, e.clientY);
      let cid = this.view && this.view.creaseHit(ray);
      if (this.view && !cid) { const f = this.view.faceHit(ray), c = f && this.stage.parentCrease.get(f); cid = c ? c.id : null; }
      if (this.view) this.view.setHover(cid);
      this.R.canvas.style.cursor = cid ? 'grab' : 'default';
    }
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.lx, dy = e.clientY - g.ly;
    g.lx = e.clientX; g.ly = e.clientY;
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.x, e.clientY - g.y));
    if ((g.mode === 'crease' && g.moved > 8) || (g.mode === 'tap' && g.cid && g.moved > 12)) {
      if (!this.canStartFold(g.cid)) { g.mode = 'dead'; return; }
      g.mode = 'drag';
      this.player.stop();
      this.select(g.cid);
      const fa = this.view.beginFold(g.cid);
      g.probe = this.view.foldProbePoint(g.cid);
      g.axisP = fa.point; g.axisD = fa.dir;
      g.angle = 0;
      const c = this.stage.creaseById.get(g.cid), cur = this.sim.state.angles[g.cid] || 0;
      g.min = Math.max(c.min - cur, -180) * Math.PI / 180; g.max = Math.min(c.max - cur, 180) * Math.PI / 180;
      this.audio.play('grab');
      this.R.canvas.style.cursor = 'grabbing';
    }
    if (g.mode === 'tap' && g.canTurn && g.moved > 12) {
      g.mode = 'turn'; this.player.stop(); this.sim.rotating = true; g.yaw0 = this.R.yaw;
      this.view.illu.count = 0;
      this.select(null);
    }
    if (g.mode === 'turn') {
      this.R.setYaw(g.yaw0 - (e.clientX - g.x) * 0.009);
      this.frameCamera(false);
      return;
    }
    if (g.mode === 'drag') {
      // 드래그 → 각도: 접히는 면 중심이 화면에서 움직이는 방향(접선)에 손가락 이동을 투영
      const tan = this.screenTangent(g);
      const L2 = Math.max(tan.x * tan.x + tan.y * tan.y, 1600);
      g.angle += (dx * tan.x + dy * tan.y) / L2;
      g.angle = Math.max(g.min, Math.min(g.max, g.angle));
      this.view.setFoldAngle(g.angle);
      this.frameCamera(false);
    }
  }
  screenTangent(g) {
    const m0 = rotAboutMatrix(g.axisP, g.axisD, g.angle), m1 = rotAboutMatrix(g.axisP, g.axisD, g.angle + 0.05);
    const a = this.R.toScreen(g.probe.clone().applyMatrix4(m0)), b = this.R.toScreen(g.probe.clone().applyMatrix4(m1));
    return { x: (b.x - a.x) / 0.05, y: (b.y - a.y) / 0.05 };
  }
  onUp(e, cancel) {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    this.gesture = null;
    this.R.canvas.style.cursor = 'default';
    if (this.state !== STATE.PLAYING) return;
    if (g.mode === 'turn') return this.snapView();
    if (g.mode === 'drag') {
      const deg = g.angle * 180 / Math.PI, a = Math.abs(deg);
      let dq = cancel || a < 25 ? 0 : Math.sign(deg) * (a > 125 ? 2 : 1);
      this.commitFold(g.cid, dq, g.angle);
      return;
    }
    if (!cancel && g.block && g.moved > 14) return this.swipeBlock(g.block, e.clientX - g.x, e.clientY - g.y);
    if (cancel || g.moved > 12) return;
    if (g.mode === 'crease') { this.select(this.selected === g.cid ? null : g.cid); return; }
    if (g.mode === 'tap') this.tap(e.clientX, e.clientY);
  }
  tap(x, y) {
    const p = this.view.pick(this.R.ray(x, y));
    if (this.selected) { this.select(null); }
    if (!p) return;
    if (p.obj) return this.tapObject(p.obj);
    const ok = this.player.walkTo(p.cell);
    this.view.showMarker(p.cell, ok && this.sim.res.top.has(ckey(...p.cell)));
  }
  // 물체 터치: 블록=옆이면 밀기/아니면 옆으로 가기, 거울=가서 돌리기, 나머지=그 칸으로
  tapObject(id) {
    const info = this.sim.byId.get(id);
    if (!info) return;
    const t = info.o.type, node = this.player.node;
    if (['block', 'mirror', 'source', 'receptor', 'door'].includes(t) && info.upright) {
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = DIR4[d];
        if (node[0] + dx === info.cube[0] && node[2] + dz === info.cube[2] && node[1] === info.cube[1]) {
          const r = this.sim.neighbor(node, d);
          this.player.yaw = yawOf(d);
          if (r && r.kind === 'push') { if (r.ok) { this.doPush(r); this.player.walkTo(info.cube); } else this.bump(); return; }
          if (r && r.kind === 'mirror' && info.functional) return this.doMirror(id);
          if (r && r.kind === 'unlock') { this.doUnlock(r); this.player.walkTo(info.cube); return; }
          if (r && r.kind === 'move') { this.player.walkTo(info.cube); return; }
          if (r && r.locked) this.toast('열쇠가 있어야 열 수 있는 문이에요');
          return;
        }
      }
      // 가장 가까운 옆 칸으로 걸어가기
      let best = null;
      for (let d = 0; d < 4; d++) {
        const n = [info.cube[0] - DIR4[d][0], info.cube[1], info.cube[2] - DIR4[d][1]];
        if (!this.sim.res.top.has(ckey(...n))) continue;
        const r = this.sim.neighbor(n, d);
        if (!r || r.obj !== info) continue;
        const ok = this.player.walkTo(n, t === 'mirror' ? { type: 'mirror', id } : t === 'door' ? { type: 'push', id } : null);
        if (ok) { best = n; break; }
      }
      if (best) this.view.showMarker(best, true); else this.toast('그쪽으로 갈 수 있는 길이 없어요');
      return;
    }
    if (info.upright) { const ok = this.player.walkTo(info.cube); this.view.showMarker(info.cube, ok); }
  }
  swipeBlock(id, sx, sy) {
    const info = this.sim.byId.get(id);
    if (!info || !info.upright) return;
    // 화면에서 쓴 방향과 가장 비슷한 바닥 방향
    const o = this.R.toScreen(new THREE.Vector3(0, 0, 0));
    let best = 0, bs = -Infinity;
    for (let d = 0; d < 4; d++) {
      const q = this.R.toScreen(new THREE.Vector3(DIR4[d][0], 0, DIR4[d][1]));
      const vx = q.x - o.x, vy = q.y - o.y, sc = (vx * sx + vy * sy) / Math.hypot(vx, vy);
      if (sc > bs) { bs = sc; best = d; }
    }
    const behind = [info.cube[0] - DIR4[best][0], info.cube[1], info.cube[2] - DIR4[best][1]];
    const r = this.sim.res.top.has(ckey(...behind)) && this.sim.neighbor(behind, best);
    if (!r || r.kind !== 'push' || r.obj.o.id !== id) { this.toast('그쪽으로는 밀 수 없어요'); this.audio.play('deny'); return; }
    if (!r.ok) { this.toast('블록 앞이 막혀 있어요'); this.audio.play('deny'); return; }
    const q = { type: 'pushDir', id, dir: best };
    if (ckey(...this.player.node) === ckey(...behind)) this.runQueued(q);
    else if (this.player.walkTo(behind, q)) this.view.showMarker(behind, true);
    else this.toast('블록 뒤로 갈 수 있는 길이 없어요');
  }
  onKey(e, down) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down) this.audio.unlock();
    const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    if (typing) return;
    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      if (this.state === STATE.PLAYING) e.preventDefault();
      return;
    }
    if (!down) return;
    if (k === 'Escape') { if (this.state === STATE.PLAYING) this.pause(); else if (this.state === STATE.PAUSED) this.ui.back(); return; }
    if (this.state !== STATE.PLAYING) return;
    if ((k === 'z' && (e.ctrlKey || e.metaKey)) || k === 'z' || k === 'Backspace') { e.preventDefault(); this.undo(); }
    else if (k === 'r') this.ui.confirmRestart();
    else if (k === 'h') this.requestHint();
    else if (k === 'Tab') { e.preventDefault(); this.cycleCrease(e.shiftKey ? -1 : 1); }
    else if (k === 'q') this.foldBy(this.selected, -1);
    else if (k === 'e') this.foldBy(this.selected, 1);
    else if (k === 'f') this.ui.toggleFullscreen();
    else if (k === '[') this.turnBy(-1);
    else if (k === ']') this.turnBy(1);
    else if (k === '`' && this.admin) { this.debug.toggle(); this.debug.rebuild(this.sim); }
  }
  cycleCrease(step) {
    const ids = this.stage.creases.map(c => c.id);
    if (!ids.length) return;
    const i = ids.indexOf(this.selected);
    this.select(ids[(i + step + ids.length) % ids.length]);
  }
  moveInput() {
    const k = this.keys;
    let f = 0, r = 0;
    if (k.has('w') || k.has('ArrowUp')) f += 1;
    if (k.has('s') || k.has('ArrowDown')) f -= 1;
    if (k.has('d') || k.has('ArrowRight')) r += 1;
    if (k.has('a') || k.has('ArrowLeft')) r -= 1;
    if (!f && !r) return { x: 0, z: 0 };
    // 화면 기준: 위 = 카메라가 보는 수평 방향, 오른쪽 = 화면 오른쪽
    const fw = { x: -CAM_DIR.x, z: -CAM_DIR.z }, rt = { x: CAM_DIR.z, z: -CAM_DIR.x };
    const fl = Math.hypot(fw.x, fw.z);
    let x = (fw.x * f + rt.x * r) / fl, z = (fw.z * f + rt.z * r) / fl;
    const l = Math.hypot(x, z);
    return { x: x / l, z: z / l };
  }

  // ---------- 힌트 ----------
  async requestHint() {
    if (this.state !== STATE.PLAYING) return;
    this.ui.hintBusy(true);
    const res = await this.hint.request(this.sim, this.hintIdx++);
    this.ui.hintBusy(false);
    if (!res || this.state !== STATE.PLAYING) return;
    if (res.text) return this.ui.hintText(res.text);
    if (res.goal) {
      const e = this.sim.exitInfo();
      this.view.showHintRing(e.cube);
      return this.ui.hintText('길은 이미 열려 있어요. 빛나는 곳으로 가 보세요.');
    }
    const a = res.action;
    if (a.type === 'fold') {
      const c = this.stage.creaseById.get(a.crease);
      const under = this.sim.res.top.get(ckey(...this.player.node));
      const onIt = c.faces.includes(under) || (this.stage.reach && under !== c.parent);
      if (onIt && a.stand) this.view.showHintRing(a.stand);
      this.view.setHintCrease(a.crease);
      this.hintWiggle(a.crease, a.dq);
      this.ui.hintText((onIt ? '표시된 곳으로 간 뒤, ' : '') + `반짝이는 접힘선을 움직이는 쪽으로 ${Math.abs(a.dq) === 2 ? '끝까지(180°)' : ''} 접어 보세요.`);
    } else if (a.type === 'push') {
      this.view.showHintRing(a.from);
      this.ui.hintText(`표시된 자리에서 블록을 ${this.dirWord(a.dir)} 밀어 보세요.`);
    } else if (a.type === 'view') {
      const step = ((a.view - this.sim.state.view) + 4) % 4;
      const away = a.stand && ckey(...a.stand) !== ckey(...this.player.node);
      if (away) this.view.showHintRing(a.stand);
      this.ui.hintText((away ? '표시된 곳으로 간 뒤 ' : '') + (step === 2 ? '시점을 반 바퀴 돌려 보세요. 빈 곳을 옆으로 끌면 돌아가요.' : `시점을 ${step === 1 ? '한 칸' : '반대쪽으로 한 칸'} 돌려 보세요. 빈 곳을 옆으로 끌면 돌아가요.`));
    } else if (a.type === 'mirror') {
      this.view.showHintRing(this.sim.byId.get(a.id).cube);
      this.ui.hintText('표시된 거울의 방향을 바꿔 보세요.');
    }
  }
  dirWord(d) {
    const v = new THREE.Vector3(DIR4[d][0], 0, DIR4[d][1]);
    const p0 = this.R.toScreen(new THREE.Vector3()), p1 = this.R.toScreen(v);
    const a = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
    if (a > -90 && a <= 0) return '오른쪽 위로';
    if (a > 0 && a <= 90) return '오른쪽 아래로';
    if (a > 90) return '왼쪽 아래로';
    return '왼쪽 위로';
  }
  hintWiggle(cid, dq) { this.wiggle = { cid, dq, t: 0 }; }
  stepWiggle(dt) {
    const w = this.wiggle;
    if (!w) return;
    if (this.gesture && this.gesture.mode === 'drag' || this.anim || this.state !== STATE.PLAYING) { this.wiggle = null; return; }
    if (w.t === 0) this.view.beginFold(w.cid);
    w.t += dt;
    const k = w.t / 1.6;
    this.view.setFoldAngle(Math.sign(w.dq) * Math.sin(Math.min(1, k) * Math.PI * 2) ** 2 * 0.45);
    if (k >= 1) { this.view.endFold(); this.wiggle = null; }
  }

  // ---------- 화살표 버튼 (선택한 접힘선을 탭으로 접기) ----------
  foldArrows() {
    if (!this.selected || this.state !== STATE.PLAYING || (this.gesture && this.gesture.mode === 'drag')) return null;
    const cid = this.selected, c = this.stage.creaseById.get(cid), cur = this.sim.state.angles[cid] || 0;
    const ax = creaseAxisWorld(this.sim, cid);
    const P = new THREE.Vector3(...ax.point), D = new THREE.Vector3(...ax.dir);
    const probe = this.view.foldProbePoint(cid);
    const base = this.R.toScreen(probe);
    const out = [];
    for (const dq of [-1, 1]) {
      const na = cur + dq * 90;
      if (na < c.min || na > c.max) continue;
      const p = this.R.toScreen(probe.clone().applyMatrix4(rotAboutMatrix(P, D, dq * 0.5)));
      const vx = p.x - base.x, vy = p.y - base.y, l = Math.hypot(vx, vy) || 1;
      out.push({ dq, x: base.x + vx / l * 64, y: base.y + vy / l * 64, ang: Math.atan2(vy, vx) });
    }
    return out;
  }

  // ---------- 매 프레임 ----------
  loop(now) {
    requestAnimationFrame(this.loop.bind(this));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state !== STATE.PAUSED) this.t += dt;
    const t = this.t;
    if (this.state === STATE.MENU) this.menuScene.update(t);
    if (this.view && this.sim) {
      const playing = this.state === STATE.PLAYING;
      if (this.state === STATE.FOLDING) this.stepFoldAnim(dt);
      this.stepWiggle(dt);
      this.stepTurn(dt);
      let speed = 0;
      if (playing && !this.turn && !this.sim.rotating) speed = this.player.update(dt, this.moveInput());
      if (this.state !== STATE.PAUSED) {
        this.view.playerFace = this.sim.res.top.get(ckey(...this.player.node));
        this.view.update(dt, t);
        const key = ckey(...this.player.node);
        const y = this.player.level + this.view.topOffset(key) + 0.025;
        const folding = this.state === STATE.FOLDING || (this.gesture && this.gesture.mode === 'drag');
        this.pview.update(dt, t, { x: this.player.x, z: this.player.z }, y, this.player.yaw, speed, folding);
        if (folding && this.view.foldAnim) { // 접는 쪽을 바라봄
          const p = this.view.foldAnim.point;
          this.pview.root.rotation.y = this.pview.yaw = Math.atan2(p.x - this.player.x, p.z - this.player.z);
        }
        if ((this.frameN = (this.frameN || 0) + 1) % 4 === 0) this.view.updateOcclusion(this.occlRay, new THREE.Vector3(this.player.x, y + 0.4, this.player.z), CAM_DIR.clone().negate());
      }
      this.ui.placeFoldArrows(this.foldArrows());
      this.debug.update();
    }
    this.R.updateCamera(dt);
    this.R.render();
  }
}

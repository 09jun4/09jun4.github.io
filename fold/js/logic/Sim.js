// 논리 계층의 중심: 스테이지 정의 + 논리 상태 → 배치·물체·퍼즐·이동 그래프.
// 화면(Three.js)을 전혀 모르며, 되돌리기/재시작/저장/힌트 탐색 모두 이 상태 객체만 다뤄요.
import { apply, mulMV, scale, ckey, dir4Of, parseKey, screenKey, depthOf } from './math.js';
import { layoutGeom, resolve, restCenter } from './Layout.js';
import { evaluate } from './Puzzle.js';
import { tryFold, cloneState, attachAt } from './Fold.js';
import { neighbor } from './Collision.js';

export function initialState(stage) {
  const order = {};
  stage.faces.forEach((f, i) => { order[f.id] = i; });
  const blocks = {}, mirrors = {};
  for (const o of stage.objects) {
    if (o.type === 'block') blocks[o.id] = { ...o.att };
    if (o.type === 'mirror') mirrors[o.id] = o.mirror;
  }
  return {
    angles: Object.fromEntries(stage.creases.map(c => [c.id, 0])), order, hi: stage.faces.length, lo: 0,
    blocks, mirrors, keysHeld: [], keysTaken: [], doorsOpened: [],
    player: stage.player.at.slice(), facing: stage.player.facing, folds: 0, moves: 0, view: stage.view,
  };
}

function computeBounds(stage) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const f of stage.faces) for (const [i, j] of [[0, 0], [f.w, f.h], [f.w, 0], [0, f.h]]) {
    const p = restCenter(f, i - 0.5, j - 0.5);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }
  const reach = Math.max(...stage.faces.map(f => Math.max(f.w, f.h))) * 2;
  return { min: min.map(v => Math.floor(v) - reach), max: max.map(v => Math.ceil(v) + reach), rest: { min, max } };
}

const sameMap = (a, b) => Object.keys(b).every(k => !!a[k] === !!b[k]);

export class Sim {
  constructor(stage) {
    this.stage = stage;
    this.bounds = computeBounds(stage);
    this.history = [];
    this.puz = null;
    this.setState(initialState(stage));
  }
  setState(s, opts) { this.state = s; this.refresh(opts); }
  // 같은 스테이지의 다른 상태를 임시로 계산 (접기 검증·힌트 탐색용)
  probe(s, opts = {}) {
    const t = Object.create(Sim.prototype);
    t.stage = this.stage; t.bounds = this.bounds; t.puz = null; t.history = null; t.state = s;
    t.refresh(opts);
    return t;
  }
  // 지금 시점 (회전 중이면 null → 착시 연결 없음)
  get view() { return this.rotating ? null : this.state.view; }
  // 화면 위치가 같은 걸을 수 있는 칸들 (앞에 보이는 칸부터)
  screenCells(key, v) {
    if (!this._scr || this._scrV !== v) {
      this._scr = new Map(); this._scrV = v;
      for (const k of this.res.top.keys()) {
        const c = parseKey(k), sk = screenKey(c[0], c[1], c[2], v);
        if (!this._scr.has(sk)) this._scr.set(sk, []);
        this._scr.get(sk).push(c);
      }
      for (const l of this._scr.values()) l.sort((a, b) => depthOf(...b, v) - depthOf(...a, v));
    }
    return this._scr.get(key) || [];
  }
  refresh(opts = {}) {
    const { stage, state } = this;
    this._scr = null;
    this.geo = layoutGeom(stage, state.angles);
    let ghost = (this.puz && this.puz.ghost) || {};
    for (let it = 0; it < 4; it++) {
      this.active = new Set(stage.faces.filter(f => !f.when || ghost[f.id]).map(f => f.id));
      this.res = resolve(this.geo, state.order, this.active);
      this.buildObjects();
      this.puz = evaluate(this, opts);
      if (sameMap(ghost, this.puz.ghost)) break;
      ghost = this.puz.ghost;
    }
  }
  infoFor(o, att) {
    const f = this.stage.faceById.get(att.face), T = this.geo.T[f.id];
    const c = apply(T, restCenter(f, att.i, att.j)), up = scale(mulMV(T.R, f.n), att.side);
    const upright = up[1] === 1;
    const cube = [Math.floor(c[0] + up[0] / 2), Math.floor(c[1] + up[1] / 2), Math.floor(c[2] + up[2] / 2)];
    const cellKey = upright ? ckey(Math.floor(c[0]), c[1], Math.floor(c[2])) : null;
    const activeFace = this.active.has(f.id);
    const covered = upright && activeFace && this.res.top.get(cellKey) !== f.id;
    const i = { o, att, c, up, upright, cube, cubeKey: ckey(...cube), cellKey, covered, functional: upright && activeFace && !covered };
    if (o.dir) { i.dirW = mulMV(T.R, o.dir); i.dir4 = dir4Of(i.dirW); }
    if (o.type === 'mirror') i.mirrorN = mulMV(T.R, this.state.mirrors[o.id] ? [1, 0, -1] : [1, 0, 1]);
    return i;
  }
  buildObjects() {
    const objs = (this.objs = []), occ = (this.occ = new Map()), flat = (this.flat = new Map());
    this.byId = new Map();
    for (const o of this.stage.objects) {
      if (o.type === 'key' && this.state.keysTaken.includes(o.id)) continue;
      const i = this.infoFor(o, o.type === 'block' ? this.state.blocks[o.id] : o.att);
      objs.push(i); this.byId.set(o.id, i);
      if (o.tall) { if (!occ.has(i.cubeKey) || i.upright) occ.set(i.cubeKey, i); }
      else if (i.functional) flat.set(i.cubeKey, i);
    }
  }

  // ---- 조회 ----
  playerKey() { return ckey(...this.state.player); }
  neighbor(node, d) { return neighbor(this, node, d); }
  exitInfo() { return this.objs.find(i => i.o.type === 'exit'); }
  atExit() {
    const e = this.exitInfo();
    return !!(e && e.functional && this.puz.exitActive && e.cubeKey === this.playerKey());
  }

  // ---- 동작 (되돌리기 기록 포함) ----
  record() {
    if (!this.history) return;
    this.history.push(cloneState(this.state));
    if (this.history.length > 300) this.history.shift();
  }
  undo() {
    if (!this.history.length) return false;
    this.puz = null;
    this.setState(this.history.pop());
    return true;
  }
  reset() {
    this.history = []; this.puz = null;
    this.setState(initialState(this.stage));
  }
  fold(cid, dq) {
    const r = tryFold(this, cid, dq);
    if (r.ok) { this.record(); this.setState(r.state); }
    return r;
  }
  // 걸어서 칸이 바뀜. 열쇠가 있으면 자동으로 주워요. → 일어난 일 목록
  enterNode(node, facing) {
    const ev = [];
    const k = ckey(...node), o = this.occ.get(k);
    if (o && o.o.type === 'key' && o.functional) {
      this.record();
      this.state.keysTaken.push(o.o.id); this.state.keysHeld.push(o.o.id);
      ev.push({ type: 'key', id: o.o.id });
    }
    const before = this.puz;
    this.state.player = node.slice();
    if (facing !== undefined) this.state.facing = facing;
    this.refresh();
    diffPuzzle(before, this.puz, ev);
    return ev;
  }
  push(r) {
    this.record();
    const before = this.puz;
    this.state.blocks[r.obj.o.id] = attachAt(this, ckey(...r.to));
    this.state.moves++;
    this.refresh();
    const ev = [{ type: 'push', id: r.obj.o.id }];
    diffPuzzle(before, this.puz, ev);
    return ev;
  }
  rotateMirror(id) {
    this.record();
    const before = this.puz;
    this.state.mirrors[id] ^= 1;
    this.refresh();
    const ev = [{ type: 'mirror', id }];
    diffPuzzle(before, this.puz, ev);
    return ev;
  }
  unlock(r) {
    this.record();
    const before = this.puz;
    this.state.doorsOpened.push(r.obj.o.id);
    this.state.keysHeld.splice(this.state.keysHeld.indexOf(r.obj.o.key), 1);
    this.refresh();
    const ev = [{ type: 'unlock', id: r.obj.o.id }];
    diffPuzzle(before, this.puz, ev);
    return ev;
  }
}

// 퍼즐 상태 변화 → 효과음/연출용 이벤트
export function diffPuzzle(a, b, ev) {
  if (!a || !b) return ev;
  for (const id in b.pressed) if (b.pressed[id] !== !!a.pressed[id]) ev.push({ type: b.pressed[id] ? 'switchOn' : 'switchOff', id });
  for (const id in b.lit) if (!a.lit[id]) ev.push({ type: 'lit', id });
  for (const id in b.doors) if (b.doors[id] !== !!a.doors[id]) ev.push({ type: b.doors[id] ? 'doorOpen' : 'doorClose', id });
  if (b.exitActive && !a.exitActive) ev.push({ type: 'exitOn' });
  return ev;
}

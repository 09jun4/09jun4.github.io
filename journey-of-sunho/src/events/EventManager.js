// EventManager — 돌발 이벤트를 날씨·도로 상황에 맞춰 무작위로 만들고, 충돌을 처리해요.
// · 이벤트 사이 간격(spacing)을 두고 한 번에 너무 많이 생기지 않게(maxActive) 조절
// · 날씨 배율: events.json의 weather 항목 (예: 비가 오면 물웅덩이↑, 비둘기↓)
// · 챕터 배율: chapter.eventWeights / eventRate
import { clamp, lerp, rand, weightedPick } from '../core/utils.js';
import { EVENT_CLASSES, STATIC_EVENTS } from './EventDefinitions.js';

export class EventManager {
  constructor(defs, game) {
    this.defs = defs;
    this.game = game;
    this.active = [];
    this.counts = {};
    this.lastType = null;
    this.mods = { power: 1 };
    this._overlap = [];
    this.enabled = false;
    const g = game;
    // 이벤트가 게임에 접근하는 도구 모음
    this.ctx = {
      scene: g.sm.scene,
      pacing: defs.pacing,
      friction: g.balance.friction,
      mods: this.mods,
      get player() { return g.player; },
      get state() { return g.player.state; },
      get stats() { return g.player.state.stats; },
      get cam() { return g.cam; },
      get weather() { return g.weather; },
      get roads() { return g.world.roads; },
      get route() { return g.route; },
      get collision() { return g.world.collision; },
      playerS: 0, playerLat: 0, speed: 0,
      playerPos: { x: 0, y: 0, z: 0 }, playerVel: { x: 0, z: 0 },
      at: (s, lat) => this.at(s, lat),
      say: (t) => g.hud.say(t),
      toast: (t, k) => g.hud.toast(t, k),
      groundY: (x, z) => g.world.roads.query(x, z, {}).height,
      stain: (kind) => { g.player.character.addStain(kind); if (rand() < 0.5) g.player.bike.addStain(kind); },
      poop: (clean, direct) => {
        const st = g.player.state;
        st.modify('cleanliness', -clean);
        st.stats.poop++;
        g.player.character.addStain('poop');
        g.player.bike.addStain('poop');
        g.hud.toast(direct ? '새똥 명중!! 청결도 하락' : '비둘기가 실례를…', 'bad');
        g.hud.say(['으아아악!!', '하필 오늘…', '머리에 뭔가 떨어졌어…'][Math.floor(rand() * 3)]);
      },
      bump: (v, e, tag) => {
        const P = g.player.physics;
        P.v *= e.slow ?? 0.5;
        g.player.state.modify('balance', -(e.balancePerSpeed || 6) * Math.max(v, 1.5));
        if (tag === 'person') g.player.state.stats.hits++;
        g.cam.addShake(0.3);
        if (v > (e.fallSpeed ?? 99)) g.player.fall(tag);
      },
      crash: (tag) => {
        const P = g.player.physics;
        P.v *= 0.15;
        g.cam.addShake(0.6);
        g.player.fall(tag);
      },
      solid: (c, crashSpeed, tag) => {
        const P = g.player.physics;
        const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz) || 1;
        const nx = dx / d, nz = dz / d;
        const into = -(Math.sin(P.heading) * P.v * nx + Math.cos(P.heading) * P.v * nz);
        P.x = c.x + nx * (c.r + 0.41); P.z = c.z + nz * (c.r + 0.41);
        if (into > crashSpeed) { P.v *= 0.15; g.player.fall(tag); g.cam.addShake(0.6); }
        else if (into > 0.3) { P.v *= 0.3; g.player.state.modify('balance', -into * 10); g.cam.addShake(0.2); }
      },
      windPush: (push, bal) => {
        g.player.physics.vlat += push;
        g.player.state.modify('balance', -bal);
        g.cam.addShake(0.15);
      },
    };
  }

  // 경로 위 s 지점에서 진행 방향 오른쪽으로 lat 만큼 떨어진 곳
  at(s, lat = 0) {
    const r = this.game.route.pointAt(s);
    const rx = -r.tz, rz = r.tx;
    const x = r.x + rx * lat, z = r.z + rz * lat;
    const q = this.game.world.roads.query(x, z, this._q || (this._q = {}));
    return { x, z, y: q.height, tx: r.tx, tz: r.tz, rx, rz, heading: Math.atan2(r.tx, r.tz), halfW: r.road.halfW, road: r.road, surface: q.surface };
  }

  /** opts: {rate, weights:{id:mul}, rng} */
  start(opts = {}) {
    this.clear();
    this.opts = opts;
    this.rate = opts.rate ?? 1;
    this.enabled = true;
    this.nextS = this.defs.pacing.startAfter + this._spacing() * 0.4;
    this.log = [];
  }

  _spacing() { const [a, b] = this.defs.pacing.spacing; return lerp(a, b, rand()) / Math.max(0.3, this.rate); }

  clear() {
    for (const e of this.active) e.dispose();
    this.active = [];
    this.counts = {};
  }

  // 날씨·상태를 반영한 가중치
  weightOf(id) {
    const def = this.defs.events[id];
    const W = this.game.weather, st = this.game.player.state;
    const factors = { rain: W.rain, snow: W.snow, wind: W.w.wind, fog: W.fog, wetness: W.wetness, chill: st.chill, fatigue: st.fatigue / 100 };
    let m = 1;
    for (const [k, v] of Object.entries(def.weather || {})) m += v * (factors[k] || 0);
    m = Math.max(0.05, m);
    const chapterMul = this.opts?.weights?.[id] ?? 1;
    const repeat = this.lastType === id ? 0.25 : 1;
    const crowd = 1 / (1 + (this.counts[id] || 0) * 0.3);
    return def.weight * m * chapterMul * repeat * crowd;
  }

  spawn(id, s) {
    const def = this.defs.events[id];
    const C = EVENT_CLASSES[id];
    if (!C || !def) return null;
    const ev = C.prototype ? new C(def, this.ctx, s) : C(def, this.ctx, s);
    ev.id = id;
    this.active.push(ev);
    this.counts[id] = (this.counts[id] || 0) + 1;
    this.lastType = id;
    this.log.push({ id, s: Math.round(s), t: Math.round(this.game.chapterTime || 0) });
    return ev;
  }

  // 테스트용: 지정한 이벤트를 바로 앞에 생성
  force(id) {
    const def = this.defs.events[id];
    const a = def.ahead || [40, 50];
    return this.spawn(id, this.ctx.playerS + lerp(a[0], a[1], 0.5));
  }

  _tryScheduled() {
    const P = this.defs.pacing, ps = this.ctx.playerS, route = this.game.route;
    if (ps < this.nextS) return;
    this.nextS = ps + this._spacing();
    if (this.active.length >= P.maxActive) return;
    if (this.game.player.mode !== 'ride') return;
    const ids = Object.keys(this.defs.events).map((id) => ({ id, w: this.weightOf(id) }));
    for (let tries = 0; tries < 4; tries++) {
      const pickd = weightedPick(ids, rand);
      if (!pickd) return;
      const def = this.defs.events[pickd.id];
      const a = def.ahead || [40, 50];
      const s = ps + lerp(a[0], a[1], rand());
      if (s > route.length - P.stopBefore || s < 8) continue;
      // 고정 장애물은 교차로·다른 이벤트와 겹치지 않게
      if (STATIC_EVENTS.has(pickd.id)) {
        const nearTurn = route.turns.some((t) => Math.abs(t.s - s) < t.isect.radius + 10);
        const nearOther = this.active.some((e) => Math.abs(e.s - s) < 18);
        if (nearTurn || nearOther) continue;
      }
      if (pickd.id === 'carCross' && !route.turns.some((t) => t.s > ps + 40 && t.s < ps + 95) && rand() < 0.5) continue;
      this.spawn(pickd.id, s);
      return;
    }
  }

  // 고정 간격 업데이트
  update(dt) {
    if (!this.enabled) return;
    const g = this.game, P = g.player.physics;
    const pr = g.route.project(P.x, P.z, g.progressS);
    const rp = g.route.pointAt(pr.s);
    const c = this.ctx;
    c.playerS = pr.s;
    c.playerLat = (P.x - rp.x) * -rp.tz + (P.z - rp.z) * rp.tx;
    c.speed = P.v;
    c.playerPos.x = P.x; c.playerPos.y = P.y; c.playerPos.z = P.z;
    c.playerVel.x = Math.sin(P.heading) * P.v; c.playerVel.z = Math.cos(P.heading) * P.v;
    this.mods.power = 1;
    this._tryScheduled();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      let alive = true;
      try { alive = e.update(dt) !== false; } catch (err) { console.error('[event]', e.id, err); alive = false; }
      if (!alive) { e.dispose(); this.active.splice(i, 1); }
    }
    // 충돌
    if (g.player.mode === 'ride') {
      const hits = g.world.collision.overlapDynamic(P.x, P.z, 0.4, this._overlap);
      for (const h of hits) h.owner.onHit(g.player, h);
    }
  }

  // 노면 국소 마찰 배율 (물웅덩이·낙엽)
  muAt(x, z) {
    let m = 1;
    for (const e of this.active) m *= e.muAt(x, z);
    return clamp(m, 0.3, 1);
  }
}

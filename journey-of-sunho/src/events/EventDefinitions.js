// EventDefinitions — 돌발 이벤트 하나하나의 동작. 수치는 data/events.json에서 와요.
// 각 이벤트: constructor(def, ctx, s) → update(dt) (false를 돌려주면 제거) → dispose()
// ctx는 EventManager가 넘겨주는 게임 접근 도구예요(플레이어·상태·HUD·도로·경로 등).
import * as THREE from '../lib/three.js';
import { clamp, lerp, rand, wrapAngle } from '../core/utils.js';
import * as Props from './Props.js';

const pick = (a) => a[Math.floor(rand() * a.length)];
const range = (r) => lerp(r[0], r[1], rand());

class GameEvent {
  constructor(def, ctx, s) {
    this.def = def; this.ctx = ctx; this.s = s; this.e = def.effect || {};
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.colliders = [];
    this.t = 0;
    this.alive = true;
  }
  say() { if (this.def.say) this.ctx.say(pick(this.def.say)); }
  collider(r, data = {}) {
    const c = { x: 0, z: 0, r, active: true, owner: this, ...data };
    this.ctx.collision.addDynamic(c);
    this.colliders.push(c);
    return c;
  }
  // 플레이어가 지나쳐서 멀어지면 제거
  passed(extra = 0) { return this.ctx.playerS > this.s + this.ctx.pacing.despawnBehind + extra; }
  onHit() {}
  muAt() { return 1; }
  dispose() {
    this.ctx.scene.remove(this.group);
    for (const c of this.colliders) this.ctx.collision.removeDynamic(c);
  }
}

// ---------------------------------------------------------------- 보행자
class PedestrianCross extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const P = ctx.at(s, 0);
    this.side = rand() < 0.5 ? -1 : 1;
    this.lat = this.side * (P.halfW + 1.2);
    this.targetLat = -this.side * (P.halfW + 1.4);
    this.p = Props.makePerson({ shirt: pick([0x1c7ed6, 0xe64980, 0x2f9e44, 0xfab005, 0x495057]), umbrella: ctx.weather.rain > 0.3, scale: lerp(0.9, 1.05, rand()) });
    this.group.add(this.p.root);
    this.c = this.collider(0.35, { tag: 'person' });
    this.speed = 1.25 + rand() * 0.3;
    this.started = false;
    this.knock = 0;
  }
  update(dt) {
    this.t += dt;
    if (!this.started && this.s - this.ctx.playerS < 34) { this.started = true; if (this.ctx.speed > 3) this.say(); }
    if (this.knock > 0) { this.knock -= dt; this.p.knockDown(this.knock > 1 ? 1 : this.knock); }
    else if (this.started && Math.abs(this.lat - this.targetLat) > 0.05) {
      this.lat += Math.sign(this.targetLat - this.lat) * this.speed * dt;
      this.p.walk(this.t * 6.5);
    } else this.p.walk(0, 0);
    const P = this.ctx.at(this.s, this.lat);
    const dir = Math.sign(this.targetLat - this.lat) || -this.side;
    this.p.root.position.set(P.x, P.y, P.z);
    this.p.root.rotation.y = P.heading - dir * Math.PI / 2;
    this.c.x = P.x; this.c.z = P.z;
    return !this.passed();
  }
  onHit(player) {
    if (this.knock > 0) return;
    const v = player.speed;
    this.ctx.bump(v, this.e, 'person');
    this.knock = 1.8;
    this.ctx.say(pick(['아야! 앞 좀 보고 다녀요!', '죄송합니다!!', '으악!']));
  }
}

class PedestrianSudden extends PedestrianCross {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const P = ctx.at(s, 0);
    this.group.remove(this.p.root);
    this.p = Props.makePerson({ shirt: 0x7048e8, phone: true });
    this.group.add(this.p.root);
    this.side = 1;
    this.lat = P.halfW + 1.0;
    this.targetLat = P.halfW - 1.6;
    this.started = true;
    this.speed = 1.9;
    this.wait = 2.2;
  }
  update(dt) {
    const r = super.update(dt);
    if (Math.abs(this.lat - this.targetLat) <= 0.05 && this.knock <= 0) {
      this.wait -= dt;
      if (this.wait <= 0) this.targetLat = this.ctx.at(this.s, 0).halfW + 1.3;
    }
    return r;
  }
}

// ---------------------------------------------------------------- 자동차
const CAR_COLORS = [0xc92a2a, 0xf8f9fa, 0x212529, 0x1864ab, 0x868e96, 0x2b8a3e];
class CarPass extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    this.car = Props.makeCar(pick(CAR_COLORS));
    this.group.add(this.car);
    this.cs = [this.collider(0.95, { tag: 'car' }), this.collider(0.95, { tag: 'car' }), this.collider(0.95, { tag: 'car' })];
    this.speed = this.e.speed;
    this.warned = false; this.pushed = false;
  }
  update(dt) {
    this.t += dt;
    const ps = this.ctx.playerS;
    // 플레이어 바로 뒤에서 차선을 침범했다면 감속
    const gap = ps - this.s;
    let sp = this.speed;
    const pl = this.ctx.playerLat;
    const P0 = this.ctx.at(this.s, 0);
    const lane = P0.halfW * 0.42;
    if (gap > 0 && gap < 12 && pl < lane + 1.6) sp = Math.min(sp, this.ctx.speed * 0.9);
    this.s += sp * dt;
    if (!this.warned && gap > 0 && gap < 18) { this.warned = true; this.ctx.say(pick(this.def.say)); this.ctx.toast('빵빵! 뒤에서 차가 와요', 'bad'); }
    const P = this.ctx.at(this.s, lane);
    this.car.position.set(P.x, P.y, P.z);
    this.car.rotation.y = P.heading;
    [-1.4, 0, 1.4].forEach((o, i) => { this.cs[i].x = P.x + P.tx * o; this.cs[i].z = P.z + P.tz * o; });
    if (!this.pushed && Math.abs(gap) < 2.5) { this.pushed = true; this.ctx.windPush(this.e.windPush, this.e.balance); }
    return this.s < this.ctx.route.length - 5 && this.s < ps + 150;
  }
  onHit(player, c) {
    // 거의 멈춘 상태에서 닿으면 밀려나기만, 빠르게 부딪히면 넘어짐
    if (Math.abs(this.speed - player.speed) < 2.5 || this.hitDone) { this.ctx.solid(c, 99, 'car'); return; }
    this.hitDone = true; this.ctx.crash('car');
  }
}

class CarCross extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    this.car = Props.makeCar(pick(CAR_COLORS));
    this.group.add(this.car);
    this.cs = [this.collider(0.95, { tag: 'car' }), this.collider(0.95, { tag: 'car' }), this.collider(0.95, { tag: 'car' })];
    const turn = ctx.route.turns.find((t) => t.s > ctx.playerS + 40 && t.s < ctx.playerS + 95);
    this.mode = 'oncoming';
    if (turn) {
      const routeRoad = ctx.route.pointAt(turn.s - 8).road;
      const other = turn.isect.roads.find((r) => r !== routeRoad) || turn.isect.roads[0];
      const pr = ctx.roads.projectOnRoad(other, turn.isect.x, turn.isect.z);
      this.road = other;
      this.dir = rand() < 0.5 ? 1 : -1;
      const eta = (turn.s - ctx.playerS) / Math.max(ctx.speed, 4);
      this.cs0 = pr.s - this.dir * Math.max(25, this.e.speed * eta - 4);
      this.rs = clamp(this.cs0, 2, other.length - 2);
      this.mode = 'cross';
      this.s = turn.s;
    } else {
      this.rs = s + 60;
    }
    this.speed = this.e.speed;
    this.stopT = 0;
  }
  update(dt) {
    this.t += dt;
    let x, z, y, h, tx, tz;
    const pp = this.ctx.playerPos;
    if (this.mode === 'cross') {
      const pt = this.ctx.roads.pointOnRoad(this.road, this.rs);
      tx = pt.tx * this.dir; tz = pt.tz * this.dir;
      const lane = this.road.halfW * 0.42;
      x = pt.x + -tz * lane; z = pt.z + tx * lane; y = pt.y; h = Math.atan2(tx, tz);
    } else {
      const P = this.ctx.at(this.rs, -this.ctx.at(this.rs, 0).halfW * 0.42);
      x = P.x; z = P.z; y = P.y; tx = -P.tx; tz = -P.tz; h = P.heading + Math.PI;
    }
    // 앞에 선호가 있으면 급정거 (빵빵!)
    const fx = pp.x - x, fz = pp.z - z;
    const ahead = fx * tx + fz * tz, side = Math.abs(fx * -tz + fz * tx);
    let sp = this.speed;
    if (ahead > 0 && ahead < 9 && side < 2.2) { sp = 0; if (!this.honked) { this.honked = true; this.ctx.say(pick(this.def.say)); this.ctx.toast('끼익—! 자동차 급정거', 'bad'); } }
    this.cur = this.cur === undefined ? sp : this.cur + clamp(sp - this.cur, -14 * dt, 6 * dt);
    this.cx = tx; this.cz = tz;
    if (this.mode === 'cross') this.rs += this.dir * this.cur * dt; else this.rs -= this.cur * dt;
    this.car.position.set(x, y, z);
    this.car.rotation.y = h;
    [-1.4, 0, 1.4].forEach((o, i) => { this.cs[i].x = x + tx * o; this.cs[i].z = z + tz * o; });
    if (this.mode === 'cross') return this.rs > 1 && this.rs < this.road.length - 1 && this.t < 40;
    return this.rs > this.ctx.playerS - 40 && this.t < 40;
  }
  onHit(player, c) {
    if ((this.cur || 0) + player.speed < 3 || (this.hitT && this.t - this.hitT < 2)) { this.ctx.solid(c, 99, 'car'); return; }
    this.hitT = this.t;
    if ((this.cur || 0) > 6) { this.ctx.stats.launches = (this.ctx.stats.launches || 0) + 1; player.launch(this.cx * this.cur * 0.8, 8, this.cz * this.cur * 0.8); this.ctx.state.modify('balance', -100); this.ctx.say('으아아아악~!!'); return; }
    this.ctx.crash('car');
  }
}

class ParkedCar extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    this.car = Props.makeCar(pick(CAR_COLORS));
    this.group.add(this.car);
    const P = ctx.at(s, ctx.at(s, 0).halfW - 1.15);
    this.car.position.set(P.x, P.y, P.z);
    this.car.rotation.y = P.heading;
    this.cs = [-1.4, 0, 1.4].map((o) => this.collider(0.95, { tag: 'car', solid: true, x: P.x + P.tx * o, z: P.z + P.tz * o }));
    this.blinkers = [];
    for (const z of [2.17, -2.17]) for (const x of [-0.85, 0.85]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa500 }));
      b.position.set(x, 0.75, z); this.car.add(b); this.blinkers.push(b);
    }
  }
  update(dt) {
    this.t += dt;
    const on = Math.floor(this.t * 2.5) % 2 === 0;
    for (const b of this.blinkers) b.visible = on;
    if (!this.told && this.s - this.ctx.playerS < 30) { this.told = true; this.say(); }
    return !this.passed();
  }
  onHit(player, c) { this.ctx.solid(c, this.e.crashSpeed, 'car'); }
}

// ---------------------------------------------------------------- 노면
class Pothole extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const lat = ctx.at(s, 0).halfW - 1.3 + (rand() - 0.5) * 0.8;
    this.P = ctx.at(s, lat);
    this.r = 0.55 + rand() * 0.25;
    const m = Props.makePothole(this.r);
    m.position.set(this.P.x, this.P.y + 0.03, this.P.z);
    this.group.add(m);
    this.c = this.collider(this.r * 0.85, { tag: 'pothole', x: this.P.x, z: this.P.z });
  }
  update() { return !this.passed(); }
  onHit(player) {
    if (this.done) return;
    this.done = true;
    const v = player.speed;
    if (v > this.e.safeSpeed) {
      this.ctx.state.modify('balance', -this.e.balancePerSpeed * v);
      this.ctx.cam.addShake(this.e.shake * (v / 5));
      this.ctx.say(pick(this.def.say));
    } else this.ctx.cam.addShake(0.1);
  }
}

class Puddle extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const lat = ctx.at(s, 0).halfW - 1.5 + (rand() - 0.5);
    this.P = ctx.at(s, lat);
    this.rx = 1.1 + rand() * 0.8; this.rz = 1.8 + rand() * 1.5;
    const m = Props.makePuddle(this.rx, this.rz);
    m.position.set(this.P.x, this.P.y + 0.035, this.P.z);
    m.rotation.y = this.P.heading;
    this.group.add(m);
    this.c = this.collider(Math.min(this.rx, this.rz) * 0.95, { tag: 'puddle', x: this.P.x, z: this.P.z });
    this.splash = null;
  }
  update(dt) {
    this.t += dt;
    if (this.splash) this.splash.update(dt);
    return !this.passed(10);
  }
  muAt(x, z) {
    const dx = x - this.P.x, dz = z - this.P.z;
    return (dx * dx) / (this.rx * this.rx) + (dz * dz) / (this.rz * this.rz) < 1 ? 1 - this.ctx.friction.puddlePenalty : 1;
  }
  onHit(player) {
    if (this.done) return;
    this.done = true;
    const v = player.speed;
    if (v > this.e.safeSpeed) {
      this.ctx.state.modify('cleanliness', -this.e.cleanPerSpeed * v);
      this.ctx.state.modify('clothesWet', this.e.wet);
      this.ctx.stats.splashes++;
      for (let i = 0; i < 3; i++) this.ctx.stain('mud');
      this.ctx.say(pick(this.def.say));
      this.splash = new Splash(this.group, player.position, v);
    }
  }
}

class Splash {
  constructor(parent, pos, v) {
    const n = 60;
    this.vel = [];
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p.set([pos.x, pos.y + 0.1, pos.z], i * 3);
      this.vel.push([(rand() - 0.5) * 3, 1.5 + rand() * 2.5 * (v / 5), (rand() - 0.5) * 3]);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a9bb0, size: 0.09, transparent: true, opacity: 0.9 }));
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const p = this.pts.geometry.attributes.position.array;
    this.vel.forEach((v, i) => { v[1] -= 9.8 * dt; p[i * 3] += v[0] * dt; p[i * 3 + 1] += v[1] * dt; p[i * 3 + 2] += v[2] * dt; });
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.material.opacity = Math.max(0, 0.9 - this.t);
  }
}

class Construction extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const half = ctx.at(s, 0).halfW;
    this.len = this.e.length;
    // 입구 바리케이드
    const B = ctx.at(s, half * 0.55);
    const bar = Props.makeBarrier(half * 0.9);
    bar.position.set(B.x, B.y, B.z);
    bar.rotation.y = B.heading;
    this.group.add(bar);
    this.light = bar.userData.light;
    for (let o = -half * 0.4; o <= half * 0.4; o += 0.9) {
      const q = ctx.at(s, half * 0.55 + o);
      this.collider(0.45, { tag: 'barrier', solid: true, x: q.x, z: q.z });
    }
    // 차선 따라 라바콘
    this.cones = [];
    for (let d = 1.5; d <= this.len; d += 2.2) {
      const q = ctx.at(s + d, 0.35);
      const cone = Props.makeCone();
      cone.position.set(q.x, q.y, q.z);
      this.group.add(cone);
      const c = this.collider(0.25, { tag: 'cone', x: q.x, z: q.z, mesh: cone });
      this.cones.push(c);
    }
    // 공사 구간 표시(파낸 흙) + 막힌 영역
    for (let d = 2; d < this.len; d += 1.6) {
      const q = ctx.at(s + d, half * 0.62);
      this.collider(0.55, { tag: 'barrier', solid: true, x: q.x, z: q.z });
      if (Math.round(d / 1.6) % 3 === 0) {
        const dirt = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 1 }));
        dirt.scale.y = 0.4; dirt.position.set(q.x, q.y, q.z);
        this.group.add(dirt);
      }
    }
  }
  update(dt) {
    this.t += dt;
    this.light.visible = Math.floor(this.t * 3) % 2 === 0;
    if (!this.told && this.s - this.ctx.playerS < 35) { this.told = true; this.say(); this.ctx.toast('공사 구간! 왼쪽 차로로 피해 가세요', 'bad'); }
    for (const c of this.cones) if (c.knocked) { c.mesh.rotation.z = Math.min(1.4, c.mesh.rotation.z + dt * 6); }
    return !this.passed(this.len);
  }
  onHit(player, c) {
    if (c.tag === 'cone') {
      if (c.knocked) return;
      c.knocked = true; c.active = false;
      this.ctx.state.modify('balance', -this.e.coneBalance * clamp(player.speed / 4, 0.3, 1.5));
      this.ctx.say('라바콘을 쳤다!');
    } else this.ctx.solid(c, this.e.crashSpeed, 'barrier');
  }
}

class Leaves extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const half = ctx.at(s, 0).halfW;
    this.len = this.e.length;
    this.lat = half - 1.8;
    this.w = 4.2;
    for (let d = 0; d < this.len; d += 4) {
      const q = ctx.at(s + d + 2, this.lat);
      const patch = Props.makeLeafPatch(this.w, 4.2, 110);
      patch.position.set(q.x, q.y + 0.03, q.z);
      patch.rotation.y = q.heading;
      this.group.add(patch);
    }
  }
  update() {
    const inside = this.inside(this.ctx.playerS, this.ctx.playerLat);
    if (inside && !this.told) { this.told = true; this.say(); if (rand() < 0.5) this.ctx.stain('leaf'); }
    return !this.passed(this.len);
  }
  inside(s, lat) { return s > this.s && s < this.s + this.len && Math.abs(lat - this.lat) < this.w / 2; }
  muAt() { return this.inside(this.ctx.playerS, this.ctx.playerLat) ? 1 - this.ctx.friction.leavesPenalty : 1; }
}

// ---------------------------------------------------------------- 동물
class Pigeons extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const half = ctx.at(s, 0).halfW;
    const n = Math.round(range(this.e.count));
    this.birds = [];
    for (let i = 0; i < n; i++) {
      const b = Props.makePigeon();
      b.root.scale.setScalar(1.6);
      const ds = (rand() - 0.5) * 6, lat = lerp(0.6, half + 0.5, rand());
      const q = ctx.at(s + ds, lat);
      b.root.position.set(q.x, q.y, q.z);
      b.root.rotation.y = rand() * 6;
      this.group.add(b.root);
      const c = this.collider(0.22, { tag: 'pigeon', x: q.x, z: q.z, bird: b });
      this.birds.push({ b, c, vy: 0, vx: 0, vz: 0, flying: false, phase: rand() * 10 });
    }
  }
  update(dt) {
    this.t += dt;
    const pp = this.ctx.playerPos;
    for (const B of this.birds) {
      const r = B.b.root;
      const d = Math.hypot(pp.x - r.position.x, pp.z - r.position.z);
      if (!B.flying && d < 7 + this.ctx.speed * 0.6) {
        B.flying = true; B.vy = 2.5 + rand() * 2; B.vx = (rand() - 0.5) * 4; B.vz = (rand() - 0.5) * 4;
        B.fly = 0;
        if (!this.told) { this.told = true; this.say(); }
      }
      if (B.flying) {
        B.fly += dt;
        r.position.x += B.vx * dt; r.position.z += B.vz * dt; r.position.y += B.vy * dt;
        B.vy = Math.max(0.6, B.vy - dt * 1.2);
        B.b.flap(this.t * 30, 0.9);
        r.rotation.y = Math.atan2(B.vx, B.vz);
        B.c.active = r.position.y < 1.6 + this.ctx.playerPos.y;
      } else B.b.peck(this.t * 5 + B.phase);
      B.c.x = r.position.x; B.c.z = r.position.z;
    }
    return !this.passed() || this.t < 6;
  }
  onHit(player, c) {
    if (c.hit) return;
    c.hit = true; c.active = false;
    this.ctx.state.modify('balance', -this.e.balance);
    this.ctx.say(pick(['구구구!! (화남)', '비둘기랑 부딪혔다!', '퍼드득!']));
    if (rand() < this.e.poopChance) this.ctx.poop(this.e.clean);
  }
}

class BirdPoop extends GameEvent {
  constructor(def, ctx) {
    super(def, ctx, ctx.playerS);
    this.bird = Props.makePigeon();
    this.bird.root.scale.setScalar(1.4);
    this.group.add(this.bird.root);
    const pp = ctx.playerPos, v = ctx.playerVel;
    this.T = this.e.dropTime;
    // 지금 속도로 계속 가면 도착할 곳 + 약간의 오차
    this.target = { x: pp.x + v.x * this.T + (rand() - 0.5) * 0.6, z: pp.z + v.z * this.T + (rand() - 0.5) * 0.6 };
    this.target.y = ctx.groundY(this.target.x, this.target.z);
    this.mark = Props.makeTarget();
    this.mark.position.set(this.target.x, this.target.y + 0.05, this.target.z);
    this.group.add(this.mark);
    this.start = { x: pp.x - v.x * 1.5, z: pp.z - v.z * 1.5, y: pp.y + 11 };
    this.drop = null;
    ctx.say(pick(def.say));
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.T;
    const b = this.bird.root;
    b.position.set(lerp(this.start.x, this.target.x, k * 1.2), this.start.y, lerp(this.start.z, this.target.z, k * 1.2));
    b.rotation.y = Math.atan2(this.target.x - this.start.x, this.target.z - this.start.z);
    this.bird.flap(this.t * 25, 0.8);
    this.mark.scale.setScalar(lerp(1.6, 0.8, clamp(k, 0, 1)));
    this.mark.material.opacity = 0.2 + 0.4 * clamp(k, 0, 1);
    if (!this.drop && k > 0.6) { this.drop = Props.makeDropping(); this.group.add(this.drop); this.dropFrom = b.position.clone(); }
    if (this.drop && !this.landed) {
      const kk = clamp((k - 0.6) / 0.4, 0, 1);
      this.drop.position.set(lerp(this.dropFrom.x, this.target.x, kk), lerp(this.dropFrom.y, this.target.y + 1.7, kk * kk), lerp(this.dropFrom.z, this.target.z, kk));
    }
    if (!this.landed && k >= 1) {
      this.landed = true;
      const pp = this.ctx.playerPos;
      const d = Math.hypot(pp.x - this.target.x, pp.z - this.target.z);
      if (d < this.e.radius && this.ctx.player.mode !== 'cutscene') this.ctx.poop(this.e.clean, true);
      else this.ctx.say(pick(['휴, 피했다!', '어림없지!', '새똥 회피 성공!']));
      this.group.remove(this.drop, this.mark);
    }
    return this.t < this.T + 3;
  }
}

class Cat extends GameEvent {
  constructor(def, ctx, s, kind = 'cat') {
    super(def, ctx, s);
    const half = ctx.at(s, 0).halfW;
    this.side = rand() < 0.5 ? -1 : 1;
    this.lat = this.side * (half + 0.8);
    this.target = -this.side * (half + 1.5);
    this.a = Props.makeAnimal(kind);
    this.group.add(this.a.root);
    this.c = this.collider(0.32, { tag: kind });
    this.go = false;
  }
  update(dt) {
    this.t += dt;
    if (!this.go && this.s - this.ctx.playerS < 15) { this.go = true; this.say(); }
    if (this.go && Math.abs(this.lat - this.target) > 0.1) { this.lat += Math.sign(this.target - this.lat) * this.e.speed * dt; this.a.run(this.t * 18); }
    const P = this.ctx.at(this.s, this.lat);
    this.a.root.position.set(P.x, P.y, P.z);
    this.a.root.rotation.y = P.heading - Math.sign(this.target - this.lat || 1) * Math.PI / 2;
    this.c.x = P.x; this.c.z = P.z;
    return !this.passed();
  }
  onHit(player) {
    if (this.hit) return;
    this.hit = true; this.c.active = false;
    this.ctx.bump(player.speed, { slow: 0.7, balancePerSpeed: this.e.balance / 4, fallSpeed: this.e.fallSpeed }, 'animal');
    this.ctx.say('야옹!! (깜짝 놀라 도망)');
    this.target = this.lat + this.side * -3;
  }
}

class Dog extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    this.a = Props.makeAnimal('dog');
    this.group.add(this.a.root);
    this.lat = ctx.at(s, 0).halfW + 0.8;
    this.dur = this.e.duration;
  }
  update(dt) {
    this.t += dt;
    const ps = this.ctx.playerS;
    const chasing = this.t < this.dur;
    const want = chasing ? ps - 2.5 : this.s;
    const sp = chasing ? Math.min(8, Math.max(this.ctx.speed + 1.2, 3)) : 0;
    if (this.s < want) this.s = Math.min(want, this.s + sp * dt);
    this.lat = lerp(this.lat, chasing ? this.ctx.playerLat + 1.0 : this.lat, dt * 1.5);
    if (sp > 0) this.a.run(this.t * 20);
    const P = this.ctx.at(this.s, this.lat);
    this.a.root.position.set(P.x, P.y, P.z);
    this.a.root.rotation.y = P.heading;
    if (chasing) {
      this.ctx.mods.power *= this.e.powerBoost;
      this.ctx.state.modify('fatigue', (this.e.fatigue / this.dur) * dt);
      if (Math.floor(this.t * 0.8) !== Math.floor((this.t - dt) * 0.8)) this.ctx.say(pick(['멍멍멍!!', '왈왈!', ...this.def.say]));
    }
    return this.t < this.dur + 4;
  }
}

class Pickup extends GameEvent {
  constructor(def, ctx, s, kind) {
    super(def, ctx, s);
    this.kind = kind;
    const P = ctx.at(s, ctx.at(s, 0).halfW - 1.4);
    this.p = Props.makePickup(kind);
    this.p.root.position.set(P.x, P.y, P.z);
    this.group.add(this.p.root);
    this.c = this.collider(1.0, { tag: 'pickup', x: P.x, z: P.z });
  }
  update(dt) {
    this.t += dt;
    this.p.item.rotation.y += dt * 2;
    this.p.item.position.y = 1.1 + Math.sin(this.t * 3) * 0.08;
    return !this.got && !this.passed();
  }
  onHit() {
    if (this.got) return;
    this.got = true;
    const e = this.e, st = this.ctx.state;
    if (e.boost) this.ctx.boost(e.boost);
    if (e.temp) st.modify('bodyTemp', e.temp);
    if (e.fatigue) st.modify('fatigue', e.fatigue);
    if (e.coldRisk) st.modify('coldRisk', e.coldRisk);
    if (e.clean) st.modify('cleanliness', -e.clean);
    this.ctx.stats.pickups++;
    this.ctx.toast(`${this.def.name} 획득! ${e.boost ? '속도 폭발! ' : ''}${e.temp ? '체온↑ ' : ''}${e.fatigue ? '피로↓' : ''}`, 'good');
    this.ctx.say(pick(this.def.say));
  }
}

// 교차로 번개 자동차: 옆길에서 엄청난 속도로 튀어나와요. 선호가 서두르면 정확히 같은 때에 도착해서
// 치이고 하늘로 날아가요(코미디). 속도를 줄여 조심해서 건너면 아슬아슬하게 지나가요.
class CarAmbush extends GameEvent {
  constructor(def, ctx, s) {
    super(def, ctx, s);
    const R = ctx.route;
    const turns = R.turns.filter((t) => t.s > ctx.playerS + 45 && t.s < ctx.playerS + 135);
    if (!turns.length) { this.dead = true; return; }
    const turn = pick(turns);
    const before = R.pointAt(turn.s - 8).road;
    const other = turn.isect.roads.find((r) => r !== before) || turn.isect.roads[0];
    this.turn = turn; this.road = other;
    this.cs0 = ctx.roads.projectOnRoad(other, turn.isect.x, turn.isect.z).s;
    // 선호가 나가는 방향과 마주 보고 달려오게 (정면충돌 코미디). 직진이면 무작위.
    const exit = R.pointAt(turn.s + 10), rt = ctx.roads.pointOnRoad(other, this.cs0);
    const dot = exit.tx * rt.tx + exit.tz * rt.tz;
    this.dir = Math.abs(dot) > 0.5 ? (dot > 0 ? -1 : 1) : (rand() < 0.5 ? 1 : -1);
    let avail = this.dir > 0 ? this.cs0 - 2 : other.length - 2 - this.cs0;
    if (avail < 30) { this.dir = -this.dir; avail = this.dir > 0 ? this.cs0 - 2 : other.length - 2 - this.cs0; }
    if (avail < 30) { this.dead = true; return; }
    const eta = Math.max(1.2, (turn.s - ctx.playerS) / Math.max(ctx.speed, 6));
    this.speed = clamp(this.e.speed, 16, 34);
    const dist = Math.min(avail, this.speed * eta);
    this.rs = this.cs0 - this.dir * dist;
    this.car = Props.makeCar(pick([0xe03131, 0xf59f00, 0x1c7ed6, 0xf8f9fa]));
    this.group.add(this.car);
    this.cs = [this.collider(1.0, { tag: 'car' }), this.collider(1.0, { tag: 'car' }), this.collider(1.0, { tag: 'car' })];
    this.track = true;
  }
  update(dt) {
    this.t += dt;
    const c = this.ctx;
    const remaining = (this.cs0 - this.rs) * this.dir;
    // 출발 지점이 가까워서 너무 일찍 도착하게 되면, 때가 될 때까지 숨어서 기다려요
    if (!this.go) {
      const eta = Math.max(0.7, (this.turn.s - c.playerS) / Math.max(c.speed, 6));
      if (remaining / 28 <= eta + 0.15) this.go = true;
      this.car.visible = this.go;
      for (const k of this.cs) k.active = this.go;
      if (!this.go) return this.t < 25 && c.playerS < this.turn.s + 10;
    }
    // 멀리 있을 땐 선호가 서두르는 만큼 도착 시간을 맞춰요 (천천히 가면 먼저 지나가 버림)
    if (this.track && remaining > 12) {
      if (c.speed > 7) {
        const dpl = Math.hypot(c.playerPos.x - this.turn.isect.x, c.playerPos.z - this.turn.isect.z);
        const eta = Math.max(0.35, dpl / Math.max(c.speed, 4));
        this.speed = clamp(remaining / eta, 14, 44);
      }
    } else this.track = false;
    this.rs += this.dir * this.speed * dt;
    const pt = c.roads.pointOnRoad(this.road, this.rs);
    const tx = pt.tx * this.dir, tz = pt.tz * this.dir;
    // 차선: 평소엔 자기 차선, 선호가 교차로 가까이 있으면 그쪽으로 핸들을 꺾어요(코미디 연출)
    const hw = this.road.halfW, isx = this.turn.isect.x, isz = this.turn.isect.z;
    let target = this.dir * hw * 0.42;
    if (remaining < 45 && remaining > -6 && Math.hypot(c.playerPos.x - isx, c.playerPos.z - isz) < 22) {
      target = clamp(c.roads.projectOnRoad(this.road, c.playerPos.x, c.playerPos.z).lateral, -(hw - 0.8), hw - 0.8);
    }
    this.L = this.L === undefined ? this.dir * hw * 0.42 : this.L + (target - this.L) * Math.min(1, dt * 7);
    const x = pt.x - pt.tz * this.L, z = pt.z + pt.tx * this.L;
    this.car.position.set(x, pt.y, z);
    this.car.rotation.y = Math.atan2(tx, tz);
    [-1.4, 0, 1.4].forEach((o, i) => { this.cs[i].x = x + tx * o; this.cs[i].z = z + tz * o; });
    this.vx = tx; this.vz = tz;
    if (!this.warned && remaining < 58 && remaining > 0) {
      this.warned = true;
      c.toast('빠앙—!! 옆길에서 차가 와요!', 'bad');
      c.say(c.speed > 9 ? '어? 저 차 너무 빠른데?!' : '교차로는 조심조심…');
    }
    if (!this.hit && !this.passedSay && remaining < -10) {
      this.passedSay = true;
      if (Math.abs(c.playerS - this.turn.s) < 40) { c.toast('아슬아슬! 교차로는 조심해서!', 'good'); c.say('휴… 큰일 날 뻔했다'); }
    }
    return remaining > -90 && this.t < 30;
  }
  onHit(player) {
    if (this.hit) return;
    this.hit = true;
    const c = this.ctx, s = this.speed;
    c.stats.launches = (c.stats.launches || 0) + 1;
    player.launch(this.vx * s * 0.85 + Math.sin(player.heading) * player.speed * 0.4, this.e.launch + rand() * 3, this.vz * s * 0.85 + Math.cos(player.heading) * player.speed * 0.4);
    c.state.modify('balance', -100);
    c.state.modify('cleanliness', -6);
    c.cam.addShake(0.6);
    c.say(pick(this.def.say));
    c.toast('쾅!! 자동차에 치여 하늘을 날았어요!', 'bad');
  }
}

export const EVENT_CLASSES = {
  carAmbush: CarAmbush,
  energyDrink: (d, c, s) => new Pickup(d, c, s, 'energyDrink'),
  pedestrianCross: PedestrianCross,
  pedestrianSudden: PedestrianSudden,
  carPass: CarPass,
  carCross: CarCross,
  parkedCar: ParkedCar,
  pothole: Pothole,
  puddle: Puddle,
  construction: Construction,
  leaves: Leaves,
  pigeons: Pigeons,
  birdPoop: BirdPoop,
  cat: (d, c, s) => new Cat(d, c, s, 'cat'),
  dog: Dog,
  hotDrink: (d, c, s) => new Pickup(d, c, s, 'hotDrink'),
  bungeoppang: (d, c, s) => new Pickup(d, c, s, 'bungeoppang'),
};
// 장애물처럼 도로 한 자리를 차지하는 이벤트 (교차로 안에는 만들지 않음)
export const STATIC_EVENTS = new Set(['parkedCar', 'construction', 'pothole', 'puddle', 'leaves', 'pigeons', 'hotDrink', 'bungeoppang']);

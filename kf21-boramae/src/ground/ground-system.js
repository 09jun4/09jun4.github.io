// 지상 목표와 대공 위협: 배치, 이동(트럭·함정), 대공포 사격, SAM 발사·유도, 피해·파괴 연출.
// 모델은 코드로 만든 저폴리이고 종류마다 InstancedMesh 하나라서, 목표가 40개여도 드로우콜은 종류 수만큼이다.
// 목표 객체는 적기와 같은 모양(alive, pos, velocity, cfg.hitRadius)을 갖춰 기관포 조준 코드가 그대로 쓴다.
import * as THREE from 'three';
import { DEG, clamp, lerp } from '../core/math.js';
import { TARGETS, GROUND_RULES, AA, SAM } from '../data/targets.js';
import { getGroundHeight } from '../world/ground.js';
import { damagePlayer } from '../combat/damage.js';
import { FX } from '../data/fx.js';
import { PALETTE } from '../data/palette.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, -1);
const WRECK = new THREE.Color(0x1c1a18);
const WHITE = new THREE.Color(0xffffff);

/** 상자·원통을 색과 함께 모아 한 지오메트리로 만든다(비인덱스, 플랫 셰이딩) */
function model(parts) {
  const pos = [], col = [];
  for (const [geo, color, x, y, z, rx = 0, rz = 0] of parts) {
    const g = geo.toNonIndexed();
    g.applyMatrix4(_m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z));
    _c.set(color);
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1], a[i + 2]); col.push(_c.r, _c.g, _c.b); }
    g.dispose(); geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);

/** 종류별 모델(원점 = 바닥 중심, 앞 = -z) */
const MODELS = {
  comm_tower: () => model([[box(9, 4, 9), 0x7d8288, 0, 2, 0], [cyl(0.9, 2.2, 34, 6), 0x9aa0a6, 0, 21, 0], [box(7, 0.6, 0.6), 0xd94a3a, 0, 30, 0], [box(0.6, 0.6, 7), 0xd94a3a, 0, 25, 0], [cyl(0.25, 0.25, 6, 5), 0xe8e8e8, 0, 41, 0], [box(5, 3, 4), 0x5f666c, 7, 1.5, 3]]),
  radar: () => model([[box(10, 3.2, 8), 0x6f7a62, 0, 1.6, 0], [cyl(1.1, 1.4, 6, 6), 0x8a917c, 0, 6, 0], [box(13, 7, 0.8), 0xb8beb0, 0, 12.5, -0.6, 0.18], [box(1, 1, 3.2), 0x55594c, 0, 12.5, 1.2]]),
  aa_gun: () => model([[cyl(4.2, 4.8, 1.4, 8), 0x5c6450, 0, 0.7, 0], [box(3.2, 2.2, 3.6), 0x6b7460, 0, 2.4, 0], [cyl(0.22, 0.22, 6.5, 5), 0x2c2f2a, -0.6, 4.4, -2.6, -1.05], [cyl(0.22, 0.22, 6.5, 5), 0x2c2f2a, 0.6, 4.4, -2.6, -1.05]]),
  sam: () => model([[box(4.2, 1.6, 9), 0x59624c, 0, 1.4, 0], [box(3.6, 1.2, 3), 0x444b3b, 0, 2.8, 3], [box(3.8, 1.5, 6.4), 0x7a8468, 0, 4.4, -1, -0.5], [cyl(0.45, 0.45, 6.6, 6), 0xe6e6e0, -0.9, 5.3, -1.4, -2.07], [cyl(0.45, 0.45, 6.6, 6), 0xe6e6e0, 0.9, 5.3, -1.4, -2.07]]),
  truck: () => model([[box(3, 1.2, 8), 0x4d5642, 0, 1.3, 0], [box(2.8, 2, 2.4), 0x5a644e, 0, 2.6, -2.6], [box(3, 2.4, 5), 0x6d6f58, 0, 2.9, 1.4], [box(3.2, 1, 1.4), 0x1c1c1c, 0, 0.5, -2.4], [box(3.2, 1, 1.4), 0x1c1c1c, 0, 0.5, 2.4]]),
  patrol_boat: () => model([[box(9, 3.4, 46), 0x6c7884, 0, 1.4, 0], [box(6, 2.6, 9), 0x6c7884, 0, 1.6, -26, 0.12], [box(7, 4.5, 13), 0x8b96a2, 0, 5.4, 3], [box(4.6, 3, 6), 0xa3adb8, 0, 9, 3], [cyl(0.25, 0.4, 7, 5), 0xd0d4d8, 0, 13.5, 4], [cyl(1.6, 1.8, 1.4, 8), 0x4c5560, 0, 3.8, -13], [cyl(0.2, 0.2, 5, 5), 0x24282c, 0, 4.8, -15.4, -1.2], [cyl(1.6, 1.8, 1.4, 8), 0x4c5560, 0, 3.8, 15], [cyl(0.2, 0.2, 5, 5), 0x24282c, 0, 4.8, 17.4, 1.2]]),
};

export class GroundSystem {
  constructor(scene) {
    const cap = GROUND_RULES.maxActive;
    this.group = new THREE.Group();
    this.group.name = 'ground-targets';
    scene.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.meshes = {};
    for (const type of Object.keys(TARGETS)) {
      const mesh = new THREE.InstancedMesh(MODELS[type](), this.material, cap);
      mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.castShadow = false;
      mesh.setColorAt(0, WHITE);
      this.meshes[type] = mesh;
      this.group.add(mesh);
    }
    // 경고등(야간에 목표를 찾을 수 있게): 살아 있는 목표 위의 붉은 점
    this.beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false, fog: false }), cap);
    this.beacons.count = 0; this.beacons.frustumCulled = false;
    this.group.add(this.beacons);
    // SAM 미사일
    this.samMesh = new THREE.InstancedMesh(model([[cyl(0.32, 0.32, 5.2, 6), 0xe8e8e2, 0, 0, 0, Math.PI / 2], [cyl(0.02, 0.32, 1.2, 6), 0xc2402e, 0, 0, -3.2, -Math.PI / 2]]), this.material, SAM.pool);
    this.samMesh.count = 0; this.samMesh.frustumCulled = false;
    this.group.add(this.samMesh);
    this.targets = Array.from({ length: cap }, (_, index) => ({
      index, ground: true, alive: false, used: false, type: '', def: null, cfg: { hitRadius: 10 }, id: '', hp: 0,
      pos: new THREE.Vector3(), base: new THREE.Vector3(), velocity: new THREE.Vector3(), yaw: 0, spin: 0,
      path: null, leg: 0, fireTimer: 0, burstLeft: 0, burstTimer: 0, acc: 0, slot: 0, group: { position: new THREE.Vector3() },
    }));
    /** 날아가는 SAM. 위협 경고가 { active, pos }를 읽는다 */
    this.sams = Array.from({ length: SAM.pool }, () => ({ active: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), life: 0, smoke: 0 }));
    this.smokes = [];
    this.count = 0;
    this.aliveCount = 0;
    this.lights = 1;
    this.time = 0;
    this.rng = Math.random;
    this.onDestroyed = null; // (target) => void
  }

  /** 미션 시작: 데이터대로 배치한다. 좌표는 활주로 시작점 기준(미션 시작 때 원점 재배치는 0이다) */
  reset(mission, rng, lights = 1) {
    this.rng = rng;
    this.lights = lights;
    this.time = 0;
    this.smokes.length = 0;
    for (const s of this.sams) s.active = false;
    for (const t of this.targets) { t.alive = false; t.used = false; }
    let n = 0;
    const byId = {};
    const place = (type, x, z, spec) => {
      if (n >= this.targets.length || !TARGETS[type]) return null;
      const t = this.targets[n++];
      const def = TARGETS[type];
      t.used = true; t.alive = true; t.type = type; t.def = def; t.id = spec.id || `${type}${n}`; t.hp = def.hp;
      t.cfg.hitRadius = def.radius;
      t.base.set(x, getGroundHeight(x, z), z);
      t.yaw = spec.yaw != null ? spec.yaw * DEG : rng() * Math.PI * 2;
      t.spin = 0;
      t.path = spec.path ? spec.path.map(([px, pz]) => new THREE.Vector3(px, 0, pz)) : null;
      t.leg = 0;
      t.velocity.set(0, 0, 0);
      t.fireTimer = def.weapon === 'sam' ? lerp(SAM.firstShot[0], SAM.firstShot[1], rng()) : lerp(AA.firstShot[0], AA.firstShot[1], rng());
      t.burstLeft = 0; t.burstTimer = 0; t.acc = 0;
      this._center(t);
      return t;
    };
    for (const spec of mission.groundTargets || []) {
      if (spec.pos) { const t = place(spec.type, spec.pos[0], spec.pos[1], spec); if (t && spec.id) byId[spec.id] = t; }
    }
    for (const spec of mission.groundTargets || []) {
      if (!spec.near || !byId[spec.near]) continue;
      const c = byId[spec.near].base, count = spec.count || 1, r = spec.radius || GROUND_RULES.nearRadius, a0 = rng() * Math.PI * 2;
      for (let i = 0; i < count; i++) { const a = a0 + (i / count) * Math.PI * 2; place(spec.type, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, { ...spec, id: null }); }
    }
    this.count = n;
    this.aliveCount = n;
    this._layout();
  }

  _center(t) {
    t.pos.set(t.base.x, t.base.y + t.def.height * 0.5, t.base.z);
    t.group.position.copy(t.pos);
  }

  /** 인스턴스 칸 배정: 종류별로 앞에서부터 채운다(파괴된 것은 잔해 색으로 같은 칸에 남는다) */
  _layout() {
    const used = {};
    for (const type in this.meshes) used[type] = 0;
    for (let i = 0; i < this.count; i++) { const t = this.targets[i]; t.slot = used[t.type]++; }
    for (const type in this.meshes) { const m = this.meshes[type]; m.count = used[type]; m.visible = used[type] > 0; }
    for (let i = 0; i < this.count; i++) this._write(this.targets[i]);
    for (const type in this.meshes) { const m = this.meshes[type]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  _write(t) {
    const mesh = this.meshes[t.type];
    _q.setFromAxisAngle(UP, t.yaw + t.spin);
    if (t.alive) _s.set(1, 1, 1); else { _s.set(1.05, 0.38, 1.05); _q.multiply(new THREE.Quaternion().setFromAxisAngle(FWD, 0.12)); }
    mesh.setMatrixAt(t.slot, _m.compose(t.base, _q, _s));
    mesh.setColorAt(t.slot, t.alive ? WHITE : WRECK);
  }

  /** 기관포·미사일·폭탄 피해. 규칙: 폭탄은 전부, 기관포는 soft만 ×0.25, 미사일은 통하지 않는다 */
  damage(t, amount, source, ctx) {
    if (!t.alive) return false;
    const rule = GROUND_RULES.damage[source] || GROUND_RULES.damage.missile;
    const dealt = amount * rule[t.def.armor];
    if (dealt <= 0) return false;
    t.hp -= dealt;
    if (t.hp > 0) return false;
    t.hp = 0;
    t.alive = false;
    this.aliveCount--;
    t.velocity.set(0, 0, 0);
    this._write(t);
    const mesh = this.meshes[t.type];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    ctx.fx.explosion(t.pos, t.velocity, t.def.radius > 20 ? 1.8 : 1.2);
    ctx.rig.addShake(ctx.shake.explosion * Math.max(0, 1 - t.pos.distanceTo(ctx.player.flight.pos) / 1200));
    ctx.audio.play('explosion');
    const k = GROUND_RULES.smoke;
    if (this.smokes.length >= k.max) this.smokes.shift();
    this.smokes.push({ pos: t.pos.clone(), life: k.life, timer: 0 });
    if (this.onDestroyed) this.onDestroyed(t);
    return true;
  }

  /** 폭탄 폭발: 반경 안의 지상 목표에 거리에 따라 줄어드는 피해 */
  blast(pos, cfg, ctx) {
    let hits = 0;
    for (let i = 0; i < this.count; i++) {
      const t = this.targets[i];
      if (!t.alive) continue;
      const d = Math.max(0, Math.hypot(t.base.x - pos.x, t.base.z - pos.z) - t.def.radius); // 목표 가장자리부터 잰다
      if (d > cfg.radius) continue;
      hits++;
      this.damage(t, cfg.damage * (1 - (d / cfg.radius) * cfg.falloff), 'bomb', ctx);
    }
    return hits;
  }

  step(dt, ctx) {
    this.time += dt;
    const player = ctx.player, pp = player.flight.pos;
    let moved = false;
    for (let i = 0; i < this.count; i++) {
      const t = this.targets[i];
      if (!t.alive) continue;
      const def = t.def;
      // 이동(트럭·함정): 경로를 따라 왕복
      if (t.path && def.speed) {
        const goal = t.path[t.leg % t.path.length];
        _v.set(goal.x - t.base.x, 0, goal.z - t.base.z);
        const d = _v.length();
        if (d < def.speed * dt + 1) t.leg++; else {
          _v.multiplyScalar(1 / d);
          t.velocity.copy(_v).multiplyScalar(def.speed);
          t.base.addScaledVector(t.velocity, dt);
          t.base.y = getGroundHeight(t.base.x + ctx.origin.x, t.base.z + ctx.origin.z);
          t.yaw = Math.atan2(-_v.x, -_v.z);
          this._center(t); this._write(t); this.meshes[t.type].instanceMatrix.needsUpdate = true; moved = true;
        }
      }
      if (def.spin) { t.spin += def.spin * dt; this._write(t); this.meshes[t.type].instanceMatrix.needsUpdate = true; }
      if (!def.weapon || !player.alive) continue;
      // 먼 목표는 15Hz로만 판단한다
      const dist = t.pos.distanceTo(pp);
      let step = dt;
      if (dist > GROUND_RULES.farDistance) { t.acc += dt; if (t.acc < GROUND_RULES.farTick) continue; step = t.acc; t.acc = 0; }
      if (def.weapon === 'aa') this._aa(t, step, dist, ctx); else if (def.weapon === 'sam') this._samSite(t, step, dist, ctx);
    }
    this._stepSams(dt, ctx);
    // 연기 기둥
    const k = GROUND_RULES.smoke;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life -= dt; s.timer -= dt;
      if (s.life <= 0) { this.smokes.splice(i, 1); continue; }
      if (s.timer <= 0) { s.timer = k.every; _p.copy(s.pos); _p.y += 4; ctx.fx.smoke(_p, FX.wreck.smoke, PALETTE.fx.smokeB); }
    }
    void moved;
  }

  _aa(t, dt, dist, ctx) {
    const guns = t.def.guns || 1;
    if (t.burstLeft > 0) {
      t.burstTimer -= dt;
      if (t.burstTimer > 0) return;
      t.burstLeft--;
      t.burstTimer = AA.burstGap;
      const player = ctx.player;
      const time = dist / AA.bulletSpeed;
      _aim.copy(player.flight.pos).addScaledVector(player.velocity, time);
      // 산포: 일부만 기체 근처로, 나머지는 넓게 빗나간다
      const spread = this.rng() < AA.hitChance ? AA.nearSpread * this.rng() : lerp(AA.wideSpread[0], AA.wideSpread[1], this.rng());
      const a = this.rng() * Math.PI * 2, u = this.rng() * 2 - 1, r = Math.sqrt(1 - u * u);
      _aim.x += Math.cos(a) * r * spread; _aim.y += u * spread; _aim.z += Math.sin(a) * r * spread;
      for (let g = 0; g < guns; g++) {
        _p.copy(t.pos); _p.y += t.def.height * 0.3;
        if (guns > 1) _p.addScaledVector(_v.set(-Math.sin(t.yaw), 0, -Math.cos(t.yaw)), g === 0 ? 13 : -15);
        _v.subVectors(_aim, _p).normalize();
        ctx.projectiles.spawn(_p, _v, AA.bulletSpeed, AA.bulletLife, AA.damage);
      }
      return;
    }
    t.fireTimer -= dt;
    if (t.fireTimer > 0 || dist > AA.range) return;
    t.burstLeft = AA.burst;
    t.burstTimer = 0;
    t.fireTimer = AA.interval;
    t.fireWarn = 1;
  }

  _samSite(t, dt, dist, ctx) {
    t.fireTimer -= dt;
    if (t.fireTimer > 0 || dist > SAM.range || dist < SAM.minRange) return;
    const m = this.sams.find((x) => !x.active);
    if (!m) return;
    t.fireTimer = SAM.interval;
    m.active = true;
    m.life = SAM.life;
    m.smoke = 0;
    m.pos.copy(t.pos); m.pos.y += 4;
    m.dir.subVectors(ctx.player.flight.pos, m.pos).normalize();
    m.dir.y = Math.max(m.dir.y, 0.5); m.dir.normalize(); // 위로 솟구치며 발사
    ctx.fx.flash(m.pos, FX.missileIgnite.size * 1.4, FX.missileIgnite.life);
  }

  _stepSams(dt, ctx) {
    const player = ctx.player;
    const maxTurn = SAM.turnRate * DEG * dt;
    let n = 0;
    for (const m of this.sams) {
      if (!m.active) continue;
      m.life -= dt;
      if (player.alive) { // 유도: 표적 방향으로 선회율 한도 안에서만 돈다
        _v.subVectors(player.flight.pos, m.pos);
        const dist = _v.length();
        if (dist < SAM.proximity + player.cfg.hitRadius * 0.5) {
          m.active = false;
          ctx.fx.missileBlast(m.pos, _v.set(0, 0, 0));
          damagePlayer(ctx, SAM.damage, 'missile');
          continue;
        }
        _v.multiplyScalar(1 / dist);
        const ang = Math.acos(clamp(m.dir.dot(_v), -1, 1));
        if (ang > 1e-4) m.dir.lerp(_v, Math.min(1, maxTurn / ang)).normalize();
      }
      m.pos.addScaledVector(m.dir, SAM.speed * dt);
      if (m.life <= 0 || m.pos.y < getGroundHeight(m.pos.x + ctx.origin.x, m.pos.z + ctx.origin.z)) { m.active = false; ctx.fx.missileBlast(m.pos, _v.set(0, 0, 0)); continue; }
      m.smoke -= dt;
      if (m.smoke <= 0) { m.smoke = SAM.smokeEvery; ctx.fx.smoke(m.pos, FX.missileSmoke, PALETTE.fx.smokeA); }
      _q.setFromUnitVectors(FWD, m.dir);
      this.samMesh.setMatrixAt(n++, _m.compose(m.pos, _q, _s.set(1.6, 1.6, 1.6)));
    }
    this.samMesh.count = n;
    if (n) this.samMesh.instanceMatrix.needsUpdate = true;
  }

  /** 렌더 프레임: 경고등(깜박임) */
  render(camera) {
    let n = 0;
    const blink = Math.sin(this.time * 5) > -0.2 ? 1 : 0.35;
    for (let i = 0; i < this.count; i++) {
      const t = this.targets[i];
      if (!t.alive) continue;
      _p.copy(t.base); _p.y += t.def.height + 1.5;
      const d = camera.position.distanceTo(_p);
      const size = clamp(d * 0.0022, 0.5, 9) * blink * Math.min(1.6, 0.55 + this.lights * 0.4);
      this.beacons.setMatrixAt(n++, _m.compose(_p, _q.identity(), _s.set(size, size, size)));
    }
    this.beacons.count = n;
    if (n) this.beacons.instanceMatrix.needsUpdate = true;
  }

  shift(dx, dz) {
    for (let i = 0; i < this.count; i++) {
      const t = this.targets[i];
      t.base.x += dx; t.base.z += dz; t.pos.x += dx; t.pos.z += dz; t.group.position.copy(t.pos);
      if (t.path) for (const p of t.path) { p.x += dx; p.z += dz; }
      this._write(t);
    }
    for (const type in this.meshes) this.meshes[type].instanceMatrix.needsUpdate = true;
    for (const m of this.sams) { m.pos.x += dx; m.pos.z += dz; }
    for (const s of this.smokes) { s.pos.x += dx; s.pos.z += dz; }
  }

  clear() {
    for (const t of this.targets) { t.alive = false; t.used = false; }
    for (const s of this.sams) s.active = false;
    this.smokes.length = 0;
    this.count = 0; this.aliveCount = 0;
    for (const type in this.meshes) { this.meshes[type].count = 0; this.meshes[type].visible = false; }
    this.beacons.count = 0; this.samMesh.count = 0;
  }
}

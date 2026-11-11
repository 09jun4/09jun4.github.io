// 효과: 파티클(폭발·연기·불꽃·파편), 예광탄/적 탄(볼트), 섬광, 총구 섬광.
// 전부 시작할 때 한 번 만든 풀을 재사용한다. 프레임 중 할당 없음, 드로우콜은 종류당 1개.
import * as THREE from 'three';
import { PALETTE } from '../data/palette.js';
import { lerp } from '../core/math.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _identityQ = new THREE.Quaternion();

let _seed = 12345;
/** 연출 전용 난수(게임 판정에는 쓰지 않는다) */
function rnd() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 4294967296;
}
const rr = (range) => range[0] + (range[1] - range[0]) * rnd();

const FXC = PALETTE.fx;
const COLORS_FIRE = [FXC.fireA, FXC.fireB, FXC.flash];
const COLORS_SMOKE = [FXC.smokeA, FXC.smokeB];
const COLORS_DEBRIS = [FXC.debris, FXC.fireB, FXC.debris];
const COLORS_SPARK = [FXC.spark, FXC.flash];
const COLORS_BLAST = [FXC.fireA, FXC.fireB];
const COLORS_BLAST_SMOKE = [FXC.smokeA];

class Particles {
  constructor(capacity) {
    this.capacity = capacity;
    this.limit = capacity;
    this.count = 0;
    this.px = new Float32Array(capacity * 3);
    this.vx = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    // 조명을 받는 플랫 셰이딩: 단색 덩어리도 면이 구분돼 입체로 보인다
    const mat = new THREE.MeshLambertMaterial({ flatShading: true, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setHex(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'particles';
  }

  spawn(x, y, z, vx, vy, vz, life, size0, size1, colorHex, gravity, drag) {
    if (this.count >= this.limit) return;
    const i = this.count++;
    const k = i * 3;
    this.px[k] = x; this.px[k + 1] = y; this.px[k + 2] = z;
    this.vx[k] = vx; this.vx[k + 1] = vy; this.vx[k + 2] = vz;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.size0[i] = size0;
    this.size1[i] = size1;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
    this.mesh.setColorAt(i, _c.setHex(colorHex));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const mesh = this.mesh;
    let i = 0;
    while (i < this.count) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this._swapRemove(i);
        continue;
      }
      const k = i * 3;
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[k] *= damp; this.vx[k + 1] = this.vx[k + 1] * damp - this.gravity[i] * dt; this.vx[k + 2] *= damp;
      this.px[k] += this.vx[k] * dt; this.px[k + 1] += this.vx[k + 1] * dt; this.px[k + 2] += this.vx[k + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      // 빠르게 부풀었다가 끝에서 사라진다
      const grow = 1 - (1 - t) * (1 - t);
      const size = lerp(this.size0[i], this.size1[i], grow) * (1 - t * t * t);
      _p.set(this.px[k], this.px[k + 1], this.px[k + 2]);
      _s.set(size, size, size);
      mesh.setMatrixAt(i, _m.compose(_p, _identityQ, _s));
      i++;
    }
    mesh.count = this.count;
    if (this.count > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  _swapRemove(i) {
    const last = --this.count;
    if (i === last) return;
    const a = i * 3, b = last * 3;
    this.px[a] = this.px[b]; this.px[a + 1] = this.px[b + 1]; this.px[a + 2] = this.px[b + 2];
    this.vx[a] = this.vx[b]; this.vx[a + 1] = this.vx[b + 1]; this.vx[a + 2] = this.vx[b + 2];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size0[i] = this.size0[last];
    this.size1[i] = this.size1[last];
    this.gravity[i] = this.gravity[last];
    this.drag[i] = this.drag[last];
    this.mesh.getColorAt(last, _c);
    this.mesh.setColorAt(i, _c);
    this.mesh.instanceColor.needsUpdate = true;
  }

  shift(dx, dz) {
    for (let i = 0; i < this.count; i++) { this.px[i * 3] += dx; this.px[i * 3 + 2] += dz; }
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }
}

/** 가늘고 긴 빛줄기(예광탄·적 탄). 매 프레임 begin → add… → end 로 채운다. */
class BoltBatch {
  constructor(capacity) {
    this.capacity = capacity;
    this.n = 0;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setHex(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'bolts';
  }

  begin() { this.n = 0; }

  /** @param {THREE.Vector3} head 앞끝 위치 @param {THREE.Vector3} dir 진행 방향(단위) */
  add(head, dir, length, width, colorHex) {
    if (this.n >= this.capacity) return;
    _q.setFromUnitVectors(_zAxis, dir);
    _p.copy(head).addScaledVector(dir, -length * 0.5);
    _s.set(width, width, length);
    this.mesh.setMatrixAt(this.n, _m.compose(_p, _q, _s));
    this.mesh.setColorAt(this.n, _c.setHex(colorHex));
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    if (this.n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

export class Effects {
  /** @param {THREE.Scene} scene @param {object} cfg data/fx.js 의 FX */
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.particles = new Particles(cfg.particles.capacity);
    this.bolts = new BoltBatch(cfg.bolts.capacity);
    scene.add(this.particles.mesh, this.bolts.mesh);

    // 예광탄(연출 전용): 총구에서 조준점까지 날아가는 빛줄기
    const n = 40;
    this.tracers = { n, pos: [], dir: [], dist: new Float32Array(n), max: new Float32Array(n), active: new Uint8Array(n), next: 0 };
    for (let i = 0; i < n; i++) { this.tracers.pos.push(new THREE.Vector3()); this.tracers.dir.push(new THREE.Vector3()); }

    // 섬광: 가산 혼합 구
    this.flashes = [];
    const flashGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < cfg.flashes; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: PALETTE.fx.flash, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(flashGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.flashes.push({ mesh, mat, life: 0, max: 0, size: 0 });
    }

    // 총구 섬광(플레이어 모델에 붙인다)
    const mg = new THREE.OctahedronGeometry(1, 0);
    this.muzzle = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: PALETTE.fx.muzzle, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.muzzle.visible = false;
    this.muzzle.renderOrder = 7;
    this.muzzleLife = 0;
    this.particleFraction = 1;
    this._blastFire = { ...cfg.explosion.fire, count: cfg.missileHit.fire };
    this._blastSmoke = { ...cfg.explosion.smoke, count: cfg.missileHit.smoke };
  }

  /** 품질에 따라 파티클 수를 줄인다(0~1). */
  setParticleFraction(f) {
    this.particleFraction = f;
    this.particles.limit = Math.max(40, Math.floor(this.particles.capacity * f));
  }

  _count(n) {
    return Math.max(1, Math.round(n * this.particleFraction));
  }

  _burst(pos, vel, inherit, spec, colors, sizeScale, gravity = 0) {
    const n = this._count(spec.count);
    for (let i = 0; i < n; i++) {
      // 구 위의 고른 무작위 방향
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = rr(spec.speed) * sizeScale;
      const s = rr(spec.size) * sizeScale;
      this.particles.spawn(
        pos.x, pos.y, pos.z,
        vel.x * inherit + Math.cos(a) * r * sp, vel.y * inherit + u * sp, vel.z * inherit + Math.sin(a) * r * sp,
        rr(spec.life), s * 0.35, s, colors[i % colors.length], spec.gravity || gravity, this.cfg.drag,
      );
    }
  }

  /** 격추 폭발: 구형 파편 + 섬광 + 연기 */
  explosion(pos, vel, scale = 1) {
    const e = this.cfg.explosion;
    this._burst(pos, vel, e.inherit, e.fire, COLORS_FIRE, scale);
    this._burst(pos, vel, e.inherit, e.smoke, COLORS_SMOKE, scale);
    this._burst(pos, vel, e.inherit, e.debris, COLORS_DEBRIS, scale);
    this.flash(pos, e.flash.size * scale, e.flash.life);
  }

  missileBlast(pos, vel) {
    this._burst(pos, vel, 0.3, this._blastFire, COLORS_BLAST, 0.7);
    this._burst(pos, vel, 0.3, this._blastSmoke, COLORS_BLAST_SMOKE, 0.7);
    this.flash(pos, this.cfg.missileHit.flash, 0.16);
  }

  spark(pos, vel) {
    this._burst(pos, vel, 1, this.cfg.spark, COLORS_SPARK, 1);
  }

  /** 연기 한 덩이(미사일 꼬리, 손상된 적기) */
  smoke(pos, spec, colorHex) {
    const s = rr(spec.size);
    this.particles.spawn(pos.x, pos.y, pos.z, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3 + 1.5, (rnd() - 0.5) * 3, rr(spec.life), s * 0.5, s, colorHex, 0, 0.6);
  }

  flash(pos, size, life) {
    let best = this.flashes[0];
    for (const f of this.flashes) { if (f.life >= f.max) { best = f; break; } if (f.max - f.life < best.max - best.life) best = f; }
    best.mesh.position.copy(pos);
    best.life = 0;
    best.max = life;
    best.size = size;
    best.mesh.visible = true;
  }

  /** 예광탄 한 발(연출): from에서 to까지 */
  tracer(from, to) {
    const t = this.tracers;
    const i = t.next;
    t.next = (t.next + 1) % t.n;
    t.pos[i].copy(from);
    t.dir[i].subVectors(to, from);
    t.max[i] = t.dir[i].length();
    t.dir[i].multiplyScalar(1 / Math.max(t.max[i], 1e-3));
    t.dist[i] = 0;
    t.active[i] = 1;
  }

  muzzleFlash() {
    this.muzzleLife = this.cfg.muzzleFlash.life;
    this.muzzle.visible = true;
    const s = this.cfg.muzzleFlash.size * (0.8 + rnd() * 0.5);
    this.muzzle.scale.set(s * 0.5, s * 0.5, s * 1.6);
    this.muzzle.rotation.z = rnd() * Math.PI;
  }

  /**
   * 렌더 프레임마다. 볼트 배치는 여기서 begin 하고, 호출자가 적 탄을 더한 뒤 endBolts()를 부른다.
   * @param {object} tracerCfg 기관포 예광탄 설정
   */
  update(dt, tracerCfg) {
    this.particles.update(dt);
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.life += dt;
      const t = f.life / f.max;
      if (t >= 1) { f.mesh.visible = false; continue; }
      f.mesh.scale.setScalar(f.size * (0.35 + 0.65 * t));
      f.mat.opacity = (1 - t) * (1 - t);
    }
    if (this.muzzle.visible) {
      this.muzzleLife -= dt;
      if (this.muzzleLife <= 0) this.muzzle.visible = false;
    }
    this.bolts.begin();
    const tr = this.tracers;
    for (let i = 0; i < tr.n; i++) {
      if (!tr.active[i]) continue;
      tr.dist[i] += tracerCfg.speed * dt;
      const len = Math.min(tracerCfg.length, tr.dist[i]);
      if (tr.dist[i] - len >= tr.max[i]) { tr.active[i] = 0; continue; }
      _p.copy(tr.pos[i]).addScaledVector(tr.dir[i], Math.min(tr.dist[i], tr.max[i]));
      _dir.copy(tr.dir[i]);
      this.bolts.add(_p, _dir, len, tracerCfg.width, PALETTE.fx.tracer);
    }
  }

  endBolts() {
    this.bolts.end();
  }

  shift(dx, dz) {
    this.particles.shift(dx, dz);
    for (const p of this.tracers.pos) { p.x += dx; p.z += dz; }
    for (const f of this.flashes) { f.mesh.position.x += dx; f.mesh.position.z += dz; }
  }

  clear() {
    this.particles.clear();
    this.tracers.active.fill(0);
    for (const f of this.flashes) { f.mesh.visible = false; f.life = f.max = 0; }
    this.muzzle.visible = false;
    this.bolts.begin();
    this.bolts.end();
  }

  get activeParticles() {
    return this.particles.count;
  }
}

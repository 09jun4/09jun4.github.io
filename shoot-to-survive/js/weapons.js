import * as THREE from 'three';
import { createRevolver, createCasingGeometry } from './revolver.js';
import { createFlashlight } from './flashlight.js';

const SWITCH_T = 0.7, FIRE_T = 0.6, FIRE_SHOT_AT = 0.2;
const MELEE_ANIM = 0.4, MELEE_CD = 0.8, MELEE_HIT_AT = 0.14;
const RELOAD = { eject: 0.5, insert: 0.4, count: 5, close: 0.5 }; // 0.5 + 5*0.4 + 0.5 = 3.0초
const STEP = Math.PI * 2 / 5;
const SWING_OPEN = 1.2;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

const BASE = {
  pistol: { p: [0.085, -0.1, -0.36], r: [0.04, 0.16, 0] },
  flash: { p: [0.15, -0.12, -0.32], r: [0.04, 0.1, 0] },
};

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.35, 'rgba(255,210,60,0.9)'); g.addColorStop(1, 'rgba(255,150,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Weapons {
  // cb: { fire(), meleeHit() }
  constructor(viewScene, cb) {
    this.cb = cb; this.viewScene = viewScene;
    this.rev = createRevolver();
    this.fl = createFlashlight();
    this.pistolHolder = new THREE.Group(); this.pistolHolder.add(this.rev.root);
    this.flashHolder = new THREE.Group(); this.flashHolder.add(this.fl.root);
    viewScene.add(this.pistolHolder, this.flashHolder);
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.sprite.scale.set(0.2, 0.2, 1); this.sprite.visible = false;
    this.rev.muzzle.add(this.sprite);
    this.casingGeo = createCasingGeometry();
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xd3a93f, metalness: 1, roughness: 0.28 });
    this.casings = [];
    this.time = 0;
    this.reset();
  }

  reset() {
    this.current = 'pistol'; this.switching = null;
    this.ammo = 5; this.displayAmmo = 5;
    this.fire = null; this.reload = null; this.melee = null; this.meleeCd = 0;
    this.kick = 0; this.flashT = 0;
    this.cylBase = 0; this.cylExtra = 0; this.swingVis = 0; this.swingGoal = 0;
    this.rev.bullet.visible = false;
    for (const c of this.casings) this.viewScene.remove(c.mesh);
    this.casings = [];
    this.applyPose(0);
  }

  get lightOn() { return this.current === 'flash'; }
  get reloading() { return !!this.reload; }
  get busy() { return !!(this.switching || this.fire || this.melee); }

  // ── 입력 ─────────────────────────────────────────────
  equip(to) {
    if (this.switching || this.fire || this.melee || to === this.current) return false;
    if (this.reload) this.cancelReload();
    this.switching = { to, t: 0, swapped: false };
    return true;
  }
  cycle() { return this.equip(this.current === 'pistol' ? 'flash' : 'pistol'); }

  cancelReload() {
    this.reload = null; this.displayAmmo = this.ammo; // 탄약은 재장전 전 상태 유지
    this.rev.bullet.visible = false; this.rev.latch.position.z = this.rev.latchRest; this.cylExtra = 0; this.swingGoal = 0; // 실린더는 닫힌 상태로 복귀
  }

  tryFire() {
    if (this.current !== 'pistol' || this.switching || this.reload || this.fire || this.melee) return false;
    this.fire = { t: 0, live: this.ammo > 0, shot: false };
    return true;
  }

  tryReload() {
    if (this.current !== 'pistol' || this.switching || this.reload || this.fire || this.melee || this.ammo >= 5) return false;
    this.reload = { t: 0, ejected: false, inserted: 0, lastK: 0, finalRot: false };
    return true;
  }

  tryMelee() {
    if (this.switching || this.reload || this.fire || this.melee || this.meleeCd > 0) return false;
    this.melee = { t: 0, hit: false }; this.meleeCd = MELEE_CD;
    return true;
  }

  // ── 갱신 ─────────────────────────────────────────────
  update(dt) {
    this.time += dt;
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    if (this.switching) {
      const s = this.switching; s.t += dt;
      if (!s.swapped && s.t >= SWITCH_T / 2) { s.swapped = true; this.current = s.to; }
      if (s.t >= SWITCH_T) this.switching = null;
    }
    if (this.fire) this.updateFire(dt);
    if (this.reload) this.updateReload(dt);
    if (this.melee) {
      this.melee.t += dt;
      if (!this.melee.hit && this.melee.t >= MELEE_HIT_AT) { this.melee.hit = true; this.cb.meleeHit(); }
      if (this.melee.t >= MELEE_ANIM) this.melee = null;
    }
    this.swingVis += (this.swingGoal * SWING_OPEN - this.swingVis) * Math.min(1, dt * 14);
    this.kick *= Math.exp(-dt * 9);
    this.flashT = Math.max(0, this.flashT - dt);
    this.sprite.visible = this.flashT > 0;
    this.updateCasings(dt);
    this.applyPose(dt);
  }

  updateFire(dt) {
    const f = this.fire; f.t += dt; const t = f.t, r = this.rev;
    const cock = Math.min(1, t / 0.15);
    let hammer = 0, trig = 0;
    if (t < 0.15) { hammer = 0.9 * smooth(cock); trig = -0.45 * cock; this.cylExtra = STEP * smooth(cock); }
    else if (t < 0.19) { hammer = 0.9 * (1 - (t - 0.15) / 0.04); trig = -0.45; this.cylExtra = STEP; }
    else { trig = -0.45 * (1 - Math.min(1, (t - 0.19) / 0.2)); this.cylExtra = STEP; }
    r.hammer.rotation.x = hammer; r.trigger.rotation.x = trig;
    if (!f.shot && t >= FIRE_SHOT_AT) {
      f.shot = true;
      if (f.live) {
        this.ammo--; this.displayAmmo = this.ammo; this.kick = 1; this.flashT = 0.05;
        this.sprite.material.rotation = Math.random() * 6;
        this.cb.fire();
      } // 빈 총이면 빈 클릭 연출만
    }
    if (t >= FIRE_T) { this.cylBase += STEP; this.cylExtra = 0; r.hammer.rotation.x = 0; r.trigger.rotation.x = 0; this.fire = null; }
  }

  updateReload(dt) {
    const r = this.reload; r.t += dt; const t = r.t, rv = this.rev;
    const insertStart = RELOAD.eject, insertEnd = RELOAD.eject + RELOAD.insert * RELOAD.count;
    this.swingGoal = t < insertEnd ? 1 : 0;
    rv.latch.position.z = rv.latchRest - 0.01 * Math.min(1, this.swingVis / SWING_OPEN);
    if (t >= 0.3 && !r.ejected) { // 탄피 5개 한 번에 배출
      r.ejected = true; this.displayAmmo = 0; this.spawnCasings();
    }
    if (t >= insertStart && t < insertEnd) {
      const k = Math.floor((t - insertStart) / RELOAD.insert);
      const lt = (t - insertStart) - k * RELOAD.insert; // 0 ~ 0.4
      if (k > r.lastK) { this.cylBase += STEP; r.lastK = k; }
      const b = rv.bullet; b.visible = true;
      const p = smooth(lt / 0.3);
      const L = rv.loadPoint; b.position.set(L.x - 0.03 * (1 - p), L.y - 0.07 * (1 - p), L.z + 0.012 + 0.12 * (1 - p) - 0.03 * p);
      if (lt >= 0.3 && r.inserted === k) { r.inserted++; this.displayAmmo = r.inserted; }
      this.cylExtra = lt >= 0.3 ? STEP * smooth((lt - 0.3) / 0.1) : 0;
    } else if (t >= insertEnd) {
      if (!r.finalRot) { r.finalRot = true; this.cylBase += STEP; this.cylExtra = 0; rv.bullet.visible = false; }
    }
    if (t >= insertEnd + RELOAD.close) {
      this.ammo = 5; this.displayAmmo = 5; this.reload = null; rv.latch.position.z = rv.latchRest;
    }
  }

  spawnCasings() {
    this.viewScene.updateMatrixWorld(true);
    const o = new THREE.Vector3(); this.rev.cylPivot.getWorldPosition(o);
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
      mesh.position.copy(o).add(new THREE.Vector3((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, 0.04));
      this.viewScene.add(mesh);
      this.casings.push({
        mesh, age: 0,
        v: new THREE.Vector3(-0.15 - Math.random() * 0.25, 0.1 + Math.random() * 0.2, 0.1 + Math.random() * 0.15),
        w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
  }

  updateCasings(dt) {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i]; c.age += dt;
      c.v.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      c.mesh.rotation.x += c.w.x * dt; c.mesh.rotation.y += c.w.y * dt; c.mesh.rotation.z += c.w.z * dt;
      if (c.age > 2) { this.viewScene.remove(c.mesh); this.casings.splice(i, 1); } // 약 2초 후 제거
    }
  }

  applyPose(dt) {
    const sw = this.switching;
    let down = 0;
    if (sw) down = sw.t < SWITCH_T / 2 ? smooth(sw.t / (SWITCH_T / 2)) : 1 - smooth((sw.t - SWITCH_T / 2) / (SWITCH_T / 2));
    const breathe = Math.sin(this.time * 1.7) * 0.002;
    const m = this.melee ? Math.sin(Math.min(1, this.melee.t / MELEE_ANIM) * Math.PI) : 0;
    for (const [name, holder] of [['pistol', this.pistolHolder], ['flash', this.flashHolder]]) {
      holder.visible = this.current === name;
      if (!holder.visible) continue;
      const b = BASE[name];
      let [px, py, pz] = b.p, [rx, ry, rz] = b.r;
      py += breathe - 0.4 * down; rx -= 0.8 * down;
      if (name === 'pistol') {
        rx += this.kick * 0.4; pz += this.kick * 0.05; py += this.kick * 0.015;
        rz += 0.35 * (this.swingVis / SWING_OPEN); ry -= 0.2 * (this.swingVis / SWING_OPEN);
        rx -= 1.0 * m; pz -= 0.1 * m; py -= 0.03 * m;
      } else {
        px -= 0.22 * m; pz -= 0.08 * m; ry += 1.3 * m; rz -= 0.5 * m;
      }
      holder.position.set(px, py, pz); holder.rotation.set(rx, ry, rz);
    }
    const r = this.rev;
    r.swing.rotation.z = this.swingVis;
    r.cylPivot.rotation.z = -(this.cylBase + this.cylExtra);
  }
}

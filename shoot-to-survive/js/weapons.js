import * as THREE from 'three';
import { createRevolver } from './revolver.js';
import { createRevolverLow } from './revolver_low.js';
import { createFlashlight } from './flashlight.js';

const SWITCH_T = 0.7, FIRE_T = 0.6, FIRE_SHOT_AT = 0.2;
const MELEE_ANIM = 0.48, MELEE_CD = 0.8, MELEE_HIT_AT = 0.17, MELEE_WIND = 0.13, MELEE_STRIKE = 0.08; // 뒤로 빼기 → 내려치기 → 여운 → 복귀
const RELOAD = { eject: 0.9, insert: 0.36, count: 5, close: 0.5 }; // 0.9 + 5*0.36 + 0.5 = 3.2초 (부드러운 동작을 위해 배출 구간을 길게)
const STEP = Math.PI * 2 / 5;
const SWING_OPEN = 1.2;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// 오른손잡이 재장전: 총을 화면 오른쪽으로 가져와 (1) 총구를 위로 들어 탄피가 중력으로 빠지게, (2) 총구를 왼쪽·비스듬히 아래로 향해 왼쪽 면(열린 실린더)이 보이게
const EJECT = { rx: 1.0, ry: 0.3, rz: 0.0, px: 0.09, py: 0.04, pz: -0.02 };
const LOAD = { rx: -0.55, ry: 0.75, rz: -0.1, px: 0.09, py: 0.04, pz: -0.04 };
const BASE = {
  pistol: { p: [0.0, -0.166, -0.22], r: [-0.035, 0.0, 0] },
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

// ── 효과음 타이밍 ──
// 재장전 파일: 열림(0.30~1.15초 구간) / 탄 삽입 클릭 ×5 (원본 1.515초 부근 한 번을 복제) / 닫힘(2.05~2.45초). 끝의 실린더 돌리는 라칫(2.9초~)은 잘라냄.
const SND_LEAD = { reload_open: 0.5, reload_insert: 0.025, reload_close: 0.245 }; // 파일 시작부터 '핵심 소리'까지 시간
export function timingPlan(kind) {
  const R = RELOAD, ins = R.insert * 0.75, loadEnd = R.eject + R.insert * R.count, EJECT_AT = 0.6, CLOSED_AT = loadEnd + 0.3;
  if (kind === 'fire') return { dur: FIRE_T, sounds: [{ t: 0, name: 'cock' }, { t: FIRE_SHOT_AT, name: 'shot' }], marks: [{ t: 0.15, label: '코킹 완료' }, { t: 0.19, label: '해머 릴리즈' }, { t: FIRE_SHOT_AT, label: '발사' }] };
  if (kind === 'dry') return { dur: FIRE_T, sounds: [{ t: 0, name: 'cock' }, { t: FIRE_SHOT_AT, name: 'dry' }], marks: [{ t: 0.15, label: '코킹 완료' }, { t: 0.19, label: '해머 릴리즈' }, { t: FIRE_SHOT_AT, label: '빈 격발' }] };
  const sounds = [{ t: Math.max(0, EJECT_AT - SND_LEAD.reload_open), name: 'reload_open', group: 'reload' }];
  const marks = [{ t: 0.25, label: '실린더 열림' }, { t: EJECT_AT, label: '탄피 배출' }];
  for (let k = 0; k < R.count; k++) {
    const t = R.eject + R.insert * k + ins; // 탄이 챔버에 들어가는 순간
    sounds.push({ t: t - SND_LEAD.reload_insert, name: 'reload_insert', group: 'reload', varied: true });
    marks.push({ t, label: '장전 ' + (k + 1) });
  }
  sounds.push({ t: CLOSED_AT - SND_LEAD.reload_close, name: 'reload_close', group: 'reload' });
  marks.push({ t: loadEnd, label: '닫기 시작' }, { t: CLOSED_AT, label: '닫힘' });
  return { dur: loadEnd + R.close, sounds, marks };
}

function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of ms) { for (const k of ['map', 'roughnessMap', 'bumpMap']) if (m[k]) m[k].dispose(); m.dispose(); }
  });
}

export class Weapons {
  // cb: { fire(), meleeHit() }
  constructor(viewScene, cb, quality = 'high') {
    this.cb = cb; this.viewScene = viewScene; this.quality = quality;
    this.fl = createFlashlight();
    this.pistolHolder = new THREE.Group();
    this.flashHolder = new THREE.Group(); this.flashHolder.add(this.fl.root);
    viewScene.add(this.pistolHolder, this.flashHolder);
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.sprite.scale.set(0.2, 0.2, 1); this.sprite.visible = false;
    this.casings = [];
    this.time = 0;
    this.rev = null; this.slots = ['live', 'live', 'live', 'live', 'live'];
    this.buildRevolver(quality);
    this.reset();
  }

  // 그래픽 품질에 맞는 총 모델로 교체 (낮음: 전부 로우폴리)
  buildRevolver(q) {
    if (this.rev) { this.pistolHolder.remove(this.rev.root); disposeTree(this.rev.root); }
    this.quality = q;
    this.rev = q === 'low' ? createRevolverLow() : createRevolver();
    this.pistolHolder.add(this.rev.root);
    this.rev.root.position.set(0, 0.1, -0.08); // 회전축을 그립(손) 위치로: 총구를 내려도 그립은 화면 아래에 머문다
    this.rev.muzzle.add(this.sprite);
    this.rev.bullet.visible = false;
    this.applySlots();
  }
  setQuality(q) { if (q !== this.quality) this.buildRevolver(q); }

  reset() {
    this.current = 'pistol'; this.switching = null;
    this.ammo = 5; this.displayAmmo = 5;
    this.slots = ['live', 'live', 'live', 'live', 'live']; this.applySlots();
    this.fire = null; this.reload = null; this.melee = null; this.meleeCd = 0; this.punch = 0;
    this.kick = 0; this.flashT = 0; this.flashFx = 0;
    this.cylBase = 0; this.cylExtra = 0; this.swingVis = 0; this.swingGoal = 0; this.rw1 = 0; this.rw2 = 0;
    this.rev.bullet.visible = false;
    for (const c of this.casings) this.viewScene.remove(c.mesh);
    this.casings = [];
    this.applyPose(0);
  }

  applySlots() { this.slots.forEach((st, i) => this.rev.setRound(i, st)); }
  get topIdx() { return ((Math.round(this.cylBase / STEP) % 5) + 5) % 5; } // 지금 맨 위(총열 쪽) 챔버

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
    this.cb.stopSound?.('reload'); // 재장전 취소 시 남은 재장전 소리 끊기
    if (this.reload && this.reload.snap) { this.slots = this.reload.snap; this.applySlots(); } // 챔버 속 총알도 재장전 전 상태로
    this.reload = null; this.displayAmmo = this.ammo; // 탄약은 재장전 전 상태 유지
    this.rev.bullet.visible = false; this.rev.latch.position.z = this.rev.latchRest; this.cylExtra = 0; this.swingGoal = 0; // 실린더는 닫힌 상태로 복귀
  }

  tryFire() {
    if (this.current !== 'pistol' || this.switching || this.reload || this.fire || this.melee) return false;
    this.fire = { t: 0, live: this.ammo > 0, shot: false };
    this.cb.sound?.('cock'); // 코킹 (빈 총이어도 클릭하면 코킹은 한다)
    return true;
  }

  tryReload() {
    if (this.current !== 'pistol' || this.switching || this.reload || this.fire || this.melee || this.ammo >= 5) return false;
    this.reload = { t: 0, plan: timingPlan('reload').sounds, sidx: 0, snap: this.slots.slice(), ejected: false, inserted: 0, lastK: 0, finalRot: false };
    return true;
  }

  tryMelee() {
    if (this.current !== 'pistol' || this.switching || this.reload || this.fire || this.melee || this.meleeCd > 0) return false; // 근접공격은 권총만
    this.melee = { t: 0, hit: false, lunged: false }; this.meleeCd = MELEE_CD;
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
      if (!this.melee.lunged && this.melee.t >= MELEE_WIND - 0.01) { this.melee.lunged = true; this.punch = 1; this.cb.lunge?.(); } // 내려치는 순간 앞으로 돌진 + 화면 펀치
      if (!this.melee.hit && this.melee.t >= MELEE_HIT_AT) { this.melee.hit = true; this.cb.meleeHit(); }
      if (this.melee.t >= MELEE_ANIM) this.melee = null;
    }
    this.swingVis += (this.swingGoal * SWING_OPEN - this.swingVis) * Math.min(1, dt * 14);
    { // 재장전 자세: rw1 = 뒤로 젖히는 순간(탄피 사출), rw2 = 총구를 비스듬히 아래로 향한 장전 자세
      const t = this.reload ? this.reload.t : -1;
      const loadEnd = RELOAD.eject + RELOAD.insert * RELOAD.count;
      const T1 = t >= 0.02 && t < RELOAD.eject - 0.1 ? 1 : 0, T2 = t >= RELOAD.eject - 0.1 && t < loadEnd ? 1 : 0;
      this.rw1 += (T1 - this.rw1) * Math.min(1, dt * 5);
      this.rw2 += (T2 - this.rw2) * Math.min(1, dt * 5);
    }
    this.kick *= Math.exp(-dt * 9); this.punch *= Math.exp(-dt * 7);
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
        this.ammo--; this.displayAmmo = this.ammo; this.kick = 1; this.flashT = 0.05; this.flashFx = 1; // flashFx: 총구 화염이 배경 전체를 밝히는 정도 (main에서 감쇠)
        const ci = (this.topIdx + 1) % 5; // 코킹으로 새로 올라온 챔버가 발사됨 → 빈 탄피로
        this.slots[ci] = 'spent'; this.rev.setRound(ci, 'spent');
        this.sprite.material.rotation = Math.random() * 6;
        this.cb.sound?.('shot'); // 총성 = 발사 순간
        this.cb.fire();
      } else this.cb.sound?.('dry'); // 빈 총이면 '틱' 한 번
    }
    if (t >= FIRE_T) { this.cylBase += STEP; this.cylExtra = 0; r.hammer.rotation.x = 0; r.trigger.rotation.x = 0; this.fire = null; }
  }

  updateReload(dt) {
    const r = this.reload; r.t += dt; const t = r.t, rv = this.rev;
    while (r.sidx < r.plan.length && r.plan[r.sidx].t <= t) { // 재장전 효과음
      const sp = r.plan[r.sidx++];
      this.cb.sound?.(sp.name, sp.varied ? { group: sp.group, rate: 0.96 + Math.random() * 0.09, gain: 0.85 + Math.random() * 0.25 } : { group: sp.group });
    }
    const insertStart = RELOAD.eject, insertEnd = RELOAD.eject + RELOAD.insert * RELOAD.count;
    this.swingGoal = t >= 0.25 && t < insertEnd ? 1 : 0;
    rv.latch.position.z = rv.latchRest - 0.01 * Math.min(1, this.swingVis / SWING_OPEN);
    if (t >= 0.6 && !r.ejected) { // 총구를 든 뒤 탄피 5개가 중력으로 빠짐
      r.ejected = true; this.displayAmmo = 0; this.spawnCasings();
    }
    if (t >= insertStart && t < insertEnd) {
      const k = Math.floor((t - insertStart) / RELOAD.insert);
      const lt = (t - insertStart) - k * RELOAD.insert; // 0 ~ 0.4
      if (k > r.lastK) { this.cylBase += STEP; r.lastK = k; }
      const b = rv.bullet; b.visible = true;
      const ins = RELOAD.insert * 0.75, p = smooth(lt / ins);
      const L = rv.loadPoint; b.position.set(L.x - 0.06 * (1 - p), L.y + 0.03 * (1 - p), L.z + 0.012 + 0.13 * (1 - p) - 0.03 * p);
      if (lt >= ins && r.inserted === k) { r.inserted++; this.displayAmmo = r.inserted; const ti = this.topIdx; this.slots[ti] = 'live'; this.rev.setRound(ti, 'live'); }
      this.cylExtra = lt >= ins ? STEP * smooth((lt - ins) / (RELOAD.insert - ins)) : 0;
    } else if (t >= insertEnd) {
      if (!r.finalRot) { r.finalRot = true; this.cylBase += STEP; this.cylExtra = 0; rv.bullet.visible = false; }
    }
    if (t >= insertEnd + RELOAD.close) {
      this.ammo = 5; this.displayAmmo = 5; this.reload = null; rv.latch.position.z = rv.latchRest;
      this.slots = ['live', 'live', 'live', 'live', 'live']; this.applySlots();
    }
  }

  spawnCasings() { // 챔버 속 총알(실탄·빈 탄피 모두)이 그 자리에서 중력으로 떨어진다
    this.viewScene.updateMatrixWorld(true);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    this.slots.forEach((st, i) => {
      if (!st) return;
      const holder = this.rev.rounds[i];
      holder.getWorldPosition(wp); holder.getWorldQuaternion(wq);
      const mesh = new THREE.Group(); for (const c of this.rev.makeRound(st).children) mesh.add(c);
      mesh.position.copy(wp); mesh.quaternion.copy(wq);
      this.viewScene.add(mesh);
      this.casings.push({
        mesh, age: 0,
        v: new THREE.Vector3((Math.random() - 0.5) * 0.04, -0.02 - Math.random() * 0.03, 0.03 + Math.random() * 0.04),
        w: new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5),
      });
      this.slots[i] = null; this.rev.setRound(i, null); // 실린더에서 사라짐
    });
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
    let A = 0, S = 0; // A: 뒤로 빼는 정도, S: 내려치는 정도
    if (this.melee) {
      const t = this.melee.t, wind = smooth(t / MELEE_WIND), strike = smooth((t - MELEE_WIND) / MELEE_STRIKE), rec = smooth((t - MELEE_WIND - MELEE_STRIKE - 0.05) / (MELEE_ANIM - MELEE_WIND - MELEE_STRIKE - 0.05));
      A = wind * (1 - strike); S = strike * (1 - rec);
    }
    for (const [name, holder] of [['pistol', this.pistolHolder], ['flash', this.flashHolder]]) {
      holder.visible = this.current === name;
      if (!holder.visible) continue;
      const b = BASE[name];
      let [px, py, pz] = b.p, [rx, ry, rz] = b.r;
      py += breathe - 0.4 * down; rx -= 0.8 * down;
      if (name === 'pistol') {
        rx += this.kick * 0.4; pz += this.kick * 0.05; py += this.kick * 0.015;
        const a = this.rw1, b2 = this.rw2; // 오른손잡이: 총을 오른쪽으로 틀어 열린 실린더가 보이게
        rx += EJECT.rx * a + LOAD.rx * b2; ry += EJECT.ry * a + LOAD.ry * b2; rz += EJECT.rz * a + LOAD.rz * b2;
        px += EJECT.px * a + LOAD.px * b2; py += EJECT.py * a + LOAD.py * b2; pz += EJECT.pz * a + LOAD.pz * b2;
        rx += 0.5 * A - 1.3 * S; pz += 0.04 * A - 0.24 * S; py += 0.03 * A - 0.06 * S; px += 0.05 * A - 0.1 * S; ry += -0.35 * A + 0.6 * S; rz += 0.35 * A - 0.3 * S;
      } else {
        px += 0.12 * A - 0.4 * S; pz += 0.05 * A - 0.14 * S; ry += -0.7 * A + 1.6 * S; rz += -0.6 * A + 0.45 * S; rx += 0.2 * A - 0.35 * S;
      }
      holder.position.set(px, py, pz); holder.rotation.set(rx, ry, rz);
    }
    const r = this.rev;
    r.swing.rotation.z = this.swingVis;
    r.cylPivot.rotation.z = -(this.cylBase + this.cylExtra);
  }
}

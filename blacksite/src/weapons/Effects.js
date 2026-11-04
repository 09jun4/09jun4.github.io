// 사격 시각 효과: 탄 궤적(트레이서), 탄착 흔적·불꽃, 총구 섬광 조명. 모두 풀(pool)로 재사용.
import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,220,150,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function decalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.35, 'rgba(10,10,10,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); return t;
}

export class WorldEffects {
  constructor(scene) {
    this.scene = scene;
    this.glowTex = glowTexture();
    this.decalTex = decalTexture();
    // 트레이서
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
    this.tracerGeo.translate(0, 0, -0.5);
    this.tracers = [];
    // 탄착 흔적
    this.decalMat = new THREE.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decalGeo = new THREE.PlaneGeometry(0.07, 0.07);
    this.decals = [];
    this.decalIdx = 0;
    // 불꽃
    this.sparkMat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffd28a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = [];
    // 총구 섬광 조명 (항상 장면에 두고 세기만 바꿔 셰이더 재컴파일을 피한다)
    this.flashLight = new THREE.PointLight(0xffb866, 0, 12, 1.6);
    scene.add(this.flashLight);
    this.flashT = 0;
    this._v = new THREE.Vector3();
  }

  tracer(from, to, speed = 120, length = 1.6, color) {
    let t = this.tracers.find((x) => !x.mesh.visible);
    if (!t) {
      const mesh = new THREE.Mesh(this.tracerGeo, color ? this.tracerMat.clone() : this.tracerMat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      t = { mesh };
      this.tracers.push(t);
    }
    if (color) t.mesh.material.color.set(color);
    const dir = new THREE.Vector3().subVectors(to, from);
    t.total = dir.length();
    t.dir = dir.normalize();
    t.from = from.clone();
    t.d = 0; t.speed = speed; t.len = length;
    t.mesh.visible = true;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, 0.01);
  }

  impact(point, normal, { decal = true, spark = true } = {}) {
    if (decal && normal) {
      let d = this.decals[this.decalIdx];
      if (!d) { d = new THREE.Mesh(this.decalGeo, this.decalMat); this.scene.add(d); this.decals[this.decalIdx] = d; }
      this.decalIdx = (this.decalIdx + 1) % 48;
      d.position.copy(point).addScaledVector(normal, 0.004);
      d.lookAt(this._v.copy(d.position).add(normal));
      d.rotation.z = Math.random() * 6.28;
      d.visible = true;
    }
    if (spark) {
      let s = this.sparks.find((x) => !x.sprite.visible);
      if (!s) { s = { sprite: new THREE.Sprite(this.sparkMat.clone()) }; this.scene.add(s.sprite); this.sparks.push(s); }
      s.sprite.position.copy(point);
      if (normal) s.sprite.position.addScaledVector(normal, 0.03);
      s.t = 0; s.life = 0.09;
      s.sprite.visible = true;
    }
  }

  // 총구 화염 조명: 주변을 순간적으로 밝히고 빠르게 사그라든다
  muzzleFlash(pos, intensity = 60, distance = 12, duration = 0.07) {
    this.flashLight.position.copy(pos);
    this.flashLight.distance = distance;
    this.flashBase = intensity * (0.85 + Math.random() * 0.3);
    this.flashLight.intensity = this.flashBase;
    this.flashDur = duration;
    this.flashT = duration;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.d += t.speed * dt;
      const head = Math.min(t.d, t.total);
      const tail = Math.max(0, t.d - t.len);
      if (tail >= t.total) { t.mesh.visible = false; continue; }
      t.mesh.position.copy(t.from).addScaledVector(t.dir, tail);
      t.mesh.scale.z = Math.max(0.01, head - tail);
    }
    for (const s of this.sparks) {
      if (!s.sprite.visible) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { s.sprite.visible = false; continue; }
      const sc = 0.12 + k * 0.15;
      s.sprite.scale.set(sc, sc, 1);
      s.sprite.material.opacity = 1 - k;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashDur);
      this.flashLight.intensity = this.flashT <= 0 ? 0 : this.flashBase * k * k;
    }
  }

  dispose() {
    this.scene.remove(this.flashLight);
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const d of this.decals) if (d) this.scene.remove(d);
    for (const s of this.sparks) { this.scene.remove(s.sprite); s.sprite.material.dispose(); }
    this.tracerGeo.dispose(); this.decalGeo.dispose();
    this.tracerMat.dispose(); this.decalMat.dispose(); this.sparkMat.dispose();
    this.glowTex.dispose(); this.decalTex.dispose();
  }
}

// 뷰모델 공간 효과: 총구 섬광 스프라이트, 탄피
export class ViewEffects {
  constructor(scene) {
    this.scene = scene;
    this.glowTex = glowTexture();
    const star = document.createElement('canvas'); star.width = star.height = 64;
    const ctx = star.getContext('2d');
    ctx.translate(32, 32);
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      const g = ctx.createLinearGradient(0, 0, 30, 0);
      g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(30, 0); ctx.lineTo(0, 4); ctx.fill();
    }
    this.starTex = new THREE.CanvasTexture(star); this.starTex.colorSpace = THREE.SRGBColorSpace;
    this.flashMat = new THREE.MeshBasicMaterial({ map: this.starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), this.flashMat);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    p2.rotation.y = Math.PI / 2; p2.position.z = -0.05;
    this.flash.add(p1, p2);
    this.flash.visible = false;
    this.flashT = 0;
    this.casingGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 8);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xc09640, metalness: 0.95, roughness: 0.28 });
    this.casings = [];
  }

  attachFlash(muzzle) { muzzle.add(this.flash); }

  muzzleFlash() {
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    this.flash.scale.set(s, s, s);
    this.flashT = 0.045;
  }

  ejectCasing(worldPos, right, up, back) {
    let c = this.casings.find((x) => !x.mesh.visible);
    if (!c) { c = { mesh: new THREE.Mesh(this.casingGeo, this.casingMat), vel: new THREE.Vector3(), spin: new THREE.Vector3() }; this.scene.add(c.mesh); this.casings.push(c); }
    c.mesh.position.copy(worldPos);
    c.vel.copy(right).multiplyScalar(1.2 + Math.random() * 0.5).addScaledVector(up, 0.9 + Math.random() * 0.4).addScaledVector(back, 0.2);
    c.spin.set(Math.random() * 30, Math.random() * 30, Math.random() * 30);
    c.t = 0;
    c.mesh.visible = true;
  }

  update(dt) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    for (const c of this.casings) {
      if (!c.mesh.visible) continue;
      c.t += dt;
      if (c.t > 0.7) { c.mesh.visible = false; continue; }
      c.vel.y -= 6 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
    }
  }

  dispose() {
    this.flash.parent?.remove(this.flash);
    for (const c of this.casings) this.scene.remove(c.mesh);
    this.casingGeo.dispose(); this.casingMat.dispose(); this.flashMat.dispose(); this.starTex.dispose(); this.glowTex.dispose();
  }
}

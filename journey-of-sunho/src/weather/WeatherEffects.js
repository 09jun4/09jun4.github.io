// WeatherEffects — 날씨 그래픽: 빗줄기·눈송이·바람 줄기/날리는 낙엽·안개·하늘 흐림·젖은 노면·쌓인 눈.
// WeatherManager의 값만 읽어서 그려요(게임 로직에는 관여하지 않음).
import * as THREE from '../lib/three.js';
import { clamp, lerp } from '../core/utils.js';

const BOX = { x: 44, y: 26, z: 44 };

function snowAlphaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 150 + Math.random() * 105 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 5, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class WeatherEffects {
  constructor(sceneManager, world) {
    this.sm = sceneManager;
    this.world = world;
    const scene = sceneManager.scene;
    // 비: 짧은 선분
    this.rainN = 3500;
    const rp = new Float32Array(this.rainN * 6);
    this.rainSeed = new Float32Array(this.rainN * 3);
    for (let i = 0; i < this.rainN; i++) {
      this.rainSeed[i * 3] = Math.random() * BOX.x; this.rainSeed[i * 3 + 1] = Math.random() * BOX.y; this.rainSeed[i * 3 + 2] = Math.random() * BOX.z;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8d0ea, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    // 눈
    this.snowN = 3000;
    const sp = new Float32Array(this.snowN * 3);
    this.snowSeed = new Float32Array(this.snowN * 4);
    for (let i = 0; i < this.snowN; i++) {
      this.snowSeed[i * 4] = Math.random() * BOX.x; this.snowSeed[i * 4 + 1] = Math.random() * BOX.y; this.snowSeed[i * 4 + 2] = Math.random() * BOX.z; this.snowSeed[i * 4 + 3] = Math.random() * 10;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, map: dotTexture(), transparent: true, depthWrite: false, opacity: 0.95 }));
    this.snow.frustumCulled = false;
    // 바람 줄기
    this.windN = 160;
    const wp = new Float32Array(this.windN * 6);
    this.windSeed = new Float32Array(this.windN * 3);
    for (let i = 0; i < this.windN; i++) { this.windSeed[i * 3] = Math.random() * BOX.x; this.windSeed[i * 3 + 1] = Math.random() * 6; this.windSeed[i * 3 + 2] = Math.random() * BOX.z; }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    this.wind = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }));
    this.wind.frustumCulled = false;
    // 날리는 낙엽
    this.leafN = 120;
    const lp = new Float32Array(this.leafN * 3);
    const lc = new Float32Array(this.leafN * 3);
    this.leafSeed = new Float32Array(this.leafN * 4);
    for (let i = 0; i < this.leafN; i++) {
      this.leafSeed[i * 4] = Math.random() * BOX.x; this.leafSeed[i * 4 + 1] = Math.random() * 4; this.leafSeed[i * 4 + 2] = Math.random() * BOX.z; this.leafSeed[i * 4 + 3] = Math.random() * 10;
      const c = new THREE.Color().setHSL(0.07 + Math.random() * 0.07, 0.8, 0.45);
      lc.set([c.r, c.g, c.b], i * 3);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    this.leaves = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
    this.leaves.frustumCulled = false;
    scene.add(this.rain, this.snow, this.wind, this.leaves);
    this.t = 0;
    // 노면 재질
    const m = world.roads.materials;
    this.roadMats = [m.asphalt, m.isect, m.sidewalk, m.curb, m.lineYellow, m.lineWhite, m.crosswalk];
    this.grassMat = world.env.grassMat;
    this.snowColor = new THREE.Color(0xeef3f8);
    // 쌓인 눈: 도로·인도·지면 위에 같은 모양의 흰 층을 겹쳐서 투명도로 적설량 표현
    this.snowMat = new THREE.MeshStandardMaterial({
      color: 0xf4f7fb, roughness: 0.95, transparent: true, opacity: 0, depthWrite: false,
      alphaMap: snowAlphaTexture(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.snowLayers = [];
    const covered = new Set([m.asphalt, m.isect, m.sidewalk, world.env.grassMat]);
    const targets = [];
    world.group.traverse((o) => { if (o.isMesh && covered.has(o.material)) targets.push(o); });
    for (const o of targets) {
      const layer = new THREE.Mesh(o.geometry, this.snowMat);
      layer.position.copy(o.position); layer.rotation.copy(o.rotation); layer.scale.copy(o.scale);
      layer.receiveShadow = true;
      layer.visible = false;
      o.parent.add(layer);
      this.snowLayers.push(layer);
    }
    this._c = new THREE.Color();
  }

  _wrap(v, c, size) { return ((v - c) % size + size * 1.5) % size - size / 2 + c; }

  update(dt, weather, camera, night = 0) {
    this.t += dt;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const wx = weather.windX, wz = weather.windZ;
    // 비
    const rainAmt = weather.rain;
    const rn = Math.floor(this.rainN * rainAmt);
    this.rain.visible = rn > 0;
    if (rn > 0) {
      const p = this.rain.geometry.attributes.position.array, s = this.rainSeed;
      const fall = 17, len = 0.55;
      for (let i = 0; i < rn; i++) {
        const k = i * 3;
        s[k + 1] -= fall * dt; s[k] += wx * 0.5 * dt; s[k + 2] += wz * 0.5 * dt;
        if (s[k + 1] < 0) s[k + 1] += BOX.y;
        const x = this._wrap(s[k], cx, BOX.x), y = cy - 6 + s[k + 1], z = this._wrap(s[k + 2], cz, BOX.z);
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x - wx * 0.03; p[i * 6 + 4] = y + len; p[i * 6 + 5] = z - wz * 0.03;
      }
      this.rain.geometry.setDrawRange(0, rn * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.35 + 0.25 * rainAmt;
    }
    // 눈
    const sn = Math.floor(this.snowN * weather.snow);
    this.snow.visible = sn > 0;
    if (sn > 0) {
      const p = this.snow.geometry.attributes.position.array, s = this.snowSeed;
      for (let i = 0; i < sn; i++) {
        const k = i * 4;
        s[k + 1] -= 1.3 * dt;
        s[k] += (wx * 0.8 + Math.sin(this.t * 1.3 + s[k + 3]) * 0.4) * dt;
        s[k + 2] += (wz * 0.8 + Math.cos(this.t * 1.1 + s[k + 3]) * 0.4) * dt;
        if (s[k + 1] < 0) s[k + 1] += BOX.y;
        p[i * 3] = this._wrap(s[k], cx, BOX.x); p[i * 3 + 1] = cy - 6 + s[k + 1]; p[i * 3 + 2] = this._wrap(s[k + 2], cz, BOX.z);
      }
      this.snow.geometry.setDrawRange(0, sn);
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    // 바람 줄기 + 낙엽
    const ws = weather.windSpeed;
    const windVis = clamp((ws - 4) / 6, 0, 1);
    this.wind.visible = this.leaves.visible = windVis > 0.01;
    if (windVis > 0.01) {
      const p = this.wind.geometry.attributes.position.array, s = this.windSeed;
      const len = 1.2 + ws * 0.18, nx = wx / (ws || 1), nz = wz / (ws || 1);
      for (let i = 0; i < this.windN; i++) {
        const k = i * 3;
        s[k] += wx * 2.2 * dt; s[k + 2] += wz * 2.2 * dt;
        const x = this._wrap(s[k], cx, BOX.x), z = this._wrap(s[k + 2], cz, BOX.z), y = cy - 2 + s[k + 1];
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x + nx * len; p[i * 6 + 4] = y; p[i * 6 + 5] = z + nz * len;
      }
      this.wind.geometry.attributes.position.needsUpdate = true;
      this.wind.material.opacity = 0.22 * windVis;
      const lp = this.leaves.geometry.attributes.position.array, ls = this.leafSeed;
      for (let i = 0; i < this.leafN; i++) {
        const k = i * 4;
        ls[k] += wx * 0.9 * dt; ls[k + 2] += wz * 0.9 * dt;
        const bob = Math.abs(Math.sin(this.t * 2 + ls[k + 3])) * 1.5;
        lp[i * 3] = this._wrap(ls[k], cx, BOX.x); lp[i * 3 + 1] = cy - 2.2 + ls[k + 1] * 0.4 + bob; lp[i * 3 + 2] = this._wrap(ls[k + 2], cz, BOX.z);
      }
      this.leaves.geometry.attributes.position.needsUpdate = true;
      this.leaves.material.opacity = windVis;
    }
    // 하늘·안개
    const [near, far] = weather.visibility();
    this.sm.applyAtmosphere({ overcast: weather.overcast, fogNear: near, fogFar: far, fogTint: weather.fog > 0.3 ? (night > 0.5 ? 0x2a3040 : 0xc9cfd4) : null });
    // 노면: 젖으면 어둡고 반짝, 눈이 쌓이면 하얗게
    const wet = weather.wetness, snow = weather.snowCover;
    for (const mat of this.roadMats) {
      const b = mat.userData.base;
      if (!b) continue;
      mat.color.copy(b.color).multiplyScalar(lerp(1, 0.68, wet));
      mat.roughness = lerp(b.roughness, 0.2, wet);
      mat.metalness = lerp(b.metalness, 0.15, wet);
    }
    const gb = this.grassMat.userData.base;
    this.grassMat.color.copy(gb.color).multiplyScalar(lerp(1, 0.8, wet));
    const show = snow > 0.01;
    this.snowMat.opacity = clamp(snow * 1.05, 0, 0.92);
    for (const l of this.snowLayers) l.visible = show;
  }
}

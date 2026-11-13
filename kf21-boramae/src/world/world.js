// 월드: 하늘·구름·지형·조명을 묶고, 원점 재배치(floating origin)의 누적 오프셋을 관리한다.
import * as THREE from 'three';
import { createSky } from './sky.js';
import { createClouds } from './clouds.js';
import { createSoftClouds } from './clouds-soft.js';
import { createTerrain } from './backdrop-terrain.js';
import { createLighting } from './lighting.js';
import { createAirbase } from './airbase.js';
import { AIRBASE } from '../data/takeoff.js';
import { createSea } from './sea.js';
import { setGroundMode } from './ground.js';
import { TIME_OF_DAY } from '../data/timeOfDay.js';

const _tint = new THREE.Color();

export class World {
  /** @param {THREE.Scene} scene @param {object} cfg data/world.js 의 WORLD */
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.scene = scene;
    this.softClouds = null;
    this.sunDirection = new THREE.Vector3().fromArray(cfg.sky.sunDirection).normalize();
    // 실제 좌표 = 렌더 좌표 + origin. 배정밀도로 누적하므로 얼마든지 멀리 갈 수 있다.
    this.origin = { x: 0, z: 0 };
    this._altK = -1;
    this.altitudeK = 0;
    this.sky = createSky(cfg.sky, this.sunDirection);
    this.clouds = createClouds(cfg.clouds, cfg.sky, this.sunDirection);
    this.terrain = createTerrain(cfg.terrain, cfg.sky, this.sunDirection);
    this.lights = createLighting(scene, cfg.lighting, this.sunDirection);
    scene.fog = new THREE.Fog(cfg.fog.color, cfg.fog.near, cfg.fog.far);
    scene.background = new THREE.Color(cfg.sky.mid);
    // 공군기지: 미션 시작점(실제 좌표 0,0)이 활주로 출발 위치가 되게 놓는다. 활주 방향은 -z
    this.base = { x: 0, z: -(AIRBASE.runway.length / 2 - AIRBASE.runway.startOffset), height: AIRBASE.height };
    this.airbase = createAirbase(AIRBASE);
    this.terrain.setBase(AIRBASE.height, AIRBASE.flattenRadius, AIRBASE.blendRadius);
    this.sea = createSea(cfg.sky, this.sunDirection);
    this.timeOfDay = 'day';
    this.look = { exposure: 1, lights: 1, hud: 1, stars: 0, sunIntensity: cfg.lighting.sunIntensity, hemiIntensity: cfg.lighting.hemiIntensity, sunGlow: cfg.sky.sunGlow, zenith: new THREE.Color(cfg.sky.zenith), mid: new THREE.Color(cfg.sky.mid) };
    this._clock = 0;
    scene.add(this.sky, this.terrain.mesh, this.clouds.group, this.airbase.group, this.sea.mesh);
  }

  /** 플레이어가 멀어졌으면 되돌릴 이동량을 돌려준다(없으면 null). */
  rebaseShift(pos, out) {
    const d = this.cfg.originRebaseDistance;
    if (pos.x * pos.x + pos.z * pos.z < d * d) return null;
    out.x = -Math.round(pos.x);
    out.z = -Math.round(pos.z);
    this.origin.x -= out.x;
    this.origin.z -= out.z;
    return out;
  }

  resetOrigin() {
    this.origin.x = 0;
    this.origin.z = 0;
  }

  /**
   * 시간대와 지형을 바꾼다(미션을 시작할 때 한 번). 색·안개·조명·구름·별만 바꾸므로 낮음 프리셋도 같은 길을 탄다.
   * @returns {boolean} 시간대가 실제로 바뀌었는가(환경맵을 다시 구울지 판단)
   */
  setEnvironment(name, terrain = 'inland') {
    setGroundMode(terrain);
    this._terrain = terrain;
    this.sea.mesh.visible = terrain === 'coast';
    const t = TIME_OF_DAY[name] || TIME_OF_DAY.day;
    const changed = name !== this.timeOfDay;
    this.timeOfDay = TIME_OF_DAY[name] ? name : 'day';
    const c = this.cfg, sky = { ...c.sky, ...(t.sky || {}) };
    const u = this.sky.material.uniforms;
    u.uZenith.value.set(sky.zenith); u.uMid.value.set(sky.mid); u.uHorizon.value.set(sky.horizon); u.uBelow.value.set(sky.below);
    u.uSunColor.value.set(sky.sunColor); u.uSunSize.value = sky.sunSize; u.uSunGlow.value = sky.sunGlow; u.uStars.value = t.stars || 0;
    this.sunDirection.fromArray(t.sun ? t.sun.direction : c.sky.sunDirection).normalize();
    u.uSunDir.value.copy(this.sunDirection);
    const L = this.lights;
    L.sun.color.set(t.sun ? t.sun.color : c.lighting.sunColor);
    L.hemi.color.set(t.hemi ? t.hemi.sky : c.lighting.skyColor);
    L.hemi.groundColor.set(t.hemi ? t.hemi.ground : c.lighting.groundColor);
    const k = this.look;
    k.sunIntensity = t.sun ? t.sun.intensity : c.lighting.sunIntensity;
    k.hemiIntensity = t.hemi ? t.hemi.intensity : c.lighting.hemiIntensity;
    k.sunGlow = sky.sunGlow; k.zenith.set(sky.zenith); k.mid.set(sky.mid);
    k.exposure = t.exposure || 1; k.lights = t.lights || 1; k.hud = t.hud || 1; k.stars = t.stars || 0;
    const fog = t.fog ?? c.fog.color;
    this.scene.fog.color.set(fog);
    this.scene.background.set(sky.mid);
    const clouds = { lit: c.clouds.lit, shade: c.clouds.shade, under: c.clouds.under, rim: c.clouds.soft.rim, ...(t.clouds || {}) };
    this.clouds.setLook(clouds, this.sunDirection, sky.horizon);
    if (this.softClouds && this.softClouds.setLook) this.softClouds.setLook(t.clouds ? clouds : { ...clouds, ...c.clouds.soft }, this.sunDirection, sky.horizon);
    this._cloudLook = t.clouds ? clouds : null;
    const tint = _tint.set(t.terrainTint ?? 0xffffff);
    this.terrain.setLook(this.sunDirection, sky.horizon, tint);
    this.sea.setLook(this.sunDirection, sky.horizon, L.sun.color, tint);
    this._alt = null; this._altK = -1;
    return changed;
  }

  /** 조명 배율(이륙 시네마틱의 어둡게 시작하기). 1이 기본 */
  setDim(k) {
    if (k === this._dim) return;
    this._dim = k;
    this._altK = -1; // 다음 프레임에 조명 세기를 다시 계산한다
  }

  /** 고도 연출: 카메라 고도에 따라 하늘색·햇빛·반사광을 바꾼다 */
  setAltitude(alt) {
    const a = this.cfg.altitudeLook;
    if (!a) return;
    let k = Math.min(1, Math.max(0, (alt - a.from) / (a.to - a.from)));
    k = k * k * (3 - 2 * k);
    if (Math.abs(k - this._altK) < 0.004) return;
    this._altK = k;
    if (!this._alt) {
      const c = (hex) => new THREE.Color(hex);
      const day = this.timeOfDay === 'day'; // 낮이 아니면 그 시간대의 색을 조금 더 어둡게만 한다
      this._alt = { z0: this.look.zenith.clone(), z1: day ? c(a.zenith) : this.look.zenith.clone().multiplyScalar(0.6), m0: this.look.mid.clone(), m1: day ? c(a.mid) : this.look.mid.clone().multiplyScalar(0.75) };
    }
    const u = this.sky.material.uniforms;
    u.uZenith.value.lerpColors(this._alt.z0, this._alt.z1, k);
    u.uMid.value.lerpColors(this._alt.m0, this._alt.m1, k);
    u.uSunGlow.value = this.look.sunGlow * (1 + a.glowGain * k);
    const dim = this._dim ?? 1;
    this.lights.sun.intensity = this.look.sunIntensity * (1 + a.sunGain * k) * dim;
    this.lights.hemi.intensity = this.look.hemiIntensity * (1 - a.hemiDrop * k) * dim;
    this.altitudeK = k;
  }

  /** 렌더 프레임마다: 카메라 기준으로 유니폼 갱신 */
  update(camera) {
    this.setAltitude(camera.position.y);
    if (this.softClouds) this.softClouds.update(camera.position, this.origin); else this.clouds.update(camera.position, this.origin);
    this.terrain.update(camera.position, this.origin, this.base);
    const now = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, now - (this._clock || now)));
    this._clock = now;
    if (this.sea.mesh.visible) this.sea.update(camera.position, this.origin, dt);
    this.airbase.group.position.set(this.base.x - this.origin.x, this.base.height, this.base.z - this.origin.z);
  }

  /** 기체 그림자: size가 0이면 끈다. 그림자 카메라는 플레이어만 좁게 덮는다. */
  setShadows(renderer, size) {
    const sun = this.lights.sun;
    renderer.shadowMap.enabled = size > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = size > 0;
    if (size > 0) {
      const s = this.cfg.shadow;
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      const c = sun.shadow.camera;
      c.left = c.bottom = -s.extent; c.right = c.top = s.extent; c.near = 1; c.far = s.distance * 2;
      c.updateProjectionMatrix();
      sun.shadow.bias = s.bias;
      sun.shadow.normalBias = s.normalBias;
    }
  }

  /** 해(그림자 광원)를 플레이어 위에 둔다. */
  followLight(pos) {
    const sun = this.lights.sun;
    sun.position.copy(pos).addScaledVector(this.sunDirection, this.cfg.shadow.distance);
    sun.target.position.copy(pos);
    sun.target.updateMatrixWorld();
  }

  /** 구름 방식 전환: 'lowpoly'(낮음) | 'soft'(높음·최고, sprites = 덩이당 판 수) */
  setCloudStyle(style, sprites) {
    if (this.softClouds) { this.scene.remove(this.softClouds.group); this.softClouds.dispose(); this.softClouds = null; }
    if (style === 'soft') {
      this.softClouds = createSoftClouds(this.cfg.clouds, this.cfg.sky, this.sunDirection, sprites);
      this.scene.add(this.softClouds.group);
    }
    this.clouds.group.visible = style !== 'soft';
    this.setEnvironment(this.timeOfDay, this._terrain); // 새로 만든 구름에도 지금 시간대 색을 입힌다
  }

  /** 지형 격자 분할 수(프리셋에 따라) */
  setTerrainDetail(segments) {
    this.terrain.setSegments(segments);
  }

  setCloudFraction(f) {
    if (this.softClouds) this.softClouds.setFraction(f);
    this.clouds.setFraction(f);
  }

  get triangles() {
    return (this.softClouds ? this.softClouds.triangles : this.clouds.triangles) + this.terrain.triangles + 1280;
  }
}

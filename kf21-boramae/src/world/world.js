// 월드: 하늘·구름·지형·조명을 묶고, 원점 재배치(floating origin)의 누적 오프셋을 관리한다.
import * as THREE from 'three';
import { createSky } from './sky.js';
import { createClouds } from './clouds.js';
import { createSoftClouds } from './clouds-soft.js';
import { createTerrain } from './backdrop-terrain.js';
import { createLighting } from './lighting.js';
import { createAirbase } from './airbase.js';
import { AIRBASE } from '../data/takeoff.js';

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
    scene.add(this.sky, this.terrain.mesh, this.clouds.group, this.airbase.group);
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
      this._alt = { z0: c(this.cfg.sky.zenith), z1: c(a.zenith), m0: c(this.cfg.sky.mid), m1: c(a.mid) };
    }
    const u = this.sky.material.uniforms;
    u.uZenith.value.lerpColors(this._alt.z0, this._alt.z1, k);
    u.uMid.value.lerpColors(this._alt.m0, this._alt.m1, k);
    u.uSunGlow.value = this.cfg.sky.sunGlow * (1 + a.glowGain * k);
    this.lights.sun.intensity = this.cfg.lighting.sunIntensity * (1 + a.sunGain * k);
    this.lights.hemi.intensity = this.cfg.lighting.hemiIntensity * (1 - a.hemiDrop * k);
    this.altitudeK = k;
  }

  /** 렌더 프레임마다: 카메라 기준으로 유니폼 갱신 */
  update(camera) {
    this.setAltitude(camera.position.y);
    if (this.softClouds) this.softClouds.update(camera.position, this.origin); else this.clouds.update(camera.position, this.origin);
    this.terrain.update(camera.position, this.origin, this.base);
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

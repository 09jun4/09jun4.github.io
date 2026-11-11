// 월드: 하늘·구름·지형·조명을 묶고, 원점 재배치(floating origin)의 누적 오프셋을 관리한다.
import * as THREE from 'three';
import { createSky } from './sky.js';
import { createClouds } from './clouds.js';
import { createTerrain } from './backdrop-terrain.js';
import { createLighting } from './lighting.js';
import { createAirbase } from './airbase.js';
import { AIRBASE } from '../data/takeoff.js';

export class World {
  /** @param {THREE.Scene} scene @param {object} cfg data/world.js 의 WORLD */
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.sunDirection = new THREE.Vector3().fromArray(cfg.sky.sunDirection).normalize();
    // 실제 좌표 = 렌더 좌표 + origin. 배정밀도로 누적하므로 얼마든지 멀리 갈 수 있다.
    this.origin = { x: 0, z: 0 };
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

  /** 렌더 프레임마다: 카메라 기준으로 유니폼 갱신 */
  update(camera) {
    this.clouds.update(camera.position, this.origin);
    this.terrain.update(camera.position, this.origin, this.base);
    this.airbase.group.position.set(this.base.x - this.origin.x, this.base.height, this.base.z - this.origin.z);
  }

  setCloudFraction(f) {
    this.clouds.setFraction(f);
  }

  get triangles() {
    return this.clouds.triangles + this.terrain.triangles + 1280;
  }
}

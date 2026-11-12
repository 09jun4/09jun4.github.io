// 편대 스포너: 미션 데이터의 wave 정의에 따라 적 편대를 플레이어 전방 시야 밖에서 등장시킨다.
import * as THREE from 'three';
import { DEG, clamp, lerp } from '../core/math.js';

const _v = new THREE.Vector3();
const _leader = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class WaveSpawner {
  /** @param {object} cfg data/missions.js 의 SPAWN */
  constructor(cfg) {
    this.cfg = cfg;
    this.waves = [];
    this.index = 0; // 다음에 등장할 편대
    this.timer = -1; // 조건 충족 후 등장까지 남은 시간(-1 = 아직 조건 미충족)
    this.spawned = 0;
    this.rng = Math.random;
  }

  reset(mission, rng) {
    this.waves = mission.waves;
    this.index = 0;
    this.timer = -1;
    this.spawned = 0;
    this.rng = rng;
  }

  get allSpawned() {
    return this.index >= this.waves.length;
  }

  /** 조건 판정(순수): 다음 편대가 나올 때가 됐는가 */
  static triggered(trigger, aliveCount, time) {
    if (trigger.type === 'start') return true;
    if (trigger.type === 'remaining') return aliveCount <= trigger.value;
    if (trigger.type === 'time') return time >= trigger.value;
    return false;
  }

  /**
   * @param {object} o
   * @param {number} o.aliveCount 살아 있는 적기 수
   * @param {number} o.time 미션 경과 시간
   * @param {object} o.flight 플레이어 비행 상태
   * @param {object} o.limits 적기 고도 범위 {altMin, altMax}
   * @param {(x:number,y:number,z:number,yaw:number,slot:number)=>boolean} o.spawn
   * @returns {number} 이번 스텝에 등장한 적기 수
   */
  step(dt, o) {
    if (this.allSpawned) return 0;
    const wave = this.waves[this.index];
    if (this.timer < 0) {
      if (!WaveSpawner.triggered(wave.trigger, o.aliveCount, o.time)) return 0;
      this.timer = wave.trigger.type === 'start' ? 0 : this.cfg.waveDelay;
    }
    this.timer -= dt;
    if (this.timer > 0) return 0;
    const made = this._spawnWave(wave, o);
    this.index++;
    this.timer = -1;
    return made;
  }

  _spawnWave(wave, o) {
    const c = this.cfg;
    const f = o.flight;
    // 고정 경로(수송기·폭격기): from [x, 고도, z] → to [x, z]. 실제 좌표라 원점 재배치만큼 뺀다
    if (wave.from) {
      const ox = o.origin ? o.origin.x : 0, oz = o.origin ? o.origin.z : 0;
      const fx = wave.from[0] - ox, fz = wave.from[2] - oz, tx = wave.to[0] - ox, tz = wave.to[1] - oz;
      const yaw0 = Math.atan2(-(tx - fx), -(tz - fz));
      let n = 0;
      for (let i = 0; i < wave.count; i++) {
        const rank = Math.ceil(i / 2), wing = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
        _v.set(wing * rank * c.spacing * 2.2, 0, rank * c.spacing * 2.4).applyAxisAngle(UP, yaw0);
        if (o.spawn(fx + _v.x, wave.from[1] + rank * 20, fz + _v.z, yaw0, this.spawned, wave, i, tx + _v.x, tz + _v.z)) { n++; this.spawned++; }
      }
      return n;
    }
    const side = this.rng() < 0.5 ? -1 : 1;
    const bearing = side * lerp(c.bearing[0], c.bearing[1], this.rng()) * DEG;
    const dist = lerp(c.distance[0], c.distance[1], this.rng());
    const elev = lerp(c.elevation[0], c.elevation[1], this.rng()) * DEG;
    // 플레이어 기수 기준 방향(우측이 +bearing) → 요는 반시계가 +
    _leader.set(0, 0, -1).applyAxisAngle(UP, f.yaw - bearing).multiplyScalar(dist * Math.cos(elev)).add(f.pos);
    _leader.y = clamp(f.pos.y + dist * Math.sin(elev), o.limits.altMin + 250, o.limits.altMax - 600);
    // 플레이어 쪽을 향해 들어온다
    const yaw = Math.atan2(-(f.pos.x - _leader.x), -(f.pos.z - _leader.z));
    let made = 0;
    for (let i = 0; i < wave.count; i++) {
      // V자 편대: 뒤·옆으로 벌린다
      const rank = Math.ceil(i / 2);
      const wing = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      _v.set(wing * rank * c.spacing, rank * 14, rank * c.spacing * 0.8).applyAxisAngle(UP, yaw).add(_leader);
      if (o.spawn(_v.x, _v.y, _v.z, yaw, this.spawned, wave, i)) { made++; this.spawned++; }
    }
    return made;
  }
}

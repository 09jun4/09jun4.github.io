import { describe, it, expect } from 'vitest';
import { WaveSpawner } from '../src/ai/wave-spawner.js';
import { EnemyDirector, AI } from '../src/ai/enemy-ai.js';
import { Projectiles } from '../src/combat/projectiles.js';
import { MISSIONS, SPAWN } from '../src/data/missions.js';
import { ENEMIES } from '../src/data/enemies.js';
import { KF21 } from '../src/data/aircraft.js';
import { createFlightState, resetFlight, stepFlight } from '../src/flight/flight-model.js';
import { makeRng, DEG } from '../src/core/math.js';
import * as THREE from 'three';

const DT = 1 / 60;
const cfg = ENEMIES.raider;

// 모델 없이 운동만 흉내 내는 적기(테스트용): entities/enemy.js 와 같은 식을 쓴다
import { clamp, damp, wrapAngle } from '../src/core/math.js';
function makeEnemy(index) {
  return {
    cfg, index, alive: false, hp: cfg.hp, pos: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), velocity: new THREE.Vector3(),
    yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0, speed: cfg.flight.speed, want: new THREE.Vector3(0, 0, -1), wantSpeed: cfg.flight.speed,
    ai: { state: 'approach', time: 0, timer: 0, hasToken: false, tokenWait: 0, fireTimer: 0, burstLeft: 0, burstTimer: 0, evadeCooldown: 0, side: 1, lift: 0, dir: new THREE.Vector3(), orbitSign: 1 },
    spawn(x, y, z, yaw) { this.alive = true; this.pos.set(x, y, z); this.yaw = yaw; this.pitch = 0; this.orient(); },
    orient() { const cp = Math.cos(this.pitch); this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); },
    step(dt) {
      const f = cfg.flight; const w = this.want;
      const wantYaw = Math.atan2(-w.x, -w.z);
      const wantPitch = clamp(Math.asin(clamp(w.y, -1, 1)), -f.pitchLimit * DEG, f.pitchLimit * DEG);
      this.yawRate = damp(this.yawRate, clamp(wrapAngle(wantYaw - this.yaw) * f.steerGain, -f.yawMax * DEG, f.yawMax * DEG), f.rateTau, dt);
      this.pitchRate = damp(this.pitchRate, clamp((wantPitch - this.pitch) * f.steerGain, -f.pitchMax * DEG, f.pitchMax * DEG), f.rateTau, dt);
      this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
      this.pitch += this.pitchRate * dt;
      this.speed = damp(this.speed, clamp(this.wantSpeed, f.speedMin, f.speedMax), f.speedTau, dt);
      this.orient();
      this.velocity.copy(this.forward).multiplyScalar(this.speed);
      this.pos.addScaledVector(this.velocity, dt);
    },
  };
}

function makeSim(mission, input) {
  const rng = makeRng(42);
  const flight = resetFlight(createFlightState(), KF21);
  const player = { flight, cfg: KF21, alive: true, velocity: new THREE.Vector3(), hp: 1e9 };
  const enemies = Array.from({ length: 8 }, (_, i) => makeEnemy(i));
  const director = new EnemyDirector(enemies);
  director.reset(mission.maxAttackers, rng);
  const spawner = new WaveSpawner(SPAWN);
  spawner.reset(mission, rng);
  const projectiles = new Projectiles(72, cfg.weapon.tracer);
  const log = { hits: 0, shots: 0, minDist: Infinity, maxAttackers: 0, minPair: Infinity, spawnDist: [], states: new Set() };
  const spawnOrig = projectiles.spawn.bind(projectiles);
  projectiles.spawn = (...a) => { log.shots++; spawnOrig(...a); };
  const ctx = {
    player, enemies, projectiles, fx: { spark() {}, explosion() {} }, rig: { addShake() {} }, audio: { play() {} }, shake: { hit: 0, collision: 0 },
    onPlayerHit() { log.hits++; }, onPlayerKilled() {}, playerExplosionScale: 1,
  };
  const args = {
    aliveCount: 0, time: 0, flight, limits: cfg.flight,
    spawn: (x, y, z, yaw, slot) => {
      const e = enemies.find((q) => !q.alive); if (!e) return false;
      e.spawn(x, y, z, yaw); director.onSpawn(e, slot);
      log.spawnDist.push(e.pos.distanceTo(flight.pos));
      const to = e.pos.clone().sub(flight.pos).normalize();
      log.spawnAngle = Math.acos(to.dot(flight.forward)) / DEG;
      return true;
    },
  };
  let time = 0;
  function run(seconds, killAt) {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      stepFlight(flight, typeof input === 'function' ? input(time) : input, KF21, DT);
      player.velocity.copy(flight.forward).multiplyScalar(flight.speed);
      args.aliveCount = enemies.filter((e) => e.alive).length; args.time = time;
      spawner.step(DT, args);
      director.step(DT, ctx);
      for (const e of enemies) if (e.alive) e.step(DT);
      projectiles.step(DT, ctx);
      time += DT;
      log.maxAttackers = Math.max(log.maxAttackers, director.attackers);
      const alive = enemies.filter((e) => e.alive);
      for (const e of alive) { log.minDist = Math.min(log.minDist, e.pos.distanceTo(flight.pos)); log.states.add(e.ai.state); }
      for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++) log.minPair = Math.min(log.minPair, alive[a].pos.distanceTo(alive[b].pos));
      if (killAt && killAt(time, alive)) alive[0].alive = false;
    }
  }
  return { run, log, enemies, flight, player, spawner, director };
}

describe('편대 스포너', () => {
  it('조건 판정', () => {
    expect(WaveSpawner.triggered({ type: 'start' }, 5, 0)).toBe(true);
    expect(WaveSpawner.triggered({ type: 'remaining', value: 1 }, 2, 0)).toBe(false);
    expect(WaveSpawner.triggered({ type: 'remaining', value: 1 }, 1, 0)).toBe(true);
    expect(WaveSpawner.triggered({ type: 'time', value: 30 }, 9, 31)).toBe(true);
  });
  it('미션 1: 시작하자마자 3대, 거리 900~1400 근처, 전방이지만 시야 밖', () => {
    const sim = makeSim(MISSIONS[0], { pitch: 0, turn: 0 });
    sim.run(0.1);
    expect(sim.enemies.filter((e) => e.alive).length).toBe(3);
    expect(sim.spawner.allSpawned).toBe(true);
    expect(Math.min(...sim.log.spawnDist)).toBeGreaterThan(850);
    expect(Math.max(...sim.log.spawnDist)).toBeLessThan(1550);
    expect(sim.log.spawnAngle).toBeGreaterThan(48); // 화면 가로 시야 절반(약 45°) 밖
    expect(sim.log.spawnAngle).toBeLessThan(90); // 그래도 전방
  });
  it('미션 3: 편대가 차례로 나와 총 5대', () => {
    const sim = makeSim(MISSIONS[2], { pitch: 0, turn: 0 });
    let last = 0;
    sim.run(60, (t, alive) => { if (alive.length && t - last > 6) { last = t; return true; } return false; });
    expect(sim.spawner.spawned).toBe(5);
    expect(sim.spawner.allSpawned).toBe(true);
  });
});

describe('적 AI', () => {
  it('곧장 날기만 하는 플레이어: 접근해서 공격하고, 동시 공격 수 제한을 지키고, 서로 겹치지 않는다', () => {
    const sim = makeSim(MISSIONS[2], { pitch: 0, turn: 0 });
    let last = 0;
    sim.run(50, (t, alive) => { if (alive.length > 2 && t - last > 15) { last = t; return true; } return false; });
    expect(sim.log.shots).toBeGreaterThan(10);
    expect(sim.log.hits).toBeGreaterThan(0);
    expect(sim.log.maxAttackers).toBeLessThanOrEqual(MISSIONS[2].maxAttackers);
    expect(sim.log.minPair).toBeGreaterThan(25);
    expect(sim.log.states.has(AI.ATTACK)).toBe(true);
    expect(sim.log.states.has(AI.BREAK)).toBe(true);
    expect(sim.log.states.has(AI.ORBIT)).toBe(true);
  });
  it('명중률: 직진하는 플레이어에게 쏜 탄의 일부만 맞는다(산포)', () => {
    const sim = makeSim(MISSIONS[0], { pitch: 0, turn: 0 });
    sim.run(60);
    const rate = sim.log.hits / sim.log.shots;
    console.log('hit rate', rate.toFixed(3), 'shots', sim.log.shots, 'hits', sim.log.hits);
    expect(rate).toBeGreaterThan(0.12);
    expect(rate).toBeLessThan(0.6);
  });
  it('(c) 회피기동: 계속 선회하면 직진할 때보다 덜 맞지만, 완전히 피할 수는 없다', () => {
    const turn = makeSim(MISSIONS[2], { pitch: 0, turn: 1 });
    turn.run(90);
    const straight = makeSim(MISSIONS[2], { pitch: 0, turn: 0 });
    straight.run(90);
    const rt = turn.log.hits / Math.max(1, turn.log.shots), rs = straight.log.hits / Math.max(1, straight.log.shots);
    console.log('hit rate turning', rt.toFixed(3), 'straight', rs.toFixed(3));
    expect(turn.log.hits).toBeGreaterThan(0);
    expect(rt).toBeLessThan(rs * 0.7);
  });
  it('(c) 무한 상승으로도 떼어낼 수 없다: 적기가 따라붙는다', () => {
    const sim = makeSim(MISSIONS[0], { pitch: 1, turn: 0 });
    sim.run(60);
    const dists = sim.enemies.filter((e) => e.alive).map((e) => e.pos.distanceTo(sim.flight.pos));
    expect(Math.min(...dists)).toBeLessThan(1200);
    expect(sim.log.shots).toBeGreaterThan(0);
  });
  it('최고 속도로 달아나도 따라잡는다', () => {
    const sim = makeSim(MISSIONS[0], { pitch: -0.12, turn: 0 }); // 살짝 하강해 가속
    sim.run(70);
    const dists = sim.enemies.filter((e) => e.alive).map((e) => e.pos.distanceTo(sim.flight.pos));
    expect(Math.min(...dists)).toBeLessThan(900);
  });
  it('피격 시 회피 상태로 바뀌고, 떨지 않고 다시 돌아온다', () => {
    const sim = makeSim(MISSIONS[0], { pitch: 0, turn: 0 });
    sim.run(5);
    const e = sim.enemies.find((q) => q.alive);
    sim.director.onHit(e);
    expect(e.ai.state).toBe(AI.EVADE);
    sim.run(3);
    expect(e.ai.state).not.toBe(AI.EVADE);
    for (const q of sim.enemies) if (q.alive) for (const v of [q.pos.x, q.pos.y, q.pos.z, q.yaw, q.pitch]) expect(Number.isFinite(v)).toBe(true);
  });
});

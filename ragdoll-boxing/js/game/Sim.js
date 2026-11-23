import * as THREE from '../../vendor/three.module.min.js';
import { createWorld } from '../physics/World.js';
import { CollisionManager } from '../physics/CollisionManager.js';
import { Fighter } from '../fighter/Fighter.js';
import { Match } from './Match.js';

const IDLE = { fwd: 0, side: 0, guard: false, weave: 0 };

// 렌더링 없이 돌아가는 게임 본체(물리 + 선수 + 경기). 브라우저와 Node 시험에서 같이 쓴다.
export async function createSim(cfg) {
  const { world, ropes, eventQueue } = await createWorld(cfg.physics);
  const fighters = [0, 1].map((i) => new Fighter(world, cfg, i));
  const collisions = new CollisionManager(world, eventQueue, fighters);
  const match = new Match(cfg.match);
  const g = -cfg.physics.gravity.y;
  let time = 0;

  match.onRoundStart = () => {
    const d = cfg.match.startDistance / 2;
    fighters[0].reset(new THREE.Vector3(-d, 0, 0), 0);
    fighters[1].reset(new THREE.Vector3(d, 0, 0), Math.PI);
  };

  // 물리 한 스텝. intents[i] = { fwd, side, guard, weave, attack: {type, side} | null }
  function step(intents) {
    const dt = cfg.physics.timeStep;
    time += dt;
    match.update(dt, fighters);
    fighters.forEach((f, i) => {
      const it = match.fighting ? intents[i] : IDLE;
      if (match.fighting && it.attack) f.requestAttack(it.attack.type, it.attack.side);
      f.update(dt, it, fighters[1 - i], time);
      f.body.applyControl(dt, g);
    });
    collisions.beforeStep();
    world.step(eventQueue);
    collisions.afterStep(time);
  }

  return { world, ropes, fighters, collisions, match, step, get time() { return time; } };
}

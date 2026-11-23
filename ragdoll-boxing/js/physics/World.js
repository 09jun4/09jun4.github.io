import RAPIER from '../../vendor/rapier.es.js';

export { RAPIER };

// 충돌 그룹: 환경 1, 선수0 2, 선수1 4. 같은 선수의 부위끼리는 부딪히지 않는다.
export const GROUP = { ENV: 1, FIGHTER: [2, 4] };
export const groups = (member, filter) => (member << 16) | filter;

export async function createWorld(cfg) {
  await RAPIER.init();
  const world = new RAPIER.World(cfg.gravity);
  world.timestep = cfg.timeStep;
  world.integrationParameters.numSolverIterations = cfg.solverIterations;
  const envGroups = groups(GROUP.ENV, GROUP.FIGHTER[0] | GROUP.FIGHTER[1]);
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const add = (desc) => world.createCollider(desc.setCollisionGroups(envGroups), fixed);

  add(RAPIER.ColliderDesc.cuboid(6, 0.5, 6).setTranslation(0, -0.5, 0).setFriction(cfg.floorFriction));
  // 로프: 링 네 변 × 높이 3단. 얇은 상자로 근사.
  const { half, ropeHeights, ropeRadius } = cfg.ring;
  const ropes = [];
  for (const y of ropeHeights) {
    for (const [x, z, hx, hz] of [[half, 0, ropeRadius, half], [-half, 0, ropeRadius, half], [0, half, half, ropeRadius], [0, -half, half, ropeRadius]]) {
      add(RAPIER.ColliderDesc.cuboid(hx, ropeRadius, hz).setTranslation(x, y, z).setRestitution(cfg.ropeRestitution));
      ropes.push({ x, y, z, hx, hz });
    }
  }
  return { world, ropes, eventQueue: new RAPIER.EventQueue(true) };
}

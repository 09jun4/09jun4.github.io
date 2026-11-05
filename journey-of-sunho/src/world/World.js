// World — 도로(RoadSystem) + 주변 환경(Environment) + 충돌(CollisionSystem) + 지형을 묶어요.
import * as THREE from '../lib/three.js';
import { RoadSystem } from './RoadSystem.js';
import { Environment } from './Environment.js';
import { CollisionSystem } from './CollisionSystem.js';
import { Route } from './Route.js';

export class World {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.collision = new CollisionSystem();
    this.roads = new RoadSystem(map);
    this.group.add(this.roads.buildMeshes());
    this.env = new Environment(map, this.roads, this.collision);
    this.group.add(this.env.build());
    this.terrain = this.roads.buildTerrain(map.bounds, this.env.grassMat);
    this.group.add(this.terrain);
    // 맵 바깥 (멀리 보이는 바닥)
    const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x55703a, roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set((map.bounds.minX + map.bounds.maxX) / 2, -0.4, (map.bounds.minZ + map.bounds.maxZ) / 2);
    this.group.add(far);
    this.farGround = far;
    // 맵 경계 (보이지 않는 벽)
    const b = map.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, hx = (b.maxX - b.minX) / 2, hz = (b.maxZ - b.minZ) / 2;
    this.collision.addBox(cx, b.minZ - 2, hx + 4, 2, 0, { tag: 'wall' });
    this.collision.addBox(cx, b.maxZ + 2, hx + 4, 2, 0, { tag: 'wall' });
    this.collision.addBox(b.minX - 2, cz, 2, hz + 4, 0, { tag: 'wall' });
    this.collision.addBox(b.maxX + 2, cz, 2, hz + 4, 0, { tag: 'wall' });
    scene.add(this.group);
    this.routes = {};
  }

  route(id) {
    if (!this.routes[id]) {
      const def = this.map.routes[id];
      if (!def) throw new Error(`맵에 없는 코스: ${id}`);
      this.routes[id] = new Route(this.roads, def);
    }
    return this.routes[id];
  }

  update(dt, time) { this.env.update(dt, time); }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

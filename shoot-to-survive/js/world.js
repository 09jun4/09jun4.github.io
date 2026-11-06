import * as THREE from 'three';
import { N, TILE, WALL_H, isWall, centerOf, openTiles } from './maze.js';
import { stoneTexture } from './textures.js';

// 미로 메시: 벽(InstancedMesh) + 바닥 + 천장 + 희미한 전등
export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const wallTex = stoneTexture(108, 3);
    const floorTex = stoneTexture(80, 7); floorTex.repeat.set(N, N);
    const ceilTex = stoneTexture(70, 11); ceilTex.repeat.set(N, N);
    this.wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    this.floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    this.ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x6e5a36, fog: false });
    this.wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
    this.lampGeo = new THREE.CylinderGeometry(0.28, 0.4, 0.14, 6);
    // 실제 PointLight는 3개만 — 가장 가까운 전등으로 옮겨 다닌다
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffc27a, 7, 11, 2);
      scene.add(l);
      return l;
    });
    this.lamps = [];
  }

  setQuality(q) { this.low = q === 'low'; this.lights.forEach((l, i) => { l.intensity = this.low ? 10 : 7; }); }

  build(grid, rng) {
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    // 벽: 통로와 맞닿은 것만
    const spots = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!isWall(grid, x, z)) continue;
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        if (!isWall(grid, x + dx, z + dz)) near = true;
      if (near) spots.push([x, z]);
    }
    const walls = new THREE.InstancedMesh(this.wallGeo, this.wallMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(centerOf(x), WALL_H / 2, centerOf(z));
      walls.setMatrixAt(i, m);
    });
    walls.instanceMatrix.needsUpdate = true;
    walls.frustumCulled = false;
    this.group.add(walls);

    const size = N * TILE;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(size / 2, 0, size / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(size / 2, WALL_H, size / 2);
    this.group.add(floor, ceil);

    // 전등 6~8개 (서로 떨어지게)
    const tiles = openTiles(grid).sort(() => rng() - 0.5);
    const want = 6 + Math.floor(rng() * 3);
    this.lamps = [];
    for (const [x, z] of tiles) {
      if (this.lamps.length >= want) break;
      if (this.lamps.some(l => Math.abs(l.tx - x) + Math.abs(l.tz - z) < 5)) continue;
      this.lamps.push({ tx: x, tz: z, x: centerOf(x), z: centerOf(z) });
    }
    for (const l of this.lamps) {
      const mesh = new THREE.Mesh(this.lampGeo, this.lampMat);
      mesh.position.set(l.x, WALL_H - 0.07, l.z);
      this.group.add(mesh);
    }
    this.update(new THREE.Vector3(1.5, 0, 1.5));
  }

  update(p) {
    const sorted = this.lamps.slice().sort((a, b) =>
      (a.x - p.x) ** 2 + (a.z - p.z) ** 2 - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
    this.lights.forEach((light, i) => {
      const l = sorted[i];
      if (l && !(this.low && i > 0)) { light.position.set(l.x, WALL_H - 0.4, l.z); light.visible = true; }
      else light.visible = false; // 낮음: 가장 가까운 전등 1개만 실제 조명
    });
  }
}

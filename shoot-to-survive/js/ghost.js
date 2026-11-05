import * as THREE from 'three';
import { hasLOS, pushOut, tileOf, centerOf, openNeighbors, findPath } from './maze.js';

export const GHOST_H = 1.8;          // 모델 높이
export const GHOST_FLOAT = 0.25;     // 바닥에서 띄운 높이
export const HEAD_FROM = GHOST_H * 0.75; // 상단 25% = 머리
const RADIUS = 0.35;

export function createGhostAssets() {
  // 흰 천을 뒤집어쓴 실루엣 (Lathe, 로우폴리)
  const pts = [[0, 1.8], [0.13, 1.78], [0.23, 1.7], [0.27, 1.58], [0.26, 1.45], [0.32, 1.3], [0.4, 1.0], [0.5, 0.6], [0.58, 0.25], [0.62, 0.0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 8);
  const pos = geo.attributes.position; // 옷자락 물결
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.3) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, y + Math.sin(a * 4) * 0.12 + 0.12);
    }
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0xeeeeee, emissive: 0x161616, flatShading: true, side: THREE.DoubleSide });
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 5);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  return { geo, mat, eyeGeo, eyeMat };
}

export class Ghost {
  constructor(assets, tx, tz) {
    this.mesh = new THREE.Mesh(assets.geo, assets.mat);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
      eye.scale.set(0.8, 1.5, 0.5);
      eye.position.set(sx * 0.1, 1.56, 0.245);
      this.mesh.add(eye);
    }
    this.mesh.userData.ghost = this;
    this.x = centerOf(tx); this.z = centerOf(tz);
    this.yaw = Math.random() * 6.28;
    this.hp = 100;
    this.state = 'wander';
    this.target = [tx, tz];       // 배회 목표 타일
    this.prevTile = null;
    this.lastSeen = null; this.lostT = 0;
    this.path = []; this.pathT = 0;
    this.attackT = -1; this.attackCd = 0;
    this.flash = 0;
    this.sync();
  }

  sync() {
    const lunge = this.attackT >= 0 ? Math.sin(Math.min(1, this.attackT / 0.35) * Math.PI) * 0.25 : 0;
    this.mesh.position.set(this.x + Math.sin(this.yaw) * lunge, GHOST_FLOAT, this.z + Math.cos(this.yaw) * lunge);
    this.mesh.rotation.y = this.yaw;
    this.mesh.scale.setScalar(1 + this.flash * 0.8);
  }

  damage(n) { this.hp -= n; this.flash = 0.15; return this.hp <= 0; }

  moveToward(tx, tz, speed, dt, grid) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) return d;
    const s = Math.min(d, speed * dt);
    this.x += dx / d * s; this.z += dz / d * s;
    const p = { x: this.x, z: this.z }; pushOut(grid, p, RADIUS); this.x = p.x; this.z = p.z;
    const want = Math.atan2(dx, dz);
    let diff = want - this.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 10);
    return d;
  }

  // 반환: 이번 프레임에 플레이어에게 피해를 주려 하는가
  update(dt, player, grid) {
    this.flash = Math.max(0, this.flash - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    const px = player.pos.x, pz = player.pos.z;
    const dist = Math.hypot(px - this.x, pz - this.z);
    const los = hasLOS(grid, this.x, this.z, px, pz);
    let strike = false;

    if (this.state === 'wander') {
      if (los && dist < 10) { this.state = 'chase'; this.lostT = 0; }
    }
    if (this.state === 'chase') {
      if (los && dist < 16) { this.lastSeen = [tileOf(px), tileOf(pz)]; this.lastSeenPos = [px, pz]; this.lostT = 0; }
      else this.lostT += dt;
      if (this.lostT >= 5) { // 5초간 놓치면 배회로
        this.state = 'wander'; this.target = [tileOf(this.x), tileOf(this.z)]; this.prevTile = null; this.attackT = -1;
      }
    }

    if (this.state === 'wander') {
      const [tx, tz] = this.target;
      const d = this.moveToward(centerOf(tx), centerOf(tz), 1.5, dt, grid);
      if (d < 0.08) { // 교차로에서 무작위 방향
        let opts = openNeighbors(grid, tx, tz);
        const fwd = opts.filter(([nx, nz]) => !this.prevTile || nx !== this.prevTile[0] || nz !== this.prevTile[1]);
        if (fwd.length) opts = fwd;
        const o = opts[Math.floor(Math.random() * opts.length)];
        this.prevTile = [tx, tz]; this.target = [o[0], o[1]];
      }
    } else if (this.attackT >= 0) {
      this.attackT += dt; // 공격 모션 중에는 멈춰 선다
      this.yaw = Math.atan2(px - this.x, pz - this.z);
      if (this.attackT >= 0.35) {
        if (dist < 1.6) strike = true;
        this.attackT = -1; this.attackCd = 1.5;
      }
    } else if (los && dist < 16) {
      if (dist > 1.0) this.moveToward(px, pz, 5, dt, grid);
      if (dist <= 1.2 && this.attackCd <= 0) this.attackT = 0;
    } else if (this.lastSeen) { // 놓쳤으면 마지막 목격 위치까지 BFS 이동
      this.pathT -= dt;
      const here = [tileOf(this.x), tileOf(this.z)];
      if (this.pathT <= 0) { this.path = findPath(grid, here, this.lastSeen); this.pathT = 0.25; }
      if (this.path.length > 1) {
        const [nx, nz] = this.path[1];
        this.moveToward(centerOf(nx), centerOf(nz), 5, dt, grid);
        if (Math.hypot(centerOf(nx) - this.x, centerOf(nz) - this.z) < 0.2) this.path.shift();
      } else if (this.lastSeenPos) {
        this.moveToward(this.lastSeenPos[0], this.lastSeenPos[1], 5, dt, grid);
      }
    }
    this.sync();
    return strike;
  }
}

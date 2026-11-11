// 적 탄: 실제로 날아가는 발사체(피할 수 있다). 풀링, 고정 스텝에서 이동·판정, 렌더는 볼트 배치로.
import * as THREE from 'three';
import { segmentSphere } from './hit-test.js';
import { damagePlayer } from './damage.js';
import { PALETTE } from '../data/palette.js';

const _head = new THREE.Vector3();

export class Projectiles {
  constructor(capacity, look) {
    this.capacity = capacity;
    this.look = look; // { length, width }
    this.active = new Uint8Array(capacity);
    this.life = new Float32Array(capacity);
    this.damage = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
    this.pos = [];
    this.prev = [];
    this.dir = [];
    for (let i = 0; i < capacity; i++) {
      this.pos.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
      this.dir.push(new THREE.Vector3());
    }
    this.next = 0;
    this.count = 0;
  }

  /** @param {THREE.Vector3} from @param {THREE.Vector3} dir 단위벡터 */
  spawn(from, dir, speed, life, damage) {
    // 빈 칸을 찾고, 없으면 가장 오래된 칸을 덮어쓴다
    let i = this.next;
    for (let n = 0; n < this.capacity && this.active[i]; n++) i = (i + 1) % this.capacity;
    this.next = (i + 1) % this.capacity;
    if (!this.active[i]) this.count++;
    this.active[i] = 1;
    this.pos[i].copy(from);
    this.prev[i].copy(from);
    this.dir[i].copy(dir);
    this.speed[i] = speed;
    this.life[i] = life;
    this.damage[i] = damage;
  }

  step(dt, ctx) {
    const player = ctx.player;
    const pp = player.flight.pos;
    const r = player.cfg.hitRadius;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const p = this.pos[i];
      const q = this.prev[i];
      q.copy(p);
      p.addScaledVector(this.dir[i], this.speed[i] * dt);
      this.life[i] -= dt;
      if (player.alive && segmentSphere(q.x, q.y, q.z, p.x, p.y, p.z, pp.x, pp.y, pp.z, r)) {
        this.active[i] = 0;
        this.count--;
        ctx.fx.spark(pp, player.velocity);
        damagePlayer(ctx, this.damage[i], 'bullet');
        continue;
      }
      if (this.life[i] <= 0) { this.active[i] = 0; this.count--; }
    }
  }

  /** 렌더 프레임: 보간 위치로 볼트 배치에 추가 */
  render(alpha, bolts) {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      _head.lerpVectors(this.prev[i], this.pos[i], alpha);
      bolts.add(_head, this.dir[i], this.look.length, this.look.width, PALETTE.fx.enemyTracer);
    }
  }

  shift(dx, dz) {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      this.pos[i].x += dx; this.pos[i].z += dz;
      this.prev[i].x += dx; this.prev[i].z += dz;
    }
  }

  clear() {
    this.active.fill(0);
    this.count = 0;
  }
}

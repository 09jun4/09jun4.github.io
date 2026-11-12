// 마지막 격추 리플레이용 기록기: 최근 몇 초의 플레이어·적기 자세를 링버퍼에 일정 주기로 담는다.
// 한 프레임 = [시간, 플레이어 위치3 + 회전4, 적기마다(생존1 + 위치3 + 회전4)] — 미리 잡아 둔 Float32Array라 할당이 없다.
import * as THREE from 'three';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

export class Recorder {
  constructor(poolSize, cfg) {
    this.cfg = cfg;
    this.pool = poolSize;
    this.stride = 8 + poolSize * 8;
    this.capacity = Math.ceil(cfg.seconds * cfg.hz) + 2;
    this.data = new Float32Array(this.capacity * this.stride);
    this.reset();
  }

  reset() {
    this.head = 0; // 다음에 쓸 칸
    this.count = 0;
    this.time = 0;
    this.acc = 0;
    this.killT = -1;
    this.killIndex = -1;
    this.frozen = false;
  }

  /** 고정 스텝마다 부른다. 주기가 되면 한 프레임을 기록한다 */
  step(dt, player, enemies) {
    if (this.frozen) return;
    this.time += dt;
    this.acc += dt;
    const period = 1 / this.cfg.hz;
    if (this.acc < period) return;
    this.acc -= period;
    const d = this.data;
    let o = this.head * this.stride;
    const f = player.flight;
    d[o++] = this.time;
    d[o++] = f.pos.x; d[o++] = f.pos.y; d[o++] = f.pos.z;
    d[o++] = f.quat.x; d[o++] = f.quat.y; d[o++] = f.quat.z; d[o++] = f.quat.w;
    for (let i = 0; i < this.pool; i++) {
      const e = enemies[i];
      d[o++] = e && e.alive ? 1 : 0;
      d[o++] = e.pos.x; d[o++] = e.pos.y; d[o++] = e.pos.z;
      d[o++] = e.quat.x; d[o++] = e.quat.y; d[o++] = e.quat.z; d[o++] = e.quat.w;
    }
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  markKill(index) {
    this.killT = this.time;
    this.killIndex = index;
  }

  /** 원점 재배치: 기록된 좌표도 함께 옮긴다 */
  shift(dx, dz) {
    const d = this.data;
    for (let k = 0; k < this.capacity; k++) {
      let o = k * this.stride + 1;
      d[o] += dx; d[o + 2] += dz;
      o += 7;
      for (let i = 0; i < this.pool; i++, o += 8) { d[o + 1] += dx; d[o + 3] += dz; }
    }
  }

  _frame(k) { // k번째로 오래된 프레임의 시작 위치
    return (((this.head - this.count + k) % this.capacity) + this.capacity) % this.capacity * this.stride;
  }

  /** 재생할 구간 [t0, t1]. 격추 기록이 없거나 버퍼가 비었으면 null */
  window() {
    if (this.killT < 0 || this.count < 4) return null;
    const first = this.data[this._frame(0)], last = this.data[this._frame(this.count - 1)];
    const t0 = Math.max(first, this.killT - this.cfg.before), t1 = Math.min(last, this.killT + this.cfg.after);
    return t1 - t0 > 0.5 ? { t0, t1 } : null;
  }

  /**
   * 시각 t의 자세를 보간해 out에 담는다.
   * @param {{pos:THREE.Vector3, quat:THREE.Quaternion, enemies:{alive:boolean,pos:THREE.Vector3,quat:THREE.Quaternion}[]}} out
   */
  sample(t, out) {
    const d = this.data;
    let k = 0;
    while (k < this.count - 2 && d[this._frame(k + 1)] <= t) k++;
    const a = this._frame(k), b = this._frame(Math.min(this.count - 1, k + 1));
    const span = d[b] - d[a];
    const u = span > 1e-6 ? Math.min(1, Math.max(0, (t - d[a]) / span)) : 0;
    const L = (i) => d[a + i] + (d[b + i] - d[a + i]) * u;
    out.pos.set(L(1), L(2), L(3));
    out.quat.copy(_qa.fromArray(d, a + 4)).slerp(_qb.fromArray(d, b + 4), u);
    for (let i = 0; i < this.pool; i++) {
      const o = 8 + i * 8, e = out.enemies[i];
      e.alive = d[a + o] > 0.5; // 앞 프레임 기준: 격추되면 바로 사라진다
      if (!e.alive) continue;
      const both = d[b + o] > 0.5;
      if (both) { e.pos.set(L(o + 1), L(o + 2), L(o + 3)); e.quat.copy(_qa.fromArray(d, a + o + 4)).slerp(_qb.fromArray(d, b + o + 4), u); } else { e.pos.fromArray(d, a + o + 1); e.quat.fromArray(d, a + o + 4); }
    }
    return out;
  }
}

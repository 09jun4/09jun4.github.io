// 체력: 최대 100, 마지막 피격 후 regenDelay초 대기 → 초당 regenRate 회복.
import { bus } from '../core/EventBus.js';

export class Health {
  constructor(cfg) {
    this.max = cfg.max;
    this.hp = cfg.max;
    this.regenDelay = cfg.regenDelay;
    this.regenRate = cfg.regenRate;
    this.sinceHit = 999;
    this.invulnerable = false; // 시네마틱·관리자 무적
    this.god = false;
    this.dead = false;
  }
  damage(amount, info = {}) {
    if (this.dead || this.invulnerable || this.god || amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.sinceHit = 0;
    bus.emit('player:damaged', { amount, hp: this.hp, ...info });
    if (this.hp <= 0) { this.dead = true; bus.emit('player:died', info); }
    return true;
  }
  update(dt) {
    if (this.dead) return;
    this.sinceHit += dt;
    if (this.sinceHit >= this.regenDelay && this.hp < this.max) {
      this.hp = Math.min(this.max, this.hp + this.regenRate * dt);
    }
  }
  get ratio() { return this.hp / this.max; }
}

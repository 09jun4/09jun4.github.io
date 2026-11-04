// 무기 공통 로직: 탄창·연사 간격·재장전 상태. 새 무기는 이 클래스를 상속하고
// createViewModel()과 (필요하면) 애니메이터를 바꾸면 된다.
import { bus } from '../core/EventBus.js';

export class WeaponBase {
  constructor(cfg) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.magSize = cfg.magazine;
    this.ammo = cfg.magazine;
    this.reserve = cfg.reserve === 'infinite' ? Infinity : cfg.reserve ?? Infinity;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDur = 0;
    this.reloadEmpty = false;
    this.lastShotT = 99;
  }

  get canFire() { return !this.reloading && this.cooldown <= 0 && this.ammo > 0; }
  get isEmpty() { return this.ammo <= 0; }

  // 사격 시도. 성공하면 true (실제 탄 판정은 호출 측 ctx.shoot)
  tryFire(ctx) {
    if (this.reloading || this.cooldown > 0) return false;
    if (this.ammo <= 0) {
      this.cooldown = 0.25;
      bus.emit('weapon:dry', { weapon: this });
      return false;
    }
    this.ammo--;
    this.cooldown = this.cfg.fireInterval;
    this.lastShotT = 0;
    ctx.shoot(this);
    bus.emit('weapon:fired', { weapon: this, ammo: this.ammo, empty: this.ammo === 0 });
    return true;
  }

  startReload() {
    if (this.reloading || this.ammo >= this.magSize || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadEmpty = this.ammo === 0;
    this.reloadDur = this.reloadEmpty ? this.cfg.emptyReloadTime : this.cfg.reloadTime;
    this.reloadT = 0;
    bus.emit('weapon:reload', { weapon: this, empty: this.reloadEmpty, duration: this.reloadDur });
    return true;
  }

  cancelReload() { this.reloading = false; this.reloadT = 0; }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.lastShotT += dt;
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadDur) {
        const need = this.magSize - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        if (this.reserve !== Infinity) this.reserve -= take;
        this.reloading = false;
        bus.emit('weapon:reloaded', { weapon: this });
      }
    }
  }

  get reloadProgress() { return this.reloading ? this.reloadT / this.reloadDur : 0; }

  // 하위 클래스가 구현: { root(Object3D), muzzle, ... }
  createViewModel() { throw new Error('createViewModel not implemented'); }
}

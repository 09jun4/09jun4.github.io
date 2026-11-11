// 무장 시스템. 모든 무장은 같은 인터페이스를 따른다:
//   reset()                          미션 시작 시 초기화(탄약·과열 등)
//   update(dt, ctx, active, trigger) 매 스텝 호출. active = 현재 선택된 무장인지, trigger = 발사 버튼 유지
//   fire(ctx)                        한 발 발사(update 안에서 조건이 맞을 때 호출)
//   uiState()                        HUD가 읽는 상태
// 선택 사항: init(ctx) 메시 준비, render(alpha) 렌더 보간, shift(dx,dz) 원점 재배치
// 새 무장은 data/weapons.js 에 항목을 넣고, 새 type이면 registerWeapon(type, factory)로 등록한다.
// 기존 무장 코드나 이 파일을 고칠 필요가 없다.
const factories = new Map();

/** @param {string} type @param {(cfg:object)=>object} factory */
export function registerWeapon(type, factory) {
  factories.set(type, factory);
}

export class WeaponSystem {
  /** @param {string[]} loadout 무장 id 목록 @param {Record<string,object>} defs data/weapons.js 의 WEAPONS */
  constructor(loadout, defs) {
    this.weapons = loadout.map((id) => {
      const cfg = defs[id];
      const factory = factories.get(cfg.type);
      if (!factory) throw new Error(`weapon type not registered: ${cfg.type}`);
      return factory(cfg);
    });
    this.index = 0;
  }

  /** 메시 등 한 번만 만들면 되는 것을 준비한다. */
  init(ctx) {
    for (const w of this.weapons) if (w.init) w.init(ctx);
  }

  render(alpha) {
    for (const w of this.weapons) if (w.render) w.render(alpha);
  }

  shift(dx, dz) {
    for (const w of this.weapons) if (w.shift) w.shift(dx, dz);
  }

  get current() {
    return this.weapons[this.index];
  }

  byId(id) {
    return this.weapons.find((w) => w.id === id) || null;
  }

  reset() {
    this.index = 0;
    for (const w of this.weapons) w.reset();
  }

  /** 다음 무장으로 전환 */
  next(ctx) {
    this.index = (this.index + 1) % this.weapons.length;
    ctx.audio.play('weapon_switch');
    return this.current;
  }

  update(dt, ctx, trigger) {
    const cur = this.current;
    for (const w of this.weapons) w.update(dt, ctx, w === cur, trigger);
  }

  uiState() {
    return this.current.uiState();
  }
}

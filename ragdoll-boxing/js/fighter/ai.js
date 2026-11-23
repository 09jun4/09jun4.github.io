// 단순 반응형 AI: 거리 맞추기 → 펀치, 상대가 때리면 가끔 가드·위빙, 지치면 물러나기
const ATTACKS = [['jab', 0.4], ['straight', 0.25], ['hook', 0.2], ['uppercut', 0.15]];

export class AIController {
  constructor(cfg, rand = Math.random) {
    this.cfg = cfg;
    this.rand = rand;
    this.think = 0;
    this.guardT = 0;
    this.weave = 0;
    this.weaveT = 0;
    this.drift = 0;
    this.seenAttack = -1;
    this.reactT = -1;
  }

  intent(me, opp, dt) {
    const c = this.cfg, r = this.rand;
    const out = { fwd: 0, side: this.drift, guard: false, weave: 0, attack: null };
    const dist = me.body.pos('pelvis').distanceTo(opp.body.pos('pelvis'));
    const tired = me.s.stamina < 25;
    const range = c.preferredRange + (tired ? 0.6 : 0);
    out.fwd = dist > range + 0.12 ? 1 : dist < range - 0.2 ? -1 : 0;

    // 상대 공격을 보고 반응 시간 뒤 가드 또는 위빙
    if (opp.attack && opp.attack.id !== this.seenAttack) {
      this.seenAttack = opp.attack.id;
      this.reactT = c.reaction * (0.7 + r() * 0.6);
      this.reaction = r() < c.guardChance ? 'guard' : r() < c.weaveChance / (1 - c.guardChance) ? 'weave' : null;
    }
    if (this.reactT >= 0 && (this.reactT -= dt) < 0) {
      if (this.reaction === 'guard') this.guardT = 0.45;
      if (this.reaction === 'weave') { this.weave = r() < 0.5 ? -1 : 1; this.weaveT = 0.35; }
    }
    if ((this.guardT -= dt) > 0) out.guard = true;
    if ((this.weaveT -= dt) > 0) out.weave = this.weave;

    if ((this.think -= dt) <= 0) {
      this.think = c.thinkInterval * (0.6 + r() * 0.8);
      if (r() < 0.3) this.drift = r() < 0.5 ? (r() < 0.5 ? -0.6 : 0.6) : 0;
      if (!tired && !out.guard && dist < c.preferredRange + 0.25 && r() < c.attackChance) {
        let x = r();
        const [type] = ATTACKS.find(([, p]) => (x -= p) < 0) ?? ATTACKS[0];
        out.attack = { type, side: type === 'jab' ? 'L' : r() < 0.5 ? 'L' : 'R' };
        if (type === 'jab' && r() < 0.4) this.followUp = 0.12; // 가끔 원투
      }
    }
    if (this.followUp > 0 && (this.followUp -= dt) <= 0) out.attack = { type: 'straight', side: 'R' };
    return out;
  }
}

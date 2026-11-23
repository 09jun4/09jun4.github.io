import * as THREE from '../../vendor/three.module.min.js';

const _v = new THREE.Vector3();

// 모든 충돌 이벤트를 한곳에서 받아 종류별로 나누고, 같은 충돌을 두 번 처리하지 않는다.
export class CollisionManager {
  constructor(world, eventQueue, fighters) {
    this.world = world;
    this.queue = eventQueue;
    this.fighters = fighters;
    this.byCollider = new Map();
    for (const f of fighters) for (const p of Object.values(f.body.parts)) this.byCollider.set(p.collider.handle, p);
    this.handVel = new Map(fighters.flatMap((f) => Object.values(f.body.hands).map((h) => [h, new THREE.Vector3()])));
    this.onHit = null; // (attacker, defender, part, damage) => void
  }

  // 스텝 전 손 속도 기록: 충돌 뒤에는 속도가 이미 줄어 있으므로 부딪히기 직전 값을 쓴다
  beforeStep() {
    for (const f of this.fighters) for (const side of ['L', 'R']) {
      const h = f.body.hands[side], v = h.body.linvel();
      this.handVel.get(h).set(v.x, v.y, v.z);
    }
  }

  classify(a, b) {
    if (!a || !b) return 'body-vs-arena';
    if (a.fighter === b.fighter) return 'self';
    if (a.kind === 'hand' || b.kind === 'hand') return 'hand-vs-body';
    return 'body-vs-body';
  }

  afterStep(time) {
    const seen = new Set();
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const key = h1 < h2 ? h1 + ':' + h2 : h2 + ':' + h1;
      if (seen.has(key)) return;
      seen.add(key);
      const a = this.byCollider.get(h1), b = this.byCollider.get(h2);
      if (this.classify(a, b) !== 'hand-vs-body') return; // ponytail: 로프·몸통 충돌 반응은 물리에 맡김. 효과음 등이 필요하면 여기서 분기
      for (const [hand, part] of [[a, b], [b, a]]) {
        if (hand.kind !== 'hand') continue;
        const atk = this.fighters[hand.fighter], def = this.fighters[part.fighter];
        const attack = atk.activeAttack(hand.side);
        if (!attack) continue;
        const pv = part.body.linvel();
        const hv = this.handVel.get(hand);
        const rel = _v.set(hv.x - pv.x, hv.y - pv.y, hv.z - pv.z).length();
        attack.hit = true; // 한 번의 펀치는 한 번만 맞는다
        const dmg = def.receiveHit(part, rel, attack, _v.normalize(), time);
        if (dmg > 0) { atk.s.round.landed++; atk.s.round.damage += dmg; }
        this.onHit?.(atk, def, part, dmg, rel);
      }
    });
  }
}

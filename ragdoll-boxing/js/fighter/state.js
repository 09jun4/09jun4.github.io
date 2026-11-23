// FighterState: 선수 한 명의 모든 상태값. 값 변경은 아래 StateManager 함수로만 한다.
export function createFighterState(stats) {
  return {
    health: stats.health, maxHealth: stats.health,
    stamina: stats.stamina, maxStamina: stats.stamina,
    balance: stats.balance, maxBalance: stats.balance,
    stability: 1,        // 현재 자세 유지 정도(보조 세기) 0~1
    fatigue: 0,          // ponytail: 필드만 둠. 다음 단계에서 스태미나 회복 감소에 연결
    recovery: 0,         // 기상 진행도 0~1
    moveSpeed: stats.moveSpeed,
    posture: 'guard',    // 팔 자세 이름
    action: null,        // 현재 공격 종류
    state: 'Standing',   // 래그돌 상태
    stateTime: 0,
    knockdowns: 0,
    groundContact: { feet: true, body: false },
    lastHitTime: -1,
    round: { thrown: 0, landed: 0, damage: 0 },
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const StateManager = {
  setState(s, next) {
    if (s.state === next) return false;
    s.state = next;
    s.stateTime = 0;
    return true;
  },
  spendStamina(s, amount) {
    if (s.stamina < amount) return false;
    s.stamina -= amount;
    return true;
  },
  drainStamina(s, amount) { s.stamina = clamp(s.stamina - amount, 0, s.maxStamina); },
  applyHit(s, damage, balanceLoss, time) {
    s.health = clamp(s.health - damage, 0, s.maxHealth);
    s.balance = clamp(s.balance - balanceLoss, 0, s.maxBalance);
    s.lastHitTime = time;
  },
  regen(s, dt, stats, resting) {
    s.stamina = clamp(s.stamina + stats.staminaRegen * dt * (resting ? 1 : 0.35), 0, s.maxStamina);
    s.balance = clamp(s.balance + stats.balanceRegen * dt, 0, s.maxBalance);
  },
  resetRound(s) {
    s.health = s.maxHealth; s.stamina = s.maxStamina; s.balance = s.maxBalance;
    s.knockdowns = 0; s.recovery = 0; s.action = null;
    s.round = { thrown: 0, landed: 0, damage: 0 };
    StateManager.setState(s, 'Standing');
  },
};

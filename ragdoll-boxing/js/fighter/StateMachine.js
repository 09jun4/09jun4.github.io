// 래그돌 상태 전이. 순수 함수라 물리 없이 따로 시험할 수 있다.
// s: FighterState, k: 감지값 { tilt(도), pelvisY, speed, angSpeed, down, attacking, guarding }, cfg: fighter.json
export const DOWN_STATES = ['Falling', 'Knockdown', 'Recovering', 'KO'];

export function nextState(s, k, cfg, matchCfg) {
  const r = cfg.recovery;
  switch (s.state) {
    case 'KO': return 'KO';
    case 'Falling':
      if (s.health <= 0) return 'KO';
      return s.stateTime > r.fallTime && k.down ? 'Knockdown' : 'Falling';
    case 'Knockdown':
      if (s.health <= 0 || s.knockdowns >= matchCfg.knockdownsForKO) return 'KO';
      return s.stateTime > r.downTime ? 'Recovering' : 'Knockdown';
    case 'Recovering':
      return s.recovery >= 1 && k.pelvisY > cfg.balance.standHeight * 0.85 ? 'Standing' : 'Recovering';
  }
  if (s.health <= 0) return 'KO';
  if (s.balance <= 0 || k.tilt > 60) return 'Falling';
  if (s.state === 'Stagger' && s.stateTime < cfg.hit.staggerTime) return 'Stagger';
  if (k.attacking) return 'Action';
  if (k.guarding) return 'Guarding';
  if (s.balance < r.offBalance) return 'OffBalance';
  if (s.stamina < 10) return 'Exhausted';
  return k.speed > 0.25 ? 'Moving' : 'Standing';
}

// 상태별 근력·자세 보조 세기
export function tuning(s, cfg) {
  const t = cfg.stateTuning[s.state] ?? cfg.stateTuning.Standing;
  if (s.state !== 'Recovering') return t;
  const e = s.recovery * s.recovery * (3 - 2 * s.recovery);
  return { assist: e, muscle: 0.4 + 0.6 * e };
}

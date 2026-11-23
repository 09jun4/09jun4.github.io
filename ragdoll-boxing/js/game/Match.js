// 경기 진행: 소개 → 라운드 → 라운드 종료 → … → 경기 종료. 물리와 무관한 규칙만 담당.
export class Match {
  constructor(cfg) {
    this.cfg = cfg;
    this.wins = [0, 0];
    this.round = 0;
    this.phase = 'idle';
    this.time = 0;
    this.clock = cfg.roundTime;
    this.result = null;       // 라운드 결과 { winner: 0|1|null, reason: 'KO'|'TIME' }
    this.winner = null;       // 경기 승자
    this.onRoundStart = null;
  }

  start() { this.wins = [0, 0]; this.round = 0; this.winner = null; this._next(); }

  _next() {
    this.round++;
    this.phase = 'intro';
    this.time = 0;
    this.clock = this.cfg.roundTime;
    this.result = null;
    this.onRoundStart?.();
  }

  get fighting() { return this.phase === 'fight'; }

  update(dt, fighters) {
    this.time += dt;
    if (this.phase === 'intro' && this.time > this.cfg.introTime) { this.phase = 'fight'; this.time = 0; }
    else if (this.phase === 'fight') {
      this.clock = Math.max(0, this.clock - dt);
      const ko = fighters.findIndex((f) => f.s.state === 'KO');
      if (ko >= 0) this._end(1 - ko, 'KO');
      else if (this.clock <= 0) {
        const [a, b] = fighters.map((f) => f.s.health);
        this._end(a === b ? null : a > b ? 0 : 1, 'TIME');
      }
    } else if (this.phase === 'roundEnd' && this.time > this.cfg.roundEndTime) {
      const done = this.wins.some((w) => w >= this.cfg.roundsToWin) || this.round >= this.cfg.maxRounds;
      if (!done) return this._next();
      this.phase = 'matchEnd';
      this.winner = this.wins[0] === this.wins[1] ? null : this.wins[0] > this.wins[1] ? 0 : 1;
    }
  }

  _end(winner, reason) {
    if (winner !== null) this.wins[winner]++;
    this.result = { winner, reason };
    this.phase = 'roundEnd';
    this.time = 0;
  }
}

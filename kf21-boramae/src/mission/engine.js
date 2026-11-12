// 미션 엔진(순수 로직): 목표 진행·승패·점수만 맡는다. Three.js도 DOM도 모른다(Node에서 그대로 테스트한다).
// 세션은 일어난 일을 알려 주기만 한다: airKill(격추), groundDestroyed(지상 목표 파괴), escaped(수송기·폭격기 도달),
// checkpoint(링 통과), playerDead(체력 0), tick(시간). 엔진은 outcome('running' | 'won' | 'lost')과 점수를 돌려준다.
//
// 목표 스키마: { id, type, count, points, required = true, after?, timeLimit?, role?, targetType? }
//   killAir     공중 N대 격추(role 기본 'fighter')
//   timedKill   제한시간(timeLimit, 목표가 활성화된 뒤부터) 안에 N대 격추. 넘기면 실패
//   intercept   role('transport' | 'bomber')을 전부 격추. 한 대라도 도달(escaped)하면 실패
//   destroy     targetType 지상 목표 N개 파괴
//   checkpoints 링 N개를 순서대로 통과(timeLimit 선택)
//   boss        보스 격추(role 'boss')
// after: 그 목표가 끝나야 활성화되는 단계형. 승리 = required 목표 전부 완료, 패배 = 체력 0 · required 목표 실패 · 미션 timeLimit 초과.
// 점수 = Σ points × (진행/수량) + (승리 시) max(0, refTime − 시간) × 10. 기준 점수 = Σ points + refTime × 10.

export const OBJ = { KILL_AIR: 'killAir', TIMED_KILL: 'timedKill', INTERCEPT: 'intercept', DESTROY: 'destroy', CHECKPOINTS: 'checkpoints', BOSS: 'boss' };
export const OUTCOME = { RUNNING: 'running', WON: 'won', LOST: 'lost' };
export const LOSS = { DEAD: 'dead', ESCAPED: 'escaped', TIMEOUT: 'timeout', OBJECTIVE: 'objective' };
export const TIME_SCORE = 10;
const AIR_TYPES = new Set([OBJ.KILL_AIR, OBJ.TIMED_KILL, OBJ.INTERCEPT, OBJ.BOSS]);
const DEFAULT_ROLE = { killAir: 'fighter', timedKill: 'fighter', boss: 'boss', intercept: 'transport' };

/** 목표의 공중 역할(어떤 격추가 이 목표에 쌓이는가) */
export const objectiveRole = (o) => (AIR_TYPES.has(o.type) ? o.role || DEFAULT_ROLE[o.type] : null);

/** 기준 점수(등급 계산의 분모) */
export function referenceScore(mission) {
  let sum = 0;
  for (const o of mission.objectives) sum += o.points;
  return sum + mission.refTime * TIME_SCORE;
}

export class MissionEngine {
  /** @param {object} mission data/missions.js 의 미션 */
  constructor(mission) {
    this.mission = mission;
    this.objectives = mission.objectives.map((o) => ({
      def: o, id: o.id, type: o.type, count: o.count || 1, points: o.points, required: o.required !== false,
      progress: 0, done: false, failed: false, active: false, activeTime: 0,
    }));
    this.byId = new Map(this.objectives.map((o) => [o.id, o]));
    this.reset();
  }

  reset() {
    this.time = 0;
    this.outcome = OUTCOME.RUNNING;
    this.reason = null;
    this.version = 0; // 목표 상태가 바뀔 때마다 증가(HUD가 다시 그린다)
    for (const o of this.objectives) { o.progress = 0; o.done = false; o.failed = false; o.active = false; o.activeTime = 0; }
    this._activate();
  }

  get running() { return this.outcome === OUTCOME.RUNNING; }

  _activate() {
    for (const o of this.objectives) {
      if (o.active || o.done || o.failed) continue;
      const pre = o.def.after ? this.byId.get(o.def.after) : null;
      if (!pre || pre.done) { o.active = true; o.activeTime = 0; this.version++; }
    }
  }

  _credit(o, n = 1) {
    if (!o || o.done || o.failed || !this.running) return false;
    o.progress = Math.min(o.count, o.progress + n);
    this.version++;
    if (o.progress >= o.count) { o.done = true; o.active = false; this._activate(); this._check(); }
    return true;
  }

  _fail(o, reason) {
    if (!o || o.done || o.failed || !this.running) return;
    o.failed = true;
    o.active = false;
    this.version++;
    if (o.required) this._lose(reason);
  }

  _lose(reason) {
    if (!this.running) return;
    this.outcome = OUTCOME.LOST;
    this.reason = reason;
    this.version++;
  }

  _check() {
    if (!this.running) return;
    for (const o of this.objectives) if (o.required && !o.done) return;
    this.outcome = OUTCOME.WON;
    this.version++;
  }

  /** 활성 목표 중 조건에 맞는 첫 번째(필수 목표 먼저) */
  _find(test) {
    let hit = null;
    for (const o of this.objectives) {
      if (!o.active || !test(o)) continue;
      if (o.required) return o;
      hit = hit || o;
    }
    return hit;
  }

  // ── 세션이 알려 주는 일 ──
  /** 공중 격추. role: 'fighter'(기본) | 'transport' | 'bomber' | 'boss' */
  airKill(role = 'fighter') {
    return this._credit(this._find((o) => objectiveRole(o) === role));
  }

  /** 지상 목표 파괴 */
  groundDestroyed(targetType) {
    return this._credit(this._find((o) => o.type === OBJ.DESTROY && (!o.def.targetType || o.def.targetType === targetType)));
  }

  /** 수송기·폭격기가 출구(목표 지점)에 도달 */
  escaped(role) {
    const o = this.objectives.find((x) => x.type === OBJ.INTERCEPT && objectiveRole(x) === role && !x.done && !x.failed);
    this._fail(o, LOSS.ESCAPED);
  }

  /** 체크포인트 통과(순서대로만 인정). index는 0부터 */
  checkpoint(index) {
    const o = this._find((x) => x.type === OBJ.CHECKPOINTS);
    if (!o || index !== o.progress) return false;
    return this._credit(o);
  }

  /** 다음에 통과할 체크포인트 번호(없으면 -1) */
  nextCheckpoint() {
    const o = this._find((x) => x.type === OBJ.CHECKPOINTS);
    return o ? o.progress : -1;
  }

  playerDead() {
    this._lose(LOSS.DEAD);
  }

  /** 미션 시간 진행(튜토리얼·이륙 중에는 부르지 않는다) */
  tick(dt) {
    if (!this.running) return;
    this.time += dt;
    for (const o of this.objectives) {
      if (!o.active) continue;
      o.activeTime += dt;
      if (o.def.timeLimit && o.activeTime > o.def.timeLimit) this._fail(o, LOSS.TIMEOUT);
    }
    if (this.running && this.mission.timeLimit && this.time > this.mission.timeLimit) this._lose(LOSS.TIMEOUT);
  }

  // ── 조회 ──
  /** 가장 급한 제한시간의 남은 초(없으면 null). HUD 타이머용 */
  timeLeft() {
    let left = this.mission.timeLimit ? this.mission.timeLimit - this.time : Infinity;
    for (const o of this.objectives) if (o.active && o.def.timeLimit) left = Math.min(left, o.def.timeLimit - o.activeTime);
    return Number.isFinite(left) ? Math.max(0, left) : null;
  }

  /** 목표별 획득 점수(부분 점수 포함) */
  objectivePoints(o) {
    return o.done ? o.points : Math.round((o.points * o.progress) / o.count);
  }

  /** @param {number} [time] 클리어 시간(기본: 엔진 시간) */
  score(time = this.time) {
    let s = 0;
    for (const o of this.objectives) s += this.objectivePoints(o);
    if (this.outcome === OUTCOME.WON) s += Math.max(0, this.mission.refTime - time) * TIME_SCORE;
    return Math.round(s);
  }

  timeBonus(time = this.time) {
    return this.outcome === OUTCOME.WON ? Math.round(Math.max(0, this.mission.refTime - time) * TIME_SCORE) : 0;
  }

  /** 결과 화면·HUD용 목록 */
  summary() {
    return this.objectives.map((o) => ({
      id: o.id, type: o.type, label: o.def.label || '', required: o.required, count: o.count, progress: o.progress,
      done: o.done, failed: o.failed, active: o.active, points: o.points, earned: this.objectivePoints(o),
      timeLeft: o.active && o.def.timeLimit ? Math.max(0, o.def.timeLimit - o.activeTime) : null,
    }));
  }
}

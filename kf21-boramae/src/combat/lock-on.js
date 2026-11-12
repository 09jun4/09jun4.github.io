// 미사일 락온(순수 로직). 상태: search(탐색, 회색) → tracking(추적, 주황) → locked(락온 완료, 초록)
// - 화면 중심 기준 락온 반경 안의 적 중 중심에 가장 가까운 적을 자동 포착
// - 추적을 lockTime 동안 유지하면 락온 완료
// - 대상이 반경을 벗어나거나 사라지면 즉시 초기화
export const LOCK = { SEARCH: 'search', TRACKING: 'tracking', LOCKED: 'locked' };

export class LockOn {
  /** @param {{radius:number, time:number}} cfg radius는 rad 단위로 넘긴다 */
  constructor(radiusRad, lockTime) {
    this.radius = radiusRad;
    this.lockTime = lockTime;
    this.state = LOCK.SEARCH;
    this.target = null;
    this.progress = 0; // 0~1
    this.lockedFor = 0; // 락온이 완료된 뒤 흐른 시간(초): HUD의 짧은 펄스용
  }

  reset() {
    this.state = LOCK.SEARCH;
    this.target = null;
    this.progress = 0;
    this.lockedFor = 0;
  }

  /**
   * @param {number} dt
   * @param {boolean} active 미사일 모드일 때만 락온이 동작한다
   * @param {object[]} enemies alive 속성을 가진 표적 목록
   * @param {(e:object)=>number} angleOf 화면 중심에서의 각거리(rad). 락온할 수 없으면 Infinity
   * @returns {string} 이번 스텝에 일어난 일: '' | 'acquired' | 'locked' | 'lost'
   */
  update(dt, active, enemies, angleOf) {
    if (!active) {
      const had = this.target !== null;
      this.reset();
      return had ? 'lost' : '';
    }
    // 추적 중인 대상이 여전히 반경 안인지
    if (this.target) {
      if (!this.target.alive || angleOf(this.target) > this.radius) {
        this.reset();
        return 'lost';
      }
    }
    if (!this.target) {
      let best = null;
      let bestAngle = this.radius;
      for (const e of enemies) {
        if (!e.alive) continue;
        const a = angleOf(e);
        if (a <= bestAngle) { bestAngle = a; best = e; }
      }
      if (!best) return '';
      this.target = best;
      this.state = LOCK.TRACKING;
      this.progress = 0;
      return 'acquired';
    }
    if (this.state === LOCK.TRACKING) {
      this.progress += dt / this.lockTime;
      if (this.progress >= 1) {
        this.progress = 1;
        this.state = LOCK.LOCKED;
        return 'locked';
      }
    }
    if (this.state === LOCK.LOCKED) this.lockedFor += dt;
    return '';
  }
}

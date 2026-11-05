// BicyclePhysics — 자전거 자체의 물리 값(질량·축간거리·바퀴·기어비)과 구동계 회전(바퀴·크랭크).
// 자전거를 바꾸면 balance.json의 bike 값과 이 파일의 기어비만 조정하면 돼요.
export class BicyclePhysics {
  constructor(cfg) {
    this.cfg = cfg;
    this.mass = cfg.riderMass + cfg.bikeMass;
    this.wheelbase = cfg.wheelbase;
    this.wheelRadius = cfg.wheelRadius;
    this.gearRatio = cfg.gearRatio || 2.35; // 바퀴 회전 / 크랭크 회전
    this.wheelAngle = 0;
    this.crankAngle = 0;
  }
  // 이동 거리만큼 바퀴를 돌리고, 페달을 밟는 중이면 크랭크도 돌려요(관성 주행 중엔 크랭크 정지 = 프리휠)
  advance(dist, pedaling) {
    const w = dist / this.wheelRadius;
    this.wheelAngle += w;
    if (pedaling) this.crankAngle += w / this.gearRatio;
  }
  // 제자리에서 페달만 살짝 (출발 직전 연출용)
  spinCrank(rad) { this.crankAngle += rad; }
}

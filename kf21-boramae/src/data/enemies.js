// 적기 데이터. 기체 수치와 AI 수치를 나눠 둔다(기종 추가 시 항목만 늘리면 된다).
export const ENEMIES = {
  raider: {
    id: 'raider',
    name: '적 전투기',
    hp: 40,
    hitRadius: 11,
    modelScale: 1.35, // 멀리서도 보이도록 실물보다 조금 크게
    outlinePixels: 1.5, // 붉은 외곽선 두께(화면 픽셀)
    collisionDamage: 30, // 플레이어가 받는 충돌 피해
    collisionRadius: 9,

    flight: {
      speed: 150, // 순항
      speedMax: 245, // 멀리서 복귀할 때 최대(플레이어 최대 속도보다 빨라야 도망칠 수 없다)
      speedMin: 125,
      catchUpFrom: 650, // 이 거리부터 가속 시작
      catchUpFull: 1500,
      yawMax: 44, // 도/초
      pitchMax: 36,
      pitchLimit: 55,
      rollMax: 62,
      steerGain: 2.6, // 방향 오차 → 각속도
      rateTau: 0.28, // 각속도 관성
      rollTau: 0.35,
      speedTau: 1.4,
      altMin: 420,
      altMax: 5600, // 플레이어 상승 한계(6000m)보다 낮게
    },

    ai: {
      keepMin: 300, // 이보다 가까워지면 이탈
      keepMax: 500, // 이탈 후 이 거리까지 벌어지면 다시 공격
      orbitRadius: 540, // 공격 차례가 아닐 때 선회 대기 거리
      returnDistance: 2200, // 이보다 멀면 곧장 복귀
      leadTime: 0.9, // 플레이어 예측 위치(초)
      breakTime: [1.4, 2.4], // 이탈 유지 시간
      attackClosing: 30, // 공격 중 플레이어 대비 접근 속도(m/s)
      attackTimeMax: 9, // 공격이 너무 길어지면 스스로 이탈
      evadeTime: [1.1, 1.9], // 피격 회피 유지 시간
      evadeCooldown: 1.8, // 회피를 연달아 하지 않게
      minStateTime: 0.6, // 상태 떨림 방지
      separationRadius: 150,
      separationWeight: 1.6,
      tokenCooldown: 0.8, // 공격을 마친 뒤 다시 차례를 받기까지
    },

    weapon: {
      interval: 1.2, // 연발 사이 간격
      burst: 3, // 한 번에 쏘는 발 수(짧은 연발)
      burstGap: 0.11,
      range: 950,
      cone: 14, // 기수와 조준 방향이 이 각도 안일 때만 발사(도)
      bulletSpeed: 520,
      bulletLife: 2.4,
      damage: 5,
      accuracy: 0.35, // 플레이어 근처로 향하는 탄의 비율
      nearSpread: 6, // 정확한 탄의 조준 오차(m)
      wideSpread: [22, 60], // 나머지 탄의 조준 오차(m)
      firstShotDelay: [0.8, 1.6], // 등장 직후에는 쏘지 않는다
      leadAccel: 1.0, // 선회 중인 플레이어의 가속도를 조준에 반영하는 비율
      tracer: { length: 30, width: 0.5 },
    },

    fx: { smokeBelow: 0.5, smokeEvery: 0.07 },
    missileEnabled: false, // 적 미사일: 지금은 끔. 켜면 위협 경고(combat/threat.js)의 미사일 출처에 연결한다
  },
};

export const DEFAULT_ENEMY = 'raider';
/** 동시에 존재할 수 있는 적기 수(풀 크기) */
export const ENEMY_POOL_SIZE = 8;
/** 동시에 날아다닐 수 있는 적 탄 수(풀 크기) */
export const ENEMY_BULLET_POOL = 72;

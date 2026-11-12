// 지상 목표와 대공 위협 수치. 미션 데이터(data/missions.js)의 groundTargets가 여기 type을 가리킨다.
// armor: 'soft'는 기관포가 조금 통하고(×0.25), 'hard'는 폭탄만 통한다. 미사일은 공중 전용이다.
export const TARGETS = {
  comm_tower: { name: '기지국', short: 'COMM', hp: 200, points: 800, armor: 'hard', radius: 14, height: 40 },
  radar: { name: '레이더', short: 'RDR', hp: 150, points: 700, armor: 'hard', radius: 13, height: 16, spin: 0.7 },
  aa_gun: { name: '대공포', short: 'AAA', hp: 60, points: 400, armor: 'soft', radius: 9, height: 6, weapon: 'aa', guns: 1 },
  sam: { name: 'SAM 발사대', short: 'SAM', hp: 80, points: 600, armor: 'soft', radius: 10, height: 7, weapon: 'sam', missileEnabled: true },
  truck: { name: '트럭', short: 'TRK', hp: 40, points: 250, armor: 'soft', radius: 8, height: 4, speed: 14 },
  patrol_boat: { name: '초계함', short: 'SHIP', hp: 300, points: 1000, armor: 'hard', radius: 28, height: 14, speed: 9, weapon: 'aa', guns: 2, sea: true },
};

export const GROUND_RULES = {
  damage: { gun: { soft: 0.25, hard: 0 }, bomb: { soft: 1, hard: 1 }, missile: { soft: 0, hard: 0 } },
  maxActive: 40, // 동시에 살아 있는 지상 엔티티 상한
  farDistance: 3000, farTick: 1 / 15, // 먼 목표는 AI를 15Hz로만 돌린다
  smoke: { life: 20, every: 0.22, max: 10 }, // 파괴된 자리의 연기 기둥
  nearRadius: 170, // near로 배치할 때 기준 목표와의 거리
};

/** 대공포(지상·함정 공통) */
export const AA = {
  range: 1800, burst: 4, burstGap: 0.12, interval: 1.7, firstShot: [1, 2.5],
  bulletSpeed: 620, bulletLife: 3.2, damage: 4,
  hitChance: 0.25, nearSpread: 5, wideSpread: [28, 80], // 네 발 중 한 발꼴로만 기체 근처를 지난다
};

/** 지대공 미사일. 선회반경 = 속도 ÷ 선회율 = 280 ÷ 0.698 ≈ 401m. 플레이어는 160 ÷ 0.785 ≈ 204m라 급선회로 따돌릴 수 있다 */
export const SAM = {
  range: 4000, minRange: 450, interval: 8, firstShot: [2, 5],
  speed: 280, turnRate: 40, life: 9, damage: 35, proximity: 16, pool: 6, smokeEvery: 0.035,
};

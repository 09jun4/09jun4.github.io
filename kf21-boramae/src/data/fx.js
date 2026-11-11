// 효과(파티클·예광탄·섬광) 설정. 전부 풀링된 InstancedMesh로 그린다.
export const FX = {
  particles: { capacity: 720 },
  bolts: { capacity: 96 },
  flashes: 5,

  explosion: {
    fire: { count: 16, speed: [18, 60], life: [0.35, 0.8], size: [5, 15] },
    smoke: { count: 12, speed: [8, 28], life: [0.9, 1.9], size: [7, 20] },
    debris: { count: 14, speed: [45, 120], life: [0.8, 1.6], size: [1.1, 2.6], gravity: 34 },
    flash: { size: 62, life: 0.22 },
    ring: { size: 150, life: 0.55 }, // 충격파 링
    inherit: 0.55, // 폭발이 기체 속도를 이어받는 비율
  },
  playerExplosion: { scale: 1.5 },
  missileHit: { fire: 8, smoke: 5, flash: 30 },
  spark: { count: 4, speed: [20, 60], life: [0.12, 0.3], size: [0.7, 1.4] },
  missileSmoke: { life: [0.7, 1.2], size: [1.6, 3.4] },
  damageSmoke: { life: [0.7, 1.3], size: [2.4, 4.8] },
  missileIgnite: { size: 7, life: 0.14 }, // 미사일 점화 섬광
  muzzleFlash: { life: 0.045, size: 1.6 },
  casing: { speed: 9, life: 1.1, size: 0.16, gravity: 22 }, // 기관포 탄피
  gunSmoke: { life: [0.25, 0.5], size: [0.5, 1.1] },
  // 플레이어 손상 표시: 체력이 이 비율 아래면 엔진 연기, 더 낮으면 화재
  playerDamage: { smokeBelow: 0.5, fireBelow: 0.25, every: 0.045, smoke: { life: [0.8, 1.5], size: [1.6, 3.2] }, fire: { life: [0.25, 0.5], size: [0.8, 1.6] } },
  // 추락하는 잔해: 격추된 적기가 불타며 떨어진다
  wreck: { pool: 3, life: 3.4, gravity: 16, drag: 0.35, spin: 2.6, every: 0.035, fire: { life: [0.35, 0.7], size: [2.2, 4.6] }, smoke: { life: [1.2, 2.2], size: [3, 6] } },
  drag: 1.4, // 파티클 감속(1/s)
  // 엔진 불꽃(높음·최고). 길이는 m
  flame: { lengthIdle: 0.9, lengthMil: 2.6, lengthAb: 8.5, diamonds: 5.5, tau: 0.4, igniteTau: 0.12, fadeTau: 0.7 },
  flameColors: {
    player: { core: 0xcfe2ff, mid: 0xffc27a, edge: 0xff5a1e },
    enemy: { core: 0xffd9c9, mid: 0xff6a4a, edge: 0xd61f14 },
  },
};

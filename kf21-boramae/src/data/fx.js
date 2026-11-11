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
    inherit: 0.55, // 폭발이 기체 속도를 이어받는 비율
  },
  playerExplosion: { scale: 1.5 },
  missileHit: { fire: 8, smoke: 5, flash: 30 },
  spark: { count: 4, speed: [20, 60], life: [0.12, 0.3], size: [0.7, 1.4] },
  missileSmoke: { life: [0.7, 1.2], size: [1.6, 3.4] },
  damageSmoke: { life: [0.7, 1.3], size: [2.4, 4.8] },
  muzzleFlash: { life: 0.045, size: 1.6 },
  drag: 1.4, // 파티클 감속(1/s)
  // 엔진 불꽃(높음·최고). 길이는 m
  flame: { lengthIdle: 0.9, lengthMil: 2.6, lengthAb: 8.5, diamonds: 5.5, tau: 0.4, igniteTau: 0.12, fadeTau: 0.7 },
  flameColors: {
    player: { core: 0xcfe2ff, mid: 0xffc27a, edge: 0xff5a1e },
    enemy: { core: 0xffd9c9, mid: 0xff6a4a, edge: 0xd61f14 },
  },
};

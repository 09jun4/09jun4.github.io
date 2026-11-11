// 무장 데이터. 단위: m, m/s, 초, 도. 무장을 추가하려면 여기에 항목을 넣고 LOADOUT에 id를 더한다.
// (새로운 종류의 무장이면 combat/weapon-system.js 의 registerWeapon 으로 type을 등록)
export const WEAPONS = {
  gun: {
    id: 'gun',
    type: 'gun',
    name: '기관포',
    short: 'GUN',
    fireRate: 12, // 발/초
    range: 1200,
    damage: 3,
    heatPerShot: 0.022, // 1발당 과열(1 = 100%). 약 3.8초 연사로 100%
    coolRate: 0.3, // 쏘지 않을 때 초당 냉각
    coolDelay: 0.14, // 마지막 발사 후 냉각이 시작되기까지(발사 간격보다 길어야 한다)
    overheatLock: 2.5, // 과열 시 발사 불가 시간
    hitRadius: 11, // 판정 구 반경의 최소값(m)
    assistAngle: 0.85, // 거리와 무관하게 보장하는 판정 각반경(도): 먼 적도 맞힐 수 있게
    tracer: { speed: 1900, length: 58, width: 0.3 },
    spread: 0.0018, // 예광탄 연출용 산포(rad)
    shake: 0.045,
  },
  missile: {
    id: 'missile',
    type: 'missile',
    name: '미사일',
    short: 'MSL',
    ammo: 5, // 미션당, 보충 없음
    damage: 30,
    speed: 420,
    launchSpeed: 260, // 발사 직후 속도(가속해서 speed에 도달)
    accel: 520,
    turnRate: 90, // 최대 선회(도/초)
    life: 6,
    cooldown: 0.8,
    proximity: 17, // 근접 신관 반경
    lock: {
      radius: 8, // 화면 중심 기준 락온 반경(도)
      time: 2.0, // 추적 유지 시간
      range: 3200, // 락온 가능 거리
    },
    smokeEvery: 0.022,
    dropOffset: 1.3, // 기체 아래로 떨어뜨려 발사
  },
};

/** 플레이어 무장 순서(F키로 순환) */
export const LOADOUT = ['gun', 'missile'];

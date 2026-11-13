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
      time: 0.5, // 추적 유지 시간(락온 완료까지). 처음 2.0초에서 0.5초로 줄였다
      range: 3200, // 락온 가능 거리
    },
    smokeEvery: 0.022,
    dropOffset: 1.3, // 기체 아래로 떨어뜨려 발사
    pool: 6, // 동시에 날아다닐 수 있는 발 수
    visual: { length: 5.2, radius: 0.24 }, // 눈에 띄도록 실물보다 크게
  },
  bomb: {
    id: 'bomb',
    type: 'bomb',
    name: '폭탄',
    short: 'BMB',
    cooldown: 0.5,
    doorTime: 0.15, // 무장창이 열리는 시간(누른 뒤 이만큼 지나 떨어진다). 0.4에서 줄였다
    gravity: 9.8,
    dropOffset: 1.4, // 기체 아래에서 분리
    radius: 60, // 범위 피해 반경(m). 35에서 넓혔다(쉽게)
    aimRadius: 30, // 예측 지점이 목표에서 이 거리 안이면 '투하' 표시(초록)와 자동 투하
    unlimited: true, // 폭탄이 있는 미션에서는 무제한
    damage: 320, // 중심 피해. 명세의 150에서 올렸다: 150이면 hp 150인 레이더가 정확히 맞아야만 부서져서 폭탄이 무력했다
    falloff: 0.6, // 반경 끝에서 피해가 이만큼 줄어든다(0.8 → 중심의 20%)
    blastScale: 1.9,
    pool: 6,
    visual: { length: 2.2, radius: 0.34 },
  },
};

/** 플레이어 무장 순서(F키로 순환) */
export const LOADOUT = ['gun', 'missile', 'bomb']; // F키 순환 순서. 폭탄은 탄이 있는 미션에서만 나온다

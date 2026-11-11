// 미션 데이터. 난이도 차이는 적기 수로만 만든다. 미션을 추가하려면 배열에 항목을 더한다.
// wave.trigger: { type: 'start' } | { type: 'remaining', value: n } (남은 적이 n대 이하가 되면) | { type: 'time', value: 초 }
export const SPAWN = {
  distance: [900, 1400], // 플레이어로부터 등장 거리
  bearing: [52, 82], // 기수 기준 좌/우 각도(도): 전방이지만 시야 밖
  elevation: [-8, 12], // 고도 차 각도(도)
  spacing: 75, // 편대 간격(m)
  waveDelay: 1.6, // 조건 충족 후 등장까지(초)
};

export const MISSIONS = [
  {
    id: 'm1',
    order: 1,
    title: '첫 출격',
    codename: 'OPERATION FIRST LIGHT',
    area: '동해 상공',
    map: { x: 0.68, y: 0.3 },
    summary: '영공으로 접근하는 적 편대를 요격하라.',
    briefing: '정체불명의 전투기 3대가 방공식별구역을 넘었다. 단독으로 출격해 전부 격추하라. 기관포로 충분히 상대할 수 있는 규모다.',
    parTime: 90,
    maxAttackers: 1,
    waves: [
      { count: 3, trigger: { type: 'start' } },
    ],
  },
  {
    id: 'm2',
    order: 2,
    title: '이중 요격',
    codename: 'OPERATION TWIN ARROW',
    area: '남해 상공',
    map: { x: 0.47, y: 0.63 },
    summary: '두 차례로 나뉘어 들어오는 적기를 막아라.',
    briefing: '적기 4대가 두 편대로 나뉘어 시간차로 진입한다. 첫 편대를 정리하는 동안 두 번째 편대가 측면에서 나타난다. 미사일을 아껴 써라.',
    parTime: 120,
    maxAttackers: 2,
    waves: [
      { count: 2, trigger: { type: 'start' } },
      { count: 2, trigger: { type: 'remaining', value: 1 } },
    ],
  },
  {
    id: 'm3',
    order: 3,
    title: '보라매의 하늘',
    codename: 'OPERATION SKY HAWK',
    area: '서해 상공',
    map: { x: 0.24, y: 0.36 },
    summary: '적 주력 편대 5대를 전부 격추하라.',
    briefing: '적 주력 5대가 세 편대로 밀려온다. 수적으로 불리하다. 한 대씩 확실히 끊어 내고, 등 뒤를 내주지 마라. 체력은 회복되지 않는다.',
    parTime: 150,
    maxAttackers: 3,
    waves: [
      { count: 2, trigger: { type: 'start' } },
      { count: 2, trigger: { type: 'remaining', value: 1 } },
      { count: 1, trigger: { type: 'remaining', value: 2 } },
    ],
  },
];

export const missionById = (id) => MISSIONS.find((m) => m.id === id) || null;
export const missionEnemyCount = (m) => m.waves.reduce((s, w) => s + w.count, 0);
export const nextMission = (id) => {
  const i = MISSIONS.findIndex((m) => m.id === id);
  return i >= 0 && i < MISSIONS.length - 1 ? MISSIONS[i + 1] : null;
};

/** 미션 종료 연출 시간(초) */
export const MISSION_FLOW = {
  clearDelay: 1.8, // 마지막 적 격추 후 결과 화면까지
  failDelay: 1.5, // 플레이어 폭발 후 결과 화면까지
};

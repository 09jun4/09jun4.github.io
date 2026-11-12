// 미션 데이터(콘텐츠는 전부 여기에 있다. 엔진은 src/mission/engine.js).
// 스키마: { id, campaign, title, brief(한 줄), briefing(브리핑 본문), timeOfDay, terrain('inland' | 'coast'), refTime(초),
//   weapons: { missile, bomb }, groundTargets: [...], checkpoints: [...], waves: [...], objectives: [...] }
// 좌표는 활주로 시작점 기준 상대 좌표(m)다(기수 방향이 -z). 목표 스키마는 src/mission/engine.js 머리말 참고.
// wave.trigger: { type: 'start' } | { type: 'remaining', value: n } (남은 적이 n대 이하가 되면) | { type: 'time', value: 초 }
export const SPAWN = {
  distance: [900, 1400], // 플레이어로부터 등장 거리
  bearing: [52, 82], // 기수 기준 좌/우 각도(도): 전방이지만 시야 밖
  elevation: [-8, 12], // 고도 차 각도(도)
  spacing: 75, // 편대 간격(m)
  waveDelay: 1.6, // 조건 충족 후 등장까지(초)
};

const RAW = [
  // ── C1 제공권 확보(낮) ──
  {
    id: 'c1m1', campaign: 'c1', title: '첫 출격', codename: 'OPERATION FIRST LIGHT', area: '동해 상공', map: { x: 0.68, y: 0.3 },
    brief: '영공으로 접근하는 적 편대를 요격하라.',
    briefing: '정체불명의 전투기 3대가 방공식별구역을 넘었다. 단독으로 출격해 전부 격추하라. 기관포로 충분히 상대할 수 있는 규모다.',
    timeOfDay: 'day', terrain: 'inland', refTime: 90, maxAttackers: 1, weapons: { missile: 5, bomb: 0 },
    waves: [{ count: 3, trigger: { type: 'start' } }],
    objectives: [{ id: 'o1', type: 'killAir', count: 3, points: 3000, label: '적기 격추' }],
  },
  {
    id: 'c1m2', campaign: 'c1', title: '이중 요격', codename: 'OPERATION TWIN ARROW', area: '남해 상공', map: { x: 0.47, y: 0.63 },
    brief: '두 차례로 나뉘어 들어오는 적기를 막아라.',
    briefing: '적기 4대가 두 편대로 나뉘어 시간차로 진입한다. 첫 편대를 정리하는 동안 두 번째 편대가 측면에서 나타난다. 미사일을 아껴 써라.',
    timeOfDay: 'day', terrain: 'inland', refTime: 120, maxAttackers: 2, weapons: { missile: 5, bomb: 0 },
    waves: [{ count: 2, trigger: { type: 'start' } }, { count: 2, trigger: { type: 'remaining', value: 1 } }],
    objectives: [{ id: 'o1', type: 'killAir', count: 4, points: 4000, label: '적기 격추' }],
  },
  {
    id: 'c1m3', campaign: 'c1', title: '보라매의 하늘', codename: 'OPERATION SKY HAWK', area: '서해 상공', map: { x: 0.24, y: 0.36 },
    brief: '적 주력 편대 5대를 전부 격추하라.',
    briefing: '적 주력 5대가 세 편대로 밀려온다. 수적으로 불리하다. 한 대씩 확실히 끊어 내고, 등 뒤를 내주지 마라. 체력은 회복되지 않는다.',
    timeOfDay: 'day', terrain: 'inland', refTime: 150, maxAttackers: 3, weapons: { missile: 5, bomb: 0 },
    waves: [{ count: 2, trigger: { type: 'start' } }, { count: 2, trigger: { type: 'remaining', value: 1 } }, { count: 1, trigger: { type: 'remaining', value: 2 } }],
    objectives: [{ id: 'o1', type: 'killAir', count: 5, points: 5000, label: '적기 격추' }],
  },
  // ── C2 새벽 타격(새벽) ──
  {
    id: 'c2m1', campaign: 'c2', title: '눈을 멀게 하라', codename: 'OPERATION BLIND EYE', area: '내륙 방공 기지', map: { x: 0.55, y: 0.25 },
    brief: '레이더 2기를 폭격하고 대공포를 제압하라.',
    briefing: '동이 트기 전에 적 방공 레이더 2기를 파괴한다. 레이더 옆에 대공포 2문이 있다. 폭탄은 6발, F키로 무장을 바꾸고 지면의 예측 지점을 목표에 맞춰 떨어뜨려라. 대공포는 기관포로도 부술 수 있다.',
    timeOfDay: 'dawn', terrain: 'inland', refTime: 150, weapons: { missile: 5, bomb: 6 },
    groundTargets: [
      { id: 'r1', type: 'radar', pos: [-900, -7200] }, { id: 'r2', type: 'radar', pos: [1100, -7900] },
      { type: 'aa_gun', near: 'r1', count: 1 }, { type: 'aa_gun', near: 'r2', count: 1 },
    ],
    waves: [],
    objectives: [
      { id: 'o1', type: 'destroy', targetType: 'radar', count: 2, points: 1400, label: '레이더 파괴' },
      { id: 'o2', type: 'destroy', targetType: 'aa_gun', count: 2, points: 800, required: false, label: '대공포 제압' },
    ],
  },
];

/** 기본값 채우기: 캠페인 안 순번(order), 이전 코드가 읽는 이름(summary, parTime), 편대의 at → 시간 조건 */
function define(list) {
  const seen = {};
  return list.map((m) => {
    seen[m.campaign] = (seen[m.campaign] || 0) + 1;
    const waves = (m.waves || []).map((w) => ({ ...w, count: w.count ?? w.flight, trigger: w.trigger || (w.at ? { type: 'time', value: w.at } : { type: 'start' }) }));
    return { groundTargets: [], checkpoints: [], maxAttackers: 2, ...m, waves, order: seen[m.campaign], summary: m.brief, parTime: m.refTime, weapons: { missile: 5, bomb: 0, ...(m.weapons || {}) } };
  });
}

export const MISSIONS = define(RAW);

/** 이전 버전의 미션 ID(저장·주소·랭킹 이식용) */
export const LEGACY_MISSION_IDS = { m1: 'c1m1', m2: 'c1m2', m3: 'c1m3' };

export const missionById = (id) => MISSIONS.find((m) => m.id === id) || MISSIONS.find((m) => m.id === LEGACY_MISSION_IDS[id]) || null;
export const missionsOf = (campaignId) => MISSIONS.filter((m) => m.campaign === campaignId);
/** 전투기 편대의 적기 수(HUD의 남은 적기 표시용) */
export const missionEnemyCount = (m) => m.waves.reduce((s, w) => s + w.count, 0);
/** 같은 캠페인의 다음 미션(마지막이면 null) */
export const nextMission = (id) => {
  const m = missionById(id);
  if (!m) return null;
  const list = missionsOf(m.campaign);
  const i = list.indexOf(m);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
};

/** 미션 종료 연출 시간(초) */
export const MISSION_FLOW = {
  clearDelay: 1.8, // 마지막 적 격추 후 결과 화면까지
  failDelay: 1.5, // 플레이어 폭발 후 결과 화면까지
};

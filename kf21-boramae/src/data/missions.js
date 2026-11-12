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
  // ── C3 해상 방어(저녁, 해안) ──
  {
    id: 'c3m1', campaign: 'c3', title: '빈손으로 돌려보내라', codename: 'OPERATION EMPTY HANDS', area: '동쪽 해안', map: { x: 0.74, y: 0.48 },
    brief: '수송기 3대가 해안을 벗어나기 전에 전부 격추하라.',
    briefing: '적 수송기 3대가 해안선을 따라 서쪽으로 빠져나가고 있다. 무장은 없지만 한 대라도 놓치면 임무는 실패다. 느리고 크니 미사일로 확실히 잡아라.',
    timeOfDay: 'dusk', terrain: 'coast', refTime: 120, weapons: { missile: 5, bomb: 0 },
    waves: [{ count: 3, role: 'transport', at: 0, from: [5200, 1500, -7000], to: [-16000, -7600] }],
    objectives: [{ id: 'o1', type: 'intercept', role: 'transport', count: 3, points: 2100, label: '수송기 격추' }],
  },
  {
    id: 'c3m4', campaign: 'c3', title: '해안선을 따라', codename: 'OPERATION SHORELINE', area: '동쪽 해안', map: { x: 0.8, y: 0.6 },
    brief: '해안 정찰 경로의 체크포인트 6곳을 순서대로 통과하라.',
    briefing: '해안선을 따라 정찰 경로를 비행한다. 초록 고리 6개를 순서대로 통과하라. 도중에 요격기 3대가 올라온다. 싸워도 되고 따돌려도 된다.',
    timeOfDay: 'dusk', terrain: 'coast', refTime: 180, weapons: { missile: 5, bomb: 0 }, maxAttackers: 2,
    checkpoints: [[-600, 700, -5200], [1500, 900, -7600], [4200, 800, -8600], [6400, 1100, -6600], [5200, 900, -3600], [2400, 700, -2200]],
    waves: [{ count: 3, at: 45, personality: ['aggressive', 'evasive', 'aggressive'] }],
    objectives: [
      { id: 'o1', type: 'checkpoints', count: 6, points: 2400, timeLimit: 240, label: '체크포인트 통과' },
      { id: 'o2', type: 'killAir', count: 3, points: 3000, required: false, label: '요격기 격추' },
    ],
  },
  // ── C1 4번째: 시간제한 요격 ──
  {
    id: 'c1m4', campaign: 'c1', title: '연속 요격', codename: 'OPERATION RELAY', area: '중부 상공', map: { x: 0.5, y: 0.42 },
    brief: '150초 안에 연달아 들어오는 적기 8대를 격추하라.',
    briefing: '적기가 두 대씩 쉬지 않고 들어온다. 150초 안에 8대를 격추해야 한다. 락온을 걸면 급선회로 빠져나가는 기체가 섞여 있다. 미사일은 확실할 때만 쏴라.',
    timeOfDay: 'day', terrain: 'inland', refTime: 150, weapons: { missile: 6, bomb: 0 }, maxAttackers: 2,
    waves: [{ count: 2, trigger: { type: 'start' }, personality: ['aggressive', 'evasive'] }, { count: 2, repeat: 3, trigger: { type: 'remaining', value: 1 }, personality: ['aggressive', 'evasive'] }],
    objectives: [{ id: 'o1', type: 'timedKill', count: 8, points: 8000, timeLimit: 150, label: '적기 격추' }],
  },
  // ── C5 마지막: 보스 ──
  {
    id: 'c5m3', campaign: 'c5', title: '마지막 한 대', codename: 'OPERATION LAST ACE', area: '북쪽 상공', map: { x: 0.42, y: 0.14 },
    brief: '적 에이스를 격추하라. 호위 2기가 함께 온다.',
    briefing: '적 에이스가 호위 2기와 함께 올라온다. 체력이 줄수록 움직임이 달라진다. 처음에는 정면으로 덤비고, 다음에는 빠져나가며 시간을 끌고, 마지막에는 쉬지 않고 쏜다. 호위는 선택 목표다.',
    timeOfDay: 'night', terrain: 'inland', refTime: 240, weapons: { missile: 6, bomb: 0 }, maxAttackers: 2,
    waves: [{ count: 1, role: 'boss', trigger: { type: 'start' } }, { count: 2, at: 4, personality: 'flanker' }],
    objectives: [{ id: 'o1', type: 'boss', points: 3000, label: '에이스 격추' }, { id: 'o2', type: 'killAir', count: 2, points: 2000, required: false, label: '호위기 격추' }],
  },
  {
    id: 'c2m2', campaign: 'c2', title: '침묵의 기지국', codename: 'OPERATION DEAD AIR', area: '내륙 통신 거점', map: { x: 0.6, y: 0.34 },
    brief: '기지국 3기를 폭격해 적의 통신을 끊어라.',
    briefing: '적 통신 기지국 3기가 능선을 따라 늘어서 있다. 기지국은 단단해서 기관포가 통하지 않는다. 가까이 떨어뜨리면 한 발, 빗나가면 두 발이 든다. 60초쯤 요격기 2대가 올라온다(선택 목표).',
    timeOfDay: 'dawn', terrain: 'inland', refTime: 180, weapons: { missile: 5, bomb: 8 },
    groundTargets: [{ id: 't1', type: 'comm_tower', pos: [-1500, -7000] }, { id: 't2', type: 'comm_tower', pos: [200, -8100] }, { id: 't3', type: 'comm_tower', pos: [1900, -7300] }, { type: 'aa_gun', near: 't2', count: 1 }],
    waves: [{ count: 2, at: 60, personality: 'aggressive' }],
    objectives: [{ id: 'o1', type: 'destroy', targetType: 'comm_tower', count: 3, points: 2400, label: '기지국 파괴' }, { id: 'o2', type: 'killAir', count: 2, points: 2000, required: false, label: '요격기 격추' }],
  },
  {
    id: 'c2m3', campaign: 'c2', title: '호송대 차단', codename: 'OPERATION ROADBLOCK', area: '내륙 보급로', map: { x: 0.66, y: 0.42 },
    brief: '이동하는 보급 트럭 8대를 파괴하라.',
    briefing: '보급 트럭 8대가 두 줄로 도로를 달리고 있다. 트럭은 기관포로도 부술 수 있지만 폭탄 한 발이면 여러 대가 함께 날아간다. 길가에 대공포 3문이 있다.',
    timeOfDay: 'dawn', terrain: 'inland', refTime: 200, weapons: { missile: 5, bomb: 8 },
    groundTargets: [
      ...[0, 1, 2, 3].map((i) => ({ type: 'truck', pos: [-2600 + i * 60, -6800], path: [[2600 + i * 60, -6800], [-2600 + i * 60, -6800]] })),
      ...[0, 1, 2, 3].map((i) => ({ type: 'truck', pos: [2400 - i * 60, -7700], path: [[-2400 - i * 60, -7700], [2400 - i * 60, -7700]] })),
      { type: 'aa_gun', pos: [-1200, -7250] }, { type: 'aa_gun', pos: [300, -7250] }, { type: 'aa_gun', pos: [1700, -7250] },
    ],
    waves: [],
    objectives: [{ id: 'o1', type: 'destroy', targetType: 'truck', count: 8, points: 2000, label: '트럭 파괴' }, { id: 'o2', type: 'destroy', targetType: 'aa_gun', count: 3, points: 1200, required: false, label: '대공포 제압' }],
  },
  {
    id: 'c3m2', campaign: 'c3', title: '초계함 격침', codename: 'OPERATION BROADSIDE', area: '동쪽 앞바다', map: { x: 0.82, y: 0.4 },
    brief: '해안으로 접근하는 초계함 3척을 격침하라.',
    briefing: '대공포 2문씩을 실은 초계함 3척이 해안으로 다가온다. 한 척에 폭탄 두 발이 든다. 배는 움직이니 예측 지점을 뱃머리 앞에 두고 떨어뜨려라. 낮게 오래 머물면 대공포에 맞는다.',
    timeOfDay: 'dusk', terrain: 'coast', refTime: 200, weapons: { missile: 5, bomb: 8 },
    groundTargets: [
      { type: 'patrol_boat', pos: [-1800, -7600], path: [[1200, -7400], [-1800, -7600]] },
      { type: 'patrol_boat', pos: [600, -8800], path: [[-2000, -8600], [600, -8800]] },
      { type: 'patrol_boat', pos: [2600, -7000], path: [[2600, -9400], [2600, -7000]] },
    ],
    waves: [],
    objectives: [{ id: 'o1', type: 'destroy', targetType: 'patrol_boat', count: 3, points: 3000, label: '초계함 격침' }],
  },
  {
    id: 'c3m3', campaign: 'c3', title: '폭격기 요격', codename: 'OPERATION UMBRELLA', area: '동쪽 해안', map: { x: 0.7, y: 0.56 },
    brief: '기지를 향하는 폭격기 4대를 도달 전에 격추하라.',
    briefing: '폭격기 4대가 바다를 건너 우리 기지로 온다. 한 대라도 기지에 닿으면 실패다. 폭격기는 튼튼해서 미사일 한 발로는 떨어지지 않는다. 호위 2기는 선택 목표다.',
    timeOfDay: 'dusk', terrain: 'coast', refTime: 180, weapons: { missile: 6, bomb: 0 }, maxAttackers: 2,
    waves: [{ count: 4, role: 'bomber', at: 0, from: [-2500, 1700, -21000], to: [0, -1200] }, { count: 2, at: 20, personality: 'aggressive' }],
    objectives: [{ id: 'o1', type: 'intercept', role: 'bomber', count: 4, points: 3600, label: '폭격기 격추' }, { id: 'o2', type: 'killAir', count: 2, points: 2000, required: false, label: '호위기 격추' }],
  },
  // ── C4 야간 침투(야간) ──
  {
    id: 'c4m1', campaign: 'c4', title: '낮게, 조용히', codename: 'OPERATION LOW ROAD', area: '북쪽 계곡', map: { x: 0.36, y: 0.22 },
    brief: '저고도 침투 경로의 체크포인트 6곳을 통과하라.',
    briefing: '방공망 아래로 파고든다. 고리 6개가 낮게 놓여 있고 경로 옆에 대공포가 있다. 한곳에 머물지 말고 계속 방향을 바꿔라. 붉은 점이 목표물의 경고등이다.',
    timeOfDay: 'night', terrain: 'inland', refTime: 200, weapons: { missile: 5, bomb: 0 },
    checkpoints: [[0, 420, -4200], [-1800, 380, -6200], [-600, 350, -8200], [1800, 400, -8600], [3000, 380, -6400], [1600, 450, -3800]],
    groundTargets: [{ type: 'aa_gun', pos: [-900, -5300] }, { type: 'aa_gun', pos: [-1500, -7400] }, { type: 'aa_gun', pos: [700, -8700] }, { type: 'aa_gun', pos: [2700, -7500] }],
    waves: [],
    objectives: [{ id: 'o1', type: 'checkpoints', count: 6, points: 3000, timeLimit: 260, label: '체크포인트 통과' }],
  },
  {
    id: 'c4m2', campaign: 'c4', title: '방공망 제압', codename: 'OPERATION WILD WEASEL', area: '북쪽 방공 진지', map: { x: 0.3, y: 0.3 },
    brief: 'SAM 발사대 3기와 대공포 2문을 제압하라.',
    briefing: 'SAM 3기가 4km 밖에서부터 미사일을 쏜다. 경고가 뜨면 급선회하라. 미사일은 우리보다 크게 돈다. 발사 간격은 8초다. 그 틈에 파고들어 폭탄을 떨어뜨려라.',
    timeOfDay: 'night', terrain: 'inland', refTime: 220, weapons: { missile: 5, bomb: 8 },
    groundTargets: [{ id: 's1', type: 'sam', pos: [-1700, -7400] }, { id: 's2', type: 'sam', pos: [100, -8300] }, { id: 's3', type: 'sam', pos: [1900, -7500] }, { type: 'aa_gun', near: 's1', count: 1 }, { type: 'aa_gun', near: 's3', count: 1 }],
    waves: [],
    objectives: [{ id: 'o1', type: 'destroy', targetType: 'sam', count: 3, points: 1800, label: 'SAM 제압' }, { id: 'o2', type: 'destroy', targetType: 'aa_gun', count: 2, points: 800, label: '대공포 제압' }],
  },
  {
    id: 'c4m3', campaign: 'c4', title: '4분', codename: 'OPERATION FOUR MINUTES', area: '북쪽 지휘 거점', map: { x: 0.26, y: 0.2 },
    brief: '240초 안에 기지국 2기와 레이더 2기를 파괴하라.',
    briefing: '지원 병력이 오기까지 4분이다. 그 안에 기지국 2기와 레이더 2기를 모두 부숴야 한다. 폭탄은 8발, 목표는 넷. 빗나갈 여유가 많지 않다.',
    timeOfDay: 'night', terrain: 'inland', refTime: 200, timeLimit: 240, weapons: { missile: 5, bomb: 8 },
    groundTargets: [{ id: 't1', type: 'comm_tower', pos: [-1300, -7000] }, { id: 't2', type: 'comm_tower', pos: [1500, -7200] }, { id: 'r1', type: 'radar', pos: [-300, -8300] }, { id: 'r2', type: 'radar', pos: [2500, -8400] }, { type: 'aa_gun', near: 'r1', count: 1 }, { type: 'sam', pos: [900, -9300] }],
    waves: [],
    objectives: [{ id: 'o1', type: 'destroy', targetType: 'comm_tower', count: 2, points: 1600, label: '기지국 파괴' }, { id: 'o2', type: 'destroy', targetType: 'radar', count: 2, points: 1400, label: '레이더 파괴' }],
  },
  {
    id: 'c4m4', campaign: 'c4', title: '밤의 방패', codename: 'OPERATION NIGHT SHIELD', area: '북쪽 상공', map: { x: 0.4, y: 0.28 },
    brief: '폭격기 3대와 측후방으로 파고드는 호위 3기를 요격하라.',
    briefing: '야간 폭격 편대다. 폭격기 3대가 기지로 오고, 호위 3기는 한 대가 정면에서 끄는 동안 나머지가 뒤로 돌아 들어온다. 뒤를 자주 확인하라.',
    timeOfDay: 'night', terrain: 'inland', refTime: 200, weapons: { missile: 6, bomb: 0 }, maxAttackers: 2,
    waves: [{ count: 3, role: 'bomber', at: 0, from: [2600, 1800, -22000], to: [0, -1200] }, { count: 3, at: 15, personality: 'flanker' }],
    objectives: [{ id: 'o1', type: 'intercept', role: 'bomber', count: 3, points: 2700, label: '폭격기 격추' }, { id: 'o2', type: 'killAir', count: 3, points: 3000, required: false, label: '호위기 격추' }],
  },
  // ── C5 최종 작전(저녁 → 야간) ──
  {
    id: 'c5m1', campaign: 'c5', title: '문을 열어라', codename: 'OPERATION OPEN DOOR', area: '북쪽 방어선', map: { x: 0.46, y: 0.2 },
    brief: '방공망(SAM 2, 대공포 3)을 제압한 뒤 기지국 2기를 파괴하라.',
    briefing: '먼저 SAM 2기와 대공포 3문을 제압해 길을 연다. 그 다음에야 기지국 2기가 목표로 열린다. 폭탄은 10발. 방공망을 부수는 데 너무 많이 쓰면 기지국에 쓸 폭탄이 모자란다. 대공포는 기관포로 처리하라.',
    timeOfDay: 'dusk', terrain: 'inland', refTime: 260, weapons: { missile: 5, bomb: 10 },
    groundTargets: [{ id: 's1', type: 'sam', pos: [-1500, -6900] }, { id: 's2', type: 'sam', pos: [1500, -6900] }, { type: 'aa_gun', pos: [-700, -7500] }, { type: 'aa_gun', pos: [700, -7500] }, { type: 'aa_gun', pos: [0, -8100] }, { id: 't1', type: 'comm_tower', pos: [-900, -8800] }, { id: 't2', type: 'comm_tower', pos: [900, -8800] }],
    waves: [],
    objectives: [
      { id: 'o1', type: 'destroy', targetType: 'sam', count: 2, points: 1200, label: 'SAM 제압' },
      { id: 'o2', type: 'destroy', targetType: 'aa_gun', count: 3, points: 1200, label: '대공포 제압' },
      { id: 'o3', type: 'destroy', targetType: 'comm_tower', count: 2, points: 1600, after: ['o1', 'o2'], label: '기지국 파괴' },
    ],
  },
  {
    id: 'c5m2', campaign: 'c5', title: '하늘이 가득하다', codename: 'OPERATION FULL SKY', area: '북쪽 상공', map: { x: 0.5, y: 0.16 },
    brief: '220초 안에 적기 10대를 격추하고, 수송기 2대가 빠져나가지 못하게 하라.',
    briefing: '적기가 두세 대씩 계속 들어오는 동안 수송기 2대가 그 틈으로 빠져나가려 한다. 220초 안에 10대를 격추하고 수송기도 모두 잡아야 한다. 수송기부터 처리하는 편이 안전하다.',
    timeOfDay: 'night', terrain: 'inland', refTime: 220, weapons: { missile: 8, bomb: 0 }, maxAttackers: 2,
    waves: [
      { count: 2, role: 'transport', at: 0, from: [6500, 1400, -6500], to: [-17000, -9000] },
      { count: 2, trigger: { type: 'start' }, personality: ['aggressive', 'evasive'] },
      { count: 2, repeat: 4, trigger: { type: 'remaining', value: 3 }, personality: ['aggressive', 'flanker'] },
    ],
    objectives: [{ id: 'o1', type: 'timedKill', count: 10, points: 10000, timeLimit: 220, label: '적기 격추' }, { id: 'o2', type: 'intercept', role: 'transport', count: 2, points: 1400, label: '수송기 격추' }],
  },
];

/** 기본값 채우기: 캠페인 안 순번(order), 이전 코드가 읽는 이름(summary, parTime), 편대의 at → 시간 조건 */
function define(list) {
  const seen = {};
  return list.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((m) => { // 캠페인·순번 순으로 정렬
    seen[m.campaign] = (seen[m.campaign] || 0) + 1;
    // repeat: 같은 편대를 여러 번(시간제한 요격의 연속 등장). 편대의 at → 시간 조건
    const waves = (m.waves || []).flatMap((w) => Array.from({ length: w.repeat || 1 }, () => ({ ...w, count: w.count ?? w.flight, trigger: w.trigger || (w.at != null ? { type: 'time', value: w.at } : { type: 'start' }) })));
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

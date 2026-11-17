// real-data.js — data for the 리얼리스틱 (realistic) mode: teams and drivers
// (fictional), tyre compounds, 2026-style power unit / aero numbers, points,
// real race distances per circuit, calendar, weather and AI levels.
// Nothing here runs by itself; real-physics.js / real-race.js use it.
// Load order: after cars.js and race.js. Depends on: Cars (formulaModel), Race (DRIVERS).
(function () {
  'use strict';
  window.CR = window.CR || {};

  // Ten teams x two drivers. The first five reuse the AI 대전 teams; the
  // player's own team ('you') gets an AI team-mate. perf: car pace factor
  // (1 = best car; lap time multiplier), all fictional.
  var TEAMS = [
    { id: 'vel', name: '벨로시타', main: '#c8102e', dark: '#5e0816', accent: '#f4f7ff', perf: 1.000 },
    { id: 'aur', name: '오로라', main: '#0fa3a3', dark: '#06403f', accent: '#ff8a1f', perf: 1.003 },
    { id: 'nor', name: '노르트리히트', main: '#c5cad3', dark: '#2a2e35', accent: '#18c0e8', perf: 1.005 },
    { id: 'ble', name: '블뢰', main: '#1f4fd1', dark: '#0d214f', accent: '#ffd23f', perf: 1.008 },
    { id: 'ver', name: '베르데', main: '#1e9a52', dark: '#0b3b20', accent: '#f4f7ff', perf: 1.011 },
    { id: 'sol', name: '솔라리스', main: '#ff7a00', dark: '#5a2a00', accent: '#101318', perf: 1.013 },
    { id: 'kai', name: '카이로스', main: '#7a4bd1', dark: '#2b1752', accent: '#f4f7ff', perf: 1.016 },
    { id: 'rou', name: '루즈 누아', main: '#141414', dark: '#050505', accent: '#e8344a', perf: 1.019 },
    { id: 'mar', name: '마레아', main: '#e86aa6', dark: '#5c1f3d', accent: '#141414', perf: 1.022 },
    { id: 'you', name: '내 팀', main: null, dark: null, accent: null, perf: 1.010, player: true },
  ];

  // Drivers: code, name, team, skill (lap multiplier, smaller = faster),
  // number. The five AI 대전 drivers keep their ids (and AI 대전 liveries).
  var DRIVERS = [
    { id: 'vas', code: 'VAS', name: '레온 바스케스', team: 'vel', skill: 0.998, num: 16 },
    { id: 'kra', code: 'KRA', name: '토비아스 크라머', team: 'vel', skill: 1.003, num: 5 },
    { id: 'hol', code: 'HOL', name: '마커스 홀트', team: 'aur', skill: 0.999, num: 8 },
    { id: 'ril', code: 'RIL', name: '사샤 릴리엔', team: 'aur', skill: 1.004, num: 30 },
    { id: 'nak', code: 'NAK', name: '카이 나카무라', team: 'nor', skill: 1.000, num: 22 },
    { id: 'eri', code: 'ERI', name: '닐스 에릭손', team: 'nor', skill: 1.003, num: 44 },
    { id: 'mor', code: 'MOR', name: '엘리 모로', team: 'ble', skill: 1.001, num: 31 },
    { id: 'duv', code: 'DUV', name: '쥘 뒤발', team: 'ble', skill: 1.004, num: 10 },
    { id: 'san', code: 'SAN', name: '디에고 산토스', team: 'ver', skill: 1.001, num: 12 },
    { id: 'pem', code: 'PEM', name: '오언 펨버튼', team: 'ver', skill: 1.005, num: 18 },
    { id: 'alv', code: 'ALV', name: '마테오 알바레스', team: 'sol', skill: 1.000, num: 7 },
    { id: 'hay', code: 'HAY', name: '리오 하야시', team: 'sol', skill: 1.004, num: 2 },
    { id: 'pet', code: 'PET', name: '이반 페트로프', team: 'kai', skill: 1.002, num: 27 },
    { id: 'lun', code: 'LUN', name: '아다 룬드', team: 'kai', skill: 1.006, num: 3 },
    { id: 'bel', code: 'BEL', name: '앙투안 벨몽', team: 'rou', skill: 1.002, num: 11 },
    { id: 'car', code: 'CAR', name: '루카 카라치', team: 'rou', skill: 1.006, num: 23 },
    { id: 'ozt', code: 'OZT', name: '데니즈 외즈튀르크', team: 'mar', skill: 1.003, num: 63 },
    { id: 'kim', code: 'KIM', name: '김도윤', team: 'mar', skill: 1.007, num: 77 },
    { id: 'fox', code: 'FOX', name: '윌 폭스', team: 'you', skill: 1.003, num: 4, mate: true },
  ];
  var PLAYER = { id: 'you', code: 'YOU', name: '나', team: 'you', skill: 1, num: 1, isPlayer: true };

  // Tyre compounds. grip: dry grip factor (fresh, warm); life: laps to 100 %
  // wear at full race distance; wet: grip curve over track wetness (0..1).
  var TYRES = {
    S: { id: 'S', name: '소프트', color: '#e8344a', grip: 1.000, life: 18 },
    M: { id: 'M', name: '미디엄', color: '#ffd23f', grip: 0.986, life: 28 },
    H: { id: 'H', name: '하드', color: '#f4f4f4', grip: 0.972, life: 40 },
    I: { id: 'I', name: '인터미디엇', color: '#2fbf71', grip: 0.870, life: 30, wet: 'inter' },
    W: { id: 'W', name: '풀 웨트', color: '#1f4fd1', grip: 0.830, life: 35, wet: 'wet' },
  };

  // Real race distances (laps) and the season calendar order (circuit ids =
  // Tracks realName). Straight Mode zones are found from each track.
  var LAPS = {
    'Autodromo Nazionale Monza': 53, 'Suzuka International Racing Course': 53, 'Las Vegas Street Circuit': 50,
    'Circuit de Spa-Francorchamps': 44, 'Silverstone Circuit': 52, 'Autódromo José Carlos Pace': 71,
  };
  var CALENDAR = ['Suzuka International Racing Course', 'Silverstone Circuit', 'Circuit de Spa-Francorchamps',
    'Autodromo Nazionale Monza', 'Autódromo José Carlos Pace', 'Las Vegas Street Circuit'];
  var RAIN_CHANCE = { // per weekend, for 날씨: 자동
    'Autodromo Nazionale Monza': 0.15, 'Suzuka International Racing Course': 0.3, 'Las Vegas Street Circuit': 0.03,
    'Circuit de Spa-Francorchamps': 0.45, 'Silverstone Circuit': 0.4, 'Autódromo José Carlos Pace': 0.35,
  };

  var LENGTHS = [
    { id: 10, name: '10%', desc: '짧은 레이스' },
    { id: 25, name: '25%', desc: '피트스톱 1회 안팎' },
    { id: 50, name: '50%', desc: '1~2회 피트스톱' },
    { id: 100, name: '100%', desc: '실제 레이스 거리' },
  ];
  var WEATHER = [
    { id: 'auto', name: '자동', desc: '서킷별 실제 확률로 비' },
    { id: 'dry', name: '맑음', desc: '비 없음' },
    { id: 'mixed', name: '변덕', desc: '레이스 중 비가 오다 그침' },
    { id: 'wet', name: '비', desc: '처음부터 젖은 노면' },
  ];
  // AI level: lap time multiplier over the ideal lap of the realistic car.
  var LEVELS = [
    { id: 'amateur', name: '아마추어', factor: 1.07 },
    { id: 'normal', name: '보통', factor: 1.04 },
    { id: 'pro', name: '프로', factor: 1.02 },
    { id: 'legend', name: '레전드', factor: 1.005 },
  ];

  CR.RealData = {
    TEAMS: TEAMS, DRIVERS: DRIVERS, PLAYER: PLAYER, TYRES: TYRES, LAPS: LAPS, CALENDAR: CALENDAR,
    RAIN_CHANCE: RAIN_CHANCE, LENGTHS: LENGTHS, WEATHER: WEATHER, LEVELS: LEVELS,
    POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    // 2026-style car (per car, SI units)
    CAR: {
      MASS: 768, // kg incl. driver, no fuel
      FUEL_FULL: 70, // kg for a full race distance
      CLA: 4.1, CLA_STRAIGHT: 2.4, // downforce area (corner / straight mode)
      CDA: 1.12, CDA_STRAIGHT: 0.74, // drag area
      TYRE_MU: 1.9, // dry slick peak friction
      BRAKE_MAX_G: 5.9,
      ICE_PEAK_KW: 400,
      MGUK_KW: 350, MGUK_STD_KW: 190, // full / sustainable deployment
      TAPER_FROM: 290 / 3.6, TAPER_TO: 345 / 3.6, // electrical power fades above 290 km/h
      OT_TO: 337 / 3.6, OT_ZERO: 355 / 3.6, // Overtake Mode keeps 350 kW to 337 km/h
      BATTERY_MJ: 4, OT_MJ: 0.5,
      HARVEST_KW: 350, COAST_KW: 70,
      PIT_LIMIT: 80 / 3.6,
    },
    team: function (id) { for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].id === id) return TEAMS[i]; return TEAMS[TEAMS.length - 1]; },
    tyre: function (id) { return TYRES[id] || TYRES.M; },
  };

  // Liveries: one model per AI driver (team-mates share colours, not objects:
  // the 3D renderer keeps one car per model). The player's team uses the
  // player's own F1 colours.
  CR.RealData.buildModels = function () {
    var f1 = CR.Cars.byId('f1'), po = (f1.model && f1.model.opts) || { main: '#16181d', dark: '#0b0c0f', accent: '#d4a82a' };
    DRIVERS.forEach(function (d) {
      if (d.model) return;
      var t = CR.RealData.team(d.team);
      var main = t.player ? po.main : t.main, dark = t.player ? po.dark : t.dark, accent = t.player ? po.accent : t.accent;
      d.main = main; d.dark = dark; d.accent = accent; d.color = main;
      d.model = CR.Cars.formulaModel({ main: main, dark: dark, accent: accent, helmet: accent, pod: 0.62, wing: 1.0, rearWing: 1.0, halo: true, fin: true });
    });
  };
  // Safety car: a silver GT coupe with a roof light bar (renderer.js parts;
  // the 높음 renderer builds its own GT body from opts.gt, hi-car.js createGT).
  var scModel = null;
  CR.RealData.safetyCarModel = function () {
    if (scModel) return scModel;
    var silver = '#c9ced6', dark = '#1a2028', rim = '#b9bec6';
    scModel = [
      { wheel: [0.82, -1.4, 0.28, 0.34], rim: rim, stripe: rim },
      { wheel: [-0.82, -1.4, 0.28, 0.34], rim: rim, stripe: rim },
      { wheel: [0.82, 1.42, 0.28, 0.34], front: true, rim: rim, stripe: rim },
      { wheel: [-0.82, 1.42, 0.28, 0.34], front: true, rim: rim, stripe: rim },
      { prism: [[0, 2.34], [0.6, 2.28], [0.95, 1.9], [0.98, -1.9], [0.88, -2.25], [0, -2.34], [-0.88, -2.25], [-0.98, -1.9], [-0.95, 1.9], [-0.6, 2.28]],
        z: [0.2, 0.9], taper: 0.94, color: silver },
      { decal: { rect: [0, 1.65, 1.3, 0.1], fill: '#1fbf5f' } },
      { prism: [[0.72, 1.0], [0.66, -1.5], [-0.66, -1.5], [-0.72, 1.0]], z: [0.9, 1.22], taper: 0.78, color: dark, top: silver },
      { box: [0, -0.3, 1.1, 0.24], z: [1.22, 1.31], color: '#ff9a1a' },
      { box: [0, -2.12, 1.7, 0.28], z: [0.98, 1.02], color: '#0d0f12' },
    ];
    scModel.opts = { gt: true, main: silver, dark: '#2a2f36', accent: '#1fbf5f' };
    return scModel;
  };
  CR.RealData.driver = function (id) {
    if (id === 'you') return PLAYER;
    for (var i = 0; i < DRIVERS.length; i++) if (DRIVERS[i].id === id) return DRIVERS[i];
    return null;
  };
})();

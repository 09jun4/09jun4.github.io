// 플레이어 기체 데이터. 단위: m, m/s, 도(°), 초. 코드에서는 여기 값만 읽는다.
export const KF21 = {
  id: 'kf21',
  name: 'KF-21 보라매',
  hp: 100,
  hitRadius: 9, // 적 탄·충돌 판정 반경(m)

  speed: { cruise: 160, min: 120, max: 220 },

  rates: {
    pitchMax: 55, // 최대 피치 각속도(°/s)
    yawMax: 45, // 최대 선회(요) 각속도(°/s)
    rollMax: 60, // 선회 때 시각 롤 최대(°)
    pitchLimit: 75, // 피치 한계(°): 수직 넘어가는 기동은 없다
  },

  // 입력 → 각속도 반응(지수 감쇠 시상수, 초). 작을수록 즉각적이다.
  response: {
    pitchTau: 0.1,
    yawTau: 0.14,
    releaseTau: 0.22, // 입력을 놓았을 때
    rollTau: 0.3, // 시각 롤이 선회를 따라가는 속도
  },

  // 입력이 없을 때 서서히 수평으로
  autoLevel: {
    pitchGain: 0.55, // 피치 오차 1rad당 복귀 각속도(rad/s)
    pitchMaxRate: 12, // 복귀 각속도 상한(°/s)
  },

  // 속도 변화(가속도 m/s²)
  energy: {
    g: 9.81,
    speedSpring: 0.16, // 순항속도로 돌아가려는 정도(1/s)
    gravityFactor: 0.95, // 상승 감속·하강 가속에 중력이 반영되는 비율
    turnDrag: 3.4, // 최대 선회 때 감속(m/s²)
    pitchDrag: 1.6, // 최대 피치 기동 때 감속(m/s²)
  },

  // 자세·속도에 따른 선회 성능 변화(소폭)
  turn: {
    cornerSpeed: 150, // 가장 잘 도는 속도
    speedPenalty: 0.22, // 속도가 한쪽 끝일 때 선회율 감소 비율
    pitchPenalty: 0.18, // 기수를 많이 들거나 숙였을 때 선회율 감소 비율
  },

  // 속도 하한 근처(실속 영역): 죽지 않고 기수가 숙여지며 속도를 회복한다
  stall: {
    margin: 16, // 최소 속도 + margin 아래부터 영향
    authorityLoss: 0.85, // 기수 올림 권한 감소 비율
    noseDropRate: 20, // 기수가 숙여지는 각속도(°/s)
  },

  // 고도 한계: 허용 피치 범위를 부드럽게 좁힌다(지면 충돌 없음)
  altitude: {
    start: 3000,
    floorHard: 600, // 이 아래로는 내려가지 않는다
    floorSoft: 1300, // 여기서부터 기수를 들어 올리기 시작
    floorPitch: 6, // 하한에서 강제되는 최소 피치(°)
    ceilSoft: 8500,
    ceilHard: 9500,
    ceilPitch: -4,
    gain: 2.4, // 범위를 벗어난 피치를 되돌리는 세기(1/s)
    warnBelow: 1100, // HUD 고도 경고
  },

  // 모델 연출
  model: {
    surfaces: { tau: 0.09, elevator: 22, aileron: 24, rudder: 22, stabRollMix: 0.35 },
    exhaust: { tau: 0.5, lengthMin: 2.4, lengthMax: 6.5, powerMin: 0.5, powerMax: 0.95, flickerHz: 31, flicker: 0.05 },
  },
};

export const AIRCRAFT = { kf21: KF21 };
export const PLAYER_AIRCRAFT = KF21;

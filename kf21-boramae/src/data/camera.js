// 카메라 설정. 시점별로 따로 둔다. 단위: m, 도, 초.
export const CAMERA = {
  near: { chase: 2, cockpit: 0.25, orbit: 1 },
  far: 70000,

  chase: {
    fov: 58,
    fovSpeedGain: 0.08, // 순항속도 대비 1m/s마다 넓어지는 FOV(°)
    offset: { up: 6.2, back: 27 },
    posTau: 0.05, // 위치 추적 감쇠
    rotTau: 0.2, // 회전 추적 감쇠
    rollFollow: 0.4, // 기체 롤을 따라 기우는 비율
    pitchFollow: 0.92,
    lookDown: 5, // 카메라를 살짝 숙여 기체가 화면 아래쪽에 오게(°)
  },

  cockpit: {
    fov: 78,
    headTau: 0.18,
    headTurn: 6, // 선회 방향으로 고개 돌림(°)
    headPitch: 3, // 피치 입력 방향으로 고개 숙임/들기(°)
    headRoll: 0.12, // 기체 롤을 일부 상쇄(수평선 쪽으로 머리를 세움)
    sway: 0.035, // 가속에 따른 머리 흔들림(m)
  },

  orbit: {
    fov: 42,
    distance: 30,
    height: 5.5,
    speed: 0.16, // 메뉴 배경 회전 속도(rad/s)
    lookShift: 7.5, // 기체를 화면 중앙에서 옆으로 옮기는 정도(m): 메뉴 글자와 겹치지 않게 오른쪽으로
    lookUp: 0.6,
  },

  shake: {
    gun: 0.05,
    hit: 0.55,
    collision: 1.0,
    explosion: 0.5,
    decay: 6, // 초당 감쇠
    maxAngle: 0.5, // 최대 회전 흔들림(°): 멀미 방지를 위해 아주 작게
    maxOffset: 0.12, // 최대 위치 흔들림(m)
    hz: 34,
  },
};

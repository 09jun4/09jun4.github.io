// 몰입 요소 수치: 킬캠, 위협 경고, 피격 흔적, 마지막 격추 리플레이, 튜토리얼.
export const KILLCAM = {
  duration: 2.0, // 실제 시간(초)
  timeScale: 0.3, // 슬로모션 배율
  side: 78, up: 12, lead: 18, fov: 30, // 격추된 적기를 옆에서 잡는 카메라(높음·최고, PC)
};

export const THREAT = {
  chaseRange: 700, // 이 거리 안에서 뒤에 붙어 기수를 겨누면 "추격"
  chaseCone: 30, // 적 기수와 플레이어 방향의 각(도)
  fireHold: 1.4, // 적이 연발을 시작한 뒤 경고를 유지하는 시간(초)
  fireRange: 1100,
  edgeX: 0.8, edgeY: 0.72, // 화면 가장자리 표시 위치(화면 반폭·반높이 비율)
};

export const DECALS = {
  count: { low: 8, high: 22 }, // 프리셋별 최대 개수(낮음은 적게)
  size: [0.22, 0.46], sootSize: [0.7, 1.3], sootChance: 0.4, lift: 0.014,
};

export const REPLAY = {
  seconds: 6, hz: 30, // 링버퍼 길이와 기록 주기
  before: 3.6, after: 1.3, // 격추 순간 앞뒤로 보여줄 구간(초)
  speed: 0.55, // 재생 속도
  chase: { back: 30, up: 8, fov: 48 }, // 뷰 1: 내 기체 뒤에서 표적 쪽
  side: { side: 36, up: 7, lead: 12, fov: 34 }, // 뷰 2: 표적 옆
};

/** 튜토리얼(미션 1). 문구는 기기별로 다르다. 적은 마지막 단계에서야 등장하고, 점수·시간은 튜토리얼이 끝난 뒤부터 잰다. */
export const TUTORIAL = {
  missionId: 'm1',
  flightHold: 0.7, // 피치·선회를 각각 이만큼 입력하면 통과(초)
  gunShots: 10,
  doneHold: 1.4, // 단계 완료 표시 유지(초)
  steps: [
    { id: 'takeoff', title: '이륙', pc: '속도가 붙으면 S를 눌러 기수를 드세요', mobile: '속도가 붙으면 조이스틱을 아래로 당겨 기수를 드세요' },
    { id: 'flight', title: '비행', pc: 'W·S로 기수를 내리고 올리고, A·D로 선회하세요. 마우스 오른쪽 버튼을 누른 채 움직여도 조종됩니다', mobile: '왼쪽 조이스틱으로 기수를 올리고 내리고 선회하세요' },
    { id: 'gun', title: '기관포', pc: '마우스로 조준점을 옮기고 왼쪽 버튼을 눌러 기관포를 쏘세요', mobile: '화면 오른쪽을 누르고 있으면 그 자리로 기관포를 쏩니다' },
    { id: 'weapon', title: '무기 전환', pc: 'F를 눌러 미사일로 바꾸세요', mobile: '무장 버튼을 눌러 미사일로 바꾸세요' },
    { id: 'view', title: '시점 전환', pc: 'V를 눌러 시점을 바꿔 보세요', mobile: '시점 버튼을 눌러 시점을 바꿔 보세요' },
    { id: 'lock', title: '미사일 락온', pc: '적기가 옵니다. 조준점을 적기에 0.5초 올려 두면 락온됩니다. 락온되면 왼쪽 버튼으로 발사하세요', mobile: '적기가 옵니다. 적기를 누르고 있다가 락온되면 손을 떼세요' },
  ],
  skip: { pc: 'Enter: 건너뛰기', mobile: '건너뛰기 버튼: 넘어가기' },
};

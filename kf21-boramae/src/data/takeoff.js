// 이륙 연출과 공군기지(활주로) 설정. 모든 미션은 활주로에서 시작한다(Enter/Space로 건너뛰기).
export const TAKEOFF = {
  accel: 17, // 활주 가속(m/s²): 애프터버너 이륙
  rotateSpeed: 72, // 이 속도가 되면 기수를 들 수 있다
  assistDelay: 1.3, // 이 시간 안에 키를 누르지 않으면 자동으로 기수를 든다(이륙 실패 없음)
  climbPitch: 17, // 상승 자세(도)
  pitchRate: 11, // 기수 드는 속도(도/초)
  liftAccel: 13,
  climbSpeed: 172,
  gearUpAgl: 14, // 지면에서 이만큼 뜨면 기어를 접는다
  gearTime: 2.2, // 기어 접는 시간(초)
  finishAgl: 200, // 이 고도에서 미션 시작
  handoffSpeed: 150, // 미션 시작 시 최소 속도
  floorMargin: 40, // 미션 시작 직후 고도 하한 = 현재 고도 − 이 값(이후 올라가는 만큼 따라 올라간다)
  low: { startAgl: 10, speed: 112 }, // 낮음 프리셋: 막 떠오른 순간부터(기어 접힘 위주)
};

export const AIRBASE = {
  height: 42, // 활주로 표고(m)
  runway: { length: 2800, width: 46, startOffset: 170 }, // 출발 위치는 활주로 끝에서 startOffset 안쪽
  flattenRadius: 2300, // 이 반경 안의 지형은 평평하게
  blendRadius: 5600, // 여기까지 자연 지형으로 이어진다
  lightSpacing: 60,
  colors: { asphalt: '#3a3d41', mark: '#e9ecef', apron: 0x8a8d8f, hangar: 0x7d858c, roof: 0x5c646b, tower: 0xb9bfc4, glass: 0x2a3a48, grass: 0x5f8f62 },
};

// 입력 수치. 코드에는 매직넘버를 두지 않는다.
export const INPUT = {
  margin: 24, // 가상 조준점이 화면 가장자리에서 떨어지는 여백(px)
  steerSpeed: 1200, // 우클릭 조향: 이 속도(px/s)로 움직이면 최대 입력
  steerTau: 0.08, // 입력이 커질 때 평활 시정수(초)
  steerReleaseTau: 0.15, // 마우스가 멈췄을 때 0으로 돌아가는 시정수(초)

  // 모바일
  stick: { deadzone: 0.08, curve: 1.3, radiusRatio: 0.16, minRadius: 56, left: 0.07, bottom: 0.1 }, // 반경은 화면 높이 비례
  gyro: { maxTiltDeg: 30, lowpassTau: 0.1 },
  buttonOpacity: 0.6,
  touchSplit: 0.4, // 이 비율보다 왼쪽에서 시작한 터치는 조이스틱, 오른쪽은 조준
};

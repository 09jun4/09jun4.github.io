// 입력 수치. 코드에는 매직넘버를 두지 않는다.
export const INPUT = {
  margin: 24, // 가상 조준점이 화면 가장자리에서 떨어지는 여백(px)
  // 우클릭 조향(조이스틱 방식): 누른 점에서 steerRadius(px)만큼 벗어나면 최대 입력. 누르고 있는 동안 유지된다
  steerRadius: 130,
  steerDeadzone: 0.07, // 중심 근처의 불감대(비율)
  steerTau: 0.06, // 평활 시정수(초)
  steerReleaseTau: 0.12, // 버튼을 놓았을 때 0으로 돌아가는 시정수(초)

  // 모바일
  stick: { deadzone: 0.08, curve: 1.3, radiusRatio: 0.16, minRadius: 56, left: 0.07, bottom: 0.1 }, // 반경은 화면 높이 비례
  gyro: { maxTiltDeg: 30, lowpassTau: 0.1 },
  buttonOpacity: 0.6,
  touchSplit: 0.4, // 이 비율보다 왼쪽에서 시작한 터치는 조이스틱, 오른쪽은 조준
};

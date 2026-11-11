// 메인 메뉴 시네마틱(높음·최고). 장면을 차례로 보여 주고 되풀이한다. 낮음은 기존의 느린 회전으로 대체한다.
// cam: 기체 기준 카메라(yaw 0 = 뒤, 180 = 앞 / pitch = 위아래 / dist / at = 바라볼 지점 / shift = 기체를 화면 오른쪽으로 미는 양).
//      [시작, 끝] 사이를 부드럽게 움직인다. 메뉴 글자가 왼쪽에 있으므로 기체는 항상 오른쪽에 둔다.
// ground: 활주로에 서 있는 장면. 값은 [시작, 끝] 또는 고정값.
export const CINEMATIC = [
  { // 1) 주기 상태: 캐노피가 열려 있고 조종사가 보인다. 미사일이 하나씩 장착되고 캐노피가 닫힌다
    duration: 7, ground: true, fov: 38,
    cam: { yaw: [152, 108], pitch: [4, 9], dist: [15, 13], at: [0, 0.2, -2.5], shift: 4.2 },
    canopy: [1, 1, 1, 0], ammo: [0, 5], gear: 1, boost: 0, power: 0.15,
  },
  { // 2) 엔진 점화: 뒤에서 노즐이 열리고 애프터버너가 켜진다
    duration: 5, ground: true, fov: 36,
    cam: { yaw: [40, 14], pitch: [7, 5], dist: [13, 11], at: [0, 0, 6.5], shift: 3.4 },
    canopy: 0, ammo: 5, gear: 1, boost: [0, 0, 1, 1], power: [0.2, 1],
  },
  { // 3) 이륙 직후: 기어가 접히며 옆을 스쳐 지나간다
    duration: 6.5, ground: false, fov: 40, altitude: 420, pitch: 0.2,
    cam: { yaw: [118, 70], pitch: [-7, 6], dist: [24, 30], at: [0, 0, 0], shift: 7 },
    canopy: 0, ammo: 5, gear: [1, 0, 0], boost: [1, 0.6], turn: 0,
  },
  { // 4) 구름 위 선회: 위에서 돌며 전체 모습을 보여 준다
    duration: 8, ground: false, fov: 42, altitude: 2750, pitch: 0,
    cam: { yaw: [205, 318], pitch: [24, 12], dist: [34, 28], at: [0, 0, 0], shift: 8 },
    canopy: 0, ammo: 5, gear: 0, boost: [0.2, 1, 0.3], turn: [0, 0.55, 0.55, 0],
  },
];

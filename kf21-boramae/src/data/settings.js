// 사용자 설정의 기본값과 범위.
export const SETTINGS_VERSION = 3; // v2: 그래픽 프리셋 3단계, 도색, 이륙 스킵 / v3: 우클릭 조향, 모바일 입력, 튜토리얼

export const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  mouseSensitivity: 1, // 조준 커서 배율(화면 중앙 기준)
  quality: 'low', // 'low' | 'high' | 'ultra' ('min'은 자동 조절로만 도달)
  autoQuality: true, // FPS가 낮으면 자동으로 프리셋을 낮춘다(끄면 고정)
  benchmarked: false, // 첫 실행 벤치마크로 프리셋을 골랐는지(직접 고르면 true가 되어 다시 재지 않는다)
  paint: 'grey', // 도색: 'grey' | 'dark' | 'urban'
  skipTakeoff: false, // 이륙 연출 기본 스킵
  cameraShake: true,
  sound: true, // 소리 켜기
  volume: 0.7, // 전체 음량(0~1)
  // PC: 우클릭 조향
  steerEnabled: true,
  steerSens: 1,
  steerInvertY: false,
  // 모바일
  inputMode: 'auto', // 'auto' | 'pc' | 'mobile'
  stickSens: 1,
  gyro: false,
  gyroSens: 1,
  gyroInvert: false,
  mobileHighOk: false, // 모바일 벤치마크를 통과해 높음을 고를 수 있는지(기기별 값)
  bombTutorialDone: false, // 폭격 튜토리얼을 마쳤는지
  tutorialDone: false, // 튜토리얼을 마치거나 건너뛰었는지
  view: 'chase', // 마지막으로 쓴 시점
};

export const SETTING_RANGES = {
  volume: { min: 0, max: 1, step: 0.05 },
  mouseSensitivity: { min: 0.5, max: 2, step: 0.05 },
  steerSens: { min: 0.5, max: 2, step: 0.05 },
  stickSens: { min: 0.5, max: 2, step: 0.05 },
  gyroSens: { min: 0.5, max: 2, step: 0.05 },
};

export const QUALITY_CHOICES = ['low', 'high', 'ultra'];
export const PAINTS = [
  { id: 'grey', label: '회색' },
  { id: 'dark', label: '어두운 회색' },
  { id: 'urban', label: '도심 위장' },
];

// 사용자 설정의 기본값과 범위.
export const SETTINGS_VERSION = 2; // v2: 그래픽 프리셋 3단계(낮음/높음/최고), 도색, 이륙 연출 스킵

export const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  mouseSensitivity: 1, // 조준 커서 배율(화면 중앙 기준)
  quality: 'low', // 'low' | 'high' | 'ultra' ('min'은 자동 조절로만 도달)
  autoQuality: true, // FPS가 낮으면 자동으로 프리셋을 낮춘다(끄면 고정)
  benchmarked: false, // 첫 실행 벤치마크로 프리셋을 골랐는지(직접 고르면 true가 되어 다시 재지 않는다)
  paint: 'grey', // 도색: 'grey' | 'dark' | 'urban'
  skipTakeoff: false, // 이륙 연출 기본 스킵
  cameraShake: true,
  view: 'chase', // 마지막으로 쓴 시점
};

export const SETTING_RANGES = {
  mouseSensitivity: { min: 0.5, max: 2, step: 0.05 },
};

export const QUALITY_CHOICES = ['low', 'high', 'ultra'];
export const PAINTS = [
  { id: 'grey', label: '회색' },
  { id: 'dark', label: '어두운 회색' },
  { id: 'urban', label: '도심 위장' },
];

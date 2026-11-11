// 사용자 설정의 기본값과 범위.
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  mouseSensitivity: 1, // 조준 커서 배율(화면 중앙 기준)
  quality: 'high', // 'high' | 'low'
  autoQuality: true, // FPS가 낮으면 자동으로 품질을 낮춘다(끄면 고정)
  qualityStep: 0, // 품질 단계(data/quality.js 의 STEPS 인덱스)
  cameraShake: true,
  view: 'chase', // 마지막으로 쓴 시점
};

export const SETTING_RANGES = {
  mouseSensitivity: { min: 0.5, max: 2, step: 0.05 },
};

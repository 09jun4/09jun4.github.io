// 앱 전체 공통 설정(루프, 화면 흐름).
export const LOOP = {
  hz: 60, // 물리·AI 고정 주파수
  maxFrameDelta: 0.1, // 프레임 델타 상한(초): 탭 복귀 시 시간 점프 방지
  maxStepsPerFrame: 6,
};

export const FADE_SECONDS = 0.25; // 화면 전환 페이드

export const STATE = {
  MENU: 'menu',
  SELECT: 'select',
  BRIEFING: 'briefing',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULT: 'result',
};

// 허용되는 화면 전환
export const TRANSITIONS = {
  [STATE.MENU]: [STATE.SELECT],
  [STATE.SELECT]: [STATE.MENU, STATE.BRIEFING],
  [STATE.BRIEFING]: [STATE.SELECT, STATE.PLAYING],
  [STATE.PLAYING]: [STATE.PAUSED, STATE.RESULT],
  [STATE.PAUSED]: [STATE.PLAYING, STATE.MENU, STATE.BRIEFING],
  [STATE.RESULT]: [STATE.PLAYING, STATE.BRIEFING, STATE.MENU, STATE.SELECT],
};

export const STORAGE_PREFIX = 'kf21';
export const SAVE_VERSION = 1;

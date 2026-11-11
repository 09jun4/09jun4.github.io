// HUD 설정. 단색(청록) + 얇은 선. 크기는 기준 해상도(1280×720)에 대한 값이고 화면에 비례해 커진다.
export const HUD = {
  baseWidth: 1280,
  baseHeight: 720,
  minScale: 0.75,
  maxScale: 2.2,
  color: '#6fe3d2',
  dim: 'rgba(111, 227, 210, 0.45)',
  faint: 'rgba(111, 227, 210, 0.22)',
  shadow: 'rgba(0, 20, 24, 0.55)',
  warn: '#ffb347',
  danger: '#ff5a4d',
  ok: '#7dffa0',
  lock: { search: '#b8c4cc', tracking: '#ffa53a', locked: '#5dff8f' },
  enemy: '#ff5a4d',
  font: '"JetBrains Mono", "D2Coding", Consolas, ui-monospace, monospace',
  fontKo: '"Pretendard", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif',
  lineWidth: 1.5,
  ladder: { stepDeg: 10, pxPerDeg: 9, halfWidth: 78, gap: 26, range: 26 },
  tape: { height: 220, offsetX: 300, tick: 9 },
  // 1인칭 HUD 유리판에 맺히는 기호(가상 면은 ±12° = 24° 폭)
  glass: { spanDeg: 24, ladderScale: 0.55, tapeX: 84, tapeScale: 0.6 },
  arrow: { margin: 46, size: 14, keepOut: 96 }, // keepOut: 위·아래 상태 표시 줄을 가리지 않게
  lowHp: 0.3,
};

/** 순간 표시 타이머(초) */
export const HUD_FEEDBACK = {
  hitWarn: 1.1,
  hitFade: 1.8, // 피격 붉은 효과가 사라지는 속도(1/s)
  killNotice: 1.6,
  waveNotice: 2.4,
  switchFlash: 0.9,
};

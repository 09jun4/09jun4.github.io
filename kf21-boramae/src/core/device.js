// 기기 판별: 거친 포인터(손가락)와 터치 이벤트가 있으면 모바일. 설정의 입력 방식(auto/pc/mobile)이 우선한다.
export function detectTouchDevice() {
  try {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const touch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    return !!(coarse && touch);
  } catch (e) {
    return false;
  }
}

/** @param {string} mode 'auto' | 'pc' | 'mobile' */
export function isMobileMode(mode) {
  if (mode === 'mobile') return true;
  if (mode === 'pc') return false;
  return detectTouchDevice();
}

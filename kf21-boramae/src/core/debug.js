// 개발용 디버그 훅. 개발 서버이거나 주소에 ?debug=1 이 있을 때만 window.__debug 를 만든다.
// 배포본에서 일반 사용자는 접근할 수 없다(주소 파라미터가 있어야만 생긴다).
export function isDebugEnabled() {
  const dev = !!(import.meta.env && import.meta.env.DEV);
  let flag = false;
  try {
    flag = new URLSearchParams(window.location.search).get('debug') === '1';
  } catch (e) { /* 주소를 읽을 수 없으면 꺼 둔다 */ }
  return dev || flag;
}

/** 디버그 상태(게임 코드가 읽는 값). 훅이 꺼져 있으면 전부 기본값이다. */
export const debugState = {
  enabled: false,
  invincible: false,
  showFps: false,
  freezeEnemies: false,
  passiveEnemies: false,
};

/**
 * @param {object} api 게임이 넘겨주는 조작 함수 모음
 */
export function installDebug(api) {
  debugState.enabled = true;
  const hook = {
    /** 현재 미션을 즉시 끝낸다. success=false면 실패 처리 */
    skipMission: (success = true) => api.skipMission(success),
    /** 무적 켜기/끄기 */
    invincible: (on = true) => { debugState.invincible = !!on; return debugState.invincible; },
    /** 플레이어 앞에 적기 n대 즉시 생성 */
    spawnEnemy: (n = 1, opts) => api.spawnEnemy(n, opts),
    /** FPS·드로우콜 표시 */
    showFps: (on = true) => { debugState.showFps = !!on; api.onShowFps(debugState.showFps); return debugState.showFps; },
    /** 적기 정지(모델·조준 확인용) */
    freezeEnemies: (on = true) => { debugState.freezeEnemies = !!on; return debugState.freezeEnemies; },
    /** 적기 AI 끄기(직진만 한다): 락온·사격 시험용 */
    passiveEnemies: (on = true) => { debugState.passiveEnemies = !!on; return debugState.passiveEnemies; },
    ...api.extra,
  };
  window.__debug = hook;
  return hook;
}

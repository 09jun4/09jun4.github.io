// 그래픽 품질 단계. 앞에서 뒤로 갈수록 가볍다. 자동 조절은 한 번에 한 단계씩 내려간다.
// 내려가는 순서: 해상도 배율 → 구름 수 → 파티클.
export const QUALITY_STEPS = [
  { pixelRatio: 2, clouds: 1, particles: 1 }, // 0: 높음
  { pixelRatio: 1, clouds: 1, particles: 1 }, // 1: 해상도 배율만 낮춤
  { pixelRatio: 1, clouds: 0.55, particles: 1 }, // 2: 구름 수 낮춤
  { pixelRatio: 1, clouds: 0.55, particles: 0.5 }, // 3: 낮음
  { pixelRatio: 0.75, clouds: 0.4, particles: 0.4 }, // 4: 아주 느린 기기용(자동으로만 도달)
];

/** 설정의 "높음/낮음"이 가리키는 단계 */
export const QUALITY_PRESETS = { high: 0, low: 3 };

export const AUTO_QUALITY = {
  window: 2, // 최근 몇 초 평균으로 판단
  minFps: 45, // 이보다 낮으면 한 단계 낮춘다
  cooldown: 3, // 낮춘 뒤 다시 판단하기까지(초)
  warmup: 2.5, // 시작 직후(셰이더 컴파일 등)는 건너뛴다
};

// 그래픽 프리셋. 프리셋마다 모델을 통째로 바꾼다(거리별 LOD 없음).
//   낮음(low)  : 기존 로우폴리 그대로. 플랫 셰이딩, 후처리 없음, CPU 인스턴싱 파티클
//   높음(high) : 하이폴리 기체(약 10만 삼각형)·조종석, PBR+환경맵, 후처리 일부, GPU 파티클 중간
//   최고(ultra): 기체 20만 삼각형 이상, 후처리 전체, 파티클 최대
//   min        : 낮음에서도 느릴 때 자동 조절로만 내려가는 단계(해상도 배율 0.75)
// 자동 조절은 PRESET_ORDER를 따라 한 칸씩 내려간다.
export const PRESET_ORDER = ['ultra', 'high', 'low', 'min'];

export const PRESETS = {
  ultra: {
    label: '최고', tier: 'ultra', detail: 2, enemyDetail: 2, pixelRatio: 2,
    clouds: 1, cloudStyle: 'soft', cloudLayers: 5, terrainSegments: 256,
    particles: 1, particleCapacity: 16000, particleScale: 3.2,
    textureSize: 4096, shadowMap: 2048, enemyFlames: true,
    post: { msaa: 4, bloomLevels: 5, bloomStrength: 0.9, motionBlur: 0.32, flare: 1 },
  },
  high: {
    label: '높음', tier: 'high', detail: 1, enemyDetail: 1, pixelRatio: 1.5,
    clouds: 0.8, cloudStyle: 'soft', cloudLayers: 3, terrainSegments: 192,
    particles: 1, particleCapacity: 7000, particleScale: 1.8,
    textureSize: 2048, shadowMap: 1024, enemyFlames: false,
    post: { msaa: 4, bloomLevels: 4, bloomStrength: 0.8, motionBlur: 0, flare: 0.8 },
  },
  low: {
    label: '낮음', tier: 'low', detail: 0, enemyDetail: 0, pixelRatio: 1.5,
    clouds: 0.75, cloudStyle: 'lowpoly', cloudLayers: 0, terrainSegments: 96,
    particles: 0.6, particleCapacity: 0, particleScale: 1,
    textureSize: 0, shadowMap: 0, enemyFlames: false, post: null,
  },
  min: {
    label: '낮음', tier: 'low', detail: 0, enemyDetail: 0, pixelRatio: 0.75,
    clouds: 0.4, cloudStyle: 'lowpoly', cloudLayers: 0, terrainSegments: 96,
    particles: 0.4, particleCapacity: 0, particleScale: 1,
    textureSize: 0, shadowMap: 0, enemyFlames: false, post: null,
  },
};

/** 성능 예산(장면 전체) */
export const BUDGET = {
  low: { triangles: 100000, drawCalls: 80, fps: 45 },
  high: { triangles: 600000, drawCalls: 250, fps: 60 },
  ultra: { triangles: 1200000, drawCalls: 400, fps: 60 },
};

export const AUTO_QUALITY = {
  window: 2, // 최근 몇 초 평균으로 판단
  minFps: 45, // 이보다 낮으면 한 칸 낮춘다
  cooldown: 4, // 낮춘 뒤 다시 판단하기까지(초)
  warmup: 3, // 시작·재생성 직후(셰이더 컴파일 등)는 건너뛴다
};

// 첫 실행 벤치마크: 고정된 부하(인스턴싱 구 약 38만 삼각형, 1280×720)를 그려 프레임 시간을 잰다.
export const BENCHMARK = {
  maxSeconds: 2,
  frames: 36,
  warmupFrames: 4,
  width: 1280,
  height: 720,
  instances: 400,
  ultraBelowMs: 4.5, // 프레임 시간이 이보다 짧으면 최고
  highBelowMs: 11, // 이보다 짧으면 높음, 아니면 낮음
  softwareRenderer: /swiftshader|llvmpipe|software|basic render/i, // 소프트웨어 렌더러면 바로 낮음
};

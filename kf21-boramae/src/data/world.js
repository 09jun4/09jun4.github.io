// 환경 설정: 하늘, 조명, 안개, 구름, 원경 지형, 원점 재배치. 낮·맑음 고정.
export const WORLD = {
  // 플레이어가 원점에서 이만큼 벗어나면 전체를 되돌린다(부동소수 오차 방지)
  originRebaseDistance: 3000,

  sky: {
    zenith: 0x2a78d0,
    mid: 0x5aa7e6,
    horizon: 0xc4e2f4,
    below: 0xa9cfe8, // 수평선 아래(지형 뒤) 연무색
    sunColor: 0xfff6dd,
    sunDirection: [0.42, 0.66, 0.36], // 정규화해서 사용
    sunSize: 0.9994, // cos(반지름)
    sunGlow: 0.22,
    radius: 60000,
  },

  // 고도 연출: 높이 올라갈수록 하늘이 짙푸르고 해가 강해지며, 아래에서 올라오는 빛이 줄어든다
  altitudeLook: { from: 1500, to: 6500, zenith: 0x0d2f7a, mid: 0x2f7fd6, sunGain: 0.28, hemiDrop: 0.2, glowGain: 0.5, cloudLit: 0.12 },

  lighting: {
    sunColor: 0xfff2dc,
    sunIntensity: 2.1,
    skyColor: 0xd9ecff,
    groundColor: 0xb4c6d4, // 바다·구름에서 올라오는 반사광: 기체 아랫면이 검게 죽지 않게 밝게
    hemiIntensity: 2.3,
  },

  // 후처리 색감(높음·최고)
  post: { exposure: 0.98, bloomThreshold: 1.05, flareColor: 0xfff1d0, flashColor: 0xffc27a },
  // 기체 그림자(높음·최고): 플레이어 주변만 덮는 좁은 그림자 맵
  shadow: { extent: 11, distance: 60, bias: -0.0015, normalBias: 0.03 },

  fog: { color: 0xc4e2f4, near: 2500, far: 34000 },

  clouds: {
    lit: 0xffffff,
    shade: 0xb9cbdc,
    under: 0x93aac0,
    // 부드러운 구름(높음·최고)의 색: 햇빛 받은 쪽, 그늘, 밑면, 해를 등진 가장자리의 림
    soft: { lit: 0xffffff, shade: 0xb4c6d8, under: 0xa9bacb, rim: 0xfff0cf, opacity: 0.92 },
    fogNear: 5000,
    fogFar: 26000,
    // 큰 구름층: 여러 높이·거리에 불규칙 배치. period 안에서 순환하므로 끝없이 이어진다.
    main: {
      seed: 21,
      period: 22000,
      clouds: 150,
      puffs: [5, 9],
      bands: [ // 높이대별 비중
        { yMin: 1500, yMax: 2600, weight: 0.4, size: [170, 420] },
        { yMin: 2900, yMax: 4300, weight: 0.38, size: [150, 360] },
        { yMin: 5200, yMax: 7200, weight: 0.22, size: [220, 520] },
      ],
      spread: 1.25, // 뭉치 안에서 퍼프가 퍼지는 정도(크기 대비)
      flatten: 0.5, // 퍼프 납작함
      fade: [0.74, 0.97],
      nearFade: [0, 0],
    },
    // 가까운 조각구름: 플레이어 높이 주변을 따라다니며 속도감을 만든다.
    near: {
      seed: 77,
      period: 3800,
      yWrap: 650,
      clouds: 80,
      puffs: [2, 4],
      size: [22, 58],
      spread: 1.1,
      flatten: 0.6,
      fade: [0.7, 0.96],
      nearFade: [70, 240], // 카메라 바로 앞을 가리지 않게 가까우면 줄어든다
    },
  },

  terrain: {
    size: 68000,
    segments: 96,
    noiseCell: 6400, // 가장 큰 지형 굴곡의 크기(m)
    noisePeriod: 256, // 노이즈 격자 주기(칸): 월드 주기 = noiseCell × noisePeriod
    heightMax: 560,
    seaLevel: 0.36, // 노이즈 값이 이보다 낮으면 바다
    colors: { sea: 0x3f7fb8, shore: 0xb9b38c, low: 0x5f8f62, mid: 0x4f7a58, high: 0x86877c },
    fogNear: 7000,
    fogFar: 31000,
  },
};

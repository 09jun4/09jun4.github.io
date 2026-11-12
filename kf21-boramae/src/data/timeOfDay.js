// 시간대 4종. day는 data/world.js의 기본값을 그대로 쓴다(null). 나머지는 그 위에 덮어쓰는 값이다.
// sun: 해(야간은 달)의 방향·색·세기, hemi: 하늘·지면 반사광, clouds: 구름 색, terrainTint: 지형 색에 곱하는 색,
// stars: 별 밝기(0~1), exposure: 후처리 노출 배율, lights: 활주로·항법등·목표 조명 배율, hud: HUD 밝기 배율
export const TIME_OF_DAY = {
  day: { label: '낮', preview: ['#2a78d0', '#5aa7e6', '#c4e2f4'], stars: 0, exposure: 1, lights: 1, hud: 1 },
  dawn: {
    label: '새벽', preview: ['#27406e', '#6f86b0', '#f2b98a'],
    sky: { zenith: 0x27406e, mid: 0x6f86b0, horizon: 0xf2b98a, below: 0xb89a8a, sunColor: 0xffc890, sunGlow: 0.5 },
    sun: { direction: [0.78, 0.16, -0.42], color: 0xffc28a, intensity: 1.55 },
    hemi: { sky: 0xb9c4e0, ground: 0x8a7f86, intensity: 1.5 },
    fog: 0xe6b996, clouds: { lit: 0xffd9b8, shade: 0x8c93b4, under: 0x6f7696, rim: 0xffb070 },
    terrainTint: 0xc8b4a8, stars: 0.15, exposure: 1.02, lights: 1.6, hud: 1,
  },
  dusk: {
    label: '저녁', preview: ['#1f2f66', '#7a5f96', '#ff9a5c'],
    sky: { zenith: 0x1f2f66, mid: 0x7a5f96, horizon: 0xff9a5c, below: 0x8a6a72, sunColor: 0xffa066, sunGlow: 0.6 },
    sun: { direction: [-0.72, 0.12, 0.46], color: 0xff9a5a, intensity: 1.4 },
    hemi: { sky: 0xa9a6d0, ground: 0x7a6a70, intensity: 1.3 },
    fog: 0xe89a6e, clouds: { lit: 0xffc09a, shade: 0x7a6f9c, under: 0x5c5680, rim: 0xff8a4a },
    terrainTint: 0xb09088, stars: 0.3, exposure: 1.04, lights: 1.8, hud: 1,
  },
  night: {
    label: '야간', preview: ['#03060f', '#0a1428', '#1a2740'],
    sky: { zenith: 0x03060f, mid: 0x0a1428, horizon: 0x1a2740, below: 0x0c1420, sunColor: 0xdfe8ff, sunGlow: 0.06, sunSize: 0.99975 },
    sun: { direction: [0.32, 0.62, -0.5], color: 0xaec4ff, intensity: 0.5 }, // 달빛
    hemi: { sky: 0x4a609a, ground: 0x121a26, intensity: 0.6 },
    fog: 0x121c30, clouds: { lit: 0x5a6e96, shade: 0x1c2740, under: 0x121a2c, rim: 0x8aa0d0 },
    terrainTint: 0x38425c, stars: 1, exposure: 1.18, lights: 2.6, hud: 0.9,
  },
};

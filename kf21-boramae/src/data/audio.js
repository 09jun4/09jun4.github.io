// 소리 설정: 파일, 음량, 타이밍. 파일은 assets/audio/(원본을 잘라 내고 음량을 맞춘 것).
export const AUDIO = {
  base: 'assets/audio/',
  files: { music: 'music.mp3', engine: 'engine.mp3', engineStart: 'engine-start.mp3', takeoff: 'takeoff.mp3', gun: 'gun.mp3', missile: 'missile.mp3', bombFall: 'bomb-fall.mp3', explosion: 'explosion.mp3' },
  // 엔진 루프: 파일의 from~to 구간을 잘라 끝과 처음을 xfade초 겹쳐 이음매 없는 루프로 만든다. 출력에 따라 음량과 음높이가 변한다
  engine: { from: 1, to: 17.5, xfade: 2, gain: [0.16, 0.42], rate: [0.82, 1.18], boostGain: 0.14, cockpit: 0.8, tau: 0.35 },
  // 기관포: 연발 소리의 가운데 구간을 루프로 돌리고, 쏘는 동안만 튼다
  gun: { from: 0.1, to: 1.3, xfade: 0.06, gain: 0.42, hold: 0.16, fade: 0.07 },
  missile: { gain: 0.6 },
  bombFall: { gain: 0.42, length: 2.7 }, // 휘파람 소리가 착탄 순간에 끝나도록 시작 시각을 맞춘다
  explosion: { gain: 0.95, near: 250, far: 4500, enemyRate: 1.25 }, // 거리에 따라 작아지고(near 안은 최대), 공중 폭발은 조금 높게
  // 이륙 시네마틱(초): 시동음은 초반부, 이륙음은 애프터버너 점화에 맞춰 시작해 저공 통과가 끝날 때 잦아든다
  takeoff: { startAt: 0.15, startGain: 0.6, startRate: 1.15, startFade: [2.2, 1.6], roarAt: 1.55, roarGain: 0.85, engineFrom: 1.2 },
  // 배경음악: tools/make-music.py로 만든 40초 루프. 파일 끝에 앞부분이 덧붙어 있어 그 구간을 겹쳐 이음매 없이 돌린다
  music: { from: 0.3, length: 40, xfade: 0.6, menu: 1, mission: 0.62, takeoff: 0.45, tau: 0.8 },
  duck: 0.6, // 결과 화면 등에서 줄이는 시간(초)
};

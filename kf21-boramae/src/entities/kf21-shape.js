// KF-21 형상 표(로우폴리·하이폴리 모델이 함께 쓴다). 좌표: 앞 = -z, 위 = +y, 오른쪽 = +x, 단위 m.
// 기수에서 잰 거리 s를 z = s - ORIGIN_S 로 옮긴다. 실기 제원: 길이 16.9, 폭 11.2, 높이 4.7(기어 포함), 주익 면적 약 46㎡.
import * as THREE from 'three';
import { PALETTE } from '../data/palette.js';

const P = PALETTE.kf21;
export const ORIGIN_S = 8.7; // 모델 원점(무게중심 부근)까지 기수에서의 거리
export const Z = (s) => s - ORIGIN_S;

// ── 형상 표 ────────────────────────────────────────────────────────────────
// 동체 단면: [s, 반폭 w, 윗높이 top, 아랫깊이 bot, 차인 높이 chine, 중심선 높이 cy]
export const FUSELAGE = [
  [0.0, 0.03, 0.03, 0.03, 0.0, -0.18],
  [0.8, 0.25, 0.22, 0.2, 0.0, -0.15],
  [2.0, 0.5, 0.42, 0.4, 0.0, -0.09],
  [3.3, 0.74, 0.56, 0.56, 0.02, -0.03],
  [4.6, 0.92, 0.66, 0.72, 0.05, 0.0],
  [5.8, 1.04, 0.78, 0.82, 0.1, 0.0],
  [6.7, 1.14, 0.94, 0.86, 0.14, 0.0],
  [7.7, 1.58, 0.92, 0.88, 0.12, 0.0],
  [9.5, 1.74, 0.82, 0.88, 0.1, 0.0],
  [11.5, 1.72, 0.7, 0.82, 0.08, 0.0],
  [13.2, 1.62, 0.58, 0.7, 0.05, 0.0],
  [14.6, 1.48, 0.5, 0.56, 0.0, 0.0],
  [15.35, 1.36, 0.46, 0.5, 0.0, 0.0],
];
export const FUSELAGE_COLORS = [P.radome, P.radome, P.radome, P.base, P.base, P.light, P.base, P.base, P.light, P.base, P.base, P.dark];

// 캐노피 단면: [s, 반폭, 높이, 바닥 y]
export const CANOPY = [
  [3.7, 0.05, 0.03, 0.44],
  [4.1, 0.36, 0.32, 0.46],
  [4.7, 0.5, 0.64, 0.5],
  [5.4, 0.52, 0.72, 0.56],
  [6.2, 0.46, 0.56, 0.68],
  [6.9, 0.3, 0.28, 0.82],
  [7.5, 0.1, 0.05, 0.9],
];

export const WING = {
  y: 0.1,
  root: { span: 1.5, le: 7.45, te: 12.9, t: 0.38 },
  tip: { span: 5.6, le: 10.9, te: 12.05, t: 0.09 },
  flap: { from: 2.0, to: 4.85, chord: 0.74 }, // 스팬 구간, 힌지의 코드 위치(0~1)
};
export const STAB = {
  y: 0.0,
  root: { span: 1.38, le: 12.95, te: 16.05, t: 0.2 },
  tip: { span: 3.95, le: 15.0, te: 15.85, t: 0.06 },
  pivotS: 14.85,
};
export const FIN = {
  base: { x: 1.12, y: 0.34 },
  cant: 25, // 바깥으로 기운 각도(도)
  root: { span: 0, le: 11.25, te: 14.65, t: 0.24 },
  tip: { span: 2.75, le: 13.35, te: 14.5, t: 0.08 },
  rudder: { from: 0.3, to: 2.3, chord: 0.7 },
};
export const NOZZLE = { x: 0.66, y: -0.03, s0: 15.1, s1: 16.55, r: 0.5 };

/** 모델 좌표계의 주요 지점(총구, 조종사 눈, 노즐 끝) */
export const KF21_POINTS = {
  muzzle: new THREE.Vector3(-0.88, 0.36, Z(5.0)),
  eye: new THREE.Vector3(0, 1.06, Z(5.1)),
  nozzleEnd: Z(NOZZLE.s1),
  length: 16.9,
};


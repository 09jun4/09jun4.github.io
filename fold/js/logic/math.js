// 접기 논리용 수학 — 90° 단위 회전만 쓰므로 정수 행렬로 정확하게 계산해요 (부동소수 오차 없음).
// 변환 T = { R: 3x3 정수 행렬(행 우선 9칸), t: [x,y,z] },  p' = R·p + t

export const DIRS = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1],
};
// 수평 4방향: 0:+x 1:-x 2:+z 3:-z
export const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const OPP4 = [1, 0, 3, 2];

export const vec = d => (typeof d === 'string' ? DIRS[d] : d).slice();
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const clean = a => a.map(v => (v === 0 ? 0 : v)); // -0 → 0

export const IDENT = Object.freeze({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });

// 축(단위, 좌표축 방향) 둘레로 quarter × 90° 회전 (오른손 법칙)
export function rotMat(axis, quarter) {
  const q = ((quarter % 4) + 4) % 4;
  const c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q], k = 1 - c;
  const [x, y, z] = axis;
  return [
    c + k * x * x, k * x * y - s * z, k * x * z + s * y,
    k * y * x + s * z, c + k * y * y, k * y * z - s * x,
    k * z * x - s * y, k * z * y + s * x, c + k * z * z,
  ];
}
export const mulMV = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
];
export function mulMM(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
export const apply = (T, p) => add(mulMV(T.R, p), T.t);
export const compose = (A, B) => ({ R: mulMM(A.R, B.R), t: add(mulMV(A.R, B.t), A.t) }); // A∘B
// 점 p 를 지나는 축 둘레 회전
export function rotAbout(p, axis, quarter) {
  const R = rotMat(axis, quarter);
  return { R, t: sub(p, mulMV(R, p)) };
}

// 칸 키: 정수 [ix, level, iz]
export const ckey = (x, y, z) => x + ',' + y + ',' + z;
export const parseKey = k => k.split(',').map(Number);
// 칸 경계 키 (같은 높이에서 이웃 칸 사이)
export function edgeKey(ix, y, iz, d) {
  if (d === 0) return 'x' + (ix + 1) + ',' + y + ',' + iz;
  if (d === 1) return 'x' + ix + ',' + y + ',' + iz;
  if (d === 2) return 'z' + ix + ',' + y + ',' + (iz + 1);
  return 'z' + ix + ',' + y + ',' + iz;
}
// 수평 방향 벡터 → DIR4 번호 (-1 이면 수평 아님)
export function dir4Of(v) {
  if (v[1] !== 0) return -1;
  if (v[0] === 1) return 0; if (v[0] === -1) return 1;
  if (v[2] === 1) return 2; if (v[2] === -1) return 3;
  return -1;
}
export const dir4Vec = d => [DIR4[d][0], 0, DIR4[d][1]];

// 이륙 시네마틱(8초): 미션을 시작할 때마다 재생된다. 이 연출이 곧 이륙이다(수동 이륙 조작 없음).
// 순수 데이터 + 순수 함수(Three.js 없음). 기체 상태와 카메라는 키프레임을 easeInOut으로 이어 로드 때 표로 구워 두고,
// 재생 중에는 표를 보간만 한다(할당 없음). 실행은 src/core/takeoff-cine.js.
// 좌표: 활주 방향이 -z. 카메라의 rel 값은 기체 위치 기준 오프셋(기체는 줄곧 -z로만 간다)이다.

export const CINE = {
  duration: 8,
  blend: 0.5, // 끝난 뒤 3인칭 추적 카메라로 넘어가는 시간(카메라 리그의 감쇠가 맡는다)
  endAgl: 120, // 끝났을 때 고도(지면 기준). 고도 하한(100m)보다 높다
  endSpeed: 150,
  flapMax: 25, // 플랩 값 1에 해당하는 각(도)
  eye: [0, 1.06, -3.6], // 조종사 눈 위치(기체 좌표). entities/kf21-shape.js의 KF21_POINTS.eye와 같다
  wake: { range: 40, near: 12, pos: 0.15, rot: 0.6, fade: 0.5 }, // 와류 흔들림: 40m 안에서 거리에 반비례, 최대 0.15m·0.6°
  dustEvery: 0.05, ringEvery: 0.09,
};

/** 샷 구간(초). 빈틈·겹침 없이 0~8초를 덮는다 */
export const SHOTS = [
  { id: 'pilot', name: '조종사 클로즈업', t0: 0, t1: 1 },
  { id: 'start', name: '엔진 시동과 출발', t0: 1, t1: 3 },
  { id: 'side', name: '측면 추적 이륙', t0: 3, t1: 5 },
  { id: 'gear', name: '랜딩기어 접힘', t0: 5, t1: 7 },
  { id: 'flyby', name: '저공 통과', t0: 7, t1: 8 },
];

/** 값 트랙: [시간, 값] 키프레임(시간 오름차순). 사이는 easeInOut */
export const TRACKS = {
  speed: [[0, 0], [1.5, 0], [3, 38], [4.6, 84], [6, 108], [7, 128], [8, 150]], // m/s
  agl: [[0, 0], [4.55, 0], [5.2, 5], [6, 24], [7, 62], [8, 120]], // m
  pitch: [[0, 0], [4.45, 0], [5, 11], [6.6, 9], [7.5, 3], [8, 0]], // 도
  gear: [[0, 1], [5.5, 1], [6.5, 0], [8, 0]], // 1 = 내림. 5.0~5.5초는 도어가 먼저 열리는 구간
  flap: [[0, 0], [3.5, 0], [4, 25], [4.5, 15], [6.6, 15], [7.4, 0], [8, 0]], // 도
  aileron: [[0, 0], [3.6, 0], [3.9, 0.35], [4.2, -0.25], [4.5, 0], [8, 0]],
  elevator: [[0, 0], [3.7, 0], [4.1, -0.3], [4.45, 0.2], [4.9, 0.8], [5.6, 0.2], [8, 0]],
  power: [[0, 0.12], [1, 0.12], [1.5, 0.7], [2, 1], [8, 1]], // 스로틀(노즐·불꽃)
  boost: [[0, 0], [1.2, 0], [1.6, 1], [7.4, 1], [8, 0.35]], // 애프터버너
  dim: [[0, 0.28], [0.5, 1], [8, 1]], // 조명: 어둡게 시작해 0.5초에 걸쳐 밝아진다
  mfd: [[0, 0], [0.15, 1], [0.25, 0.2], [0.4, 1], [0.5, 0.4], [0.65, 1], [8, 1]], // 계기판 전원 직후 깜빡임
  fov: [[0, 40], [1.5, 40], [1.75, 75], [2, 40], [8, 40]], // 조종석 샷의 FOV 펄스(0.5초)
  scaleZ: [[0, 1], [1.5, 0.85], [1.75, 1.15], [2, 1], [8, 1]], // 조종석 뷰 모델의 앞뒤 늘어남
  lean: [[0, 0], [1.5, 0], [1.9, 1], [2.6, 0.55], [3, 0.3], [8, 0]], // 가속에 몸이 뒤로 쏠림(관성 지연 후 복귀)
  blur: [[0, 0], [1.5, 0], [1.8, 0.5], [2.4, 0], [7.2, 0], [7.5, 0.6], [8, 0]], // 후처리 강조(높음·최고): 샷 2와 통과 순간만
};

/** 카메라 키프레임: 샷마다 [시간, 위치 xyz, 바라보는 점 xyz, FOV]. mode: rel = 기체 기준, cockpit = 1인칭, fixed = 고정 */
export const CAMERAS = {
  pilot: { mode: 'rel', keys: [[0, 0.05, 1.13, -4.25, 0, 1.03, -3.6, 40], [1, 0.02, 1.11, -4.2, 0, 1.03, -3.6, 40]] }, // 헬멧 앞 약 0.6m(계기판 덮개 안쪽: 밖에서는 덮개에 가려 얼굴이 안 보인다)
  start: { mode: 'cockpit', keys: [] },
  side: { mode: 'rel', keys: [[3, 23, 2.4, 2, 0, 0.6, 1.5, 36], [5, 19, 1.3, 11, 0, 0.5, 2.5, 32]] }, // 기체 약 25m, 뒷전(플랩)이 보이게 조금 뒤로 돈다
  gear: { mode: 'rel', keys: [[5, 20, -1.2, 3, 0, -0.6, 0, 38], [7, 19, -3.4, 5.5, 0, -0.8, 0, 38]] }, // 약 20m, 카메라를 낮춰 기체 하부가 보이게
  flyby: { mode: 'fixed', at: 7.75, offset: [36, -6, 0], lookAt: 7.3, fov: 50 }, // 통과 지점 옆에 고정(회전 없음): 기체가 멀리서 들어와 화면을 가로질러 나간다
};

const ease = (u) => u * u * (3 - 2 * u);

/** 트랙 값(순수) */
export function trackAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) return a[1] + (b[1] - a[1]) * ease((t - a[0]) / (b[0] - a[0]));
  }
  return keys[keys.length - 1][1];
}

export function shotAt(t) {
  for (const s of SHOTS) if (t < s.t1) return s;
  return SHOTS[SHOTS.length - 1];
}

// ── 표로 굽기 ──
const NAMES = Object.keys(TRACKS);
const RATE = 60;
const N = CINE.duration * RATE + 1;
const STRIDE = NAMES.length + 1; // + 이동 거리
const TABLE = new Float32Array(N * STRIDE);
{
  let dist = 0, prev = 0;
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    const speed = trackAt(TRACKS.speed, t);
    if (i > 0) dist += ((speed + prev) / 2) / RATE;
    prev = speed;
    for (let k = 0; k < NAMES.length; k++) TABLE[i * STRIDE + k] = trackAt(TRACKS[NAMES[k]], t);
    TABLE[i * STRIDE + NAMES.length] = dist;
  }
}

/** 시각 t의 기체 상태를 out에 담는다(표 보간, 할당 없음). out.dist = 활주 시작점부터의 거리 */
export function stateAt(t, out) {
  const x = Math.min(Math.max(t, 0), CINE.duration) * RATE;
  const i = Math.min(N - 2, Math.floor(x)), u = x - i, a = i * STRIDE, b = a + STRIDE;
  for (let k = 0; k < NAMES.length; k++) out[NAMES[k]] = TABLE[a + k] + (TABLE[b + k] - TABLE[a + k]) * u;
  out.dist = TABLE[a + NAMES.length] + (TABLE[b + NAMES.length] - TABLE[a + NAMES.length]) * u;
  return out;
}
export const newState = () => { const o = { dist: 0 }; for (const n of NAMES) o[n] = 0; return o; };

const _a = newState();
/**
 * 시각 t의 카메라. out = { mode, px, py, pz, lx, ly, lz, fov }.
 * rel: 기체 위치 기준 오프셋. fixed: 활주 시작점 기준(x, 지면 위 높이, z = -거리) 절대 위치.
 */
export function cameraAt(t, out) {
  const shot = shotAt(t), c = CAMERAS[shot.id];
  out.mode = c.mode; out.shot = shot.id;
  if (c.mode === 'cockpit') { out.fov = trackAt(TRACKS.fov, t); return out; }
  if (c.mode === 'fixed') {
    stateAt(c.at, _a);
    out.px = c.offset[0]; out.py = _a.agl + c.offset[1]; out.pz = -_a.dist + c.offset[2];
    stateAt(c.lookAt, _a);
    out.lx = 0; out.ly = _a.agl; out.lz = -_a.dist;
    out.fov = c.fov;
    return out;
  }
  const k = c.keys, a = k[0], b = k[k.length - 1];
  const u = ease(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))));
  out.px = a[1] + (b[1] - a[1]) * u; out.py = a[2] + (b[2] - a[2]) * u; out.pz = a[3] + (b[3] - a[3]) * u;
  out.lx = a[4] + (b[4] - a[4]) * u; out.ly = a[5] + (b[5] - a[5]) * u; out.lz = a[6] + (b[6] - a[6]) * u;
  out.fov = a[7] + (b[7] - a[7]) * u;
  return out;
}

/** 와류 흔들림 세기(0~1): 40m 안에서는 거리에 반비례, 밖에서는 env(0.5초에 걸쳐 0으로)만큼 남는다 */
export function wakeAmount(dist, env = 1) {
  const w = CINE.wake;
  return Math.min(1, w.near / Math.max(dist, 1)) * (dist <= w.range ? 1 : env);
}

/** 6~9Hz 노이즈(-1~1): 주파수가 다른 사인 셋의 합. seed로 축마다 다른 모양 */
export function wakeNoise(t, seed) {
  return (Math.sin(t * 6.1 * 6.283 + seed) + Math.sin(t * 7.7 * 6.283 + seed * 2.3) * 0.7 + Math.sin(t * 8.9 * 6.283 + seed * 4.1) * 0.5) / 2.2;
}

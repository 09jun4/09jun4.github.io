// 공용 수학 도우미. 프레임 중 할당을 피하려고 스칼라 함수 위주로 둔다.
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const remapClamped = (v, a, b, c, d) => c + (d - c) * clamp01((v - a) / (b - a));

export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** 프레임률과 무관한 지수 감쇠 계수. tau(초)가 작을수록 빨리 따라간다. */
export const dampFactor = (tau, dt) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));
export const damp = (cur, target, tau, dt) => cur + (target - cur) * dampFactor(tau, dt);

export function moveToward(cur, target, maxDelta) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

/** 각도를 [-PI, PI) 범위로 접는다. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** 재현 가능한 난수(mulberry32). 구름 배치처럼 매번 같아야 하는 곳에 쓴다. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng, lo, hi) => lo + (hi - lo) * rng();
export const randSign = (rng) => (rng() < 0.5 ? -1 : 1);

// 공통 수학 도우미 — 모든 시스템이 같은 함수를 써서 단위·범위를 일관되게 유지해요.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
// 프레임 속도와 무관한 지수 감쇠: rate(1/s)가 클수록 빨리 따라가요.
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const dampAngle = (cur, target, rate, dt) => cur + wrapAngle(target - cur) * (1 - Math.exp(-rate * dt));
export const KMH = 3.6;

// 시드 고정 난수 (맵 장식이 매번 같은 모양이 되도록)
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  return rng;
}
export const rand = makeRng((Date.now() ^ 0x5f3759df) >>> 0);

// 가중치 목록에서 하나 고르기: items = [{w, ...}]
export function weightedPick(items, rng = Math.random, key = 'w') {
  let total = 0;
  for (const it of items) total += Math.max(0, it[key] || 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const it of items) { r -= Math.max(0, it[key] || 0); if (r <= 0) return it; }
  return items[items.length - 1];
}

// 부드러운 1차원 노이즈 (바람 돌풍, 흔들림)
export function noise1(t, seed = 0) {
  const i = Math.floor(t), f = t - i;
  const h = (n) => { const x = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453; return x - Math.floor(x); };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

export async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`데이터를 불러오지 못했어요: ${url} (${res.status})`);
  return res.json();
}

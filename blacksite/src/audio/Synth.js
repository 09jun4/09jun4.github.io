// Web Audio 합성음: 외부 파일이 없을 때 쓰는 효과음·환경음·음악 버퍼를 코드로 만든다.
const SR = 44100;
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function make(ctx, dur, ch, fn) {
  const n = Math.floor(dur * SR);
  const b = ctx.createBuffer(ch, n, SR);
  for (let c = 0; c < ch; c++) {
    const d = b.getChannelData(c);
    fn(d, n, c);
  }
  return b;
}
// 간단한 1극 저역 필터 상태
const lp = (a) => { let y = 0; return (x) => (y += a * (x - y)); };
const hp = (a) => { let y = 0, px = 0; return (x) => { y = a * (y + x - px); px = x; return y; }; };
const q = (f, dur) => Math.round(f * dur) / dur; // 루프 길이에 맞춰 주파수 보정(이음매 없는 반복)
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

export const SOUNDS = {
  shot: (ctx) => make(ctx, 0.6, 1, (d, n) => {
    const f1 = lp(0.35), f2 = lp(0.06);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const crack = rnd() * env(t, 0.0005, 0.012);
      const body = f1(rnd()) * env(t, 0.001, 0.06) * 1.4;
      const thump = Math.sin(2 * Math.PI * (110 - t * 160) * t) * env(t, 0.001, 0.05) * 0.9;
      const tail = f2(rnd()) * env(t, 0.02, 0.22) * 1.2;
      d[i] = Math.tanh((crack + body + thump + tail) * 1.6) * 0.9;
    }
  }),
  guardShot: (ctx) => make(ctx, 0.7, 1, (d, n) => {
    const f1 = lp(0.22), f2 = lp(0.04);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const body = f1(rnd()) * env(t, 0.001, 0.08) * 1.6;
      const thump = Math.sin(2 * Math.PI * (80 - t * 90) * t) * env(t, 0.001, 0.07);
      const tail = f2(rnd()) * env(t, 0.03, 0.28) * 1.4;
      d[i] = Math.tanh((body + thump + tail) * 1.5) * 0.85;
    }
  }),
  dry: (ctx) => make(ctx, 0.08, 1, (d, n) => { const f = hp(0.6); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = f(rnd()) * env(t, 0.0005, 0.006) * 0.9 + Math.sin(t * 2 * Math.PI * 2400) * env(t, 0, 0.004) * 0.3; } }),
  magOut: (ctx) => make(ctx, 0.18, 1, (d, n) => { const f = lp(0.3); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (f(rnd()) * env(t, 0.001, 0.02) + Math.sin(t * 2 * Math.PI * 900) * env(t, 0, 0.015) * 0.4) * 0.9 + rnd() * env(Math.max(0, t - 0.09), 0.001, 0.01) * 0.3 * (t > 0.09); } }),
  magIn: (ctx) => make(ctx, 0.15, 1, (d, n) => { const f = lp(0.5); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (f(rnd()) * env(t, 0.0005, 0.012) * 1.2 + Math.sin(t * 2 * Math.PI * 1400) * env(t, 0, 0.01) * 0.5); } }),
  slide: (ctx) => make(ctx, 0.25, 1, (d, n) => { const f = hp(0.7); for (let i = 0; i < n; i++) { const t = i / SR; const a = env(t, 0.001, 0.015), b = t > 0.08 ? env(t - 0.08, 0.0005, 0.02) : 0; d[i] = f(rnd()) * (a * 0.7 + b * 1.1) + Math.sin(t * 2 * Math.PI * 700) * b * 0.4; } }),
  door: (ctx) => make(ctx, 0.9, 1, (d, n) => {
    const f = lp(0.05);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const servo = Math.sin(2 * Math.PI * (180 + t * 60) * t) * 0.15 * Math.sin(Math.PI * Math.min(1, t / 0.75));
      const air = f(rnd()) * Math.sin(Math.PI * Math.min(1, t / 0.75)) * 1.5;
      const clunk = t > 0.72 ? (Math.sin(2 * Math.PI * 70 * t) + f(rnd())) * env(t - 0.72, 0.002, 0.06) : 0;
      d[i] = (servo + air + clunk) * 0.6;
    }
  }),
  terminal: (ctx) => make(ctx, 0.22, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const f = t < 0.08 ? 1320 : 1760; d[i] = Math.sin(2 * Math.PI * f * t) * (t < 0.07 || (t > 0.1 && t < 0.18) ? 0.3 : 0) * env(t % 0.1, 0.002, 0.05); } }),
  complete: (ctx) => make(ctx, 0.8, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const notes = [880, 1108, 1318]; const k = Math.min(2, Math.floor(t / 0.12)); d[i] = Math.sin(2 * Math.PI * notes[k] * t) * env(t - k * 0.12, 0.004, 0.25) * 0.35; } }),
  hit: (ctx) => make(ctx, 0.06, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * 3200 * t) * env(t, 0.0005, 0.012) * 0.5 + rnd() * env(t, 0, 0.004) * 0.2; } }),
  kill: (ctx) => make(ctx, 0.14, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (Math.sin(2 * Math.PI * 2600 * t) * env(t, 0.0005, 0.02) + Math.sin(2 * Math.PI * 1950 * t) * env(Math.max(0, t - 0.05), 0.0005, 0.03) * (t > 0.05)) * 0.45; } }),
  hurt: (ctx) => make(ctx, 0.35, 1, (d, n) => { const f = lp(0.03); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (Math.sin(2 * Math.PI * (70 - t * 40) * t) * 1.2 + f(rnd()) * 2) * env(t, 0.003, 0.09) * 0.8; } }),
  uiClick: (ctx) => make(ctx, 0.05, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * 1800 * t) * env(t, 0.0005, 0.01) * 0.5; } }),
  uiHover: (ctx) => make(ctx, 0.03, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * 2600 * t) * env(t, 0.0005, 0.006) * 0.4; } }),
  alert: (ctx) => make(ctx, 0.45, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const f = t < 0.12 ? 740 : 988; d[i] = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.12 * env(t % 0.15, 0.003, 0.08) * (t < 0.3); } }),
  suspicious: (ctx) => make(ctx, 0.3, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * (520 + t * 300) * t) * env(t, 0.01, 0.1) * 0.25; } }),
  takedown: (ctx) => make(ctx, 1.2, 1, (d, n) => { const f = lp(0.04), g = lp(0.02); for (let i = 0; i < n; i++) { const t = i / SR; const whoosh = f(rnd()) * Math.exp(-((t - 0.25) ** 2) / 0.01) * 2.5; const thud = (Math.sin(2 * Math.PI * 55 * t) + g(rnd()) * 3) * (t > 0.9 ? env(t - 0.9, 0.004, 0.1) : 0); d[i] = (whoosh + thud) * 0.7; } }),
  impact: (ctx) => make(ctx, 0.12, 1, (d, n) => { const f = hp(0.5); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = f(rnd()) * env(t, 0.0005, 0.02) * 0.8; } }),
  whiz: (ctx) => make(ctx, 0.25, 1, (d, n) => { const f = hp(0.85); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = f(rnd()) * Math.exp(-((t - 0.08) ** 2) / 0.002) * 0.6; } }),
  log: (ctx) => make(ctx, 0.3, 1, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (Math.sin(2 * Math.PI * 660 * t) * (t < 0.1) + Math.sin(2 * Math.PI * 990 * t) * (t > 0.12 && t < 0.24)) * 0.25 * env(t % 0.12, 0.003, 0.06); } }),
  stepConcrete: (ctx) => make(ctx, 0.12, 1, (d, n) => { const f = lp(0.12); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (f(rnd()) * 2.2 * env(t, 0.002, 0.025) + Math.sin(2 * Math.PI * 90 * t) * env(t, 0.001, 0.02) * 0.4); } }),
  stepMetal: (ctx) => make(ctx, 0.2, 1, (d, n) => { const f = lp(0.25); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = f(rnd()) * 1.6 * env(t, 0.001, 0.02) + (Math.sin(2 * Math.PI * 420 * t) + Math.sin(2 * Math.PI * 1130 * t) * 0.5) * env(t, 0.001, 0.06) * 0.18; } }),
  stepTile: (ctx) => make(ctx, 0.1, 1, (d, n) => { const f = lp(0.35); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = f(rnd()) * 1.6 * env(t, 0.0008, 0.015) + Math.sin(2 * Math.PI * 1500 * t) * env(t, 0, 0.006) * 0.15; } }),
};

// 구역 환경음 (루프 6초, 스테레오)
function hum(ctx, freqs, noiseAmt, noiseCut, extra) {
  return make(ctx, 6, 2, (d, n, c) => {
    const f = lp(noiseCut);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      for (const [fr, a] of freqs) s += Math.sin(2 * Math.PI * q(fr, 6) * t + c) * a;
      s += f(rnd()) * noiseAmt;
      if (extra) s += extra(t, c);
      d[i] = s * 0.5;
    }
  });
}
export const AMBIENCE = {
  entry: (ctx) => hum(ctx, [[50, 0.12], [100, 0.05]], 0.5, 0.02),
  corridor: (ctx) => hum(ctx, [[60, 0.1], [120, 0.06], [180, 0.02]], 0.4, 0.03, (t) => Math.sin(2 * Math.PI * 7200 * t) * 0.004),
  security: (ctx) => hum(ctx, [[60, 0.08], [15734 / 2, 0.003]], 0.35, 0.03, (t) => (t % 3 < 0.06 ? Math.sin(2 * Math.PI * 2000 * t) * 0.03 : 0)),
  lab: (ctx) => hum(ctx, [[55, 0.1], [82.5, 0.05]], 0.35, 0.02, (t, c) => {
    const k = (t * 3.3 + c * 0.7) % 1; return k < 0.03 ? Math.sin(2 * Math.PI * (400 + k * 9000) * t) * 0.05 * (1 - k / 0.03) : 0;
  }),
  server: (ctx) => hum(ctx, [[120, 0.04], [240, 0.02]], 0.9, 0.18, (t) => (Math.floor(t * 9) % 7 === 0 && (t * 9) % 1 < 0.2 ? Math.sin(2 * Math.PI * 3400 * t) * 0.01 : 0)),
  control: (ctx) => hum(ctx, [[45, 0.14], [67.5, 0.06]], 0.35, 0.02, (t) => Math.sin(2 * Math.PI * 330 * t) * 0.02 * Math.max(0, Math.sin(2 * Math.PI * t / 3))),
};

// 음악: 잔잔한 패드(메뉴·잠입)와 긴장 레이어(교전)
export const MUSIC = {
  menu: (ctx) => pad(ctx, [55, 65.4, 82.4, 98], 12),
  stealth: (ctx) => pad(ctx, [49, 58.3, 73.4], 12),
  tension: (ctx) => make(ctx, 4.3636, 2, (d, n, c) => {
    // 110 BPM: 저음 펄스 + 하이햇 틱
    const beat = 60 / 110;
    const f = hp(0.9);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const b = t % (beat / 2);
      const bass = Math.sin(2 * Math.PI * q(41.2, 4.3636) * t) * env(b, 0.005, 0.12) * 0.55;
      const sub = Math.sin(2 * Math.PI * q(82.4, 4.3636) * t) * env(t % beat, 0.003, 0.08) * 0.2;
      const hat = f(rnd()) * env((t + beat / 4) % (beat / 2), 0.0005, 0.015) * 0.18;
      const drone = Math.sin(2 * Math.PI * q(61.7 + c * 0.3, 4.3636) * t) * 0.06;
      d[i] = bass + sub + hat + drone;
    }
  }),
};
function pad(ctx, freqs, dur) {
  return make(ctx, dur, 2, (d, n, c) => {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      freqs.forEach((f, k) => {
        const fq = q(f * (1 + (c ? 0.003 : -0.003) * (k + 1)), dur), f2 = q(fq * 2, dur);
        const lfo = 0.6 + 0.4 * Math.sin((2 * Math.PI * t) / dur * (k + 1) + k);
        s += (Math.sin(2 * Math.PI * fq * t) + 0.3 * Math.sin(2 * Math.PI * f2 * t)) * lfo;
      });
      d[i] = (s / freqs.length) * 0.22;
    }
  });
}

// 남성 음성 합성 (포먼트 방식): 성대 펄스 → 모음 공명(포먼트) 필터 → 짧은 신음.
// 외부 녹음 없이 낮은 '윽'·'억'·'크윽' 같은 신음을 여러 가지 만들어 무작위로 쓴다.
const SR = 44100;

// RBJ 밴드패스 (피크 0dB)
function bandpass(f, bw) {
  const w = (2 * Math.PI * f) / SR, q = f / bw, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  const a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const lowpass = (cut) => { const a = 1 - Math.exp((-2 * Math.PI * cut) / SR); let y = 0; return (x) => (y += a * (x - y)); };

// 모음 포먼트 (낮은 남성 목소리 기준) [주파수, 대역폭, 크기]
export const VOWELS = {
  eu: [[360, 70, 1], [1300, 110, 0.38], [2400, 160, 0.16]], // ㅡ
  eo: [[580, 80, 1], [1050, 100, 0.45], [2450, 160, 0.16]], // ㅓ
  u: [[330, 70, 1], [780, 90, 0.35], [2250, 160, 0.12]], // ㅜ
  a: [[700, 90, 1], [1150, 110, 0.5], [2500, 170, 0.15]], // ㅏ
};

let seed = 991;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// opts: { dur, f0, f0End, vowel, vowelEnd, attack, cut(끝을 성문 폐쇄로 뚝 끊음), breath, onset:'k'|'h'|null, onsetDur, fry(끝부분 갈라짐), gain }
export function voiceBuffer(ctx, o) {
  const onset = o.onset ? (o.onsetDur || 0.06) : 0;
  const dur = o.dur + onset;
  const n = Math.floor(dur * SR);
  const buf = ctx.createBuffer(1, n, SR);
  const d = buf.getChannelData(0);
  const V0 = VOWELS[o.vowel || 'eu'], V1 = VOWELS[o.vowelEnd || o.vowel || 'eu'];
  // 포먼트 필터는 모음 전환을 위해 두 세트를 섞는다
  const F0 = V0.map(([f, bw]) => bandpass(f, bw)), F1 = V1.map(([f, bw]) => bandpass(f, bw));
  const B0 = V0.map(([f, bw]) => bandpass(f, bw * 1.6)), B1 = V1.map(([f, bw]) => bandpass(f, bw * 1.6));
  const kBurst = bandpass(2200, 900), hBreath = bandpass(1200, 1400);
  const tone = lowpass(o.soft ? 3200 : o.bright ? 5200 : 4200);
  let phase = 0, prev = 0, jit = 1, amp = 1, cyc = 0;
  const rough = o.rough ?? 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    if (t < onset) {
      // 자음: 'ㅋ'은 짧은 파열 + 틈, 'ㅎ'은 숨소리
      if (o.onset === 'k') s = t < 0.018 ? kBurst(rnd()) * 2.2 * (1 - t / 0.018) : 0;
      else s = hBreath(rnd()) * 0.9 * Math.sin((Math.PI * t) / onset);
    } else {
      const u = (t - onset) / o.dur; // 0~1
      const base = o.f0Peak
        ? (u < 0.25 ? o.f0 + (o.f0Peak - o.f0) * Math.sin((u / 0.25) * Math.PI / 2) : o.f0Peak + (o.f0End - o.f0Peak) * ((u - 0.25) / 0.75))
        : o.f0 + (o.f0End - o.f0) * u;
      const f0 = base * (1 + Math.sin(t * 2 * Math.PI * 5.5) * 0.008);
      // 끝으로 갈수록 성대가 갈라지는(보컬 프라이) 불규칙한 떨림
      const fry = o.fry && u > 1 - o.fry ? (u - (1 - o.fry)) / o.fry : 0;
      phase += (f0 * (1 - fry * 0.55)) / SR * jit;
      if (phase >= 1) {
        phase -= 1; cyc++;
        jit = 1 + rnd() * (0.03 + rough * 0.09 + fry * 0.25);
        amp = (1 - rough * 0.35 * Math.abs(rnd())) * (cyc % 2 || rough < 0.3 ? 1 : 1 - rough * 0.45); // 그르렁은 거친 소리에만
      }
      const p = phase;
      const glot = p < 0.55 ? Math.sin((Math.PI * p) / 0.55) ** 2 : 0;
      const src = (glot - prev) * 18 * amp; prev = glot; // 성대 흐름의 미분 (자연스러운 배음 기울기)
      // 숨소리: 거칠수록 크고, 성대가 열릴 때마다 터져 나오게
      const noise = rnd() * (o.breath ?? 0.25) * (1 + rough * 1.6) * (0.35 + glot * (0.65 + rough));
      let a = 0, b = 0;
      for (let k = 0; k < 3; k++) {
        a += F0[k](src) * V0[k][2] + B0[k](noise) * V0[k][2];
        b += F1[k](src) * V1[k][2] + B1[k](noise) * V1[k][2];
      }
      const mix = Math.min(1, u * 1.4);
      s = a * (1 - mix) + b * mix;
      // 엔벨로프: 빠른 시작, 끝은 성문 폐쇄로 뚝(윽) 또는 서서히(으어…)
      const att = Math.min(1, (t - onset) / (o.attack || 0.015));
      const rel = o.cut ? (u > 0.85 ? Math.max(0, 1 - (u - 0.85) / 0.15) : 1) : Math.max(0, 1 - Math.max(0, u - 0.55) / 0.45);
      s *= att * rel * (1 - fry * 0.35);
    }
    d[i] = tone(s);
  }
  // 정규화
  // 모음(유성음) 부분 기준으로 크기를 맞춘다 (자음 파열음이 기준이 되면 신음이 작아짐)
  let peak = 0;
  for (let i = Math.floor(onset * SR); i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = (o.gain ?? 0.8) / Math.max(1e-6, peak);
  for (let i = 0; i < n; i++) d[i] = Math.tanh(d[i] * g * (1.2 + rough * 1.6)) * 0.85; // 거칠수록 더 찌그러뜨림
  return buf;
}

// 피격: 짧고 부드러운 외마디 비명 (살짝 올라갔다 떨어짐)
export const PAIN = [
  { dur: 0.17, f0: 170, f0Peak: 205, f0End: 160, vowel: 'a', cut: true, breath: 0.12, rough: 0.08, attack: 0.02, soft: true }, // 아!
  { dur: 0.15, f0: 165, f0Peak: 195, f0End: 150, vowel: 'eu', cut: true, breath: 0.12, rough: 0.08, attack: 0.02, soft: true }, // 윽
  { dur: 0.16, f0: 160, f0Peak: 190, f0End: 145, vowel: 'eo', cut: true, breath: 0.14, rough: 0.1, attack: 0.02, soft: true }, // 억
  { dur: 0.19, f0: 175, f0Peak: 215, f0End: 165, vowel: 'a', vowelEnd: 'eo', cut: true, breath: 0.12, rough: 0.08, attack: 0.02, soft: true }, // 아억
  { dur: 0.16, f0: 158, f0Peak: 185, f0End: 140, vowel: 'u', vowelEnd: 'eu', cut: true, breath: 0.14, rough: 0.1, attack: 0.025, soft: true }, // 읏
  { dur: 0.14, f0: 180, f0Peak: 220, f0End: 170, vowel: 'eo', cut: true, breath: 0.1, rough: 0.06, attack: 0.015, soft: true }, // 엇!
];
// 사망: 조금 길게, 힘이 빠지며 떨어지는 외마디
export const DEATH = [
  { dur: 0.42, f0: 175, f0Peak: 200, f0End: 115, vowel: 'a', vowelEnd: 'eo', breath: 0.18, rough: 0.12, fry: 0.2, soft: true }, // 아아…
  { dur: 0.38, f0: 165, f0Peak: 190, f0End: 110, vowel: 'eo', vowelEnd: 'u', breath: 0.2, rough: 0.12, fry: 0.2, soft: true }, // 어어…
  { dur: 0.4, f0: 170, f0Peak: 195, f0End: 112, vowel: 'eu', vowelEnd: 'eo', breath: 0.18, rough: 0.1, fry: 0.2, soft: true }, // 으어…
];
// 암살: 막히는 짧은 '윽'
export const TAKEDOWN_GRUNT = [
  { dur: 0.2, f0: 150, f0Peak: 175, f0End: 125, vowel: 'eu', cut: true, breath: 0.15, rough: 0.1, attack: 0.012, soft: true },
  { dur: 0.22, f0: 145, f0Peak: 168, f0End: 120, vowel: 'eu', vowelEnd: 'u', cut: true, breath: 0.18, rough: 0.12, attack: 0.012, soft: true },
];

// ChapterManager — 챕터 데이터(chapters.json) 관리 + 매 플레이마다 무작위 난이도 만들기.
// 날씨 가중치·이벤트 빈도·악천후 지속 확률·기온을 무작위로 섞어 챕터마다 다른 난이도가 되고,
// 너무 어려운 조합(점수 > maxScore)은 이벤트 빈도와 장시간 악천후 확률을 낮춰서 막아요.
import { clamp, lerp, rand } from '../core/utils.js';
import { WEATHER_TYPES } from '../weather/WeatherManager.js';

const SEVERITY = { clear: 0, rain: 0.6, snow: 1, wind: 0.6, fog: 0.45 };

export class ChapterManager {
  constructor(data, weatherDef) {
    this.data = data;
    this.weatherDef = weatherDef;
    this.list = data.chapters;
  }
  get(id) { return this.list.find((c) => c.id === id); }
  next(id) { const i = this.list.findIndex((c) => c.id === id); return this.list[i + 1] || null; }

  // 이번 플레이의 무작위 조건
  roll(ch) {
    const D = this.data.difficulty;
    const r = (a) => lerp(a[0], a[1], rand());
    const weights = {};
    for (const t of WEATHER_TYPES) weights[t] = this.weatherDef.types[t].weight * (ch.weatherBias?.[t] ?? 1) * r(D.weatherJitter);
    let eventRate = r(ch.eventRate) * r(D.globalRate);
    let longChance = r(D.longChance);
    const baseTemp = ch.baseTemp + (rand() * 2 - 1) * D.tempJitter;
    const score = () => {
      const tot = WEATHER_TYPES.reduce((s, t) => s + weights[t], 0);
      const sev = WEATHER_TYPES.reduce((s, t) => s + weights[t] * SEVERITY[t], 0) / tot;
      return clamp(sev * (0.6 + longChance * 0.9) * 0.75 + (eventRate - 0.7) * 0.45 + (baseTemp < 2 ? 0.12 : 0), 0, 1);
    };
    let diff = score();
    // 불가능한 조합 방지
    let guard = 0;
    while (diff > D.maxScore && guard++ < 10) {
      eventRate *= 0.88;
      longChance *= 0.85;
      weights.clear *= 1.15;
      diff = score();
    }
    eventRate = clamp(eventRate, 0.5, 1.6);
    // 시작 날씨: 가중치대로 (첫 챕터는 맑게 시작할 확률↑)
    const startPool = WEATHER_TYPES.map((t) => ({ t, w: weights[t] * (t === 'clear' ? (ch.no === 1 ? 3 : 1.2) : 1) }));
    let tot = startPool.reduce((s, x) => s + x.w, 0), k = rand() * tot, start = 'clear';
    for (const x of startPool) { k -= x.w; if (k <= 0) { start = x.t; break; } }
    const stars = clamp(Math.round(1 + diff * 4.4), 1, 5);
    const forecast = WEATHER_TYPES.filter((t) => t !== 'clear')
      .map((t) => ({ t, p: weights[t] / WEATHER_TYPES.reduce((s, u) => s + weights[u], 0) }))
      .sort((a, b) => b.p - a.p);
    return { weights, eventRate, longChance, baseTemp, start, difficulty: diff, stars, forecast, eventBias: ch.eventBias || {} };
  }
}

// WeatherManager — 날씨 '상태'만 계산해요(그래픽은 WeatherEffects).
// · 5가지 날씨가 가중치 무작위로 바뀌고, 짧은 변화와 긴 악천후가 섞여요.
// · 날씨끼리는 blendTime 동안 부드럽게 섞여서 전환돼요.
// · 노면 젖음(wetness)·적설(snowCover)은 날씨와 따로 관리 → 비가 그쳐도 길은 천천히 말라요.
// · 결과값(기온·바람·마찰 배율 등)이 물리와 캐릭터 상태에 실제로 반영돼요.
import { clamp, lerp, noise1, rand, weightedPick } from '../core/utils.js';

export const WEATHER_TYPES = ['clear', 'rain', 'snow', 'wind', 'fog'];

export class WeatherManager {
  constructor(def, frictionCfg) {
    this.def = def;
    this.fr = frictionCfg;
    this.listeners = {};
    this.reset({});
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, d) { (this.listeners[ev] || []).forEach((f) => f(d)); }

  /** opts: {baseTemp, weights:{type:w}, longChance, start:'clear'|..., wetness, rng} */
  reset(opts) {
    this.opts = opts;
    this.rng = opts.rng || rand;
    this.baseTemp = opts.baseTemp ?? 10;
    this.w = Object.fromEntries(WEATHER_TYPES.map((t) => [t, 0]));
    this.current = null;
    this.timer = 0;
    this.time = 0;
    this.wetness = opts.wetness ?? 0;
    this.snowCover = 0;
    this.windDir = this.rng() * Math.PI * 2;
    this.windBase = 0;
    this.history = [];
    this.temp = this.baseTemp; this.windSpeed = 0; this.gust = 0;
    this.set(opts.start || this._pick(null), true);
  }

  _weights() {
    const types = this.def.types;
    return WEATHER_TYPES.map((t) => ({ t, w: (this.opts.weights && this.opts.weights[t] !== undefined) ? this.opts.weights[t] : types[t].weight }));
  }
  _pick(exclude) {
    const list = this._weights().map((x) => ({ ...x, w: x.t === exclude ? x.w * 0.15 : x.w }));
    return (weightedPick(list, this.rng) || { t: 'clear' }).t;
  }

  set(type, instant = false) {
    const T = this.def.types[type];
    const long = this.rng() < (this.opts.longChance ?? this.def.longChance);
    const [a, b] = long ? T.long : T.short;
    const prev = this.current?.type;
    this.current = { type, long, duration: lerp(a, b, this.rng()), intensity: type === 'clear' ? 1 : lerp(0.65, 1, this.rng()) };
    this.timer = this.current.duration;
    this.windTarget = lerp(T.wind[0], T.wind[1], this.rng());
    if (type === 'wind') this.windDir = this.rng() * Math.PI * 2;
    if (instant) { for (const t of WEATHER_TYPES) this.w[t] = t === type ? this.current.intensity : 0; this.windBase = this.windTarget; }
    this.history.push({ type, at: this.time, long });
    if (prev && prev !== type) this.emit('change', { from: prev, to: type, long, name: T.name });
  }

  force(type) { this.set(type); this.timer = Math.max(this.timer, 40); }

  get type() { return this.current.type; }
  get name() { return this.def.types[this.current.type].name; }

  update(dt) {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) this.set(this._pick(this.current.type));
    // 날씨 비중을 부드럽게
    const rate = dt / this.def.blendTime;
    for (const t of WEATHER_TYPES) {
      const target = t === this.current.type ? this.current.intensity : 0;
      this.w[t] += clamp(target - this.w[t], -rate, rate);
    }
    // 바람: 기본 세기 + 돌풍 + 방향 흔들림
    this.windBase += clamp(this.windTarget - this.windBase, -1.5 * dt, 1.5 * dt);
    this.windDir += noise1(this.time * 0.05, 3) * 0.05 * dt;
    const g = this.def.gust;
    this.gust = Math.max(0, noise1(this.time * g.freq, 7)) * g.amount * (0.4 + this.w.wind);
    this.windSpeed = this.windBase * (1 + this.gust);

    // 기온
    let temp = this.baseTemp;
    for (const t of WEATHER_TYPES) temp += this.def.types[t].tempOffset * this.w[t];
    if (this.w.snow > 0) temp = lerp(temp, Math.min(temp, this.def.types.snow.maxTemp), clamp(this.w.snow * 1.5, 0, 1));
    this.temp = temp + noise1(this.time * 0.02, 11) * 0.3;

    // 노면 상태 (날씨와 별도로 천천히 변함)
    const R = this.def.road;
    const rain = this.rain, snow = this.snow;
    if (rain > 0.1) this.wetness = clamp(this.wetness + R.wetRate * rain * dt, 0, 1);
    else this.wetness = clamp(this.wetness - (R.dryRate + (this.temp > 12 ? R.dryWarmBonus : 0) + this.windSpeed * 0.0004) * dt, 0, 1);
    if (snow > 0.1 && this.temp < 1) this.snowCover = clamp(this.snowCover + R.snowRate * snow * dt, 0, 1);
    else {
      const melt = (this.temp > 1 ? R.meltRate * (1 + (this.temp - 1) * 0.3) : R.meltRate * 0.15) + rain * R.rainMelt;
      const before = this.snowCover;
      this.snowCover = clamp(this.snowCover - melt * dt, 0, 1);
      this.wetness = clamp(this.wetness + (before - this.snowCover) * 0.8, 0, 1); // 녹은 눈 → 젖은 길
    }
  }

  get rain() { return this.w.rain; }
  get snow() { return this.w.snow; }
  get fog() { return this.w.fog; }
  get overcast() { return clamp(WEATHER_TYPES.reduce((m, t) => Math.max(m, this.def.types[t].overcast * this.w[t]), 0), 0, 1); }
  get windX() { return Math.sin(this.windDir) * this.windSpeed; }
  get windZ() { return Math.cos(this.windDir) * this.windSpeed; }

  // 시야(안개) 거리: 각 날씨의 시야를 비중으로 섞음
  visibility() {
    let near = this.def.types.clear.visibility[0], far = this.def.types.clear.visibility[1];
    for (const t of WEATHER_TYPES) {
      if (t === 'clear') continue;
      const v = this.def.types[t].visibility, k = this.w[t];
      near = lerp(near, Math.min(near, v[0]), k);
      far = lerp(far, Math.min(far, v[1]), k);
    }
    return [near, far];
  }

  // 노면 마찰 배율 (물리에서 노면 종류별 기본 마찰에 곱해요)
  muMul(q) {
    const fr = this.fr;
    let m = 1 - fr.wetPenalty * this.wetness - fr.snowPenalty * this.snowCover * (q.surface === 'road' ? 1 : 0.85);
    if (q.crosswalk) m -= fr.crosswalkWetPenalty * this.wetness; // 젖은 횡단보도 페인트는 더 미끄러움
    return clamp(m, 0.2, 1);
  }

  // 플레이어 상태 시스템에 넘길 값
  envFor() {
    return { ambientTemp: this.temp, rain: this.rain, snow: this.snow, windSpeed: this.windSpeed, wetness: this.wetness, snowCover: this.snowCover };
  }

  // 무작위 난이도 계산용: 악천후 비중 (0~1)
  severity() { return clamp(this.rain * 0.7 + this.snow + this.w.wind * 0.6 + this.fog * 0.5, 0, 1); }
}

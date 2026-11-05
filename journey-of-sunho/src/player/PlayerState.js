// PlayerState — 선호의 5가지 상태. 모든 게이지는 0~100(체온만 °C)으로 같은 기준을 써요.
//  체온(bodyTemp °C)  : 페달 운동으로 열 생산 ↔ 기온·바람·주행풍·젖은 옷으로 열 손실
//  피로도(fatigue)     : 페달 출력에 비례해 누적, 오르막에서 크게 증가, 쉬면 회복
//  감기(sick)          : 저체온·젖은 채 악천후 노출이 쌓이면(coldRisk 100) 걸림 → 피로 증가·가속/회복 저하·재채기
//  균형(balance)       : 급조향·미끄러짐·급제동·연석·바람·충돌로 감소, 0이 되면 넘어짐
//  청결도(cleanliness) : 새똥·흙탕물·물 튀김 등으로 감소 → 캐릭터 외형에 반영
import { clamp, invLerp, rand } from '../core/utils.js';

const G = 9.81;

export class PlayerState {
  constructor(cfg, bikeCfg) {
    this.cfg = cfg;
    this.cfgBike = bikeCfg;
    this.listeners = {};
    this.reset();
  }

  reset() {
    const c = this.cfg;
    this.bodyTemp = c.baseBodyTemp;
    this.fatigue = 0;
    this.coldRisk = 0;
    this.sick = false;
    this.balance = 100;
    this.cleanliness = 100;
    this.clothesWet = 0;
    this.wobble = 0;
    this.sneezeTimer = 10;
    this.stats = { launches: 0, poop: 0, hits: 0, pickups: 0, splashes: 0, maxSpeed: 0, coldAt: null, minTemp: c.baseBodyTemp };
    this._t = 0;
    this._lastWindAcc = 0;
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, d) { (this.listeners[ev] || []).forEach((f) => f(d)); }

  // 이벤트 등에서 상태 변경: stat = 'cleanliness' | 'balance' | 'fatigue' | 'bodyTemp' | 'clothesWet' | 'coldRisk'
  modify(stat, delta) {
    const lim = stat === 'bodyTemp' ? [this.cfg.minBodyTemp, this.cfg.maxBodyTemp] : stat === 'clothesWet' ? [0, 1] : [0, 100];
    this[stat] = clamp(this[stat] + delta, lim[0], lim[1]);
  }

  // 체온이 낮을수록 0→1
  get chill() { return invLerp(this.cfg.tempWarn + 0.3, this.cfg.tempDanger - 0.6, this.bodyTemp); }

  // 물리에 주는 영향: 페달 출력 배율
  get powerMul() {
    let m = 1 - 0.55 * Math.pow(this.fatigue / 100, 1.6);
    if (this.sick) m *= 0.8;
    m *= 1 - 0.25 * this.chill;
    return clamp(m, 0.2, 1);
  }

  _thermal(dt, effort, env, speed) {
    const c = this.cfg;
    const amb = env.ambientTemp ?? 15;
    const air = speed + (env.windSpeed || 0) * 0.7;
    const gain = c.tempGain * effort + 0.002 + Math.max(0, c.baseBodyTemp - this.bodyTemp) * 0.004; // 운동 + 기초대사 + 떨림
    const loss = c.tempLossK * Math.max(0, 30 - amb) * (1 + air / 15) * (1 + this.clothesWet);
    let dT = gain - loss;
    if (this.bodyTemp > 37.2) dT -= (this.bodyTemp - 37.2) * 0.02; // 땀으로 식힘
    this.bodyTemp = clamp(this.bodyTemp + dT * dt, c.minBodyTemp, c.maxBodyTemp);
    // 옷 젖음
    const rain = env.rain || 0, snow = env.snow || 0;
    if (rain > 0.05 || snow > 0.05) this.clothesWet = clamp(this.clothesWet + (rain * c.clothesWetRain + snow * c.clothesWetRain * 0.35) * dt, 0, 1);
    else this.clothesWet = clamp(this.clothesWet - c.clothesDry * (amb > 10 ? 1.6 : 1) * dt, 0, 1);
    // 감기 위험
    if (!this.sick) {
      const lowT = Math.max(0, 36.0 - this.bodyTemp);
      const exposure = Math.max(rain, snow) * this.clothesWet;
      const inc = c.coldRiskRate * (lowT * 1.6 + exposure * c.coldRiskWetMult * (amb < 10 ? 1.2 : 0.6));
      if (inc > 0.01) this.coldRisk = clamp(this.coldRisk + inc * dt, 0, 100);
      else if (this.bodyTemp > 36.2) this.coldRisk = clamp(this.coldRisk - c.coldRiskRecover * dt, 0, 100);
      if (this.coldRisk >= 100) {
        this.sick = true;
        this.stats.coldAt = this._t;
        this.emit('cold');
      }
    }
    this.stats.minTemp = Math.min(this.stats.minTemp, this.bodyTemp);
  }

  update(dt, P, ctrl, env) {
    const c = this.cfg;
    this._t += dt;
    const v = P.v;
    const effort = clamp(P.power / 600, 0, 1.2);
    this._thermal(dt, effort, env, v);
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, v);

    // 피로도
    const uphill = Math.max(0, P.grade);
    let fInc = c.fatigueRate * P.power * (1 + uphill * c.fatigueUphill * 10);
    if (this.sick) fInc *= c.fatigueColdMult;
    if (P.power < 80) {
      let rec = c.fatigueRecover * (P.grade < -0.01 || v < 0.5 ? 1.3 : 1);
      if (this.sick) rec *= 0.5;
      rec *= 1 - 0.5 * this.chill;
      this.fatigue = clamp(this.fatigue - rec * dt, 0, 100);
    } else this.fatigue = clamp(this.fatigue + fInc * dt, 0, 100);

    // 균형
    const slippery = clamp(0.8 / Math.max(P.mu, 0.1), 0.8, 4);
    let loss = 0;
    loss += c.balanceSteerLoss * Math.abs(P.steerRate) * (v / 5) * slippery;
    loss += c.balanceSlipLoss * P.slip;
    loss += c.balanceSkidLoss * P.skid;
    if (v > 0.35 && v < 1.4 && ctrl.throttle > 0.05) loss += c.balanceSlowWobble;
    const gust = Math.abs(P.windSideAcc - this._lastWindAcc) / dt;
    this._lastWindAcc = P.windSideAcc;
    loss += Math.min(gust, 6) * c.balanceGustLoss + Math.max(0, Math.abs(P.windSideAcc) - 0.25) * c.balanceGustLoss * 2;
    if (P.surface === 'grass' && v > 2) loss += 3 * (v / 5);
    let instant = 0;
    if (P.bump > 0 && v > this.cfgBike.curbBumpSpeed) { instant += P.bump * c.balanceBumpLoss; this.emit('bump', P.bump); }
    if (P.hit) { instant += P.hit.speed * c.balanceHitLoss; this.stats.hits += P.hit.tag === 'person' ? 1 : 0; this.emit('hit', P.hit); }
    const speedStab = P.stopped ? 1.4 : clamp((v - 0.6) / 2.4, 0.25, 1);
    const recover = c.balanceRecover * speedStab * (1 - 0.4 * this.chill) * (this.sick ? 0.85 : 1);
    this.balance = clamp(this.balance + (recover - loss) * dt - instant, 0, 100);
    // 흔들림 (균형이 낮을수록 크게)
    const shaky = Math.pow(1 - this.balance / 100, 2);
    this.wobble = shaky * Math.sin(this._t * 7.3) * 0.14 + (this.chill > 0.3 ? Math.sin(this._t * 31) * 0.01 * this.chill : 0);

    // 청결도: 젖은 길에서 빠르게 달리면 뒷바퀴 물 튀김 (흙받이 없음)
    const spray = (env.wetness || 0) * 1 + (env.snowCover || 0) * 0.5;
    if (spray > 0.2 && v > 3) {
      const before = this.cleanliness;
      this.cleanliness = clamp(this.cleanliness - c.sprayLoss * spray * (v / 6) * dt, 0, 100);
      if (Math.floor(before / 6) !== Math.floor(this.cleanliness / 6)) this.emit('stain', 'mud');
    }

    // 감기: 재채기
    if (this.sick) {
      this.sneezeTimer -= dt;
      if (this.sneezeTimer <= 0) {
        this.sneezeTimer = c.sneezeMin + rand() * (c.sneezeMax - c.sneezeMin);
        this.balance = clamp(this.balance - 8, 0, 100);
        this.emit('sneeze');
      }
    }
  }

  // 넘어져 있는 동안: 체온만 계속 변하고 피로는 조금 회복
  passive(dt, env) {
    this._t += dt;
    this._thermal(dt, 0.1, env, 0);
    this.fatigue = clamp(this.fatigue - this.cfg.fatigueRecover * 0.5 * dt, 0, 100);
  }

  // 위험 단계: 0 정상, 1 주의, 2 위험
  level(stat) {
    const c = this.cfg;
    switch (stat) {
      case 'bodyTemp': return this.bodyTemp < c.tempDanger ? 2 : this.bodyTemp < c.tempWarn || this.bodyTemp > 37.8 ? 1 : 0;
      case 'fatigue': return this.fatigue > 85 ? 2 : this.fatigue > 60 ? 1 : 0;
      case 'balance': return this.balance < 25 ? 2 : this.balance < 50 ? 1 : 0;
      case 'cleanliness': return this.cleanliness < 25 ? 2 : this.cleanliness < 55 ? 1 : 0;
      default: return 0;
    }
  }
}

export { G };

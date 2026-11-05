// ScoreSystem — 귀가 결과 평가. 기준값은 data/balance.json의 score / comments에서 조정해요.
import { clamp } from '../core/utils.js';

const TITLES = { S: '귀가의 신', A: '모범 귀가생', B: '무난한 귀가', C: '험난한 귀가', D: '생존 귀가' };

export class ScoreSystem {
  constructor(cfg, comments) { this.cfg = cfg; this.comments = comments || []; }

  /** r: {time, length, bodyTemp, fatigue, sick, falls, cleanliness, poop, hits, pickups, stars} */
  evaluate(r) {
    const c = this.cfg;
    const par = r.length / (c.parSpeedKmh / 3.6);
    const ratio = par / Math.max(1, r.time);
    const parts = [];
    const add = (label, v) => { parts.push({ label, v: Math.round(v) }); return v; };
    let total = 0;
    total += add('기본 점수', c.base);
    total += add('시간 보너스', c.timeBonusMax * clamp((ratio - 0.4) / 0.8, 0, 1.25));
    total += add('넘어짐', -c.fallPenalty * r.falls);
    if (r.sick) total += add('감기', -c.coldPenalty);
    total += add('청결도', -(100 - r.cleanliness) * c.cleanWeight);
    total += add('피로도', -r.fatigue * c.fatigueWeight);
    const chill = Math.max(0, 36.3 - r.bodyTemp);
    if (chill > 0) total += add('체온 저하', -chill * c.tempWeight);
    total += add(`난이도 보너스 (별 ${r.stars}개)`, c.difficultyBonus * (r.stars - 1));
    const score = Math.max(0, Math.round(total));
    const grade = (c.grades.find((g) => score >= g.min) || c.grades[c.grades.length - 1]).grade;
    const vars = { falls: r.falls, poop: r.poop, clean: r.cleanliness, cold: r.sick, temp: r.bodyTemp, fatigue: r.fatigue, time: r.time, par, pickups: r.pickups, hits: r.hits };
    const comments = this.comments.filter((cm) => this._test(cm.if, vars)).map((cm) => cm.text).slice(0, 3);
    return { score, grade, title: TITLES[grade], parts, par, comments };
  }

  // 간단한 조건식: "falls>=5", "cold", "time<par"
  _test(expr, v) {
    const m = /^(\w+)\s*(>=|<=|==|>|<)?\s*([\w.]+)?$/.exec(expr.trim());
    if (!m) return false;
    const a = v[m[1]];
    if (!m[2]) return !!a;
    const b = v[m[3]] !== undefined ? v[m[3]] : Number(m[3]);
    switch (m[2]) {
      case '>=': return a >= b; case '<=': return a <= b; case '==': return a === b;
      case '>': return a > b; case '<': return a < b;
    }
    return false;
  }
}

// tuning.js — per-car upgrades bought with lap money.
// Load order: after garage.js, before track.js. Depends on: Cars, Garage.
//
// Every car (F4 .. F1) has its own five upgrade parts, each with levels
// 0..MAX_LEVEL. A part multiplies some of the car's physics values (cars.js
// `physics`) by the same percentage on every car, so the stock order holds
// at every level: the F1 is the best car both stock and fully tuned.
// Costs scale with the car's price, and each level costs more than the last.
// Levels are saved per car in the garage (Garage.tune).
(function () {
  'use strict';
  window.CR = window.CR || {};

  var MAX_LEVEL = 5;
  var COST_STEPS = [1, 2, 4, 7, 12]; // x the car's cost basis, for levels 1..5

  // gain: fraction per level. apply(p, k, base) changes physics copy p for
  // k levels; `effect(k)` is the short label shown in the menu.
  var PARTS = [
    { key: 'engine', name: '엔진', desc: '토크 증가 · 가속', gain: 0.045,
      apply: function (p, f) { p.TORQUE_SCALE = (p.TORQUE_SCALE || 1) * (1 + f); },
      effect: function (f) { return '토크 +' + Math.round(f * 100) + '%'; } },
    { key: 'aero', name: '에어로', desc: '공기저항 감소 · 최고속도', gain: 0.045,
      // Less drag, and a longer final drive so the redline comes later.
      apply: function (p, f) {
        p.DRAG_COEF = p.DRAG_COEF / (1 + 1.6 * f);
        p.FINAL_DRIVE = p.FINAL_DRIVE / (1 + f * 0.5);
      },
      effect: function (f) { return '최고속도 +' + Math.round(f * 50) + '%'; } },
    { key: 'tyres', name: '타이어', desc: '그립 증가 · 코너링', gain: 0.03,
      apply: function (p, f) { p.TIRE_GRIP_TARMAC *= 1 + f; },
      effect: function (f) { return '그립 +' + Math.round(f * 100) + '%'; } },
    { key: 'brakes', name: '브레이크', desc: '제동력 증가', gain: 0.05,
      apply: function (p, f) { p.MAX_BRAKE_DECEL *= 1 + f; },
      effect: function (f) { return '제동 +' + Math.round(f * 100) + '%'; } },
    { key: 'suspension', name: '서스펜션', desc: '조향 반응 향상', gain: 0.05,
      apply: function (p, f) { p.STEER_RESPONSE_RATE *= 1 + f; },
      effect: function (f) { return '조향 +' + Math.round(f * 100) + '%'; } },
  ];

  var Tuning = { MAX_LEVEL: MAX_LEVEL, PARTS: PARTS };

  function costBasis(car) {
    return 300 + car.price * 0.4; // F4 $300 .. F1 $4,300
  }

  // Level of a part on a car (0 when never tuned).
  Tuning.level = function (carId, key) {
    var t = CR.Garage.tune[carId];
    return (t && t[key]) || 0;
  };

  // Price of the next level, or null when maxed.
  Tuning.nextCost = function (car, key) {
    var lv = Tuning.level(car.id, key);
    if (lv >= MAX_LEVEL) return null;
    return Math.round((costBasis(car) * COST_STEPS[lv]) / 50) * 50;
  };

  // Total spent on a car so far.
  Tuning.spent = function (car) {
    var sum = 0;
    PARTS.forEach(function (part) {
      for (var i = 0; i < Tuning.level(car.id, part.key); i++) sum += Math.round((costBasis(car) * COST_STEPS[i]) / 50) * 50;
    });
    return sum;
  };

  // The car's physics with upgrades applied. `levels` overrides the saved
  // levels: a number sets every part (e.g. MAX_LEVEL for "fully tuned").
  Tuning.physics = function (car, levels) {
    var p = Object.assign({}, car.physics);
    PARTS.forEach(function (part) {
      var k = typeof levels === 'number' ? levels : Tuning.level(car.id, part.key);
      if (k > 0) part.apply(p, part.gain * k);
    });
    return p;
  };

  // Buys the next level of a part (car must be owned). Returns true on success.
  Tuning.upgrade = function (car, key) {
    var G = CR.Garage, cost = Tuning.nextCost(car, key);
    if (cost === null || !G.isOwned(car.id) || G.spendable() < cost) return false;
    return G.setTune(car.id, key, Tuning.level(car.id, key) + 1, cost);
  };

  CR.Tuning = Tuning;
})();

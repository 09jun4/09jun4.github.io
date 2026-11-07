// damage.js — RallyDamage: reads the car's part health (set by physics:
// impacts, hard landings, tyre wear, the rev limiter) and turns it into
// what the HUD shows. The physics already applies the effects:
//   tyres      -> grip and lateral stiffness (vaguer steering)
//   suspension -> softer spring / damper, sagging corner
//   engine     -> less torque
// With damage off in RALLY SETTINGS, nothing is ever reduced.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  function level(h) { return h > 0.85 ? 'ok' : h > 0.55 ? 'worn' : h > 0.25 ? 'bad' : 'dead'; }
  function label(h) { return Math.round(h * 100) + '%'; }
  RL.Damage = {
    level: level, label: label,
    summary: function (car) {
      return {
        tyres: car.wheels.map(function (w) { return w.tyre; }),
        suspension: car.wheels.map(function (w) { return w.susp; }),
        engine: car.engineHealth,
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

// cars.js — the cars in the shop: price, performance, engine sound, 3D model.
// Load order: 2nd (after config.js). Depends on: Config.
//
// Every car is a formula (single-seater) machine. On the ladder F4 -> F3 ->
// F2 -> F1, grip and steering scale with price (tier t = price / TOP_PRICE,
// tierPhysics) and the drivetrain/brakes follow the real series (DRIVE:
// 6-speed F4-F2, 8-speed F1; top speeds 240/270/320/350 km/h). Formula E is off the ladder: a
// single-speed electric car with huge instant torque (the quickest
// acceleration in the shop) but low grip, slow steering and steering that
// can ask for more than the tyres hold — hard to control.
// `moneyPerSecond` is the car's earning rate (rises with price): a lap at
// the reference pace pays it per second of the reference lap time, and
// quicker laps pay more (garage.js lapPay). `physics` keys override CR.Config while it is driven.
// `sound` is the engine voice for audio.js (see Audio.startEngine).
// `model` is the 3D model (renderer.js drawCarModel), parts drawn in order:
//   prism: [[x, y], ...] outline in car-local metres (nose +y), or
//   box: [centreX, centreY, width, length]
//   z: [bottom, top] height in metres; taper: top outline scale;
//   color: sides, top: top-face colour (defaults to color);
//   decal: flat shape ({poly} or {rect: [cx, cy, w, l]}, fill) painted on
//   the top of the previous prism.
//   wheel: [centreX, centreY, width, radius] — a round tyre that rolls with
//   the car and (front: true) steers; rim / stripe colours (renderer.js).
(function () {
  'use strict';
  window.CR = window.CR || {};

  var TOP_PRICE = 10000;

  // Money per second of lap time while driving this car: pricier cars earn
  // more. Tuned for ~30 s laps so each car pays for the next one in about
  // three to four laps (first lap of a race counts double as a best lap):
  // F4 $22/s, F3 $46/s, F2 $70/s, Formula E $78/s, F1 $102/s.
  var MONEY_BASE_PER_SECOND = 22;
  var MONEY_PER_SECOND_PER_1000 = 8; // extra $/s per $1,000 of price

  // Handling scales with the tier (grip and steering).
  function tierPhysics(t) {
    return {
      TIRE_GRIP_TARMAC: 1.12 + 0.48 * t, // cornering
      STEER_RESPONSE_RATE: 7 + 6 * t,
      CAR_MASS: 900,
      MAX_STEER_ANGLE: 0.6, // only reachable at low speed
    };
  }

  // Drivetrain and brakes per series, close to the real cars: gear count,
  // top speed and braking. FINAL_DRIVE puts the redline in top gear at ~103 %
  // of the top speed; DRAG_COEF was tuned (simulated with Car.measureStats) so
  // the car actually reaches it with its TORQUE_SCALE.
  var GEARS_6 = [3.8, 2.5, 1.8, 1.3, 1.0, 0.8];
  var GEARS_8 = [3.4, 2.55, 2.0, 1.62, 1.34, 1.12, 0.95, 0.8]; // F1: 8-speed
  var DRIVE = {
    //       gears    final drive  drag   torque  brakes (m/s^2)   top / 0-100
    // F4 / F3 (2026-10-04): closer to the real series. F4 (Tatuus T-421,
    // ~160 hp, ~570 kg, little downforce) keeps ~240 km/h but pulls harder,
    // grips and turns in better; F3 (Dallara F3, ~380 hp, ~670 kg, real
    // aero) now reaches its real ~300 km/h with more grip and brakes.
    // Their grip / steering override tierPhysics but stay below F2.
    f4: { GEAR_RATIOS: GEARS_6, FINAL_DRIVE: 4.289, DRAG_COEF: 0.551, TORQUE_SCALE: 0.97, MAX_BRAKE_DECEL: 17,
      TIRE_GRIP_TARMAC: 1.24, STEER_RESPONSE_RATE: 8.2 }, // 240 km/h, 1.55 s (was 1.8 s)
    f3: { GEAR_RATIOS: GEARS_6, FINAL_DRIVE: 3.431, DRAG_COEF: 0.352, TORQUE_SCALE: 1.2, MAX_BRAKE_DECEL: 21,
      TIRE_GRIP_TARMAC: 1.36, STEER_RESPONSE_RATE: 9.6 }, // 300 km/h, 1.4 s (was 270 km/h, 1.5 s)
    f2: { GEAR_RATIOS: GEARS_6, FINAL_DRIVE: 3.217, DRAG_COEF: 0.34, TORQUE_SCALE: 1.35, MAX_BRAKE_DECEL: 24 }, // 320 km/h, 1.3 s
    f1: { GEAR_RATIOS: GEARS_8, FINAL_DRIVE: 2.941, DRAG_COEF: 0.34, TORQUE_SCALE: 1.75, MAX_BRAKE_DECEL: 32 }, // 350 km/h, 1.15 s
  };

  // Formula E: one fixed gear (no shifting) geared for ~230 km/h at the
  // motor's limit, a flat, very high torque curve, and poor handling.
  function formulaEPhysics() {
    var p = tierPhysics(0.5);
    p.GEAR_RATIOS = [1.0];
    p.FINAL_DRIVE = 2.574; // motor limit at ~325 km/h
    p.TORQUE_SCALE = 1;
    p.TORQUE_CURVE = [
      { rpm: 900, torque: 2100 },
      { rpm: 7300, torque: 2100 },
      { rpm: 7500, torque: 0 }, // motor limit = hard top speed
    ];
    p.DRAG_COEF = 0.38; // -> 0-100 in 0.97 s, quickest in the shop
    p.TIRE_GRIP_TARMAC = DRIVE.f4.TIRE_GRIP_TARMAC + 0.05; // barely more than F4
    p.STEER_RESPONSE_RATE = 5.5; // slowest steering in the shop
    p.STEER_GRIP_TARGET = 1.45; // full lock asks for more than the tyres hold -> slides
    p.MAX_BRAKE_DECEL = 20;
    return p;
  }

  // Mirrors [x,y] points across the car's centreline: pass the right half
  // (x >= 0) from nose to tail, get a closed, symmetric outline.
  function mirror(rightHalf) {
    var pts = rightHalf.slice();
    for (var i = rightHalf.length - 1; i >= 0; i--) {
      if (rightHalf[i][0] !== 0) pts.push([-rightHalf[i][0], rightHalf[i][1]]);
    }
    return pts;
  }

  // --- Formula car model --------------------------------------------------
  //
  // One generator for every car. o: colours {main, dark, accent, helmet},
  // pod (sidepod half-width), wing (front/rear wing width scale), rearWing
  // (rear wing top height), fin (shark fin), halo, wheelPods (Formula E
  // style bodywork over the front wheels), length (overall scale).
  function formulaModel(o) {
    var s = o.length || 1, w = o.wing || 1, pod = o.pod || 0.62, carbon = '#1c1f26';
    var rw = o.rearWing || 1.0;
    var chassis = mirror([[0, 2.25 * s], [0.11, 2.2 * s], [0.2, 1.0 * s], [0.3, 0.72 * s], [pod, 0.42 * s], [pod + 0.04, -0.55 * s],
      [pod * 0.72, -1.25 * s], [0.22, -1.8 * s], [0, -1.85 * s]]);
    // Real formula tyres: narrower fronts, wider and taller rears; a
    // coloured compound stripe on the sidewall and a dark spoked rim.
    var rim = o.rim || '#2c3038', stripe = o.stripe || o.accent;
    var m = [
      { wheel: [0.8, -1.35 * s, 0.42, 0.33], rim: rim, stripe: stripe },
      { wheel: [-0.8, -1.35 * s, 0.42, 0.33], rim: rim, stripe: stripe },
      { wheel: [0.78, 1.35 * s, 0.34, 0.31], front: true, rim: rim, stripe: stripe },
      { wheel: [-0.78, 1.35 * s, 0.34, 0.31], front: true, rim: rim, stripe: stripe },
      { box: [0, 2.1 * s, 1.9 * w, 0.28], z: [0.06, 0.13], color: o.main }, // front wing
      { box: [0, 1.93 * s, 1.6 * w, 0.14], z: [0.13, 0.19], color: o.dark },
      { box: [0.95 * w, 2.05 * s, 0.05, 0.42], z: [0.06, 0.3], color: o.dark },
      { box: [-0.95 * w, 2.05 * s, 0.05, 0.42], z: [0.06, 0.3], color: o.dark },
      { box: [0, -1.95 * s, 0.9, 0.42], z: [0.04, 0.24], color: carbon }, // diffuser
    ];
    if (o.wheelPods) {
      // bodywork arching over the front wheels (Formula E look)
      m.push({ box: [0.78, 1.35 * s, 0.46, 0.9], z: [0.5, 0.7], taper: 0.85, color: o.main, top: o.accent });
      m.push({ box: [-0.78, 1.35 * s, 0.46, 0.9], z: [0.5, 0.7], taper: 0.85, color: o.main, top: o.accent });
    }
    m.push(
      { prism: chassis, z: [0.1, 0.46], color: o.main },
      { decal: { rect: [0, 1.55 * s, 0.09, 1.2 * s], fill: '#f4f7ff' } }, // nose stripe
      { decal: { rect: [pod - 0.12, -0.1 * s, 0.1, 0.8], fill: o.accent } }, // sidepod flashes
      { decal: { rect: [-(pod - 0.12), -0.1 * s, 0.1, 0.8], fill: o.accent } },
      { decal: { poly: [[-0.2, 0.5], [0.2, 0.5], [0.17, -0.3], [-0.17, -0.3]], fill: '#0b0e14' } }, // cockpit
      { prism: [[-0.1, 2.2 * s], [0.1, 2.2 * s], [0.18, 1.05 * s], [-0.18, 1.05 * s]], z: [0.14, 0.44], taper: 0.85, color: o.main }, // nose
      { box: [0, 0.02, 0.24, 0.3], z: [0.46, 0.72], taper: 0.75, color: o.helmet }, // helmet
      { prism: [[-0.2, -0.28], [0.2, -0.28], [0.13, -1.55 * s], [-0.13, -1.55 * s]], z: [0.46, 0.66], taper: 0.8, color: o.main }, // engine cover
      { box: [0, -0.42, 0.28, 0.34], z: [0.66, 0.96], taper: 0.7, color: o.dark } // airbox
    );
    if (o.fin) m.push({ box: [0, -1.15 * s, 0.05, 1.0 * s], z: [0.66, 0.92], color: o.main });
    if (o.halo) {
      m.push(
        { box: [0, 0.56, 0.06, 0.08], z: [0.46, 0.78], color: carbon },
        { box: [0.21, 0.16, 0.05, 0.8], z: [0.72, 0.79], color: carbon },
        { box: [-0.21, 0.16, 0.05, 0.8], z: [0.72, 0.79], color: carbon }
      );
    }
    var ry = -2.12 * s, half = 0.52 * w;
    m.push(
      { box: [0, ry + 0.04, 0.9 * w, 0.2], z: [0.34, 0.42], color: carbon }, // beam wing
      { box: [half, ry, 0.05, 0.48], z: [0.3, rw + 0.02], color: o.dark }, // endplates
      { box: [-half, ry, 0.05, 0.48], z: [0.3, rw + 0.02], color: o.dark },
      { box: [0, ry - 0.06, 1.04 * w, 0.3], z: [rw - 0.14, rw - 0.06], color: o.main }, // main plane
      { box: [0, ry + 0.1, 1.04 * w, 0.14], z: [rw - 0.06, rw], color: o.accent } // flap
    );
    return m;
  }

  // --- Engine voices ----------------------------------------------------------

  var SOUNDS = {
    f4: { cylinders: 4, pitch: 1.5, waves: ['square', 'sawtooth'], ratios: [1, 2], mix: [0.34, 0.2], sub: 0.15, cutoff: [1200, 5200], q: 5, rumble: 0.05, turbo: 0.02 },
    f3: { cylinders: 4, pitch: 1.9, waves: ['square', 'sawtooth'], ratios: [1, 2], mix: [0.3, 0.25], sub: 0.1, cutoff: [1500, 6500], q: 6, rumble: 0, turbo: 0 },
    f2: { cylinders: 6, pitch: 1.5, waves: ['sawtooth', 'square'], ratios: [1, 2], mix: [0.4, 0.2], sub: 0.15, cutoff: [1300, 6200], q: 5, rumble: 0, turbo: 0.04 },
    fe: { cylinders: 2, pitch: 4, waves: ['sine', 'triangle'], ratios: [1, 2.01], mix: [0.45, 0.2], sub: 0, cutoff: [3000, 9000], q: 2, rumble: 0, turbo: 0.07 },
    f1: { cylinders: 6, pitch: 1.8, waves: ['square', 'sawtooth'], ratios: [1, 2], mix: [0.32, 0.22], sub: 0.12, cutoff: [1400, 7000], q: 5, rumble: 0, turbo: 0.03 },
  };

  // --- The shop ---------------------------------------------------------------

  function car(def, physics, halfWidth, halfLength) {
    def.moneyPerSecond = MONEY_BASE_PER_SECOND + MONEY_PER_SECOND_PER_1000 * def.price / 1000;
    def.physics = physics;
    def.physics.CAR_HALF_WIDTH = halfWidth;
    def.physics.CAR_HALF_LENGTH = halfLength;
    return def;
  }
  function ladder(def, halfWidth, halfLength) {
    def.tier = def.price / TOP_PRICE;
    return car(def, Object.assign(tierPhysics(def.tier), DRIVE[def.id]), halfWidth, halfLength);
  }

  CR.Cars = {
    TOP_PRICE: TOP_PRICE,
    // Cheapest first; list[0] is the free starter car.
    list: [
      ladder({ id: 'f4', name: 'F4', tagline: '입문용 포뮬러 · 시작 차량', price: 0, color: '#e23b3b', sound: SOUNDS.f4,
        model: formulaModel({ main: '#f2f2f2', dark: '#a61f1f', accent: '#e23b3b', helmet: '#e23b3b', pod: 0.46, wing: 0.85, rearWing: 0.8, halo: true, length: 0.9 }) }, 0.92, 2.1),
      ladder({ id: 'f3', name: 'F3', tagline: '한 단계 위의 주니어 포뮬러', price: 3000, color: '#2fbf71', sound: SOUNDS.f3,
        model: formulaModel({ main: '#2fbf71', dark: '#0c3a22', accent: '#ffd23f', helmet: '#ffd23f', pod: 0.52, wing: 0.92, rearWing: 0.88, halo: true, length: 0.95 }) }, 0.93, 2.2),
      ladder({ id: 'f2', name: 'F2', tagline: 'F1 직전 단계의 고성능 포뮬러', price: 6000, color: '#3d7fe0', sound: SOUNDS.f2,
        model: formulaModel({ main: '#3d7fe0', dark: '#13233f', accent: '#f4f7ff', helmet: '#f4f7ff', pod: 0.58, wing: 0.97, rearWing: 0.95, halo: true, fin: true }) }, 0.95, 2.3),
      car({ id: 'fe', name: '포뮬러 E', tagline: '전기 · 1단 변속 · 순간 가속 최강, 대신 제어가 어려움', price: 7000, color: '#19d3c5', sound: SOUNDS.fe, electric: true,
        model: formulaModel({ main: '#101418', dark: '#0a0c0f', accent: '#19d3c5', helmet: '#19d3c5', pod: 0.6, wing: 1.0, rearWing: 0.62, halo: true, wheelPods: true }) },
        formulaEPhysics(), 0.95, 2.3),
      ladder({ id: 'f1', name: 'F1', tagline: '최고 성능 포뮬러 1 머신', price: 10000, color: '#d4a82a', sound: SOUNDS.f1,
        model: formulaModel({ main: '#16181d', dark: '#0b0c0f', accent: '#d4a82a', helmet: '#d4a82a', pod: 0.62, wing: 1.0, rearWing: 1.0, halo: true, fin: true }) }, 0.95, 2.3),
    ],
  };

  CR.Cars.formulaModel = formulaModel; // race.js builds the AI liveries with it

  CR.Cars.byId = function (id) {
    for (var i = 0; i < CR.Cars.list.length; i++) if (CR.Cars.list[i].id === id) return CR.Cars.list[i];
    return CR.Cars.list[0];
  };
})();

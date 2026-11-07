// data.js — every tunable number of the rally mode, kept apart from the logic.
// Surfaces, tyres, the car, stage lengths, corner grading, penalties and the
// graphics presets. Add asphalt or snow by adding an entry to SURFACES (and a
// grip line to every tyre) — nothing else has to change.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};

  // Tyre/road friction per surface.
  //  mu       peak friction coefficient (before the tyre's own grip factor)
  //  slipPeak longitudinal slip ratio where the force peaks
  //  anglePeak lateral slip angle (rad) where the force peaks
  //  falloff  share of the peak force left when sliding far past the peak
  //           (loose surfaces keep more: the tyre digs and pushes gravel)
  //  roll     rolling resistance (x load)
  //  visc     sinking drag: N per (m/s) per kN of load (mud grabs the car)
  var SURFACES = {
    gravel: { name: '흙길', mu: 1.05, slipPeak: 0.12, anglePeak: 0.15, falloff: 0.9, roll: 0.022, visc: 0.6, dust: [0.88, 0.82, 0.72], color: [0.64, 0.56, 0.44] },
    mud:    { name: '진흙', mu: 0.74, slipPeak: 0.18, anglePeak: 0.19, falloff: 0.8, roll: 0.055, visc: 3.2, dust: [0.30, 0.23, 0.16], color: [0.16, 0.115, 0.075] },
    grass:  { name: '흙밭', mu: 0.8, slipPeak: 0.15, anglePeak: 0.17, falloff: 0.84, roll: 0.040, visc: 1.4, dust: [0.66, 0.57, 0.44], color: [0.42, 0.33, 0.23] },
  };

  // Tyres: grip factor per surface, lateral stiffness factor, wear rate.
  // Gravel tyres are best on gravel; mud tyres (tall, open tread) dig into mud
  // but squirm on gravel. Soft = more grip, wears ~2.5x faster than hard.
  var TYRES = {
    gravel: {
      name: '자갈용',
      soft: { name: '소프트', grip: { gravel: 1.04, mud: 0.84, grass: 0.98 }, stiff: 1.0, wear: 1.0 },
      hard: { name: '하드',   grip: { gravel: 0.97, mud: 0.80, grass: 0.94 }, stiff: 1.06, wear: 0.4 },
    },
    mud: {
      name: '진흙용',
      soft: { name: '소프트', grip: { gravel: 0.90, mud: 1.14, grass: 1.02 }, stiff: 0.82, wear: 1.3 },
      hard: { name: '하드',   grip: { gravel: 0.86, mud: 1.07, grass: 0.98 }, stiff: 0.88, wear: 0.55 },
    },
  };

  // The rally car: a 4WD turbo hatch of the Rally2 class.
  var CAR = {
    name: 'R2 AWD',
    mass: 1260,              // kg with driver
    wheelbase: 2.48, track: 1.56, cgHeight: 0.52, frontWeight: 0.53,
    yawInertia: 1750, pitchInertia: 1650, rollInertia: 520,
    wheelRadius: 0.33, wheelInertia: 1.1, // kg m^2 per wheel (with brake disc)
    maxSteer: 0.6,           // rad (~34 deg) at the wheels
    // suspension (per wheel); stiffness/height settings scale these
    // ~1.6 Hz ride, damping ~0.55/0.8 of critical (rally dampers: soft springs,
    // long travel, strong damping so the body settles after one bump)
    spring: 26000, damperBump: 2900, damperRebound: 4800, travel: 0.31, restLength: 0.34, bumpStop: 160000,
    // engine: 1.6 turbo, tuned well past Rally2 (~280 hp / 420 Nm) for the game:
    // ~620 hp with a huge mid-range, 0-100 km/h is traction-limited (~2.8 s)
    idleRpm: 1050, redline: 7600, limiter: 7700, engineInertia: 0.16,
    torque: [[1000, 400], [2000, 680], [3000, 880], [4000, 940], [5000, 930], [6000, 880], [7000, 780], [7700, 650]],
    engineBrake: 150,        // Nm at redline, closed throttle (lifting slows the car ~0.25 g)
    gears: [3.10, 2.25, 1.76, 1.43, 1.19, 1.00], reverse: 3.2, finalDrive: 5.1,
    shiftTime: { AUTOMATIC: 0.12, MANUAL: 0.25, SEQUENTIAL: 0.05 },
    awdFront: 0.4,           // static front torque share (rear-biased: the tail steps out on power)
    driftFront: 0.1,         // front share while the car is sliding on the throttle
    centerLock: 480,         // Nm per rad/s of front/rear speed difference
    diffLock: 140,           // Nm per rad/s left/right (limited slip)
    brakeTorque: 3600,       // Nm total at full pedal (both axles)
    handbrakeTorque: 2400,   // Nm per rear wheel
    dragArea: 0.42,          // 0.5 * rho * Cd * A
    downforce: 0.05,
  };

  // Stage lengths: road metres aimed at the play time with ~70 km/h average.
  var LENGTHS = {
    short:  { name: 'SHORT',  label: '짧은 코스', km: 2.8,  time: '약 2~3분',  splits: 3 },
    medium: { name: 'MEDIUM', label: '보통 코스', km: 5.8,  time: '약 4~6분',  splits: 4 },
    long:   { name: 'LONG',   label: '긴 코스',   km: 11.6, time: '약 8~12분', splits: 6 },
  };

  // Corner grade (1 = tightest .. 6 = nearly flat) from the radius in metres.
  // A grade is what a co-driver would call: how fast the corner is.
  var GRADES = [
    { g: 1, max: 24 },
    { g: 2, max: 38 },
    { g: 3, max: 58 },
    { g: 4, max: 90 },
    { g: 5, max: 140 },
    { g: 6, max: 260 },
  ];
  function gradeOf(radius) {
    for (var i = 0; i < GRADES.length; i++) if (radius <= GRADES[i].max) return GRADES[i].g;
    return 0; // straight
  }
  // A representative radius for each grade (used by the generator).
  var GRADE_RADIUS = { 1: [17, 22], 2: [27, 36], 3: [41, 55], 4: [62, 86], 5: [96, 134], 6: [150, 240] };

  var PENALTIES = {   // seconds, all editable in RALLY SETTINGS
    offCourse: 5, collision: 2, rollover: 10, recover: 5, stuck: 10,
  };

  var GRAPHICS = {
    high: { resolution: 1.0, viewDistance: 900, shadows: true, particles: 1.0, vegetation: 1.0 },
    low:  { resolution: 0.7, viewDistance: 420, shadows: false, particles: 0.35, vegetation: 0.4 },
  };

  RL.Data = {
    SURFACES: SURFACES, TYRES: TYRES, CAR: CAR, LENGTHS: LENGTHS,
    GRADES: GRADES, GRADE_RADIUS: GRADE_RADIUS, gradeOf: gradeOf,
    PENALTIES: PENALTIES, GRAPHICS: GRAPHICS,
    ROAD_WIDTH: 7.2,
  };
})(typeof window !== 'undefined' ? window : globalThis);

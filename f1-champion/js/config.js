// config.js — single source of truth for all tunable constants.
// Load order: 1st (Section 1 of PLAN.md). No dependencies.
(function () {
  'use strict';
  window.CR = window.CR || {};

  CR.Config = {
    // --- World / physics fundamentals ---
    GRAVITY: 9.81,
    // Lighter car + ~20% more torque (2026-09-28): quicker acceleration.
    CAR_MASS: 900,
    WHEEL_RADIUS: 0.3,
    WHEELBASE: 2.6,
    // Short final drive (was 3.7): gears run out quickly, so shifting is
    // frequent — 1st tops out around 50 km/h, 6th around 240 km/h.
    FINAL_DRIVE: 4.4,
    GEAR_RATIOS: [3.8, 2.5, 1.8, 1.3, 1.0, 0.8],
    DRIVETRAIN_EFFICIENCY: 0.9,
    IDLE_RPM: 900,
    REDLINE_RPM: 7500,
    // Global multiplier on every car's torque (big acceleration boost,
    // 2026-09-28); each car's own TORQUE_SCALE multiplies on top.
    TORQUE_BOOST: 1.6,
    TORQUE_SCALE: 1, // per-car multiplier on TORQUE_CURVE (cars.js)
    TORQUE_CURVE: [
      { rpm: 900, torque: 145 },
      { rpm: 2000, torque: 265 },
      { rpm: 4500, torque: 385 },
      { rpm: 6000, torque: 360 },
      { rpm: 7000, torque: 275 },
      { rpm: 7500, torque: 145 },
    ],

    // --- Car footprint (wall collision) ---
    CAR_HALF_WIDTH: 0.95,
    CAR_HALF_LENGTH: 2.1,

    // --- Steering ---
    // Speed-sensitive lock: full lock never asks for more than
    // STEER_GRIP_TARGET x the tyre grip, so holding a key through a corner
    // at or below its safe speed is always fine; a tap at high speed is a
    // lane change, not a spin.
    //   limit = min(MAX_STEER_ANGLE, atan(WHEELBASE * STEER_GRIP_TARGET * mu * g / speed^2))
    MAX_STEER_ANGLE: 0.5, // radians, ~29deg — only reachable at low speed
    STEER_GRIP_TARGET: 1.15, // was 1.0 (more turning, 2026-10-01)
    STEER_RESPONSE_RATE: 5.0, // /s, ramp toward full lock
    // Low-speed turning boost: below LOW_SPEED_TURN_REF the tyres' turning
    // grip and the steering speed grow linearly, up to (1 + LOW_SPEED_TURN_BOOST)
    // x at a standstill — slow corners (hairpins, chicanes) turn much more
    // sharply, fast corners are unchanged. See CR.turnBoost below.
    LOW_SPEED_TURN_BOOST: 0.6,
    LOW_SPEED_TURN_REF: 30, // m/s (108 km/h)
    STEER_RETURN_RATE: 20.0, // /s, ramp back to centre (snappier than turn-in)
    WHEEL_STEER_MIN_VISUAL: 0.2, // rad, smallest full-lock wheel angle drawn (renderer)
    // Global handling boost on every car (2026-09-28, to match the higher
    // speeds): multiplies each car's STEER_RESPONSE_RATE and TIRE_GRIP_TARMAC
    // (main.js applyCar). More grip also raises every corner's wall speed.
    STEER_RESPONSE_BOOST: 1.6,
    GRIP_BOOST: 1.3,

    // --- Grip ---
    TIRE_GRIP_TARMAC: 1.15,
    // Sideways friction as a multiple of mu*g. 1.0 in normal driving removes
    // exactly as much sideways speed as full-lock steering creates, so the
    // car goes where it points.
    LATERAL_GRIP: 1.15, // matches STEER_GRIP_TARGET: full lock stays within grip

    // --- Slides ---
    SLIDE_ALIGN_RATE: 4.0, // /s, body straightens toward travel after a slide
    SLIDE_ALIGN_DEADBAND: 0.05, // rad; slip below this is left alone

    // --- Crashes ---
    // Hitting a wall with at least EXPLODE_IMPACT_SPEED m/s of speed INTO
    // the wall (the perpendicular part — glancing scrapes don't count) blows
    // the car up and retires it. Softer hits above BUMP_IMPACT_SPEED just
    // make a crash sound.
    EXPLODE_IMPACT_SPEED: 15, // m/s (54 km/h straight into the wall)
    BUMP_IMPACT_SPEED: 3.5, // m/s
    RETIRED_DECEL: 7, // m/s^2, the wreck rolls to a stop
    RETIRE_OVERLAY_DELAY: 1.2, // s of explosion before the RETIRED screen

    // --- Walls (at the outer edge of the run-off) ---
    WALL_BOUNCE: 0.2, // fraction of into-wall speed bounced back
    WALL_SCRAPE_DECEL: 6, // m/s^2 lost while in contact with a wall

    // --- Longitudinal forces ---
    MAX_BRAKE_DECEL: 8, // was 11: longer braking zones
    ROLLING_RESISTANCE_COEF: 0.015,
    DRAG_COEF: 0.35,
    FRONTAL_AREA: 2.0,
    AIR_DENSITY: 1.2,

    // --- Track ---
    TRACK_WIDTH: 14, // racing surface between the white lines (track limits)
    // Paved run-off beyond each white line; the wall is at its outer edge.
    // Width varies along the lap (track.js computeRunoff): RUNOFF_MIN on
    // straights, growing with corner sharpness on the outside of a corner
    // (RUNOFF_CORNER_K / radius, capped at RUNOFF_MAX), spread
    // RUNOFF_SPREAD metres before and after the corner so the entry and exit
    // are covered too. The inside of a corner gets RUNOFF_INSIDE_FRACTION of
    // that. Never wide enough to reach another part of the lap.
    // A car fully past a white line gets a lap-time penalty (laps.js).
    RUNOFF_MIN: 1.0,
    RUNOFF_MAX: 11,
    RUNOFF_CORNER_K: 420, // m^2: radius 40m -> 10.5m, radius 100m -> 4.2m
    RUNOFF_SPREAD: 18, // m; fades with the square of the distance, so it widens late
    RUNOFF_INSIDE_FRACTION: 0.3,
    TRACK_LIMIT_PENALTY: 5, // s
    TRACK_SAMPLE_SPACING: 4,
    STRAIGHT_SPEED_CAP: 999, // m/s sentinel — keeps color ratio near 0 on straights

    // --- Camera / rendering ---
    // Perspective chase camera (camera.js): behind and above the car,
    // pitched down, so the road ahead is visible far in advance.
    CAM_HEIGHT: 7.5, // m above the ground
    CAM_DISTANCE: 12, // m behind the car
    CAM_SPEED_PULLBACK: 4, // m extra distance at speed
    CAM_PITCH_DEG: 15, // look-down angle
    CAM_FOCAL: 1.1, // focal length as a fraction of the canvas height
    CAM_CENTER_Y: 0.35, // screen y of the view centre (fraction of height)
    VIEW_FAR: 380, // m, track farther than this ahead isn't drawn
    // Chase-cam lag: how fast the view swings round to the direction of
    // travel (1/s). Lower = the car visibly turns more before the view follows.
    CAMERA_ROTATE_RATE: 4.5,
    CAMERA_TRAVEL_MIN_SPEED: 2, // m/s; below this the camera follows the body
    MAX_DEVICE_PIXEL_RATIO: 1.25, // canvas resolution cap (main.js may scale further down)

    // Track colour = current speed / corner wall speed (track.js
    // computeMaxSafeSpeed: fastest speed that clears the corner without
    // touching the wall). Drawn as a translucent layer (alpha `a`) over the
    // asphalt: faint green -> yellow while the corner is still makeable,
    // hard switch to a stronger red at 1.0 = at this speed you hit the wall.
    SPEED_COLOR_STOPS: [
      { t: 0.0, r: 34, g: 197, b: 122, a: 0.06 },
      { t: 0.6, r: 34, g: 197, b: 122, a: 0.14 },
      { t: 0.999, r: 255, g: 209, b: 42, a: 0.45 },
      { t: 1.0, r: 237, g: 51, b: 61, a: 0.58 },
    ],


    // --- Nearest-sample search window (Section 3.5) ---
    NEAREST_SAMPLE_WINDOW: 30,
  };

  // Turning multiplier at speed v (m/s): 1 at/above LOW_SPEED_TURN_REF,
  // rising linearly to 1 + LOW_SPEED_TURN_BOOST at 0.
  CR.turnBoost = function (v) {
    var cfg = CR.Config;
    return 1 + cfg.LOW_SPEED_TURN_BOOST * Math.max(0, 1 - v / cfg.LOW_SPEED_TURN_REF);
  };

  // Shared small math helper used across files.
  CR.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };
})();

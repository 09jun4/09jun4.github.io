// ai.js — the drift race's AI driver.
// It drifts every corner (handbrake + steer from the curvature ahead, trimmed
// by the lateral offset and heading error), pure-pursuit in grip mode on the
// straights. `pace` (0.4..1.05) is how hard it drives; updatePace() moves it
// so the rival stays about TARGET_LEAD seconds ahead of the player: it slows
// when the player is far behind and drives flat out when the player is quick.
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};
  var AI = { TARGET_LEAD: 0.8, MIN_PACE: 0.4, MAX_PACE: 1.15 };

  AI.prepare = function (c, pace) {
    c.plan1 = DR.Physics.driftPlan(c);
    c.pace = pace || 0.8;
    c.paceI = 0;
    c.lane = c.lane || 0;
  };

  AI.input = function (c) {
    var C = DR.Course, S = C.samples, n = S.length, p = c.p, g = p.GRAVITY, A = p.DRIFT_TURN_ACCEL * p.TIRE_GRIP_TARMAC * g;
    var s = S[c.idx], pace = c.pace || 0.8;
    // Lane offset (side by side at the start) fades out over the first 200 m.
    var laneNow = c.lane * Math.max(0, 1 - Math.max(0, c.prog - S[C.startIndex].dist) / 200);
    var look = 6 + c.speed * 0.25, j = Math.min(n - 1, c.idx + Math.round(look / C.SPACING)), t = S[j];
    var kAhead = S[Math.min(n - 1, c.idx + Math.round((4 + c.speed * 0.5) / C.SPACING))].curvature;
    var off = (c.x - s.x) * s.nx + (c.y - s.y) * s.ny - laneNow;
    var trav = Math.atan2(c.vy, c.vx), psi = Math.atan2(Math.sin(trav - s.heading), Math.cos(trav - s.heading));
    var zone = Math.abs(kAhead) > 1 / 200 && c.speed > 11;
    var steer;
    if (zone) {
      var v = Math.max(c.speed, 8);
      steer = (kAhead * v * v) / A - 0.05 * off - 1.4 * psi;
    } else {
      var tx = t.x + t.nx * laneNow, ty = t.y + t.ny * laneNow, dx = tx - c.x, dy = ty - c.y;
      var ang = Math.atan2(dy, dx) - c.heading;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      var L = Math.max(4, Math.hypot(dx, dy)), k = (2 * Math.sin(ang)) / L, lim = p.MAX_STEER_ANGLE;
      if (c.vf > 0.1) lim = Math.min(lim, Math.atan((p.WHEELBASE * p.TIRE_GRIP_TARMAC * g) / (c.vf * c.vf)));
      steer = Math.atan(k * p.WHEELBASE) / lim;
    }
    steer = Math.max(-1, Math.min(1, steer));
    var want = c.plan1[Math.min(n - 1, c.idx + Math.round((c.speed * 0.4) / C.SPACING) + 2)] * Math.sqrt(pace);
    var dv = want - c.speed;
    var throttle = dv > -0.5 ? 1 : 0, brake = dv < -1.5 ? Math.min(1, -dv / 5) : 0;
    var drift = zone && Math.abs(steer) > 0.02 ? 1 : 0;
    if (drift && Math.abs(steer) < 0.15) steer = (steer < 0 ? -1 : 1) * 0.15;
    if (c.finished) { throttle = 0; brake = c.speed > 2 ? 0.6 : 0; drift = 0; }
    return { throttle: brake > 0 ? 0 : throttle, brake: brake, drift: drift, steer: steer };
  };

  // Keep the rival about TARGET_LEAD s ahead of the player (positive lead =
  // rival in front). PI on the gap.
  AI.updatePace = function (rival, player, dt) {
    var lead = (rival.prog - player.prog) / Math.max(12, player.speed);
    lead = Math.max(-6, Math.min(8, lead));
    var err = AI.TARGET_LEAD - lead;
    rival.paceI = Math.max(-0.35, Math.min(0.35, (rival.paceI || 0) + 0.05 * err * dt));
    var want = 0.8 + 0.16 * err + rival.paceI;
    want = Math.max(AI.MIN_PACE, Math.min(AI.MAX_PACE, want));
    rival.pace += (want - rival.pace) * Math.min(1, dt * 1.5);
    rival.lead = lead;
  };

  DR.AI = AI;
})();

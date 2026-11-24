// ai.js — the drift race's AI driver.
// It drifts every corner (handbrake + steer from the curvature ahead, trimmed
// by the lateral offset and heading error), pure-pursuit in grip mode on the
// straights. `pace` (0.4..1.35) is how hard it drives; updatePace() moves it
// so the rival stays about TARGET_LEAD seconds ahead of the player: it slows
// when the player is far behind and drives flat out when the player is quick.
(function () {
  'use strict';
  var DR = window.DR = window.DR || {};
  var AI = { TARGET_LEAD: 0.8, MIN_PACE: 0.4, MAX_PACE: 1.35, SWING: 1.1, SWING_PERIOD: 42 };

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
    var kAhead = S[Math.min(n - 1, c.idx + Math.round((4 + c.speed * (AI.LOOK || 0.5)) / C.SPACING))].curvature;
    var off = (c.x - s.x) * s.nx + (c.y - s.y) * s.ny - laneNow;
    var trav = Math.atan2(c.vy, c.vx), psi = Math.atan2(Math.sin(trav - s.heading), Math.cos(trav - s.heading));
    var zone = Math.abs(kAhead) > 1 / 200 && c.speed > 11;
    var want = c.plan1[Math.min(n - 1, c.idx + Math.round((c.speed * 0.4) / C.SPACING) + 2)] * Math.sqrt(pace);
    var dv = want - c.speed;
    var throttle = 1, brake = 0, steer = 0;
    // Same controls as the player (physics.js): brake tap + steer to start
    // a drift, steer into / against it to tighten / open it.
    if (c.drifting) {
      var v = Math.max(c.speed, 8);
      var need = ((kAhead * v * v) / A - 0.05 * off - 1.4 * psi) * c.driftDir;
      steer = need > c.amt + 0.04 ? c.driftDir : need < c.amt - 0.04 ? -c.driftDir : 0;
      if (dv < -3) brake = Math.min(1, -dv / 6); // scrub speed but keep the slide going
    } else if (zone && c.speed > p.DRIFT_MIN_SPEED + 1) {
      var vz = Math.max(c.speed, 8), sgn = kAhead > 0 ? 1 : -1;
      var depth = Math.abs(kAhead) * vz * vz / A;
      var tapFor = Math.max(0.06, Math.min(0.55, (depth - p.TAP_DEPTH0) / p.TAP_DEPTH_PER_S));
      if (!c.aiTap && !c.recoverT) c.aiTap = { t: 0, dur: tapFor, dir: sgn };
      steer = sgn;
      if (c.aiTap) {
        // brake for the tap; keep braking while too fast, but let go (and
        // so start the drift) by the time the corner itself arrives
        c.aiTap.t += 1 / 120;
        var inCorner = Math.abs(s.curvature) > 1 / 80;
        brake = c.aiTap.t < c.aiTap.dur || (dv < -2 && !inCorner && c.aiTap.t < 1.2) ? 1 : 0;
        throttle = brake ? 0 : 1;
        if (!brake) c.aiTap = null;
      } else if (dv < -1.5) { brake = Math.min(1, -dv / 5); throttle = 0; }
    } else {
      c.aiTap = null;
      var tx = t.x + t.nx * laneNow, ty = t.y + t.ny * laneNow, dx = tx - c.x, dy = ty - c.y;
      var ang = Math.atan2(dy, dx) - c.heading;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      var L = Math.max(4, Math.hypot(dx, dy)), k = (2 * Math.sin(ang)) / L, lim = p.MAX_STEER_ANGLE;
      if (c.vf > 0.1) lim = Math.min(lim, Math.atan((p.WHEELBASE * p.TIRE_GRIP_TARMAC * g) / (c.vf * c.vf)));
      steer = Math.max(-1, Math.min(1, Math.atan(k * p.WHEELBASE) / lim));
      if (dv < -1.5) { brake = Math.min(1, -dv / 5); throttle = 0; }
    }
    if (c.finished) { throttle = 0; brake = c.speed > 2 ? 0.6 : 0; steer = 0; }
    return { throttle: throttle, brake: brake, drift: 0, steer: steer, ai: true };
  };

  // Keep the rival about TARGET_LEAD s ahead of the player (positive lead =
  // rival in front). PI on the gap.
  AI.updatePace = function (rival, player, dt) {
    var lead = (rival.prog - player.prog) / Math.max(12, player.speed);
    lead = Math.max(-6, Math.min(8, lead));
    // The target lead swings (+0.8 s +/- SWING) so the rival sometimes drops
    // back and then attacks and overtakes, instead of sitting ahead all race.
    rival.aiT = (rival.aiT || 0) + dt;
    var target = AI.TARGET_LEAD + AI.SWING * Math.sin(2 * Math.PI * rival.aiT / AI.SWING_PERIOD + 1.2);
    var err = target - lead;
    rival.paceI = Math.max(-0.35, Math.min(0.35, (rival.paceI || 0) + 0.05 * err * dt));
    var want = 0.8 + 0.16 * err + rival.paceI;
    want = Math.max(AI.MIN_PACE, Math.min(AI.MAX_PACE, want));
    rival.pace += (want - rival.pace) * Math.min(1, dt * 1.5);
    rival.lead = lead;
  };

  DR.AI = AI;
})();

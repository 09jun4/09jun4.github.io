// track.js — segment walker + tessellated samples + on-track queries.
// Load order: after tracks.js. Depends on: Config, Tracks.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Track = {
    segments: [],   // runtime segment list (Section 2.2)
    samples: [],    // flat tessellated sample array (Section 2.3)
  };

  // --- 3.1 Segment walking formulas -----------------------------------

  function walkStraight(x, y, heading, length) {
    return {
      endX: x + length * Math.cos(heading),
      endY: y + length * Math.sin(heading),
      endHeading: heading,
    };
  }

  // t in [0,1] fraction of the corner's turnAngle; used both for the final
  // endpoint (t=1) and for tessellation (Section 3.4 step 2).
  function cornerPointAt(x, y, heading, radius, turnAngle, t) {
    var delta = turnAngle * t;
    var dxLocal = radius * Math.sin(Math.abs(delta));
    // Signed: a right turn (turnAngle < 0) bends toward local -y.
    var dyLocal = radius * (1 - Math.cos(delta)) * (turnAngle < 0 ? -1 : 1);
    var cosH = Math.cos(heading);
    var sinH = Math.sin(heading);
    var dx = dxLocal * cosH - dyLocal * sinH;
    var dy = dxLocal * sinH + dyLocal * cosH;
    return {
      x: x + dx,
      y: y + dy,
      heading: heading + delta,
    };
  }

  // --- Section 4: corner -> track-limit speed ----------------------------
  //
  // maxSafeSpeed is the fastest speed at which a car entering the corner on
  // the centreline and holding full (grip-mode) lock gets through without
  // going completely over the outer white line (the track-limit penalty in
  // laps.js). Above it renderer.js colours the track red.
  //
  // At speed v full lock gives lateral accel a = STEER_GRIP_TARGET*mu*g, so
  // the car drives a circle of radius R = v^2/a. If R > r it drifts outward
  // from the centreline; we find the largest R for which the car's inner
  // side stays inside the white line (half-width + car footprint, which grows
  // as the body turns relative to the track) until the car's heading has
  // caught up with the exit straight.
  function cornerClears(r, turnAngle, R, halfWidth) {
    var cfg = CR.Config;
    // Corner centre at origin, car starts at (r, 0) heading +y (left turn),
    // car circle centre at (r - R, 0); phi = how far the car has turned.
    // Since R >= r the car always lags the road (phi <= polar angle), so it
    // is checked against the corner's outer wall until it reaches the exit,
    // then against the exit straight's outer wall until its heading catches
    // up with the straight.
    var exitNx = Math.cos(turnAngle), exitNy = Math.sin(turnAngle);
    var steps = 160;
    for (var i = 1; i <= steps; i++) {
      var phi = (i / steps) * turnAngle;
      var px = r - R + R * Math.cos(phi), py = R * Math.sin(phi);
      var polar = Math.atan2(py, px);
      var outward, roadDir;
      if (polar < turnAngle) {
        outward = Math.sqrt(px * px + py * py) - r;
        roadDir = polar;
      } else {
        outward = px * exitNx + py * exitNy - r;
        roadDir = turnAngle;
      }
      // Car body is rotated by (phi - roadDir) relative to the road; it is
      // over the limit once even its inner side has crossed the white line.
      var rel = phi - roadDir;
      var extent = cfg.CAR_HALF_WIDTH * Math.abs(Math.cos(rel)) + cfg.CAR_HALF_LENGTH * Math.abs(Math.sin(rel));
      if (outward > halfWidth + extent) return false;
    }
    return true;
  }

  function computeMaxSafeSpeed(type, radius, turnAngle) {
    var cfg = CR.Config;
    if (type !== 'corner' || !(radius > 0) || !isFinite(radius)) return cfg.STRAIGHT_SPEED_CAP;
    var angle = Math.min(Math.abs(turnAngle || Math.PI), Math.PI - 1e-6);
    var lo = radius, hi = radius * 50;
    for (var it = 0; it < 28; it++) {
      var mid = (lo + hi) / 2;
      if (cornerClears(radius, angle, mid, cfg.TRACK_WIDTH / 2)) lo = mid;
      else hi = mid;
    }
    // What the tyres actually hold: steering may ask for more (STEER_GRIP_TARGET
    // > LATERAL_GRIP, e.g. Formula E) but then the car just slides.
    var latAccel = Math.min(cfg.STEER_GRIP_TARGET, cfg.LATERAL_GRIP) * cfg.TIRE_GRIP_TARMAC * cfg.GRAVITY;
    // Slow corners get the low-speed turning boost (CR.turnBoost), which
    // itself depends on the speed: v = sqrt(a * boost(v) * R), solved by
    // fixed-point iteration (converges in a few steps).
    var v = Math.sqrt(latAccel * lo);
    for (var k = 0; k < 6; k++) v = Math.sqrt(latAccel * CR.turnBoost(v) * lo);
    return v;
  }

  // --- 3.4 buildTrack() ---------------------------------------------------

  // Closes an authored lap. Turn angles must already sum to +-2*PI (heading
  // closes); this fixes the position gap by lengthening two straights whose
  // directions are furthest from parallel: gap = a*u1 + b*u2, solved for a, b.
  // Returns a new segment list (the authored one is left untouched).
  function closeLoop(def) {
    var out = def.map(function (d) { return Object.assign({}, d); });
    var x = 0, y = 0, heading = Math.PI / 2;
    var straights = [];
    for (var i = 0; i < out.length; i++) {
      var d = out[i];
      if (d.type === 'straight') {
        straights.push({ index: i, heading: heading });
        x += d.length * Math.cos(heading);
        y += d.length * Math.sin(heading);
      } else {
        var e = cornerPointAt(x, y, heading, d.radius, d.turnAngle, 1);
        x = e.x; y = e.y; heading = e.heading;
      }
    }
    var gx = -x, gy = -y;
    if (Math.hypot(gx, gy) < 0.01 || straights.length < 2) return out;

    var best = null, bestSin = 0;
    for (var p = 0; p < straights.length; p++) {
      for (var q = p + 1; q < straights.length; q++) {
        var sn = Math.abs(Math.sin(straights[q].heading - straights[p].heading));
        if (sn > bestSin) { bestSin = sn; best = [straights[p], straights[q]]; }
      }
    }
    if (!best || bestSin < 0.2) return out;
    var u1x = Math.cos(best[0].heading), u1y = Math.sin(best[0].heading);
    var u2x = Math.cos(best[1].heading), u2y = Math.sin(best[1].heading);
    var det = u1x * u2y - u1y * u2x;
    var a = (gx * u2y - gy * u2x) / det;
    var b = (u1x * gy - u1y * gx) / det;
    out[best[0].index].length += a;
    out[best[1].index].length += b;
    return out;
  }

  // Rotates the lap so it starts in the middle of its longest straight: the
  // start line (sample 0, where the car spawns and resets on a new race)
  // then always has a run-up before the first corner.
  // Also returns how much the heading has turned from the original start to
  // the new one (the sum of the turns before that straight).
  function startOnLongestStraight(def) {
    var best = -1;
    for (var i = 0; i < def.length; i++) {
      if (def[i].type === 'straight' && (best < 0 || def[i].length > def[best].length)) best = i;
    }
    if (best < 0) return { def: def, turned: 0 };
    var turned = 0;
    for (var j = 0; j < best; j++) if (def[j].type === 'corner') turned += def[j].turnAngle;
    var half = { type: 'straight', length: def[best].length / 2 };
    return { def: [half].concat(def.slice(best + 1), def.slice(0, best), [Object.assign({}, half)]), turned: turned };
  }

  // One real corner is often several consecutive arcs (real circuits are
  // traced as many short rounded segments). Judging each arc alone would
  // treat a 90deg bend as a string of gentle 15deg kinks and overstate its
  // speed, so arcs turning the same way with only short straights between
  // them (<= CORNER_GROUP_GAP) are grouped: every arc's speed is worked out
  // over the group's total turn angle.
  // Returns a speed per definition index (null for straights outside groups).
  var CORNER_GROUP_GAP = 25; // m
  function computeGroupSpeeds(def) {
    var speeds = new Array(def.length), n = def.length, i = 0;
    for (var k = 0; k < n; k++) speeds[k] = null;
    while (i < n) {
      if (def[i].type !== 'corner') { i++; continue; }
      var sign = def[i].turnAngle >= 0 ? 1 : -1;
      var angle = Math.abs(def[i].turnAngle);
      var last = i, j = i + 1;
      while (j < n) {
        var d = def[j];
        if (d.type === 'corner' && (d.turnAngle >= 0 ? 1 : -1) === sign) {
          angle += Math.abs(d.turnAngle);
          last = j;
          j++;
        } else if (d.type === 'straight' && d.length <= CORNER_GROUP_GAP && j + 1 < n &&
          def[j + 1].type === 'corner' && (def[j + 1].turnAngle >= 0 ? 1 : -1) === sign) {
          j++;
        } else {
          break;
        }
      }
      // Each arc keeps its own radius but is judged over the whole group's
      // turn, so a tight part keeps a low speed inside a long sweep; short
      // straights inside the group take the slower neighbouring arc's speed.
      for (var g = i; g <= last; g++) {
        if (def[g].type === 'corner') speeds[g] = computeMaxSafeSpeed('corner', def[g].radius, sign * angle);
      }
      for (g = i + 1; g < last; g++) {
        if (def[g].type !== 'corner') speeds[g] = Math.min(speeds[g - 1], speeds[g + 1]);
      }
      i = last + 1;
    }
    return speeds;
  }

  // Builds samples for a lap definition (defaults to the first entry in
  // CR.Tracks.list). See tracks.js for the authoring format.
  Track.buildTrack = function (definition) {
    var cfg = CR.Config;
    var authored = definition || CR.Tracks.list[0].segments;
    // Real circuits start at their start/finish line; generated layouts
    // start in the middle of their longest straight.
    var closed = closeLoop(authored);
    var rotated = authored.keepStart ? { def: closed, turned: 0 } : startOnLongestStraight(closed);
    var def = rotated.def;
    var groupSpeed = computeGroupSpeeds(def);
    var spacing = cfg.TRACK_SAMPLE_SPACING;
    var halfWidth = cfg.TRACK_WIDTH / 2;

    var segments = [];
    var samples = [];

    // Start facing the authored direction (real-world orientation), or
    // north for layouts without one.
    var x = 0, y = 0;
    var heading = (authored.startHeading !== undefined ? authored.startHeading : Math.PI / 2) + rotated.turned;

    for (var i = 0; i < def.length; i++) {
      var def_i = def[i];
      var startPoint = { x: x, y: y };
      var startAngle = heading;
      var seg;

      if (def_i.type === 'straight') {
        var length = def_i.length;
        var res = walkStraight(x, y, heading, length);
        seg = {
          type: 'straight',
          startPoint: startPoint,
          startAngle: startAngle,
          endAngle: res.endHeading,
          length: length,
          radius: Infinity,
          maxSafeSpeed: groupSpeed[i] !== null ? groupSpeed[i] : computeMaxSafeSpeed('straight', Infinity),
        };

        // Tessellate: linear interpolation between start/end.
        var nStraight = Math.max(1, Math.ceil(length / spacing));
        for (var s = 0; s < nStraight; s++) {
          var t = (s * spacing) / length;
          if (t >= 1) break;
          var px = x + length * t * Math.cos(heading);
          var py = y + length * t * Math.sin(heading);
          pushSample(samples, px, py, heading, seg.maxSafeSpeed, halfWidth, 0);
        }

        x = res.endX;
        y = res.endY;
        heading = res.endHeading;
      } else if (def_i.type === 'corner') {
        var radius = def_i.radius;
        var turnAngle = def_i.turnAngle;
        var arcLength = radius * Math.abs(turnAngle);
        var endRes = cornerPointAt(x, y, heading, radius, turnAngle, 1);
        seg = {
          type: 'corner',
          startPoint: startPoint,
          startAngle: startAngle,
          endAngle: endRes.heading,
          length: arcLength,
          radius: radius,
          maxSafeSpeed: groupSpeed[i],
        };

        // Tessellate: interpolate t in [0,1] along turnAngle.
        // Signed curvature (1/radius, sign following turnAngle) — positive
        // for a left turn, matching the world convention that increasing
        // heading = turning left (PLAN.md Section 0). Used by car.js's
        // (historical) road-curvature steering assist; kept as track data.
        var cornerCurvature = (turnAngle >= 0 ? 1 : -1) / radius;
        var nCorner = Math.max(1, Math.ceil(arcLength / spacing));
        for (var c = 0; c < nCorner; c++) {
          var tc = c / nCorner;
          var p = cornerPointAt(x, y, heading, radius, turnAngle, tc);
          pushSample(samples, p.x, p.y, p.heading, seg.maxSafeSpeed, halfWidth, cornerCurvature);
        }

        x = endRes.x;
        y = endRes.y;
        heading = endRes.heading;
      } else {
        continue; // unknown segment type — skip defensively
      }

      segments.push(seg);
    }

    Track.segments = segments;
    Track.samples = samples;
    Track.length = segments.reduce(function (sum, seg) { return sum + seg.length; }, 0); // m, one lap
    computeRunoff(samples);

    // Sanity/debug logging per PLAN.md Section 13 step 2.
    if (samples.length > 0) {
      var first = samples[0];
      var last = samples[samples.length - 1];
      var closureDist = Math.hypot(first.x - last.x, first.y - last.y);
      Track.minStraightLength = def.reduce(function (m, d) {
        return d.type === 'straight' ? Math.min(m, d.length) : m;
      }, Infinity);
      console.log(
        '[CR.Track] built ' + samples.length + ' samples over ' + segments.length +
        ' segments. Closure gap (last sample -> first sample): ' + closureDist.toFixed(2) + 'm ' +
        '(expected ~' + spacing.toFixed(1) + 'm, i.e. one sample spacing, since the loop is not duplicated).'
      );
    }

    return Track;
  };

  // Sets s.wallLeft / s.wallRight (distance from the centreline to each
  // wall) for every sample — see config.js RUNOFF_* — and s.bridge where
  // another part of the lap crosses (figure-of-eight circuits like Suzuka).
  function computeRunoff(samples) {
    var cfg = CR.Config, n = samples.length, half = cfg.TRACK_WIDTH / 2;
    var spread = Math.max(1, Math.round(cfg.RUNOFF_SPREAD / cfg.TRACK_SAMPLE_SPACING));
    var outL = new Float64Array(n), outR = new Float64Array(n);
    var reach = 2 * half + 6 + 2 * cfg.RUNOFF_MAX, reach2 = reach * reach;

    // Corner run-off on the outside (left turn -> right side), spread along
    // the lap with a linear fade.
    for (var i = 0; i < n; i++) {
      var k = samples[i].curvature;
      if (k === 0) continue;
      var w = Math.min(cfg.RUNOFF_MAX, cfg.RUNOFF_CORNER_K * Math.abs(k));
      for (var d = -spread; d <= spread; d++) {
        var j = ((i + d) % n + n) % n;
        var f = 1 - Math.abs(d) / (spread + 1);
        var v = w * f * f; // widens late, close to the corner
        if (k > 0) { if (v > outR[j]) outR[j] = v; } else if (v > outL[j]) outL[j] = v;
      }
    }

    for (var s = 0; s < n; s++) {
      var a = samples[s];
      var left = Math.max(cfg.RUNOFF_MIN, outL[s], outR[s] * cfg.RUNOFF_INSIDE_FRACTION);
      var right = Math.max(cfg.RUNOFF_MIN, outR[s], outL[s] * cfg.RUNOFF_INSIDE_FRACTION);

      // Keep clear of other parts of the lap: nearest non-adjacent sample
      // (more than 120m away along the track) limits how far walls reach.
      var nx = -Math.sin(a.heading), ny = Math.cos(a.heading);
      var limitL = Infinity, limitR = Infinity;
      a.bridge = false;
      for (var t = 0; t < n; t++) {
        var arc = Math.min(Math.abs(t - s), n - Math.abs(t - s)) * cfg.TRACK_SAMPLE_SPACING;
        if (arc < 120) continue;
        var dx = samples[t].x - a.x, dy = samples[t].y - a.y;
        var d2 = dx * dx + dy * dy;
        if (d2 > reach2) continue; // too far to ever limit the run-off
        var dist = Math.sqrt(d2);
        // Another part of the lap crosses here (over/under bridge): no walls
        // or run-off drawn, so neither road is visually blocked.
        if (dist < 2 * half + 6) a.bridge = true;
        var room = (dist - 2 * half - 4) / 2 - 1; // share the gap, 4m between walls
        if (dx * nx + dy * ny > 0) { if (room < limitL) limitL = room; } else if (room < limitR) limitR = room;
      }
      // Inside of a tight corner: the wall can't pass the corner centre.
      if (a.curvature > 0) limitL = Math.min(limitL, 1 / a.curvature - half - 2);
      if (a.curvature < 0) limitR = Math.min(limitR, -1 / a.curvature - half - 2);

      a.wallLeft = half + Math.max(0.5, Math.min(left, limitL));
      a.wallRight = half + Math.max(0.5, Math.min(right, limitR));
    }
  }

  function pushSample(samples, x, y, heading, maxSafeSpeed, halfWidth, curvature) {
    var nx = -Math.sin(heading);
    var ny = Math.cos(heading);
    samples.push({
      x: x,
      y: y,
      heading: heading,
      maxSafeSpeed: maxSafeSpeed,
      nx: nx, // left-pointing unit normal, cached for the renderer
      ny: ny,
      curvature: curvature, // signed 1/radius; 0 on straights (Section 0 sign convention)
      leftEdge: { x: x + nx * halfWidth, y: y + ny * halfWidth },
      rightEdge: { x: x - nx * halfWidth, y: y - ny * halfWidth },
    });
  }

  // Wraps a (possibly negative/out-of-range) sample index into [0, n).
  // Single shared implementation — used by findNearestSampleIndexNear and by
  // renderer.js's windowed draw loops, instead of each call site repeating
  // the `((i % n) + n) % n` expression.
  Track.wrapIndex = function (i) {
    var n = Track.samples.length;
    if (n === 0) return 0;
    return ((i % n) + n) % n;
  };

  // --- 3.5 Nearest-sample lookup (performance-critical) ------------------

  Track.findNearestSampleIndexNear = function (x, y, lastIndex, windowSize) {
    var samples = Track.samples;
    var n = samples.length;
    if (n === 0) return 0;
    var best = lastIndex;
    var bestDist = Infinity;
    for (var d = -windowSize; d <= windowSize; d++) {
      var i = Track.wrapIndex(lastIndex + d);
      var s = samples[i];
      var dx = s.x - x;
      var dy = s.y - y;
      var dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  };

  // --- isOnTrack ------------------------------------------------------

  // Perpendicular distance from (x,y) to the nearest sample's centerline
  // tangent line, compared against half the track width.
  Track.isOnTrack = function (x, y, nearestIndex) {
    var samples = Track.samples;
    if (samples.length === 0) return false;
    var idx = (typeof nearestIndex === 'number')
      ? nearestIndex
      : Track.findNearestSampleIndexNear(x, y, 0, samples.length);
    var s = samples[idx];
    // Perpendicular (normal-direction) distance from the sample's centerline.
    var nx = -Math.sin(s.heading);
    var ny = Math.cos(s.heading);
    var dx = x - s.x;
    var dy = y - s.y;
    var perpDist = Math.abs(dx * nx + dy * ny);
    return perpDist <= CR.Config.TRACK_WIDTH / 2;
  };

  // Exposed for isolated/unit testing (e.g. `node -e`).
  Track._walkStraight = walkStraight;
  Track._cornerPointAt = cornerPointAt;
  Track._computeMaxSafeSpeed = computeMaxSafeSpeed;
  Track._closeLoop = closeLoop;
  Track._startOnLongestStraight = startOnLongestStraight; // returns {def, turned}

  CR.Track = Track;
})();

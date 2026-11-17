// kerb.js — raised kerbs (the red / white strips outside the white lines on
// corners), shared by both renderers, the camera and the 리얼리스틱 physics.
//
// Real F1 kerbs: about 1.5–2 m wide (the FIA narrowed some to 1.5 m at the
// Red Bull Ring; 2 m is the usual), a low rounded hump with ridged paint that
// shakes the car, and on some corners a "sausage" kerb behind them (up to
// ~12 cm). Here: 1.5 m wide, rising over the first 0.3 m to 4 cm, with
// ridges every 0.6 m (±1.2 cm) that make the car and the camera vibrate.
// Purely visual in 연습 / AI 대전 (lap times unchanged); in 리얼리스틱 the
// kerbs also cost a little grip and unsettle the car (real-physics.js).
// Load order: after track.js. Depends on: Config, Track.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var K = {
    WIDTH: 1.5, // m
    HEIGHT: 0.04, // m, top of the hump
    RISE: 0.3, // m, width of the sloped inner edge
    RIDGE: 0.012, // m, ridge amplitude
    PITCH: 0.6, // m between ridges
    MIN_CURV: 1 / 300, // kerbs only on real corners (radius < 300 m)
    shake: 0, // player car vibration 0..1 (camera.js)
  };

  K.on = function (s) { return !!s && !s.bridge && Math.abs(s.curvature) >= K.MIN_CURV; };

  // Kerb surface height at a lateral offset (m, + = left) on sample s,
  // `along` = metres rolled (for the ridges). 0 off the kerb.
  K.SAUSAGE = 0.1; // m, sausage kerb height (real ones 5-12 cm)
  K.heightAt = function (s, offset, along) {
    var hw = CR.Config.TRACK_WIDTH / 2, d = Math.abs(offset) - hw;
    if (s && s.sausage && s.sausage === (offset > 0 ? 1 : -1) && d > K.WIDTH && d < K.WIDTH + 0.6) {
      var u = (d - K.WIDTH) / 0.6;
      return K.SAUSAGE * Math.sin(u * Math.PI);
    }
    if (!K.on(s)) return 0;
    if (d < 0 || d > K.WIDTH) return 0;
    var hump = Math.min(1, d / K.RISE) * (d > K.WIDTH - 0.1 ? (K.WIDTH - d) / 0.1 : 1);
    return K.HEIGHT * hump + K.RIDGE * hump * Math.abs(Math.sin(along * Math.PI / K.PITCH));
  };

  // Wheel heights for a car at (x, y) with heading h on sample index i:
  // [frontLeft, frontRight, rearLeft, rearRight] into out (reused).
  var WX = 0.8, WF = 1.35, WR = -1.35;
  K.wheels = function (x, y, h, i, along, out) {
    var S = CR.Track.samples;
    out = out || [0, 0, 0, 0];
    var s = S[i];
    if (!s || (!K.on(s) && !s.sausage)) { out[0] = out[1] = out[2] = out[3] = 0; return out; }
    var fx = Math.cos(h), fy = Math.sin(h), lx = -fy, ly = fx;
    var pts = [[WX, WF], [-WX, WF], [WX, WR], [-WX, WR]]; // car-local (left +, forward +)
    for (var k = 0; k < 4; k++) {
      var px = x + fx * pts[k][1] + lx * pts[k][0], py = y + fy * pts[k][1] + ly * pts[k][0];
      var off = (px - s.x) * s.nx + (py - s.y) * s.ny;
      out[k] = K.heightAt(s, off, along + pts[k][1]);
    }
    return out;
  };

  // Player car contact this frame: fraction of wheels on a kerb (0..1).
  var tmp = [0, 0, 0, 0];
  K.player = function () {
    var c = CR.Car.state;
    if (!CR.Track.samples.length) return 0;
    K.wheels(c.x, c.y, c.heading, c.nearestSampleIndex, c.wheelDist || 0, tmp);
    var n = 0;
    for (var k = 0; k < 4; k++) if (tmp[k] > 0.004) n++;
    return n / 4;
  };

  CR.Kerb = K;
})();

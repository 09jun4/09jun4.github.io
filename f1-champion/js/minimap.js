// minimap.js — north-up overview of the whole lap with the car's position.
// Load order: after renderer.js. Depends on: Config, Track, Car.
//
// The track outline is drawn once per track (and on resize) into an
// offscreen canvas; each frame copies it and draws the car marker. The map
// never rotates: world +y (north) is always up.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Minimap = {};

  var TRACK_OUTLINE = 'rgba(0, 0, 0, 0.55)';
  var TRACK_COLOR = '#d9dce2';
  var START_COLOR = '#ffd23f';
  var NORTH_COLOR = 'rgba(245, 247, 251, 0.7)';
  var PADDING = 12; // CSS px around the track

  var canvas = null, ctx = null, cache = null;
  var cssSize = 0, dpr = 1;
  var scale = 1, offsetX = 0, offsetY = 0; // world -> minimap CSS px

  function toMapX(x) { return offsetX + x * scale; }
  function toMapY(y) { return offsetY - y * scale; } // flip: world +y is up

  // Fits the current track into the square and draws its outline to `cache`.
  function drawTrackCache() {
    var samples = CR.Track.samples;
    if (!canvas || samples.length < 2) return;

    cssSize = canvas.clientWidth || 180;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cache.width = Math.round(cssSize * dpr);
    canvas.height = cache.height = Math.round(cssSize * dpr);

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    var inner = cssSize - PADDING * 2;
    scale = inner / Math.max(maxX - minX, maxY - minY, 1);
    offsetX = PADDING + (inner - (maxX - minX) * scale) / 2 - minX * scale;
    offsetY = PADDING + (inner - (maxY - minY) * scale) / 2 + maxY * scale;

    var c = cache.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cssSize, cssSize);
    c.lineJoin = 'round';

    c.beginPath();
    c.moveTo(toMapX(samples[0].x), toMapY(samples[0].y));
    for (var j = 1; j < samples.length; j++) c.lineTo(toMapX(samples[j].x), toMapY(samples[j].y));
    c.closePath();
    c.strokeStyle = TRACK_OUTLINE;
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = TRACK_COLOR;
    c.lineWidth = 3;
    c.stroke();

    // Start/finish tick across the track.
    var s0 = samples[0];
    var nx = -Math.sin(s0.heading), ny = Math.cos(s0.heading);
    var half = 5 / scale;
    c.beginPath();
    c.moveTo(toMapX(s0.x + nx * half), toMapY(s0.y + ny * half));
    c.lineTo(toMapX(s0.x - nx * half), toMapY(s0.y - ny * half));
    c.strokeStyle = START_COLOR;
    c.lineWidth = 2.5;
    c.stroke();

    // North marker.
    c.fillStyle = NORTH_COLOR;
    c.font = '700 11px system-ui, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'top';
    c.fillText('N ↑', cssSize - 6, 5);
  }

  Minimap.init = function () {
    canvas = document.getElementById('minimap');
    ctx = canvas.getContext('2d');
    cache = document.createElement('canvas');
    window.addEventListener('resize', drawTrackCache);
  };

  // Call after Track.buildTrack.
  Minimap.setTrack = function () {
    drawTrackCache();
  };

  Minimap.update = function () {
    if (!canvas || !cssSize) return;
    var car = CR.Car.state;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cache, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // AI cars in a race: team-coloured dots.
    if (CR.Race && CR.Race.active) {
      var ais = CR.Race.ai;
      for (var i = 0; i < ais.length; i++) {
        ctx.beginPath();
        ctx.arc(toMapX(ais[i].x), toMapY(ais[i].y), 3.6, 0, Math.PI * 2);
        ctx.fillStyle = ais[i].driver.main;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.stroke();
      }
    }

    // Car: arrow pointing along its heading (screen y is flipped).
    var x = toMapX(car.x), y = toMapY(car.y);
    var fx = Math.cos(car.heading), fy = -Math.sin(car.heading);
    var lx = -fy, ly = fx;
    ctx.beginPath();
    ctx.moveTo(x + fx * 7, y + fy * 7);
    ctx.lineTo(x - fx * 4 + lx * 4.5, y - fy * 4 + ly * 4.5);
    ctx.lineTo(x - fx * 2, y - fy * 2);
    ctx.lineTo(x - fx * 4 - lx * 4.5, y - fy * 4 - ly * 4.5);
    ctx.closePath();
    ctx.fillStyle = CR.Car.def ? CR.Car.def.color : '#3d7fe0';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  };

  CR.Minimap = Minimap;
})();

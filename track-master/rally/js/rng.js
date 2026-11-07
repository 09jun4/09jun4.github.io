// rng.js — reproducible random numbers for the rally stage generator.
// Never Math.random(): every stream is derived from the stage seed plus a
// label, so the road, the surfaces, the terrain and the props each have their
// own stream (changing how props are scattered never moves the road).
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};

  // xmur3 string hash -> 32-bit seed
  function hash(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  // sfc32 generator seeded from the hash of (seed + ':' + label)
  function stream(seed, label) {
    var s = String(seed) + ':' + (label || '');
    var a = hash(s), b = hash(s + 'b'), c = hash(s + 'c'), d = hash(s + 'd');
    function next() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    }
    for (var i = 0; i < 12; i++) next();
    var r = {
      next: next,
      range: function (lo, hi) { return lo + (hi - lo) * next(); },
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      chance: function (p) { return next() < p; },
      sign: function () { return next() < 0.5 ? -1 : 1; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      // weighted pick: [[item, weight], ...]
      weighted: function (list) {
        var tot = 0, i;
        for (i = 0; i < list.length; i++) tot += list[i][1];
        var x = next() * tot;
        for (i = 0; i < list.length; i++) { x -= list[i][1]; if (x <= 0) return list[i][0]; }
        return list[list.length - 1][0];
      },
    };
    return r;
  }

  // Seeds shown to players: 8 characters, no look-alike letters.
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomSeed() {
    var out = '', buf = new Uint32Array(8);
    if (G.crypto && G.crypto.getRandomValues) G.crypto.getRandomValues(buf);
    else for (var i = 0; i < 8; i++) buf[i] = (Date.now() * (i + 7)) ^ (i * 2654435761);
    for (var j = 0; j < 8; j++) out += ALPHA[buf[j] % ALPHA.length];
    return out;
  }
  // Player-typed seeds: trim, upper-case, letters/digits/-/_ only, max 16.
  function cleanSeed(s) {
    return String(s || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
  }

  // 2D value noise + fBm (seeded) for the terrain.
  function noise2(seed) {
    var P = new Uint8Array(512), r = stream(seed, 'noise'), i;
    var perm = []; for (i = 0; i < 256; i++) perm.push(i);
    for (i = 255; i > 0; i--) { var j = Math.floor(r.next() * (i + 1)), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < 512; i++) P[i] = perm[i & 255];
    var V = new Float32Array(256); for (i = 0; i < 256; i++) V[i] = r.next() * 2 - 1;
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function n(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var X = xi & 255, Y = yi & 255;
      var a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
      var u = fade(xf), v = fade(yf);
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }
    function fbm(x, y, oct) {
      var s = 0, amp = 1, f = 1, tot = 0;
      for (var o = 0; o < (oct || 4); o++) { s += amp * n(x * f, y * f); tot += amp; amp *= 0.5; f *= 2.03; }
      return s / tot;
    }
    return { n: n, fbm: fbm };
  }

  RL.Rng = { hash: hash, stream: stream, randomSeed: randomSeed, cleanSeed: cleanSeed, noise2: noise2 };
})(typeof window !== 'undefined' ? window : globalThis);

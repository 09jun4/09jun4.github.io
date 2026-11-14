// hi-tex.js — procedural textures for the 높음 renderer (no image files):
// asphalt (+ normal map, rubbered racing line), concrete, grass, kerbs, chain-link
// fence, chequers, crowd, sponsor boards, numbers, smoke / spark sprites, tyre
// sidewalls (sharp + spin-blurred). Everything is drawn once per renderer and
// disposed with it (HiRenderer tracks every texture it gets from here).
// Load order: after three.min.js. Depends on: THREE.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};

  // --- Seeded value noise (tileable over `period` lattice cells) ---------------
  function makeNoise(seed) {
    var p = new Uint8Array(512), s = seed | 0 || 1;
    for (var i = 0; i < 256; i++) p[i] = i;
    for (var j = 255; j > 0; j--) {
      s = (s * 16807) % 2147483647;
      var k = s % (j + 1), t = p[j]; p[j] = p[k]; p[k] = t;
    }
    for (var m = 0; m < 256; m++) p[m + 256] = p[m];
    function h(x, y) { return p[p[x & 255] + (y & 255)] / 255; }
    return function (x, y, period) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var px = period || 256, x0 = ((xi % px) + px) % px, y0 = ((yi % px) + px) % px, x1 = (x0 + 1) % px, y1 = (y0 + 1) % px;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var a = h(x0, y0), b = h(x1, y0), c = h(x0, y1), d = h(x1, y1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  Hi.makeNoise = makeNoise;

  function fbm(noise, x, y, period, oct) {
    var sum = 0, amp = 0.5, f = 1, norm = 0;
    for (var o = 0; o < oct; o++) {
      sum += amp * noise(x * f, y * f, period * f);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }
  Hi.fbm = fbm;

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function tex(c, opts) {
    opts = opts || {};
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (opts.srgb !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = opts.aniso || 1;
    if (opts.nomip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    return t;
  }

  // Normal map from a height array (w x h, tileable), strength in "pixels".
  function normalFrom(height, w, h, strength) {
    var c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var l = height[y * w + ((x - 1 + w) % w)], r = height[y * w + ((x + 1) % w)];
        var u = height[((y - 1 + h) % h) * w + x], dn = height[((y + 1) % h) * w + x];
        var nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        var i = (y * w + x) * 4;
        d[i] = (nx / len * 0.5 + 0.5) * 255; d[i + 1] = (ny / len * 0.5 + 0.5) * 255; d[i + 2] = (nz / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Asphalt: u = across the racing surface (0 = right white line, 1 = left),
  // v = along the lap (one tile per TILE_M metres). Aggregate speckle, patches,
  // a darker rubbered racing line and tyre streaks; normal map from the grain.
  Hi.asphalt = function (aniso, size) {
    var N = size || 512, noise = makeNoise(11), noise2 = makeNoise(29);
    var c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    var height = new Float32Array(N * N);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var u = x / N, v = y / N;
        var grain = noise(x * 0.9, y * 0.9, N * 0.9) * 0.6 + noise(x * 2.3, y * 2.3, N * 2.3 | 0) * 0.4;
        var patch = fbm(noise2, u * 4, v * 4, 4, 4);
        var speck = grain > 0.83 ? 0.18 : grain < 0.12 ? -0.08 : 0;
        // Rubber: two worn lanes where cars drive most, plus streaks along v.
        var lane = Math.exp(-Math.pow((u - 0.5) / 0.22, 2)) * 0.55 + Math.exp(-Math.pow((u - 0.32) / 0.07, 2)) * 0.25 + Math.exp(-Math.pow((u - 0.68) / 0.07, 2)) * 0.25;
        var streak = noise(u * 90, v * 3, 90) * 0.5 + noise(u * 180, v * 2, 180) * 0.5;
        var rubber = lane * (0.55 + 0.45 * streak);
        var edge = Math.min(1, Math.min(u, 1 - u) / 0.04); // dusty edge just inside the lines
        var base = 40 + patch * 18 + speck * 95 + grain * 8 - rubber * 15 + (1 - edge) * 9;
        var i = (y * N + x) * 4;
        d[i] = base * 0.98; d[i + 1] = base; d[i + 2] = base * 1.04; d[i + 3] = 255;
        height[y * N + x] = grain + speck * 1.5;
      }
    }
    g.putImageData(img, 0, 0);
    // roughness map (green channel): rubbered line is smoother
    var rc = canvas(N, N), rg = rc.getContext('2d'), rimg = rg.createImageData(N, N), rd = rimg.data;
    for (var yy = 0; yy < N; yy++) {
      for (var xx = 0; xx < N; xx++) {
        var uu = xx / N;
        var ln = Math.exp(-Math.pow((uu - 0.5) / 0.22, 2));
        var r = (0.92 - ln * 0.22 - height[yy * N + xx] * 0.08) * 255;
        var j = (yy * N + xx) * 4;
        rd[j] = r; rd[j + 1] = r; rd[j + 2] = r; rd[j + 3] = 255;
      }
    }
    rg.putImageData(rimg, 0, 0);
    return { map: tex(c, { aniso: aniso }), normal: tex(normalFrom(height, N, N, 0.9), { aniso: aniso, srgb: false }),
      rough: tex(rc, { aniso: aniso, srgb: false }) };
  };

  // Paved run-off / generic concrete (tileable).
  Hi.concrete = function (aniso, tint) {
    var N = 256, noise = makeNoise(5), c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    var t = tint || [150, 152, 156];
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var n = fbm(noise, x / 16, y / 16, N / 16, 4), s = noise(x * 1.7, y * 1.7, N * 1.7 | 0);
        var k = 0.82 + n * 0.3 + (s > 0.86 ? 0.08 : 0);
        var i = (y * N + x) * 4;
        d[i] = t[0] * k; d[i + 1] = t[1] * k; d[i + 2] = t[2] * k; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c, { aniso: aniso });
  };

  // Grass (tileable): blades noise + clumps; the terrain shader adds mowing
  // stripes and colour variation by world position.
  Hi.grass = function (aniso) {
    var N = 256, noise = makeNoise(17), c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    var height = new Float32Array(N * N);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var clump = fbm(noise, x / 32, y / 32, N / 32, 3), blade = noise(x * 1.3, y * 0.55, N * 1.3 | 0);
        var k = 0.72 + clump * 0.35 + (blade - 0.5) * 0.3;
        var i = (y * N + x) * 4;
        d[i] = 62 * k; d[i + 1] = 98 * k; d[i + 2] = 48 * k; d[i + 3] = 255;
        height[y * N + x] = blade * 0.7 + clump * 0.3;
      }
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, { aniso: aniso }), normal: tex(normalFrom(height, N, N, 1.6), { aniso: aniso, srgb: false }) };
  };

  // Kerb: red / white blocks along v (one red + one white per texture), a
  // slight ridge pattern for the normal map.
  Hi.kerb = function (aniso) {
    var W = 32, H = 128, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#d6322f'; g.fillRect(0, 0, W, H / 2);
    g.fillStyle = '#f2f2f2'; g.fillRect(0, H / 2, W, H / 2);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (var y = 0; y < H; y += 8) g.fillRect(0, y, W, 2);
    return tex(c, { aniso: aniso });
  };

  Hi.checker = function (cols, rows) {
    var S = 32, c = canvas(cols * S, rows * S), g = c.getContext('2d');
    for (var r = 0; r < rows; r++) for (var k = 0; k < cols; k++) {
      g.fillStyle = (k + r) % 2 ? '#141414' : '#f4f4f4';
      g.fillRect(k * S, r * S, S, S);
    }
    var t = tex(c, { clamp: true });
    t.magFilter = THREE.NearestFilter;
    return t;
  };

  // Chain-link catch fence (alpha-tested).
  Hi.fence = function () {
    var S = 64, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(120,126,136,1)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S);
    g.moveTo(-S / 2, S / 2); g.lineTo(S / 2, S * 1.5); g.moveTo(S / 2, -S / 2); g.lineTo(S * 1.5, S / 2);
    g.stroke();
    var t = tex(c);
    t.premultiplyAlpha = false;
    return t;
  };

  // Seen from afar the seating is a mottled carpet of shirts.
  Hi.crowdCarpet = function () {
    var W = 128, H = 64, c = canvas(W, H), g = c.getContext('2d');
    var cols = ['#d63a3a', '#f2f2f2', '#2b5fd9', '#ffd23f', '#1e9a52', '#ff8a1f', '#14171c', '#c8102e', '#7a4bd1', '#0fa3a3', '#e86aa6', '#9aa3ad'];
    g.fillStyle = '#3d4654'; g.fillRect(0, 0, W, H);
    var s = 7;
    for (var y = 0; y < H; y += 4) for (var x = 0; x < W; x += 3) {
      s = (s * 16807) % 2147483647;
      if (s % 10 === 0) continue;
      g.fillStyle = cols[s % cols.length];
      g.fillRect(x, y + 1, 2, 2);
      g.fillStyle = '#e0b28c';
      g.fillRect(x, y, 2, 1);
    }
    return tex(c);
  };

  // Fictional sponsor boards (atlas of 4 rows), for walls and hoardings.
  var BRANDS = [
    ['APEXLINE', '#101820', '#ffd23f'], ['VELOCE OIL', '#c8102e', '#ffffff'], ['NORDLICHT', '#0d214f', '#18c0e8'], ['KIWI TYRES', '#1e9a52', '#f4f4f4'],
    ['TRACK MASTER', '#141414', '#ff3b3b'], ['PITWALL', '#f4f4f4', '#141414'], ['AURORA', '#06403f', '#ff8a1f'], ['BLEU WATCH', '#1f4fd1', '#ffffff'],
  ];
  Hi.sponsors = function () {
    var W = 1024, H = 512, rows = 8, c = canvas(W, H), g = c.getContext('2d'), rh = H / rows;
    for (var r = 0; r < rows; r++) {
      var b = BRANDS[r];
      g.fillStyle = b[1]; g.fillRect(0, r * rh, W, rh);
      g.fillStyle = b[2];
      g.font = '900 ' + Math.round(rh * 0.62) + 'px Arial Black, Arial, sans-serif';
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      for (var k = 0; k < 2; k++) g.fillText(b[0], W * (0.25 + k * 0.5), r * rh + rh * 0.54);
    }
    var t = tex(c, { aniso: 4 });
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  Hi.SPONSOR_ROWS = 8;

  // Car number roundel.
  Hi.number = function (num, bg, fg) {
    var S = 128, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.fillStyle = bg || '#ffffff';
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2); g.fill();
    g.fillStyle = fg || '#111111';
    g.font = '900 ' + (String(num).length > 1 ? 66 : 80) + 'px Arial Black, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), S / 2, S / 2 + 4);
    return tex(c, { clamp: true });
  };

  // Text board (circuit name, distance markers).
  Hi.textBoard = function (lines, w, h, bg, fg) {
    var c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    var lh = h / lines.length;
    lines.forEach(function (l, i) {
      g.font = (l.weight || 900) + ' ' + Math.round(lh * (l.size || 0.6)) + 'px ' + (l.font || 'Arial Black, Arial, sans-serif');
      g.fillText(l.text, w / 2, lh * (i + 0.55));
    });
    return { texture: tex(c, { clamp: true, aniso: 4 }), canvas: c };
  };

  // Soft round puff (smoke / dust), alpha in the texture.
  Hi.puff = function () {
    var S = 64, c = canvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data, noise = makeNoise(3);
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1, r = Math.sqrt(dx * dx + dy * dy);
      var n = fbm(noise, x / 10, y / 10, 64, 3);
      var a = Math.max(0, 1 - r) * (0.55 + 0.45 * n);
      a = a * a * (3 - 2 * a);
      var i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.min(255, a * 300);
    }
    g.putImageData(img, 0, 0);
    return tex(c, { clamp: true, srgb: false });
  };

  // Bright core + glow (sparks, fire, light glows).
  Hi.glow = function () {
    var S = 64, c = canvas(S, S), g = c.getContext('2d');
    var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return tex(c, { clamp: true, srgb: false });
  };

  // Soft contact shadow under a car (dark, alpha).
  Hi.blob = function () {
    var S = 64, c = canvas(S, S * 2), g = c.getContext('2d');
    var gr = g.createRadialGradient(S / 2, S, 4, S / 2, S, S);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, 2); g.translate(0, -S / 2);
    g.fillStyle = gr; g.fillRect(0, 0, S, S * 2);
    g.restore();
    return tex(c, { clamp: true, srgb: false });
  };

  // Tyre sidewall + rim, seen face on. blur = 1: spinning fast (spokes and
  // lettering smeared into rings).
  Hi.sidewall = function (stripe, rim, blur) {
    var S = 256, c = canvas(S, S), g = c.getContext('2d'), R = S / 2;
    g.clearRect(0, 0, S, S);
    g.translate(R, R);
    g.fillStyle = '#1a1a1b'; g.beginPath(); g.arc(0, 0, R - 1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = stripe; g.lineWidth = blur ? 7 : 6;
    g.globalAlpha = blur ? 0.8 : 1;
    if (blur) { g.beginPath(); g.arc(0, 0, R * 0.8, 0, Math.PI * 2); g.stroke(); }
    else for (var k = 0; k < 4; k++) { g.beginPath(); g.arc(0, 0, R * 0.8, k * Math.PI / 2 + 0.2, k * Math.PI / 2 + Math.PI / 2 - 0.2); g.stroke(); }
    g.globalAlpha = 1;
    g.fillStyle = rim; g.beginPath(); g.arc(0, 0, R * 0.6, 0, Math.PI * 2); g.fill();
    if (blur) {
      g.fillStyle = 'rgba(10,11,14,0.55)'; g.beginPath(); g.arc(0, 0, R * 0.56, 0, Math.PI * 2); g.fill();
      g.fillStyle = rim; g.beginPath(); g.arc(0, 0, R * 0.2, 0, Math.PI * 2); g.fill();
    } else {
      g.strokeStyle = '#0c0d10'; g.lineWidth = 12; g.lineCap = 'round';
      for (var j = 0; j < 5; j++) {
        var a = j / 5 * Math.PI * 2;
        g.beginPath(); g.moveTo(Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14); g.lineTo(Math.cos(a) * R * 0.54, Math.sin(a) * R * 0.54); g.stroke();
      }
      g.fillStyle = '#9aa0aa'; g.beginPath(); g.arc(0, 0, R * 0.08, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = stripe; g.beginPath(); g.arc(0, 0, R * 0.12, 0, Math.PI * 2); g.fill();
    return tex(c, { clamp: true });
  };

  // Tread (wraps round the tyre): slicks with faint seams so the roll shows.
  Hi.tread = function () {
    // u = round the tyre, v = across the tread
    var W = 128, H = 32, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#262627'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b1b1c';
    for (var x = 0; x < W; x += 16) g.fillRect(x, 0, 5, H);
    g.fillStyle = '#303032'; g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3);
    return tex(c);
  };

  // Lit windows for city silhouettes (emissive at dusk).
  Hi.windows = function () {
    var W = 64, H = 128, c = canvas(W, H), g = c.getContext('2d'), s = 99;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (var y = 2; y < H; y += 6) for (var x = 2; x < W; x += 5) {
      s = (s * 16807) % 2147483647;
      if (s % 3 === 0) continue;
      var b = 120 + (s % 120);
      g.fillStyle = 'rgb(' + b + ',' + (b * 0.85 | 0) + ',' + (b * 0.55 | 0) + ')';
      g.fillRect(x, y, 3, 3);
    }
    return tex(c);
  };
})();

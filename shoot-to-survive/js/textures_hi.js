import * as THREE from 'three';

// 그래픽 '높음' 전용: 낡은 콘크리트 블록 벽 · 균열난 슬래브 바닥 · 얼룩진 천장을 코드로 생성 (색 + 범프 + 거칠기 맵)
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// 이음매 없이 반복되는 fbm 노이즈 (0~1). octs: [[격자 수, 가중치], ...]
function fbm(size, seed, octs) {
  const r = rng(seed), out = new Float32Array(size * size); let ws = 0;
  for (const [g, w] of octs) {
    const a = new Float32Array(g * g); for (let i = 0; i < a.length; i++) a[i] = r(); ws += w;
    for (let y = 0; y < size; y++) {
      const fy = y / size * g, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % g) * g, yb = ((y0 + 1) % g) * g;
      for (let x = 0; x < size; x++) {
        const fx = x / size * g, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % g, xb = (x0 + 1) % g;
        out[y * size + x] += w * (a[ya + xa] * (1 - sx) * (1 - sy) + a[ya + xb] * sx * (1 - sy) + a[yb + xa] * (1 - sx) * sy + a[yb + xb] * sx * sy);
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= ws;
  return out;
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const canvas = (S) => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };

function tex(c, { srgb = false, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat, repeat);
  t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 균열: 임의 방향으로 꺾이며 뻗는 선 (색·범프·거칠기에 같이 그림)
function cracks(ctxs, S, r, n, len) {
  for (let i = 0; i < n; i++) {
    let x = r() * S, y = r() * S, a = r() * Math.PI * 2; const w = 0.8 + r() * 1.6, steps = len * (0.5 + r());
    const pts = [[x, y]];
    for (let k = 0; k < steps; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
    for (const [c, col] of ctxs) { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([px, py], j) => j ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke(); }
  }
}

// 벽: 3m × 3.2m 한 면 전체 = 텍스처 한 장 (4줄 × 2칸 콘크리트 블록)
export function wallMaps() {
  const S = 512, r = rng(7), big = fbm(S, 1, [[3, 1], [6, 0.6], [12, 0.3]]), mid = fbm(S, 2, [[16, 1], [32, 0.6]]), fine = fbm(S, 3, [[64, 1], [128, 0.7], [256, 0.5]]);
  const cc = canvas(S), cb = canvas(S), cr = canvas(S), x2 = cc.getContext('2d'), b2 = cb.getContext('2d'), r2 = cr.getContext('2d');
  const ci = x2.createImageData(S, S), bi = b2.createImageData(S, S), ri = r2.createImageData(S, S);
  const rows = 4, bh = S / rows, tint = [], bias = [];
  for (let i = 0; i < rows * 3; i++) { tint.push(0.86 + r() * 0.24); bias.push((r() - 0.5) * 0.12); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, row = Math.floor(y / bh), nc = row % 2 ? 3 : 2, bw = S / nc, col = Math.floor(x / bw);
    const lx = x - col * bw, ly = y % bh, d = Math.min(lx, bw - lx, ly, bh - ly), groove = 1 - sm(0, 6, d), k = row * 3 + col;
    const h = 0.55 + 0.3 * (fine[i] - 0.5) + 0.2 * (mid[i] - 0.5) + bias[k] - 0.4 * groove;
    let g = 0.46 * (0.72 + 0.5 * big[i]) * tint[k] + (fine[i] - 0.5) * 0.1; if (groove > 0.5) g *= 0.72;
    const p = i * 4;
    ci.data[p] = Math.min(255, g * 255 * 1.0); ci.data[p + 1] = Math.min(255, g * 255 * 0.985); ci.data[p + 2] = Math.min(255, g * 255 * 0.95); ci.data[p + 3] = 255;
    bi.data[p] = bi.data[p + 1] = bi.data[p + 2] = Math.min(255, Math.max(0, h * 255)); bi.data[p + 3] = 255;
    const rg = Math.min(1, 0.74 + 0.22 * (fine[i] - 0.5) + 0.2 * groove + 0.1 * (mid[i] - 0.5)) * 255;
    ri.data[p] = ri.data[p + 1] = ri.data[p + 2] = rg; ri.data[p + 3] = 255;
  }
  x2.putImageData(ci, 0, 0); b2.putImageData(bi, 0, 0); r2.putImageData(ri, 0, 0);
  // 물 자국 · 녹물 · 이끼 · 아래쪽 때
  for (let i = 0; i < 20; i++) {
    const px = r() * S, w = 4 + r() * 16, len = 120 + r() * 360, g = x2.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(18,16,12,0.40)'); g.addColorStop(1, 'rgba(18,16,12,0)'); x2.fillStyle = g; x2.fillRect(px, 0, w, len);
    const gr = r2.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(60,60,60,0.55)'); gr.addColorStop(1, 'rgba(60,60,60,0)'); r2.fillStyle = gr; r2.fillRect(px, 0, w, len); // 젖은 곳은 반들
  }
  for (let i = 0; i < 5; i++) { const px = r() * S, py = r() * 150, w = 3 + r() * 8, len = 90 + r() * 240, g = x2.createLinearGradient(0, py, 0, py + len); g.addColorStop(0, 'rgba(112,56,26,0.30)'); g.addColorStop(1, 'rgba(112,56,26,0)'); x2.fillStyle = g; x2.fillRect(px, py, w, len); }
  const gd = x2.createLinearGradient(0, S * 0.72, 0, S); gd.addColorStop(0, 'rgba(8,8,6,0)'); gd.addColorStop(1, 'rgba(8,8,6,0.55)'); x2.fillStyle = gd; x2.fillRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) { const px = r() * S, py = S * (0.7 + r() * 0.3), rad = 14 + r() * 40, g = x2.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(46,68,34,0.42)'); g.addColorStop(1, 'rgba(46,68,34,0)'); x2.fillStyle = g; x2.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  cracks([[x2, 'rgba(6,6,6,0.85)'], [b2, 'rgba(0,0,0,0.9)']], S, r, 6, 26);
  for (let i = 0; i < 40; i++) { const px = r() * S, py = r() * S; x2.fillStyle = 'rgba(10,10,10,0.35)'; b2.fillStyle = 'rgba(30,30,30,0.7)'; for (const c of [x2, b2]) { c.beginPath(); c.ellipse(px, py, 2 + r() * 5, 1.5 + r() * 3, r() * 3, 0, 7); c.fill(); } } // 떨어져 나간 자국
  return { map: tex(cc, { srgb: true }), bump: tex(cb), rough: tex(cr) };
}

// 바닥: 6m × 6m 분량 (슬래브 4×4, 반복). 균열·기름·물기
export function floorMaps(repeat) {
  const S = 1024, r = rng(21), big = fbm(S, 4, [[4, 1], [8, 0.6], [16, 0.35]]), fine = fbm(S, 5, [[64, 1], [128, 0.7], [256, 0.5]]);
  const cc = canvas(S), cb = canvas(S), cr = canvas(S), x2 = cc.getContext('2d'), b2 = cb.getContext('2d'), r2 = cr.getContext('2d');
  const ci = x2.createImageData(S, S), bi = b2.createImageData(S, S), ri = r2.createImageData(S, S), slab = S / 4, tint = Array.from({ length: 16 }, () => 0.88 + r() * 0.22);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, lx = x % slab, ly = y % slab, d = Math.min(lx, slab - lx, ly, slab - ly), joint = 1 - sm(0, 5, d), k = Math.floor(y / slab) * 4 + Math.floor(x / slab);
    const h = 0.58 + 0.25 * (fine[i] - 0.5) + 0.12 * (big[i] - 0.5) - 0.45 * joint;
    let g = 0.36 * (0.7 + 0.55 * big[i]) * tint[k] + (fine[i] - 0.5) * 0.09; if (joint > 0.5) g *= 0.55;
    const p = i * 4; ci.data[p] = g * 255; ci.data[p + 1] = g * 255 * 0.99; ci.data[p + 2] = g * 255 * 0.96; ci.data[p + 3] = 255;
    bi.data[p] = bi.data[p + 1] = bi.data[p + 2] = Math.min(255, Math.max(0, h * 255)); bi.data[p + 3] = 255;
    const rg = Math.min(1, 0.8 + 0.2 * (fine[i] - 0.5) + 0.15 * joint - 0.25 * sm(0.62, 0.8, big[i])) * 255; // 큰 노이즈 높은 곳은 젖어서 반들
    ri.data[p] = ri.data[p + 1] = ri.data[p + 2] = rg; ri.data[p + 3] = 255;
  }
  x2.putImageData(ci, 0, 0); b2.putImageData(bi, 0, 0); r2.putImageData(ri, 0, 0);
  for (let i = 0; i < 14; i++) { const px = r() * S, py = r() * S, rad = 40 + r() * 110, g = x2.createRadialGradient(px, py, 0, px, py, rad); const oil = r() < 0.5; g.addColorStop(0, oil ? 'rgba(6,6,8,0.5)' : 'rgba(40,34,24,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x2.fillStyle = g; x2.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  cracks([[x2, 'rgba(4,4,4,0.9)'], [b2, 'rgba(0,0,0,0.95)']], S, r, 9, 40);
  return { map: tex(cc, { srgb: true, repeat }), bump: tex(cb, { repeat }), rough: tex(cr, { repeat }) };
}

// 천장: 3m 타일 반복. 판 이음새 + 물 얼룩
export function ceilMaps(repeat) {
  const S = 512, r = rng(33), big = fbm(S, 6, [[4, 1], [8, 0.6]]), fine = fbm(S, 7, [[64, 1], [128, 0.7], [256, 0.5]]);
  const cc = canvas(S), cb = canvas(S), cr = canvas(S), x2 = cc.getContext('2d'), b2 = cb.getContext('2d'), r2 = cr.getContext('2d');
  const ci = x2.createImageData(S, S), bi = b2.createImageData(S, S), ri = r2.createImageData(S, S), pn = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, d = Math.min(x % pn, pn - x % pn, y % pn, pn - y % pn), seam = 1 - sm(0, 4, d), g = 0.3 * (0.75 + 0.5 * big[i]) + (fine[i] - 0.5) * 0.08, p = i * 4;
    const gg = seam > 0.5 ? g * 0.6 : g; ci.data[p] = gg * 255; ci.data[p + 1] = gg * 255 * 0.99; ci.data[p + 2] = gg * 255 * 0.96; ci.data[p + 3] = 255;
    const h = 0.6 + 0.25 * (fine[i] - 0.5) - 0.4 * seam; bi.data[p] = bi.data[p + 1] = bi.data[p + 2] = h * 255; bi.data[p + 3] = 255;
    ri.data[p] = ri.data[p + 1] = ri.data[p + 2] = Math.min(255, (0.85 + 0.15 * (fine[i] - 0.5)) * 255); ri.data[p + 3] = 255;
  }
  x2.putImageData(ci, 0, 0); b2.putImageData(bi, 0, 0); r2.putImageData(ri, 0, 0);
  for (let i = 0; i < 7; i++) { const px = r() * S, py = r() * S, rad = 30 + r() * 90, g = x2.createRadialGradient(px, py, rad * 0.6, px, py, rad); g.addColorStop(0, 'rgba(60,46,26,0.30)'); g.addColorStop(0.85, 'rgba(34,26,14,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x2.fillStyle = g; x2.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  return { map: tex(cc, { srgb: true, repeat }), bump: tex(cb, { repeat }), rough: tex(cr, { repeat }) };
}

// 웅덩이 가장자리를 부드럽게 만드는 알파 맵
export function puddleAlpha() {
  const c = canvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#c8c8c8'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

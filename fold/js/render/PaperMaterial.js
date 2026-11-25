// 종이 재질: 캔버스로 만든 섬유 질감 + 칸 경계의 아주 옅은 선. 챕터마다 색조·거칠기가 달라요.
// 텍스처·재질은 팔레트별로 한 번만 만들고 재사용해요 (면마다 하이라이트용으로만 복제).
import * as THREE from '../../vendor/three.module.min.js';

export const PALETTES = {
  white: { name: '백지', front: '#f6f3ec', back: '#e8e2d6', edge: '#d9d2c4', fiber: 'rgba(120,105,80,', grain: 0.05, bg: '#ecebe7', bg2: '#d9d6cf', line: 'rgba(90,80,60,0.13)', rough: 0.92 },
  blue: { name: '청지', front: '#eaf0f3', back: '#d8e2e8', edge: '#c3cfd8', fiber: 'rgba(60,90,120,', grain: 0.07, bg: '#e1e7ea', bg2: '#c9d3d9', line: 'rgba(50,80,110,0.15)', rough: 0.85 },
  warm: { name: '한지', front: '#f4ecdf', back: '#e6d9c4', edge: '#d5c4a8', fiber: 'rgba(130,95,50,', grain: 0.09, bg: '#efe8dd', bg2: '#ddd2c0', line: 'rgba(110,80,40,0.14)', rough: 0.95 },
};

const cache = new Map();

function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function paperCanvas(p, size, border, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), r = rand(seed);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
  // 미세한 얼룩
  for (let i = 0; i < 220; i++) {
    const x = r() * size, y = r() * size, rad = 2 + r() * 10;
    g.fillStyle = `rgba(0,0,0,${r() * p.grain * 0.35})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // 섬유
  g.lineCap = 'round';
  for (let i = 0; i < 380; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI, l = 3 + r() * 14;
    g.strokeStyle = p.fiber + (0.04 + r() * 0.1) + ')';
    g.lineWidth = 0.4 + r() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // 점 잡티
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 255 * p.grain; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  if (border) { // 칸 경계 (아주 옅게) — 퍼즐 격자를 읽기 쉽게
    g.strokeStyle = p.line; g.lineWidth = size / 128;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, size - g.lineWidth, size - g.lineWidth);
  }
  return c;
}

export function paperTextures(key, quality) {
  const k = key + ':' + quality;
  if (cache.has(k)) return cache.get(k);
  const p = PALETTES[key] || PALETTES.white;
  const size = quality === 'low' ? 128 : 256;
  const mk = (border, seed) => {
    const t = new THREE.CanvasTexture(paperCanvas(p, size, border, seed));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = quality === 'high' ? 4 : 1;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const out = { p, cell: mk(true, 7), plain: mk(false, 13) };
  if (quality === 'high') {
    out.bump = new THREE.CanvasTexture(paperCanvas(p, size, false, 29));
    out.bump.wrapS = out.bump.wrapT = THREE.RepeatWrapping;
  }
  cache.set(k, out);
  return out;
}

// 면 하나의 재질 세트 [앞면, 뒷면, 옆면]
export function faceMaterials(key, quality, tone) {
  const tx = paperTextures(key, quality), p = tx.p;
  const Mat = quality === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const base = c => {
    const o = { color: new THREE.Color(c), map: tx.cell };
    if (Mat === THREE.MeshStandardMaterial) Object.assign(o, { roughness: p.rough, metalness: 0, bumpMap: tx.bump || null, bumpScale: 0.6 });
    return new Mat(o);
  };
  const front = base(tone || p.front), back = base(p.back);
  const edge = new Mat({ color: new THREE.Color(p.edge) });
  for (const m of [front, back, edge]) m.userData.baseColor = m.color.clone();
  return [front, back, edge];
}

// 물체용 공용 종이 재질
export function objectMaterial(key, quality, color, extra = {}) {
  const tx = paperTextures(key, quality);
  const Mat = quality === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const o = { color: new THREE.Color(color), map: tx.plain, ...extra };
  if (Mat === THREE.MeshStandardMaterial) { o.roughness = o.roughness ?? 0.9; o.metalness = o.metalness ?? 0; }
  else { delete o.roughness; delete o.metalness; }
  return new Mat(o);
}

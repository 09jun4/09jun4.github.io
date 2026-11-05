import * as THREE from 'three';
import { mulberry32 } from './maze.js';

// 캔버스로 만드는 돌 텍스처 (외부 이미지 없음)
export function stoneTexture(tone = 110, seed = 1, rows = 4) {
  const size = 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const r = mulberry32(seed);
  const bh = size / rows, bw = size / 2;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < 3; col++) {
      const v = tone + (r() - 0.5) * 36;
      x.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      x.fillRect(off + col * bw, row * bh, bw, bh);
    }
  }
  const img = x.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 34;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) { // 얼룩
    x.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
    x.beginPath(); x.arc(r() * size, r() * size, 6 + r() * 22, 0, 7); x.fill();
  }
  x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 4;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * bw / 2;
    x.beginPath(); x.moveTo(0, row * bh); x.lineTo(size, row * bh); x.stroke();
    for (let col = -1; col < 3; col++) {
      x.beginPath(); x.moveTo(off + col * bw, row * bh); x.lineTo(off + col * bw, (row + 1) * bh); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

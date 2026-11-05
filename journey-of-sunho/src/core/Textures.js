// 임시 에셋용 절차적 텍스처 (캔버스로 그려서 외부 이미지 없이 동작).
// 최종 에셋이 생기면 AssetManager에서 이미지 텍스처로 바꿔 끼우면 돼요.
import * as THREE from '../lib/three.js';
import { makeRng } from './utils.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  const rng = makeRng(7);
  g.fillStyle = '#4a4c50'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 55 + rng() * 40 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.35 + rng() * 0.4})`;
    g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let i = 0; i < 6; i++) { // 보수 자국
    g.fillStyle = 'rgba(30,30,32,0.25)';
    g.fillRect(rng() * 256, rng() * 256, 20 + rng() * 50, 10 + rng() * 30);
  }
  return tex(c);
}

export function sidewalkTexture() {
  const [c, g] = canvas(128, 128);
  const rng = makeRng(11);
  g.fillStyle = '#a49d93'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 150 + rng() * 25 | 0;
    g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
    g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
  return tex(c);
}

export function grassTexture() {
  const [c, g] = canvas(256, 256);
  const rng = makeRng(3);
  g.fillStyle = '#5d7a3e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const gr = 90 + rng() * 60 | 0;
    g.fillStyle = `rgba(${gr * 0.6 | 0},${gr},${gr * 0.4 | 0},0.5)`;
    g.fillRect(rng() * 256, rng() * 256, 1, 2 + rng() * 3);
  }
  return tex(c);
}

// 건물 외벽: 가로 1칸 = 3m, 세로 1칸 = 1개 층(3m)
export function facadeTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e8e4dc'; g.fillRect(0, 118, 128, 10);
  g.fillStyle = '#3d4a5a'; g.fillRect(18, 28, 92, 62);
  g.fillStyle = 'rgba(160,190,220,0.55)'; g.fillRect(22, 32, 40, 54);
  g.fillStyle = 'rgba(120,150,180,0.45)'; g.fillRect(66, 32, 40, 54);
  g.fillStyle = '#cfc8bb'; g.fillRect(14, 90, 100, 6);
  return tex(c);
}
// 밤에 켜지는 창문 (emissive map)
// 4x4 창문 묶음 중 일부만 불이 켜진 패턴 (repeat 1/4로 써서 창문마다 다르게 보임)
export function facadeNightTexture() {
  const [c, g] = canvas(256, 256);
  const rng = makeRng(29);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    if (rng() < 0.42) continue;
    const warm = rng() < 0.7;
    g.fillStyle = warm ? `rgb(255,${200 + rng() * 40 | 0},${120 + rng() * 40 | 0})` : 'rgb(190,215,255)';
    g.globalAlpha = 0.55 + rng() * 0.45;
    g.fillRect(x * 64 + 11, y * 64 + 16, 42, 27);
  }
  g.globalAlpha = 1;
  const t = tex(c);
  t.repeat.set(0.25, 0.25);
  return t;
}

export function signAtlas(names, opts = {}) {
  const cols = 4, rows = Math.ceil(names.length / cols);
  const cw = 256, ch = 64;
  const [c, g] = canvas(cols * cw, rows * ch);
  const colors = opts.colors || ['#c0392b', '#1f6fb2', '#1e8449', '#7d3c98', '#d35400', '#2c3e50', '#b7950b', '#a93226'];
  names.forEach((n, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.fillStyle = colors[i % colors.length]; g.fillRect(x, y, cw, ch);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y, cw, 6);
    g.fillStyle = '#fff';
    g.font = 'bold 38px "Noto Sans KR", "Malgun Gothic", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n, x + cw / 2, y + ch / 2 + 2, cw - 16);
  });
  const t = tex(c, false);
  return { texture: t, cols, rows, uv: (i) => ({ u0: (i % cols) / cols, v1: 1 - Math.floor(i / cols) / rows, u1: (i % cols + 1) / cols, v0: 1 - (Math.floor(i / cols) + 1) / rows }) };
}

export function textTexture(text, { w = 512, h = 128, bg = '#1d3557', fg = '#fff', font = 'bold 64px sans-serif', border = null } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 3, w - 24);
  return tex(c, false);
}

// 임시 얼굴 (사진을 받으면 CharacterModel.setFaceImage(url)로 교체)
export function faceTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#e9b98f'; g.fillRect(0, 0, 256, 256);
  // 눈썹
  g.fillStyle = '#2b1d14';
  g.fillRect(58, 92, 50, 9); g.fillRect(148, 92, 50, 9);
  // 안경
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 7;
  g.strokeRect(52, 108, 64, 44); g.strokeRect(140, 108, 64, 44);
  g.beginPath(); g.moveTo(116, 126); g.lineTo(140, 126); g.stroke();
  // 눈
  g.fillStyle = '#1b1b1b';
  g.beginPath(); g.arc(84, 131, 7, 0, Math.PI * 2); g.arc(172, 131, 7, 0, Math.PI * 2); g.fill();
  // 볼
  g.fillStyle = 'rgba(230,120,110,0.35)';
  g.beginPath(); g.arc(62, 178, 20, 0, Math.PI * 2); g.arc(194, 178, 20, 0, Math.PI * 2); g.fill();
  // 코·입
  g.strokeStyle = '#b07a55'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(128, 140); g.lineTo(122, 170); g.lineTo(134, 172); g.stroke();
  g.strokeStyle = '#7a3b2e'; g.lineWidth = 6;
  g.beginPath(); g.arc(128, 188, 22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  return tex(c, false);
}

export function crosswalkTexture() {
  const [c, g] = canvas(128, 32);
  g.clearRect(0, 0, 128, 32);
  g.fillStyle = 'rgba(245,245,240,0.95)';
  for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 4, 0, 18, 32);
  return tex(c);
}

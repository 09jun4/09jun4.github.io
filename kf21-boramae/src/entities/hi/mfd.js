// 다기능 화면(MFD): 캔버스에 3개 화면(비행 정보 / 전술 지도 / 무장·상태)을 그려 텍스처로 쓴다.
// 초당 12회 정도만 다시 그리고, 주사선·깜빡임·가끔 일어나는 글리치를 넣는다.
import * as THREE from 'three';
import { RAD } from '../../core/math.js';

const HZ = 12;
const COL = { bg: '#04201f', line: '#49e6d3', dim: '#1f7f76', warn: '#ffb347', danger: '#ff5a4d', ok: '#7dffa0', text: '#b9fff5' };

export function createMfd(width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * 0.36);
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const W = canvas.width, H = canvas.height, pw = W / 3;
  const k = W / 1024;
  let acc = 1;
  let glitch = 0;
  let nextGlitch = 4;
  let seed = 9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const api = { texture, canvas, flicker: 1, update, dispose: () => texture.dispose() };

  const text = (s, x, y, size, color = COL.text, align = 'left') => {
    g.font = `600 ${Math.round(size * k)}px "JetBrains Mono", Consolas, monospace`;
    g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
    g.fillText(s, x, y);
  };

  function flightPage(x0, d) {
    const cx = x0 + pw / 2, cy = H * 0.52, r = H * 0.33;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy); g.rotate(-d.roll);
    const py = d.pitch * RAD * (r / 34);
    g.fillStyle = '#0d4a63'; g.fillRect(-r * 2, -r * 3 + py, r * 4, r * 3);
    g.fillStyle = '#3b2c14'; g.fillRect(-r * 2, py, r * 4, r * 3);
    g.strokeStyle = COL.text; g.lineWidth = 2 * k;
    g.beginPath(); g.moveTo(-r * 2, py); g.lineTo(r * 2, py);
    for (let a = -60; a <= 60; a += 10) { if (!a) continue; const y = py - a * (r / 34); g.moveTo(-r * 0.22, y); g.lineTo(r * 0.22, y); }
    g.stroke();
    g.restore();
    g.strokeStyle = COL.line; g.lineWidth = 2 * k;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.moveTo(cx - r * 0.5, cy); g.lineTo(cx - r * 0.16, cy); g.lineTo(cx, cy + r * 0.12); g.lineTo(cx + r * 0.16, cy); g.lineTo(cx + r * 0.5, cy);
    g.stroke();
    text('SPD', x0 + 14 * k, H * 0.2, 13, COL.dim); text(String(Math.round(d.speed)), x0 + 14 * k, H * 0.32, 22);
    text('ALT', x0 + pw - 14 * k, H * 0.2, 13, COL.dim, 'right'); text(String(Math.round(d.alt)), x0 + pw - 14 * k, H * 0.32, 22, COL.text, 'right');
    const hdg = ((-d.yaw * RAD) % 360 + 360) % 360;
    text(`HDG ${String(Math.round(hdg)).padStart(3, '0')}`, cx, H * 0.1, 15, COL.line, 'center');
    text(`G ${d.g.toFixed(1)}`, x0 + 14 * k, H * 0.88, 14, d.g > 5 ? COL.warn : COL.dim);
    text(`P ${(d.pitch * RAD).toFixed(0)}`, x0 + pw - 14 * k, H * 0.88, 14, COL.dim, 'right');
  }

  function mapPage(x0, d, time) {
    const cx = x0 + pw / 2, cy = H * 0.56, r = H * 0.4;
    g.strokeStyle = COL.dim; g.lineWidth = 1.5 * k;
    for (const q of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, r * q, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
    // 지도풍 등고선(기체 방향에 따라 흐른다)
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(73,230,211,0.16)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      for (let x = -r; x <= r; x += 8 * k) { const y = Math.sin((x + d.px * 0.02) * 0.02 + i * 1.7) * 14 * k + (i - 2.5) * r * 0.36 + ((d.pz * 0.02) % (r * 0.36)); g.lineTo(cx + x, cy + y); }
      g.stroke();
    }
    // 레이더 스윕
    const a = time * 1.6;
    const grad = g.createLinearGradient(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    grad.addColorStop(0, 'rgba(73,230,211,0)'); grad.addColorStop(1, 'rgba(73,230,211,0.5)');
    g.strokeStyle = grad; g.lineWidth = 3 * k;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
    // 적기(기수 기준 상대 위치, 화면 위쪽이 기수 방향)
    const range = 2400;
    for (let i = 0; i < d.contactCount; i++) {
      const ex = d.contacts[i * 2] / range, ez = d.contacts[i * 2 + 1] / range;
      const m = Math.hypot(ex, ez), s = m > 1 ? 1 / m : 1;
      const x = cx + ex * s * r, y = cy + ez * s * r;
      g.fillStyle = COL.danger;
      g.beginPath(); g.moveTo(x, y - 7 * k); g.lineTo(x + 6 * k, y + 5 * k); g.lineTo(x - 6 * k, y + 5 * k); g.closePath(); g.fill();
    }
    g.restore();
    g.fillStyle = COL.ok;
    g.beginPath(); g.moveTo(cx, cy - 9 * k); g.lineTo(cx + 6 * k, cy + 7 * k); g.lineTo(cx, cy + 3 * k); g.lineTo(cx - 6 * k, cy + 7 * k); g.closePath(); g.fill();
    text('TSD', x0 + 14 * k, H * 0.1, 15, COL.line); text(`TGT ${d.contactCount}`, x0 + pw - 14 * k, H * 0.1, 15, d.contactCount ? COL.danger : COL.dim, 'right');
    text('2.4KM', cx + r * 0.72, cy - r * 0.78, 11, COL.dim, 'center');
  }

  function storesPage(x0, d) {
    const cx = x0 + pw / 2;
    text('SMS', x0 + 14 * k, H * 0.1, 15, COL.line);
    text(d.weapon, x0 + pw - 14 * k, H * 0.1, 15, COL.text, 'right');
    // 기체 윤곽과 무장 위치
    g.strokeStyle = COL.dim; g.lineWidth = 2 * k;
    const s = H * 0.03;
    g.beginPath();
    g.moveTo(cx, H * 0.2); g.lineTo(cx + s, H * 0.42); g.lineTo(cx + s * 8, H * 0.6); g.lineTo(cx + s * 8, H * 0.66); g.lineTo(cx + s * 2, H * 0.66);
    g.lineTo(cx + s * 4, H * 0.8); g.lineTo(cx - s * 4, H * 0.8); g.lineTo(cx - s * 2, H * 0.66); g.lineTo(cx - s * 8, H * 0.66); g.lineTo(cx - s * 8, H * 0.6); g.lineTo(cx - s, H * 0.42);
    g.closePath(); g.stroke();
    const stations = [[6.6, 0.61], [-6.6, 0.61], [4.4, 0.57], [-4.4, 0.57], [0, 0.6]]; // 발사 순서와 같은 순서
    stations.forEach(([sx, sy], i) => {
      const live = i >= 5 - d.ammo;
      g.fillStyle = live ? COL.ok : '#123733';
      g.fillRect(cx + sx * s - 3 * k, H * sy - 12 * k, 6 * k, 24 * k);
    });
    text(`MSL ${d.ammo}`, x0 + 14 * k, H * 0.9, 14, d.ammo ? COL.ok : COL.warn);
    // 기관포 과열, 체력
    const bar = (label, v, y, color) => {
      text(label, x0 + 14 * k, y, 12, COL.dim);
      g.strokeStyle = COL.dim; g.strokeRect(x0 + 60 * k, y - 6 * k, 90 * k, 12 * k);
      g.fillStyle = color; g.fillRect(x0 + 62 * k, y - 4 * k, 86 * k * Math.max(0, Math.min(1, v)), 8 * k);
    };
    bar('GUN', d.heat, H * 0.24, d.heat > 0.8 ? COL.warn : COL.line);
    bar('AIR', d.hp, H * 0.34, d.hp < 0.3 ? COL.danger : COL.ok);
    if (d.hp < 0.3) text('DAMAGE', x0 + pw - 14 * k, H * 0.9, 14, COL.danger, 'right');
  }

  /** @param {object|null} d 표시할 값(없으면 대기 화면) */
  function update(time, dt, d) {
    acc += dt;
    if (acc < 1 / HZ) return;
    acc = 0;
    nextGlitch -= 1 / HZ;
    if (nextGlitch <= 0) { glitch = 2 + Math.floor(rnd() * 3); nextGlitch = 5 + rnd() * 9; }
    api.flicker = 0.92 + rnd() * 0.08;
    g.globalAlpha = 1;
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, W, H);
    if (d) {
      g.globalAlpha = api.flicker;
      flightPage(0, d);
      mapPage(pw, d, time);
      storesPage(pw * 2, d);
    } else {
      g.globalAlpha = 0.8;
      text('KF-21  SYSTEM READY', W / 2, H / 2, 20, COL.line, 'center');
    }
    g.globalAlpha = 1;
    // 화면 구분선
    g.fillStyle = '#021010';
    g.fillRect(pw - 2 * k, 0, 4 * k, H); g.fillRect(pw * 2 - 2 * k, 0, 4 * k, H);
    // 주사선
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    // 글리치: 가로 띠가 옆으로 밀린다
    if (glitch > 0) {
      glitch--;
      const y = Math.floor(rnd() * H * 0.8), hh = Math.floor(8 * k + rnd() * 26 * k);
      g.drawImage(canvas, 0, y, W, hh, (rnd() - 0.5) * 40 * k, y, W, hh);
      g.fillStyle = 'rgba(73,230,211,0.12)'; g.fillRect(0, y, W, 2);
    }
    texture.needsUpdate = true;
  }
  return api;
}

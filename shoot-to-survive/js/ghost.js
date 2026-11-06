import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasLOS, pushOut, tileOf, centerOf, openNeighbors, findPath } from './maze.js';

export const GHOST_H = 1.8;          // 모델 높이
export const GHOST_FLOAT = 0.25;     // 바닥에서 띄운 높이
export const HEAD_FROM = GHOST_H * 0.75; // 상단 25% = 머리
const RADIUS = 0.35;

// 고화질 유령의 밑단 천 일렁임 시간(초) — main에서 매 프레임 갱신
export const ghostTime = { value: 0 };

// ── 낮음: 기존 로우폴리 유령 ──
function buildLow() {
  const pts = [[0, 1.8], [0.13, 1.78], [0.23, 1.7], [0.27, 1.58], [0.26, 1.45], [0.32, 1.3], [0.4, 1.0], [0.5, 0.6], [0.58, 0.25], [0.62, 0.0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 8);
  const pos = geo.attributes.position; // 옷자락 물결
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.3) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, y + Math.sin(a * 4) * 0.12 + 0.12);
    }
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0xeeeeee, emissive: 0x161616, flatShading: true, side: THREE.DoubleSide });
  return { geo, mat, eyeGeo: new THREE.SphereGeometry(0.06, 6, 5), eyeMat: new THREE.MeshBasicMaterial({ color: 0x000000 }), eyeScale: [0.8, 1.5, 0.5], eyeZ: 0.245 };
}

// ── 높음: 하이폴리 천 유령 ──
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function fabricMaps() { // 낡고 흐린 리넨: 옅은 얼룩 + 약한 직조 무늬 (색 맵 + 범프 맵)
  const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 512; draw(c.getContext('2d')); return c; };
  const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const weave = (x, a) => { x.globalAlpha = a; for (let i = 0; i < 512; i += 2) { x.fillStyle = (i & 2) ? '#fff' : '#6e6a62'; x.fillRect(0, i, 512, 1); x.fillRect(i, 0, 1, 512); } x.globalAlpha = 1; };
  const color = mk((x) => {
    x.fillStyle = '#d4d0c8'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 22; i++) { // 얼룩·바랜 자국
      const px = rnd() * 512, py = rnd() * 512, r = 40 + rnd() * 110, g = x.createRadialGradient(px, py, 0, px, py, r);
      const dark = rnd() < 0.7; g.addColorStop(0, dark ? 'rgba(96,86,70,0.10)' : 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    }
    weave(x, 0.10);
    const img = x.getImageData(0, 0, 512, 512); for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 12; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    x.putImageData(img, 0, 0);
  });
  const soft = mk((x) => { x.filter = 'blur(0.7px)'; x.drawImage(color, 0, 0); }); // 살짝 흐리게
  const bump = mk((x) => { x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 512, 512); weave(x, 0.55); });
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 4); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: T(soft, true), bump: T(bump, false) };
}

function buildHigh() {
  // 1) 매끈한 실루엣 (스플라인) → 72분할 선삭
  const prof = new THREE.SplineCurve([[0, 1.8], [0.08, 1.795], [0.17, 1.76], [0.235, 1.69], [0.27, 1.59], [0.268, 1.5], [0.275, 1.4], [0.31, 1.28], [0.37, 1.1], [0.43, 0.9], [0.5, 0.62], [0.57, 0.32], [0.62, 0.05], [0.63, 0.0]]
    .map(([r, y]) => new THREE.Vector2(r, y))).getPoints(80).reverse(); // 아래→위
  let geo = new THREE.LatheGeometry(prof, 72);
  // 2) 천 주름 · 어깨 볼륨 · 물결 밑단 + 정점 색(골짜기 음영)
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, z), th = Math.atan2(x, z);
    const amp = sstep(1.5, 0.12, y);                                           // 아래로 갈수록 주름이 깊다
    const fold = 0.055 * Math.sin(7 * th + 0.8 + y * 1.6) + 0.032 * Math.sin(13 * th + 2.1 - y * 2.2) + 0.026 * Math.sin(3 * th + 0.4);
    const sleeve = 0.075 * Math.exp(-(((y - 1.12) / 0.2) ** 2)) * Math.sin(th) ** 2; // 팔이 받치는 어깨 볼륨
    const rr = r * (1 + amp * fold + sleeve);
    const hemW = sstep(0.34, 0.0, y), lift = hemW * (0.1 + 0.07 * Math.sin(5 * th + 1) + 0.045 * Math.sin(9 * th + 0.3 * Math.cos(th))); // 물결 밑단
    pos.setXYZ(i, rr * Math.sin(th), y + lift, rr * Math.cos(th));
    let c = 1 - 0.3 * Math.min(1, Math.max(0, -fold * amp / 0.07)) * 1.0;      // 주름 골짜기는 어둡게
    c *= 0.9 + 0.1 * sstep(0.0, 0.6, y);
    for (const ex of [-0.1, 0.1]) { const dx = rr * Math.sin(th) - ex, dy = y - 1.56; if (z > 0) c *= 1 - 0.6 * Math.exp(-(dx * dx + dy * dy * 0.45) / 0.0042); } // 눈구멍 주변 그늘
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo = toCreasedNormals(geo, Math.PI); // 위치가 같은 정점끼리 부드럽게 (이음매 포함)
  // 3) 천 재질 + 밑단 일렁임(정점 셰이더) + 밑단 투명
  const { map, bump } = fabricMaps();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7f7c77, map, bumpMap: bump, bumpScale: 0.7, roughness: 0.96, metalness: 0, vertexColors: true, side: THREE.DoubleSide, transparent: true, emissive: 0x121215 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = ghostTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vY;')
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 2.3;       // 유령마다 다른 위상
        float hem = smoothstep(0.8, 0.0, position.y);                      // 아래쪽일수록 크게 흔들림
        float ang = atan(position.x, position.z);
        vec2 rad = normalize(position.xz + vec2(1e-5));
        float wave = sin(uTime * 1.7 + ang * 4.0 + ph) * 0.05 + sin(uTime * 2.9 - ang * 7.0 + ph * 1.3) * 0.028 + sin(uTime * 1.1 + ang * 2.0 - ph) * 0.022;
        transformed.xz += rad * wave * hem;
        transformed.y += sin(uTime * 2.3 + ang * 5.0 + ph) * 0.04 * hem * hem;
        transformed.x += sin(uTime * 0.8 + ph) * 0.014 * smoothstep(0.0, 1.8, position.y); // 몸 전체의 느린 흔들림
        vY = position.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vY;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n        diffuseColor.a *= smoothstep(0.03, 0.42, vY);'); // 밑단은 흐려지며 사라짐
  };
  mat.customProgramCacheKey = () => 'ghost-high';
  return { geo, mat, eyeGeo: new THREE.SphereGeometry(0.06, 24, 16), eyeMat: new THREE.MeshBasicMaterial({ color: 0x000000 }), eyeScale: [0.76, 1.7, 0.45], eyeZ: 0.241 };
}

// 품질별 에셋 (높음은 처음 쓸 때 한 번만 생성)
export function createGhostAssets() {
  const cache = {};
  return { get(q) { return cache[q] || (cache[q] = q === 'high' ? buildHigh() : buildLow()); } };
}

export class Ghost {
  constructor(assets, tx, tz, quality = 'low') {
    this.q = quality;
    const a = assets.get(quality);
    this.mesh = new THREE.Mesh(a.geo, a.mat);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(a.eyeGeo, a.eyeMat);
      eye.scale.set(...a.eyeScale);
      eye.position.set(sx * 0.1, 1.56, a.eyeZ);
      this.mesh.add(eye); this.eyes.push(eye);
    }
    this.mesh.userData.ghost = this;
    this.x = centerOf(tx); this.z = centerOf(tz);
    this.yaw = Math.random() * 6.28;
    this.hp = 100;
    this.state = 'wander';
    this.target = [tx, tz];       // 배회 목표 타일
    this.prevTile = null;
    this.lastSeen = null; this.lostT = 0;
    this.path = []; this.pathT = 0;
    this.attackT = -1; this.attackCd = 0;
    this.flash = 0; this.stunT = 0;
    this.sync();
  }

  // 그래픽 품질 변경 시 모델 교체
  setQuality(q, assets) {
    if (q === this.q) return;
    this.q = q; const a = assets.get(q);
    this.mesh.geometry = a.geo; this.mesh.material = a.mat;
    for (const e of this.eyes) { e.geometry = a.eyeGeo; e.material = a.eyeMat; e.scale.set(...a.eyeScale); e.position.z = a.eyeZ; }
  }

  sync() {
    const lunge = this.attackT >= 0 ? Math.sin(Math.min(1, this.attackT / 0.35) * Math.PI) * 0.25 : 0;
    this.mesh.position.set(this.x + Math.sin(this.yaw) * lunge, GHOST_FLOAT, this.z + Math.cos(this.yaw) * lunge);
    this.mesh.rotation.y = this.yaw;
    this.mesh.scale.setScalar(1 + this.flash * 0.8);
  }

  damage(n) { this.hp -= n; this.flash = 0.15; return this.hp <= 0; }

  moveToward(tx, tz, speed, dt, grid) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) return d;
    const s = Math.min(d, speed * dt);
    this.x += dx / d * s; this.z += dz / d * s;
    const p = { x: this.x, z: this.z }; pushOut(grid, p, RADIUS); this.x = p.x; this.z = p.z;
    const want = Math.atan2(dx, dz);
    let diff = want - this.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 10);
    return d;
  }

  // 반환: 이번 프레임에 플레이어에게 피해를 주려 하는가
  update(dt, player, grid) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.stunT > 0) { this.stunT -= dt; this.attackT = -1; this.sync(); return false; } // 근접 피격 직후 잠깐 기절
    this.attackCd = Math.max(0, this.attackCd - dt);
    const px = player.pos.x, pz = player.pos.z;
    const dist = Math.hypot(px - this.x, pz - this.z);
    const los = hasLOS(grid, this.x, this.z, px, pz);
    let strike = false;

    if (this.state === 'wander') {
      if (los && dist < 10) { this.state = 'chase'; this.lostT = 0; }
    }
    if (this.state === 'chase') {
      if (los && dist < 16) { this.lastSeen = [tileOf(px), tileOf(pz)]; this.lastSeenPos = [px, pz]; this.lostT = 0; }
      else this.lostT += dt;
      if (this.lostT >= 5) { // 5초간 놓치면 배회로
        this.state = 'wander'; this.target = [tileOf(this.x), tileOf(this.z)]; this.prevTile = null; this.attackT = -1;
      }
    }

    if (this.state === 'wander') {
      const [tx, tz] = this.target;
      const d = this.moveToward(centerOf(tx), centerOf(tz), 1.5, dt, grid);
      if (d < 0.08) { // 교차로에서 무작위 방향
        let opts = openNeighbors(grid, tx, tz);
        const fwd = opts.filter(([nx, nz]) => !this.prevTile || nx !== this.prevTile[0] || nz !== this.prevTile[1]);
        if (fwd.length) opts = fwd;
        const o = opts[Math.floor(Math.random() * opts.length)];
        this.prevTile = [tx, tz]; this.target = [o[0], o[1]];
      }
    } else if (this.attackT >= 0) {
      this.attackT += dt; // 공격 모션 중에는 멈춰 선다
      this.yaw = Math.atan2(px - this.x, pz - this.z);
      if (this.attackT >= 0.35) {
        if (dist < 1.6) strike = true;
        this.attackT = -1; this.attackCd = 1.5;
      }
    } else if (los && dist < 16) {
      if (dist > 1.0) this.moveToward(px, pz, 5, dt, grid);
      if (dist <= 1.2 && this.attackCd <= 0) this.attackT = 0;
    } else if (this.lastSeen) { // 놓쳤으면 마지막 목격 위치까지 BFS 이동
      this.pathT -= dt;
      const here = [tileOf(this.x), tileOf(this.z)];
      if (this.pathT <= 0) { this.path = findPath(grid, here, this.lastSeen); this.pathT = 0.25; }
      if (this.path.length > 1) {
        const [nx, nz] = this.path[1];
        this.moveToward(centerOf(nx), centerOf(nz), 5, dt, grid);
        if (Math.hypot(centerOf(nx) - this.x, centerOf(nz) - this.z) < 0.2) this.path.shift();
      } else if (this.lastSeenPos) {
        this.moveToward(this.lastSeenPos[0], this.lastSeenPos[1], 5, dt, grid);
      }
    }
    this.sync();
    return strike;
  }
}

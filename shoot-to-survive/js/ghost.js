import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasLOS, pushOut, tileOf, centerOf, openNeighbors, findPath } from './maze.js';

export const GHOST_H = 2.6;          // 모델 높이 (등을 굽힌 상태, 펴면 훨씬 큼)
export const GHOST_FLOAT = 0;        // 이제 다리로 선다 (도약 때만 떠오름)
export const HEAD_FROM = 2.3;        // 머리 판정은 머리 메시로 한다
export const BODY_DMG = 34, HEAD_DMG = 50; // 몸통 3발, 머리 2발에 사망 (체력 100)
const RADIUS = 0.35;
const V3 = THREE.Vector3;

// 고화질 유령의 밑단 천 일렁임 시간(초) — main에서 매 프레임 갱신
export const ghostTime = { value: 0 };

// ── 공통 부품 ────────────────────────────────────────────
function limb(parts, a, b, ra, rb, seg) { // a→b 로 가늘어지는 원기둥
  const d = new V3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  parts.push(g);
}
function joint(parts, p, r, seg) { const g = new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)); g.translate(p.x, p.y, p.z); parts.push(g); }

// 천 밖으로 늘어진 창백하고 가늘고 긴 팔 + 길게 휜 손가락 (양팔을 하나로 합침)
function buildArms(seg, fine) {
  const parts = [];
  for (const s of [-1, 1]) {
    const sh = new V3(s * 0.26, 0, 0), el = new V3(s * 0.34, -0.75, 0.12), wr = new V3(s * 0.40, -1.45, 0.22); // 어깨(0,0,0) 기준, 지나치게 긴 팔
    limb(parts, sh, el, 0.042, 0.03, seg); limb(parts, el, wr, 0.03, 0.022, seg);
    joint(parts, el, 0.032, seg); joint(parts, wr, 0.024, seg);
    const palm = new V3(wr.x, wr.y - 0.07, wr.z + 0.01); limb(parts, wr, palm, 0.024, 0.02, seg);
    for (const [dx, dz, len] of [[-0.3, 0.1, 0.27], [-0.1, 0.2, 0.32], [0.1, 0.2, 0.3], [0.3, 0.1, 0.24]]) {
      const dir = new V3(dx * s, -1, dz).normalize(), p1 = new V3().copy(palm).addScaledVector(dir, len);
      limb(parts, palm, p1, 0.0085, 0.0045, fine ? 6 : 4);
      if (fine) limb(parts, p1, new V3(p1.x + dx * s * 0.03, p1.y - 0.05, p1.z + 0.06), 0.0045, 0.0018, 5); // 끝이 안쪽으로 휜 손톱 쪽
    }
  }
  return mergeGeometries(parts);
}

// 지나치게 긴 다리: 허벅지 → 앞으로 꺾인 무릎 → 뒤로 빠진 발목 → 길게 뻗은 발가락 (엉덩이가 원점, 서 있으면 발끝이 y=-1.5)
function buildLeg(s, seg, fine) {
  const parts = [], hip = new V3(0, 0, 0), knee = new V3(s * 0.03, -0.74, 0.14), ank = new V3(s * 0.02, -1.38, -0.07), toe = new V3(s * 0.03, -1.47, 0.24);
  limb(parts, hip, knee, 0.05, 0.034, seg); limb(parts, knee, ank, 0.034, 0.021, seg);
  joint(parts, knee, 0.037, seg); joint(parts, ank, 0.024, seg);
  limb(parts, ank, toe, 0.02, 0.012, seg);
  for (const dx of [-0.045, 0, 0.045]) limb(parts, toe, new V3(toe.x + dx + s * 0.02, -1.5, 0.42), 0.011, 0.003, fine ? 5 : 4);
  return mergeGeometries(parts);
}

// 작은 머리 위에 얹는 얼굴: 크고 텅 빈 눈구멍(바깥쪽이 처짐), 세로로 길게 벌어진 비대칭 입, 눈 속의 희미한 푸른 점
const HEAD = { rx: 0.11, ry: 0.15, rz: 0.12 };
function buildFace(segs) {
  const surf = (x, y) => HEAD.rz * Math.sqrt(Math.max(0.05, 1 - (x / HEAD.rx) ** 2 - (y / HEAD.ry) ** 2));
  const place = (g, x, y, tilt = 0, sc = [1, 1]) => { // 얼굴 곡면에 붙이기
    const z = surf(x, y), n = new V3(x / HEAD.rx ** 2, y / HEAD.ry ** 2, z / HEAD.rz ** 2).normalize();
    g.scale(sc[0], sc[1], 1); g.rotateZ(tilt);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), n)); g.translate(x, y, z + 0.0025); return g;
  };
  const ell = (rx, ry, n) => new THREE.ShapeGeometry(new THREE.Shape(Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return new THREE.Vector2(Math.cos(a) * rx, Math.sin(a) * ry); })), 1);
  const eyes = [], glow = [];
  for (const s of [-1, 1]) {
    const x = s * 0.043, y = 0.03 - (s > 0 ? 0.008 : 0), k = s > 0 ? 1.12 : 1.0; // 오른쪽 눈이 조금 더 크고 낮음 (비대칭)
    eyes.push(place(ell(0.022, 0.042, segs), x, y, s * -0.38, [k, k]));
    const dot = new THREE.CircleGeometry(0.0055, 8); glow.push(place(dot, x, y - 0.014 * k, 0));
  }
  // 입: 반지름이 들쭉날쭉한 긴 타원 (한쪽으로 쳐짐)
  const m = []; const N = segs + 4;
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, j = 1 + 0.16 * Math.sin(3 * a + 1) + 0.1 * Math.sin(5 * a + 0.4); m.push(new THREE.Vector2(Math.cos(a) * 0.024 * j + 0.004, Math.sin(a) * 0.062 * j)); }
  const mouth = place(new THREE.ShapeGeometry(new THREE.Shape(m), 1), 0.006, -0.068, 0.08);
  return { face: mergeGeometries([...eyes, mouth]), glow: mergeGeometries(glow) };
}

// ── 낮음: 로우폴리 유령 ──
function buildLow() {
  const SK = ([r, y]) => new THREE.Vector2(r * 0.8, y * 0.9 - 0.55); // 앙상하게 가늘고 짧게 (엉덩이 기준 좌표: 목 위 1.16, 밑단 -0.55)
  const pts = [[0.055, 1.88], [0.06, 1.8], [0.14, 1.7], [0.27, 1.62], [0.3, 1.5], [0.31, 1.3], [0.36, 1.0], [0.44, 0.6], [0.52, 0.25], [0.58, 0.0]].map(SK);
  const geo = new THREE.LatheGeometry(pts, 10), pos = geo.attributes.position, np = pts.length;
  for (let i = 0; i < pos.count; i++) { // 찢긴 밑단: 톱니처럼 들쭉날쭉
    const j = i % np, seg = Math.floor(i / np), y = pos.getY(i);
    if (j === np - 1) pos.setY(i, y + (seg % 2 ? 0.3 : 0.03) + (seg % 3 === 0 ? 0.1 : 0));
    else if (j === np - 2) pos.setY(i, y + (seg % 2 ? 0.1 : 0));
  }
  for (let i = 0; i < pos.count; i++) { // 등의 혹: 어깨 뒤쪽을 크게 부풀림
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (z < 0) pos.setZ(i, z * (1 + 0.75 * Math.exp(-(((y - 0.7) / 0.3) ** 2))));
  }
  geo.computeVertexNormals();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x7a766f, emissive: 0x0b0b0c, flatShading: true, side: THREE.DoubleSide });
  const head = new THREE.SphereGeometry(1, 8, 6); head.scale(HEAD.rx, HEAD.ry, HEAD.rz);
  const f = buildFace(6);
  return {
    body: { geo, mat: cloth }, head: { geo: head, mat: cloth },
    arms: { geo: buildArms(4, false), mat: new THREE.MeshLambertMaterial({ color: 0x8d8a84, flatShading: true }) },
    legs: { L: buildLeg(-1, 5, false), R: buildLeg(1, 5, false), mat: new THREE.MeshLambertMaterial({ color: 0x8d8a84, flatShading: true }) },
    face: { geo: f.face, mat: new THREE.MeshBasicMaterial({ color: 0x000000 }) }, glow: { geo: f.glow, mat: new THREE.MeshBasicMaterial({ color: 0x9cc0ff }) },
  };
}

// ── 높음: 하이폴리 천 유령 ──
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function fabricMaps() { // 낡고 더러운 리넨: 때 · 얼룩 · 번진 자국 + 약한 직조 무늬 (색 맵 + 범프 맵)
  const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 512; draw(c.getContext('2d')); return c; };
  const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const weave = (x, a) => { x.globalAlpha = a; for (let i = 0; i < 512; i += 2) { x.fillStyle = (i & 2) ? '#fff' : '#6e6a62'; x.fillRect(0, i, 512, 1); x.fillRect(i, 0, 1, 512); } x.globalAlpha = 1; };
  const color = mk((x) => {
    x.fillStyle = '#cfc9bd'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 30; i++) { // 때 · 얼룩
      const px = rnd() * 512, py = rnd() * 512, r = 30 + rnd() * 120, g = x.createRadialGradient(px, py, 0, px, py, r), k = rnd();
      g.addColorStop(0, k < 0.55 ? 'rgba(70,62,48,0.22)' : k < 0.8 ? 'rgba(88,34,26,0.20)' : 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    }
    for (let i = 0; i < 16; i++) { // 흘러내린 검붉은 자국
      const px = rnd() * 512, py = rnd() * 400, w = 3 + rnd() * 9, len = 40 + rnd() * 160, g = x.createLinearGradient(0, py, 0, py + len);
      g.addColorStop(0, 'rgba(70,24,18,0.38)'); g.addColorStop(1, 'rgba(70,24,18,0)'); x.fillStyle = g; x.fillRect(px, py, w, len);
    }
    const dg = x.createLinearGradient(0, 0, 0, 512); dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(30,24,16,0.42)'); x.fillStyle = dg; x.fillRect(0, 0, 512, 512); // 아래로 갈수록 더럽게
    weave(x, 0.10);
    const img = x.getImageData(0, 0, 512, 512); for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    x.putImageData(img, 0, 0);
  });
  const soft = mk((x) => { x.filter = 'blur(0.7px)'; x.drawImage(color, 0, 0); });
  const bump = mk((x) => { x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 512, 512); weave(x, 0.55); });
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 4); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: T(soft, true), bump: T(bump, false) };
}

function buildHigh() {
  // 1) 좁은 어깨, 가늘고 긴 목, 아래로 퍼지는 천 (스플라인) → 72분할 선삭
  const prof = new THREE.SplineCurve([[0.055, 1.9], [0.058, 1.82], [0.085, 1.74], [0.17, 1.68], [0.265, 1.62], [0.3, 1.52], [0.3, 1.38], [0.32, 1.2], [0.37, 0.98], [0.43, 0.74], [0.5, 0.48], [0.57, 0.22], [0.61, 0.03], [0.62, 0.0]]
    .map(([r, y]) => new THREE.Vector2(r * 0.8, y * 0.9 - 0.55))).getPoints(84).reverse(); // 앙상하게 가늘고 짧게 (엉덩이 기준)
  let geo = new THREE.LatheGeometry(prof, 72);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, z), th = Math.atan2(x, z);
    const yy = y + 0.55, amp = sstep(1.4, 0.1, yy); // 밑단 기준 높이 / 아래로 갈수록 주름이 깊다
    const fold = 0.06 * Math.sin(7 * th + 0.8 + y * 1.6) + 0.035 * Math.sin(13 * th + 2.1 - y * 2.2) + 0.028 * Math.sin(3 * th + 0.4);
    const hump = 0.8 * Math.exp(-(((y - 0.7) / 0.3) ** 2)) * Math.max(0, -Math.cos(th)); // 등의 혹
    const rr = r * (1 + amp * fold + hump);
    const hemW = sstep(0.34, 0.0, yy), lift = hemW * (0.1 + 0.07 * Math.sin(5 * th + 1) + 0.045 * Math.sin(9 * th + 0.3 * Math.cos(th)));
    pos.setXYZ(i, rr * Math.sin(th), y + lift, rr * Math.cos(th));
    let c = 1 - 0.34 * Math.min(1, Math.max(0, -fold * amp / 0.07)); // 주름 골짜기는 어둡게
    c *= 0.72 + 0.28 * sstep(0.0, 0.8, yy); // 아래쪽은 때가 탐
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo = toCreasedNormals(geo, Math.PI);
  // 2) 재질: 천(밑단 일렁임 + 찢긴 조각) / 머리·팔은 일렁이지 않는 재질
  const { map, bump } = fabricMaps();
  const P = { color: 0x57544f, map, bumpMap: bump, bumpScale: 0.8, roughness: 0.97, metalness: 0, side: THREE.DoubleSide, emissive: 0x121215 };
  const mat = new THREE.MeshStandardMaterial({ ...P, vertexColors: true, transparent: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = ghostTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vY;\nvarying float vA;')
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 2.3;
        float yy = position.y + 0.55;
        float hem = smoothstep(0.8, 0.0, yy);
        float ang = atan(position.x, position.z);
        vec2 rad = normalize(position.xz + vec2(1e-5));
        float wave = sin(uTime * 1.7 + ang * 4.0 + ph) * 0.05 + sin(uTime * 2.9 - ang * 7.0 + ph * 1.3) * 0.028 + sin(uTime * 1.1 + ang * 2.0 - ph) * 0.022;
        transformed.xz += rad * wave * hem;
        transformed.y += sin(uTime * 2.3 + ang * 5.0 + ph) * 0.04 * hem * hem;
        transformed.x += sin(uTime * 0.8 + ph) * 0.014 * smoothstep(0.0, 1.7, yy);
        vY = yy; vA = ang;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vY;\nvarying float vA;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float a9 = (vA + 3.14159) / 6.28318 * 9.0, st = floor(a9);
        float cutH = 0.5 * pow(fract(sin(st * 12.9898) * 43758.5453), 1.6);       // 조각마다 다른 길이
        if (vY < cutH + abs(fract(a9) - 0.5) * 0.42) discard;                      // 찢겨 늘어진 천 조각 (끝이 뾰족)
        diffuseColor.a *= smoothstep(0.0, 0.25, vY);`);
  };
  mat.customProgramCacheKey = () => 'ghost-high2';
  const plain = new THREE.MeshStandardMaterial(P);
  // 3) 작고 긴 달걀형 머리 (천이 덮인 느낌의 잔주름)
  let head = new THREE.SphereGeometry(1, 40, 28), hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), k = 1 + 0.025 * Math.sin(9 * Math.atan2(x, z) + y * 4) + 0.02 * Math.sin(5 * y * 3 + 1);
    hp.setXYZ(i, x * HEAD.rx * k * (1 - 0.12 * Math.max(0, -y)), y * HEAD.ry * (y < 0 ? 1.12 : 1), z * HEAD.rz * k); }
  head = toCreasedNormals(head, Math.PI);
  const f = buildFace(26);
  return {
    body: { geo, mat }, head: { geo: head, mat: plain },
    arms: { geo: buildArms(10, true), mat: new THREE.MeshStandardMaterial({ color: 0x938f88, roughness: 0.85, metalness: 0, emissive: 0x0c0c0e }) },
    legs: { L: buildLeg(-1, 10, true), R: buildLeg(1, 10, true), mat: new THREE.MeshStandardMaterial({ color: 0x938f88, roughness: 0.85, metalness: 0, emissive: 0x0c0c0e }) },
    face: { geo: f.face, mat: new THREE.MeshBasicMaterial({ color: 0x000000 }) }, glow: { geo: f.glow, mat: new THREE.MeshBasicMaterial({ color: 0x9cc0ff }) },
  };
}

// 품질별 에셋 (높음은 처음 쓸 때 한 번만 생성)
export function createGhostAssets() {
  const cache = {};
  return { get(q) { return cache[q] || (cache[q] = q === 'high' ? buildHigh() : buildLow()); } };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
export class Ghost {
  constructor(assets, tx, tz, quality = 'low') {
    this.q = quality;
    const a = assets.get(quality);
    this.mesh = new THREE.Group(); // 루트: 위치·방향
    this.upper = new THREE.Group(); this.upper.position.set(0, 1.5, 0); this.mesh.add(this.upper); // 상체: 엉덩이를 축으로 앞으로 굽는다
    this.cloth = new THREE.Mesh(a.body.geo, a.body.mat); this.upper.add(this.cloth);
    this.headG = new THREE.Group(); this.headG.position.set(0, 1.1, 0.0); this.upper.add(this.headG); // 길게 뺀 목 끝
    this.headM = new THREE.Mesh(a.head.geo, a.head.mat); this.faceM = new THREE.Mesh(a.face.geo, a.face.mat); this.glowM = new THREE.Mesh(a.glow.geo, a.glow.mat);
    for (const m of [this.headM, this.faceM, this.glowM]) { m.position.y = 0.09; this.headG.add(m); m.userData.head = true; }
    this.armsG = new THREE.Group(); this.mesh.add(this.armsG);           // 어깨에서 늘어지는 팔
    this.armsM = new THREE.Mesh(a.arms.geo, a.arms.mat); this.armsG.add(this.armsM);
    this.legL = new THREE.Mesh(a.legs.L, a.legs.mat); this.legR = new THREE.Mesh(a.legs.R, a.legs.mat); // 엉덩이에서 흔들리는 긴 다리
    this.legL.position.set(-0.12, 1.5, 0); this.legR.position.set(0.12, 1.5, 0); this.mesh.add(this.legL, this.legR);
    this.mesh.traverse((m) => { m.userData.ghost = this; });
    this.seed = Math.random() * 100;
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
    this.spd = 0; this.ph = Math.random() * 6.28; this.gT = null; this.px = this.x; this.pz = this.z; this.hop = 0;
    this.sync();
  }

  // 그래픽 품질 변경 시 모델 교체
  setQuality(q, assets) {
    if (q === this.q) return;
    this.q = q; const a = assets.get(q);
    const set = (m, k) => { m.geometry = a[k].geo; m.material = a[k].mat; };
    set(this.cloth, 'body'); set(this.armsM, 'arms'); set(this.headM, 'head'); set(this.faceM, 'face'); set(this.glowM, 'glow');
    this.legL.geometry = a.legs.L; this.legR.geometry = a.legs.R; this.legL.material = this.legR.material = a.legs.mat;
  }

  sync() {
    const now = performance.now() / 1000;
    if (this.gT === null) this.gT = now;
    const dt = now - this.gT;
    if (dt > 0.004) { // 이동 속도를 추정해 보행/도약 모션에 쓴다
      const sp = Math.hypot(this.x - this.px, this.z - this.pz) / Math.min(dt, 0.1);
      this.spd += (sp - this.spd) * Math.min(1, dt * 8); this.px = this.x; this.pz = this.z;
      const run = clamp01((this.spd - 2.2) / 2.2), walk = clamp01(this.spd / 1.2) * (1 - run);
      this.ph += Math.min(dt, 0.1) * (walk * (this.spd / 1.5) * Math.PI * 2 * 0.6 + run * Math.PI * 2 * 2.2); // 걷기: 느리게 / 달리기: 도약 주기
      this.gT = now;
    }
    const run = clamp01((this.spd - 2.2) / 2.2), walk = clamp01(this.spd / 1.2) * (1 - run), ph = this.ph;
    const atk = this.attackT >= 0 ? Math.sin(Math.min(1, this.attackT / 0.35) * Math.PI) : 0;
    // 도약: 두 다리를 크게 벌리며 몸이 공중으로 떠오른다
    const hop = run * 0.45 * Math.pow(Math.max(0, Math.sin(ph + 0.4)), 0.8) + walk * 0.04 * Math.abs(Math.sin(ph));
    const lunge = atk * 0.25;
    this.mesh.position.set(this.x + Math.sin(this.yaw) * lunge, GHOST_FLOAT + hop, this.z + Math.cos(this.yaw) * lunge);
    this.mesh.rotation.y = this.yaw;
    this.mesh.scale.setScalar(1 + this.flash * 0.8);
    const A = 0.42 * walk + 0.95 * run, off = Math.PI * (1 - run) + 0.5 * run;
    this.legL.rotation.x = A * Math.sin(ph); this.legR.rotation.x = A * Math.sin(ph + off); // 뻣뻣한 긴 다리
    const tilt = 0.55 + 0.25 * run + 0.35 * atk + 0.02 * Math.sin(now * 1.3 + this.seed); // 등을 굽힘 (달릴수록·덮칠수록 더 숙임)
    this.upper.rotation.x = tilt; this.upper.rotation.z = 0.08 * Math.sin(ph) * run;
    this.armsG.position.set(0, 1.5 + 0.95 * Math.cos(tilt), 0.95 * Math.sin(tilt));
    this.armsG.rotation.x = 0.5 * run + 0.18 * Math.sin(ph) * run + 0.06 * Math.sin(ph) * walk; // 달릴 때 팔이 뒤로 끌린다
    // 머리: 길게 뺀 목 끝에서 한쪽으로 기울어진 채 흔들리다가 가끔 뚝 꺾이듯 움찔한다 (뒤틀린 움직임)
    const t = now + this.seed, k = Math.floor(t / 2.6), p2 = t / 2.6 - k;
    const h = Math.sin(k * 91.7 + this.seed * 13.1), jerk = p2 < 0.06 ? p2 / 0.06 : Math.max(0, 1 - (p2 - 0.06) / 0.55);
    const r = this.headG.rotation; r.z = 0.26 + 0.07 * Math.sin(t * 0.9) + h * 0.38 * jerk; r.x = -0.45 - 0.2 * run + h * 0.18 * jerk; r.y = h * 0.45 * jerk;
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

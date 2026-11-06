import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, TILE, WALL_H, isWall, centerOf, openTiles, mulberry32 } from './maze.js';
import { stoneTexture } from './textures.js';
import { wallMaps, floorMaps, ceilMaps, puddleAlpha } from './textures_hi.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ── 실제 입체 벽돌 ──────────────────────────────────────────
// 통로에 드러난 벽 면마다 벽돌을 한 장씩 모델링한다. 벽돌마다 튀어나온 정도·기울기·모서리 깎임이 다르고, 사이에 깊은 줄눈이 파인다.
// 모든 벽돌 앞면은 충돌 경계(타일 면)보다 안쪽이라서 통로로 삐져나오지 않는다.
const BASE_W = -0.08; // 줄눈(모르타르) 면의 깊이 (타일 면 기준 안쪽)
function brickGeometry(grid, seed) {
  const r = mulberry32(seed), P = [], UV = [], C = [], I = [];
  const W = TILE, H = WALL_H;
  for (let tz = 0; tz < N; tz++) for (let tx = 0; tx < N; tx++) {
    if (!isWall(grid, tx, tz)) continue;
    for (const [dx, dz] of DIRS) {
      const nx = tx + dx, nz = tz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N || isWall(grid, nx, nz)) continue; // 통로에 드러난 면만
      const Ux = dz, Uz = -dx, Nx = dx, Nz = dz; // U: 면을 따라 오른쪽, N: 통로 쪽 (U×V=N, V=위)
      const Ox = centerOf(tx) + dx * (TILE / 2) - Ux * (TILE / 2), Oz = centerOf(tz) + dz * (TILE / 2) - Uz * (TILE / 2);
      const vtx = (u, v, w, b) => { P.push(Ox + Ux * u + Nx * w, v, Oz + Uz * u + Nz * w); UV.push(u / W, v / H); C.push(b, b * 0.99, b * 0.97); return P.length / 3 - 1; };
      for (let row = 0; row < 4; row++) {
        const edges = row % 2 ? [0, 1, 2, 3] : [0, 1.5, 3], y0 = row * 0.8, y1 = y0 + 0.8;
        for (let c = 0; c < edges.length - 1; c++) {
          const gap = 0.013 + r() * 0.012; // 줄눈 폭
          const u0 = edges[c] + (c === 0 ? 0.004 : gap), u1 = edges[c + 1] - (c === edges.length - 2 ? 0.004 : gap), v0 = y0 + (row === 0 ? 0.004 : gap), v1 = y1 - (row === 3 ? 0.004 : gap);
          let p = 0.02 + 0.058 * Math.pow(r(), 0.8); if (r() < 0.06) p = 0.012; // 대부분 튀어나온 정도가 제각각, 가끔 깊이 들어간 벽돌
          const tu = (r() - 0.5) * 0.02, tv = (r() - 0.5) * 0.014, b = 0.78 + r() * 0.34, nxs = Math.max(2, Math.round((u1 - u0) / 0.25)), nys = 3;
          const chip = r() < 0.3 ? [Math.floor(r() * 2) * nxs, Math.floor(r() * 2) * nys] : null; // 모서리 한 곳이 떨어져 나간 벽돌
          const grid2 = [], ring = [];
          for (let j = 0; j <= nys; j++) for (let i = 0; i <= nxs; i++) {
            const fu = i / nxs, fv = j / nys, border = i === 0 || i === nxs || j === 0 || j === nys;
            let u = u0 + (u1 - u0) * fu, v = v0 + (v1 - v0) * fv, w = BASE_W + p + tu * (fu - 0.5) + tv * (fv - 0.5) + (border ? -0.007 : (r() - 0.5) * 0.007);
            if (border) { u += (0.5 - fu) * 0.018; v += (0.5 - fv) * 0.018; } // 모서리를 깎아 둥글게
            if (chip && i === chip[0] && j === chip[1]) { w -= 0.018; u += (0.5 - fu) * 0.03; v += (0.5 - fv) * 0.03; }
            grid2.push(vtx(u, v, w, b * (0.96 + r() * 0.08)));
          }
          const at = (i, j) => grid2[j * (nxs + 1) + i];
          for (let j = 0; j < nys; j++) for (let i = 0; i < nxs; i++) { const a = at(i, j), bb = at(i + 1, j), cc = at(i + 1, j + 1), d = at(i, j + 1); I.push(a, bb, cc, a, cc, d); }
          for (let i = 0; i < nxs; i++) ring.push([i, 0]); for (let j = 0; j < nys; j++) ring.push([nxs, j]); for (let i = nxs; i > 0; i--) ring.push([i, nys]); for (let j = nys; j > 0; j--) ring.push([0, j]); // 둘레 (반시계)
          const base = ring.map(([i, j]) => vtx(u0 + (u1 - u0) * i / nxs, v0 + (v1 - v0) * j / nys, BASE_W, b * 0.7)); // 줄눈 면의 둘레
          for (let k = 0; k < ring.length; k++) { const k1 = (k + 1) % ring.length, Fk = at(...ring[k]), Fk1 = at(...ring[k1]); I.push(Fk, base[k], base[k1], Fk, base[k1], Fk1); } // 옆면(경사)
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(I), 1)); g.computeVertexNormals();
  return g;
}

// 미로 메시: 벽(InstancedMesh) + 바닥 + 천장 + 희미한 전등
// 낮음: 단순한 돌 텍스처 / 높음: 낡은 콘크리트 건물 (범프·거칠기 재질 + 배관·보·잔해·웅덩이·먼지·깜빡이는 전등)
export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const wallTex = stoneTexture(108, 3);
    const floorTex = stoneTexture(80, 7); floorTex.repeat.set(N, N);
    const ceilTex = stoneTexture(70, 11); ceilTex.repeat.set(N, N);
    this.wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    this.floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    this.ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x6e5a36, fog: false });
    this.wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
    this.lampGeo = new THREE.CylinderGeometry(0.28, 0.4, 0.14, 6);
    // 실제 PointLight는 3개만 — 가장 가까운 전등으로 옮겨 다닌다
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffc27a, 7, 11, 2);
      scene.add(l);
      return l;
    });
    this.lamps = [];
    this.grid = null; this.detailSeed = 1; this.low = false; this.hi = null; this.motes = null; this.lastT = 0;
  }

  // 높음 전용 재질: 처음 높음을 쓸 때 한 번만 생성
  _high() {
    if (this.hi) return this.hi;
    const w = wallMaps(), f = floorMaps(N / 2), c = ceilMaps(N);
    const std = (m, rep, bs) => new THREE.MeshStandardMaterial({ map: m.map, bumpMap: m.bump, bumpScale: bs, roughnessMap: m.rough, roughness: 1, metalness: 0 });
    const dark = (col, rough = 0.9) => new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0.2 });
    return (this.hi = {
      wall: new THREE.MeshStandardMaterial({ map: w.map, bumpMap: w.bump, bumpScale: 1.4, roughnessMap: w.rough, roughness: 1, metalness: 0, vertexColors: true }), // 입체 벽돌용 (벽돌마다 색이 다름)
      mortar: new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.97, metalness: 0 }),
      floor: std(f, 1, 2.0), ceil: std(c, 1, 1.4),
      trim: dark(0x4b4a47), beam: dark(0x3d3c3a, 0.95), pipe: new THREE.MeshStandardMaterial({ color: 0x5b4a3b, roughness: 0.55, metalness: 0.35 }),
      rubble: dark(0x5a5955, 0.95), housing: dark(0x1c1d1f, 0.6), bulb: new THREE.MeshBasicMaterial({ color: 0x8a7048, fog: false }),
      puddle: new THREE.MeshStandardMaterial({ color: 0x060709, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.92, alphaMap: puddleAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      dust: new THREE.PointsMaterial({ color: 0xd6ccb4, size: 0.03, map: puddleAlpha(), alphaMap: puddleAlpha(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), // 둥근 먼지 알갱이
    });
  }

  setQuality(q) {
    this.low = q === 'low';
    this.lights.forEach((l) => { l.intensity = this.low ? 10 : 7; });
    this.scene.fog.color.set(this.low ? 0x000000 : 0x030406); // 높음: 약간 푸른 안개
    if (this.grid) this.build(this.grid, null); // 같은 미로·전등 위치로 배경만 교체
  }

  build(grid, rng) {
    this.grid = grid;
    while (this.group.children.length) { const c = this.group.children[0]; this.group.remove(c); c.geometry?.dispose?.(); }
    this.motes = null;
    const high = !this.low, H = high ? this._high() : null;
    if (rng) this.detailSeed = Math.floor(rng() * 4294967295);
    // 벽: 통로와 맞닿은 것만
    const spots = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!isWall(grid, x, z)) continue;
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        if (!isWall(grid, x + dx, z + dz)) near = true;
      if (near) spots.push([x, z]);
    }
    // 낮음: 평평한 돌 상자 / 높음: 줄눈 면(안쪽으로 들어간 상자) + 벽돌 한 장 한 장의 3D 모델
    const walls = new THREE.InstancedMesh(high ? new THREE.BoxGeometry(TILE + BASE_W * 2, WALL_H, TILE + BASE_W * 2) : this.wallGeo.clone(), high ? H.mortar : this.wallMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => { m.makeTranslation(centerOf(x), WALL_H / 2, centerOf(z)); walls.setMatrixAt(i, m); });
    walls.instanceMatrix.needsUpdate = true;
    walls.frustumCulled = false;
    this.group.add(walls);
    if (high) { const bricks = new THREE.Mesh(brickGeometry(grid, this.detailSeed ^ 0x9e3779b9), H.wall); bricks.frustumCulled = false; this.group.add(bricks); this.brickTris = bricks.geometry.index.count / 3; }

    const size = N * TILE;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), high ? H.floor : this.floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(size / 2, 0, size / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size), high ? H.ceil : this.ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(size / 2, WALL_H, size / 2);
    this.group.add(floor, ceil);

    // 전등 6~8개 (서로 떨어지게) — 품질을 바꿔도 위치는 그대로
    if (rng) {
      const tiles = openTiles(grid).sort(() => rng() - 0.5);
      const want = 6 + Math.floor(rng() * 3);
      this.lamps = [];
      for (const [x, z] of tiles) {
        if (this.lamps.length >= want) break;
        if (this.lamps.some(l => Math.abs(l.tx - x) + Math.abs(l.tz - z) < 4)) continue;
        this.lamps.push({ tx: x, tz: z, x: centerOf(x), z: centerOf(z), seed: Math.random() * 100 });
      }
    }
    if (high) this._detail(grid, H);
    else for (const l of this.lamps) {
      const mesh = new THREE.Mesh(this.lampGeo, this.lampMat);
      mesh.position.set(l.x, WALL_H - 0.07, l.z);
      this.group.add(mesh);
    }
    this.update(new THREE.Vector3(1.5, 0, 1.5), 0);
  }

  // ── 높음 전용 디테일 ──
  _detail(grid, H) {
    const r = mulberry32(this.detailSeed), open = openTiles(grid), g = this.group;
    const inst = (geo, mat, list, colorFn) => { // list: [{p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz]}]
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
      list.forEach((o, i) => { e.set(...(o.r || [0, 0, 0])); q.setFromEuler(e); M.compose(new THREE.Vector3(...o.p), q, new THREE.Vector3(...(o.s || [1, 1, 1]))); mesh.setMatrixAt(i, M); if (colorFn) mesh.setColorAt(i, colorFn(c, i)); });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; g.add(mesh); return mesh;
    };
    const base = [], pipes = [], beams = [];
    for (const [tx, tz] of open) {
      const cx = centerOf(tx), cz = centerOf(tz);
      for (const [dx, dz] of DIRS) {
        if (!isWall(grid, tx + dx, tz + dz)) continue;
        const ox = cx + dx * (TILE / 2 - 0.04), oz = cz + dz * (TILE / 2 - 0.04);
        base.push({ p: [ox, 0.1, oz], s: dx ? [0.08, 0.2, TILE] : [TILE, 0.2, 0.08] });                  // 걸레받이
        if (r() < 0.32) pipes.push({ p: [cx + dx * (TILE / 2 - 0.13), 2.82 + r() * 0.12, cz + dz * (TILE / 2 - 0.13)], r: dx ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2], s: [1, 1, 1] }); // 벽 따라 가는 배관
      }
      if ((tx + tz) % 3 === 0) { // 천장 보: 좌우 벽이면 가로로, 위아래 벽이면 세로로
        const lr = isWall(grid, tx - 1, tz) && isWall(grid, tx + 1, tz), ud = isWall(grid, tx, tz - 1) && isWall(grid, tx, tz + 1);
        if (lr) beams.push({ p: [cx, WALL_H - 0.14, cz], s: [TILE, 0.28, 0.32] }); else if (ud) beams.push({ p: [cx, WALL_H - 0.14, cz], s: [0.32, 0.28, TILE] });
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    inst(box, H.trim, base); inst(box, H.beam, beams);
    const pg = new THREE.CylinderGeometry(0.055, 0.055, TILE - 0.02, 10); inst(pg, H.pipe, pipes);
    // 바닥 잔해: 부서진 콘크리트 조각 + 큰 블록
    const rub = [];
    for (let i = 0; i < 70; i++) { const [tx, tz] = open[Math.floor(r() * open.length)], big = i < 9, s = big ? [0.3 + r() * 0.2, 0.16 + r() * 0.1, 0.18 + r() * 0.14] : [0.05 + r() * 0.16, 0.03 + r() * 0.07, 0.05 + r() * 0.14];
      rub.push({ p: [centerOf(tx) + (r() - 0.5) * 2.3, s[1] / 2 - 0.01, centerOf(tz) + (r() - 0.5) * 2.3], r: [(r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4], s }); }
    inst(box, H.rubble, rub, (c) => { const b = 0.7 + r() * 0.5; return c.setRGB(b, b, b * 0.97); });
    // 젖은 웅덩이 (전등·손전등 불빛이 반짝인다)
    const pud = []; const pg2 = new THREE.PlaneGeometry(1, 1); pg2.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) { const [tx, tz] = open[Math.floor(r() * open.length)]; pud.push({ p: [centerOf(tx) + (r() - 0.5) * 1.6, 0.006 + i * 0.0004, centerOf(tz) + (r() - 0.5) * 1.6], r: [0, r() * 6.28, 0], s: [0.7 + r() * 1.3, 1, 0.6 + r() * 1.0] }); }
    inst(pg2, H.puddle, pud);
    // 전등: 철망 달린 전구
    const housing = mergeGeometries([new THREE.CylinderGeometry(0.24, 0.3, 0.06, 14), (() => { const t = new THREE.TorusGeometry(0.15, 0.012, 6, 16); t.rotateX(Math.PI / 2); t.translate(0, -0.12, 0); return t; })(),
      ...[0, 1, 2, 3, 4, 5].map((k) => { const c = new THREE.CylinderGeometry(0.008, 0.008, 0.15, 4); const a = k / 6 * 6.283; c.translate(Math.cos(a) * 0.15, -0.075, Math.sin(a) * 0.15); return c; })]);
    const bulbG = new THREE.SphereGeometry(0.09, 14, 10); bulbG.translate(0, -0.1, 0);
    inst(housing, H.housing, this.lamps.map((l) => ({ p: [l.x, WALL_H - 0.03, l.z] })));
    inst(bulbG, H.bulb, this.lamps.map((l) => ({ p: [l.x, WALL_H - 0.03, l.z] })));
    // 떠다니는 먼지
    const n = 160, pos = new Float32Array(n * 3); this.motes = { pos, vel: Array.from({ length: n }, () => [(r() - 0.5) * 0.05, (r() - 0.5) * 0.03, (r() - 0.5) * 0.05]) };
    for (let i = 0; i < n; i++) { pos[i * 3] = 20 + (r() - 0.5) * 16; pos[i * 3 + 1] = 0.3 + r() * 2.7; pos[i * 3 + 2] = 20 + (r() - 0.5) * 16; }
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pgeo, H.dust); pts.frustumCulled = false; g.add(pts); this.motes.geo = pgeo;
  }

  update(p, t = 0) {
    const sorted = this.lamps.slice().sort((a, b) =>
      (a.x - p.x) ** 2 + (a.z - p.z) ** 2 - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
    this.lights.forEach((light, i) => {
      const l = sorted[i];
      if (l && !(this.low && i > 0)) {
        light.position.set(l.x, WALL_H - 0.4, l.z); light.visible = true;
        // 높음: 전등이 가끔 불안하게 깜빡인다 (0.1초 안팎으로 어두워짐)
        let f = 1; if (!this.low) { const k = Math.floor(t * 7 + l.seed), h = Math.sin(k * 127.1 + l.seed * 311.7) * 43758.5453; f = (h - Math.floor(h)) > 0.93 ? 0.3 + 0.4 * Math.abs(Math.sin(t * 40 + l.seed)) : 0.94 + 0.06 * Math.sin(t * 11 + l.seed); }
        light.intensity = (this.low ? 10 : 7) * f;
      } else light.visible = false; // 낮음: 가장 가까운 전등 1개만 실제 조명
    });
    if (this.motes) { // 먼지: 천천히 떠다니고, 플레이어 주변을 벗어나면 다시 주변으로
      const dt = Math.min(0.1, t - this.lastT) || 0, a = this.motes.pos, v = this.motes.vel;
      for (let i = 0; i < v.length; i++) {
        a[i * 3] += v[i][0] * dt + Math.sin(t * 0.5 + i) * 0.004; a[i * 3 + 1] += v[i][1] * dt; a[i * 3 + 2] += v[i][2] * dt;
        if (Math.hypot(a[i * 3] - p.x, a[i * 3 + 2] - p.z) > 8 || a[i * 3 + 1] < 0.1 || a[i * 3 + 1] > 3.1) { const ang = Math.random() * 6.283, rad = Math.random() * 7; a[i * 3] = p.x + Math.cos(ang) * rad; a[i * 3 + 2] = p.z + Math.sin(ang) * rad; a[i * 3 + 1] = 0.3 + Math.random() * 2.7; }
      }
      this.motes.geo.attributes.position.needsUpdate = true;
    }
    this.lastT = t;
  }
}

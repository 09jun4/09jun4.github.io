// Environment — 도로 데이터를 보고 주변 환경(건물·상점·가로수·가로등·표지판·학원·집)을 자동 배치해요.
// 지도가 바뀌어도 도로만 있으면 같은 규칙으로 동네가 다시 만들어져요.
import * as THREE from '../lib/three.js';
import { makeRng } from '../core/utils.js';
import { facadeTexture, facadeNightTexture, signAtlas, textTexture, grassTexture } from '../core/Textures.js';

// 여러 상자를 하나의 지오메트리로 합쳐 그리기 호출을 줄여요.
class BoxBatch {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; }
  // 중심(cx, cz), 바닥 높이 y0, 크기(hx, h, hz), Y회전 rot. uvScale: 외벽 텍스처 1칸 크기(m)
  add(cx, y0, cz, hx, h, hz, rot, color, { uvScale = 3, top = true, bottom = false } = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const W = (lx, y, lz) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
    const N = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];
    const y1 = y0 + h;
    const faces = [
      // [법선, 4점(좌하, 우하, 좌상, 우상), 가로 길이]
      [[0, 0, 1], [[-hx, y0, hz], [hx, y0, hz], [-hx, y1, hz], [hx, y1, hz]], hx * 2],
      [[0, 0, -1], [[hx, y0, -hz], [-hx, y0, -hz], [hx, y1, -hz], [-hx, y1, -hz]], hx * 2],
      [[1, 0, 0], [[hx, y0, hz], [hx, y0, -hz], [hx, y1, hz], [hx, y1, -hz]], hz * 2],
      [[-1, 0, 0], [[-hx, y0, -hz], [-hx, y0, hz], [-hx, y1, -hz], [-hx, y1, hz]], hz * 2],
    ];
    if (top) faces.push([[0, 1, 0], [[-hx, y1, hz], [hx, y1, hz], [-hx, y1, -hz], [hx, y1, -hz]], 0]);
    if (bottom) faces.push([[0, -1, 0], [[-hx, y0, -hz], [hx, y0, -hz], [-hx, y0, hz], [hx, y0, hz]], 0]);
    for (const [n, p, len] of faces) {
      const wn = N(...n);
      const roof = n[1] !== 0;
      const uvs = roof ? [[0.02, 0.02], [0.03, 0.02], [0.02, 0.03], [0.03, 0.03]]
        : [[0, 0], [len / uvScale, 0], [0, h / uvScale], [len / uvScale, h / uvScale]];
      for (const k of [0, 1, 2, 1, 3, 2]) {
        this.pos.push(...W(...p[k])); this.nrm.push(...wn); this.uv.push(...uvs[k]);
        this.col.push(color.r, color.g, color.b);
      }
    }
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

// 두 회전 사각형이 겹치는지 (분리축 판정)
function obbOverlap(a, b) {
  const axes = [[Math.cos(a.rot), -Math.sin(a.rot)], [Math.sin(a.rot), Math.cos(a.rot)], [Math.cos(b.rot), -Math.sin(b.rot)], [Math.sin(b.rot), Math.cos(b.rot)]];
  const proj = (o, ax) => {
    const ux = [Math.cos(o.rot), -Math.sin(o.rot)], uz = [Math.sin(o.rot), Math.cos(o.rot)];
    return Math.abs(ux[0] * ax[0] + ux[1] * ax[1]) * o.hx + Math.abs(uz[0] * ax[0] + uz[1] * ax[1]) * o.hz;
  };
  for (const ax of axes) {
    const d = Math.abs((b.x - a.x) * ax[0] + (b.z - a.z) * ax[1]);
    if (d > proj(a, ax) + proj(b, ax)) return false;
  }
  return true;
}

export class Environment {
  constructor(map, roads, collision) {
    this.map = map;
    this.roads = roads;
    this.collision = collision;
    this.rng = makeRng(map.decor?.seed || 1);
    this.group = new THREE.Group();
    this.group.name = 'environment';
    this.footprints = [];
    this.landmarks = {};
    this.nightMaterials = [];
    this.lampLights = [];
  }

  build() {
    const rng = this.rng;
    this.facadeMat = new THREE.MeshStandardMaterial({
      map: facadeTexture(), vertexColors: true, roughness: 0.85,
      emissiveMap: facadeNightTexture(), emissive: 0x000000,
    });
    this.nightMaterials.push({ mat: this.facadeMat, color: new THREE.Color(0xffffff), max: 0.75 });
    this.plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 });
    this.grassMat.userData.base = { color: this.grassMat.color.clone(), roughness: 1, metalness: 0 };

    this.walls = new BoxBatch();
    this.plain = new BoxBatch();
    this._landmarks();
    this._buildings(rng);
    this._streetFurniture(rng);
    this._parkTrees(rng);
    this.group.add(this.walls.mesh(this.facadeMat));
    this.group.add(this.plain.mesh(this.plainMat));
    this._signs();
    this._instancedTrees();
    this._instancedLamps();
    return this.group;
  }

  // 도로의 점 + 옆으로 offset 만큼 떨어진 위치
  _beside(road, s, side, offset) {
    const p = this.roads.pointOnRoad(road, s);
    const rx = -p.tz, rz = p.tx; // 오른쪽
    return { x: p.x + rx * side * offset, z: p.z + rz * side * offset, y: p.y, rot: Math.atan2(p.tx, p.tz), tx: p.tx, tz: p.tz, rx, rz };
  }

  _clearOfRoads(fp, margin = 0.8) {
    const c = Math.cos(fp.rot), s = Math.sin(fp.rot);
    const q = {};
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const lx = u * fp.hx, lz = v * fp.hz;
      const x = fp.x + lx * c + lz * s, z = fp.z - lx * s + lz * c;
      this.roads.query(x, z, q);
      if (q.road && Math.abs(q.lateral) < q.road.halfW + q.road.sidewalk + margin && q.dist < q.road.halfW + q.road.sidewalk + margin) return false;
      if (q.isect) return false;
      const b = this.map.bounds;
      if (x < b.minX + 4 || x > b.maxX - 4 || z < b.minZ + 4 || z > b.maxZ - 4) return false;
    }
    return true;
  }

  _place(fp) {
    if (!this._clearOfRoads(fp)) return false;
    for (const o of this.footprints) if (Math.hypot(o.x - fp.x, o.z - fp.z) < Math.hypot(o.hx, o.hz) + Math.hypot(fp.hx, fp.hz) && obbOverlap(o, { ...fp, hx: fp.hx + 0.6, hz: fp.hz + 0.6 })) return false;
    this.footprints.push(fp);
    return true;
  }

  _groundAt(fp) {
    const c = Math.cos(fp.rot), s = Math.sin(fp.rot);
    let lo = Infinity;
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lx = u * fp.hx, lz = v * fp.hz;
      lo = Math.min(lo, this.roads.terrainHeight(fp.x + lx * c + lz * s, fp.z - lx * s + lz * c));
    }
    return lo;
  }

  _landmarks() {
    for (const lm of this.map.landmarks || []) {
      const road = this.roads.byId[lm.road];
      const s = this.roads.projectOnRoad(road, lm.at[0], lm.at[1]).s;
      const side = lm.side === 'left' ? -1 : 1;
      const edge = road.halfW + road.sidewalk;
      if (lm.type === 'academy') {
        const hx = 9, hz = 13, h = 16;
        const b = this._beside(road, s, side, edge + (lm.setback || 5) + hx);
        const fp = { x: b.x, z: b.z, hx, hz, rot: b.rot };
        this.footprints.push(fp);
        const y0 = this._groundAt(fp) - 2;
        this.walls.add(b.x, y0, b.z, hx, h + 2, hz, b.rot, new THREE.Color(0xd9d4e8));
        this.plain.add(b.x, y0 + h + 2, b.z, hx + 0.3, 0.6, hz + 0.3, b.rot, new THREE.Color(0x5b5873));
        this.collision.addBox(b.x, b.z, hx, hz, b.rot, { tag: 'building', y: y0, h: h + 2 });
        // 입구(도로 쪽 면) — 시작 연출에서 선호가 걸어 나오는 곳
        const front = this._beside(road, s, side, edge + (lm.setback || 5));
        const door = { x: front.x, z: front.z, y: road.samples[0].y, rot: b.rot, faceX: -b.rx * side, faceZ: -b.rz * side };
        this._academyFacade(front, side, h);
        this.landmarks.academy = { ...door, name: lm.name, road, s, side, center: b, buildingFront: front };
      } else if (lm.type === 'bikeRack') {
        const b = this._beside(road, s, side, road.halfW + road.sidewalk * 0.55);
        this._bikeRack(b);
        this.landmarks.bikeRack = { x: b.x, z: b.z, y: b.y + 0.16, rot: b.rot, road, s, side, tx: b.tx, tz: b.tz };
      } else if (lm.type === 'home') {
        const hx = 6, hz = 7;
        const b = this._beside(road, s, side, edge + (lm.setback || 4) + hx);
        const fp = { x: b.x, z: b.z, hx, hz, rot: b.rot };
        this.footprints.push(fp);
        const y0 = this._groundAt(fp) - 1.5;
        this._house(b, y0, hx, hz, side, lm.name);
        this.collision.addBox(b.x, b.z, hx, hz, b.rot, { tag: 'building', y: y0, h: 9 });
        const goal = this._beside(road, s, 0, 0);
        this.landmarks.home = { x: goal.x, z: goal.z, y: goal.y, s, road, side, name: lm.name, house: b };
        this._goalMarker(goal, road);
      }
    }
  }

  _academyFacade(front, side, h) {
    const g = new THREE.Group();
    g.position.set(front.x, 0, front.z);
    g.rotation.y = front.rot + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const y = this.roads.terrainHeight(front.x, front.z);
    // 큰 간판
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({
      map: textTexture('903 수학학원', { w: 1024, h: 192, bg: '#14213d', fg: '#ffd166', font: 'bold 120px sans-serif', border: '#ffd166' }),
      emissive: 0xffffff, emissiveIntensity: 0.25, emissiveMap: null,
    }));
    sign.material.emissiveMap = sign.material.map;
    sign.position.set(0, y + 9.5, 0.06);
    g.add(sign);
    // 학원 로고 현수막 (assets/textures/903-logo.jpg — 다른 로고로 바꾸려면 이 파일만 교체)
    const logoTex = new THREE.TextureLoader().load(new URL('assets/textures/903-logo.jpg', document.baseURI).href);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 8;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 3.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    frame.position.set(0, y + 6.1, 0.07);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.875), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.85, emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: 0.12 }));
    logo.position.set(0, y + 6.1, 0.1);
    g.add(frame, logo);
    this.nightMaterials.push({ mat: logo.material, color: new THREE.Color(0xffffff), max: 0.45, min: 0.12 });
    this.nightMaterials.push({ mat: frame.material, color: new THREE.Color(0xffffff), max: 0.35, min: 0 });
    // 유리문
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.15, metalness: 0.3, emissive: 0x334455 }));
    door.position.set(0, y + 1.3, 0.02);
    g.add(door);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 1.8), new THREE.MeshStandardMaterial({ color: 0x2b2d42 }));
    canopy.position.set(0, y + 3, 0.9);
    canopy.castShadow = true;
    g.add(canopy);
    this.group.add(g);
    this.nightMaterials.push({ mat: sign.material, color: new THREE.Color(0xffffff), max: 0.9, min: 0.25 });
  }

  _bikeRack(b) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
    const g = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 6, 16, Math.PI), mat);
      loop.position.set(0, 0.16, i * 0.9);
      loop.rotation.y = Math.PI / 2;
      g.add(loop);
    }
    g.position.set(b.x, b.y, b.z);
    g.rotation.y = b.rot;
    this.group.add(g);
  }

  _house(b, y0, hx, hz, side, name) {
    this.walls.add(b.x, y0, b.z, hx, 7.5, hz, b.rot, new THREE.Color(0xf1e3c8));
    // 박공 지붕 (프리즘)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, hx * 1.25, 3, 4, 1), new THREE.MeshStandardMaterial({ color: 0x8c3b2a, roughness: 0.7 }));
    roof.scale.set(1, 1, hz / hx);
    roof.rotation.y = Math.PI / 4;
    const rg = new THREE.Group();
    rg.add(roof);
    rg.position.set(b.x, y0 + 7.5 + 1.5, b.z);
    rg.rotation.y = b.rot;
    roof.castShadow = true;
    this.group.add(rg);
    const fg = new THREE.Group();
    const toRoad = side > 0 ? -1 : 1; // 도로 쪽 로컬 X 방향
    fg.position.set(b.x, 0, b.z);
    fg.rotation.y = b.rot;
    const y = this.roads.terrainHeight(b.x, b.z);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({
      map: textTexture(name || '집', { w: 512, h: 128, bg: '#2d6a4f', fg: '#fff', font: 'bold 70px sans-serif' }), emissive: 0xffffff, emissiveIntensity: 0.3,
    }));
    sign.material.emissiveMap = sign.material.map;
    sign.position.set(toRoad * (hx + 0.05), y + 3.6, 0);
    sign.rotation.y = toRoad * Math.PI / 2;
    fg.add(sign);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc46b, emissiveIntensity: 0.8 }));
    win.position.set(toRoad * (hx + 0.05), y + 5.6, -2.4);
    win.rotation.y = toRoad * Math.PI / 2;
    fg.add(win);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), new THREE.MeshStandardMaterial({ color: 0x5a3825 }));
    door.position.set(toRoad * (hx + 0.06), y + 1.15, 2.2);
    door.rotation.y = toRoad * Math.PI / 2;
    fg.add(door);
    this.group.add(fg);
  }

  _goalMarker(goal, road) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(road.halfW + 0.6, 0.12, 8, 48), new THREE.MeshStandardMaterial({ color: 0x40c057, emissive: 0x40c057, emissiveIntensity: 1, transparent: true, opacity: 0.85 }));
    ring.position.set(goal.x, goal.y + road.halfW * 0.5 + 1.2, goal.z);
    ring.rotation.y = goal.rot;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x69db7c, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(goal.x, goal.y + 20, goal.z);
    this.group.add(ring, beam);
    this.goalRing = ring;
    this.goalBeam = beam;
  }

  _buildings(rng) {
    const shops = this.map.shops || ['가게'];
    this.shopAtlas = signAtlas(shops);
    this.signBatch = { pos: [], uv: [], nrm: [] };
    const awnings = new BoxBatch();
    let shopIdx = 0;
    const palette = [0xe9e2d0, 0xd8cfc0, 0xc9d3dc, 0xe8d6c4, 0xbfc7c2, 0xdccbb8, 0xf0ebe0, 0xb7b1a8, 0xd3c4a8];
    const gap = this.map.decor?.buildingGap ?? 2.5;
    for (const road of this.roads.roads) {
      for (const side of [-1, 1]) {
        let s = 4 + rng() * 6;
        while (s < road.length - 4) {
          const r = rng();
          const kind = r < 0.45 ? 'shop' : r < 0.75 ? 'apt' : 'house';
          const front = kind === 'apt' ? rng.range(14, 22) : kind === 'shop' ? rng.range(8, 13) : rng.range(8, 11);
          const depth = kind === 'apt' ? rng.range(12, 18) : rng.range(8, 13);
          const height = kind === 'apt' ? rng.int(5, 12) * 3 : kind === 'shop' ? rng.int(2, 4) * 3 : rng.int(2, 3) * 3;
          const setback = kind === 'house' ? rng.range(2, 4) : rng.range(0.6, 1.6);
          const sc = s + front / 2;
          const b = this._beside(road, sc, side, road.halfW + road.sidewalk + setback + depth / 2);
          const fp = { x: b.x, z: b.z, hx: depth / 2, hz: front / 2, rot: b.rot };
          if (this._place(fp)) {
            const y0 = this._groundAt(fp) - 1;
            const col = new THREE.Color(rng.pick(palette)).multiplyScalar(rng.range(0.88, 1.05));
            this.walls.add(fp.x, y0, fp.z, fp.hx, height + 1, fp.hz, fp.rot, col);
            this.plain.add(fp.x, y0 + height + 1, fp.z, fp.hx + 0.2, 0.4, fp.hz + 0.2, fp.rot, new THREE.Color(0x6b6b6b));
            this.collision.addBox(fp.x, fp.z, fp.hx, fp.hz, fp.rot, { tag: 'building', y: y0, h: height + 1 });
            if (kind === 'shop') {
              const idx = shopIdx++ % shops.length;
              this._shopFront(b, side, fp, y0 + 1, idx, awnings, rng);
            }
          }
          s += front + gap + rng() * 3;
        }
      }
    }
    // 간판 묶음
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.signBatch.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.signBatch.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.signBatch.uv, 2));
    const signMat = new THREE.MeshStandardMaterial({ map: this.shopAtlas.texture, emissiveMap: this.shopAtlas.texture, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.6 });
    this.nightMaterials.push({ mat: signMat, color: new THREE.Color(0xffffff), max: 0.85, min: 0.2 });
    const signs = new THREE.Mesh(g, signMat);
    this.group.add(signs);
    const aw = awnings.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    this.group.add(aw);
  }

  // 상점 앞면: 간판 + 차양 + 진열창
  _shopFront(b, side, fp, y, idx, awnings, rng) {
    const toRoadX = -b.rx * side, toRoadZ = -b.rz * side; // 도로 쪽 방향
    const fx = fp.x + toRoadX * (fp.hx + 0.08), fz = fp.z + toRoadZ * (fp.hx + 0.08);
    const w = Math.min(fp.hz * 2 - 1, 8), h = 1.2;
    const tx = b.tx, tz = b.tz;
    // 바깥(도로 쪽)에서 볼 때 글자가 바로 보이도록 왼→오른쪽 방향 결정
    const sx = side > 0 ? -1 : 1;
    const ux = tx * sx, uz = tz * sx;
    const u = this.shopAtlas.uv(idx);
    const P = (a, yy) => [fx + ux * a, yy, fz + uz * a];
    const quad = [P(-w / 2, y + 3.2), P(w / 2, y + 3.2), P(-w / 2, y + 3.2 + h), P(w / 2, y + 3.2 + h)];
    const uvs = [[u.u0, u.v0], [u.u1, u.v0], [u.u0, u.v1], [u.u1, u.v1]];
    for (const k of [0, 1, 2, 1, 3, 2]) {
      this.signBatch.pos.push(...quad[k]); this.signBatch.uv.push(...uvs[k]); this.signBatch.nrm.push(toRoadX, 0, toRoadZ);
    }
    // 차양
    const awCol = new THREE.Color(rng.pick([0xc0392b, 0x2471a3, 0x229954, 0xd68910, 0x7d3c98]));
    const ax = fp.x + toRoadX * (fp.hx + 0.7), az = fp.z + toRoadZ * (fp.hx + 0.7);
    awnings.add(ax, y + 2.7, az, 0.7, 0.18, Math.min(fp.hz - 0.3, 4.2), fp.rot, awCol, { bottom: true });
    // 진열창(어두운 유리)
    const gx = fp.x + toRoadX * (fp.hx + 0.03), gz = fp.z + toRoadZ * (fp.hx + 0.03);
    this.plain.add(gx, y, gz, 0.03, 2.4, Math.min(fp.hz - 0.6, 3.8), fp.rot, new THREE.Color(0x2f3e4c), { top: false });
  }

  _streetFurniture(rng) {
    this.trees = [];
    this.lamps = [];
    const treeStep = this.map.decor?.treeSpacing ?? 13;
    const lampStep = this.map.decor?.lampSpacing ?? 26;
    const ac = this.landmarks.academy, rack = this.landmarks.bikeRack;
    const nearLandmark = (x, z) => (ac && Math.hypot(x - ac.x, z - ac.z) < 7) || (rack && Math.hypot(x - rack.x, z - rack.z) < 4);
    for (const road of this.roads.roads) {
      const blocked = (s, pad) => road.isects.some((it) => Math.abs(s - it.s) < it.radius + pad) || road.crosswalks.some((c) => s > c.s0 - 2 && s < c.s1 + 2);
      const ginkgo = /은행/.test(road.name);
      for (const side of [-1, 1]) {
        for (let s = 5 + rng() * 4; s < road.length - 3; s += treeStep * rng.range(0.85, 1.15)) {
          if (blocked(s, 3)) continue;
          const b = this._beside(road, s, side, road.halfW + road.sidewalk - 0.7);
          if (nearLandmark(b.x, b.z)) continue;
          this.trees.push({ x: b.x, z: b.z, y: b.y + 0.16, scale: rng.range(0.85, 1.2), ginkgo });
          this.collision.addCircle(b.x, b.z, 0.32, { tag: 'tree', h: 6 });
        }
      }
      let alt = 1;
      for (let s = 8; s < road.length - 3; s += lampStep) {
        if (blocked(s, 1)) continue;
        alt = -alt;
        const b = this._beside(road, s, alt, road.halfW + 0.45);
        if (nearLandmark(b.x, b.z)) continue;
        this.lamps.push({ x: b.x, z: b.z, y: b.y + 0.16, rot: b.rot, side: alt, rx: b.rx, rz: b.rz });
        this.collision.addCircle(b.x, b.z, 0.16, { tag: 'pole', h: 6 });
      }
    }
  }

  _parkTrees(rng) {
    const b = this.map.bounds;
    const q = {};
    for (let n = 0; n < 420; n++) {
      const x = rng.range(b.minX + 6, b.maxX - 6), z = rng.range(b.minZ + 6, b.maxZ - 6);
      this.roads.query(x, z, q);
      if (q.road && q.dist < q.road.halfW + q.road.sidewalk + 2.5) continue;
      if (this.footprints.some((f) => Math.hypot(f.x - x, f.z - z) < Math.hypot(f.hx, f.hz) + 1.5)) continue;
      const y = this.roads.terrainHeight(x, z);
      this.trees.push({ x, z, y, scale: rng.range(0.9, 1.6), ginkgo: rng() < 0.25 });
      this.collision.addCircle(x, z, 0.4, { tag: 'tree', h: 7 });
    }
  }

  _instancedTrees() {
    const n = this.trees.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }), n);
    const crownGeo = new THREE.IcosahedronGeometry(1.5, 1);
    const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    this.trees.forEach((t, i) => {
      sc.set(t.scale, t.scale, t.scale);
      p.set(t.x, t.y + 1.3 * t.scale, t.z);
      m.compose(p, q, sc); trunk.setMatrixAt(i, m);
      p.set(t.x, t.y + 3.3 * t.scale, t.z);
      sc.set(t.scale, t.scale * 1.15, t.scale);
      m.compose(p, q, sc); crown.setMatrixAt(i, m);
      if (t.ginkgo) c.setHSL(0.12 + Math.random() * 0.03, 0.85, 0.5); else c.setHSL(0.22 + Math.random() * 0.1, 0.45, 0.28 + Math.random() * 0.1);
      crown.setColorAt(i, c);
    });
    trunk.castShadow = crown.castShadow = true;
    crown.receiveShadow = true;
    this.group.add(trunk, crown);
    this.treeCrowns = crown;
  }

  _instancedLamps() {
    const n = this.lamps.length;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.5, roughness: 0.5 });
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 6), poleMat, n);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), poleMat, n);
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe0a0, emissiveIntensity: 0.1 });
    this.nightMaterials.push({ mat: this.lampHeadMat, color: new THREE.Color(0xffe0a0), max: 2.2, min: 0.1 });
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.12, 0.6), this.lampHeadMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), e = new THREE.Euler();
    this.lamps.forEach((l, i) => {
      // 팔은 도로 안쪽(중앙)으로
      const inX = -l.rx * l.side, inZ = -l.rz * l.side;
      p.set(l.x, l.y + 3, l.z); q.identity(); m.compose(p, q, one); pole.setMatrixAt(i, m);
      e.set(0, Math.atan2(inX, inZ), 0); q.setFromEuler(e);
      p.set(l.x + inX * 0.8, l.y + 5.9, l.z + inZ * 0.8); m.compose(p, q, one); arm.setMatrixAt(i, m);
      p.set(l.x + inX * 1.5, l.y + 5.8, l.z + inZ * 1.5); m.compose(p, q, one); head.setMatrixAt(i, m);
      l.lightPos = { x: l.x + inX * 1.5, y: l.y + 5.6, z: l.z + inZ * 1.5 };
    });
    pole.castShadow = true;
    this.group.add(pole, arm, head);
  }

  _signs() {
    // 교차로마다 도로 이름 표지판
    const signMat = (t) => new THREE.MeshStandardMaterial({ map: textTexture(t, { w: 512, h: 128, bg: '#1f4e9c', fg: '#fff', font: 'bold 58px sans-serif', border: '#fff' }) });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.5 });
    for (const f of this.roads.intersections) {
      const r = f.roads[0];
      const it = r.isects.find((k) => k.isect === f);
      const b = this._beside(r, it.s - f.radius - 4, 1, r.halfW + 0.5);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), poleMat);
      pole.position.y = 1.7;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), signMat(f.roads.map((x) => x.name).join(' · ')));
      board.position.y = 3.1;
      board.material.side = THREE.DoubleSide;
      g.add(pole, board);
      g.position.set(b.x, b.y + 0.16, b.z);
      g.rotation.y = b.rot + Math.PI;
      this.group.add(g);
      this.collision.addCircle(b.x, b.z, 0.1, { tag: 'pole' });
    }
    // 학원 앞 어린이 보호구역 표지
    const ac = this.landmarks.academy;
    if (ac) {
      const b = this._beside(ac.road, ac.s - 12, -ac.side, ac.road.halfW + 0.6);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), poleMat);
      pole.position.y = 1.3;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshStandardMaterial({ map: textTexture('30', { w: 128, h: 128, bg: '#fff', fg: '#111', font: 'bold 70px sans-serif', border: '#d00' }), side: THREE.DoubleSide }));
      disc.position.y = 2.7;
      g.add(pole, disc);
      g.position.set(b.x, b.y + 0.16, b.z);
      g.rotation.y = b.rot + Math.PI;
      this.group.add(g);
    }
  }

  // 0(낮) ~ 1(밤): 창문·간판·가로등 밝기
  setNight(t) {
    for (const n of this.nightMaterials) {
      n.mat.emissive.copy(n.color);
      n.mat.emissiveIntensity = (n.min || 0) + (n.max - (n.min || 0)) * t;
    }
  }

  update(dt, time) {
    if (this.goalRing) {
      this.goalRing.rotation.z = 0;
      this.goalRing.position.y += Math.sin(time * 2) * 0.004;
      this.goalBeam.material.opacity = 0.14 + Math.sin(time * 3) * 0.05;
    }
  }
}

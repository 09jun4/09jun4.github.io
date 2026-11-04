// 방 외피: 바닥, 천장, 천장 조명 패널, 벽(문 자리 자동 절개 + 문 위 인방).
import * as THREE from 'three';
import { boxGeo, mesh } from '../../utils/geometry.js';
import { makeBox } from '../../physics/Collision.js';

export function buildFloorsAndCeilings(group, map, M) {
  const H = map.wallHeight;
  for (const z of map.zones) {
    const [x1, z1, x2, z2] = z.rect;
    const w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const floor = mesh(boxGeo(w, 0.1, d, 1), M.floorFor(z.floor), cx, -0.05, cz);
    floor.castShadow = false; floor.receiveShadow = true;
    group.add(floor);
    const ceil = mesh(boxGeo(w + 0.2, 0.1, d + 0.2, 1), M.ceiling, cx, H + 0.05, cz);
    ceil.castShadow = false;
    group.add(ceil);
    // 천장 조명 패널
    const panelMat = z.panelColor ? M.lightPanel.clone() : M.lightPanel;
    if (z.panelColor) { panelMat.emissive.set(z.panelColor); panelMat.userData.baseEmissive = panelMat.emissiveIntensity; }
    for (const [px, pz] of z.panels || []) {
      const alongX = w >= d;
      const pw = alongX ? 1.4 : 0.5, pd = alongX ? 0.5 : 1.4;
      const f = mesh(boxGeo(pw + 0.08, 0.04, pd + 0.08, 0), M.trim, px, H - 0.02, pz); f.castShadow = false; group.add(f);
      const p = mesh(boxGeo(pw, 0.02, pd, 0), panelMat, px, H - 0.045, pz); p.castShadow = false; group.add(p);
    }
  }
}

// 벽 선분 [x1,z1,x2,z2]에 놓인 문 자리를 잘라 낸 벽 구간들을 만든다.
export function buildWalls(group, map, doors, M, collision) {
  const H = map.wallHeight, T = map.wallThickness, DH = map.doorHeight;
  for (const [ax, az, bx, bz] of map.walls) {
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const fixed = alongX ? az : ax;
    let s0 = alongX ? Math.min(ax, bx) : Math.min(az, bz);
    let s1 = alongX ? Math.max(ax, bx) : Math.max(az, bz);
    // 이 벽 위의 문들
    const cuts = doors
      .filter((d) => (alongX ? d.axis === 'x' && Math.abs(d.cz - fixed) < 0.01 && d.cx > s0 && d.cx < s1
        : d.axis === 'z' && Math.abs(d.cx - fixed) < 0.01 && d.cz > s0 && d.cz < s1))
      .map((d) => { const c = alongX ? d.cx : d.cz; return [c - d.width / 2, c + d.width / 2]; })
      .sort((a, b) => a[0] - b[0]);
    // 모서리를 메우도록 양 끝을 반 두께만큼 연장
    s0 -= T / 2; s1 += T / 2;
    const pieces = [];
    let cur = s0;
    for (const [c0, c1] of cuts) {
      if (c0 > cur) pieces.push([cur, c0, 0, H]);
      pieces.push([c0, c1, DH, H]); // 문 위 인방
      cur = c1;
    }
    if (cur < s1) pieces.push([cur, s1, 0, H]);
    for (const [p0, p1, y0, y1] of pieces) {
      const len = p1 - p0, mid = (p0 + p1) / 2, hy = y1 - y0;
      const cx = alongX ? mid : fixed, cz = alongX ? fixed : mid;
      const w = alongX ? len : T, d = alongX ? T : len;
      const wall = mesh(boxGeo(w, hy, d, 1), M.wall, cx, y0 + hy / 2, cz);
      wall.receiveShadow = true;
      group.add(wall);
      if (y0 === 0) {
        // 하단 걸레받이 + 중간 띠
        const b = mesh(boxGeo(alongX ? len : T + 0.03, 0.14, alongX ? T + 0.03 : len, 0), M.trim, cx, 0.07, cz); b.castShadow = false; group.add(b);
        const s = mesh(boxGeo(alongX ? len : T + 0.012, 0.9, alongX ? T + 0.012 : len, 1), M.wallLower, cx, 0.6, cz); s.castShadow = false; group.add(s);
      }
      collision.add(makeBox(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2, { type: 'wall', material: 'concrete' }));
    }
  }
}

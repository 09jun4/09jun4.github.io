// 접힘 각도 → 면의 월드 변환과 충돌용 칸 정보 (Collision Layer 의 기하 부분).
// 같은 각도 조합은 결과가 같으므로 캐시해요 (힌트 탐색에서 수천 번 재사용).
import { IDENT, compose, rotAbout, apply, mulMV, add, scale, ckey, edgeKey, dir4Of } from './math.js';

export const anglesKey = (stage, angles) => stage.creases.map(c => angles[c.id] || 0).join(',');

export function faceTransforms(stage, angles) {
  const T = {};
  const get = fid => {
    if (T[fid]) return T[fid];
    const c = stage.parentCrease.get(fid);
    return (T[fid] = c ? compose(get(c.parent), rotAbout(c.a, c.axis, (angles[c.id] || 0) / 90)) : IDENT);
  };
  for (const f of stage.faces) get(f.id);
  return T;
}

// rest 좌표의 칸 중심
export const restCenter = (f, i, j) => add(add(f.o, scale(f.u, i + 0.5)), scale(f.v, j + 0.5));

export function layoutGeom(stage, angles) {
  const cache = stage._geo || (stage._geo = new Map());
  const k = anglesKey(stage, angles);
  const hit = cache.get(k);
  if (hit) return hit;
  if (cache.size > 6000) cache.clear();

  const T = faceTransforms(stage, angles);
  const cells = {}, hmap = new Map(), walls = [], faceN = {};
  for (const f of stage.faces) {
    const t = T[f.id], n = mulMV(t.R, f.n), list = (cells[f.id] = []);
    faceN[f.id] = n;
    const horiz = Math.abs(n[1]) === 1;
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      if (!f.has(i, j)) continue;
      const c = apply(t, restCenter(f, i, j));
      const cell = { i, j, c, horiz, key: null };
      if (horiz) {
        cell.key = ckey(Math.floor(c[0]), c[1], Math.floor(c[2]));
        const l = hmap.get(cell.key);
        if (l) l.push(f.id); else hmap.set(cell.key, [f.id]);
      } else if (Math.abs(n[0]) === 1) {
        walls.push({ ek: 'x' + c[0] + ',' + (c[1] - 0.5) + ',' + Math.floor(c[2]), face: f.id });
      } else {
        walls.push({ ek: 'z' + Math.floor(c[0]) + ',' + (c[1] - 0.5) + ',' + c[2], face: f.id });
      }
      list.push(cell);
    }
    // 막힌 가장자리(종이 턱): 수평일 때 그 가장자리를 넘어가지 못해요
    if (horiz && f.closed.length) {
      for (const e of f.closed) {
        const along = e[1] === 'u' ? f.u : f.v, sign = e[0] === '-' ? -1 : 1;
        const d4 = dir4Of(mulMV(t.R, scale(along, sign)));
        for (const cell of list) {
          const onEdge = e[1] === 'u' ? (sign < 0 ? cell.i === 0 : cell.i === f.w - 1) : (sign < 0 ? cell.j === 0 : cell.j === f.h - 1);
          if (onEdge) walls.push({ ek: edgeKey(Math.floor(cell.c[0]), cell.c[1], Math.floor(cell.c[2]), d4), face: f.id, lip: true });
        }
      }
    }
  }
  const geo = { key: k, T, cells, hmap, walls, faceN };
  cache.set(k, geo);
  return geo;
}

// 쌓인 면 중 맨 위(order 가 가장 큰 활성 면)와 활성 벽
export function resolve(geo, order, active) {
  const top = new Map();
  for (const [k, list] of geo.hmap) {
    let best = null;
    for (const fid of list) if (active.has(fid) && (best === null || order[fid] > order[best])) best = fid;
    if (best !== null) top.set(k, best);
  }
  const walls = new Set();
  for (const w of geo.walls) if (active.has(w.face)) walls.add(w.ek);
  return { top, walls };
}

// 설계 템플릿: random(rnd) → 선택값, build(선택값) → 스테이지 JSON
import { P, WX, WZ, HX, HZ, O, tower, col, roof, dome, at } from './lib.mjs';
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

// 탑 하나(2x2 윗면)와 네 방향 날개를 만드는 도우미
export function towerWithFlaps(id, x, z, h, flaps, faces, creases, decor, tone, base = -4) {
  faces.push(P(id, x, h, z, 2, 2, { tone }));
  decor.push(tower(x, h, z, 2, 2, base, tone === 'a1' ? 'a2' : 'a1'));
  for (const f of flaps) { // f = { side:'E'|'W'|'N'|'S', row:0|1, len, init:'up'|'over' }
    const fid = id + f.side + f.row, cid = 'c' + fid;
    const r = f.row;
    if (f.side === 'E') { faces.push(WX(fid, x + 2, h, z + r, 1, f.len)); creases.push(HZ(cid, id, fid, x + 2, h, z + r, 1)); }
    if (f.side === 'W') { faces.push(WX(fid, x, h, z + r, 1, f.len)); creases.push(HZ(cid, id, fid, x, h, z + r, 1)); }
    if (f.side === 'N') { faces.push(WZ(fid, x + r, h, z, 1, f.len)); creases.push(HX(cid, id, fid, x + r, h, z, 1)); }
    if (f.side === 'S') { faces.push(WZ(fid, x + r, h, z + 2, 1, f.len)); creases.push(HX(cid, id, fid, x + r, h, z + 2, 1)); }
  }
}

// 고리: 8개 탑이 정사각형 둘레에 (간격 2칸), 높이 다양, 날개는 이웃을 향해
const RING = [[0, 0], [4, 0], [8, 0], [8, 4], [8, 8], [4, 8], [0, 8], [0, 4]];
export const ring = {
  random(rnd) {
    const H = RING.map(() => pick(rnd, [0, 1, 2, 3, 4]));
    H[0] = 0;
    const flaps = RING.map((_, i) => {
      const out = [];
      const n = pick(rnd, [0, 1, 1, 2]);
      for (let k = 0; k < n; k++) out.push({ side: pick(rnd, ['E', 'W', 'N', 'S']), row: pick(rnd, [0, 1]), len: pick(rnd, [1, 2]) });
      return out;
    });
    return { H, flaps, exit: pick(rnd, [3, 4, 5]), key: rnd() < 0.5 ? pick(rnd, [1, 2, 6, 7]) : -1 };
  },
  build(p) {
    const faces = [], creases = [], decor = [], objects = [];
    RING.forEach(([x, z], i) => {
      const seen = new Set(), fl = p.flaps[i].filter(f => { const k = f.side + f.row; if (seen.has(k)) return false; seen.add(k); return true; });
      towerWithFlaps('T' + i, x, z, p.H[i], fl, faces, creases, decor, i % 2 ? 'a1' : null);
    });
    const [ex, ez] = RING[p.exit];
    objects.push(O('exit', 'exit', [ex + 1, p.H[p.exit], ez + 1]));
    if (p.key >= 0) {
      const [kx, kz] = RING[p.key];
      objects.push(O('k1', 'key', [kx + 1, p.H[p.key], kz]));
      objects.push(O('d1', 'door', [ex, p.H[p.exit], ez + 1], { key: 'k1' }));
      objects.push(O('d2', 'door', [ex + 1, p.H[p.exit], ez], { key: 'k1' }));
      objects.push(O('d3', 'door', [ex, p.H[p.exit], ez], { key: 'k1' }));
    }
    return { id: 'g', faces, creases, objects, decor, player: { at: [0, 0, 0] } };
  },
  score: e => e.n + (e.views >= 2 ? 1 : -3) + (e.folds >= 2 ? 1 : -3),
};

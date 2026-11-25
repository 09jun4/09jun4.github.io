// 스테이지 설계 도우미: 면·접힘선·장식을 짧게 쓰기 위한 함수들 (빌드 스크립트 전용)
import { writeFileSync } from 'node:fs';
// 수평 바닥 (레벨 y)
export const P = (id, x, y, z, w, h, o = {}) => ({ id, o: [x, y, z], u: '+x', v: '+z', w, h, ...o });
// x=상수 평면에 선 벽 (z..z+len, 높이 ht)
export const WX = (id, x, y, z, len, ht, o = {}) => ({ id, o: [x, y, z], u: '+z', v: '+y', w: len, h: ht, ...o });
// z=상수 평면에 선 벽 (x..x+len)
export const WZ = (id, x, y, z, len, ht, o = {}) => ({ id, o: [x, y, z], u: '+x', v: '+y', w: len, h: ht, ...o });
// 경첩: z 방향 축 (x=상수), x 방향 축 (z=상수), y 방향 축(세로 경첩)
export const HZ = (id, parent, child, x, y, z, len, o = {}) => ({ id, parent, child, a: [x, y, z], b: [x, y, z + len], ...o });
export const HX = (id, parent, child, x, y, z, len, o = {}) => ({ id, parent, child, a: [x, y, z], b: [x + len, y, z], ...o });
export const HY = (id, parent, child, x, y, z, len, o = {}) => ({ id, parent, child, a: [x, y, z], b: [x, y + len, z], ...o });
// 탑: 바닥 아래로 base 레벨까지 내려오는 장식 기둥 (모뉴먼트 밸리식 덩어리)
export const tower = (x, y, z, w, d, base, tone = 'a2') => ({ type: 'box', at: [x + w / 2, base, z + d / 2], size: [w - 0.02, y - base - 0.03, d - 0.02], tone });
export const col = (x, y, z, h, tone = 'a1', w = 0.5) => ({ type: 'cylinder', at: [x, y, z], size: [w, h, w], tone });
export const roof = (x, y, z, w, h, tone = 'a3') => ({ type: 'cone', at: [x, y, z], size: [w, h, w], tone });
export const dome = (x, y, z, w, h, tone = 'a3') => ({ type: 'dome', at: [x, y, z], size: [w, h, w], tone });
export const O = (id, type, at, extra = {}) => ({ id, type, at, ...extra });
export function save(dir, st) {
  writeFileSync(new URL(`../stages/${dir}/${st.id}.json`, import.meta.url), JSON.stringify(st, null, 1));
}
// 시점 v 에서 지면 칸 (gx, gz) 에 있는 것처럼 보이도록 레벨 L 에 놓을 실제 좌표
const VV = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
export const at = (v, gx, gz, L) => [gx + L * VV[v][0], L, gz + L * VV[v][1]];
// 칸 c 에서 dir 로 한 칸 나갈 때, 시점 v 에서 dLevel 만큼 높이가 다른 칸과 맞닿게 하는 도착 칸
const D4 = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
export const via = (c, dir, v, dL) => [c[0] + D4[dir][0] + dL * VV[v][0], c[1] + dL, c[2] + D4[dir][1] + dL * VV[v][1]];
// 펜로즈 고리: 시작 칸에서 steps(예: 'f+x','u+x' …)대로 걸으며 칸과 계단을 만들어요. 'u' 는 계단 칸 + 한 층 위로.
// 반환: { cells: [[x,y,z]...], stairs: [{at, dir}], end: 마지막 칸 다음에 닿을 칸(T0) }
export function penrose(start, steps) {
  const cells = [start.slice()], stairs = [];
  let c = start.slice();
  for (const s of steps) {
    const d = s.slice(1), [dx, dz] = D4[d];
    if (s[0] === 'f') { c = [c[0] + dx, c[1], c[2] + dz]; cells.push(c.slice()); }
    else { const st = [c[0] + dx, c[1], c[2] + dz]; stairs.push({ at: st, dir: d }); cells.push(st); c = [st[0] + dx, st[1] + 1, st[2] + dz]; cells.push(c.slice()); }
  }
  return { cells, stairs, last: c };
}
// 칸 목록 → 1x1 바닥 면들 (같은 레벨·줄로 이어진 칸은 하나의 긴 면으로 합침)
export function cellFaces(prefix, cells, tone) {
  const key = c => c.join(','), set = new Set(cells.map(key)), used = new Set(), out = [];
  for (const c of cells) {
    if (used.has(key(c))) continue;
    let w = 1; while (set.has(key([c[0] + w, c[1], c[2]])) && !used.has(key([c[0] + w, c[1], c[2]]))) w++;
    if (w > 1) { for (let i = 0; i < w; i++) used.add(key([c[0] + i, c[1], c[2]])); out.push(P(prefix + out.length, c[0], c[1], c[2], w, 1, tone ? { tone } : {})); continue; }
    let h = 1; while (set.has(key([c[0], c[1], c[2] + h])) && !used.has(key([c[0], c[1], c[2] + h]))) h++;
    for (let i = 0; i < h; i++) used.add(key([c[0], c[1], c[2] + i]));
    out.push(P(prefix + out.length, c[0], c[1], c[2], 1, h, tone ? { tone } : {}));
  }
  return out;
}
// 숨은 통로 한 쌍: from 에서 dir 로, 가려진 칸(gap) 하나를 건너 dL 만큼 높이가 다른 칸으로 (시점 v)
export const hiddenPair = (from, dir, v, dL) => {
  const gap = [from[0] + D4[dir][0], from[1], from[2] + D4[dir][1]];
  return { gap, to: via(gap, dir, v, dL), link: (to) => ({ view: v, from, dir, to }) };
};
// 시점 v 에서 gap 칸을 앞에서 가리는 기둥 (카메라 쪽으로 t 칸 떨어진 기둥) + 지붕
export const veil = (gap, v, t = 2, tone = 'a3', base = -4) => {
  const x = gap[0] + t * VV[v][0], z = gap[2] + t * VV[v][1], top = gap[1] + t + 1.25;
  return [{ type: 'box', at: [x + 0.5, base, z + 0.5], size: [1, top - base, 1], tone }, { type: 'cone', at: [x + 0.5, top, z + 0.5], size: [1.3, 1, 1.3], tone }];
};
// 두 구역 잇기: from 칸들에서 나가 to 칸들 중 하나에 닿는 착시(seam) 또는 숨은 통로(hidden) 후보 목록
// occupied: 이미 있는 칸 집합(문자열) — 나가는 쪽 바로 앞 칸은 비어 있어야 해요
export function findLinks(fromCells, toCells, occupied, kind = 'seam', dLs = [-4, -3, -2, 2, 3, 4]) {
  const toSet = new Map(toCells.map(c => [c.join(), c])), out = [];
  for (const F of fromCells) for (const dir in D4) for (let v = 0; v < 4; v++) for (const dL of dLs) {
    const [dx, dz] = D4[dir], step = kind === 'hidden' ? 2 : 1;
    const nxt = [F[0] + dx, F[1], F[2] + dz];
    if (occupied.has(nxt.join())) continue;
    if (kind === 'hidden' && occupied.has([F[0] + 2 * dx, F[1], F[2] + 2 * dz].join())) continue;
    const T = [F[0] + step * dx + dL * VV[v][0], F[1] + dL, F[2] + step * dz + dL * VV[v][1]];
    if (toSet.has(T.join())) out.push({ from: F, dir, view: v, dL, to: T, gap: kind === 'hidden' ? nxt : null });
  }
  return out;
}
// 면 목록 → 칸 목록 (수평 면만, rest 기준)
export function faceCells(faces) {
  const out = [];
  for (const f of faces) {
    if (f.u !== '+x' || f.v !== '+z' || f.decor) continue;
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) if (!f.mask || f.mask[j][i] !== '.') out.push([f.o[0] + i, f.o[1], f.o[2] + j]);
  }
  return out;
}
// 구역 변환: 스테이지(일부)를 거울 뒤집기(mx/mz) + 평행 이동 + id 접두사. 시점·방향·축까지 함께 바꿔요.
export function district(st, { dx = 0, dz = 0, mx = false, mz = false, pre = '', drop = [] }) {
  const X = x => (mx ? -x : x) + dx, Z = z => (mz ? -z : z) + dz;
  const pt = p => [X(p[0]), p[1], Z(p[2])];
  const dirm = d => (d[1] === 'x' && mx) || (d[1] === 'z' && mz) ? (d[0] === '+' ? '-' : '+') + d[1] : d;
  const viewm = v => { let [sx, sz] = VV[v]; if (mx) sx = -sx; if (mz) sz = -sz; return VV.findIndex(a => a[0] === sx && a[1] === sz); };
  const id = s => pre + s;
  const faces = st.faces.map(f => {
    // 원점 칸 모서리를 뒤집으면 반대쪽 모서리가 새 원점이 되므로, 축 방향만 뒤집고 원점은 그대로 변환
    return { ...f, id: id(f.id), o: pt(f.o), u: dirm(f.u), v: dirm(f.v), when: f.when && f.when.map(id), mask: f.mask };
  });
  const flip = mx !== mz; // 거울은 회전 방향을 뒤집으므로 각도 제한도 뒤집어요
  const creases = (st.creases || []).map(c => ({ ...c, id: id(c.id), parent: id(c.parent), child: id(c.child), a: pt(c.a), b: pt(c.b),
    ...(flip && (c.min !== undefined || c.max !== undefined) ? { min: -(c.max ?? 180), max: -(c.min ?? -180) } : {}) }));
  const objects = (st.objects || []).filter(o => !drop.includes(o.id)).map(o => {
    const n = { ...o, id: id(o.id) };
    if (o.at) n.at = [X(o.at[0] + 0.5) - 0.5, o.at[1], Z(o.at[2] + 0.5) - 0.5];
    if (o.face) n.face = id(o.face);
    if (o.dir) n.dir = dirm(o.dir);
    if (o.when) n.when = o.when.map(id);
    if (o.key) n.key = id(o.key);
    if (o.type === 'mirror' && (mx !== mz)) n.mirror = o.mirror ? 0 : 1;
    return n;
  });
  const hidden = (st.hidden || []).map(h => ({ view: viewm(h.view), from: [X(h.from[0] + 0.5) - 0.5, h.from[1], Z(h.from[2] + 0.5) - 0.5], to: [X(h.to[0] + 0.5) - 0.5, h.to[1], Z(h.to[2] + 0.5) - 0.5], dir: dirm(h.dir) }));
  const decor = (st.decor || []).map(d => ({ ...d, at: [X(d.at[0]), d.at[1], Z(d.at[2])] }));
  const cell = c => [X(c[0] + 0.5) - 0.5, c[1], Z(c[2] + 0.5) - 0.5];
  return { faces, creases, objects, hidden, decor, cell, viewm };
}

// 열린 경계 막기: 지오메트리에서 "삼각형 하나에만 속한 에지"가 이루는 고리를 찾아, 평평한 고리는 부채꼴 면으로 막는다.
// 관 끝(덕트·날개 뿌리·노즐 이음)이 열려 안이 들여다보이는 구멍과, 얇은 판의 뒷면이 사라지는 문제를 한 번에 없앤다.
// Three.js에 의존하지 않는다(배열만 다룬다). tests/open-edges.cjs가 같은 기준으로 검사한다.

/**
 * @param {number[]} pos xyz 배열(뒤에 덧붙인다) @param {number[]} idx 삼각형 인덱스(뒤에 덧붙인다)
 * @param {{array:number[], size:number}[]} extras 정점마다 함께 복사할 속성(uv, color 등)
 * @param {{quant?:number, planar?:number}} [o] quant: 위치 양자화(1m당 칸 수), planar: 고리가 평면에서 벗어나도 되는 비율(반지름 대비)
 * @returns {{capped:number, left:number}} 막은 고리 수, 평평하지 않아 남긴 고리 수
 */
export function capOpenLoops(pos, idx, extras = [], o = {}) {
  const Q = o.quant ?? 1000, tol = o.planar ?? 0.15;
  const n = pos.length / 3;
  const ids = new Map();
  const key = new Int32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * Q + 0.137)},${Math.round(pos[i * 3 + 1] * Q + 0.137)},${Math.round(pos[i * 3 + 2] * Q + 0.137)}`; // 0.137: 값이 칸 경계(…5)에 걸려 반올림이 갈리는 일을 피한다
    let id = ids.get(k);
    if (id === undefined) { id = count++; ids.set(k, id); }
    key[i] = id;
  }
  const M = count + 1;
  const edges = new Map(); // 무방향 에지 → [횟수, 정점 a, 정점 b(삼각형 진행 방향)]
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const k = [key[v[0]], key[v[1]], key[v[2]]];
    if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) continue;
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3;
      const u = k[a] < k[b] ? k[a] * M + k[b] : k[b] * M + k[a];
      const rec = edges.get(u);
      if (rec) rec[0]++; else edges.set(u, [1, v[a], v[b]]);
    }
  }
  // 열린 에지를 방향 없이 이어 고리를 찾는다(판마다 감기는 방향이 달라도, 고리가 한 점에서 맞닿아도 따라갈 수 있게)
  const open = [];
  const at = new Map(); // 합친 정점 → 그 정점에 닿는 열린 에지 번호들
  for (const rec of edges.values()) {
    if (rec[0] !== 1) continue;
    const i = open.length;
    open.push(rec);
    for (const v of [key[rec[1]], key[rec[2]]]) { if (!at.has(v)) at.set(v, []); at.get(v).push(i); }
  }
  const used = new Uint8Array(open.length);
  let capped = 0, left = 0;
  for (let s0 = 0; s0 < open.length; s0++) {
    if (used[s0]) continue;
    {
      used[s0] = 1;
      const loop = [open[s0]]; // 각 항목은 [_, 시작 정점, 끝 정점] (진행 방향에 맞춰 뒤집어 넣는다)
      const start = key[open[s0][1]];
      let cur = key[open[s0][2]], guard = 0, closed = false;
      while (guard++ < 100000) {
        if (cur === start) { closed = true; break; }
        const cand = (at.get(cur) || []).find((i) => !used[i]);
        if (cand === undefined) break;
        used[cand] = 1;
        const e = open[cand];
        if (key[e[1]] === cur) { loop.push(e); cur = key[e[2]]; } else { loop.push([1, e[2], e[1]]); cur = key[e[1]]; }
      }
      if (!closed || loop.length < 3) { left++; continue; }
      const c0 = [0, 0, 0];
      for (const e of loop) { c0[0] += pos[e[1] * 3] / loop.length; c0[1] += pos[e[1] * 3 + 1] / loop.length; c0[2] += pos[e[1] * 3 + 2] / loop.length; }
      if (o.skip && o.skip(c0, loop.length)) { left++; continue; }
      // 중심, 법선(Newell), 평면에서 벗어난 정도
      let cx = 0, cy = 0, cz = 0;
      for (const e of loop) { cx += pos[e[1] * 3]; cy += pos[e[1] * 3 + 1]; cz += pos[e[1] * 3 + 2]; }
      cx /= loop.length; cy /= loop.length; cz /= loop.length;
      let nx = 0, ny = 0, nz = 0, rad = 0;
      for (const e of loop) {
        const ax = pos[e[1] * 3] - cx, ay = pos[e[1] * 3 + 1] - cy, az = pos[e[1] * 3 + 2] - cz;
        const bx = pos[e[2] * 3] - cx, by = pos[e[2] * 3 + 1] - cy, bz = pos[e[2] * 3 + 2] - cz;
        nx += ay * bz - az * by; ny += az * bx - ax * bz; nz += ax * by - ay * bx;
        rad += Math.hypot(ax, ay, az);
      }
      const nl = Math.hypot(nx, ny, nz);
      rad /= loop.length;
      if (nl < 1e-12 || rad < 1e-9) { left++; continue; }
      nx /= nl; ny /= nl; nz /= nl;
      let dev = 0;
      for (const e of loop) dev = Math.max(dev, Math.abs((pos[e[1] * 3] - cx) * nx + (pos[e[1] * 3 + 1] - cy) * ny + (pos[e[1] * 3 + 2] - cz) * nz));
      if (dev > rad * tol) { left++; continue; }
      // 고리를 평면에 펴서 귀 자르기(ear clipping)로 삼각형을 만든다: 오목한 고리(익형 단면, 쌍발 꼬리 윤곽)도 뒤집힘 없이 막힌다
      let ux = Math.abs(nx) < 0.9 ? 1 : 0, uy = Math.abs(nx) < 0.9 ? 0 : 1, uz = 0;
      const d0 = ux * nx + uy * ny + uz * nz;
      ux -= nx * d0; uy -= ny * d0; uz -= nz * d0;
      const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
      const P = loop.map((e) => { const x = pos[e[1] * 3] - cx, y = pos[e[1] * 3 + 1] - cy, z = pos[e[1] * 3 + 2] - cz; return [x * ux + y * uy + z * uz, x * vx + y * vy + z * vz]; });
      let tris = earClip(P);
      if (!tris) { // 아주 얇거나 점이 겹친 고리: 첫 점에서 부채꼴로 막는다
        tris = [];
        for (let i = 1; i < P.length - 1; i++) tris.push(0, i, i + 1);
      }
      // 고리 정점을 새로 복사한다(법선이 섞이지 않게). 속성(uv·색)은 한 정점 값으로 통일: 막는 면은 민무늬
      const base = pos.length / 3;
      const src0 = loop[0][1];
      for (const e of loop) { pos.push(pos[e[1] * 3], pos[e[1] * 3 + 1], pos[e[1] * 3 + 2]); for (const x of extras) for (let c = 0; c < x.size; c++) x.array.push(x.array[src0 * x.size + c]); }
      for (let t = 0; t < tris.length; t += 3) idx.push(base + tris[t + 2], base + tris[t + 1], base + tris[t]); // 이웃 삼각형과 방향이 맞도록 뒤집는다
      capped++;
    }
  }
  return { capped, left };
}

/** 단순 다각형(반시계) 귀 자르기. 실패하면 null */
function earClip(P) {
  const n = P.length;
  const V = Array.from({ length: n }, (_, i) => i);
  const out = [];
  const cross = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
  let guard = 0;
  while (V.length > 3 && guard++ < n * n) {
    let cut = false;
    for (let i = 0; i < V.length; i++) {
      const a = V[(i + V.length - 1) % V.length], b = V[i], c = V[(i + 1) % V.length];
      if (cross(a, b, c) < -1e-12) continue; // 오목한 꼭짓점
      let inside = false;
      for (const p of V) {
        if (p === a || p === b || p === c) continue;
        if (cross(a, b, p) > 1e-12 && cross(b, c, p) > 1e-12 && cross(c, a, p) > 1e-12) { inside = true; break; }
      }
      if (inside) continue;
      out.push(a, b, c);
      V.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) return null;
  }
  if (V.length === 3) out.push(V[0], V[1], V[2]);
  return out;
}

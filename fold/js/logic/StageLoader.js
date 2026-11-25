// 스테이지 JSON → 검증된 스테이지 정의(논리용). 잘못된 데이터는 어디가 틀렸는지 알려 주는 오류를 던져요.
import { vec, cross, dot, sub, DIRS, dir4Of } from './math.js';

export const TALL = new Set(['block', 'door', 'key', 'mirror', 'source', 'receptor', 'stairs']);
export const FLAT = new Set(['switch', 'exit']);
const TYPES = new Set([...TALL, ...FLAT]);

const isInt = v => Number.isInteger(v);
const isVec3 = v => Array.isArray(v) && v.length === 3 && v.every(isInt);
const isAxis = v => v.filter(x => x !== 0).length === 1 && v.every(x => x === 0 || x === 1 || x === -1);

function fail(stageId, msg) { throw new Error(`[스테이지 ${stageId}] ${msg}`); }

// 면 f 위 rest 좌표 칸 중심 p(정수칸 [ix,lvl,iz]) 에 해당하는 (i,j) — 없으면 null
export function restCellAt(f, cell) {
  const p = [cell[0] + 0.5, cell[1], cell[2] + 0.5];
  const d = sub(p, f.o);
  if (Math.abs(f.n[1]) !== 1 || dot(d, f.n) !== 0) return null;
  const i = dot(d, f.u) - 0.5, j = dot(d, f.v) - 0.5;
  if (!isInt(i) || !isInt(j) || i < 0 || j < 0 || i >= f.w || j >= f.h) return null;
  return f.has(i, j) ? { i, j } : null;
}

export function parseStage(json) {
  const id = json && json.id;
  if (!id || typeof id !== 'string') throw new Error('스테이지 id 가 없어요');
  const S = {
    id, chapter: json.chapter | 0, index: json.index | 0,
    name: String(json.name || id), title: String(json.title || ''),
    difficulty: json.difficulty | 0, intro: json.intro || '', story: json.story || '',
    goalText: json.goalText || '출구에 도착하기', hints: Array.isArray(json.hints) ? json.hints.map(String) : [],
    tags: Array.isArray(json.tags) ? json.tags : [],
    faces: [], faceById: new Map(), creases: [], creaseById: new Map(),
    parentCrease: new Map(), // childFaceId → crease
    objects: [], objById: new Map(),
  };
  if (!Array.isArray(json.faces) || !json.faces.length) fail(id, 'faces 가 비어 있어요');

  json.faces.forEach((fd, idx) => {
    if (!fd.id || S.faceById.has(fd.id)) fail(id, `면 id 가 없거나 겹쳐요 (#${idx})`);
    if (!isVec3(fd.o)) fail(id, `면 ${fd.id}: o 는 정수 [x,y,z]`);
    if (!DIRS[fd.u] || !DIRS[fd.v]) fail(id, `면 ${fd.id}: u/v 는 '+x' 같은 방향`);
    const u = vec(fd.u), v = vec(fd.v);
    if (dot(u, v) !== 0) fail(id, `면 ${fd.id}: u 와 v 는 수직이어야 해요`);
    const w = fd.w | 0, h = fd.h | 0;
    if (w < 1 || h < 1 || w > 32 || h > 32) fail(id, `면 ${fd.id}: 크기 ${w}x${h}`);
    let mask = null;
    if (fd.mask) {
      if (!Array.isArray(fd.mask) || fd.mask.length !== h || fd.mask.some(r => typeof r !== 'string' || r.length !== w))
        fail(id, `면 ${fd.id}: mask 는 길이 ${w} 문자열 ${h}줄`);
      mask = fd.mask;
    }
    const closed = Array.isArray(fd.closed) ? fd.closed.filter(e => ['-u', '+u', '-v', '+v'].includes(e)) : [];
    const f = {
      id: fd.id, idx, o: fd.o.slice(), u, v, n: cross(u, v), w, h, mask, closed,
      when: Array.isArray(fd.when) ? fd.when.slice() : null,
      fixed: !!fd.fixed, tone: fd.tone || null,
      has: (i, j) => !mask || mask[j][i] !== '.',
      children: [],
    };
    S.faces.push(f); S.faceById.set(f.id, f);
  });

  (json.creases || []).forEach((cd, idx) => {
    if (!cd.id || S.creaseById.has(cd.id)) fail(id, `접힘선 id 가 없거나 겹쳐요 (#${idx})`);
    const P = S.faceById.get(cd.parent), C = S.faceById.get(cd.child);
    if (!P || !C || P === C) fail(id, `접힘선 ${cd.id}: parent/child 면을 찾을 수 없어요`);
    if (S.parentCrease.has(C.id)) fail(id, `면 ${C.id} 에 접힘선이 둘 이상 붙어 있어요`);
    if (!isVec3(cd.a) || !isVec3(cd.b)) fail(id, `접힘선 ${cd.id}: a/b 는 정수 [x,y,z]`);
    const d = sub(cd.b, cd.a), len = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]);
    const axis = len ? d.map(x => x / len) : d;
    if (!len || !isAxis(axis)) fail(id, `접힘선 ${cd.id}: 좌표축과 나란해야 해요`);
    const min = cd.min ?? -180, max = cd.max ?? 180;
    if (min % 90 || max % 90 || min > 0 || max < 0) fail(id, `접힘선 ${cd.id}: min/max 는 90 단위, 0 포함`);
    const c = { id: cd.id, parent: P.id, child: C.id, a: cd.a.slice(), b: cd.b.slice(), axis, len, min, max, idx };
    S.creases.push(c); S.creaseById.set(c.id, c); S.parentCrease.set(C.id, c);
    P.children.push(C.id);
  });

  // 순환 검사 + 접힘선마다 같이 도는 면(하위 트리)
  for (const f of S.faces) {
    const seen = new Set(); let cur = f.id;
    while (S.parentCrease.has(cur)) {
      if (seen.has(cur)) fail(id, `면 ${f.id}: 접힘선 연결이 순환해요`);
      seen.add(cur); cur = S.parentCrease.get(cur).parent;
    }
  }
  const sub_ = fid => [fid, ...S.faceById.get(fid).children.flatMap(sub_)];
  for (const c of S.creases) c.faces = sub_(c.child);

  // 물체: at = [ix, level, iz] 칸에 서 있는 물체. 그 칸의 수평 면(나중 면이 위)에 붙여요.
  (json.objects || []).forEach((od, idx) => {
    if (!od.id || S.objById.has(od.id)) fail(id, `물체 id 가 없거나 겹쳐요 (#${idx})`);
    if (!TYPES.has(od.type)) fail(id, `물체 ${od.id}: 모르는 종류 ${od.type}`);
    let att = null;
    if (od.face) { // 세워진 면 등에 직접 붙이기: { face, i, j, side }
      const f = S.faceById.get(od.face);
      if (!f || !isInt(od.i) || !isInt(od.j) || od.i < 0 || od.j < 0 || od.i >= f.w || od.j >= f.h || !f.has(od.i, od.j))
        fail(id, `물체 ${od.id}: face/i/j 가 잘못됐어요`);
      att = { face: f.id, i: od.i, j: od.j, side: od.side === -1 ? -1 : 1 };
    } else {
      if (!isVec3(od.at)) fail(id, `물체 ${od.id}: at 은 정수 [ix,level,iz]`);
      for (const f of S.faces) { const c = restCellAt(f, od.at); if (c) att = { face: f.id, i: c.i, j: c.j, side: f.n[1] }; }
      if (!att) fail(id, `물체 ${od.id}: ${od.at} 칸 아래에 바닥 면이 없어요`);
    }
    const o = { id: od.id, type: od.type, att, tall: TALL.has(od.type) };
    if (od.dir) {
      if (!DIRS[od.dir] || dir4Of(vec(od.dir)) < 0) fail(id, `물체 ${od.id}: dir 는 수평 방향`);
      o.dir = vec(od.dir);
    }
    if ((od.type === 'source' || od.type === 'stairs') && !o.dir) fail(id, `물체 ${od.id}: dir 가 필요해요`);
    if (od.type === 'mirror') o.mirror = od.mirror ? 1 : 0;
    if (od.type === 'door') {
      o.when = Array.isArray(od.when) ? od.when.slice() : null;
      o.key = od.key || null;
      if (!o.when && !o.key) fail(id, `문 ${od.id}: when 또는 key 가 필요해요`);
    }
    if (od.type === 'key') o.label = od.label || '';
    S.objects.push(o); S.objById.set(o.id, o);
  });

  const refOk = r => S.objById.has(r) && ['switch', 'receptor'].includes(S.objById.get(r).type);
  for (const o of S.objects) {
    if (o.when && !o.when.every(refOk)) fail(id, `문 ${o.id}: when 은 스위치/수신기 id`);
    if (o.key && (S.objById.get(o.key) || {}).type !== 'key') fail(id, `문 ${o.id}: key ${o.key} 없음`);
  }
  for (const f of S.faces) if (f.when && !f.when.every(refOk)) fail(id, `면 ${f.id}: when 은 스위치/수신기 id`);

  const goal = json.goal || {};
  S.goal = { requires: Array.isArray(goal.requires) ? goal.requires.slice() : [] };
  if (!S.goal.requires.every(refOk)) fail(id, 'goal.requires 는 스위치/수신기 id');
  if (!S.objects.some(o => o.type === 'exit')) fail(id, '출구(exit)가 없어요');

  const pl = json.player || {};
  if (!isVec3(pl.at)) fail(id, 'player.at 은 정수 [ix,level,iz]');
  if (!S.faces.some(f => restCellAt(f, pl.at))) fail(id, `플레이어 시작 칸 ${pl.at} 아래에 면이 없어요`);
  S.player = { at: pl.at.slice(), facing: DIRS[pl.facing] && dir4Of(vec(pl.facing)) >= 0 ? dir4Of(vec(pl.facing)) : 0 };
  return S;
}

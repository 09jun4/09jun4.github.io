// 3장 「가림」 — 기둥 뒤 숨은 통로와 펜로즈 계단
import { P, WX, WZ, HX, HZ, O, tower, col, roof, dome, save, at, via, penrose, cellFaces, hiddenPair, veil } from './lib.mjs';
const meta = (id, index, name, title, difficulty, intro, goalText, story, hints, extra = {}) => ({ id, chapter: 3, index, name, title, difficulty, intro, goalText, story, hints, reach: true, ...extra });
const T = (x, y, z, w, d, tone, base = -4) => tower(x, y, z, w, d, base, tone);
const pillar = (x, z, y0, y1, tone = 'a2', w = 1) => ({ type: 'box', at: [x + 0.5, y0, z + 0.5], size: [w, y1 - y0, w], tone });
const stairsObjs = (r, p) => r.stairs.map((s, i) => O(p + i, 'stairs', s.at, { dir: s.dir }));
const towersUnder = (cells, tone, base = -4) => cells.map(c => T(c[0], c[1], c[2], 1, 1, tone, base));

// 3-1 기둥 뒤 — 기둥에 가려진 칸을 지나 반대편으로
{
  const A = [3, 0, 1], B = via([4, 0, 1], '+x', 0, 2);    // 숨은 칸 (4,0,1) 다음 → (7,2,3)
  const C = via([9, 2, 3], '+x', 3, -2);                   // 시점3: B 끝 동쪽
  save('ch3', {
    ...meta('3-1', 1, '기둥 뒤', 'Behind the Pillar', 3,
      '기둥에 가려 보이지 않는 곳도 길이 이어져 있을 수 있어요. 가려진 쪽으로 걸어 들어가 보세요.',
      '기둥 뒤로 지나가기', '보이지 않는 동안에도 걸음은 이어졌다. 가림은 끊김이 아니었다.',
      ['기둥이 길 끝을 가리는 시점을 찾아보세요.']),
    view: 1,
    faces: [P('S', 0, 0, 0, 4, 3), P('B', ...B, 3, 1, { tone: 'a1' }), P('C', ...C, 1, 3, { tone: 'a3' })],
    hidden: [{ view: 0, from: A, dir: '+x', to: B }, { view: 0, from: B, dir: '-x', to: A }],
    objects: [O('exit', 'exit', [C[0], C[1], C[2] + 2])],
    decor: [T(0, 0, 0, 4, 3), T(...B, 3, 1, 'a1'), T(...C, 1, 3, 'a3'), pillar(6, 3, -4, 4.2, 'a3'), roof(6.5, 4.2, 3.5, 1.3, 1)],
    player: { at: [0, 0, 1], facing: '+x' },
  });
}

// 3-2 끝없는 계단 — 앞으로 오르는 계단은 잠겨 있고, 뒤로 걸으면 꼭대기에 닿아요 (시점0에서만 고리가 닫힘)
{
  const r = penrose([0, 0, 0], ['f+x', 'u+x', 'f+x', 'u+x', 'f+x', 'f+z', 'u+z', 'f+z', 'u+z', 'f+z', 'f-x', 'f-x', 'f-x', 'f-z', 'f-z']);
  const top = r.last; // (4,4,5)
  save('ch3', {
    ...meta('3-2', 2, '끝없는 계단', 'Endless Stairs', 3,
      '계단을 따라 한 바퀴 돌면 처음 자리로 돌아와요. 그런데 높이는 어떻게 된 걸까요?',
      '잠긴 계단을 거치지 않고 꼭대기로', '오르는 길과 내려가는 길은 같은 길이었다. 한 바퀴 돌면, 언제나 처음이었다.',
      ['앞으로 가는 길은 잠겨 있어요. 반대 방향으로 걸어 보세요.', '고리가 닫혀 보이는 시점이 있어요.']),
    view: 2,
    faces: [...cellFaces('R', r.cells), P('X', top[0] + 1, top[1], top[2] - 2, 1, 3, { tone: 'a1' })],
    objects: [...stairsObjs(r, 'st'), O('d1', 'door', [1, 0, 0], { key: 'kx' }), O('kx', 'key', [top[0] + 1, top[1], top[2] - 2]), O('exit', 'exit', [top[0] + 1, top[1], top[2]])],
    decor: [...towersUnder(r.cells.filter(c => c[1] === 0), 'a2'), T(top[0] + 1, top[1], top[2] - 2, 1, 3, 'a1'), col(4.5, 4.02, 2.5, 1.2, 'a3', 0.35), dome(4.5, 5.22, 2.5, 0.5, 0.35)],
    player: { at: [0, 0, 0], facing: '-x' },
  });
}

// 3-3 두 개의 기둥 — 첫 기둥 뒤 통로는 한쪽으로만. 그 탑에 있는 동안 날개를 접어야 두 번째 기둥에 닿아요
{
  const B = via([4, 0, 1], '+x', 0, 2);                 // (7,2,3) 숨은 칸(4,0,1) 너머
  const C = via([7, 2, 7], '+z', 2, -2);                // (9,0,10) 숨은 칸(7,2,7) 너머 (날개 끝 (7,2,6) 다음)
  const E = via([10, 0, 11], '+x', 3, 2);               // 시점3: C 동쪽
  save('ch3', {
    ...meta('3-3', 3, '두 개의 기둥', 'Two Pillars', 4,
      '기둥 뒤 통로 중에는 한쪽으로만 지나갈 수 있는 것도 있어요. 돌아올 수 없다면, 떠나기 전에 할 일을 생각하세요.',
      '두 기둥을 지나 출구로', '돌아올 수 없는 문을 지나기 전에, 사람은 무엇을 접어 두어야 할지 안다.',
      ['첫 기둥 너머로는 다시 돌아올 수 없어요. 그 탑에서 해야 할 일이 있어요.', '남쪽 날개를 접어 두면 두 번째 기둥에 닿아요.']),
    view: 1,
    faces: [
      P('S', 0, 0, 0, 4, 3), P('B', ...B, 2, 2, { tone: 'a1' }), WZ('F', 7, 2, 5, 1, 2, { tone: 'a1' }),
      P('C', ...C, 2, 2, { tone: 'a3' }), P('E', ...E, 2, 1, { tone: 'a1' }),
    ],
    creases: [HX('cF', 'B', 'F', 7, 2, 5, 1)],
    hidden: [{ view: 0, from: [3, 0, 1], dir: '+x', to: B }, { view: 2, from: [7, 2, 6], dir: '+z', to: C }],
    objects: [O('exit', 'exit', [E[0] + 1, E[1], E[2]])],
    decor: [T(0, 0, 0, 4, 3), T(...B, 2, 2, 'a1'), T(...C, 2, 2, 'a3'), T(...E, 2, 1, 'a1'),
      pillar(6, 3, -4, 4.2, 'a3'), roof(6.5, 4.2, 3.5, 1.3, 1), pillar(5, 5, -4, 6.2, 'a3'), roof(5.5, 6.2, 5.5, 1.3, 1)],
    player: { at: [0, 0, 1], facing: '+x' },
  });
}

// 3-4 거꾸로 떨어지는 블록 — 펜로즈 고리 꼭대기의 블록을 이음매로 밀면 네 층 아래 시작 칸(스위치)으로 떨어져요
{
  const steps = ['f+x', 'u+x', 'f+x', 'u+x', 'f+x', 'f+z', 'u+z', 'f+z', 'u+z', 'f+z', 'f-x', 'f-x', 'f-x', 'f-z', 'f-z'];
  const r = penrose([0, 0, 0], steps);
  const topCells = ['4,4,5', '4,4,6', '4,4,7'];
  const loopCells = r.cells.filter(c => !topCells.includes(c.join()));
  const BP = via([3, 1, 0], '-z', 1, 3);                // (0,4,2) 시점1: 고리 첫 층 북쪽
  save('ch3', {
    ...meta('3-4', 4, '거꾸로 떨어지는 블록', 'Falling Upward', 5,
      '펜로즈 계단의 이음매는 블록도 지나가요. 꼭대기에서 밀면, 바닥으로 떨어지죠.',
      '꼭대기의 블록을 시작 칸 스위치로', '가장 높은 곳에서 한 걸음 내디디면, 가장 낮은 곳이었다.',
      ['시작 칸에서 뒤로 걸으면 꼭대기예요.', '블록 뒤로 가려면 다른 시점에서 넓은 판으로 건너가야 해요.', '블록을 꼭대기 끝까지 옮긴 뒤, 고리가 닫히는 시점에서 이음매 쪽으로 미세요.']),
    view: 2,
    faces: [...cellFaces('R', loopCells), P('TOP', 4, 4, 5, 1, 3, { tone: 'a1' }), WX('Fb', 4, 4, 6, 1, 2, { tone: 'a1' }), P('BP', ...BP, 2, 5, { tone: 'a3' }), P('BQ', 2, 4, 3, 4, 1, { tone: 'a3' }),
      P('X', 8, 2, 0, 2, 1, { tone: 'a1' })],
    creases: [HZ('cB', 'TOP', 'Fb', 4, 4, 6, 1, { min: 0, max: 180 })],
    hidden: [{ view: 1, from: [7, 2, 1], dir: '-x', to: [5, 4, 3] }],
    objects: [...stairsObjs(r, 'st'), O('s1', 'switch', [0, 0, 0]), O('b1', 'block', [1, 4, 6]),
      O('d1', 'door', [8, 2, 0], { when: ['s1'] }), O('exit', 'exit', [9, 2, 0])],
    decor: [...towersUnder(r.cells.filter(c => c[1] === 0), 'a2'), T(...BP, 2, 5, 'a3'), T(8, 2, 0, 2, 1, 'a1'), col(4.5, 4.02, 7.5, 1.2, 'a3', 0.35), dome(4.5, 5.22, 7.5, 0.5, 0.35)],
    player: { at: [1, 0, 0], facing: '+x' },
  });
}

// 3-5 기둥의 고리 — 네 기둥 뒤 통로가 차례로 한쪽으로만 이어져요. 각 탑을 떠나기 전에 접어 둘 것이 있어요
export function ring35(dl3 = -2, v4 = 3, dl4 = -2, v3 = 2, dl2 = 2, write = true) {
  const l1 = hiddenPair([2, 0, 1], '+x', 0, 2);           // A → B (6,2,3)
  const B = l1.to;
  const l2 = hiddenPair([7, 2, 6], '+z', 1, dl2);           // B 남쪽 날개 끝 → C
  const C = l2.to;                                          // (5,4,10)
  const l3 = hiddenPair([C[0], C[1], C[2] + 1], '-x', v3, dl3);  // C → D
  const Dc = l3.to;                                         // D 의 동쪽 칸
  const l4 = hiddenPair([Dc[0] - 1, Dc[1], Dc[2]], '-z', v4, dl4); // D → E
  const Ec = l4.to;                                         // E 의 남쪽 줄 칸
  const st = {
    ...meta('3-5', 5, '기둥의 고리', 'Ring of Veils', 5,
      '네 개의 기둥 뒤 통로가 고리처럼 이어져 있어요. 모두 한쪽으로만 지나갈 수 있어요.',
      '네 기둥을 차례로 지나 출구로', '기둥마다 다른 쪽에서 보아야 했다. 한 바퀴를 돌고서야 길은 하나가 되었다.',
      ['두 번째 탑에서는 남쪽 날개를 펼쳐 두어야 다음 기둥에 닿아요.', '네 번째 탑의 북쪽 벽은 안쪽으로 접어야 해요. 바깥으로 접으면 길이 엉뚱하게 이어져요.']),
    view: 2,
    faces: [
      P('A', 0, 0, 0, 3, 3), P('B', ...B, 2, 2, { tone: 'a1' }), WZ('BF', 7, 2, 5, 1, 2, { tone: 'a1' }),
      P('C', ...C, 2, 2, { tone: 'a3' }), P('D', Dc[0] - 1, Dc[1], Dc[2], 2, 2, { tone: 'a1' }), WZ('DW', Dc[0] - 1, Dc[1], Dc[2], 1, 2, { tone: 'a1' }),
      P('E', Ec[0] - 2, Ec[1], Ec[2] - 1, 3, 2, { tone: 'a3' }), P('Ex', Ec[0] - 4, Ec[1], Ec[2] - 1, 2, 1, { tone: 'a3' }),
    ],
    creases: [HX('cB', 'B', 'BF', 7, 2, 5, 1), HX('cD', 'D', 'DW', Dc[0] - 1, Dc[1], Dc[2], 1)],
    hidden: [l1.link(B), l2.link(C), l3.link(Dc), l4.link(Ec)],
    objects: [O('k1', 'key', [C[0] + 1, C[1], C[2]]), O('d1', 'door', [Ec[0] - 3, Ec[1], Ec[2] - 1], { key: 'k1' }), O('exit', 'exit', [Ec[0] - 4, Ec[1], Ec[2] - 1])],
    decor: [T(0, 0, 0, 3, 3), T(...B, 2, 2, 'a1'), T(...C, 2, 2, 'a3'), T(Dc[0] - 1, Dc[1], Dc[2], 2, 2, 'a1'), T(Ec[0] - 2, Ec[1], Ec[2] - 1, 3, 2, 'a3'), T(Ec[0] - 4, Ec[1], Ec[2] - 1, 2, 1, 'a3'),
      ...veil(l1.gap, 0), ...veil(l2.gap, 1), ...veil(l3.gap, v3), ...veil(l4.gap, v4)],
    player: { at: [0, 0, 1], facing: '+x' },
  };
  if (write) save('ch3', st);
  return st;
}
ring35(...(globalThis.RING35 || [2, 3, 1, 2, 2]));

// 3-6 가림의 탑 — 펜로즈 고리 꼭대기 → 기둥 뒤(한쪽) 열쇠 탑 → 벽을 접고 → 두 번째 기둥 → 다리를 접고 → 시점을 돌려 잠긴 출구로
export function tower36(vA = 1, dA = 2, vB = 2, dB = -2, vC = 3, dC = 1, write = true) {
  const steps = ['f+x', 'u+x', 'f+x', 'u+x', 'f+x', 'f+z', 'u+z', 'f+z', 'u+z', 'f+z', 'f-x', 'f-x', 'f-x', 'f-z', 'f-z'];
  const r = penrose([0, 0, 0], steps);
  const lA = hiddenPair([4, 4, 5], '-x', vA, dA);          // 꼭대기 서쪽 → 열쇠 탑 K 의 동쪽 칸
  const K = lA.to;                                           // K: 2x2, 동쪽 위 칸이 도착
  const kx = K[0] - 1, kz = K[2];
  const lB = hiddenPair([kx, K[1], kz + 1], '+z', vB, dB);  // K 남쪽(벽 KW 너머) → M
  const M = lB.to;                                           // M: 1x2 (북쪽 칸 도착), 동쪽에 다리 날개
  const xE = [M[0] + 2, M[1], M[2] + 1];                     // 날개(x M+1..M+2) 끝 칸
  const X = via(xE, '+x', vC, dC);                           // 시점 vC: 날개 끝 동쪽 → 출구 탑
  const st = {
    ...meta('3-6', 6, '가림의 탑', 'Tower of Veils', 6,
      '끝없는 계단과 기둥 뒤 통로가 얽힌 탑이에요. 지나간 길로는 돌아올 수 없어요.',
      '열쇠를 가지고 잠긴 탑으로', '모든 가림을 지나고 나서야 알았다. 숨은 길은 처음부터 보이는 길의 뒷면이었다.',
      ['고리 꼭대기 서쪽에 기둥이 있어요.', '열쇠 탑의 남쪽 벽은 떠나기 전에 접어야 해요.', '마지막 판에서는 동쪽 날개를 펼친 뒤 시점을 바꾸세요.']),
    view: 2,
    faces: [...cellFaces('R', r.cells), P('K', kx, K[1], kz, 2, 2, { tone: 'a1' }), WZ('KW', kx, K[1], kz + 2, 1, 2, { tone: 'a1' }),
      P('M', M[0], M[1], M[2], 1, 2, { tone: 'a3' }), WX('MB', M[0] + 1, M[1], M[2] + 1, 1, 2, { tone: 'a3' }),
      P('X', ...X, 2, 1, { tone: 'a1' })],
    creases: [HX('cK', 'K', 'KW', kx, K[1], kz + 2, 1), HZ('cM', 'M', 'MB', M[0] + 1, M[1], M[2] + 1, 1)],
    hidden: [lA.link(K), lB.link(M)],
    objects: [...stairsObjs(r, 'st'), O('k1', 'key', [kx, K[1], kz]), O('d1', 'door', X, { key: 'k1' }), O('exit', 'exit', [X[0] + 1, X[1], X[2]])],
    decor: [...towersUnder(r.cells.filter(c => c[1] === 0), 'a2'), T(kx, K[1], kz, 2, 2, 'a1'), T(M[0], M[1], M[2], 1, 2, 'a3'), T(...X, 2, 1, 'a1'),
      ...veil(lA.gap, vA), ...veil(lB.gap, vB), col(X[0] + 1.5, X[1] + 0.02, X[2] + 0.5, 0.01, 'a3', 0.01)],
    player: { at: [1, 0, 0], facing: '+x' },
  };
  if (write) save('ch3', st);
  return st;
}
tower36(...(globalThis.TOWER36 || [1, 2, 2, -3, 0, 2]));

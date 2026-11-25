// 4장 「불가능한 건축」 — 지금까지의 모든 규칙을 엮은 어려운 스테이지 (매개변수 + 탐색으로 우연한 연결 제거)
import { P, WX, WZ, HX, HZ, O, tower, col, roof, dome, save, at, via, penrose, cellFaces, hiddenPair, veil, findLinks } from './lib.mjs';
const meta = (id, index, name, title, difficulty, intro, goalText, story, hints, extra = {}) => ({ id, chapter: 4, index, name, title, difficulty, intro, goalText, story, hints, reach: true, ...extra });
const T = (x, y, z, w, d, tone, base = -5) => tower(x, y, z, w, d, base, tone);
const ARGS = globalThis.CH4 || {};
const run = (name, fn) => { if (!ARGS.nowrite) fn(); }; // 탐색 중에는 파일을 쓰지 않아요

// 4-1 빛은 곧다 — 빛은 실제 공간을 곧게, 인형은 착시로. 벽을 치우고, 높은 길로 건너, 두 거울을 맞추기
export function light41(write = true) {
  const H = via([2, 0, 0], '-z', 0, 1);                   // (3,1,0) 시점0: S 북쪽 경계 너머
  const T1 = via([5, 1, 0], '+x', 2, -1);                 // (7,0,1) 시점2: H 동쪽 끝 너머 → 거울 탑
  const st = {
    ...meta('4-1', 1, '빛은 곧다', 'Light is Straight', 5,
      '빛은 착시를 따르지 않아요. 실제 공간을 곧게 나아가요. 인형은 보이는 대로 건너지만, 빛은 그렇지 않죠.',
      '빛을 두 거울로 꺾어 수신기에', '빛은 거짓말을 하지 않았다. 거짓말을 한 것은 언제나 시선이었다.',
      ['광원 앞을 막은 것들은 떠나기 전에 치워야 해요.', '두 번째 거울은 뒤집혀 접혀 있어요. 펼치면 바로 서요.'], { view: 1 }),
    faces: [
      P('S', 0, 0, 0, 3, 3), WX('W', 3, 0, 1, 1, 2),
      P('H', ...H, 3, 1, { tone: 'a1' }),
      P('T1', 7, 0, 0, 2, 3, { tone: 'a3' }), P('MF', 8, 0, 2, 1, 1, { tone: 'a3' }),
      P('RT', 11, 0, 2, 1, 3, { tone: 'a1' }),
      P('GB', 9, 0, 0, 2, 1, { tone: 'a1', when: ['r1'] }), P('EX', 11, 0, 0, 2, 1, { tone: 'a3' }),
    ],
    creases: [HZ('cW', 'S', 'W', 3, 0, 1, 1, { min: -90, max: 90 }), HX('cM', 'T1', 'MF', 8, 0, 3, 1)],
    objects: [
      O('src', 'source', [0, 0, 1], { dir: '+x' }), O('b1', 'block', [1, 0, 1]),
      O('m1', 'mirror', [8, 0, 1], { mirror: 0 }),
      O('m2', 'mirror', null, { face: 'MF', i: 0, j: 0, side: 1, mirror: 0 }),
      O('r1', 'receptor', [11, 0, 3]), O('exit', 'exit', [12, 0, 0]),
    ],
    decor: [T(0, 0, 0, 3, 3), T(...H, 3, 1, 'a1'), T(7, 0, 0, 2, 3, 'a3'), T(11, 0, 2, 1, 3, 'a1'), T(11, 0, 0, 2, 1, 'a3'), col(11.5, 0.02, 4.5, 1.4, 'a2', 0.3), dome(11.5, 1.42, 4.5, 0.5, 0.3)],
    player: { at: [0, 0, 0], facing: '+x' },
  };
  if (write) save('ch4', st);
  return st;
}
run('light41', light41);

// 4-2 두 개의 무게 — 1막: 블록을 이음매 너머 높은 탑 스위치로 → 다리가 나타남. 2막: 다리 건너 섬에서 둘째 블록을 다른 시점의 이음매로 내려 보내 아래 탑 스위치로
export function weights42(write = true) {
  const H1 = via([3, 0, 1], '+x', 3, 2);            // 시점3: S 동쪽 이음매 → 높은 탑 (레벨2)
  const I2 = [H1[0], 2, H1[2] + 2];                  // 다리 남쪽 섬 (3x3)
  const H2 = via([I2[0] + 2, 2, I2[2] + 1], '+x', 1, -2); // 시점1: 섬 동쪽 이음매 → 낮은 탑 (레벨0)
  const st = {
    ...meta('4-5', 5, '두 개의 무게', 'Two Weights', 6,
      '두 탑의 스위치를 모두 눌러야 문이 열려요. 블록은 보이는 대로 밀려 가요 — 위로도, 아래로도.',
      '두 블록을 두 탑의 스위치로', '하나의 무게로는 열리지 않았다. 두 개의 시선이 겹칠 때 문이 열렸다.',
      ['첫 블록은 동쪽 이음매로 올려 보내요. 벽을 안쪽으로 접으려면 블록이 비켜 있어야 해요.', '스위치가 눌리면 남쪽 섬으로 다리가 생겨요.', '섬의 블록은 다른 시점에서 동쪽으로 내려 보내야 해요. 먼저 줄을 맞추세요.']),
    view: 0,
    faces: [
      P('S', 0, 0, 0, 4, 3), WX('W', 4, 0, 1, 1, 2),
      P('H1', ...H1, 3, 1, { tone: 'a1' }), P('G1', H1[0] + 1, 2, H1[2] + 1, 1, 1, { tone: 'a1', when: ['sA'] }),
      P('I2', ...I2, 3, 4, { tone: 'a3', mask: ['###', '###', '###', '.#.'] }),
      P('H2', ...H2, 3, 1, { tone: 'a1' }), P('X', H2[0] + 1, 0, H2[2] + 1, 1, 2, { tone: 'a3' }),
    ],
    creases: [HZ('cW', 'S', 'W', 4, 0, 1, 1, { min: -90, max: 90 })],
    objects: [
      O('b1', 'block', [2, 0, 1]), O('sA', 'switch', [H1[0] + 2, 2, H1[2]]),
      O('b2', 'block', [I2[0] + 1, 2, I2[2] + 2]), O('sB', 'switch', [H2[0] + 2, 0, H2[2]]),
      O('d1', 'door', [H2[0] + 1, 0, H2[2] + 1], { when: ['sA', 'sB'] }), O('exit', 'exit', [H2[0] + 1, 0, H2[2] + 2]),
    ],
    decor: [T(0, 0, 0, 4, 3), T(...H1, 3, 1, 'a1'), T(...I2, 3, 3, 'a3'), T(I2[0] + 1, 2, I2[2] + 3, 1, 1, 'a3'), T(...H2, 3, 1, 'a1'), T(H2[0] + 1, 0, H2[2] + 1, 1, 2, 'a3')],
    player: { at: [0, 0, 1], facing: '+x' },
  };
  if (write) save('ch4', st);
  return st;
}
run('weights42', weights42);

// 4-3 위로 떨어지는 블록 — 펜로즈 고리 바닥의 블록을 뒤로 밀면 꼭대기로 솟아올라 스위치를 눌러요
export function fallUp43(vK = 2, dK = 2, write = true) {
  const steps = ['f+x', 'u+x', 'f+x', 'u+x', 'f+x', 'f+z', 'u+z', 'f+z', 'u+z', 'f+z', 'f-x', 'f-x', 'f-x', 'f-z', 'f-z'];
  const r = penrose([0, 0, 0], steps);
  const Q = via([7, 2, 0], '-z', 0, -2);                // (5,0,-3) 시점0: 고리 둘째 층 북쪽 → 땅의 긴 길
  const K = via([7, 4, 7], '+z', vK, dK);               // 꼭대기 층 남쪽 끝 → 열쇠 탑
  const st = {
    ...meta('4-3', 3, '위로 떨어지는 블록', 'Falling Up', 6,
      '끝없는 계단의 이음매로 블록을 밀면, 이번에는 위로 떨어져요.',
      '블록을 꼭대기 스위치에 올리고 잠긴 문으로', '아래로 민 것이 위에서 나타났다. 위와 아래는 같은 칸의 두 이름이었다.',
      ['시작 칸 북쪽 받침에 서야 블록을 이음매 쪽으로 밀 수 있어요.', '받침으로 가는 길은 고리 둘째 층에서 내려다보는 시점에 있어요.', '블록을 꼭대기 스위치까지 밀면 문이 열려요. 열쇠도 잊지 마세요.']),
    view: 2,
    faces: [...cellFaces('R', r.cells), P('N', 0, 0, -3, 1, 3, { tone: 'a3' }), P('Qw', 1, 0, -3, Q[0], 1, { tone: 'a3' }),
      P('K', ...K, 1, 2, { tone: 'a1' }), P('X', -3, 0, -3, 3, 1, { tone: 'a1' })],
    objects: [...r.stairs.map((s, i) => O('st' + i, 'stairs', s.at, { dir: s.dir })),
      O('b1', 'block', [1, 0, 0]), O('s1', 'switch', [4, 4, 6]), O('k1', 'key', [K[0], K[1], K[2] + 1]),
      O('d1', 'door', [-1, 0, -3], { when: ['s1'] }), O('d2', 'door', [-2, 0, -3], { key: 'k1' }), O('exit', 'exit', [-3, 0, -3])],
    decor: [...r.cells.filter(c => c[1] === 0).map(c => T(c[0], 0, c[2], 1, 1, 'a2')), T(0, 0, -3, Q[0] + 1, 1, 'a3'), T(0, 0, -2, 1, 2, 'a3'), T(...K, 1, 2, 'a1'), T(-3, 0, -3, 3, 1, 'a1'), roof(-2.5, 0.95, -2.5, 0.01, 0.01)],
    player: { at: [4, 1, 0], facing: '-x' },
  };
  if (write) save('ch4', st);
  return st;
}
run('fallUp43', fallUp43);

// 4-4 빛과 무게 — 블록을 이음매 너머 스위치로 올리면 빛을 막던 문이 열리고, 다른 시점으로 거울 탑에 건너 빛을 꺾어 다리를 띄워요
export function lightWeight44(vH = 0, vM = 1, dM = -2, write = true) {
  const H = via([3, 0, 1], '+x', vH, 2);             // S 동쪽 이음매 → 높은 탑 (스위치)
  const hEnd = [H[0] + 2, 2, H[2]];
  const MT = via([H[0] + 1, 2, H[2]], '+z', vM, dM);  // 높은 탑 가운데 남쪽 → 거울 탑의 북서 칸
  const mx = MT[0], mz = MT[2];
  const st = {
    ...meta('4-4', 4, '빛과 무게', 'Light and Weight', 6,
      '무게로 문을 열고, 시선으로 건너고, 빛으로 다리를 놓아요.',
      '빛을 수신기에 닿게 해 마지막 다리를 띄우기', '무게가 문을 열자 빛이 지나갔고, 빛이 닿은 곳에 길이 생겼다.',
      ['빛을 막는 문은 높은 탑의 스위치가 열어요.', '블록을 올린 뒤 그 탑에서 다른 시점으로 거울 탑에 건너가세요.', '거울을 돌려 빛을 남쪽 수신기로 보내세요.']),
    view: 1,
    faces: [
      P('S', 0, 0, 0, 4, 4), P('H', ...H, 3, 1, { tone: 'a1' }),
      P('MT', mx, 0, mz, 2, 3, { tone: 'a3' }), P('RT', mx + 1, 0, mz + 3, 1, 2, { tone: 'a1' }),
      P('GB', mx + 2, 0, mz + 3, 2, 1, { tone: 'a1', when: ['r1'] }), P('EX', mx + 4, 0, mz + 2, 2, 2, { tone: 'a3' }),
    ],
    objects: [
      O('src', 'source', [0, 0, 3], { dir: '+x' }), O('d1', 'door', [2, 0, 3], { when: ['sA'] }),
      O('b1', 'block', [1, 0, 1]), O('sA', 'switch', hEnd),
      O('m1', 'mirror', [mx + 1, 0, 3], { mirror: 0 }), O('r1', 'receptor', [mx + 1, 0, mz + 4]),
      O('exit', 'exit', [mx + 5, 0, mz + 2]),
    ],
    decor: [T(0, 0, 0, 4, 4), T(...H, 3, 1, 'a1'), T(mx, 0, mz, 2, 3, 'a3'), T(mx + 1, 0, mz + 3, 1, 2, 'a1'), T(mx + 4, 0, mz + 2, 2, 2, 'a3'), col(mx + 4.5, 0.02, mz + 4.5, 1.6, 'a2', 0.35), roof(mx + 4.5, 1.62, mz + 4.5, 0.8, 0.7)],
    player: { at: [0, 0, 0], facing: '+x' },
  };
  if (write) save('ch4', st);
  return st;
}
run('lightWeight44', lightWeight44);

// 4-5 두 개의 고리 — 시점0에서 닫히는 고리와 시점2에서 닫히는 고리(거울상). 첫 고리 꼭대기 블록을 이음매로 떨어뜨려 바닥 스위치를 누르면
// 둘째 고리로 가는 길이 열려요. 둘째 고리는 앞으로 오를 수 없고, 뒤로 걸어야 꼭대기의 열쇠에 닿아요
const LOOP = ['f+x', 'u+x', 'f+x', 'u+x', 'f+x', 'f+z', 'u+z', 'f+z', 'u+z', 'f+z', 'f-x', 'f-x', 'f-x', 'f-z', 'f-z'];
const mirrorSteps = st => st.map(s => s[0] + (s[1] === '+' ? '-' : '+') + s[2]);
export function twoLoops45(write = true) {
  const A = penrose([0, 0, 0], LOOP);                       // 시점0 고리: 꼭대기 (4,4,5)
  const bs = [-13, 0, -8];
  const B = penrose(bs, mirrorSteps(LOOP));                 // 시점2 고리: 꼭대기 (-17,4,-5)
  const bTop = B.last;
  const st = {
    ...meta('4-2', 2, '두 개의 고리', 'Twin Loops', 5,
      '두 개의 끝없는 계단이 서로 다른 방향에서 닫혀요. 하나가 닫혀 보일 때 다른 하나는 열려 있어요.',
      '둘째 고리의 열쇠로 첫 고리 꼭대기의 문 열기', '두 개의 무한은 서로를 보지 못했다. 그 사이를 걸어간 것은 작은 종이 인형뿐이었다.',
      ['첫 고리 꼭대기의 블록을 이음매로 떨어뜨리면 서쪽 길의 문이 열려요.', '둘째 고리의 계단은 꼭대기 스위치로만 열려요. 시작 칸에서 뒤로 걸어 보세요 — 다른 시점에서.', '열쇠를 가지고 첫 고리 꼭대기의 서쪽 문으로.']),
    view: 1,
    faces: [...cellFaces('A', A.cells), ...cellFaces('B', B.cells, 'a1'), P('W1', 1, 0, -8, 1, 8, { tone: 'a3' }), P('W2', -12, 0, -8, 13, 1, { tone: 'a3' }), P('EX', 2, 4, 6, 2, 1, { tone: 'a3' })],
    objects: [...A.stairs.map((s, i) => O('sa' + i, 'stairs', s.at, { dir: s.dir })), ...B.stairs.map((s, i) => O('sb' + i, 'stairs', s.at, { dir: s.dir })),
      O('b1', 'block', [4, 4, 6]), O('s1', 'switch', [0, 0, 0]), O('d1', 'door', [1, 0, -1], { when: ['s1'] }),
      O('s2', 'switch', bTop), O('dB', 'door', [bs[0] - 1, 0, bs[2]], { when: ['s2'] }),
      O('k1', 'key', [bTop[0], bTop[1], bTop[2] - 1]),
      O('d2', 'door', [3, 4, 6], { key: 'k1' }), O('exit', 'exit', [2, 4, 6])],
    decor: [...A.cells.filter(c => c[1] === 0).map(c => T(c[0], 0, c[2], 1, 1, 'a2')), ...B.cells.filter(c => c[1] === 0).map(c => T(c[0], 0, c[2], 1, 1, 'a2')),
      T(-12, 0, -8, 1, 1, 'a2'), T(-6, 0, -8, 1, 1, 'a2'), T(1, 0, -8, 1, 1, 'a2'), T(1, 0, -4, 1, 1, 'a2'), col(-6.5, 0.02, -7.5, 1.4, 'a1', 0.3), roof(-6.5, 1.42, -7.5, 0.6, 0.5)],
    player: { at: [1, 0, 0], facing: '+x' },
  };
  if (write) save('ch4', st);
  return st;
}
run('twoLoops45', twoLoops45);

// 4-6 불가능한 건축 — 세 구역이 한 줄로 이어진 마지막 건축물.
// 1막(빛과 무게, 좌우 뒤집힘) → 다리 → 2막(두 기둥, 앞뒤 뒤집힘, 열쇠) → 계단 → 3막(위로 떨어지는 블록) → 열쇠 문 → 출구
import { readFileSync } from 'node:fs';
import { district } from './lib.mjs';
const load = f => JSON.parse(readFileSync(new URL('../stages/' + f, import.meta.url)));
export function finale46(write = true) {
  const s44 = load('ch4/4-4.json'), s33 = load('ch3/3-3.json'), s43 = load('ch4/4-3.json');
  // 1막: 4-4 를 좌우로 뒤집어 서쪽에. 출구 대신 동쪽 끝 판(EX)에서 2막으로
  const A = district(s44, { mx: true, dx: 0, dz: 0, pre: 'a', drop: ['exit'] });
  const aEnd = A.cell([14, 0, 4]);                         // 원래 EX 의 (14,0,4)
  // 2막: 3-3 을 앞뒤로 뒤집어 1막 북쪽에. 출구 대신 C 탑에 열쇠
  const B = district({ ...s33, objects: [...s33.objects.filter(o => o.id !== 'exit'), { id: 'k1', type: 'key', at: [10, 0, 11] }] }, { mz: true, dx: aEnd[0] - 1, dz: aEnd[2] - 8, pre: 'b' });
  const bStart = B.cell([0, 0, 1]), bEnd = B.cell([14, 2, 9]);
  // 3막: 4-3 그대로 동쪽 멀리. 원래 열쇠 탑의 열쇠는 없애고 문은 2막 열쇠로
  const C = district({ ...s43, objects: s43.objects.filter(o => o.id !== 'k1').map(o => o.id === 'd2' ? { ...o, key: 'X_K' } : o) }, { dx: bEnd[0] + 10, dz: bEnd[2] + 6, pre: 'c' });
  for (const o of C.objects) if (o.key === 'cX_K') o.key = 'bk1';
  const cEntry = C.cell([-3, 0, -3]);                       // 3막 서쪽 끝(원래 출구 판 서쪽 끝)
  const faces = [...A.faces, ...B.faces, ...C.faces], creases = [...A.creases, ...B.creases, ...C.creases];
  const objects = [...A.objects, ...B.objects, ...C.objects], decor = [...A.decor, ...B.decor, ...C.decor];
  // 연결 1: 1막 끝 → 2막 시작 (땅 높이 길, 수신기가 켜져 있어야 보이는 다리)
  const link = (id, a, b, tone, when) => { // 같은 높이 두 칸을 ㄱ자 길로 (x 먼저, 그다음 z)
    const out = [], y = a[1];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    if (x1 > x0) out.push(P(id + 'x', x0, y, a[2], x1 - x0 + 1, 1, { tone, ...(when ? { when } : {}) }));
    const z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
    if (z1 > z0) out.push(P(id + 'z', b[0], y, z0 + (b[2] > a[2] ? 1 : 0), 1, z1 - z0, { tone, ...(when ? { when } : {}) }));
    return out;
  };
  const st = {
    ...meta('4-6', 6, '불가능한 건축', 'Impossible Architecture', 6,
      '지금까지 배운 모든 것이 하나의 건축물로 이어져 있어요. 빛, 무게, 기둥, 끝없는 계단.',
      '세 개의 건축을 지나 마지막 문으로', '모든 길은 처음부터 거기 있었다. 다만 접혀 있었고, 가려져 있었고, 다른 쪽에서 보아야 했을 뿐. — 끝',
      ['첫 건축: 무게로 문을 열고 빛으로 다리를 놓아요.', '둘째 건축: 기둥 뒤 길은 돌아올 수 없어요. 떠나기 전에 날개를 접어 두세요. 열쇠는 마지막 탑에 있어요.', '셋째 건축: 블록을 끝없는 계단의 이음매로 밀어 위로 떨어뜨리세요.']),
    view: A.viewm(s44.view), faces, creases, objects, decor,
    hidden: [...A.hidden, ...B.hidden, ...C.hidden],
    player: { at: A.cell([0, 0, 0]), facing: '-x' },
    _pts: { aEnd, bStart, bEnd, cEntry },
  };
  // 연결 1: 1막 끝 판(EX) 북쪽 → 2막 시작 판 남쪽 (빛이 수신기에 닿아 있을 때만 나타나는 다리)
  st.faces.push(P('L1', aEnd[0], 0, bStart[2] + 1, 1, aEnd[2] - bStart[2] - 1, { tone: 'a1', when: ['ar1'] }));
  // 연결 2: 2막 끝(레벨2) 동쪽 → 계단 둘로 내려가 → 땅 길 → 3막 땅 길 동쪽 끝
  const [ex, , ez] = bEnd, qEnd = C.cell([5, 0, -3]);
  st.faces.push(P('L2a', ex + 1, 1, ez, 2, 1, { tone: 'a2' }), P('L2b', ex + 3, 0, ez, qEnd[0] - ex - 2, 1, { tone: 'a2' }), P('L2c', qEnd[0], 0, ez + 1, 1, qEnd[2] - ez - 1, { tone: 'a2' }));
  st.objects.push(O('ls1', 'stairs', [ex + 1, 1, ez], { dir: '-x' }), O('ls2', 'stairs', [ex + 3, 0, ez], { dir: '-x' }));
  st.decor.push(tower(ex + 1, 1, ez, 2, 1, -5, 'a2'), tower(qEnd[0], 0, ez, 1, 1, -5, 'a2'));
  delete st._pts;
  if (write) save('ch4', st);
  return st;
}
run('finale46', finale46);

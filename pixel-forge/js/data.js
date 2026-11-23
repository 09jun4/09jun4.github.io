// data.js — 픽셀 포지 게임 데이터·확률표 (밸런스는 모두 여기서 조절)
'use strict';
const PF = window.PF = {};

// ---- 장비 10등급 -------------------------------------------------------
PF.TIERS = [
  { name: '나무',   pal: ['#d8a368', '#9a6232', '#52301a'] },
  { name: '돌',     pal: ['#c4c4cc', '#84848e', '#4a4a54'] },
  { name: '청동',   pal: ['#f0b070', '#c0742e', '#723c16'] },
  { name: '철',     pal: ['#e8edf4', '#a4aebb', '#5a6474'] },
  { name: '강철',   pal: ['#b0dcff', '#5a9ad8', '#2a4a80'] },
  { name: '미스릴', pal: ['#c4fff4', '#40d8c0', '#1a7a70'] },
  { name: '룬',     pal: ['#e0bcff', '#9a5ae0', '#4a2a80'] },
  { name: '용',     pal: ['#ffac8c', '#e8442c', '#801a14'] },
  { name: '심연',   pal: ['#a090c4', '#4a3470', '#1c0e30'] },
  { name: '신성',   pal: ['#fffac0', '#ffc83a', '#c07a10'] },
];

// 대장간 레벨별 등급 확률(%). 등급 t는 레벨 UNLOCK[t]부터 나오고, 위 4등급만 남아요.
// 신성(최고 등급)은 해금 레벨부터 0.5%, 레벨마다 +0.5% (최대 20%).
const UNLOCK = [1, 2, 4, 7, 10, 13, 17, 21, 26, 31];
PF.forgeRates = function (L) {
  const un = [];
  for (let t = 0; t < 10; t++) if (L >= UNLOCK[t]) un.push(t);
  const w = new Array(10).fill(0), top = un.length - 1;
  un.forEach((t, i) => {
    const r = top - i;
    if (r >= 4) return;
    let x = Math.min(1 + L - UNLOCK[t], 6); x *= x;
    if (r === 3) x *= 0.25; else if (r === 2) x *= 0.6;
    w[t] = x;
  });
  let fixed = 0;
  if (L >= UNLOCK[9]) { fixed = Math.min(0.5 + 0.5 * (L - UNLOCK[9]), 20); w[9] = 0; }
  const s = w.reduce((a, b) => a + b, 0);
  const out = w.map(x => x / s * (100 - fixed));
  if (fixed) out[9] = fixed;
  return out;
};
// 대장간 레벨업: 왕관을 한 번 낼 때마다 게이지 1칸, 10칸이면 레벨업
PF.FORGE_STEPS = 10;
PF.forgeStepCost = L => Math.round(12 * Math.pow(1.36, Math.min(L, 35)) * Math.pow(1.08, Math.max(0, L - 35)));
PF.FORGE_MAX = 100; // 대장간도 Lv.100에서 승천
// 승천하면 레벨·확률은 처음으로 돌아가지만, 승천 뒤에 얻는 것은 한 세대 위예요:
// 승천 후 3번째 등급 = 승천 전 최고 등급이 되도록 배율을 맞춰요.
PF.itemAscMul = a => Math.pow(3.2, 7 * (a || 0));  // 장비: 등급당 ×3.2, 7등급 차이(청동↔신성) ≈ ×3436
PF.skillAscMul = a => Math.pow(200 / 12, a || 0); // 스킬: 신화 보유효과(200) / 서사시(12) ≈ ×16.7
PF.petAscMul = a => Math.pow(10 / 1.2, a || 0);   // 펫: 신화 공격(10) / 서사시(1.2) ≈ ×8.3

// ---- 장비 슬롯 9칸 ------------------------------------------------------
// main: 주 능력치(atk/hp/both), w: 등급 안에서 그 슬롯이 나올 가중치(무기·탈것 1, 투구 1.5, 나머지 3)
PF.SLOTS = [
  { id: 'helm',   name: '투구',   main: 'hp',   w: 1.5, vars: [['투구', 'helm'], ['두건', 'hood']] },
  { id: 'armor',  name: '갑옷',   main: 'hp',   w: 3,   vars: [['갑옷', 'armor'], ['로브', 'robe']] },
  { id: 'glove',  name: '장갑',   main: 'atk',  w: 3,   vars: [['장갑', 'glove'], ['건틀릿', 'gauntlet']] },
  { id: 'neck',   name: '목걸이', main: 'atk',  w: 3,   vars: [['목걸이', 'neck'], ['부적', 'amulet']] },
  { id: 'ring',   name: '반지',   main: 'atk',  w: 3,   vars: [['반지', 'ring'], ['인장', 'ring2']] },
  { id: 'weapon', name: '무기',   main: 'atk',  w: 1,   vars: [['검', 'sword'], ['도끼', 'axe'], ['지팡이', 'staff']] },
  { id: 'boots',  name: '신발',   main: 'hp',   w: 3,   vars: [['장화', 'boots'], ['부츠', 'boots2']] },
  { id: 'belt',   name: '벨트',   main: 'hp',   w: 3,   vars: [['벨트', 'belt'], ['허리띠', 'belt2']] },
  { id: 'mount',  name: '탈것',   main: 'both', w: 1,   vars: [['군마', 'horse'], ['전투 늑대', 'wolfmount']] },
];
PF.slotById = {}; PF.SLOTS.forEach((s, i) => { s.i = i; PF.slotById[s.id] = s; });

// 등급 안의 아이템 목록 (슬롯×변형). p = 등급 안에서의 비율
PF.tierItems = function () {
  const list = [];
  PF.SLOTS.forEach(s => s.vars.forEach((v, vi) => list.push({ slot: s.id, v: vi, name: v[0], icon: v[1], w: s.w / s.vars.length })));
  const sum = list.reduce((a, b) => a + b.w, 0);
  list.forEach(x => { x.p = x.w / sum; });
  return list;
};
PF.ITEMS = PF.tierItems();

// 부가 옵션 2개: 등급이 높을수록 범위가 커져요 (값 = [max*0.5, max] 사이 랜덤)
PF.SUBS = [
  { id: 'critC', name: '치명타 확률', max: t => 2 + t * 1.2 },
  { id: 'critD', name: '치명타 피해', max: t => 10 + t * 8 },
  { id: 'spd',   name: '공격 속도',   max: t => 3 + t * 2.5 },
  { id: 'leech', name: '생명력 흡수', max: t => 1 + t * 0.6 },
  { id: 'atkP',  name: '공격력',      max: t => 5 + t * 6 },
  { id: 'hpP',   name: '체력',        max: t => 5 + t * 6 },
  { id: 'skillP', name: '스킬 피해',  max: t => 8 + t * 7 },
];
PF.subById = {}; PF.SUBS.forEach(s => { PF.subById[s.id] = s; });

PF.itemMaxLvl = L => Math.min(100, 3 + L * 3);
PF.mainValue = function (slot, tier, lvl) {
  const atk = 5 * Math.pow(3.2, tier) * (1 + lvl * 0.08);
  const m = PF.slotById[slot].main;
  if (m === 'atk') return { atk: Math.round(atk), hp: 0 };
  if (m === 'hp') return { atk: 0, hp: Math.round(atk * 8) };
  return { atk: Math.round(atk * 0.5), hp: Math.round(atk * 4) };
};
PF.sellPrice = it => Math.round(3 * Math.pow(2.2, it.tier) * (1 + it.lvl / 10) * PF.itemAscMul(it.asc));

// ---- 스킬·펫 6희귀도 ----------------------------------------------------
PF.RAR = [
  { name: '일반', col: '#d0d0d0' },
  { name: '희귀한', col: '#5ad8ff' },
  { name: '서사시', col: '#5aff8a' },
  { name: '전설', col: '#fff05a' },
  { name: '궁극의', col: '#ff5a5a' },
  { name: '신화', col: '#d65aff' },
];
// 소환 레벨 1 → 100 확률. 상위 희귀도는 정해진 레벨부터 나오기 시작해요.
const SUM_START = [70, 25, 5, 0, 0, 0];
const SUM_APPEAR = [0, 0, 0, 8, 25, 45];
function sumRates(L, end) {
  const t = (L - 1) / 99;
  const w = end.map((e, r) => r < 3 ? SUM_START[r] + (e - SUM_START[r]) * t
    : e * Math.max(0, Math.min(1, (L - SUM_APPEAR[r]) / (100 - SUM_APPEAR[r]))));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / s * 100);
}
PF.skillRates = L => sumRates(L, [12, 13, 15, 20, 26, 14]);
PF.petRates = L => sumRates(L, [15, 15, 15, 15, 15, 25]);
PF.SUM_MAX = 100;
PF.sumNeed = L => 10 + L;               // 다음 소환 레벨까지 필요한 소환 횟수
PF.shardNeed = lvl => Math.min(8, 1 + Math.floor(lvl / 10)); // 중복 조각 → 레벨업
PF.MAX_LVL = 100;
PF.SKILL_COST = 38;
PF.PET_COST = 100;

// 스킬 18종: kind = dmg(단일), multi(연타), aoe(전체), heal, buff
PF.SKILLS = [
  { id: 'slash',   r: 0, name: '회전 베기',   icon: 'sk_slash',   kind: 'aoe',   mult: 3,   cd: 6,  fx: '#ffffff' },
  { id: 'rock',    r: 0, name: '돌 던지기',   icon: 'sk_rock',    kind: 'dmg',   mult: 3.5, cd: 5,  fx: '#a08060' },
  { id: 'aid',     r: 0, name: '응급 치료',   icon: 'sk_heal',    kind: 'heal',  mult: 0.15, cd: 10, fx: '#80ff80' },
  { id: 'arrows',  r: 1, name: '화살비',      icon: 'sk_arrow',   kind: 'multi', mult: 1.6, hits: 4, cd: 7, fx: '#e0c080' },
  { id: 'fireball', r: 1, name: '불꽃탄',     icon: 'sk_fire',    kind: 'dmg',   mult: 6,   cd: 7,  fx: '#ff8030' },
  { id: 'guard',   r: 1, name: '철벽',        icon: 'sk_shield',  kind: 'buff',  buff: 'guard', val: 0.5, dur: 5, cd: 12, fx: '#a0c0ff' },
  { id: 'bolt',    r: 2, name: '번개',        icon: 'sk_bolt',    kind: 'dmg',   mult: 9,   cd: 8,  fx: '#fff060' },
  { id: 'icespear', r: 2, name: '얼음창',     icon: 'sk_ice',     kind: 'aoe',   mult: 6,   cd: 8,  fx: '#80e0ff' },
  { id: 'rage',    r: 2, name: '광폭화',      icon: 'sk_rage',    kind: 'buff',  buff: 'atk', val: 0.5, dur: 6, cd: 12, fx: '#ff4040' },
  { id: 'meteor',  r: 3, name: '메테오',      icon: 'sk_meteor',  kind: 'aoe',   mult: 12,  cd: 10, fx: '#ff6020' },
  { id: 'cyclone', r: 3, name: '회오리',      icon: 'sk_wind',    kind: 'multi', mult: 2.5, hits: 6, cd: 9, fx: '#c0ffe0' },
  { id: 'vamp',    r: 3, name: '흡혈 오라',   icon: 'sk_vamp',    kind: 'buff',  buff: 'leech', val: 0.2, dur: 8, cd: 14, fx: '#c02040' },
  { id: 'breath',  r: 4, name: '용의 숨결',   icon: 'sk_breath',  kind: 'aoe',   mult: 18,  cd: 11, fx: '#ff9020' },
  { id: 'thunder', r: 4, name: '천둥 망치',   icon: 'sk_hammer',  kind: 'dmg',   mult: 25,  cd: 10, fx: '#ffff80' },
  { id: 'warcry',  r: 4, name: '전쟁 함성',   icon: 'sk_cry',     kind: 'buff',  buff: 'atk', val: 1, dur: 8, cd: 15, fx: '#ffa040' },
  { id: 'holy',    r: 5, name: '성검 강림',   icon: 'sk_holy',    kind: 'aoe',   mult: 40,  cd: 12, fx: '#fff8c0' },
  { id: 'hole',    r: 5, name: '블랙홀',      icon: 'sk_hole',    kind: 'multi', mult: 6,   hits: 10, cd: 13, fx: '#a040ff' },
  { id: 'angel',   r: 5, name: '수호천사',    icon: 'sk_angel',   kind: 'heal',  mult: 0.5, invul: 3, cd: 18, fx: '#ffffff' },
];
PF.skillById = {}; PF.SKILLS.forEach(s => { PF.skillById[s.id] = s; });
// 스킬 보유 효과(기본 피해·체력)와 레벨 배율
PF.SKILL_PASSIVE = [2, 5, 12, 30, 75, 200];
PF.skillLvlMul = lvl => 1 + lvl * 0.03;

// 펫 18종. shape = 스프라이트 모양, tint = 몸 색
PF.PETS = [
  { id: 'mouse',   r: 0, name: '들쥐',       shape: 'p_rodent', tint: ['#c8b8a8', '#8a7868', '#4a3c30'] },
  { id: 'sparrow', r: 0, name: '참새',       shape: 'p_bird',   tint: ['#d8b088', '#9a6a40', '#503418'] },
  { id: 'slimey',  r: 0, name: '꼬마 슬라임', shape: 'p_slime', tint: ['#a0f0a0', '#50b050', '#205820'] },
  { id: 'wolf',    r: 1, name: '회색 늑대',   shape: 'p_wolf',   tint: ['#c8ccd8', '#808898', '#40465a'] },
  { id: 'owl',     r: 1, name: '올빼미',     shape: 'p_bird',   tint: ['#e8d0a0', '#b08850', '#604020'] },
  { id: 'turtle',  r: 1, name: '바위 거북',   shape: 'p_turtle', tint: ['#a8d888', '#689848', '#344c20'] },
  { id: 'firefox', r: 2, name: '불여우',     shape: 'p_cat',    tint: ['#ffc070', '#f07020', '#802808'] },
  { id: 'griffin', r: 2, name: '그리핀',     shape: 'p_bird',   tint: ['#fff0b0', '#d0a040', '#705010'] },
  { id: 'golem',   r: 2, name: '골렘',       shape: 'p_golem',  tint: ['#d0c0a8', '#988470', '#504438'] },
  { id: 'unicorn', r: 3, name: '유니콘',     shape: 'p_horse',  tint: ['#ffffff', '#d8d0f0', '#8878b8'] },
  { id: 'phoenix', r: 3, name: '불사조',     shape: 'p_bird',   tint: ['#fff080', '#ff8020', '#b02010'] },
  { id: 'frostw',  r: 3, name: '서리 늑대',   shape: 'p_wolf',   tint: ['#e0faff', '#80d0f0', '#3070a0'] },
  { id: 'wyvern',  r: 4, name: '와이번',     shape: 'p_dragon', tint: ['#a0e0a0', '#40a060', '#185030'] },
  { id: 'panther', r: 4, name: '그림자 표범', shape: 'p_cat',    tint: ['#9080b0', '#4a3a6a', '#1a1030'] },
  { id: 'crystal', r: 4, name: '수정 골렘',   shape: 'p_golem',  tint: ['#d0f8ff', '#70c8f0', '#2a6aa0'] },
  { id: 'dragon',  r: 5, name: '고룡',       shape: 'p_dragon', tint: ['#80a8ff', '#3858d8', '#182a78'] },
  { id: 'celest',  r: 5, name: '천상조',     shape: 'p_bird',   tint: ['#ffffff', '#ffd8f8', '#c080e0'] },
  { id: 'tiger',   r: 5, name: '빙하 호랑이', shape: 'p_cat',    tint: ['#f0ffff', '#a0f0ff', '#3090b0'] },
];
PF.petById = {}; PF.PETS.forEach(p => { PF.petById[p.id] = p; });
PF.PET_MULT = [0.3, 0.6, 1.2, 2.5, 5, 10];   // 펫 공격 = 영웅 공격력 × 배율
PF.PET_PASSIVE = [0.2, 0.4, 0.8, 1.6, 3.2, 6.4]; // 보유 효과: 레벨당 피해 +%
// 펫 강화 재료: 같은 등급의 알 1개 = +1레벨, 장착하지 않은 펫 = +그 펫 레벨
PF.matGain = petLvl => petLvl == null ? 1 : Math.max(1, petLvl);
// 알 부화 시간(초): 3초 → 2분
PF.HATCH_SEC = [3, 10, 20, 40, 75, 120];
PF.SLOT_MAX = 5;
PF.slotCost = n => [0, 0, 5000, 60000, 600000][n]; // n번째(0부터) 부화 슬롯 가격(왕관)

// ---- 스테이지 ------------------------------------------------------------
PF.DIFFS = ['쉬움', '보통', '어려움', '악몽', '지옥'];
PF.CHAPTERS = 10;
PF.STAGES = 5;
PF.WAVES = 3;
PF.stageIndex = st => st.d * PF.CHAPTERS * PF.STAGES + (st.c - 1) * PF.STAGES + (st.s - 1);
PF.enemyHp = g => 22 * Math.pow(1.13, g);
PF.enemyAtk = g => 3 * Math.pow(1.12, g);
PF.killCrowns = g => Math.round(4 * Math.pow(1.105, g));

// ---- 던전 (좀비 러시 제외) ----------------------------------------------
PF.KEYS_PER_DAY = 5;        // 테스트용으로 넉넉하게
PF.KEY_RESET_HOUR = 9;      // 매일 09:00 충전
PF.DUNGEONS = [
  { id: 'thief', name: '망치 도둑', icon: 'hammer', time: 25,
    desc: '도망치는 도둑을 시간 안에 쓰러뜨리세요',
    reward: l => ({ hammers: 30 + l * 12, crowns: Math.round(150 * Math.pow(1.22, l)) }) },
  { id: 'ghost', name: '유령 마을', icon: 'ticket', time: 30,
    desc: '제한 시간 안에 유령 왕을 처치하세요',
    reward: l => ({ tickets: 60 + l * 22 }) },
  { id: 'invade', name: '침략', icon: 'egg', time: 40,
    desc: '몰려오는 적을 40초 동안 버텨내세요',
    reward: l => ({ eggs: 100 + l * 30 }) },
];
PF.dungeonById = {}; PF.DUNGEONS.forEach(d => { PF.dungeonById[d.id] = d; });
PF.dungeonLabel = l => (Math.floor(l / 5) + 1) + '-' + (l % 5 + 1);
PF.dungeonPower = l => 4 + l * 3; // 던전 레벨 → 적 강함(스테이지 인덱스 기준)

// ---- 숫자 표기 ------------------------------------------------------------
PF.fmt = function (n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const u = ['k', 'm', 'b', 't', 'aa', 'ab', 'ac', 'ad'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return parseFloat(n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + u[i];
};
PF.pct = (x, d) => x.toFixed(d == null ? 2 : d) + '%';

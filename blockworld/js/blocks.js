// Block + item registry, recipes, smelting
'use strict';
const BLOCKS = [null]; // id 0 = air
const BID = { air: 0 };
const ITEMS = {};      // id -> item def (blocks share ids)
const IID = {};        // name -> id
const DYES = [
  ['white', '흰색', '#E9ECEC', '#CFD5D6', '#D1B2A1'], ['orange', '주황색', '#F07613', '#E06100', '#A15325'],
  ['magenta', '자홍색', '#BD44B3', '#A9309F', '#95576C'], ['light_blue', '하늘색', '#3AAFD9', '#2389C6', '#706C8A'],
  ['yellow', '노란색', '#F8C627', '#F0AF15', '#BA8523'], ['lime', '연두색', '#70B919', '#5EA818', '#677534'],
  ['pink', '분홍색', '#ED8DAC', '#D5658E', '#A04D4E'], ['gray', '회색', '#3E4447', '#36393D', '#392A23'],
  ['light_gray', '회백색', '#8E8E86', '#7D7D73', '#876A61'], ['cyan', '청록색', '#158991', '#157788', '#575B5B'],
  ['purple', '보라색', '#792AAC', '#64209C', '#764656'], ['blue', '파란색', '#35399D', '#2C2E8F', '#4A3B5B'],
  ['brown', '갈색', '#724728', '#603B1F', '#4D3323'], ['green', '초록색', '#546D1B', '#495B24', '#4C532A'],
  ['red', '빨간색', '#A12722', '#8E2020', '#8F3D2E'], ['black', '검은색', '#141519', '#080A0F', '#251610'],
];
const CAT = { BUILD: '건축', NATURE: '자연', COLOR: '색상', FUNC: '기능', PLANT: '식물', ORE: '광물', TOOL: '도구', FOOD: '음식', MISC: '재료' };

// shape: cube | cross | liquid | box | pane
function B(name, ko, tex, o = {}) {
  const id = BLOCKS.length;
  const t = typeof tex === 'function' ? { all: tex } : tex;
  const faces = {};
  const resolve = (k, fn) => (typeof fn === 'number' ? fn : TEX.add(name + '_' + k, fn));
  if (t.anim) { const a = TEX.addAnim(name, t.anim[0], t.anim[1], t.anim[2]); faces.top = faces.bottom = faces.side = faces.front = a; }
  else {
    const all = t.all !== undefined ? resolve('all', t.all) : null;
    faces.side = t.side !== undefined ? resolve('side', t.side) : all;
    faces.top = t.top !== undefined ? resolve('top', t.top) : (all !== null ? all : faces.side);
    faces.bottom = t.bottom !== undefined ? resolve('bottom', t.bottom) : faces.top;
    faces.front = t.front !== undefined ? resolve('front', t.front) : faces.side;
  }
  const def = Object.assign({
    id, name, ko, faces, shape: 'cube', hard: 1, tool: null, tier: -1, req: false, light: 0,
    solid: true, opacity: 15, render: 'solid', gravity: false, sound: 'stone', cat: CAT.BUILD,
    drop: name, replaceable: false, tint: false, liquid: false,
  }, o);
  if (def.shape === 'cross') { def.solid = o.solid ?? false; def.opacity = 0; def.render = 'cutout'; def.replaceable = o.replaceable ?? false; }
  if (def.render !== 'solid' && o.opacity === undefined && def.shape !== 'cross') def.opacity = 0;
  if (def.shape === 'box' && o.opacity === undefined) def.opacity = 0;
  BLOCKS.push(def); BID[name] = id;
  if (!o.noItem) { ITEMS[id] = { id, name, ko, block: id, stack: 64, cat: def.cat }; IID[name] = id; }
  return def;
}
let nextItemId = 1000;
function I(name, ko, texFn, o = {}) {
  const id = nextItemId++;
  const tex = TEX.add('item_' + name, texFn);
  ITEMS[id] = Object.assign({ id, name, ko, tex, stack: 64, cat: CAT.MISC }, o);
  IID[name] = id;
  return ITEMS[id];
}

// ---------------- pixel templates for items ----------------
const T = {
  ingot: ['', '', '', '', '.......ooooooo..', '.....ooaaaaaabo.', '...ooaaaaaaabbo.', '.ooaaaaaaabbbco.', 'oabbbbbbbbbbcco.', 'obbbbbbbbbbccoo.', 'occcccccccccoo..', '.oooooooooooo...'],
  gem: ['', '', '....oooooooo....', '...oaaaabbbbo...', '..oaaaabbbbbbo..', '.oaaaabbbbbbbco.', '.obbbbbbbbbbcco.', '..obbbbbbbbcco..', '...obbbbbbcco...', '....obbbbcco....', '.....obbcco.....', '......occo......', '.......oo.......'],
  dust: ['', '', '', '', '', '........a.......', '......aab.a.....', '.....abbbb......', '...a.bbbcbb.....', '....abbcbbbbb...', '...abbbbbcbbbb..', '..abbcbbbbbbcb..', '..bbbbbcbbbbbbb.', '...cccccccccccc.'],
  nugget: ['', '', '', '', '', '', '......oooo......', '.....oaabbo.....', '....oaabbbbo....', '....obbbbbco....', '.....occcco.....', '......oooo......'],
  raw: ['', '', '', '.....oooo.......', '....oaabbo.oo...', '...oaabbbboabo..', '..oaabbbbbbbbo..', '..obbbcbbbbbbbo.', '.oabbbbbbcbbbco.', '.obbcbbbbbbbcco.', '.obbbbbbbbbccco.', '..occbbbbcccco..', '...occcccccoo...', '....oooooooo....'],
  sphere: ['', '', '', '', '......oooo......', '....ooaabboo....', '...oaaabbbbbo...', '...oaabbbbbbo...', '..oabbbbbbbbbo..', '..obbbbbbbbbco..', '...obbbbbbbcco..', '...obbbbbbccco..', '....ooccccoo....', '......oooo......'],
  drop: ['', '', '.......oo.......', '......oaao......', '......oabo......', '.....oaabbo.....', '.....oabbbo.....', '....oaabbbbo....', '....oabbbbco....', '....obbbbbco....', '....obbbbcco....', '.....obbcco.....', '......oooo......'],
  rod: ['', '.............oo.', '............oabo', '...........oabo.', '..........oabo..', '.........oabo...', '........oabo....', '.......oabo.....', '......oabo......', '.....oabo.......', '....oabo........', '...oabo.........', '..oabo..........', '.oabo...........', '.ooo............'],
  sheet: ['', '', '..oooooooooooo..', '..oaaaaaaaaaab..', '..oabbbbbbbbbo..', '..oaaaaaaaaaab..', '..oabbbbbbbbbo..', '..oaaaaaaaaaab..', '..oabbbbbbbbbo..', '..oaaaaaaaaaab..', '..oabbbbbbbbbo..', '..oaaaaaaaaaab..', '..oooooooooooo..'],
  hide: ['', '', '...oo.....oo....', '..oaaoooooaao...', '..oaaaaaaaaabo..', '...oaabbbbabo...', '...oabbbbbbbo...', '...oabbbcbbbo...', '...oabbbbbbbo...', '..oaabbbbbcbbo..', '..oabbbbbbbcbo..', '..ooo.oooo.ooo..'],
  book: ['', '', '...ooooooooooo..', '..oaaaaaaaaaaco.', '..oabbbbbbbbbco.', '..oabbbbbbbbbco.', '..oabbbddbbbbco.', '..oabbbddbbbbco.', '..oabbbbbbbbbco.', '..oabbbbbbbbbco.', '..oabbbbbbbbbco.', '..owwwwwwwwwwwo.', '..ooooooooooooo.'],
  bucket: ['', '', '', '...oooooooooo...', '..oaawwwwwwbbo..', '..obwwwwwwwwco..', '..oaaaaaaaabco..', '...oaaaaaabco...', '...oaaaaaabco...', '...oaaaaaabco...', '....oaaaabco....', '....oaaaabco....', '.....oooooo.....'],
  meat: ['', '', '', '.....oooooo.....', '....oaaaaaao....', '...oaabbbbbbo...', '..oaabbbbbbbbo..', '..oabbbcbbbbbo..', '..obbbbbbcbbbo..', '..obbbbbbbbbbwo.', '...obbbbbbbbwwo.', '....oooooooowwo.', '............oo..'],
  drumstick: ['', '', '......ooooo.....', '.....oaaaabo....', '....oaabbbbbo...', '....oabbbbbbo...', '....obbbbbbco...', '.....obbbbcco...', '......obbcco....', '.......owwo.....', '......owwo......', '.....owwo.......', '....oowwo.......', '....oooo........'],
  bread: ['', '', '', '', '', '...ooooooooo....', '..oaaaaaaaaaoo..', '.oaabbabbabbbbo.', '.oabbbbbbbbbbbo.', '.obbbbbbbbbbbco.', '..occcccccccco..', '...oooooooooo...'],
  apple: ['', '', '.......d........', '.......dll......', '....ooooooooo...', '...oaaabbbbbbo..', '..oaabbbbbbbbbo.', '..oabbbbbbbbbbo.', '..obbbbbbbbbbco.', '..obbbbbbbbbbco.', '...obbbbbbbbco..', '...obbbbbbbcco..', '....occccccco...', '.....ooo.ooo....'],
  carrot: ['', '.........ll.l...', '........llll....', '.........ll.....', '........oaao....', '.......oabbo....', '......oabbo.....', '......obbbo.....', '.....oabbo......', '.....obbo.......', '....oabbo.......', '....obbo........', '...obbo.........', '...ooo..........'],
  potato: ['', '', '', '', '.....oooooo.....', '....oaaaabbo....', '...oaabbbbbbo...', '..oabbbbcbbbbo..', '..obbbcbbbbbbo..', '..obbbbbbbbcbo..', '...obbbbbbbco...', '....occcccco....', '.....oooooo.....'],
  slice: ['', '', '', '', '', '', '..oooooooooooo..', '..orrdrrrdrrro..', '...orrrrrdrro...', '....orrrrrro.....', '.....ogggggo....', '......oggo......', '.......oo.......'],
  berries: ['', '', '', '.......l........', '......ll........', '.....l..l.......', '....oo...oo.....', '...oabo.oabo....', '...obco.obco....', '....oo.oo.oo....', '......oabooabo..', '......obco.obco.', '.......oo...oo..'],
  bowl: ['', '', '', '', '', '', '..oooooooooooo..', '..owwwwwwwwwwo..', '..oaaaaaaaaabo..', '...oaaaaaaabo...', '....oaaaaabo....', '.....oooooo.....'],
  feather: ['', '.............oo.', '...........ooaao', '.........ooaabo.', '........oaabbo..', '.......oaabbo...', '......oaabbo....', '.....oaabbo.....', '....oaabbo......', '....oabbo.......', '...oabbo........', '...ooo..........', '..oo............', '.oo.............'],
  string: ['', '', '..........oo....', '.........o..o...', '........o.......', '.......o........', '......o.........', '.....o..........', '....o...........', '....o...........', '.....o..........', '......o.........', '.......oo.......'],
  bone: ['', '.............oo.', '...........ooaao', '............oabo', '...........oabo.', '..........oabo..', '.........oabo...', '........oabo....', '.......oabo.....', '......oabo......', '.....oabo.......', '.oo.oabo........', 'oaaoabo.........', 'oabbbo..........', '.oabo...........', '.oo.............'],
  seeds: ['', '', '', '', '', '', '......a...b.....', '....b...a.....a.', '..a...b....b....', '.....a...a...b..', '...b...b.....a..', '.....a....b.....'],
  wheat: ['', '.......a........', '......aba.......', '.......a.a......', '....a.aba.......', '...aba.a.a......', '....a.aba.......', '.....a.a........', '......ll........', '......ll........', '.....l.ll.......', '....l..l.l......', '...l...l..l.....', '.......l........'],
  shard: ['', '', '.........oo.....', '........oaao....', '.......oaabo....', '......oaabbo....', '.....oaabbo.....', '....oaabbo......', '...oaabbo.......', '...oabbo........', '...obbo.........', '....oo..........'],
  scrap: ['', '', '', '', '....oooooo......', '...oaabbbbo.....', '..oabbcbbbboo...', '..obbbbbbcbbbo..', '.oabbcbbbbbbbo..', '.obbbbbbbcbbco..', '..obbcbbbbbcco..', '...occcccccco...', '....oooooooo....'],
  flint: ['', '', '', '.......oo.......', '......oaao......', '.....oaabbo.....', '....oaabbbbo....', '....oabbbbbo....', '...oabbbcbbbo...', '...obbbbbbbbo...', '...obbbbbbbco...', '....obbbbcco....', '.....oooooo.....'],
  eye: ['', '', '', '', '......oooo......', '....ooaabboo....', '...oaaabbbbbo...', '...oabbddbbbo...', '..oabbdkkdbbbo..', '..obbbdkkdbbco..', '...obbbddbbcco..', '...obbbbbbccco..', '....ooccccoo....', '......oooo......'],
  flintsteel: ['', '', '..oooo..........', '.oaaaao.........', '.oa..ao.........', '.oa..ao.........', '.oaaaao.........', '..ooooo.........', '.........oooo...', '........offffo..', '.......offggfo..', '.......ofgggfo..', '........offfo...', '.........ooo....'],
  shears: ['', '', '', '...........oo...', '..........oaao..', '.........oaao...', '....oo..oaao....', '...oaao.oao.....', '....oaaoao......', '.....oaao.......', '....ookkoo......', '...okko.okko....', '...okko..okko...', '....oo....oo....'],
  arrow: ['', '...........oooo.', '...........oaao.', '..........oaaao.', '.........oaao.o.', '........obo.....', '.......obo......', '......obo.......', '.....obo........', '....obo.........', '.ffobo..........', '.ffoo...........', '..fff...........', '...ff...........'],
  stew: ['', '', '', '', '', '...oooooooooo...', '..obbbcbbbcbbo..', '..owwwwwwwwwwo..', '..oaaaaaaaaabo..', '...oaaaaaaabo...', '....oaaaaabo....', '.....oooooo.....'],
  cookie: ['', '', '', '', '.....oooooo.....', '....obbbbbbo....', '...obbdbbbdbo...', '...obbbbbbbbo...', '...obdbbbdbbo...', '...obbbbbbbbo...', '....obbbdbbo....', '.....oooooo.....'],
  slime: ['', '', '', '', '......oooo......', '....ooaaaaoo....', '...oaaabbbbbo...', '...oaabbbbbbo...', '..oabbkbbkbbbo..', '..obbbbbbbbbco..', '...obbbbbbbcco..', '...obbbbbbccco..', '....ooccccoo....', '......oooo......'],
};
const HEADS = {
  pickaxe: ['', '...ooooooo......', '..ohhhhhhhoo....', '...oHHHHHHHHo...', '....ooooo.oHHo..', '...........oHo..', '...........oHHo.', '............oHo.', '............oHo.', '............oHo.', '............oHo.', '.............o..'],
  axe: ['', '......oooo......', '.....ohhhHo.....', '....ohhhHHHo....', '....ohhHHHHHo...', '.....oHHHHHHo...', '......oHHHHo....', '.......oHHo.....', '........oo......'],
  shovel: ['', '...........ooo..', '..........ohhho.', '.........ohhhHo.', '........ohhhHHo.', '.........oHHHo..', '..........ooo...'],
  sword: ['', '.............ooo', '............ohho', '...........ohhHo', '..........ohhHo.', '.........ohhHo..', '........ohhHo...', '.......ohhHo....', '..oo..ohhHo.....', '..oSooohHo......', '...oSSoHo.......', '....oSSo........', '...osoSSo.......', '..oso..oSo......', '.oso....oo......', '.oo.............'],
  hoe: ['', '......ooooooo...', '.....ohhhhhHHo..', '......oooooHHo..', '..........oHHo..', '...........oo...'],
};
function toolTex(kind, head) {
  const h = hex(head);
  const pal = { o: shade(h, 0.35), h: shade(h, 1.2), H: h, d: shade(h, 0.7), s: '#8A6A3A', S: '#5C4422', k: '#2B1E0C' };
  return p => {
    p.clear();
    if (kind !== 'sword') {
      const end = kind === 'pickaxe' ? 10 : kind === 'axe' ? 9 : kind === 'shovel' ? 9 : 10;
      for (let t = 0; 2 + t <= end; t++) { const x = 2 + t, y = 13 - t; [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1]].forEach(([dx, dy]) => { if (!p.alpha(x + dx, y + dy)) p.set(x + dx, y + dy, pal.k); }); }
      for (let t = 0; 2 + t <= end; t++) { const x = 2 + t, y = 13 - t; p.set(x, y, t % 3 === 0 ? pal.S : pal.s); }
    }
    const rows = HEADS[kind];
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const c = rows[y][x]; if (pal[c]) p.set(x, y, pal[c]); }
  };
}
function T2(name, a, b, c, extra = {}) {
  const pal = Object.assign({ o: shade(b, 0.35), a, b, c: c || shade(b, 0.7) }, extra);
  return tpl(T[name], pal);
}
function bowTex() {
  return p => {
    p.clear();
    for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI / 2; const x = Math.round(13 - 10 * Math.cos(t)), y = Math.round(13 - 10 * Math.sin(t)); p.set(x, y, '#7A5228'); p.set(x + 1, y, '#5A3A18'); }
    for (let t = 0; t <= 10; t++) p.set(3 + t, 13 - t, '#DDDDDD');
  };
}

// ---------------- register everything ----------------
function registerAll() {
  const S = { stone: '#7F7F7F', deep: '#4D4D51' };
  const gStone = G.stone(S.stone), gDeep = G.stone(S.deep, 0.1), gNether = G.speck('#6E2E2C', 0.15, '#4A1C1C', 0.15);
  const P = { hard: 1.5, tool: 'pickaxe', tier: 0, req: true };
  const PI = { hard: 3, tool: 'pickaxe', tier: 1, req: true };
  const SH = { hard: 0.6, tool: 'shovel', sound: 'grass', cat: CAT.NATURE };
  const AX = { hard: 2, tool: 'axe', sound: 'wood' };
  const PLANT = { hard: 0, shape: 'cross', sound: 'grass', cat: CAT.PLANT, replaceable: false };

  // --- natural ---
  const dirt = G.speck('#866043', 0.12, '#5E4330', 0.1);
  B('grass_block', '잔디 블록', { top: G.grassTop('#7CBD4B'), bottom: dirt, side: G.overlaySide(dirt, '#79B748') }, Object.assign({}, SH, { drop: 'dirt', tint: 'top' }));
  B('dirt', '흙', dirt, SH);
  B('coarse_dirt', '거친 흙', G.speck('#77553B', 0.15, '#4E3A2A', 0.25), SH);
  B('rooted_dirt', '뿌리 내린 흙', p => { dirt(p); for (let i = 0; i < 14; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#B5895E'); }, SH);
  B('podzol', '회백토', { top: G.speck('#5A3E1D', 0.18, '#7A5428', 0.3), bottom: dirt, side: G.overlaySide(dirt, '#5A3E1D', 3, 4) }, Object.assign({}, SH, { drop: 'dirt' }));
  B('mycelium', '균사체', { top: G.speck('#6F6369', 0.15, '#8A7F90', 0.25), bottom: dirt, side: G.overlaySide(dirt, '#6F6369', 2, 4) }, Object.assign({}, SH, { drop: 'dirt' }));
  B('dirt_path', '흙길', { top: G.noise('#947A41', 0.1), bottom: dirt, side: G.overlaySide(dirt, '#947A41', 1, 2) }, Object.assign({}, SH, { drop: 'dirt', shape: 'box', box: [0, 0, 0, 1, 15 / 16, 1], opacity: 15 }));
  B('farmland', '경작지', { top: p => { G.noise('#5A3A22', 0.1)(p); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) p.mul(x, y, 0.7); }, bottom: dirt, side: dirt }, Object.assign({}, SH, { drop: 'dirt', shape: 'box', box: [0, 0, 0, 1, 15 / 16, 1], opacity: 15 }));
  B('mud', '진흙', G.speck('#3C393D', 0.08, '#2E2B2F', 0.2), Object.assign({}, SH, { hard: 0.5 }));
  B('packed_mud', '다져진 진흙', G.speck('#8E6B50', 0.1, '#6E523C', 0.2), { hard: 1, sound: 'grass' });
  B('mud_bricks', '진흙 벽돌', G.bricks('#8A6A4E', '#6E523C'), { hard: 1.5 });
  B('clay', '점토', G.speck('#A0A6B3', 0.06, '#8D93A0', 0.2), Object.assign({}, SH, { drop: 'clay_ball', dropN: [4, 4] }));
  B('gravel', '자갈', G.gravel(), Object.assign({}, SH, { gravity: true, sound: 'gravel', drop: 'gravel', flint: true }));
  B('sand', '모래', G.speck('#DBCF8E', 0.08, '#C7B676', 0.25), Object.assign({}, SH, { gravity: true, sound: 'sand', hard: 0.5 }));
  B('red_sand', '붉은 모래', G.speck('#BE6621', 0.08, '#A5561A', 0.25), Object.assign({}, SH, { gravity: true, sound: 'sand', hard: 0.5 }));
  B('snow_block', '눈 블록', G.noise('#F4FCFC', 0.03), Object.assign({}, SH, { hard: 0.2, sound: 'snow', drop: 'snowball', dropN: [4, 4] }));
  B('snow', '눈', G.noise('#F4FCFC', 0.03), Object.assign({}, SH, { hard: 0.1, sound: 'snow', shape: 'box', box: [0, 0, 0, 1, 2 / 16, 1], solid: true, replaceable: true, drop: 'snowball' }));
  B('powder_snow', '가루눈', G.speck('#F8FDFD', 0.04, '#E4EEF2', 0.2), Object.assign({}, SH, { hard: 0.25, sound: 'snow', solid: false }));
  B('ice', '얼음', G.ice('#91B5FC', 170), { hard: 0.5, tool: 'pickaxe', render: 'trans', opacity: 2, sound: 'glass', drop: null, cat: CAT.NATURE, slip: 0.98 });
  B('packed_ice', '꽁꽁 언 얼음', G.ice('#8DB4FA', 255), { hard: 0.5, tool: 'pickaxe', sound: 'glass', drop: null, cat: CAT.NATURE, slip: 0.98 });
  B('blue_ice', '푸른 얼음', G.ice('#74A7FD', 255), { hard: 2.8, tool: 'pickaxe', sound: 'glass', drop: null, cat: CAT.NATURE, slip: 0.989 });
  B('moss_block', '이끼 블록', G.speck('#596E2D', 0.15, '#6E8A38', 0.3), { hard: 0.1, tool: 'hoe', sound: 'grass', cat: CAT.NATURE });
  B('moss_carpet', '이끼 카펫', G.speck('#596E2D', 0.15, '#6E8A38', 0.3), { hard: 0.1, sound: 'grass', shape: 'box', box: [0, 0, 0, 1, 1 / 16, 1], cat: CAT.NATURE });
  B('sculk', '스컬크', p => { G.speck('#0D1E24', 0.2, '#0F3A44', 0.2)(p); for (let i = 0; i < 6; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#29DFEB'); }, { hard: 0.2, tool: 'hoe', sound: 'grass', cat: CAT.NATURE, xp: [1, 1] });
  B('bedrock', '기반암', G.cobble('#555555', '#2A2A2A'), { hard: -1, cat: CAT.NATURE });
  B('obsidian', '흑요석', p => { G.speck('#0F0A18', 0.2, '#3B2754', 0.15)(p); }, { hard: 50, tool: 'pickaxe', tier: 3, req: true, cat: CAT.NATURE, blast: 1200 });
  B('crying_obsidian', '우는 흑요석', p => { G.speck('#0F0A18', 0.2, '#3B2754', 0.15)(p); for (let i = 0; i < 14; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#9A3DF0'); }, { hard: 50, tool: 'pickaxe', tier: 3, req: true, light: 10, cat: CAT.NATURE, blast: 1200 });

  // --- stones ---
  B('stone', '돌', gStone, Object.assign({}, P, { drop: 'cobblestone' }));
  B('cobblestone', '조약돌', G.cobble('#7A7A7A'), Object.assign({}, P, { hard: 2 }));
  B('mossy_cobblestone', '이끼 낀 조약돌', p => { G.cobble('#7A7A7A')(p); for (let i = 0; i < 60; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, shade('#5C7A33', 0.8 + p.r() * 0.4)); }, Object.assign({}, P, { hard: 2 }));
  B('smooth_stone', '매끄러운 돌', G.polished('#9E9E9E'), Object.assign({}, P, { hard: 2 }));
  B('stone_bricks', '석재 벽돌', G.stoneBricks('#7A7A7A'), P);
  B('mossy_stone_bricks', '이끼 낀 석재 벽돌', G.stoneBricks('#7A7A7A', { mossy: true }), P);
  B('cracked_stone_bricks', '금 간 석재 벽돌', G.stoneBricks('#7A7A7A', { cracked: true }), P);
  B('chiseled_stone_bricks', '조각된 석재 벽돌', G.chiseled('#7A7A7A'), P);
  const st3 = [['granite', '화강암', '#95675A'], ['diorite', '섬록암', '#BDBDBD'], ['andesite', '안산암', '#888889']];
  for (const [n, k, c] of st3) { B(n, k, G.stone(c, 0.12), P); B('polished_' + n, '윤나는 ' + k, G.polished(c), P); }
  B('deepslate', '심층암', { top: G.stone(S.deep, 0.1), side: G.logSide(S.deep, '#3A3A3E') }, Object.assign({}, P, { hard: 3, drop: 'cobbled_deepslate' }));
  B('cobbled_deepslate', '심층암 조약돌', G.cobble('#505055', '#2E2E32'), Object.assign({}, P, { hard: 3.5 }));
  B('polished_deepslate', '윤나는 심층암', G.polished('#48484B'), Object.assign({}, P, { hard: 3.5 }));
  B('deepslate_bricks', '심층암 벽돌', G.bricks('#4A4A4E', '#2A2A2E'), Object.assign({}, P, { hard: 3.5 }));
  B('cracked_deepslate_bricks', '금 간 심층암 벽돌', p => { G.bricks('#4A4A4E', '#2A2A2E')(p); for (let y = 0, x = 6; y < 16; y++, x += ((p.r() * 3) | 0) - 1) p.set(x, y, '#1E1E20'); }, Object.assign({}, P, { hard: 3.5 }));
  B('deepslate_tiles', '심층암 타일', G.tiles('#3A3A3E', 4), Object.assign({}, P, { hard: 3.5 }));
  B('cracked_deepslate_tiles', '금 간 심층암 타일', p => { G.tiles('#3A3A3E', 4)(p); for (let y = 0, x = 9; y < 16; y++, x += ((p.r() * 3) | 0) - 1) p.set(x, y, '#1A1A1C'); }, Object.assign({}, P, { hard: 3.5 }));
  B('chiseled_deepslate', '조각된 심층암', G.chiseled('#4A4A4E'), Object.assign({}, P, { hard: 3.5 }));
  B('reinforced_deepslate', '강화된 심층암', { top: G.tiles('#5A5E5A', 2), side: p => { G.polished('#4A4E4A')(p); for (let x = 0; x < 16; x++) { p.set(x, 4, '#A0A090'); p.set(x, 11, '#A0A090'); } } }, { hard: 55, req: true, tool: 'pickaxe', tier: 9 });
  B('tuff', '응회암', G.speck('#6C6D66', 0.1, '#5A5B55', 0.25), P);
  B('calcite', '방해석', G.speck('#DFE0DB', 0.05, '#C9CAC4', 0.2), Object.assign({}, P, { hard: 0.75 }));
  B('dripstone_block', '점적석 블록', G.logSide('#866B5C', '#6E5648'), P);
  B('pointed_dripstone', '뾰족한 점적석', G.dripstone(false), Object.assign({}, PLANT, { hard: 1.5, sound: 'stone', cat: CAT.NATURE, tool: 'pickaxe', solid: false, damage: 'dripstone' }));
  B('pointed_dripstone_down', '뾰족한 점적석(종유석)', G.dripstone(true), Object.assign({}, PLANT, { hard: 1.5, sound: 'stone', cat: CAT.NATURE, tool: 'pickaxe', drop: 'pointed_dripstone', noItem: true, hanging: true }));
  B('sandstone', '사암', { top: G.noise('#E0D6A5', 0.05), side: G.sandstoneSide('#D8CB94'), bottom: G.speck('#D8CB94', 0.08, '#C0B27A', 0.3) }, Object.assign({}, P, { hard: 0.8 }));
  B('cut_sandstone', '깎인 사암', { top: G.noise('#E0D6A5', 0.05), side: G.tiles('#D8CB94', 2) }, Object.assign({}, P, { hard: 0.8 }));
  B('chiseled_sandstone', '조각된 사암', { top: G.noise('#E0D6A5', 0.05), side: G.chiseled('#D8CB94') }, Object.assign({}, P, { hard: 0.8 }));
  B('smooth_sandstone', '매끄러운 사암', G.noise('#E0D6A5', 0.04), Object.assign({}, P, { hard: 2 }));
  B('red_sandstone', '붉은 사암', { top: G.noise('#BA6324', 0.05), side: G.sandstoneSide('#B5621F') }, Object.assign({}, P, { hard: 0.8 }));
  B('cut_red_sandstone', '깎인 붉은 사암', { top: G.noise('#BA6324', 0.05), side: G.tiles('#B5621F', 2) }, Object.assign({}, P, { hard: 0.8 }));
  B('chiseled_red_sandstone', '조각된 붉은 사암', { top: G.noise('#BA6324', 0.05), side: G.chiseled('#B5621F') }, Object.assign({}, P, { hard: 0.8 }));
  B('smooth_red_sandstone', '매끄러운 붉은 사암', G.noise('#BA6324', 0.04), Object.assign({}, P, { hard: 2 }));
  B('bricks', '벽돌', G.bricks('#966356'), Object.assign({}, P, { hard: 2 }));
  B('prismarine', '프리즈머린', G.speck('#63A08F', 0.12, '#4E8C9A', 0.3), P);
  B('prismarine_bricks', '프리즈머린 벽돌', G.stoneBricks('#64AB97'), P);
  B('dark_prismarine', '어두운 프리즈머린', G.tiles('#335A4B', 2), P);
  B('sea_lantern', '바다 랜턴', p => { G.polished('#D4E8E0')(p); for (let i = 3; i < 13; i++) for (let j = 3; j < 13; j++) p.set(i, j, mix('#E8F6F0', '#9FD4C8', ((i + j) % 4) / 4)); }, { hard: 0.3, light: 15, sound: 'glass', drop: 'prismarine' });

  // --- nether ---
  B('netherrack', '네더랙', gNether, Object.assign({}, P, { hard: 0.4, sound: 'nether', cat: CAT.NATURE }));
  B('nether_bricks', '네더 벽돌', G.bricks('#2D1619', '#180A0C'), Object.assign({}, P, { hard: 2 }));
  B('cracked_nether_bricks', '금 간 네더 벽돌', p => { G.bricks('#2D1619', '#180A0C')(p); for (let y = 0, x = 5; y < 16; y++, x += ((p.r() * 3) | 0) - 1) p.set(x, y, '#0A0405'); }, Object.assign({}, P, { hard: 2 }));
  B('chiseled_nether_bricks', '조각된 네더 벽돌', G.chiseled('#2D1619'), Object.assign({}, P, { hard: 2 }));
  B('red_nether_bricks', '붉은 네더 벽돌', G.bricks('#450709', '#2A0405'), Object.assign({}, P, { hard: 2 }));
  B('soul_sand', '영혼 모래', p => { G.speck('#51402F', 0.12, '#3A2D20', 0.3)(p); for (let k = 0; k < 3; k++) { const x = 2 + k * 5, y = 4 + (k % 2) * 6; p.set(x, y, '#2A1E14'); p.set(x + 2, y, '#2A1E14'); p.set(x + 1, y + 2, '#2A1E14'); } }, Object.assign({}, SH, { sound: 'sand', slow: 0.4 }));
  B('soul_soil', '영혼 흙', G.speck('#4B3A2C', 0.12, '#38291E', 0.3), Object.assign({}, SH, { sound: 'sand' }));
  B('glowstone', '발광석', p => { G.speck('#C89A50', 0.2, '#FFE9A0', 0.45)(p); for (let i = 0; i < 26; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#FFF8D8'); for (let i = 0; i < 10; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#8A5A28'); }, { hard: 0.3, light: 15, sound: 'glass', drop: 'glowstone_dust', dropN: [2, 4], cat: CAT.NATURE });
  B('magma_block', '마그마 블록', p => { G.noise('#8A3A10', 0.15)(p); for (let i = 0; i < 4; i++) { let x = (p.r() * 16) | 0, y = (p.r() * 16) | 0; for (let k = 0; k < 6; k++) { p.set(x, y, '#FFA020'); x += ((p.r() * 3) | 0) - 1; y += ((p.r() * 3) | 0) - 1; } } }, Object.assign({}, P, { hard: 0.5, light: 3, cat: CAT.NATURE, damage: 'magma' }));
  B('crimson_nylium', '진홍빛 나일리움', { top: G.speck('#8A1C1C', 0.2, '#B43A2A', 0.3), side: G.overlaySide(gNether, '#8A1C1C', 2, 4), bottom: gNether }, Object.assign({}, P, { hard: 0.4, drop: 'netherrack', sound: 'nether', cat: CAT.NATURE }));
  B('warped_nylium', '뒤틀린 나일리움', { top: G.speck('#2B7265', 0.2, '#3A9A88', 0.3), side: G.overlaySide(gNether, '#2B7265', 2, 4), bottom: gNether }, Object.assign({}, P, { hard: 0.4, drop: 'netherrack', sound: 'nether', cat: CAT.NATURE }));
  B('nether_wart_block', '네더 사마귀 블록', G.speck('#741014', 0.2, '#9A1A1C', 0.3), { hard: 1, tool: 'hoe', sound: 'grass', cat: CAT.NATURE });
  B('warped_wart_block', '뒤틀린 사마귀 블록', G.speck('#167E86', 0.2, '#1E9A9E', 0.3), { hard: 1, tool: 'hoe', sound: 'grass', cat: CAT.NATURE });
  B('shroomlight', '버섯불', p => { G.speck('#F09A44', 0.15, '#FFD078', 0.35)(p); }, { hard: 1, tool: 'hoe', light: 15, sound: 'grass', cat: CAT.NATURE });
  B('basalt', '현무암', { top: G.logTop('#555560', '#46464E'), side: G.logSide('#505058', '#3E3E46') }, Object.assign({}, P, { hard: 1.25, cat: CAT.NATURE }));
  B('polished_basalt', '윤나는 현무암', { top: G.chiseled('#5A5A62'), side: G.pillarSide('#585860') }, Object.assign({}, P, { hard: 1.25 }));
  B('smooth_basalt', '매끄러운 현무암', G.noise('#48484E', 0.05), Object.assign({}, P, { hard: 1.25 }));
  B('blackstone', '흑암', { top: G.speck('#2A2429', 0.15, '#3E363C', 0.3), side: G.speck('#2A2429', 0.15, '#1A161A', 0.3) }, P);
  B('polished_blackstone', '윤나는 흑암', G.polished('#353038'), P);
  B('polished_blackstone_bricks', '윤나는 흑암 벽돌', G.stoneBricks('#353038'), P);
  B('chiseled_polished_blackstone', '조각된 윤나는 흑암', G.chiseled('#353038'), P);
  B('gilded_blackstone', '금 박힌 흑암', G.ore(G.speck('#2A2429', 0.15, '#3E363C', 0.3), '#F5C842', '#B08020'), P);

  // --- end ---
  B('end_stone', '엔드 돌', G.speck('#DBDE9E', 0.08, '#C4C78A', 0.3), Object.assign({}, P, { hard: 3, cat: CAT.NATURE }));
  B('end_stone_bricks', '엔드 돌 벽돌', G.stoneBricks('#DBE0A2'), Object.assign({}, P, { hard: 3 }));
  B('purpur_block', '퍼퍼 블록', G.tiles('#A97DA9', 4), Object.assign({}, P, { hard: 1.5 }));
  B('purpur_pillar', '퍼퍼 기둥', { top: G.chiseled('#A97DA9'), side: G.pillarSide('#A97DA9') }, Object.assign({}, P, { hard: 1.5 }));
  B('chorus_plant', '후렴 식물', G.speck('#5E3A5E', 0.2, '#8A5A8A', 0.3), { hard: 0.4, tool: 'axe', sound: 'wood', cat: CAT.PLANT, drop: 'chorus_fruit' });
  B('chorus_flower', '후렴 꽃', p => { G.speck('#9A7A9A', 0.15, '#C8A8C8', 0.3)(p); for (let i = 4; i < 12; i++) for (let j = 4; j < 12; j++) p.set(i, j, '#C8A0D0'); }, { hard: 0.4, tool: 'axe', sound: 'wood', cat: CAT.PLANT });
  B('dragon_egg', '드래곤 알', p => { G.speck('#0C0910', 0.2, '#3A2050', 0.25)(p); }, { hard: 3, light: 1, shape: 'box', box: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16], gravity: true, cat: CAT.FUNC });
  B('end_portal_frame', '엔드 차원문 틀', { top: p => { G.noise('#4D7360', 0.1)(p); for (let i = 4; i < 12; i++) for (let j = 4; j < 12; j++) p.set(i, j, '#2E4A3A'); }, side: p => { G.speck('#DBDE9E', 0.08, '#C4C78A', 0.3)(p); for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) p.set(x, y, '#4D7360'); }, bottom: G.speck('#DBDE9E', 0.08, '#C4C78A', 0.3) }, { hard: -1, shape: 'box', box: [0, 0, 0, 1, 13 / 16, 1], light: 1, opacity: 15, cat: CAT.FUNC });
  B('end_portal_frame_eye', '엔드 차원문 틀(눈)', { top: p => { G.noise('#4D7360', 0.1)(p); for (let i = 4; i < 12; i++) for (let j = 4; j < 12; j++) p.set(i, j, Math.hypot(i - 7.5, j - 7.5) < 2 ? '#0A2A1A' : '#2EA06A'); }, side: p => { G.speck('#DBDE9E', 0.08, '#C4C78A', 0.3)(p); for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) p.set(x, y, '#4D7360'); }, bottom: G.speck('#DBDE9E', 0.08, '#C4C78A', 0.3) }, { hard: -1, shape: 'box', box: [0, 0, 0, 1, 13 / 16, 1], light: 1, opacity: 15, noItem: true, drop: null });

  // --- ores ---
  const ores = [['coal', '석탄', '#2B2B2B', '#4A4A4A', 0, 'coal', [1, 1], [0, 2]], ['iron', '철', '#D8AF93', '#AF8E77', 1, 'raw_iron', [1, 1]], ['copper', '구리', '#E0805A', '#3FA77C', 1, 'raw_copper', [2, 5]],
    ['gold', '금', '#FCEE4B', '#C8A21C', 2, 'raw_gold', [1, 1]], ['redstone', '레드스톤', '#FF2A1A', '#A00E0E', 2, 'redstone', [4, 5], [1, 5]], ['lapis', '청금석', '#2350B8', '#183A8A', 1, 'lapis_lazuli', [4, 8], [2, 5]],
    ['diamond', '다이아몬드', '#5DECF5', '#1EAAB0', 2, 'diamond', [1, 1], [3, 7]], ['emerald', '에메랄드', '#17DD62', '#0A9A40', 2, 'emerald', [1, 1], [3, 7]]];
  for (const [n, k, a, b, tier, drop, dropN, xp] of ores) {
    B(n + '_ore', k + ' 광석', G.ore(gStone, a, b), { hard: 3, tool: 'pickaxe', tier, req: true, drop, dropN, xp, cat: CAT.ORE, light: n === 'redstone' ? 0 : 0 });
    B('deepslate_' + n + '_ore', '심층암 ' + k + ' 광석', G.ore(gDeep, a, b), { hard: 4.5, tool: 'pickaxe', tier, req: true, drop, dropN, xp, cat: CAT.ORE });
  }
  B('nether_gold_ore', '네더 금 광석', G.ore(gNether, '#FCEE4B', '#C8A21C'), { hard: 3, tool: 'pickaxe', tier: 0, req: true, drop: 'gold_nugget', dropN: [2, 6], xp: [0, 1], cat: CAT.ORE, sound: 'nether' });
  B('nether_quartz_ore', '네더 석영 광석', G.ore(gNether, '#ECE6DC', '#BDB4A8'), { hard: 3, tool: 'pickaxe', tier: 0, req: true, drop: 'quartz', xp: [2, 5], cat: CAT.ORE, sound: 'nether' });
  B('ancient_debris', '고대 잔해', { top: G.logTop('#6E4E44', '#5A3E36'), side: p => { G.speck('#5E4038', 0.15, '#7A5A50', 0.2)(p); for (let y = 0; y < 16; y += 5) for (let x = 0; x < 16; x++) p.mul(x, y, 0.75); } }, { hard: 30, tool: 'pickaxe', tier: 3, req: true, cat: CAT.ORE, blast: 1200 });
  // mineral blocks
  const minerals = [['coal_block', '석탄 블록', '#1A1A1A', 0], ['iron_block', '철 블록', '#DCDCDC', 1], ['gold_block', '금 블록', '#F8D33A', 2], ['redstone_block', '레드스톤 블록', '#AA1A0E', 0],
    ['lapis_block', '청금석 블록', '#1F4A9C', 1], ['diamond_block', '다이아몬드 블록', '#62E5DE', 2], ['emerald_block', '에메랄드 블록', '#2ACB58', 2], ['netherite_block', '네더라이트 블록', '#433D40', 3],
    ['copper_block', '구리 블록', '#C06A50', 1], ['exposed_copper', '약간 녹슨 구리', '#A27D67', 1], ['weathered_copper', '녹슨 구리', '#6D9A6C', 1], ['oxidized_copper', '산화된 구리', '#52A385', 1],
    ['amethyst_block', '자수정 블록', '#8561BF', 0], ['quartz_block', '석영 블록', '#EBE5DE', 0]];
  for (const [n, k, c, tier] of minerals) B(n, k, n === 'amethyst_block' ? G.speck('#8561BF', 0.15, '#B08AE8', 0.3) : n === 'quartz_block' ? G.noise('#EBE5DE', 0.03) : G.mineral(c), { hard: n.includes('netherite') ? 50 : 5, tool: 'pickaxe', tier, req: true, cat: CAT.ORE, sound: 'metal' });
  BLOCKS[BID.amethyst_block].sound = 'glass';
  B('budding_amethyst', '싹튼 자수정', p => { G.speck('#8561BF', 0.15, '#B08AE8', 0.3)(p); for (let i = 0; i < 5; i++) { const x = 2 + ((p.r() * 12) | 0), y = 2 + ((p.r() * 12) | 0); p.set(x, y, '#3A1F6E'); p.set(x + 1, y, '#3A1F6E'); } }, { hard: 1.5, tool: 'pickaxe', drop: null, cat: CAT.ORE, sound: 'glass' });
  B('amethyst_cluster', '자수정 군집', p => { p.clear(); for (let k = 0; k < 4; k++) { const x = 3 + k * 3; for (let y = 15; y > 5 + (k % 2) * 3; y--) { p.set(x, y, '#C9A4F5'); p.set(x + 1, y, '#8A5CC8'); } } }, Object.assign({}, PLANT, { hard: 1.5, light: 5, sound: 'glass', drop: 'amethyst_shard', dropN: [4, 4], cat: CAT.ORE }));
  for (const [n, k, c] of [['cut_copper', '깎인 구리', '#C06A50'], ['exposed_cut_copper', '약간 녹슨 깎인 구리', '#A27D67'], ['weathered_cut_copper', '녹슨 깎인 구리', '#6D9A6C'], ['oxidized_cut_copper', '산화된 깎인 구리', '#52A385']])
    B(n, k, G.tiles(c, 2), { hard: 3, tool: 'pickaxe', tier: 1, req: true, sound: 'metal' });
  B('raw_iron_block', '철 원석 블록', G.rawBlock('#A88870'), { hard: 5, tool: 'pickaxe', tier: 1, req: true, cat: CAT.ORE });
  B('raw_copper_block', '구리 원석 블록', G.rawBlock('#9A5A3E'), { hard: 5, tool: 'pickaxe', tier: 1, req: true, cat: CAT.ORE });
  B('raw_gold_block', '금 원석 블록', G.rawBlock('#D8A22A'), { hard: 5, tool: 'pickaxe', tier: 2, req: true, cat: CAT.ORE });
  B('chiseled_quartz_block', '조각된 석영 블록', G.chiseled('#E6DED4'), { hard: 0.8, tool: 'pickaxe', req: true });
  B('quartz_pillar', '석영 기둥', { top: G.chiseled('#E6DED4'), side: G.pillarSide('#E8E1D8') }, { hard: 0.8, tool: 'pickaxe', req: true });
  B('quartz_bricks', '석영 벽돌', G.stoneBricks('#EAE3DA'), { hard: 0.8, tool: 'pickaxe', req: true });
  B('smooth_quartz', '매끄러운 석영 블록', G.noise('#ECE6DF', 0.02), { hard: 2, tool: 'pickaxe', req: true });

  // --- woods ---
  const woods = [
    ['oak', '참나무', '#A2834F', '#6B5332', '#B8945F', '#59A33A', true], ['spruce', '가문비나무', '#725430', '#3A2716', '#7A5A33', '#3D6340', false],
    ['birch', '자작나무', '#C5B77B', '#D8D7D2', '#D1C08A', '#78A84A', false], ['jungle', '정글 나무', '#A07350', '#574119', '#B58459', '#3EA81E', true],
    ['acacia', '아카시아 나무', '#A85A32', '#67615A', '#B05E37', '#6FA524', true], ['dark_oak', '짙은 참나무', '#432B14', '#3C2E1A', '#4F3520', '#357A1E', true],
    ['mangrove', '맹그로브 나무', '#763631', '#5A4630', '#8A3D35', '#5E9A2E', true], ['cherry', '벚나무', '#E4B4A6', '#3B1D2A', '#E0A5A0', '#F2AFCF', false],
  ];
  for (const [n, k, plank, bark, inner, leaf, tint] of woods) {
    const side = n === 'birch' ? G.birchSide() : G.logSide(bark);
    B(n + '_log', k + ' 원목', { top: G.logTop(inner, bark), side }, Object.assign({}, AX, { cat: CAT.NATURE, log: n }));
    B(n + '_wood', k + ' (껍질)', side, Object.assign({}, AX, { cat: CAT.NATURE, log: n }));
    B('stripped_' + n + '_log', '껍질 벗긴 ' + k + ' 원목', { top: G.logTop(inner, shade(inner, 0.85)), side: G.logSide(inner) }, Object.assign({}, AX, { log: n }));
    B(n + '_planks', k + ' 판자', G.planks(plank), Object.assign({}, AX, { planks: n }));
    B(n + '_leaves', k + ' 잎', G.leaves(leaf), { hard: 0.2, tool: 'hoe', render: 'cutout', opacity: 1, sound: 'grass', cat: CAT.NATURE, tint: tint ? 'all' : false, leaves: n, drop: null });
    B(n + '_sapling', k + ' 묘목', G.sapling(leaf, bark), Object.assign({}, PLANT, { tint: tint ? 'all' : false }));
  }
  const nwoods = [['crimson', '진홍빛', '#6A344B', '#5C1A1E', '#8A3A50'], ['warped', '뒤틀린', '#2B6963', '#3A3B4E', '#3A8A80']];
  for (const [n, k, plank, bark, inner] of nwoods) {
    const side = p => { G.logSide(bark)(p); for (let i = 0; i < 10; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, n === 'crimson' ? '#B8303A' : '#2BC8B0'); };
    B(n + '_stem', k + ' 자루', { top: G.logTop(inner, bark), side }, Object.assign({}, AX, { cat: CAT.NATURE, log: n }));
    B(n + '_hyphae', k + ' 균사', side, Object.assign({}, AX, { cat: CAT.NATURE, log: n }));
    B('stripped_' + n + '_stem', '껍질 벗긴 ' + k + ' 자루', { top: G.logTop(inner, shade(inner, 0.8)), side: G.logSide(inner) }, Object.assign({}, AX, { log: n }));
    B(n + '_planks', k + ' 판자', G.planks(plank), Object.assign({}, AX, { planks: n }));
  }
  B('bamboo_block', '대나무 블록', { top: G.logTop('#B8C060', '#7C9A2C'), side: G.logSide('#7C9A2C', '#5E7A1E') }, Object.assign({}, AX, { log: 'bamboo' }));
  B('bamboo_planks', '대나무 판자', p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade('#C9B65A', (x % 4 === 3 ? 0.78 : 1) * (0.95 + p.r() * 0.08))); }, Object.assign({}, AX, { planks: 'bamboo' }));
  B('bamboo_mosaic', '대나무 모자이크', G.tiles('#C9B65A', 2), AX);

  // --- plants ---
  B('short_grass', '잔디', G.grassPlant('#79B748'), Object.assign({}, PLANT, { tint: 'all', replaceable: true, drop: 'wheat_seeds', dropChance: 0.125 }));
  B('fern', '고사리', G.fern('#5F9A3A'), Object.assign({}, PLANT, { tint: 'all', replaceable: true, drop: 'wheat_seeds', dropChance: 0.125 }));
  B('dead_bush', '마른 덤불', G.deadBush(), Object.assign({}, PLANT, { replaceable: true, drop: 'stick', dropN: [0, 2] }));
  const flowers = [['dandelion', '민들레', '#FFE13A', '#F5B700'], ['poppy', '양귀비', '#ED302C', '#3A1810'], ['blue_orchid', '파란 난초', '#2AB4F0', '#1A8AC0'], ['allium', '파꽃', '#B868E8', '#8A3AC8'],
    ['azure_bluet', '선애기별꽃', '#E4ECF0', '#F5E04A'], ['oxeye_daisy', '데이지', '#F2F2F2', '#F5C82A'], ['cornflower', '수레국화', '#4A6CE8', '#2A3AA0'], ['lily_of_the_valley', '은방울꽃', '#FFFFFF', '#D8E8D0'],
    ['wither_rose', '위더 장미', '#1E1A1A', '#3A2A2A'], ['torchflower', '횃불꽃', '#F08A2A', '#F5D04A']];
  for (const [n, k, a, b] of flowers) B(n, k, G.flower(a, b, n === 'wither_rose' ? '#2A3020' : '#3E7A26'), Object.assign({}, PLANT, { damage: n === 'wither_rose' ? 'wither' : null }));
  for (const [n, k, c] of [['red_tulip', '빨간 튤립', '#E0302A'], ['orange_tulip', '주황 튤립', '#F08A1A'], ['white_tulip', '하얀 튤립', '#F0F0F0'], ['pink_tulip', '분홍 튤립', '#F0A0C8']]) B(n, k, G.tulip(c), PLANT);
  B('brown_mushroom', '갈색 버섯', G.mushroom('#9A7258'), Object.assign({}, PLANT, { light: 1 }));
  B('red_mushroom', '빨간 버섯', G.mushroom('#E0302A', '#FFFFFF'), PLANT);
  B('crimson_fungus', '진홍빛 균', G.fungus('#B8202A', '#E8A040'), PLANT);
  B('warped_fungus', '뒤틀린 균', G.fungus('#1A9A8A', '#E8A040'), PLANT);
  B('crimson_roots', '진홍빛 뿌리', G.roots('#B0202A'), Object.assign({}, PLANT, { replaceable: true }));
  B('warped_roots', '뒤틀린 뿌리', G.roots('#1AA090'), Object.assign({}, PLANT, { replaceable: true }));
  B('nether_sprouts', '네더 새싹', G.grassPlant('#1AA090', 8), Object.assign({}, PLANT, { replaceable: true }));
  B('sugar_cane', '사탕수수', G.cane(), PLANT);
  B('sweet_berry_bush', '달콤한 열매 덤불', G.berryBush(), Object.assign({}, PLANT, { drop: 'sweet_berries', dropN: [1, 3], damage: 'berry' }));
  B('wheat_crop', '밀 작물', G.wheat(7), Object.assign({}, PLANT, { drop: 'wheat', noItem: true }));
  B('cobweb', '거미줄', G.cobweb(), Object.assign({}, PLANT, { hard: 4, tool: 'sword', drop: 'string', sound: 'wool', web: true, cat: CAT.FUNC }));
  B('hanging_roots', '늘어진 뿌리', G.roots('#A07A5A'), Object.assign({}, PLANT, { hanging: true }));
  B('bamboo', '대나무', p => { p.clear(); for (let y = 0; y < 16; y++) { p.set(7, y, y % 5 === 0 ? '#9AB840' : '#6E9A2A'); p.set(8, y, '#5E8A20'); } p.set(9, 3, '#6EAA30'); p.set(10, 2, '#6EAA30'); p.set(5, 9, '#6EAA30'); }, PLANT);
  B('azalea', '진달래', { top: G.leaves('#5E8A2E', 0.05), side: G.leaves('#5E8A2E', 0.15) }, { hard: 0, render: 'cutout', opacity: 1, sound: 'grass', cat: CAT.PLANT });
  B('flowering_azalea', '꽃 핀 진달래', { top: p => { G.leaves('#5E8A2E', 0.05)(p); for (let i = 0; i < 10; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#D86AC8'); }, side: p => { G.leaves('#5E8A2E', 0.15)(p); for (let i = 0; i < 8; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#D86AC8'); } }, { hard: 0, render: 'cutout', opacity: 1, sound: 'grass', cat: CAT.PLANT });
  B('cactus', '선인장', { top: p => { G.noise('#5C9A2E', 0.1)(p); for (let i = 0; i < 16; i++) { p.set(i, 0, '#3A6A1A'); p.set(i, 15, '#3A6A1A'); p.set(0, i, '#3A6A1A'); p.set(15, i, '#3A6A1A'); } }, side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade('#5C9A2E', (x % 4 === 1 ? 1.2 : x % 4 === 3 ? 0.75 : 1) * (0.94 + p.r() * 0.1))); for (let i = 0; i < 10; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#E0E0B0'); }, bottom: G.noise('#5C9A2E', 0.1) }, { hard: 0.4, sound: 'wool', shape: 'box', box: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16], cat: CAT.PLANT, damage: 'cactus', needsSand: true });
  B('pumpkin', '호박', { top: p => { G.noise('#C87A14', 0.08)(p); p.set(7, 7, '#5A4A1A'); p.set(8, 8, '#5A4A1A'); }, side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade('#D8801A', (x % 4 === 0 ? 0.78 : 1) * (0.94 + p.r() * 0.1))); } }, { hard: 1, tool: 'axe', sound: 'wood', cat: CAT.PLANT });
  const pumpkinSide = p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade('#D8801A', (x % 4 === 0 ? 0.78 : 1) * (0.94 + p.r() * 0.1))); };
  const face = (lit) => p => { pumpkinSide(p); const c = lit ? '#FFD84A' : '#3A2A0A'; [[3, 5], [4, 5], [4, 4], [11, 5], [12, 5], [11, 4]].forEach(([x, y]) => p.set(x, y, c)); for (let x = 3; x < 13; x++) p.set(x, 10, c); for (let x = 4; x < 12; x++) if (x % 3) p.set(x, 11, c); p.set(5, 9, c); p.set(10, 9, c); };
  B('carved_pumpkin', '조각된 호박', { top: TEX.names.pumpkin_top, side: pumpkinSide, front: face(false) }, { hard: 1, tool: 'axe', sound: 'wood', cat: CAT.PLANT, facing: true });
  B('jack_o_lantern', '잭 오 랜턴', { top: TEX.names.pumpkin_top, side: pumpkinSide, front: face(true) }, { hard: 1, tool: 'axe', sound: 'wood', light: 15, cat: CAT.FUNC, facing: true });
  B('melon', '수박', { top: p => { G.noise('#8A9A28', 0.1)(p); }, side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade((x + (y >> 2)) % 5 < 2 ? '#B8C83A' : '#6E8A1E', 0.92 + p.r() * 0.12)); } }, { hard: 1, tool: 'axe', sound: 'wood', drop: 'melon_slice', dropN: [3, 7], cat: CAT.PLANT });
  B('hay_block', '건초 더미', { top: p => { G.noise('#B8A030', 0.1)(p); for (let i = 0; i < 16; i++) { p.set(i, 0, '#7A5A1A'); p.set(i, 15, '#7A5A1A'); p.set(0, i, '#7A5A1A'); p.set(15, i, '#7A5A1A'); } }, side: p => { G.logSide('#C8AA32', '#A08820')(p); for (let x = 0; x < 16; x++) { p.set(x, 3, '#8A3A1A'); p.set(x, 12, '#8A3A1A'); } } }, { hard: 0.5, tool: 'hoe', sound: 'grass', cat: CAT.PLANT });
  B('dried_kelp_block', '말린 켈프 블록', { top: G.logTop('#3A4A2A', '#2A3A1E'), side: G.logSide('#3A4A2A', '#2A361E') }, { hard: 0.5, tool: 'hoe', sound: 'grass', cat: CAT.PLANT });
  B('bone_block', '뼈 블록', { top: p => { G.noise('#E4DFC6', 0.05)(p); for (let i = 5; i < 11; i++) for (let j = 5; j < 11; j++) p.set(i, j, '#C8C2A4'); }, side: G.pillarSide('#E4DFC6') }, Object.assign({}, P, { hard: 2 }));
  B('brown_mushroom_block', '갈색 버섯 블록', G.speck('#956A4D', 0.1, '#7A5640', 0.2), { hard: 0.2, tool: 'axe', sound: 'wood', cat: CAT.PLANT, drop: 'brown_mushroom', dropN: [0, 2] });
  B('red_mushroom_block', '빨간 버섯 블록', p => { G.noise('#C82A28', 0.08)(p); for (let i = 0; i < 5; i++) { const x = (p.r() * 13) | 0, y = (p.r() * 13) | 0; p.rect(x, y, 3, 3, '#F0F0F0'); } }, { hard: 0.2, tool: 'axe', sound: 'wood', cat: CAT.PLANT, drop: 'red_mushroom', dropN: [0, 2] });
  B('mushroom_stem', '버섯 줄기', G.noise('#D8D0C0', 0.06), { hard: 0.2, tool: 'axe', sound: 'wood', cat: CAT.PLANT, drop: null });
  const corals = [['tube', '관', '#3158D8'], ['brain', '뇌', '#D85AA0'], ['bubble', '거품', '#A830A8'], ['fire', '불', '#C8302A'], ['horn', '뿔', '#D8C83A']];
  for (const [n, k, c] of corals) {
    B(n + '_coral_block', k + ' 산호 블록', p => { G.noise(c, 0.15)(p); for (let i = 0; i < 25; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, shade(c, 1.35)); }, Object.assign({}, P, { cat: CAT.NATURE, drop: 'dead_' + n + '_coral_block' }));
    B('dead_' + n + '_coral_block', '죽은 ' + k + ' 산호 블록', p => { G.noise('#857F79', 0.12)(p); for (let i = 0; i < 25; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#A39D96'); }, Object.assign({}, P, { cat: CAT.NATURE }));
  }
  B('sponge', '스펀지', p => { G.noise('#C8C040', 0.1)(p); for (let i = 0; i < 20; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#8A8420'); }, { hard: 0.6, tool: 'hoe', sound: 'grass', cat: CAT.NATURE });
  B('wet_sponge', '젖은 스펀지', p => { G.noise('#A8A830', 0.1)(p); for (let i = 0; i < 20; i++) p.set((p.r() * 16) | 0, (p.r() * 16) | 0, '#4A6A8A'); }, { hard: 0.6, tool: 'hoe', sound: 'grass', cat: CAT.NATURE });
  B('honeycomb_block', '벌집 블록', p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, ((x + (y >> 2) * 2) % 4 === 0 || y % 4 === 0) ? '#B8781A' : shade('#E8A030', 0.95 + p.r() * 0.1)); }, { hard: 0.6, sound: 'wool', cat: CAT.NATURE });
  B('slime_block', '슬라임 블록', p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = x === 0 || y === 0 || x === 15 || y === 15, inner = x > 3 && x < 12 && y > 3 && y < 12; p.set(x, y, shade('#78C858', e ? 0.8 : inner ? 0.95 : 1.1), e ? 230 : inner ? 230 : 140); } }, { hard: 0, render: 'trans', opacity: 1, sound: 'wool', cat: CAT.FUNC, bounce: true });
  B('honey_block', '꿀 블록', p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = x === 0 || y === 0 || x === 15 || y === 15; p.set(x, y, shade('#F0A830', e ? 0.8 : 1), e ? 240 : 170); } }, { hard: 0, render: 'trans', opacity: 1, sound: 'wool', cat: CAT.FUNC, slow: 0.4 });

  // --- glass ---
  B('glass', '유리', G.glass(null), { hard: 0.3, render: 'cutout', opacity: 0, sound: 'glass', drop: null, glass: true });
  B('tinted_glass', '착색 유리', G.glass('#2A2430', 150), { hard: 0.3, render: 'trans', opacity: 15, sound: 'glass', glass: true });

  // --- colored families ---
  DYES.forEach(([n, k, wool, conc, terra], i) => {
    B(n + '_wool', k + ' 양털', G.wool(wool), { hard: 0.8, tool: 'shears', sound: 'wool', cat: CAT.COLOR });
    B(n + '_carpet', k + ' 카펫', G.wool(wool), { hard: 0.1, sound: 'wool', shape: 'box', box: [0, 0, 0, 1, 1 / 16, 1], cat: CAT.COLOR });
    B(n + '_concrete', k + ' 콘크리트', G.concrete(conc), Object.assign({}, P, { hard: 1.8, cat: CAT.COLOR }));
    B(n + '_concrete_powder', k + ' 콘크리트 가루', G.powder(mix(conc, '#FFFFFF', 0.25)), { hard: 0.5, tool: 'shovel', sound: 'sand', gravity: true, cat: CAT.COLOR, powder: n + '_concrete' });
    B(n + '_terracotta', k + ' 테라코타', G.terracotta(terra), Object.assign({}, P, { hard: 1.25, cat: CAT.COLOR }));
    B(n + '_glazed_terracotta', k + ' 유광 테라코타', G.glazed(conc, i * 31 + 7), Object.assign({}, P, { hard: 1.4, cat: CAT.COLOR }));
    B(n + '_stained_glass', k + ' 색유리', G.glass(wool, 90), { hard: 0.3, render: 'trans', opacity: 0, sound: 'glass', drop: null, cat: CAT.COLOR, glass: true });
  });
  B('terracotta', '테라코타', G.terracotta('#985E43'), Object.assign({}, P, { hard: 1.25, cat: CAT.COLOR }));

  // --- functional ---
  const oakP = TEX.names.oak_planks_all;
  B('crafting_table', '작업대', { top: p => { G.planks('#A2834F')(p); for (let i = 1; i < 15; i++) { p.set(i, 1, '#4A3218'); p.set(i, 14, '#4A3218'); p.set(1, i, '#4A3218'); p.set(14, i, '#4A3218'); p.set(i, 7, '#6A4A28'); p.set(7, i, '#6A4A28'); } }, bottom: oakP,
    side: p => { G.planks('#8A6A3E')(p); for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) p.set(x, y, '#A2834F'); p.rect(3, 5, 2, 8, '#8A8A8A'); p.rect(2, 5, 4, 2, '#6A6A6A'); p.rect(10, 5, 2, 9, '#6A4A28'); p.rect(9, 5, 4, 2, '#B8B8B8'); },
    front: p => { G.planks('#8A6A3E')(p); for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) p.set(x, y, '#A2834F'); p.rect(4, 5, 8, 1, '#5A3A1A'); p.rect(5, 6, 1, 7, '#5A3A1A'); p.rect(10, 6, 1, 7, '#5A3A1A'); p.rect(6, 8, 4, 4, '#C8A060'); } }, Object.assign({}, AX, { cat: CAT.FUNC, use: 'craft' }));
  const furnSide = G.stoneBricks('#7A7A7A'), furnTop = G.polished('#8A8A8A');
  const furnFront = lit => p => { G.polished('#7A7A7A')(p); p.rect(3, 3, 10, 2, '#3A3A3A'); p.rect(4, 8, 8, 6, '#1A1A1A'); if (lit) { p.rect(5, 10, 6, 4, '#F08A1A'); p.rect(6, 11, 4, 2, '#FFE04A'); } for (let x = 4; x < 12; x++) p.set(x, 8, '#4A4A4A'); };
  B('furnace', '화로', { top: furnTop, side: furnSide, front: furnFront(false) }, Object.assign({}, P, { hard: 3.5, cat: CAT.FUNC, use: 'furnace', facing: true }));
  B('lit_furnace', '켜진 화로', { top: furnTop, side: furnSide, front: furnFront(true) }, Object.assign({}, P, { hard: 3.5, cat: CAT.FUNC, use: 'furnace', facing: true, light: 13, drop: 'furnace', noItem: true }));
  B('blast_furnace', '용광로', { top: G.polished('#6A6A6E'), side: G.tiles('#6E6E72', 2), front: p => { G.tiles('#6E6E72', 2)(p); p.rect(4, 6, 8, 7, '#1A1A1A'); for (let x = 4; x < 12; x += 2) p.rect(x, 6, 1, 7, '#5A5A5E'); } }, Object.assign({}, P, { hard: 3.5, cat: CAT.FUNC, use: 'furnace', facing: true }));
  B('smoker', '훈연기', { top: G.logTop('#6A5A48', '#4A3A28'), side: G.planks('#6E5A3E'), front: p => { G.planks('#6E5A3E')(p); p.rect(4, 6, 8, 7, '#1A1A1A'); p.rect(3, 4, 10, 2, '#4A4A4A'); } }, Object.assign({}, AX, { cat: CAT.FUNC, use: 'furnace', facing: true }));
  B('chest', '상자', { top: p => { G.planks('#A2742E')(p); for (let i = 0; i < 16; i++) { p.set(i, 0, '#3A2810'); p.set(i, 15, '#3A2810'); p.set(0, i, '#3A2810'); p.set(15, i, '#3A2810'); } }, side: p => { G.planks('#A2742E')(p); for (let x = 0; x < 16; x++) { p.set(x, 5, '#3A2810'); p.set(x, 0, '#3A2810'); p.set(x, 15, '#3A2810'); } }, front: p => { G.planks('#A2742E')(p); for (let x = 0; x < 16; x++) { p.set(x, 5, '#3A2810'); p.set(x, 0, '#3A2810'); } p.rect(7, 4, 2, 4, '#C8C8C8'); p.set(7, 7, '#5A5A5A'); } }, Object.assign({}, AX, { hard: 2.5, cat: CAT.FUNC, use: 'chest', shape: 'box', box: [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16], facing: true }));
  B('barrel', '통', { top: p => { G.planks('#8A6A3E')(p); p.rect(5, 5, 6, 6, '#4A3218'); }, side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade('#8A6A3E', (x % 4 === 3 ? 0.75 : 1) * (0.94 + p.r() * 0.1))); for (let x = 0; x < 16; x++) { p.set(x, 2, '#3A3A3A'); p.set(x, 13, '#3A3A3A'); } } }, Object.assign({}, AX, { hard: 2.5, cat: CAT.FUNC, use: 'chest' }));
  B('bookshelf', '책장', { top: oakP, side: p => { G.planks('#A2834F')(p); const cols = ['#A0281E', '#2E5AA8', '#3A8A2A', '#8A6A1A', '#6A2A8A', '#D8D8C8']; for (const yy of [1, 9]) { p.rect(0, yy, 16, 6, '#3A2410'); let x = 1; while (x < 15) { const w = 1 + ((p.r() * 2) | 0), h = 4 + ((p.r() * 2) | 0), c = cols[(p.r() * cols.length) | 0]; p.rect(x, yy + 6 - h, w, h, c); x += w + (p.r() < 0.2 ? 1 : 0); } } } }, Object.assign({}, AX, { hard: 1.5, drop: 'book', dropN: [3, 3], cat: CAT.FUNC }));
  B('tnt', 'TNT', { top: p => { G.noise('#DB2F1F', 0.06)(p); p.rect(6, 6, 4, 4, '#3A3A3A'); p.set(7, 7, '#A0A0A0'); }, bottom: G.noise('#B8B0A0', 0.06), side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade('#DB2F1F', (x % 4 === 0 ? 0.8 : 1) * (0.95 + p.r() * 0.1))); p.rect(0, 5, 16, 6, '#F0EEE8'); const L = { T: ['111', '010', '010', '010'], N: ['101', '111', '111', '101'] }; let ox = 2; for (const ch of 'TNT') { const g = L[ch]; for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 3; xx++) if (g[yy][xx] === '1') p.set(ox + xx, 6 + yy, '#1A1A1A'); ox += 4; } } }, { hard: 0, sound: 'grass', cat: CAT.FUNC, tnt: true });
  B('note_block', '소리 블록', p => { G.planks('#6A4A2E')(p); p.rect(4, 4, 8, 8, '#3A2818'); p.rect(6, 5, 2, 5, '#1A1008'); p.rect(8, 5, 2, 1, '#1A1008'); }, Object.assign({}, AX, { hard: 0.8, cat: CAT.FUNC, use: 'note' }));
  B('jukebox', '주크박스', { top: p => { G.planks('#6A4A2E')(p); p.rect(3, 6, 10, 4, '#1A1008'); }, side: p => { G.planks('#6A4A2E')(p); for (let i = 0; i < 16; i++) { p.set(i, 0, '#3A2818'); p.set(i, 15, '#3A2818'); } } }, Object.assign({}, AX, { cat: CAT.FUNC, use: 'note' }));
  B('redstone_lamp', '레드스톤 램프', p => { G.noise('#5A3A20', 0.1)(p); for (let i = 0; i < 16; i++) { p.set(i, 0, '#3A2A18'); p.set(0, i, '#3A2A18'); p.set(15, i, '#3A2A18'); p.set(i, 15, '#3A2A18'); } for (let i = 3; i < 13; i++) for (let j = 3; j < 13; j++) if ((i + j) % 3 === 0) p.set(i, j, '#8A5A30'); }, { hard: 0.3, sound: 'glass', cat: CAT.FUNC, use: 'lamp' });
  B('redstone_lamp_on', '켜진 레드스톤 램프', p => { G.noise('#C8783A', 0.1)(p); for (let i = 0; i < 16; i++) { p.set(i, 0, '#6A3A18'); p.set(0, i, '#6A3A18'); p.set(15, i, '#6A3A18'); p.set(i, 15, '#6A3A18'); } for (let i = 3; i < 13; i++) for (let j = 3; j < 13; j++) if ((i + j) % 3 === 0) p.set(i, j, '#FFE0A0'); }, { hard: 0.3, sound: 'glass', cat: CAT.FUNC, use: 'lamp', light: 15, drop: 'redstone_lamp', noItem: true });
  B('target', '과녁', { top: G.noise('#E8DCC8', 0.06), side: p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); p.set(x, y, Math.floor(d / 2) % 2 ? '#E8DCC8' : '#D83A2A'); } } }, { hard: 0.5, tool: 'hoe', sound: 'grass', cat: CAT.FUNC });
  B('lodestone', '자석석', { top: G.chiseled('#8A8A8E'), side: p => { G.polished('#7A7A7E')(p); p.rect(0, 6, 16, 3, '#3A3A3E'); } }, Object.assign({}, P, { hard: 3.5, cat: CAT.FUNC }));
  B('respawn_anchor', '리스폰 정박기', { top: p => { G.speck('#0F0A18', 0.2, '#3B2754', 0.15)(p); p.rect(4, 4, 8, 8, '#6A2AB8'); }, side: p => { G.speck('#0F0A18', 0.2, '#3B2754', 0.15)(p); p.rect(0, 0, 16, 3, '#3A2A3E'); } }, { hard: 50, tool: 'pickaxe', tier: 3, req: true, light: 7, cat: CAT.FUNC });
  B('beacon', '신호기', p => { G.glass(null)(p); for (let i = 3; i < 13; i++) for (let j = 3; j < 13; j++) p.set(i, j, mix('#7AF0F0', '#E0FFFF', ((i * j) % 5) / 5)); }, { hard: 3, light: 15, render: 'cutout', sound: 'glass', cat: CAT.FUNC });
  B('enchanting_table', '마법부여대', { top: p => { G.speck('#1A1018', 0.2, '#3A2030', 0.2)(p); p.rect(3, 3, 10, 10, '#A0281E'); p.rect(4, 4, 8, 8, '#C8382A'); }, side: p => { G.speck('#0F0A18', 0.2, '#3B2754', 0.15)(p); p.rect(0, 0, 16, 4, '#A0281E'); for (let x = 0; x < 16; x += 3) p.set(x, 2, '#5DECF5'); } }, { hard: 5, tool: 'pickaxe', req: true, light: 7, shape: 'box', box: [0, 0, 0, 1, 12 / 16, 1], cat: CAT.FUNC });
  B('anvil', '모루', { top: p => { G.polished('#4A4A4A')(p); p.rect(3, 0, 10, 16, '#5A5A5A'); }, side: p => { G.polished('#3E3E3E')(p); } }, { hard: 5, tool: 'pickaxe', req: true, sound: 'metal', shape: 'box', box: [2 / 16, 0, 0, 14 / 16, 1, 1], cat: CAT.FUNC, gravity: true });
  B('smithing_table', '대장장이 작업대', { top: p => { G.polished('#3A3A48')(p); }, side: p => { G.planks('#4A3A2A')(p); p.rect(0, 0, 16, 4, '#3A3A48'); p.rect(2, 7, 4, 5, '#8A8A8A'); } }, Object.assign({}, AX, { cat: CAT.FUNC }));
  B('fletching_table', '화살 작업대', { top: G.planks('#C8B88A'), side: p => { G.planks('#8A6A3E')(p); p.rect(3, 4, 2, 9, '#E8E8E8'); p.rect(10, 4, 2, 9, '#E8E8E8'); } }, Object.assign({}, AX, { cat: CAT.FUNC }));
  B('cartography_table', '지도 제작대', { top: p => { G.planks('#6A4A2E')(p); p.rect(2, 2, 12, 12, '#D8C8A0'); p.rect(4, 5, 5, 4, '#6A9A4A'); }, side: G.planks('#5A3A1E') }, Object.assign({}, AX, { cat: CAT.FUNC }));
  B('loom', '베틀', { top: p => { G.planks('#C8A87A')(p); }, side: p => { G.planks('#8A6A3E')(p); for (let x = 2; x < 14; x += 2) for (let y = 4; y < 12; y++) p.set(x, y, '#E8E0D0'); } }, Object.assign({}, AX, { cat: CAT.FUNC }));
  B('spawner', '몬스터 생성기', p => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 4 === 0 || y % 4 === 0 || x === 15 || y === 15) p.set(x, y, shade('#2A3A4A', 0.8 + p.r() * 0.4)); }, Object.assign({}, P, { hard: 5, render: 'cutout', opacity: 0, drop: null, cat: CAT.FUNC, xp: [15, 43] }));
  const frog = [['ochre_froglight', '황토 개구리불', '#F5E8A8', '#D8B848'], ['verdant_froglight', '신록 개구리불', '#E0F5C8', '#7AB858'], ['pearlescent_froglight', '진주빛 개구리불', '#F5E0F0', '#C890C0']];
  for (const [n, k, a, b] of frog) B(n, k, { top: G.chiseled(a), side: p => { G.pillarSide(a)(p); for (let x = 0; x < 16; x++) { p.set(x, 0, b); p.set(x, 15, b); } } }, { hard: 0.3, light: 15, sound: 'glass', cat: CAT.FUNC });

  // --- light sources (box shape) ---
  B('torch', '횃불', { all: G.torch(), top: p => { p.fill('#FFD84A', 0.1); } }, { hard: 0, shape: 'box', box: [7 / 16, 0, 7 / 16, 9 / 16, 10 / 16, 9 / 16], light: 14, solid: false, sound: 'wood', cat: CAT.FUNC, attach: true, uvFull: true });
  B('soul_torch', '영혼 횃불', { all: G.torch('#7AF0F5', '#2AB8D8'), top: p => p.fill('#7AF0F5', 0.1) }, { hard: 0, shape: 'box', box: [7 / 16, 0, 7 / 16, 9 / 16, 10 / 16, 9 / 16], light: 10, solid: false, sound: 'wood', cat: CAT.FUNC, attach: true, uvFull: true });
  B('lantern', '랜턴', { all: p => { p.fill('#3A3A44', 0.1); p.rect(3, 3, 10, 10, '#FFC85A'); p.rect(5, 5, 6, 6, '#FFF0B0'); }, top: G.polished('#3A3A44') }, { hard: 3.5, tool: 'pickaxe', shape: 'box', box: [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16], light: 15, solid: false, sound: 'metal', cat: CAT.FUNC, attach: true });
  B('soul_lantern', '영혼 랜턴', { all: p => { p.fill('#3A3A44', 0.1); p.rect(3, 3, 10, 10, '#5AD8F0'); p.rect(5, 5, 6, 6, '#C0F8FF'); }, top: G.polished('#3A3A44') }, { hard: 3.5, tool: 'pickaxe', shape: 'box', box: [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16], light: 10, solid: false, sound: 'metal', cat: CAT.FUNC, attach: true });
  B('end_rod', '엔드 막대', p => { p.fill('#F5F0E8', 0.05); }, { hard: 0, shape: 'box', box: [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16], light: 14, solid: false, sound: 'wood', cat: CAT.FUNC });
  B('campfire', '모닥불', { top: p => { G.fire(false)(p, 1); }, side: p => { G.logSide('#6B5332')(p); for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) p.set(x, y, mix('#FFE15A', '#E8461A', y / 8), 255); } }, { hard: 2, tool: 'axe', shape: 'box', box: [0, 0, 0, 1, 7 / 16, 1], light: 15, sound: 'wood', cat: CAT.FUNC, damage: 'fire' });

  // --- slabs ---
  const slabs = [['stone', '돌'], ['cobblestone', '조약돌'], ['stone_bricks', '석재 벽돌'], ['smooth_stone', '매끄러운 돌'], ['sandstone', '사암'], ['bricks', '벽돌'], ['oak_planks', '참나무 판자'], ['spruce_planks', '가문비나무 판자'], ['birch_planks', '자작나무 판자'], ['dark_oak_planks', '짙은 참나무 판자'], ['quartz_block', '석영'], ['nether_bricks', '네더 벽돌'], ['deepslate_bricks', '심층암 벽돌'], ['blackstone', '흑암'], ['purpur_block', '퍼퍼'], ['prismarine', '프리즈머린'], ['mud_bricks', '진흙 벽돌'], ['cherry_planks', '벚나무 판자']];
  for (const [n, k] of slabs) {
    const src = BLOCKS[BID[n]];
    B(n.replace(/_block$|_planks$/, '').replace(/s$/, '') + '_slab', k + ' 반 블록', { top: src.faces.top, bottom: src.faces.bottom, side: src.faces.side }, { hard: src.hard, tool: src.tool, tier: src.tier, req: src.req, sound: src.sound, shape: 'box', box: [0, 0, 0, 1, 0.5, 1], opacity: 0, slabOf: n });
  }

  // --- fluids & special (no item) ---
  B('water', '물', { anim: [8, G.water(), 4] }, { hard: 100, shape: 'liquid', liquid: 'water', solid: false, render: 'trans', opacity: 2, noItem: true, drop: null, replaceable: true, sound: 'water' });
  B('lava', '용암', { anim: [8, G.lava(), 2] }, { hard: 100, shape: 'liquid', liquid: 'lava', solid: false, render: 'solid', opacity: 0, light: 15, noItem: true, drop: null, replaceable: true, sound: 'lava' });
  B('nether_portal', '네더 차원문', { anim: [8, G.portal(), 6] }, { hard: -1, shape: 'pane', solid: false, render: 'trans', opacity: 0, light: 11, noItem: true, drop: null, portal: 'nether' });
  B('end_portal', '엔드 차원문', { anim: [8, G.endPortal(), 3] }, { hard: -1, shape: 'box', box: [0, 0, 0, 1, 12 / 16, 1], solid: false, opacity: 0, light: 15, noItem: true, drop: null, portal: 'end' });
  B('fire', '불', { anim: [4, G.fire(false), 8] }, Object.assign({}, PLANT, { light: 15, noItem: true, drop: null, damage: 'fire', replaceable: true, cat: CAT.FUNC, sound: 'wool' }));
  B('soul_fire', '영혼 불', { anim: [4, G.fire(true), 8] }, Object.assign({}, PLANT, { light: 10, noItem: true, drop: null, damage: 'fire', replaceable: true, cat: CAT.FUNC, sound: 'wool' }));
  B('barrier_air', '보이지 않는 벽', p => p.clear(), { hard: -1, render: 'cutout', opacity: 0, noItem: true, drop: null });

  // ---------------- items ----------------
  const M = CAT.MISC;
  I('stick', '막대기', p => { p.clear(); for (let t = 0; t < 11; t++) { p.set(3 + t, 13 - t, '#8A6A3A'); p.set(4 + t, 13 - t, '#5C4422'); } });
  I('coal', '석탄', T2('raw', '#4A4A4A', '#2A2A2A', '#1A1A1A', { o: '#0A0A0A' }), { fuel: 8 });
  I('charcoal', '숯', T2('raw', '#5A4A3A', '#3A2E24', '#241C14', { o: '#0A0806' }), { fuel: 8 });
  I('raw_iron', '철 원석', T2('raw', '#E8C8A8', '#C8A080', '#8A6A50'));
  I('raw_copper', '구리 원석', T2('raw', '#F0A070', '#C86A40', '#6A9A70'));
  I('raw_gold', '금 원석', T2('raw', '#FFF080', '#F0C030', '#B8801A'));
  I('iron_ingot', '철 주괴', T2('ingot', '#FFFFFF', '#D8D8D8', '#A0A0A0'));
  I('copper_ingot', '구리 주괴', T2('ingot', '#F8A880', '#E07A50', '#A0503A'));
  I('gold_ingot', '금 주괴', T2('ingot', '#FFFFA0', '#F8D840', '#C89820'));
  I('netherite_ingot', '네더라이트 주괴', T2('ingot', '#6A6268', '#4A4246', '#2E282C'));
  I('iron_nugget', '철 조각', T2('nugget', '#FFFFFF', '#C8C8C8', '#8A8A8A'));
  I('gold_nugget', '금 조각', T2('nugget', '#FFFFA0', '#F8D840', '#C89820'));
  I('diamond', '다이아몬드', T2('gem', '#D0FFFF', '#5DECF5', '#1EAAB0'));
  I('emerald', '에메랄드', T2('gem', '#A0FFC0', '#17DD62', '#0A9A40'));
  I('lapis_lazuli', '청금석', T2('flint', '#5A8AF0', '#2350B8', '#183A8A'));
  I('redstone', '레드스톤 가루', T2('dust', '#FF5A4A', '#E0201A', '#8A0A0A'));
  I('quartz', '네더 석영', T2('shard', '#FFFFFF', '#ECE6DC', '#BDB4A8'));
  I('amethyst_shard', '자수정 조각', T2('shard', '#E0C8FF', '#A880E8', '#6A40B0'));
  I('netherite_scrap', '네더라이트 파편', T2('scrap', '#8A6A60', '#5E4038', '#3A2620'));
  I('flint', '부싯돌', T2('flint', '#6A6A6A', '#3A3A3A', '#222222'));
  I('string', '실', T2('string', '#FFFFFF', '#FFFFFF', '#FFFFFF', { o: '#E8E8E8' }));
  I('feather', '깃털', T2('feather', '#FFFFFF', '#E0E0E0', '#B0B0B0', { o: '#8A8A8A' }));
  I('leather', '가죽', T2('hide', '#C87A44', '#A85A2E', '#7A3E1E'));
  I('bone', '뼈', T2('bone', '#FFFFF0', '#E0DCC8', '#A8A490', { o: '#6A6658' }));
  I('bone_meal', '뼈다귀 가루', T2('dust', '#FFFFFF', '#E8E8E0', '#B8B8A8'));
  I('gunpowder', '화약', T2('dust', '#8A8A8A', '#5A5A5A', '#3A3A3A'));
  I('rotten_flesh', '썩은 살점', T2('meat', '#A07A4A', '#8A5A30', '#5A3A1A', { w: '#6A8A3A' }), { food: [4, 0.8] });
  I('ender_pearl', '엔더 진주', T2('sphere', '#4AE0C0', '#1A8A7A', '#0A4A40'), { stack: 16, throwable: 'pearl' });
  I('eye_of_ender', '엔더의 눈', T2('eye', '#7AF0C0', '#2AA080', '#106050', { d: '#2A6A20', k: '#0A0A0A' }), { throwable: 'eye' });
  I('blaze_rod', '블레이즈 막대', T2('rod', '#FFF080', '#F8C020', '#B87A10', { o: '#7A4A08' }), { fuel: 12 });
  I('blaze_powder', '블레이즈 가루', T2('dust', '#FFE060', '#F8A020', '#B86010'));
  I('ghast_tear', '가스트 눈물', T2('drop', '#FFFFFF', '#C8F0F0', '#80B0C0', { o: '#5A8090' }));
  I('glowstone_dust', '발광석 가루', T2('dust', '#FFF0A0', '#F0C860', '#B88A30'));
  I('clay_ball', '점토 덩어리', T2('sphere', '#C8CED8', '#A0A6B3', '#7A808C'));
  I('brick', '벽돌', T2('ingot', '#D8806A', '#A85A44', '#7A3A2A'));
  I('nether_brick', '네더 벽돌', T2('ingot', '#6A3A3A', '#4A2226', '#2A1214'));
  I('snowball', '눈덩이', T2('sphere', '#FFFFFF', '#F0F8F8', '#C8D8E0', { o: '#8AA0A8' }), { stack: 16, throwable: 'snowball' });
  I('slime_ball', '슬라임 볼', T2('slime', '#A0F080', '#70C850', '#4A9030', { k: '#2A5A1A' }));
  I('wheat_seeds', '밀 씨앗', T2('seeds', '#7AC850', '#4A9A30', '#2A6A1A'), { plant: 'wheat_crop' });
  I('wheat', '밀', T2('wheat', '#E8C860', '#B89030', '#7A5A10', { l: '#8AA040' }));
  I('sugar', '설탕', T2('dust', '#FFFFFF', '#F0F0F0', '#C8C8C8'));
  I('paper', '종이', T2('sheet', '#FFFFFF', '#E8E8E0', '#C8C8C0', { o: '#9A9A90' }));
  I('book', '책', T2('book', '#B8783A', '#8A5222', '#5A3412', { d: '#D8A060', w: '#F0F0E8' }));
  I('chorus_fruit', '후렴 과일', T2('sphere', '#C8A0D8', '#8A5A9A', '#5A3A6A'), { food: [4, 2.4] });
  I('popped_chorus_fruit', '튀긴 후렴 과일', T2('sphere', '#E8C8F0', '#C8A0D8', '#8A6A9A'));
  // food
  const F = CAT.FOOD;
  I('apple', '사과', T2('apple', '#FF6A5A', '#D8201A', '#8A0A0A', { d: '#5A3A1A', l: '#3A9A2A' }), { food: [4, 2.4], cat: F });
  I('golden_apple', '황금 사과', T2('apple', '#FFFFA0', '#F8D840', '#C89820', { d: '#5A3A1A', l: '#3A9A2A' }), { food: [4, 9.6], cat: F, regen: true });
  I('bread', '빵', T2('bread', '#E8B868', '#C8883A', '#8A5A1A'), { food: [5, 6], cat: F });
  I('porkchop', '익히지 않은 돼지고기', T2('meat', '#FFB0B0', '#F08A8A', '#C86060', { w: '#FFFFFF' }), { food: [3, 1.8], cat: F });
  I('cooked_porkchop', '익힌 돼지고기', T2('meat', '#E8B080', '#C8804A', '#8A5A2A', { w: '#FFF0D8' }), { food: [8, 12.8], cat: F });
  I('beef', '익히지 않은 소고기', T2('meat', '#F06A5A', '#C83A2A', '#8A1A1A', { w: '#F0E0D0' }), { food: [3, 1.8], cat: F });
  I('cooked_beef', '스테이크', T2('meat', '#A0603A', '#7A3A1E', '#4A200E', { w: '#E8C8A0' }), { food: [8, 12.8], cat: F });
  I('chicken', '익히지 않은 닭고기', T2('drumstick', '#FFD0C0', '#F0A898', '#C87A70', { w: '#FFFFFF' }), { food: [2, 1.2], cat: F });
  I('cooked_chicken', '익힌 닭고기', T2('drumstick', '#F0C080', '#D0904A', '#8A5A2A', { w: '#FFF0D8' }), { food: [6, 7.2], cat: F });
  I('mutton', '익히지 않은 양고기', T2('meat', '#E86A6A', '#C04040', '#8A2020', { w: '#FFFFFF' }), { food: [2, 1.2], cat: F });
  I('cooked_mutton', '익힌 양고기', T2('meat', '#C88A5A', '#9A5A30', '#6A3A18', { w: '#F0E0C8' }), { food: [6, 9.6], cat: F });
  I('melon_slice', '수박 조각', tpl(T.slice, { o: '#2A4A10', r: '#F0402A', d: '#2A1A0A', g: '#6EA82A' }), { food: [2, 1.2], cat: F });
  I('carrot', '당근', T2('carrot', '#FFB040', '#F08A1A', '#B05A0A', { l: '#3AA82A' }), { food: [3, 3.6], cat: F });
  I('potato', '감자', T2('potato', '#E8C878', '#C8A050', '#8A6A30'), { food: [1, 0.6], cat: F });
  I('baked_potato', '구운 감자', T2('potato', '#F8D888', '#D8A040', '#9A6A20'), { food: [5, 6], cat: F });
  I('sweet_berries', '달콤한 열매', tpl(T.berries, { o: '#5A0A0A', a: '#FF5A5A', b: '#D82020', c: '#8A0A0A', l: '#3A7A2A' }), { food: [2, 0.4], cat: F, plant: 'sweet_berry_bush' });
  I('cookie', '쿠키', T2('cookie', '#E8A860', '#C8883A', '#8A5A1A', { d: '#3A1A0A' }), { food: [2, 0.4], cat: F });
  I('bowl', '그릇', T2('bowl', '#A07A4A', '#7A5A30', '#5A3A1A', { w: '#3A2810' }));
  I('mushroom_stew', '버섯 스튜', T2('stew', '#A07A4A', '#C8904A', '#5A3A1A', { w: '#D8A060' }), { food: [6, 7.2], cat: F, stack: 1, leaves: 'bowl' });
  // tools
  const TL = CAT.TOOL;
  I('bucket', '양동이', T2('bucket', '#E8E8E8', '#B8B8B8', '#7A7A7A', { w: '#5A5A5A' }), { stack: 16, cat: TL, bucket: null });
  I('water_bucket', '물 양동이', T2('bucket', '#E8E8E8', '#B8B8B8', '#7A7A7A', { w: '#3A6AF0' }), { stack: 1, cat: TL, bucket: 'water' });
  I('lava_bucket', '용암 양동이', T2('bucket', '#E8E8E8', '#B8B8B8', '#7A7A7A', { w: '#F08A1A' }), { stack: 1, cat: TL, bucket: 'lava', fuel: 100 });
  I('flint_and_steel', '부싯돌과 부시', tpl(T.flintsteel, { o: '#3A3A3A', a: '#C8C8C8', f: '#2A2A2A', g: '#5A5A5A' }), { stack: 1, cat: TL, dur: 64, igniter: true });
  I('shears', '가위', tpl(T.shears, { o: '#3A3A3A', a: '#D8D8D8', k: '#7A4A2A' }), { stack: 1, cat: TL, tool: { type: 'shears', tier: 2, speed: 5, dmg: 1 }, dur: 238 });
  I('bow', '활', bowTex(), { stack: 1, cat: TL, bow: true, dur: 384 });
  I('arrow', '화살', tpl(T.arrow, { o: '#3A3A3A', a: '#C8C8C8', b: '#7A5A3A', f: '#F0F0F0' }), { cat: TL });
  const mats = [['wooden', '나무', '#A2834F', 0, 2, 0, 59], ['stone', '돌', '#8A8A8A', 1, 4, 1, 131], ['iron', '철', '#E0E0E0', 2, 6, 2, 250], ['golden', '금', '#F8D840', 0, 12, 0, 32], ['diamond', '다이아몬드', '#4AE0E0', 3, 8, 3, 1561], ['netherite', '네더라이트', '#5A5058', 4, 9, 4, 2031]];
  const toolKinds = [['pickaxe', '곡괭이', 2], ['axe', '도끼', 7], ['shovel', '삽', 2.5], ['sword', '검', 4], ['hoe', '괭이', 1]];
  for (const [m, mk, col, tier, speed, dmgB, dur] of mats) for (const [kind, kk, base] of toolKinds) {
    let dmg = kind === 'sword' ? 4 + dmgB : kind === 'axe' ? Math.min(9, 7 + dmgB * 0.5) : kind === 'pickaxe' ? 2 + dmgB : kind === 'shovel' ? 2.5 + dmgB : 1;
    if (m === 'golden') dmg = kind === 'sword' ? 4 : dmg;
    I(m + '_' + kind, mk + ' ' + kk, toolTex(kind, col), { stack: 1, cat: TL, tool: { type: kind, tier, speed, dmg }, dur });
  }
  // dyes
  DYES.forEach(([n, k, wool]) => I(n + '_dye', k + ' 염료', T2('dust', mix(wool, '#FFFFFF', 0.3), wool, shade(wool, 0.6)), { dye: n }));

  // item extras for blocks
  ITEMS[BID.oak_leaves].fuel = 0;
  for (const b of BLOCKS) if (b && (b.log || b.planks)) { if (ITEMS[b.id]) ITEMS[b.id].fuel = 1.5; }
  for (const b of BLOCKS) if (b && b.name.endsWith('_sapling') && ITEMS[b.id]) ITEMS[b.id].fuel = 0.5;
  ITEMS[IID.stick].fuel = 0.5;
  ITEMS[BID.coal_block].fuel = 80;
  ITEMS[BID.crafting_table].fuel = 1.5;
  for (const id in ITEMS) { const it = ITEMS[id]; if (it.tool && it.name.startsWith('wooden')) it.fuel = 1; }
}

// ---------------- recipes ----------------
const RECIPES = [];
const SMELT = {};
function R(pattern, key, out, n = 1) { RECIPES.push({ pattern, key, out, n }); }
function RS(list, out, n = 1) { RECIPES.push({ list, out, n }); }
function SM(input, out, xp = 0.1) { SMELT[input] = { out, xp }; }
function registerRecipes() {
  const woods = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
  for (const w of woods) { for (const l of [w + '_log', w + '_wood', 'stripped_' + w + '_log']) RS([l], w + '_planks', 4); R(['##', '##'], { '#': w + '_log' }, w + '_wood', 3); SM(w + '_log', 'charcoal', 0.15); }
  for (const w of ['crimson', 'warped']) { for (const l of [w + '_stem', w + '_hyphae', 'stripped_' + w + '_stem']) RS([l], w + '_planks', 4); }
  RS(['bamboo_block'], 'bamboo_planks', 2);
  R(['###', '###', '###'], { '#': 'bamboo' }, 'bamboo_block');
  R(['#', '#'], { '#': '#planks' }, 'stick', 4);
  R(['#', '#'], { '#': 'bamboo' }, 'stick', 1);
  R(['##', '##'], { '#': '#planks' }, 'crafting_table');
  R(['###', '# #', '###'], { '#': '#cobble' }, 'furnace');
  R(['###', '# #', '###'], { '#': '#planks' }, 'chest');
  R(['#-#', '# #', '#-#'], { '#': '#planks', '-': '#planks' }, 'barrel');
  R(['#', '|'], { '#': 'coal', '|': 'stick' }, 'torch', 4);
  R(['#', '|'], { '#': 'charcoal', '|': 'stick' }, 'torch', 4);
  R(['#', '|', 'S'], { '#': 'coal', '|': 'stick', S: 'soul_sand' }, 'soul_torch', 4);
  R(['NNN', 'N#N', 'NNN'], { N: 'iron_nugget', '#': 'torch' }, 'lantern');
  R(['NNN', 'N#N', 'NNN'], { N: 'iron_nugget', '#': 'soul_torch' }, 'soul_lantern');
  R([' S ', 'S#S', 'LLL'], { S: 'stick', '#': 'coal', L: '#log' }, 'campfire');
  // tools
  const tm = { wooden: '#planks', stone: '#cobble', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
  for (const m in tm) {
    const X = tm[m];
    R(['XXX', ' | ', ' | '], { X, '|': 'stick' }, m + '_pickaxe');
    R(['XX', 'X|', ' |'], { X, '|': 'stick' }, m + '_axe');
    R(['X', '|', '|'], { X, '|': 'stick' }, m + '_shovel');
    R(['X', 'X', '|'], { X, '|': 'stick' }, m + '_sword');
    R(['XX', ' |', ' |'], { X, '|': 'stick' }, m + '_hoe');
  }
  for (const k of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) RS(['diamond_' + k, 'netherite_ingot'], 'netherite_' + k);
  RS(['netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot'], 'netherite_ingot');
  // storage blocks
  const store = [['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'], ['diamond', 'diamond_block'], ['emerald', 'emerald_block'], ['coal', 'coal_block'], ['redstone', 'redstone_block'], ['lapis_lazuli', 'lapis_block'], ['netherite_ingot', 'netherite_block'], ['raw_iron', 'raw_iron_block'], ['raw_gold', 'raw_gold_block'], ['raw_copper', 'raw_copper_block'], ['wheat', 'hay_block'], ['bone_meal', 'bone_block'], ['slime_ball', 'slime_block'], ['copper_ingot', 'copper_block']];
  for (const [i, b] of store) { R(['###', '###', '###'], { '#': i }, b); RS([b], i, 9); }
  R(['###', '###', '###'], { '#': 'iron_nugget' }, 'iron_ingot'); RS(['iron_ingot'], 'iron_nugget', 9);
  R(['###', '###', '###'], { '#': 'gold_nugget' }, 'gold_ingot'); RS(['gold_ingot'], 'gold_nugget', 9);
  // 2x2 blocks
  const two = [['stone', 'stone_bricks', 4], ['sand', 'sandstone', 1], ['red_sand', 'red_sandstone', 1], ['sandstone', 'cut_sandstone', 4], ['red_sandstone', 'cut_red_sandstone', 4], ['granite', 'polished_granite', 4], ['diorite', 'polished_diorite', 4], ['andesite', 'polished_andesite', 4], ['cobbled_deepslate', 'polished_deepslate', 4], ['polished_deepslate', 'deepslate_bricks', 4], ['deepslate_bricks', 'deepslate_tiles', 4], ['brick', 'bricks', 1], ['nether_brick', 'nether_bricks', 1], ['glowstone_dust', 'glowstone', 1], ['snowball', 'snow_block', 1], ['clay_ball', 'clay', 1], ['quartz', 'quartz_block', 1], ['quartz_block', 'quartz_bricks', 4], ['end_stone', 'end_stone_bricks', 4], ['popped_chorus_fruit', 'purpur_block', 4], ['blackstone', 'polished_blackstone', 4], ['polished_blackstone', 'polished_blackstone_bricks', 4], ['basalt', 'polished_basalt', 4], ['string', 'white_wool', 1], ['amethyst_shard', 'amethyst_block', 1], ['copper_block', 'cut_copper', 4], ['packed_mud', 'mud_bricks', 4], ['honeycomb_block', 'honeycomb_block', 1], ['magma_block', 'magma_block', 1], ['nether_wart_block', 'red_nether_bricks', 1], ['dripstone_block', 'dripstone_block', 1], ['ice', 'packed_ice', 1]];
  for (const [i, o, n] of two) if (i !== o) R(['##', '##'], { '#': i }, o, n);
  R(['###', '###', '###'], { '#': 'ice' }, 'packed_ice'); R(['###', '###', '###'], { '#': 'packed_ice' }, 'blue_ice');
  R(['#', '#'], { '#': 'quartz_block' }, 'quartz_pillar', 2);
  R(['#', '#'], { '#': 'purpur_block' }, 'purpur_pillar', 2);
  R(['#', '#'], { '#': 'stone_brick_slab' }, 'chiseled_stone_bricks');
  R(['#', '#'], { '#': 'quartz_slab' }, 'chiseled_quartz_block');
  R(['#', '#'], { '#': 'sandstone_slab' }, 'chiseled_sandstone');
  RS(['cobblestone', 'moss_block'], 'mossy_cobblestone'); RS(['stone_bricks', 'moss_block'], 'mossy_stone_bricks');
  R(['CQ', 'QC'], { C: 'cobblestone', Q: 'quartz' }, 'diorite', 2); RS(['diorite', 'quartz'], 'granite'); RS(['diorite', 'cobblestone'], 'andesite', 2);
  RS(['dirt', 'gravel', 'dirt', 'gravel'], 'coarse_dirt', 4);
  RS(['mud', 'wheat'], 'packed_mud');
  R(['#S#', 'S#S', '#S#'], { '#': 'gunpowder', S: '#sand' }, 'tnt');
  R(['###', 'BBB', '###'], { '#': '#planks', B: 'book' }, 'bookshelf');
  RS(['paper', 'paper', 'paper', 'leather'], 'book');
  R(['###'], { '#': 'sugar_cane' }, 'paper', 3);
  RS(['sugar_cane'], 'sugar');
  R(['###'], { '#': 'wheat' }, 'bread');
  R(['# #', ' # '], { '#': '#planks' }, 'bowl', 4);
  RS(['brown_mushroom', 'red_mushroom', 'bowl'], 'mushroom_stew');
  R(['#C#'], { '#': 'wheat', C: 'brown_dye' }, 'cookie', 8);
  R(['###', '#A#', '###'], { '#': 'gold_ingot', A: 'apple' }, 'golden_apple');
  R(['# #', ' # '], { '#': 'iron_ingot' }, 'bucket');
  RS(['iron_ingot', 'flint'], 'flint_and_steel');
  R([' #', '# '], { '#': 'iron_ingot' }, 'shears');
  R([' #S', '# S', ' #S'], { '#': 'stick', S: 'string' }, 'bow');
  R(['F', '|', 'E'], { F: 'flint', '|': 'stick', E: 'feather' }, 'arrow', 4);
  RS(['ender_pearl', 'blaze_powder'], 'eye_of_ender');
  RS(['blaze_rod'], 'blaze_powder', 2);
  RS(['bone'], 'bone_meal', 3);
  RS(['pumpkin', 'shears'], 'carved_pumpkin');
  R(['P', 'T'], { P: 'carved_pumpkin', T: 'torch' }, 'jack_o_lantern');
  RS(['melon_slice', 'melon_slice', 'melon_slice', 'melon_slice', 'melon_slice', 'melon_slice', 'melon_slice', 'melon_slice', 'melon_slice'], 'melon');
  R(['###', '#R#', '###'], { '#': '#planks', R: 'redstone' }, 'note_block');
  R(['###', '#D#', '###'], { '#': '#planks', D: 'diamond' }, 'jukebox');
  R([' R ', 'RGR', ' R '], { R: 'redstone', G: 'glowstone' }, 'redstone_lamp');
  R([' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' }, 'enchanting_table');
  R(['III', ' i ', 'iii'], { I: 'iron_block', i: 'iron_ingot' }, 'anvil');
  R(['III', 'IFI', 'SSS'], { I: 'iron_ingot', F: 'furnace', S: 'smooth_stone' }, 'blast_furnace');
  R([' L ', 'LFL', ' L '], { L: '#log', F: 'furnace' }, 'smoker');
  R(['II', 'PP', 'PP'], { I: 'iron_ingot', P: '#planks' }, 'smithing_table');
  R(['FF', 'PP', 'PP'], { F: 'flint', P: '#planks' }, 'fletching_table');
  R(['pp', 'PP', 'PP'], { p: 'paper', P: '#planks' }, 'cartography_table');
  R(['SS', 'PP'], { S: 'string', P: '#planks' }, 'loom');
  R(['WWW', 'WEW', 'WWW'], { W: '#glass_any', E: 'eye_of_ender' }, 'end_rod', 4);
  R(['GGG', 'GSG', 'OOO'], { G: 'glass', S: 'nether_wart_block', O: 'obsidian' }, 'beacon');
  R(['SSS', 'SNS', 'SSS'], { S: 'chiseled_stone_bricks', N: 'netherite_ingot' }, 'lodestone');
  R(['CCC', 'GGG', 'CCC'], { C: 'crying_obsidian', G: 'glowstone' }, 'respawn_anchor');
  R([' R ', 'RHR', ' R '], { R: 'redstone', H: 'hay_block' }, 'target');
  R(['GG'], { G: 'glass' }, 'tinted_glass');
  R(['##'], { '#': 'moss_block' }, 'moss_carpet', 3);
  // slabs
  for (const b of BLOCKS) if (b && b.slabOf) R(['###'], { '#': b.slabOf }, b.name, 6);
  // dyes
  const dyeSrc = [['dandelion', 'yellow'], ['poppy', 'red'], ['red_tulip', 'red'], ['blue_orchid', 'light_blue'], ['allium', 'magenta'], ['azure_bluet', 'light_gray'], ['oxeye_daisy', 'light_gray'], ['white_tulip', 'light_gray'], ['orange_tulip', 'orange'], ['pink_tulip', 'pink'], ['cornflower', 'blue'], ['lily_of_the_valley', 'white'], ['wither_rose', 'black'], ['bone_meal', 'white'], ['lapis_lazuli', 'blue'], ['torchflower', 'orange'], ['coal', 'black'], ['brown_mushroom', 'brown']];
  for (const [s, d] of dyeSrc) RS([s], d + '_dye', s === 'lapis_lazuli' || s === 'coal' || s === 'brown_mushroom' ? 1 : 1);
  const mixes = [[['red', 'yellow'], 'orange', 2], [['green', 'white'], 'lime', 2], [['blue', 'green'], 'cyan', 2], [['blue', 'red'], 'purple', 2], [['black', 'white'], 'gray', 2], [['gray', 'white'], 'light_gray', 2], [['red', 'white'], 'pink', 2], [['purple', 'pink'], 'magenta', 2], [['blue', 'white'], 'light_blue', 2]];
  for (const [[a, b], o, n] of mixes) RS([a + '_dye', b + '_dye'], o + '_dye', n);
  for (const [d] of DYES) {
    if (d !== 'white') RS(['white_wool', d + '_dye'], d + '_wool');
    R(['##'], { '#': d + '_wool' }, d + '_carpet', 3);
    R(['GGG', 'GDG', 'GGG'], { G: 'glass', D: d + '_dye' }, d + '_stained_glass', 8);
    R(['TTT', 'TDT', 'TTT'], { T: 'terracotta', D: d + '_dye' }, d + '_terracotta', 8);
    RS([d + '_dye', 'sand', 'sand', 'sand', 'sand', 'gravel', 'gravel', 'gravel', 'gravel'], d + '_concrete_powder', 8);
    SM(d + '_terracotta', d + '_glazed_terracotta');
  }
  // smelting
  SM('raw_iron', 'iron_ingot', 0.7); SM('raw_gold', 'gold_ingot', 1); SM('raw_copper', 'copper_ingot', 0.7);
  SM('iron_ore', 'iron_ingot', 0.7); SM('gold_ore', 'gold_ingot', 1); SM('deepslate_iron_ore', 'iron_ingot', 0.7); SM('deepslate_gold_ore', 'gold_ingot', 1);
  SM('sand', 'glass'); SM('red_sand', 'glass'); SM('cobblestone', 'stone'); SM('stone', 'smooth_stone'); SM('clay_ball', 'brick', 0.3); SM('clay', 'terracotta', 0.35);
  SM('netherrack', 'nether_brick'); SM('cactus', 'green_dye', 1); SM('sandstone', 'smooth_sandstone'); SM('red_sandstone', 'smooth_red_sandstone'); SM('quartz_block', 'smooth_quartz');
  SM('stone_bricks', 'cracked_stone_bricks'); SM('cobbled_deepslate', 'deepslate'); SM('deepslate_bricks', 'cracked_deepslate_bricks'); SM('deepslate_tiles', 'cracked_deepslate_tiles'); SM('nether_bricks', 'cracked_nether_bricks');
  SM('ancient_debris', 'netherite_scrap', 2); SM('wet_sponge', 'sponge', 0.15); SM('chorus_fruit', 'popped_chorus_fruit'); SM('basalt', 'smooth_basalt');
  SM('porkchop', 'cooked_porkchop', 0.35); SM('beef', 'cooked_beef', 0.35); SM('chicken', 'cooked_chicken', 0.35); SM('mutton', 'cooked_mutton', 0.35); SM('potato', 'baked_potato', 0.35);
  SM('kelp', 'dried_kelp_block'); SM('coal_ore', 'coal'); SM('diamond_ore', 'diamond', 1); SM('lapis_ore', 'lapis_lazuli'); SM('redstone_ore', 'redstone'); SM('emerald_ore', 'emerald', 1);
  SM('nether_gold_ore', 'gold_ingot', 1); SM('nether_quartz_ore', 'quartz', 0.2);
}
// tag membership for recipe keys
function itemHasTag(id, tag) {
  const it = ITEMS[id]; if (!it) return false;
  const b = it.block ? BLOCKS[it.block] : null;
  switch (tag) {
    case '#planks': return !!(b && b.planks);
    case '#log': return !!(b && b.log && !b.planks);
    case '#cobble': return it.name === 'cobblestone' || it.name === 'cobbled_deepslate' || it.name === 'blackstone';
    case '#sand': return it.name === 'sand' || it.name === 'red_sand';
    case '#glass_any': return !!(b && b.glass);
  }
  return false;
}
function keyMatch(key, id) {
  if (!key) return !id;
  if (!id) return false;
  if (key[0] === '#') return itemHasTag(id, key);
  return IID[key] === id;
}
// grid: array of ids (0 empty), w x w
function matchRecipe(grid, w) {
  // bounding box
  let minX = w, minY = w, maxX = -1, maxY = -1, items = [];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (grid[y * w + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); items.push(grid[y * w + x]); }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.list) {
      if (r.list.length !== items.length) continue;
      const used = new Array(items.length).fill(false);
      let ok = true;
      for (const k of r.list) {
        let f = -1;
        for (let i = 0; i < items.length; i++) if (!used[i] && keyMatch(k, items[i])) { f = i; break; }
        if (f < 0) { ok = false; break; }
        used[f] = true;
      }
      if (ok) return r;
      continue;
    }
    const ph = r.pattern.length, pw = Math.max(...r.pattern.map(s => s.length));
    if (pw !== bw || ph !== bh) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < ph && ok; y++) for (let x = 0; x < pw && ok; x++) {
        const ch = (r.pattern[y][mirror ? pw - 1 - x : x] || ' ');
        const key = ch === ' ' ? null : r.key[ch];
        if (!keyMatch(key, grid[(minY + y) * w + minX + x])) ok = false;
      }
      if (ok) return r;
    }
  }
  return null;
}

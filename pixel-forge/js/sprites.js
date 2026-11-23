// sprites.js — 16x16 도트 스프라이트를 문자 지도로 정의하고 캔버스로 굽는 모듈
// a/b/c = 주 색(밝음/중간/어두움), d/e/f = 보조 색, g/h/i = 3번째 색 → 등급·희귀도별로 바꿔 칠해요.
'use strict';
(function () {
  const BASE = {
    k: '#1a1222', w: '#ffffff', s: '#f8c8a0', t: '#d08c64', r: '#e83838', y: '#ffd23a',
    l: '#5ac850', j: '#2e7a30', n: '#9a6232', m: '#52301a', x: '#a0a8b8', z: '#505868',
    p: '#ff88aa', u: '#4a8ae8', v: '#a8e0ff', q: '#6a2a8a', o: '#ff9a30',
    a: '#e8edf4', b: '#a4aebb', c: '#5a6474',
    d: '#5a9ad8', e: '#2a6ab0', f: '#1a3a70',
    g: '#9a6232', h: '#52301a', i: '#2a180c',
    J: '#f8c8a0', K: '#52301a', L: '#2a6ab0', // 영웅 장갑 · 벨트 · 목걸이
  };
  const DEFS = {};
  const def = (name, rows) => { DEFS[name] = rows; };

  // ---- 영웅 (투구 a-c, 갑옷 d-f, 신발 g-i) ----
  def('hero', [
    '................',
    '.....kkkkkk.....',
    '....kaaaaaak....',
    '...kaabbbbbak...',
    '...kbkkkkkkbk...',
    '...kkswswskk....',
    '....kssssssk....',
    '.....ktssttk....',
    '....kkdddddkk...',
    '...kJdeeLeedJk..',
    '...kJkdddddkJk..',
    '....kkdKKKdkk...',
    '.....kdddddk....',
    '.....kgk.kgk....',
    '....kghk.kghk...',
    '....kkkk.kkkk...',
  ]);
  def('hero_walk', [
    '................',
    '.....kkkkkk.....',
    '....kaaaaaak....',
    '...kaabbbbbak...',
    '...kbkkkkkkbk...',
    '...kkswswskk....',
    '....kssssssk....',
    '.....ktssttk....',
    '....kkdddddkk...',
    '...kJdeeLeedJk..',
    '...kJkdddddkJk..',
    '....kkdKKKdkk...',
    '.....kdddddk....',
    '....kgk...kgk...',
    '...kghk...kghk..',
    '...kkkk...kkkk..',
  ]);
  // 무기 (a-c 금속, n/m 손잡이) — 손에서 오른쪽 위로 뻗어요
  def('w_sword', [
    '.........kk',
    '........kak',
    '.......kabk',
    '......kabk.',
    '.....kabk..',
    '..k.kabk...',
    '..kkabk....',
    '...kck.....',
    '..kmkk.....',
    '.kmk.......',
    '.kk........',
  ]);
  def('w_axe', [
    '......kkk..',
    '.....kaaak.',
    '....kaabbk.',
    '....kkabcck',
    '.....kmkkk.',
    '....kmk....',
    '...kmk.....',
    '..kmk......',
    '.kmk.......',
    '.kk........',
  ]);
  def('w_staff', [
    '........kk.',
    '.......kaak',
    '.......kabk',
    '......kkbk.',
    '.....kmkk..',
    '....kmk....',
    '...kmk.....',
    '..kmk......',
    '.kmk.......',
    '.kk........',
  ]);

  // ---- 적 (a-c 몸 색) ----
  def('slime', [
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kkaaaakk....',
    '...kaawaaaaak...',
    '..kaawwaaaaaak..',
    '..kaaaaaaaaaak..',
    '.kaakkaaaakkaak.',
    '.kaakwaaaakwaak.',
    '.kbaaaaaaaaaabk.',
    '.kbbaaakkaaabbk.',
    '.kcbbbbbbbbbbck.',
    '..kccccccccccck.',
    '...kkkkkkkkkkk..',
  ]);
  def('bat', [
    '................',
    '................',
    '................',
    '..k..........k..',
    '.kck..kkkk..kck.',
    '.kbck.kaak.kcbk.',
    'kbbbckaaaakcbbbk',
    'kbbbbkawawkbbbbk',
    'kbbkbkaaaakbkbbk',
    'kbk.kkakkakk.kbk',
    'kk...kawwak...kk',
    '......kaak......',
    '.......kk.......',
    '................',
    '................',
    '................',
  ]);
  def('goblin', [
    '................',
    '................',
    '.....kkkkk......',
    'kk..kaaaaak..kk.',
    'kak.kaaaaaak.kak',
    '.kakaawaawaakak.',
    '..kkaakaakaakk..',
    '....kaaaaaak....',
    '....kakwwkak....',
    '.....kaaaak.....',
    '....knnnnnnk....',
    '...kankmmknak...',
    '...kakmnnmkak...',
    '....knnnnnnk....',
    '....kbk..kbk....',
    '....kkk..kkk....',
  ]);
  def('skeleton', [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...kwkkwwkkwk...',
    '...kwkkwwkkwk...',
    '....kwwkkwwk....',
    '.....kwkwkwk....',
    '......kkkkk.....',
    '....kkwkwkwkk...',
    '...kwkkwkwkkwk..',
    '...kk.kwwwk.kk..',
    '......kkwkk.....',
    '.....kwk.kwk....',
    '.....kwk.kwk....',
    '....kkkk.kkkk...',
  ]);
  def('ghost', [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '..kwwkkwwkkwwk..',
    '..kwwkkwwkkwwk..',
    '..kwwwwwwwwwwk..',
    '..kwwwwkkwwwwk..',
    '..kwwwkaakwwwk..',
    '..kwwwwkkwwwwk..',
    '..kwwwwwwwwwwk..',
    '..kawwwwwwwwak..',
    '..kaawwaawwaak..',
    '..kbaakbaakbak..',
    '..kbkk.kbk.kbk..',
    '..kk....k...kk..',
  ]);
  def('thief', [
    '................',
    '.....kkkkk......',
    '....kzzzzzk.....',
    '...kzzzzzzzk....',
    '...kzkkkkkzk....',
    '...kkswkswkk....',
    '....kssssskkkk..',
    '....kzzzzzknnnk.',
    '...kzzzzzzknynk.',
    '...kszzzzzsknnnk',
    '....kzzzzzk.kkk.',
    '....kzzkzzk.....',
    '....kzk.kzk.....',
    '...kzk...kzk....',
    '...kmk...kmk....',
    '...kkk...kkk....',
  ]);
  def('orc', [
    '................',
    '....kkkkkkk.....',
    '...kaaaaaaak....',
    '..kaaaaaaaaak...',
    '..kakkaaakkak...',
    '..kakrkaakrak...',
    '..kaaaaaaaaak...',
    '..kawkaaaakwk...',
    '..kaakkkkkaak...',
    '.kkkaaaaaaakkk..',
    'kbbknnnnnnnkbbk.',
    'kbbkmnnmnnmkbbk.',
    '.kkknnnnnnnkkk..',
    '...kbbk.kbbk....',
    '...kbbk.kbbk....',
    '..kkkkk.kkkkk...',
  ]);
  def('crown', [
    'k.k.k.k',
    'kykykyk',
    'kyyyyyk',
    'kyryryk',
    'kkkkkkk',
  ]);

  // ---- 장비 아이콘 (a-c = 등급 색) ----
  def('helm', [
    '................',
    '................',
    '.....kkkkkk.....',
    '....kaaaaaak....',
    '...kaaabbbbbk...',
    '..kaabbbbbbbbk..',
    '..kabbbbbbbbck..',
    '..kbkkkkkkkkck..',
    '..kbkk.kk.kkck..',
    '..kbkk.kk.kkck..',
    '..kbbkkkkkkcck..',
    '..kcbbk..kbcck..',
    '...kcck..kcck...',
    '....kk....kk....',
    '................',
    '................',
  ]);
  def('hood', [
    '................',
    '.......kk.......',
    '......kaak......',
    '.....kaabbk.....',
    '....kaabbbbk....',
    '...kaabbbbbbk...',
    '...kabkkkkbbk...',
    '..kabk....kbck..',
    '..kabk.ww.kbck..',
    '..kbbk....kbck..',
    '..kbbbkkkkbcck..',
    '.kbbbbbbbbbbcck.',
    '.kccccccccccccck',
    '..kkkkkkkkkkkkk.',
    '................',
    '................',
  ]);
  def('armor', [
    '................',
    '..kkkk....kkkk..',
    '.kaaabk..kbaaak.',
    '.kabbbkkkkbbbak.',
    '.kbbbbaaaabbbbk.',
    '.kkbbaaaaaabbkk.',
    '..kkbbaaaabbkk..',
    '...kbbbaabbbk...',
    '...kbbbbbbbbk...',
    '...kcbbyybbck...',
    '...kcbbbbbbck...',
    '...kccbbbbcck...',
    '...kcccccccck...',
    '....kkkkkkkk....',
    '................',
    '................',
  ]);
  def('robe', [
    '................',
    '.....kkkkkk.....',
    '....kaakkaak....',
    '...kaabkkbaak...',
    '..kaabbkkbbaak..',
    '..kabbbyybbbak..',
    '..kkbbbkkbbbkk..',
    '...kbbbkkbbbk...',
    '...kbbbyybbbk...',
    '..kbbbbkkbbbbk..',
    '..kbbbbkkbbbbk..',
    '.kcbbbbkkbbbbck.',
    '.kccccckkccccck.',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
  ]);
  def('glove', [
    '................',
    '................',
    '......kk.kk.....',
    '.....kakkakkk...',
    '.....kakkakkak..',
    '..kk.kakkakkak..',
    '.kakkkabkabkak..',
    '.kaabkabbabbak..',
    '..kabbbbbbbbak..',
    '..kabbbbbbbbbk..',
    '...kbbbbbbbbk...',
    '...kkkkkkkkkk...',
    '...kccccccccck..',
    '...kckckckckck..',
    '...kkkkkkkkkkk..',
    '................',
  ]);
  def('gauntlet', [
    '................',
    '.....kk.kk.kk...',
    '....kakkakkak...',
    '....kakkakkak...',
    '.kk.kabkabkab...',
    'kaakkabkabkabk..',
    'kabbkbbkbbkbbk..',
    '.kabbbbbbbbbbk..',
    '..kbbykbbykbbk..',
    '..kbbbbbbbbbbk..',
    '..kkkkkkkkkkkk..',
    '..kcccccccccck..',
    '..kcbbbbbbbbck..',
    '..kcccccccccck..',
    '..kkkkkkkkkkkk..',
    '................',
  ]);
  def('neck', [
    '................',
    '..kkk......kkk..',
    '.kxxk......kxxk.',
    '.kxk........kxk.',
    '.kxk........kxk.',
    '..kxk......kxk..',
    '...kxk....kxk...',
    '....kxkkkkxk....',
    '.....kkaakk.....',
    '....kaaaabbk....',
    '...kaawabbbck...',
    '...kaaabbbbck...',
    '....kbbbbcck....',
    '.....kbbcck.....',
    '......kkkk......',
    '................',
  ]);
  def('amulet', [
    '................',
    '......kkkk......',
    '.....kxkkxk.....',
    '.....kk..kk.....',
    '......kkkk......',
    '.....kaaaak.....',
    '....kaabbaak....',
    '...kaabwwbaak...',
    '...kabwkkwbak...',
    '...kabwkkwbck...',
    '...kaabwwbbck...',
    '....kabbbbck....',
    '.....kbbbck.....',
    '......kcck......',
    '.......kk.......',
    '................',
  ]);
  def('ring', [
    '................',
    '................',
    '......kkkk......',
    '.....kwaabk.....',
    '.....kaabbk.....',
    '......kkkk......',
    '.....kyyyyk.....',
    '....kykkkkyk....',
    '...kyk....kyk...',
    '...kyk....kok...',
    '...kyk....kok...',
    '....kyk..kok....',
    '.....kyyook.....',
    '......kkkk......',
    '................',
    '................',
  ]);
  def('ring2', [
    '................',
    '................',
    '.....kkkkkk.....',
    '....kaaaaabk....',
    '....kabwwbck....',
    '....kabkkbck....',
    '....kbbbbcck....',
    '.....kkkkkk.....',
    '....kxk..kzk....',
    '...kxk....kzk...',
    '...kxk....kzk...',
    '....kxk..kzk....',
    '.....kxxzzk.....',
    '......kkkk......',
    '................',
    '................',
  ]);
  def('sword', [
    '..............kk',
    '.............kak',
    '............kawk',
    '...........kabk.',
    '..........kabk..',
    '.........kabk...',
    '........kabk....',
    '..kk...kabk.....',
    '..kak.kabk......',
    '...kakabk.......',
    '....kcck........',
    '...kmkcak.......',
    '..kmk..kk.......',
    '.kyk............',
    '.kk.............',
    '................',
  ]);
  def('axe', [
    '................',
    '........kkkk....',
    '.......kaaaak...',
    '......kaawaabk..',
    '......kaaabbbk..',
    '......kkaabbbck.',
    '.......kmkbbcck.',
    '......kmk.kcck..',
    '.....kmk...kk...',
    '....kmk.........',
    '...kmk..........',
    '..kmk...........',
    '.kmk............',
    '.kk.............',
    '................',
    '................',
  ]);
  def('staff', [
    '...........kkk..',
    '..........kaaak.',
    '.........kawaabk',
    '.........kaaabck',
    '..........kbbck.',
    '.........kmkkk..',
    '........kmk.....',
    '.......kmk......',
    '......kmk.......',
    '.....kmk........',
    '....kmk.........',
    '...kmk..........',
    '..kmk...........',
    '.kmk............',
    '.kk.............',
    '................',
  ]);
  def('boots', [
    '................',
    '................',
    '....kkkkkk......',
    '....kaaabk......',
    '....kabbbk......',
    '....kkkkkk......',
    '....kabbbk......',
    '....kabbbk......',
    '....kabbbk......',
    '....kabbbkkkk...',
    '...kabbbbbbbak..',
    '...kabbbbbbbbk..',
    '...kccccccccck..',
    '...kkkkkkkkkkk..',
    '................',
    '................',
  ]);
  def('boots2', [
    '................',
    '................',
    '.....kkkkkk.....',
    '....kaaaabbk....',
    '....kkkkkkkk....',
    '....kabbbbck....',
    '....kabykbck....',
    '....kabbbbck....',
    '....kabbbbckkk..',
    '...kabbbbbbbbak.',
    '..kaabbbbbbbbbk.',
    '..kbbbbbbbbbbbk.',
    '..kckckckckckck.',
    '..kkkkkkkkkkkkk.',
    '................',
    '................',
  ]);
  def('belt', [
    '................',
    '................',
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kaaaakkkkaaaak.',
    '.kbbbbkyyykbbbk.',
    '.kbbbbkykykbbbk.',
    '.kbbbbkyyykbbbk.',
    '.kccccckkkcccck.',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]);
  def('belt2', [
    '................',
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kaaaaaaaaaaaak.',
    '.kbbkkbbbbkkbbk.',
    '.kbkaakbbkaakbk.',
    '.kbkabkbbkabkbk.',
    '.kbbkkbbbbkkbbk.',
    '.kccccccccccccck',
    '..kkkkkkkkkkkkk.',
    '.....kbk..kbk...',
    '.....kck..kck...',
    '.....kk....kk...',
    '................',
    '................',
  ]);
  def('horse', [
    '................',
    '..........kk....',
    '.........kaak...',
    '........kaaaak..',
    '.......kaawakk..',
    '..kkk.kaaaaaak..',
    '.kmmmkaaakkaak..',
    '.kmkkaaak..kk...',
    '..kkaaaaaaaak...',
    '...kaaaaaaaaak..',
    '...kbbbbbbbbbk..',
    '...kbk.....kbk..',
    '...kbk.....kbk..',
    '...kck.....kck..',
    '...kkk.....kkk..',
    '................',
  ]);
  def('wolfmount', [
    '................',
    '..........k.k...',
    '.........kakak..',
    '........kaaaaak.',
    '........kawaaakk',
    '..k.....kaaaaaak',
    '.kak...kaaaakkk.',
    '.kbak.kaaaaak...',
    '..kbkkaaaaaaak..',
    '...kaaaaaaaaak..',
    '...kbbbbbbbbbk..',
    '...kbk.....kbk..',
    '...kbk.....kbk..',
    '...kck.....kck..',
    '...kkk.....kkk..',
    '................',
  ]);

  // ---- 재화·UI 아이콘 ----
  def('coin', [
    '................',
    '................',
    '....kkkkkkkk....',
    '...kyyyyyyyyk...',
    '..kyykykkykyyk..',
    '..kykyykkyykyk..',
    '..kyykyyyykyyk..',
    '..kyyykkkkyyyk..',
    '..kykyyyyyykyk..',
    '..kyyyyyyyyyok..',
    '..kokkkkkkkkok..',
    '...kooooooook...',
    '....kkkkkkkk....',
    '................',
    '................',
    '................',
  ]);
  def('hammer', [
    '................',
    '................',
    '...kkkkkkk......',
    '..kxxxxxxxk.....',
    '..kxwwxxxxkk....',
    '..kxxxxxxxzk....',
    '..kzzzzzzzzk....',
    '...kkkknkkk.....',
    '......knk.......',
    '.......knk......',
    '........knk.....',
    '.........knk....',
    '..........knk...',
    '...........kmk..',
    '............kk..',
    '................',
  ]);
  def('ticket', [
    '................',
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.klllllllllljlk.',
    'kllwlllllllljllk',
    '.kllllyylllljlk.',
    '..kllyyyylljlk..',
    '.kllllyylllljlk.',
    'kllllllllllljllk',
    '.klllllllllljlk.',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
    '................',
    '................',
  ]);
  def('egg', [
    '................',
    '.......kk.......',
    '......kaak......',
    '.....kawaak.....',
    '....kawaaaak....',
    '....kaaadaak....',
    '...kaadddaaak...',
    '...kaaadaaaak...',
    '...kaaaaaadak...',
    '...kbaaaaddbk...',
    '...kbbaaaadbk...',
    '....kbbbbbbk....',
    '....kcbbbbck....',
    '.....kccccck....',
    '......kkkk......',
    '................',
  ]);
  def('egg_a1', [ // ★1 세대 알: 줄무늬와 별
    '................',
    '.......kk.......',
    '......kaak......',
    '.....kawaak.....',
    '....kawaaaak....',
    '....kddddddk....',
    '...kaaaaaaaak...',
    '...kaaayaaaak...',
    '...kaayyyaaak...',
    '...kbbaybbbbk...',
    '...kddddddddk...',
    '....kbbbbbbk....',
    '....kcbbbbck....',
    '.....kccccck....',
    '......kkkk......',
    '................',
  ]);
  def('egg_a2', [ // ★2 이상 세대 알: 왕관과 보석
    '.....k.kk.k.....',
    '.....kykkyk.....',
    '.....kyyyyk.....',
    '.....kkkkkk.....',
    '....kawaaaak....',
    '...kawaaaaaak...',
    '...kaaaddaaak...',
    '...kaadwwdaak...',
    '...kaadwwdaak...',
    '...kbaaddaabk...',
    '...kbbaaaabbk...',
    '....kbbbbbbk....',
    '....kcbbbbck....',
    '.....kccccck....',
    '......kkkk......',
    '................',
  ]);
  def('key', [
    '................',
    '................',
    '....kkkk........',
    '...kaaaak.......',
    '..kakkkbak......',
    '..kak..kbk......',
    '..kbk..kbk......',
    '..kbbkkbbk......',
    '...kbbbbkkkkkkk.',
    '....kkkkbbbbbbck',
    '.........kckkck.',
    '.........kck.kk.',
    '..........k.....',
    '................',
    '................',
    '................',
  ]);
  def('anvil', [
    '................................',
    '................................',
    '......kkkkkkkkkkkkkkkkkkkk......',
    '.....kxxxxxxxxxxxxxxxxxxxxkkkk..',
    '.....kxwwwwxxxxxxxxxxxxxxxxxxxk.',
    '.....kxxxxxxxxxxxxxxxxxxxxxkkk..',
    '.....kzzzzzzzzzzzzzzzzzzzzk.....',
    '......kkkkkzzzzzzzzzzkkkkk......',
    '..........kzzzzzzzzzzk..........',
    '..........kzzzzzzzzzzk..........',
    '.........kzzzzzzzzzzzzk.........',
    '.......kkxxxxxxxxxxxxxxkk.......',
    '......kxxxxxxxxxxxxxxxxxxk......',
    '......kzzzzzzzzzzzzzzzzzzk......',
    '......kkkkkkkkkkkkkkkkkkkk......',
    '................................',
  ]);
  def('h_wing', [
    '....kk',
    '..kkwk',
    '.kwwwk',
    'kwwwwk',
    'kwwwk.',
    '.kwwk.',
    '..kk..',
  ]);
  def('star', [
    '...kk...',
    '..kyyk..',
    'kkkyykkk',
    'kyyyyyyk',
    '.kyyyyk.',
    '.kykkyk.',
    'kyk..kyk',
    'kk....kk',
  ]);
  def('lock', [
    '..kkkk..',
    '.kxkkxk.',
    '.kk..kk.',
    'kkkkkkkk',
    'kyyyyyyk',
    'kyykkyyk',
    'kyyyyyyk',
    'kkkkkkkk',
  ]);

  // ---- 스킬 아이콘 (12x12) ----
  def('sk_slash', ['.........kk.', '........kwk.', '.......kwk..', '...kk.kwk...', '..kwwkwk....', '.kw..wk.....', '.kw..kw.....', '..k...wk....', '.......wk...', '........k...']);
  def('sk_rock', ['............', '....kkkk....', '...kxxxxk...', '..kxwxxxzk..', '..kxxxxzzk..', '..kxxxzzzk..', '..kzxzzzzk..', '...kzzzzk...', '....kkkk....']);
  def('sk_heal', ['............', '....kkkk....', '....kllk....', '....kllk....', '.kkkkllkkkk.', '.kllllllllk.', '.kllllllllk.', '.kkkkllkkkk.', '....kllk....', '....kllk....', '....kkkk....']);
  def('sk_arrow', ['.........kkk', '..k......kwk', '.kwk....kwk.', '..kwk..kwk..', '...kk.kwk...', '.k...kwk....', 'kwk.kwk..k..', '.kwkwk..kwk.', '..kwk....kwk', '..k.......k.']);
  def('sk_fire', ['.....k......', '....kok.....', '...koyk.k...', '...koyykok..', '..koyyyyok..', '..koywwyok..', '.koyywwyyok.', '.koyyyyyyok.', '..koyyyyok..', '...kooook...', '....kkkk....']);
  def('sk_shield', ['..kkkkkkkk..', '.kvvvvvvvvk.', '.kvwwvvvvuk.', '.kvwvvvvvuk.', '.kvvvvvvvuk.', '.kvvvvvvuuk.', '..kvvvvvuk..', '..kvvvvuuk..', '...kvvuuk...', '....kuuk....', '.....kk.....']);
  def('sk_bolt', ['......kkkk..', '.....kyyyk..', '....kyyyk...', '...kyyyk....', '..kyyyykkk..', '..kkkyyyyk..', '....kyyyk...', '...kyyk.....', '..kyyk......', '..kyk.......', '..kk........']);
  def('sk_ice', ['.....kk.....', '....kvvk....', '....kvwk....', '...kvvwvk...', '...kvvvvk...', '...kuvvuk...', '...kuvvuk...', '....kuuk....', '....kuuk....', '.....kk.....']);
  def('sk_rage', ['..kkkkkkk...', '.krrrrrrrk..', 'krwrkrkrrrk.', 'krrrkrkrrrk.', 'krrrrrrrrrk.', '.krrrrrrrrk.', '..krrrrrrk..', '..krrrrrk...', '...kkkkk....']);
  def('sk_meteor', ['k...........', '.k..........', '..k.k.......', '...k.kkk....', '....koyyk...', '...koyyyyk..', '...kyywyyk..', '...kyyyyyk..', '...koyyyok..', '....kooook..', '.....kkkk...']);
  def('sk_wind', ['..kkkkkkk...', '.kvvvvvvvk..', '..kkkkkvvk..', '.kvvvvvvk...', '.kvkkkkk....', '..kvvvvvk...', '...kkkkvvk..', '....kvvvk...', '.....kvk....', '......k.....']);
  def('sk_vamp', ['.kk......kk.', 'krrk....krrk', 'krrrkkkkrrrk', '.krrrrrrrrk.', '..krwrrwrk..', '..krrrrrrk..', '...kwkkwk...', '...kw..wk...', '...k....k...']);
  def('sk_breath', ['............', 'kkk.........', 'kook.kk.....', 'koyykook.k..', 'koyyyyyokok.', 'kowwwyyyyyok', 'koyyyyyokok.', 'koyykook.k..', 'kook.kk.....', 'kkk.........']);
  def('sk_hammer', ['.kkkkkkk....', 'kyyyyyyyk...', 'kywwyyyyk...', 'kyyyyyyyk...', '.kkkknkkk...', '....knk.....', '....knk.....', '....knk.....', '....knk.....', '....kmk.....', '....kkk.....']);
  def('sk_cry', ['.....kk.....', '....koyk....', '...koyyk.k..', '..koyyyk..k.', '.koyyyyk.k.k', '.koyyyyk.k.k', '..koyyyk..k.', '...koyyk.k..', '....koyk....', '.....kk.....']);
  def('sk_holy', ['.....kk.....', '....kwwk....', '....kwyk....', '....kwyk....', '....kwyk....', '....kwyk....', '..kkkwykkk..', '..kyyyyyyk..', '...kkmmkk...', '.....mm.....', '.....kk.....']);
  def('sk_hole', ['...kkkkkk...', '..kqqqqqqk..', '.kqkkkkkqqk.', '.kqkqqqkkqk.', '.kqkqkkqkqk.', '.kqkqkqqkqk.', '.kqkkqqkqqk.', '.kqqkkkkqk..', '..kqqqqqqk..', '...kkkkkk...']);
  def('sk_angel', ['....kkkk....', '...kyyyyk...', '....kkkk....', '.kk......kk.', 'kwwk.kk.kwwk', 'kwwwkwwkwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwk.kwwk.', '...kk...kk..']);

  // ---- 펫 모양 (a-c = 몸 색) ----
  def('p_rodent', ['............', '............', '..kk...kk...', '.kpak.kpak..', '.kaaakaaak..', '..kawaawak..', '..kaakkaak..', '.kaaaapaaak.', 'kaaaaaaaaak.', 'kbaaaaaaabkk', '.kbbbbbbbk.k', '..kk...kk...']);
  def('p_bird', ['............', '....kkkk....', '...kaaaak...', '..kaawkaak..', '..kaakkaakyk', '..kaaaaaakk.', '.kbaaaaaak..', 'kbbkaaaaak..', 'kbbbkaaabk..', '.kkbbbbbk...', '...kykyk....', '...kk.kk....']);
  def('p_slime', ['............', '............', '............', '....kkkk....', '..kkaaaakk..', '.kawaaaaaak.', '.kaakaakaak.', 'kaaakaakaaak', 'kbaaaaaaaabk', 'kbbaakkaabbk', '.kcbbbbbbck.', '..kkkkkkkk..']);
  def('p_wolf', ['............', '.k.k........', 'kakak.......', 'kaaaakk.....', 'kawaaaak....', 'kaaaakaak..k', '.kkkaaaaak.k', '...kaaaaaakb', '...kaaaaaaak', '...kbbbbbbbk', '...kbk..kbk.', '...kkk..kkk.']);
  def('p_turtle', ['............', '............', '....kkkkk...', '...kbcbcbk..', '..kbcbcbcbkk', '..kcbcbcbcka', '.kkkkkkkkkak', 'kaak....kawk', '.kak....kaak', '.kkk....kkk.']);
  def('p_cat', ['............', '.k...k......', 'kak.kak.....', 'kaakaak.....', 'kawaawak...k', 'kaakkaak..ka', '.kaaaak..kak', '..kaaaakkak.', '..kaaaaaaak.', '..kbbbbbbbk.', '..kbk..kbk..', '..kkk..kkk..']);
  def('p_golem', ['....kkkk....', '...kaaaak...', '...kayyak...', '.kkkaaaakkk.', 'kaakbbbbkaak', 'kabkbaabkbak', 'kabkbbbbkbak', 'kkkkbbbbkkkk', '...kbbbbk...', '..kbbkkbbk..', '..kcck.kcck.', '..kkkk.kkkk.']);
  def('p_horse', ['.......kyk..', '......kkkk..', '......kaaak.', '.....kawaak.', '.kk..kaaaak.', 'kmmkkaakkk..', 'kmkaaaak....', '.kaaaaaaak..', '.kaaaaaaaak.', '.kbbbbbbbbk.', '.kbk....kbk.', '.kkk....kkk.']);
  def('p_dragon', ['..k......k..', '.kak....kak.', 'kbbak..kabbk', 'kbbbakkabbbk', '.kbbaaaabbk.', '..kaawwaak..', '..kaakkaak..', '..kaaaaaakk.', '.kaaaaaaaakb', '.kbaaaaaabk.', '..kbk..kbk..', '..kkk..kkk..']);

  // ---- 배경 소품 ----
  def('tree', [
    '.....kkkkk......',
    '...kklllllkk....',
    '..klllllllllk...',
    '.kllwllllllllk..',
    '.kllllllllljlk..',
    'klllllllllljjlk.',
    'kllllllllljjjlk.',
    '.kjlllllljjjjk..',
    '..kkjjjjjjjkk...',
    '....kkknkkk.....',
    '......knk.......',
    '......knk.......',
    '.....knnmk......',
    '....knnnmmk.....',
    '....kkkkkkk.....',
  ]);
  def('rock', ['.....kkkk...', '...kkxxxxk..', '..kxwxxxxzk.', '.kxxxxxxzzk.', 'kxxxxxxzzzzk', 'kzzzzzzzzzzk', '.kkkkkkkkkk.']);
  def('bush', ['...kkk.kkk..', '..klllkllljk', '.kllwlllljjk', 'kllllllljjjk', 'kjjjjjjjjjjk', '.kkkkkkkkkk.']);
  def('grass', ['.k...k.', 'kjk.kjk', 'kjkkjk.', '.kjjk..']);

  // ---- 굽기 ----
  const cache = new Map();
  function bake(name, pal, flip) {
    const key = name + '|' + (pal ? pal.join(',') : '') + (flip ? '|f' : '');
    let c = cache.get(key);
    if (c) return c;
    const rows = DEFS[name];
    if (!rows) throw new Error('sprite ' + name);
    const w = Math.max.apply(null, rows.map(r => r.length)), h = rows.length;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const P = Object.assign({}, BASE);
    if (pal) 'abcdefghiJKL'.split('').forEach((ch, i) => { if (pal[i]) P[ch] = pal[i]; });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (!ch || ch === '.') continue;
      g.fillStyle = P[ch] || '#f0f';
      g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
    cache.set(key, c);
    return c;
  }
  // 승천 장비 아이콘 (22x22): 원래 아이콘에 세대별 장식을 덧그려요
  const ASC_OUTLINE = [null, '#8a5a00', '#a06a00', '#6a1a8a', '#4a0a7a', '#7a0a3a'];
  const WING = ['..www', '.wwwk', 'wwwk.', 'wwk..', 'wk...'];
  const GEM = ['.u.', 'uvu', '.u.'];
  const FLAME = ['.o.', 'oyo', 'oyo'];
  function stamp(g, rows, x, y, P, flip) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue; g.fillStyle = P[ch]; g.fillRect(x + (flip ? r.length - 1 - i : i), y + j, 1, 1); } });
  }
  function bakeAsc(name, pal, asc) {
    if (!asc) return bake(name, pal);
    const key = 'A|' + name + '|' + (pal || []).join(',') + '|' + asc;
    let c = cache.get(key);
    if (c) return c;
    const base = bake(name, pal);
    c = document.createElement('canvas');
    c.width = 22; c.height = 22;
    const g = c.getContext('2d');
    const P = Object.assign({}, BASE, { u: asc >= 4 ? '#d65aff' : '#ff4a6a', v: '#ffffff' });
    if (asc >= 2) { stamp(g, WING, 0, 4, P); stamp(g, WING, 17, 4, P, true); }
    g.drawImage(base, 3, 4);
    // 외곽선 색 바꾸기
    const im = g.getImageData(0, 0, 22, 22), d = im.data, oc = ASC_OUTLINE[Math.min(asc, 5)];
    const r0 = parseInt(oc.slice(1, 3), 16), g0 = parseInt(oc.slice(3, 5), 16), b0 = parseInt(oc.slice(5, 7), 16);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] === 0x1a && d[i + 1] === 0x12 && d[i + 2] === 0x22) { d[i] = r0; d[i + 1] = g0; d[i + 2] = b0; }
    g.putImageData(im, 0, 0);
    stamp(g, GEM, 16, 16, P);
    if (asc >= 3) g.drawImage(bake('crown'), 7, 0);
    if (asc >= 4) { stamp(g, GEM, 3, 16, P); stamp(g, GEM, 3, 5, P); stamp(g, GEM, 16, 5, P); }
    if (asc >= 5) { stamp(g, FLAME, 6, 19, P); stamp(g, FLAME, 10, 19, P); stamp(g, FLAME, 14, 19, P); }
    cache.set(key, c);
    return c;
  }
  function urlAsc(name, pal, asc, scale) {
    if (!asc) return url(name, pal, scale);
    scale = scale || 4;
    const key = 'A|' + name + '|' + (pal || []).join(',') + '|' + asc + '|' + scale;
    let u = urlCache.get(key);
    if (u) return u;
    const src = bakeAsc(name, pal, asc), c = document.createElement('canvas');
    c.width = src.width * scale; c.height = src.height * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    u = c.toDataURL();
    urlCache.set(key, u);
    return u;
  }
  // 흰색 실루엣(피격 번쩍임용)
  const flashCache = new Map();
  function flash(name, pal, flip) {
    const src = bake(name, pal, flip), key = src;
    let c = flashCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    flashCache.set(key, c);
    return c;
  }
  // DOM용 확대 이미지(data URL)
  const urlCache = new Map();
  function url(name, pal, scale) {
    scale = scale || 4;
    const key = name + '|' + (pal ? pal.join(',') : '') + '|' + scale;
    let u = urlCache.get(key);
    if (u) return u;
    const src = bake(name, pal);
    const c = document.createElement('canvas');
    c.width = src.width * scale; c.height = src.height * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    u = c.toDataURL();
    urlCache.set(key, u);
    return u;
  }
  // 희귀도 색 3단(밝음/중간/어두움) 만들기
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
  }
  const tri = hex => [shade(hex, 1.15), hex, shade(hex, 0.55)];

  window.Sprites = { bake, bakeAsc, flash, url, urlAsc, tri, shade, has: n => !!DEFS[n] };
})();

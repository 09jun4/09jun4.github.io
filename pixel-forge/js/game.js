// game.js — 상태·저장, 능력치, 대장간·뽑기·부화·던전 규칙, 자동 전투와 픽셀 렌더링
'use strict';
(function () {
  const G = window.Game = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const now = () => Date.now();
  function rollIndex(weights) { // 가중치 배열 → 뽑힌 인덱스
    let s = 0; weights.forEach(w => { s += w; });
    let x = Math.random() * s;
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
    return weights.length - 1;
  }
  G.rollIndex = rollIndex;

  // ======================= 저장 =======================
  const GUEST_KEY = 'pixel-forge:guest';
  const keyDay = () => new Date(now() - PF.KEY_RESET_HOUR * 3600000).toDateString(); // 09:00 기준 날짜

  function newSave() {
    const dun = {};
    PF.DUNGEONS.forEach(d => { dun[d.id] = { lvl: 0, keys: PF.KEYS_PER_DAY }; });
    return {
      v: 1, crowns: 0, hammers: 60, tickets: 0, eggs: 0,
      forge: { lvl: 1, gauge: 0, crafts: 0, asc: 0 },
      equip: {}, nextId: 1,
      stage: { d: 0, c: 1, s: 1 }, best: 0, farming: false,
      skills: {}, skillEq: [null, null, null], skillSum: { lvl: 1, cnt: 0 }, skillAsc: 0, autoSkill: true,
      petInv: [], nextPet: 1, petEq: [null, null, null], petSum: { lvl: 1, cnt: 0 }, asc: 0,
      eggBox: [0, 0, 0, 0, 0, 0], incub: [null, null], // eggBox: 등급별 알 보관 개수(무제한)
      dun, keyDay: keyDay(),
      auto: { minTier: 7, better: true },
      snd: { sfx: true, bgm: true }, mult: { skill: 5, pet: 1 },
      grand: 0, // 플레이 진행도(게스트 이전 판단용)
      bestWave: 0, nick: '', // 랭킹: 지금까지 도달한 웨이브 수, 직접 정한 닉네임
    };
  }
  G.newSave = newSave;
  function fix(s) { // 예전 저장·빈 칸 보정
    const d = newSave();
    Object.keys(d).forEach(k => { if (s[k] === undefined) s[k] = d[k]; });
    PF.DUNGEONS.forEach(x => { if (!s.dun[x.id]) s.dun[x.id] = d.dun[x.id]; });
    while (s.incub.length < 2) s.incub.push(null);
    if (s.forge.asc == null) s.forge.asc = 0;
    // 예전 저장 이전: 펫 도감(id별 레벨) → 펫 개체, 알 대기열 → 등급별 보관함
    if (s.pets) {
      const map = {};
      Object.keys(s.pets).forEach(id => { const u = s.nextPet++; map[id] = u; s.petInv.push({ u, id, lvl: s.pets[id].lvl, asc: s.asc || 0 }); });
      s.petEq = s.petEq.map(id => map[id] || null);
      delete s.pets;
    }
    if (s.eggQ) { s.eggQ.forEach(r => { s.eggBox[r]++; }); delete s.eggQ; }
    Object.keys(s.skills).forEach(id => { if (s.skills[id].asc == null) s.skills[id].asc = s.skillAsc || 0; });
    s.petInv.forEach(p => { if (p.asc == null) p.asc = s.asc || 0; });
    return s;
  }
  function readLocal(key) {
    try { const t = localStorage.getItem(key); return t ? fix(JSON.parse(t)) : null; } catch (e) { return null; }
  }

  const Store = G.Store = { uid: null, writer: null, status: 'local', dirty: false, lastCloud: 0 };
  G.S = readLocal(GUEST_KEY) || newSave();

  Store.save = function () {
    const S = G.S;
    S.t = now();
    try {
      localStorage.setItem(Store.uid ? 'pixel-forge:u:' + Store.uid : GUEST_KEY, JSON.stringify(S));
    } catch (e) { console.warn('[PF] local save failed', e); G.toast('브라우저 저장 공간이 부족해요'); }
    Store.dirty = true;
  };
  // 계정 저장은 8초마다 몰아서 올려요(쓰기 횟수 절약). 실패하면 다음 기회에 다시 시도.
  Store.flush = function (force) {
    if (!Store.writer || !Store.dirty) return;
    if (!force && now() - Store.lastCloud < 8000) return;
    Store.dirty = false; Store.lastCloud = now();
    Store.writer.set(G.S).then(() => { Store.status = 'synced'; G.emit('store'); }, e => {
      console.error('[PF] cloud save failed', e);
      Store.dirty = true; Store.status = 'error'; G.emit('store');
    });
  };
  // 로그인: 서버 저장이 있으면 그것을, 없으면(첫 로그인) 게스트 진행을 계정으로 옮기고 게스트 칸을 비워요.
  Store.attach = function (uid, remote, writer) {
    Store.save();
    Store.uid = uid; Store.writer = writer;
    if (remote) {
      G.S = fix(remote);
    } else {
      const guest = readLocal(GUEST_KEY) || G.S;
      G.S = guest;
      try { localStorage.removeItem(GUEST_KEY); } catch (e) { /* 무시 */ }
      Store.dirty = true; Store.flush(true);
    }
    Store.status = 'synced';
    G.reset();
  };
  // 로그아웃: 계정 저장을 올리고 게스트 상태로 돌아가요.
  Store.detach = function () {
    Store.flush(true);
    Store.uid = null; Store.writer = null; Store.status = 'local';
    G.S = readLocal(GUEST_KEY) || newSave();
    G.reset();
  };
  setInterval(() => { Store.save(); Store.flush(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Store.save(); Store.flush(true); } });

  // 이벤트(화면 갱신용)
  const ls = {};
  G.on = (n, f) => { (ls[n] = ls[n] || []).push(f); };
  G.emit = (n, a) => { (ls[n] || []).forEach(f => { try { f(a); } catch (e) { console.error(e); } }); };
  G.toast = msg => G.emit('toast', msg);

  // ======================= 능력치 =======================
  G.stats = function (swap) { // swap: 이 아이템을 장착했다고 가정하고 계산
    const S = G.S;
    let atk = 10, hp = 100;
    const sub = { critC: 5, critD: 0, spd: 0, leech: 0, atkP: 0, hpP: 0, skillP: 0 };
    PF.SLOTS.forEach(sl => {
      const it = swap && swap.slot === sl.id ? swap : S.equip[sl.id];
      if (!it) return;
      atk += it.atk; hp += it.hp;
      it.subs.forEach(([id, v]) => { sub[id] += v; });
    });
    let pAtk = 0, pHp = 0;
    Object.keys(S.skills).forEach(id => {
      const sk = PF.skillById[id], lv = S.skills[id].lvl;
      const m = PF.skillAscMul(S.skills[id].asc);
      pAtk += PF.SKILL_PASSIVE[sk.r] * lv * m; pHp += PF.SKILL_PASSIVE[sk.r] * lv * 8 * m;
    });
    let petP = 0; // 펫 효과: 장착한 펫만
    S.petEq.forEach(u => { const p = G.pet(u); if (p) petP += PF.PET_PASSIVE[PF.petById[p.id].r] * p.lvl * PF.petAscMul(p.asc); });
    atk = (atk + pAtk) * (1 + sub.atkP / 100) * (1 + petP / 100);
    hp = (hp + pHp) * (1 + sub.hpP / 100);
    const o = {
      atk, hp, critC: Math.min(100, sub.critC), critD: 1.5 + sub.critD / 100, spd: sub.spd,
      leech: sub.leech, skillP: sub.skillP, pAtk, pHp, petP,
    };
    o.power = Math.round(atk * (1 + o.critC / 100 * (o.critD - 1)) * (1 + o.spd / 100) * 10 + hp);
    return o;
  };

  // ======================= 대장간 =======================
  G.makeItem = function (tier) {
    const S = G.S;
    if (tier == null) tier = rollIndex(PF.forgeRates(S.forge.lvl));
    const base = PF.ITEMS[rollIndex(PF.ITEMS.map(x => x.w))];
    const lvl = Math.max(1, Math.ceil((S.forge.asc ? PF.MAX_LVL : PF.itemMaxLvl(S.forge.lvl)) * rnd(0.4, 1)));
    const mv = PF.mainValue(base.slot, tier, lvl), am = PF.itemAscMul(S.forge.asc);
    const pool = PF.SUBS.slice(), subs = [];
    for (let i = 0; i < 2; i++) {
      const s = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const max = s.max(tier);
      subs.push([s.id, Math.round(rnd(max * 0.5, max) * 10) / 10]);
    }
    return { id: S.nextId++, slot: base.slot, v: base.v, tier, lvl, asc: S.forge.asc, atk: Math.round(mv.atk * am), hp: Math.round(mv.hp * am), subs };
  };
  G.itemName = it => '[' + PF.TIERS[it.tier].name + '] ' + PF.slotById[it.slot].vars[it.v][0];
  G.itemIcon = it => PF.slotById[it.slot].vars[it.v][1];
  G.craft = function () {
    const S = G.S;
    if (S.hammers < 1) return null;
    S.hammers--; S.forge.crafts++; S.grand++;
    const it = G.makeItem();
    Audio8.play(it.tier === 9 ? 'divine' : 'craft');
    G.emit('craft', it);
    return it;
  };
  G.isBetter = it => G.stats(it).power > G.stats().power;
  // 랭킹 팝업용 장비 상황 요약 (짧은 키로 저장 용량 절약)
  G.snapshot = function () {
    const S = G.S, st = G.stats(), sub = {};
    PF.SLOTS.forEach(sl => { const it = S.equip[sl.id]; if (it) it.subs.forEach(([id, v]) => { sub[id] = Math.round(((sub[id] || 0) + v) * 10) / 10; }); });
    return {
      e: PF.SLOTS.map(sl => { const it = S.equip[sl.id]; return it ? [it.slot, it.v, it.tier, it.lvl, it.asc || 0] : null; }),
      sk: S.skillEq.map(id => id && S.skills[id] ? [id, S.skills[id].lvl, S.skills[id].asc || 0] : null),
      pt: S.petEq.map(u => { const p = G.pet(u); return p ? [p.id, p.lvl, p.asc || 0] : null; }),
      f: [S.forge.lvl, S.forge.asc || 0], sa: [S.skillAsc || 0, S.asc || 0],
      st: { atk: Math.round(st.atk), hp: Math.round(st.hp) }, sub,
    };
  };
  G.equipItem = function (it) {
    const S = G.S, old = S.equip[it.slot];
    S.equip[it.slot] = it;
    if (old) G.sell(old, true);
    Audio8.play('good');
    G.rankDirty = true; G.emit('equip'); Store.save();
  };
  G.sell = function (it, quiet) {
    G.S.crowns += PF.sellPrice(it);
    if (!quiet) Audio8.play('coin');
    G.emit('res'); Store.save();
  };
  G.forgeInvest = function () {
    const S = G.S, cost = PF.forgeStepCost(S.forge.lvl);
    if (S.forge.lvl >= PF.FORGE_MAX || S.crowns < cost) return false;
    S.crowns -= cost; S.forge.gauge++;
    if (S.forge.gauge >= PF.FORGE_STEPS) {
      S.forge.gauge = 0; S.forge.lvl++;
      Audio8.play('level'); G.toast('대장간 레벨 ' + S.forge.lvl + '!');
    } else Audio8.play('coin');
    G.emit('res'); G.emit('forge'); Store.save();
    return true;
  };

  // ======================= 스킬·펫 뽑기 =======================
  function bumpSummon(sum) {
    sum.cnt++;
    let up = false;
    while (sum.lvl < PF.SUM_MAX && sum.cnt >= PF.sumNeed(sum.lvl)) { sum.cnt -= PF.sumNeed(sum.lvl); sum.lvl++; up = true; }
    if (sum.lvl >= PF.SUM_MAX) sum.cnt = 0;
    return up;
  }
  function gain(book, id, asc) { // 새로 얻으면 Lv.1, 중복이면 조각 +1, 더 높은 승천 세대면 새 세대로 교체
    if (!book[id] || (book[id].asc || 0) < asc) { book[id] = { lvl: 1, shards: 0, asc }; return true; }
    book[id].shards++;
    return false;
  }
  G.summonSkills = function (n) {
    const S = G.S, cost = n * PF.SKILL_COST;
    if (S.tickets < cost) return null;
    S.tickets -= cost; S.grand++;
    const out = [];
    let up = false;
    for (let i = 0; i < n; i++) {
      const r = rollIndex(PF.skillRates(S.skillSum.lvl));
      const sk = pick(PF.SKILLS.filter(x => x.r === r));
      out.push({ id: sk.id, isNew: gain(S.skills, sk.id, S.skillAsc), asc: S.skillAsc });
      up = bumpSummon(S.skillSum) || up;
    }
    if (!S.skillEq.some(Boolean)) G.quickEquip('skill');
    Audio8.play('summon');
    if (up) G.toast('스킬 소환 레벨 ' + S.skillSum.lvl + '!');
    G.emit('res'); G.emit('skills'); Store.save();
    return out;
  };
  G.summonPets = function (n) {
    const S = G.S, cost = n * PF.PET_COST;
    if (S.eggs < cost) return null;
    S.eggs -= cost; S.grand++;
    const out = [];
    let up = false;
    for (let i = 0; i < n; i++) {
      const r = rollIndex(PF.petRates(S.petSum.lvl));
      S.eggBox[r]++; out.push(r);
      up = bumpSummon(S.petSum) || up;
    }
    Audio8.play('summon');
    if (up) G.toast('펫 소환 레벨 ' + S.petSum.lvl + '!');
    G.emit('res'); G.emit('pets'); Store.save();
    return out;
  };
  G.pet = u => u ? G.S.petInv.find(p => p.u === u) : null;
  // 부화: 보관함에서 고른 알을 빈 슬롯에 넣어요. 시간이 다 되면 그 등급의 펫이 나와요.
  G.hatchEgg = function (r) {
    const S = G.S, i = S.incub.indexOf(null);
    if (!S.eggBox[r]) return 'none';
    if (i < 0) return 'full';
    S.eggBox[r]--;
    S.incub[i] = { r, asc: S.asc, end: now() + PF.HATCH_SEC[r] * 1000, dur: PF.HATCH_SEC[r] * 1000 };
    Audio8.play('click'); G.emit('pets'); Store.save();
    return 'ok';
  };
  G.tickHatch = function () {
    const S = G.S, t = now();
    let hatched = null;
    S.incub.forEach((e, i) => {
      if (e && t >= e.end) {
        const p = pick(PF.PETS.filter(x => x.r === e.r));
        const isNew = !S.petInv.some(x => x.id === p.id);
        const inst = { u: S.nextPet++, id: p.id, lvl: 1, asc: e.asc != null ? e.asc : S.asc }; // 알의 승천 세대
        S.petInv.push(inst);
        S.incub[i] = null;
        hatched = { id: p.id, u: inst.u, isNew };
        if (!S.petEq.some(Boolean)) G.quickEquip('pet');
        Audio8.play('hatch');
        G.emit('hatch', hatched);
      }
    });
    if (hatched) { G.emit('pets'); Store.save(); }
  };
  // 장착한 펫 강화: 알(등급별 개수 배열)과 장착하지 않은 펫(개체 번호들)이 재료예요.
  // 재료 1개 = 같은 등급 +1레벨, 한 등급 낮을 때마다 절반. 소수점은 경험치(xp)로 남아요.
  G.petXp = (u, eggs, mats) => {
    const p = G.pet(u), r = PF.petById[p.id].r;
    let x = 0;
    eggs.forEach((n, er) => { x += (n || 0) * PF.matValue(er, r); });
    mats.forEach(m => { const q = G.pet(m); if (q) x += PF.matValue(PF.petById[q.id].r, r); });
    return x;
  };
  G.petAfter = (u, eggs, mats) => { // 강화 뒤 {lvl, xp}
    const p = G.pet(u), t = p.lvl + (p.xp || 0) + G.petXp(u, eggs, mats);
    return t >= PF.MAX_LVL ? { lvl: PF.MAX_LVL, xp: 0 } : { lvl: Math.floor(t + 1e-9), xp: t - Math.floor(t + 1e-9) };
  };
  G.petEnhance = function (u, eggs, mats) {
    const S = G.S, p = G.pet(u);
    if (!p || !S.petEq.includes(u) || p.lvl >= PF.MAX_LVL) return 0;
    const r = PF.petById[p.id].r;
    eggs = PF.RAR.map((_, er) => er > r ? 0 : Math.max(0, Math.min(eggs[er] || 0, S.eggBox[er])));
    mats = mats.filter(m => { const q = G.pet(m); return q && m !== u && !S.petEq.includes(m) && PF.petById[q.id].r <= r; });
    if (G.petXp(u, eggs, mats) <= 0) return 0;
    const before = p.lvl, after = G.petAfter(u, eggs, mats);
    eggs.forEach((n, er) => { S.eggBox[er] -= n; });
    S.petInv = S.petInv.filter(q => !mats.includes(q.u));
    p.lvl = after.lvl; p.xp = after.xp;
    Audio8.play('level'); G.emit('pets'); Store.save();
    return p.lvl - before || 0.001;
  };
  G.buySlot = function () {
    const S = G.S, n = S.incub.length;
    if (n >= PF.SLOT_MAX) return false;
    const cost = PF.slotCost(n);
    if (S.crowns < cost) return false;
    S.crowns -= cost; S.incub.push(null);
    Audio8.play('level'); G.emit('res'); G.emit('pets'); Store.save();
    return true;
  };
  // 승천: 펫·스킬 소환, 대장간 모두 Lv.100에서 가능. 레벨은 1로 돌아가고 별이 하나 늘어요.
  G.canAscend = kind => kind === 'forge' ? G.S.forge.lvl >= PF.FORGE_MAX : (kind === 'skill' ? G.S.skillSum : G.S.petSum).lvl >= PF.SUM_MAX;
  G.ascend = function (kind) {
    const S = G.S;
    kind = kind || 'pet';
    if (!G.canAscend(kind)) return false;
    let n, msg;
    if (kind === 'pet') {
      n = ++S.asc; S.petSum = { lvl: 1, cnt: 0 };
      S.petInv = []; S.petEq = [null, null, null]; S.eggBox = [0, 0, 0, 0, 0, 0]; S.incub = S.incub.map(() => null);
      msg = '이제 부화하는 펫은 ★' + n + ' 세대 (×' + PF.fmt(PF.petAscMul(n)) + ')'; }
    else if (kind === 'skill') {
      n = ++S.skillAsc; S.skillSum = { lvl: 1, cnt: 0 };
      S.skills = {}; S.skillEq = [null, null, null]; G.resetCds(); R.buffs = {};
      msg = '이제 뽑는 스킬은 ★' + n + ' 세대 (×' + PF.fmt(PF.skillAscMul(n)) + ')'; }
    else {
      n = ++S.forge.asc; S.forge.lvl = 1; S.forge.gauge = 0;
      S.equip = {};
      msg = '이제 만드는 장비는 ★' + n + ' 세대 (×' + PF.fmt(PF.itemAscMul(n)) + ')'; }
    Audio8.play('divine'); G.toast({ pet: '펫', skill: '스킬', forge: '대장간' }[kind] + ' 승천 ' + n + '단계! ' + msg);
    G.emit(kind === 'pet' ? 'pets' : kind === 'skill' ? 'skills' : 'forge'); G.emit('equip'); Store.save();
    return true;
  };
  // 조각으로 레벨업
  G.canUp = (book, id) => book[id] && book[id].lvl < PF.MAX_LVL && book[id].shards >= PF.shardNeed(book[id].lvl);
  G.upgrade = function (kind, id) {
    const book = G.S.skills;
    let n = 0;
    while (G.canUp(book, id)) { book[id].shards -= PF.shardNeed(book[id].lvl); book[id].lvl++; n++; }
    return n;
  };
  G.upgradeAll = function (kind) {
    const book = G.S.skills;
    let n = 0;
    Object.keys(book).forEach(id => { n += G.upgrade(kind, id); });
    if (n) { Audio8.play('level'); G.emit('skills'); Store.save(); }
    return n;
  };
  G.quickEquip = function (kind) {
    const S = G.S;
    let ids;
    if (kind === 'skill') ids = Object.keys(S.skills).sort((a, b) => (PF.skillById[b].r * 1000 + S.skills[b].lvl) - (PF.skillById[a].r * 1000 + S.skills[a].lvl)).slice(0, 3);
    else ids = S.petInv.slice().sort((a, b) => (PF.petById[b.id].r * 1000 + b.lvl) - (PF.petById[a.id].r * 1000 + a.lvl)).slice(0, 3).map(p => p.u);
    const eq = [ids[0] || null, ids[1] || null, ids[2] || null];
    if (kind === 'skill') { S.skillEq = eq; G.resetCds(); } else S.petEq = eq;
    G.emit(kind === 'skill' ? 'skills' : 'pets'); Store.save();
  };
  G.toggleEquip = function (kind, id) {
    const S = G.S, eq = kind === 'skill' ? S.skillEq : S.petEq;
    const i = eq.indexOf(id);
    if (i >= 0) eq[i] = null;
    else { const j = eq.indexOf(null); if (j < 0) return false; eq[j] = id; }
    if (kind === 'skill') G.resetCds();
    G.emit(kind === 'skill' ? 'skills' : 'pets'); Store.save();
    return true;
  };

  // ======================= 던전 =======================
  G.checkKeys = function () {
    const S = G.S, d = keyDay();
    if (S.keyDay === d) return;
    S.keyDay = d;
    PF.DUNGEONS.forEach(x => { S.dun[x.id].keys = Math.max(S.dun[x.id].keys, PF.KEYS_PER_DAY); });
    G.emit('dungeon'); Store.save();
  };
  function giveReward(rw) {
    const S = G.S;
    ['hammers', 'crowns', 'tickets', 'eggs'].forEach(k => { if (rw[k]) S[k] += rw[k]; });
    G.emit('res');
  }
  G.sweep = function (id) {
    const S = G.S, d = S.dun[id];
    if (d.lvl < 1 || d.keys < 1) return null;
    d.keys--;
    const rw = PF.dungeonById[id].reward(d.lvl - 1);
    giveReward(rw); Audio8.play('coin');
    G.emit('dungeon'); Store.save();
    return rw;
  };

  // ======================= 전투 =======================
  const W = 180, H = 150, GROUND = 112, HERO_X = 46;
  G.W = W; G.H = H;
  const THEMES = [
    { sky: ['#7ec8f8', '#a8dcff'], hill: '#7acc6a', hill2: '#5aac4a', ground: '#d49a5a', ground2: '#b07a40', grass: '#4aa83a', enemies: ['slime', 'bat', 'goblin'], boss: 'orc' },
    { sky: ['#f8c878', '#ffe0a8'], hill: '#e8b060', hill2: '#c88a40', ground: '#f0d090', ground2: '#c8a060', grass: '#a89040', enemies: ['slime', 'goblin', 'skeleton'], boss: 'orc' },
    { sky: ['#a8c0e0', '#dce8f8'], hill: '#f0f8ff', hill2: '#c0d4e8', ground: '#e8f0f8', ground2: '#b8c8dc', grass: '#90a8c0', enemies: ['bat', 'skeleton', 'ghost'], boss: 'orc' },
    { sky: ['#401818', '#803020'], hill: '#602020', hill2: '#401010', ground: '#503030', ground2: '#302020', grass: '#ff6020', enemies: ['skeleton', 'goblin', 'bat'], boss: 'orc' },
    { sky: ['#140a24', '#2a1a48'], hill: '#3a2a5a', hill2: '#24183a', ground: '#4a3a6a', ground2: '#2a1e44', grass: '#a060ff', enemies: ['ghost', 'skeleton', 'slime'], boss: 'orc' },
  ];
  const ENEMY_PALS = [
    ['#8ef08e', '#3eb84e', '#1e6a28'], ['#ff9a9a', '#e04848', '#802020'], ['#9ad0ff', '#4a8ae8', '#20448a'],
    ['#e0b0ff', '#a050e0', '#502080'], ['#ffe08a', '#e0a020', '#805010'], ['#c0c0c0', '#808080', '#404040'],
  ];
  G.THEMES = THEMES;

  const R = G.R = { mode: 'stage', enemies: [], parts: [], texts: [], projs: [], slashes: [], rings: [], wave: 1, walk: 0, scroll: 0,
    hero: null, buffs: {}, cds: [0, 0, 0], shake: 0, dun: null, t: 0, decor: [], msg: null };

  function heroMax() { return G.stats().hp; }
  G.resetCds = () => { R.cds = [0, 0, 0]; };
  G.reset = function () { // 저장을 바꿨을 때(로그인 등) 전투를 처음부터
    R.mode = 'stage'; R.dun = null; G.S.farming = G.S.farming || false;
    startStage(); Audio8.song('field');
    G.emit('res'); G.emit('equip'); G.emit('skills'); G.emit('pets'); G.emit('dungeon'); G.emit('stage');
  };
  function startStage() {
    R.enemies = []; R.projs = []; R.wave = 1; R.walk = 0.6; R.buffs = {};
    const max = heroMax();
    R.hero = { hp: max, max, atkT: 0.4, swing: 0, flash: 0, dead: 0 };
    G.resetCds();
    spawnWave();
    G.emit('stage');
  }
  function stageG() { return R.mode === 'dun' ? PF.dungeonPower(R.dun.lvl) : PF.stageIndex(G.S.stage); }
  function mkEnemy(kind, x, g, mul) {
    mul = mul || {};
    const pal = ENEMY_PALS[(G.S.stage.c + G.S.stage.d * 3) % ENEMY_PALS.length];
    const hp = PF.enemyHp(g) * (mul.hp || 1), atk = PF.enemyAtk(g) * (mul.atk || 1);
    return { kind, pal: mul.pal || pal, x, y: GROUND, hp, max: hp, atk, atkT: 1, flash: 0, scale: mul.scale || 1,
      boss: !!mul.boss, speed: mul.speed || 28, bob: Math.random() * 6, crowns: PF.killCrowns(g) * (mul.reward || 1), hammers: mul.hammers || 1, fly: kind === 'bat' || kind === 'ghost' };
  }
  function spawnWave() {
    const th = THEMES[G.S.stage.d], g = stageG();
    if (R.mode === 'stage') { // 랭킹용: 도달한 웨이브 수 = 스테이지 순번 × 3 + 웨이브
      const w = PF.stageIndex(G.S.stage) * PF.WAVES + R.wave;
      if (w > (G.S.bestWave || 0)) { G.S.bestWave = w; G.rankDirty = true; }
    }
    if (R.wave < PF.WAVES) {
      for (let i = 0; i < 3; i++) R.enemies.push(mkEnemy(pick(th.enemies), W + 10 + i * 24, g));
    } else {
      const isBossStage = G.S.stage.s === PF.STAGES;
      R.enemies.push(mkEnemy(th.boss, W + 20, g, { hp: isBossStage ? 14 : 6, atk: isBossStage ? 2.5 : 1.6, scale: isBossStage ? 2 : 1.5, boss: true, reward: 8, hammers: 6, speed: 18 }));
      R.enemies.push(mkEnemy(pick(th.enemies), W + 50, g));
    }
  }
  G.stageLabel = () => PF.DIFFS[G.S.stage.d] + ' ' + G.S.stage.c + '-' + G.S.stage.s;
  function advanceStage(dir) {
    const st = G.S.stage;
    let gi = PF.stageIndex(st) + dir;
    gi = Math.max(0, Math.min(PF.DIFFS.length * PF.CHAPTERS * PF.STAGES - 1, gi));
    st.d = Math.floor(gi / (PF.CHAPTERS * PF.STAGES));
    st.c = Math.floor(gi / PF.STAGES) % PF.CHAPTERS + 1;
    st.s = gi % PF.STAGES + 1;
    G.S.best = Math.max(G.S.best, gi);
  }
  G.challenge = function () { // 후퇴 후 다시 다음 스테이지 도전
    if (!G.S.farming || R.mode !== 'stage') return;
    G.S.farming = false; advanceStage(1); startStage(); Store.save();
  };

  // ---- 던전 시작/끝 ----
  G.startDungeon = function (id) {
    const S = G.S, d = S.dun[id], def = PF.dungeonById[id];
    if (d.keys < 1) return false;
    R.mode = 'dun';
    R.dun = { id, lvl: d.lvl, timer: def.time, spawnT: 0, done: false };
    R.enemies = []; R.projs = []; R.walk = 0; R.buffs = {};
    const max = heroMax();
    R.hero = { hp: max, max, atkT: 0.4, swing: 0, flash: 0, dead: 0 };
    G.resetCds();
    const g = PF.dungeonPower(d.lvl);
    if (id === 'thief') R.enemies.push(mkEnemy('thief', HERO_X + 40, g, { hp: 10, atk: 0.5, speed: 0, reward: 0, hammers: 0, pal: null }));
    if (id === 'ghost') R.enemies.push(mkEnemy('ghost', W + 10, g, { hp: 22, atk: 2, scale: 2, boss: true, speed: 14, reward: 0, hammers: 0, pal: ['#c0ffc0', '#60c080', '#206040'] }));
    Audio8.song('dungeon');
    G.emit('stage');
    return true;
  };
  function endDungeon(win) {
    const S = G.S, dn = R.dun, def = PF.dungeonById[dn.id];
    if (dn.done) return;
    dn.done = true;
    let rw = null;
    if (win) {
      rw = def.reward(dn.lvl);
      S.dun[dn.id].keys--; S.dun[dn.id].lvl++;
      giveReward(rw); Audio8.play('good');
    } else Audio8.play('fail');
    Store.save();
    setTimeout(() => {
      G.emit('dunResult', { id: dn.id, win, rw, lvl: dn.lvl });
      R.mode = 'stage'; R.dun = null; Audio8.song('field');
      startStage(); G.emit('dungeon');
    }, 900);
  }
  G.leaveDungeon = () => { if (R.mode === 'dun') endDungeon(false); };

  // ---- 피해·이펙트 ----
  function addText(x, y, val, col, big) { R.texts.push({ x, y, s: typeof val === 'string' ? val : PF.fmt(val), col, t: 0.9, big }); }
  function burst(x, y, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(20, spd || 70);
      R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: rnd(0.3, 0.7), col, g: 160 });
    }
  }
  G.burst = burst;
  function hurtEnemy(e, dmg, crit, col) {
    if (e.hp <= 0) return;
    e.hp -= dmg; e.flash = 0.12;
    addText(e.x + rnd(-4, 4), e.y - 18 * e.scale, dmg, crit ? '#ffd23a' : (col || '#ffffff'), crit);
    burst(e.x, e.y - 8 * e.scale, crit ? '#ffd23a' : '#ffffff', crit ? 8 : 3);
    if (crit) { R.shake = 0.15; Audio8.play('crit'); } else Audio8.play('hit');
    const leech = G.stats().leech + (R.buffs.leech ? R.buffs.leech.v * 100 : 0);
    if (leech > 0) R.hero.hp = Math.min(R.hero.max, R.hero.hp + dmg * leech / 100);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    burst(e.x, e.y - 8 * e.scale, e.pal[1], 14, 90);
    if (R.mode === 'stage') {
      G.S.crowns += Math.round(e.crowns); G.S.hammers += e.hammers;
      addText(e.x, e.y - 26 * e.scale, '+' + PF.fmt(e.crowns), '#ffd23a');
      G.emit('res');
    }
    if (e.boss) { R.shake = 0.3; Audio8.play('boom'); }
  }
  function heroHit(mult, target) {
    const st = G.stats();
    let dmg = st.atk * (mult || 1) * (R.buffs.atk ? 1 + R.buffs.atk.v : 1);
    const crit = Math.random() * 100 < st.critC;
    if (crit) dmg *= st.critD;
    hurtEnemy(target, dmg, crit);
  }
  function hurtHero(dmg) {
    const h = R.hero;
    if (h.dead || (R.buffs.invul)) return;
    if (R.buffs.guard) dmg *= 1 - R.buffs.guard.v;
    h.hp -= dmg; h.flash = 0.12;
    addText(HERO_X, GROUND - 22, dmg, '#ff6060');
    Audio8.play('hurt');
    if (h.hp <= 0) { h.hp = 0; h.dead = 1.2; Audio8.play('die'); burst(HERO_X, GROUND - 8, '#ff5050', 20, 100); }
  }

  // ---- 스킬 ----
  G.castSkill = function (i) {
    const id = G.S.skillEq[i];
    if (!id || R.cds[i] > 0 || R.hero.dead || R.walk > 0) return false;
    const sk = PF.skillById[id], lv = G.S.skills[id].lvl, st = G.stats();
    const front = alive()[0];
    if ((sk.kind === 'dmg' || sk.kind === 'multi' || sk.kind === 'aoe') && !front) return false;
    R.cds[i] = sk.cd;
    const mul = sk.mult * PF.skillLvlMul(lv) * (1 + st.skillP / 100) * PF.skillAscMul(G.S.skills[id].asc);
    Audio8.play('skill');
    if (sk.kind === 'dmg') {
      R.projs.push({ x: HERO_X + 8, y: GROUND - 10, tx: front, col: sk.fx, big: true, mult: mul, spd: 160 });
    } else if (sk.kind === 'aoe') {
      alive().forEach(e => { heroHit(mul, e); burst(e.x, e.y - 30, sk.fx, 10, 60); });
      R.flashCol = sk.fx; R.flashT = 0.15; R.shake = 0.2; Audio8.play('boom');
    } else if (sk.kind === 'multi') {
      for (let k = 0; k < sk.hits; k++) setTimeout(() => {
        const t = alive()[0];
        if (t) { R.projs.push({ x: HERO_X + 8, y: GROUND - 30 - Math.random() * 20, tx: t, col: sk.fx, mult: mul, spd: 220 }); }
      }, k * 110);
    } else if (sk.kind === 'heal') {
      R.hero.hp = Math.min(R.hero.max, R.hero.hp + R.hero.max * sk.mult * (1 + lv * 0.005));
      if (sk.invul) R.buffs.invul = { v: 1, t: sk.invul };
      burst(HERO_X, GROUND - 10, sk.fx, 16, 50); Audio8.play('heal');
      addText(HERO_X, GROUND - 28, '회복', '#80ff80');
    } else if (sk.kind === 'buff') {
      R.buffs[sk.buff] = { v: sk.val * (1 + lv * 0.01), t: sk.dur, col: sk.fx };
      burst(HERO_X, GROUND - 10, sk.fx, 16, 50);
    }
    return true;
  };

  function alive() { return R.enemies.filter(e => e.hp > 0); }
  const weaponKind = () => G.S.equip.weapon ? G.S.equip.weapon.v : 0; // 0 검, 1 도끼, 2 지팡이
  const weaponCol = i => G.S.equip.weapon ? PF.TIERS[G.S.equip.weapon.tier].pal[i] : ['#ffffff', '#a4aebb', '#5a6474'][i];
  const staffTip = () => ({ x: HERO_X + 10, y: GROUND - 25 });

  // ======================= 업데이트 =======================
  G.update = function (dt) {
    const S = G.S, h = R.hero;
    R.t += dt;
    G.tickHatch();
    // 부드럽게 줄어드는 효과
    R.shake = Math.max(0, R.shake - dt);
    if (R.flashT) R.flashT = Math.max(0, R.flashT - dt);
    Object.keys(R.buffs).forEach(k => { R.buffs[k].t -= dt; if (R.buffs[k].t <= 0) delete R.buffs[k]; });
    R.cds = R.cds.map(c => Math.max(0, c - dt));
    R.parts = R.parts.filter(p => { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; return p.t > 0; });
    R.texts = R.texts.filter(t => { t.t -= dt; t.y -= 18 * dt; return t.t > 0; });
    h.swing = Math.max(0, h.swing - dt * 5);
    h.cast = Math.max(0, (h.cast || 0) - dt * 4);
    R.slashes = R.slashes.filter(x => (x.t -= dt) > 0);
    R.rings = R.rings.filter(x => { x.t -= dt; x.r += (x.max - x.r) * Math.min(1, dt * 14); return x.t > 0; });
    h.flash = Math.max(0, h.flash - dt);
    // 최대 체력이 바뀌면(장비 교체) 비율 유지
    const mx = heroMax();
    if (Math.abs(mx - h.max) > 1) { h.hp = h.hp / h.max * mx; h.max = mx; }

    if (h.dead > 0) {
      h.dead -= dt;
      if (h.dead <= 0) {
        if (R.mode === 'dun') { endDungeon(false); return; }
        // 패배 → 이전 스테이지로 후퇴해 그곳을 반복
        if (PF.stageIndex(S.stage) > 0) advanceStage(-1);
        S.farming = true; G.toast('후퇴! 이전 스테이지에서 성장하세요');
        startStage(); Store.save();
      }
      return;
    }

    // 걷기(웨이브 사이)
    if (R.walk > 0) {
      R.walk -= dt; R.scroll += 46 * dt;
      R.enemies.forEach(e => { e.x -= 46 * dt; });
    }

    // 던전 타이머·특수 행동
    if (R.mode === 'dun' && !R.dun.done) {
      const dn = R.dun;
      dn.timer -= dt;
      if (dn.id === 'invade') {
        dn.spawnT -= dt;
        if (dn.spawnT <= 0) {
          dn.spawnT = 1.3;
          R.enemies.push(mkEnemy(pick(THEMES[Math.min(4, Math.floor(dn.lvl / 5))].enemies), W + 10, PF.dungeonPower(dn.lvl) - 2, { reward: 0, hammers: 0 }));
        }
        if (dn.timer <= 0) { endDungeon(true); return; }
      } else {
        if (!alive().length) { endDungeon(true); return; }
        if (dn.timer <= 0) { endDungeon(false); return; }
      }
      if (dn.id === 'thief') { // 도둑은 맞으면 뒤로 깡충 도망쳐요
        const e = R.enemies[0];
        e.flee = (e.flee || 0) - dt;
        if (e.flash > 0.1 && e.flee <= 0 && Math.random() < 0.35) { e.vx = 90; e.flee = 1.2; }
        if (e.vx) { e.x += e.vx * dt; e.vx = Math.max(0, e.vx - 220 * dt); }
        if (e.x > HERO_X + 26 && !e.vx) e.x -= 30 * dt; // 영웅이 쫓아가는 효과
        R.scroll += (e.vx ? 30 : 0) * dt;
        e.x = Math.min(e.x, W - 12);
      }
    }

    // 적 이동·공격
    const list = alive();
    list.forEach((e, i) => {
      e.flash = Math.max(0, e.flash - dt);
      const stopX = HERO_X + 16 + (e.scale - 1) * 8 + i * 14;
      if (e.speed && e.x > stopX) e.x = Math.max(stopX, e.x - e.speed * dt);
      if (e.x <= HERO_X + 24 + (e.scale - 1) * 10 && R.walk <= 0) {
        e.atkT -= dt;
        if (e.atkT <= 0) { e.atkT = e.boss ? 1.1 : 1.4; e.lunge = 0.15; hurtEnemyHero(e); }
      }
      if (e.lunge) e.lunge = Math.max(0, e.lunge - dt);
    });
    function hurtEnemyHero(e) { hurtHero(e.atk); }

    // 영웅 공격
    // 지팡이는 원거리: 적이 화면 중앙 기준으로 영웅과 대칭인 위치(W - HERO_X)에 오면 사격 시작
    const front = list[0], wk = weaponKind();
    const reach = wk === 2 ? W - HERO_X : HERO_X + 26 + (front ? (front.scale - 1) * 10 : 0);
    if (front && R.walk <= 0 && front.x <= reach) {
      h.atkT -= dt;
      if (h.atkT <= 0) {
        const st = G.stats();
        h.atkT = 0.85 / (1 + st.spd / 100) * (wk === 1 ? 1.15 : 1);
        if (wk === 2) { // 마법 구체 발사
          h.cast = 1;
          const tip = staffTip();
          R.projs.push({ x: tip.x, y: tip.y, tx: front, col: weaponCol(1), col2: weaponCol(0), mult: 1, spd: 190, magic: true });
          R.rings.push({ x: tip.x, y: tip.y, r: 1, max: 7, t: 0.25, col: weaponCol(0) });
          Audio8.play('skill');
        } else {
          h.swing = 1;
          heroHit(wk === 1 ? 1.3 : 1, front);
          R.slashes.push({ x: front.x - 3 * front.scale, y: front.y - 8 * front.scale, t: 0.22, max: 0.22, kind: wk, col: weaponCol(0), col2: weaponCol(1), r: wk === 1 ? 13 : 10 });
          if (wk === 1) { R.shake = Math.max(R.shake, 0.08); for (let k = 0; k < 6; k++) R.parts.push({ x: front.x + rnd(-6, 6), y: GROUND, vx: rnd(-40, 40), vy: rnd(-70, -30), t: 0.4, col: THEMES[S.stage.d].ground2, g: 220 }); }
        }
      }
    }

    // 펫 공격
    S.petEq.forEach((u, i) => {
      const inst = G.pet(u);
      if (!inst) return;
      const id = inst.id;
      R.petT = R.petT || [0, 0, 0];
      R.petT[i] -= dt;
      if (R.petT[i] <= 0 && front && R.walk <= 0) {
        R.petT[i] = 1.6 + i * 0.15;
        const p = PF.petById[id];
        const mul = PF.PET_MULT[p.r] * (1 + inst.lvl * 0.03) * PF.petAscMul(inst.asc);
        const pos = petPos(i);
        R.projs.push({ x: pos.x, y: pos.y, tx: front, col: p.tint[1], mult: mul, spd: 150, pet: true });
      }
    });

    // 투사체
    R.projs = R.projs.filter(pr => {
      const t = pr.tx;
      if (!t || t.hp <= 0) return false;
      const tx = t.x, ty = t.y - 8 * t.scale;
      const dx = tx - pr.x, dy = ty - pr.y, d = Math.hypot(dx, dy);
      if (d < 5) {
        heroHit(pr.mult, t);
        if (pr.big) { burst(tx, ty, pr.col, 16, 90); Audio8.play('boom'); }
        if (pr.magic) { R.rings.push({ x: tx, y: ty, r: 2, max: 11, t: 0.3, col: pr.col }); burst(tx, ty, pr.col2, 10, 80); }
        return false;
      }
      pr.x += dx / d * pr.spd * dt; pr.y += dy / d * pr.spd * dt;
      if (Math.random() < (pr.magic ? 1 : 0.6)) R.parts.push({ x: pr.x + (pr.magic ? rnd(-1, 1) : 0), y: pr.y + (pr.magic ? rnd(-1, 1) : 0), vx: 0, vy: 0, t: pr.magic ? 0.3 : 0.2, col: pr.magic && Math.random() < 0.5 ? pr.col2 : pr.col, g: 0 });
      return true;
    });

    // 자동 스킬
    if (S.autoSkill) S.skillEq.forEach((id, i) => {
      if (!id || R.cds[i] > 0) return;
      const sk = PF.skillById[id];
      if (sk.kind === 'heal' && h.hp > h.max * 0.6) return;
      if (sk.kind === 'buff' && !front) return;
      G.castSkill(i);
    });

    // 웨이브 클리어
    if (R.mode === 'stage' && R.walk <= 0 && !alive().length) {
      R.enemies = [];
      if (R.wave < PF.WAVES) { R.wave++; spawnWave(); R.walk = 1.1; G.emit('stage'); }
      else {
        if (!S.farming) advanceStage(1);
        Audio8.play('good');
        startStage(); Store.save();
      }
    }
  };

  // ======================= 렌더링 =======================
  const FONT = { // 3x5 비트맵 숫자 글꼴
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    '.': '000000000000010', k: '100101110101101', m: '000111111101101', b: '100100111101111', t: '010111010010011',
    a: '000111011101111', c: '000111100100111', d: '001001111101111', '+': '000010111010000', '-': '000000111000000', '!': '010010010000010',
  };
  function drawNum(g, s, x, y, col, scale) {
    scale = scale || 1;
    const w = s.length * 4 * scale;
    let cx = Math.round(x - w / 2);
    for (const ch of s) {
      const f = FONT[ch];
      if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') {
        const px = cx + (i % 3) * scale, py = Math.round(y) + Math.floor(i / 3) * scale;
        g.fillStyle = '#1a1222'; g.fillRect(px - 1, py - 1, scale + 2, scale + 2);
      }
      cx += 4 * scale;
    }
    cx = Math.round(x - w / 2);
    for (const ch of s) {
      const f = FONT[ch];
      if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') {
        g.fillStyle = col; g.fillRect(cx + (i % 3) * scale, Math.round(y) + Math.floor(i / 3) * scale, scale, scale);
      }
      cx += 4 * scale;
    }
  }
  G.drawNum = drawNum;

  function petPos(i) {
    const bob = Math.sin(R.t * 4 + i * 2) * 2;
    return [{ x: HERO_X - 22, y: GROUND - 26 + bob }, { x: HERO_X - 30, y: GROUND - 6 + bob * 0.5 }, { x: HERO_X - 12, y: GROUND - 40 + bob }][i];
  }
  const ASC_COL = ['', '#ffffff', '#5ad8ff', '#ffd23a', '#ff5a5a', '#d65aff', '#5aff8a'];
  // 펫 그리기: 승천 단계마다 테두리 빛·왕관·반짝이가 붙어요
  G.drawPet = function (g, id, x, y, asc, t, scale) {
    scale = scale || 1;
    const p = PF.petById[id], img = Sprites.bake(p.shape, p.tint);
    const w = img.width * scale, h = img.height * scale;
    const X = Math.round(x - w / 2), Y = Math.round(y - h);
    if (asc > 0) {
      const sil = Sprites.flash(p.shape, p.tint);
      const tmp = G._tmp || (G._tmp = document.createElement('canvas'));
      tmp.width = sil.width; tmp.height = sil.height;
      const tg = tmp.getContext('2d');
      tg.clearRect(0, 0, tmp.width, tmp.height); tg.drawImage(sil, 0, 0);
      tg.globalCompositeOperation = 'source-in'; tg.fillStyle = ASC_COL[Math.min(asc, ASC_COL.length - 1)]; tg.fillRect(0, 0, tmp.width, tmp.height);
      tg.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.7 + Math.sin((t || 0) * 5) * 0.3;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => g.drawImage(tmp, X + dx * scale, Y + dy * scale, w, h));
      g.globalAlpha = 1;
    }
    g.drawImage(img, X, Y, w, h);
    if (asc >= 2) g.drawImage(Sprites.bake('crown'), Math.round(x - 3.5 * scale), Y - 4 * scale, 7 * scale, 5 * scale);
    if (asc >= 3 && Math.random() < 0.15) { g.fillStyle = ASC_COL[Math.min(asc, 6)]; g.fillRect(X + Math.random() * w, Y + Math.random() * h, scale, scale); }
  };

  function heroPal() {
    const e = G.S.equip, tp = sl => e[sl] ? PF.TIERS[e[sl].tier].pal : null;
    const helm = tp('helm') || ['#c8ccd8', '#8a90a0', '#4a5060'];
    const arm = tp('armor') || ['#6aa0e0', '#3a70b8', '#1a3a70'];
    const boot = tp('boots') || ['#9a6232', '#52301a', '#2a180c'];
    return helm.concat(arm, boot);
  }
  function drawDecor(g, th, off, y, name, every, seed) {
    const img = Sprites.bake(name);
    for (let k = -1; k < W / every + 2; k++) {
      const base = Math.floor(off / every) + k;
      const hash = Math.abs(Math.sin(base * 12.9898 + seed) * 43758.5453) % 1;
      if (hash < 0.45) continue;
      const x = Math.round(k * every - (off % every) + hash * every * 0.5);
      g.drawImage(img, x, y - img.height);
    }
  }

  G.render = function (g) {
    const S = G.S, th = THEMES[R.mode === 'dun' ? (R.dun.id === 'ghost' ? 4 : Math.min(4, Math.floor(R.dun.lvl / 5))) : S.stage.d];
    g.save();
    if (R.shake > 0) g.translate(Math.round(rnd(-2, 2)), Math.round(rnd(-2, 2)));
    // 하늘(디더링 띠)
    g.fillStyle = th.sky[0]; g.fillRect(-4, -4, W + 8, H + 8);
    g.fillStyle = th.sky[1];
    for (let y = 40; y < 80; y += 2) for (let x = (y / 2) % 2 * 2; x < W; x += 4) if (y > 60 || (x + y) % 8 === 0) g.fillRect(x, y, 2, 2);
    g.fillRect(0, 62, W, 30);
    // 구름
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 4; i++) { const cx = ((i * 60 - R.scroll * 0.1 - R.t * 3) % 240 + 240) % 240 - 30; g.fillRect(Math.round(cx), 14 + i * 9 % 20, 22, 4); g.fillRect(Math.round(cx) + 4, 10 + i * 9 % 20, 12, 4); }
    // 먼 언덕(시차 스크롤)
    const hill = (col, amp, base, sp, per) => {
      g.fillStyle = col;
      for (let x = 0; x < W; x += 2) {
        const hy = base - Math.round((Math.sin((x + R.scroll * sp) / per) + 1) * amp);
        g.fillRect(x, hy, 2, GROUND - hy);
      }
    };
    hill(th.hill2, 8, 82, 0.2, 23);
    hill(th.hill, 6, 92, 0.4, 17);
    drawDecor(g, th, R.scroll * 0.6, 98, 'tree', 46, 1);
    // 땅
    g.fillStyle = th.grass; g.fillRect(0, 96, W, 4);
    g.fillStyle = th.ground; g.fillRect(0, 100, W, H - 100);
    g.fillStyle = th.ground2;
    for (let x = 0; x < W + 16; x += 16) { const sx = Math.round(x - (R.scroll % 16)); g.fillRect(sx, 104, 6, 2); g.fillRect(sx + 8, 120, 4, 2); g.fillRect(sx + 3, 134, 5, 2); }
    g.fillStyle = th.grass; g.fillRect(0, 128, W, 2);
    drawDecor(g, th, R.scroll, 140, 'bush', 60, 7);
    drawDecor(g, th, R.scroll, 104, 'grass', 30, 3);

    // 그림자
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(HERO_X - 6, GROUND - 1, 12, 2);
    alive().forEach(e => g.fillRect(Math.round(e.x - 6 * e.scale), GROUND - 1, Math.round(12 * e.scale), 2));

    // 펫
    S.petEq.forEach((u, i) => { const inst = G.pet(u); if (inst) { const p = petPos(i); G.drawPet(g, inst.id, p.x, p.y + 6, inst.asc, R.t); } });

    // 적
    R.enemies.forEach(e => {
      if (e.hp <= 0) return;
      const img = e.flash > 0 ? Sprites.flash(e.kind, e.pal, true) : Sprites.bake(e.kind, e.pal, true);
      const w = img.width * e.scale, hgt = img.height * e.scale;
      const bob = e.fly ? Math.sin(R.t * 6 + e.bob) * 3 - 8 : (R.walk > 0 || e.x > HERO_X + 30 ? Math.abs(Math.sin(R.t * 10 + e.bob)) * -2 : 0);
      const lx = e.lunge ? -4 : 0;
      g.drawImage(img, Math.round(e.x - w / 2 + lx), Math.round(e.y - hgt + bob), w, hgt);
      if (e.boss && e.kind === 'orc') g.drawImage(Sprites.bake('crown'), Math.round(e.x - 3.5 * e.scale + lx), Math.round(e.y - hgt + bob - 3 * e.scale), 7 * e.scale, 5 * e.scale);
      // 체력 바
      const bw = Math.round(14 * e.scale), by = Math.round(e.y - hgt + bob - (e.boss ? 9 * e.scale : 4));
      g.fillStyle = '#1a1222'; g.fillRect(Math.round(e.x - bw / 2) - 1, by - 1, bw + 2, 4);
      g.fillStyle = '#5a1a1a'; g.fillRect(Math.round(e.x - bw / 2), by, bw, 2);
      g.fillStyle = e.boss ? '#ff4040' : '#ff7a5a'; g.fillRect(Math.round(e.x - bw / 2), by, Math.max(0, Math.round(bw * e.hp / e.max)), 2);
    });

    // 영웅
    const h = R.hero;
    if (!(h.dead > 0 && Math.floor(R.t * 10) % 2)) {
      const walking = R.walk > 0;
      const frame = walking && Math.floor(R.t * 8) % 2 ? 'hero_walk' : 'hero';
      const pal = heroPal();
      const img = h.flash > 0 ? Sprites.flash(frame, pal) : Sprites.bake(frame, pal);
      const hb = walking ? -Math.abs(Math.sin(R.t * 12)) * 2 : 0;
      const hx = HERO_X - 8 + (h.swing > 0.5 ? 2 : 0), hy = GROUND - 16 + hb;
      // 무기 (휘두르기 회전)
      const wi = S.equip.weapon, wname = wi ? ['w_sword', 'w_axe', 'w_staff'][wi.v] : 'w_sword';
      const wimg = Sprites.bake(wname, wi ? PF.TIERS[wi.tier].pal : ['#e8edf4', '#a4aebb', '#5a6474']);
      g.save();
      g.translate(Math.round(hx + 12), Math.round(hy + 10));
      g.rotate(h.cast > 0 ? -0.9 * h.cast - 0.3 : h.swing > 0 ? (1 - h.swing) * 2.2 - 0.6 : -0.3);
      if (wi && wi.asc) { // 승천 무기: 단계 색 테두리
        const sil = Sprites.flash(wname, PF.TIERS[wi.tier].pal);
        const tmp = G._wtmp || (G._wtmp = document.createElement('canvas'));
        tmp.width = sil.width; tmp.height = sil.height;
        const tg = tmp.getContext('2d');
        tg.clearRect(0, 0, tmp.width, tmp.height); tg.drawImage(sil, 0, 0);
        tg.globalCompositeOperation = 'source-in'; tg.fillStyle = ASC_COL[Math.min(wi.asc, ASC_COL.length - 1)]; tg.fillRect(0, 0, tmp.width, tmp.height);
        tg.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.75 + Math.sin(R.t * 6) * 0.25;
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => g.drawImage(tmp, -1 + dx, -wimg.height + 1 + dy));
        g.globalAlpha = 1;
      }
      g.drawImage(wimg, -1, -wimg.height + 1);
      g.restore();
      g.drawImage(img, Math.round(hx), Math.round(hy));
      if (wi && wi.v === 2) { // 지팡이 끝 마력 (사격할 때 크게)
        const tp = staffTip(), pulse = 1 + Math.round((Math.sin(R.t * 8) + 1) / 2) + (h.cast > 0 ? 2 : 0);
        g.fillStyle = weaponCol(1); g.globalAlpha = 0.5; g.fillRect(tp.x - pulse - 1, tp.y - pulse - 1, pulse * 2 + 2, pulse * 2 + 2);
        g.globalAlpha = 1; g.fillStyle = weaponCol(0); g.fillRect(tp.x - 1, tp.y - 1, 2, 2);
      }
      if (R.buffs.invul || R.buffs.guard) { g.strokeStyle = R.buffs.invul ? '#ffffff' : '#a0c0ff'; g.lineWidth = 1; g.strokeRect(Math.round(hx) - 2.5, Math.round(hy) - 2.5, 21, 21); }
      if (R.buffs.atk && Math.random() < 0.4) R.parts.push({ x: hx + rnd(2, 14), y: hy + 16, vx: 0, vy: -30, t: 0.4, col: R.buffs.atk.col, g: 0 });
      // 영웅 체력 바
      g.fillStyle = '#1a1222'; g.fillRect(HERO_X - 9, GROUND - 22 + hb, 18, 4);
      g.fillStyle = '#204020'; g.fillRect(HERO_X - 8, GROUND - 21 + hb, 16, 2);
      g.fillStyle = '#5aff5a'; g.fillRect(HERO_X - 8, GROUND - 21 + hb, Math.round(16 * Math.max(0, h.hp) / h.max), 2);
    }

    // 투사체·파티클·글자
    R.slashes.forEach(sl => { // 초승달 베기 궤적 (도끼는 크고 두껍게)
      const k = 1 - sl.t / sl.max, a0 = -1.3 + k * 0.6, a1 = a0 + 2.2 * Math.min(1, k * 2.5);
      for (let a = a0; a < a1; a += 0.12) {
        const fade = (a - a0) / (a1 - a0 + 0.001);
        for (let w = 0; w < (sl.kind === 1 ? 4 : 3); w++) {
          const rr = sl.r - w;
          g.fillStyle = w === 0 ? '#ffffff' : fade > 0.5 ? sl.col : sl.col2;
          g.globalAlpha = Math.min(1, sl.t / sl.max * 2) * (0.4 + fade * 0.6);
          g.fillRect(Math.round(sl.x + Math.cos(a) * rr), Math.round(sl.y + Math.sin(a) * rr), 2, 2);
        }
      }
      g.globalAlpha = 1;
    });
    R.rings.forEach(rg => { // 마법 고리
      g.globalAlpha = Math.min(1, rg.t * 4); g.fillStyle = rg.col;
      for (let a = 0; a < Math.PI * 2; a += 0.35) g.fillRect(Math.round(rg.x + Math.cos(a) * rg.r), Math.round(rg.y + Math.sin(a) * rg.r), 2, 2);
      g.globalAlpha = 1;
    });
    R.projs.forEach(p => {
      if (p.magic) { // 마법 구체: 빛무리 + 심
        g.fillStyle = p.col; g.globalAlpha = 0.45; g.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 7, 7);
        g.globalAlpha = 1; g.fillStyle = '#1a1222'; g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
        g.fillStyle = p.col2; g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
        g.fillStyle = '#ffffff'; g.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 1);
        return;
      }
      g.fillStyle = '#1a1222'; const s = p.big ? 5 : 3; g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, s + 2, s + 2); g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), s, s); });
    R.parts.forEach(p => { g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); });
    R.texts.forEach(t => {
      if (/^[0-9.kmbtacd+\-!]+$/.test(t.s)) drawNum(g, t.s, t.x, t.y, t.col, t.big ? 2 : 1);
      else { g.font = '8px Galmuri11, monospace'; g.textAlign = 'center'; g.fillStyle = '#1a1222'; g.fillText(t.s, t.x + 1, t.y + 1); g.fillStyle = t.col; g.fillText(t.s, t.x, t.y); }
    });
    if (R.flashT > 0) { g.globalAlpha = R.flashT * 3; g.fillStyle = R.flashCol || '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    g.restore();
  };

  G.reset();
})();

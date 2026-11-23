// ui.js — DOM 화면(상단·패널·모달)과 메인 루프
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const S = () => Game.S;
  const ui = { tab: 'home', sub: 'skill', auto: null, rateLvl: null, resetArm: 0 };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ico = (name, pal, cls) => `<img src="${Sprites.url(name, pal)}" alt=""${cls ? ` class="${cls}"` : ''}>`;
  const fmt = PF.fmt;
  const tierPal = t => PF.TIERS[t].pal;
  const tierBg = t => `background-color:${tierPal(t)[1]}`;
  const rarBg = r => `background-color:${PF.RAR[r].col}`;
  const RES_ICO = { crowns: 'coin', hammers: 'hammer', tickets: 'ticket', eggs: 'egg' };
  // 승천 단계 카드: 테두리(af1 은 → af2 금 → af3 무지개 → af4 반짝이 → af5 오라)와 별
  const afCls = a => a > 0 ? ` af af${Math.min(a, 5)}` : '';
  const astar = a => a > 0 ? `<span class="astar">★${a}</span>` : '';
  const eggPal = r => Sprites.tri(PF.RAR[r].col).concat(['#ffffff']);
  const EGG_RES = ['#fff8e8', '#e8d4b0', '#a08060', '#e0905a']; // 알 재화(뽑기용) 아이콘 색
  const resIco = k => k === 'eggs' ? ico('egg', EGG_RES) : ico(RES_ICO[k]);

  document.querySelectorAll('img[data-ico]').forEach(im => { im.src = Sprites.url(im.dataset.ico); });

  // ---------------- 토스트·모달 ----------------
  Game.on('toast', msg => {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 2600);
  });
  let modalLock = false;
  function modal(html, opts) {
    opts = opts || {};
    const m = $('modal');
    m.innerHTML = `<div class="dlg">${html}${opts.noClose ? '' : '<button class="close" data-act="close" aria-label="닫기">×</button>'}</div>`;
    m.hidden = false;
    modalLock = !!opts.noClose;
    m.onclick = e => {
      if (e.target === m && !modalLock) closeModal();
      const b = e.target.closest('[data-act]');
      if (!b) return;
      Audio8.play('click');
      if (b.dataset.act === 'close') closeModal();
      else if (opts.on) opts.on(b.dataset.act, b);
    };
  }
  function closeModal() { $('modal').hidden = true; $('modal').innerHTML = ''; modalLock = false; }
  const modalOpen = () => !$('modal').hidden;

  // ---------------- 상단 ----------------
  function renderTop() {
    const s = S(), st = Game.stats();
    $('crowns').textContent = fmt(s.crowns);
    $('hammers').textContent = fmt(s.hammers);
    $('power').textContent = fmt(st.power);
    document.querySelectorAll('[data-need]').forEach(el => {
      const [k, v] = el.dataset.need.split(':');
      const ok = s[k] >= +v;
      el.classList.toggle('short', !ok);
      if (el.tagName === 'BUTTON') el.disabled = !ok;
    });
    const hn = document.querySelector('.anvil-btn .cnt span');
    if (hn) hn.textContent = fmt(s.hammers);
    $('grow-dot').hidden = !growAlert();
  }
  function renderAvatar() {
    const e = S().equip, tp = sl => e[sl] ? tierPal(e[sl].tier) : null;
    $('avatar').src = Sprites.url('hero', (tp('helm') || ['#c8ccd8', '#8a90a0', '#4a5060']).concat(tp('armor') || ['#6aa0e0', '#3a70b8', '#1a3a70'], tp('boots') || ['#9a6232', '#52301a', '#2a180c']));
    $('power-ico').src = Sprites.url('sword', tierPal(e.weapon ? e.weapon.tier : 3));
    const C = window.Cloud;
    $('who-name').textContent = C && C.state === 'in' && C.user ? (C.user.name || '모험가') : '게스트 모험가';
  }
  function growAlert() {
    const s = S();
    return Object.keys(s.skills).some(id => Game.canUp(s.skills, id)) || Game.canAscend('pet') || Game.canAscend('skill');
  }

  // ---------------- 전투 HUD ----------------
  function renderHud() {
    const R = Game.R, s = S();
    if (R.mode === 'dun') {
      $('stage-label').textContent = PF.dungeonById[R.dun.id].name + ' ' + PF.dungeonLabel(R.dun.lvl);
      $('waves').innerHTML = '';
    } else {
      $('stage-label').textContent = Game.stageLabel() + (s.farming ? ' (반복)' : '');
      let h = '';
      for (let i = 1; i <= PF.WAVES; i++) {
        if (i > 1) h += `<b class="${i <= R.wave ? 'on' : ''}"></b>`;
        h += `<i class="${i < R.wave ? 'on' : i === R.wave ? 'cur' : ''}"></i>`;
      }
      $('waves').innerHTML = h;
    }
    $('dun-timer').hidden = R.mode !== 'dun';
    $('btn-leave').hidden = R.mode !== 'dun';
    $('btn-challenge').hidden = !(s.farming && R.mode === 'stage');
    // 스킬 버튼
    document.querySelectorAll('.skill-btn').forEach(b => {
      const id = s.skillEq[+b.dataset.i];
      b.innerHTML = id ? ico(PF.skillById[id].icon) + '<span class="cd"></span>' : '';
      b.className = 'skill-btn' + (id ? afCls(s.skills[id].asc) : '');
      b.style.background = id ? PF.RAR[PF.skillById[id].r].col : '';
    });
    const ab = $('btn-auto');
    ab.classList.toggle('on', s.autoSkill);
    ab.innerHTML = s.autoSkill ? '자동<br>켜짐' : '자동<br>꺼짐';
  }
  Game.on('stage', renderHud);
  function tickHud() {
    const R = Game.R, s = S();
    document.querySelectorAll('.skill-btn').forEach(b => {
      const i = +b.dataset.i, id = s.skillEq[i], cd = b.querySelector('.cd');
      if (!id || !cd) return;
      const p = R.cds[i] / PF.skillById[id].cd;
      cd.style.background = p > 0 ? `conic-gradient(rgba(26,18,34,.7) ${p * 360}deg, transparent 0)` : '';
    });
    if (R.mode === 'dun' && R.dun) {
      const t = Math.max(0, R.dun.timer);
      $('dun-timer').textContent = (R.dun.id === 'invade' ? '버티기 ' : '남은 시간 ') + t.toFixed(1) + '초';
      $('dun-timer').classList.toggle('low', t < 6);
    }
  }
  document.querySelectorAll('.skill-btn').forEach(b => b.addEventListener('click', () => { Audio8.init(); Game.castSkill(+b.dataset.i); }));
  $('btn-auto').onclick = () => { Audio8.init(); S().autoSkill = !S().autoSkill; renderHud(); Game.Store.save(); };
  $('btn-challenge').onclick = () => { Audio8.play('click'); Game.challenge(); };
  $('btn-leave').onclick = () => { Game.leaveDungeon(); };

  // ---------------- 패널 ----------------
  function renderPanel() {
    const p = $('panel'), top = p.scrollTop;
    p.innerHTML = ({ home: viewHome, dungeon: viewDungeon, grow: viewGrow, settings: viewSettings })[ui.tab]();
    p.scrollTop = top;
    if (ui.tab === 'grow') paintPetCanvases(p);
    renderTop();
  }
  let panelQueued = false;
  function queuePanel() { if (!panelQueued) { panelQueued = true; requestAnimationFrame(() => { panelQueued = false; renderPanel(); }); } }
  document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => {
    Audio8.init(); Audio8.play('click');
    ui.tab = b.dataset.tab;
    document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b));
    $('panel').scrollTop = 0;
    renderPanel();
  }));

  // ===== 대장간(홈) =====
  function slotTile(sl) {
    const it = S().equip[sl.id];
    const wide = sl.id === 'mount' ? ' wide' : '';
    if (!it) return `<button class="slot empty${wide}" data-slot="${sl.id}" aria-label="${sl.name} 비어 있음">${ico(sl.vars[0][1])}</button>`;
    return `<button class="slot tier-bg${wide}${afCls(it.asc)}" data-slot="${sl.id}" style="${tierBg(it.tier)}" aria-label="${esc(Game.itemName(it))}">${ico(Game.itemIcon(it), tierPal(it.tier))}<span class="lv">Lv.${it.lvl}</span>${astar(it.asc)}</button>`;
  }
  function viewHome() {
    const s = S();
    return `<div class="equip-grid">${PF.SLOTS.map(slotTile).join('')}</div>
      <div class="forge-row">
        <button class="info-btn" data-act="forge-info" aria-label="확률 정보">i</button>
        <button class="anvil-btn" data-act="craft" aria-label="장비 제작">${ico('hammer', null, 'ham')}${ico('anvil', null, 'anv')}<span class="cnt">${ico('hammer')}<span>${fmt(s.hammers)}</span></span></button>
        <button class="px-btn col${s.forge.lvl >= PF.FORGE_MAX ? ' green' : ''}" data-act="forge-info"><span class="sub">대장간${s.forge.asc ? ' ★' + s.forge.asc : ''}</span>${s.forge.lvl >= PF.FORGE_MAX ? '승천!' : '레벨 ' + s.forge.lvl}</button>
        <button class="px-btn col${ui.auto ? ' running' : ''}" id="auto-btn" data-act="auto"><span class="sub">자동</span>${ui.auto ? '정지' : '↻'}</button>
      </div>
      <p class="note" style="margin-top:10px">모루를 눌러(PC는 스페이스 바) 망치 1개로 장비를 제작해요. 적을 쓰러뜨리면 망치와 왕관을 얻어요.</p>`;
  }
  function itemCard(it, tag, cmp) {
    const sl = PF.slotById[it.slot];
    const main = [];
    if (it.atk) main.push(fmt(it.atk) + ' 공격력');
    if (it.hp) main.push(fmt(it.hp) + ' 체력');
    let arrow = '';
    if (cmp !== undefined) arrow = cmp > 0 ? ' <span class="up">▲</span>' : cmp < 0 ? ' <span class="down">▼</span>' : '';
    return `<div class="item-card${tag === 'new' ? ' new' : ''}">${tag === 'eq' ? '<span class="tag">장착됨</span>' : ''}
      <div class="ico tier-bg${afCls(it.asc)}" style="${tierBg(it.tier)}">${ico(Game.itemIcon(it), tierPal(it.tier))}<span class="lv">Lv.${it.lvl}</span>${astar(it.asc)}</div>
      <div><div class="nm" style="color:${tierPal(it.tier)[it.tier === 8 ? 0 : 1]}">${esc(Game.itemName(it))}${it.asc ? ` <span class="astxt">승천 ${it.asc}</span>` : ''}</div>
      <div class="main">${main.join(' · ')}${arrow}</div>
      <div class="subs">${it.subs.map(([id, v]) => `+${v}% ${PF.subById[id].name}`).join('<br>')}</div>
      <div class="subs" style="font-size:11px">${sl.name} · 판매가 ${fmt(PF.sellPrice(it))}</div></div></div>`;
  }
  function showCompare(it) {
    const cur = S().equip[it.slot];
    const diff = Game.stats(it).power - Game.stats().power;
    modal(`${cur ? itemCard(cur, 'eq') : '<p class="note">이 칸은 비어 있어요</p>'}
      <div style="height:10px"></div>${itemCard(it, 'new', diff)}
      <p class="new-tag">새로운! · 전투력 ${diff >= 0 ? '+' : '-'}${fmt(Math.abs(diff))}</p>
      <div class="btn-row"><button class="px-btn red" data-act="sell">판매 +${fmt(PF.sellPrice(it))}</button><button class="px-btn" data-act="equip">장착</button></div>`,
    { noClose: true, on: act => {
      if (act === 'sell') Game.sell(it); else Game.equipItem(it);
      closeModal(); renderAvatar(); queuePanel();
    } });
  }
  function doCraft() {
    Audio8.init();
    const it = Game.craft();
    if (!it) { Game.toast('망치가 부족해요. 적을 쓰러뜨리거나 망치 도둑 던전에 가 보세요'); return null; }
    const a = document.querySelector('.anvil-btn');
    if (a) { a.classList.remove('hit'); void a.offsetWidth; a.classList.add('hit'); }
    renderTop();
    return it;
  }
  // 수동 제작: 약 1초 동안 망치로 3번 두드리는 모션 뒤에 결과를 보여줘요
  function forgeAnim() {
    const a = document.querySelector('.anvil-btn');
    if (ui.auto || ui.forging || !a) return;
    if (S().hammers < 1) { doCraft(); return; }
    Audio8.init();
    ui.forging = true;
    a.classList.add('forging');
    [230, 560, 890].forEach(t => setTimeout(() => { // 망치가 모루에 닿는 순간
      Audio8.play('craft');
      a.classList.remove('hit'); void a.offsetWidth; a.classList.add('hit');
      for (let i = 0; i < 7; i++) {
        const sp = document.createElement('i');
        sp.className = 'spark';
        sp.style.setProperty('--dx', (Math.random() * 70 - 35).toFixed(0) + 'px');
        sp.style.setProperty('--dy', (-15 - Math.random() * 30).toFixed(0) + 'px');
        sp.style.background = Math.random() < 0.5 ? '#ffd23a' : '#ff9a30';
        a.appendChild(sp);
        setTimeout(() => sp.remove(), 450);
      }
    }, t));
    setTimeout(() => {
      a.classList.remove('forging');
      ui.forging = false;
      const it = doCraft();
      if (it) showCompare(it);
    }, 1000);
  }
  function stopAuto() { if (ui.auto) { clearInterval(ui.auto); ui.auto = null; queuePanel(); } }
  function startAuto() {
    if (ui.auto) return;
    ui.auto = setInterval(() => {
      if (modalOpen()) return;
      const it = doCraft();
      if (!it) { stopAuto(); return; }
      const s = S();
      if (it.tier >= s.auto.minTier || (s.auto.better && Game.isBetter(it))) { stopAuto(); showCompare(it); }
      else Game.sell(it, true);
    }, 220);
    queuePanel();
  }
  function showAutoSettings() {
    const s = S();
    modal(`<h3>자동 제작</h3><p class="sub-t">조건에 맞는 장비가 나오면 멈추고, 나머지는 자동으로 판매해요</p>
      <div class="box"><label>멈출 등급: <select id="auto-tier">${PF.TIERS.map((t, i) => `<option value="${i}"${i === s.auto.minTier ? ' selected' : ''}>${t.name} 이상</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="auto-better"${s.auto.better ? ' checked' : ''}> 지금 장비보다 강하면 멈춤</label></div>
      <div class="btn-row"><button class="px-btn green" data-act="go">자동 제작 시작</button></div>`,
    { on: act => {
      if (act !== 'go') return;
      s.auto.minTier = +$('auto-tier').value; s.auto.better = $('auto-better').checked;
      Game.Store.save(); closeModal(); startAuto();
    } });
  }
  function showForgeInfo() {
    const s = S(), L = s.forge.lvl, A = s.forge.asc, maxed = L >= PF.FORGE_MAX;
    const cur = PF.forgeRates(L), nxt = PF.forgeRates(Math.min(L + 1, PF.FORGE_MAX)), cost = PF.forgeStepCost(L);
    const rows = PF.TIERS.map((t, i) => `<tr class="${cur[i] || nxt[i] ? 'clickable' : 'zero'}" data-act="tier-${i}" style="${tierBg(i)}">
      <td>${ico('sword', t.pal)} ${t.name}</td><td>${PF.pct(cur[i], cur[i] < 1 && cur[i] > 0 ? 2 : 1)}</td><td class="next">${PF.pct(nxt[i], nxt[i] < 1 && nxt[i] > 0 ? 2 : 1)}</td></tr>`).join('');
    let g = '';
    for (let i = 0; i < PF.FORGE_STEPS; i++) g += `<i class="${i < s.forge.gauge ? 'on' : ''}"></i>`;
    modal(`<h3>확률 정보</h3><div class="sub-t">제작 확률 · 누적 제작 ${fmt(s.forge.crafts)}회${A ? ` · 승천 ${A}단계 (지금 만드는 장비 ×${fmt(PF.itemAscMul(A))})` : ''}</div>
      <div class="lvl-head"><span>레벨 ${L}</span><span>▶</span><span class="n">${maxed ? '최대' : '레벨 ' + (L + 1)}</span></div>
      <table class="rate-table">${rows}</table>
      ${maxed ? `<p class="note">${ASC_TEXT.forge}</p><div class="btn-row"><button class="px-btn green" data-act="forge-asc">대장간 승천 ★${A + 1}</button></div>`
      : `<p class="note">왕관을 낼 때마다 게이지가 한 칸 차요. 10칸이 차면 대장간 레벨이 올라 더 높은 등급이 나와요. Lv.100이 되면 승천할 수 있어요.</p>
      <div class="gauge">${g}</div>
      <div class="btn-row"><button class="px-btn col" data-act="invest" data-need="crowns:${cost}"${s.crowns < cost ? ' disabled' : ''}>등급 상승<span class="cost${s.crowns < cost ? ' short' : ''}">${ico('coin')}${fmt(cost)}</span></button></div>`}
      <div class="btn-row"><button class="px-btn gray small" data-act="list">모든 장비의 목록</button></div>`,
    { on: act => {
      if (act === 'invest') { if (Game.forgeInvest()) showForgeInfo(); }
      else if (act === 'forge-asc') { if (Game.ascend('forge')) { closeModal(); queuePanel(); } }
      else if (act === 'list') showItemList();
      else if (act.startsWith('tier-')) showItemList(+act.slice(5));
    } });
  }
  function showItemList(only) {
    const rates = PF.forgeRates(S().forge.lvl);
    const tiers = only == null ? PF.TIERS.map((_, i) => i) : [only];
    modal(`<h3>모든 장비의 목록</h3>${tiers.map(t => `<div class="tier-head tier-bg" style="${tierBg(t)}"><span>${PF.TIERS[t].name}</span><span>${PF.pct(rates[t], 1)}</span></div>
      <div class="list-grid">${PF.ITEMS.map(x => `<div>${ico(x.icon, tierPal(t))}<br>${(rates[t] * x.p).toFixed(4)}%</div>`).join('')}</div>`).join('')}`,
    { on: () => { } });
  }

  // ===== 던전 =====
  function viewDungeon() {
    Game.checkKeys();
    const s = S();
    return `<h2>던전</h2><p class="note">던전 열쇠는 매일 09:00에 ${PF.KEYS_PER_DAY}개로 채워져요.<br>열쇠는 던전을 완료할 때만 써요.</p>
      ${PF.DUNGEONS.map(d => {
        const dd = s.dun[d.id], art = { thief: ico('thief'), ghost: ico('ghost', ['#c0ffc0', '#60c080', '#206040']), invade: ico('orc', ['#ff9a9a', '#e04848', '#802020']) }[d.id];
        return `<div class="dun-card dun-${d.id}"><div class="ttl">${d.id === 'invade' ? ico('egg', EGG_RES) : ico(d.icon)}${d.name}</div>
          <span class="art">${art}</span>
          <div class="side"><div class="keys">${ico('key')}${dd.keys}/${PF.KEYS_PER_DAY}</div>
          <button class="px-btn" data-act="dun-${d.id}">열기</button></div></div>`;
      }).join('')}`;
  }
  function rewardHtml(rw) {
    return Object.keys(rw).map(k => `<span class="cost">${resIco(k)}${fmt(rw[k])}</span>`).join(' ');
  }
  function showDungeon(id) {
    const d = PF.dungeonById[id], dd = S().dun[id];
    modal(`<h3>${d.name}</h3><p class="sub-t">${d.desc}</p>
      <div style="text-align:center;font-size:13px">난이도</div><div style="text-align:center;font-size:26px;margin-bottom:8px">${PF.dungeonLabel(dd.lvl)}</div>
      <div class="bonus-bar">보상: ${rewardHtml(d.reward(dd.lvl))}</div>
      <div style="text-align:center;font-size:20px" class="keys">${ico('key')} ${dd.keys}/${PF.KEYS_PER_DAY}</div>
      <div class="btn-row"><button class="px-btn col small" data-act="sweep"${dd.lvl < 1 || dd.keys < 1 ? ' disabled' : ''}>이전 스테이지 소탕${dd.lvl > 0 ? `<span class="sub">${PF.dungeonLabel(dd.lvl - 1)} 보상 즉시 받기</span>` : ''}</button>
      <button class="px-btn" data-act="enter"${dd.keys < 1 || Game.R.mode === 'dun' ? ' disabled' : ''}>입장</button></div>`,
    { on: act => {
      if (act === 'sweep') { const rw = Game.sweep(id); if (rw) { Game.toast('소탕 완료!'); showDungeon(id); } }
      if (act === 'enter') { if (Game.startDungeon(id)) { closeModal(); stopAuto(); } }
    } });
  }
  Game.on('dunResult', r => {
    const d = PF.dungeonById[r.id];
    modal(`<h3>${r.win ? '성공!' : '실패...'}</h3><p class="sub-t">${d.name} ${PF.dungeonLabel(r.lvl)}</p>
      ${r.win ? `<div class="bonus-bar">보상: ${rewardHtml(r.rw)}</div><p class="note">다음 난이도 ${PF.dungeonLabel(r.lvl + 1)}이(가) 열렸어요</p>` : '<p class="note">열쇠는 그대로예요. 더 강해져서 다시 도전하세요!</p>'}`);
    queuePanel();
  });

  // ===== 성장(스킬·펫) =====
  function viewGrow() {
    return `<div class="subtabs"><button data-act="sub-skill" class="${ui.sub === 'skill' ? 'on' : ''}">스킬</button><button data-act="sub-pet" class="${ui.sub === 'pet' ? 'on' : ''}">펫</button></div>`
      + (ui.sub === 'skill' ? viewSkills() : viewPets());
  }
  function shardBar(o, cls) {
    if (o.lvl >= PF.MAX_LVL) return '<div class="maxed">최대</div>';
    const need = PF.shardNeed(o.lvl), ready = o.shards >= need;
    return `<div class="bar${ready ? ' ready' : ''} ${cls || ''}"><i style="width:${Math.min(100, o.shards / need * 100)}%"></i><span>${o.shards}/${need}</span></div>`;
  }
  function viewSkills() {
    const s = S(), st = Game.stats(), cost = PF.SKILL_COST * s.mult.skill, sum = s.skillSum, A = s.skillAsc;
    const owned = Object.keys(s.skills).length;
    const cards = PF.SKILLS.map(sk => {
      const o = s.skills[sk.id];
      if (!o) return `<button class="card locked" data-act="skill-${sk.id}"><div class="disc" style="${rarBg(sk.r)}">${ico(sk.icon)}</div><div class="maxed">?</div></button>`;
      const eq = s.skillEq.includes(sk.id);
      return `<button class="card" data-act="skill-${sk.id}"><div class="disc${afCls(o.asc)}" style="${rarBg(sk.r)}">${ico(sk.icon)}<span class="lv">Lv.${o.lvl}</span>${eq ? '<span class="eq">장착됨</span>' : ''}${astar(o.asc)}</div>${shardBar(o)}</button>`;
    }).join('');
    const eqHtml = s.skillEq.map(id => id ? `<div class="mini${afCls(s.skills[id].asc)}" style="${rarBg(PF.skillById[id].r)}">${ico(PF.skillById[id].icon)}<span>Lv.${s.skills[id].lvl}</span></div>` : '<div class="mini"></div>').join('');
    return `<div class="res-head"><span class="pill" style="color:#fff">${ico('ticket')}<span>${fmt(s.tickets)}</span></span><h2>스킬 ${owned}/${PF.SKILLS.length}</h2><span class="pill" style="color:#fff;min-width:0">승천 ${A}</span></div>
      <div class="bonus-bar">+${fmt(st.pAtk)} 기본 피해 +${fmt(st.pHp)} 기본 체력${A ? ` · 새로 뽑는 스킬 ★${A} 세대 ×${fmt(PF.skillAscMul(A))}` : ''}</div>
      <div class="card-grid">${cards}</div>
      <div class="eq-row"><span class="lab">장착됨</span><div class="slots">${eqHtml}</div></div>
      <div class="btn-row"><button class="px-btn" data-act="upall-skill">모두 업그레이드</button><button class="px-btn" data-act="quick-skill">빠른 장착</button></div>
      ${summonRow('skill', 'ticket', s.tickets, cost)}
      <p class="note" style="margin-top:8px">티켓은 <b>유령 마을</b> 던전에서 얻어요.</p>`;
  }
  function summonRow(kind, icoName, have, cost) {
    const s = S(), sum = kind === 'skill' ? s.skillSum : s.petSum, mult = s.mult[kind], maxed = sum.lvl >= PF.SUM_MAX;
    const ic = icoName === 'egg' ? ico('egg', EGG_RES) : ico(icoName);
    return `<div class="summon-row"><button class="px-btn mult" data-act="mult-${kind}">x${mult}</button>
        <button class="px-btn col" data-act="summon-${kind}" data-need="${kind === 'skill' ? 'tickets' : 'eggs'}:${cost}"${have < cost ? ' disabled' : ''}>소환 x${mult}<span class="cost">${ic}${fmt(cost)}</span></button>
        <div class="lvinfo"><button class="info-btn" data-act="rates-${kind}">i</button>${maxed ? '<b>최대</b>' : 'Lv. ' + sum.lvl}
        ${maxed ? `<button class="px-btn small green" data-act="ascend-${kind}">승천</button>` : `<div class="bar"><i class="blue" style="width:${sum.cnt / PF.sumNeed(sum.lvl) * 100}%"></i><span>${sum.cnt}/${PF.sumNeed(sum.lvl)}</span></div>`}</div></div>`;
  }
  function petCanvas(id, size, asc) { return `<canvas data-pet="${id}" data-asc="${asc || 0}" width="${size || 16}" height="${size || 16}"></canvas>`; }
  function paintPetCanvases(root) {
    root.querySelectorAll('canvas[data-pet]').forEach(c => {
      const g = c.getContext('2d'), id = c.dataset.pet;
      const img = Sprites.bake(PF.petById[id].shape, PF.petById[id].tint);
      const sc = Math.max(1, Math.floor(c.width / (img.width + 2)));
      g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
      Game.drawPet(g, id, c.width / 2, c.height - Math.floor((c.height - img.height * sc) / 2), +c.dataset.asc || 0, 0, sc);
    });
  }
  function stars(n) { return n > 0 ? '★'.repeat(Math.min(n, 5)) + (n > 5 ? '+' + (n - 5) : '') : ''; }
  const sortedPets = () => S().petInv.slice().sort((a, b) => (PF.petById[b.id].r * 1000 + b.lvl) - (PF.petById[a.id].r * 1000 + a.lvl));
  function petCard(p, act) {
    const s = S(), d = PF.petById[p.id], eq = s.petEq.includes(p.u);
    return `<button class="card pet" data-act="${act || 'pet-' + p.u}"><div class="disc${afCls(p.asc)}" style="${rarBg(d.r)}">${petCanvas(p.id, 36, p.asc)}<span class="lv">Lv.${p.lvl}</span>${eq ? '<span class="eq">장착됨</span>' : ''}${astar(p.asc)}</div><div style="font-size:10px;margin-top:4px">${d.name}</div></button>`;
  }
  function viewPets() {
    const s = S(), cost = PF.PET_COST * s.mult.pet;
    const list = sortedPets();
    const cards = list.length ? list.map(p => petCard(p)).join('') : '<p class="note" style="grid-column:1/-1">아직 펫이 없어요. 알을 뽑아 부화시켜 보세요!</p>';
    const eqHtml = s.petEq.map(u => { const p = Game.pet(u); return p ? `<div class="mini${afCls(p.asc)}" style="${rarBg(PF.petById[p.id].r)}">${petCanvas(p.id, 36, p.asc)}<span>Lv.${p.lvl}</span></div>` : '<div class="mini"></div>'; }).join('');
    const nests = s.incub.map((e, i) => {
      if (!e) return `<div class="nest"><div class="lamp"></div><div class="pillow"></div><span>비어 있음</span></div>`;
      return `<div class="nest"><div class="lamp on"></div><div class="pillow">${ico('egg', eggPal(e.r), 'wob')}</div><span style="color:${PF.RAR[e.r].col}">${PF.RAR[e.r].name}</span><div class="bar"><i class="blue" data-incub="${i}"></i><span data-incub-t="${i}"></span></div></div>`;
    }).join('');
    const n = s.incub.length, slotCost = n < PF.SLOT_MAX ? PF.slotCost(n) : 0, free = s.incub.filter(x => !x).length;
    const box = PF.RAR.map((x, r) => `<button class="egg-stack${s.eggBox[r] ? '' : ' empty'}" data-act="hatch-${r}"${s.eggBox[r] ? '' : ' disabled'} aria-label="${x.name} 알 부화">
      ${ico('egg', eggPal(r))}<b>x${fmt(s.eggBox[r])}</b><span style="color:${x.col}">${x.name}</span><small>${PF.HATCH_SEC[r] < 60 ? PF.HATCH_SEC[r] + '초' : PF.HATCH_SEC[r] / 60 + '분'}</small></button>`).join('');
    return `<div class="res-head"><span class="pill" style="color:#fff">${ico('egg', EGG_RES)}<span>${fmt(s.eggs)}</span></span><h2>펫 ${list.length}</h2><span class="pill" style="color:#fff;min-width:0">승천 ${s.asc}</span></div>
      <div class="bonus-bar">장착 효과: 피해 +${fmt(Game.stats().petP)}%${s.asc ? ` · 새로 부화하는 펫 ★${s.asc} 세대 ×${fmt(PF.petAscMul(s.asc))}` : ''}</div>
      <div class="eq-row pets" style="margin-top:0"><span class="lab">장착됨</span><div class="slots">${eqHtml}</div></div>
      <p class="note" style="margin:-2px 0 8px">장착한 펫을 눌러 <b>강화</b> 탭에서 같은 등급의 알·펫을 재료로 레벨을 올려요.</p>
      <div class="card-grid">${cards}</div>
      <div class="btn-row"><button class="px-btn" data-act="quick-pet">빠른 장착</button></div>
      ${summonRow('pet', 'egg', s.eggs, cost)}
      <div class="incub"><div class="row">${nests}
        ${n < PF.SLOT_MAX ? `<div class="buy">슬롯 +1<button class="px-btn small gray" data-act="buy-slot" data-need="crowns:${slotCost}"${s.crowns < slotCost ? ' disabled' : ''}>${ico('coin')}${fmt(slotCost)}</button></div>` : ''}</div>
        <div class="q">알 보관함 — 부화시킬 알을 누르세요 (빈 슬롯 ${free}개)</div>
        <div class="egg-box">${box}</div></div>
      <p class="note" style="margin-top:8px">알 재화는 <b>침략</b> 던전에서 얻어요.</p>`;
  }
  function tickIncub() {
    if (ui.tab !== 'grow' || ui.sub !== 'pet') return;
    const s = S(), t = Date.now();
    s.incub.forEach((e, i) => {
      const bar = document.querySelector(`[data-incub="${i}"]`), tx = document.querySelector(`[data-incub-t="${i}"]`);
      if (!e || !bar) return;
      const left = Math.max(0, e.end - t);
      bar.style.width = (100 - left / e.dur * 100) + '%';
      tx.textContent = Math.ceil(left / 1000) + '초';
    });
  }
  function showSkill(id) {
    const s = S(), sk = PF.skillById[id], o = s.skills[id], A = o ? o.asc || 0 : s.skillAsc, am = PF.skillAscMul(A);
    const lv = o ? o.lvl : 1, mul = PF.skillLvlMul(lv) * am;
    const eff = { dmg: `적 하나에게 공격력의 ${Math.round(sk.mult * mul * 100)}% 피해`, aoe: `모든 적에게 공격력의 ${Math.round(sk.mult * mul * 100)}% 피해`,
      multi: `공격력의 ${Math.round(sk.mult * mul * 100)}% 피해를 ${sk.hits}번`, heal: `최대 체력의 ${Math.round(sk.mult * (1 + lv * 0.005) * 100)}% 회복${sk.invul ? `, ${sk.invul}초 무적` : ''}`,
      buff: { guard: `${sk.dur}초 동안 받는 피해 -${Math.round(sk.val * (1 + lv * 0.01) * 100)}%`, atk: `${sk.dur}초 동안 공격력 +${Math.round(sk.val * (1 + lv * 0.01) * 100)}%`, leech: `${sk.dur}초 동안 생명력 흡수 +${Math.round(sk.val * (1 + lv * 0.01) * 100)}%` }[sk.buff] }[sk.kind];
    const eq = s.skillEq.includes(id);
    modal(`<div class="detail-top"><div class="big${o ? afCls(A) : ''}" style="${rarBg(sk.r)};border-radius:50%">${ico(sk.icon)}${o ? astar(A) : ''}</div>
      <div><div style="color:${PF.RAR[sk.r].col};text-shadow:1px 1px 0 #1a1222">${PF.RAR[sk.r].name}</div><div style="font-size:18px">${sk.name} <span style="color:#e0a000">${stars(A)}</span></div><div>${o ? 'Lv.' + o.lvl : '미보유'}</div></div></div>
      <div class="desc">${eff}<br>재사용 대기 ${sk.cd}초<br>보유 효과: 기본 피해 +${fmt(PF.SKILL_PASSIVE[sk.r] * lv * am)}, 기본 체력 +${fmt(PF.SKILL_PASSIVE[sk.r] * lv * 8 * am)}${A ? `<br>★${A} 세대 스킬: 효과 ×${fmt(am)}` : ''}${o && (o.asc || 0) < s.skillAsc ? `<br><b>지금 소환하면 ★${s.skillAsc} 세대로 다시 얻을 수 있어요</b>` : ''}</div>
      ${o ? shardBar(o) : '<p class="note">스킬 소환에서 얻을 수 있어요</p>'}
      ${o ? `<div class="btn-row"><button class="px-btn" data-act="up"${Game.canUp(s.skills, id) ? '' : ' disabled'}>업그레이드</button><button class="px-btn ${eq ? 'red' : 'green'}" data-act="eq">${eq ? '해제' : '장착'}</button></div>` : ''}`,
    { on: act => {
      if (act === 'up' && Game.upgrade('skill', id)) { Audio8.play('level'); Game.emit('skills'); Game.Store.save(); }
      if (act === 'eq' && !Game.toggleEquip('skill', id)) Game.toast('장착 칸이 가득 찼어요. 먼저 하나를 해제하세요');
      showSkill(id);
    } });
  }
  // 펫 상세: [정보] [강화] 탭. 강화는 장착한 펫만, 같은 등급의 알과 장착하지 않은 펫을 재료로 써요.
  function showPet(u, tab) {
    const s = S(), p = Game.pet(u);
    if (!p) { closeModal(); return; }
    const d = PF.petById[p.id], eq = s.petEq.includes(u), A = p.asc || 0;
    tab = tab || ui.petTab || 'info';
    ui.petTab = tab;
    if (!ui.sel || ui.sel.u !== u) ui.sel = { u, eggs: 0, mats: [] };
    const sel = ui.sel;
    sel.mats = sel.mats.filter(m => Game.pet(m) && !s.petEq.includes(m));
    sel.eggs = Math.min(sel.eggs, s.eggBox[d.r]);
    const head = `<div class="detail-top"><div class="big${afCls(A)}" style="${rarBg(d.r)}">${petCanvas(p.id, 64, A)}${astar(A)}</div>
      <div><div style="color:${d.r ? PF.RAR[d.r].col : '#888'};text-shadow:1px 1px 0 #1a1222">${PF.RAR[d.r].name}</div><div style="font-size:18px">${d.name} <span style="color:#e0a000">${stars(A)}</span></div><div>Lv.${p.lvl}${eq ? ' · 장착됨' : ''}</div></div></div>
      <div class="subtabs"><button data-act="ptab-info" class="${tab === 'info' ? 'on' : ''}">정보</button><button data-act="ptab-up" class="${tab === 'up' ? 'on' : ''}">강화</button></div>`;
    let body;
    if (tab === 'info') {
      body = `<div class="desc">1.6초마다 영웅 공격력의 ${fmt(PF.PET_MULT[d.r] * (1 + p.lvl * 0.03) * PF.petAscMul(A) * 100)}% 피해<br>장착 효과: 피해 +${fmt(PF.PET_PASSIVE[d.r] * p.lvl * PF.petAscMul(A))}%${A ? `<br>★${A} 세대 펫: 능력치 ×${fmt(PF.petAscMul(A))}` : ''}</div>
        <div class="btn-row"><button class="px-btn ${eq ? 'red' : 'green'}" data-act="eq">${eq ? '해제' : '장착'}</button></div>`;
    } else if (!eq) {
      body = `<p class="note">강화는 <b>장착한 펫</b>만 할 수 있어요. 먼저 장착해 주세요.</p><div class="btn-row"><button class="px-btn green" data-act="eq">장착</button></div>`;
    } else if (p.lvl >= PF.MAX_LVL) {
      body = '<p class="note">최대 레벨(Lv.100)이에요!</p>';
    } else {
      const gain = Game.petGain(u, sel.eggs, sel.mats);
      const mats = sortedPets().filter(q => q.u !== u && !s.petEq.includes(q.u) && PF.petById[q.id].r === d.r);
      body = `<div class="enh-preview">Lv.${p.lvl} <b>▶</b> <span class="up">Lv.${p.lvl + gain}</span></div>
        <div class="box"><h3>${ico('egg', eggPal(d.r))} 같은 등급 알 <small>(1개 = +1레벨, 보유 ${fmt(s.eggBox[d.r])}개)</small></h3>
          <div class="stepper"><button class="px-btn small gray" data-act="egg--10">-10</button><button class="px-btn small gray" data-act="egg--1">-1</button><b>${sel.eggs}</b><button class="px-btn small" data-act="egg-1">+1</button><button class="px-btn small" data-act="egg-10">+10</button><button class="px-btn small" data-act="egg-max">최대</button></div></div>
        <div class="box"><h3>장착하지 않은 ${PF.RAR[d.r].name} 펫 <small>(그 펫 레벨만큼 +레벨)</small></h3>
          ${mats.length ? `<div class="card-grid">${mats.map(q => petCard(q, 'mat-' + q.u).replace('class="card pet"', `class="card pet${sel.mats.includes(q.u) ? ' picked' : ''}"`)).join('')}</div>` : '<p class="note">재료로 쓸 수 있는 펫이 없어요</p>'}</div>
        <div class="btn-row"><button class="px-btn green" data-act="enhance"${gain > 0 ? '' : ' disabled'}>강화 +${gain}레벨</button></div>`;
    }
    modal(head + body, { on: act => {
      if (act === 'ptab-info') return showPet(u, 'info');
      if (act === 'ptab-up') return showPet(u, 'up');
      if (act === 'eq' && !Game.toggleEquip('pet', u)) Game.toast('장착 칸이 가득 찼어요. 먼저 하나를 해제하세요');
      if (act.startsWith('egg-')) {
        const k = act.slice(4), room = PF.MAX_LVL - p.lvl - Game.petGain(u, 0, sel.mats);
        const maxEggs = Math.max(0, Math.min(s.eggBox[d.r], room));
        sel.eggs = k === 'max' ? maxEggs : Math.max(0, Math.min(maxEggs, sel.eggs + (+k)));
      }
      if (act.startsWith('mat-')) {
        const m = +act.slice(4), i = sel.mats.indexOf(m);
        if (i >= 0) sel.mats.splice(i, 1);
        else if (p.lvl + Game.petGain(u, sel.eggs, sel.mats) < PF.MAX_LVL) sel.mats.push(m);
        else Game.toast('이미 최대 레벨까지 채웠어요');
      }
      if (act === 'enhance') {
        const g = Game.petEnhance(u, sel.eggs, sel.mats);
        if (g) { Game.toast(d.name + ' Lv.' + p.lvl + '!'); ui.sel = null; }
      }
      showPet(u);
    } });
    paintPetCanvases($('modal'));
  }
  function showSummon(kind, out) {
    let cards;
    if (kind === 'skill') cards = out.map((x, i) => { const sk = PF.skillById[x.id]; return `<div class="card" style="animation-delay:${i * 0.06}s"><div class="disc${afCls(x.asc)}" style="${rarBg(sk.r)}">${ico(sk.icon)}${astar(x.asc)}</div><div style="font-size:10px;margin-top:4px">${x.isNew ? '<span class="down">NEW</span> ' : ''}${sk.name}</div></div>`; });
    else cards = out.map((r, i) => `<div class="card" style="animation-delay:${Math.min(i, 30) * 0.04}s"><div class="disc" style="${rarBg(r)};border-radius:4px">${ico('egg', eggPal(r))}</div><div style="font-size:10px;margin-top:4px">${PF.RAR[r].name} 알</div></div>`);
    modal(`<h3>소환 결과</h3><div class="result-grid">${cards.join('')}</div>
      ${kind === 'pet' ? '<p class="note">알은 <b>알 보관함</b>에 무제한으로 쌓여요. 보관함에서 부화시킬 알을 골라 주세요.</p>' : ''}
      <div class="btn-row"><button class="px-btn" data-act="again">한 번 더</button></div>`,
    { on: act => { if (act === 'again') doSummon(kind); } });
  }
  function doSummon(kind) {
    const s = S(), n = s.mult[kind];
    const out = kind === 'skill' ? Game.summonSkills(n) : Game.summonPets(n);
    if (!out) { Game.toast(kind === 'skill' ? '티켓이 부족해요' : '알이 부족해요'); closeModal(); return; }
    showSummon(kind, out);
  }
  const ASC_TEXT = {
    pet: '승천하면 소환 레벨과 확률이 처음(Lv.1)으로 돌아가요. 대신 그 뒤로 부화하는 펫은 한 세대 위(능력치 ×8.3)라서, 승천 후 서사시 펫이 지금의 신화 펫과 맞먹어요. 새 펫은 외형·테두리가 업그레이드되고 별이 하나 붙어요.',
    skill: '승천하면 소환 레벨과 확률이 처음(Lv.1)으로 돌아가요. 대신 그 뒤로 뽑는 스킬은 한 세대 위(효과 ×16.7)로 새로 얻어져서, 승천 후 서사시 스킬이 지금의 신화 스킬과 맞먹어요. 새 스킬 카드는 테두리가 업그레이드되고 별이 하나 붙어요.',
    forge: '승천하면 대장간 레벨과 확률이 처음(Lv.1)으로 돌아가요. 대신 그 뒤로 만드는 장비는 한 세대 위(능력치 ×3,400)라서, 승천 후 3번째 등급(청동)이 지금의 신성 장비와 맞먹어요. 새 장비는 승천 테두리와 별이 붙어요.',
  };

  function showRates(kind, L) {
    const s = S(), sum = kind === 'skill' ? s.skillSum : s.petSum;
    L = L || sum.lvl;
    const r = (kind === 'skill' ? PF.skillRates : PF.petRates)(L);
    const maxed = sum.lvl >= PF.SUM_MAX && L === PF.SUM_MAX;
    modal(`<div class="nav-arrows"><button class="arrow l" data-act="prev"${L <= 1 ? ' disabled' : ''} aria-label="이전"></button>
      <div style="text-align:center"><h3>레벨 ${L}</h3><div>소환 확률 · 승천 ${kind === 'skill' ? s.skillAsc : s.asc}</div></div>
      <button class="arrow r" data-act="next"${L >= PF.SUM_MAX ? ' disabled' : ''} aria-label="다음"></button></div>
      <table class="rate-table" style="margin-top:10px">${PF.RAR.map((x, i) => `<tr class="${r[i] ? '' : 'zero'}" style="${rarBg(i)}"><td>${x.name}</td><td>${r[i].toFixed(2)}%</td></tr>`).join('')}</table>
      ${maxed ? `<p class="note">${ASC_TEXT[kind]}</p><div class="btn-row"><button class="px-btn green" data-act="ascend">승천</button></div>`
        : `<p class="note">${kind === 'skill' ? '스킬' : '펫'}을(를) 소환하여 레벨 업하고 소환 확률을 높이세요! Lv.100이 되면 승천할 수 있어요.</p>
        <div class="bar" style="height:20px"><i class="blue" style="width:${L === sum.lvl && sum.lvl < PF.SUM_MAX ? sum.cnt / PF.sumNeed(sum.lvl) * 100 : L < sum.lvl ? 100 : 0}%"></i><span style="line-height:14px">${L === sum.lvl ? (sum.lvl >= PF.SUM_MAX ? '최대' : sum.cnt + '/' + PF.sumNeed(L)) : L < sum.lvl ? '완료' : '0/' + PF.sumNeed(L)}</span></div>`}`,
    { on: act => {
      if (act === 'prev') showRates(kind, L - 1);
      if (act === 'next') showRates(kind, L + 1);
      if (act === 'ascend') { Game.ascend(kind); closeModal(); queuePanel(); }
    } });
  }

  // ===== 설정 =====
  function viewSettings() {
    const C = window.Cloud || { enabled: false }, s = S(), st = Game.Store;
    let acc;
    if (!C.enabled) acc = `<p>아직 온라인 저장이 설정되지 않아 <b>이 브라우저</b>에만 저장돼요.</p>`;
    else if (C.state === 'in') acc = `<p><b>${esc(C.user.name || '구글 계정')}</b>(으)로 로그인했어요. 진행이 계정에 저장돼요.<br>상태: ${{ synced: '저장됨', error: '<span class="err">저장 실패 — 자동으로 다시 시도해요</span>', local: '브라우저' }[st.status] || st.status}</p>
      <button class="px-btn gray small" data-act="logout">로그아웃</button>`;
    else if (C.state === 'pending') acc = '<p>계정 불러오는 중…</p>';
    else acc = `<p>구글로 로그인하면 진행이 계정에 저장돼 다른 기기에서도 이어서 할 수 있어요. 지금까지 한 게스트 진행은 첫 로그인 때 계정으로 옮겨져요.</p>
      <button class="px-btn" data-act="login">구글로 로그인</button>`;
    if (C.error) acc += `<p class="err">${esc(C.error)}</p>`;
    const admin = C.isAdmin ? `<div class="box"><h3>관리자</h3><div class="btn-row" style="flex-wrap:wrap">
      <button class="px-btn small" data-act="cheat-crowns">왕관 +1m</button><button class="px-btn small" data-act="cheat-hammers">망치 +1000</button>
      <button class="px-btn small" data-act="cheat-tickets">티켓 +5000</button><button class="px-btn small" data-act="cheat-eggs">알 +5000</button>
      <button class="px-btn small" data-act="cheat-forge">대장간 +5</button><button class="px-btn small" data-act="cheat-keys">열쇠 충전</button></div></div>` : '';
    return `<h2>설정</h2>
      <div class="box"><h3>계정</h3>${acc}</div>
      <div class="box"><h3>소리</h3>
        <div class="toggle-row"><span>효과음</span><button class="px-btn small ${s.snd.sfx ? 'green' : 'gray'}" data-act="snd-sfx">${s.snd.sfx ? '켜짐' : '꺼짐'}</button></div>
        <div class="toggle-row"><span>배경음악</span><button class="px-btn small ${s.snd.bgm ? 'green' : 'gray'}" data-act="snd-bgm">${s.snd.bgm ? '켜짐' : '꺼짐'}</button></div></div>
      ${admin}
      <div class="box"><h3>기록</h3><p>최고 스테이지: ${PF.DIFFS[Math.floor(s.best / 50)]} ${Math.floor(s.best / 5) % 10 + 1}-${s.best % 5 + 1} · 대장간 Lv.${s.forge.lvl} · 누적 제작 ${fmt(s.forge.crafts)}회 · 승천 ${s.asc}</p>
        <button class="px-btn small red" data-act="reset">${ui.resetArm ? '정말 처음부터? 한 번 더 누르세요' : '진행 초기화'}</button></div>
      <p class="note links"><a href="/feedback/?work=/pixel-forge/">의견 남기기</a> · <a href="/">작품 목록</a><br>글꼴: 갈무리(Galmuri, OFL)</p>`;
  }
  function settingsAct(act) {
    const s = S(), C = window.Cloud;
    if (act === 'login' && C) C.signIn();
    if (act === 'logout' && C) C.signOut();
    if (act === 'snd-sfx' || act === 'snd-bgm') { const k = act.slice(4); s.snd[k] = !s.snd[k]; Audio8.set(k, s.snd[k]); Game.Store.save(); }
    if (act === 'reset') {
      if (!ui.resetArm) { ui.resetArm = 1; setTimeout(() => { ui.resetArm = 0; queuePanel(); }, 4000); }
      else { ui.resetArm = 0; const keep = s.snd; Game.S = Object.assign(JSON.parse(JSON.stringify(Game.newSave())), { snd: keep }); Game.Store.save(); Game.reset(); renderAvatar(); }
    }
    if (C && C.isAdmin && act.startsWith('cheat-')) {
      const k = act.slice(6);
      if (k === 'crowns') s.crowns += 1e6;
      if (k === 'hammers') s.hammers += 1000;
      if (k === 'tickets') s.tickets += 5000;
      if (k === 'eggs') s.eggs += 5000;
      if (k === 'forge') s.forge.lvl += 5;
      if (k === 'keys') PF.DUNGEONS.forEach(d => { s.dun[d.id].keys = PF.KEYS_PER_DAY; });
      Game.emit('res'); Game.Store.save();
    }
    queuePanel();
  }

  // ---------------- 패널 클릭 ----------------
  $('panel').addEventListener('click', e => {
    Audio8.init();
    const slot = e.target.closest('[data-slot]');
    if (slot) {
      const it = S().equip[slot.dataset.slot];
      Audio8.play('click');
      if (it) modal(itemCard(it, 'eq'));
      else Game.toast(PF.slotById[slot.dataset.slot].name + ' 칸이 비어 있어요. 모루로 제작해 보세요');
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act !== 'craft') Audio8.play('click');
    if (act === 'craft') forgeAnim();
    else if (act === 'forge-info') showForgeInfo();
    else if (act === 'auto') { if (ui.auto) stopAuto(); else showAutoSettings(); }
    else if (act.startsWith('dun-')) showDungeon(act.slice(4));
    else if (act === 'sub-skill' || act === 'sub-pet') { ui.sub = act.slice(4); renderPanel(); }
    else if (act.startsWith('skill-')) showSkill(act.slice(6));
    else if (act.startsWith('pet-')) { ui.petTab = 'info'; showPet(+act.slice(4)); }
    else if (act === 'upall-skill') { const n = Game.upgradeAll(act.slice(6)); Game.toast(n ? n + '레벨 올렸어요' : '올릴 수 있는 게 없어요'); }
    else if (act === 'quick-skill' || act === 'quick-pet') { Game.quickEquip(act.slice(6)); }
    else if (act === 'mult-skill' || act === 'mult-pet') { const k = act.slice(5), m = S().mult; m[k] = { 1: 5, 5: 10, 10: 1 }[m[k]]; renderPanel(); }
    else if (act === 'summon-skill' || act === 'summon-pet') doSummon(act.slice(7));
    else if (act === 'rates-skill' || act === 'rates-pet') showRates(act.slice(6));
    else if (act.startsWith('ascend-')) { showRates(act.slice(7), PF.SUM_MAX); }
    else if (act.startsWith('hatch-')) { const r = Game.hatchEgg(+act.slice(6)); if (r === 'full') Game.toast('부화 슬롯이 모두 차 있어요'); }
    else if (act === 'buy-slot') { if (!Game.buySlot()) Game.toast('왕관이 부족해요'); }
    else settingsAct(act);
  });

  // PC: 스페이스 바로 제작 (대장간 화면에서, 창이 떠 있지 않을 때)
  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault(); // 스크롤·포커스된 버튼 눌림 방지
    if (ui.tab === 'home' && !modalOpen()) forgeAnim();
  });

  // ---------------- 이벤트 연결 ----------------
  Game.on('res', renderTop);
  ['equip', 'forge'].forEach(n => Game.on(n, () => { renderAvatar(); if (ui.tab === 'home') queuePanel(); }));
  ['skills', 'pets'].forEach(n => Game.on(n, () => { renderHud(); if (ui.tab === 'grow') queuePanel(); }));
  Game.on('dungeon', () => { if (ui.tab === 'dungeon') queuePanel(); });
  Game.on('store', () => { if (ui.tab === 'settings') queuePanel(); });
  Game.on('hatch', h => { const p = PF.petById[h.id]; Game.toast(`알이 부화했어요! ${PF.RAR[p.r].name} ${p.name}${h.isNew ? ' (NEW)' : ''}`); });
  if (window.Cloud) Cloud.onChange(() => { renderAvatar(); if (ui.tab === 'settings') queuePanel(); });

  // 소리 설정 복원·첫 터치에서 오디오 시작
  Audio8.set('sfx', S().snd.sfx); Audio8.set('bgm', S().snd.bgm);
  window.addEventListener('pointerdown', () => { Audio8.init(); Audio8.set('sfx', S().snd.sfx); Audio8.set('bgm', S().snd.bgm); }, { once: true });

  // ---------------- 메인 루프 ----------------
  const cv = $('cv'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  let last = performance.now(), hudT = 0, keyT = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    Game.update(dt);
    Game.render(g);
    tickHud();
    hudT += dt; keyT += dt;
    if (hudT > 0.25) { hudT = 0; tickIncub(); const w = Game.R.wave; if (w !== ui.lastWave) { ui.lastWave = w; renderHud(); } }
    if (keyT > 30) { keyT = 0; Game.checkKeys(); }
    requestAnimationFrame(frame);
  }
  Game.checkKeys();
  renderAvatar(); renderHud(); renderPanel();
  requestAnimationFrame(frame);
})();

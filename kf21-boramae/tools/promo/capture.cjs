// 홍보 영상 장면 캡처: 게임 시간을 1/60초씩 넘기며 한 장씩 찍는다(GPU가 없어도 60fps 결과가 나온다).
//   node tools/promo/capture.cjs <출력 폴더> <장면들(쉼표)>
//   장면: takeoff, gun, missile, bombA, bombB, coast, boss, laptop, phone, hero
// 각 장면 폴더에 00000.jpg… 와 sound.json(그 프레임에 울린 소리 기록)을 남긴다. 합성은 compose.py가 한다.
const path = require('path');
const fs = require('fs');
const { startServer, launch } = require('../../tests/lib/harness.cjs');

const OUT = process.argv[2];
const ONLY = (process.argv[3] || '').split(',').filter(Boolean);
const PORTRAIT = [720, 1280];
const PREVIEW = !!process.env.PREVIEW; // 미리보기: 낮음 그래픽, 15장마다 한 장만 저장
const keep = (i) => !PREVIEW || i % 15 === 0;

// 페이지 안에서 쓰는 도우미(문자열로 주입)
const HELPERS = `
window.__promo = {
  log: [], frame: 0,
  g: () => window.__debug, s: () => window.__debug.session(),
  hookAudio() {
    const a = window.__debug.audio(); if (a.__hooked) return; a.__hooked = true;
    const orig = a.play.bind(a);
    a.play = (n, o) => { window.__promo.log.push([window.__promo.frame, n, o ? JSON.parse(JSON.stringify(o)) : null]); orig(n, o); };
  },
  /** 월드 좌표 → 화면 좌표(px) */
  screen(pos) {
    const s = this.s(), v = pos.clone().project(s.camera);
    return { x: (v.x * 0.5 + 0.5) * s.viewport.w, y: (-v.y * 0.5 + 0.5) * s.viewport.h, front: v.z < 1 };
  },
  aimAt(e) { const p = this.screen(e.group ? e.group.position : e.pos); this.s().cursorOverride = { x: p.x, y: p.y }; },
  step() { window.__debug.captureStep(1 / 60); this.frame++; },
  /** 앞 장면의 연기·잔해를 지운다 */
  clean() { const s = this.s(); s.fx.clear(); for (const w of s.wrecks) { w.active = false; w.group.visible = false; } s.projectiles.clear(); },
  /** 렌더 없이 시뮬레이션만 넘긴다(장면 사이 시간 건너뛰기) */
  sim(seconds) { const s = this.s(); for (let t = 0; t < seconds; t += 1 / 60) s.step(1 / 60); },
  place(x, y, z, yaw) { const s = this.s(), f = s.player.flight; f.pos.set(x, y, z); f.yaw = yaw; f.pitch = 0; f.roll = 0; f.pitchRate = 0; f.yawRate = 0; s.player.prevPos.copy(f.pos); s.rig.snap = true; },
  enemyAhead(dist, side = 0, up = 10, speed = null) {
    const s = this.s(), f = s.player.flight;
    window.__debug.spawnEnemy(1, { distance: dist, spread: 0 });
    const e = s.enemies.list.filter((x) => x.alive).pop();
    const fwd = { x: -Math.sin(f.yaw), z: -Math.cos(f.yaw) }, right = { x: Math.cos(f.yaw), z: -Math.sin(f.yaw) };
    e.pos.set(f.pos.x + fwd.x * dist + right.x * side, f.pos.y + up, f.pos.z + fwd.z * dist + right.z * side);
    e.yaw = f.yaw; e.pitch = 0; e._orient(); e.want.copy(e.forward); e.prevPos.copy(e.pos); e.prevQuat.copy(e.quat);
    if (speed) { e.speed = speed; e.wantSpeed = speed; }
    return e;
  },
};
`;

async function openPage(browser, origin, { width, height, mobile = false, settings = {} }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const st = { v: 3, autoQuality: false, benchmarked: true, quality: PREVIEW ? 'low' : 'ultra', skipTakeoff: true, tutorialDone: true, bombTutorialDone: true, view: 'chase', sound: true, inputMode: mobile ? 'mobile' : 'pc', mobileHighOk: true, ...settings };
  await context.addInitScript((v) => { try { localStorage.setItem('kf21.settings', JSON.stringify(v)); } catch (e) { /* 무시 */ } }, st);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.setDefaultTimeout(600000);
  await page.goto(`${origin}/kf21-boramae/?debug=1`);
  await page.waitForFunction(() => window.__kf21Ready === true, null, { timeout: 120000 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => { window.__promo.hookAudio(); window.__debug.captureStep(1 / 60); });
  return { page, context, errors };
}

/** 장면 하나를 찍는다. tick(i)는 페이지 안에서 프레임마다 실행된다(조작) */
async function shoot(page, name, frames, tick, { warm = 2 } = {}) {
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => { window.__promo.log = []; window.__promo.frame = 0; });
  for (let i = 0; i < warm; i++) await page.evaluate(() => { window.__debug.captureStep(1 / 60); }); // 이전 장면의 잔상(모션 블러)을 털어 낸다
  await page.evaluate(() => { window.__promo.log = []; window.__promo.frame = 0; });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(tick, i);
    await page.evaluate(() => window.__promo.step());
    if (keep(i)) await page.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 94 });
    if (i % 30 === 0) process.stdout.write(`${name} ${i}/${frames} ${((Date.now() - t0) / (i + 1) / 1000).toFixed(1)}s/f\n`);
  }
  const log = await page.evaluate(() => window.__promo.log);
  fs.writeFileSync(path.join(dir, 'sound.json'), JSON.stringify({ frames, log }));
}

const SCENES = {
  // ① 이륙 시네마틱 4토막(세로 화면에 맞게 측면 카메라를 멀리·넓게)
  async takeoff(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: PORTRAIT[0], height: PORTRAIT[1], settings: { skipTakeoff: false } });
    await page.evaluate(async () => {
      const c = await import('/kf21-boramae/src/data/takeoff-cine.js');
      c.CAMERAS.side.keys = [[3, 44, 3.5, 4, 0, 0.8, 0.5, 46], [4.4, 30, 1.2, 22, 1.5, 0.4, 1.5, 42], [5, 34, 1, 20, 0, 0.6, 1, 42]];
      c.CAMERAS.gear.keys = [[5, 38, -3, 8, 0, -0.6, 0, 46], [7, 36, -6, 12, 0, -0.8, 0, 46]];
      window.__debug.startMission('c1m1');
      window.__debug.session().input.setLockWanted(false);
    });
    const parts = [[0.15, 48], [1.35, 48], [3.9, 48], [5.4, 60]];
    const dir = path.join(OUT, 'takeoff');
    fs.mkdirSync(dir, { recursive: true });
    let n = 0; const allLog = [];
    for (const [t, frames] of parts) {
      await page.evaluate((x) => { const c = window.__debug.session().takeoffCine; c.seek(x - 2 / 60); c.hold = false; }, t);
      await page.evaluate(() => { window.__debug.captureStep(1 / 60); window.__debug.captureStep(1 / 60); window.__promo.log = []; window.__promo.frame = 0; });
      for (let i = 0; i < frames; i++, n++) {
        await page.evaluate(() => window.__promo.step());
        if (keep(i)) await page.screenshot({ path: path.join(dir, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 94 });
      }
      process.stdout.write(`takeoff part ${t} done\n`);
    }
    fs.writeFileSync(path.join(dir, 'sound.json'), JSON.stringify({ frames: n, log: allLog, parts }));
    await context.close();
    return errors;
  },

  // ②③ 낮 공중전: 1인칭 기관포 → 3인칭 미사일
  async gun(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: PORTRAIT[0], height: PORTRAIT[1] });
    await page.evaluate(() => {
      const g = window.__debug; g.startMission('c1m1'); g.invincible(true); g.passiveEnemies(true);
      const P = window.__promo, s = P.s();
      s.input.setLockWanted(false);
      for (const e of s.enemies.list) e.despawn();
      P.place(0, 1400, -3000, 0.35);
      s.view = 'cockpit'; s._applyView();
      s.inputOverride = { pitch: 0, turn: 0 };
      P.target = P.enemyAhead(150, 6, 6, 149);
    });
    if (!process.env.SKIP_GUN) await shoot(page, 'gun', 120, (i) => {
      const P = window.__promo, s = P.s();
      s.inputOverride = { pitch: 0, turn: 0.08 * Math.sin(i / 40) };
      if (P.target.alive) P.aimAt(P.target);
      s.triggerOverride = i >= 14 && P.target.alive;
    });
    // 3인칭 미사일
    await page.evaluate(() => {
      const P = window.__promo, s = P.s();
      s.triggerOverride = null; s.cursorOverride = null;
      for (const e of s.enemies.list) e.despawn();
      P.clean();
      s.view = 'chase'; s._applyView();
      s.weapons.select('missile');
      P.target = P.enemyAhead(430, 22, 16, 150);
      P.target.hp = 20; // 미사일 피해(30)보다 작게: 한 발에 격추되는 장면
      P.fired = false;
    });
    await shoot(page, 'missile', 240, (i) => {
      const P = window.__promo, s = P.s();
      s.inputOverride = { pitch: 0, turn: 0 };
      if (P.target.alive) P.aimAt(P.target);
      const ui = s.weapons.uiState();
      // 락온이 되고 조금 뒤 한 번 누른다
      s.triggerOverride = !P.fired && ui.ready && i > 48;
      if (s.triggerOverride) P.fired = true;
    });
    await context.close();
    return errors;
  },

  // ④ 새벽 폭격: 고리가 초록 → 투하(A), 착탄(B: 레이더 옆에서 올려다본다)
  async bomb(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: PORTRAIT[0], height: PORTRAIT[1] });
    await page.evaluate(() => {
      const g = window.__debug; g.startMission('c2m1'); g.invincible(true);
      const P = window.__promo, s = P.s();
      s.input.setLockWanted(false);
      const radar = s.ground.targets.find((t) => t.type === 'radar');
      P.radar = radar;
      const agl = 175, fall = Math.sqrt(2 * agl / 9.8);
      P.place(radar.base.x, radar.base.y + agl, radar.base.z + 150 * (fall + 0.15) + 150 * 1.1, 0);
      s.player.flight.speed = 150;
      s.inputOverride = { pitch: 0, turn: 0 };
      P.dropped = -1;
    });
    await page.evaluate(async () => { const w = await import('/kf21-boramae/src/data/weapons.js'); w.WEAPONS.bomb.markerSize = 42; });
    await shoot(page, 'bombA', 100, (i) => {
      const P = window.__promo, s = P.s(), w = s.weapons.current;
      s.inputOverride = { pitch: 0, turn: 0 };
      s.triggerOverride = P.dropped < 0 && w.ccip && w.ccip.onTarget;
      if (s.triggerOverride) P.dropped = i;
      // 투하 0.35초 뒤: 기체 앞 아래에서 올려다보며 폭탄이 떨어져 나가는 것을 보여 준다
      if (P.dropped >= 0 && i === P.dropped + 21) { s.rig.fixed = { yaw: 150, pitch: -14, dist: 34, fov: 52, at: [0, -4, 2], level: true }; s.rig.snap = true; }
    });
    await page.evaluate(() => {
      const P = window.__promo, s = P.s();
      s.triggerOverride = null;
      s.rig.fixed = null;
      // 착탄 0.7초 전까지 시뮬레이션만 넘긴다
      const b = s.weapons.byId('bomb').bombs.find((x) => x.active);
      const fall = b ? (b.vel.y + Math.sqrt(b.vel.y * b.vel.y + 2 * 9.8 * (b.pos.y - 42))) / 9.8 : 4;
      P.sim(Math.max(0, fall - 0.7));
      // 레이더 옆 낮은 곳에 카메라를 고정해 올려다본다
      const T = window.__debug.session().player.flight.quat.constructor;
      s.rig.fixed = { yaw: -38, pitch: 4, dist: 260, fov: 58, at: [0, 70, 0], level: true, target: { pos: P.radar.base.clone(), quat: new T(), yaw: 0 } };
      s.rig.snap = true;
    });
    await shoot(page, 'bombB', 140, () => { window.__promo.s().inputOverride = { pitch: 0, turn: 0 }; });
    await context.close();
    return errors;
  },

  // ⑤ 저녁 해안: 바다 위를 나는 기체를 천천히 돌아보는 샷(수송기 편대가 배경에)
  async coast(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: PORTRAIT[0], height: PORTRAIT[1] });
    await page.evaluate(() => {
      const g = window.__debug; g.startMission('c3m1'); g.invincible(true); g.passiveEnemies(true);
      const P = window.__promo, s = P.s();
      s.input.setLockWanted(false);
      P.sim(2.5); // 편대는 조건 충족 1.6초 뒤에 나온다
      const lead = s.enemies.list.find((e) => e.alive);
      P.place(lead.pos.x + 260, lead.pos.y - 60, lead.pos.z + 120, lead.yaw);
      s.inputOverride = { pitch: 0, turn: 0 };
      s.rig.fixed = { yaw: 200, pitch: 7, dist: 30, fov: 46, level: true, at: [0, 1, 0] };
    });
    await shoot(page, 'coast', 120, (i) => {
      const s = window.__promo.s();
      s.inputOverride = { pitch: 0, turn: 0 };
      s.rig.fixed.yaw = 200 - i * 0.42; s.rig.fixed.dist = 30 - i * 0.03;
    });
    await context.close();
    return errors;
  },

  // ⑥ 야간 보스전 → 킬캠
  async boss(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: PORTRAIT[0], height: PORTRAIT[1] });
    await page.evaluate(() => {
      const g = window.__debug; g.startMission('c5m3'); g.invincible(true); g.passiveEnemies(true);
      const P = window.__promo, s = P.s();
      s.input.setLockWanted(false);
      P.sim(0.3);
      P.place(0, 1600, -3000, -0.3);
      const boss = s.boss;
      const f = s.player.flight;
      boss.pos.set(f.pos.x + Math.sin(0.3) * 260 + 12, f.pos.y + 16, f.pos.z - Math.cos(0.3) * 260);
      boss.yaw = f.yaw; boss.pitch = 0; boss._orient(); boss.want.copy(boss.forward); boss.prevPos.copy(boss.pos); boss.prevQuat.copy(boss.quat); boss.speed = 146; boss.wantSpeed = 146;
      boss.hp = boss.maxHp * 0.27;
      for (const e of s.enemies.list) if (e !== boss) e.despawn();
      P.target = boss;
      s.inputOverride = { pitch: 0, turn: 0 };
    });
    await shoot(page, 'boss', 300, (i) => {
      const P = window.__promo, s = P.s();
      for (const e of s.enemies.list) if (e.alive && e !== P.target) e.despawn(); // 늦게 오는 호위기는 치운다
      s.inputOverride = { pitch: 0, turn: 0.05 * Math.sin(i / 30) };
      if (P.target.alive) P.aimAt(P.target);
      s.triggerOverride = i >= 18 && P.target.alive;
    });
    await context.close();
    return errors;
  },

  // ⑦ PC 화면(노트북 안)
  async laptop(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: 960, height: 540 });
    await setupDevice(page);
    await shoot(page, 'laptop', 300, deviceTick);
    await context.close();
    return errors;
  },

  // ⑧ 모바일 화면(가로로 든 휴대폰 안): 왼손 조이스틱 + 오른손 조준 터치
  async phone(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: 844, height: 390, mobile: true });
    await setupDevice(page);
    const cdp = await context.newCDPSession(page);
    const stick = await page.evaluate(() => { const r = document.querySelector('.t-stick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
    const pts = (i, aim) => [{ x: stick.x + stick.r * 0.22 * Math.sin(i / 25), y: stick.y, id: 1 }, ...(aim ? [{ x: aim.x, y: aim.y, id: 2 }] : [])]; // 좌우로만 살짝
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
    const dir = path.join(OUT, 'phone');
    fs.mkdirSync(dir, { recursive: true });
    await page.evaluate(() => { window.__promo.log = []; window.__promo.frame = 0; });
    let aiming = false;
    for (let i = 0; i < 300; i++) {
      const aim = await page.evaluate((k) => { const P = window.__promo; if (!P.target.alive && !P.target2) P.target2 = P.enemyAhead(340, 30, 20, 146); const t = P.target.alive ? P.target : P.target2; return t && t.alive && k > 30 ? P.screen(t.group.position) : null; }, i);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i, aim) });
      if (!!aim !== aiming) { aiming = !!aim; }
      await page.evaluate(() => { const P = window.__promo, s = P.s(); s.cursorOverride = null; s.inputOverride = null; P.step(); });
      if (keep(i)) await page.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 94 });
      if (i % 30 === 0) process.stdout.write(`phone ${i}/300\n`);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const log = await page.evaluate(() => window.__promo.log);
    fs.writeFileSync(path.join(dir, 'sound.json'), JSON.stringify({ frames: 300, log }));
    await context.close();
    return errors;
  },

  // ⑨ 엔딩 배경 한 장(1080×1920 그대로)
  async hero(browser, origin) {
    const { page, context, errors } = await openPage(browser, origin, { width: 1080, height: 1920 });
    await page.evaluate(() => {
      const g = window.__debug; g.startMission('c3m1'); g.invincible(true); g.passiveEnemies(true);
      const P = window.__promo, s = P.s();
      s.input.setLockWanted(false);
      P.place(0, 900, -9000, 1.9);
      s.inputOverride = { pitch: 0, turn: 0.35 };
      P.sim(1.2);
      s.rig.fixed = { yaw: 155, pitch: 9, dist: 26, fov: 44, level: true, at: [0, 2, 0] };
      document.getElementById('hud').style.display = 'none';
    });
    for (let i = 0; i < 8; i++) await page.evaluate(() => window.__promo.step());
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'hero.png') });
    await context.close();
    return errors;
  },
};

async function setupDevice(page) {
  await page.evaluate(() => {
    const g = window.__debug; g.startMission('c1m2'); g.invincible(true); g.passiveEnemies(true);
    const P = window.__promo, s = P.s();
    s.input.setLockWanted(false);
    for (const e of s.enemies.list) e.despawn();
    P.place(0, 1300, -2500, 0.6);
    P.target = P.enemyAhead(300, -20, 16, 146);
    P.target2 = null;
  });
}
function deviceTick(i) {
  const P = window.__promo, s = P.s();
  s.inputOverride = { pitch: 0, turn: 0.1 * Math.sin(i / 25) };
  if (!P.target.alive && !P.target2) P.target2 = P.enemyAhead(340, 30, 20, 146);
  const t = P.target.alive ? P.target : P.target2;
  if (t && t.alive) P.aimAt(t);
  s.triggerOverride = i > 30 && t && t.alive;
}

(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const names = ONLY.length ? ONLY : Object.keys(SCENES);
  for (const n of names) {
    const t0 = Date.now();
    const errors = await SCENES[n](browser, origin);
    console.log(`== ${n} ${((Date.now() - t0) / 60000).toFixed(1)}분, 오류 ${errors.length}${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });

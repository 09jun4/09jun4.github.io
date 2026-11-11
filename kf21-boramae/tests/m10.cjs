// 마일스톤 10 검증.
//  A) Firebase 설정이 비어 있을 때: 외부 요청 없이 localStorage만으로 동작, 랭킹 창은 안내만
//  B) 가짜 SDK로: 로그인 → 게스트 진행 이관 → 닉네임 설정(중복·금칙어 거부) → 랭킹 기록·표시 → 로그아웃 시 게스트
//  C) 관리자 삭제 버튼, 계정 저장 읽기 실패 시 덮어쓰지 않음, 앱 안 브라우저 안내
const path = require('node:path');
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
const FAKE = path.join(__dirname, 'lib/fake-firebase.js');
const INAPP_UA = require('./lib/inapp-ua.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const log = {};
  const clear = async (page, id, time = 40) => {
    await page.evaluate((m) => window.__debug.startMission(m), id); await sleep(400);
    await page.evaluate((t) => { const s = window.__debug.session(); s.stats.time = t; window.__debug.skipMission(true); }, time); await sleep(1700);
  };

  // A) 설정 없음
  let g = await openGame(browser, origin);
  const requests = [];
  g.page.on('request', (r) => { if (!r.url().startsWith(origin)) requests.push(r.url()); });
  await sleep(600);
  log.A = { account: await g.page.$eval('#account', (e) => e.textContent.trim()) };
  await clear(g.page, 'm1');
  log.A.note = await g.page.$eval('[data-note]', (e) => e.textContent);
  await g.page.click('.result [data-act="rank"]'); await sleep(300);
  log.A.rank = await g.page.$eval('.rank [data-body]', (e) => e.textContent.trim());
  log.A.rankFoot = await g.page.$eval('.rank [data-foot]', (e) => e.textContent.trim());
  await shot(g.page, 'm10-rank-offline');
  log.A.externalRequests = requests.length;
  log.A.errors = g.errors;
  await g.context.close();

  // B) 가짜 SDK
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('kf21.settings')) localStorage.setItem('kf21.settings', JSON.stringify({ autoQuality: false })); } catch (e) { /* */ } });
  await ctx.addInitScript({ path: FAKE });
  g = await openGame(browser, origin, { context: ctx });
  const p = g.page;
  await sleep(500);
  log.B = { accountOut: await p.$eval('#account', (e) => e.textContent.trim()) };
  await clear(p, 'm1'); // 게스트로 미션 1 클리어
  log.B.guestNote = await p.$eval('[data-note]', (e) => e.textContent);
  await p.click('.result [data-act="menu"]'); await sleep(800);
  await p.click('#account [data-act="login"]'); await sleep(700);
  log.B.nickDialogOnFirstLogin = await p.$eval('.modal.nick', (e) => !e.hidden);
  await shot(p, 'm10-nickname');
  log.B.migrated = await p.evaluate(() => ({ uid: window.__debug.save().uid, m1: window.__debug.save().record('m1').bestScore, guestSlot: localStorage.getItem('kf21.progress.guest'), cloud: JSON.parse(window.__KF21_FAKE.docs.get('users/user-a').progress).missions.m1.bestScore }));
  const tryNick = async (v) => { await p.fill('#nick-input', v); await p.click('.nick [type="submit"]'); await sleep(300); return p.$eval('.nick .form-error', (e) => e.textContent); };
  log.B.nickErrors = [await tryNick('a'), await tryNick('관리자님'), await tryNick('두 단어')];
  await p.evaluate(() => { window.__KF21_FAKE.docs.set('nicknames/ace', { uid: 'someone-else' }); });
  log.B.nickTaken = await tryNick('ACE');
  log.B.nickOk = await tryNick('보라매01');
  log.B.account = await p.$eval('#account', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  await sleep(500);
  log.B.rankDoc = await p.evaluate(() => window.__KF21_FAKE.docs.get('rankings/m1/scores/user-a'));
  // 다른 사람 기록을 넣고 랭킹 창 확인
  await p.evaluate(() => { const d = window.__KF21_FAKE.docs; d.set('rankings/m1/scores/u2', { uid: 'u2', name: '독수리', score: 3700, time: 20 }); d.set('rankings/m1/scores/u3', { uid: 'u3', name: '참매', score: 3100, time: 80 }); });
  await p.click('[data-act="start"]'); await sleep(800);
  await p.click('.card [data-act="rank"]'); await sleep(300);
  await p.click('.rank [data-mission="m1"]'); await sleep(400);
  log.B.rankRows = await p.$$eval('.rank-list li', (li) => li.map((x) => x.textContent.replace(/\s+/g, ' ').trim() + (x.classList.contains('me') ? ' [me]' : '')));
  log.B.adminDeleteButtons = await p.$$eval('.rank-list [data-del]', (b) => b.length);
  await shot(p, 'm10-ranking');
  await p.keyboard.press('Escape'); await sleep(200);
  // 더 좋은 기록을 내면 랭킹이 갱신된다
  await clear(p, 'm1', 12);
  log.B.noteLoggedIn = await p.$eval('[data-note]', (e) => e.textContent);
  log.B.rankDocAfter = await p.evaluate(() => window.__KF21_FAKE.docs.get('rankings/m1/scores/user-a').score);
  // 새로고침해도 로그인·계정 진행이 유지된다
  const g2 = await openGame(browser, origin, { context: ctx });
  await sleep(700);
  log.B.afterReload = await g2.page.evaluate(() => ({ uid: window.__debug.save().uid, m2open: window.__debug.save().isUnlocked('m2'), account: document.getElementById('account').textContent.replace(/\s+/g, ' ').trim(), nickOpen: !document.querySelector('.modal.nick').hidden }));
  // 로그아웃 → 게스트 상태
  await g2.page.click('#account [data-act="logout"]'); await sleep(500);
  log.B.afterLogout = await g2.page.evaluate(() => ({ uid: window.__debug.save().uid, m1: window.__debug.save().record('m1'), m2open: window.__debug.save().isUnlocked('m2'), account: document.getElementById('account').textContent.trim() }));

  // C) 관리자 화면: 판별(해시 비교)은 단위 테스트가 맡고, 여기서는 삭제 버튼과 삭제 동작만 본다
  await g2.page.evaluate(() => { window.__KF21_FAKE.nextUser = { uid: 'admin-1', email: 'boss@example.com', emailVerified: true, displayName: 'admin' }; });
  await g2.page.click('#account [data-act="login"]'); await sleep(700);
  await g2.page.keyboard.press('Escape'); await sleep(200);
  await g2.page.evaluate(() => { window.__debug.online().auth.isAdmin = true; });
  await g2.page.click('[data-act="start"]'); await sleep(800);
  await g2.page.click('.card [data-act="rank"]'); await sleep(300);
  await g2.page.click('.rank [data-mission="m1"]'); await sleep(400);
  log.C = { deleteButtons: await g2.page.$$eval('.rank-list [data-del]', (b) => b.length) };
  g2.page.once('dialog', (dlg) => dlg.accept());
  await g2.page.click('.rank-list [data-del="u3"]'); await sleep(600);
  log.C.rowsAfterDelete = await g2.page.$$eval('.rank-list li .name', (n) => n.map((x) => x.textContent));
  await g2.page.keyboard.press('Escape'); await sleep(200);
  await g2.page.keyboard.press('Escape'); await sleep(700);
  await g2.page.click('#account [data-act="logout"]'); await sleep(400);

  // 계정 저장 읽기가 실패하면: 게스트 진행으로 계정을 덮어쓰지 않는다
  await g2.page.evaluate(() => { window.__KF21_FAKE.failRead = true; window.__KF21_FAKE.nextUser = { uid: 'user-a', email: 'pilot@example.com', emailVerified: true, displayName: '홍길동' }; window.__KF21_FAKE.calls.length = 0; });
  await g2.page.click('#account [data-act="login"]'); await sleep(700);
  log.readFail = await g2.page.evaluate(() => ({ saveUid: window.__debug.save().uid, writes: window.__KF21_FAKE.calls.filter((c) => c[0] === 'set').length, toast: document.getElementById('toast').textContent }));
  log.errorsB = g.errors.concat(g2.errors).filter((e) => !e.includes('계정 저장 불러오기 실패'));
  await ctx.close();

  // 앱 안 브라우저(카카오톡): 안내를 띄우고 로그인을 시도하지 않는다
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, userAgent: INAPP_UA.kakao });
  await ctx2.addInitScript({ path: FAKE });
  g = await openGame(browser, origin, { context: ctx2 });
  await sleep(500);
  const t1 = await g.page.$eval('#toast', (e) => e.textContent);
  await g.page.click('#account [data-act="login"]'); await sleep(400);
  log.inApp = { toastOnOpen: t1, afterClick: await g.page.evaluate(() => ({ uid: window.__debug.save().uid, toast: document.getElementById('toast').textContent })) };
  await shot(g.page, 'm10-inapp');
  log.inApp.errors = g.errors;
  console.log(JSON.stringify(log, null, 1));
  await browser.close(); server.close();
})();

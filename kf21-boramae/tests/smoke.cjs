// 스모크 테스트(npm run smoke): 배포와 같은 조건(정적 서버, Firebase 설정 없음)에서
// 페이지가 뜨고, 메뉴→선택→브리핑→플레이→결과가 이어지고, 콘솔 오류가 없는지 빠르게 확인한다.
const { startServer, launch, openGame, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const fail = [];
  const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) fail.push(name); };

  // 일반 접속: 디버그 훅이 없어야 하고 외부 요청도 없어야 한다
  let g = await openGame(browser, origin, { query: '' });
  const external = [];
  g.page.on('request', (r) => { if (!r.url().startsWith(origin)) external.push(r.url()); });
  await sleep(1200);
  check('디버그 훅은 ?debug=1 없이는 없다', await g.page.evaluate(() => typeof window.__debug === 'undefined'));
  check('메인 메뉴 버튼은 두 개(게임 시작, 설정)', (await g.page.$$eval('.menu-buttons .btn', (b) => b.map((x) => x.textContent.trim()).join(','))) === '게임 시작,설정');
  await g.page.click('[data-act="start"]'); await sleep(800);
  await g.page.click('[data-act="brief"]'); await sleep(800);
  await g.page.click('[data-act="launch"]'); await sleep(3000); // 페이드가 끝날 때까지 넉넉히
  check('출격하면 HUD가 보인다', await g.page.$eval('#hud', (c) => getComputedStyle(c).display !== 'none'));
  await g.page.keyboard.press('Escape'); await sleep(300);
  check('ESC로 일시정지', await g.page.$eval('.pause', (e) => !e.hidden));
  check('외부 요청 없음(Firebase 설정이 비어 있을 때)', external.length === 0);
  check('콘솔 오류 0건(일반 접속)', g.errors.length === 0);
  if (g.errors.length) console.log(g.errors);
  await g.context.close();

  // 디버그 접속: 미션 3개를 건너뛰며 저장·잠금 해제 확인
  g = await openGame(browser, origin);
  for (const id of ['m1', 'm2', 'm3']) {
    await g.page.evaluate((m) => window.__debug.startMission(m), id); await sleep(400);
    await g.page.evaluate(() => window.__debug.skipMission(true));
    await g.page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 15000 });
    await g.page.evaluate(() => { window.__debug.go('menu'); });
  }
  const save = await g.page.evaluate(() => JSON.parse(localStorage.getItem('kf21.progress.guest')));
  check('미션 3개 기록이 localStorage에 저장된다', save.v === 1 && ['m1', 'm2', 'm3'].every((m) => save.missions[m] && save.missions[m].grade));
  check('콘솔 오류 0건(디버그 접속)', g.errors.length === 0);
  if (g.errors.length) console.log(g.errors);
  await browser.close(); server.close();
  console.log(fail.length ? `\n실패 ${fail.length}건` : '\n모두 통과');
  process.exit(fail.length ? 1 : 0);
})();

// 마일스톤 1 검증: 페이지가 뜨고, 고정 타임스텝·상태 전환·디버그 훅이 동작하고, 콘솔 오류가 없다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin);
  await sleep(500);
  const a = await page.evaluate(() => window.__debug.state());
  await sleep(1000);
  const b = await page.evaluate(() => window.__debug.state());
  const ticks = b.tick - a.tick;
  // 탭 복귀처럼 5초가 한꺼번에 들어와도 상한(0.1초=6스텝)까지만 진행해야 한다
  const jump = await page.evaluate(() => { const t0 = window.__debug.state().tick; window.__debug.advance(5); return window.__debug.state().tick - t0; });
  const shotFile = await shot(page, 'm1');
  const flow = await page.evaluate(() => {
    const d = window.__debug; const seen = [];
    for (const s of ['select', 'briefing', 'playing', 'paused', 'playing', 'result', 'menu']) { d.go(s); seen.push(d.state().state); }
    let blocked = false; try { d.go('result'); } catch (e) { blocked = true; }
    return { seen, blocked };
  });
  await page.close();
  const noDebug = await openGame(browser, origin, { query: '' });
  const hookHidden = await noDebug.page.evaluate(() => typeof window.__debug === 'undefined');
  console.log(JSON.stringify({ ticksPerSecond: ticks, jumpSteps: jump, flow, hookHidden, shotFile, errors, errors2: noDebug.errors }, null, 1));
  await browser.close(); server.close();
})();

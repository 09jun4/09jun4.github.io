// UI 확인: 캠페인 선택·브리핑·결과. node tests/e9-ui.cjs
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer(); const browser = await launch();
  for (const [w, h, tag, mobile] of [[1280, 720, 'pc', false], [640, 360, 'm', true]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
    await context.addInitScript(() => { try { if (!localStorage.getItem('kf21.settings')) localStorage.setItem('kf21.settings', JSON.stringify({ v: 3, autoQuality: false, benchmarked: true, quality: 'low', skipTakeoff: true, tutorialDone: true })); } catch (e) {} });
    const { page, errors } = await openGame(browser, origin, { context });
    const d = (fn, a) => page.evaluate(fn, a);
    await d(() => window.__debug.go('select')); await sleep(700);
    await page.click('[data-campaign="c5"]'); await sleep(300);
    await shot(page, `e9-${tag}-select`);
    await page.click('[data-act="brief"]'); await sleep(900);
    await shot(page, `e9-${tag}-brief`);
    await d(() => { window.__debug.startMission('c5m1'); }); await sleep(800);
    await d(() => window.__debug.skipMission(true));
    await page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 60000 });
    await sleep(1200);
    await shot(page, `e9-${tag}-result`);
    const fit = await d(() => [...document.querySelectorAll('.screen:not([hidden]) .btn')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 8), Math.round(r.height), r.bottom <= innerHeight + 1]; }));
    console.log(tag, JSON.stringify(fit), errors.length ? errors.slice(0, 3) : '오류 0');
    await context.close();
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });

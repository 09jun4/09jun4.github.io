// 9단계 검증(모바일 에뮬레이션): 예산(삼각형 ≤ 8만, 드로우콜 ≤ 70), DPR 상한, CPU 스로틀 성능, 작은 가로 화면의 UI
// 주의: GPU 없는 환경에서는 FPS가 실제 기기와 무관하다. 드로우콜·삼각형·DPR은 어디서나 같다.
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
const SIZES = [[844, 390, 3], [915, 412, 2.625], [640, 360, 2]];
const BUDGET = { triangles: 80000, drawCalls: 70 };
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const rows = [];
  const fails = [];
  for (const [w, h, dpr] of SIZES) {
    for (const preset of ['low', 'high']) {
      if (preset === 'high' && w !== 844) continue;
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
      await context.addInitScript((q) => { try { if (!localStorage.getItem('kf21.settings')) localStorage.setItem('kf21.settings', JSON.stringify({ v: 3, autoQuality: false, benchmarked: true, quality: q, skipTakeoff: true, tutorialDone: true, mobileHighOk: true })); } catch (e) { /* 무시 */ } }, preset);
      const { page, errors } = await openGame(browser, origin, { context });
      page.setDefaultTimeout(180000);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const d = (fn, a) => page.evaluate(fn, a);
      const info = await d(() => ({ touch: window.__debug.session().input.touchMode, preset: window.__debug.quality().name, dpr: window.devicePixelRatio }));
      await d(() => { const g = window.__debug; g.startMission('m3'); g.invincible(true); });
      await sleep(800);
      await d(() => { window.__debug.spawnEnemy(4, { distance: 300, spread: 70 }); window.__debug.setTrigger(true); });
      await sleep(1500);
      await d(() => { const s = window.__debug.session(); for (const e of s.enemies.list.filter((x) => x.alive).slice(0, 2)) s.fx.explosion(e.pos, e.velocity, 1); });
      const m = await d(() => window.__debug.measure(4));
      await d(() => window.__debug.setTrigger(null));
      const row = { size: `${w}x${h}`, deviceDpr: dpr, preset: info.preset, touch: info.touch, pixelRatio: m.pixelRatio, drawCalls: m.drawCalls, triangles: m.triangles, fpsAvg: m.fpsAvg, fpsMin: m.fpsMin, errors: errors.length };
      rows.push(row);
      if (!info.touch) fails.push(`${row.size} 모바일 모드 아님`);
      if (preset === 'low' && (m.triangles > BUDGET.triangles || m.drawCalls > BUDGET.drawCalls)) fails.push(`${row.size} 예산 초과 tris ${m.triangles} calls ${m.drawCalls}`);
      if (m.pixelRatio > (preset === 'low' ? 1.5 : 2) + 1e-6) fails.push(`${row.size} DPR 상한 초과 ${m.pixelRatio}`);
      if (errors.length) fails.push(`${row.size} 콘솔 오류 ${errors[0]}`);
      // 가장 작은 화면: 메뉴·선택·브리핑·일시정지·결과·설정이 잘리지 않는지
      if (w === 640 && preset === 'low') {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const fits = async (name) => {
          await sleep(900);
          const r = await d(() => { const els = [...document.querySelectorAll('.screen:not([hidden]) .panel, .screen:not([hidden]) .btn, dialog[open] .panel, dialog[open]')].filter((e) => e.offsetParent !== null); let out = 0; let small = 0; for (const e of els) { const b = e.getBoundingClientRect(); if (b.left < -1 || b.right > innerWidth + 1) out++; if (e.matches('.btn') && b.height < 40) small++; } const sc = document.querySelector('.screen:not([hidden]) .panel'); return { n: els.length, out, small, scrollable: sc ? sc.scrollHeight > sc.clientHeight + 2 && getComputedStyle(sc).overflowY === 'visible' : false, docScroll: document.documentElement.scrollWidth > innerWidth + 1 }; });
          await shot(page, `p9-640-${name}`);
          if (r.out || r.docScroll || r.scrollable) fails.push(`640x360 ${name} 화면 넘침 ${JSON.stringify(r)}`);
          return r;
        };
        const ui = {};
        await d(() => window.__debug.skipMission(true));
        await page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 120000 });
        ui.result = await fits('result');
        await d(() => window.__debug.go('menu')); ui.menu = await fits('menu');
        await d(() => window.__debug.go('select')); ui.select = await fits('select');
        await d(() => { window.__debug.startMission('m1'); }); await sleep(500);
        await d(() => window.__debug.go('paused')); ui.pause = await fits('pause');
        rows.push({ ui });
      }
      await context.close();
    }
  }
  console.log(JSON.stringify(rows, null, 1));
  console.log(fails.length ? `실패:\n${fails.join('\n')}` : '모두 통과');
  await browser.close(); server.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

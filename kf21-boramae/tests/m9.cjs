// 마일스톤 9 검증: 설정이 저장·복원되는지, 진행도가 새로고침 뒤에도 남는지, 자동 품질 조절이 동작하고 끌 수 있는지.
const { startServer, launch, openGame, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const log = {};
  // 1) 설정 UI로 바꾼 값이 새로고침 뒤에도 유지
  let g = await openGame(browser, origin);
  await g.page.click('.menu [data-act="settings"]'); await sleep(200);
  await g.page.$eval('#set-sens', (i) => { i.value = '1.6'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await g.page.click('.modal [data-quality="low"]'); await sleep(200);
  log.afterLow = await g.page.evaluate(() => ({ s: window.__debug.settings().values, step: window.__debug.quality().step, pr: window.__debug.session().fx.particles.limit, text: document.querySelector('.modal [data-out="step"]').textContent }));
  await g.page.keyboard.press('Escape');
  await g.page.evaluate(() => { window.__debug.startMission('m1'); }); await sleep(500);
  await g.page.evaluate(() => window.__debug.skipMission(true)); await sleep(1500);
  const g2 = await openGame(browser, origin, { context: g.context });
  log.afterReload = await g2.page.evaluate(() => ({ s: window.__debug.settings().values, step: window.__debug.quality().step, m1: window.__debug.save().record('m1'), m2open: window.__debug.save().isUnlocked('m2'), keys: Object.keys(localStorage).sort() }));
  log.errors1 = g.errors.concat(g2.errors);
  await g.context.close();
  // 2) 자동 품질 조절: 헤드리스는 45FPS에 못 미치므로 한 단계씩 내려가야 한다
  g = await openGame(browser, origin, { autoQuality: true });
  const steps = [];
  for (let i = 0; i < 9; i++) { await sleep(2000); steps.push(await g.page.evaluate(() => ({ step: window.__debug.quality().step, fps: Math.round(window.__debug.quality().fps), q: window.__debug.settings().get('quality'), toast: document.getElementById('toast').textContent }))); }
  log.autoSteps = steps.map((s) => `${s.step}@${s.fps}fps/${s.q}`);
  log.toast = steps.find((s) => s.toast) ? steps.find((s) => s.toast).toast : '';
  log.errors2 = g.errors;
  await g.context.close();
  // 3) 자동 조절을 끄면(고정) 느려도 내려가지 않는다
  g = await openGame(browser, origin);
  await sleep(9000);
  log.fixed = await g.page.evaluate(() => ({ step: window.__debug.quality().step, auto: window.__debug.settings().get('autoQuality'), fps: Math.round(window.__debug.quality().fps) }));
  log.errors3 = g.errors;
  console.log(JSON.stringify(log, null, 1));
  await browser.close(); server.close();
})();

// 업그레이드 1단계 검증: 첫 실행 벤치마크로 프리셋 자동 선택, 수동 변경 시 자동 선택 꺼짐, 측정 훅.
const { startServer, launch, openGame, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const g = await openGame(browser, origin, { autoQuality: true }); // 저장된 설정 없이 시작 = 첫 실행
  const d = (fn, a) => g.page.evaluate(fn, a);
  const first = await d(() => ({ s: window.__debug.settings().values, preset: window.__debug.quality().name }));
  const bench = await d(() => window.__debug.benchmark());
  const forced = await d(() => window.__debug.benchmark(true)); // 측정 경로가 실제로 도는지
  await d(() => window.__debug.settings().set('autoQuality', false));
  const m = await d(() => window.__debug.measure(2));
  await g.page.click('.menu [data-act="settings"]'); await sleep(200);
  const labels = await g.page.$$eval('.modal [data-quality]', (b) => b.map((x) => x.textContent));
  const paints = await g.page.$$eval('.modal [data-paint]', (b) => b.map((x) => x.textContent));
  console.log(JSON.stringify({ first, bench, forced, measure: m, labels, paints, errors: g.errors }, null, 1));
  await browser.close(); server.close();
})();

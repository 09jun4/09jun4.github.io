// 프리셋별 성능·메모리 점검: node tests/perf.cjs
//  - 낮음/높음/최고 각각: 전투 최고 부하(미션 3 + 적기 8대 + 연사 + 폭발)에서 FPS 평균·하위 1%, 드로우콜, 삼각형 수
//  - 프리셋 전환 12회 + 미션 재시작 12회 전후의 GPU 리소스 수·JS 힙 비교
// 주의: 이 스크립트를 GPU 없는 환경(소프트웨어 렌더링)에서 돌리면 FPS 값은 실제 기기 성능과 무관하다. 드로우콜·삼각형 수는 어디서나 같다.
const { startServer, openGame, sleep } = require('./lib/harness.cjs');
const { chromium } = require('playwright');
const BUDGET = { low: [100000, 80], high: [600000, 250], ultra: [1200000, 400] };
(async () => {
  const { server, origin } = await startServer();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const { page, errors } = await openGame(browser, origin);
  page.setDefaultTimeout(180000);
  const d = (fn, a) => page.evaluate(fn, a);
  const out = { presets: {} };
  const battle = async (preset) => {
    await d((p) => window.__debug.setQuality(p), preset);
    await d(() => { const g = window.__debug; g.startMission('m3'); g.invincible(true); });
    await sleep(800);
    await d(() => { window.__debug.spawnEnemy(6, { distance: 300, spread: 70 }); window.__debug.setTrigger(true); });
    await sleep(1500);
    await d(() => { const s = window.__debug.session(); for (const e of s.enemies.list.filter((x) => x.alive).slice(0, 3)) s.fx.explosion(e.pos, e.velocity, 1); });
    const m = await d((sec) => window.__debug.measure(sec), preset === 'low' ? 4 : 8);
    const view = await d(() => { window.__debug.session().toggleView(); return window.__debug.measure(4); });
    await d(() => { window.__debug.session().toggleView(); window.__debug.setTrigger(null); });
    return { fpsAvg: m.fpsAvg, fpsMin: m.fpsMin, drawCalls: Math.max(m.drawCalls, view.drawCalls), triangles: Math.max(m.triangles, view.triangles), playerTris: await d(() => window.__debug.visuals().triangles), enemyTris: await d(() => window.__debug.session().enemies.list[0].visual.triangles), buildMs: await d(() => Math.round(window.__debug.visuals().buildMs)), pixelRatio: m.pixelRatio };
  };
  for (const p of ['low', 'high', 'ultra']) out.presets[p] = await battle(p);

  const mem = async () => { await d(() => { if (window.gc) { window.gc(); window.gc(); } }); await sleep(400); return d(() => ({ heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(2), ...window.__debug.state().info })); };
  const cycle = async (id) => {
    await d((m) => window.__debug.startMission(m), id);
    await sleep(300);
    await d(() => { window.__debug.spawnEnemy(4, { distance: 250, spread: 60 }); window.__debug.setTrigger(true); });
    await sleep(700);
    await d(() => { window.__debug.setTrigger(null); window.__debug.skipMission(Math.random() < 0.5); });
    await page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 60000 });
    await d(() => { window.__debug.go('menu'); window.__debug.go('select'); });
  };
  // 1) 프리셋 전환 반복(낮음 ↔ 높음 ↔ 최고): 처음 한 바퀴는 워밍업
  await d(() => { window.__debug.skipMission(true); });
  await page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 60000 });
  await d(() => { window.__debug.go('menu'); });
  for (const p of ['low', 'high', 'ultra', 'high']) await d((q) => window.__debug.setQuality(q), p);
  const sBefore = await mem();
  for (let i = 0; i < 4; i++) for (const p of ['low', 'ultra', 'high']) await d((q) => window.__debug.setQuality(q), p);
  const sAfter = await mem();
  out.presetSwitch = { times: 12, before: sBefore, after: sAfter, heapGrowthMB: +(sAfter.heapMB - sBefore.heapMB).toFixed(2) };
  // 2) 미션 재시작 반복(높음)
  await d(() => window.__debug.go('select'));
  for (let i = 0; i < 2; i++) await cycle('m1');
  const mBefore = await mem();
  for (let i = 0; i < 12; i++) await cycle(['m1', 'm2', 'm3'][i % 3]);
  const mAfter = await mem();
  out.missionRepeat = { times: 12, before: mBefore, after: mAfter, heapGrowthMB: +(mAfter.heapMB - mBefore.heapMB).toFixed(2) };
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  let ok = errors.length === 0;
  for (const [p, r] of Object.entries(out.presets)) ok = ok && r.triangles <= BUDGET[p][0] && r.drawCalls <= BUDGET[p][1];
  for (const k of ['presetSwitch', 'missionRepeat']) { const a = out[k]; ok = ok && a.after.geometries === a.before.geometries && a.after.textures === a.before.textures && a.heapGrowthMB < 3; }
  console.log(ok ? 'PERF OK (드로우콜·삼각형 예산, 리소스 누수 기준)' : 'PERF FAIL');
  await browser.close(); server.close();
  process.exit(ok ? 0 : 1);
})();

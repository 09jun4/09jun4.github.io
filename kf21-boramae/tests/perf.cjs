// 성능 예산·메모리 점검.
//  - 드로우콜·삼각형 수(렌더러 통계, 결정적): 높음 ≤150콜/200k, 낮음 ≤80콜/100k
//  - 미션 재시작·전환 12회 반복 전후의 GPU 리소스 수(지오메트리·텍스처·셰이더)와 JS 힙 비교
// FPS는 이 환경(GPU 없는 소프트웨어 렌더링)에서는 의미가 없어 재지 않는다.
const { startServer, openGame, sleep } = require('./lib/harness.cjs');
const { chromium } = require('playwright');
(async () => {
  const { server, origin } = await startServer();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const { page, errors } = await openGame(browser, origin);
  const d = (fn, a) => page.evaluate(fn, a);
  const out = {};
  const battle = async () => {
    // 가장 무거운 순간을 만든다: 미션 3 + 적기 8대 + 사격 + 폭발 + 미사일
    await d(() => { const g = window.__debug; g.startMission('m3'); g.invincible(true); });
    await sleep(600);
    await d(() => { window.__debug.spawnEnemy(6, { distance: 300, spread: 70 }); window.__debug.setTrigger(true); });
    let peak = { calls: 0, tris: 0, particles: 0 };
    for (let i = 0; i < 40; i++) {
      if (i === 8) await d(() => { const s = window.__debug.session(); for (const e of s.enemies.list.filter((x) => x.alive).slice(0, 4)) { s.fx.explosion(e.pos, e.velocity, 1); } });
      if (i === 12) await page.keyboard.press('KeyV');
      const s = await d(() => window.__debug.state());
      peak = { calls: Math.max(peak.calls, s.info.calls), tris: Math.max(peak.tris, s.info.tris), particles: Math.max(peak.particles, s.particles) };
      await sleep(120);
    }
    await d(() => window.__debug.setTrigger(null));
    return peak;
  };
  out.high = await battle();
  await d(() => window.__debug.quality().setQuality('low'));
  out.low = await battle();
  out.menuLow = await d(() => { window.__debug.go('paused'); window.__debug.go('menu'); return 0; });
  await sleep(800);
  out.menuLow = (await d(() => window.__debug.state())).info;
  await d(() => window.__debug.quality().setQuality('high'));

  // 메모리: 미션 시작 → 전투 → 종료를 12회 반복
  const mem = async () => { await d(() => { if (window.gc) { window.gc(); window.gc(); } }); await sleep(300); return d(() => ({ heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(2), ...window.__debug.state().info, nodes: document.getElementsByTagName('*').length })); };
  const cycle = async (id) => {
    await d((m) => { const g = window.__debug; g.startMission(m); }, id);
    await sleep(250);
    await d(() => { window.__debug.spawnEnemy(4, { distance: 250, spread: 60 }); window.__debug.setTrigger(true); });
    await sleep(900);
    await d(() => { window.__debug.setTrigger(null); window.__debug.skipMission(Math.random() < 0.5); });
    await page.waitForFunction(() => window.__debug.state().state === 'result' && !window.__debug.state().busy, null, { timeout: 15000 });
    await d(() => { window.__debug.go('menu'); window.__debug.go('select'); });
  };
  await d(() => { window.__debug.go('select'); });
  for (let i = 0; i < 3; i++) await cycle(['m1', 'm2', 'm3'][i % 3]); // 워밍업(JIT·지연 생성)
  const before = await mem();
  const samples = [];
  for (let i = 0; i < 12; i++) { await cycle(['m1', 'm2', 'm3'][i % 3]); if (i % 4 === 3) samples.push((await mem()).heapMB); }
  const after = await mem();
  out.memory = { before, after, heapSamplesMB: samples, heapGrowthMB: +(after.heapMB - before.heapMB).toFixed(2) };
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  const ok = out.high.calls <= 150 && out.high.tris <= 200000 && out.low.calls <= 80 && out.low.tris <= 100000
    && after.geometries === before.geometries && after.textures === before.textures && after.programs === before.programs && out.memory.heapGrowthMB < 2 && errors.length === 0;
  console.log(ok ? 'PERF OK' : 'PERF FAIL');
  await browser.close(); server.close();
  process.exit(ok ? 0 : 1);
})();

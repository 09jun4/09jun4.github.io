// 소리 확인(헤드리스는 스피커가 없으므로 상태만 본다): 파일 로드, 이륙 타이밍, 엔진·기관포 루프, 일시정지. node tests/e14-audio.cjs
const { startServer, launch, openGame, sleep } = require('./lib/harness.cjs');
(async () => {
  const { server, origin } = await startServer(); const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 960, height: 540, settings: { quality: 'low', skipTakeoff: false } });
  page.setDefaultTimeout(120000);
  const d = (fn, a) => page.evaluate(fn, a);
  await page.mouse.click(480, 500); // 첫 입력: 소리 켜짐
  await page.waitForFunction(() => window.__debug.audio().ready === true, null, { timeout: 30000 });
  const out = {};
  out.loaded = await d(() => { const a = window.__debug.audio(); return Object.fromEntries(Object.entries(a.buffers).map(([k, b]) => [k, +b.duration.toFixed(2)])); });
  // 루프 이음매: 끝 표본과 첫 표본이 이어지는가(차이가 작아야 한다)
  out.seam = await d(() => { const b = window.__debug.audio().buffers.engineLoop.getChannelData(0); let mx = 0; for (let i = 1; i < 2000; i++) mx = Math.max(mx, Math.abs(b[i] - b[i - 1])); return { jump: +Math.abs(b[0] - b[b.length - 1]).toFixed(4), typicalStep: +mx.toFixed(4) }; });
  await d(() => { window.__debug.startMission('c1m1'); window.__debug.session().input.setLockWanted(false); });
  const names = async () => d(() => { const a = window.__debug.audio(); return { t: +window.__debug.session().takeoffCine.t.toFixed(1), named: Object.keys(a.named), engine: !!a.engine, engGain: +a.eng.gain.toFixed(2), state: a.ctx.state }; });
  out.timeline = [];
  for (let i = 0; i < 9; i++) { await sleep(1000); out.timeline.push(await names()); }
  await page.waitForFunction(() => window.__debug.state().phase === 'active', null, { timeout: 60000 });
  await sleep(600);
  out.flight = await names();
  await d(() => window.__debug.setTrigger(true)); await sleep(500);
  out.gunOn = await d(() => { const a = window.__debug.audio(); return a.gun && a.gun.on; });
  await d(() => window.__debug.setTrigger(null)); await sleep(500);
  out.gunOff = await d(() => { const a = window.__debug.audio(); return a.gun && a.gun.on; });
  await d(() => window.__debug.go('paused')); await sleep(300);
  out.paused = await d(() => window.__debug.audio().ctx.state);
  await d(() => window.__debug.go('playing')); await sleep(300);
  out.resumed = await d(() => window.__debug.audio().ctx.state);
  await d(() => { window.__debug.settings().set('sound', false); }); await sleep(200);
  out.muted = await d(() => window.__debug.audio().master.gain.value < 0.05);
  console.log(JSON.stringify(out));
  console.log(errors.length ? errors.slice(0, 4) : '콘솔 오류 0건');
  await browser.close(); server.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });

// 이륙 시네마틱 렌더·생략 확인: node tests/e12-takeoff.cjs [preset=high]
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'high';
  const { server, origin } = await startServer(); const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { width: 1280, height: 720, settings: { quality: preset, skipTakeoff: false } });
  page.setDefaultTimeout(120000);
  const d = (fn, a) => page.evaluate(fn, a);
  await d(() => { window.__debug.startMission('c1m1'); window.__debug.session().input.setLockWanted(false); });
  await sleep(600);
  const out = { phase: await d(() => window.__debug.state().phase) };
  for (const t of (process.argv[3] || '0.5,2,4,6,7.5').split(',').map(Number)) {
    await d((x) => window.__cinematic.seek(x), t);
    await sleep(preset === 'low' ? 900 : 2600);
    await shot(page, `e12-${preset}-${String(t).replace('.', '_')}`);
    out[t] = await d(() => { const s = window.__debug.session(), v = s.player.visual, c = s.takeoffCine; return { shot: c.shot, gear: +v.gear.toFixed(2), flap: +(v.flap * 25).toFixed(1), agl: +c.state.agl.toFixed(1), fov: Math.round(s.camera.fov), cockpit: s.player.cockpitView, hud: document.getElementById('hud').style.display }; });
  }
  if (process.argv[3]) { console.log(JSON.stringify(out)); await browser.close(); server.close(); return; }
  // 생략: 중간(4초)에서 Enter → 즉시 미션 시작, 기체 상태 정상
  await page.keyboard.press('Enter'); await sleep(700);
  out.afterSkip = await d(() => { const s = window.__debug.session(), f = s.player.flight, v = s.player.visual; return { phase: s.phase, gear: v.gear, flap: v.flap, agl: Math.round(f.pos.y - 42), speed: Math.round(f.speed), pitch: +f.pitch.toFixed(2), time: +s.stats.time.toFixed(1), scaleZ: s.player.cockpit ? s.player.cockpit.group.scale.z : 1, playerScale: s.player.root.scale.x }; });
  // 끝까지 재생: 8초 뒤 자동으로 미션 시작
  await d(() => { window.__debug.startMission('c1m1'); window.__debug.session().input.setLockWanted(false); window.__debug.timeScale(4); });
  await page.waitForFunction(() => window.__debug.state().phase === 'active', null, { timeout: 110000 });
  out.afterFull = await d(() => { const s = window.__debug.session(), f = s.player.flight; window.__debug.timeScale(1); return { agl: Math.round(f.pos.y - 42), speed: Math.round(f.speed), gear: s.player.visual.gear, time: +s.stats.time.toFixed(1) }; });
  // 설정으로 기본 생략
  await d(() => { window.__debug.settings().set('skipTakeoff', true); window.__debug.startMission('c1m2'); });
  await sleep(500);
  out.optionSkip = await d(() => window.__debug.state().phase);
  // 10회 반복해도 리소스가 늘지 않는다
  const mem = async () => d(() => { const i = window.__debug.state().info; return [i.geometries, i.textures]; });
  await d(() => window.__debug.settings().set('skipTakeoff', false));
  const before = await mem();
  for (let i = 0; i < 10; i++) { await d(() => { window.__debug.startMission('c1m1'); }); await sleep(150); await d((k) => { if (k % 2) window.__cinematic.seek(3 + k * 0.4); }, i); await sleep(100); await page.keyboard.press('Space'); await sleep(120); }
  out.resources = [before, await mem()];
  console.log(JSON.stringify(out));
  console.log(errors.length ? errors.slice(0, 4) : '콘솔 오류 0건');
  await browser.close(); server.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });

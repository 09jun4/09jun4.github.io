// 환경·후처리 캡처: node tests/v8-env.cjs <preset>  (메뉴 배경, 비행 중 3인칭, 해를 바라보는 방향)
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
(async () => {
  const preset = process.argv[2] || 'high';
  const { server, origin } = await startServer();
  const browser = await launch();
  const { page, errors } = await openGame(browser, origin, { settings: { quality: preset } });
  const d = (fn, a) => page.evaluate(fn, a);
  await sleep(2500);
  await shot(page, `env-${preset}-menu`);
  await d(() => { window.__debug.startMission('m1'); window.__debug.invincible(true); window.__debug.passiveEnemies(true); window.__debug.teleport(0, 3000, 0, 0); });
  await sleep(2500);
  await shot(page, `env-${preset}-flight`);
  // 해 쪽(sunDirection의 수평 방향)을 바라보게 돌린다: 렌즈 플레어·구름 림
  await d(() => { const s = window.__debug.session(); const sd = s.world.sunDirection; window.__debug.teleport(0, 2400, 0, Math.atan2(-sd.x, -sd.z)); s.player.flight.pitch = 0.5; });
  await sleep(2500);
  await shot(page, `env-${preset}-sun`);
  const m = await d(() => window.__debug.measure(3));
  console.log(JSON.stringify({ measure: m, errors }));
  await browser.close(); server.close();
})();

// 7·8단계 검증: 상승 한계, 고도 연출, 위협 경고, 피격 흔적, 킬캠, 리플레이, 튜토리얼, 주소의 그래픽 옵션
const { startServer, launch, openGame, shot, sleep } = require('./lib/harness.cjs');
const out = {};
const fails = [];
const check = (name, ok, info) => { out[name] = info === undefined ? ok : info; if (!ok) fails.push(name); };
(async () => {
  const { server, origin } = await startServer();
  const browser = await launch();
  const preset = process.argv[2] || 'high';
  {
    const { page, errors, context } = await openGame(browser, origin, { width: 1280, height: 720, settings: { quality: preset } });
    const d = (fn, a) => page.evaluate(fn, a);
    await d(() => { window.__debug.startMission('m1'); window.__debug.invincible(true); });
    await sleep(600);
    // 상승 한계와 고도 연출
    const alt = await d(() => {
      const s = window.__debug.session(), w = s.world, f = s.player.flight;
      const z0 = w.sky.material.uniforms.uZenith.value.getHex(), sun0 = w.lights.sun.intensity;
      w.setAltitude(1000); const low = w.sky.material.uniforms.uZenith.value.getHex();
      w.setAltitude(6500); const high = w.sky.material.uniforms.uZenith.value.getHex(); const sun1 = w.lights.sun.intensity;
      return { cfg: s.player.cfg.altitude.ceilSoft, low: low.toString(16), high: high.toString(16), sun: [w.cfg.lighting.sunIntensity, +sun1.toFixed(2)], z0, sun0 };
    });
    check('ceiling6000', alt.cfg === 6000, alt.cfg);
    check('altitudeLook', alt.low !== alt.high && alt.sun[1] > alt.sun[0], alt);
    // 위협 경고: 적을 뒤에 붙여 기수를 나에게 향하게 한다
    const threat = await d(() => {
      const s = window.__debug.session(), f = s.player.flight;
      window.__debug.spawnEnemy(1, { distance: 300 });
      const e = s.enemies.list.find((x) => x.alive);
      e.pos.copy(f.pos).addScaledVector(f.forward, -300); e.yaw = f.yaw; e.pitch = f.pitch; e._orient(); e.prevPos.copy(e.pos);
      s.threat.update(s.player);
      const a = { ...s.threat.state };
      e.pos.copy(f.pos).addScaledVector(f.forward, 300); e.fireWarn = 1; s.threat.update(s.player);
      const b = { ...s.threat.state };
      e.fireWarn = 0; e.pos.copy(f.pos).addScaledVector(f.forward, -300); e.prevPos.copy(e.pos);
      return { a, b, missileEnabled: s.enemyCfg.missileEnabled };
    });
    check('threatChase', threat.a.active && threat.a.kind === 'chase' && Math.abs(Math.abs(threat.a.bearing) - Math.PI) < 0.3, threat.a);
    check('threatGun', threat.b.active && threat.b.kind === 'gun' && Math.abs(threat.b.bearing) < 0.3, threat.b);
    check('enemyMissileOff', threat.missileEnabled === false);
    await d(() => { window.__debug.freezeEnemies && window.__debug.freezeEnemies(true); });
    await sleep(500);
    await shot(page, `p7-${preset}-threat`);
    // 피격 흔적
    const dec = await d(() => { const s = window.__debug.session(); window.__debug.hitPlayer(40); return { count: s.decals.count, max: s.decals.mesh.instanceMatrix.count }; });
    check('decals', dec.count > 3, dec);
    await d(() => { const s = window.__debug.session(); if (s.view !== 'chase') s.toggleView(); });
    await sleep(600);
    await shot(page, `p7-${preset}-decals`);
    // 킬캠: 남은 적을 실제 피해 경로로 모두 격추
    await d(() => { const s = window.__debug.session(); for (const e of s.enemies.list) if (e.alive) e.despawn(); s.spawner.allSpawnedOverride = true; });
    const kc = await d(async () => {
      const s = window.__debug.session();
      // 편대가 모두 나올 때까지 기다리지 않도록: 남은 수를 맞춘다
      s.stats.kills = s.total - 1;
      Object.defineProperty(s.spawner, 'allSpawned', { get: () => true, configurable: true });
      window.__debug.spawnEnemy(1, { distance: 260 });
      await new Promise((r) => setTimeout(r, 900));
      window.__debug.killEnemy();
      await new Promise((r) => setTimeout(r, 250));
      return { phase: s.phase, active: s.killcam.active, cam: s.killcam.cam, timeScale: s.timeScale, canReplay: s.canReplay() };
    });
    check('killcam', kc.phase === 'ending' && kc.active && kc.timeScale === 0.3, kc);
    await sleep(500);
    await shot(page, `p7-${preset}-killcam`);
    const t0 = Date.now();
    await page.waitForFunction(() => window.__debug.state().state === 'result', null, { timeout: 60000 });
    out.killcamToResultMs = Date.now() - t0;
    const after = await d(() => { const s = window.__debug.session(); return { timeScale: s.timeScale, btn: !!document.querySelector('[data-act="replay"]'), fov: s.camera.fov }; });
    check('killcamEnds', after.timeScale === 1, after);
    check('replayButton', after.btn);
    // 리플레이
    await page.click('[data-act="replay"]');
    await page.waitForFunction(() => !document.querySelector('.replay-tag').hidden, null, { timeout: 60000 }).catch(() => {}); // 느린 환경: 첫 프레임이 그려질 때까지
    const rp = await d(() => { const s = window.__debug.session(); return { on: s.replay.on, mode: s.mode, pass: s.replay.pass, tag: !document.querySelector('.replay-tag').hidden, enemiesVisible: s.enemies.list.filter((e) => e.group.visible).length }; });
    check('replayRuns', rp.on && rp.mode === 'replay' && rp.tag, rp);
    await shot(page, `p7-${preset}-replay1`);
    await page.waitForFunction(() => { const s = window.__debug.session(); return s.replay.pass === 1 || !s.replay.on; }, null, { timeout: 120000 });
    await sleep(600);
    await shot(page, `p7-${preset}-replay2`);
    await page.waitForFunction(() => !window.__debug.session().replay.on, null, { timeout: 120000 });
    await sleep(300);
    const back = await d(() => ({ state: window.__debug.state().state, mode: window.__debug.session().mode, result: !!document.querySelector('.result-title'), visible: getComputedStyle(document.querySelector('.screen.result')).display !== 'none' }));
    check('replayReturns', back.state === 'result' && back.mode === 'mission' && back.result, back);
    check('noErrors', errors.length === 0, errors);
    await context.close();
  }
  // 튜토리얼(PC): 처음 실행
  {
    const { page, errors, context } = await openGame(browser, origin, { width: 1280, height: 720, settings: { quality: 'low', tutorialDone: false } });
    const d = (fn, a) => page.evaluate(fn, a);
    await d(() => { window.__debug.startMission('m1'); window.__debug.invincible(true); });
    await sleep(500);
    const steps = [];
    const snap = async () => { const r = await d(() => { const t = window.__debug.session().tutorial; return { active: t.active, id: t.active ? t.step.id : null, text: document.querySelector('.tut-text').textContent, hidden: document.querySelector('.tutorial').hidden, time: window.__debug.session().stats.time, alive: window.__debug.session().enemies.aliveCount }; }); steps.push(r); return r; };
    const waitStep = (id) => page.waitForFunction((x) => { const t = window.__debug.session().tutorial; return !t.active || (t.step.id === x && !t.stepDone); }, id, { timeout: 60000 });
    let s = await snap();
    check('tutorialStarts', s.active && s.id === 'flight' && !s.hidden, s);
    await shot(page, 'p7-tutorial-pc');
    await d(() => { window.__debug.session().inputOverride = { pitch: 1, turn: 1 }; });
    await waitStep('gun'); s = await snap();
    check('tutorialGunStep', s.id === 'gun' && s.alive === 0 && s.time === 0, s);
    await d(() => { const x = window.__debug.session(); x.inputOverride = null; x.triggerOverride = true; });
    await waitStep('weapon'); await d(() => { const x = window.__debug.session(); x.triggerOverride = null; x.switchWeapon(); });
    await waitStep('view'); await d(() => window.__debug.session().toggleView());
    await waitStep('lock'); s = await snap();
    check('tutorialLockStep', s.id === 'lock', s);
    await page.waitForFunction(() => window.__debug.session().enemies.aliveCount > 0, null, { timeout: 60000 });
    s = await snap();
    check('enemiesAfterHold', s.alive > 0 && s.time === 0, s);
    await page.keyboard.press('Enter');
    await sleep(300);
    const end = await d(() => ({ active: window.__debug.session().tutorial.active, saved: window.__debug.settings().get('tutorialDone'), hidden: document.querySelector('.tutorial').hidden }));
    check('tutorialSkipSaves', !end.active && end.saved === true && end.hidden, end);
    await sleep(500);
    const timeRuns = await d(() => window.__debug.session().stats.time);
    check('timeRunsAfterTutorial', timeRuns > 0, timeRuns);
    check('tutorialNoErrors', errors.length === 0, errors);
    await context.close();
  }
  // 튜토리얼(모바일 문구) + 주소의 그래픽 옵션
  {
    const { page, context } = await openGame(browser, origin, { width: 844, height: 390, query: '?debug=1&quality=high', settings: { quality: 'low', tutorialDone: false, inputMode: 'mobile', mobileHighOk: true } });
    const d = (fn, a) => page.evaluate(fn, a);
    const q = await d(() => ({ name: window.__debug.quality().name, saved: window.__debug.settings().get('quality') }));
    check('urlQuality', q.name === 'high' && q.saved === 'low', q);
    await d(() => { window.__debug.startMission('m1'); });
    await sleep(600);
    const m = await d(() => ({ text: document.querySelector('.tut-text').textContent, skip: document.querySelector('.tut-skip').textContent, skipBtn: !document.querySelector('.t-skip').hidden }));
    check('tutorialMobileText', /조이스틱/.test(m.text) && m.skipBtn, m);
    await shot(page, 'p7-tutorial-mobile');
    await context.close();
  }
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? `실패: ${fails.join(', ')}` : '모두 통과');
  await browser.close(); server.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

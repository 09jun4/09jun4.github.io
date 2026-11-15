// real-demo.js — 리얼리스틱 자동 플레이 (demo): ?demo=real (or window.TM_DEMO =
// 'real' before the scripts, as in the artifact build). Races the calendar
// round after round with the car driving itself at race pace: start lights
// and TV shots, team radio and pit stops (it obeys "Box, box, box"), Overtake
// Mode when it has it, weather, safety cars, damage, results — so every
// change to the mode can be watched without playing. Nothing is saved.
// Load order: after main.js. Depends on: Main, Real, RealUI, Garage, Camera, Car.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var mode = window.TM_DEMO;
  try { mode = mode || new URLSearchParams(location.search).get('demo'); } catch (e) { /* old browser */ }
  if (mode !== 'real') return;

  var D = CR.Demo = { round: 0, camT: 0, screenT: 0 };
  var WEATHER = ['dry', 'mixed', 'auto', 'wet', 'dry', 'mixed'];

  function badge() {
    var b = document.createElement('div');
    b.className = 'demo-badge';
    b.innerHTML = '<b>자동 플레이</b><span>리얼리스틱 데모 · 저장 안 함 · C 시점 · Esc 일시정지</span>';
    document.body.appendChild(b);
    var st = document.createElement('style');
    st.textContent = '.demo-badge{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:20;display:flex;gap:8px;align-items:baseline;padding:5px 12px;border-radius:8px;background:rgba(10,13,19,.75);color:#f2f4f8;font:600 12px/1.3 system-ui,sans-serif;pointer-events:none}.demo-badge b{color:#ffd23f;letter-spacing:.06em}body.in-menu .demo-badge{display:none}';
    document.head.appendChild(st);
  }

  function nextRace() {
    var R = CR.Real, cal = CR.RealData.CALENDAR;
    var ti = R.trackIndexOf(cal[D.round % cal.length]);
    R.demoSettings = { length: 10, weather: WEATHER[D.round % WEATHER.length], level: 'pro', quali: false };
    D.round++;
    R.prepare(ti);
    R.skipQuali();
    CR.Main.startRealRace(R.weather.start > 0.3 ? CR.RealPhys.bestFor(R.weather.start) || 'I' : 'M');
    CR.Car.state.demoDrive = true;
    CR.Input.autoShift = true;
    D.camT = 0;
  }

  function tick() {
    var M = CR.Main, R = CR.Real, c = CR.Car.state;
    if (M.state === 'menu') { nextRace(); return; }
    if (M.state === 'realscreen') {
      // results / standings: move on after a few seconds
      D.screenT += 1;
      if (D.screenT >= 7) {
        D.screenT = 0;
        var b = document.querySelector('.rl-card .rr-actions .is-primary');
        if (b) b.click();
      }
      return;
    }
    D.screenT = 0;
    if (M.state !== 'playing' || !R.on) return;
    c.demoDrive = !c.inPit;
    if (R.phase === 'race' && CR.RealPhys.st.otAvail) R.overtake(); // use MOM as soon as it is there
    // camera: chase and cockpit in turns (not saved as the viewer's choice)
    D.camT += 1;
    if (D.camT >= 18) { D.camT = 0; CR.Camera.mode = CR.Camera.mode === 'cockpit' ? 'chase' : 'cockpit'; }
  }

  window.addEventListener('DOMContentLoaded', function () {
    CR.Garage.noSave = true;
    CR.Garage.setUnlimited(true);
    badge();
    setTimeout(function () { nextRace(); setInterval(tick, 1000); }, 400);
  });
})();

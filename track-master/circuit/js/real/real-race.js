// real-race.js — the 리얼리스틱 race weekend: qualifying (Q1/Q2/Q3
// knockout), the race (20 cars, tyre strategy and wear, fuel, weather,
// pit stops, safety car / VSC, flags and penalties, 2026 Overtake Mode) and
// the season championship (6 rounds, real points, drivers' and
// constructors' standings, saved with the Garage).
//
// race.js runs the cars; it calls the hooks below only while Race.real is
// set (this object). Nothing here runs in 연습 / AI 대전.
// Load order: after real-pit.js, before raceui.js. Depends on: RealData,
// RealPhys, RealPit, Race, Track, Car, Laps, Garage (+ Main, Hud at call time).
(function () {
  'use strict';
  window.CR = window.CR || {};
  var RD = function () { return CR.RealData; };
  var RP = function () { return CR.RealPhys; };
  var Pit = function () { return CR.RealPit; };

  var R = {
    on: false, // a realistic session (qualifying or race) is running
    phase: 'idle', // 'quali' | 'race'
    settings: { length: 25, weather: 'auto', level: 'normal', quali: true },
    trackIndex: 0, trackName: '', realLaps: 0, laps: 3,
    grid: [], cars: [], sc: null,
    scMode: null, // null | 'sc' | 'vsc'
    msgs: [], // radio / race control: {text, kind, at}
    pl: null, // player race state
    q: null, // qualifying state
    weather: null, // {start, rain: [{a, b, peak}], mode}
    rain: 0, // rain intensity now 0..1
    chequered: false,
    lastResults: null,
  };

  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.41; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ctx() { return R.ctx || (R.ctx = CR.Race._ctx()); }
  function wrapGap(d) { var L = ctx().L; return ((d % L) + L * 1.5) % L - L / 2; }
  function level() { var l = RD().LEVELS; for (var i = 0; i < l.length; i++) if (l[i].id === R.settings.level) return l[i]; return l[1]; }
  R.level = level;

  R.radio = function (text, kind) {
    R.msgs.push({ text: text, kind: kind || 'eng', at: performance.now() });
    if (R.msgs.length > 30) R.msgs.shift();
    if (R.onMessage) R.onMessage(R.msgs[R.msgs.length - 1]);
  };

  // --- Weekend ---------------------------------------------------------------

  // Round of the season the player is on (index into CALENDAR).
  R.nextRound = function () {
    var s = CR.Garage.realSave().season;
    return Math.min(s.races.length, RD().CALENDAR.length - 1);
  };
  R.trackIndexOf = function (realName) {
    var l = CR.Tracks.list;
    for (var i = 0; i < l.length; i++) if (l[i].realName === realName) return i;
    return 0;
  };

  function planWeather(mode, realName) {
    var m = mode;
    if (m === 'auto') m = Math.random() < (RD().RAIN_CHANCE[realName] || 0.2) ? (Math.random() < 0.6 ? 'mixed' : 'wet') : 'dry';
    var r = Math.random;
    if (m === 'mixed') { var a = 0.22 + 0.3 * r(); return { mode: m, start: 0, rain: [{ a: a, b: a + 0.18 + 0.17 * r(), peak: 0.55 + 0.45 * r() }] }; }
    if (m === 'wet') return { mode: m, start: 0.78, rain: [{ a: 0, b: 0.25 + 0.3 * r(), peak: 0.8 }] };
    return { mode: 'dry', start: 0, rain: [] };
  }
  R.rainAt = function (frac) {
    var w = R.weather, v = 0;
    if (!w) return 0;
    w.rain.forEach(function (p) {
      var ramp = 0.03;
      if (frac >= p.a - ramp && frac <= p.b + ramp) v = Math.max(v, p.peak * clamp(Math.min((frac - p.a + ramp) / ramp, (p.b + ramp - frac) / ramp), 0, 1));
    });
    return v;
  };

  // Sets up a weekend on the next calendar round (or a given track).
  R.prepare = function (trackIndex) {
    RD().buildModels();
    var save = CR.Garage.realSave();
    R.settings = save.settings;
    if (trackIndex === undefined) trackIndex = R.trackIndexOf(RD().CALENDAR[R.nextRound()]);
    R.trackIndex = trackIndex;
    var t = CR.Tracks.list[trackIndex];
    R.trackName = t.realName;
    R.realLaps = RD().LAPS[t.realName] || 50;
    R.laps = Math.max(3, Math.round(R.realLaps * R.settings.length / 100));
    R.lifeScale = clamp(R.laps / R.realLaps * 1.15, 0.15, 1);
    R.weather = planWeather(R.settings.weather, t.realName);
    R.q = null;
    R.grid = [];
    R.msgs.length = 0;
    R.lastResults = null;
  };

  // Realistic car + this track built, ready for qualifying or the race.
  function buildFor(fuel, tyre, wet) {
    var log = console.log;
    console.log = function () {};
    RP().configure({ fuel: fuel });
    RP().wet = wet;
    CR.Config.TIRE_GRIP_TARMAC = RP().tyreMu(tyre, 0, 1, wet);
    CR.Track.buildTrack(CR.Tracks.list[R.trackIndex].segments);
    RP().buildZones();
    console.log = log;
  }

  // --- Qualifying ------------------------------------------------------------
  // Q1 (20 cars, 5 out), Q2 (15, 5 out), Q3 (10): one flying lap each for the
  // player from a rolling start; the AI's laps come from its pace.
  var Q_OUT = [5, 5];
  R.qualiTyre = function () { return RP().bestFor(R.weather.start) || 'S'; };
  function aiQualiTime(d, session) {
    var team = RD().team(d.team);
    var wetSkill = 1 + R.weather.start * (d.skill - 1) * 2;
    return R.qIdeal * level().factor * team.perf * d.skill * wetSkill * (1 - 0.0015 * (session - 1)) * (1 + gauss() * 0.0022);
  }
  R.startQuali = function () {
    R.on = true;
    R.phase = 'quali';
    var all = RD().DRIVERS.map(function (d) { return d.id; }).concat(['you']);
    R.q = { session: 1, times: { 1: {}, 2: {}, 3: {} }, alive: all, out: [], playerOut: false, run: null };
    R.setupQualiRun();
  };
  // Player's run: realistic car on low fuel, new tyres, 700 m before the line.
  R.setupQualiRun = function () {
    var tyre = R.qualiTyre();
    buildFor(6, tyre, R.weather.start);
    R.ctx = null;
    R.qIdeal = CR.Race.profileLap();
    R.ctx = CR.Race._ctx();
    Pit().build();
    RP().reset({ fuel: 6, distance: 2 * ctx().L, tyre: tyre, lifeScale: 1, wet: R.weather.start });
    RP().st.warm = 0.85;
    CR.Track.refreshSpeeds();
    var start = ctx().indexAt(ctx().wrapDist(-700), 0);
    CR.Car.spawnAt(start, 0);
    CR.Laps.reset(false, start);
    R.q.run = { flying: false, deleted: false, done: false, time: null };
  };
  // Lap events during qualifying: the first crossing starts the flying lap.
  R.qualiLap = function (ev) {
    var run = R.q && R.q.run;
    if (!run || run.done) return;
    if (!run.flying) { run.flying = true; run.deleted = false; R.radio('플라잉 랩 시작! 전부 쏟아부어', 'eng'); return; }
    run.done = true;
    run.time = run.deleted ? null : ev.value;
    R.finishQualiRun();
  };
  R.qualiCrash = function () {
    var run = R.q && R.q.run;
    if (!run || run.done) return;
    run.done = true; run.time = null;
    setTimeout(function () { R.finishQualiRun(); }, 2200);
  };
  // Session result: AI times for everyone still in, cut line, next session.
  R.finishQualiRun = function () {
    var q = R.q, s = q.session;
    q.times[s].you = q.run ? q.run.time : null;
    simulateSession(s);
    if (R.onQualiSession) R.onQualiSession(s, R.qualiTable(s));
  };
  function simulateSession(s) {
    var q = R.q;
    q.alive.forEach(function (id) {
      if (id === 'you') { if (q.times[s].you === undefined) q.times[s].you = null; return; }
      q.times[s][id] = aiQualiTime(RD().driver(id), s);
    });
  }
  // Sorted [{id, time}] for a session (null times last).
  R.qualiTable = function (s) {
    var q = R.q, t = q.times[s];
    return q.alive.map(function (id) { return { id: id, time: t[id] === undefined ? null : t[id] }; })
      .sort(function (a, b) { return (a.time === null ? 1e9 : a.time) - (b.time === null ? 1e9 : b.time); });
  };
  // Knockout after a session. Returns true when qualifying is over.
  R.advanceQuali = function () {
    var q = R.q, s = q.session, table = R.qualiTable(s);
    if (s < 3) {
      var keep = table.length - Q_OUT[s - 1];
      q.out = table.slice(keep).map(function (e) { return e.id; }).concat(q.out);
      q.alive = table.slice(0, keep).map(function (e) { return e.id; });
      q.session = s + 1;
      if (q.alive.indexOf('you') < 0) {
        q.playerOut = true;
        while (q.session <= 3) { simulateSession(q.session); if (q.session < 3) { var tb = R.qualiTable(q.session), k = tb.length - Q_OUT[q.session - 1]; q.out = tb.slice(k).map(function (e) { return e.id; }).concat(q.out); q.alive = tb.slice(0, k).map(function (e) { return e.id; }); } q.session++; }
        q.session = 3;
        finishGrid();
        return true;
      }
      return false;
    }
    finishGrid();
    return true;
  };
  function finishGrid() {
    var q = R.q, order = R.qualiTable(3).map(function (e) { return e.id; }).concat(q.out);
    R.grid = order.map(function (id) { return id === 'you' ? { driver: RD().PLAYER, isPlayer: true } : { driver: RD().driver(id), isPlayer: false }; });
    R.gridTimes = order.map(function (id) {
      for (var s = 3; s >= 1; s--) if (q.times[s][id] !== undefined) return { id: id, time: q.times[s][id], session: s };
      return { id: id, time: null, session: 1 };
    });
  }
  // No qualifying: grid from simulated laps (the player as an average driver of their team).
  R.skipQuali = function () {
    var tyre = R.qualiTyre();
    buildFor(6, tyre, R.weather.start);
    R.ctx = null;
    R.qIdeal = CR.Race.profileLap();
    var all = RD().DRIVERS.map(function (d) { return d.id; }).concat(['you']);
    R.q = { session: 3, times: { 1: {}, 2: {}, 3: {} }, alive: all, out: [], playerOut: false };
    all.forEach(function (id) {
      var d = id === 'you' ? { team: 'you', skill: 1.004 } : RD().driver(id);
      R.q.times[3][id] = aiQualiTime(d, 1);
    });
    finishGrid();
  };

  // --- Strategy --------------------------------------------------------------

  // Lap time loss (s) of a compound at a wear level, relative to new mediums.
  function lapDelta(c, w) { return R.lapRef * (Math.pow(R.refMu / RP().tyreMu(c, w, 1, 0), R.gripExp) - 1); }
  function lifeOf(c) { return RD().TYRES[c].life * R.lifeScale; }
  // All 0-, 1- and 2-stop dry strategies for N laps, cheapest first.
  function strategies(N) {
    var comps = ['S', 'M', 'H'], cost = {};
    comps.forEach(function (c) {
      var arr = [0], acc = 0;
      for (var k = 1; k <= N; k++) { acc += lapDelta(c, (k - 0.5) / lifeOf(c)); arr.push(acc); }
      cost[c] = arr;
    });
    var best = {}, P = R.pitLoss;
    function offer(stints, total) {
      var key = stints.map(function (s) { return s[0]; }).join('');
      if (!best[key] || total < best[key].cost) best[key] = { stints: stints, cost: total };
    }
    comps.forEach(function (a) {
      offer([[a, N]], cost[a][N]);
      comps.forEach(function (b) {
        for (var l1 = 1; l1 < N; l1++) offer([[a, l1], [b, N - l1]], cost[a][l1] + cost[b][N - l1] + P);
        if (N < 8) return;
        comps.forEach(function (c) {
          for (var x = 2; x < N - 3; x++) for (var y = 2; x + y < N - 1; y++) {
            offer([[a, x], [b, y], [c, N - x - y]], cost[a][x] + cost[b][y] + cost[c][N - x - y] + 2 * P);
          }
        });
      });
    });
    return Object.keys(best).map(function (k) { return best[k]; }).sort(function (p, q) { return p.cost - q.cost; });
  }
  // A strategy for one car: the cheap ones, with taste (noise).
  function pickStrategy(list, noise) {
    var pick = null, pc = Infinity;
    list.slice(0, 8).forEach(function (s) {
      var c = s.cost + gauss() * noise;
      if (c < pc) { pc = c; pick = s; }
    });
    return pick.stints.map(function (s) { return [s[0], s[1]]; });
  }
  // Tyre for the remaining laps (softest that lasts, wet weather first).
  R.tyreFor = function (remaining, w) {
    var wt = RP().bestFor(w === undefined ? RP().wet : w);
    if (wt) return wt;
    if (lifeOf('S') >= remaining * 0.95) return 'S';
    if (lifeOf('M') >= remaining * 0.95) return 'M';
    return 'H';
  };
  function planToStops(stints) {
    var stops = [], lap = 0;
    for (var i = 0; i < stints.length - 1; i++) { lap += stints[i][1]; stops.push({ lap: lap, tyre: stints[i + 1][0] }); }
    return stops;
  }

  // --- Race hooks (race.js) ------------------------------------------------------

  R.configureProfile = function () {
    var d = RD().CAR;
    R.ctx = null;
    R.fuelStart = d.FUEL_FULL * R.laps / R.realLaps + 1.5;
    R.refFuel = R.fuelStart / 2;
    RP().configure({ fuel: R.refFuel });
    RP().wet = 0;
    R.refMu = RP().tyreMu('M', 0, 1, 0);
    CR.Config.TIRE_GRIP_TARMAC = R.refMu;
  };
  // measure(): ideal lap with the current CR.Config (race.js rebuilds the profile).
  R.calibrate = function (measure, base) {
    var cfg = CR.Config;
    R.idealLap = base;
    cfg.TIRE_GRIP_TARMAC = R.refMu * 0.95;
    var t1 = measure();
    cfg.TIRE_GRIP_TARMAC = R.refMu;
    R.gripExp = Math.log(t1 / base) / Math.log(1 / 0.95);
    cfg.CAR_MASS += 10;
    var t2 = measure();
    cfg.CAR_MASS -= 10;
    R.kgSens = (t2 / base - 1) / 10;
    RP().profile = true;
    R.accTab = [];
    for (var v = 0; v <= 100; v++) R.accTab.push(Math.max(2, CR.Car.maxAccelAt(v)));
    RP().profile = false;
    CR.Track.refreshSpeeds();
  };
  R.configurePlayer = function () {
    var L = CR.Race._ctx().L;
    RP().reset({ fuel: R.fuelStart, distance: R.laps * L, tyre: R.startTyre || 'M', lifeScale: R.lifeScale, wet: R.weather.start });
    RP().noStraight = false;
  };
  // AI_DRIVE: the kinematic AI loses ~2.6 % to the ideal profile (it brakes on
  // a look-ahead and accelerates within a cap; measured on all six circuits),
  // so the race pace matches the qualifying times computed from the ideal lap.
  var AI_DRIVE = 1.026;
  R.paceOf = function (d) { return level().factor * RD().team(d.team).perf * d.skill / AI_DRIVE; };
  R.accelCap = function (car) {
    var t = R.accTab;
    return t ? Math.min(22, t[Math.min(100, Math.floor(car.v))] / Math.max(1, car.pace * 0.985)) : 22;
  };

  R.initCar = function (car, entry) {
    var d = entry.driver;
    var stints = R.weather.start > 0.25 ? [[RP().bestFor(R.weather.start), R.laps]] : pickStrategy(R.strats, 2 + R.laps * 0.04);
    car.number = d.num;
    car.rt = {
      team: d.team, tyre: stints[0][0], wear: 0, warm: 0.7, fuel: R.fuelStart, stops: 0,
      plan: planToStops(stints), box: false, nextTyre: null, pit: null,
      pen: 0, penServed: 0, warnings: 0, mul: 1, wetPick: (Math.random() * 2 - 1) * 0.07,
      otNext: false, otAvail: false, chase: false, blue: false, prevRel: undefined,
      wetSkill: d.skill,
      form: 1 + gauss() * 0.004, // race-day form
      slow: 0, // s left of a small mistake (lock-up, wide moment)
    };
    R.cars.push(car);
  };

  R.onStart = function () {
    R.ctx = CR.Race._ctx();
    Pit().build();
    R.cars.forEach(function (car) { car.rt.prevRel = Pit().relOf(car.dist); });
    R.chequered = false;
    R.scMode = null; R.sc = null; R.scTimer = 0; R.scLaps = 0; R.scEnding = false;
    R.incidents = [];
    R.rain = R.rainAt(0);
    R.fastest = null;
    var L = ctx().L;
    R.raceTime = R.laps * R.idealLap * level().factor;
    var lim = RD().CAR.PIT_LIMIT, span = Pit().ENTRY + Pit().EXIT;
    R.pitLoss = span / lim - span / (L / R.idealLap) + 2.5;
    R.lap1Incident = Math.random() < 0.09 * (1 + RP().wet * 2) ? 6 + Math.random() * 30 : -1;
    var c = CR.Car.state;
    c.inPit = false;
    R.pl = {
      box: false, nextTyre: null, stops: 0, pen: 0, penServed: 0, warnings: 0, prevRel: Pit().relOf(CR.Race.player.dist),
      otNext: false, lapsDone: 0, vscDelta: 0, vscWarned: false, vscPenalised: false, scPrev: {}, best: null,
      wearWarn: 0, plan: R.weather.start > 0.25 ? [] : planToStops(pickStrategy(R.strats, 0)),
    };
    R.pl.nextTyre = R.pl.plan.length ? R.pl.plan[0].tyre : R.tyreFor(R.laps);
    Pit().onPlayerExit = function () { R.radio('피트 아웃! 타이어 ' + RD().tyre(RP().st.tyre).name + ', 페이스 올려', 'eng'); };
    R.radio('라이트 아웃을 기다려. 출발 타이어 ' + RD().tyre(RP().st.tyre).name + (R.pl.plan.length ? ' · 계획: ' + R.pl.plan.map(function (p) { return p.lap + '랩 ' + p.tyre; }).join(', ') : ''), 'eng');
    if (R.weather.rain.length && R.weather.start < 0.2) R.radio('레이더에 비구름이 보여요. 레이스 중 비 예보', 'eng');
    R.tick = 0;
  };

  // Starting tyre and strategy list: before Race.start (the player picks a tyre).
  R.prepareRace = function (startTyre) {
    R.phase = 'race';
    R.on = true;
    R.cars = [];
    R.startTyre = startTyre || R.startTyre || 'M';
  };
  // Called from race.js right after the profile is built (strategies need it).
  R.afterProfile = function () {
    R.lapRef = R.idealLap * level().factor;
    var L = ctx().L, lim = RD().CAR.PIT_LIMIT, span = Pit().ENTRY + Pit().EXIT;
    R.pitLoss = span / lim - span / (L / R.idealLap) + 2.5;
    R.strats = strategies(R.laps);
  };

  // Lap-time multiplier for an AI car at sample i (>1 = slower).
  R.paceMul = function (car, i) {
    var m = car.rt.mul;
    if (car.rt.otAvail && car.rt.chase && RP().zone && RP().zone[i]) m *= 0.986;
    return m;
  };

  function burnPerLap() { return R.fuelStart / R.laps * 0.97; }

  R.preDrive = function (car, dt) {
    if (car.sc) { driveSC(car, dt); return true; }
    var rt = car.rt;
    if (car.retired) {
      car.v = Math.max(0, car.v - 20 * dt);
      car.dist += car.v * dt;
      car.offset += (rt.parkOff - car.offset) * Math.min(1, dt * 1.2);
      return true;
    }
    var L = ctx().L, dl = car.v * dt / L;
    var t = RD().tyre(rt.tyre), wet = RP().wet;
    var overheat = t.wet && wet < 0.2 ? (t.wet === 'wet' ? 3 : 1.8) : 1;
    rt.wear += dl / (t.life * R.lifeScale) * overheat * (rt.pit ? 0 : 1);
    rt.warm = Math.min(1, rt.warm + dt * (0.012 + 0.05 * Math.min(1, car.v / 60)));
    rt.fuel = Math.max(0, rt.fuel - dl * burnPerLap());
    var wetSkill = 1 + wet * (rt.wetSkill - 1) * 2;
    rt.mul = Math.pow(R.refMu / RP().tyreMu(rt.tyre, rt.wear, rt.warm, wet), R.gripExp) * (1 + R.kgSens * (rt.fuel - R.refFuel)) * wetSkill * rt.form;
    if (rt.slow > 0) rt.slow -= dt;
    else if (Math.random() < (0.035 + wet * 0.08) * dl * (rt.wear > 1 ? 2 : 1)) rt.slow = 1.2 + Math.random() * 1.8;
    var rel = Pit().relOf(car.dist);
    if (rt.prevRel !== undefined && Math.abs(rel - rt.prevRel) < 100) {
      if (rt.prevRel < -300 && rel >= -300) rt.otNext = detection(car);
      if (rt.box && !rt.pit && rt.prevRel < -Pit().ENTRY && rel >= -Pit().ENTRY ) startPit(car, rel);
    }
    rt.prevRel = rel;
    if (rt.pit) {
      if (Pit().driveCar(car, rt.pit, dt)) { rt.pit = null; rt.prevRel = Pit().relOf(car.dist); car.laneTarget = car.offset; }
      return true;
    }
    // incidents (green running only)
    if (!R.scMode && !car.finished && !R.chequered && CR.Race.phase === 'green') {
      var rate = (0.0005 + 0.0035 * wet) * (car.lap === 0 ? 3 : 1);
      if (Math.random() < rate * dl) retire(car, Math.random() < 0.5 ? '사고' : '기술 문제');
    }
    return false;
  };

  function startPit(car, rel) {
    var rt = car.rt, mate = null;
    R.cars.forEach(function (o) { if (o !== car && o.rt.team === rt.team && o.rt.pit && o.rt.pit.phase !== 'out') mate = o; });
    var stop = Pit().stopTime() + rt.pen + (mate ? 3 + Math.random() * 2 : 0);
    rt.nextTyre = rt.nextTyre || R.tyreFor(R.laps - car.lap - 1);
    rt.pit = Pit().newRun(rel, car.v, car.offset, Pit().boxRel(rt.team), stop);
    rt.pit.tyre = rt.nextTyre;
    rt.pit.onService = function () {
      rt.tyre = rt.nextTyre; rt.wear = 0; rt.warm = 0.55; rt.stops++;
      rt.penServed += rt.pen; rt.pen = 0; rt.box = false; rt.nextTyre = null;
      if (rt.plan.length && rt.plan[0].lap <= car.lap + 2) rt.plan.shift();
    };
  }

  // Overtake Mode detection: within 1 s of the car ahead (any car on track).
  function detection(car) {
    if (R.scMode || car.lap < 1) return false;
    var me = car.isPlayer ? CR.Race.player : car, best = Infinity;
    allRunning().forEach(function (o) {
      if (o === me) return;
      var g = wrapGap(o.dist - me.dist);
      if (g > 0 && g < best) best = g;
    });
    var v = Math.max(20, car.isPlayer ? CR.Car.state.speed : car.v);
    return best / v < 1.0;
  }
  function allRunning() {
    var list = [];
    if (!CR.Race.player.retired && !CR.Car.state.inPit) list.push(CR.Race.player);
    CR.Race.ai.forEach(function (o) { if (!o.sc && !o.retired && !(o.rt && o.rt.pit)) list.push(o); });
    return list;
  }

  function retire(car, why) {
    car.retired = true;
    car.rt.why = why;
    var hw = CR.Config.TRACK_WIDTH / 2;
    car.rt.parkOff = (car.offset >= 0 ? 1 : -1) * (hw + 3.5);
    car.rt.retiredAt = CR.Race.clock;
    R.incidents.push({ dist: car.dist, at: CR.Race.clock, car: car });
    R.radio(car.driver.code + ' 리타이어 (' + why + ') — 옐로 플래그', 'race');
    var left = R.laps - leaderLaps();
    if (!R.scMode && left >= 2) {
      var r = Math.random();
      if (r < 0.42) deploySC();
      else if (r < 0.85) deployVSC();
    }
  }
  function leaderLaps() {
    var o = R.order()[0];
    return o ? (o.isPlayer ? CR.Laps.history.length : o.lap) : 0;
  }

  // --- Safety car / VSC ---------------------------------------------------------

  function deployVSC() {
    R.scMode = 'vsc';
    R.scTimer = 45 + Math.random() * 40;
    R.scEnding = false;
    R.pl.vscDelta = 0; R.pl.vscWarned = false; R.pl.vscPenalised = false;
    R.radio('버추얼 세이프티카 — 델타를 지켜', 'race');
    pitWindowUnderCaution();
  }
  var scModel = null;
  function deploySC() {
    R.scMode = 'sc';
    R.scEnding = false;
    R.scLaps = 2 + Math.floor(Math.random() * 2);
    var lead = R.order()[0];
    if (!scModel) scModel = RD().safetyCarModel();
    var leadDist = lead ? (lead.isPlayer ? CR.Race.player.dist : lead.dist) : 0;
    var sc = {
      sc: true, isAI: true, driver: { id: 'sc', code: 'SC', name: '세이프티카', team: 'fia', main: '#c9ced6', num: 0 }, model: scModel,
      dist: leadDist + 160, offset: 0, laneTarget: 0, laneVel: 0, prefLane: 0, v: 40, pace: 1, lapPace: 1,
      idx: 0, x: 0, y: 0, heading: 0, wheelDist: 0, wheelSteer: 0, forwardSpeed: 0, reaction: 0, lap: 0, lapStart: 0, laps: [], best: null,
      finished: false, finishTime: null, scPhase: 'out', number: 0,
    };
    R.sc = sc;
    CR.Race.ai.push(sc);
    R.radio('세이프티카 출동 — 추월 금지', 'race');
    pitWindowUnderCaution();
  }
  // Cheap stops under caution: AI cars with a stop to come box now.
  function pitWindowUnderCaution() {
    var lapsLeft = R.laps - leaderLaps();
    if (lapsLeft <= 3) return;
    R.cars.forEach(function (car) {
      var rt = car.rt;
      if (car.retired || rt.pit || rt.box) return;
      var due = rt.plan.length && (rt.plan[0].lap - car.lap) < Math.max(4, 0.45 * (rt.plan[0].lap - (car.lap - stintLaps(car))));
      if (due || rt.wear > 0.45) {
        rt.box = true;
        rt.nextTyre = R.tyreFor(R.laps - car.lap - 1);
        rt.plan = [];
      }
    });
    if (!CR.Car.state.inPit && !R.pl.box) R.radio(R.scMode === 'sc' ? '세이프티카야! 박스할까? (P)' : 'VSC — 피트 손실이 줄어요. 박스? (P)', 'eng');
  }
  function stintLaps(car) { return car.rt.stintStart === undefined ? car.lap : car.lap - car.rt.stintStart; }

  function driveSC(car, dt) {
    var c = ctx(), i = c.indexAt(c.wrapDist(car.dist), car.idx);
    if (car.scPit) {
      if (Pit().driveCar(car, car.scPit, dt)) removeSC();
      return;
    }
    var vt = c.profile[i] * 0.56;
    car.v += clamp(vt - car.v, -30 * dt, 12 * dt);
    car.laneTarget = 0;
    car.offset += clamp(-car.offset, -2 * dt, 2 * dt);
    var prev = Pit().relOf(car.dist);
    car.dist += car.v * dt;
    var rel = Pit().relOf(car.dist);
    if (R.scEnding && prev < -Pit().ENTRY && rel >= -Pit().ENTRY) {
      car.scPit = Pit().newRun(rel, car.v, car.offset, null, 0);
      car.scPit.vMax = 30;
      R.radio('세이프티카 피트인 — 리더가 재출발을 주도', 'race');
    }
  }
  R.debugCaution = function (kind) { if (kind === 'vsc') deployVSC(); else deploySC(); }; // tests
  function removeSC() {
    var i = CR.Race.ai.indexOf(R.sc);
    if (i >= 0) CR.Race.ai.splice(i, 1);
    R.sc = null;
  }
  function endCaution() {
    R.scMode = null;
    R.scEnding = false;
    R.restartLap = leaderLaps();
    R.radio('그린 플래그! 레이스 재개', 'flag');
  }

  R.targetSpeed = function (car, vt) {
    var rt = car.rt;
    if (car.finished) return vt;
    if (R.scMode === 'vsc') vt *= 0.6;
    else if (R.scMode === 'sc' || (R.scEnding && R.sc)) {
      var a = rt.ahead, g = rt.gapAhead;
      if (a && g < 350) {
        var av = a.isPlayer ? CR.Car.state.speed : a.v;
        vt = Math.max(0, Math.min(vt * 0.8, av + (g - 18) * 0.35));
      } else vt *= 0.8;
    }
    if (rt.blue) vt *= 0.96;
    if (rt.slow > 0) vt *= 0.86;
    if (yellowNear(car.dist)) vt *= 0.97;
    return vt;
  };
  function yellowNear(dist) {
    for (var i = 0; i < R.incidents.length; i++) {
      var inc = R.incidents[i];
      if (CR.Race.clock - inc.at > 40) continue;
      var g = wrapGap(inc.dist - dist);
      if (g > -60 && g < 250) return true;
    }
    return false;
  }
  R.mayPass = function (car, block) {
    if (block.sc) return false;
    if (block.rt && (block.rt.pit || block.retired)) return true;
    if (block.isPlayer && CR.Car.state.inPit) return true;
    if (R.scMode || (R.scEnding && R.sc)) return false;
    if (yellowNear(car.dist)) return false;
    return true;
  };
  R.lane = function (car) {
    var rt = car.rt, L = ctx().L;
    if (car.sc || car.retired || rt.pit) return;
    var rel = Pit().relOf(car.dist);
    if (rt.box && rel > -Pit().ENTRY - 500 && rel < -Pit().ENTRY) car.laneTarget = Pit().edge;
    else if (rt.blue) car.laneTarget = rt.blueSide * (CR.Config.TRACK_WIDTH / 2 - 1.3);
  };
  R.collides = function (o) {
    if (o.isPlayer) return !CR.Car.state.inPit;
    return !(o.retired || o.sc || (o.rt && o.rt.pit));
  };

  // AI lap completed (car.lap already counted).
  R.onAILap = function (car) {
    var rt = car.rt;
    if (car.sc) return;
    rt.otAvail = rt.otNext && !R.scMode && car.lap >= 2 && (R.restartLap === undefined || leaderLaps() > R.restartLap);
    rt.otNext = false;
    var t = car.laps[car.laps.length - 1];
    if (t && (!R.fastest || t < R.fastest.time) && car.lap > 1) R.fastest = { id: car.driver.id, code: car.driver.code, time: t };
    if (rt.pit || car.retired) return;
    if (rt.pen === 0 && Math.random() < 0.003) { rt.pen = 5; R.radio(car.driver.code + ' 5초 페널티 (트랙 리밋)', 'race'); }
    var left = R.laps - car.lap;
    if (left < 1 || rt.box) return;
    var wet = RP().wet, tyre = RD().tyre(rt.tyre), want = null;
    // weather
    if (!tyre.wet && wet > 0.3 + rt.wetPick) want = RP().bestFor(Math.max(wet, 0.3));
    else if (tyre.wet === 'inter' && wet > 0.74 + rt.wetPick) want = 'W';
    else if (tyre.wet === 'wet' && wet < 0.55 + rt.wetPick) want = 'I';
    else if (tyre.wet === 'inter' && wet < 0.16 + rt.wetPick && R.rain < 0.1) want = R.tyreFor(left, 0);
    if (want) { rt.box = true; rt.nextTyre = want; rt.plan = []; return; }
    if (left < 2) return;
    // plan / wear
    var proj = rt.wear + 1.5 / (tyre.life * R.lifeScale);
    if ((rt.plan.length && car.lap + 1 >= rt.plan[0].lap) || proj > 1.08) {
      rt.box = true;
      rt.nextTyre = rt.plan.length ? rt.plan[0].tyre : R.tyreFor(left - 1);
      if (!rt.plan.length || proj > 1.08 && car.lap + 1 < rt.plan[0].lap) { rt.nextTyre = R.tyreFor(left - 1); }
      rt.stintStart = car.lap + 1;
    }
  };
  R.lapDone = function (car) {
    if (car.lap >= R.laps || R.chequered) {
      if (!R.chequered) { R.chequered = true; R.radio('체커기! ' + car.driver.code + ' 우승', 'flag'); }
      return true;
    }
    return false;
  };
  R.onPlayerLap = function (lap) {
    var pl = R.pl, st = RP().st;
    pl.lapsDone = lap;
    var h = CR.Laps.history[lap - 1];
    if (h && lap > 1 && (!R.fastest || h.time < R.fastest.time)) R.fastest = { id: 'you', code: 'YOU', time: h.time };
    if (h && (!pl.best || h.time < pl.best)) pl.best = h.time;
    st.otAvail = pl.otNext && !R.scMode && lap >= 1 && (R.restartLap === undefined || leaderLaps() > R.restartLap);
    st.otActive = false; st.otBudget = 0;
    pl.otNext = false;
    if (st.otAvail) R.radio('오버테이크 모드 사용 가능 (O)', 'eng');
    engineerLap(lap);
  };
  R.playerDone = function (lap) {
    if (lap >= R.laps || R.chequered) {
      if (!R.chequered) { R.chequered = true; R.radio('체커기! 우승이야!!', 'flag'); }
      return true;
    }
    return false;
  };

  // Engineer: tyres, strategy, weather, gaps.
  function engineerLap(lap) {
    var pl = R.pl, st = RP().st, left = R.laps - lap, wet = RP().wet, t = RD().tyre(st.tyre);
    if (left <= 0) return;
    if (!t.wet && wet > 0.3) suggest(RP().bestFor(Math.max(wet, 0.3)), '노면이 젖었어요. 박스 권장');
    else if (t.wet === 'inter' && wet > 0.76) suggest('W', '폭우! 풀 웨트로 박스 권장');
    else if (t.wet === 'wet' && wet < 0.5) suggest('I', '비가 줄었어요. 인터미디엇 박스 권장');
    else if (t.wet && wet < 0.15 && R.rain < 0.1) suggest(R.tyreFor(left, 0), '레코드 라인이 말랐어요. 슬릭 타이어 박스 권장');
    else if (pl.plan.length && lap + 1 >= pl.plan[0].lap && left >= 2) suggest(pl.plan[0].tyre, '피트 창 — 이번 랩 끝에 박스 권장');
    else if (st.wear > 0.95 && left >= 2) suggest(R.tyreFor(left - 1), '타이어가 한계예요. 박스 권장');
    else if (st.wear > 0.7 && pl.wearWarn < 1) { pl.wearWarn = 1; R.radio('타이어 마모 ' + Math.round(st.wear * 100) + '%', 'eng'); }
    else if (lap % 4 === 0) gapsMessage();
    var r = R.rainAt((lap + 3) / R.laps);
    if (r > 0.2 && R.rain < 0.05 && !pl.rainWarned) { pl.rainWarned = true; R.radio('레이더: 3랩 안에 비가 와요', 'eng'); }
  }
  function suggest(tyre, text) {
    var pl = R.pl;
    if (!tyre) return;
    var key = tyre + text;
    if (pl.lastAdvice === key && pl.lapsDone - pl.lastAdviceLap < 3) return;
    pl.lastAdvice = key; pl.lastAdviceLap = pl.lapsDone;
    pl.nextTyre = tyre;
    R.radio(text + ' (' + RD().tyre(tyre).name + ') — P', 'eng');
  }
  function gapsMessage() {
    var order = R.order(), i = order.indexOf(CR.Race.player);
    if (i < 0) return;
    var parts = [];
    if (i > 0) parts.push('앞차 ' + order[i - 1].driver.code + ' ' + gapText(order[i - 1], CR.Race.player));
    if (i < order.length - 1 && !order[i + 1].retired) parts.push('뒤차 ' + order[i + 1].driver.code + ' ' + gapText(CR.Race.player, order[i + 1]));
    R.radio('P' + (i + 1) + (parts.length ? ' · ' + parts.join(' · ') : ''), 'eng');
  }
  function gapText(a, b) {
    var v = Math.max(25, a.isPlayer ? CR.Car.state.speed : a.v), L = ctx().L;
    if (a.dist - b.dist > L) return '+' + Math.floor((a.dist - b.dist) / L) + '랩';
    return ((a.dist - b.dist) / v).toFixed(1) + '초';
  }

  // --- Player actions (keys / buttons in real-ui.js) ---------------------------
  R.requestBox = function () {
    if (!R.on || R.phase !== 'race' || !R.pl || CR.Car.state.inPit) return;
    R.pl.box = !R.pl.box;
    R.radio(R.pl.box ? '박스 박스! 이번 랩 끝에 피트인 — ' + RD().tyre(R.pl.nextTyre).name : '박스 취소, 계속 달려', 'eng');
  };
  R.cycleTyre = function () {
    if (!R.pl) return;
    var ids = ['S', 'M', 'H', 'I', 'W'], k = ids.indexOf(R.pl.nextTyre);
    R.pl.nextTyre = ids[(k + 1) % ids.length];
  };
  R.overtake = function () {
    var st = RP().st;
    if (!R.on || R.phase !== 'race' || !st.otAvail || st.otActive) return;
    st.otActive = true; st.otAvail = false; st.otBudget = RD().CAR.OT_MJ;
  };
  R.setBoost = function (on) { RP().st.boost = !!on && R.on; };
  // Track limits (laps.js, realistic): 3 warnings, then 5 s each.
  R.trackLimit = function () {
    if (!R.on || CR.Car.state.inPit) return;
    if (R.phase === 'quali') {
      if (R.q && R.q.run && R.q.run.flying && !R.q.run.deleted) { R.q.run.deleted = true; R.radio('트랙 리밋 — 이번 랩 타임 삭제', 'race'); }
      return;
    }
    var pl = R.pl;
    pl.warnings++;
    if (pl.warnings <= 3) R.radio('트랙 리밋 경고 ' + pl.warnings + '/3' + (pl.warnings === 3 ? ' — 흑백기' : ''), 'race');
    else penalise(5, '트랙 리밋');
  };
  function penalise(s, why) {
    R.pl.pen += s;
    R.radio(s + '초 페널티 (' + why + ') — 다음 피트스톱에서 소화', 'race');
  }

  // --- Per frame -------------------------------------------------------------

  // Every playing frame while a realistic session runs (main.js), before the car moves.
  R.frame = function (dt) {
    if (!R.on) return;
    var c = CR.Car.state, inp = CR.Input.state;
    if (R.phase === 'race' && CR.Race.phase === 'lights') return;
    RP().update(dt, c, { throttle: c.inPit ? 0.3 : inp.throttle, brake: c.inPit ? 0 : inp.brake }, CR.Track.length || ctx().L);
  };

  R.update = function (dt) {
    if (!R.on || R.phase !== 'race') return;
    var race = CR.Race, L = ctx().L, pl = R.pl, c = CR.Car.state;
    // order, gaps, blue flags (4x a second)
    R.tick -= dt;
    if (R.tick <= 0) { R.tick = 0.25; relations(); }
    // weather
    var lead = R.order()[0];
    var frac = lead ? clamp((lead.isPlayer ? race.player.dist : lead.dist) / (R.laps * L), 0, 1) : 0;
    var rain = R.rainAt(frac);
    if (rain > 0.05 && R.rain <= 0.05) R.radio('비가 내리기 시작했어요', 'race');
    if (rain <= 0.05 && R.rain > 0.05) R.radio('비가 그쳤어요', 'race');
    R.rain = rain;
    var kWet = 1 / Math.max(50, 0.05 * R.raceTime), kDry = 1 / Math.max(120, 0.16 * R.raceTime);
    RP().wet = clamp(RP().wet + (rain > 0.05 ? rain * kWet * (rain - RP().wet + 0.25) : -kDry * 0.9) * dt, 0, 1);
    // lap 1 incident
    if (R.lap1Incident > 0 && race.clock > R.lap1Incident) {
      R.lap1Incident = -1;
      var back = R.cars.filter(function (o) { return !o.retired && o.grid > 8; });
      if (back.length) retire(back[Math.floor(Math.random() * back.length)], '1랩 접촉');
    }
    // caution periods
    if (R.scMode === 'vsc') {
      R.scTimer -= dt;
      if (R.scTimer < 10 && !R.scEnding) { R.scEnding = true; R.radio('VSC 종료 임박', 'race'); }
      if (R.scTimer <= 0) endCaution();
      if (!c.inPit && !race.player.retired) vscDelta(dt);
    }
    if (R.scMode === 'sc' || (R.scEnding && R.sc)) scChecks();
    // player: detection point, pit entry, Overtake Mode, blue flag
    var rel = Pit().relOf(race.player.dist);
    if (Math.abs(rel - pl.prevRel) < 100 && !race.player.finished) {
      if (pl.prevRel < -300 && rel >= -300) pl.otNext = detection({ isPlayer: true, lap: CR.Laps.history.length });
      if (pl.box && !c.inPit && !c.retired && pl.prevRel < -Pit().ENTRY && rel >= -Pit().ENTRY) playerPitIn();
      // driving into the pit entry without a request: box anyway
      else if (!c.inPit && !c.retired && rel > -Pit().ENTRY && rel < -Pit().ENTRY + Pit().RAMP_IN && race.player.offset * Pit().side > CR.Config.TRACK_WIDTH / 2 + 1.5) playerPitIn();
    }
    pl.prevRel = rel;
    // old incidents: wrecks cleared after the caution
    if (!R.scMode) R.cars.forEach(function (o) {
      if (o.retired && !o.cleared && race.clock - o.rt.retiredAt > 50) {
        o.cleared = true;
        var k = race.ai.indexOf(o);
        if (k >= 0) race.ai.splice(k, 1);
      }
    });
  };

  function playerPitIn() {
    var pl = R.pl, tyre = pl.nextTyre;
    var stop = Pit().stopTime();
    Pit().enterPlayer({
      box: Pit().boxRel('you'), stopTime: stop + pl.pen, tyre: tyre, serve: pl.pen,
      onService: function () {
        RP().fitTyres(tyre, 0.55);
        pl.stops++;
        pl.penServed += pl.pen; pl.pen = 0;
        pl.wearWarn = 0;
        if (pl.plan.length) pl.plan.shift();
        pl.nextTyre = pl.plan.length ? pl.plan[0].tyre : R.tyreFor(Math.max(1, R.laps - pl.lapsDone - 1));
      },
    });
    pl.box = false;
    pl.lastStop = { time: stop, tyre: tyre, pen: pl.pen };
    R.radio('피트 리미터 ON — 박스로', 'eng');
  }

  // Physical car ahead (for SC trains), blue flags, Overtake Mode chasing.
  function relations() {
    var list = allRunning();
    if (R.sc) list.push(R.sc);
    var L = ctx().L;
    R.cars.forEach(function (car) {
      var rt = car.rt;
      rt.ahead = null; rt.gapAhead = Infinity; rt.blue = false;
      if (car.retired || rt.pit) return;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o === car) continue;
        var g = wrapGap(o.dist - car.dist);
        if (g > 0 && g < rt.gapAhead) { rt.gapAhead = g; rt.ahead = o; }
        // a car up to 70 m behind that is a lap or more ahead in the race: give way
        if (g < 0 && g > -70 && !o.sc && o.dist - car.dist > L * 0.5) { rt.blue = true; rt.blueSide = o.offset > car.offset ? -1 : 1; }
      }
      rt.chase = rt.ahead && !rt.ahead.sc && rt.gapAhead / Math.max(20, car.v) < 1.0;
    });
    // player blue flag
    var p = CR.Race.player;
    R.pl.blue = false;
    R.cars.forEach(function (o) {
      if (o.retired || o.rt.pit) return;
      var g = wrapGap(o.dist - p.dist);
      if (g < 0 && g > -90 && o.dist - p.dist > L * 0.5) R.pl.blue = true;
    });
    R.leader = R.order()[0];
  }

  // VSC: keep the delta (slower than 60 % of the reference pace at every point).
  function vscDelta(dt) {
    var pl = R.pl, c = CR.Car.state, x = ctx();
    var vref = x.profile[c.nearestSampleIndex] * 0.6 / level().factor;
    pl.vscDelta += dt - c.speed * dt / Math.max(5, vref);
    if (pl.vscDelta < -0.3 && !pl.vscWarned) { pl.vscWarned = true; R.radio('VSC 델타 위반 — 속도 줄여!', 'race'); }
    if (pl.vscDelta < -1.2 && !pl.vscPenalised) { pl.vscPenalised = true; penalise(5, 'VSC 델타'); }
  }
  // Safety car: no overtaking; SC laps counted on the leader.
  function scChecks() {
    var p = CR.Race.player, pl = R.pl, c = CR.Car.state;
    if (!c.inPit && !p.retired) {
      R.cars.forEach(function (o) {
        if (o.retired || o.rt.pit) { delete pl.scPrev[o.driver.id]; return; }
        var g = wrapGap(o.dist - p.dist), prev = pl.scPrev[o.driver.id];
        if (prev !== undefined && prev > 0 && prev < 120 && g < 0 && g > -120) penalise(5, '세이프티카 중 추월');
        pl.scPrev[o.driver.id] = g;
      });
    }
  }
  // Leader crossed the line under the safety car.
  R.leaderLine = function () {
    if (R.scMode === 'sc') {
      R.scLaps--;
      if (R.scLaps === 1) R.radio('세이프티카 이번 랩 피트인', 'race');
      if (R.scLaps <= 1 && !R.scEnding) R.scEnding = true;
    }
    if (R.scEnding && !R.sc && R.scMode === 'sc') endCaution();
  };
  var _onAILap = R.onAILap;
  R.onAILap = function (car) {
    _onAILap(car);
    if (!car.sc && R.order()[0] === car) R.leaderLine();
  };
  var _onPlayerLap = R.onPlayerLap;
  R.onPlayerLap = function (lap) {
    _onPlayerLap(lap);
    if (R.order()[0] === CR.Race.player) R.leaderLine();
  };

  // --- Classification ----------------------------------------------------------

  function lapsOf(o) { return o.isPlayer ? CR.Laps.history.length : o.lap; }
  R.order = function () {
    var all = [CR.Race.player].concat(R.cars);
    var L = ctx().L;
    function prog(o) { return o.finished ? lapsOf(o) * L : o.dist; }
    return all.sort(function (a, b) {
      var ra = !!a.retired, rb = !!b.retired;
      if (ra !== rb) return ra ? 1 : -1;
      if (ra && rb) return b.dist - a.dist;
      if (a.finished && b.finished) return lapsOf(b) - lapsOf(a) || a.finishTime - b.finishTime;
      return prog(b) - prog(a);
    });
  };

  R.classify = function (playerRetired) {
    var race = CR.Race, L = ctx().L, N = R.laps;
    var pBest = R.pl.best;
    var entries = [];
    function entry(o) {
      var d = o.isPlayer ? RD().PLAYER : o.driver, rt = o.rt || {};
      var team = RD().team(d.team);
      var laps, time = null, dnf = !!o.retired, avg;
      if (o.isPlayer) {
        laps = CR.Laps.history.length;
        if (!playerRetired) time = race.player.finishTime;
      } else if (o.finished) { laps = o.lap; time = o.finishTime; }
      else if (!dnf) {
        avg = R.idealLap * o.pace * (rt.mul || 1);
        time = race.clock + Math.max(0, N * L - o.dist) / (L / avg);
        laps = N;
      } else laps = o.lap;
      var pen = o.isPlayer ? R.pl.pen : rt.pen || 0;
      if (time !== null && laps < N) time += (N - laps) * (time / Math.max(1, laps));
      return {
        id: d.id, code: d.code, name: d.name, team: d.team, teamName: team.name,
        color: o.isPlayer ? CR.Cars.byId('f1').color : d.main, model: o.isPlayer ? CR.Cars.byId('f1').model : o.model,
        time: time === null ? null : time + pen, rawLaps: laps, best: o.isPlayer ? pBest : o.best, isPlayer: !!o.isPlayer,
        dnf: dnf || (o.isPlayer && playerRetired), retired: o.isPlayer && playerRetired, why: rt.why || (o.isPlayer && playerRetired ? '리타이어' : null),
        stops: o.isPlayer ? R.pl.stops : rt.stops, pen: pen + (o.isPlayer ? R.pl.penServed : rt.penServed || 0), grid: o.grid,
      };
    }
    entries.push(entry(race.player));
    R.cars.forEach(function (o) { entries.push(entry(o)); });
    var fin = entries.filter(function (e) { return !e.dnf; }).sort(function (a, b) { return a.time - b.time; });
    var out = entries.filter(function (e) { return e.dnf; }).sort(function (a, b) { return b.rawLaps - a.rawLaps; });
    var lead = fin[0];
    var leadLap = lead ? lead.time / N : 90;
    fin.forEach(function (e) {
      var down = lead ? Math.floor((e.time - lead.time) / leadLap) : 0;
      e.lapsDown = Math.max(0, down);
      e.gap = e === lead ? null : e.time - lead.time;
    });
    var all = fin.concat(out);
    all.forEach(function (e, i) { e.pos = i + 1; e.points = !e.dnf ? RD().POINTS[i] || 0 : 0; });
    var me = all.filter(function (e) { return e.isPlayer; })[0];
    return {
      real: true, track: R.trackName, trackName: CR.Tracks.list[R.trackIndex].name, laps: N, length: R.settings.length,
      entries: all, playerPos: me.pos, retired: !!playerRetired, fastest: R.fastest, weather: R.weather.mode,
      round: R.nextRound() + 1,
    };
  };

  R.onEnd = function () {
    R.on = false;
    R.phase = 'idle';
    R.cars = [];
    R.sc = null;
    R.scMode = null;
    var c = CR.Car.state;
    c.inPit = false;
    Pit().player = null;
    RP().off();
    RP().st.boost = false;
  };
  // Leaving qualifying (menu) without a race.
  R.abandon = function () {
    R.on = false;
    R.phase = 'idle';
    R.q = null;
    RP().off();
  };

  // --- Season -----------------------------------------------------------------

  // Standings of a season record: drivers [{id, points, wins, best}] and teams.
  R.standings = function (season) {
    var drivers = {}, teams = {};
    RD().DRIVERS.concat([RD().PLAYER]).forEach(function (d) {
      drivers[d.id] = { id: d.id, points: 0, wins: 0, podiums: 0, best: 99 };
      if (!teams[d.team]) teams[d.team] = { id: d.team, points: 0, wins: 0, best: 99 };
    });
    (season.races || []).forEach(function (race) {
      race.entries.forEach(function (e) {
        var s = drivers[e.id];
        if (!s) return;
        var d = RD().driver(e.id), t = teams[d ? d.team : 'you'];
        s.points += e.points; t.points += e.points;
        if (e.pos === 1 && !e.dnf) { s.wins++; t.wins++; }
        if (e.pos <= 3 && !e.dnf) s.podiums++;
        s.best = Math.min(s.best, e.dnf ? 99 : e.pos); t.best = Math.min(t.best, e.dnf ? 99 : e.pos);
      });
    });
    function cmp(a, b) { return b.points - a.points || b.wins - a.wins || a.best - b.best; }
    return {
      drivers: Object.keys(drivers).map(function (k) { return drivers[k]; }).sort(cmp),
      teams: Object.keys(teams).map(function (k) { return teams[k]; }).sort(cmp),
    };
  };

  // Prize money for a result (added by Garage.recordReal).
  R.prize = function (res) {
    var L = ctx().L || 5000, me = res.entries.filter(function (e) { return e.isPlayer; })[0];
    var base = CR.Garage.lapPay(R.idealLap * 1.05, L, CR.Cars.byId('f1')) * res.laps * 0.6;
    return Math.round(res.retired ? base * 0.25 : base * (1 + me.points / 12) * (1 + (20 - me.pos) * 0.02));
  };

  CR.Real = R;
})();

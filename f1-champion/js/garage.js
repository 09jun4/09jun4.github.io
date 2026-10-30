// garage.js — money, owned cars and the selected car.
// Saved two ways: in this browser (localStorage, instant) and in the
// viewer's Claude account (artifact db, private doc data/users/<id>/save),
// so progress follows the account to any device. On open the newer of the
// two (savedAt) wins; account writes are debounced and one at a time.
// Load order: after cars.js. Depends on: Cars.
//
// Every completed lap pays more the FASTER it is, like a real race (2026-10-05;
// it used to pay per second, so slow laps paid more). A lap at the reference
// pace (average REF_SPEED over the lap) pays the car's moneyPerSecond x the
// reference time; the pay scales with (reference time / lap time)^2, so
// a 10 % quicker lap pays ~23 % more. Lap time includes track-limit
// penalties, so cutting the track costs money. Doubled for a new best lap. Money buys cars in the shop (cars.js); the starter
// car (price 0) is always owned.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var STORAGE_KEY = 'circuit-racer-copy.shop';

  var Garage = {
    BEST_LAP_MULTIPLIER: 2,
    REF_SPEED: 50, // m/s (180 km/h) average lap speed that pays the base rate
    SPEED_EXPONENT: 2,
    money: 0,
    owned: {}, // id -> true
    selected: '',
    track: 'random', // chosen circuit (CR.Tracks realName) or 'random'
    tune: {}, // car id -> {part key -> level} (tuning.js)
    f1Laps: 0, // laps completed in the F1 (5 unlock AI 대전)
    practice: {}, // track id -> {time, car, at}: all-time practice best lap
    raceDifficulty: 'normal',
    season: { num: 1, races: [] }, // current season (race.js results, compact)
    seasons: [], // finished seasons, oldest first
  };

  var cloud = { doc: null, timer: 0, writing: false, again: false };
  Garage.savedAt = 0;
  Garage.cloudStatus = 'local'; // 'local' | 'loading' | 'synced' | 'saving' | 'error'
  Garage.onCloudChange = null; // set by menu.js: redraw after an account load

  function snapshot() {
    return { money: Garage.money, owned: Garage.owned, selected: Garage.selected, track: Garage.track, tune: Garage.tune,
      f1Laps: Garage.f1Laps, practice: Garage.practice, raceDifficulty: Garage.raceDifficulty,
      season: Garage.season, seasons: Garage.seasons, savedAt: Garage.savedAt };
  }

  function setStatus(st) {
    Garage.cloudStatus = st;
    if (Garage.onStatus) Garage.onStatus(st);
  }

  function writeCloud() {
    if (!cloud.doc) return;
    if (cloud.writing) { cloud.again = true; return; }
    cloud.writing = true;
    setStatus('saving');
    cloud.doc.set(snapshot()).then(function () {
      setStatus('synced');
    }, function () {
      setStatus('error');
    }).then(function () {
      cloud.writing = false;
      if (cloud.again) { cloud.again = false; writeCloud(); }
    });
  }

  function save() {
    Garage.savedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    } catch (e) { /* storage unavailable: progress lasts for this visit */ }
    if (cloud.doc) {
      clearTimeout(cloud.timer);
      cloud.timer = setTimeout(writeCloud, 1200);
    }
  }

  // Flush a pending account save when the tab is hidden or closed.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && cloud.doc && cloud.timer) {
      clearTimeout(cloud.timer);
      cloud.timer = 0;
      writeCloud();
    }
  });

  function known(id) {
    return CR.Cars.list.some(function (c) { return c.id === id; });
  }

  // Applies saved data (from either store) over the current state.
  function apply(data) {
    var starter = CR.Cars.list[0].id;
    Garage.money = 0;
    Garage.owned = {};
    Garage.selected = starter;
    Garage.savedAt = 0;
    Garage.track = 'random';
    Garage.tune = {};
    Garage.f1Laps = 0;
    Garage.practice = {};
    Garage.raceDifficulty = 'normal';
    Garage.season = { num: 1, races: [] };
    Garage.seasons = [];
    if (data) {
      Garage.f1Laps = Math.max(0, Math.floor(Number(data.f1Laps)) || 0);
      if (data.practice && typeof data.practice === 'object') {
        for (var tid in data.practice) {
          var rec = data.practice[tid];
          if (rec && Number(rec.time) > 0) Garage.practice[tid] = { time: Number(rec.time), car: String(rec.car || ''), at: Number(rec.at) || 0 };
        }
      }
      if (typeof data.raceDifficulty === 'string') Garage.raceDifficulty = data.raceDifficulty;
      if (data.season && Array.isArray(data.season.races)) {
        Garage.season = { num: Math.max(1, Math.floor(Number(data.season.num)) || 1), races: data.season.races.slice(0, 5) };
      }
      if (Array.isArray(data.seasons)) Garage.seasons = data.seasons.filter(function (x) { return x && Array.isArray(x.races); });
      Garage.money = Math.max(0, Math.floor(data.money) || 0);
      // Only cars that still exist in the shop.
      for (var id in data.owned) if (data.owned[id] && known(id)) Garage.owned[id] = true;
      if (data.selected && known(data.selected)) Garage.selected = data.selected;
      // Checked against CR.Tracks at Play (tracks.js loads after this file).
      if (typeof data.track === 'string' && data.track) Garage.track = data.track;
      // Tuning levels: whole numbers 0..5 for cars that still exist.
      if (data.tune && typeof data.tune === 'object') {
        for (var cid in data.tune) {
          if (!known(cid) || !data.tune[cid]) continue;
          var parts = {};
          for (var pk in data.tune[cid]) {
            var lv = Math.floor(Number(data.tune[cid][pk]));
            if (lv > 0) parts[pk] = Math.min(5, lv);
          }
          Garage.tune[cid] = parts;
        }
      }
      Garage.savedAt = Number(data.savedAt) || 0;
    }
    Garage.owned[starter] = true;
    if (!Garage.owned[Garage.selected]) Garage.selected = starter;
  }

  Garage.load = function () {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* storage unavailable or corrupt */ }
    apply(data);
  };

  // Connects to the viewer's Claude account save. Without an account
  // (signed out, or no write access) the browser save keeps working.
  function connectCloud() {
    if (!window.claude || !window.claude.use) {
      // The viewer may inject the bridge after this script: try once more.
      if (!connectCloud.retried) {
        connectCloud.retried = true;
        window.addEventListener('load', connectCloud);
      }
      return;
    }
    if (cloud.started) return;
    cloud.started = true;
    setStatus('loading');
    Promise.all([window.claude.use('user'), window.claude.use('db')]).then(function (r) {
      var user = r[0], db = r[1];
      if (!user || !db) { setStatus('local'); return null; }
      return user.id().then(function (uid) {
        if (!uid) { setStatus('local'); return null; }
        var doc = db.doc('data/users/' + uid + '/save');
        return doc.get().then(function (snap) {
          cloud.doc = doc;
          var remote = snap.exists ? snap.data() : null;
          if (remote && (Number(remote.savedAt) || 0) >= Garage.savedAt) {
            apply(remote);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); } catch (e) { /* ignore */ }
            setStatus('synced');
            if (Garage.onCloudChange) Garage.onCloudChange();
          } else {
            // Nothing in the account yet, or this browser is newer: upload.
            if (!Garage.savedAt) Garage.savedAt = Date.now();
            writeCloud();
          }
        });
      });
    }).catch(function () { setStatus('error'); });
  }

  // Index of a circuit in CR.Tracks.list by its id (realName), or -1.
  Garage.trackIndex = function (id) {
    var list = (CR.Tracks && CR.Tracks.list) || [];
    for (var i = 0; i < list.length; i++) if (list[i].realName === id) return i;
    return -1;
  };

  Garage.selectTrack = function (id) {
    if (id !== 'random' && Garage.trackIndex(id) < 0) return false;
    Garage.track = id;
    save();
    return true;
  };

  Garage.car = function () {
    return CR.Cars.byId(Garage.selected);
  };

  Garage.isOwned = function (id) {
    return !!Garage.owned[id];
  };

  Garage.canBuy = function (id) {
    return !Garage.isOwned(id) && Garage.money >= CR.Cars.byId(id).price;
  };

  // Buys and switches to the car.
  Garage.buy = function (id) {
    if (!Garage.canBuy(id)) return false;
    Garage.money -= CR.Cars.byId(id).price;
    Garage.owned[id] = true;
    Garage.selected = id;
    save();
    return true;
  };

  // Sets a tuning level and pays for it (tuning.js checks the rules).
  Garage.setTune = function (carId, key, level, cost) {
    if (Garage.money < cost) return false;
    Garage.money -= cost;
    Garage.tune[carId] = Garage.tune[carId] || {};
    Garage.tune[carId][key] = level;
    save();
    return true;
  };

  Garage.select = function (id) {
    if (!Garage.isOwned(id)) return false;
    Garage.selected = id;
    save();
    return true;
  };

  // Money for a completed lap of `lapMeters` that took `lapSeconds`
  // (penalties included): faster laps pay more. x BEST_LAP_MULTIPLIER for a
  // new best lap. Adds it and returns it.
  Garage.lapPay = function (lapSeconds, lapMeters, car) {
    var rate = (car || Garage.car()).moneyPerSecond;
    var ref = lapMeters / Garage.REF_SPEED; // s, reference lap time
    return Math.round(rate * ref * Math.pow(ref / Math.max(1, lapSeconds), Garage.SPEED_EXPONENT));
  };

  Garage.payLap = function (lapSeconds, lapMeters, isBest) {
    var amount = Garage.lapPay(lapSeconds, lapMeters) * (isBest ? Garage.BEST_LAP_MULTIPLIER : 1);
    Garage.money += amount;
    save();
    return amount;
  };

  // --- Records (practice bests, F1 laps, AI 대전 seasons) -------------------

  // A completed lap: counts F1 laps; in practice also the track's all-time
  // best. Returns {unlocked: true} the moment AI 대전 unlocks, {record:
  // true} on a new practice record.
  Garage.recordLap = function (carId, trackId, lapSeconds, practice) {
    var out = {};
    if (carId === 'f1') {
      Garage.f1Laps++;
      if (CR.Race && Garage.f1Laps === CR.Race.UNLOCK_F1_LAPS) out.unlocked = true;
    }
    if (practice && trackId) {
      var cur = Garage.practice[trackId];
      if (!cur || lapSeconds < cur.time) {
        Garage.practice[trackId] = { time: lapSeconds, car: carId, at: Date.now() };
        out.record = true;
      }
    }
    save();
    return out;
  };

  // AI 대전 circuits still unraced this season (indexes into CR.Tracks.list).
  // A season never repeats a circuit; if every circuit has been used (more
  // races than circuits) the pool starts over.
  Garage.seasonTrackPool = function () {
    var used = {};
    Garage.season.races.forEach(function (r) { used[r.track] = true; });
    var pool = [];
    CR.Tracks.list.forEach(function (t, i) { if (!used[t.realName]) pool.push(i); });
    if (!pool.length) CR.Tracks.list.forEach(function (t, i) { pool.push(i); });
    return pool;
  };

  Garage.setRaceDifficulty = function (id) {
    Garage.raceDifficulty = id;
    save();
  };

  // Season standings: [{id, points, wins, best}] sorted (points, then wins,
  // then best finish).
  Garage.standings = function (season) {
    var map = {};
    (season.races || []).forEach(function (race) {
      race.entries.forEach(function (e) {
        var s = map[e.id] || (map[e.id] = { id: e.id, points: 0, wins: 0, best: 99, results: [] });
        s.points += e.points;
        if (e.pos === 1) s.wins++;
        s.best = Math.min(s.best, e.pos);
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return b.points - a.points || b.wins - a.wins || a.best - b.best;
    });
  };

  // Stores a finished race (race.js results). Every RACES_PER_SEASON races
  // the season is archived. Returns {race, season, finishedSeason|null}.
  Garage.recordRace = function (results) {
    var race = {
      track: results.track, trackName: results.trackName, difficulty: results.difficulty,
      at: Date.now(), playerPos: results.playerPos, retired: !!results.retired,
      entries: results.entries.map(function (e) {
        return { id: e.id, pos: e.pos, points: e.points, time: e.time === null ? null : Math.round(e.time * 1000) / 1000,
          best: e.best === null ? null : Math.round(e.best * 1000) / 1000 };
      }),
    };
    Garage.season.races.push(race);
    var finished = null, season = Garage.season;
    if (season.races.length >= CR.Race.RACES_PER_SEASON) {
      var standings = Garage.standings(season);
      finished = {
        num: season.num, races: season.races, at: Date.now(),
        standings: standings.map(function (s) { return { id: s.id, points: s.points, wins: s.wins }; }),
        playerRank: standings.map(function (s) { return s.id; }).indexOf('you') + 1,
      };
      Garage.seasons.push(finished);
      Garage.season = { num: season.num + 1, races: [] };
    }
    save();
    return { race: race, season: season, finishedSeason: finished };
  };

  Garage.format = function (amount) {
    return '$' + Math.round(amount).toLocaleString('en-US');
  };

  Garage.load();
  CR.Garage = Garage;
  connectCloud();
})();

// hud.js — updates the fixed DOM HUD overlay from car state. Section 8.3.
// Load order: 7th. Depends on: Config, Car. Pure DOM writes, no canvas.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var Hud = {
    _lastKmh: null,
    _lastGear: null,
    _lastRpm: null,
  };

  var clamp = CR.clamp;

  Hud.cacheElements = function () {
    Hud.gearEl = document.getElementById('hud-gear');
    Hud.speedEl = document.getElementById('hud-speed-value');
    Hud.rpmValueEl = document.getElementById('hud-rpm-value');
    Hud.rpmBarFillEl = document.getElementById('hud-rpm-bar-fill');
    Hud.trackEl = document.getElementById('hud-track');
    Hud.helpTrackEl = document.getElementById('hud-help-track');
    Hud.lapNoEl = document.getElementById('lap-no');
    Hud.lapTimeEl = document.getElementById('lap-time');
    Hud.lapPenaltyEl = document.getElementById('lap-penalty');
    Hud.lapLastEl = document.getElementById('lap-last');
    Hud.lapBestEl = document.getElementById('lap-best');
    Hud.noticeEl = document.getElementById('hud-notice');
    Hud.lapHistoryEl = document.getElementById('lap-history');
    Hud.retiredEl = document.getElementById('retired');
    Hud.pauseEl = document.getElementById('pause');
    Hud.moneyEl = document.getElementById('hud-money');
    document.getElementById('pause-resume').addEventListener('click', function () { CR.Main.resume(); });
    document.getElementById('pause-menu').addEventListener('click', function () { CR.Main.toGarage(); });
    document.getElementById('pause-end').addEventListener('click', function () { CR.Main.endRace(); });
    document.getElementById('retired-btn').addEventListener('click', function () { CR.Main.restart(); });
  };

  Hud.update = function () {
    var c = CR.Car.state;

    var kmh = Math.round(c.speed * 3.6);
    if (kmh !== Hud._lastKmh) {
      Hud.speedEl.textContent = kmh;
      Hud._lastKmh = kmh;
    }

    var gearLabel = CR.Car.def && CR.Car.def.electric ? 'E' : String(c.gear); // single-speed electric
    if (gearLabel !== Hud._lastGear) {
      Hud.gearEl.textContent = gearLabel;
      Hud._lastGear = gearLabel;
    }

    var rpmRounded = Math.round(c.rpm);
    if (rpmRounded !== Hud._lastRpm) {
      Hud.rpmValueEl.textContent = rpmRounded;
      var frac = clamp(
        (c.rpm - CR.Config.IDLE_RPM) / (CR.Config.REDLINE_RPM - CR.Config.IDLE_RPM),
        0, 1
      );
      Hud.rpmBarFillEl.style.width = (frac * 100).toFixed(0) + '%';
      Hud.rpmBarFillEl.style.background = frac > 0.85 ? '#e74c3c' : frac > 0.6 ? '#f1c40f' : '#2ecc71';
      // Cosmetic-only: toggles the CSS pulse/glow defined in style.css when
      // near redline (>90% of IDLE..REDLINE range). Purely a HUD visual cue,
      // reads the same `frac` already computed above — no physics/logic.
      Hud.rpmBarFillEl.classList.toggle('is-redline', frac > 0.9);
      Hud._lastRpm = rpmRounded;
    }
  };

  // --- Lap timer --------------------------------------------------------

  var noticeTimer = null;
  function notice(text, kind) {
    Hud.noticeEl.textContent = text;
    Hud.noticeEl.className = 'is-visible ' + kind;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { Hud.noticeEl.className = ''; }, 2200);
  }

  // Short centre-screen message (race.js "GO!", unlocks, records).
  Hud.flash = function (text, kind) { notice(text, kind || 'is-best'); };
  Hud.raceNotice = function (text) { notice(text, 'is-go'); };

  Hud.updateLaps = function () {
    var L = CR.Laps;
    // Hundredths are enough on screen while the clock runs.
    var shown = L.format(L.current());
    shown = shown.slice(0, -1);
    if (shown !== Hud._lastLapText) {
      Hud.lapTimeEl.textContent = shown;
      Hud._lastLapText = shown;
    }
    if (L.lap !== Hud._lastLapNo) {
      Hud.lapNoEl.textContent = L.lap;
      Hud._lastLapNo = L.lap;
    }
    if (L.penalty !== Hud._lastPenalty) {
      Hud.lapPenaltyEl.hidden = L.penalty === 0;
      Hud.lapPenaltyEl.textContent = '페널티 +' + L.penalty + '초';
      Hud._lastPenalty = L.penalty;
    }
    if (L.last !== Hud._lastLast) {
      Hud.lapLastEl.textContent = L.format(L.last);
      Hud._lastLast = L.last;
    }
    if (L.best !== Hud._lastBest) {
      Hud.lapBestEl.textContent = L.format(L.best);
      Hud._lastBest = L.best;
      Hud._historyCount = -1;
    Hud._lastMoney = null; // re-mark the best lap
    }
    if (L.history.length !== Hud._historyCount) renderHistory(L);
    var bal = CR.Garage.formatBalance();
    if (bal !== Hud._lastMoney) {
      Hud.moneyEl.textContent = bal;
      Hud._lastMoney = bal;
    }

    for (var i = 0; i < L.events.length; i++) {
      var e = L.events[i];
      if (e.type === 'penalty') notice('트랙 이탈 · +' + e.value + '초 페널티', 'is-penalty');
      else if (e.type === 'lap' && e.best) notice('베스트 랩! ' + L.format(e.value) + ' · +' + CR.Garage.format(e.money) + ' (×' + CR.Garage.BEST_LAP_MULTIPLIER + ')', 'is-best');
      else if (e.type === 'lap') notice('랩 ' + L.format(e.value) + ' · +' + CR.Garage.format(e.money), 'is-lap');
    }
    L.events.length = 0;
  };

  // Every completed lap in order; newest at the bottom, best highlighted.
  var MAX_HISTORY_ROWS = 12;
  function renderHistory(L) {
    var el = Hud.lapHistoryEl;
    el.textContent = '';
    var start = Math.max(0, L.history.length - MAX_HISTORY_ROWS);
    for (var i = start; i < L.history.length; i++) {
      var h = L.history[i];
      var li = document.createElement('li');
      if (L.best !== null && h.time === L.best) li.className = 'is-best';
      var no = document.createElement('span');
      no.className = 'lh-no';
      no.textContent = 'L' + (i + 1);
      var tm = document.createElement('span');
      tm.className = 'lh-time';
      tm.textContent = L.format(h.time);
      li.appendChild(no);
      li.appendChild(tm);
      if (h.penalty > 0) {
        var pen = document.createElement('span');
        pen.className = 'lh-pen';
        pen.textContent = '+' + h.penalty;
        li.appendChild(pen);
      }
      el.appendChild(li);
    }
    el.hidden = L.history.length === 0;
    Hud._historyCount = L.history.length;
  }

  // Money earned: pop the counter in the lap panel.
  Hud.moneyPop = function () {
    Hud.moneyEl.classList.remove('is-pop');
    void Hud.moneyEl.offsetWidth; // restart the CSS animation
    Hud.moneyEl.classList.add('is-pop');
  };

  Hud.showPause = function () {
    // In AI 대전 the shop is closed until the race ends: resume or forfeit.
    var racing = CR.Race && CR.Race.active;
    document.getElementById('pause-menu').hidden = racing;
    document.getElementById('pause-end').textContent = racing ? '기권하기 (최하위 처리)' : '레이스 종료하기';
    Hud.pauseEl.hidden = false;
    document.getElementById('pause-resume').focus();
  };
  Hud.hidePause = function () {
    Hud.pauseEl.hidden = true;
  };

  Hud.showRetired = function () {
    Hud.retiredEl.hidden = false;
  };
  Hud.hideRetired = function () {
    Hud.retiredEl.hidden = true;
    Hud.noticeEl.className = '';
  };

  // Race start: banner with the randomly picked track for a few seconds,
  // plus a persistent line in the controls panel.
  var bannerTimer = null;
  Hud.showTrack = function (number, total, trackName, carName) {
    Hud.trackEl.textContent = '';
    Hud.trackEl.appendChild(document.createTextNode('트랙 ' + number + '/' + total + ' · ' + trackName));
    var sub = document.createElement('small');
    sub.textContent = carName;
    Hud.trackEl.appendChild(sub);
    Hud.helpTrackEl.textContent = trackName + ' · ' + carName;
    Hud.trackEl.classList.add('is-visible');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { Hud.trackEl.classList.remove('is-visible'); }, 3000);
    Hud._lastKmh = Hud._lastGear = Hud._lastRpm = null;
    Hud._lastLapText = Hud._lastLapNo = Hud._lastPenalty = Hud._lastLast = Hud._lastBest = undefined;
    Hud._historyCount = -1;

  };

  CR.Hud = Hud;
})();

// real-damage.js — 리얼리스틱 car damage and the incident rules.
//
// Below the explosion threshold (Config.EXPLODE_IMPACT_SPEED) an impact
// damages the part that took it, by how hard it was:
//  - nose / front wing: endplate bent -> wing broken and hanging -> wing torn off
//  - front corner: front wing corner, then a broken front suspension (the
//    wheel leans in, the car pulls to that side, less grip)
//  - rear: rear wing damaged / torn off; rear corner: broken rear suspension
//  - sausage kerb at speed: floor / front wing damage now and then
// Damage costs downforce, grip and top speed, and the team calls the car in
// ("Box, box, box") for a new nose (+8.5 s) or repairs (rear wing +10 s,
// suspension +25 s each, real-race.js adds them to the stop).
// Rules (2026 FIA Sporting Regulations / stewards' guidelines):
//  - causing a collision (running into a car ahead): 5 s, 10 s if that car
//    is out of the race; served at the next stop or added to the race time;
//  - a dangerous car (hanging wing / broken suspension) gets the black and
//    orange flag: pit at the end of the lap. Ignoring it for two lines =
//    drive-through, converted to 20 s.
// Only while a realistic session runs (Real.on); 연습 / AI 대전 unchanged.
// Load order: after real-race.js. Depends on: Config, Car, Race, Real, RealData.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var D = {
    st: { fw: 0, rw: 0, fl: false, fr: false, rl: false, rr: false, floor: 0 },
    meatball: null, // {lap} while the black-and-orange flag is out for the player
    version: 0, // bumps on every change (renderers rebuild the damaged look)
  };

  function active() { return CR.Config.REAL && CR.Real && CR.Real.on; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  D.reset = function () {
    var s = D.st;
    s.fw = 0; s.rw = 0; s.fl = s.fr = s.rl = s.rr = false; s.floor = 0;
    D.meatball = null;
    D.version++;
  };
  D.any = function () { var s = D.st; return s.fw > 0.05 || s.rw > 0.05 || s.fl || s.fr || s.rl || s.rr || s.floor > 0.05; };
  D.dangerous = function () { var s = D.st; return (s.fw >= 0.55 && s.fw < 1) || s.fl || s.fr || s.rl || s.rr || (s.rw >= 0.55 && s.rw < 1); };

  // Effects on the car (real-physics.js).
  D.effects = function () {
    var s = D.st, e = { grip: 1, cla: 1, cda: 1, pull: 0 };
    if (!active()) return e;
    var fwLoss = s.fw >= 1 ? 0.28 : s.fw * 0.22;
    e.cla *= 1 - fwLoss - (s.rw >= 1 ? 0.3 : s.rw * 0.2) - s.floor * 0.12;
    e.cda *= 1 + (s.fw > 0.3 && s.fw < 1 ? 0.08 : 0) + (s.rw > 0.3 && s.rw < 1 ? 0.06 : 0) - (s.rw >= 1 ? 0.15 : 0);
    e.grip *= 1 - fwLoss * 0.35 - (s.fl || s.fr ? 0.18 : 0) - (s.rl || s.rr ? 0.14 : 0);
    e.pull = (s.fl ? 0.05 : 0) - (s.fr ? 0.05 : 0) + (s.rl ? 0.025 : 0) - (s.rr ? 0.025 : 0); // rad/s towards the broken side
    return e;
  };

  D.repairTime = function () {
    var s = D.st, t = 0;
    if (s.fw > 0.25) t += 8.5;
    if (s.rw > 0.3) t += 10;
    ['fl', 'fr', 'rl', 'rr'].forEach(function (k) { if (s[k]) t += 25; });
    if (s.floor > 0.4) t += 6;
    return t;
  };
  D.repairText = function () {
    var s = D.st, list = [];
    if (s.fw > 0.25) list.push('노즈 교체');
    if (s.rw > 0.3) list.push('리어윙 교체');
    if (s.fl || s.fr || s.rl || s.rr) list.push('서스펜션 수리');
    if (s.floor > 0.4) list.push('플로어 수리');
    return list.join(' · ');
  };

  var lastHit = 0;
  // Car events (main.js): bumps (walls, cars) and sausage kerbs.
  D.onEvent = function (ev) {
    if (!active() || CR.Car.state.exploded || CR.Car.state.inPit) return;
    var now = performance.now();
    if (ev.type === 'sausage') {
      if (ev.impact > 45 && Math.random() < 0.3) hit('floor', clamp((ev.impact - 45) / 40, 0.15, 0.6), '소시지 연석');
      return;
    }
    if (ev.type !== 'bump' || ev.impact < 5 || now - lastHit < 250) return;
    lastHit = now;
    var c = CR.Car.state, h = c.heading;
    var nx = ev.nx || 0, ny = ev.ny || 0;
    var fwd = nx * Math.cos(h) + ny * Math.sin(h), left = -nx * Math.sin(h) + ny * Math.cos(h);
    var sev = clamp((ev.impact - 5) / (CR.Config.EXPLODE_IMPACT_SPEED - 5), 0, 1);
    var s = D.st;
    if (fwd > 0.55) {
      s.fw = Math.max(s.fw, sev < 0.3 ? s.fw + 0.25 : sev < 0.65 ? 0.6 : 1);
      if (sev > 0.75 && Math.random() < 0.5) s[left >= 0 ? 'fl' : 'fr'] = true;
    } else if (fwd < -0.55) {
      s.rw = Math.max(s.rw, sev < 0.35 ? s.rw + 0.3 : sev < 0.7 ? 0.6 : 1);
      if (sev > 0.8 && Math.random() < 0.5) s[left >= 0 ? 'rl' : 'rr'] = true;
    } else if (fwd > -0.15) {
      if (sev > 0.42) s[left >= 0 ? 'fl' : 'fr'] = true; else s.fw = Math.min(1, s.fw + 0.25);
    } else if (sev > 0.6) s[left >= 0 ? 'rl' : 'rr'] = true;
    s.fw = Math.min(1, s.fw); s.rw = Math.min(1, s.rw);
    changed(sev, ev);
    if (ev.other) collisionRules(ev, fwd, sev);
  };
  function hit(part, amount, why) {
    var s = D.st;
    s[part] = Math.min(1, s[part] + amount);
    changed(amount, { why: why });
  }

  var PART = { fw: '프런트윙', rw: '리어윙', fl: '왼쪽 앞 서스펜션', fr: '오른쪽 앞 서스펜션', rl: '왼쪽 뒤 서스펜션', rr: '오른쪽 뒤 서스펜션', floor: '플로어' };
  var prev = {};
  function changed(sev) {
    var s = D.st, R = CR.Real, msgs = [];
    Object.keys(PART).forEach(function (k) {
      var v = s[k], p = prev[k] || 0;
      if (typeof v === 'boolean' ? v && !p : v - p > 0.05) {
        msgs.push(PART[k] + (k === 'fw' || k === 'rw' ? (v >= 1 ? ' 떨어져 나감' : v >= 0.55 ? ' 파손' : ' 손상') : k === 'floor' ? ' 손상' : ' 파손'));
      }
      prev[k] = v;
    });
    if (!msgs.length) return;
    D.version++;
    if (CR.Gfx && CR.Gfx.shards) CR.Gfx.shards(CR.Car.state, 0.3 + sev);
    if (CR.Input && CR.Input.vibrate) CR.Input.vibrate([60, 40, 120]);
    R.radio(msgs.join(', ') + '!', 'race');
    if (R.phase === 'race') {
      if (D.dangerous() || s.fw >= 0.55 || s.rw >= 0.55) {
        if (R.boxCall) R.boxCall(null, '파손 — ' + D.repairText());
        if (D.dangerous() && !D.meatball) {
          D.meatball = { lap: CR.Laps.history.length };
          R.radio('흑색·주황 깃발(위험 차량) — 이번 랩 피트인 필수', 'race');
        }
      }
    }
  }

  // Causing a collision: the player drove into the car ahead.
  function collisionRules(ev, fwd, sev) {
    var R = CR.Real, o = ev.other;
    if (R.phase !== 'race' || !o || o.sc) return;
    var heavy = ev.impact > 13;
    if (o.rt && !o.retired) {
      if (heavy && R.retireCar) R.retireCar(o, '충돌 파손');
      else if (ev.impact > 7) { o.rt.repair = 8.5; o.rt.box = true; o.rt.form *= 1.015; }
    }
    if (fwd > 0.6 && ev.impact > 6 && R.penalty) R.penalty(heavy ? 10 : 5, '충돌 유발');
  }

  // Line crossing (real-race.js): black-and-orange flag ignored for two laps.
  D.onLap = function (lap) {
    if (D.meatball && !D.meatball.done && lap >= D.meatball.lap + 2) {
      D.meatball.done = true;
      if (CR.Real.penalty) CR.Real.penalty(20, '흑색·주황 깃발 무시 (드라이브스루 → 20초)');
    }
  };

  // Damaged look for the 2D renderer: parts torn off, broken corners displaced.
  var cache = { key: '', model: null };
  D.model2D = function (model) {
    if (!active() || !D.any()) return null;
    var s = D.st, key = D.version + '|' + (model && model.length);
    if (cache.key === key) return cache.model;
    var out = [];
    model.forEach(function (p) {
      var y = p.box ? p.box[1] : p.wheel ? p.wheel[1] : null, ztop = p.z ? p.z[1] : 0;
      if (p.box && s.fw >= 1 && y > 1.85 && ztop < 0.4) return; // front wing gone
      if (p.box && s.rw >= 1 && y < -1.9 && ztop > 0.6) return; // rear wing gone
      if (p.box && s.fw >= 0.55 && s.fw < 1 && y > 1.85 && ztop < 0.4) { out.push(Object.assign({}, p, { z: [Math.max(0, p.z[0] - 0.05), p.z[1] - 0.05] })); return; }
      if (p.wheel) {
        var front = !!p.front, lft = p.wheel[0] > 0;
        var broken = front ? (lft ? s.fl : s.fr) : (lft ? s.rl : s.rr);
        if (broken) { out.push(Object.assign({}, p, { wheel: [p.wheel[0] * 0.86, p.wheel[1] + (front ? -0.12 : 0.12), p.wheel[2], p.wheel[3] * 0.96] })); return; }
      }
      out.push(p);
    });
    out.opts = model.opts;
    cache.key = key; cache.model = out;
    return out;
  };

  CR.RealDmg = D;
})();

// hud.js — RallyHUD: rally dashboard + modern overlay. Every block has a
// data-hud key and can be hidden in RALLY SETTINGS > HUD.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var $ = function (id) { return document.getElementById(id); };

  function fmt(t, plus) {
    if (t == null || !isFinite(t)) return '--:--.---';
    var s = Math.max(0, t), m = Math.floor(s / 60), r = s - m * 60;
    return (plus ? '+' : '') + m + ':' + (r < 10 ? '0' : '') + r.toFixed(3);
  }
  function fmtDiff(d) { return (d < 0 ? '-' : '+') + Math.abs(d).toFixed(2) + 's'; }

  // Corner arrow: a road line bending by the corner's angle (grade 1 = sharp).
  var ANG = { 1: 140, 2: 110, 3: 85, 4: 62, 5: 42, 6: 24 };
  function arrow(n) {
    var ang = n.kind !== 'corner' ? 0 : n.hairpin ? 180 : ANG[n.grade] || 30, dir = n.kind === 'corner' ? n.dir : 0;
    var x = 22, y = 40, h = -Math.PI / 2, pts = [[x, y]], L = 30, steps = 16;
    var straight = 10;
    for (var i = 0; i < steps; i++) {
      var ds = L / steps;
      if (i * ds > straight - 1e-6) h += dir * (ang * Math.PI / 180) / ((L - straight) / ds);
      x += Math.cos(h) * ds * (dir && ang > 120 ? 0.75 : 1); y += Math.sin(h) * ds * (dir && ang > 120 ? 0.75 : 1);
      pts.push([x, y]);
    }
    var hx = Math.cos(h), hy = Math.sin(h), ex = x + hx * 4, ey = y + hy * 4;
    var head = [[ex, ey], [x - hy * 5, y + hx * 5], [x + hy * 5, y - hx * 5]];
    var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L');
    return '<svg viewBox="0 0 44 44" class="arrow"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<polygon points="' + head.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="currentColor"/></svg>';
  }
  var ICON = { obstacle: '▮', jump: '⤴', crest: '⌒', rockfall: '◆', mud: '≋', steepUp: '⇡', steepDown: '⇣', up: '↗', down: '↘' };
  function noteHTML(n, now) {
    var ico = n.kind === 'corner' ? arrow(n) : '<span class="ico">' + (ICON[n.kind] || '!') + '</span>';
    return '<div class="pn' + (now ? ' now' : '') + (n.kind !== 'corner' ? ' feat' : '') + '">' + ico + '<span>' + n.text + '</span></div>';
  }

  var H = { lastLine: '', lastNow: -1, fps: { t: 0, n: 0, val: 0, ms: 0 } };
  H.applyVisibility = function (hud) {
    document.querySelectorAll('[data-hud]').forEach(function (el) { el.hidden = !hud[el.getAttribute('data-hud')]; });
  };
  H.setup = function (stage, best) {
    H.lastLine = ''; H.lastNow = -1;
    var r = stage.route, ticks = '';
    r.checkpoints.forEach(function (s) { ticks += '<i style="left:' + ((s - r.startS) / (r.finishS - r.startS) * 100).toFixed(2) + '%"></i>'; });
    $('h-prog-ticks').innerHTML = ticks;
    $('h-splits').innerHTML = '';
    $('h-best').textContent = best && !stage.free ? 'PB ' + fmt(best.final) : '';
    $('h-mode').textContent = stage.free ? 'FREE DRIVE' : 'SPECIAL STAGE';
  };

  H.update = function (dt, stage, car, settings, extra) {
    var r = stage.route;
    // timer
    if (stage.free) { $('h-time').textContent = '자유 주행'; $('h-pen').textContent = ''; }
    else {
      $('h-time').textContent = fmt(stage.time);
      $('h-pen').textContent = stage.penalty > 0 ? '페널티 +' + stage.penalty.toFixed(0) + '초' : '';
    }
    // splits
    if (stage.splits.length !== H._splits) {
      H._splits = stage.splits.length;
      var best = extra.best, html = '';
      stage.splits.forEach(function (s, i) {
        var lab = s.finish ? 'FIN' : 'S' + (i + 1), d = best && best.splits && best.splits[i] != null ? fmtDiff(s.t - best.splits[i]) : '';
        html += '<div><b>' + lab + '</b> ' + fmt(s.t) + (d ? ' <em class="' + (d[0] === '-' ? 'good' : 'bad') + '">' + d + '</em>' : '') + '</div>';
      });
      $('h-splits').innerHTML = html;
    }
    // progress + distances
    var total = r.finishS - r.startS, done = Math.max(0, Math.min(total, stage.maxS - r.startS));
    $('h-prog-fill').style.width = (done / total * 100).toFixed(2) + '%';
    $('h-remain').textContent = ((total - done) / 1000).toFixed(2) + ' km 남음';
    var nc = stage.caller.nextCorner(car.s);
    if (nc) {
      $('h-next').innerHTML = arrow(nc) + '<b>' + nc.text.split(' · ')[0] + '</b>';
      $('h-next-dist').textContent = Math.max(0, Math.round(nc.s - car.s)) + ' m';
    } else { $('h-next').textContent = '결승'; $('h-next-dist').textContent = Math.max(0, Math.round(r.finishS - car.s)) + ' m'; }
    // pace notes
    var line = stage.caller.line, now = stage.caller.now, key = line.map(function (n) { return n.id; }).join(',') + '|' + (now ? now.id : -1);
    if (key !== H.lastLine) {
      H.lastLine = key;
      $('h-notes').innerHTML = line.length ? line.map(function (n) { return noteHTML(n, now && now.id === n.id); }).join('') : '';
    }
    // speed / rpm / gear
    $('h-speed').textContent = Math.round(car.speed * 3.6);
    $('h-gear').textContent = car.shiftT > 0 ? '·' : car.gear === -1 ? 'R' : car.gear === 0 ? 'N' : car.gear;
    var rpmF = Math.min(1, car.rpm / car.spec.limiter);
    $('h-rpm-fill').style.width = (rpmF * 100).toFixed(1) + '%';
    $('h-rpm').classList.toggle('shift', car.rpm > 7050);
    $('h-rpm-val').textContent = Math.round(car.rpm / 100) * 100;
    $('h-trans').textContent = car.setup.transmission === 'AUTOMATIC' ? 'AUTO' : car.setup.transmission === 'MANUAL' ? 'MAN' : 'SEQ';
    // assists
    $('a-abs').className = car.setup.abs ? (car.absActive ? 'on act' : 'on') : '';
    $('a-tcs').className = car.setup.tcs ? (car.tcsActive ? 'on act' : 'on') : '';
    $('a-esc').className = car.setup.esc ? (car.escActive ? 'on act' : 'on') : '';
    // brake bias
    var bb = Math.round(car.setup.brakeBias * 100);
    $('h-bias').textContent = 'BB ' + bb + ':' + (100 - bb);
    $('bias-front').textContent = bb + '%'; $('bias-rear').textContent = (100 - bb) + '%';
    $('bias-bar').style.width = bb + '%';
    // damage
    var dm = RL.Damage.summary(car);
    ['fl', 'fr', 'rl', 'rr'].forEach(function (k, i) {
      $('t-' + k).className = 'cell ' + RL.Damage.level(dm.tyres[i]); $('t-' + k).title = '타이어 ' + RL.Damage.label(dm.tyres[i]);
      $('s-' + k).className = 'cell ' + RL.Damage.level(dm.suspension[i]); $('s-' + k).title = '서스펜션 ' + RL.Damage.label(dm.suspension[i]);
    });
    $('e-bar').style.width = (dm.engine * 100).toFixed(0) + '%';
    $('e-bar').className = RL.Damage.level(dm.engine);
    $('e-val').textContent = RL.Damage.label(dm.engine);
    // messages / countdown
    if (stage.phase === 'countdown') { $('h-count').hidden = false; $('h-count').textContent = stage.count > 3 ? 'READY' : Math.ceil(stage.count); }
    else $('h-count').hidden = true;
    var msg = stage.messages[stage.messages.length - 1];
    $('h-msg').textContent = msg ? msg.text : ''; $('h-msg').className = msg ? 'show ' + msg.kind : '';
    $('h-surface').textContent = RL.Data.SURFACES[car.surface].name + (car.airborne ? ' · 공중' : '');
    // fps
    var F = H.fps; F.t += dt; F.n++; F.ms = F.ms * 0.9 + dt * 1000 * 0.1;
    if (F.t >= 0.5) { F.val = F.n / F.t; F.t = 0; F.n = 0; $('h-fps').textContent = Math.round(F.val) + ' FPS · ' + F.ms.toFixed(1) + ' ms · ' + (extra.calls || 0) + ' draws'; }
  };

  RL.HUD = H; RL.HUD.fmt = fmt; RL.HUD.fmtDiff = fmtDiff; RL.HUD.arrow = arrow;
})(typeof window !== 'undefined' ? window : globalThis);

// pacenotes.js — RallyPaceNotes: the co-driver.
// Notes are read straight from the generated route (route.corners and
// route.features): a corner generated as "right, grade 3" is called
// "우 3". Nothing here invents a corner.
// Calls come twice: an early call (the line of upcoming notes) and a
// reminder when the car gets close. Both distances grow with speed.
// Progress only ever moves forward (furthest point reached), so driving
// backwards or being recovered never repeats a call, and a jump forward
// still calls every note it passed over (none is skipped).
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};

  var DIR = { '-1': '좌', '1': '우' };
  var FEATURE_TEXT = {
    jump: '점프', crest: '크레스트', obstacle: '장애물', rockfall: '낙석 주의', mud: '주의 진흙',
    steepUp: '급경사 오르막', steepDown: '급경사 내리막', up: '오르막', down: '내리막',
  };
  // Order of importance when notes share a spot.
  var PRIORITY = { obstacle: 0.5, corner: 0, jump: 1, crest: 2, rockfall: 3, mud: 4, steepUp: 5, steepDown: 5, up: 6, down: 6 };

  function build(route) {
    var notes = [];
    route.corners.forEach(function (c) {
      if (c.s1 < route.startS || c.s0 > route.finishS) return;
      var n = { s: c.s0, end: c.s1, kind: 'corner', dir: c.dir, grade: c.grade, hairpin: c.hairpin, square: !!c.square, R: c.R, angle: c.angle };
      n.long = !c.hairpin && c.angle > 1.75;
      notes.push(n);
    });
    route.features.forEach(function (f) {
      if (!FEATURE_TEXT[f.type] || f.s0 < route.startS || f.s0 > route.finishS) return;
      notes.push({ s: f.type === 'jump' || f.type === 'crest' ? f.at - 20 : f.s0, end: f.s1, kind: f.type, side: f.side });
    });
    notes.sort(function (a, b) { return a.s - b.s || PRIORITY[a.kind] - PRIORITY[b.kind]; });
    // Links: a corner straight into the next ("이어서"), same direction
    // tightening / opening ("조여짐" / "풀림"), and the straight distance to
    // the next corner ("150").
    var corners = notes.filter(function (n) { return n.kind === 'corner'; });
    for (var i = 0; i < corners.length; i++) {
      var a = corners[i], b = corners[i + 1];
      if (!b) continue;
      var gap = b.s - a.end;
      if (gap < 22) {
        if (a.dir === b.dir && b.grade !== a.grade) a.link = b.grade < a.grade ? '조여짐' : '풀림';
        else a.link = '이어서';
      } else if (gap >= 110) a.dist = Math.min(500, Math.round(gap / 50) * 50);
    }
    notes.forEach(function (n, k) { n.id = k; n.text = text(n); });
    return notes;
  }

  function text(n) {
    if (n.kind === 'obstacle') return '장애물 ' + DIR[n.side] + ' → ' + DIR[-n.side];
    if (n.kind !== 'corner') return FEATURE_TEXT[n.kind];
    var t = n.hairpin ? '헤어핀 ' + DIR[n.dir] : n.square ? '직각 ' + DIR[n.dir] + ' ' + n.grade : DIR[n.dir] + ' ' + n.grade;
    if (n.long) t += ' 길게';
    if (n.link) t += ' ' + n.link;
    if (n.dist) t += ' · ' + n.dist;
    return t;
  }

  // Call distances (metres before the note) for the current speed.
  function earlyDist(v) { return Math.max(110, Math.min(270, 60 + v * 5.2)); }
  function lateDist(v) { return Math.max(35, Math.min(115, 12 + v * 2.4)); }

  function Caller(route) {
    this.notes = build(route);
    this.reset(route.startS - 30);
  }
  Caller.prototype.reset = function (s) {
    this.maxS = s; this.early = new Uint8Array(this.notes.length); this.late = new Uint8Array(this.notes.length);
    this.line = []; this.now = null; this.nowAt = -1e9; this.log = [];
  };
  // s: current progress along the road, v: speed (m/s), t: time (s)
  Caller.prototype.update = function (s, v, t) {
    if (s > this.maxS) this.maxS = s;
    var S = this.maxS, k = this.timing || 1, d1 = earlyDist(v) * k, d2 = lateDist(v) * k, N = this.notes, i, newLine = false;
    for (i = 0; i < N.length; i++) {
      var n = N[i];
      if (n.s - d1 > S) break;
      if (!this.early[i]) { this.early[i] = 1; newLine = true; this.log.push({ id: n.id, call: 'early', t: t }); }
      if (!this.late[i] && n.s - d2 <= S) {
        this.late[i] = 1; this.now = n; this.nowAt = t; this.log.push({ id: n.id, call: 'late', t: t });
      }
    }
    // The line on screen: the next notes not yet passed (max 3).
    if (newLine || !this.line.length || (this.line[0] && this.line[0].end < S)) {
      this.line = [];
      for (i = 0; i < N.length && this.line.length < 3; i++) if (this.early[i] && N[i].end >= S) this.line.push(N[i]);
    }
    if (this.now && this.now.end < S - 5) this.now = null;
  };
  // Next corner ahead of `s` (actual position, for the HUD distance).
  Caller.prototype.nextCorner = function (s) {
    for (var i = 0; i < this.notes.length; i++) { var n = this.notes[i]; if (n.kind === 'corner' && n.s > s) return n; }
    return null;
  };

  RL.PaceNotes = { build: build, text: text, Caller: Caller, earlyDist: earlyDist, lateDist: lateDist };
})(typeof window !== 'undefined' ? window : globalThis);

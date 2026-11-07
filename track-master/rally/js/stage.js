// stage.js — RallyStageController: the run itself.
// SPECIAL STAGE: stopped on the start line, 3-2-1 countdown, GO starts the
// clock; split times at the checkpoints; finish line; penalties; results.
// FREE DRIVE: no clock, no penalties, free recovery.
// Penalties (seconds, editable): off course, serious collision, rollover,
// manual recovery, stuck (cannot drive on). They are added to the time.
// Recovery puts the car back on the last valid road position (on the road,
// moving forward, wheels down), centred and stopped.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var P = RL.Physics, T = RL.Track;

  var REASONS = { offCourse: '코스 이탈', collision: '심각한 충돌', rollover: '차량 전복', recover: '수동 복구', stuck: '주행 불가' };

  function Stage(route, car, opts) {
    this.route = route; this.car = car; this.free = !!opts.free;
    this.pen = opts.penalties; this.messages = [];
    this.caller = new RL.PaceNotes.Caller(route);
    this.reset();
  }
  Stage.prototype.reset = function () {
    var r = this.route;
    P.place(this.car, r, r.startS - (this.free ? 0 : 3));
    this.car.wheels.forEach(function (w) { w.tyre = 1; w.susp = 1; });
    this.car.engineHealth = 1;
    this.phase = this.free ? 'running' : 'countdown';
    this.count = 3.6; this.time = 0; this.penalty = 0; this.penList = [];
    this.splits = []; this.nextCp = 0; this.top = 0; this.maxS = r.startS - 3;
    this.lastValid = { s: r.startS }; this.validT = 0;
    this.offT = 0; this.stuckT = 0; this.progS = r.startS - 3; this.progT = 0; this.flipT = 0; this.wrongT = 0; this.recoverCool = 0; this.collCool = 0;
    this.finishedAt = null; this.result = null;
    this.caller.reset(r.startS - 30);
    this.messages = [];
  };

  Stage.prototype.say = function (text, kind) { this.messages.push({ text: text, kind: kind || 'info', t: 0 }); };
  Stage.prototype.addPenalty = function (key) {
    if (this.free || this.phase !== 'running') return;
    var sec = +this.pen[key] || 0;
    this.penalty += sec; this.penList.push({ key: key, sec: sec, at: this.time });
    if (sec > 0) this.say(REASONS[key] + ' +' + sec + '초', 'penalty');
  };

  Stage.prototype.recover = function (reason) {
    var s = Math.max(this.route.startS - 2, Math.min(this.lastValid.s, this.maxS) - 4);
    P.place(this.car, this.route, s);
    this.car.gear = 1; this.offT = this.stuckT = this.wrongT = 0; this.recoverCool = 1.2;
    if (reason) this.addPenalty(reason);
    this.say(this.free ? '복구' : '복구 · ' + REASONS[reason || 'recover'], 'recover');
    RL.Input.reset();
  };

  // input: from RL.Input (already smoothed). Returns events for HUD/audio.
  Stage.prototype.update = function (dt, input) {
    var car = this.car, r = this.route, ev = [];
    this.messages.forEach(function (m) { m.t += dt; });
    this.messages = this.messages.filter(function (m) { return m.t < 2.6; });
    if (this.recoverCool > 0) this.recoverCool -= dt;
    if (this.collCool > 0) this.collCool -= dt;

    var drive = input;
    if (this.phase === 'countdown') {
      var before = Math.ceil(this.count);
      this.count -= dt;
      var now = Math.ceil(this.count);
      if (now !== before && now >= 1 && now <= 3) ev.push({ type: 'beep', n: now });
      // held on the line: brakes on, engine can rev
      drive = { throttle: input.throttle, brake: 1, handbrake: 0, steer: input.steer, hold: true };
      if (this.count <= 0) { this.phase = 'running'; ev.push({ type: 'go' }); this.say('GO!', 'go'); }
    } else if (this.phase === 'finished') {
      drive = { throttle: 0, brake: car.speed > 1 ? 0.6 : 1, handbrake: 0, steer: input.steer * 0.5, hold: true };
    }

    if (this.phase !== 'countdown' && input.edges.recover && this.recoverCool <= 0 && !car.flip) this.recover(this.free ? null : 'recover');

    P.update(car, drive, dt, r);
    if (this.phase === 'running') this.time += dt;
    this.top = Math.max(this.top, car.speed);
    var self = this;
    car.events.forEach(function (e) {
      ev.push(e);
      if (e.type === 'impact' && e.v > (e.kind === 'bale' ? 12 : 9) && self.collCool <= 0) { self.collCool = 2; self.addPenalty('collision'); }
    });

    // progress (furthest point) + pace notes
    if (car.s > this.maxS && car.s < this.maxS + 60) this.maxS = car.s;
    this.caller.update(car.s, car.speed, this.time);

    // last valid position: on the road, wheels down, moving forward
    var off = Math.abs(car.lat) - car.roadW / 2;
    var he = Math.atan2(Math.sin(car.yaw - r.h[car.idx]), Math.cos(car.yaw - r.h[car.idx]));
    if (off < 0.3 && !car.airborne && !car.flip && car.vLong > 2 && Math.abs(he) < 0.6) { this.validT += dt; if (this.validT > 0.4) this.lastValid = { s: car.s }; }
    else this.validT = 0;

    if (this.phase === 'running' || (this.free && this.phase !== 'countdown')) {
      // rollover: let the roll play, then put the car back
      if (car.flip) { if (car.flip.t > 2.2) this.recover('rollover'); }
      // off course: far from the road for a while
      else if (off > 14) { this.offT += dt; if (off > 26 || this.offT > (this.free ? 6 : 3)) this.recover(this.free ? null : 'offCourse'); }
      else this.offT = 0;
      // stuck: barely moving for a while (not at a deliberate standstill on the road)
      if (!car.flip && car.speed < 1.2 && (input.throttle > 0.3 || off > 1.5)) { this.stuckT += dt; if (this.stuckT > 6) this.recover(this.free ? null : 'stuck'); }
      else this.stuckT = 0;
      // rocking in place off the road (on a bank, in a ditch): no forward
      // progress for 8 s also counts as stuck
      if (car.s > this.progS + 3) { this.progS = car.s; this.progT = 0; }
      else if (!car.flip && off > 0.5) { this.progT += dt; if (this.progT > 8) { this.progT = 0; this.progS = car.s; this.recover(this.free ? null : 'stuck'); } }
      // wrong way warning
      if (car.vLong > 3 && Math.abs(he) > 2.2) { this.wrongT += dt; if (this.wrongT > 1.2 && this.wrongT - dt <= 1.2) this.say('역주행', 'warn'); }
      else this.wrongT = 0;
    }

    if (this.phase === 'running' && !this.free) {
      while (this.nextCp < r.checkpoints.length && this.maxS >= r.checkpoints[this.nextCp]) {
        this.splits.push({ t: this.time, pen: this.penalty });
        ev.push({ type: 'split', n: this.nextCp + 1, t: this.time });
        this.nextCp++;
      }
      if (this.maxS >= r.finishS) this.finish(ev);
    } else if (this.free && this.maxS >= r.finishS && !this.freeDone) { this.freeDone = true; this.say('결승선 통과 · 자유 주행 계속', 'info'); }
    return ev;
  };

  Stage.prototype.finish = function (ev) {
    this.phase = 'finished';
    var r = this.route, raw = this.time, fin = raw + this.penalty;
    this.splits.push({ t: raw, pen: this.penalty, finish: true });
    var byKey = {};
    this.penList.forEach(function (p) { byKey[p.key] = (byKey[p.key] || 0) + p.sec; });
    this.result = {
      seed: r.seed, length: r.lengthKey, finished: true, raw: raw, penalty: this.penalty, final: fin,
      penalties: byKey, splits: this.splits.map(function (s) { return Math.round(s.t * 1000) / 1000; }),
      topSpeed: this.top * 3.6, avgSpeed: (r.finishS - r.startS) / raw * 3.6,
      setup: Object.assign({}, this.car.setup),
    };
    ev.push({ type: 'finish' });
  };

  Stage.prototype.abandon = function () {
    if (this.free || this.phase === 'finished') return null;
    return { seed: this.route.seed, length: this.route.lengthKey, finished: false };
  };

  RL.Stage = { create: function (route, car, opts) { return new Stage(route, car, opts); }, REASONS: REASONS };
})(typeof window !== 'undefined' ? window : globalThis);

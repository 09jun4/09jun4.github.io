// pit-sound.js — synthesized pit stop sounds (Web Audio, no sound files), for
// the game (audio.js Audio.pit) and the pit stop viewer.
//  gun      pneumatic wheel gun: a hammer rattle (~45 blows/s) on a metal
//           resonance, the motor whine and the air hiss; `hard` = a stuck nut
//  off      wheel pulled off the hub: rubber thud + rim clack
//  on       new wheel slammed on: heavier thud + metal clank
//  drop     old wheel dumped on the ground: rubber bounce
//  jackUp   jack under the car, lever down: clunk + the chassis rising
//  jackDown jacks released: the car drops on its tyres
//  ratchet  hand ratchet / torque wrench clicks (repairs)
//  unlatch  nose / wing release catches
//  clack    a part seated on its mounts
// Pit.make(ctx, destination) -> { play(kind, gain 0..1, pan -1..1, dur s) }
// Load order: anywhere before audio.js. No dependencies.
(function () {
  'use strict';
  window.CR = window.CR || {};

  CR.PitSound = {
    make: function (ac, dest) {
      var noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      function out(gain, pan) {
        var g = ac.createGain();
        g.gain.value = gain;
        if (ac.createStereoPanner) { var p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p).connect(dest); }
        else g.connect(dest);
        return g;
      }
      function burst(o, t, len, type, f, q, level, decay) {
        var s = ac.createBufferSource(); s.buffer = noise;
        var b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 1;
        var g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || len));
        s.connect(b).connect(g).connect(o);
        s.start(t, Math.random() * 1.5, len + 0.05);
      }
      function tone(o, t, f0, f1, len, level, type) {
        var s = ac.createOscillator(); s.type = type || 'sine';
        s.frequency.setValueAtTime(f0, t); s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
        var g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        s.connect(g).connect(o); s.start(t); s.stop(t + len + 0.02);
      }
      function clank(o, t, level, base) {
        [1, 2.76, 5.4].forEach(function (k, i) { tone(o, t, base * k, base * k * 0.98, 0.18 - i * 0.04, level / (i + 1.5), 'sine'); });
      }

      var S = {
        gun: function (o, t, dur, hard) {
          dur = Math.max(0.12, dur || 0.3);
          var end = t + dur;
          // hammer rattle: band-passed noise gated by a fast pulse train
          var s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
          var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hard ? 2400 : 3100; bp.Q.value = 2.5;
          var gate = ac.createGain(); gate.gain.value = 0.5; // 0.5 +- 0.5: blows
          var lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = hard ? 36 : 46;
          var lg = ac.createGain(); lg.gain.value = 0.5;
          lfo.connect(lg).connect(gate.gain);
          var env = ac.createGain();
          env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
          env.gain.setValueAtTime(0.9, end - 0.03); env.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);
          s.connect(bp).connect(gate).connect(env).connect(o);
          // motor whine rising as the nut spins
          var m = ac.createOscillator(); m.type = 'sawtooth';
          m.frequency.setValueAtTime(hard ? 260 : 320, t); m.frequency.linearRampToValueAtTime(hard ? 300 : 520, end);
          var ml = ac.createBiquadFilter(); ml.type = 'lowpass'; ml.frequency.value = 1800;
          var mg = ac.createGain();
          mg.gain.setValueAtTime(0.0001, t); mg.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
          mg.gain.setValueAtTime(0.12, end - 0.03); mg.gain.exponentialRampToValueAtTime(0.0001, end + 0.03);
          m.connect(ml).connect(mg).connect(o);
          // air hiss trailing off
          burst(o, t, dur + 0.15, 'highpass', 5000, 0.7, 0.18, dur + 0.15);
          [s, lfo, m].forEach(function (n) { n.start(t); n.stop(end + 0.08); });
          clank(o, end, 0.22, 900); // the socket lets go
        },
        off: function (o, t) { tone(o, t, 110, 55, 0.16, 0.7); burst(o, t, 0.08, 'bandpass', 1300, 2, 0.35, 0.09); },
        on: function (o, t) { tone(o, t, 95, 45, 0.2, 0.95); burst(o, t, 0.06, 'lowpass', 900, 1, 0.5, 0.08); clank(o, t + 0.01, 0.35, 620); },
        drop: function (o, t) { tone(o, t, 80, 45, 0.18, 0.5); tone(o, t + 0.17, 75, 45, 0.1, 0.18); },
        jackUp: function (o, t) { clank(o, t, 0.3, 380); tone(o, t + 0.02, 70, 50, 0.22, 0.6); burst(o, t + 0.03, 0.18, 'lowpass', 700, 1, 0.25, 0.2); },
        jackDown: function (o, t) { burst(o, t, 0.05, 'bandpass', 2000, 3, 0.3, 0.05); tone(o, t + 0.05, 65, 38, 0.3, 1.0); burst(o, t + 0.06, 0.2, 'lowpass', 500, 1, 0.45, 0.25); },
        ratchet: function (o, t, dur) {
          dur = Math.max(0.2, dur || 0.6);
          var n = Math.floor(dur * 14);
          for (var k = 0; k < n; k++) burst(o, t + k / 14 + Math.random() * 0.01, 0.02, 'bandpass', 4200, 6, 0.25, 0.025);
        },
        unlatch: function (o, t) { clank(o, t, 0.25, 1100); clank(o, t + 0.09, 0.2, 1250); },
        clack: function (o, t) { tone(o, t, 140, 70, 0.12, 0.5); clank(o, t, 0.28, 520); },
      };
      return {
        play: function (kind, gain, pan, dur, hard) {
          var f = S[kind];
          if (!f || !(gain > 0.005)) return;
          f(out(Math.min(1, gain), pan), ac.currentTime + 0.01, dur, hard);
        },
      };
    },
  };
})();

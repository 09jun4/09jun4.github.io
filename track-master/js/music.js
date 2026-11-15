// music.js — Track Master menu theme:
//   "Glass Buildings" (liquid jungle / breakbeat drum and bass, loopable edit)
//   by musinova, Pixabay (Pixabay Content License). 174 BPM, 72 bars.
// The same song plays on the Track Master main screen and on the main menus
// of every race mode, looping seamlessly. Moving between pages continues the
// song at the right position (saved in sessionStorage). Starting a race fades
// it out; going back to a menu starts it again from the top. The MUSIC
// button (menus only) turns it off and is remembered.
//
//   TMMusic.menu()  — a menu is showing: play / keep playing
//   TMMusic.stop()  — a race is starting: fade out
(function (G) {
  'use strict';
  var INTRO = 0;              // no separate intro file: the song starts from its own beginning
  var LOOP = 72 * 240 / 174;  // 72 bars at 174 BPM (99.31 s)
  var PAD = 0.5;              // loop.mp3 = last 0.5 s + loop + first 0.5 s (decoder padding safety)
  var VOL = 0.5;
  var SKEY = 'track-master.music.session', LKEY = 'track-master.music';

  var base = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/js\/music\.js(\?.*)?$/, 'music/') : '/track-master/music/';
  })();
  function sget() { try { return JSON.parse(sessionStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } }
  function sset(o) { try { sessionStorage.setItem(SKEY, JSON.stringify(o)); } catch (e) { /* private mode */ } }
  function enabled() { try { return localStorage.getItem(LKEY) !== 'off'; } catch (e) { return true; } }

  var AC = G.AudioContext || G.webkitAudioContext;
  var M = { wanted: false, playing: false, enabled: enabled() };
  if (!AC) { G.TMMusic = { menu: function () {}, stop: function () {} }; return; }

  var ctx = null, gain = null, bufs = {}, loading = {}, srcs = [], t0 = 0, loopOff = PAD;
  var saved = sget();
  // song position to start from: continue from the previous page, or the intro on the first visit
  var startT = saved.introDone ? INTRO : 0;
  if (saved.playing && typeof saved.t === 'number') startT = saved.t + Math.max(0, (Date.now() - saved.at) / 1000);

  function ensureCtx() {
    if (ctx) return;
    ctx = new AC();
    gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
  }
  function load(name) {
    if (bufs[name]) return Promise.resolve(bufs[name]);
    if (loading[name]) return loading[name];
    ensureCtx();
    loading[name] = fetch(base + name + '.mp3').then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (ok, no) { ctx.decodeAudioData(ab, ok, no); });
    }).then(function (b) {
      if (name === 'loop') {
        // most browsers strip the MP3 encoder delay; if one did not, skip the LAME delay too
        var expect = (LOOP + 2 * PAD) * b.sampleRate;
        loopOff = PAD + (b.length - expect > 500 ? 1105 / 44100 : 0);
      }
      bufs[name] = b; return b;
    });
    return loading[name];
  }
  function now() { return M.playing ? ctx.currentTime - t0 : startT; }

  function begin() {
    if (!M.wanted || !M.enabled || M.playing || !ctx || ctx.state !== 'running') return;
    var t = startT, need = t < INTRO ? ['intro', 'loop'] : ['loop'];
    Promise.all(need.map(load)).then(function () {
      if (!M.wanted || !M.enabled || M.playing || ctx.state !== 'running') return;
      var at = ctx.currentTime + 0.05;
      t = startT; if (t < INTRO && !bufs.intro) t = INTRO;
      t0 = at - t;
      if (t < INTRO) {
        var si = ctx.createBufferSource(); si.buffer = bufs.intro; si.connect(gain); si.start(at, t); srcs.push(si);
      }
      var sl = ctx.createBufferSource(); sl.buffer = bufs.loop; sl.loop = true;
      sl.loopStart = loopOff; sl.loopEnd = loopOff + LOOP; sl.connect(gain);
      if (t < INTRO) sl.start(at + (INTRO - t), loopOff);
      else sl.start(at, loopOff + ((t - INTRO) % LOOP));
      srcs.push(sl);
      M.playing = true;
      var g = gain.gain; g.cancelScheduledValues(at); g.setValueAtTime(g.value, at);
      g.linearRampToValueAtTime(VOL, at + (t < 0.05 ? 0.02 : 0.5));
      persist();
    }).catch(function (e) { console.warn('music', e); });
  }
  function halt(fade) {
    if (!M.playing) return;
    startT = now();
    var at = ctx.currentTime, g = gain.gain, old = srcs; srcs = [];
    g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); g.linearRampToValueAtTime(0, at + fade);
    old.forEach(function (s) { try { s.stop(at + fade + 0.02); } catch (e) { /* already */ } });
    M.playing = false;
  }
  function persist() {
    var t = now();
    sset({ introDone: true, playing: M.wanted && M.enabled, t: t, at: Date.now() });
  }
  function unlock() {
    ensureCtx();
    if (ctx.state !== 'running') ctx.resume().then(begin, function () {}); else begin();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { G.addEventListener(ev, unlock, true); });

  M.menu = function () {
    M.wanted = true; showBtn(true);
    if (M.playing) return;
    if (!M.enabled) return;
    ensureCtx(); load('loop'); if (startT < INTRO) load('intro');
    if (ctx.state !== 'running') ctx.resume().then(begin, function () {}); else begin();
  };
  M.stop = function () {
    M.wanted = false; showBtn(false);
    halt(0.6);
    startT = INTRO; // a menu after a race picks the loop up from its start
    persist();
  };

  // leaving the page: remember where the song is so the next page continues it
  G.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') { persist(); ctx.suspend(); }
    else if (M.wanted) ctx.resume().then(begin, function () {});
  });

  // ---- MUSIC on/off button (menus only)
  var btn = null;
  function showBtn(on) {
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'tm-music-btn';
      btn.setAttribute('aria-label', '배경 음악 켜기/끄기');
      btn.style.cssText = 'position:fixed;right:12px;top:12px;z-index:9999;padding:6px 10px;border:1px solid rgba(255,255,255,.35);' +
        'background:rgba(0,0,0,.6);color:#fff;font:600 11px/1 system-ui,sans-serif;letter-spacing:.08em;border-radius:6px;cursor:pointer';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        M.enabled = !M.enabled;
        try { localStorage.setItem(LKEY, M.enabled ? 'on' : 'off'); } catch (er) { /* ignore */ }
        if (M.enabled) { if (startT < INTRO) startT = INTRO; unlock(); } else halt(0.3);
        label(); persist();
      });
      (document.body || document.documentElement).appendChild(btn);
    }
    label(); btn.hidden = !on; btn.style.display = on ? '' : 'none';
  }
  function label() { if (btn) btn.textContent = M.enabled ? 'MUSIC ON' : 'MUSIC OFF'; }

  G.TMMusic = M;
})(window);

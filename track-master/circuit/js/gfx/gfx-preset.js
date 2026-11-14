// gfx-preset.js — 그래픽 프리셋 (낮음 / 높음): 기기 감지, 설정 UI, 지연 로딩,
// 렌더러 교체, 세부 품질 자동 조절.
// Load order: after renderer.js, before menu.js / main.js. Depends on: Renderer,
// Camera, Garage (at call time).
//
// Two renderers share one interface — init / render / resize / dispose (+
// explode / resetEffects) — and main.js calls only CR.Gfx, which forwards to
// the active one:
//  - low:  renderer.js (Canvas 2D), unchanged. Default for everyone.
//  - high: gfx/hi-*.js (three.js r128, WebGL2, or WebGL1 where that is all
//          there is). three.min.js and the hi-* files are only loaded the
//          first time 높음 is picked, so 낮음 players download nothing extra.
// In high the WebGL canvas sits under the 2D game canvas, which stays on top
// (transparent) for the cockpit overlay (cockpit.js) and keeps the touch input.
//
// Rules: 높음 can be picked on every device. Only a device with neither WebGL2
// nor WebGL1 is told it cannot run it (and stays 낮음). Low-end devices get a
// one-time "느릴 수 있어요" warning; high-end PCs get a "높음 권장" badge but are
// never switched automatically. While 높음 runs, a frame monitor lowers the
// detail tier (resolution, shadows, bloom, crowd, trees, particles) step by
// step; at the lowest tier it only offers to switch to 낮음.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var PREF_KEY = 'track-master.circuit.gfx';
  var WARNED_KEY = 'track-master.circuit.gfx-slow-warned';
  var RECOMMEND_KEY = 'track-master.circuit.gfx-recommend-shown';

  // Detail tiers of 높음, best first. scale: render-target scale; dprCap:
  // devicePixelRatio ceiling; maxPixels: pixel budget (4K screens scale down);
  // shadow: shadow map size (0 = blob shadows only), cascades; msaa (WebGL2);
  // bloom: mip levels (0 = off); blur: radial motion-blur taps; crowd / trees /
  // particles: fraction of the full amount.
  var TIERS = [
    { id: 'ultra', name: '최고', scale: 1, dprCap: 2, maxPixels: 3.7e6, shadow: 2048, cascades: 3, shadowFar: 340, msaa: 4, bloom: 5, blur: 12, crowd: 1, trees: 1, particles: 1, aniso: 8 },
    { id: 'high', name: '높음', scale: 1, dprCap: 1.5, maxPixels: 2.4e6, shadow: 2048, cascades: 2, shadowFar: 260, msaa: 4, bloom: 5, blur: 10, crowd: 0.8, trees: 0.8, particles: 0.85, aniso: 4 },
    { id: 'medium', name: '중간', scale: 0.85, dprCap: 1.25, maxPixels: 1.6e6, shadow: 1024, cascades: 2, shadowFar: 200, msaa: 2, bloom: 4, blur: 8, crowd: 0.5, trees: 0.55, particles: 0.6, aniso: 2 },
    { id: 'low', name: '낮춤', scale: 0.75, dprCap: 1.0, maxPixels: 1.0e6, shadow: 1024, cascades: 1, shadowFar: 110, msaa: 0, bloom: 3, blur: 6, crowd: 0.3, trees: 0.35, particles: 0.4, aniso: 1 },
    { id: 'minimal', name: '최소', scale: 0.62, dprCap: 1.0, maxPixels: 0.6e6, shadow: 0, cascades: 0, shadowFar: 0, msaa: 0, bloom: 0, blur: 4, crowd: 0.15, trees: 0.2, particles: 0.25, aniso: 1 },
  ];
  var MOBILE_DPR_CAP = 1.25; // heat / battery: never more than this on phones and tablets

  var Gfx = {
    TIERS: TIERS,
    preset: 'low', // what the player picked
    active: 'low', // what is drawing now ('high' only once loaded and running)
    loading: false,
    tier: 1, // index into TIERS while high runs
    tierLocked: false, // ?gfxq=N fixes the tier (tests / screenshots)
    device: null,
    ready: true, // false while switching to high (tests wait on it)
  };

  var canvas2d = null, ctx2d = null, glCanvas = null, hi = null;
  var copies = [];
  var overlayDirty = false;

  function params() {
    try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; }
  }

  // --- Device detection ------------------------------------------------------

  function probeWebGL(forceV1) {
    var c = document.createElement('canvas'), gl = null, v = 0;
    try {
      if (!forceV1) { gl = c.getContext('webgl2'); if (gl) v = 2; }
      if (!gl) { gl = c.getContext('webgl') || c.getContext('experimental-webgl'); if (gl) v = 1; }
    } catch (e) { gl = null; v = 0; }
    var gpu = '';
    if (gl) {
      try {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      } catch (e) { gpu = ''; }
      try { var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* ignore */ }
    }
    return { version: v, gpu: gpu };
  }

  function detect() {
    var q = params();
    var ua = navigator.userAgent || '';
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var touch = coarse || (navigator.maxTouchPoints || 0) > 0;
    var mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1); // iPadOS reports a Mac
    if (q.get('gfxmobile') === '1') mobile = touch = coarse = true; // tests
    var cores = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 0; // Chrome only; 0 = unknown
    var gl = probeWebGL(q.get('gl') === '1');
    var gpu = gl.gpu;
    var software = /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render/i.test(gpu);
    var weakGpu = /Intel.*(HD|UHD) Graphics|Intel\(R\) (HD|UHD)|Mali-[GT]?\d{1,2}\b|Mali-4|Adreno \(TM\) [1-5]\d\d|PowerVR|Vivante|VideoCore/i.test(gpu);
    var strongGpu = /NVIDIA|GeForce|RTX|GTX|Quadro|Radeon (RX|Pro|VII)|AMD Radeon\(TM\) RX|Apple M\d|Apple GPU|Intel.*Arc/i.test(gpu);
    var lowEnd = mobile || software || weakGpu || cores <= 4 || (mem > 0 && mem <= 4);
    var highEnd = !mobile && !coarse && !software && strongGpu && cores >= 6 && (mem === 0 || mem >= 8);
    return { mobile: mobile, touch: touch, cores: cores, memory: mem, webgl: gl.version, gpu: gpu,
      software: software, lowEnd: lowEnd, highEnd: highEnd };
  }

  // Starting detail tier for this device (mobile starts low on purpose).
  function startTier(d) {
    if (d.software) return 4;
    if (d.mobile) return /Apple GPU|Adreno \(TM\) [6-9]\d\d|Mali-G7\d|Mali-G[6-9]\d\d|Xclipse/i.test(d.gpu) && d.cores >= 6 ? 3 : 4;
    if (d.highEnd) return 0;
    if (d.lowEnd) return 2;
    return 1;
  }

  // --- Storage ---------------------------------------------------------------

  function readPref() {
    try { var v = localStorage.getItem(PREF_KEY); return v === 'high' || v === 'low' ? v : null; } catch (e) { return null; }
  }
  function writePref(p) {
    try { localStorage.setItem(PREF_KEY, p); } catch (e) { /* storage unavailable */ }
  }
  function flag(key, set) {
    try {
      if (set) { localStorage.setItem(key, '1'); return true; }
      return localStorage.getItem(key) === '1';
    } catch (e) { return false; }
  }

  // --- Toasts and prompts ----------------------------------------------------

  var toastEl = null, toastTimer = 0;
  function toast(text, opts) {
    opts = opts || {};
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'gfx-toast';
      toastEl.className = 'gfx-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      // Clicks on the prompt must not reach input.js (mouse = gear shifts).
      ['mousedown', 'pointerdown', 'touchstart', 'contextmenu'].forEach(function (t) {
        toastEl.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: t === 'touchstart' });
      });
      document.body.appendChild(toastEl);
    }
    clearTimeout(toastTimer);
    toastEl.textContent = '';
    var msg = document.createElement('span');
    msg.className = 'gfx-toast-msg';
    msg.textContent = text;
    toastEl.appendChild(msg);
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gfx-toast-btn' + (a.primary ? ' is-primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', function (e) { e.preventDefault(); hideToast(); a.run(); });
      toastEl.appendChild(b);
    });
    toastEl.classList.toggle('is-warn', !!opts.warn);
    toastEl.hidden = false;
    toastEl.classList.add('is-on');
    toastTimer = setTimeout(hideToast, opts.ms || 4200);
  }
  function hideToast() {
    if (!toastEl) return;
    toastEl.classList.remove('is-on');
    toastEl.hidden = true;
  }
  Gfx.toast = toast;

  // --- Lazy loading ----------------------------------------------------------

  var HI_SCRIPTS = ['../js/vendor/three.min.js', '../js/vendor/three-csm.js', 'js/gfx/hi-tex.js', 'js/gfx/hi-track.js',
    'js/gfx/hi-env.js', 'js/gfx/hi-car.js', 'js/gfx/hi-fx.js', 'js/gfx/hi-post.js', 'js/gfx/hi-renderer.js'];
  var loadPromise = null;
  function loadHigh() {
    if (CR.HiRenderer && window.THREE) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      var i = 0;
      (function next() {
        if (i >= HI_SCRIPTS.length) { resolve(); return; }
        var src = HI_SCRIPTS[i++];
        if (src.indexOf('three.min.js') >= 0 && window.THREE && THREE.REVISION === '128') { next(); return; }
        var s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = next;
        s.onerror = function () { loadPromise = null; reject(new Error('load failed: ' + src)); };
        document.head.appendChild(s);
      })();
    });
    return loadPromise;
  }
  Gfx.load = loadHigh;

  // --- Low renderer (renderer.js) behind the shared interface ------------------

  var lowRenderer = {
    init: function () {},
    render: function (ctx, canvas, dt) { CR.Renderer.render(ctx, canvas, dt); },
    resize: function () {},
    dispose: function () {},
  };
  Gfx.renderers = { low: lowRenderer, high: null };

  // --- Switching ---------------------------------------------------------------

  function makeGlCanvas() {
    var c = document.createElement('canvas');
    c.id = 'gl-canvas';
    c.setAttribute('aria-hidden', 'true');
    canvas2d.parentNode.insertBefore(c, canvas2d);
    return c;
  }

  function startHigh() {
    if (hi) return true;
    glCanvas = makeGlCanvas();
    try {
      hi = new CR.HiRenderer();
      hi.onContextLost = function () { fallbackLow('3D 그래픽이 중단되어 낮음으로 바꿨어요.'); };
      if (!hi.init(glCanvas, { device: Gfx.device, tier: TIERS[Gfx.tier], tierIndex: Gfx.tier, forceWebGL1: params().get('gl') === '1', mobileDprCap: Gfx.device.mobile ? MOBILE_DPR_CAP : 0 })) {
        throw new Error('WebGL context unavailable');
      }
    } catch (e) {
      console.warn('[Gfx] high renderer failed to start:', e && e.message);
      stopHigh();
      return false;
    }
    Gfx.renderers.high = hi;
    Gfx.active = 'high';
    document.body.classList.add('gfx-high');
    resetMonitor();
    overlayDirty = true;
    return true;
  }

  function stopHigh() {
    if (hi) { try { hi.dispose(); } catch (e) { console.warn('[Gfx] dispose', e); } }
    hi = null;
    Gfx.renderers.high = null;
    if (glCanvas && glCanvas.parentNode) glCanvas.parentNode.removeChild(glCanvas);
    glCanvas = null;
    Gfx.active = 'low';
    document.body.classList.remove('gfx-high');
  }

  function fallbackLow(message) {
    stopHigh();
    Gfx.preset = 'low';
    writePref('low');
    if (CR.Garage && CR.Garage.setGfx) CR.Garage.setGfx('low');
    syncAll();
    if (message) toast(message, { warn: true, ms: 6000 });
  }
  Gfx.fallbackLow = fallbackLow;

  // Player's choice. opts.save (default true): remember it; opts.quiet: no
  // warnings (applied from a save).
  Gfx.setPreset = function (p, opts) {
    opts = opts || {};
    p = p === 'high' ? 'high' : 'low';
    var save = opts.save !== false;
    if (p === 'high' && !Gfx.device.webgl) {
      if (!opts.quiet) toast('이 기기는 3D 그래픽을 지원하지 않아요. 낮음으로 유지합니다.', { warn: true, ms: 5000 });
      p = 'low';
      if (Gfx.preset === 'low') { syncAll(); return; }
    }
    if (p === Gfx.preset && (p === 'low' || Gfx.active === 'high' || Gfx.loading)) { syncAll(); return; }
    Gfx.preset = p;
    if (save) {
      writePref(p);
      if (CR.Garage && CR.Garage.setGfx) CR.Garage.setGfx(p);
    }
    if (p === 'low') {
      Gfx.loading = false;
      stopHigh();
      Gfx.ready = true;
      syncAll();
      return;
    }
    if (!opts.quiet && Gfx.device.lowEnd && !flag(WARNED_KEY)) {
      flag(WARNED_KEY, true);
      toast('이 기기에서는 느릴 수 있어요. 세부 품질을 자동으로 낮추며 실행합니다.', { warn: true, ms: 5500 });
    }
    Gfx.loading = true;
    Gfx.ready = false;
    syncAll();
    loadHigh().then(function () {
      Gfx.loading = false;
      if (Gfx.preset !== 'high') { Gfx.ready = true; syncAll(); return; } // changed mind while loading
      if (!startHigh()) fallbackLow('3D 그래픽을 시작하지 못해 낮음으로 유지합니다.');
      Gfx.ready = true;
      syncAll();
    }, function (e) {
      console.warn('[Gfx]', e && e.message);
      Gfx.loading = false;
      Gfx.ready = true;
      fallbackLow('3D 그래픽 파일을 불러오지 못했어요. 낮음으로 유지합니다.');
    });
  };

  // --- Frame monitor: lower the detail tier while frames stay slow ------------

  var mon = { acc: 0, frames: 0, slowWindows: 0, verySlowWindows: 0, cooldown: 0, prompted: false };
  function resetMonitor() { mon.acc = 0; mon.frames = 0; mon.slowWindows = 0; mon.verySlowWindows = 0; mon.cooldown = 2.5; }

  function setTier(t, why) {
    t = Math.max(0, Math.min(TIERS.length - 1, t));
    if (t === Gfx.tier) return;
    Gfx.tier = t;
    if (hi) hi.setQuality(TIERS[t], t);
    resetMonitor();
    mon.cooldown = 3.5; // shaders recompile after a tier change
    syncAll();
    if (why) console.info('[Gfx] detail tier -> ' + TIERS[t].id + ' (' + why + ')');
  }
  Gfx.setTier = function (t) { setTier(t, 'manual'); };

  function monitor(realDt) {
    if (Gfx.tierLocked || !hi || document.hidden) return;
    if (!(CR.Main && CR.Main.state === 'playing')) return;
    if (mon.cooldown > 0) { mon.cooldown -= realDt; return; }
    mon.acc += realDt;
    mon.frames++;
    if (mon.acc < 2) return;
    var fps = mon.frames / mon.acc;
    mon.acc = 0; mon.frames = 0;
    var target = Gfx.device.mobile ? 30 : 55;
    if (fps < target * 0.9) mon.slowWindows++; else mon.slowWindows = 0;
    if (Gfx.tier < TIERS.length - 1) {
      if (mon.slowWindows >= 2) setTier(Gfx.tier + 1, Math.round(fps) + ' fps');
      return;
    }
    // Lowest tier and still slow: offer 낮음 (never switch by ourselves).
    if (fps < target * 0.75) mon.verySlowWindows++; else mon.verySlowWindows = 0;
    if (mon.verySlowWindows >= 3 && !mon.prompted) {
      mon.prompted = true;
      toast('프레임이 낮아요. 낮음으로 바꿀까요?', {
        ms: 12000, warn: true,
        actions: [
          { label: '낮음으로 바꾸기', primary: true, run: function () { Gfx.setPreset('low'); } },
          { label: '계속 높음', run: function () {} },
        ],
      });
    }
  }

  // --- Interface used by main.js -------------------------------------------------

  var lastNow = 0;
  // Draws one frame with the active renderer. paused: frozen frame (dt 0).
  Gfx.render = function (ctx, canvas, dt) {
    if (Gfx.active !== 'high' || !hi) { lowRenderer.render(ctx, canvas, dt); return; }
    var now = performance.now();
    var realDt = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    // 2D canvas = transparent overlay; clear it when the cockpit drew on it.
    if (overlayDirty) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      overlayDirty = false;
    }
    if (CR.Camera.inCockpit()) overlayDirty = true;
    if (document.hidden) return; // background tab: no GPU work
    try {
      hi.render(dt, realDt);
    } catch (e) {
      console.error('[Gfx] high renderer error', e);
      fallbackLow('3D 그래픽 오류로 낮음으로 바꿨어요.');
      return;
    }
    if (dt > 0) monitor(realDt);
  };

  Gfx.resize = function () { if (hi) hi.resize(); };
  Gfx.explode = function (car) {
    CR.Renderer.explode(car);
    if (hi) hi.explode(car);
  };
  Gfx.resetEffects = function () {
    CR.Renderer.resetEffects();
    if (hi) hi.resetEffects();
  };
  Gfx.isHigh = function () { return Gfx.active === 'high'; };
  Gfx.info = function () { return hi ? hi.info() : null; }; // tests

  // --- Settings UI (menu 그래픽 panel + pause card) ------------------------------

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  Gfx.summary = function () {
    if (Gfx.loading) return '높음 불러오는 중…';
    if (Gfx.preset === 'high' && Gfx.active === 'high') return '높음 · 세부 ' + TIERS[Gfx.tier].name + (Gfx.tierLocked ? '' : ' (자동)');
    return Gfx.device && Gfx.device.highEnd ? '낮음 · 이 PC는 높음 권장' : '낮음';
  };

  Gfx.buildUI = function (container, opts) {
    if (!container) return null;
    opts = opts || {};
    var box = el('div', 'gfx' + (opts.compact ? ' is-compact' : ''));
    var row = el('div', 'gfx-row');
    row.appendChild(el('span', 'gfx-name', '그래픽'));
    var seg = el('div', 'gfx-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', '그래픽 프리셋');
    var buttons = {};
    [['low', '낮음'], ['high', '높음']].forEach(function (p) {
      var b = el('button', 'gfx-opt');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.preset = p[0];
      b.appendChild(el('span', null, p[1]));
      if (p[0] === 'high') { var badge = el('small', 'gfx-badge', '권장'); badge.hidden = true; b.appendChild(badge); buttons.badge = badge; }
      b.addEventListener('click', function (e) { e.preventDefault(); Gfx.setPreset(p[0]); });
      seg.appendChild(b);
      buttons[p[0]] = b;
    });
    row.appendChild(seg);
    box.appendChild(row);
    var note = el('p', 'gfx-note');
    box.appendChild(note);
    container.appendChild(box);
    var copy = { box: box, buttons: buttons, note: note, compact: !!opts.compact };
    copies.push(copy);
    sync(copy);
    return box;
  };

  function sync(copy) {
    var d = Gfx.device || {};
    ['low', 'high'].forEach(function (p) {
      var on = Gfx.preset === p;
      copy.buttons[p].classList.toggle('is-on', on);
      copy.buttons[p].setAttribute('aria-checked', on ? 'true' : 'false');
    });
    copy.buttons.high.classList.toggle('is-loading', Gfx.loading);
    copy.buttons.high.classList.toggle('is-unsupported', !d.webgl);
    copy.buttons.badge.hidden = !(d.highEnd && Gfx.preset !== 'high');
    var text;
    if (!d.webgl) text = '이 기기는 3D 그래픽(WebGL)을 지원하지 않아 낮음만 쓸 수 있어요.';
    else if (Gfx.loading) text = '3D 그래픽을 불러오는 중…';
    else if (Gfx.active === 'high') {
      text = '3D(WebGL' + (hi && hi.webglVersion ? hi.webglVersion : d.webgl) + ') · 세부 품질 ' + TIERS[Gfx.tier].name +
        (Gfx.tierLocked ? '' : ', 프레임에 맞춰 자동 조절');
      if (!copy.compact) text += ' · 그림자, 블룸, 모션 블러, 3D 관중석';
    } else {
      text = copy.compact ? '높음: 3D 그림자·조명·속도감 효과' : '높음은 그림자·조명·반사·속도감 효과가 들어간 3D 그래픽이에요.';
      if (d.highEnd) text += ' 이 PC에서는 높음을 권장해요.';
      else if (d.lowEnd) text += ' 이 기기에서는 느릴 수 있어요.';
    }
    copy.note.textContent = text;
  }

  function syncAll() {
    copies.forEach(sync);
    if (Gfx.onSummary) Gfx.onSummary(Gfx.summary());
  }
  Gfx.sync = syncAll;

  // One-time "높음 권장" notice for a high-end PC (never switches by itself).
  Gfx.menuShown = function () {
    if (!Gfx.device || !Gfx.device.highEnd || Gfx.preset === 'high' || flag(RECOMMEND_KEY)) return;
    flag(RECOMMEND_KEY, true);
    toast('고사양 PC예요. 메뉴의 그래픽에서 높음을 켜 보세요.', { ms: 6000 });
  };

  // --- Startup -------------------------------------------------------------------

  Gfx.init = function (canvas, ctx) {
    canvas2d = canvas;
    ctx2d = ctx;
    Gfx.device = detect();
    var q = params();
    Gfx.tier = startTier(Gfx.device);
    var qt = q.get('gfxq');
    if (qt !== null && qt !== '' && !isNaN(+qt)) { Gfx.tier = Math.max(0, Math.min(TIERS.length - 1, +qt)); Gfx.tierLocked = true; }
    // Choice: this browser's, else the save's (account), else 낮음.
    var pref = readPref() || (CR.Garage && CR.Garage.gfx) || 'low';
    if (q.get('gfx') === 'high' || q.get('gfx') === 'low') pref = q.get('gfx');
    syncAll();
    if (pref === 'high') Gfx.setPreset('high', { save: false, quiet: true });
    // A save loaded later (sign-in) may carry another choice.
    if (CR.Garage && CR.Garage.on) {
      CR.Garage.on('apply', function () {
        var g = CR.Garage.gfx;
        if ((g === 'high' || g === 'low') && g !== Gfx.preset) {
          writePref(g);
          Gfx.setPreset(g, { save: false, quiet: true });
        }
      });
    }
  };

  CR.Gfx = Gfx;
})();

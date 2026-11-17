// gfxrec.js — recommends graphics settings for this device (all Track Master modes).
//   TMGfxRec.device  — { mobile, cores, memory, gpu, webgl, software }
//   TMGfxRec.level   — 3 high-end PC · 2 ordinary PC / strong phone · 1 weak GPU · 0 no / software WebGL
//   TMGfxRec.text()  — a short reason, e.g. "NVIDIA GeForce RTX 4070 Ti · 16코어"
//   TMGfxRec.row(container, label, isApplied, apply) — "이 기기 추천: …  [추천대로]" line
(function (G) {
  'use strict';
  function probe() {
    var c = document.createElement('canvas'), gl = null, v = 0, gpu = '';
    try {
      gl = c.getContext('webgl2'); if (gl) v = 2;
      if (!gl) { gl = c.getContext('webgl') || c.getContext('experimental-webgl'); if (gl) v = 1; }
    } catch (e) { gl = null; }
    if (gl) {
      try {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      } catch (e) { gpu = ''; }
      try { var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* ignore */ }
    }
    return { v: v, gpu: gpu };
  }
  var ua = navigator.userAgent || '';
  var mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  var cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 0;
  var p = probe(), gpu = p.gpu;
  var software = !p.v || /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic Render/i.test(gpu);
  var strong = /NVIDIA|GeForce|RTX|GTX|Quadro|Radeon (RX|Pro|VII)|AMD Radeon\(TM\) RX|Apple M\d|Intel.*Arc/i.test(gpu);
  var weak = /Intel.*(HD|UHD) Graphics|Intel\(R\) (HD|UHD)|Mali-[GT]?\d{1,2}\b|Mali-4|Adreno \(TM\) [1-5]\d\d|PowerVR|Vivante|VideoCore/i.test(gpu);
  var strongPhone = /Apple GPU|Adreno \(TM\) [6-9]\d\d|Mali-G7\d|Mali-G[6-9]\d\d|Immortalis|Xclipse/i.test(gpu) && (mem === 0 || mem >= 6);

  var level;
  if (software) level = 0;
  else if (mobile) level = strongPhone ? 2 : (weak ? 0 : 1);
  else if (strong && cores >= 6 && (mem === 0 || mem >= 8)) level = 3;
  else if (weak || cores <= 4 || (mem > 0 && mem <= 4)) level = 1;
  else level = 2;

  var R = { device: { mobile: mobile, cores: cores, memory: mem, gpu: gpu, webgl: p.v, software: software }, level: level };
  R.text = function () {
    var g = gpu.replace(/^ANGLE \(|\)$/g, '').replace(/^[^,]*, /, '').replace(/ Direct3D.*$| \(0x.*$|, D3D.*$|OpenGL.*$/i, '').trim();
    if (!p.v) return 'WebGL을 쓸 수 없는 기기';
    var bits = [];
    if (g) bits.push(g.length > 40 ? g.slice(0, 40) + '…' : g);
    bits.push(cores + '코어');
    if (mem) bits.push('메모리 ' + mem + 'GB+');
    if (mobile) bits.push('휴대 기기');
    return bits.join(' · ');
  };
  // One recommendation line with an apply button. isApplied() decides whether
  // the button shows "적용됨"; call the returned refresh() after settings change.
  R.row = function (container, label, isApplied, apply) {
    var box = document.createElement('div');
    box.className = 'tm-rec';
    box.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0;padding:9px 12px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.04);font-size:13px;line-height:1.4';
    var t = document.createElement('div'); t.style.cssText = 'flex:1;min-width:180px';
    t.innerHTML = '<b>이 기기 추천: <span class="tm-rec-l"></span></b><br><small style="opacity:.6"></small>';
    t.querySelector('.tm-rec-l').textContent = label;
    t.querySelector('small').textContent = R.text();
    var b = document.createElement('button'); b.type = 'button';
    b.style.cssText = 'padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); apply(); refresh(); });
    box.appendChild(t); box.appendChild(b);
    container.appendChild(box);
    function refresh() {
      var on = !!isApplied();
      b.textContent = on ? '적용됨' : '추천대로';
      b.disabled = on; b.style.opacity = on ? '.5' : '1'; b.style.cursor = on ? 'default' : 'pointer';
    }
    refresh();
    return refresh;
  };
  G.TMGfxRec = R;
})(window);

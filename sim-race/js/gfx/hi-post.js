// hi-post.js — post-processing for the 높음 renderer, one compact chain:
//   scene (HDR half-float target, MSAA on WebGL2) -> bright pass -> bloom
//   (dual-filter down / up mips) -> composite: (the car itself is kept sharp)
//   speed-scaled radial motion blur, bloom, sun lens flare (ghosts, halo,
//   streak; fades when the sun is hidden), speed lines, explosion flash,
//   exposure + ACES filmic tone mapping + sRGB, vignette, FXAA when there is
//   no MSAA. Without renderable half floats the scene is tone-mapped while it
//   renders (LDR) and the composite skips that step.
// Load order: after hi-fx.js. Depends on: THREE.
(function () {
  'use strict';
  window.CR = window.CR || {};
  var Hi = CR.Hi = CR.Hi || {};

  var QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  var BRIGHT_FS = [
    'uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tSrc, vUv + texel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + texel * vec2(0.5, -0.5)).rgb',
    '         + texture2D(tSrc, vUv + texel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + texel * vec2(0.5, 0.5)).rgb;',
    '  c *= 0.25;',
    '  float l = max(c.r, max(c.g, c.b));',
    '  float soft = clamp(l - threshold + 0.5, 0.0, 1.0); soft = soft * soft * 0.5;',
    '  float k = max(soft, l - threshold) / max(l, 1e-4);',
    '  gl_FragColor = vec4(min(c * k, vec3(60.0)), 1.0);',
    '}'].join('\n');

  var DOWN_FS = [
    'uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;',
    '  c += texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, -1.0)).rgb;',
    '  c += texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, 1.0)).rgb;',
    '  gl_FragColor = vec4(c / 8.0, 1.0);',
    '}'].join('\n');

  var UP_FS = [
    'uniform sampler2D tSrc; uniform vec2 texel; uniform float weight; varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tSrc, vUv + vec2(-2.0, 0.0) * texel).rgb + texture2D(tSrc, vUv + vec2(2.0, 0.0) * texel).rgb;',
    '  c += texture2D(tSrc, vUv + vec2(0.0, -2.0) * texel).rgb + texture2D(tSrc, vUv + vec2(0.0, 2.0) * texel).rgb;',
    '  c += (texture2D(tSrc, vUv + vec2(-1.0, -1.0) * texel).rgb + texture2D(tSrc, vUv + vec2(1.0, -1.0) * texel).rgb',
    '     + texture2D(tSrc, vUv + vec2(-1.0, 1.0) * texel).rgb + texture2D(tSrc, vUv + vec2(1.0, 1.0) * texel).rgb) * 2.0;',
    '  gl_FragColor = vec4(c / 12.0 * weight, 1.0);',
    '}'].join('\n');

  var COMPOSITE_FS = [
    'uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 res; uniform float aspect; uniform float time;',
    'uniform float bloomStrength; uniform float exposure;',
    'uniform vec2 blurCenter; uniform float blurAmount;',
    'uniform vec2 carPos; uniform float carRadius;',
    'uniform vec3 sunPos; uniform vec3 sunTint; uniform float flare;',
    'uniform float speedLines; uniform float vignette; uniform float flash; uniform float hdr;',
    'varying vec2 vUv;',
    'float hash(float n) { return fract(sin(n) * 43758.5453); }',
    'vec3 tmFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
    'vec3 tmACES(vec3 c) {',
    '  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));',
    '  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));',
    '  c = inM * (c / 0.6); c = tmFit(c); c = outM * c; return clamp(c, 0.0, 1.0);',
    '}',
    'vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(0.0031308, c)); }',
    'float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }',
    'vec3 fxaa(vec2 uv) {',
    '  vec2 px = 1.0 / res;',
    '  vec3 cM = texture2D(tScene, uv).rgb;',
    '  vec3 cNW = texture2D(tScene, uv + vec2(-1.0, -1.0) * px).rgb, cNE = texture2D(tScene, uv + vec2(1.0, -1.0) * px).rgb;',
    '  vec3 cSW = texture2D(tScene, uv + vec2(-1.0, 1.0) * px).rgb, cSE = texture2D(tScene, uv + vec2(1.0, 1.0) * px).rgb;',
    '  float lM = luma(cM / (1.0 + cM)), lNW = luma(cNW / (1.0 + cNW)), lNE = luma(cNE / (1.0 + cNE)), lSW = luma(cSW / (1.0 + cSW)), lSE = luma(cSE / (1.0 + cSE));',
    '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
    '  if (lMax - lMin < max(0.04, lMax * 0.12)) return cM;',
    '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));',
    '  float red = max((lNW + lNE + lSW + lSE) * 0.03, 1.0 / 128.0);',
    '  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -6.0, 6.0) * px;',
    '  vec3 a = 0.5 * (texture2D(tScene, uv - dir * 0.1667).rgb + texture2D(tScene, uv + dir * 0.1667).rgb);',
    '  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);',
    '  float lB = luma(b / (1.0 + b));',
    '  return (lB < lMin || lB > lMax) ? a : b;',
    '}',
    'void main() {',
    '  vec2 uv = vUv;',
    // radial motion blur
    '  vec2 dir = uv - blurCenter;',
    '  float r = length(dir * vec2(aspect, 1.0));',
    '  float mask = smoothstep(0.06, 0.55, r) * blurAmount;',
    '  if (carRadius > 0.0) mask *= smoothstep(carRadius * 0.9, carRadius * 2.0, length((uv - carPos) * vec2(aspect, 1.0)));',
    '  vec3 c;',
    '#ifdef USE_FXAA',
    '  c = fxaa(uv);',
    '#else',
    '  c = texture2D(tScene, uv).rgb;',
    '#endif',
    '  if (mask > 0.0004) {',
    '    vec3 acc = c; float wsum = 1.0;',
    '    for (int i = 1; i < TAPS; i++) {',
    '      float t = float(i) / float(TAPS - 1);',
    '      float w = 1.0 - t * 0.6;',
    '      acc += texture2D(tScene, uv - dir * t * mask).rgb * w; wsum += w;',
    '    }',
    '    c = acc / wsum;',
    '  }',
    '#ifdef USE_BLOOM',
    '  c += texture2D(tBloom, uv).rgb * bloomStrength;',
    '#endif',
    // lens flare from the sun (sunPos.z = 1 when in front of the camera)
    '  if (flare > 0.001 && sunPos.z > 0.5) {',
    '    vec2 sp = sunPos.xy;',
    '    float vis = 1.0;',
    '#ifdef USE_BLOOM',
    '    vis = smoothstep(0.6, 4.0, luma(texture2D(tBloom, clamp(sp, 0.0, 1.0)).rgb));',
    '#endif',
    '    float edge = smoothstep(0.95, 0.4, length((sp - 0.5) * vec2(aspect, 1.0)));',
    '    float f = flare * vis * edge;',
    '    vec2 axis = vec2(0.5) - sp;',
    '    vec3 fl = vec3(0.0);',
    '    for (int k = 0; k < 5; k++) {',
    '      float fk = float(k);',
    '      float pos = 0.35 + fk * 0.38;',
    '      float rad = 0.025 + 0.03 * hash(fk + 3.0);',
    '      vec2 g = sp + axis * pos * 2.0;',
    '      float d = length((uv - g) * vec2(aspect, 1.0));',
    '      vec3 tint = mix(vec3(0.4, 0.7, 1.0), vec3(1.0, 0.6, 0.35), hash(fk));',
    '      fl += tint * smoothstep(rad, rad * 0.55, d) * (0.18 + 0.12 * hash(fk + 9.0));',
    '    }',
    '    float hd = length((uv - (sp + axis * 2.0 * 0.5)) * vec2(aspect, 1.0));',
    '    fl += vec3(0.5, 0.75, 1.0) * smoothstep(0.025, 0.0, abs(hd - 0.32)) * 0.06;',
    '    vec2 sd = (uv - sp) * vec2(aspect, 1.0);',
    '    fl += sunTint * exp(-abs(sd.y) * 260.0) * exp(-abs(sd.x) * 2.2) * 0.9;',
    '    fl += sunTint * exp(-length(sd) * 9.0) * 0.6;',
    '    c += fl * f;',
    '  }',
    // speed lines: dashes racing out along radial lines near the edges
    '  if (speedLines > 0.001) {',
    '    float ang = atan(dir.y, dir.x * aspect);',
    '    float bin = floor(ang * 34.0);',
    '    float h = hash(bin);',
    '    float lane = 1.0 - smoothstep(0.015, 0.06, abs(fract(ang * 34.0) - 0.5));',
    '    float dash = smoothstep(0.55, 1.0, fract(r * 2.2 - time * (2.4 + h * 2.0) + h * 7.0));',
    '    float lines = step(0.72, h) * lane * dash * smoothstep(0.3, 0.75, r);',
    '    c += vec3(lines * speedLines * 0.55);',
    '  }',
    '  c += vec3(1.0, 0.82, 0.55) * flash;',
    '  if (hdr > 0.5) { c = tmACES(c * exposure); c = toSRGB(c); }',
    // cinematic grade: filmic S-curve, teal shadows / warm highlights, a little less saturation
    '  c = clamp(c, 0.0, 1.0);',
    '  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);',
    '  float lg = luma(c);',
    '  c += vec3(-0.012, 0.004, 0.02) * (1.0 - lg) * (1.0 - lg);',
    '  c *= mix(vec3(1.0), vec3(1.045, 1.0, 0.93), smoothstep(0.35, 0.95, lg));',
    '  c = mix(vec3(luma(c)), c, 0.94);',
    '  float v = smoothstep(1.05, 0.25, length((vUv - 0.5) * vec2(aspect * 0.85, 1.0)));',
    '  c *= mix(1.0, v, vignette);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n');

  function Post(R) {
    this.R = R;
    this.renderer = R.renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.hdr = R.hdr;
    this.type = R.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    function mat(fs, uniforms, defines, blend) {
      var m = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms: uniforms, defines: defines || {}, depthTest: false, depthWrite: false, toneMapped: false });
      if (blend) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.transparent = true; }
      return m;
    }
    this.bright = mat(BRIGHT_FS, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.0 } });
    this.down = mat(DOWN_FS, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = mat(UP_FS, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } }, null, true);
    this.uniforms = {
      tScene: { value: null }, tBloom: { value: null }, res: { value: new THREE.Vector2(1, 1) }, aspect: { value: 1 }, time: { value: 0 },
      bloomStrength: { value: 0.22 }, exposure: { value: 1 }, blurCenter: { value: new THREE.Vector2(0.5, 0.6) }, blurAmount: { value: 0 },
      carPos: { value: new THREE.Vector2(0.5, 0.3) }, carRadius: { value: 0 },
      sunPos: { value: new THREE.Vector3(0, 0, 0) }, sunTint: { value: new THREE.Color(1, 0.9, 0.7) }, flare: { value: 0 },
      speedLines: { value: 0 }, vignette: { value: 0.35 }, flash: { value: 0 }, hdr: { value: R.hdr ? 1 : 0 },
    };
    this.composite = null;
    this.targets = { scene: null, mips: [] };
    this.w = 0; this.h = 0;
  }

  Post.prototype.configure = function (tier, webgl2) {
    this.tier = tier;
    this.msaa = webgl2 ? tier.msaa : 0;
    this.bloomLevels = tier.bloom;
    var defines = { TAPS: Math.max(2, tier.blur) };
    if (!this.msaa) defines.USE_FXAA = 1;
    if (this.bloomLevels > 0) defines.USE_BLOOM = 1;
    if (this.composite) this.composite.dispose();
    this.composite = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: COMPOSITE_FS, uniforms: this.uniforms, defines: defines, depthTest: false, depthWrite: false, toneMapped: false });
    this.w = 0; // force target rebuild
  };

  Post.prototype.makeTarget = function (w, h, msaa, depth) {
    var opts = { type: this.type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!depth, stencilBuffer: false };
    var t;
    if (msaa && THREE.WebGLMultisampleRenderTarget) { t = new THREE.WebGLMultisampleRenderTarget(w, h, opts); t.samples = msaa; }
    else t = new THREE.WebGLRenderTarget(w, h, opts);
    t.texture.generateMipmaps = false;
    if (!this.hdr) t.texture.encoding = THREE.sRGBEncoding; // LDR: scene already tone-mapped + sRGB
    return t;
  };

  Post.prototype.disposeTargets = function () {
    if (this.targets.scene) this.targets.scene.dispose();
    this.targets.mips.forEach(function (t) { t.dispose(); });
    this.targets.scene = null;
    this.targets.mips = [];
  };

  // w, h: internal render size in pixels.
  Post.prototype.setSize = function (w, h) {
    if (w === this.w && h === this.h && this.targets.scene) return;
    this.w = w; this.h = h;
    this.disposeTargets();
    this.targets.scene = this.makeTarget(w, h, this.msaa, true);
    var mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    for (var i = 0; i < this.bloomLevels; i++) {
      this.targets.mips.push(this.makeTarget(mw, mh, 0, false));
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
    this.uniforms.res.value.set(w, h);
    this.uniforms.aspect.value = w / h;
  };

  Post.prototype.pass = function (material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  };

  // Called after the scene was rendered into targets.scene.
  Post.prototype.finish = function () {
    var r = this.renderer, src = this.targets.scene, mips = this.targets.mips;
    var prevAutoClear = r.autoClear;
    r.autoClear = false;
    if (mips.length) {
      this.bright.uniforms.tSrc.value = src.texture;
      this.bright.uniforms.texel.value.set(1 / src.width, 1 / src.height);
      this.bright.uniforms.threshold.value = this.hdr ? 1.5 : 0.85;
      r.setRenderTarget(mips[0]); r.clear(true, false, false);
      this.pass(this.bright, mips[0]);
      for (var i = 1; i < mips.length; i++) {
        this.down.uniforms.tSrc.value = mips[i - 1].texture;
        this.down.uniforms.texel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
        r.setRenderTarget(mips[i]); r.clear(true, false, false);
        this.pass(this.down, mips[i]);
      }
      for (var j = mips.length - 2; j >= 0; j--) {
        this.up.uniforms.tSrc.value = mips[j + 1].texture;
        this.up.uniforms.texel.value.set(1 / mips[j + 1].width, 1 / mips[j + 1].height);
        this.up.uniforms.weight.value = 0.9;
        this.pass(this.up, mips[j]);
      }
      this.uniforms.tBloom.value = mips[0].texture;
    }
    this.uniforms.tScene.value = src.texture;
    this.pass(this.composite, null);
    r.autoClear = prevAutoClear;
  };

  Post.prototype.dispose = function () {
    this.disposeTargets();
    [this.bright, this.down, this.up, this.composite].forEach(function (m) { if (m) m.dispose(); });
    this.quad.geometry.dispose();
  };

  Hi.Post = Post;
})();

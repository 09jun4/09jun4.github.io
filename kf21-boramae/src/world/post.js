// 후처리(높음·최고 프리셋 전용). 낮음에서는 이 파일을 아예 쓰지 않는다.
//   1) 장면을 HDR(HalfFloat) + MSAA 렌더 타깃에 그린다(깊이 텍스처 포함)
//   2) 장면 색을 두 번째 HDR 타깃에 복사하고 그 위에 파티클 층을 그린다. 파티클은 1의 깊이 텍스처를 읽어
//      가려진 부분은 버리고 맞닿는 가장자리는 부드럽게 한다(소프트 파티클). MSAA 타깃은 해상 뒤 내용이 버려져서 이어 그릴 수 없다.
//   3) 블룸: 밝은 부분만 뽑아 절반씩 줄였다가 다시 키우며 더한다(불꽃·항법등·계기판처럼 밝은 것만 번진다)
//   4) 합성: 블룸 + 렌즈 플레어(해가 가려지지 않았을 때) + ACES 톤매핑 + 색보정 + 폭발 가장자리 섬광
//   5) (최고) 약한 모션 블러: 화면이 빨리 돌 때만 이전 프레임을 조금 섞는다
import * as THREE from 'three';

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = /* glsl */ `
  uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
    c *= 0.25;
    if (uThreshold > 0.0) {
      float l = max(c.r, max(c.g, c.b));
      c *= smoothstep(uThreshold, uThreshold + 0.6, l); // 밝은 부분만(선택적 블룸)
      c = min(c, vec3(24.0));
    }
    gl_FragColor = vec4(c, 1.0);
  }`;

const UP = /* glsl */ `
  uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb;
    gl_FragColor = vec4(c * 0.25 + texture2D(tAdd, vUv).rgb, 1.0);
  }`;

const COMPOSITE = /* glsl */ `
  uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tDepth;
  uniform float uBloom, uFlare, uAspect, uExposure, uFlash;
  uniform vec3 uSun; // xy = 화면 좌표(0~1), z = 보이는 정도
  uniform vec3 uSunColor, uFlashColor;
  varying vec2 vUv;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  float blob(vec2 p, vec2 c, float r) { vec2 d = (p - c) * vec2(uAspect, 1.0); return smoothstep(r, 0.0, length(d)); }
  void main() {
    vec3 col = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
    // 렌즈 플레어: 해가 화면 안에 있고 다른 물체에 가려지지 않았을 때
    if (uFlare > 0.0 && uSun.z > 0.0) {
      float open = step(0.99999, texture2D(tDepth, uSun.xy).r) * uSun.z * uFlare;
      vec2 s = uSun.xy, axis = vec2(0.5) - s;
      vec3 f = uSunColor * blob(vUv, s, 0.36) * 0.2;
      f += uSunColor * pow(blob(vUv, s, 0.11), 2.0) * 0.5;
      f += vec3(0.5, 0.75, 1.0) * blob(vUv, s + axis * 0.6, 0.06) * 0.12;
      f += vec3(1.0, 0.6, 0.35) * blob(vUv, s + axis * 1.25, 0.1) * 0.09;
      f += vec3(0.5, 1.0, 0.7) * blob(vUv, s + axis * 1.7, 0.045) * 0.11;
      f += vec3(0.8, 0.7, 1.0) * blob(vUv, s + axis * 2.2, 0.17) * 0.05;
      vec2 d = (vUv - s) * vec2(uAspect, 1.0); // 가로로 긴 빛줄기
      f += uSunColor * smoothstep(0.012, 0.0, abs(d.y)) * smoothstep(0.75, 0.0, abs(d.x)) * 0.16;
      col += f * open;
    }
    // 폭발 섬광: 화면 가장자리가 순간 밝아진다
    vec2 q = vUv - 0.5;
    float edge = smoothstep(0.25, 0.75, length(q * vec2(1.0, 0.8)));
    col += uFlashColor * uFlash * edge * 1.6;
    // ACES는 밝은 파랑·초록을 과하게 틀어서, 원래 색과 섞어 낮 하늘 색을 지킨다
    col = mix(aces(col * uExposure), clamp(col * uExposure, 0.0, 1.0), 0.4);
    // 색보정: 채도·대비를 살짝 올리고 가장자리를 아주 약하게 어둡게
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, 1.04);
    col = (col - 0.5) * 1.06 + 0.5;
    col *= 1.0 - edge * 0.16;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    #include <colorspace_fragment>
  }`;

const COPY = /* glsl */ `uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }`;

const BLEND = /* glsl */ `
  uniform sampler2D tCur; uniform sampler2D tPrev; uniform float uMix; varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(mix(texture2D(tCur, vUv).rgb, texture2D(tPrev, vUv).rgb, uMix), 1.0);
    #include <colorspace_fragment>
  }`;

export class PostFX {
  /** @param {THREE.WebGLRenderer} renderer @param {object} cfg 프리셋의 post 설정 */
  constructor(renderer, cfg, look) {
    this.renderer = renderer;
    this.cfg = cfg;
    this.look = look;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.qscene = new THREE.Scene();
    this.qscene.add(this.quad);
    const sm = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.mDown = sm(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } });
    this.mUp = sm(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mComp = sm(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, tDepth: { value: null },
      uBloom: { value: cfg.bloomStrength }, uFlare: { value: cfg.flare }, uAspect: { value: 1 }, uExposure: { value: look.exposure },
      uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color(look.flareColor) },
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(look.flashColor) },
    });
    this.mCopy = sm(COPY, { tSrc: { value: null } });
    this.mBlend = sm(BLEND, { tCur: { value: null }, tPrev: { value: null }, uMix: { value: 0 } });
    this.scene = null;
    this.hdr = null; // 장면 + 파티클
    this.down = [];
    this.up = [];
    this.ldr = [];
    this.flip = 0;
    this.hasHistory = false;
    this.w = 0;
    this.h = 0;
  }

  get depthTexture() {
    return this.scene ? this.scene.depthTexture : null;
  }

  /** @param {number} w 픽셀 폭(해상도 배율 적용 후) */
  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this._disposeTargets();
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.scene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.cfg.msaa, depthTexture: depth });
    this.hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    const half = (ww, hh) => new THREE.WebGLRenderTarget(Math.max(2, ww), Math.max(2, hh), { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    let cw = w >> 1, ch = h >> 1;
    for (let i = 0; i < this.cfg.bloomLevels; i++) { this.down.push(half(cw, ch)); if (i < this.cfg.bloomLevels - 1) this.up.push(half(cw, ch)); cw >>= 1; ch >>= 1; }
    if (this.cfg.motionBlur > 0) this.ldr = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.hasHistory = false;
    this.mComp.uniforms.uAspect.value = w / h;
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qscene, this.cam);
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {object} f sun(Vector3: 화면 xy 0~1, z 보임), flash(0~1), turn(0~1 화면 회전 빠르기), particleLayer(없으면 생략)
   */
  render(scene, camera, f) {
    const r = this.renderer;
    // 1) 장면
    camera.layers.set(0);
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    // 2) 장면 색을 복사한 뒤 그 위에 파티클 층을 그린다
    let sceneTex = this.scene.texture;
    if (f.particleLayer) {
      this.mCopy.uniforms.tSrc.value = this.scene.texture;
      this._pass(this.mCopy, this.hdr);
      const auto = r.autoClear, bg = scene.background;
      r.autoClear = false;
      scene.background = null;
      camera.layers.set(f.particleLayer);
      r.setRenderTarget(this.hdr);
      r.render(scene, camera);
      camera.layers.set(0);
      scene.background = bg;
      r.autoClear = auto;
      sceneTex = this.hdr.texture;
    }
    // 3) 블룸
    let src = sceneTex, sw = this.w, sh = this.h;
    for (let i = 0; i < this.down.length; i++) {
      const u = this.mDown.uniforms;
      u.tSrc.value = src; u.uTexel.value.set(0.5 / sw, 0.5 / sh); u.uThreshold.value = i === 0 ? this.look.bloomThreshold : 0;
      this._pass(this.mDown, this.down[i]);
      src = this.down[i].texture; sw = this.down[i].width; sh = this.down[i].height;
    }
    for (let i = this.up.length - 1; i >= 0; i--) {
      const u = this.mUp.uniforms;
      u.tSrc.value = src; u.tAdd.value = this.down[i].texture; u.uTexel.value.set(1 / sw, 1 / sh);
      this._pass(this.mUp, this.up[i]);
      src = this.up[i].texture; sw = this.up[i].width; sh = this.up[i].height;
    }
    // 4) 합성
    const c = this.mComp.uniforms;
    c.tScene.value = sceneTex; c.tBloom.value = src; c.tDepth.value = this.scene.depthTexture;
    c.uSun.value.copy(f.sun); c.uFlash.value = f.flash;
    c.uExposure.value = look.exposure * (f.exposure || 1); // 시간대별 노출
    const blur = this.cfg.motionBlur > 0 ? Math.min(this.cfg.motionBlur, this.cfg.motionBlur * f.turn) : 0;
    if (this.ldr.length === 0) { this._pass(this.mComp, null); return; }
    // 5) 모션 블러(이전 프레임과 섞기)
    const cur = this.ldr[this.flip], prev = this.ldr[1 - this.flip];
    this._pass(this.mComp, cur);
    const b = this.mBlend.uniforms;
    b.tCur.value = cur.texture; b.tPrev.value = prev.texture; b.uMix.value = this.hasHistory ? blur : 0;
    this._pass(this.mBlend, null);
    this.hasHistory = true;
    this.flip = 1 - this.flip;
  }

  _disposeTargets() {
    if (this.scene) { this.scene.depthTexture.dispose(); this.scene.dispose(); }
    if (this.hdr) this.hdr.dispose();
    for (const t of this.down) t.dispose();
    for (const t of this.up) t.dispose();
    for (const t of this.ldr) t.dispose();
    this.scene = null; this.hdr = null; this.down = []; this.up = []; this.ldr = [];
  }

  dispose() {
    this._disposeTargets();
    this.renderer.setRenderTarget(null);
    for (const m of [this.mDown, this.mUp, this.mComp, this.mBlend, this.mCopy]) m.dispose();
    this.quad.geometry.dispose();
  }
}

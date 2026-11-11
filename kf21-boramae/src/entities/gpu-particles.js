// GPU 셰이더 파티클(높음·최고). 파티클의 움직임을 전부 버텍스 셰이더에서 계산한다:
// CPU는 생성할 때 한 번 값(시작 위치·속도·수명·크기·색)을 써넣을 뿐, 매 프레임 갱신하지 않는다. 드로우콜 1개.
// 프래그먼트 셰이더는 노이즈로 뭉게뭉게한 모양을 만들고, 장면 깊이와 비교해 가장자리를 부드럽게 한다(소프트 파티클).
// 종류(kind): 0 = 연기(빛을 받는 불투명 덩어리), 1 = 불꽃(가산, HDR → 블룸), 2 = 불똥·파편(작고 밝은 점)
import * as THREE from 'three';

export const PARTICLE_LAYER = 1; // 장면 뒤에 따로 그리는 층

export class GpuParticles {
  constructor(capacity, sunDirection) {
    this.capacity = capacity;
    this.cursor = 0;
    this.time = 0;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.wrapped = false;
    this.origin = { x: 0, z: 0 };
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (name) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    this.aStart = attr('aStart'); // xyz 시작 위치(실제 좌표), w 태어난 시각
    this.aVel = attr('aVel'); // xyz 속도, w 수명
    this.aParam = attr('aParam'); // 시작 크기, 끝 크기, 중력, 감속
    this.aColor = attr('aColor'); // rgb, 종류
    geo.instanceCount = capacity;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uOrigin: { value: new THREE.Vector2() }, uDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
        uNearFar: { value: new THREE.Vector2(1, 1000) }, uSoft: { value: 0 }, uSunDir: { value: sunDirection.clone() },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aStart, aVel, aParam, aColor;
        uniform float uTime; uniform vec2 uOrigin;
        varying vec2 vUv; varying vec4 vColor; varying float vT, vDepth, vSeed, vSize;
        void main() {
          float age = uTime - aStart.w;
          float t = age / max(aVel.w, 0.0001);
          if (age < 0.0 || t >= 1.0 || aVel.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float drag = aParam.w;
          float k = drag > 0.0 ? (1.0 - exp(-drag * age)) / drag : age;
          vec3 p = aStart.xyz + aVel.xyz * k;
          p.y -= 0.5 * aParam.z * age * age;
          p.xz -= uOrigin;
          float grow = 1.0 - (1.0 - t) * (1.0 - t);
          float size = mix(aParam.x, aParam.y, grow);
          vSeed = fract(aStart.w * 13.71 + aStart.x * 0.137 + aStart.y * 0.071);
          float rot = vSeed * 6.2832 + age * (vSeed - 0.5) * 1.5;
          vec2 q = vec2(position.x * cos(rot) - position.y * sin(rot), position.x * sin(rot) + position.y * cos(rot));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          mv.xy += q * size * 2.0;
          vUv = position.xy * 2.0; vColor = aColor; vT = t; vDepth = -mv.z; vSize = size;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uDepth; uniform vec2 uRes, uNearFar; uniform float uSoft;
        varying vec2 vUv; varying vec4 vColor; varying float vT, vDepth, vSeed, vSize;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float kind = vColor.a;
          float soft = 1.0;
          if (uSoft > 0.0) {
            float d = texture2D(uDepth, gl_FragCoord.xy / uRes).r;
            float z = (2.0 * uNearFar.x * uNearFar.y) / (uNearFar.y + uNearFar.x - (d * 2.0 - 1.0) * (uNearFar.y - uNearFar.x));
            soft = clamp((z - vDepth) / (vSize * 0.7 + 0.4), 0.0, 1.0); // 다른 물체와 맞닿는 곳이 서서히 사라진다
          }
          if (kind > 1.5) { // 불똥·파편
            float a = smoothstep(1.0, 0.2, r) * (1.0 - vT * vT) * soft;
            gl_FragColor = vec4(vColor.rgb * 3.5 * a, a * 0.5);
          } else {
            float n = noise(vUv * 2.2 + vSeed * 31.0) * 0.6 + noise(vUv * 5.0 + vSeed * 57.0) * 0.4;
            float shape = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.7);
            if (kind > 0.5) { // 불꽃
              float a = shape * pow(1.0 - vT, 1.4) * soft;
              vec3 col = mix(vColor.rgb, vColor.rgb * vec3(1.0, 0.45, 0.2), vT) * 2.4;
              gl_FragColor = vec4(col * a, a * 0.3);
            } else { // 연기: 위쪽이 밝고 아래쪽이 어둡다
              float a = shape * smoothstep(0.0, 0.1, vT) * (1.0 - vT) * 0.8 * soft;
              float light = 0.62 + 0.38 * (vUv.y * 0.5 + 0.5) + (n - 0.5) * 0.25;
              gl_FragColor = vec4(vColor.rgb * light * a, a);
            }
          }
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(PARTICLE_LAYER);
    this.mesh.name = 'gpu-particles';
    this._c = new THREE.Color();
    this.limit = capacity;
  }

  /** CPU 파티클과 같은 인자 + kind. 위치는 렌더 좌표로 받는다. */
  spawn(x, y, z, vx, vy, vz, life, size0, size1, colorHex, gravity, drag, kind = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    if (this.cursor === 0) this.wrapped = true;
    const k = i * 4;
    const s = this.aStart.array, v = this.aVel.array, p = this.aParam.array, c = this.aColor.array;
    s[k] = x + this.origin.x; s[k + 1] = y; s[k + 2] = z + this.origin.z; s[k + 3] = this.time;
    v[k] = vx; v[k + 1] = vy; v[k + 2] = vz; v[k + 3] = life;
    p[k] = size0; p[k + 1] = size1; p[k + 2] = gravity; p[k + 3] = drag;
    this._c.setHex(colorHex);
    c[k] = this._c.r; c[k + 1] = this._c.g; c[k + 2] = this._c.b; c[k + 3] = kind;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** 렌더 프레임마다: 시간·유니폼 갱신, 이번 프레임에 생긴 구간만 GPU에 올린다. */
  update(dt, camera, origin, depthTexture, width, height) {
    this.time += dt;
    this.origin = origin;
    const u = this.mat.uniforms;
    u.uTime.value = this.time;
    u.uOrigin.value.set(origin.x, origin.z);
    u.uDepth.value = depthTexture;
    u.uSoft.value = depthTexture ? 1 : 0;
    u.uRes.value.set(width, height);
    u.uNearFar.value.set(camera.near, camera.far);
    if (this.dirtyMax >= 0) {
      for (const a of [this.aStart, this.aVel, this.aParam, this.aColor]) {
        if (!this.wrapped) a.addUpdateRange(this.dirtyMin * 4, (this.dirtyMax - this.dirtyMin + 1) * 4);
        a.needsUpdate = true;
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -1;
      this.wrapped = false;
    }
  }

  shift() { /* 실제 좌표로 저장하므로 원점 재배치 때 할 일이 없다 */ }

  clear() {
    this.aVel.array.fill(0);
    this.aVel.needsUpdate = true;
    this.cursor = 0;
    this.time = 0;
    this.aStart.array.fill(0);
    this.aStart.needsUpdate = true;
  }

  get count() { return 0; }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

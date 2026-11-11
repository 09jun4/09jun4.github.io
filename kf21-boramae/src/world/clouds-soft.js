// 부드러운 구름(높음·최고): 볼류메트릭 느낌을 여러 겹의 빌보드로 낸다.
// 구름 한 덩이를 카메라를 향한 판 여러 장으로 겹치고, 프래그먼트 셰이더에서 노이즈로 뭉게뭉게한 밀도,
// 가짜 구면 법선으로 햇빛 음영, 해를 등진 가장자리의 밝은 림(은빛 테두리)을 만든다.
// 레이마칭 대신 이 방식을 고른 이유: 화면 전체를 수십 번 샘플링하는 레이마칭보다 훨씬 가볍고, 기체가 구름 사이를
// 지나갈 때 깊이 판정이 자연스럽다. 배치·순환(wrap)은 로우폴리 구름과 같은 규칙이라 무한 하늘이 유지된다.
// 충돌·시야 흐림 효과는 없다.
import * as THREE from 'three';
import { makeRng, randRange } from '../core/math.js';

function buildLayer(layer, shared, sprites) {
  const rng = makeRng(layer.seed);
  const centers = [], offsets = [], sizes = [], seeds = [];
  const bands = layer.bands || [{ yMin: -layer.yWrap, yMax: layer.yWrap, weight: 1, size: layer.size }];
  const totalWeight = bands.reduce((s, b) => s + b.weight, 0);
  for (let c = 0; c < layer.clouds; c++) {
    let pick = rng() * totalWeight;
    let band = bands[0];
    for (const b of bands) { pick -= b.weight; if (pick <= 0) { band = b; break; } }
    const cx = rng() * layer.period, cz = rng() * layer.period;
    const cy = randRange(rng, band.yMin, band.yMax);
    const size = randRange(rng, band.size[0], band.size[1]);
    const n = Math.round(randRange(rng, layer.puffs[0], layer.puffs[1]));
    const stretch = rng() * Math.PI;
    for (let p = 0; p < n; p++) {
      const first = p === 0;
      const r = first ? 0 : size * layer.spread * Math.sqrt(rng());
      const a = stretch + (rng() - 0.5) * 1.6 + (rng() < 0.5 ? 0 : Math.PI);
      const s = size * (first ? 1 : randRange(rng, 0.45, 0.85));
      // 덩이 하나를 판 여러 장으로: 조금씩 어긋나게 겹친다
      for (let k = 0; k < sprites; k++) {
        const j = k === 0 ? 0 : 0.45;
        centers.push(cx, cy, cz);
        offsets.push(Math.cos(a) * r + (rng() - 0.5) * s * j * 2, (rng() - 0.35) * size * 0.35 + (rng() - 0.5) * s * j * layer.flatten, Math.sin(a) * r * 0.7 + (rng() - 0.5) * s * j * 2);
        sizes.push(s * randRange(rng, 0.95, 1.35) * (k === 0 ? 1.15 : 0.8), layer.flatten * randRange(rng, 0.9, 1.25));
        seeds.push(rng());
      }
    }
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3));
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 2));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  const total = seeds.length;
  geo.instanceCount = total;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uCam: { value: new THREE.Vector3() }, uPeriod: { value: layer.period }, uYWrap: { value: layer.yWrap || 0 },
      uFade: { value: new THREE.Vector2(layer.fade[0], layer.fade[1]) }, uNearFade: { value: new THREE.Vector2(layer.nearFade[0], layer.nearFade[1]) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aCenter, aOffset; attribute vec2 aSize; attribute float aSeed;
      uniform vec3 uCam; uniform float uPeriod, uYWrap; uniform vec2 uFade, uNearFade;
      varying vec2 vUv; varying float vSeed, vK, vDist; varying vec3 vWorld;
      void main() {
        vec3 rel;
        rel.xz = mod(aCenter.xz - uCam.xz + 0.5 * uPeriod, uPeriod) - 0.5 * uPeriod;
        rel.y = uYWrap > 0.0 ? mod(aCenter.y - uCam.y + uYWrap, 2.0 * uYWrap) - uYWrap : aCenter.y - uCam.y;
        float k = 1.0 - smoothstep(uFade.x, uFade.y, length(rel.xz) / (0.5 * uPeriod));
        if (uYWrap > 0.0) k *= 1.0 - smoothstep(0.75, 1.0, abs(rel.y) / uYWrap);
        if (uNearFade.y > 0.0) k *= smoothstep(uNearFade.x, uNearFade.y, length(rel));
        vec3 world = cameraPosition + rel + aOffset * k;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        mv.xy += position.xy * vec2(aSize.x, aSize.x * aSize.y * 1.25) * k;
        vUv = position.xy; vSeed = aSeed; vK = k; vWorld = world; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uFogColor, uLit, uShade, uUnder, uRim; uniform vec2 uCloudFog; uniform float uOpacity;
      varying vec2 vUv; varying float vSeed, vK, vDist; varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float r = length(vUv);
        if (r > 1.0 || vK < 0.01) discard;
        vec2 q = vUv * 2.1 + vSeed * 40.0;
        float n = noise(q) * 0.5 + noise(q * 2.3 + 7.0) * 0.3 + noise(q * 5.1 + 3.0) * 0.2;
        float density = smoothstep(1.0, 0.18, r + (n - 0.5) * 0.95);
        if (density < 0.01) discard;
        // 가짜 구면 법선(뷰 공간) → 햇빛 방향과 비교해 밝은 쪽·그늘 쪽을 만든다
        vec3 nrm = normalize(vec3(vUv, sqrt(max(0.0, 1.0 - r * r)) + 0.35));
        vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
        float diff = dot(nrm, sunV) * 0.5 + 0.5;
        vec3 col = mix(uShade, uLit, smoothstep(0.25, 0.85, diff + (n - 0.5) * 0.3));
        col = mix(col, uUnder, smoothstep(0.1, -0.9, vUv.y) * 0.4);
        // 태양광 산란: 해 쪽을 바라볼 때 구름의 얇은 가장자리가 밝게 빛난다
        vec3 viewDir = normalize(vWorld - cameraPosition);
        float toward = pow(max(dot(viewDir, uSunDir), 0.0), 5.0);
        col += uRim * toward * (1.0 - density) * 2.2 + uRim * toward * 0.25;
        float fog = smoothstep(uCloudFog.x, uCloudFog.y, vDist);
        col = mix(col, uFogColor, fog);
        float a = density * uOpacity * (1.0 - fog * 0.35) * smoothstep(0.0, 0.25, vK);
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  mesh.name = 'clouds-soft';
  return { mesh, geo, mat, total, period: layer.period };
}

/**
 * @param {object} cfg data/world.js 의 clouds
 * @param {number} sprites 덩이 하나에 겹치는 판 수(높음 3, 최고 5)
 */
export function createSoftClouds(cfg, sky, sunDirection, sprites) {
  const shared = {
    uSunDir: { value: sunDirection.clone() }, uFogColor: { value: new THREE.Color(sky.horizon) },
    uCloudFog: { value: new THREE.Vector2(cfg.fogNear, cfg.fogFar) },
    uLit: { value: new THREE.Color(cfg.soft.lit) }, uShade: { value: new THREE.Color(cfg.soft.shade) }, uUnder: { value: new THREE.Color(cfg.soft.under) },
    uRim: { value: new THREE.Color(cfg.soft.rim) }, uOpacity: { value: cfg.soft.opacity },
  };
  const layers = [buildLayer(cfg.main, shared, sprites), buildLayer(cfg.near, shared, Math.max(1, sprites - 2))];
  const group = new THREE.Group();
  group.name = 'cloud-layers-soft';
  for (const l of layers) group.add(l.mesh);
  return {
    group,
    setFraction(f) { for (const l of layers) l.geo.instanceCount = Math.max(1, Math.floor(l.total * f)); },
    update(camPos, origin) {
      for (const l of layers) { const p = l.period; l.mat.uniforms.uCam.value.set((((camPos.x + origin.x) % p) + p) % p, camPos.y, (((camPos.z + origin.z) % p) + p) % p); }
    },
    get triangles() { return layers.reduce((s, l) => s + l.geo.instanceCount * 2, 0); },
    dispose() { for (const l of layers) { l.geo.dispose(); l.mat.dispose(); } },
  };
}

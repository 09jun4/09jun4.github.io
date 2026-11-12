// 구름: 로우폴리 덩어리(퍼프)를 뭉쳐 만든 구름을 인스턴싱으로 그린다(층마다 드로우콜 1).
// 구름 중심을 버텍스 셰이더에서 카메라 기준으로 순환(wrap)시키므로 CPU 갱신 없이 끝없이 이어진다.
// 순환 경계에서는 크기를 0으로 줄여 튀는 것을 숨긴다. 충돌·시야 효과는 없다.
import * as THREE from 'three';
import { makeRng, randRange } from '../core/math.js';

/** 울퉁불퉁한 로우폴리 덩어리 하나(모든 퍼프가 공유) */
function buildPuffGeometry(detail, seed) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  const pos = base.attributes.position;
  const rng = makeRng(seed);
  const moved = new Map(); // 같은 위치의 정점은 같이 움직여야 틈이 안 생긴다
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = moved.get(key);
    if (k === undefined) { k = randRange(rng, 0.8, 1.16); moved.set(key, k); }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos);
  return g;
}

function buildLayer(layer, sharedUniforms, puffGeo, colors) {
  const rng = makeRng(layer.seed);
  const centers = [];
  const offsets = [];
  const scales = [];
  const rots = [];
  const bands = layer.bands || [{ yMin: -layer.yWrap, yMax: layer.yWrap, weight: 1, size: layer.size }];
  const totalWeight = bands.reduce((s, b) => s + b.weight, 0);
  for (let c = 0; c < layer.clouds; c++) {
    let pick = rng() * totalWeight;
    let band = bands[0];
    for (const b of bands) { pick -= b.weight; if (pick <= 0) { band = b; break; } }
    const cx = rng() * layer.period;
    const cz = rng() * layer.period;
    const cy = randRange(rng, band.yMin, band.yMax);
    const size = randRange(rng, band.size[0], band.size[1]);
    const n = Math.round(randRange(rng, layer.puffs[0], layer.puffs[1]));
    const stretch = rng() * Math.PI; // 구름이 길게 늘어지는 방향
    for (let p = 0; p < n; p++) {
      const first = p === 0;
      const r = first ? 0 : size * layer.spread * Math.sqrt(rng());
      const a = stretch + (rng() - 0.5) * 1.6 + (rng() < 0.5 ? 0 : Math.PI);
      const s = size * (first ? 1 : randRange(rng, 0.45, 0.85));
      centers.push(cx, cy, cz);
      offsets.push(Math.cos(a) * r, (rng() - 0.35) * size * 0.35, Math.sin(a) * r * 0.7);
      scales.push(s * randRange(rng, 0.9, 1.25), s * layer.flatten * randRange(rng, 0.85, 1.2), s * randRange(rng, 0.8, 1.1));
      rots.push(rng() * Math.PI * 2);
    }
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', puffGeo.attributes.position);
  geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3));
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 3));
  geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(new Float32Array(rots), 1));
  const total = rots.length;
  geo.instanceCount = total;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...sharedUniforms,
      uCam: { value: new THREE.Vector3() }, // 카메라의 실제 좌표를 period로 접은 값(y는 그대로)
      uPeriod: { value: layer.period },
      uYWrap: { value: layer.yWrap || 0 },
      uFade: { value: new THREE.Vector2(layer.fade[0], layer.fade[1]) },
      uNearFade: { value: new THREE.Vector2(layer.nearFade[0], layer.nearFade[1]) },
      uLit: { value: new THREE.Color(colors.lit) },
      uShade: { value: new THREE.Color(colors.shade) },
      uUnder: { value: new THREE.Color(colors.under) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aCenter, aOffset, aScale;
      attribute float aRot;
      uniform vec3 uCam;
      uniform float uPeriod, uYWrap;
      uniform vec2 uFade, uNearFade;
      varying vec3 vWorld;
      void main() {
        vec3 rel;
        rel.xz = mod(aCenter.xz - uCam.xz + 0.5 * uPeriod, uPeriod) - 0.5 * uPeriod;
        rel.y = uYWrap > 0.0 ? mod(aCenter.y - uCam.y + uYWrap, 2.0 * uYWrap) - uYWrap : aCenter.y - uCam.y;
        float edge = length(rel.xz) / (0.5 * uPeriod);
        float k = 1.0 - smoothstep(uFade.x, uFade.y, edge);
        if (uYWrap > 0.0) k *= 1.0 - smoothstep(0.75, 1.0, abs(rel.y) / uYWrap);
        if (uNearFade.y > 0.0) k *= smoothstep(uNearFade.x, uNearFade.y, length(rel));
        float c = cos(aRot), s = sin(aRot);
        vec3 p = position * aScale;
        p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
        vec3 world = cameraPosition + rel + (aOffset + p) * k;
        vWorld = world;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uFogColor, uLit, uShade, uUnder;
      uniform vec2 uCloudFog;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float sun = dot(n, uSunDir);
        vec3 col = mix(uShade, uLit, smoothstep(-0.25, 0.55, sun));
        col = mix(col, uUnder, smoothstep(0.1, 0.9, -n.y) * 0.75);
        float fog = smoothstep(uCloudFog.x, uCloudFog.y, distance(vWorld, cameraPosition));
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'clouds';
  return { mesh, geo, mat, total, period: layer.period };
}

/**
 * @param {object} cfg data/world.js 의 clouds
 * @param {object} sky data/world.js 의 sky
 * @param {THREE.Vector3} sunDirection
 */
export function createClouds(cfg, sky, sunDirection) {
  const shared = {
    uSunDir: { value: sunDirection.clone() },
    uFogColor: { value: new THREE.Color(sky.horizon) },
    uCloudFog: { value: new THREE.Vector2(cfg.fogNear, cfg.fogFar) },
  };
  const puffMain = buildPuffGeometry(1, 5);
  const puffNear = buildPuffGeometry(0, 9);
  const layers = [buildLayer(cfg.main, shared, puffMain, cfg), buildLayer(cfg.near, shared, puffNear, cfg)];
  const puffTris = [puffMain.attributes.position.count / 3, puffNear.attributes.position.count / 3];
  const group = new THREE.Group();
  group.name = 'cloud-layers';
  for (const l of layers) group.add(l.mesh);

  let fraction = 1;
  /** 구름 밀도(0~1). 품질 설정에 따라 인스턴스 수만 줄인다(재생성 없음). */
  function setFraction(f) {
    fraction = f;
    for (const l of layers) l.geo.instanceCount = Math.max(1, Math.floor(l.total * f));
  }

  function update(camPos, origin) {
    for (const l of layers) {
      const p = l.period;
      l.mat.uniforms.uCam.value.set((((camPos.x + origin.x) % p) + p) % p, camPos.y, (((camPos.z + origin.z) % p) + p) % p);
    }
  }

  /** 시간대: 구름 색·해 방향·안개색 */
  function setLook(c, sunDir, fog) { for (const l of layers) { const u = l.mat.uniforms; u.uLit.value.set(c.lit); u.uShade.value.set(c.shade); u.uUnder.value.set(c.under); u.uSunDir.value.copy(sunDir); u.uFogColor.value.set(fog); } }

  return {
    setLook,
    group, update, setFraction,
    get triangles() { return layers.reduce((s, l, i) => s + l.geo.instanceCount * puffTris[i], 0); },
  };
}

// 원경 지형: 격자 1장(드로우콜 1). 버텍스 셰이더에서 월드 좌표 노이즈로 높이를 만들고,
// 삼각형마다 단색(flat) + 미분 법선으로 로우폴리 느낌을 낸다. 거리 안개로 수평선에 녹아든다.
// 격자는 카메라를 한 칸 단위로 따라가므로 지형이 미끄러지지 않는다.
import * as THREE from 'three';

export function createTerrain(cfg, sky, sunDirection) {
  const geo = buildGrid(cfg.size, cfg.segments);
  const c = cfg.colors;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uOffset: { value: new THREE.Vector2() }, // 격자 원점의 실제 월드 좌표(노이즈 주기로 접은 값)
      uCell: { value: cfg.noiseCell },
      uPeriod: { value: cfg.noisePeriod },
      uHeight: { value: cfg.heightMax },
      uSea: { value: cfg.seaLevel },
      uSunDir: { value: sunDirection.clone() },
      uFogColor: { value: new THREE.Color(sky.horizon) },
      uFog: { value: new THREE.Vector2(cfg.fogNear, cfg.fogFar) },
      uSeaColor: { value: new THREE.Color(c.sea) },
      uShore: { value: new THREE.Color(c.shore) },
      uLow: { value: new THREE.Color(c.low) },
      uMid: { value: new THREE.Color(c.mid) },
      uHigh: { value: new THREE.Color(c.high) },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uOffset;
      uniform float uCell, uPeriod, uHeight, uSea;
      uniform vec3 uSeaColor, uShore, uLow, uMid, uHigh;
      attribute vec2 aCenter;
      varying vec3 vColor;
      varying vec3 vWorld;

      float hash(vec2 p) {
        p = mod(p, uPeriod);
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p, float period) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(mod(i, period));
        float b = hash(mod(i + vec2(1.0, 0.0), period));
        float c = hash(mod(i + vec2(0.0, 1.0), period));
        float d = hash(mod(i + vec2(1.0, 1.0), period));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float landAt(vec2 w) {
        float n = vnoise(w, uPeriod) * 0.56 + vnoise(w * 2.0 + 17.0, uPeriod * 2.0) * 0.29 + vnoise(w * 4.0 + 41.0, uPeriod * 4.0) * 0.15;
        return max(n - uSea, 0.0) / (1.0 - uSea);
      }
      void main() {
        vec3 pos = (modelMatrix * vec4(position, 1.0)).xyz;
        float land = landAt((position.xz + uOffset) / uCell);
        pos.y = land * land * 2.2 * uHeight;
        // 색은 삼각형 무게중심에서 정한다(세 정점이 같은 값 → 면 단색)
        vec2 wc = (aCenter + uOffset) / uCell;
        float lc = landAt(wc);
        float jitter = hash(floor(wc * 40.0));
        vec3 col = uSeaColor * (0.9 + 0.16 * jitter);
        if (lc > 0.0) {
          col = mix(uShore, uLow, smoothstep(0.0, 0.07, lc));
          col = mix(col, uMid, smoothstep(0.1, 0.32, lc));
          col = mix(col, uHigh, smoothstep(0.34, 0.6, lc));
          col *= 0.86 + 0.28 * jitter;
        }
        vColor = col;
        vWorld = pos;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uFogColor;
      uniform vec2 uFog;
      varying vec3 vColor;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float light = 0.5 + 0.6 * max(dot(n, uSunDir), 0.0);
        vec3 col = vColor * light;
        float fog = smoothstep(uFog.x, uFog.y, distance(vWorld, cameraPosition));
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'terrain';
  const cell = cfg.size / cfg.segments;
  const worldPeriod = cfg.noiseCell * cfg.noisePeriod;

  /**
   * @param {THREE.Vector3} camPos 카메라 위치(렌더 좌표)
   * @param {{x:number,z:number}} origin 누적 원점 오프셋(실제 좌표 = 렌더 좌표 + origin)
   */
  function update(camPos, origin) {
    const tx = Math.round((camPos.x + origin.x) / cell) * cell;
    const tz = Math.round((camPos.z + origin.z) / cell) * cell;
    mesh.position.set(tx - origin.x, 0, tz - origin.z);
    mat.uniforms.uOffset.value.set(((tx % worldPeriod) + worldPeriod) % worldPeriod, ((tz % worldPeriod) + worldPeriod) % worldPeriod);
  }
  return { mesh, update, triangles: cfg.segments * cfg.segments * 2 };
}

/**
 * xz 평면 격자(비인덱스). 삼각형마다 무게중심(aCenter)을 넣어 두고 색을 거기서 정하므로
 * 면 하나하나가 단색으로 구분되는 로우폴리 지형이 된다. 대각선 방향은 번갈아 바꾼다.
 */
function buildGrid(size, seg) {
  const tris = seg * seg * 2;
  const pos = new Float32Array(tris * 9);
  const cen = new Float32Array(tris * 6);
  const at = (i, j) => [(i / seg - 0.5) * size, (j / seg - 0.5) * size];
  let t = 0;
  const push = (p, q, r) => {
    const cx = (p[0] + q[0] + r[0]) / 3;
    const cz = (p[1] + q[1] + r[1]) / 3;
    for (const v of [p, q, r]) {
      pos[t * 3] = v[0]; pos[t * 3 + 1] = 0; pos[t * 3 + 2] = v[1];
      cen[t * 2] = cx; cen[t * 2 + 1] = cz;
      t++;
    }
  };
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      if ((i + j) % 2 === 0) { push(a, c, b); push(b, c, d); } else { push(a, d, b); push(a, c, d); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCenter', new THREE.BufferAttribute(cen, 2));
  return g;
}

// 엔진 불꽃(높음·최고): 3겹 원뿔 메시 + 셰이더 노이즈로 일렁임, 충격파 다이아몬드(마하 디스크),
// 고온 코어(청백색) → 가장자리(주황·적색) 그라데이션. 출력과 애프터버너 정도에 따라 길이·밝기·색이 변한다.
// 가산 혼합 + HDR 값이라 후처리 블룸에 자연스럽게 걸린다. 드로우콜 1개.
import * as THREE from 'three';
import { damp, lerp } from '../../core/math.js';

const TAU = Math.PI * 2;

/**
 * @param {object} o
 * @param {number[][]} o.nozzles 노즐 중심 [x, y] 목록
 * @param {number} o.z 노즐 끝의 z
 * @param {number} o.radius 노즐 반지름
 * @param {number} o.segments 둘레 분할
 * @param {object} o.cfg data/fx.js 의 flame 설정
 * @param {object} o.colors { core, mid, edge } (16진수)
 */
export function createFlame({ nozzles, z, radius, segments, cfg, colors }) {
  const pos = [], aT = [], aLayer = [], aAng = [], idx = [];
  const rows = 14;
  const layers = [{ r: 1.0, len: 1.0 }, { r: 0.68, len: 0.82 }, { r: 0.4, len: 0.6 }];
  for (const [cx, cy] of nozzles) {
    layers.forEach((L, li) => {
      const base = pos.length / 3;
      for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        for (let i = 0; i <= segments; i++) {
          const a = (i / segments) * TAU;
          const r = radius * L.r * 0.86;
          pos.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, t * L.len);
          aT.push(t); aLayer.push(li); aAng.push(a);
        }
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < segments; i++) { const q = base + j * (segments + 1) + i; idx.push(q, q + 1, q + segments + 1, q + 1, q + segments + 2, q + segments + 1); }
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(aLayer, 1));
  geo.setAttribute('aAng', new THREE.Float32BufferAttribute(aAng, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 5), 14);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uLength: { value: 2 }, uPower: { value: 0.3 }, uBoost: { value: 0 },
      uCore: { value: new THREE.Color(colors.core) }, uMid: { value: new THREE.Color(colors.mid) }, uEdge: { value: new THREE.Color(colors.edge) },
      uDiamonds: { value: cfg.diamonds }, uAxis: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `
      attribute float aT, aLayer, aAng;
      uniform float uTime, uLength, uBoost, uPower;
      varying float vT, vLayer, vAng;
      varying vec3 vView, vNormal;
      void main() {
        vT = aT; vLayer = aLayer; vAng = aAng;
        vec3 p = position;
        // 노즐에서 멀어질수록 가늘어진다. 애프터버너에서는 처음에 살짝 부풀었다 조여든다
        float taper = pow(1.0 - aT, mix(0.75, 0.5, uBoost)) * (1.0 + uBoost * 0.16 * sin(aT * 3.14159));
        float wob = sin(aT * 17.0 - uTime * 31.0 + aAng * 3.0) * 0.018 * aT * (0.5 + uBoost);
        vec2 dir = vec2(cos(aAng), sin(aAng));
        // 반지름만 줄인다: 원래 위치 = 축 + dir * r  →  축 + dir * r * taper
        float r0 = ${radius.toFixed(4)} * 0.86 * (aLayer < 0.5 ? 1.0 : (aLayer < 1.5 ? 0.68 : 0.4));
        p.xy = position.xy - dir * r0 * (1.0 - taper) + dir * wob;
        p.z = position.z * uLength;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz;
        vNormal = normalize(normalMatrix * vec3(dir, 0.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uBoost, uDiamonds;
      uniform vec3 uCore, uMid, uEdge;
      varying float vT, vLayer, vAng;
      varying vec3 vView, vNormal;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float n = noise(vec2(vAng * 2.5, vT * 9.0 - uTime * 22.0)) * 0.6 + noise(vec2(vAng * 6.0 + 3.0, vT * 22.0 - uTime * 41.0)) * 0.4;
        // 옆에서 볼 때 가장자리가 얇아 보이게(속이 빈 원뿔이 아니라 빛 덩어리처럼)
        float facing = abs(dot(normalize(vView), normalize(vNormal)));
        float body = mix(0.35, 1.0, facing);
        float fade = pow(1.0 - vT, mix(2.2, 1.25, uBoost));
        // 충격파 다이아몬드: 안쪽 겹에서만, 애프터버너일 때 뚜렷하다
        float dia = pow(0.5 + 0.5 * cos(vT * uDiamonds * 6.2832 - 0.6), 8.0) * (1.0 - vT) * step(0.5, vLayer) * uBoost;
        vec3 col = vLayer > 1.5 ? uCore : (vLayer > 0.5 ? mix(uCore, uMid, smoothstep(0.0, 0.7, vT)) : mix(uMid, uEdge, smoothstep(0.0, 0.8, vT)));
        // 출력이 낮으면 푸르스름하고 옅게, 애프터버너면 주황빛으로 밝게
        col = mix(col * vec3(0.45, 0.6, 1.0), col, uBoost);
        float a = fade * body * (0.5 + 0.6 * n) * mix(0.3, 0.62, uBoost) * (0.4 + uPower * 0.6);
        vec3 outc = col * a * mix(0.9, 1.5, uBoost) + (uCore * 0.6 + vec3(0.25)) * dia * (0.3 + 0.7 * facing);
        // 밝은 낮 하늘 위에서도 불꽃 색이 살도록, 순수 가산이 아니라 뒤를 조금 가리며 더한다
        gl_FragColor = vec4(outc, clamp(a * 0.75 + dia * 0.3, 0.0, 0.9));
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = z - 0.12;
  mesh.renderOrder = 5;
  mesh.name = 'flame';
  const st = { power: 0.3, boost: 0 };
  return {
    mesh,
    /** @param {number} power 0~1 추력 @param {number} boost 0~1 애프터버너 */
    set(power, boost, time, dt) {
      st.power = damp(st.power, power, cfg.tau, dt);
      st.boost = damp(st.boost, boost, boost > st.boost ? cfg.igniteTau : cfg.fadeTau, dt);
      const u = mat.uniforms;
      u.uTime.value = time;
      u.uPower.value = st.power;
      u.uBoost.value = st.boost;
      u.uLength.value = lerp(lerp(cfg.lengthIdle, cfg.lengthMil, st.power), cfg.lengthAb, st.boost) * (1 + Math.sin(time * 47) * 0.03);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

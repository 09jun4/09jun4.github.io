// 하늘: 그라데이션 돔 + 해. 카메라를 따라다니고 깊이를 쓰지 않는다.
import * as THREE from 'three';

export function createSky(cfg, sunDirection) {
  const geo = new THREE.IcosahedronGeometry(cfg.radius, 3);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(cfg.zenith) },
      uMid: { value: new THREE.Color(cfg.mid) },
      uHorizon: { value: new THREE.Color(cfg.horizon) },
      uBelow: { value: new THREE.Color(cfg.below) },
      uSunColor: { value: new THREE.Color(cfg.sunColor) },
      uSunDir: { value: sunDirection.clone() },
      uSunSize: { value: cfg.sunSize },
      uSunGlow: { value: cfg.sunGlow },
      uStars: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
        gl_Position = p.xyww; // 항상 가장 먼 깊이
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uMid, uHorizon, uBelow, uSunColor, uSunDir;
      uniform float uSunSize, uSunGlow, uStars;
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0
          ? mix(mix(uHorizon, uMid, smoothstep(0.0, 0.22, h)), uZenith, smoothstep(0.18, 0.85, h))
          : mix(uHorizon, uBelow, smoothstep(0.0, -0.12, h));
        if (uStars > 0.0 && h > 0.0) { // 별: 방향을 칸으로 나눠 일부 칸에만 점을 찍는다
          vec3 q = d * 190.0; vec3 cell = floor(q); float r = hash3(cell);
          float star = step(0.992, r) * smoothstep(0.42, 0.0, length(fract(q) - 0.5)) * (0.5 + 0.5 * hash3(cell + 3.1));
          col += vec3(0.9, 0.95, 1.0) * star * uStars * smoothstep(0.0, 0.25, h);
        }
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (smoothstep(uSunSize, uSunSize + 0.0002, s) + pow(s, 28.0) * uSunGlow + pow(s, 6.0) * uSunGlow * 0.25);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

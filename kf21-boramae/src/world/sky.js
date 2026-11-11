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
      uniform float uSunSize, uSunGlow;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0
          ? mix(mix(uHorizon, uMid, smoothstep(0.0, 0.22, h)), uZenith, smoothstep(0.18, 0.85, h))
          : mix(uHorizon, uBelow, smoothstep(0.0, -0.12, h));
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

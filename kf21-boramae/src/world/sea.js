// 바다(해안 미션): 해안선 너머를 덮는 큰 평면 하나. 물결은 셰이더에서 법선을 흘려 만든다(삼각형 2개, 텍스처 없음).
import * as THREE from 'three';
import { GROUND } from './ground.js';

export function createSea(sky, sunDirection) {
  const span = 90000;
  const geo = new THREE.PlaneGeometry(span * 2, span);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -span / 2); // 해안선(z = 0)에서 앞쪽(-z)으로
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSunDir: { value: sunDirection.clone() }, uFogColor: { value: new THREE.Color(sky.horizon) },
      uDeep: { value: new THREE.Color(0x1f5c8e) }, uShallow: { value: new THREE.Color(0x4f98b8) }, uSun: { value: new THREE.Color(0xfff2dc) },
      uFog: { value: new THREE.Vector2(4000, 30000) }, uOrigin: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunDir, uFogColor, uDeep, uShallow, uSun; uniform vec2 uFog, uOrigin;
      varying vec3 vWorld;
      void main() {
        vec2 p = (vWorld.xz + uOrigin) * 0.012;
        // 흐르는 법선: 방향이 다른 물결 세 겹
        vec2 g = vec2(0.0);
        g += vec2(cos(p.x * 1.3 + uTime * 0.9), cos(p.y * 1.1 - uTime * 0.7)) * 0.5;
        g += vec2(cos((p.x + p.y) * 2.7 - uTime * 1.3), cos((p.x - p.y) * 2.3 + uTime * 1.1)) * 0.3;
        g += vec2(cos(p.x * 6.1 + uTime * 2.1), cos(p.y * 5.3 + uTime * 1.7)) * 0.12;
        vec3 n = normalize(vec3(g.x * 0.22, 1.0, g.y * 0.22));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float shore = smoothstep(0.0, 900.0, -(vWorld.z + uOrigin.y) + COAST_Z);
        vec3 col = mix(uShallow, uDeep, shore);
        col = mix(col, uFogColor, fres * 0.55);
        col *= 0.55 + 0.45 * max(dot(n, uSunDir), 0.0);
        col += uSun * pow(max(dot(reflect(-uSunDir, n), v), 0.0), 90.0) * 0.9;
        float d = distance(cameraPosition, vWorld);
        gl_FragColor = vec4(mix(col, uFogColor, smoothstep(uFog.x, uFog.y, d)), 1.0);
        #include <colorspace_fragment>
      }`.replace('COAST_Z', GROUND.coastZ.toFixed(1)),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sea';
  mesh.frustumCulled = false;
  mesh.visible = false;
  // 모래톱: 해안선을 따라 놓는 띠(직선 경계를 덜 딱딱하게)
  const sandGeo = new THREE.PlaneGeometry(span * 2, 260);
  sandGeo.rotateX(-Math.PI / 2);
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshLambertMaterial({ color: 0xc9bd92 }));
  sand.position.set(0, -0.5, 130);
  mesh.add(sand);
  return {
    mesh,
    /** 프레임마다: 카메라 x를 따라가서 좌우로 끝없이 이어진다 */
    update(camPos, origin, dt) {
      mat.uniforms.uTime.value += dt;
      mesh.position.set(Math.round(camPos.x / 500) * 500, GROUND.height + GROUND.seaLift, GROUND.coastZ - origin.z);
      mat.uniforms.uOrigin.value.set(origin.x, origin.z);
    },
    setLook(sunDir, fog, sunColor, tint) {
      const u = mat.uniforms;
      u.uSunDir.value.copy(sunDir); u.uFogColor.value.set(fog); u.uSun.value.set(sunColor);
      u.uDeep.value.set(0x1f5c8e).multiply(tint); u.uShallow.value.set(0x4f98b8).multiply(tint);
      sand.material.color.set(0xc9bd92);
    },
    dispose() { geo.dispose(); mat.dispose(); sandGeo.dispose(); sand.material.dispose(); },
  };
}

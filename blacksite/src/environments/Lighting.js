// 구역별 조명. 맵 JSON의 zones[].lights 로 설정하며 그림자는 shadow:true인 조명(1~2개)만 사용한다.
import * as THREE from 'three';

export function buildLighting(scene, map, { shadows = true, shadowMapSize = 1024 } = {}) {
  const lights = [];
  const h = map.hemisphere || {};
  const hemi = new THREE.HemisphereLight(h.sky || '#8ea0b4', h.ground || '#2a2622', h.intensity ?? 0.3);
  scene.add(hemi);
  lights.push(hemi);
  for (const zone of map.zones) {
    for (const L of zone.lights || []) {
      let light;
      if (L.spot) {
        light = new THREE.SpotLight(L.color, L.intensity, L.distance || 15, L.angle || 1.15, L.penumbra ?? 0.7, L.decay ?? 1.6);
        light.position.set(...L.pos);
        light.target.position.set(L.pos[0], 0, L.pos[2]);
        scene.add(light.target);
      } else {
        light = new THREE.PointLight(L.color, L.intensity, L.distance || 12, L.decay ?? 1.6);
        light.position.set(...L.pos);
      }
      light.userData.zone = zone.id;
      light.userData.baseIntensity = L.intensity;
      light.userData.shadowCapable = !!L.shadow;
      if (L.shadow) {
        light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        light.shadow.bias = -0.0006;
        light.shadow.normalBias = 0.02;
        light.shadow.camera.near = 0.3;
        light.shadow.camera.far = L.distance || 15;
        light.castShadow = shadows;
      }
      scene.add(light);
      lights.push(light);
    }
  }
  return {
    lights,
    hemi,
    setShadows(on) { for (const l of lights) if (l.userData.shadowCapable) l.castShadow = on; },
    dispose() { for (const l of lights) { l.parent?.remove(l); l.dispose?.(); if (l.target) l.target.parent?.remove(l.target); } },
  };
}


// 조명: 방향광(해) + 반구광. 그림자는 쓰지 않는다(성능 우선).
import * as THREE from 'three';

export function createLighting(scene, cfg, sunDirection) {
  const hemi = new THREE.HemisphereLight(cfg.skyColor, cfg.groundColor, cfg.hemiIntensity);
  const sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
  sun.position.copy(sunDirection);
  scene.add(hemi, sun, sun.target);
  return { hemi, sun };
}

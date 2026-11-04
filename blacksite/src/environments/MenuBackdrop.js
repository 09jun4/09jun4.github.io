// 메인 메뉴 배경: 게임 월드와 분리된 가벼운 3D 장면 (서버랙이 늘어선 어두운 복도, 카메라가 천천히 이동).
import * as THREE from 'three';
import { boxGeo, mesh, mergeStatic } from '../utils/geometry.js';
import { getEnvironment } from './EnvMap.js';

export class MenuBackdrop {
  constructor(renderer, M) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.Fog(0x05070a, 6, 26);
    this.scene.environment = getEnvironment(renderer);
    this.scene.environmentIntensity = 0.3;
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 60);
    this.t = 0;
    const root = new THREE.Group();
    // 바닥·천장·벽
    root.add(mesh(boxGeo(6, 0.1, 40, 1), M.floorMetal, 0, -0.05, -14));
    root.add(mesh(boxGeo(6, 0.1, 40, 1), M.ceiling, 0, 3.05, -14));
    for (const x of [-3, 3]) root.add(mesh(boxGeo(0.2, 3.2, 40, 1), M.wall, x, 1.6, -14));
    // 서버랙 줄
    const ledMats = [M.ledBlue, M.ledGreen, M.ledBlue, M.ledAmber];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 26; i++) {
        const z = 4 - i * 0.66;
        const r = new THREE.Group();
        r.add(mesh(boxGeo(0.64, 2.1, 1.0, 0), M.metalDark, 0, 1.05, 0));
        for (let k = 0; k < 9; k++) {
          const led = mesh(boxGeo(0.012, 0.012, 0.05, 0), ledMats[(i + k + (side > 0 ? 1 : 0)) % 4], -side * 0.505, 0.25 + k * 0.2, -0.2 + ((i * 7 + k * 3) % 5) * 0.08);
          led.castShadow = false;
          r.add(led);
          r.add(mesh(boxGeo(0.012, 0.01, 0.56, 0), M.metal, -side * 0.505, 0.2 + k * 0.2, 0));
        }
        r.position.set(side * 2.35, 0, z);
        root.add(r);
      }
    }
    // 천장 조명 띠
    for (let i = 0; i < 7; i++) {
      const p = mesh(boxGeo(0.25, 0.03, 1.6, 0), M.lightPanel, 0, 3.0, 2 - i * 5);
      p.castShadow = false;
      root.add(p);
    }
    for (const m of mergeStatic(root)) root.add(m);
    this.scene.add(root);
    this.root = root;
    this.scene.add(new THREE.HemisphereLight(0x8aa4c8, 0x101418, 0.5));
    const blue = new THREE.PointLight(0x3a7dff, 30, 14, 1.6); blue.position.set(0, 2.5, -2); this.scene.add(blue);
    const blue2 = new THREE.PointLight(0x2a6cff, 22, 14, 1.6); blue2.position.set(0, 2.5, -12); this.scene.add(blue2);
    this.warn = new THREE.PointLight(0xff5a1a, 0, 9, 1.6); this.warn.position.set(0, 2.6, -20); this.scene.add(this.warn);
    // 떠다니는 먼지
    const N = 220, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 4; pos[i * 3 + 1] = Math.random() * 3; pos[i * 3 + 2] = 4 - Math.random() * 30; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9cc4ff, size: 0.018, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(this.dust);
  }
  render(renderer, dt) {
    this.t += dt;
    const t = this.t;
    // 카메라가 복도를 따라 천천히 전진 (반복)
    const z = 3 - ((t * 0.35) % 14);
    this.camera.position.set(Math.sin(t * 0.15) * 0.5 + 0.3, 1.55 + Math.sin(t * 0.4) * 0.05, z);
    this.camera.lookAt(-0.6 + Math.sin(t * 0.1) * 0.4, 1.35, z - 6);
    this.warn.intensity = Math.max(0, Math.sin(t * 2.2)) * 14;
    this.dust.position.y = Math.sin(t * 0.2) * 0.1;
    this.dust.rotation.y = t * 0.01;
    if (this.camera.aspect !== innerWidth / innerHeight) { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
    renderer.shadowMap.autoUpdate = true;
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.scene.traverse((o) => { if (o.isMesh || o.isPoints) o.geometry.dispose(); });
    this.dust.material.dispose();
  }
}

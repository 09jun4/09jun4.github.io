// 렌더러 · 조명 · 그림자 · 품질 설정 · 고정 아이소메트릭 카메라.
// 품질은 실제 렌더링 비용(해상도 배율, 그림자 크기/방식, 재질)을 바꿔요.
import * as THREE from '../../vendor/three.module.min.js';
import { PALETTES } from './PaperMaterial.js';

export const QUALITY = {
  low: { ratio: 0.75, shadows: false, map: 0 },
  medium: { ratio: 1.25, shadows: true, map: 1024, type: THREE.PCFShadowMap },
  high: { ratio: 2, shadows: true, map: 2048, type: THREE.PCFSoftShadowMap },
};
// 카메라 방향: 정확한 아이소메트릭 (1,1,1). 90° 단위로 돌릴 수 있고(시점 0~3), 줌은 무대 크기에 자동으로 맞춰요.
// 정확한 아이소메트릭이어야 V 만큼 떨어진 칸이 화면에서 완전히 겹쳐 착시 연결이 성립해요.
export const CAM_DIR = new THREE.Vector3(1, 1, 1).normalize();
export const yawOfView = v => Math.PI / 4 - v * Math.PI / 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb9b3a8, 1.25);
    this.sun = new THREE.DirectionalLight(0xfff6e8, 1.9);
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    this.fit = { center: new THREE.Vector3(), half: 6, goalCenter: new THREE.Vector3(), goalHalf: 6 };
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.setYaw(yawOfView(0));
    this.setPalette('white');
    this.resize();
  }
  setYaw(y) { this.yaw = y; CAM_DIR.set(Math.SQRT2 * Math.sin(y), 1, Math.SQRT2 * Math.cos(y)).normalize(); }
  setPalette(key) {
    const p = PALETTES[key] || PALETTES.white;
    this.scene.background = new THREE.Color(p.bg);
    document.documentElement.style.setProperty('--bg', p.bg);
    document.documentElement.style.setProperty('--bg2', p.bg2);
  }
  applyQuality(q) {
    const Q = QUALITY[q] || QUALITY.medium;
    this.quality = q;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.ratio));
    const shadows = Q.shadows && this.allowShadows !== false;
    this.r.shadowMap.enabled = shadows;
    if (shadows) {
      this.r.shadowMap.type = Q.type;
      this.sun.castShadow = true;
      if (this.sun.shadow.mapSize.x !== Q.map) {
        this.sun.shadow.mapSize.set(Q.map, Q.map);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
    } else this.sun.castShadow = false;
    this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    this.resize();
  }
  // 착시 장(章)에서는 그림자가 실제 깊이를 드러내므로 끔
  setShadows(on) { if (this.allowShadows !== on) { this.allowShadows = on; this.applyQuality(this.quality); } }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    this.aspect = w / h; this.w = w; this.h = h;
    this.updateCamera(0, true);
  }
  // 무대 경계(월드 점들) → 목표 중심/크기. insets: 화면 위/아래 UI 가 차지하는 비율
  frame(points, insets = { top: 0.1, bottom: 0.08 }) {
    if (!points.length) return;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), CAM_DIR).normalize();
    const up = new THREE.Vector3().crossVectors(CAM_DIR, right).normalize();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const c = new THREE.Vector3();
    for (const p of points) c.add(p);
    c.multiplyScalar(1 / points.length);
    for (const p of points) {
      const d = p.clone().sub(c), x = d.dot(right), y = d.dot(up);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const usable = 1 - insets.top - insets.bottom;
    const halfH = Math.max((y1 - y0) / 2 / usable, (x1 - x0) / 2 / this.aspect / (1 - Math.abs(insets.right || 0))) * 1.12 + 0.6;
    // 위아래 UI 를 피해 중심을 살짝 내림/올림
    const shift = (insets.top - insets.bottom) * halfH, sideShift = -(insets.right || 0) * halfH * this.aspect;
    this.fit.goalCenter.copy(c).addScaledVector(right, (x0 + x1) / 2 + sideShift).addScaledVector(up, (y0 + y1) / 2 + shift);
    this.fit.goalHalf = Math.max(2.6, halfH);
  }
  updateCamera(dt, snap) {
    const f = this.fit, k = snap ? 1 : 1 - Math.exp(-dt * 3);
    f.center.lerp(f.goalCenter, k);
    f.half += (f.goalHalf - f.half) * k;
    const cam = this.camera;
    cam.left = -f.half * this.aspect; cam.right = f.half * this.aspect; cam.top = f.half; cam.bottom = -f.half;
    cam.position.copy(f.center).addScaledVector(CAM_DIR, 60);
    cam.lookAt(f.center);
    cam.updateProjectionMatrix();
    // 그림자 카메라를 무대에 맞춤
    const s = this.sun;
    // 빛도 카메라와 같이 돌아서, 어느 시점에서든 왼쪽 면은 밝고 오른쪽 면은 어둡게
    s.position.copy(f.center).add(new THREE.Vector3(-6, 14, 4).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw - Math.PI / 4));
    s.target.position.copy(f.center);
    const r = f.half * 1.6 + 2;
    Object.assign(s.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: 40 });
    s.shadow.camera.updateProjectionMatrix();
    this.fill.position.copy(f.center).add(new THREE.Vector3(8, 6, 10).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw - Math.PI / 4));
  }
  ray(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.raycaster.far = Infinity;
    return this.raycaster;
  }
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.w, y: (1 - p.y) / 2 * this.h };
  }
  render() { this.r.render(this.scene, this.camera); }
}

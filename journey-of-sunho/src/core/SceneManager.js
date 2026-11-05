// SceneManager — 렌더러·씬·조명·하늘. 시간대(낮/저녁/밤)와 날씨가 조명을 바꿀 수 있게 값을 모아 둬요.
import * as THREE from '../lib/three.js';
import { lerp } from './utils.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900);
    this.scene.fog = new THREE.Fog(0xbcd3e6, 60, 420);
    this.scene.background = new THREE.Color(0xbcd3e6);

    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x5a5040, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(-0.45, 0.75, -0.35).normalize();

    // 시간대 프리셋: 하늘색, 태양 색/세기, 환경광
    this.timePresets = {
      day: { sky: 0xa9c9e8, sun: 0xfff1dc, sunI: 2.5, hemiI: 0.95, hemiSky: 0xdfeeff, dir: [-0.45, 0.75, -0.35], night: 0 },
      sunset: { sky: 0xf5c29a, sun: 0xffc290, sunI: 2.1, hemiI: 0.95, hemiSky: 0xffe2c8, dir: [-0.8, 0.38, -0.3], night: 0.12 },
      night: { sky: 0x1e2840, sun: 0xa9bcff, sunI: 0.55, hemiI: 0.62, hemiSky: 0x5a6a99, dir: [0.3, 0.8, 0.4], night: 1 },
    };
    this.baseLight = { ...this.timePresets.day };
    this.setTimeOfDay('day');

    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
  }

  setTimeOfDay(name) {
    const p = this.timePresets[name] || this.timePresets.day;
    this.timeName = name;
    this.baseLight = p;
    this.sunDir.set(...p.dir).normalize();
    this.night = p.night;
  }

  // 날씨가 주는 흐림 정도(0~1)와 안개색을 반영
  applyAtmosphere({ overcast = 0, fogNear = 60, fogFar = 420, fogTint = null } = {}) {
    const p = this.baseLight;
    const sky = new THREE.Color(p.sky);
    const grey = new THREE.Color(this.night > 0.5 ? 0x20242c : 0x8e98a3);
    sky.lerp(grey, overcast * 0.85);
    if (fogTint) sky.lerp(new THREE.Color(fogTint), 0.5);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunI * lerp(1, 0.25, overcast);
    this.hemi.intensity = p.hemiI * lerp(1, 0.8, overcast);
    this.hemi.color.set(p.hemiSky);
    this.renderer.toneMappingExposure = lerp(1.0, 1.1, overcast);
  }

  // 그림자 카메라가 플레이어를 따라다니게
  followShadow(x, y, z) {
    const d = 90;
    this.sun.position.set(x + this.sunDir.x * d, y + this.sunDir.y * d, z + this.sunDir.z * d);
    this.sun.target.position.set(x, y, z);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

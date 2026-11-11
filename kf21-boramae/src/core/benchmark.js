// 첫 실행 GPU 벤치마크(약 2초): 고정 부하를 화면 밖 렌더 타깃에 그려 프레임 시간을 재고 추천 프리셋을 고른다.
import * as THREE from 'three';
import { BENCHMARK } from '../data/quality.js';

/** GPU 이름(가능하면) */
export function rendererName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (e) {
    return '';
  }
}

/** 프레임 시간(ms) → 추천 프리셋(순수 함수) */
export function recommendPreset(msPerFrame, gpuName = '') {
  if (BENCHMARK.softwareRenderer.test(gpuName)) return 'low';
  if (!(msPerFrame > 0)) return 'low';
  if (msPerFrame < BENCHMARK.ultraBelowMs) return 'ultra';
  if (msPerFrame < BENCHMARK.highBelowMs) return 'high';
  return 'low';
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {(fraction:number)=>void} [onProgress]
 * @param {boolean} [force] 소프트웨어 렌더러여도 실제로 잰다
 * @returns {Promise<{ms:number, frames:number, gpu:string, preset:string}>}
 */
export async function runBenchmark(renderer, onProgress, force = false) {
  const B = BENCHMARK;
  const gpu = rendererName(renderer);
  if (!force && B.softwareRenderer.test(gpu)) return { ms: Infinity, frames: 0, gpu, preset: 'low' }; // force: 테스트에서 측정 경로 확인용

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, B.width / B.height, 0.5, 400);
  camera.position.set(0, 0, 60);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2), new THREE.DirectionalLight(0xffffff, 2));
  const geo = new THREE.SphereGeometry(1.6, 32, 15); // 960 삼각형
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.5, metalness: 0.3 });
  const mesh = new THREE.InstancedMesh(geo, mat, B.instances);
  const m = new THREE.Matrix4();
  for (let i = 0; i < B.instances; i++) {
    m.makeTranslation(((i % 25) - 12) * 4, (Math.floor(i / 25) - 8) * 4, -((i * 7) % 40));
    mesh.setMatrixAt(i, m);
  }
  scene.add(mesh);
  const target = new THREE.WebGLRenderTarget(B.width, B.height, { samples: 4 });
  const pixel = new Uint8Array(4);
  const gl = renderer.getContext();
  const times = [];
  const t0 = performance.now();
  try {
    for (let i = 0; i < B.frames; i++) {
      const a = performance.now();
      mesh.rotation.y = i * 0.05;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel); // GPU 작업이 끝날 때까지 기다린다
      gl.finish();
      const b = performance.now();
      if (i >= B.warmupFrames) times.push(b - a);
      if (onProgress) onProgress((i + 1) / B.frames);
      if (b - t0 > B.maxSeconds * 1000) break;
      await new Promise((r) => setTimeout(r, 0)); // 화면이 멈춘 것처럼 보이지 않게 틈을 준다
    }
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    geo.dispose();
    mat.dispose();
    mesh.dispose();
  }
  times.sort((x, y) => x - y);
  const ms = times.length ? times[Math.floor(times.length / 2)] : Infinity; // 중앙값
  return { ms, frames: times.length, gpu, preset: recommendPreset(ms, gpu) };
}

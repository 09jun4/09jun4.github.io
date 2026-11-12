// 피격 흔적: 총알 구멍과 그을음을 기체 표면에 붙인다(인스턴싱 한 번의 드로우 콜).
// 맞을 때마다 기체 위·아래에서 광선을 쏘아 표면의 한 점과 법선을 찾고, 그 자리에 작은 판을 눕힌다.
import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const Z = new THREE.Vector3(0, 0, 1);
const HOLE = new THREE.Color(0x0b0b0c);
const SOOT = new THREE.Color(0x231c17);

function decalTexture() {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  // 가장자리가 삐죽한 그을림
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.2, r = n * (0.34 + ((i * 37) % 11) / 60); g.beginPath(); g.arc(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r, n * 0.07, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function createDecals(cfg) {
  const cap = Math.max(cfg.count.low, cfg.count.high);
  const tex = decalTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = 'damage-decals';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.setColorAt(0, HOLE);
  let max = cfg.count.low;
  let next = 0;
  let targets = null; // 광선을 맞힐 메시 목록(모델이 바뀌면 다시 모은다)
  let targetsFor = null;

  return {
    mesh,
    get count() { return mesh.count; },
    setMax(n) { max = Math.min(cap, n); if (mesh.count > max) mesh.count = max; },
    clear() { mesh.count = 0; next = 0; },
    /**
     * 흔적 하나를 붙인다.
     * @param {THREE.Object3D} root 기체 루트(흔적의 부모) @param {THREE.Object3D} surface 광선을 맞힐 외형 @param {() => number} rng
     */
    add(root, surface, rng) {
      if (!surface || max <= 0) return false;
      if (targetsFor !== surface) {
        targets = [];
        surface.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.geometry && o.geometry.index && o.material && !o.material.transparent) targets.push(o); });
        targetsFor = surface;
      }
      root.updateMatrixWorld(true);
      _inv.copy(root.matrixWorld).invert();
      for (let attempt = 0; attempt < 4; attempt++) {
        const top = rng() < 0.7 ? 1 : -1;
        // 동체와 날개 위쪽에 고르게: 날개(넓게) 또는 동체 중심선 근처
        const wing = rng() < 0.55;
        _o.set((rng() * 2 - 1) * (wing ? 4.2 : 0.8), top * 6, wing ? 0.5 + rng() * 4 : -5 + rng() * 11).applyMatrix4(root.matrixWorld);
        _d.set(0, -top, 0).transformDirection(root.matrixWorld);
        _ray.set(_o, _d);
        _ray.far = 12;
        const hits = _ray.intersectObjects(targets, false);
        const hit = hits.find((h) => h.object.visible && h.face);
        if (!hit) continue;
        _nm.getNormalMatrix(hit.object.matrixWorld);
        _n.copy(hit.face.normal).applyMatrix3(_nm).normalize().transformDirection(_inv);
        if (_n.y * top < 0.2) _n.set(0, top, 0);
        _p.copy(hit.point).applyMatrix4(_inv).addScaledVector(_n, cfg.lift);
        const soot = rng() < cfg.sootChance;
        const range = soot ? cfg.sootSize : cfg.size;
        const size = range[0] + rng() * (range[1] - range[0]);
        _q.setFromUnitVectors(Z, _n).multiply(_q2.setFromAxisAngle(Z, rng() * Math.PI * 2));
        _s.set(size * (soot ? 1.6 : 1), size, 1);
        _m.compose(_p, _q, _s);
        const i = next % max;
        next++;
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, soot ? SOOT : HOLE);
        mesh.count = Math.min(max, Math.max(mesh.count, i + 1));
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        return true;
      }
      return false;
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}

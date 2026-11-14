// 관절 단위 메시 병합: 같은 관절(피벗)에 붙은 같은 재질 메시를 하나로 합쳐 드로우콜을 줄인다.
import * as THREE from 'three';

function nearestJoint(o, root) {
  let p = o.parent;
  while (p && p !== root) { if (p.userData.joint) return p; p = p.parent; }
  return root;
}

export function mergeByJoint(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(); // joint → material → meshes
  root.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    const j = nearestJoint(o, root);
    if (!buckets.has(j)) buckets.set(j, new Map());
    const m = buckets.get(j);
    if (!m.has(o.material)) m.set(o.material, []);
    m.get(o.material).push(o);
  });
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  for (const [joint, mats] of buckets) {
    inv.copy(joint.matrixWorld).invert();
    for (const [mat, meshes] of mats) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        rel.multiplyMatrices(inv, m.matrixWorld);
        g.applyMatrix4(rel);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        return g;
      });
      const merged = concat(geos);
      geos.forEach((g) => g.dispose());
      for (const m of meshes) { m.parent.remove(m); m.geometry.dispose(); }
      const out = new THREE.Mesh(merged, mat);
      out.castShadow = true; out.receiveShadow = true;
      joint.add(out);
    }
  }
}

function concat(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

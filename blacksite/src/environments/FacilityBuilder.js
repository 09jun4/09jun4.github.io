// 연구시설 빌더: 맵 JSON → 3D 장면 + 충돌 + 문 + 상호작용 지점.
// 인터페이스: build(scene, mapConfig, ctx) → Facility. 다른 맵/건물은 같은 인터페이스로 교체 가능.
import * as THREE from 'three';
import { DEG } from '../utils/math.js';
import { mergeStatic } from '../utils/geometry.js';
import { boxFromObject, makeBox } from '../physics/Collision.js';
import { Door } from './Door.js';
import { buildLighting } from './Lighting.js';
import { buildFloorsAndCeilings, buildWalls } from './rooms/RoomShell.js';
import { PROPS } from './props/index.js';

export function build(scene, map, { M, collision, shadows = true, shadowMapSize = 1024 }) {
  const root = new THREE.Group();
  root.name = 'facility';
  const staticGroup = new THREE.Group();
  const dynamicGroup = new THREE.Group();
  root.add(staticGroup, dynamicGroup);

  // 문
  const doors = (map.doors || []).map((d) => new Door(d, M, { wallThickness: map.wallThickness, doorHeight: map.doorHeight }));
  for (const d of doors) { dynamicGroup.add(d.group); collision.add(d.box); }

  buildFloorsAndCeilings(staticGroup, map, M);
  buildWalls(staticGroup, map, doors, M, collision);

  // 소품
  const interactables = []; // { id, kind, box, pos, prop }
  const props = [];
  const disposers = [];
  const tmpBox = new THREE.Box3();
  for (const def of map.props || []) {
    const factory = PROPS[def.type];
    if (!factory) { console.warn('[Facility] unknown prop', def.type); continue; }
    const res = factory(def, M);
    const obj = res.object;
    if (!res.absolute && def.pos) {
      const p = def.pos;
      if (p.length === 3) obj.position.set(p[0], p[1], p[2]);
      else obj.position.set(p[0], 0, p[1]);
      obj.rotation.y = (def.rotDeg || 0) * DEG;
    }
    const isDynamic = !!(res.interact || res.screen || res.lamp);
    (isDynamic ? dynamicGroup : staticGroup).add(obj);
    obj.updateMatrixWorld(true);
    if (obj.userData.dispose) disposers.push(obj.userData.dispose);
    if (res.collide !== false) {
      tmpBox.setFromObject(obj);
      collision.add(boxFromObject(tmpBox, { type: 'prop', material: def.material || 'metal', ref: def }));
    }
    const entry = { def, object: obj, ...res };
    props.push(entry);
    if (res.interact) {
      const [a, b, c, d, e, f] = res.interact.box;
      const lb = new THREE.Box3(new THREE.Vector3(a, b, c), new THREE.Vector3(d, e, f)).applyMatrix4(obj.matrixWorld);
      const box = makeBox(lb.min.x, lb.min.y, lb.min.z, lb.max.x, lb.max.y, lb.max.z, { type: 'interact' });
      const center = lb.getCenter(new THREE.Vector3());
      interactables.push({ id: def.id || def.type, kind: res.interact.kind, box, pos: center, prop: entry });
    }
  }

  // 정적 메시 합치기 (드로우콜 감소)
  const merged = mergeStatic(staticGroup);
  for (const m of merged) staticGroup.add(m);

  const lighting = buildLighting(root, map, { shadows, shadowMapSize });
  scene.add(root);

  const zones = map.zones;
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]));
  function zoneAt(x, z) {
    // 방 우선, 복도는 마지막
    let found = null;
    for (const zz of zones) {
      const [x1, z1, x2, z2] = zz.rect;
      if (x >= x1 && x <= x2 && z >= z1 && z <= z2) {
        if (zz.id !== 'corridor') return zz;
        found = zz;
      }
    }
    return found;
  }

  return {
    map,
    root,
    doors,
    doorById: Object.fromEntries(doors.map((d) => [d.id, d])),
    props,
    interactables,
    interactableById: Object.fromEntries(interactables.map((i) => [i.id, i])),
    lighting,
    zones,
    zoneById,
    zoneAt,
    spawn: map.spawn,
    update(dt) { for (const d of doors) d.update(dt); },
    dispose() {
      scene.remove(root);
      lighting.dispose();
      for (const fn of disposers) fn();
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
}

// 상호작용(F) 선택기. 여러 제공자(provider)가 후보를 내면 우선순위가 가장 높은 것 하나만 안내·실행한다.
// 우선순위: 암살(100) > 터미널/탈출(80) > 로그(60) > 문(40)
import * as THREE from 'three';
import { rayAABB } from '../physics/Raycast.js';

export class Interaction {
  constructor(session) {
    this.session = session;
    this.providers = [];
    this.current = null;
    this.dir = new THREE.Vector3();
  }
  add(provider) { this.providers.push(provider); return provider; }

  // 조준점 레이로 박스까지 거리 (벽에 가리면 null)
  aimDistance(box, maxDist) {
    const s = this.session, o = s.player.eye, d = this.dir;
    const h = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, box, maxDist);
    if (!h) return null;
    const wall = s.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, h.t, (b) => b.solid && b.type !== 'prop' && (box.ref == null || b.ref !== box.ref));
    if (wall && wall.dist < h.t - 0.05) return null;
    return h.t;
  }

  update() {
    const s = this.session;
    s.camera.getWorldDirection(this.dir);
    let best = null;
    for (const p of this.providers) {
      const c = p.find(this);
      if (c && (!best || c.priority > best.priority)) best = c;
    }
    this.current = best;
    return best;
  }

  trigger() {
    if (this.current && this.current.action) this.current.action();
  }
}

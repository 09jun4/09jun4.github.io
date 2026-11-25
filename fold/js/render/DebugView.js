// 디버그 화면 (관리자만): 면/접힘선 ID, 회전축, 걸을 수 있는 칸, 벽, 연결 경계, 물체 칸, 내부 상태.
import * as THREE from '../../vendor/three.module.min.js';
import { parseKey, ckey } from '../logic/math.js';
import { creaseAxisWorld } from '../logic/Fold.js';
import { computeConnections } from '../logic/Connection.js';
import { restCenter } from '../logic/Layout.js';

export class DebugView {
  constructor(renderer, el) {
    this.R = renderer; this.el = el; this.on = false;
    this.group = new THREE.Group(); this.group.visible = false;
    renderer.scene.add(this.group);
    this.labels = document.createElement('div'); this.labels.className = 'dbg-labels';
    this.panel = document.createElement('pre'); this.panel.className = 'dbg-panel';
    el.append(this.labels, this.panel);
    el.hidden = true;
  }
  toggle(v = !this.on) { this.on = v; this.group.visible = v; this.el.hidden = !v; this.dirty = true; }
  rebuild(sim) {
    const g = this.group;
    while (g.children.length) { const c = g.children.pop(); c.geometry && c.geometry.dispose(); }
    this.items = [];
    if (!this.on || !sim) return;
    const add = (pts, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
      g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true })));
    };
    const walk = [], walls = [], seams = [], axes = [], cubes = [];
    for (const k of sim.res.top.keys()) {
      const [x, y, z] = parseKey(k), e = 0.12, h = y + 0.06;
      walk.push([x + e, h, z + e], [x + 1 - e, h, z + e], [x + 1 - e, h, z + e], [x + 1 - e, h, z + 1 - e], [x + 1 - e, h, z + 1 - e], [x + e, h, z + 1 - e], [x + e, h, z + 1 - e], [x + e, h, z + e]);
    }
    for (const ek of sim.res.walls) {
      const ax = ek[0], [a, y, b] = ek.slice(1).split(',').map(Number), h = y + 0.15;
      if (ax === 'x') walls.push([a, h, b], [a, h, b + 1]); else walls.push([a, h, b], [a + 1, h, b]);
    }
    for (const c of computeConnections(sim)) for (const e of c.edges) {
      const h = e.y + 0.1;
      if (e.axis === 'z') seams.push([e.x, h, e.z - 0.5], [e.x, h, e.z + 0.5]); else seams.push([e.x - 0.5, h, e.z], [e.x + 0.5, h, e.z]);
    }
    for (const c of sim.stage.creases) {
      const a = creaseAxisWorld(sim, c.id), p = a.point, d = a.dir;
      axes.push([p[0] - d[0] * 0.5, p[1] - d[1] * 0.5, p[2] - d[2] * 0.5], [a.end[0] + d[0] * 0.5, a.end[1] + d[1] * 0.5, a.end[2] + d[2] * 0.5]);
      this.items.push({ p: [(p[0] + a.end[0]) / 2, (p[1] + a.end[1]) / 2 + 0.2, (p[2] + a.end[2]) / 2], t: c.id + ' ' + (sim.state.angles[c.id] || 0) + '°', cls: 'c' });
    }
    for (const i of sim.objs) {
      const [x, y, z] = i.cube;
      cubes.push([x, y, z], [x + 1, y + 1, z + 1], [x + 1, y, z], [x, y + 1, z + 1]);
      this.items.push({ p: [x + 0.5, y + 1.1, z + 0.5], t: i.o.id + (i.functional ? '' : '(off)'), cls: 'o' });
    }
    for (const f of sim.stage.faces) {
      const T = sim.geo.T[f.id], c = restCenter(f, (f.w - 1) / 2, (f.h - 1) / 2);
      const R = T.R, t = T.t, w = [R[0] * c[0] + R[1] * c[1] + R[2] * c[2] + t[0], R[3] * c[0] + R[4] * c[1] + R[5] * c[2] + t[1], R[6] * c[0] + R[7] * c[1] + R[8] * c[2] + t[2]];
      this.items.push({ p: [w[0], w[1] + 0.1, w[2]], t: f.id + ' o' + sim.state.order[f.id] + (sim.active.has(f.id) ? '' : ' ×'), cls: 'f' });
    }
    add(walk, 0x40b060); add(walls, 0xe04040); add(seams, 0xe0b040); add(axes, 0x3080ff); add(cubes, 0xb050e0);
    const s = sim.state, p = sim.puz;
    this.panel.textContent = [
      `player ${s.player.join(',')}  folds ${s.folds}  history ${sim.history ? sim.history.length : 0}`,
      `angles ${JSON.stringify(s.angles)}`,
      `active ${JSON.stringify(p.active)}  doors ${JSON.stringify(p.doors)}`,
      `exit ${p.exitActive}  keys ${s.keysHeld.join(',') || '-'}  beams ${p.beams.length}`,
      `blocks ${Object.entries(s.blocks).map(([k, v]) => k + '@' + sim.byId.get(k).cubeKey).join(' ')}`,
      `walkable ${sim.res.top.size}  walls ${sim.res.walls.size}  links ${computeConnections(sim).length}`,
    ].join('\n');
  }
  update(extra) {
    if (!this.on || !this.items) return;
    let html = '';
    for (const it of this.items) {
      const s = this.R.toScreen(new THREE.Vector3(...it.p));
      html += `<span class="${it.cls}" style="left:${s.x | 0}px;top:${s.y | 0}px">${it.t}</span>`;
    }
    this.labels.innerHTML = html;
    if (extra) this.panel.dataset.extra = extra;
  }
}

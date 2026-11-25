// 메인 메뉴 배경: 천천히 접혔다 펴지는 종이 건축물. 스테이지 데이터 형식을 그대로 써서 면을 만들고,
// 각 접힘선의 각도를 시간에 따라 부드럽게 바꿔요 (논리와 무관한 장식).
import * as THREE from '../../vendor/three.module.min.js';
import { parseStage } from '../logic/StageLoader.js';
import { buildFaceGeometry, rotAboutMatrix } from './PaperGeometry.js';
import { faceMaterials } from './PaperMaterial.js';

const DEF = {
  id: 'menu', faces: [
    { id: 'C', o: [-2, 0, -2], u: '+x', v: '+z', w: 4, h: 4 },
    { id: 'N', o: [-2, 0, -2], u: '+x', v: '+y', w: 4, h: 2 },
    { id: 'N2', o: [-2, 2, -2], u: '+x', v: '+y', w: 4, h: 2 },
    { id: 'E', o: [2, 0, -2], u: '+z', v: '+y', w: 4, h: 3 },
    { id: 'S', o: [-2, 0, 2], u: '+x', v: '+z', w: 4, h: 2 },
    { id: 'S2', o: [-2, 0, 4], u: '+x', v: '+z', w: 4, h: 2 },
    { id: 'W', o: [-2, 0, -2], u: '+z', v: '+y', w: 4, h: 2 },
    { id: 'L', o: [-4, 0, -2], u: '+x', v: '+z', w: 2, h: 4, mask: ['##', '#.', '##', '.#'] },
    { id: 'P', o: [4, 1, 3], u: '+x', v: '+z', w: 2, h: 2 },
  ],
  creases: [
    { id: 'n', parent: 'C', child: 'N', a: [-2, 0, -2], b: [2, 0, -2] },
    { id: 'n2', parent: 'N', child: 'N2', a: [-2, 2, -2], b: [2, 2, -2] },
    { id: 'e', parent: 'C', child: 'E', a: [2, 0, -2], b: [2, 0, 2] },
    { id: 's', parent: 'C', child: 'S', a: [-2, 0, 2], b: [2, 0, 2] },
    { id: 's2', parent: 'S', child: 'S2', a: [-2, 0, 4], b: [2, 0, 4] },
    { id: 'w', parent: 'C', child: 'W', a: [-2, 0, -2], b: [-2, 0, 2] },
  ],
  objects: [{ id: 'x', type: 'exit', at: [0, 0, 0] }], player: { at: [0, 0, 0] },
};
// 접힘선별 각도 곡선 (도 단위): 진폭, 주기, 위상, 기준
const MOTION = { n: [40, 23, 0, -40], n2: [80, 17, 1, -80], e: [45, 19, 2, 45], s: [90, 29, 3, 0], s2: [90, 13, 4, 90], w: [30, 31, 5, 60] };

export class MenuScene {
  constructor(renderer) {
    this.R = renderer;
    this.stage = parseStage(DEF);
    this.root = new THREE.Group();
    this.groups = new Map();
    for (const f of this.stage.faces) {
      const g = new THREE.Group(); g.matrixAutoUpdate = false;
      const m = new THREE.Mesh(buildFaceGeometry(f), faceMaterials('white', 'medium'));
      m.castShadow = m.receiveShadow = true;
      g.add(m); this.root.add(g); this.groups.set(f.id, g);
    }
    this.root.visible = false;
    renderer.scene.add(this.root);
  }
  show(v) { this.root.visible = v; if (v) this.frame(); }
  frame() {
    const pts = [];
    for (const [x, z] of [[-6, -6], [8, -6], [8, 8], [-6, 8]]) for (const y of [-1, 4]) pts.push(new THREE.Vector3(x, y, z));
    const wide = this.R.aspect > 1.1; // 가로 화면: 글자는 왼쪽, 종이 건축물은 오른쪽 / 세로: 가운데
    this.R.frame(pts, wide ? { top: 0.02, bottom: 0.02, right: 0.42 } : { top: 0.3, bottom: 0.4 });
  }
  update(t) {
    if (!this.root.visible) return;
    const M = new Map();
    const get = fid => {
      if (M.has(fid)) return M.get(fid);
      const c = this.stage.parentCrease.get(fid);
      let m = new THREE.Matrix4();
      if (c) {
        const [amp, per, ph, base] = MOTION[c.id];
        const deg = base + amp * Math.sin(t * Math.PI * 2 / per + ph);
        m = get(c.parent).clone().multiply(rotAboutMatrix(new THREE.Vector3(...c.a), new THREE.Vector3(...c.axis), deg * Math.PI / 180));
      }
      M.set(fid, m);
      return m;
    };
    for (const [id, g] of this.groups) { g.matrix.copy(get(id)); g.matrixWorldNeedsUpdate = true; }
    this.groups.get('P').matrix.makeTranslation(0, Math.sin(t * 0.5) * 0.3, 0);
    this.root.rotation.y = 0;
  }
}

// 퍼즐 물체 모델 (외부 모델 없이 직접 만든 메시). 원점 = 바닥면 중심, +Y 위, +X 앞(방향 있는 물체).
// 각 뷰: { root, update(dt, info, puz, t) } — info/puz 는 논리 계층이 계산한 상태.
import * as THREE from '../../vendor/three.module.min.js';
import { objectMaterial } from './PaperMaterial.js';

export const COL = { cyan: 0x7fc4d0, blue: 0x8fb3d6, gold: 0xe6c98a, dark: 0x4a4a4a, gray: 0x9b978f };

const geoCache = new Map();
const cached = (k, f) => geoCache.get(k) || (geoCache.set(k, f()), geoCache.get(k));

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// 둥근 모서리 상자 (y 0..h)
function roundedBox(w, h, d, r, bevel) {
  return cached(`rb${w},${h},${d},${r},${bevel}`, () => {
    const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, d - bevel * 2, r), { depth: h - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
    g.computeVertexNormals();
    return g;
  });
}
const lineMat = new THREE.LineBasicMaterial({ color: 0x8a8478, transparent: true, opacity: 0.55 });
function shadowAll(o, cast = true) { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } }); return o; }

export function makeObjectView(type, ctx) {
  const f = BUILD[type];
  return f ? f(ctx) : { root: new THREE.Group(), update() {} };
}

const BUILD = {
  block(ctx) {
    const root = new THREE.Group();
    const m = new THREE.Mesh(roundedBox(0.82, 0.82, 0.82, 0.05, 0.035), objectMaterial(ctx.pal, ctx.q, 0xf3efe6));
    root.add(m);
    // 접어 만든 상자 느낌의 접힘선
    const pts = [], s = 0.41, top = 0.825;
    pts.push(-s, top, -s, s, top, s, -s, top, s, s, top, -s); // 윗면 X
    for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) pts.push(x, 0.02, z, x, top, z);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    root.add(new THREE.LineSegments(lg, lineMat));
    shadowAll(root);
    return { root, update() {} };
  },

  switch(ctx) {
    const root = new THREE.Group();
    const base = new THREE.Mesh(cached('swb', () => new THREE.CylinderGeometry(0.36, 0.4, 0.05, 28)), objectMaterial(ctx.pal, ctx.q, 0xd8d3c8));
    base.position.y = 0.025;
    const ringMat = new THREE.MeshBasicMaterial({ color: COL.blue, transparent: true, opacity: 0.25 });
    const ring = new THREE.Mesh(cached('swr', () => new THREE.RingGeometry(0.3, 0.355, 32).rotateX(-Math.PI / 2)), ringMat);
    ring.position.y = 0.052;
    const capMat = objectMaterial(ctx.pal, ctx.q, 0xf4f1ea, { emissive: new THREE.Color(COL.blue), emissiveIntensity: 0 });
    const cap = new THREE.Mesh(cached('swc', () => new THREE.CylinderGeometry(0.26, 0.28, 0.07, 6)), capMat);
    cap.position.y = 0.08;
    root.add(base, ring, cap); shadowAll(root, false);
    let k = 0;
    return {
      root, update(dt, info, puz) {
        const on = !!(puz && puz.pressed[info.o.id]);
        k += ((on ? 1 : 0) - k) * Math.min(1, dt * 10);
        cap.position.y = 0.08 - 0.045 * k;
        ringMat.opacity = 0.2 + 0.7 * k;
        if (capMat.emissiveIntensity !== undefined) capMat.emissiveIntensity = 0.5 * k;
      },
    };
  },

  door(ctx) {
    const root = new THREE.Group();
    const frameMat = objectMaterial(ctx.pal, ctx.q, 0xcfc8ba);
    const pil = cached('dpil', () => roundedBox(0.12, 1.0, 0.16, 0.02, 0.01));
    const l = new THREE.Mesh(pil, frameMat), r = new THREE.Mesh(pil, frameMat);
    l.position.x = -0.42; r.position.x = 0.42;
    const lint = new THREE.Mesh(cached('dlin', () => roundedBox(0.96, 0.1, 0.18, 0.02, 0.01)), frameMat);
    lint.position.y = 0.95;
    const panelG = new THREE.Group();
    const panel = new THREE.Mesh(cached('dpan', () => roundedBox(0.72, 0.86, 0.05, 0.01, 0.008)), objectMaterial(ctx.pal, ctx.q, 0xf2eee5));
    panelG.add(panel);
    // 판의 접힘 무늬 (마름모)
    const pts = [0, 0.05, 0.03, 0.34, 0.43, 0.03, 0.34, 0.43, 0.03, 0, 0.81, 0.03, 0, 0.81, 0.03, -0.34, 0.43, 0.03, -0.34, 0.43, 0.03, 0, 0.05, 0.03];
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(lg, lineMat); panelG.add(lines);
    const l2 = lines.clone(); l2.position.z = -0.06; panelG.add(l2);
    if (ctx.obj.key) { // 열쇠 문: 금빛 표식
      const em = new THREE.Mesh(cached('dkey', () => new THREE.TorusGeometry(0.09, 0.025, 8, 20)), new THREE.MeshStandardMaterial({ color: COL.gold, emissive: COL.gold, emissiveIntensity: 0.3, roughness: 0.5 }));
      em.position.set(0, 0.5, 0.04); panelG.add(em);
      const em2 = em.clone(); em2.position.z = -0.04; panelG.add(em2);
    }
    root.add(l, r, lint, panelG); shadowAll(root);
    root.rotation.y = ctx.doorAxis === 'x' ? Math.PI / 2 : 0; // 통로 방향에 수직으로 서요
    let k = 0;
    return {
      root, update(dt, info, puz) {
        const open = !!(puz && puz.doors[info.o.id]);
        k += ((open ? 1 : 0) - k) * Math.min(1, dt * 5);
        panelG.position.y = -0.84 * k; // 바닥 아래로 접혀 들어감
        panelG.scale.y = 1 - 0.95 * k;
        panelG.visible = k < 0.98;
      },
    };
  },

  key(ctx) {
    const root = new THREE.Group(), g = new THREE.Group();
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.16, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.08, 0, Math.PI * 2, true); s.holes.push(hole);
    const shaft = new THREE.Shape();
    shaft.moveTo(0.14, -0.035); shaft.lineTo(0.5, -0.035); shaft.lineTo(0.5, -0.12); shaft.lineTo(0.42, -0.12); shaft.lineTo(0.42, -0.07); shaft.lineTo(0.36, -0.07); shaft.lineTo(0.36, -0.11); shaft.lineTo(0.3, -0.11); shaft.lineTo(0.3, -0.035); shaft.lineTo(0.14, -0.035); shaft.lineTo(0.14, 0.035); shaft.lineTo(0.5, 0.035); shaft.lineTo(0.5, -0.035);
    const opt = { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 };
    const mat = new THREE.MeshStandardMaterial({ color: COL.gold, emissive: COL.gold, emissiveIntensity: 0.25, roughness: 0.55, metalness: 0.1 });
    const a = new THREE.Mesh(cached('kbow', () => new THREE.ExtrudeGeometry(s, opt)), mat);
    const b = new THREE.Mesh(cached('ksh', () => new THREE.ExtrudeGeometry(shaft, opt)), mat);
    g.add(a, b); g.position.x = -0.16; g.scale.setScalar(0.9);
    const spin = new THREE.Group(); spin.add(g); spin.position.y = 0.5;
    root.add(spin); shadowAll(root);
    return {
      root, update(dt, info, puz, t) {
        spin.rotation.y = t * 1.6;
        spin.position.y = 0.48 + Math.sin(t * 2.2) * 0.05;
      },
    };
  },

  mirror(ctx) {
    const root = new THREE.Group(), turn = new THREE.Group();
    const base = new THREE.Mesh(cached('mbase', () => new THREE.CylinderGeometry(0.3, 0.34, 0.08, 6)), objectMaterial(ctx.pal, ctx.q, 0xd8d2c6));
    base.position.y = 0.04;
    const frame = new THREE.Mesh(cached('mfr', () => roundedBox(0.98, 0.72, 0.08, 0.02, 0.012)), objectMaterial(ctx.pal, ctx.q, 0xcfc8ba));
    frame.position.y = 0.1;
    const glass = new THREE.Mesh(cached('mgl', () => new THREE.BoxGeometry(0.86, 0.6, 0.1)),
      new THREE.MeshStandardMaterial({ color: 0xe4f1f5, roughness: 0.12, metalness: 0.15, emissive: 0xbfe3ec, emissiveIntensity: 0.55 }));
    glass.position.y = 0.46;
    const panel = new THREE.Group(); panel.add(frame, glass);
    turn.add(panel); root.add(base, turn); shadowAll(root);
    let cur = null;
    return {
      root, update(dt, info) {
        // 거울면 법선 (월드) → 판 방향. 부모 행렬의 회전은 이미 적용되므로 rest 기준 각도만 사용
        const target = info.o && ctx.sim ? (ctx.sim.state.mirrors[info.o.id] ? -Math.PI / 4 : Math.PI / 4) : Math.PI / 4;
        if (cur === null) cur = target;
        let d = target - cur;
        cur += d * Math.min(1, dt * 9);
        turn.rotation.y = cur;
      },
    };
  },

  source(ctx) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(cached('sbody', () => new THREE.CylinderGeometry(0.3, 0.36, 0.5, 6)), objectMaterial(ctx.pal, ctx.q, 0xece7dd));
    body.position.y = 0.25;
    const cap = new THREE.Mesh(cached('scap', () => new THREE.ConeGeometry(0.34, 0.22, 6)), objectMaterial(ctx.pal, ctx.q, 0xd6cfc1));
    cap.position.y = 0.61;
    const lensMat = new THREE.MeshBasicMaterial({ color: COL.cyan });
    const lens = new THREE.Mesh(cached('slens', () => new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16).rotateZ(Math.PI / 2)), lensMat);
    lens.position.set(0.3, 0.45, 0);
    root.add(body, cap, lens); shadowAll(root);
    return {
      root, update(dt, info, puz, t) {
        lensMat.color.setHex(info.functional ? COL.cyan : 0x9aa4a8);
        lens.scale.setScalar(info.functional ? 1 + Math.sin(t * 4) * 0.06 : 1);
      },
    };
  },

  receptor(ctx) {
    const root = new THREE.Group();
    const ped = new THREE.Mesh(cached('rped', () => new THREE.CylinderGeometry(0.22, 0.3, 0.26, 8)), objectMaterial(ctx.pal, ctx.q, 0xd8d2c6));
    ped.position.y = 0.13;
    const cmat = new THREE.MeshStandardMaterial({ color: 0xe9eef0, emissive: COL.gold, emissiveIntensity: 0, roughness: 0.3, metalness: 0.1, flatShading: true });
    const crystal = new THREE.Mesh(cached('rcr', () => new THREE.OctahedronGeometry(0.2, 0)), cmat);
    crystal.position.y = 0.5; crystal.scale.y = 1.4;
    const halo = new THREE.Mesh(cached('rhalo', () => new THREE.RingGeometry(0.26, 0.3, 32)), new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    halo.position.y = 0.5;
    root.add(ped, crystal, halo); shadowAll(root);
    let k = 0;
    return {
      root, update(dt, info, puz, t) {
        const on = !!(puz && puz.lit[info.o.id]);
        k += ((on ? 1 : 0) - k) * Math.min(1, dt * 6);
        cmat.emissiveIntensity = 0.9 * k;
        cmat.color.setHex(on ? 0xfff3d6 : 0xe9eef0);
        crystal.rotation.y = t * (0.4 + k * 1.4);
        halo.material.opacity = 0.6 * k;
        halo.lookAt(ctx.camera.position);
        halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08 * k);
      },
    };
  },

  exit(ctx) {
    const root = new THREE.Group();
    const padMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.9, emissive: COL.gold, emissiveIntensity: 0 });
    const pad = new THREE.Mesh(cached('epad', () => new THREE.CylinderGeometry(0.42, 0.44, 0.04, 8)), padMat);
    pad.position.y = 0.02;
    const star = new THREE.Shape();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 0.1 : 0.24; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(r, 0); }
    const starMat = new THREE.MeshStandardMaterial({ color: 0xd9d4ca, emissive: COL.gold, emissiveIntensity: 0, roughness: 0.6, flatShading: true });
    const starM = new THREE.Mesh(cached('estar', () => new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.04, bevelSegments: 1 }).translate(0, 0, -0.03)), starMat);
    const spin = new THREE.Group(); spin.add(starM); spin.position.y = 0.55;
    const ringMat = new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0, depthWrite: false });
    const ring = new THREE.Mesh(cached('ering', () => new THREE.RingGeometry(0.34, 0.4, 40).rotateX(-Math.PI / 2)), ringMat);
    ring.position.y = 0.05;
    // 떠오르는 종잇조각
    const bits = new THREE.Group();
    const bitMat = new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(cached('ebit', () => new THREE.PlaneGeometry(0.05, 0.05)), bitMat); b.userData.ph = i / 6; bits.add(b); }
    root.add(pad, ring, spin, bits); shadowAll(root, false); starM.castShadow = true;
    let k = 0;
    return {
      root, update(dt, info, puz, t) {
        const on = !!(puz && puz.exitActive && info.functional);
        k += ((on ? 1 : 0) - k) * Math.min(1, dt * 3);
        starMat.emissiveIntensity = 0.8 * k; padMat.emissiveIntensity = 0.25 * k;
        starMat.color.setHex(on ? 0xf7ecd2 : 0xd9d4ca);
        spin.rotation.y = t * (0.3 + k);
        spin.position.y = 0.5 + Math.sin(t * 1.8) * 0.05 * (0.3 + k);
        ringMat.opacity = 0.5 * k * (0.7 + 0.3 * Math.sin(t * 3));
        bitMat.opacity = 0.8 * k;
        for (const b of bits.children) {
          const p = (t * 0.35 + b.userData.ph) % 1, a = b.userData.ph * Math.PI * 2 + t * 0.6;
          b.position.set(Math.cos(a) * 0.32, 0.05 + p * 1.1, Math.sin(a) * 0.32);
          b.rotation.set(t * 2 + a, t * 3, 0);
          b.scale.setScalar(1 - p);
        }
      },
    };
  },

  stairs(ctx) {
    const root = new THREE.Group();
    const s = new THREE.Shape(); // 옆모습: +X 방향으로 올라가는 4단
    s.moveTo(-0.5, 0);
    for (let i = 0; i < 4; i++) { s.lineTo(-0.5 + i * 0.25, (i + 1) * 0.25); s.lineTo(-0.5 + (i + 1) * 0.25, (i + 1) * 0.25); }
    s.lineTo(0.5, 0); s.lineTo(-0.5, 0);
    const g = cached('stair', () => new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false }).translate(0, 0, -0.45));
    const m = new THREE.Mesh(g, objectMaterial(ctx.pal, ctx.q, 0xf1ede4));
    root.add(m);
    const eg = new THREE.EdgesGeometry(g, 30);
    root.add(new THREE.LineSegments(eg, lineMat));
    shadowAll(root);
    return { root, update() {} };
  },
};

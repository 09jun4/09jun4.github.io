// Props — 이벤트용 임시 3D 소품(행인·자동차·비둘기·고양이·강아지·라바콘·포트홀·물웅덩이·낙엽·간식).
// 최종 에셋이 생기면 이 파일의 함수만 GLTF 로더로 바꾸면 돼요.
import * as THREE from '../lib/three.js';
import { textTexture } from '../core/Textures.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const shadowed = (g) => { g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; };
const sphere = new THREE.SphereGeometry(1, 14, 10);

export function makePerson({ shirt = 0x2f9e44, pants = 0x343a40, skin = 0xf1c27d, hair = 0x222222, umbrella = false, phone = false, scale = 1 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), mat(shirt));
  torso.position.y = 1.15;
  const head = new THREE.Mesh(sphere, mat(skin)); head.scale.setScalar(0.12); head.position.y = 1.62;
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(hair)); hairM.scale.setScalar(0.125); hairM.position.y = 1.63;
  body.add(torso, head, hairM);
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.1, 0.85, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.65, 4, 8), mat(pants)); leg.position.y = -0.42;
    hip.add(leg); body.add(hip); legs.push(hip);
    const sh = new THREE.Group(); sh.position.set(sx * 0.26, 1.38, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), mat(shirt)); arm.position.y = -0.3;
    sh.add(arm); body.add(sh); legs.push(sh);
  }
  if (phone) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), mat(0x111111, { emissive: 0x3355ff, emissiveIntensity: 0.6 }));
    p.position.set(0.12, 1.25, 0.3); body.add(p);
    legs[1].rotation.x = -1.1; legs[3].rotation.x = -1.1;
  }
  if (umbrella) {
    const u = new THREE.Group();
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.3, 10, 1, true), mat([0xe03131, 0x1971c2, 0x2f9e44, 0xf08c00][Math.floor(Math.random() * 4)], { side: THREE.DoubleSide }));
    top.position.y = 2.15;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9), mat(0x333333)); stick.position.y = 1.7;
    u.add(top, stick); u.position.set(0.15, 0, 0.1); body.add(u);
  }
  root.scale.setScalar(scale);
  shadowed(root);
  return {
    root,
    walk(phase, amt = 1) {
      const s = Math.sin(phase) * 0.5 * amt;
      legs[0].rotation.x = s; legs[2].rotation.x = -s;
      if (!phone) { legs[1].rotation.x = -s * 0.8; legs[3].rotation.x = s * 0.8; }
      body.position.y = Math.abs(Math.cos(phase)) * 0.03 * amt;
    },
    knockDown(t) { body.rotation.x = -Math.min(1, t) * 1.4; body.position.y = 0.2 * Math.min(1, t); },
  };
}

export function makeCar(color = 0xc92a2a) {
  const root = new THREE.Group();
  const paint = mat(color, { metalness: 0.5, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.62, 4.3), paint); body.position.y = 0.6;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.58, 2.2), mat(0x222831, { metalness: 0.6, roughness: 0.15 })); cabin.position.set(0, 1.18, -0.25);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 1.9), paint); roof.position.set(0, 1.49, -0.3);
  root.add(body, cabin, roof);
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14), mat(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.33, z); root.add(w);
  }
  for (const x of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.05), mat(0xffffff, { emissive: 0xfff3bf, emissiveIntensity: 1.5 })); hl.position.set(x, 0.7, 2.16); root.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), mat(0x880000, { emissive: 0xff2222, emissiveIntensity: 1 })); tl.position.set(x, 0.72, -2.16); root.add(tl);
  }
  return shadowed(root);
}

export function makePigeon() {
  const root = new THREE.Group();
  const grey = mat(0x7d8597), dark = mat(0x4a4e69);
  const body = new THREE.Mesh(sphere, grey); body.scale.set(0.09, 0.08, 0.15); body.position.y = 0.12;
  const head = new THREE.Mesh(sphere, dark); head.scale.setScalar(0.05); head.position.set(0, 0.22, 0.12);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), mat(0xffa94d)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.22, 0.18);
  root.add(body, head, beak);
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sx * 0.06, 0.15, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.12), dark); m.position.x = sx * 0.1;
    w.add(m); root.add(w); wings.push(w);
  }
  return { root: shadowed(root), flap(t, amt) { wings[0].rotation.z = Math.sin(t) * amt; wings[1].rotation.z = -Math.sin(t) * amt; }, peck(t) { head.position.y = 0.2 + Math.max(0, Math.sin(t)) * -0.05; } };
}

export function makeAnimal(kind = 'cat') {
  const root = new THREE.Group();
  const fur = mat(kind === 'cat' ? 0xf08c00 : 0x8d6e4a), dark = mat(0x2b2b2b);
  const s = kind === 'cat' ? 1 : 1.5;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11 * s, 0.32 * s, 4, 8), fur); body.rotation.x = Math.PI / 2; body.position.y = 0.25 * s;
  const head = new THREE.Mesh(sphere, fur); head.scale.setScalar(0.11 * s); head.position.set(0, 0.36 * s, 0.26 * s);
  root.add(body, head);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.08 * s, 4), kind === 'cat' ? fur : dark); ear.position.set(sx * 0.06 * s, 0.46 * s, 0.25 * s); root.add(ear);
  }
  const legs = [];
  for (const [x, z] of [[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.15], [0.07, -0.15]]) {
    const l = new THREE.Group(); l.position.set(x * s, 0.2 * s, z * s);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.2 * s), fur); m.position.y = -0.1 * s;
    l.add(m); root.add(l); legs.push(l);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * s, 0.012 * s, 0.3 * s), fur); tail.position.set(0, 0.36 * s, -0.3 * s); tail.rotation.x = -0.7; root.add(tail);
  return { root: shadowed(root), run(t) { legs.forEach((l, i) => { l.rotation.x = Math.sin(t + (i % 2) * Math.PI) * 0.8; }); tail.rotation.z = Math.sin(t * 0.7) * 0.4; } };
}

export function makeCone() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 12), mat(0xff6b00)); c.position.y = 0.38;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.14, 0.1, 12), mat(0xffffff)); band.position.y = 0.42;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat(0x222222)); base.position.y = 0.02;
  g.add(c, band, base);
  return shadowed(g);
}

export function makeBarrier(width = 3) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, 0.6, 0.08), new THREE.MeshStandardMaterial({ map: textTexture('공사중 · 우회하세요', { w: 512, h: 96, bg: '#f59f00', fg: '#111', font: 'bold 52px sans-serif', border: '#111' }) }));
  board.position.y = 0.9;
  g.add(board);
  for (const x of [-width / 2 + 0.15, width / 2 - 0.15]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.5), mat(0xdddddd)); leg.position.set(x, 0.6, 0); g.add(leg); }
  const light = new THREE.Mesh(sphere, mat(0xffd43b, { emissive: 0xffa500, emissiveIntensity: 2 })); light.scale.setScalar(0.07); light.position.set(0, 1.3, 0); g.add(light);
  g.userData.light = light;
  return shadowed(g);
}

export function makePothole(r = 0.7) {
  const shape = new THREE.Shape();
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r * (0.75 + Math.random() * 0.4);
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(0x16161a, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.95, r * 1.15, 14).rotateX(-Math.PI / 2), mat(0x5c5c60, { polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
  const g = new THREE.Group(); g.add(rim, m); m.receiveShadow = rim.receiveShadow = true;
  return g;
}

export function makePuddle(rx = 1.6, rz = 2.4) {
  const geo = new THREE.CircleGeometry(1, 24); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5b6f86, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  m.scale.set(rx, 1, rz);
  m.receiveShadow = true;
  return m;
}

export function makeLeafPatch(w, l, count = 160) {
  const geo = new THREE.CircleGeometry(0.09, 5); geo.rotateX(-Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    p.set((Math.random() - 0.5) * w, 0.005 + Math.random() * 0.01, (Math.random() - 0.5) * l);
    e.set(0, Math.random() * 6, 0); q.setFromEuler(e); s.setScalar(0.7 + Math.random() * 0.8);
    m.compose(p, q, s); inst.setMatrixAt(i, m);
    c.setHSL(0.06 + Math.random() * 0.08, 0.85, 0.35 + Math.random() * 0.2); inst.setColorAt(i, c);
  }
  inst.receiveShadow = true;
  return inst;
}

export function makePickup(kind) {
  const g = new THREE.Group();
  if (kind === 'hotDrink') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.3, 14), mat(0xffffff));
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.115, 0.12, 14), mat(0x8b5a2b));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 14), mat(0x6b3e1f));
    lid.position.y = 0.17;
    g.add(cup, sleeve, lid);
  } else {
    const fish = new THREE.Mesh(sphere, mat(0xd9902a, { roughness: 0.6 })); fish.scale.set(0.09, 0.1, 0.2);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 4), mat(0xd9902a)); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.24;
    const eye = new THREE.Mesh(sphere, mat(0x5a3510)); eye.scale.setScalar(0.018); eye.position.set(0.08, 0.04, 0.12);
    g.add(fish, tail, eye);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 30), new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.7 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.55;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 0.4;
  const root = new THREE.Group();
  g.position.y = 1.1;
  ring.position.y = 0.05;
  root.add(g, ring, beam);
  return { root: shadowed(root), item: g };
}

export function makeTarget() {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35, depthWrite: false }));
  return m;
}
export function makeDropping() {
  const m = new THREE.Mesh(sphere, mat(0xf8f9fa, { roughness: 0.3 }));
  m.scale.set(0.07, 0.09, 0.07);
  return m;
}

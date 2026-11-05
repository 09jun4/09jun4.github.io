// CharacterModel — 박선호 임시 3D 모델 (키 약 175cm, 체중 약 110kg 체형).
// 애니메이션은 PlayerAnimation.js가 joints만 움직이므로, 모델과 애니메이션이 분리돼 있어요.
//
// [모델 교체 인터페이스] 사진 기반 모델(GLTF 등)로 바꿀 때 맞춰야 할 것:
//   root   : 골반 위치를 원점으로 하는 그룹 (로컬 +Z가 앞, +Y가 위)
//   joints : pelvis, spine, chest, neck, head,
//            shoulderL/R, elbowL/R, handL/R, hipL/R, kneeL/R, footL/R
//            (각 관절은 Object3D, 팔·다리 뼈는 로컬 -Y 방향으로 뻗어 있어야 IK가 맞아요)
//   lengths: upperArm, foreArm, thigh, shin (m)
//   setFaceImage(url) : 얼굴 사진 적용 (임시 모델은 얼굴 판에 텍스처로 붙여요)
//   setCleanliness(0~100), addStain(kind), clearStains()
import * as THREE from '../lib/three.js';
import { faceTexture, plaidTexture } from '../core/Textures.js';

export class CharacterModel {
  constructor(opts = {}) {
    const c = {
      skin: 0xf0c8a4, shirt: 0xc4beb3, hoodie: 0xa8a9a8, pants: 0x1d2233, shoes: 0xf1f1f1, hair: 0x15110f, bag: 0x2a2a2a, ...opts.colors,
    };
    this.lengths = { upperArm: 0.3, foreArm: 0.28, thigh: 0.43, shin: 0.42 };
    this.mats = {
      skin: new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.7 }),
      shirt: new THREE.MeshStandardMaterial({ color: c.shirt, roughness: 0.85 }),
      pants: new THREE.MeshStandardMaterial({ color: c.pants, roughness: 0.9 }),
      shoes: new THREE.MeshStandardMaterial({ color: c.shoes, roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.9 }),
      bag: new THREE.MeshStandardMaterial({ color: c.bag, roughness: 0.8 }),
      hoodie: new THREE.MeshStandardMaterial({ color: c.hoodie, roughness: 0.95 }),
      plaid: new THREE.MeshStandardMaterial({ map: plaidTexture(), roughness: 0.8 }),
      lanyard: new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.7 }),
      card: new THREE.MeshStandardMaterial({ color: 0xe8442e, roughness: 0.5 }),
    };
    this.baseColors = { shirt: this.mats.shirt.color.clone(), pants: this.mats.pants.color.clone(), hoodie: this.mats.hoodie.color.clone() };
    const J = (name, parent, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); this.joints[name] = g; return g; };
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
    };
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const limb = (r, len) => { const g = new THREE.CapsuleGeometry(r, len - r * 2, 4, 10); g.translate(0, -len / 2, 0); return g; };

    this.root = new THREE.Group();
    this.root.name = 'sunho';
    this.root.rotation.order = 'YXZ';
    this.joints = {};
    const pelvis = J('pelvis', this.root, 0, 0, 0);
    mesh(sphere, this.mats.pants, pelvis, 0, 0, -0.01, 0.23, 0.14, 0.18);
    const spine = J('spine', pelvis, 0, 0.07, 0);
    this.belly = mesh(sphere, this.mats.shirt, spine, 0, 0.17, 0.05, 0.26, 0.26, 0.25);
    const chest = J('chest', spine, 0, 0.3, 0);
    mesh(sphere, this.mats.hoodie, chest, 0, 0.03, 0, 0.25, 0.19, 0.19);
    mesh(sphere, this.mats.shirt, chest, 0, 0.05, 0.03, 0.12, 0.15, 0.175);
    // 교복 위에 걸친 회색 후드 집업: 몸통은 후드, 앞이 열려 교복(폴로셔츠)이 보임
    this.belly.material = this.mats.hoodie;
    this.shirtFront = mesh(sphere, this.mats.shirt, spine, 0, 0.18, 0.075, 0.13, 0.25, 0.235);
    // 학원 가방(백팩) — 새똥 표적
    this.bag = mesh(new THREE.BoxGeometry(0.32, 0.38, 0.13), this.mats.bag, chest, 0, -0.06, -0.23);
    // 체크무늬 깃 + 목걸이 학생증
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 6, 18), this.mats.plaid);
    collar.rotation.x = Math.PI / 2 - 0.25; collar.position.set(0, 0.15, 0.02); chest.add(collar);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.008, 0.26, 0.008), this.mats.lanyard, chest, sx * 0.05, 0.0, 0.215).rotation.z = sx * 0.18;
    mesh(new THREE.BoxGeometry(0.06, 0.09, 0.008), this.mats.card, chest, 0, -0.15, 0.3);
    const neck = J('neck', chest, 0, 0.16, 0);
    mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), this.mats.skin, neck, 0, 0.03, 0);
    const head = J('head', neck, 0, 0.09, 0.01);
    this.headMesh = mesh(sphere, this.mats.skin, head, 0, 0.105, 0, 0.135, 0.135, 0.13); // 동그랗고 볼살 있는 얼굴
    // 얼굴 판 (사진으로 교체 가능)
    this.faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.7 });
    const face = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20, Math.PI / 2 - 1.0, 2.0, 0.55, 1.9), this.faceMat);
    face.position.set(0, 0.105, 0.002);
    face.scale.set(0.1365, 0.1365, 0.1315);
    head.add(face);
    this.face = face;
    // 바가지 머리: 둥근 정수리 + 눈썹까지 일자로 내려온 앞머리 + 귀를 덮는 옆머리
    mesh(new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), this.mats.hair, head, 0, 0.165, -0.008, 0.15, 0.115, 0.15);
    const fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.148, 0.03, 22, 1, true, -Math.PI * 0.62, Math.PI * 1.24), this.mats.hair);
    fringe.material = this.mats.hair; fringe.position.set(0, 0.155, -0.008); fringe.castShadow = true;
    fringe.material.side = THREE.DoubleSide;
    head.add(fringe);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.138, 0.1, 22, 1, true, Math.PI * 0.45, Math.PI * 0.9), this.mats.hair);
    back.position.set(0, 0.12, -0.008); head.add(back);
    // 귀
    for (const sx of [-1, 1]) mesh(sphere, this.mats.skin, head, sx * 0.125, 0.1, 0, 0.02, 0.035, 0.025);

    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const sh = J('shoulder' + side, chest, sx * 0.25, 0.08, 0);
      mesh(sphere, this.mats.hoodie, sh, 0, 0, 0, 0.09, 0.09, 0.09);
      mesh(limb(0.075, this.lengths.upperArm), this.mats.hoodie, sh);
      const el = J('elbow' + side, sh, 0, -this.lengths.upperArm, 0);
      mesh(limb(0.062, this.lengths.foreArm), this.mats.hoodie, el); // 후드 긴소매
      const hand = J('hand' + side, el, 0, -this.lengths.foreArm, 0);
      mesh(sphere, this.mats.skin, hand, 0, -0.03, 0, 0.045, 0.055, 0.035);

      const hip = J('hip' + side, pelvis, sx * 0.12, -0.03, 0);
      mesh(limb(0.105, this.lengths.thigh + 0.04), this.mats.pants, hip, 0, 0.02, 0);
      const kn = J('knee' + side, hip, 0, -this.lengths.thigh, 0);
      mesh(limb(0.075, this.lengths.shin), this.mats.pants, kn);
      const ft = J('foot' + side, kn, 0, -this.lengths.shin, 0);
      mesh(new THREE.BoxGeometry(0.11, 0.08, 0.27), this.mats.shoes, ft, 0, -0.03, 0.06);
    }
    this.stains = [];
    this.standHeight = this.lengths.thigh + this.lengths.shin + 0.03 + 0.07; // 서 있을 때 골반 높이
  }

  setFaceImage(url) {
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      this.faceMat.map = t;
      this.faceMat.needsUpdate = true;
    });
  }

  // 청결도(100=깨끗) → 옷 색이 점점 흙빛으로
  setCleanliness(c) {
    const t = 1 - c / 100;
    const mud = new THREE.Color(0x6b5236);
    this.mats.shirt.color.copy(this.baseColors.shirt).lerp(mud, t * 0.6);
    this.mats.pants.color.copy(this.baseColors.pants).lerp(mud, t * 0.45);
    this.mats.hoodie.color.copy(this.baseColors.hoodie).lerp(mud, t * 0.6);
  }

  // 얼룩 붙이기: 'poop'(새똥), 'mud'(흙탕물), 'leaf'(낙엽)
  addStain(kind = 'mud') {
    const spots = kind === 'poop'
      ? [['head', 0, 0.25, 0], ['head', 0.05, 0.22, -0.06], ['chest', 0.14, 0.15, 0.05], ['chest', -0.12, 0.13, 0], ['chest', 0, 0.12, -0.28]]
      : kind === 'leaf'
        ? [['chest', 0.1, 0.05, 0.18], ['spine', -0.1, 0.2, 0.28], ['head', 0.06, 0.24, 0]]
        : [['chest', 0, -0.02, -0.3], ['spine', 0, 0.05, -0.2], ['hipL', 0, -0.25, -0.09], ['hipR', 0, -0.2, -0.09], ['kneeL', 0, -0.2, 0.07], ['kneeR', 0, -0.25, 0.07]];
    const [j, x, y, z] = spots[Math.floor(Math.random() * spots.length)];
    const color = kind === 'poop' ? 0xf5f2e8 : kind === 'leaf' ? (Math.random() < 0.5 ? 0xd4a017 : 0xb5651d) : 0x4d3823;
    const geo = kind === 'leaf' ? new THREE.CircleGeometry(0.05, 5) : new THREE.SphereGeometry(kind === 'poop' ? 0.05 : 0.04 + Math.random() * 0.04, 8, 6);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: kind === 'poop' ? 0.3 : 1, side: THREE.DoubleSide }));
    m.position.set(x + (Math.random() - 0.5) * 0.06, y + (Math.random() - 0.5) * 0.05, z);
    if (kind !== 'leaf') m.scale.set(1.2, kind === 'poop' ? 0.5 : 0.35, 1.1);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    if (kind === 'poop') { // 가운데 회색 점
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshStandardMaterial({ color: 0x6f6a5c }));
      dot.position.y = 0.4; m.add(dot);
    }
    this.joints[j].add(m);
    this.stains.push(m);
    if (this.stains.length > 40) { const o = this.stains.shift(); o.parent?.remove(o); }
  }
  clearStains() {
    for (const s of this.stains) s.parent?.remove(s);
    this.stains.length = 0;
    this.setCleanliness(100);
  }
}

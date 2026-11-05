// Bicycle — 자전거 3D 모델(임시: 기본 메시 조합). 물리 값은 BicyclePhysics.js에 따로 있어요.
//
// [모델 교체 인터페이스] 사진 기반 모델로 바꿀 때는 아래 항목만 맞추면 돼요.
//   root            : 자전거 전체 (로컬 +Z가 앞, 원점은 두 바퀴 사이 지면)
//   anchors.seat    : 안장 위 (캐릭터 골반이 놓이는 곳)
//   anchors.gripL/R : 핸들 손잡이 (손 IK 목표)
//   anchors.pedalL/R: 페달 (발 IK 목표)
//   setSteer(rad), setCrank(rad), setWheelSpin(rad), setKickstand(bool), setCleanliness(0~100), addStain(kind)
import * as THREE from '../lib/three.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function tube(a, b, r, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

export class BicycleModel {
  constructor({ color = 0x1d6fb8, wheelRadius = 0.34 } = {}) {
    this.R = wheelRadius;
    this.root = new THREE.Group();
    this.root.name = 'bicycle';
    this.root.rotation.order = 'YXZ';
    this.anchors = {};
    this.frameMat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.4 });
    this.frameBase = new THREE.Color(color);
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.85, roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.8 });
    this.mats = { metal, black };

    // 프레임
    const BB = V(0, 0.30, -0.05), seatTop = V(0, 0.84, -0.25), head = V(0, 0.90, 0.42), headLo = V(0, 0.74, 0.46), rearAx = V(0, wheelRadius, -0.52);
    const f = new THREE.Group();
    f.add(tube(BB, seatTop, 0.022, this.frameMat));
    f.add(tube(V(0, 0.80, -0.23), head, 0.022, this.frameMat));
    f.add(tube(BB, headLo, 0.026, this.frameMat));
    f.add(tube(headLo, head, 0.028, this.frameMat));
    for (const sx of [-0.05, 0.05]) {
      f.add(tube(BB.clone().setX(sx * 0.6), rearAx.clone().setX(sx), 0.012, this.frameMat));
      f.add(tube(V(sx * 0.4, 0.80, -0.23), rearAx.clone().setX(sx), 0.012, this.frameMat));
    }
    f.add(tube(seatTop, V(0, 0.92, -0.27), 0.014, metal)); // 시트포스트
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.28), black);
    saddle.position.set(0, 0.94, -0.27);
    saddle.castShadow = true;
    f.add(saddle);
    // 뒤 짐받이 + 학원 가방 끈 같은 건 생략, 대신 짐받이만
    f.add(tube(V(-0.07, 0.72, -0.30), V(-0.07, 0.72, -0.62), 0.01, metal));
    f.add(tube(V(0.07, 0.72, -0.30), V(0.07, 0.72, -0.62), 0.01, metal));
    this.root.add(f);
    this.frame = f;

    this.anchors.seat = new THREE.Object3D();
    this.anchors.seat.position.set(0, 0.99, -0.29);
    this.root.add(this.anchors.seat);

    // 바퀴
    this.rearWheel = this._wheel(metal, black);
    this.rearWheel.position.copy(rearAx);
    this.root.add(this.rearWheel);

    // 앞쪽(조향): 앞바퀴 축을 기준으로 뒤로 기운 조향축
    this.steerTilt = new THREE.Group();
    this.steerTilt.position.set(0, wheelRadius, 0.53);
    this.steerTilt.rotation.x = -0.18;
    this.steerYaw = new THREE.Group();
    this.steerTilt.add(this.steerYaw);
    this.root.add(this.steerTilt);
    this.frontWheel = this._wheel(metal, black);
    this.steerYaw.add(this.frontWheel);
    for (const sx of [-0.05, 0.05]) this.steerYaw.add(tube(V(sx, 0, 0), V(sx * 0.5, 0.42, 0), 0.013, this.frameMat));
    this.steerYaw.add(tube(V(0, 0.42, 0), V(0, 0.66, -0.02), 0.016, metal));
    this.steerYaw.add(tube(V(0, 0.66, -0.02), V(0, 0.68, -0.09), 0.016, metal));
    this.steerYaw.add(tube(V(-0.3, 0.70, -0.09), V(0.3, 0.70, -0.09), 0.012, metal));
    for (const sx of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 8), black);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(sx * 0.26, 0.70, -0.09);
      this.steerYaw.add(grip);
      const a = new THREE.Object3D();
      a.position.set(sx * 0.26, 0.70, -0.09);
      this.steerYaw.add(a);
      this.anchors[sx > 0 ? 'gripL' : 'gripR'] = a;
    }
    // 앞 바구니 (학원 교재가 들어 있어요)
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.26), new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.4, roughness: 0.6, wireframe: false }));
    basket.position.set(0, 0.58, 0.12);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.18), new THREE.MeshStandardMaterial({ color: 0xc1121f }));
    book.position.set(0, 0.69, 0.12);
    this.steerYaw.add(basket, book);
    // 전조등
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.6 }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 0.6, 0.27);
    this.steerYaw.add(lamp);
    this.anchors.headlight = lamp;

    // 크랭크 + 페달
    this.crank = new THREE.Group();
    this.crank.position.copy(BB);
    this.root.add(this.crank);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 20), metal);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = -0.06;
    this.crank.add(ring);
    this.pedals = [];
    for (const [sx, ph] of [[0.1, 0], [-0.1, Math.PI]]) {
      const arm = new THREE.Group();
      arm.rotation.x = ph;
      arm.position.x = sx;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.17, 0.03), metal);
      bar.position.y = -0.085;
      arm.add(bar);
      const pedal = new THREE.Group();
      pedal.position.set(sx * 0.6, -0.17, 0);
      const pm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.08), black);
      pedal.add(pm);
      arm.add(pedal);
      this.crank.add(arm);
      this.pedals.push(pedal);
      this.anchors[sx > 0 ? 'pedalL' : 'pedalR'] = pedal;
    }
    // 체인 (단순 띠)
    const chain = tube(V(-0.06, 0.30, -0.05), V(-0.06, wheelRadius, -0.52), 0.008, black);
    this.root.add(chain);

    // 킥스탠드
    this.kick = tube(V(-0.04, 0.3, -0.12), V(-0.18, 0.01, -0.2), 0.01, metal);
    this.root.add(this.kick);
    this.kick.visible = false;

    this.stains = new THREE.Group();
    this.root.add(this.stains);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  _wheel(metal, black) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(this.R - 0.02, 0.026, 8, 32), black);
    tire.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(this.R - 0.05, 0.01, 6, 32), metal);
    rim.rotation.y = Math.PI / 2;
    spin.add(tire, rim);
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.004, (this.R - 0.05) * 2, 0.004), metal);
      sp.rotation.x = (i / 8) * Math.PI;
      spin.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10), metal);
    hub.rotation.z = Math.PI / 2;
    spin.add(hub);
    g.userData.spin = spin;
    return g;
  }

  setSteer(a) { this.steerYaw.rotation.y = a; }
  setCrank(a) {
    this.crank.rotation.x = a;
    for (const p of this.pedals) p.rotation.x = -a - p.parent.rotation.x; // 페달은 수평 유지
  }
  setWheelSpin(a) {
    this.rearWheel.userData.spin.rotation.x = a;
    this.frontWheel.userData.spin.rotation.x = a;
  }
  setKickstand(on) { this.kick.visible = on; }

  setCleanliness(c) {
    const t = 1 - c / 100;
    this.frameMat.color.copy(this.frameBase).lerp(new THREE.Color(0x5a4630), t * 0.55);
  }
  addStain(kind = 'mud') {
    const col = kind === 'poop' ? 0xf4f1e6 : kind === 'leaf' ? 0xb5651d : 0x4a3520;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 6, 4), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
    m.scale.y = 0.35;
    const spots = [[0, 0.83, -0.4], [0.05, 0.5, -0.4], [0, 0.6, 0.2], [0, 0.85, 0.1], [-0.05, 0.4, -0.2]];
    const p = spots[Math.floor(Math.random() * spots.length)];
    m.position.set(p[0] + (Math.random() - 0.5) * 0.05, p[1] + (Math.random() - 0.5) * 0.08, p[2] + (Math.random() - 0.5) * 0.1);
    this.stains.add(m);
    if (this.stains.children.length > 30) this.stains.remove(this.stains.children[0]);
  }
  clearStains() { this.stains.clear(); this.setCleanliness(100); }
}

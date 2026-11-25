// 종이 인형: 각진 종이 머리·몸통·팔·다리. 절차적 애니메이션 (대기 / 걷기 / 돌기 / 상호작용 / 접기 지휘).
import * as THREE from '../../vendor/three.module.min.js';
import { objectMaterial } from './PaperMaterial.js';

function strip(w, h, d) { // 아래쪽이 원점인 얇은 판 (팔·다리)
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, -h / 2, 0);
  return g;
}

export class PlayerView {
  constructor(pal, q) {
    this.root = new THREE.Group();
    const paper = objectMaterial(pal, q, 0xfbf9f4, { flatShading: true });
    const shade = objectMaterial(pal, q, 0xe4ded2, { flatShading: true });
    const ink = new THREE.MeshBasicMaterial({ color: 0x3b3a38 });
    this.body = new THREE.Group();
    this.body.position.y = 0.3;
    this.root.add(this.body);

    // 몸통: 위가 좁은 사각뿔대 (접은 종이 옷)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.3, 4, 1), paper);
    torso.rotation.y = Math.PI / 4; torso.position.y = 0.15; torso.scale.z = 0.7;
    this.body.add(torso);
    // 머리: 각진 다면체 (종이접기)
    this.head = new THREE.Group();
    this.head.position.y = 0.42;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), paper);
    head.scale.set(1, 0.95, 0.95);
    this.head.add(head);
    for (const x of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), ink);
      eye.position.set(x, 0.01, 0.118); this.head.add(eye);
    }
    // 머리 위 접힌 모서리 장식
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), shade);
    tip.position.set(0, 0.14, -0.02); tip.rotation.x = -0.4;
    this.head.add(tip);
    this.body.add(this.head);
    // 팔
    const armG = strip(0.05, 0.22, 0.04);
    this.armL = new THREE.Mesh(armG, shade); this.armR = new THREE.Mesh(armG, shade);
    this.armL.position.set(-0.15, 0.27, 0); this.armR.position.set(0.15, 0.27, 0);
    this.body.add(this.armL, this.armR);
    // 다리
    const legG = strip(0.065, 0.3, 0.06);
    this.legL = new THREE.Mesh(legG, shade); this.legR = new THREE.Mesh(legG, shade);
    this.legL.position.set(-0.06, 0.0, 0); this.legR.position.set(0.06, 0.0, 0);
    this.body.add(this.legL, this.legR);
    this.root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    // 발밑 둥근 그림자 (그림자를 끈 착시 장에서도 땅에 붙어 보이게)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3028, transparent: true, opacity: 0.18, depthWrite: false }));
    blob.position.y = 0.004; blob.renderOrder = 2;
    this.root.add(blob);

    this.yaw = 0; this.phase = 0; this.speedK = 0; this.act = 0; this.actKind = ''; this.hop = 0;
  }
  // 상호작용 연출: 'push' | 'pick' | 'fold' | 'bump' | 'win'
  play(kind) { this.actKind = kind; this.act = 1; if (kind === 'pick' || kind === 'win') this.hop = 1; }

  update(dt, t, pos, y, facing, speed, folding) {
    this.root.position.set(pos.x, y, pos.z);
    // 부드러운 회전 (최단 방향)
    let d = facing - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 12);
    this.root.rotation.y = this.yaw;
    this.speedK += (Math.min(1, speed / 2.4) - this.speedK) * Math.min(1, dt * 10);
    this.phase += dt * (4 + 7 * this.speedK);
    const s = Math.sin(this.phase), k = this.speedK;
    this.legL.rotation.x = s * 0.6 * k; this.legR.rotation.x = -s * 0.6 * k;
    let aL = -s * 0.55 * k, aR = s * 0.55 * k, zL = 0.08, zR = -0.08;
    const breathe = Math.sin(t * 2) * 0.008 * (1 - k);
    this.body.position.y = 0.3 + Math.abs(Math.cos(this.phase)) * 0.03 * k + breathe;
    this.head.rotation.z = Math.sin(t * 1.3) * 0.05 * (1 - k);
    // 상호작용
    this.act = Math.max(0, this.act - dt * 2.2);
    const a = Math.sin(this.act * Math.PI);
    if (this.actKind === 'push') { aL = aR = -1.4 * a; }
    if (this.actKind === 'bump') { aR = -1.2 * a; }
    if (this.actKind === 'pick' || this.actKind === 'win') { aL = aR = -2.6 * a; zL = 0.5 * a; zR = -0.5 * a; }
    if (folding) { aR = -2.2 + Math.sin(t * 6) * 0.15; zR = -0.3; } // 접는 동안 팔을 들어 지휘
    this.armL.rotation.set(aL, 0, zL); this.armR.rotation.set(aR, 0, zR);
    // 숨은 통로: 기둥 뒤에서 잠깐 사라졌다 나타남
    const vanish = this.actKind === 'vanish' ? Math.sin(this.act * Math.PI) : 0;
    this.root.scale.setScalar(1.15 * (1 - vanish * 0.95));
    this.hop = Math.max(0, this.hop - dt * 2.5);
    this.body.position.y += Math.sin(this.hop * Math.PI) * 0.12;
  }
}

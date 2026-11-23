import * as THREE from '../../vendor/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });

// 물리 상태를 읽어서 그리기만 한다(물리에 쓰지 않음).
export class Renderer {
  constructor(canvas, sim, cfg) {
    this.sim = sim;
    this.cfg = cfg;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 2)); // ponytail: 품질 설정이 필요하면 여기와 그림자 크기를 메뉴로
    this.gl.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2d3a');
    this.scene.fog = new THREE.Fog('#2a2d3a', 9, 22);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    this.camPos = new THREE.Vector3(0, 1.8, 4.5);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.camSide = new THREE.Vector3(0, 0, 1);
    this.camAngle = Math.PI / 2;

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#4a4060', 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(2, 7, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    this.scene.add(sun);

    this._arena(cfg.physics.ring);
    this.meshes = sim.fighters.map((f, i) => this._fighter(f, i ? cfg.fighter.looks.ai : cfg.fighter.looks.player));
    this.debug = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  _arena(ring) {
    const h = ring.half, s = this.scene;
    const add = (geo, mat, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.receiveShadow = shadow;
      s.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(h * 2 + 0.6, 0.3, h * 2 + 0.6), flat('#4b4f9c'), 0, -0.15, 0);
    add(new THREE.BoxGeometry(30, 0.1, 30), flat('#3a3530'), 0, -0.36, 0);
    // 벽돌 벽 대신 단색 벽 4면
    for (const [x, z, ry] of [[0, -9, 0], [0, 9, Math.PI], [-9, 0, Math.PI / 2], [9, 0, -Math.PI / 2]]) {
      add(new THREE.PlaneGeometry(18, 7), flat('#7a4a3a'), x, 3.1, z, false).rotation.y = ry;
    }
    const post = new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6);
    for (const x of [-h, h]) for (const z of [-h, h]) add(post, flat('#d0d0d8'), x, 0.75, z).castShadow = true;
    this.ropes = [];
    ring.ropeHeights.forEach((y, i) => {
      for (const [x, z, ry] of [[h, 0, 0], [-h, 0, 0], [0, h, Math.PI / 2], [0, -h, Math.PI / 2]]) {
        const mat = flat(i === 1 ? '#eeeeee' : '#c8303a');
        mat.transparent = true;
        const r = add(new THREE.CylinderGeometry(ring.ropeRadius, ring.ropeRadius, h * 2, 6), mat, x, y, z);
        r.rotation.set(Math.PI / 2, ry, 0, 'YXZ');
        this.ropes.push({ mat, n: new THREE.Vector3(Math.sign(x), 0, Math.sign(z)) });
      }
    });
  }

  _fighter(f, look) {
    const skin = this.cfg.fighter.looks.skin;
    const color = { torso: look.top, pelvis: look.trunks, upperLeg: look.trunks, hand: look.glove };
    return Object.values(f.body.parts).map((p) => {
      const d = p.def;
      const geo = d.shape === 'box' ? new THREE.BoxGeometry(d.half[0] * 2, d.half[1] * 2, d.half[2] * 2)
        : d.shape === 'ball' ? new THREE.IcosahedronGeometry(d.radius, 1)
        : new THREE.CapsuleGeometry(d.radius, d.halfHeight * 2, 2, 7);
      const m = new THREE.Mesh(geo, flat(color[p.kind] ?? skin));
      m.castShadow = true;
      this.scene.add(m);
      return { m, body: p.body };
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // 옆에서 두 선수 가운데를 본다. 플레이어(0)가 화면 왼쪽에 오도록 카메라 방향을 고른다.
  _camera(dt) {
    const [a, b] = this.sim.fighters.map((f) => f.body.pos('pelvis'));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).setY(0);
    const dist = dir.length();
    if (dist > 0.05) {
      const side = dir.normalize().cross(UP);
      let diff = Math.atan2(side.z, side.x) - this.camAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // -π~π로 감싸서 짧은 쪽으로 돈다
      this.camAngle += diff * Math.min(1, dt * 1.5);
      this.camSide.set(Math.cos(this.camAngle), 0, Math.sin(this.camAngle));
    }
    const back = 2.4 + dist * 0.8 + (innerWidth < innerHeight ? 1.6 : 0);
    const k = Math.min(1, dt * 3);
    this.camPos.lerp(mid.clone().addScaledVector(this.camSide, back).setY(2.0), k);
    this.camLook.lerp(mid.setY(1.05), k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // 카메라 쪽 로프는 반투명하게 (선수를 가리지 않게)
    for (const r of this.ropes) r.mat.opacity = r.n.dot(this.camSide) > 0.5 ? 0.18 : 1;
  }

  toggleDebug() {
    if (this.debug) { this.scene.remove(this.debug); this.debug = null; return false; }
    this.debug = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.debug.renderOrder = 10;
    this.scene.add(this.debug);
    return true;
  }

  render(dt) {
    for (const list of this.meshes) for (const { m, body } of list) {
      const t = body.translation(), r = body.rotation();
      m.position.set(t.x, t.y, t.z);
      m.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (this.debug) {
      const { vertices, colors } = this.sim.world.debugRender();
      const g = this.debug.geometry;
      g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    }
    this._camera(dt);
    this.gl.render(this.scene, this.camera);
  }
}

import * as THREE from '../../vendor/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
// 로우폴리: 가벼운 램버트 + 면 단위 음영, 같은 색은 재질 하나를 같이 쓴다
const mats = new Map();
const flat = (color, own = false) => {
  if (own) return new THREE.MeshLambertMaterial({ color, flatShading: true });
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return mats.get(color);
};

// 물리 상태를 읽어서 그리기만 한다(물리에 쓰지 않음).
export class Renderer {
  constructor(canvas, sim, cfg) {
    this.sim = sim;
    this.cfg = cfg;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    // 해상도 배율: 1에서 시작해 프레임이 느리면 자동으로 낮추고(최소 0.5), 여유가 생기면 다시 올린다
    this.scale = 1;
    this.frameAvg = 1 / 60;
    this.sinceScale = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2d3a');
    this.scene.fog = new THREE.Fog('#2a2d3a', 9, 22);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    this.camPos = new THREE.Vector3(0, 1.8, 4.5);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.camSide = new THREE.Vector3(0, 0, 1);
    this.camAngle = Math.PI / 2;
    this.trauma = 0; // 화면 흔들림 0~1

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#4a4060', 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(2, 7, 4);
    this.scene.add(sun);
    // 실시간 그림자 대신 발밑 원형 그림자(훨씬 가볍다)
    const blobGeo = new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false });
    this.blobs = sim.fighters.map(() => { const m = new THREE.Mesh(blobGeo, blobMat); this.scene.add(m); return m; });

    this._arena(cfg.physics.ring);
    this.meshes = sim.fighters.map((f, i) => this._fighter(f, i ? cfg.fighter.looks.ai : cfg.fighter.looks.player));
    this.debug = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  _arena(ring) {
    const h = ring.half, s = this.scene;
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      s.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(h * 2 + 0.6, 0.3, h * 2 + 0.6), flat('#4b4f9c'), 0, -0.15, 0);
    add(new THREE.BoxGeometry(30, 0.1, 30), flat('#3a3530'), 0, -0.36, 0);
    // 벽돌 벽 대신 단색 벽 4면
    for (const [x, z, ry] of [[0, -9, 0], [0, 9, Math.PI], [-9, 0, Math.PI / 2], [9, 0, -Math.PI / 2]]) {
      add(new THREE.PlaneGeometry(18, 7), flat('#7a4a3a'), x, 3.1, z).rotation.y = ry;
    }
    const post = new THREE.CylinderGeometry(0.07, 0.07, 1.5, 5);
    for (const x of [-h, h]) for (const z of [-h, h]) add(post, flat('#d0d0d8'), x, 0.75, z);
    this.ropes = [];
    ring.ropeHeights.forEach((y, i) => {
      for (const [x, z, ry] of [[h, 0, 0], [-h, 0, 0], [0, h, Math.PI / 2], [0, -h, Math.PI / 2]]) {
        const mat = flat(i === 1 ? '#eeeeee' : '#c8303a', true);
        mat.transparent = true;
        const r = add(new THREE.CylinderGeometry(ring.ropeRadius, ring.ropeRadius, h * 2, 4), mat, x, y, z);
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
        : d.shape === 'ball' ? new THREE.IcosahedronGeometry(d.radius, 0)
        : new THREE.CapsuleGeometry(d.radius, d.halfHeight * 2, 1, 5);
      const m = new THREE.Mesh(geo, flat(color[p.kind] ?? skin));
      this.scene.add(m);
      return { m, body: p.body };
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 1) * this.scale);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // 옆에서 두 선수 가운데를 본다. 플레이어(0)가 화면 왼쪽에 오도록 카메라 방향을 고른다.
  _camera(dt) {
    const [f0, f1] = this.sim.fighters;
    const a = f0.body.pos('pelvis', _a), b = f1.body.pos('pelvis', _b);
    const dir = _c.subVectors(b, a).setY(0);
    const mid = a.add(b).multiplyScalar(0.5);
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
    this.camPos.lerp(_b.copy(mid).addScaledVector(this.camSide, back).setY(2.0), k);
    this.camLook.lerp(mid.setY(1.05), k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // 흔들림: 세기의 제곱에 비례한 무작위 위치·기울기, 시간이 지나면 잦아든다
    const t = this.trauma * this.trauma;
    if (t > 0) {
      const r = () => Math.random() * 2 - 1;
      this.camera.position.add(_c.set(r(), r(), r()).multiplyScalar(t * 0.18));
      this.camera.rotateZ(r() * t * 0.06);
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }
    // 카메라 쪽 로프는 반투명하게 (선수를 가리지 않게)
    for (const r of this.ropes) r.mat.opacity = r.n.dot(this.camSide) > 0.5 ? 0.18 : 1;
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  // 월드 좌표 → 화면 픽셀
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  }

  toggleDebug() {
    if (this.debug) { this.scene.remove(this.debug); this.debug = null; return false; }
    this.debug = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.debug.renderOrder = 10;
    this.scene.add(this.debug);
    return true;
  }

  // 프레임 시간 평균으로 해상도 배율 조절 (느린 PC에서도 끊기지 않게)
  _adapt(dt) {
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.sinceScale += dt;
    if (this.sinceScale < 1) return;
    const next = this.frameAvg > 1 / 45 ? Math.max(0.5, this.scale - 0.15) : this.frameAvg < 1 / 58 ? Math.min(1, this.scale + 0.1) : this.scale;
    if (next !== this.scale) { this.scale = next; this.sinceScale = 0; this.resize(); }
  }

  render(dt) {
    this._adapt(dt);
    this.sim.fighters.forEach((f, i) => {
      const p = f.body.pos('pelvis', _a);
      this.blobs[i].position.set(p.x, 0.006, p.z);
      this.blobs[i].scale.setScalar(Math.max(0.5, 1.3 - p.y * 0.4));
    });
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

// Visual Layer: 논리 상태(Sim)를 화면에 그려요. 면 그룹 행렬 = 논리 변환, 물체는 붙은 면의 자식.
// 접기 미리보기/애니메이션은 화면 행렬만 바꾸고 논리 상태는 건드리지 않아요.
import * as THREE from '../../vendor/three.module.min.js';
import { buildFaceGeometry, toMatrix, rotAboutMatrix, THICK } from './PaperGeometry.js';
import { faceMaterials } from './PaperMaterial.js';
import { makeObjectView, COL } from './ObjectViews.js';
import { restCenter } from '../logic/Layout.js';
import { creaseAxisWorld } from '../logic/Fold.js';
import { computeConnections } from '../logic/Connection.js';
import { ckey } from '../logic/math.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const LAYER = 0.04; // 겹친 종이 사이 화면용 간격
const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export class StageView {
  constructor(sim, opts) {
    this.sim = sim; this.stage = sim.stage;
    this.pal = opts.palette; this.q = opts.quality; this.camera = opts.camera;
    this.root = new THREE.Group();
    this.faces = new Map(); this.creases = new Map(); this.objs = new Map();
    this.hitList = []; this.faceMeshes = [];
    this.tweens = [];
    this.foldAnim = null;
    this.hover = null; this.selected = null; this.hintCrease = null;
    this.build();
    this.sync(true);
  }

  build() {
    const { stage, sim } = this;
    for (const f of stage.faces) {
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      const mats = faceMaterials(this.pal, this.q, f.tone);
      const mesh = new THREE.Mesh(buildFaceGeometry(f), mats);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.face = f.id;
      group.add(mesh);
      // 막힌 가장자리 턱
      for (const e of f.closed) {
        const along = e[1] === 'u' ? f.v : f.u, len = e[1] === 'u' ? f.h : f.w;
        const up = V(f.n).multiplyScalar(f.n[1] || 1);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats[2]);
        const start = e[1] === 'u' ? restCenter(f, e[0] === '-' ? -0.5 : f.w - 0.5, -0.5) : restCenter(f, -0.5, e[0] === '-' ? -0.5 : f.h - 0.5);
        const mid = V(start).addScaledVector(V(along), len / 2).addScaledVector(up, 0.07);
        const inward = V(e[1] === 'u' ? f.u : f.v).multiplyScalar(e[0] === '-' ? 0.02 : -0.02);
        rim.position.copy(mid).add(inward);
        const m = new THREE.Matrix4().makeBasis(V(along), up, V(along).cross(up));
        rim.quaternion.setFromRotationMatrix(m);
        rim.scale.set(len, 0.14, 0.035);
        rim.castShadow = true;
        group.add(rim);
      }
      this.root.add(group);
      this.faces.set(f.id, { f, group, mesh, mats, offset: 0, fade: 1, ghost: 0 });
      this.faceMeshes.push(mesh);
    }
    // 접힘선: 부모 면 그룹 안의 가는 경첩 + 넓은 터치 영역
    const lineGeo = new THREE.CylinderGeometry(0.026, 0.026, 1, 6);
    const hitGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (const c of stage.creases) {
      const a = V(c.a), b = V(c.b), mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
      const mat = new THREE.MeshBasicMaterial({ color: 0x8d877c });
      const line = new THREE.Mesh(lineGeo, mat);
      line.position.copy(mid); line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); line.scale.y = c.len;
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.copy(mid); hit.quaternion.copy(line.quaternion); hit.scale.y = c.len * 0.96;
      hit.userData.crease = c.id;
      // 손잡이 표시 (가운데 작은 마름모) — 누를 수 있다는 신호
      const knob = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0x8d877c }));
      knob.position.copy(mid);
      const g = this.faces.get(c.parent).group;
      g.add(line, hit, knob);
      this.creases.set(c.id, { c, line, hit, knob, mat, glow: 0 });
      this.hitList.push(hit);
    }
    // 물체
    for (const o of stage.objects) {
      const ctx = { pal: this.pal, q: this.q, obj: o, camera: this.camera, sim, doorAxis: this.doorAxis(o) };
      const view = makeObjectView(o.type, ctx);
      view.root.matrixAutoUpdate = true;
      view.root.traverse(m => { if (m.isMesh) m.userData.obj = o.id; });
      this.objs.set(o.id, { o, view, att: null, gone: false });
    }
    // 광선
    this.beamGroup = new THREE.Group(); this.root.add(this.beamGroup);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.beamCore = new THREE.MeshBasicMaterial({ color: 0xe9fbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamGlow = new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamPool = [];
    // 연결 경계 빛 (인스턴싱)
    const stripGeo = new THREE.PlaneGeometry(1, 0.09).rotateX(-Math.PI / 2);
    this.seamMat = new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    this.seamFlashMat = new THREE.MeshBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.seams = new THREE.InstancedMesh(stripGeo, this.seamMat, 256); this.seams.count = 0;
    this.seamFlash = new THREE.InstancedMesh(stripGeo, this.seamFlashMat, 256); this.seamFlash.count = 0;
    this.seams.frustumCulled = this.seamFlash.frustumCulled = false;
    this.root.add(this.seams, this.seamFlash);
    this.flashT = 0; this.knownPairs = null;
    // 표시 고리 (터치 목표 / 힌트)
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0, depthWrite: false }));
    this.root.add(this.marker); this.markerT = 0;
    this.hintRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0, depthWrite: false }));
    this.root.add(this.hintRing); this.hintT = 0;
  }

  doorAxis(o) {
    if (o.type !== 'door') return null;
    const i = this.sim.byId.get(o.id);
    if (!i) return 'z';
    const [x, y, z] = i.cube, top = this.sim.res.top;
    return (top.has(ckey(x - 1, y, z)) || top.has(ckey(x + 1, y, z))) ? 'x' : 'z';
  }

  // 물체를 붙을 면의 rest 좌표계에 놓는 행렬
  localMatrix(o, att) {
    const f = this.stage.faceById.get(att.face);
    const up = V(f.n).multiplyScalar(att.side);
    const pos = V(restCenter(f, att.i, att.j)).addScaledVector(up, THICK / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    if (o.dir) {
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q), d = V(o.dir);
      const ang = Math.atan2(x.clone().cross(d).dot(up), x.dot(d));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(up, ang));
    }
    return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
  }

  // 논리 상태 → 화면. instant 면 애니메이션 없이 바로.
  sync(instant) {
    const { sim } = this;
    this.computeOffsets();
    for (const [id, fv] of this.faces) {
      fv.base = toMatrix(sim.geo.T[id]).premultiply(new THREE.Matrix4().makeTranslation(0, fv.offset, 0));
      if (!this.foldAnim || !this.foldAnim.moving.has(id)) fv.group.matrix.copy(fv.base);
      fv.group.matrixWorldNeedsUpdate = true;
      const active = sim.active.has(id);
      fv.ghostTarget = active ? 1 : 0;
      if (instant) fv.ghost = fv.ghostTarget;
    }
    this.root.updateMatrixWorld(true);
    for (const [id, ov] of this.objs) {
      const info = sim.byId.get(id);
      if (!info) { // 주운 열쇠
        if (!ov.gone) { ov.gone = true; this.flyAway(ov); }
        continue;
      }
      if (ov.gone) { ov.gone = false; ov.view.root.visible = true; ov.view.root.scale.setScalar(1); }
      const att = info.att;
      if (!ov.att || ov.att.face !== att.face || ov.att.i !== att.i || ov.att.j !== att.j || ov.att.side !== att.side) {
        const target = this.faces.get(att.face).group, local = this.localMatrix(ov.o, att);
        if (ov.att && !instant) this.tweenObject(ov, target, local, ov.pendingFx);
        else { target.add(ov.view.root); local.decompose(ov.view.root.position, ov.view.root.quaternion, ov.view.root.scale); }
        ov.att = { ...att }; ov.pendingFx = null;
      }
    }
    this.rebuildBeams();
    this.rebuildSeams(instant);
  }

  computeOffsets() {
    const { sim } = this, rank = {};
    for (const f of this.stage.faces) rank[f.id] = 0;
    for (const list of sim.geo.hmap.values()) {
      if (list.length < 2) continue;
      const s = list.slice().sort((a, b) => sim.state.order[a] - sim.state.order[b]);
      s.forEach((fid, k) => { rank[fid] = Math.max(rank[fid], k); });
    }
    for (const [id, fv] of this.faces) fv.offset = rank[id] * LAYER;
  }
  topOffset(key) { const fid = this.sim.res.top.get(key); return fid ? this.faces.get(fid).offset : 0; }

  // 블록 이동(밀기·떨어짐) 화면 보간: 월드 공간에서 이동 후 새 면의 자식으로
  tweenObject(ov, targetGroup, local, fx) {
    const r = ov.view.root;
    r.updateMatrixWorld(true);
    const start = r.matrixWorld.clone();
    this.root.attach(r);
    const endWorld = targetGroup.matrixWorld.clone().multiply(local);
    const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3();
    const p1 = new THREE.Vector3(), q1 = new THREE.Quaternion(), s1 = new THREE.Vector3();
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    start.premultiply(inv).decompose(p0, q0, s0);
    endWorld.clone().premultiply(inv).decompose(p1, q1, s1);
    const fall = fx === 'fall', respawn = fx === 'respawn';
    const dur = fall ? 0.45 : respawn ? 0.5 : 0.17;
    this.tweens.push({
      t: 0, dur, step: k => {
        if (respawn) {
          const a = k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2; // 사라졌다가 처음 자리에 다시 나타남
          r.position.copy(k < 0.5 ? p0 : p1);
          r.quaternion.copy(k < 0.5 ? q0 : q1); r.scale.setScalar(Math.max(0.001, a));
        } else if (fall) {
          const e = k * k; // 중력처럼 가속
          r.position.lerpVectors(p0, p1, e);
          r.quaternion.slerpQuaternions(q0, q1, Math.min(1, k * 1.6));
          r.position.x = p0.x + (p1.x - p0.x) * Math.min(1, k * 1.8);
          r.position.z = p0.z + (p1.z - p0.z) * Math.min(1, k * 1.8);
        } else {
          r.position.lerpVectors(p0, p1, easeInOut(k));
          r.quaternion.slerpQuaternions(q0, q1, k);
        }
      },
      done: () => { targetGroup.add(r); local.decompose(r.position, r.quaternion, r.scale); if (fall) this.onLand && this.onLand(); },
    });
  }
  flyAway(ov) {
    const r = ov.view.root, s0 = r.scale.x;
    this.tweens.push({ t: 0, dur: 0.5, step: k => { r.position.y += 0.02; r.scale.setScalar(s0 * (1 - k)); }, done: () => { r.visible = false; } });
  }

  rebuildBeams() {
    const beams = this.sim.puz.beams;
    while (this.beamPool.length < beams.length) {
      const core = new THREE.Mesh(this.beamGeo, this.beamCore), glow = new THREE.Mesh(this.beamGeo, this.beamGlow);
      const g = new THREE.Group(); g.add(core, glow); core.scale.set(0.025, 1, 0.025); glow.scale.set(0.08, 1, 0.08);
      this.beamGroup.add(g); this.beamPool.push(g);
    }
    const up = new THREE.Vector3(0, 1, 0);
    this.beamPool.forEach((g, i) => {
      const b = beams[i];
      g.visible = !!b;
      if (!b) return;
      const a = V(b[0]), c = V(b[1]), len = a.distanceTo(c);
      g.position.copy(a).add(c).multiplyScalar(0.5);
      g.quaternion.setFromUnitVectors(up, c.clone().sub(a).normalize());
      g.scale.set(1, Math.max(0.01, len), 1);
    });
  }

  rebuildSeams(instant) {
    const conns = computeConnections(this.sim).filter(c => c.kind === 'seam');
    const pairs = new Set(conns.map(c => c.key));
    const fresh = this.knownPairs ? conns.filter(c => !this.knownPairs.has(c.key)) : [];
    this.knownPairs = pairs;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const put = (mesh, list) => {
      let n = 0;
      for (const c of list) for (const e of c.edges) {
        if (n >= 256) break;
        const off = this.topOffset(ckey(Math.floor(e.x - (e.axis === 'z' ? 0.5 : 0)), e.y, Math.floor(e.z - (e.axis === 'x' ? 0.5 : 0))));
        p.set(e.x, e.y + THICK / 2 + off + 0.006, e.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.axis === 'z' ? Math.PI / 2 : 0);
        mesh.setMatrixAt(n++, m.compose(p, q, s));
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    };
    put(this.seams, conns);
    put(this.seamFlash, fresh);
    if (fresh.length && !instant) { this.flashT = 1.6; this.onConnect && this.onConnect(fresh); }
    this.connections = conns;
  }

  // ---- 접기 미리보기 / 애니메이션 (화면 전용) ----
  beginFold(cid) {
    const c = this.stage.creaseById.get(cid), ax = creaseAxisWorld(this.sim, cid);
    const pf = this.faces.get(c.parent).offset;
    this.foldAnim = { cid, moving: new Set(c.faces), point: V(ax.point).add(new THREE.Vector3(0, pf, 0)), dir: V(ax.dir), angle: 0 };
    return this.foldAnim;
  }
  setFoldAngle(rad) {
    const fa = this.foldAnim;
    if (!fa) return;
    fa.angle = rad;
    const R = rotAboutMatrix(fa.point, fa.dir, rad);
    for (const id of fa.moving) {
      const fv = this.faces.get(id);
      fv.group.matrix.copy(R).multiply(fv.base);
      fv.group.matrixWorldNeedsUpdate = true;
    }
  }
  endFold() {
    const fa = this.foldAnim;
    this.foldAnim = null;
    if (fa) for (const id of fa.moving) { const fv = this.faces.get(id); fv.group.matrix.copy(fv.base); fv.group.matrixWorldNeedsUpdate = true; }
  }
  // 화면에서 접힐 면의 한 점이 각도에 따라 움직이는 방향 (드래그 → 각도 변환용)
  foldProbePoint(cid) {
    const c = this.stage.creaseById.get(cid), f = this.stage.faceById.get(c.child);
    const T = this.sim.geo.T[c.child];
    const p = restCenter(f, (f.w - 1) / 2, (f.h - 1) / 2);
    const m = toMatrix(T);
    return V(p).applyMatrix4(m).add(new THREE.Vector3(0, this.faces.get(c.child).offset, 0));
  }

  // ---- 강조 ----
  setHover(cid) { this.hover = cid; }
  setSelected(cid) { this.selected = cid; }
  setHintCrease(cid) { this.hintCrease = cid; this.hintT = cid ? 6 : 0; }
  showMarker(pos, ok) {
    this.marker.position.set(pos[0] + 0.5, pos[1] + THICK / 2 + 0.01 + this.topOffset(ckey(...pos)), pos[2] + 0.5);
    this.marker.material.color.setHex(ok ? COL.cyan : 0xd28a7a);
    this.markerT = 1;
  }
  showHintRing(cube) {
    if (!cube) { this.hintT = 0; return; }
    this.hintRing.position.set(cube[0] + 0.5, cube[1] + THICK / 2 + 0.012 + this.topOffset(ckey(...cube)), cube[2] + 0.5);
    this.hintT = 6;
  }

  update(dt, t, playerPos) {
    const sel = this.selected, hov = this.hover;
    // 접힘선 색: 기본 회색 / 마우스 올림 / 선택(청록) / 힌트(금빛)
    for (const [id, cv] of this.creases) {
      const target = id === sel ? 1 : id === hov ? 0.7 : 0.28 + 0.12 * Math.sin(t * 2.4 + cv.c.idx); // 접을 수 있는 선은 늘 은은하게
      cv.glow += (target - cv.glow) * Math.min(1, dt * 12);
      const hint = id === this.hintCrease && this.hintT > 0;
      const col = new THREE.Color(0x8d877c).lerp(new THREE.Color(hint ? COL.gold : COL.cyan), hint ? 0.6 + 0.4 * Math.sin(t * 6) : cv.glow);
      cv.mat.color.copy(col); cv.knob.material.color.copy(col);
      cv.line.scale.x = cv.line.scale.z = 1 + cv.glow * 0.8 + (hint ? 0.6 : 0);
      cv.knob.rotation.y = t * 1.5; cv.knob.scale.setScalar(1 + cv.glow * 0.5 + (hint ? 0.4 * Math.sin(t * 6) : 0));
    }
    // 선택된 접힘선이 돌릴 영역 은은하게 강조
    const rc = sel || hov, region = rc ? new Set(this.stage.creaseById.get(rc).faces) : null;
    for (const [id, fv] of this.faces) {
      fv.ghost += (fv.ghostTarget - fv.ghost) * Math.min(1, dt * 4);
      const em = region && region.has(id) ? 0.1 + 0.04 * Math.sin(t * 4) : 0;
      // 조건부 면(유령 다리)은 꺼져 있으면 희미하게 숨 쉬듯 보여요
      const o = fv.fade * (fv.ghost + (1 - fv.ghost) * (0.16 + 0.06 * Math.sin(t * 3)));
      for (const m of fv.mats) {
        if (m.emissive) m.emissive.setRGB(em * 0.5, em * 0.9, em);
        const tr = o < 0.995;
        if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
        m.opacity = o;
      }
      fv.mesh.castShadow = fv.ghost > 0.5;
    }
    // 물체
    for (const [id, ov] of this.objs) {
      const info = this.sim.byId.get(id);
      if (info) ov.view.update(dt, info, this.sim.puz, t);
    }
    // 보간
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.done && tw.done(); }
    }
    // 빛·연결 반짝임
    this.beamGlow.opacity = 0.28 + 0.1 * Math.sin(t * 7);
    this.seamMat.opacity = 0.22 + 0.12 * Math.sin(t * 2.2);
    this.flashT = Math.max(0, this.flashT - dt);
    this.seamFlashMat.opacity = Math.min(1, this.flashT) * 0.9;
    this.markerT = Math.max(0, this.markerT - dt * 1.5);
    this.marker.material.opacity = this.markerT * 0.9;
    this.marker.scale.setScalar(1 + (1 - this.markerT) * 0.4);
    this.hintT = Math.max(0, this.hintT - dt);
    this.hintRing.material.opacity = Math.min(1, this.hintT) * (0.55 + 0.35 * Math.sin(t * 5));
    if (this.hintT <= 0 && this.hintCrease) this.hintCrease = null;
  }

  // 플레이어를 가리는 면은 반투명하게 (고정 카메라에서 구조물 뒤를 보이게)
  updateOcclusion(raycaster, playerWorld, camDir) {
    raycaster.set(playerWorld.clone().addScaledVector(camDir, -60), camDir);
    raycaster.far = 60 - 0.25;
    const hits = raycaster.intersectObjects(this.faceMeshes, false);
    const hide = new Set(hits.map(h => h.object.userData.face));
    for (const [id, fv] of this.faces) fv.fade += ((hide.has(id) ? 0.28 : 1) - fv.fade) * 0.25;
  }

  faceHit(raycaster) {
    const h = raycaster.intersectObjects(this.faceMeshes, false)[0];
    return h ? h.object.userData.face : null;
  }
  creaseHit(raycaster) {
    const h = raycaster.intersectObjects(this.hitList, false)[0];
    return h ? h.object.userData.crease : null;
  }
  // 터치한 곳 → { cell:[ix,lvl,iz] } 또는 { obj:id }
  pick(raycaster) {
    const targets = [...this.faceMeshes];
    for (const ov of this.objs.values()) if (ov.view.root.visible) targets.push(ov.view.root);
    const hits = raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (h.object.userData.obj) return { obj: h.object.userData.obj };
      const fid = h.object.userData.face;
      if (!fid || this.faces.get(fid).ghost < 0.5) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (Math.abs(n.y) < 0.7) continue; // 벽을 누르면 무시하고 뒤쪽 확인
      const p = h.point;
      const lvl = Math.round(p.y - 0.02);
      return { cell: [Math.floor(p.x), lvl, Math.floor(p.z)] };
    }
    return null;
  }

  dispose() {
    this.root.traverse(o => { if (o.geometry && !o.geometry.parameters) o.geometry.dispose(); });
    for (const fv of this.faces.values()) fv.mats.forEach(m => m.dispose());
  }
}

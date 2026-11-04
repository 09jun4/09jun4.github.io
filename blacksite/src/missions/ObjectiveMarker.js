// 3D 목표 마커: 벽 너머로도 보이는 회전 다이아몬드 + HUD 거리 표시(화면 밖이면 가장자리 화살표).
import * as THREE from 'three';

export class ObjectiveMarker {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x5fb0ff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, wireframe: false });
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, wireframe: true, transparent: true, opacity: 0.9, depthTest: false });
    const geo = new THREE.OctahedronGeometry(0.16, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.add(new THREE.Mesh(geo, this.edgeMat));
    this.mesh.scale.set(1, 1.5, 1);
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.target = null;
    this.t = 0;
    this._v = new THREE.Vector3();
  }
  set(pos) {
    this.target = pos ? pos.clone() : null;
    this.mesh.visible = !!pos;
  }
  update(dt, camera, hud, eye) {
    if (!this.target) { hud.setMarker(0, 0, 0, false); hud.setObjectiveDistance(null); return; }
    this.t += dt;
    this.mesh.position.copy(this.target);
    this.mesh.position.y += Math.sin(this.t * 2) * 0.06;
    this.mesh.rotation.y += dt * 1.5;
    const dist = eye.distanceTo(this.target);
    // 가까우면 흐리게
    this.mat.opacity = dist < 3 ? 0.25 : 0.85;
    // 화면 좌표
    const v = this._v.copy(this.target).project(camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const W = innerWidth, H = innerHeight, m = 40;
    let sx = (x * 0.5 + 0.5) * W, sy = (-y * 0.5 + 0.5) * H;
    const off = behind || sx < m || sx > W - m || sy < m || sy > H - m;
    if (off) {
      // 화면 가장자리로 투영
      const cx = W / 2, cy = H / 2;
      let dx = sx - cx, dy = sy - cy;
      if (behind && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m) / Math.max(1e-3, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
    }
    hud.setMarker(sx, sy + (off ? 0 : 18), dist, true);
    hud.e.marker.classList.toggle('edge', off);
    hud.setObjectiveDistance(dist);
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); this.edgeMat.dispose(); }
}

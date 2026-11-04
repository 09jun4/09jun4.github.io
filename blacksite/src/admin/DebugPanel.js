// 관리자 디버그 패널 (관리자 계정 전용, ` 키로 열고 닫기): FPS · AI 상태 · 웨이포인트/길찾기 시각화 · 무적.
import * as THREE from 'three';
import { el, esc } from '../utils/dom.js';
import { bus } from '../core/EventBus.js';

export class DebugPanel {
  constructor(game) {
    this.game = game;
    this.available = true;
    this.open = false;
    this.opts = { god: false, nav: false, vision: false };
    this.root = el('div', 'dbg hidden');
    this.root.innerHTML = `
      <div class="dbg-h">ADMIN DEBUG <span>\` 닫기</span></div>
      <div class="dbg-fps"></div>
      <label><input type="checkbox" data-o="god"> 무적 GOD MODE</label>
      <label><input type="checkbox" data-o="nav"> 웨이포인트·길찾기 표시</label>
      <label><input type="checkbox" data-o="vision"> 적 시야 거리 표시</label>
      <div class="dbg-ai"></div>`;
    game.uiRoot.appendChild(this.root);
    this.btn = el('button', 'dbg-btn', 'DBG');
    this.btn.title = '관리자 디버그 패널 (`)';
    this.btn.onclick = () => this.toggle();
    game.uiRoot.appendChild(this.btn);
    this.root.querySelectorAll('input').forEach((i) => { i.onchange = () => { this.opts[i.dataset.o] = i.checked; this.apply(); }; });
    addEventListener('keydown', (e) => { if (e.code === 'Backquote' && this.available) { e.preventDefault(); this.toggle(); } });
    bus.on('state:changed', () => { this.viz = null; this.apply(); });
    this.t = 0;
    const loop = () => { this.update(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setAvailable(v) { this.available = v; this.btn.classList.toggle('hidden', !v); if (!v) { this.open = false; this.root.classList.add('hidden'); this.opts.god = false; this.apply(); } }
  toggle() { this.open = !this.open; this.root.classList.toggle('hidden', !this.open); }

  apply() {
    const s = this.game.session;
    if (!s) return;
    s.player.health.god = this.available && this.opts.god;
    if (this.opts.nav && !s._dbgNav) s._dbgNav = this.buildNav(s);
    if (s._dbgNav) s._dbgNav.visible = this.opts.nav;
    if (this.opts.vision && !s._dbgVision) s._dbgVision = this.buildVision(s);
    if (s._dbgVision) s._dbgVision.visible = this.opts.vision;
  }

  buildNav(s) {
    const pts = [], seen = new Set();
    for (const n of s.nav.nodes) for (const e of n.edges) {
      const k = [n, e.to].map((x) => x.x + ',' + x.z).sort().join('|');
      if (seen.has(k)) continue; seen.add(k);
      pts.push(n.x, 0.06, n.z, e.to.x, 0.06, e.to.z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grp = new THREE.Group();
    grp.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a8cff, transparent: true, opacity: 0.5, depthTest: false })));
    // 순찰 웨이포인트
    for (const e of s.enemies) {
      const wp = e.def.waypoints;
      if (!wp) continue;
      const p = [];
      wp.forEach((w, i) => { const n = wp[(i + 1) % wp.length]; p.push(w.pos[0], 0.1, w.pos[2], n.pos[0], 0.1, n.pos[2]); });
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      grp.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffc24a, depthTest: false })));
    }
    grp.renderOrder = 30;
    s.scene.add(grp);
    return grp;
  }

  buildVision(s) {
    const grp = new THREE.Group();
    for (const e of s.enemies) {
      const r = s.diff.visionRange, half = (e.cfg.vision.fovDeg / 2) * Math.PI / 180;
      const geo = new THREE.CircleGeometry(r, 24, Math.PI / 2 - half, half * 2);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = 0.05;
      m.userData.guard = e;
      grp.add(m);
    }
    s.scene.add(grp);
    return grp;
  }

  update() {
    if (!this.open) return;
    const g = this.game, s = g.session;
    this.t++;
    if (s?._dbgVision?.visible) for (const m of s._dbgVision.children) { const e = m.userData.guard; m.position.x = e.x; m.position.z = e.z; m.rotation.y = e.yaw + e.anim.headYaw; m.visible = e.alive; }
    if (this.t % 10) return;
    const info = g.renderer.info.render;
    this.root.querySelector('.dbg-fps').textContent = `FPS ${g.loop.fps.toFixed(0)} · draw ${info.calls} · tris ${(info.triangles / 1000).toFixed(1)}k`;
    this.root.querySelector('.dbg-ai').innerHTML = s ? s.enemies.map((e) => `<div><b>${esc(e.id)}</b> <span class="st-${e.stateName}">${e.stateName}</span> hp ${Math.max(0, e.health)}</div>`).join('') +
      `<div class="dim">player ${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)} · ${s.zone?.id || '-'}</div>` : '<div class="dim">미션 밖</div>';
  }
}

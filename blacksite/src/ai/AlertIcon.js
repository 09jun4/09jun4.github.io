// 적 머리 위 경계 표시: 의심 = 노랑 ?, 발견 = 빨강 !
import * as THREE from 'three';

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const make = (ch, color) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.translate(64, 64);
    ctx.beginPath();
    ctx.moveTo(0, -56); ctx.lineTo(50, 30); ctx.lineTo(-50, 30); ctx.closePath();
    ctx.fillStyle = 'rgba(8,10,12,0.75)'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = color; ctx.font = '700 64px Rajdhani, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  TEX = { '?': make('?', '#ffd23a'), '!': make('!', '#ff3b30') };
  return TEX;
}

export class AlertIcon {
  constructor(parent) {
    this.mat = new THREE.SpriteMaterial({ map: textures()['?'], transparent: true, depthTest: false, depthWrite: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(0.34, 0.34, 1);
    this.sprite.position.set(0, 2.18, 0);
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    parent.add(this.sprite);
    this.kind = null;
    this.t = 0;
  }
  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.sprite.visible = !!kind;
    if (kind) { this.mat.map = textures()[kind]; this.mat.needsUpdate = true; this.t = 0; }
  }
  update(dt, distToPlayer) {
    if (!this.kind) return;
    this.t += dt;
    const pop = Math.min(1, this.t / 0.15);
    const s = 0.34 * (0.6 + 0.4 * pop) * (this.kind === '!' ? 1 + Math.max(0, 0.3 - this.t) : 1);
    this.sprite.scale.set(s, s, 1);
    this.sprite.position.y = 2.18 + Math.sin(this.t * 4) * 0.02;
    this.mat.opacity = distToPlayer > 35 ? 0 : 1;
  }
  dispose() { this.sprite.parent?.remove(this.sprite); this.mat.dispose(); }
}

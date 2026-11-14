// 미닫이 문: F로 열고 닫는다. 패널은 벽 속으로 밀려 들어간다(축 정렬이라 충돌 박스가 단순).
import * as THREE from 'three';
import { boxGeo, roundedBox, mesh } from '../utils/geometry.js';
import { makeBox } from '../physics/Collision.js';

export class Door {
  constructor(def, M, { wallThickness, doorHeight }) {
    this.id = def.id;
    this.def = def;
    this.axis = def.axis; // 'x' = 벽이 x축을 따라 놓임
    this.width = def.width || 1.3;
    this.height = doorHeight;
    this.slide = def.slide || 1;
    this.open = !!def.open;
    this.t = this.open ? 1 : 0; // 0 닫힘 ~ 1 열림
    this.speed = 2.6;
    this.locked = !!def.locked;
    this.cx = def.pos[0];
    this.cz = def.pos[1];
    this.group = new THREE.Group();
    this.group.position.set(this.cx, 0, this.cz);
    if (this.axis === 'z') this.group.rotation.y = Math.PI / 2;
    const w = this.width, h = this.height, t = wallThickness;

    // 문틀 (정적이지만 문 그룹에 둠)
    const frame = new THREE.Group();
    for (const s of [-1, 1]) frame.add(mesh(boxGeo(0.08, h + 0.08, t + 0.06, 0), M.trim, s * (w / 2 + 0.04), (h + 0.08) / 2, 0));
    frame.add(mesh(boxGeo(w + 0.16, 0.1, t + 0.06, 0), M.trim, 0, h + 0.05, 0));
    frame.add(mesh(boxGeo(w, 0.02, t, 0), M.metal, 0, 0.01, 0)); // 문턱
    this.leds = [];
    for (const s of [-1, 1]) {
      const led = mesh(boxGeo(0.12, 0.05, 0.02, 0), this.open ? M.ledGreen : M.ledRed, w / 2 - 0.1, h + 0.05, s * (t / 2 + 0.04));
      led.castShadow = false;
      frame.add(led);
      this.leds.push(led);
    }
    this.group.add(frame);

    // 패널
    this.panel = new THREE.Group();
    this.panel.add(mesh(roundedBox(w - 0.02, h - 0.02, 0.07, 0.015), M.door, 0, h / 2, 0));
    for (const s of [-1, 1]) {
      const win = mesh(boxGeo(0.14, 0.55, 0.005, 0), M.glassDark, -w * 0.22, h * 0.68, s * 0.037);
      win.userData.noMerge = true;
      this.panel.add(win);
      this.panel.add(mesh(boxGeo(w - 0.1, 0.12, 0.005, 0), M.hazard, 0, 0.12, s * 0.037));
      this.panel.add(mesh(boxGeo(0.04, 0.3, 0.03, 0), M.metalDark, w / 2 - 0.12, h * 0.48, s * 0.05));
    }
    this.group.add(this.panel);
    this.M = M;

    // 충돌 박스 (월드 좌표, 문이 움직이면 갱신)
    this.box = makeBox(0, 0, 0, 0, 0, 0, { type: 'door', material: 'metal', ref: this });
    this.halfT = 0.05;
    this._updatePanel();

    // 상호작용 영역: 문 개구부
    const hw = w / 2 + 0.1, ht = t / 2 + 0.25;
    this.interactBox = this.axis === 'x'
      ? makeBox(this.cx - hw, 0, this.cz - ht, this.cx + hw, h, this.cz + ht, { type: 'interact', ref: this })
      : makeBox(this.cx - ht, 0, this.cz - hw, this.cx + ht, h, this.cz + hw, { type: 'interact', ref: this });

    // 문 양쪽의 길찾기 지점
    const off = t / 2 + 0.7;
    this.sides = this.axis === 'x'
      ? [[this.cx, this.cz - off], [this.cx, this.cz + off]]
      : [[this.cx - off, this.cz], [this.cx + off, this.cz]];
  }

  _updatePanel() {
    const shift = this.slide * this.t * (this.width - 0.06);
    this.panel.position.x = shift;
    const w = this.width / 2 - 0.01;
    const b = this.box;
    if (this.axis === 'x') {
      b.minX = this.cx + shift - w; b.maxX = this.cx + shift + w;
      b.minZ = this.cz - this.halfT; b.maxZ = this.cz + this.halfT;
    } else {
      // rotation.y = 90°: 로컬 +x → 월드 -z
      b.minZ = this.cz - shift - w; b.maxZ = this.cz - shift + w;
      b.minX = this.cx - this.halfT; b.maxX = this.cx + this.halfT;
    }
    b.minY = 0; b.maxY = this.height;
    // 거의 다 열리면 통과 가능
    b.enabled = this.t < 0.92;
  }

  // 문틀 안에 캐릭터가 있으면 닫지 않는다
  blockedBy(chars) {
    const ib = this.interactBox;
    return chars.some((c) => c.x > ib.minX - 0.25 && c.x < ib.maxX + 0.25 && c.z > ib.minZ - 0.1 && c.z < ib.maxZ + 0.1);
  }

  toggle(chars = []) {
    if (this.locked) return false;
    if (this.open && this.blockedBy(chars)) return false;
    this.open = !this.open;
    for (const l of this.leds) l.material = this.open ? this.M.ledGreen : this.M.ledRed;
    return true;
  }
  setOpen(v, chars) { if (this.open !== v) return this.toggle(chars); return true; }

  get moving() { return (this.open && this.t < 1) || (!this.open && this.t > 0); }

  update(dt) {
    const target = this.open ? 1 : 0;
    if (this.t === target) return;
    const s = this.speed * dt;
    this.t = this.open ? Math.min(1, this.t + s) : Math.max(0, this.t - s);
    this._updatePanel();
  }

  get label() { return this.open ? 'CLOSE DOOR' : 'OPEN DOOR'; }
}

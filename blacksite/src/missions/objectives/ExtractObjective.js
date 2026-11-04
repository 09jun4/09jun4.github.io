// 목표: 진입 지점(탈출 해치)에서 F로 탈출 → 미션 성공.
import * as THREE from 'three';

export class ExtractObjective {
  constructor(def, mm) {
    this.def = def;
    this.mm = mm;
    this.s = mm.session;
    this.point = this.s.facility.interactableById[def.point];
    if (!this.point) throw new Error('extraction not found: ' + def.point);
    this.active = false;
    this.done = false;
    this.markerPos = this.point.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    mm.session.interaction.add({
      find: (it) => {
        if (this.done) return null;
        const d = it.aimDistance(this.point.box, this.s.cfg.game.interact.distance);
        if (d === null) return null;
        if (!this.active) return { priority: 80, label: 'EXTRACTION LOCKED — 데이터 필요', action: null };
        return { priority: 80, label: 'EXTRACT', action: () => { this.done = true; this.mm.complete(this); } };
      },
    });
  }
  get text() { return this.def.text; }
  start() {
    this.active = true;
    this.point.prop.lamp.material = this.s.game.M.ledGreen;
  }
  update() {}
}

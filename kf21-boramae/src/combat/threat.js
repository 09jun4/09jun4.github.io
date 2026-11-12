// 위협 감지: 적이 나를 쏘고 있거나 뒤에서 가까이 추격하면 방향과 종류를 알려 준다.
// 위협 인터페이스: 감지기는 "출처(source)" 목록을 차례로 물어본다. 출처는 (player, report) => void 함수이고
//   report(kind, worldPos, level)로 위협을 알린다. 적 미사일은 지금 꺼져 있지만(data/enemies.js의 missileEnabled: false)
//   나중에 미사일 출처만 추가하면 같은 HUD 경고에 그대로 나온다.
import * as THREE from 'three';
import { DEG } from '../core/math.js';

export const THREAT_KIND = { GUN: 'gun', CHASE: 'chase', MISSILE: 'missile' };
const PRIORITY = { missile: 3, gun: 2, chase: 1 };
const _rel = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class ThreatMonitor {
  constructor(cfg) {
    this.cfg = cfg;
    this.sources = [];
    /** HUD가 읽는 결과. bearing: 0 = 정면, +π/2 = 오른쪽, π = 뒤 */
    this.state = { active: false, kind: null, bearing: 0, distance: 0, level: 0 };
    this._best = 0;
    this._player = null;
    this._report = (kind, pos, level = 1) => {
      const score = PRIORITY[kind] * 10 + level;
      if (score <= this._best) return;
      const f = this._player.flight;
      _rel.subVectors(pos, f.pos);
      const s = this.state;
      s.distance = _rel.length();
      _rel.applyQuaternion(_q.copy(f.quat).invert());
      s.bearing = Math.atan2(_rel.x, -_rel.z);
      s.kind = kind;
      s.level = level;
      s.active = true;
      this._best = score;
    };
  }

  addSource(fn) {
    this.sources.push(fn);
    return this;
  }

  reset() {
    this.state.active = false;
    this.state.kind = null;
  }

  update(player) {
    this._player = player;
    this._best = 0;
    this.state.active = false;
    this.state.kind = null;
    if (!player.alive) return this.state;
    for (const src of this.sources) src(player, this._report);
    return this.state;
  }
}

/** 적기 출처: 기관포를 쏘는 중이거나, 뒤에 붙어서 기수를 겨누고 있을 때 */
export function enemyGunSource(enemies, cfg) {
  const cos = Math.cos(cfg.chaseCone * DEG);
  return (player, report) => {
    const f = player.flight;
    for (const e of enemies) {
      if (!e.alive) continue;
      _rel.subVectors(f.pos, e.pos);
      const d = _rel.length();
      if (d < 1) continue;
      if (e.fireWarn > 0 && d < cfg.fireRange) { report(THREAT_KIND.GUN, e.pos, 1 - d / cfg.fireRange); continue; }
      if (d > cfg.chaseRange) continue;
      const aimed = _rel.dot(e.forward) / d > cos; // 적 기수가 나를 향한다
      const behind = _rel.dot(f.forward) > 0; // 적이 내 뒤에 있다
      if (aimed && behind) report(THREAT_KIND.CHASE, e.pos, 1 - d / cfg.chaseRange);
    }
  };
}

/** 적 미사일 출처(자리만 마련): missiles는 { active, pos } 목록. 적 미사일이 켜지면 그대로 연결한다 */
export function enemyMissileSource(missiles) {
  return (player, report) => {
    for (const m of missiles) if (m.active) report(THREAT_KIND.MISSILE, m.pos, 1);
  };
}

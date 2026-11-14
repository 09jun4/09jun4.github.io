// 권총 뷰모델 절차 애니메이션: 반동 스프링, 슬라이드 후퇴·고정, 방아쇠, 재장전 시퀀스(탄창 교체).
import { clamp, smooth } from '../utils/math.js';

// 키프레임 보간: keys = [[u, v], ...]
function kf(u, keys) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [u1, v1] = keys[i];
    if (u <= u1) {
      const [u0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smooth((u - u0) / Math.max(1e-6, u1 - u0));
    }
  }
  return keys[keys.length - 1][1];
}

export class WeaponAnimator {
  constructor(model, arms, cfg) {
    this.model = model; // PistolModel
    this.arms = arms;
    this.cfg = cfg;
    // 반동 스프링 상태
    this.kz = 0; this.vz = 0; // 뒤로
    this.ky = 0; this.vy = 0; // 위로
    this.kr = 0; this.vr = 0; // 총구 들림(라디안)
    this.slideT = 1; // 1이면 슬라이드 정위치
    this.slideLocked = false;
    this.triggerT = 1;
    this.leftHome = arms.left.position.clone();
    this.leftRotHome = arms.left.rotation.clone();
    // 재장전 결과 (FirstPersonRig가 루트에 더함)
    this.reloadRot = { x: 0, y: 0, z: 0 };
    this.reloadPos = { x: 0, y: 0, z: 0 };
  }

  fire(empty) {
    const r = this.cfg.recoil;
    this.vz += r.kickBack * 40;
    this.vy += r.kickUp * 40;
    this.vr += ((r.rotUpDeg * Math.PI) / 180) * 40;
    this.slideT = 0;
    this.slideLocked = empty;
    this.triggerT = 0;
  }

  update(dt, weapon) {
    const k = 260, c = 2 * Math.sqrt(k) * 0.75;
    for (const [p, v] of [['kz', 'vz'], ['ky', 'vy'], ['kr', 'vr']]) {
      this[v] += (-k * this[p] - c * this[v]) * dt;
      this[p] += this[v] * dt;
    }
    // 슬라이드: 0.07초 안에 후퇴 후 복귀 (탄창이 비면 뒤에 고정)
    this.slideT = Math.min(1, this.slideT + dt / (this.cfg.slideTime || 0.12));
    this.triggerT = Math.min(1, this.triggerT + dt / 0.1);
    // 격발: 0~30% 구간에 빠르게 후퇴, 이후 스프링으로 복귀 (탄창이 비면 뒤에 고정)
    let slideOff = this.slideT < 0.3 ? smooth(this.slideT / 0.3) : this.slideLocked ? 1 : 1 - smooth((this.slideT - 0.3) / 0.7);

    // 재장전
    const m = this.model, L = this.arms.left;
    let magDrop = 0, magVisible = true;
    let lx = 0, ly = 0, lz = 0, lrx = 0, lrz = 0;
    let gx = 0, gy = 0, gz = 0, grx = 0, gry = 0, grz = 0;
    if (weapon.reloading) {
      const u = clamp(weapon.reloadProgress, 0, 1);
      grz = kf(u, [[0, 0], [0.15, 0.42], [0.8, 0.42], [0.95, 0]]);
      grx = kf(u, [[0, 0], [0.15, 0.22], [0.6, 0.22], [0.66, 0.3], [0.72, 0.18], [0.95, 0]]);
      gy = kf(u, [[0, 0], [0.15, 0.03], [0.8, 0.03], [0.95, 0]]);
      gx = kf(u, [[0, 0], [0.15, -0.04], [0.8, -0.04], [0.95, 0]]);
      // 탄창: 0.16~0.3 낙하, 0.3~0.46 숨김, 0.46~0.66 새 탄창 상승, 0.66~0.7 삽입
      magDrop = kf(u, [[0.14, 0], [0.3, 0.3], [0.46, 0.3], [0.48, 0.18], [0.64, 0.05], [0.7, 0]]);
      magVisible = !(u > 0.3 && u < 0.46);
      // 보조손: 떨어져 나가 새 탄창을 들고 돌아온다
      ly = kf(u, [[0.12, 0], [0.3, -0.24], [0.46, -0.26], [0.64, -0.13], [0.7, -0.115], [0.82, 0]]);
      lx = kf(u, [[0.12, 0], [0.3, -0.08], [0.46, -0.05], [0.64, -0.005], [0.82, 0]]);
      lz = kf(u, [[0.12, 0], [0.3, 0.06], [0.64, 0.03], [0.82, 0]]);
      lrx = kf(u, [[0.12, 0], [0.3, 0.5], [0.64, 0.25], [0.82, 0]]);
      lrz = kf(u, [[0.12, 0], [0.3, -0.4], [0.64, -0.1], [0.82, 0]]);
      // 빈 탄창 재장전: 마지막에 슬라이드 멈치 해제
      if (weapon.reloadEmpty) {
        slideOff = u < 0.78 ? 1 : 1 - clamp((u - 0.78) / 0.05, 0, 1);
        if (u > 0.78) this.slideLocked = false;
      }
    }
    m.slide.position.z = slideOff * (this.cfg.slideTravel || 0.045);
    m.trigger.rotation.x = -0.25 + (1 - this.triggerT) * 0.35;
    // 탄창은 그립 축을 따라 이동 (그립 기울기 -0.3)
    m.magazine.position.set(m.magHome.x, m.magHome.y - Math.cos(0.3) * magDrop, m.magHome.z + Math.sin(0.3) * magDrop);
    m.magazine.visible = magVisible;
    L.position.set(this.leftHome.x + lx, this.leftHome.y + ly, this.leftHome.z + lz);
    L.rotation.set(this.leftRotHome.x + lrx, this.leftRotHome.y, this.leftRotHome.z + lrz);
    this.reloadPos.x = gx; this.reloadPos.y = gy; this.reloadPos.z = gz;
    this.reloadRot.x = grx; this.reloadRot.y = gry; this.reloadRot.z = grz;
  }
}

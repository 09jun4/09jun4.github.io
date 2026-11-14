// 1인칭 뷰모델 리그: 팔+무기를 별도 장면·카메라로 그려 벽을 뚫지 않게 한다.
// 조준(ADS) 보간, 마우스·이동 흔들림, 달리기 자세, 반동·재장전 애니메이션을 합친다.
import * as THREE from 'three';
import { damp, DEG, lerp, smooth } from '../utils/math.js';
import { ViewEffects } from '../weapons/Effects.js';

export class FirstPersonRig {
  constructor(weapon, playerCfg) {
    this.weapon = weapon;
    const vc = weapon.cfg.viewmodel;
    this.vc = vc;
    this.playerCfg = playerCfg;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(vc.fovDeg, innerWidth / innerHeight, 0.005, 5);
    this.hemi = new THREE.HemisphereLight(0xdfe8f0, 0x202326, 0.35);
    this.key = new THREE.DirectionalLight(0xffffff, 0.3);
    this.flashLight = new THREE.PointLight(0xffb866, 0, 2, 1.5); // 총구 화염이 손·총을 비춤
    this.flashLight.position.set(0.1, -0.05, -0.55);
    this.scene.add(this.flashLight);
    this.flashK = 0;
    this.key.position.set(-0.5, 1, 0.4);
    this.scene.add(this.hemi, this.key, this.camera);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.vm = weapon.createViewModel();
    this.holder.add(this.vm.root);
    this.anim = this.vm.animator;
    this.effects = new ViewEffects(this.scene);
    this.effects.attachFlash(this.vm.muzzle);

    this.hip = new THREE.Vector3(...vc.hip);
    // 조준 위치: 가늠자 윗선이 화면 중앙에 오도록 모델에서 계산
    this.aim = new THREE.Vector3(0, -this.vm.sightY + 0.0015, vc.aim[2]);
    this.swayX = 0; this.swayY = 0;
    this.sprintT = 0;
    this.aimT = 0;
    this.time = 0;
    this.visible = true;
    this.tint = new THREE.Color(0xffffff);
    this._v = new THREE.Vector3();
  }

  setTint(color) {
    this.tint.set(color);
    const c = new THREE.Color(0xffffff).lerp(this.tint, 0.45);
    this.hemi.color.copy(c);
    this.key.color.copy(new THREE.Color(0xffffff).lerp(this.tint, 0.25));
  }

  onResize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  fire(empty) {
    this.anim.fire(empty);
    this.effects.muzzleFlash();
    this.flashK = 1;
    // 탄피 배출 (뷰모델 공간)
    const p = this.vm.ejectPort.getWorldPosition(new THREE.Vector3());
    this.effects.ejectCasing(p, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  }

  // 총구의 월드 좌표 (뷰모델 공간 → 실제 카메라 공간)
  muzzleWorld(worldCamera, out = new THREE.Vector3()) {
    this.vm.muzzle.getWorldPosition(out);
    return out.applyMatrix4(worldCamera.matrixWorld);
  }

  update(dt, player, aimT) {
    this.time += dt;
    const w = this.weapon;
    this.aimT = aimT;
    const a = smooth(aimT);
    this.sprintT = damp(this.sprintT, player.sprinting && !w.reloading ? 1 : 0, 10, dt);
    this.anim.update(dt, w);

    // 마우스 흔들림 (지연)
    const sw = this.playerCfg.weaponSway;
    const swayMul = lerp(1, 0.15, a);
    const tx = Math.max(-0.04, Math.min(0.04, -player.lookDX * sw.look)) * swayMul;
    const ty = Math.max(-0.04, Math.min(0.04, player.lookDY * sw.look)) * swayMul;
    this.swayX = damp(this.swayX, tx, sw.return, dt);
    this.swayY = damp(this.swayY, ty, sw.return, dt);

    // 이동 흔들림 (8자)
    const ph = player.bobPhase;
    const bm = player.bobAmt * sw.move * lerp(1, 0.25, a) * (player.sprinting ? 1.6 : 1) * player.shake;
    const bx = Math.sin(ph * 0.5) * bm;
    const by = -Math.abs(Math.cos(ph * 0.5)) * bm * 0.8;
    // 숨쉬기
    const br = lerp(1, 0.3, a);
    const ix = Math.sin(this.time * 1.1) * 0.0012 * br, iy = Math.sin(this.time * 2.2) * 0.0015 * br;

    const an = this.anim;
    const h = this.holder;
    h.position.lerpVectors(this.hip, this.aim, a);
    h.position.x += this.swayX + bx + ix + an.reloadPos.x;
    h.position.y += this.swayY + by + iy + an.reloadPos.y + an.ky;
    h.position.z += an.kz + an.reloadPos.z;
    // 웅크리면 살짝 내려옴, 기울이면 총도 기울어짐
    h.position.y -= player.stance.k * 0.008 * (1 - a);
    const s = this.sprintT;
    const sr = this.vc.sprintRotDeg, so = this.vc.sprintOffset;
    h.position.x += so[0] * s; h.position.y += so[1] * s; h.position.z += so[2] * s;
    h.rotation.set(
      an.kr + an.reloadRot.x + sr[0] * DEG * s - this.swayY * 2,
      lerp(0.035, 0, a) + an.reloadRot.y + sr[1] * DEG * s + this.swayX * 2,
      an.reloadRot.z + sr[2] * DEG * s + player.lean * 0.12 + this.swayX * 1.5,
    );
    // 조준 시 뷰모델 FOV도 살짝 좁힘
    const fov = lerp(this.vc.fovDeg, this.vc.aimFovDeg, a);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.effects.update(dt);
    // 총구 화염 조명 감쇠
    this.flashK = Math.max(0, this.flashK - dt / 0.08);
    this.flashLight.intensity = this.flashK * this.flashK * 6;
    this.flashLight.position.set(h.position.x - 0.02, h.position.y + 0.05, h.position.z - 0.25);
  }

  render(renderer) {
    if (!this.visible) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  dispose() { this.effects.dispose(); this.vm.dispose(); }
}

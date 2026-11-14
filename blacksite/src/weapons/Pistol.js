// 권총 (단일 무기). WeaponBase + PistolModel + 1인칭 팔 + WeaponAnimator.
import * as THREE from 'three';
import { WeaponBase } from './WeaponBase.js';
import { createPistolModel } from './PistolModel.js';
import { createArms } from '../characters/FirstPersonArms.js';
import { WeaponAnimator } from './WeaponAnimator.js';

export class Pistol extends WeaponBase {
  constructor(cfg) { super(cfg); }

  // 반자동: 누를 때마다 한 발
  wantsFire(input) { return input.wasPressed('fire'); }

  createViewModel() {
    const model = createPistolModel();
    const arms = createArms();
    const root = new THREE.Group();
    root.add(model.group, arms.right, arms.left);
    const animator = new WeaponAnimator(model, arms, this.cfg);
    return {
      root, model, arms, animator,
      muzzle: model.muzzle,
      ejectPort: model.ejectPort,
      sightY: model.rearSightY,
      dispose() { model.dispose(); arms.dispose(); },
    };
  }
}

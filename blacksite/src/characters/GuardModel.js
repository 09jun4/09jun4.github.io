// 세미 리얼리스틱 로우폴리 경비원 모델 (관절형 파츠). 외형 색은 guard.json "appearance"로 바꿀 수 있다.
// 인터페이스: createGuardModel(appearance) → { root, joints, weapon, muzzle, head, dispose }
// joints: hips, spine, chest, neck, head, lShoulder, lElbow, rShoulder, rElbow, lHip, lKnee, rHip, rKnee
import * as THREE from 'three';
import { roundedBox, lathe } from '../utils/geometry.js';
import { segment, ellipsoid } from './parts/shapes.js';
import { mergeByJoint } from './parts/merge.js';

function joint(name, x = 0, y = 0, z = 0) {
  const j = new THREE.Group();
  j.name = name;
  j.userData.joint = true;
  j.position.set(x, y, z);
  return j;
}
function place(m, x, y, z, rx = 0, ry = 0, rz = 0) { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m; }

export function createGuardModel(ap = {}, opts = {}) {
  const S = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const mat = {
    uniform: S(ap.uniform || '#2c333a', 0.9),
    vest: S(ap.vest || '#3d454c', 0.85),
    pouch: S(ap.pouch || '#353c42', 0.85),
    helmet: S(ap.helmet || '#23282d', 0.55, 0.15),
    skin: S(ap.skin || '#9c7660', 0.7),
    boots: S(ap.boots || '#141618', 0.6),
    gloves: S(ap.gloves || '#1d2124', 0.75),
    visor: S(ap.visor || '#0d1114', 0.2, 0.6),
    weapon: S(ap.weapon || '#1b1e21', 0.5, 0.5),
    patch: S(ap.patch || '#c79a2a', 0.6),
  };
  const root = new THREE.Group();
  const J = {};
  // 골반
  J.hips = joint('hips', 0, 0.96, 0); root.add(J.hips);
  J.hips.add(place(ellipsoid(0.165, 0.11, 0.115, mat.uniform), 0, 0, 0));
  J.hips.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), mat.pouch), 0, 0.08, 0)); // 벨트
  J.hips.add(place(new THREE.Mesh(roundedBox(0.08, 0.1, 0.05, 0.012), mat.pouch), 0.16, 0.0, 0.03)); // 권총집
  J.hips.add(place(new THREE.Mesh(roundedBox(0.06, 0.06, 0.04, 0.01), mat.patch), 0, 0.08, 0.16));

  // 상체
  J.spine = joint('spine', 0, 0.1, 0); J.hips.add(J.spine);
  J.spine.add(place(ellipsoid(0.15, 0.16, 0.11, mat.uniform), 0, 0.1, 0));
  J.chest = joint('chest', 0, 0.2, 0); J.spine.add(J.chest);
  // 몸통 (회전체로 어깨가 넓은 형태)
  const torso = lathe([[0.0, -0.06], [0.15, -0.05], [0.17, 0.08], [0.19, 0.2], [0.16, 0.27], [0.06, 0.31], [0, 0.31]], 14);
  const tm = place(new THREE.Mesh(torso, mat.uniform), 0, 0, 0); tm.scale.set(1.08, 1, 0.68); J.chest.add(tm);
  // 플레이트 캐리어 + 파우치
  J.chest.add(place(new THREE.Mesh(roundedBox(0.34, 0.34, 0.27, 0.04), mat.vest), 0, 0.1, 0.0));
  for (const x of [-0.1, 0, 0.1]) J.chest.add(place(new THREE.Mesh(roundedBox(0.085, 0.12, 0.05, 0.012), mat.pouch), x, 0.02, 0.145));
  J.chest.add(place(new THREE.Mesh(roundedBox(0.2, 0.06, 0.03, 0.01), mat.patch), 0.0, 0.2, 0.14));
  J.chest.add(place(new THREE.Mesh(roundedBox(0.26, 0.2, 0.06, 0.02), mat.pouch), 0, 0.12, -0.15)); // 등 패널
  J.chest.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.03), mat.visor), -0.13, 0.22, 0.12)); // 무전기
  // 목·머리
  J.neck = joint('neck', 0, 0.3, 0); J.chest.add(J.neck);
  J.neck.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.1, 10), mat.skin), 0, 0.04, 0));
  J.head = joint('head', 0, 0.09, 0.01); J.neck.add(J.head);
  J.head.add(place(ellipsoid(0.092, 0.115, 0.105, mat.skin), 0, 0.08, 0.005));
  J.head.add(place(ellipsoid(0.04, 0.03, 0.03, mat.skin), 0, 0.04, 0.09)); // 턱선
  // 헬멧
  const helm = place(new THREE.Mesh(new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat.helmet), 0, 0.1, -0.005);
  helm.scale.set(1, 0.95, 1.08); J.head.add(helm);
  J.head.add(place(new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.012, 6, 18), mat.helmet), 0, 0.075, -0.005, Math.PI / 2, 0, 0));
  J.head.add(place(new THREE.Mesh(roundedBox(0.16, 0.045, 0.04, 0.015), mat.visor), 0, 0.105, 0.098)); // 고글
  J.head.add(place(new THREE.Mesh(roundedBox(0.05, 0.05, 0.06, 0.01), mat.vest), 0.115, 0.08, 0)); // 헤드셋
  J.head.add(place(new THREE.Mesh(roundedBox(0.05, 0.05, 0.06, 0.01), mat.vest), -0.115, 0.08, 0));

  // 팔: 어깨 → 위팔(0.29) → 팔꿈치 → 아래팔(0.26)
  for (const [side, sx] of [['l', -1], ['r', 1]]) {
    const sh = joint(side + 'Shoulder', sx * 0.2, 0.24, 0); J.chest.add(sh);
    sh.add(place(ellipsoid(0.075, 0.07, 0.075, mat.vest), 0, -0.01, 0));
    sh.add(segment([0, -0.02, 0], [0, -0.28, 0], 0.058, 0.047, mat.uniform));
    const el = joint(side + 'Elbow', 0, -0.29, 0); sh.add(el);
    el.add(segment([0, 0, 0], [0, -0.24, 0], 0.046, 0.037, mat.uniform));
    el.add(place(ellipsoid(0.04, 0.055, 0.03, mat.gloves), 0, -0.3, 0.005));
    J[side + 'Shoulder'] = sh; J[side + 'Elbow'] = el;
  }
  // 다리: 고관절 → 허벅지(0.44) → 무릎 → 정강이(0.43) → 발
  for (const [side, sx] of [['l', -1], ['r', 1]]) {
    const hp = joint(side + 'Hip', sx * 0.095, -0.03, 0); J.hips.add(hp);
    hp.add(segment([0, 0, 0], [0, -0.42, 0], 0.078, 0.06, mat.uniform));
    hp.add(place(new THREE.Mesh(roundedBox(0.06, 0.12, 0.08, 0.015), mat.pouch), sx * 0.075, -0.16, 0.0)); // 허벅지 파우치
    const kn = joint(side + 'Knee', 0, -0.44, 0); hp.add(kn);
    kn.add(segment([0, 0, 0], [0, -0.38, 0], 0.058, 0.046, mat.uniform));
    kn.add(place(new THREE.Mesh(roundedBox(0.09, 0.1, 0.05, 0.02), mat.vest), 0, -0.02, 0.05)); // 무릎 보호대
    kn.add(place(new THREE.Mesh(roundedBox(0.1, 0.11, 0.25, 0.03), mat.boots), 0, -0.44, 0.04)); // 전투화
    J[side + 'Hip'] = hp; J[side + 'Knee'] = kn;
  }

  // 무기: 소형 카빈 — 가슴 관절에 붙여 들고 있는 자세를 만든다
  const weapon = joint('weapon', 0.06, 0.06, 0.26); J.chest.add(weapon);
  weapon.add(place(new THREE.Mesh(roundedBox(0.05, 0.08, 0.36, 0.01), mat.weapon), 0, 0, 0));
  weapon.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), mat.weapon), 0, 0.012, 0.27, Math.PI / 2, 0, 0));
  weapon.add(place(new THREE.Mesh(roundedBox(0.04, 0.14, 0.05, 0.008), mat.weapon), 0, -0.1, 0.06, 0.25, 0, 0)); // 탄창
  weapon.add(place(new THREE.Mesh(roundedBox(0.035, 0.09, 0.04, 0.008), mat.weapon), 0, -0.07, -0.08, -0.3, 0, 0)); // 손잡이
  weapon.add(place(new THREE.Mesh(roundedBox(0.04, 0.07, 0.18, 0.01), mat.weapon), 0, -0.015, -0.26)); // 개머리판
  weapon.add(place(new THREE.Mesh(roundedBox(0.03, 0.04, 0.08, 0.008), mat.visor), 0, 0.065, 0.02)); // 조준경
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, 0.38); weapon.add(muzzle);
  // 총열 아래 전술 손전등 (본체 + 렌즈) — 실제 빛은 EnemyAI가 lightMount에 단다
  weapon.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.11, 10), mat.weapon), 0, -0.032, 0.24, Math.PI / 2, 0, 0));
  weapon.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.05), mat.weapon), 0, -0.016, 0.23));
  const lens = place(new THREE.Mesh(new THREE.CircleGeometry(0.015, 12), new THREE.MeshBasicMaterial({ color: 0xfff4dc })), 0, -0.032, 0.296);
  lens.userData.keep = true; lens.castShadow = false;
  weapon.add(lens);
  const lightMount = new THREE.Object3D(); lightMount.position.set(0, -0.032, 0.3); weapon.add(lightMount);
  J.weapon = weapon;
  if (opts.noRifle) weapon.visible = false;
  if (opts.balaclava) {
    // 전술 요원: 얼굴을 가리는 발라클라바 + 고글
    J.head.add(place(ellipsoid(0.096, 0.118, 0.108, mat.uniform), 0, 0.078, 0.005));
  }

  mergeByJoint(root);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  // 기본 자세 저장
  const rest = {};
  for (const [k, j] of Object.entries(J)) rest[k] = { rot: j.rotation.clone(), pos: j.position.clone() };
  return {
    root, joints: J, rest, muzzle, weapon, lightMount, lens,
    dispose() {
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      Object.values(mat).forEach((m) => m.dispose());
      lens.material.dispose();
    },
  };
}

// 암살 시퀀스 (교체 가능 모듈) — 비현실적·비구체적 연출: 짧은 실루엣 동작, 카메라 컷, 페이드아웃.
// 실제 제압술을 재현하지 않으며 유혈·상세 동작 묘사가 없다.
// 인터페이스: { id, duration, start(ctx), update(ctx, t, dt), end(ctx) }
// ctx: { guard, body(PlayerBodyModel), camera(시네마틱 카메라), setFade(v), player, session }
import * as THREE from 'three';
import { clamp, smooth, lerp } from '../../utils/math.js';

const seg = (t, a, b) => smooth(clamp((t - a) / (b - a), 0, 1));

export default {
  id: 'silhouette',
  duration: 2.6,
  // 소리 신호: 붙잡기 → (컷 B로 넘어가는 순간) 칼로 찌르기 → 낮은 '윽'
  cues: [
    { t: 0.32, sound: 'grab' },
    { t: 1.3, sound: 'stab' },
    { t: 1.39, sound: 'grunt' },
  ],

  start(ctx) {
    const g = ctx.guard, body = ctx.body;
    // 플레이어 전신을 적 바로 뒤에 같은 방향으로 배치
    const fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw);
    ctx.base = { x: g.x, z: g.z, fx, fz, rx: Math.cos(g.yaw), rz: -Math.sin(g.yaw) };
    body.root.visible = true;
    body.root.position.set(0, 0, 0);
    body.root.rotation.set(0, 0, 0);
    body.group.position.set(g.x - fx * 0.62, 0, g.z - fz * 0.62);
    body.group.rotation.y = g.yaw + Math.PI;
    ctx.target = new THREE.Vector3(g.x - fx * 0.3, 1.25, g.z - fz * 0.3);
    // 적은 제자리에 멈춘다
    g.anim.aimTarget = 0;
    g.anim.headYawTarget = 0;
  },

  update(ctx, t) {
    const b = ctx.base, J = ctx.guard.model.joints, R = ctx.guard.model.rest, P = ctx.body.joints;
    // --- 카메라: 컷 A(측면) → 컷 B(낮은 사선) ---
    const cam = ctx.camera;
    if (t < 1.25) {
      const k = t / 1.25;
      cam.position.set(b.x + b.rx * 2.3 - b.fx * (0.6 + k * 0.3), 1.45 - k * 0.1, b.z + b.rz * 2.3 - b.fz * (0.6 + k * 0.3));
      cam.lookAt(ctx.target);
      cam.fov = 42;
    } else {
      const k = (t - 1.25) / 1.35;
      cam.position.set(b.x - b.rx * 1.6 + b.fx * 1.7, 0.75 + k * 0.1, b.z - b.rz * 1.6 + b.fz * 1.7);
      cam.lookAt(ctx.target.x, 1.0 - k * 0.3, ctx.target.z);
      cam.fov = 48;
    }
    cam.updateProjectionMatrix();

    // --- 페이드: 시작 컷을 부드럽게, 끝은 암전 ---
    ctx.setFade(Math.max(1 - seg(t, 0, 0.18), seg(t, 1.18, 1.25) * (1 - seg(t, 1.25, 1.38)), seg(t, 1.95, 2.3)));

    // --- 플레이어 실루엣: 팔을 들어 어깨를 붙잡는 동작 (추상적) ---
    const reach = seg(t, 0.1, 0.55);
    const hold = seg(t, 1.3, 2.0);
    for (const [s, sx] of [['l', -1], ['r', 1]]) {
      P[s + 'Shoulder'].rotation.set(-1.35 * reach, 0, -sx * 0.35 * reach);
      P[s + 'Elbow'].rotation.set(-0.9 * reach, 0, 0);
    }
    P.chest.rotation.x = 0.12 * reach + 0.2 * hold;
    P.hips.position.y = 0.96 - 0.25 * hold;
    P.lKnee.rotation.x = 0.5 * hold; P.rKnee.rotation.x = 0.5 * hold;
    P.lHip.rotation.x = -0.45 * hold; P.rHip.rotation.x = -0.3 * hold;
    // 앞으로 반 걸음
    const step = seg(t, 0.05, 0.4) * 0.22;
    ctx.body.group.position.set(b.x - b.fx * (0.62 - step), 0, b.z - b.fz * (0.62 - step));

    // --- 적: 놀라 움찔 → 힘이 빠져 주저앉음 ---
    const startle = seg(t, 0.35, 0.6) * (1 - seg(t, 1.1, 1.5));
    const slump = seg(t, 1.3, 2.1);
    J.head.rotation.set(-0.35 * startle + 0.5 * slump, 0, 0);
    J.chest.rotation.set(-0.15 * startle + 0.35 * slump, 0, 0);
    J.lShoulder.rotation.set(lerp(-0.95, -0.4, slump) - 0.5 * startle, 0, 0.55 + 0.3 * startle);
    J.rShoulder.rotation.set(lerp(-0.55, -0.2, slump) - 0.4 * startle, 0, -0.18 - 0.3 * startle);
    J.lKnee.rotation.x = 1.1 * slump; J.rKnee.rotation.x = 1.0 * slump;
    J.lHip.rotation.x = -0.6 * slump; J.rHip.rotation.x = -0.5 * slump;
    J.hips.position.y = R.hips.pos.y - 0.35 * slump;
    J.weapon.rotation.x = lerp(0.55, 1.3, slump);
  },

  end(ctx) {
    ctx.body.root.visible = false;
    ctx.setFade(0);
  },
};

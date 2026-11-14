// 시야 감지 (소리 감지 없음): 시야각·거리 + 벽/문 레이캐스트 가림 판정. 앉으면 감지 거리 감소.
import { wrapAngle, DEG } from '../utils/math.js';

// → { level: 'none' | 'peripheral' | 'core', dist }
export function look(guard, player, session) {
  const v = guard.cfg.vision;
  const st = session.cfg.game.stealth;
  const ex = guard.pos.x, ez = guard.pos.z, ey = guard.eyeY;
  const px = player.x, pz = player.z;
  const dx = px - ex, dz = pz - ez;
  const dist = Math.hypot(dx, dz);
  let range = session.diff.visionRange * (player.crouched ? st.crouchVisionMul : st.standVisionMul);
  if (player.sprinting) range *= st.moveRunMul;
  const periRange = range * v.peripheralRangeMul;
  if (dist > range * 1.3) return { level: 'none', dist };
  // 시선 방향 = 몸 방향 + 고개 돌림
  const face = guard.yaw + guard.anim.headYaw;
  const ang = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - face));
  const half = (v.fovDeg / 2) * DEG, periHalf = (v.peripheralFovDeg / 2) * DEG;
  let level = 'none';
  if (ang <= half && dist <= range) level = 'core';
  else if ((ang <= half && dist <= range * 1.3) || (ang <= periHalf && dist <= periRange)) level = 'peripheral';
  if (level === 'none') return { level, dist };
  // 가림 판정: 눈높이와 가슴 높이 두 점 중 하나라도 보이면 보임
  const c = session.collision;
  const eyeY = player.pos.y + player.eyeHeight;
  const chestY = player.pos.y + player.height * 0.6;
  const visible = c.lineOfSight(ex, ey, ez, player.eye.x, eyeY, player.eye.z, 'vision') ||
    c.lineOfSight(ex, ey, ez, px, chestY, pz, 'vision');
  return { level: visible ? level : 'none', dist };
}

// 피해 처리: 적기 피격·격추, 플레이어 피격·패배.
import { debugState } from '../core/debug.js';

/**
 * @param {object} ctx 전투 컨텍스트
 * @param {import('../entities/enemy.js').Enemy} enemy
 * @param {number} amount
 * @param {string} source 무장 id 또는 'collision'
 * @returns {boolean} 격추됐으면 true
 */
export function damageEnemy(ctx, enemy, amount, source) {
  if (!enemy.alive) return false;
  enemy.hp -= amount;
  ctx.onEnemyHit(enemy, source);
  if (enemy.hp > 0) {
    ctx.audio.play('hit_enemy');
    return false;
  }
  enemy.hp = 0;
  ctx.fx.explosion(enemy.pos, enemy.velocity, 1);
  ctx.rig.addShake(ctx.shake.explosion * Math.max(0, 1 - enemy.pos.distanceTo(ctx.player.flight.pos) / 900));
  enemy.despawn(); // 폭발 후 즉시 제거
  ctx.audio.play('explosion');
  ctx.onEnemyKilled(enemy, source);
  return true;
}

/**
 * @param {string} kind 'bullet' | 'collision'
 * @returns {boolean} 격추(패배)됐으면 true
 */
export function damagePlayer(ctx, amount, kind) {
  const player = ctx.player;
  if (!player.alive) return false;
  ctx.onPlayerHit(amount, kind);
  ctx.rig.addShake(kind === 'collision' ? ctx.shake.collision : ctx.shake.hit);
  ctx.audio.play('player_hit');
  if (debugState.invincible) return false;
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp > 0) return false;
  player.alive = false;
  ctx.fx.explosion(player.flight.pos, player.flight.forward.clone().multiplyScalar(player.flight.speed), ctx.playerExplosionScale);
  ctx.onPlayerKilled();
  return true;
}

// 발소리: 바닥 재질별(콘크리트·금속·타일), 달리기·앉기에 따라 크기·간격이 달라진다. 경비원 발소리도 3D로.
import { bus } from '../core/EventBus.js';

const SOUND = { concrete: 'stepConcrete', metal: 'stepMetal', tile: 'stepTile' };

export class Footsteps {
  constructor(audio) {
    this.audio = audio;
    this.zoneAt = null; // (x, z) → zone
    bus.on('player:footstep', ({ x, z, sprint, crouch }) => {
      const mat = this.floor(x, z);
      this.audio.play(SOUND[mat] || 'stepConcrete', { volume: crouch ? 0.35 : sprint ? 1.25 : 0.8, vary: 0.18, rate: crouch ? 0.9 : 1 });
    });
    bus.on('player:land', () => this.audio.play('stepConcrete', { volume: 1.4, rate: 0.8 }));
    bus.on('guard:footstep', ({ x, z, run }) => {
      const mat = this.floor(x, z);
      this.audio.play(SOUND[mat] || 'stepConcrete', { at: { x, z }, range: run ? 20 : 13, volume: run ? 1.1 : 0.8, vary: 0.2 });
    });
  }
  floor(x, z) { return this.zoneAt?.(x, z)?.floor || 'concrete'; }
}

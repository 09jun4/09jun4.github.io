// 사운드는 이번 MVP 범위 밖이다. 호출 지점만 미리 만들어 두고, 나중에 이 파일만 채우면 된다.
// 사용 예: audio.play('gun'), audio.play('missile_launch'), audio.play('explosion')
export const SOUND_NAMES = [
  'ui_click', 'gun', 'gun_overheat', 'weapon_switch', 'lock_tracking', 'lock_on', 'missile_launch',
  'hit_enemy', 'explosion', 'player_hit', 'low_hp', 'mission_clear', 'mission_fail',
];

export const audio = {
  /** @param {string} name SOUND_NAMES 중 하나 @param {object} [opts] 볼륨·위치 등(추후) */
  play(name, opts) {
    void name; void opts;
  },
  stop(name) {
    void name;
  },
  setMasterVolume(v) {
    void v;
  },
};

// 플레이어 전신 (암살 3인칭 연출용): 블랙 전술복 + 다크 그레이 장갑·보호 장비. 일반 플레이 중에는 숨김.
// 경비원과 같은 관절 구조를 써서 같은 관절 애니메이터·암살 시퀀스를 공유한다.
import { createGuardModel } from './GuardModel.js';

export const OPERATIVE_LOOK = {
  uniform: '#121417', vest: '#2a2e33', pouch: '#202428', helmet: '#16191c', skin: '#121417',
  boots: '#0d0f10', gloves: '#3a3f44', visor: '#0b1820', weapon: '#15171a', patch: '#2a8cff',
};

export function createPlayerBodyModel() {
  const m = createGuardModel(OPERATIVE_LOOK, { noRifle: true, balaclava: true });
  m.root.visible = false;
  return m;
}

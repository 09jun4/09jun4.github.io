// 지면 높이(순수 함수): 미션 구역은 활주로 표고로 평평하다. 해안 미션은 해안선(coastZ) 너머가 바다다.
// 원경 지형 셰이더가 같은 반경을 같은 높이로 눌러 주므로(data/takeoff.js의 flattenRadius) 보이는 땅과 정확히 맞는다.
// 좌표는 실제 좌표(활주로 시작점이 원점, 기수 방향 -z)다. 렌더 좌표에서는 world.origin을 더해서 넘긴다.
import { AIRBASE } from '../data/takeoff.js';

export const GROUND = {
  height: AIRBASE.height,
  seaLift: 0.9, // 바다 평면이 땅보다 이만큼 위(겹쳐 보이지 않게)
  coastZ: -4200, // 해안선: 활주로 앞쪽 4.2km부터 바다
  mode: 'inland', // 'inland' | 'coast'
};

export function setGroundMode(mode) {
  GROUND.mode = mode === 'coast' ? 'coast' : 'inland';
}
export const isSea = (x, z) => GROUND.mode === 'coast' && z < GROUND.coastZ;
export const getGroundHeight = (x, z) => (isSea(x, z) ? GROUND.height + GROUND.seaLift : GROUND.height);

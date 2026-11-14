// 암살 시퀀스 레지스트리. 새 시퀀스는 같은 인터페이스로 만들고 여기에 추가하면 된다.
import silhouette from './TakedownSilhouette.js';

export const TAKEDOWNS = { silhouette };
export function pickTakedown(id = 'silhouette') { return TAKEDOWNS[id] || silhouette; }

// 소품 레지스트리: 맵 JSON의 "type" → 생성 함수.
// 새 소품은 create(def, M) → { object, collide?, interact?, absolute? } 형태로 만들고 여기 등록하면 된다.
import * as basic from './basic.js';
import * as rooms from './rooms.js';
import * as interactive from './interactive.js';

export const PROPS = { ...basic, ...rooms, ...interactive };
export function registerProp(type, fn) { PROPS[type] = fn; }

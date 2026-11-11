// 닉네임 규칙(순수 함수): 2~12자, 공백·특수문자 제한, 금칙어, 중복 판정용 키.
import { NICKNAME } from '../data/online.js';

/** 중복 판정용 키: 호환 문자 정규화 + 소문자. 문서 id로 쓰므로 '/' 등은 이미 걸러진 상태여야 한다. */
export const nicknameKey = (name) => name.normalize('NFKC').toLowerCase();

/**
 * @returns {{ok:true, name:string, key:string} | {ok:false, reason:string}}
 */
export function checkNickname(raw) {
  const name = String(raw ?? '').normalize('NFKC').trim();
  if (/\s/.test(name)) return { ok: false, reason: '공백 없이 입력해 주세요.' };
  const len = [...name].length;
  if (len < NICKNAME.min || len > NICKNAME.max) return { ok: false, reason: `${NICKNAME.min}~${NICKNAME.max}자로 입력해 주세요.` };
  if (!/^[\p{L}\p{N}_-]+$/u.test(name)) return { ok: false, reason: '한글, 영문, 숫자, _ , - 만 쓸 수 있어요.' };
  const key = nicknameKey(name);
  if (NICKNAME.banned.some((w) => key.includes(w))) return { ok: false, reason: '사용할 수 없는 말이 들어 있어요.' };
  return { ok: true, name, key };
}

/** 닉네임을 정하기 전의 익명 기본 이름(계정마다 고정) */
export function defaultNickname(uid) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return NICKNAME.defaultPrefix + String(1000 + (h % 9000));
}

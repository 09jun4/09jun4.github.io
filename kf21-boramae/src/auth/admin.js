// 관리자 판별: 소문자 이메일의 SHA-256을 비교한다(이메일 주소는 코드에 없다). 이메일 인증된 계정만 인정.
import { ADMIN_EMAIL_SHA256 } from '../data/online.js';

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isAdminUser(user) {
  if (!user || !user.email || !user.emailVerified) return false;
  if (typeof crypto === 'undefined' || !crypto.subtle) return false;
  try {
    return ADMIN_EMAIL_SHA256.includes(await sha256Hex(user.email.trim().toLowerCase()));
  } catch (e) {
    return false;
  }
}

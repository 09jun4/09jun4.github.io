// Firebase SDK 불러오기. 설정값이 있을 때만 CDN에서 동적으로 가져온다(없으면 아예 요청하지 않는다).
import { FIREBASE_SDK_URL } from '../data/online.js';
import { isDebugEnabled } from '../core/debug.js';

/** js/firebase-config.js 가 만든 전역 설정. 비어 있으면 null */
export function readConfig() {
  const cfg = (typeof window !== 'undefined' && window.KF21_FIREBASE_CONFIG) || null;
  return cfg && cfg.apiKey && cfg.projectId ? cfg : null;
}

/** @returns {Promise<object>} app·auth·firestore 함수가 한데 담긴 객체 */
export async function loadSdk() {
  // 자동 테스트용 가짜 SDK(디버그 모드에서만 허용)
  if (isDebugEnabled() && window.__KF21_FAKE_SDK) return window.__KF21_FAKE_SDK;
  const [app, auth, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => import(/* @vite-ignore */ FIREBASE_SDK_URL + f)));
  return { ...app, ...auth, ...fs };
}

// KF-21 BORAMAE — Firebase 웹 설정 (구글 로그인 · 계정 저장 · 랭킹).
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) > SDK 설정 및 구성 > "구성" 값을 그대로 붙여 넣으세요.
// 이 값들은 공개돼도 괜찮아요(보안은 firestore.rules가 맡아요).
// 비워 두면 온라인 기능 없이 브라우저 저장(localStorage)만 써요.
window.KF21_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
};

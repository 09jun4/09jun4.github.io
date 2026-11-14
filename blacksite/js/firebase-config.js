// BLACKSITE — Firebase 웹 설정 (구글 로그인 · 계정 저장).
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) > SDK 설정 및 구성 > "구성" 값을 그대로 붙여 넣으세요.
// 이 값들은 공개되어도 괜찮아요(보안은 firestore.rules가 담당).
// 비워 두면 Firebase를 초기화하지 않고 브라우저 저장(localStorage)만으로 모든 기능이 동작해요.
window.BLACKSITE_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
};

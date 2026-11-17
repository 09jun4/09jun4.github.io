// Sim Race — Firebase 웹 설정 (구글 로그인 · 계정 저장 · 커리어 랭킹).
// Track Master와 다른, Sim Race 전용 Firebase 프로젝트의 값을 넣어요.
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) > SDK 설정 및 구성 > "구성" 값을 그대로 붙여 넣으세요.
// 이 값들은 공개되어도 괜찮아요(보안은 firestore.rules가 담당).
// 비워 두면 로그인·랭킹 없이 이 브라우저 저장만으로 정상 작동해요.
window.SIMRACE_FIREBASE_CONFIG = {
  // apiKey: '...',
  // authDomain: '...firebaseapp.com',
  // projectId: '...',
  // appId: '...',
};

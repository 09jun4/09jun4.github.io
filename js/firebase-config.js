// 사이트 공통 구글 로그인 설정 (Firebase). 이 값들은 공개돼도 괜찮아요 — 보안은 Firestore 규칙이 맡아요.
// 비워 두면 로그인·피드백 없이 작품 목록만 보여요.

// 사이트 로그인 · 피드백 · 노트가 쓰는 프로젝트.
// 치이카와 토벌 대작전과 같은 프로젝트라서, 사이트에 로그인하면 그 작품은 따로 할 일 없이 같이 로그인돼요.
export const SITE_FIREBASE = {
  apiKey: 'AIzaSyDXqKQmXfmW1v_kgPgYt7o-cfS0hYHxOsc',
  authDomain: 'chiikawa-tobatsu.firebaseapp.com',
  projectId: 'chiikawa-tobatsu',
  storageBucket: 'chiikawa-tobatsu.firebasestorage.app',
  messagingSenderId: '1003122685004',
  appId: '1:1003122685004:web:b1dcc20f22d77e892430e9',
};

// 다른 Firebase 프로젝트를 쓰는 작품: 사이트에 로그인하면 js/bridge.html 이 이 작품들에도 같이 로그인시켜요.
// configScript 는 그 작품의 firebase-config.js (사이트 루트 기준), configGlobal 은 그 파일이 만드는 전역 이름이에요.
// 그 작품의 Firebase 콘솔 > Authentication > 로그인 방법 > Google > 웹 SDK 구성 >
// "외부 프로젝트의 클라이언트 ID 허용" 목록에 위 사이트 프로젝트의 웹 클라이언트 ID를 넣어야 연결돼요.
export const LINKED_WORKS = [
  { id: 'f1-champion', title: 'F1 Champion', configScript: 'f1-champion/js/firebase-config.js', configGlobal: 'F1C_FIREBASE_CONFIG' },
];

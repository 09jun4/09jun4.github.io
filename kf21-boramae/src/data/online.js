// 온라인 기능 설정(Firebase 구글 로그인 · 계정 저장 · 랭킹).
export const FIREBASE_SDK_URL = 'https://www.gstatic.com/firebasejs/13.1.0/'; // 사이트 공통 로그인(js/auth.js)과 같은 버전

// 관리자: 소문자 구글 이메일의 SHA-256 (주소 자체는 공개 저장소에 쓰지 않는다). 이메일 인증된 계정만 인정.
export const ADMIN_EMAIL_SHA256 = ['c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991'];

export const NICKNAME = {
  min: 2,
  max: 12,
  defaultPrefix: '보라매', // 닉네임을 정하기 전의 익명 기본 이름: 보라매1234
  // 포함되면 쓸 수 없는 말(운영자 사칭 + 대표적인 욕설). 완벽한 필터가 아니라 합리적인 수준의 차단이다.
  banned: ['관리자', '운영자', 'admin', 'gm', '시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새', '새끼', '지랄', '느금', 'fuck', 'shit', 'bitch', 'sex'],
};

export const RANKING = {
  top: 50,
  cacheMs: 30000,
  minTime: 8, // 이보다 빠른 클리어 기록은 받지 않는다(규칙과 같은 값)
};

export const SETTINGS_SYNC_DELAY = 1500; // 설정 변경 후 계정에 올리기까지(ms)
/** 기기마다 다른 게 자연스러운 설정은 계정에 올리지 않는다 */
export const DEVICE_ONLY_SETTINGS = ['quality', 'autoQuality', 'benchmarked', 'inputMode', 'gyro', 'gyroSens', 'gyroInvert', 'stickSens', 'mobileHighOk'];

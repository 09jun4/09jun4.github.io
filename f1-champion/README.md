# F1 Champion

https://09jun4.github.io/f1-champion/

## 온라인 기능 (구글 로그인 · 계정 저장 · 랭킹)

Firebase(Auth + Firestore)를 씁니다. `js/firebase-config.js`가 비어 있으면 온라인 기능 없이 브라우저 저장만 사용해요.

1. https://console.firebase.google.com 에서 프로젝트 만들기 (애널리틱스는 꺼도 됨)
2. **Authentication** → 시작하기 → 로그인 방법 → **Google** 사용 설정
3. **Authentication** → 설정 → 승인된 도메인에 `09jun4.github.io` 추가
4. **Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
5. **Firestore** → 규칙 탭에 `firestore.rules` 내용을 붙여 넣고 게시
6. 프로젝트 설정 → 내 앱 → 웹 앱(`</>`) 추가 → 표시되는 `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId`를 `js/firebase-config.js`에 입력

## 데이터 구조

| 경로 | 내용 | 권한 |
|---|---|---|
| `users/{uid}` | 저장 데이터(JSON 문자열), 닉네임 | 본인만 |
| `tracks/{서킷}/laps/{uid}` | 서킷별 연습 베스트 랩, 3인칭 (기기: mobile/pc) | 읽기 공개, 쓰기 본인 |
| `tracks/{서킷}/laps_cockpit/{uid}` | 서킷별 연습 베스트 랩, 1인칭 | 읽기 공개, 쓰기 본인 |
| `career/{uid}` | AI 대전 포인트·우승·챔피언 | 읽기 공개, 쓰기 본인 |

`js/vendor/firebase.js`는 Firebase JS SDK 10.14.1(app, auth, firestore)을 esbuild로 묶은 파일입니다.

# 09jun4.github.io — 작업 규칙

이 저장소는 09jun4의 개인 웹사이트(https://09jun4.github.io/)이자 **모든 작품을 저장하는 곳**이에요.
Claude Code에서 새로 만든 웹 게임·프로그램은 다른 저장소가 아니라 **이 저장소에 저장**해요.

## 새 작품 추가
1. 작품은 자기 폴더에 넣어요: `<작품-이름>/index.html` (주소: `https://09jun4.github.io/<작품-이름>/`)
2. `data/works.js` 목록에 **한 줄만 추가**해요. 다른 작품 줄은 지우거나 바꾸지 않아요.
   ```js
   { title: '작품 이름', url: '/작품-이름/', thumb: 'assets/thumbs/작품-이름.jpg', date: 'YYYY-MM-DD', desc: '한 줄 설명' },
   ```
3. 썸네일: 작품을 실제로 실행해 캡처한 **4:3 가로 이미지(1200x900 jpg)** 를 `assets/thumbs/작품-이름.jpg`로 저장해요.
   모든 작품이 첫 화면에서 같은 형식(4:3 썸네일 + 제목 + 한 줄 설명)의 카드로 보여야 해요.
4. 작업 전에 항상 `git pull`로 최신 상태를 받아서, 다른 세션이 올린 작품을 덮어쓰지 않아요.
5. 커밋 후 `main` 브랜치에 push하면 GitHub Pages로 바로 배포돼요.

## 구글 로그인 · 계정 저장 (새 게임·프로그램 기본 포함)
새 웹 게임이나 프로그램을 만들면 **처음부터** 구글 계정 로그인과 계정 저장을 함께 만들어요.
참고 구현: `f1-champion/` (`js/cloud.js`, `js/firebase-config.js`, `firestore.rules`, `js/vendor/firebase.js`, `README.md`).

- 방식: Firebase Authentication(구글 로그인) + Firestore. 설정값은 `js/firebase-config.js`로 분리하고, 보안 규칙은 `firestore.rules` 파일로 함께 만들어요.
- 설정값이 비어 있어도 브라우저 저장(localStorage)으로 정상 작동해야 해요.
- Firebase 프로젝트는 사용자가 직접 만들어요. 콘솔 설정 순서를 안내하고 웹 앱 config 값을 사용자에게 요청해요:
  1. 프로젝트 만들기 → 2. Authentication에서 Google 로그인 사용 설정 → 3. 승인된 도메인에 `09jun4.github.io` 추가
  → 4. Firestore 생성(위치 `asia-northeast3` 서울, 프로덕션 모드) → 5. 규칙 탭에 `firestore.rules` 게시 → 6. 웹 앱 config 복사
- 규칙을 바꾸면(필드 추가 등) 사용자에게 콘솔에서 규칙을 다시 게시해 달라고 알려요. 게시 전에도 동작하도록 클라이언트에 대비책을 둬요.
- 저장: 계정별 저장 데이터는 본인만 읽고 써요. 로그인 전 게스트 진행은 첫 로그인 때 계정으로 옮기고(게스트 칸은 비움), 로그아웃하면 게스트 상태로 돌아가요.
- 랭킹이 있으면 읽기는 누구나, 쓰기는 본인 기록만 되게 규칙을 만들어요. 랭킹에는 실명 대신 직접 정한 닉네임(2~12자)을 쓰고, 정하기 전에는 익명 기본 이름을 써요.
- 인스타그램·카카오톡 같은 앱 안 브라우저에서는 구글 로그인이 막히므로 "다른 브라우저로 열기" 안내를 띄워요.
- 사이트 로그인과 연결: 사이트(`js/auth.js`)에 로그인하면 작품을 열 때도 로그인돼 있어야 해요.
  작품의 Firebase 앱은 기본 이름으로 `initializeApp(config)` + `getAuth(app)`(기본 저장 방식)로 만들어요.
  작품이 자기 Firebase 프로젝트를 쓰면 `js/firebase-config.js`의 `LINKED_WORKS`에 한 줄 추가하고,
  사용자에게 그 프로젝트의 Authentication > 로그인 방법 > Google > 웹 SDK 구성 > "외부 프로젝트의 클라이언트 ID 허용"에
  사이트 프로젝트(chiikawa-tobatsu)의 웹 클라이언트 ID를 넣어 달라고 안내해요.
- 관리자: 사이트 주인의 구글 계정에 관리자 권한을 줘요. 이 저장소는 공개라서 **이메일 주소를 파일에 쓰지 않고**, 소문자 이메일의 SHA-256 해시만 넣어요:
  `c94452ff79ea035becf03e8b1575c2728bd33fd4fab06e92a8091383399f1991` (판별 방법은 `f1-champion/js/cloud.js`의 `checkAdmin` 참고, 이메일 인증된 계정만 인정)

## 사이트 구조 (디자인: 검정 바탕 모노, 이모지 없이 단순하게)
- `index.html` — 작품 카드 목록 (방문자에게는 이것만 보임)
- `feedback/` — 방문자 의견 남기기(구글 로그인 필요). 읽기·정리는 관리자만. 작품에서 `/feedback/?work=/작품-이름/`으로 링크하면 그 작품이 골라져요.
- `js/auth.js`, `js/firebase-config.js`, `js/bridge.html` — 사이트 공통 구글 로그인 (머리말 login 버튼, 연결된 작품 같이 로그인·로그아웃)
- `firestore.rules` — 사이트 프로젝트(chiikawa-tobatsu)에 게시된 규칙에 덧붙이는 `notes`·`feedback` 규칙. 콘솔에 있는 기존 규칙(치이카와, `private/**`)은 지우지 않아요.
- `notes/` — 위키식 공개 노트(바이브 코딩하며 공부한 내용). `[[노트 제목]]` 링크·역링크·분류·태그·목차 지원. 누구나 읽고, 쓰기·수정·삭제는 관리자 계정만. 내용은 Firestore `private/notes/items`에 있고(이름만 private), 저장소에 파일로 올리지 않아요.
- `assets/style.css`, `assets/site.js` — 공통 스타일·카드
- 치이카와 토벌 대작전은 별도 저장소 `09jun4/chiikawa-tobatsu` (주소 `/chiikawa-tobatsu/`)

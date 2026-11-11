# KF-21 BORAMAE

https://09jun4.github.io/kf21-boramae/

KF-21 보라매를 몰고 적기를 격추하는 3D 전투기 슈팅(싱글 플레이, 미션 3개). PC 크롬, 키보드+마우스.

| 키 | 동작 |
|---|---|
| W / S | 기수 내림 / 올림 |
| A / D | 좌 / 우 선회 |
| 마우스 · 좌클릭 | 무장 조준 · 발사 |
| F | 기관포 ↔ 미사일 |
| V | 3인칭 ↔ 조종석 |
| ESC | 일시정지 |

## 실행 · 배포

- **배포**: 빌드가 필요 없다. 이 폴더를 그대로 `main`에 올리면 된다(`index.html`의 importmap이 `js/vendor/three.min.js`를 불러온다).
- **개발**: `npm install` 후 `npm run dev`.
- **테스트**: `npm test`(단위 테스트), `npm run smoke`(브라우저 스모크), `node tests/playthrough.cjs`(미션 1~3 자동 완주), `node tests/perf.cjs`(성능·메모리).
- 구조·알고리즘·튜닝 값 위치·알려진 한계는 [DESIGN.md](DESIGN.md).
- 디버그: 주소 뒤에 `?debug=1`을 붙이면 콘솔에서 `__debug.skipMission()`, `__debug.invincible()`, `__debug.spawnEnemy(3)`, `__debug.showFps()`를 쓸 수 있다.

## 온라인 기능 (구글 로그인 · 계정 저장 · 랭킹)

Firebase(Authentication + Firestore)를 쓴다. `js/firebase-config.js`가 비어 있으면 온라인 기능 없이 브라우저 저장(localStorage)만 쓴다.

1. https://console.firebase.google.com 에서 프로젝트 만들기(애널리틱스는 꺼도 됨)
2. **Authentication** → 시작하기 → 로그인 방법 → **Google** 사용 설정
3. **Authentication** → 설정 → 승인된 도메인에 `09jun4.github.io` 추가
4. **Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
5. **Firestore** → 규칙 탭에 `firestore.rules` 내용을 통째로 붙여 넣고 게시
6. 프로젝트 설정 → 내 앱 → 웹 앱(`</>`) 추가 → `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId`를 `js/firebase-config.js`에 입력
7. (사이트 로그인과 연결) 사이트 루트 `js/firebase-config.js`의 `LINKED_WORKS`에 이 작품을 추가하고, 이 프로젝트의 Authentication → 로그인 방법 → Google → 웹 SDK 구성 → "외부 프로젝트의 클라이언트 ID 허용"에 사이트 프로젝트(chiikawa-tobatsu)의 웹 클라이언트 ID를 넣는다.

| 경로 | 내용 | 권한 |
|---|---|---|
| `users/{uid}` | 진행도·설정(JSON 문자열), 닉네임 | 본인만 |
| `nicknames/{닉네임}` | 닉네임 중복 방지 | 읽기 공개, 본인 것만 생성·삭제 |
| `rankings/{미션}/scores/{uid}` | 미션별 최고 점수 | 읽기 공개, 쓰기 본인(점수식 검증), 삭제 본인·관리자 |

규칙을 바꾸면 콘솔에서 다시 게시해야 적용된다.

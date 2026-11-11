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
| C (누른 채 마우스) | 조종석에서 둘러보기 |
| Enter / Space | 이륙 연출 건너뛰기 |
| ESC | 일시정지 |

## 그래픽 품질

설정에서 **낮음 / 높음 / 최고**를 고른다. 처음 실행하면 약 2초 동안 성능을 재서 자동으로 고르고, 느려지면 한 칸씩 자동으로 내린다(끌 수 있음).

- 낮음: 가벼운 로우폴리(내장 그래픽 노트북용), 후처리 없음
- 높음: 하이폴리 기체·조종석, PBR, 블룸·렌즈 플레어, GPU 파티클
- 최고: 기체 20만 삼각형 이상, 모션 블러, 파티클 최대

도색(회색 / 어두운 회색 / 도심 위장)과 이륙 연출 건너뛰기도 설정에 있다.

## 실행 · 배포

- **배포**: 빌드가 필요 없다. 이 폴더를 그대로 `main`에 올리면 된다(`index.html`의 importmap이 `js/vendor/three.min.js`를 불러온다).
- **개발**: `npm install` 후 `npm run dev`.
- **테스트**: `npm test`(단위 테스트), `npm run smoke`(브라우저 스모크), `node tests/playthrough.cjs`(미션 1~3 자동 완주), `node tests/perf.cjs`(프리셋별 성능·메모리), `node tests/v2-model.cjs high`(기체 캡처) 등 `tests/v*.cjs`(비주얼 단계별 검증).
- 구조·알고리즘·튜닝 값 위치·알려진 한계는 [DESIGN.md](DESIGN.md).
- 디버그: 주소 뒤에 `?debug=1`을 붙이면 콘솔에서 `__debug.skipMission()`, `__debug.invincible()`, `__debug.spawnEnemy(3)`, `__debug.showFps()`, `__debug.measure(3)`(FPS 평균·하위 1%·드로우콜·삼각형), `__debug.benchmark(true)`를 쓸 수 있다.

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

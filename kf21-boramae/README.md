# KF-21 BORAMAE

https://09jun4.github.io/kf21-boramae/

KF-21 보라매를 몰고 적기를 격추하는 3D 전투기 슈팅(싱글 플레이, 미션 3개). PC(키보드+마우스)와 모바일(가로 화면, 터치)에서 된다.


## 조작

**PC** — 미션 중에는 마우스가 화면에 잠기고(포인터락) 가상 조준점이 움직인다. ESC를 누르면 잠금이 풀리며 일시정지된다.

| 입력 | 동작 |
|---|---|
| W / S | 기수 내림 / 올림 |
| A / D | 좌 / 우 선회 |
| 마우스 | 조준점 이동 |
| 좌클릭 | 발사(기관포는 누르고 있기, 미사일은 락온 뒤) |
| 우클릭 누른 채 이동 | 마우스로 조향(움직이는 속도에 비례, 멈추면 0으로) |
| F / V / C | 무기 전환 / 시점 전환 / 누른 채 둘러보기 |
| Enter · Space | 이륙·킬캠·튜토리얼 건너뛰기 |

**모바일(가로 전용)** — 왼쪽 조이스틱으로 조종, 오른쪽 화면을 누르면 그 자리로 조준하고 누르는 동안 기관포를 쏜다. 미사일은 적기를 누르고 있다가 락온되면 손을 뗀다. 버튼은 무장·시점·정지 3개. 자이로 조종은 설정에서 켠다(기본 꺼짐). 세로로 들면 돌려 달라는 안내와 함께 멈춘다.

미션 1을 처음 시작하면 튜토리얼이 나온다(설정의 "튜토리얼 다시 보기"로 다시 볼 수 있다). 임무를 완수하면 결과 화면에서 마지막 격추를 다시 볼 수 있다.

## 그래픽 품질

설정에서 **낮음 / 높음 / 최고**를 고른다(모바일은 낮음이 기본이고, 성능 확인을 통과한 기기만 높음을 고를 수 있으며 최고는 없다). 처음 실행하면 약 2초 동안 성능을 재서 자동으로 고르고, 느려지면 한 칸씩 자동으로 내린다(끌 수 있음).

- 낮음: 가벼운 로우폴리(내장 그래픽 노트북용), 후처리 없음
- 높음: 하이폴리 기체·조종석, PBR, 블룸·렌즈 플레어, GPU 파티클
- 최고: 기체 20만 삼각형 이상, 모션 블러, 파티클 최대

도색(회색 / 어두운 회색 / 도심 위장)과 이륙 연출 건너뛰기도 설정에 있다.

## 자동플레이

봇이 키·마우스 입력 값만 만들어 조종한다(게임 규칙·적 AI는 그대로). 주소 뒤에 붙여서 켠다.

```
/kf21-boramae/?auto=1&skill=70&mission=m3&loop=1&view=cockpit&takeoff=skip
```

| 값 | 뜻 |
|---|---|
| `auto=1` | 자동플레이 켜기(오른쪽 위에 패널이 나온다) |
| `skill=0~100` | 실력. 초보 12 · 중급 40 · 숙련 70 · 전문가 95 |
| `mission=m1\|m2\|m3` | 시작 미션 |
| `loop=0\|1` | 1이면 끝난 뒤 다음 미션으로 계속(실패하면 같은 미션 재도전) |
| `view=chase\|cockpit`, `takeoff=skip\|full` | 시점, 이륙 연출 |
| `quality=low\|high\|ultra` | 그래픽 프리셋(이번 실행만. 저장된 설정은 그대로). 자동플레이가 아니어도 쓸 수 있다 |

패널에서 실력·미션을 바꾸거나 끄고 켤 수 있고, 값은 주소에 바로 반영된다. 실력이 바뀌는 것: 반응 간격, 조준 오차, 선회 정밀도(초보는 키 입력식 0/±1), 사격 거리, 열 관리(초보는 과열까지 쏜다), 회피 기동, 미사일 사용, 실속 회피. 식은 `src/core/autopilot.js`의 `skillParams`.
검증은 `node tests/autoplay.cjs 12,95 m1` (주소로 열기만 하고 끝까지 지켜본다).

## 실행 · 배포

- **배포**: 빌드가 필요 없다. 이 폴더를 그대로 `main`에 올리면 된다(`index.html`의 importmap이 `js/vendor/three.min.js`를 불러온다).
- **개발**: `npm install` 후 `npm run dev`.
- **테스트**: `npm test`(단위 테스트), `npm run smoke`(브라우저 스모크), `node tests/playthrough.cjs`(미션 1~3 자동 완주), `node tests/perf.cjs`(프리셋별 성능·메모리), `node tests/p1-input.cjs`·`p3-mobile.cjs`·`p7-extras.cjs`·`p9-mobile.cjs`(조작·모바일·킬캠·튜토리얼·모바일 예산), `node tests/p9-balance.cjs`(락온 시간 비교), `node tests/v2-model.cjs high`(기체 캡처) 등 `tests/v*.cjs`(비주얼 단계별 검증).
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

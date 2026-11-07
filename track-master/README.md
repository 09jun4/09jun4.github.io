# Track Master (구 F1 Champion)

https://09jun4.github.io/track-master/ (서킷 레이스: circuit/, 드리프트 레이스: drift/, 랠리 레이스: rally/)

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
| `drift_users/{uid}` | 드리프트 레이스 개인 기록 | 본인만 |
| `drift/{코스}/times/{uid}` | 드리프트 레이스 점수 랭킹 | 읽기 공개, 쓰기 본인 |
| `rally_users/{uid}` | 랠리 레이스 기록·최근 주행·세팅(JSON 문자열) | 본인만 |
| `career/{uid}` | AI 대전 포인트·우승·챔피언 | 읽기 공개, 쓰기 본인 |

`js/vendor/firebase.js`는 Firebase JS SDK 10.14.1(app, auth, firestore)을 esbuild로 묶은 파일입니다.

## 랠리 레이스 (rally/)

다른 모드와 독립된 모듈이에요(three.js r128, 같은 로그인). 파일별 역할:

| 파일 | 역할 |
|---|---|
| `js/data.js` | 노면·타이어·차량·코스 길이·코너 등급·페널티·그래픽 프리셋 수치 (데이터만) |
| `js/rng.js` | 시드 해시 + 재현 가능한 난수(sfc32), 시드 노이즈. `Math.random()`을 쓰지 않아요 |
| `js/track.js` | RallyTrackGenerator / RallyRouteData: 도로 모듈 → 클로소이드 곡률 프로그램(G2 연속), 고저차·점프·크레스트, 자갈/진흙, 낙석, 체크포인트, 지형 높이맵, 나무·바위 배치 |
| `js/pacenotes.js` | RallyPaceNotes: 코스 데이터에서 직접 페이스노트 추출, 2단계 안내(속도 비례), 진행도는 최대치만 사용 |
| `js/physics.js` | RallyPhysics: 600Hz 고정, 4륜 독립 서스펜션·타이어(마찰 타원), AWD, 브레이크 바이어스, 핸드브레이크, 변속 3종, ABS/TCS/ESC |
| `js/vehicle.js` | RallyVehicle: 기본 도형으로 만든 랠리카(조향·바퀴 회전·서스펜션·피칭/롤링·실내) |
| `js/world.js` | 지형 청크(LOD 2단계), 도로, 인스턴싱 숲(존별 수동 프러스텀 컬링 + LOD), 파티클 풀 |
| `js/stage.js` | RallyStageController: 카운트다운·스플릿·결승·페널티·복구 |
| `js/camera.js`, `js/hud.js`, `js/input.js`, `js/audio.js`, `js/damage.js`, `js/persistence.js`, `js/main.js` | 카메라 3종, HUD, 키보드·게임패드·터치, 소리, 손상 요약, 저장(로컬 + `rally_users`), 메뉴·루프 |

주소에 `?seed=ABCD2345&len=short|medium|long`을 붙이면 그 코스가 바로 골라져요.

# BLACKSITE

https://09jun4.github.io/blacksite/

솔로 1인칭 잠입 FPS. 비밀 연구시설 K-7에 잠입해 서버실의 기밀 데이터를 확보하고 진입 지점으로 탈출한다.
Vanilla JavaScript(ES Modules) + Three.js r170. 모델·텍스처·효과음은 모두 코드로 만든다(외부 에셋 없음).

## 실행

- 배포: 빌드 없이 이 폴더를 그대로 GitHub Pages로 올린다(`index.html`의 import map이 `three`를 `vendor/three.module.min.js`로 연결).
- 로컬 개발: `npm install && npm run dev` → http://localhost:5173/blacksite/ (Vite, `base: '/blacksite/'`)
- 정적 서버로도 실행된다: 저장소 루트에서 `python3 -m http.server` → http://localhost:8000/blacksite/
- 디버그: localhost에서 `?debug`를 붙이면 관리자 디버그 패널(` 키)이 열린다.

## 구조 (파일 하나로 교체 가능)

| 바꿀 것 | 파일 | 인터페이스 |
|---|---|---|
| 수치·배치·색 | `public/config/*.json` | 시스템별 JSON (game, player, weapons/pistol, enemies/guard, missions/mission01, maps/facility01, audio, logs) |
| 무기 | `src/weapons/Pistol.js` (+ `PistolModel.js`, `WeaponAnimator.js`) | `WeaponBase` 상속, `createViewModel()` |
| 적 외형 | `src/characters/GuardModel.js` | `createGuardModel(appearance)` → `{ root, joints, muzzle }` |
| 적 종류 | `src/ai/EnemyAI.js`, `src/core/Session.js`의 `ENEMY_TYPES` | `update`, `rayTest`, `onHit`, `canTakedown` |
| AI 상태 | `src/ai/states/*.js` | `{ enter(g, data), update(g, dt) }` |
| 암살 연출 | `src/animations/assassination/*.js` | `{ id, duration, start(ctx), update(ctx, t), end(ctx) }` |
| 건물·소품 | `src/environments/FacilityBuilder.js`, `props/*.js` | `build(scene, map, ctx)`, 소품 `create(def, M)` |
| 미션 목표 | `src/missions/objectives/*.js` | `{ start(), update(dt), markerPos, text }` |
| 소리 | `public/audio/` + `public/config/audio.json` | `file`이 없으면 Web Audio 합성음 |

## 계정 저장 (구글 로그인)

Firebase(Auth + Firestore)를 쓴다. `js/firebase-config.js`가 비어 있으면 Firebase를 초기화하지 않고 브라우저 저장(localStorage)만 사용한다.

1. https://console.firebase.google.com 에서 프로젝트 만들기 (애널리틱스는 꺼도 됨)
2. **Authentication** → 시작하기 → 로그인 방법 → **Google** 사용 설정
3. **Authentication** → 설정 → 승인된 도메인에 `09jun4.github.io` 추가
4. **Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
5. **Firestore** → 규칙 탭에 `firestore.rules` 내용을 붙여 넣고 게시
6. 프로젝트 설정 → 내 앱 → 웹 앱(`</>`) 추가 → `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId`를 `js/firebase-config.js`에 입력

| 경로 | 내용 | 권한 |
|---|---|---|
| `users/{uid}` | `settings`(그래픽·사운드·조작·화면·키), `records`(난이도별 최고 기록·클리어 수), `readLogs`, `updatedAt` | 본인만 읽기·쓰기 |

- 로그인 전 게스트 진행은 첫 로그인 때 계정으로 옮긴다(기록은 더 좋은 값, 로그는 합집합). 게스트 칸은 비운다.
- 로그아웃하면 게스트 상태로 돌아간다(설정만 이어받음).
- 관리자: 이메일 대신 소문자 이메일의 SHA-256 해시만 코드에 둔다 (`src/save/AuthManager.js`). 관리자는 디버그 패널을 쓸 수 있다.

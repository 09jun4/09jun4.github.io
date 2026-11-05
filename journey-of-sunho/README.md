# 선호의 여정 (The Journey of Sunho)

학원을 마친 **박선호**가 자전거를 타고 집까지 귀가하는 3D 자전거 어드벤처 / 생존 / 코미디 게임 (MVP).
Three.js + Vite, JavaScript ES 모듈. 주소: https://09jun4.github.io/journey-of-sunho/

## 실행 방법

```bash
cd journey-of-sunho
npm install        # 처음 한 번 (Vite, three)
npm run dev        # http://localhost:5173  개발 서버
npm run build      # dist/ 에 배포용 빌드 (선택)
```

- 저장소에는 `vendor/three.module.min.js`가 들어 있어서 **빌드 없이도** 정적 서버(GitHub Pages)에서 바로 열려요.
  (`python3 -m http.server` 로 저장소 루트를 열고 `/journey-of-sunho/` 로 접속해도 동작)
- 조작: `↑` 페달 · `↓` 감속 · `← →` 조향 · `Space` 브레이크 · `Esc` 일시정지 · `Enter` 연출 건너뛰기

### 개발용 주소 옵션
| 주소 | 설명 |
|---|---|
| `?debug` | 디버그 정보 + 키: `1~5` 날씨 강제(맑음/비/눈/강풍/안개), `E` 무작위 이벤트, `G` 자동 주행 |
| `?auto` | 메뉴를 자동으로 넘기고 자동 주행 (`&skip` 연출 건너뛰기, `&ch=ch3` 챕터, `&speed=25`) |

관리자 계정으로 로그인하면 디버그 키와 전체 챕터 열기가 켜져요.

## 게임 흐름
시작 화면 → 챕터 브리핑(무작위 난이도·날씨 예보) → 시작 연출(학원 외관 → 학원에서 나옴 → 자전거로 걸어감 → 탑승 → 출발 → 후방 카메라 전환) → 주행 → 집 도착 연출 → 종합 평가(점수·등급·코멘트·랭킹)

## 폴더 구조

```
journey-of-sunho/
  index.html              진입 HTML
  vendor/                 three.module.min.js (r170)
  js/firebase-config.js   Firebase 웹 설정 (비어 있으면 브라우저 저장만 사용)
  js/vendor/firebase.js   Firebase SDK 번들 (Auth + Firestore)
  firestore.rules         Firestore 보안 규칙
  assets/maps/            맵 데이터 (nonhyeon.json = 인천 논현동 실제 귀갓길, test-map.json = 예전 테스트 동네)
  assets/models|textures|audio/   최종 에셋 자리 (현재 임시 에셋은 코드로 생성)
  src/
    main.js
    core/      Game(흐름) · GameLoop(고정 1/120초 물리) · SceneManager · AssetManager · Input · Textures · utils
    player/    Player · PlayerController · PlayerPhysics · PlayerState · PlayerAnimation · CharacterModel
    bicycle/   Bicycle(모델) · BicyclePhysics(물리 값·구동계)
    camera/    FollowCamera (후방 추적·지연·속도별 거리/FOV·건물 관통 방지·충격 흔들림·컷신 블렌드)
    world/     World · RoadSystem(도로 메시+노면 질의) · Route(코스) · MapManager · Environment · CollisionSystem
    weather/   WeatherManager(상태) · WeatherEffects(그래픽)
    events/    EventManager(생성·빈도·충돌) · EventDefinitions(이벤트 동작) · Props(임시 소품)
    chapters/  ChapterManager(무작위 난이도) · StoryManager(연출·대사)
    ui/        HUD · Minimap · Menu · ResultScreen · style.css
    systems/   ScoreSystem · SaveSystem · Cloud(구글 로그인·랭킹) · DebugTools(자동 주행)
    data/      balance.json · weather.json · events.json · chapters.json
```

## 데이터로 조정하기
- `src/data/balance.json` — 자전거 물리(출력·공기저항·조향 한계·제동), 노면 마찰, 상태 변화량, 넘어짐 시간, **점수 기준·등급·평가 문구**
- `src/data/weather.json` — 날씨별 가중치·지속 시간(짧게/길게)·기온·시야·바람, 노면 젖음/마름 속도
- `src/data/events.json` — 이벤트별 발생 가중치·날씨 배율·효과 수치·대사, 이벤트 간격
- `src/data/chapters.json` — 챕터 추가/수정 (제목, 시작 상황, 대사, 코스, 시간대, 날씨·이벤트 성향)

## 모델 교체 (사진 기반 모델)
- **얼굴 사진만**: `AssetManager`의 `config.character.faceImage = 'assets/textures/sunho-face.jpg'` (임시 모델의 얼굴 판에 붙음)
- **캐릭터 통째로**: `assets.register('character', () => new MyCharacter())` — `CharacterModel.js` 맨 위 주석의 인터페이스
  (`root`, `joints` 이름, `lengths`, `setCleanliness`, `addStain`)만 맞추면 `PlayerAnimation`(페달링 IK·조향·넘어짐·걷기)이 그대로 동작해요.
- **자전거**: `assets.register('bicycle', ...)` — `Bicycle.js` 인터페이스(`anchors.seat/gripL/gripR/pedalL/pedalR`, `setSteer/setCrank/setWheelSpin`).
  물리 값은 `balance.json`의 `bike`에서 따로 조정.

## 지도 교체 (실제 지도 이미지)
현재 맵 `assets/maps/nonhyeon.json`의 `zones`로 아파트 단지(동 번호·단지 표지석), 초등학교(교사동·운동장), 상가 블록, 메가박스 같은 큰 건물을 배치해요.

게임은 지도 이미지가 아니라 **맵 데이터**(도로 중심선)로 3D 도로·건물·가로수·교차로·횡단보도를 만들어요.
1. 지도 이미지를 `assets/maps/`에 넣고, 이미지 위에서 도로 중심선을 미터 단위 좌표 `[x, z, 높이]`로 옮겨 `roads[]`에 적어요 (폭 `width`, 인도 폭 `sidewalk`).
2. `image`와 `imageBounds`(이미지가 덮는 월드 범위 `{minX,maxX,minZ,maxZ}`)를 채우면 미니맵 배경으로 깔려요.
3. `routes`에 코스(`[{road, from, to}]`)를, `landmarks`에 학원·자전거 거치대·집 위치를 적어요.
4. `chapters.json`의 `map.file`을 새 파일로 바꾸면 끝. 교차로·횡단보도는 도로가 만나는 곳에서 자동으로 생겨요.

## 구글 로그인 · 계정 저장 · 랭킹 (Firebase)
`js/firebase-config.js`가 비어 있으면 로그인 없이 브라우저(localStorage)에만 저장해요. 켜려면:
1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 만들기
2. Authentication → 로그인 방법 → **Google** 사용 설정
3. Authentication → 설정 → 승인된 도메인에 **09jun4.github.io** 추가
4. Firestore Database 만들기 → 위치 **asia-northeast3 (서울)**, 프로덕션 모드
5. Firestore 규칙 탭에 `firestore.rules` 내용을 붙여 넣고 게시
6. 프로젝트 설정 → 내 앱 → 웹 앱 추가 → config 값을 `js/firebase-config.js`에 붙여 넣기

- 저장: `users/{uid}` (본인만), 랭킹: `chapters/{chapterId}/scores/{uid}` (읽기는 누구나, 쓰기는 본인 기록만, 닉네임 2~12자)
- 로그인 전 게스트 진행은 첫 로그인 때 계정으로 옮기고 게스트 칸은 비워요. 로그아웃하면 게스트로 돌아가요.
- 인스타그램·카카오톡 앱 안 브라우저에서는 "다른 브라우저로 열기" 안내가 떠요.
- 사이트 로그인 연결: 사이트 `js/firebase-config.js`의 `LINKED_WORKS`에 이 작품을 추가하고, 이 프로젝트의 Google 로그인 설정 →
  "외부 프로젝트의 클라이언트 ID 허용"에 사이트 프로젝트(chiikawa-tobatsu)의 웹 클라이언트 ID를 넣어요.

## 현재 한계 (MVP)
- 캐릭터·자전거·소품은 기본 도형으로 만든 임시 에셋이에요. 사운드는 아직 없어요.
- 맵은 사용자가 보내준 지도 캡처(903 수학학원 → 에코메트로5단지, 994m)를 1px≈1m로 따라 그린 논현동이에요. 도로·단지 위치는 지도를 따랐지만, 건물 모양·층수·간판은 실제와 다르게 단순화했어요(로드뷰는 참고하지 못함).
- 자동차는 이벤트로만 등장해요(상시 교통 흐름 없음). 신호등은 없어요.
- PC 키보드 전용이에요(모바일 터치 조작 없음).

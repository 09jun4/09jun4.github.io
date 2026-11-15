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

## 서킷 레이스 그래픽 프리셋 (circuit/)

설정(메뉴의 **그래픽** 패널, 일시정지 화면)에서 **낮음 / 높음**을 고를 수 있어요. 기본값은 낮음이고, 선택은 이 브라우저(localStorage)와 저장 데이터(`gfx`, 로그인 시 계정 저장에도 같이)에 기억돼요.

| 프리셋 | 렌더러 | 내용 |
|---|---|---|
| 낮음 | `js/renderer.js` (Canvas 2D) | 기존 화면 그대로(원본 코드와 픽셀 단위 동일). 추가 다운로드 없음 |
| 높음 | `js/gfx/hi-*.js` (three.js r128, WebGL2 · WebGL1) | 3D 서킷·관람석·차량, 그림자·조명, 블룸·모션 블러·파티클 |

- 높음을 처음 고를 때만 `../js/vendor/three.min.js`(r128, 로컬)와 `js/gfx/hi-*.js`를 지연 로딩해요. 낮음 사용자의 로딩은 그대로예요.
- 모든 기기에서 높음을 고를 수 있어요. WebGL2가 없으면 WebGL1로, 둘 다 없으면 "이 기기는 3D 그래픽을 지원하지 않아요" 안내 후 낮음을 유지해요.
- 고사양 PC는 "높음 권장" 표시만 하고 자동으로 바꾸지 않아요. 저사양 기기는 높음을 켤 때 "느릴 수 있어요"를 한 번 알려요.
- 높음의 **세부 품질** 5단계(최고·높음·중간·낮춤·최소: 해상도 스케일, 그림자맵 크기·캐스케이드, MSAA, 블룸·모션 블러 탭 수, 관중·나무·파티클 양)는 설정에서 직접 고르고 브라우저에 저장돼요. **자동으로 낮추지 않아요.** 처음 값은 PC 높음(고사양 PC 최고), 모바일 중간이에요. 모바일은 발열 때문에 devicePixelRatio 상한 1.25.
- 차량은 cars.js의 색·비율을 그대로 쓰되, 실제 포뮬러처럼 매끈한 곡면(모노코크·노즈·사이드포드·엔진 커버는 둥근 단면을 이어 만든 형상, 앞뒤 날개는 에어포일 단면)으로 만들고, 표면은 카본 섬유(2x2 트윌 직조, 클리어코트)에 윗면만 리버리 도색이에요. 1인칭도 3D 둥근 콕피트(어깨·패드 림·헤일로·미러 하우징)로 그리고, 핸들과 미러 유리만 cockpit.js가 그려요.
- 충돌 폭발: 주황 불덩이와 검은 연기 기둥, 불꽃, 카본 파편(트랙에 남음), 날개와 바퀴 2개가 떨어져 나가고 차체는 그을려요. 재시작하면 원래대로 돌아와요.
- 고속 속도감은 흔들림 없이: 차는 선명하게 두고 주변만 방사형 블러, 속도선, 가속/제동 때 천천히 움직이는 카메라 스프링, 넓어지는 화각, 리어 윙 끝 와류 자국.
- 레이스 중에 바꾸면 렌더러를 dispose 후 새로 만들어요. 탭이 백그라운드면 그리지 않고, WebGL 컨텍스트가 끊기면 낮음으로 돌아가요.
- 물리·카메라·랩 기록은 공유하고 높음 렌더러는 읽기만 해서, 같은 입력이면 랩 타임이 같아요.
- 주소에 `?gfx=high`(또는 `low`)를 붙이면 그 프리셋으로, `&gfxq=0~4`를 붙이면 세부 품질을 정해서 열려요(테스트용, 저장 안 함). `&gl=1`은 WebGL1 강제.

| 파일 | 역할 |
|---|---|
| `js/gfx/gfx-preset.js` | 항상 로드(작음): 기기 감지, 설정 UI(프리셋·세부 품질), 지연 로딩, 렌더러 교체 |
| `js/gfx/hi-renderer.js` | 높음 렌더러(init/render/resize/dispose): camera.js 시점을 그대로 옮긴 카메라, CSM 그림자, 컬링, 자원 범위(global/track/cars)별 dispose |
| `js/gfx/hi-track.js` | track.js 샘플로 만든 도로(속도 색상 포함)·런오프·3D 연석·흰 선·벽·광고·아암코·펜스·출발선·그리드·갠트리·브레이킹 보드·조명탑·간판·전광판 |
| `js/gfx/hi-env.js` | 서킷별 테마(시간대·태양·안개), 하늘돔·구름, 원경 산·도시, 지형, 나무 인스턴싱, 관람석(tracks의 실제 위치 데이터 재사용)·관중 |
| `js/gfx/hi-car.js` | 유선형 카본 차량(로프트 곡면 차체, 에어포일 날개, 서스펜션, 헤일로, 둥근 타이어, 번호), 1인칭 3D 콕피트, 폭발 시 그을림·부품 이탈 |
| `js/gfx/hi-fx.js` | 타이어 연기·스키드마크·흙먼지·불꽃, 폭발(불덩이·연기 기둥·파편), 윙팁 와류 |
| `js/gfx/hi-post.js` | HDR → 블룸, 방사형 모션 블러(차 주변은 제외), 렌즈 플레어, 속도선, 비네팅, ACES 톤매핑, FXAA |
| `js/gfx/hi-tex.js` | 이미지 파일 없이 만드는 절차적 텍스처 |
| `../js/vendor/three.min.js`, `../js/vendor/three-csm.js` | three.js r128과 CSM(캐스케이드 그림자) 로컬 사본, MIT |

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

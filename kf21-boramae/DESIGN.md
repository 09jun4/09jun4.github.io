# KF-21 BORAMAE — 설계 메모

3D 전투기 슈팅 MVP. Three.js + Vanilla JS(ES Modules) + Vite. 주소: `https://09jun4.github.io/kf21-boramae/`

## 1. 실행 · 배포 방식 (결정 사항)

- 이 저장소는 빌드 없이 `main`에 올리면 바로 GitHub Pages로 나가는 구조다. 그래서 **배포본 = 소스 그대로**로 했다.
  - `index.html`의 `importmap`이 `three`를 `js/vendor/three.min.js`(한 파일로 묶어 둔 three.js)로 연결한다.
  - 나머지는 브라우저가 `src/`의 ES 모듈을 직접 읽는다. 코드를 고치고 push하면 그대로 배포된다.
- Vite는 개발 도구로 쓴다: `npm run dev`(개발 서버), `npm run build`(한 파일로 묶은 `dist/`, 선택), `npm test`(Vitest 단위 테스트), `npm run smoke`(Playwright 스모크), `npm run vendor`(three.js 다시 묶기).
- 외부 3D 파일·이미지·폰트는 없다. 모델·구름·지형·효과는 모두 코드로 만든다.
- 디버그 훅 `window.__debug`는 개발 서버이거나 주소에 `?debug=1`이 있을 때만 켜진다(`src/core/debug.js`).

## 2. 구조

```
index.html              화면 뼈대(DOM UI) + importmap
js/firebase-config.js   Firebase 설정값(비어 있으면 localStorage만 사용)
js/vendor/three.min.js  three.js 묶음 (npm run vendor)
firestore.rules         Firestore 보안 규칙
src/main.js             조립(렌더러·월드·세션·UI·상태 머신)
src/core/               game-loop(고정 60Hz+보간) · state-machine · input · settings · save
                        mission-session(미션 1회 진행) · scoring · quality(자동 품질) · debug · audio-stub · math
src/flight/             flight-model(비행 물리, 순수 함수) · camera-rig(3인칭/1인칭)
src/combat/             weapon-system(무장 인터페이스) · gun · missile · lock-on · projectiles · damage · hit-test
src/ai/                 enemy-ai(추격·공격·이탈·회피·분리) · wave-spawner(편대 등장)
src/world/              sky · clouds · backdrop-terrain · lighting · world(원점 재배치 포함)
src/entities/           geo-builder(로프트/판 생성기) · kf21-model · enemy-model · cockpit · effects
src/ui/                 screens(페이드) · menu · mission-select · briefing · hud · pause · result
                        ranking · nickname · settings-panel · toast · style.css
src/data/               aircraft · weapons · enemies · missions · grades · camera · world · quality · hud · text
src/auth/               auth · cloud-save · ranking · inapp-browser · admin · firebase-sdk
tests/                  단위 테스트(*.test.js) + 스모크·플레이 테스트(*.cjs, Playwright)
```

수치는 전부 `src/data/*.js`에 있다. 코드에는 매직넘버를 두지 않는다.
기체·무장·적기·미션을 늘릴 때는 data 파일에 항목을 추가한다(무장은 `weapon-system.js`의 `registerWeapon`).

## 3. 핵심 알고리즘

- **게임 루프**: 누적기 방식 고정 타임스텝(60Hz). 프레임 델타는 0.1초로 상한(탭 복귀 시 시간 점프 방지). 렌더는 이전/현재 상태를 `alpha`로 보간.
- **비행 모델**: 상태는 (위치, 요, 피치, 시각 롤, 속도). 입력 → 목표 각속도 → 지수 감쇠로 실제 각속도(관성). 속도는 `추력−항력`을 순항속도로 끌어당기는 스프링 + 중력 성분(상승 감속/하강 가속) + 선회 항력. 속도 하한 근처에서는 상승 권한이 줄고 기수가 숙여진다(실속 사망 없음). 고도 하한·상한은 허용 피치 범위를 부드럽게 좁혀서 처리한다.
- **원점 재배치**: 플레이어가 원점에서 일정 거리 이상 벗어나면 모든 개체를 x·z로 되돌린다(y는 고도라 범위가 한정됨). 지형·구름은 누적 오프셋을 유니폼으로 받는다.
- **구름**: `InstancedBufferGeometry` 1~2 드로우콜. 구름 묶음 위치를 버텍스 셰이더에서 카메라 기준으로 순환(wrap)시켜 CPU 갱신 없이 무한 하늘을 만든다. 가장자리에서는 크기를 줄여 튀는 현상을 숨긴다.
- **원경 지형**: 격자 1장. 버텍스 셰이더에서 월드 좌표 노이즈로 높이를 만들고, 프래그먼트에서 미분으로 플랫 셰이딩 + 거리 안개.
- **기관포**: 카메라→커서 레이로 조준점을 구하고, 그 레이에 대해 적기 구(거리 비례 보정 반경)와 교차 판정(즉시 판정). 예광탄은 총구→조준점으로 그리는 연출.
- **미사일 락온**: 화면 중심 기준 각도 반경 안의 적 중 가장 중심에 가까운 적을 추적, 유지 시간 누적으로 락온. 반경 이탈 시 즉시 초기화.
- **미사일**: 실제 이동 발사체. 목표 방향으로 초당 최대 선회각 제한 회전, 수명·근접 신관.
- **적 AI**: 상태(접근/공격/이탈/회피/복귀) + 목표 방향을 각속도 제한으로 따라가는 조향 + 적기 간 분리 벡터. 동시 공격 수 제한(공격 토큰)으로 공정성 유지.
- **메모리**: 메시·풀은 시작할 때 한 번만 만들고 미션마다 상태만 초기화한다. 프레임 중 할당 없음(임시 벡터 재사용).

## 4. 튜닝 파라미터 위치

| 무엇 | 파일 |
|---|---|
| 플레이어 속도·각속도·관성·고도 한계·체력 | `src/data/aircraft.js` |
| 기관포·미사일·락온 | `src/data/weapons.js` |
| 적기 체력·속도·거리·사격·회피·분리 | `src/data/enemies.js` |
| 미션(편대·기준 시간)·등장 거리 | `src/data/missions.js` |
| 점수식·등급 비율 | `src/data/grades.js` |
| 카메라(시점별 FOV·위치·감쇠·흔들림) | `src/data/camera.js` |
| 하늘·구름·지형·조명·안개 | `src/data/world.js` |
| 품질 단계·자동 조절 기준 | `src/data/quality.js` |

최종 튜닝 값과 알려진 한계는 개발 마지막에 이 문서 아래에 기록한다.

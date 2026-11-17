# Sim Race

https://09jun4.github.io/sim-race/

Track Master 서킷 레이스의 리얼리스틱 모드를 떼어 낸 별도 게임이에요(코드는 복사본이라 Track Master와 따로 움직여요).
20대 그리드, 예선(Q1·Q2·Q3)과 결선, 실제 랩 수 비율(10~100%), 2026 규정 물리(MOM·액티브 에어로·부스트),
타이어 3종+웨트·마모·온도, 연료, 날씨, 피트스톱(팀 라디오 BOX BOX BOX / 스테이 아웃, 3D 시네마틱), 세이프티카·VSC,
플래그·페널티, 부위별 파손과 수리, 6라운드 시즌 챔피언십. 주소에 `?demo=real`을 붙이면 자동 플레이 데모.

## 온라인 기능 (Sim Race 전용 Firebase)

`js/firebase-config.js`가 비어 있으면 이 브라우저 저장만으로 작동해요. 설정 순서:

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 새 프로젝트 만들기 (예: `sim-race`)
2. Authentication > 로그인 방법 > **Google** 사용 설정
3. Authentication > 설정 > 승인된 도메인에 `09jun4.github.io` 추가
4. Firestore Database 만들기: 위치 **asia-northeast3 (서울)**, 프로덕션 모드
5. Firestore > 규칙 탭에 `firestore.rules` 내용을 붙여 넣고 게시
6. 프로젝트 설정 > 내 앱 > 웹 앱 추가 → 구성(config) 값을 `js/firebase-config.js`에 붙여 넣기
7. (사이트 로그인 연결) Authentication > 로그인 방법 > Google > 웹 SDK 구성 > "외부 프로젝트의 클라이언트 ID 허용"에
   사이트 프로젝트(chiikawa-tobatsu)의 웹 클라이언트 ID 추가, 사이트 `js/firebase-config.js`의 `LINKED_WORKS`에 Sim Race 한 줄 추가

| 경로 | 내용 | 권한 |
|---|---|---|
| `users/{uid}` | 저장 데이터(JSON 문자열: 설정·시즌·지난 시즌), 닉네임 | 본인만 |
| `career/{uid}` | 커리어 랭킹(포인트·우승·포디움·챔피언·레이스, 닉네임 2~12자) | 읽기 공개, 쓰기 본인 |

- 로그인 전 진행은 첫 로그인 때 계정으로 옮기고, 로그아웃하면 게스트 저장으로 돌아가요.
- 관리자 계정은 이메일 대신 SHA-256 해시로 판별해요(`js/cloud.js`).
- 인스타그램·카카오톡 앱 안 브라우저에서는 "다른 브라우저로 열기" 안내를 띄워요.

## 파일

- `js/` — 게임 코드(Track Master `circuit/` 복사본, 리얼리스틱은 `js/real/`, 3D는 `js/gfx/`)
- `lib/` — 공용 스크립트 복사본(three.js r128, CSM, Firebase SDK, 로딩 화면, 그래픽 추천, 메뉴 음악; 음악 파일은 `/track-master/music/`를 함께 써요)
- `firestore.rules` — Sim Race 프로젝트용 보안 규칙

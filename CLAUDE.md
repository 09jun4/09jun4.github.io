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

## 사이트 구조 (디자인: 검정 바탕 모노, 이모지 없이 단순하게)
- `index.html` — 작품 카드 목록 (방문자에게는 이것만 보임)
- `notes/` — 비공개 노트. 구글 로그인 + Firebase 규칙(`private/**`은 관리자만)으로 잠김. 노트 내용을 이 저장소에 파일로 올리지 않아요.
- `assets/style.css`, `assets/site.js` — 공통 스타일·카드
- 치이카와 토벌 대작전은 별도 저장소 `09jun4/chiikawa-tobatsu` (주소 `/chiikawa-tobatsu/`)

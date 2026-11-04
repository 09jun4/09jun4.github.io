// BLACKSITE — Vite 설정.
// 배포는 빌드 없이 이 폴더를 그대로 GitHub Pages로 올려요(브라우저 ES 모듈 + index.html의 import map).
// 로컬 개발: `npm install && npm run dev` → http://localhost:5173/blacksite/
// `public/`을 일반 폴더로 두어(publicDir: false) 개발 서버와 배포 주소가 같은 경로(./public/config/...)를 써요.
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/blacksite/',
  publicDir: false,
  server: { open: '/blacksite/' },
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});

import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';

// 상대 경로(base: './')로 빌드해야 https://09jun4.github.io/journey-of-sunho/ 아래에서 그대로 열려요.
// 게임 데이터(JSON)·맵·Firebase 스크립트는 실행 중에 fetch/로드하므로 빌드 결과물에 그대로 복사해요.
const copyRuntimeFiles = () => ({
  name: 'copy-runtime-files',
  closeBundle() {
    for (const dir of ['src/data', 'assets', 'js']) if (existsSync(dir)) cpSync(dir, `dist/${dir}`, { recursive: true });
  },
});

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  plugins: [copyRuntimeFiles()],
});

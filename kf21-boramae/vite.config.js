import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';

// 배포본은 소스 그대로(importmap + js/vendor/three.min.js)이고, Vite는 개발·테스트·선택적 번들에 쓴다.
export default defineConfig({
  base: './',
  publicDir: false,
  server: { port: 5173, host: '127.0.0.1' },
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 900 },
  plugins: [{
    name: 'copy-runtime-config',
    apply: 'build',
    closeBundle() {
      if (process.env.VITEST) return;
      // firebase-config.js는 번들에 넣지 않고 그대로 둔다(값만 바꿔도 되게).
      mkdirSync('dist/js', { recursive: true });
      copyFileSync('js/firebase-config.js', 'dist/js/firebase-config.js');
    },
  }],
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});

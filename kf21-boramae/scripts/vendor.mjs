// three.js를 한 파일(js/vendor/three.min.js)로 묶어 둔다.
// 배포본(GitHub Pages)은 빌드 없이 index.html의 importmap으로 이 파일을 불러온다.
// three 버전을 올린 뒤 `npm run vendor`를 다시 실행하면 된다.
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  configFile: false,
  root,
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: path.join(root, 'js/vendor'),
    emptyOutDir: false,
    minify: true,
    target: 'es2022',
    lib: {
      entry: path.join(root, 'node_modules/three/build/three.module.js'),
      formats: ['es'],
      fileName: () => 'three.min.js',
    },
  },
});

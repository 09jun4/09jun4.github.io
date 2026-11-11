// Playwright 테스트 공용 도구: 저장소 루트를 정적 서버로 띄우고(배포와 같은 조건), 게임 페이지를 연다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SHOTS = path.resolve(__dirname, '../shots');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function startServer(root = REPO_ROOT) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function launch() {
  return chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/** 게임 페이지를 열고 콘솔 오류를 모은다. */
async function openGame(browser, origin, { query = '?debug=1', width = 1280, height = 720, scale = 1, initScript, userAgent, autoQuality = false, context: reuse } = {}) {
  const context = reuse || await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, userAgent });
  // 헤드리스(소프트웨어 렌더링)는 느리므로, 따로 요청하지 않으면 자동 품질 조절을 꺼 둔다
  if (!autoQuality && !reuse) await context.addInitScript(() => { try { if (!localStorage.getItem('kf21.settings')) localStorage.setItem('kf21.settings', JSON.stringify({ autoQuality: false })); } catch (e) { /* 무시 */ } });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    else if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(`${origin}/kf21-boramae/${query}`);
  await page.waitForFunction(() => window.__kf21Ready === true, null, { timeout: 30000 });
  return { page, context, errors, warnings };
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, name.endsWith('.png') || name.endsWith('.jpg') ? name : name + '.png');
  await page.screenshot({ path: file });
  return file;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { startServer, launch, openGame, shot, sleep, REPO_ROOT, SHOTS };

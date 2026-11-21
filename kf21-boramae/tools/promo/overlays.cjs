// 홍보 영상 자막·로고 이미지(투명 PNG)를 HTML로 그린다. node tools/promo/overlays.cjs <출력 폴더>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const OUT = path.join(process.argv[2], 'overlays');
fs.mkdirSync(OUT, { recursive: true });

const CAPTIONS = {
  c_takeoff: ['KF-21 보라매', '대한민국 전투기로 출격'],
  c_cockpit: ['1인칭 시점', '조종석에서 기관포 사격'],
  c_chase: ['3인칭 시점', '0.5초 락온 · 미사일 발사'],
  c_bomb: ['지상 타격', '무제한 폭탄 투하'],
  c_campaign: ['5개 캠페인 · 18개 미션', '낮 · 새벽 · 저녁 · 야간'],
  c_boss: ['보스전', '적 에이스 격추 · 슬로모션 킬캠'],
  c_devices: ['PC · 모바일 어디서나', '설치 없이 브라우저에서 바로'],
};
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@500;700;900&family=JetBrains+Mono:wght@700&display=swap');
html, body { margin: 0; background: transparent; }
.cap { width: 1080px; display: flex; flex-direction: column; align-items: center; gap: 14px; padding-top: 30px; }
.t { font: 400 104px/1.05 'Black Han Sans', sans-serif; color: #fff; letter-spacing: 1px; text-shadow: 0 4px 0 rgba(0,0,0,.35), 0 10px 40px rgba(0,0,0,.65); }
.bar { width: 120px; height: 8px; border-radius: 4px; background: #6ee7d0; box-shadow: 0 0 24px rgba(110,231,208,.8); }
.s { font: 700 46px/1.2 'Noto Sans KR', sans-serif; color: #eafffb; padding: 10px 26px; border-radius: 14px; background: rgba(6,16,26,.55); text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.label { display: inline-flex; align-items: baseline; gap: 18px; font: 900 50px 'Noto Sans KR', sans-serif; color: #fff; text-shadow: 0 4px 18px rgba(0,0,0,.7); }
.label small { font: 700 34px 'Noto Sans KR', sans-serif; color: #6ee7d0; }
.logo { width: 1080px; height: 1920px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.k { font: 900 230px/0.9 'Noto Sans KR', sans-serif; color: #fff; letter-spacing: -4px; text-shadow: 0 12px 60px rgba(0,0,0,.6); }
.b { font: 700 62px 'JetBrains Mono', monospace; letter-spacing: 34px; padding-left: 34px; color: #6ee7d0; text-shadow: 0 0 30px rgba(110,231,208,.6); }
.cta { margin-top: 70px; font: 900 64px 'Noto Sans KR', sans-serif; color: #fff; padding: 22px 52px; border-radius: 22px; background: #6ee7d0; color: #062420; box-shadow: 0 12px 50px rgba(110,231,208,.45); }
.url { margin-top: 34px; font: 700 44px 'JetBrains Mono', monospace; color: #fff; text-shadow: 0 4px 20px rgba(0,0,0,.8); }
.meta { margin-top: 18px; font: 700 38px 'Noto Sans KR', sans-serif; color: rgba(255,255,255,.85); text-shadow: 0 4px 20px rgba(0,0,0,.8); }
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const snap = async (name, html, clip) => {
    await page.setContent(`<style>${CSS}</style>${html}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, name + '.png'), omitBackground: true, clip });
  };
  for (const [k, [t, s]] of Object.entries(CAPTIONS)) await snap(k, `<div class="cap"><div class="t">${t}</div><div class="bar"></div><div class="s">${s}</div></div>`, { x: 0, y: 0, width: 1080, height: 330 });
  await snap('l_pc', `<div class="label">PC <small>키보드 · 마우스</small></div>`, { x: 0, y: 0, width: 700, height: 90 });
  await snap('l_mobile', `<div class="label">모바일 <small>터치 · 자이로</small></div>`, { x: 0, y: 0, width: 700, height: 90 });
  await snap('logo', `<div class="logo"><div class="k">KF-21</div><div class="b">BORAMAE</div><div class="cta">지금 바로 무료로 플레이</div><div class="url">09jun4.github.io/kf21-boramae</div><div class="meta">PC · 모바일 · 설치 없이 브라우저에서</div></div>`, { x: 0, y: 0, width: 1080, height: 1920 });
  await browser.close();
  console.log('overlays →', OUT);
})();

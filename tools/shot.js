const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join('C:/Users/23710/.workbuddy/binaries/node/workspace/node_modules', 'puppeteer'));

const OUT = 'C:/Users/23710/WorkBuddy/过桥米线游戏/shots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--window-size=390,844',
    ],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
  page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });

  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/00-boot.png` });

  // 点开始
  const started = await page.evaluate(() => {
    const b = document.getElementById('btn-start');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 2600));
  await page.screenshot({ path: `${OUT}/01-s1.png` });

  const info = await page.evaluate(() => {
    const a = window.__app;
    if (!a) return { error: 'no app' };
    return {
      stage: a.machine.name,
      tier: a.tierName,
      dpr: a.dpr,
      info: a.r3d.info(),
      layout: { w: a.layout.w, h: a.layout.h, aspect: +a.layout.aspect.toFixed(3), usable: +a.layout.usable.toFixed(3) },
      cam: a.camera.position.toArray().map((v) => +v.toFixed(2)),
    };
  });

  const dom = await page.evaluate(() => {
    const r = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) };
    };
    return {
      vh: window.innerHeight,
      ui: r('#ui'), stageUi: r('#stage-ui'), panel: r('#stage-ui .panel'),
      actions: r('#actions'), cards: r('.cards'), chips: r('.chips'),
    };
  });
  console.log('DOM', JSON.stringify(dom));
  console.log('STARTED', started);
  console.log('INFO', JSON.stringify(info));
  console.log('LOGS\n' + logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
